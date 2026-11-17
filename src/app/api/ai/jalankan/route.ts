import { NextResponse } from "next/server";
import { buatSupabaseAiAdapter } from "@/lib/ai/supabase-adapter";
import { jalankanPipelineEditorial } from "@/lib/ai/pipeline";
import {
  autentikasiPemicuAi,
  buatRateLimiterKeras,
  cekOrigin,
  responRateLimit,
  responRateLimitBelumSiap,
} from "@/lib/ai/route-auth";
import { cobaServiceClient } from "@/lib/supabase/service";
import {
  INTERVAL_HEARTBEAT_MENIT,
  klaimJob,
  perbaruiHeartbeat,
  selesaikanJob,
  statusHttpUntukKlaim,
} from "@/lib/scheduler/jobs";
import { bacaFlag } from "@/lib/scheduler/flags";
import { catatGalatRoute } from "@/lib/analytics/galat";

// POST /api/ai/jalankan — memicu pipeline editorial AI.
// Autentikasi DUA jalur:
//  (a) header x-pf-ai-secret == PF_AI_SECRET (pemicu jadwal);
//  (b) sesi login super_admin/editor.
// Bila PF_AI_SECRET belum diatur DAN tidak ada sesi -> 503 jujur.
// Body opsional: { limit?, hanya_item_id?, rekonsiliasi? }.
// limit dibatasi 1..50 (bawaan 10) — satu run tidak memproses
// seluruh antrean sekaligus.
// P3-4 (N-R1): dipicu_oleh DITETAPKAN SERVER dari jalur
// autentikasi (auth.dipicuOleh) — nilai dari body TIDAK PERNAH
// dipakai (label "cron_muse" tidak bisa lagi diklaim pemanggil).
// rekonsiliasi=false menonaktifkan job rekonsiliasi akhir run
// (bawaan aktif). Mengembalikan hitungan NYATA pipeline (diproses,
// draf, terverifikasi, cross_checked, developing, unconfirmed,
// dilewati, gagal, rekonsiliasi). Artikel yang dihasilkan SELALU
// status='draft' — tidak pernah auto-terbit.
// Rate limiting: 10 req/menit/IP (pola /api/langganan).
const lolosRateLimit = buatRateLimiterKeras(10);

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
    limit?: unknown;
    hanya_item_id?: unknown;
    rekonsiliasi?: unknown;
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
  const limitMentah =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? Math.floor(body.limit)
      : 10;
  const limit = Math.min(50, Math.max(1, limitMentah));
  const hanyaItemId =
    typeof body.hanya_item_id === "string" && body.hanya_item_id.trim()
      ? body.hanya_item_id.trim()
      : undefined;
  // P3-4 (N-R1): dipicu_oleh HANYA dari jalur autentikasi server.
  // Nilai dari body (bila dikirim) sengaja diabaikan.
  const dipicuOleh = auth.dipicuOleh;
  const jalankanRekonsiliasi = body.rekonsiliasi !== false;

  // --- Penegakan flag (Tahap 13C): pipeline_editorial_aktif=false
  // -> 503 jujur. Service client tak tersedia -> lewati cek flag
  // (adapter di bawah akan 503 bila service key belum diatur).
  const klienFlag = cobaServiceClient();
  if (
    klienFlag &&
    !(await bacaFlag(klienFlag, "pipeline_editorial_aktif", true))
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Pipeline editorial dinonaktifkan oleh admin (flag pipeline_editorial_aktif).",
      },
      { status: 503 },
    );
  }

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

  // --- Lock server-side (Tahap 13C, F3) + F6 + heartbeat (Fase 5) ---
  // Fail-CLOSED seperti /api/ingestion/jalankan: lock tidak tersedia
  // / tidak terbaca -> 503 jujur, JANGAN jalan tanpa lock. Lock
  // dipegang run lain -> 409. (Sebelumnya: tersedia=false tetap
  // jalan dengan infoLock 'tidak-tersedia' — fail-open, bertentangan
  // dengan janji jobs.ts:19-23 dan dengan perilaku ingestion.)
  // Service client tak tersedia -> 503 juga (adapter di atas sudah
  // membuktikan service key ada, jadi ini hanya pertahanan).
  const klaim = klienFlag
    ? await klaimJob(klienFlag, "editorial")
    : { diklaim: false, tersedia: false, alasan: "service key belum diatur" };
  if (!klaim.diklaim) {
    const status = statusHttpUntukKlaim(klaim);
    return NextResponse.json(
      {
        ok: false,
        error:
          status === 409
            ? "Job pipeline editorial sedang berjalan (lock server-side). Coba lagi setelah run sebelumnya selesai."
            : `Lock pipeline editorial tidak tersedia (${klaim.alasan ?? "tanpa keterangan"}). Pipeline ditolak agar tidak jalan tanpa lock.`,
      },
      { status },
    );
  }
  const infoLock = "diklaim";

  // Heartbeat (Fase 5): lock 15 menit < timeout workflow 30 menit,
  // jadi run yang sah tapi panjang bisa kehilangan lock di tengah
  // jalan. Selama run hidup, perbarui terakhir_jalan tiap 5 menit
  // agar lock tetap segar; bila worker crash, detak berhenti dan
  // lock kedaluwarsa 15 menit sesudah detak terakhir (bukan 15 menit
  // sesudah klaim). Best-effort: kegagalan satu detak tidak
  // membatalkan run. Dihentikan di finally, SEBELUM selesaikanJob
  // menutup lock.
  const detakHeartbeat = setInterval(() => {
    if (klienFlag) void perbaruiHeartbeat(klienFlag, "editorial");
  }, INTERVAL_HEARTBEAT_MENIT * 60_000);

  let okRun = false;
  let galatRun: string | null = null;
  try {
    const hasil = await jalankanPipelineEditorial(adapter, {
      limit,
      hanyaItemId,
      dipicu_oleh: dipicuOleh,
      rekonsiliasi: jalankanRekonsiliasi,
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
      pesan.includes("pf_raw_items") ||
      pesan.includes("pf_claims") ||
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
    void catatGalatRoute("POST /api/ai/jalankan", err);
    return NextResponse.json(
      { ok: false, error: `Pipeline editorial gagal: ${pesan}` },
      { status: 500 },
    );
  } finally {
    // Hentikan heartbeat dulu (jangan perbarui lock yang sudah
    // ditutup), lalu F6: terakhir_jalan + status_terakhir
    // diperbarui di AKHIR setiap run cron (berhasil maupun gagal).
    clearInterval(detakHeartbeat);
    if (klienFlag) {
      await selesaikanJob(klienFlag, "editorial", okRun, galatRun);
    }
  }
}
