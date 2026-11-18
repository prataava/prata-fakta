// Pengirim broadcast push BERSAMA (v29) — dipakai DUA pemanggil:
//   (1) route admin POST /api/admin/notifikasi/kirim (broadcast
//       manual super_admin);
//   (2) Daily Brief pagi (route /api/ai/brief, flag kirim_push).
// Logika pengiriman dipindah VERBATIM dari route admin (v26 +
// Notification Intelligence v27) agar kedua pemanggil berperilaku
// SAMA PERSIS — tidak ada jalur yang melewati preferensi/cap.
//   - Preferensi push_notifikasi DIHORMATI: langganan milik
//     pengguna yang mematikan push dilewati. Tamu (user_id null)
//     tetap dikirim. Gagal baca preferensi = fail-open (langganan
//     adalah opt-in; preferensi opt-out tambahan) + flag
//     preferensi_dibaca=false di hasil.
//   - Frequency cap: maks BATAS_KIRIM_PER_HARI pengiriman per
//     endpoint per 24 jam (dari pf_push_deliveries); yang
//     melewati cap dilewati. Bila riwayat tidak dapat dibaca
//     (pra-v27), cap tidak ditegakkan.
//   - Retry: galat sementara (429/5xx) diulang 1x sesudah 1 detik;
//     410/404 langsung hapus langganan.
//   - Setiap percobaan dicatat best-effort ke pf_push_deliveries.
// PRASYARAT: pemanggil SUDAH memanggil setVapidDetails
// (web-push) sebelum memanggil fungsi ini; bila VAPID belum
// terkonfigurasi, pengiriman gagal per-langganan dan dihitung
// di `gagal` — pemanggil yang peduli (route admin) memeriksa
// env dulu dan mengembalikan 503 jujur sebelum memanggil.
// Fungsi ini MELEMPAR bila tabel langganan tidak dapat dibaca
// (pemanggil mengubahnya jadi 503); bila tidak ada langganan,
// mengembalikan semua 0.
import { sendNotification } from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BATAS_KIRIM_PER_HARI,
  catatPengirimanPush,
  hitungKirim24Jam,
  type CatatanPengirimanPush,
} from "./push";

export interface PayloadBroadcast {
  title: string;
  body: string;
  url: string;
}

export interface HasilBroadcast {
  /** Pengiriman sukses nyata (bukan jumlah baris dibaca). */
  terkirim: number;
  gagal: number;
  /** Langganan mati (410/404) yang dihapus. */
  dihapus: number;
  dilewati_preferensi: number;
  dilewati_cap: number;
  /** false bila preferensi tidak dapat dibaca (fail-open). */
  preferensi_dibaca: boolean;
}

/** Validasi murni (dipindah dari route admin — re-export di
 * sana agar baterai lama tetap jalan): judul 1–200, isi 1–500,
 * url opsional HARUS path same-origin ("/..." dan BUKAN "//...")
 * agar klik notifikasi tidak membuka situs luar. */
export function validasiBroadcast(
  body: Record<string, unknown> | null,
): PayloadBroadcast | null {
  if (!body) return null;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const isi = typeof body.body === "string" ? body.body.trim() : "";
  if (!title || title.length > 200) return null;
  if (!isi || isi.length > 500) return null;
  let url = "/";
  if (body.url !== undefined) {
    if (typeof body.url !== "string") return null;
    const u = body.url.trim();
    if (!u.startsWith("/") || u.startsWith("//") || u.length > 500) {
      return null;
    }
    url = u;
  }
  return { title, body: isi, url };
}

/** Payload Daily Brief pagi (murni, untuk baterai): judul
 * "Daily Brief — 18 November 2026" (tanggal id-ID), isi 2–3
 * headline pertama dipisah " • " (maks 500 karakter — dipotong
 * di batas kata bila perlu), url "/brief". Bila tanpa judul,
 * mengembalikan null (pemanggil TIDAK mengirim push). */
export function buatPayloadBrief(
  tanggal: string,
  judulEntri: string[],
): PayloadBroadcast | null {
  if (judulEntri.length === 0) return null;
  const tanggalTampil = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${tanggal}T00:00:00+07:00`));
  const judul = `Daily Brief — ${tanggalTampil}`;
  const headline = judulEntri.slice(0, 3);
  let isi = headline.join(" • ");
  if (isi.length > 500) {
    isi = `${isi.slice(0, 497).trimEnd()}…`;
  }
  return { title: judul, body: isi, url: "/brief" };
}

export async function kirimBroadcastPush(
  service: SupabaseClient,
  payload: PayloadBroadcast,
): Promise<HasilBroadcast> {
  const { data: subs, error } = await service
    .from("pf_push_subscriptions")
    .select("id, endpoint, p256dh, auth, user_id");
  if (error) throw error;
  const kosong: HasilBroadcast = {
    terkirim: 0,
    gagal: 0,
    dihapus: 0,
    dilewati_preferensi: 0,
    dilewati_cap: 0,
    preferensi_dibaca: true,
  };
  if (!subs || subs.length === 0) return kosong;
  const daftar = subs as {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    user_id: string | null;
  }[];
  // --- v27: hormati preferensi push_notifikasi ---
  let preferensiDibaca = true;
  const nonaktif = new Set<string>();
  const userIds = [
    ...new Set(daftar.map((s) => s.user_id).filter(Boolean)),
  ] as string[];
  if (userIds.length > 0) {
    const { data: prefs, error: errPrefs } = await service
      .from("pf_user_preferences")
      .select("user_id, push_notifikasi")
      .in("user_id", userIds);
    if (errPrefs || !prefs) {
      preferensiDibaca = false;
    } else {
      for (const p of prefs as {
        user_id: string;
        push_notifikasi: boolean | null;
      }[]) {
        if (p.push_notifikasi === false) nonaktif.add(p.user_id);
      }
    }
  }
  // --- v27: frequency cap dari riwayat 24 jam ---
  const kirim24Jam = await hitungKirim24Jam(service);
  const isi = JSON.stringify(payload);
  let terkirim = 0;
  let gagal = 0;
  let dihapus = 0;
  let dilewatiPreferensi = 0;
  let dilewatiCap = 0;
  const catatan: CatatanPengirimanPush[] = [];
  const kirimSekali = async (sub: {
    endpoint: string;
    p256dh: string;
    auth: string;
  }) => {
    await sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      isi,
    );
  };
  await Promise.allSettled(
    daftar.map(async (sub) => {
      if (sub.user_id && nonaktif.has(sub.user_id)) {
        dilewatiPreferensi += 1;
        return;
      }
      const sudah = kirim24Jam?.get(sub.endpoint) ?? 0;
      if (kirim24Jam !== null && sudah >= BATAS_KIRIM_PER_HARI) {
        dilewatiCap += 1;
        return;
      }
      try {
        await kirimSekali(sub);
        terkirim += 1;
        catatan.push({
          endpoint: sub.endpoint,
          judul: payload.title,
          status: "terkirim",
          kode_http: null,
        });
      } catch (err) {
        const status = (err as { statusCode?: unknown } | null)?.statusCode;
        if (status === 410 || status === 404) {
          // Langganan kedaluwarsa di sisi layanan push —
          // bersihkan agar broadcast berikut tidak mencoba lagi.
          await service
            .from("pf_push_subscriptions")
            .delete()
            .eq("id", sub.id);
          dihapus += 1;
          catatan.push({
            endpoint: sub.endpoint,
            judul: payload.title,
            status: "dihapus",
            kode_http: typeof status === "number" ? status : null,
          });
        } else if (
          (typeof status === "number" && (status === 429 || status >= 500)) ||
          status === undefined
        ) {
          // Galat sementara (429/5xx atau galat jaringan tanpa
          // status) — ulang 1× sesudah jeda 1 detik.
          await new Promise((r) => setTimeout(r, 1000));
          try {
            await kirimSekali(sub);
            terkirim += 1;
            catatan.push({
              endpoint: sub.endpoint,
              judul: payload.title,
              status: "terkirim",
              kode_http: null,
            });
          } catch (errUlang) {
            const statusUlang = (errUlang as { statusCode?: unknown } | null)
              ?.statusCode;
            gagal += 1;
            catatan.push({
              endpoint: sub.endpoint,
              judul: payload.title,
              status: "gagal",
              kode_http:
                typeof statusUlang === "number" ? statusUlang : null,
            });
          }
        } else {
          gagal += 1;
          catatan.push({
            endpoint: sub.endpoint,
            judul: payload.title,
            status: "gagal",
            kode_http: typeof status === "number" ? status : null,
          });
        }
      }
    }),
  );
  // Riwayat pengiriman — best-effort (pra-v27 tabel belum ada).
  await catatPengirimanPush(service, catatan);
  return {
    terkirim,
    gagal,
    dihapus,
    dilewati_preferensi: dilewatiPreferensi,
    dilewati_cap: dilewatiCap,
    preferensi_dibaca: preferensiDibaca,
  };
}
