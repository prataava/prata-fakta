import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  autentikasiStaf,
  buatRateLimiter,
  responRateLimit,
} from "@/lib/ai/route-auth";

// GET /api/ai/status — status agen AI editorial + run terakhir.
// HANYA super_admin/editor/fact_checker.
// Mengembalikan { tersedia, per_agen, run_terakhir } dengan hitungan
// NYATA dari pf_ai_runs (bukan angka palsu). per_agen dihitung dari
// 500 run terakhir (dicatat di respons); run_terakhir = 10 run
// terbaru dengan agen, status, durasi, dan error bila ada.
// Bila tabel belum ada -> 200 dengan tersedia:false + pesan jujur.
// Rate limiting: 30 req/menit/IP (pola /api/langganan).
const lolosRateLimit = buatRateLimiter(30);

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
  if (!(await lolosRateLimit(req))) return responRateLimit();

  const galatAuth = await autentikasiStaf();
  if (galatAuth) return galatAuth;

  const belumTersedia = (pesan: string) =>
    NextResponse.json({
      ok: true,
      tersedia: false,
      pesan,
      per_agen: {},
      run_terakhir: [],
    });

  const supabase = await createClient();
  const { data: runs, error } = await supabase
    .from("pf_ai_runs")
    .select("id,agen,input_jenis,status,error,detail,durasi_ms,dipicu_oleh,dimulai_pada")
    .order("dimulai_pada", { ascending: false })
    .limit(500);
  if (error) {
    return belumTersedia(
      "Tabel AI editorial belum dibuat (migrasi v4 belum dijalankan).",
    );
  }

  // Hitungan nyata per agen dari 500 run terakhir. Agen yang belum
  // pernah berjalan dilaporkan apa adanya (belum_pernah_berjalan:
  // true) — bukan angka nol yang menyamar sebagai "pernah jalan".
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
    const baris = (runs ?? []).filter((r) => r.agen === agen);
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

  return NextResponse.json({
    ok: true,
    tersedia: true,
    dicatat_dari: "500 run terakhir",
    per_agen: perAgen,
    run_terakhir: (runs ?? []).slice(0, 10),
  });
}
