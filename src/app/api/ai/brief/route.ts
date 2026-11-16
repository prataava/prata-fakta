import { NextResponse } from "next/server";
import { buatSupabaseAiAdapter } from "@/lib/ai/supabase-adapter";
import { jalankanBriefHarian } from "@/lib/ai/pipeline";
import {
  autentikasiPemicuAi,
  buatRateLimiterKeras,
  responRateLimit,
  responRateLimitBelumSiap,
} from "@/lib/ai/route-auth";
import { cobaServiceClient } from "@/lib/supabase/service";
import { klaimJob, selesaikanJob } from "@/lib/scheduler/jobs";

// POST /api/ai/brief — memicu Daily Brief hari ini.
// Autentikasi DUA jalur:
//  (a) header x-pf-ai-secret == PF_AI_SECRET (pemicu jadwal);
//  (b) sesi login super_admin/editor.
// Bila PF_AI_SECRET belum diatur DAN tidak ada sesi -> 503 jujur.
// Body opsional: { tanggal? }. tanggal format
// YYYY-MM-DD (bawaan: hari ini WIB). Entri brief diambil dari draf
// artikel terbaru (maks 10) lalu dilengkapi dari antrean
// UNCONFIRMED (berlabel jujur) bila kurang dari 10. Brief disimpan
// sebagai 'draft' (upsert per tanggal) — penerbitan tetap butuh
// persetujuan editorial (Fase 5).
// Rate limiting: 10 req/menit/IP (pola /api/langganan).
const lolosRateLimit = buatRateLimiterKeras(10);

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const hasilRateLimit = await lolosRateLimit(req);
  if (!hasilRateLimit.lolos && hasilRateLimit.alasan === "rpc-gagal")
    return responRateLimitBelumSiap(hasilRateLimit.jenisGalat);
  if (!hasilRateLimit.lolos) return responRateLimit();

  const auth = await autentikasiPemicuAi(req);
  if (!auth.ok) return auth.respon;

  // --- Body opsional ---
  let body: { tanggal?: unknown } = {};
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
    });
    okRun = true;
    return NextResponse.json({
      ok: true,
      dipicu_oleh: dipicuOleh,
      lock: infoLock,
      ...hasil,
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
