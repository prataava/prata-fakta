import { NextResponse } from "next/server";
import { setVapidDetails } from "web-push";
import { buatSupabaseAiAdapter } from "@/lib/ai/supabase-adapter";
import { jalankanBriefHarian } from "@/lib/ai/pipeline";
import {
  autentikasiPemicuAi,
  buatRateLimiterKeras,
  cekOrigin,
  responRateLimit,
  responRateLimitBelumSiap,
} from "@/lib/ai/route-auth";
import { cobaServiceClient } from "@/lib/supabase/service";
import { klaimJob, selesaikanJob } from "@/lib/scheduler/jobs";
import { catatGalatRoute } from "@/lib/analytics/galat";
import {
  ambilKunciPublikVapid,
  daftarEnvVapidKurang,
  ENV_VAPID_PRIVATE,
  ENV_VAPID_SUBJECT,
} from "@/lib/notifikasi/push";
import {
  buatPayloadBrief,
  kirimBroadcastPush,
} from "@/lib/notifikasi/broadcast";

// POST /api/ai/brief — memicu Daily Brief hari ini.
// Autentikasi DUA jalur:
//  (a) header x-pf-ai-secret == PF_AI_SECRET (pemicu jadwal);
//  (b) sesi login super_admin/editor.
// Bila PF_AI_SECRET belum diatur DAN tidak ada sesi -> 503 jujur.
// Body opsional: { tanggal?, dari_artikel_terbit?, kirim_push? }.
// tanggal format YYYY-MM-DD (bawaan: hari ini WIB).
//   dari_artikel_terbit=true (v29): entri HANYA dari artikel
//     TERBIT 24 jam terakhir — tanpa pengisian antrean
//     UNCONFIRMED — dan brief DITERBITKAN langsung bila ada
//     >=1 entri (semua entri sudah terbit; bila 0 entri, brief
//     tetap draf, tanpa terbit, tanpa push). Bawaan false =
//     perilaku lama (draf terbaru + antrean UNCONFIRMED,
//     status 'draft', butuh persetujuan editorial — Fase 5).
//   kirim_push=true (v29): sesudah brief DITERBITKAN, kirim
//     broadcast push ke semua langganan lewat lib bersama
//     (Notification Intelligence v27 dihormati penuh —
//     preferensi + cap + retry). Push BEST-EFFORT: gagal push
//     tidak menggagalkan brief (hasilnya masuk respons sebagai
//     `push`); tanpa VAPID, push dilewati dengan alasan.
// Rate limiting: 10 req/menit/IP (pola /api/langganan).
const lolosRateLimit = buatRateLimiterKeras(10);

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const hasilRateLimit = await lolosRateLimit(req);
  if (!hasilRateLimit.lolos && hasilRateLimit.alasan === "rpc-gagal")
    return responRateLimitBelumSiap(hasilRateLimit.jenisGalat);
  if (!hasilRateLimit.lolos) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;

  const auth = await autentikasiPemicuAi(req);
  if (!auth.ok) return auth.respon;

  // --- Body opsional ---
  let body: {
    tanggal?: unknown;
    dari_artikel_terbit?: unknown;
    kirim_push?: unknown;
  } = {};
  try {
    const teks = await req.text();
    if (teks.trim()) body = JSON.parse(teks) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const tanggal =
    typeof body.tanggal === "string" && POLA_TANGGAL.test(body.tanggal)
      ? body.tanggal
      : undefined;
  if (typeof body.tanggal === "string" && !tanggal) {
    return NextResponse.json(
      { ok: false, error: "Format tanggal harus YYYY-MM-DD." },
      { status: 400 },
    );
  }
  // v29: flag HARUS boolean bila ada (bukan string/angka).
  const dariArtikelTerbit =
    body.dari_artikel_terbit === undefined
      ? false
      : body.dari_artikel_terbit === true;
  const kirimPush =
    body.kirim_push === undefined ? false : body.kirim_push === true;
  if (
    (body.dari_artikel_terbit !== undefined &&
      typeof body.dari_artikel_terbit !== "boolean") ||
    (body.kirim_push !== undefined && typeof body.kirim_push !== "boolean")
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "dari_artikel_terbit dan kirim_push harus boolean.",
      },
      { status: 400 },
    );
  }
  // P3-4 (N-R1): dipicu_oleh HANYA dari jalur autentikasi server.
  const dipicuOleh = auth.dipicuOleh;

  // --- Adapter (butuh SUPABASE_SERVICE_ROLE_KEY) ---
  let adapter: ReturnType<typeof buatSupabaseAiAdapter>;
  try {
    adapter = buatSupabaseAiAdapter();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan AI editorial belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY belum diatur).",
      },
      { status: 503 },
    );
  }

  // --- Lock server-side (Tahap 13C, F3) + F6 ---
  const klienLock = cobaServiceClient();
  const klaim = klienLock
    ? await klaimJob(klienLock, "brief")
    : { diklaim: false, tersedia: false, alasan: "service key belum diatur" };
  if (klaim.tersedia && !klaim.diklaim) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Job Daily Brief sedang berjalan (lock server-side). Coba lagi setelah run sebelumnya selesai.",
      },
      { status: 409 },
    );
  }
  const infoLock = klaim.diklaim
    ? "diklaim"
    : `tidak-tersedia (${klaim.alasan ?? "tanpa keterangan"})`;

  let okRun = false;
  let galatRun: string | null = null;
  try {
    const hasil = await jalankanBriefHarian(adapter, {
      tanggal,
      dipicu_oleh: dipicuOleh,
      dariArtikelTerbit,
      terbitkanLangsung: dariArtikelTerbit,
    });
    okRun = true;
    // v29: push Daily Brief — HANYA bila brief ini diterbitkan
    // dan pemanggil meminta kirim_push. Best-effort: gagal push
    // tidak menggagalkan brief (hasilnya masuk respons).
    let push: Record<string, unknown> | null = null;
    if (kirimPush && hasil.diterbitkan) {
      const payload = buatPayloadBrief(hasil.tanggal, hasil.judulEntri);
      if (!payload) {
        push = { dikirim: false, alasan: "tidak ada entri brief" };
      } else {
        const kunciPublik = ambilKunciPublikVapid();
        const kunciPrivat = process.env[ENV_VAPID_PRIVATE];
        const subject = process.env[ENV_VAPID_SUBJECT];
        if (!kunciPublik || !kunciPrivat || !subject) {
          push = {
            dikirim: false,
            alasan: `VAPID belum terkonfigurasi: ${daftarEnvVapidKurang().join(", ")}`,
          };
        } else {
          setVapidDetails(subject, kunciPublik, kunciPrivat);
          const service = cobaServiceClient();
          if (!service) {
            push = { dikirim: false, alasan: "layanan push belum siap" };
          } else {
            try {
              const kirim = await kirimBroadcastPush(service, payload);
              push = { dikirim: true, ...kirim };
            } catch (err) {
              push = {
                dikirim: false,
                alasan:
                  err instanceof Error ? err.message : "pengiriman gagal",
              };
            }
          }
        }
      }
    } else if (kirimPush && !hasil.diterbitkan) {
      push = { dikirim: false, alasan: "brief tidak diterbitkan" };
    }
    return NextResponse.json({
      ok: true,
      dipicu_oleh: dipicuOleh,
      lock: infoLock,
      ...hasil,
      push,
    });
  } catch (err) {
    const pesan = err instanceof Error ? err.message : "kesalahan tidak diketahui";
    galatRun = pesan;
    if (
      pesan.includes("pf_daily_briefs") ||
      pesan.includes("pf_raw_items") ||
      pesan.includes("pf_articles") ||
      pesan.includes("pf_ai_runs") ||
      pesan.includes("does not exist") ||
      pesan.includes("relation")
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Tabel AI editorial belum dibuat (migrasi v4 belum dijalankan).",
        },
        { status: 503 },
      );
    }
    void catatGalatRoute("POST /api/ai/brief", err);
    return NextResponse.json(
      { ok: false, error: `Daily Brief gagal: ${pesan}` },
      { status: 500 },
    );
  } finally {
    // F6: terakhir_jalan + status_terakhir diperbarui di AKHIR
    // setiap run cron (berhasil maupun gagal).
    if (klienLock) {
      await selesaikanJob(klienLock, "brief", okRun, galatRun);
    }
  }
}
