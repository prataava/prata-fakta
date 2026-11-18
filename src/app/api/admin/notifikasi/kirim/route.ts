// POST /api/admin/notifikasi/kirim — broadcast push VAPID ke
// SEMUA langganan (Tugas 1, v26). HANYA super_admin
// (autentikasiAdmin, pola route admin — TANPA guard ini siapa pun
// bisa broadcast ke semua perangkat).
// Body: { title: string, body: string, url?: string }.
// web-push di-init SECARA MALAS di dalam handler dan HANYA bila
// ketiga env VAPID ada; bila belum terkonfigurasi → 503 jujur
// (bukan setVapidDetails di lingkup modul dengan string kosong).
// Mengirim payload terenkripsi web-push; service worker
// menampilkan payload itu bila ada (fallback tanpa payload tetap
// jalan). Subscriber mati (410/404) dihapus. Respons menghitung
// SUKSES NYATA (broadcasted), bukan jumlah baris dibaca.
// Rate limit admin 30/menit.
// v27 (Notification Intelligence):
//  - Preferensi push_notifikasi (pf_user_preferences) DIHORMATI:
//    langganan milik pengguna yang mematikan push_notifikasi
//    dilewati (dilewati_preferensi). Langganan tamu (user_id
//    null) tidak punya preferensi — tetap dikirim. Bila preferensi
//    tidak dapat dibaca, kirim tetap jalan (langganan itu sendiri
//    adalah opt-in; preferensi adalah opt-out tambahan) —
//    perilaku fail-open ini dicatat di respons (preferensi_dibaca).
//  - Frequency cap: maks BATAS_KIRIM_PER_HARI pengiriman per
//    endpoint per 24 jam (dihitung dari pf_push_deliveries);
//    yang melewati cap dilewati (dilewati_cap). Bila riwayat
//    tidak dapat dibaca (pra-v27), cap tidak ditegakkan.
//  - Retry: galat sementara (429/5xx) diulang 1× sesudah jeda
//    1 detik; 410/404 langsung hapus langganan.
//  - Setiap percobaan dicatat best-effort ke pf_push_deliveries
//    (riwayat tampil di /admin/notifikasi).
import { NextResponse } from "next/server";
import { sendNotification, setVapidDetails } from "web-push";
import {
  autentikasiAdmin,
  buatRateLimiterAdmin,
  bacaBody,
  cekOrigin,
  responBodyTakValid,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { ROLES } from "@/lib/auth/roles";
import { cobaServiceClient } from "@/lib/supabase/service";
import {
  ambilKunciPublikVapid,
  BATAS_KIRIM_PER_HARI,
  catatPengirimanPush,
  daftarEnvVapidKurang,
  ENV_VAPID_PRIVATE,
  ENV_VAPID_SUBJECT,
  hitungKirim24Jam,
  type CatatanPengirimanPush,
} from "@/lib/notifikasi/push";

const lolosRateLimit = buatRateLimiterAdmin();

/** Validasi murni (diekspor untuk baterai): judul 1–200,
 * isi 1–500, url opsional HARUS path same-origin ("/..." dan
 * BUKAN "//...") agar klik notifikasi tidak membuka situs luar. */
export function validasiBroadcast(
  body: Record<string, unknown> | null,
): { title: string; body: string; url: string } | null {
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

function tabelBelumAda(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    (error.message ?? "").includes("Could not find the table")
  );
}

export async function POST(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const auth = await autentikasiAdmin(req, ROLES.SUPER_ADMIN);
  if (auth instanceof NextResponse) return auth;
  const body = await bacaBody(req);
  const payload = validasiBroadcast(body);
  if (!payload) return responBodyTakValid();

  // VAPID: init MALAS, hanya bila ketiga env ada.
  const kunciPublik = ambilKunciPublikVapid();
  const kunciPrivat = process.env[ENV_VAPID_PRIVATE];
  const subject = process.env[ENV_VAPID_SUBJECT];
  if (!kunciPublik || !kunciPrivat || !subject) {
    const kurang = daftarEnvVapidKurang().join(", ");
    return NextResponse.json(
      {
        ok: false,
        error: `Push belum terkonfigurasi — env var belum diatur: ${kurang}.`,
      },
      { status: 503 },
    );
  }
  setVapidDetails(subject, kunciPublik, kunciPrivat);

  const service = cobaServiceClient();
  if (!service) {
    return NextResponse.json(
      { ok: false, error: "Layanan admin belum siap." },
      { status: 503 },
    );
  }
  try {
    const { data: subs, error } = await service
      .from("pf_push_subscriptions")
      .select("id, endpoint, p256dh, auth, user_id");
    if (error) {
      if (tabelBelumAda(error)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Layanan push belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi v14/v26 dijalankan.",
          },
          { status: 503 },
        );
      }
      throw error;
    }
    if (!subs || subs.length === 0) {
      return NextResponse.json({
        success: true,
        broadcasted: 0,
        gagal: 0,
        dihapus: 0,
        dilewati_preferensi: 0,
        dilewati_cap: 0,
        preferensi_dibaca: true,
      });
    }
    const daftar = subs as {
      id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
      user_id: string | null;
    }[];
    // --- v27: hormati preferensi push_notifikasi ---
    // Pengguna yang mematikan push_notifikasi dilewati. Tamu
    // (user_id null) tidak punya preferensi — tetap dikirim.
    // Gagal baca preferensi = fail-open (langganan adalah opt-in;
    // preferensi adalah opt-out tambahan) + preferensi_dibaca false.
    let preferensiDibaca = true;
    const nonaktif = new Set<string>();
    const userIds = [...new Set(daftar.map((s) => s.user_id).filter(Boolean))] as string[];
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
    return NextResponse.json({
      success: true,
      broadcasted: terkirim,
      gagal,
      dihapus,
      dilewati_preferensi: dilewatiPreferensi,
      dilewati_cap: dilewatiCap,
      preferensi_dibaca: preferensiDibaca,
    });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
