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
// Rate limit admin 30/menit. Catatan jujur: broadcast TIDAK
// memeriksa preferensi push_notifikasi per pengguna — broadcast
// adalah aksi admin eksplisit; berhenti berlangganan adalah
// opt-out-nya (tombol di /saya/notifikasi).
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
  daftarEnvVapidKurang,
  ENV_VAPID_PRIVATE,
  ENV_VAPID_SUBJECT,
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
      .select("id, endpoint, p256dh, auth");
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
      });
    }
    const isi = JSON.stringify(payload);
    let terkirim = 0;
    let gagal = 0;
    let dihapus = 0;
    await Promise.allSettled(
      (subs as { id: string; endpoint: string; p256dh: string; auth: string }[]).map(
        async (sub) => {
          try {
            await sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              isi,
            );
            terkirim += 1;
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
            } else {
              gagal += 1;
            }
          }
        },
      ),
    );
    return NextResponse.json({
      success: true,
      broadcasted: terkirim,
      gagal,
      dihapus,
    });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
