import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buatRateLimiter, responRateLimit } from "@/lib/ai/route-auth";
import { cariKonten, cariNegara } from "@/lib/data";
import { hitungTren } from "@/lib/ai/trends";
import type { ItemTren } from "@/lib/ai/trends";

// GET /api/cari/saran?q=... → { saran: [{ teks, jenis, url }] }.
// Data publik, tanpa auth. Gabungan:
//   - kata kunci tren dari hitungTren() atas judul artikel TERBIT
//     (pf_raw_items hanya boleh dibaca staf, jadi tren dihitung
//     dari artikel terbit yang memang publik) — maks 5;
//   - judul artikel yang cocok (ILIKE, limit 5);
//   - nama kategori / negara / sumber yang cocok — maks 5 gabungan.
// q kosong → { saran: [] }, bukan error. Galat database → { saran: [] }
// + log, bukan 500 (saran adalah pelengkap, bukan layanan inti).
// Rate limit 30/menit (fail-open, pola /api/sumber GET).
const batasi = buatRateLimiter(30);

const MAKS_TREN = 5;
const MAKS_ARTIKEL = 5;
const MAKS_LAINNYA = 5;

export type SaranCari = {
  teks: string;
  jenis: "tren" | "artikel" | "kategori" | "negara" | "sumber";
  url: string;
};

/** Saran tren dari judul artikel terbit 7 hari terakhir. */
async function saranTren(): Promise<SaranCari[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_articles")
      .select("id, judul, diterbitkan_pada")
      .eq("status", "terbit")
      .order("diterbitkan_pada", { ascending: false })
      .limit(200);
    if (error || !data) return [];
    const items: ItemTren[] = (
      data as { id: string; judul: string; diterbitkan_pada: string | null }[]
    ).map((a) => ({
      id: a.id,
      judul: a.judul,
      sumber_id: null,
      waktu_terbit_asli: a.diterbitkan_pada,
      disalin_dari_id: null,
    }));
    return hitungTren(items)
      .slice(0, MAKS_TREN)
      .map((t) => ({
        teks: t.topik,
        jenis: "tren" as const,
        url: `/cari?q=${encodeURIComponent(t.topik)}`,
      }));
  } catch (err) {
    console.error("[GET /api/cari/saran] tren gagal:", err);
    return [];
  }
}

/** Saran judul artikel yang cocok dengan q. */
async function saranArtikel(q: string): Promise<SaranCari[]> {
  try {
    const supabase = await createClient();
    const pola = `%${q.replace(/[%_]/g, "")}%`;
    const { data, error } = await supabase
      .from("pf_articles")
      .select("slug, judul")
      .eq("status", "terbit")
      .ilike("judul", pola)
      .order("diterbitkan_pada", { ascending: false })
      .limit(MAKS_ARTIKEL);
    if (error || !data) return [];
    return (data as { slug: string; judul: string }[]).map((a) => ({
      teks: a.judul,
      jenis: "artikel" as const,
      url: `/artikel/${a.slug}`,
    }));
  } catch (err) {
    console.error("[GET /api/cari/saran] artikel gagal:", err);
    return [];
  }
}

export async function GET(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ saran: [] });

  try {
    const [tren, artikel, konten, negara] = await Promise.all([
      saranTren(),
      saranArtikel(q),
      cariKonten(q),
      cariNegara(q),
    ]);

    const saran: SaranCari[] = [];
    const dilihat = new Set<string>();
    const tambah = (s: SaranCari) => {
      // Dedup per (jenis, teks): kata kunci tren "ekonomi" dan
      // kategori "Ekonomi" menunjuk tujuan berbeda — keduanya
      // berguna, jadi bukan duplikat.
      const kunci = `${s.jenis}:${s.teks.toLowerCase()}`;
      if (dilihat.has(kunci)) return;
      dilihat.add(kunci);
      saran.push(s);
    };
    for (const t of tren) tambah(t);
    for (const a of artikel) tambah(a);
    const lainnya: SaranCari[] = [
      ...konten.kategori.map((k) => ({
        teks: k.nama,
        jenis: "kategori" as const,
        url: `/kategori/${k.slug}`,
      })),
      ...negara.negara.map((n) => ({
        teks: n.nama,
        jenis: "negara" as const,
        url: `/negara/${n.kode}`,
      })),
      ...konten.sumber.map((s) => ({
        teks: s.nama,
        jenis: "sumber" as const,
        url: s.url,
      })),
    ];
    for (const s of lainnya.slice(0, MAKS_LAINNYA)) tambah(s);

    return NextResponse.json({ saran });
  } catch (err) {
    console.error("[GET /api/cari/saran] gagal:", err);
    return NextResponse.json({ saran: [] });
  }
}
