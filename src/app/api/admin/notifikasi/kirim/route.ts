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
import { setVapidDetails } from "web-push";
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
import {
  kirimBroadcastPush,
  validasiBroadcast,
} from "@/lib/notifikasi/broadcast";

export { validasiBroadcast } from "@/lib/notifikasi/broadcast";

const lolosRateLimit = buatRateLimiterAdmin();

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
    // Pengiriman lewat lib bersama (v29) — logika yang sama
    // dipakai Daily Brief pagi; Notification Intelligence v27
    // (preferensi + cap + retry + riwayat) berlaku di sini.
    const hasil = await kirimBroadcastPush(service, payload);
    return NextResponse.json({
      success: true,
      broadcasted: hasil.terkirim,
      gagal: hasil.gagal,
      dihapus: hasil.dihapus,
      dilewati_preferensi: hasil.dilewati_preferensi,
      dilewati_cap: hasil.dilewati_cap,
      preferensi_dibaca: hasil.preferensi_dibaca,
    });
  } catch (err) {
    if (err && typeof err === "object" && tabelBelumAda(err as { code?: string; message?: string })) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Layanan push belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi v14/v26 dijalankan.",
        },
        { status: 503 },
      );
    }
    return responGalatAdmin(err);
  }
}
