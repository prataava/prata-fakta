// GET /api/riset/[slug]/dataset — unduh dataset CSV laporan riset.
// Konvensi tautan (v13, P2-16): laporan menautkan indikator lewat
// kolom FK pf_research_reports.indikator_id bila terisi; bila
// kosong, fallback ke indikator yang SLUG-nya sama dengan slug
// laporan (konvensi lama). CSV berisi titik data NYATA
// pf_data_points (tanggal,nilai), tertua dulu.
// P2-12 (B-S5): CSV DIBATASI — default 10.000 baris, parameter
// ?limit=1..10000 (terdokumentasi di bawah); rate limiter
// 10/menit/IP. Tanpa batas, satu unduhan bisa sebesar seluruh
// riwayat indikator.
// 404 jujur bila: laporan tidak ada / masih draf; tidak ada indikator
// berslug sama; indikator terkait belum punya titik data.
import { createClient } from "@/lib/supabase/server";
import { buatRateLimiter, responRateLimit } from "@/lib/ai/route-auth";

// Batas baris CSV: default 10.000, ?limit= boleh 1..10.000.
const BATAS_BAWAN = 10000;
const BATAS_MAKS = 10000;

// Rate limit 10 unduhan/menit/IP (B-S5: sebelumnya tanpa limiter).
const batasi = buatRateLimiter(10);

/** Ambil ?limit= dari URL: bilangan bulat 1..BATAS_MAKS, default BATAS_BAWAN. */
export function batasDataset(req: Request): number {
  try {
    const mentah = new URL(req.url).searchParams.get("limit");
    if (mentah === null) return BATAS_BAWAN;
    const n = Number(mentah);
    if (!Number.isInteger(n) || n < 1) return BATAS_BAWAN;
    return Math.min(n, BATAS_MAKS);
  } catch {
    return BATAS_BAWAN;
  }
}

type Params = { params: Promise<{ slug: string }> };

function keAngka(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function GET(req: Request, { params }: Params) {
  if (!(await batasi(req))) return responRateLimit();
  const batas = batasDataset(req);
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
    .select("id, slug, indikator_id")
    .eq("slug", slug)
    .eq("status", "terbit")
    .maybeSingle();
  if (errRiset || !riset) {
    return new Response("Laporan riset tidak ditemukan.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // 2. Indikator terkait: FK indikator_id dulu (v13, P2-16);
  // bila kosong, fallback slug sama (konvensi lama).
  const indikatorId = (riset as { indikator_id?: string | null }).indikator_id;
  let indikator: { id: string; slug: string; nama: string } | null = null;
  if (indikatorId) {
    const { data, error } = await supabase
      .from("pf_data_indicators")
      .select("id, slug, nama")
      .eq("id", indikatorId)
      .maybeSingle();
    if (!error && data) {
      indikator = data as { id: string; slug: string; nama: string };
    }
  }
  if (!indikator) {
    const { data, error: errIndikator } = await supabase
      .from("pf_data_indicators")
      .select("id, slug, nama")
      .eq("slug", slug)
      .maybeSingle();
    if (errIndikator || !data) {
      return new Response(
        "Laporan ini belum punya indikator terkait, jadi belum ada dataset yang bisa diunduh.",
        {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        },
      );
    }
    indikator = data as { id: string; slug: string; nama: string };
  }

  // 3. Titik data nyata indikator itu (dibatasi — P2-12).
  const { data: titik, error: errTitik } = await supabase
    .from("pf_data_points")
    .select("tanggal, nilai")
    .eq("indikator_id", (indikator as { id: string }).id)
    .order("tanggal", { ascending: true })
    .limit(batas);
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
  // Header X-PF-Dataset-Limit menyatakan batas baris yang dipakai
  // (?limit=, maks 10.000) — bila deret lebih panjang, CSV hanya
  // memuat N baris tertua.
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
      "X-PF-Dataset-Limit": String(batas),
    },
  });
}
