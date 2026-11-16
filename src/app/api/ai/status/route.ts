import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  autentikasiStaf,
  buatRateLimiter,
  responRateLimit,
} from "@/lib/ai/route-auth";

// GET /api/ai/status — status langkah pipeline editorial
// deterministik + run terakhir.
// HANYA super_admin/editor/fact_checker.
// Mengembalikan { tersedia, per_agen, run_terakhir, catatan } dengan
// hitungan NYATA dari pf_ai_runs (bukan angka palsu). P3-8 (B-R9, v13):
// per_agen dihitung di DB lewat RPC pf_ai_status_agregat
// (GROUP BY agen) — bukan lagi membaca 500 baris lalu agregasi
// di memori; run_terakhir = 10 run terbaru dengan agen, status,
// durasi, dan error bila ada.
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
  // P3-8: agregasi di DB (RPC GROUP BY). RPC SECURITY DEFINER —
  // peran staf sudah diperiksa di atas (autentikasiStaf).
  const { data: agregat, error: errAgregat } = await supabase.rpc(
    "pf_ai_status_agregat",
  );
  const { data: runs, error } = await supabase
    .from("pf_ai_runs")
    .select("id,agen,input_jenis,status,error,detail,durasi_ms,dipicu_oleh,dimulai_pada")
    .order("dimulai_pada", { ascending: false })
    .limit(10);
  if (error || errAgregat) {
    return belumTersedia(
      "Tabel AI editorial belum dibuat (migrasi v4 belum dijalankan).",
    );
  }

  // Hitungan nyata per agen dari GROUP BY di DB. Agen yang belum
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
  const petaAgregat = new Map(
    ((agregat ?? []) as {
      agen: string;
      total: number;
      berhasil: number;
      gagal: number;
      dilewati: number;
      berjalan: number;
      terakhir_pada: string | null;
    }[]).map((r) => [r.agen, r]),
  );
  for (const agen of AGEN) {
    const baris = petaAgregat.get(agen);
    perAgen[agen] = {
      total: baris ? Number(baris.total) : 0,
      berhasil: baris ? Number(baris.berhasil) : 0,
      gagal: baris ? Number(baris.gagal) : 0,
      dilewati: baris ? Number(baris.dilewati) : 0,
      berjalan: baris ? Number(baris.berjalan) : 0,
      terakhir_pada: baris?.terakhir_pada ?? null,
      belum_pernah_berjalan: !baris,
    };
  }

  return NextResponse.json({
    ok: true,
    tersedia: true,
    dicatat_dari: "seluruh riwayat pf_ai_runs (GROUP BY di database)",
    // N-T1: jujurkan penamaan — 10 langkah pipeline deterministik +
    // penyempurnaan manual Muse, bukan 10 agen LLM. Kunci respons
    // `per_agen` dipertahankan apa adanya (kontrak API lama).
    catatan:
      "10 langkah pipeline deterministik + penyempurnaan manual Muse " +
      "(bukan agen LLM; tidak ada pemanggilan model di kode).",
    per_agen: perAgen,
    run_terakhir: runs ?? [],
  });
}
