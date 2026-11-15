// GET /api/admin/ringkasan — dasbor admin: ringkasan artikel, sumber,
// AI editorial, job terjadwal, kesehatan API, dan log galat terbaru.
// Staf mana pun. Rate limit 30/menit/IP. 503 jujur bila tabel/service
// key belum ada.
// Catatan: per_agen menyalin logika /api/ai/status (500 run terakhir),
// tapi memakai kolom `dimulai_pada` karena itulah kolom waktu yang
// ada di pf_ai_runs menurut migrasi v4 (route /api/ai/status memakai
// `dibuat_pada`, yang tidak ada di skema v4).
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  buatRateLimiterAdmin,
  ipDariRequest,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { buatAdminAdapter } from "@/lib/admin/supabase-adapter";

const lolosRateLimit = buatRateLimiterAdmin();

const AGEN = [
  "research",
  "source_analysis",
  "fact_verification",
  "summarization",
  "article_writing",
  "translation",
  "trend_analysis",
  "daily_brief",
  "data_analysis",
  "editorial_quality",
] as const;

export async function GET(req: Request) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const adapter = buatAdminAdapter();
    const [ringkasan, sumber, runsAi, runIngestion, runAiGagal, jobs, sehat] =
      await Promise.all([
        adapter.hitungRingkasan(),
        adapter.hitungSumber(),
        adapter.listAiRuns({ limit: 500 }),
        adapter.runIngestionTerakhir({ limit: 10 }),
        adapter.runAiGagalTerakhir({ limit: 10 }),
        adapter.listJobs(),
        adapter.cekSupabaseSehat(),
      ]);

    const perAgen: Record<
      string,
      {
        total: number;
        berhasil: number;
        gagal: number;
        dilewati: number;
        berjalan: number;
        terakhir_pada: string | null;
        belum_pernah_berjalan: boolean;
      }
    > = {};
    for (const agen of AGEN) {
      const baris = runsAi.filter((r) => r.agen === agen);
      perAgen[agen] = {
        total: baris.length,
        berhasil: baris.filter((r) => r.status === "berhasil").length,
        gagal: baris.filter((r) => r.status === "gagal").length,
        dilewati: baris.filter((r) => r.status === "dilewati").length,
        berjalan: baris.filter((r) => r.status === "berjalan").length,
        terakhir_pada:
          baris.length > 0 ? (baris[0].dimulai_pada as string) : null,
        belum_pernah_berjalan: baris.length === 0,
      };
    }

    const logIngestionGagal = runIngestion
      .filter((r) => r.status === "gagal")
      .map((r) => ({
        sumber: "ingestion" as const,
        id: r.id,
        sumber_nama: r.sumber_nama,
        error: r.error,
        pada: r.dimulai_pada,
      }));
    const logAiGagal = runAiGagal.map((r) => ({
      sumber: "ai" as const,
      id: r.id,
      agen: r.agen,
      error: r.error,
      pada: r.dimulai_pada,
    }));
    const errorLogs = [...logIngestionGagal, ...logAiGagal]
      .sort((a, b) => (a.pada < b.pada ? 1 : -1))
      .slice(0, 10);

    return NextResponse.json({
      ok: true,
      ringkasan,
      sumber: {
        total: sumber.total,
        aktif: sumber.aktif,
        run_terakhir: runIngestion.slice(0, 5),
      },
      ai: {
        per_agen: perAgen,
        dicatat_dari: "500 run terakhir",
        run_gagal_terakhir: runAiGagal,
      },
      jobs,
      api_health: { supabase: sehat, internal: "ok" },
      github_workflows: {
        terhubung: false,
        pesan:
          "Status run GitHub Actions tidak dapat dibaca dari aplikasi (butuh token GitHub) — lihat tab Actions di repo.",
      },
      error_logs: errorLogs,
    });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
