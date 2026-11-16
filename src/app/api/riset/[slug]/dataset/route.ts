// GET /api/riset/[slug]/dataset — unduh dataset CSV laporan riset.
// Konvensi tautan (tanpa kolom baru — migrasi v10 tidak punya kolom
// penghubung): laporan menautkan indikator yang SLUG-nya sama dengan
// slug laporan. CSV berisi titik data NYATA pf_data_points
// (tanggal,nilai), tertua dulu.
// 404 jujur bila: laporan tidak ada / masih draf; tidak ada indikator
// berslug sama; indikator terkait belum punya titik data.
import { createClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ slug: string }> };

function keAngka(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return new Response("Layanan dataset belum tersedia.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // 1. Laporan harus ada DAN terbit.
  const { data: riset, error: errRiset } = await supabase
    .from("pf_research_reports")
    .select("id, slug")
    .eq("slug", slug)
    .eq("status", "terbit")
    .maybeSingle();
  if (errRiset || !riset) {
    return new Response("Laporan riset tidak ditemukan.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // 2. Indikator terkait = indikator berslug sama.
  const { data: indikator, error: errIndikator } = await supabase
    .from("pf_data_indicators")
    .select("id, slug, nama")
    .eq("slug", slug)
    .maybeSingle();
  if (errIndikator || !indikator) {
    return new Response(
      "Laporan ini belum punya indikator terkait, jadi belum ada dataset yang bisa diunduh.",
      {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      },
    );
  }

  // 3. Titik data nyata indikator itu.
  const { data: titik, error: errTitik } = await supabase
    .from("pf_data_points")
    .select("tanggal, nilai")
    .eq("indikator_id", (indikator as { id: string }).id)
    .order("tanggal", { ascending: true });
  if (errTitik) {
    return new Response("Dataset belum tersedia.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const baris = ((titik ?? []) as unknown as Record<string, unknown>[])
    .map((t) => {
      const nilai = keAngka(t.nilai);
      if (nilai === null || typeof t.tanggal !== "string") return null;
      return { tanggal: t.tanggal, nilai };
    })
    .filter((t): t is { tanggal: string; nilai: number } => t !== null);
  if (baris.length === 0) {
    return new Response(
      "Indikator terkait laporan ini belum punya titik data.",
      {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      },
    );
  }

  // CSV: tanggal,nilai — nilai angka polos (tanpa pemisah ribuan).
  const csv =
    "tanggal,nilai\n" +
    baris.map((t) => `${t.tanggal},${t.nilai}`).join("\n") +
    "\n";
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dataset-${slug}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
