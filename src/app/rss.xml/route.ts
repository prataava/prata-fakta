// GET /rss.xml — umpan RSS 2.0 publik PRATA FAKTA.
// Isi: 20 artikel terbit terbaru dari database (judul, ringkasan,
// tautan, tanggal terbit, kategori). Bila database belum tersedia
// atau belum ada artikel terbit, feed tetap VALID tetapi tanpa
// item — jujur, tanpa artikel karangan. Hanya ringkasan yang
// disajikan (bukan isi penuh); atribusi sumber asli tetap ada di
// halaman artikel.
import { urlSitus } from "@/lib/situs";

function escXml(teks: string | null | undefined): string {
  return (teks ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type BarisArtikel = {
  slug: string;
  judul: string;
  ringkasan: string | null;
  kategori_slug: string;
  diterbitkan_pada: string | null;
};

async function ambilArtikelTerbaru(): Promise<BarisArtikel[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return [];
  try {
    const res = await fetch(
      `${url}/rest/v1/pf_articles?status=eq.terbit&select=slug,judul,ringkasan,kategori_slug,diterbitkan_pada&order=diterbitkan_pada.desc&limit=20`,
      {
        headers: {
          apikey: anon,
          Authorization: `Bearer ${anon}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return [];
    const baris = (await res.json()) as unknown[];
    if (!Array.isArray(baris)) return [];
    return baris.filter(
      (b): b is BarisArtikel =>
        !!b &&
        typeof b === "object" &&
        typeof (b as BarisArtikel).slug === "string" &&
        typeof (b as BarisArtikel).judul === "string",
    );
  } catch {
    return [];
  }
}

export async function GET() {
  const dasar = urlSitus();
  const artikel = await ambilArtikelTerbaru();
  const sekarang = new Date().toUTCString();

  const item = artikel
    .map((a) => {
      const tautan = `${dasar}/artikel/${a.slug}`;
      const tanggal = a.diterbitkan_pada
        ? new Date(a.diterbitkan_pada).toUTCString()
        : sekarang;
      return [
        "    <item>",
        `      <title>${escXml(a.judul)}</title>`,
        `      <link>${escXml(tautan)}</link>`,
        `      <guid isPermaLink="true">${escXml(tautan)}</guid>`,
        `      <description>${escXml(a.ringkasan)}</description>`,
        `      <category>${escXml(a.kategori_slug)}</category>`,
        `      <pubDate>${tanggal}</pubDate>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    "    <title>PRATA FAKTA — Pahami dunia. Berdasarkan fakta.</title>",
    `    <link>${escXml(dasar)}</link>`,
    "    <description>Berita terkini Indonesia dan dunia dengan sumber jelas, pemeriksaan fakta, data, dan kronologi.</description>",
    "    <language>id-ID</language>",
    `    <lastBuildDate>${sekarang}</lastBuildDate>`,
    item,
    "  </channel>",
    "</rss>",
  ].join("\n");

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=900",
    },
  });
}
