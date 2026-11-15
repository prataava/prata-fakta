// Sitemap dinamis PRATA FAKTA.
// Isi: halaman statis + halaman kategori (taksonomi statis) +
// artikel terbit + artikel pengetahuan terbit (dari database).
// Bila database belum tersedia (migrasi belum dijalankan),
// sitemap HANYA berisi halaman statis — jujur, tanpa URL artikel
// karangan. Bila tabel belum ada, fetch Supabase mengembalikan
// PGRST205 dan ditangkap sebagai daftar kosong.
import type { MetadataRoute } from "next";
import { KATEGORI_UTAMA } from "@/lib/categories";
import { urlSitus } from "@/lib/situs";

const HALAMAN_STATIS: Array<{
  path: string;
  frekuensi: "daily" | "weekly" | "monthly";
  prioritas: number;
}> = [
  { path: "/", frekuensi: "daily", prioritas: 1 },
  { path: "/brief", frekuensi: "daily", prioritas: 0.9 },
  { path: "/kategori", frekuensi: "weekly", prioritas: 0.8 },
  { path: "/arsip", frekuensi: "daily", prioritas: 0.8 },
  { path: "/cari", frekuensi: "weekly", prioritas: 0.5 },
  { path: "/pengetahuan", frekuensi: "weekly", prioritas: 0.8 },
  { path: "/data", frekuensi: "weekly", prioritas: 0.8 },
  { path: "/peta", frekuensi: "weekly", prioritas: 0.7 },
  { path: "/timeline", frekuensi: "weekly", prioritas: 0.7 },
  { path: "/kuis", frekuensi: "daily", prioritas: 0.6 },
  { path: "/tanya", frekuensi: "weekly", prioritas: 0.6 },
  { path: "/rutin", frekuensi: "weekly", prioritas: 0.6 },
  { path: "/rutin/pagi", frekuensi: "daily", prioritas: 0.6 },
  { path: "/rutin/hari-ini", frekuensi: "daily", prioritas: 0.6 },
  { path: "/rutin/mingguan", frekuensi: "weekly", prioritas: 0.5 },
  { path: "/rutin/bulanan", frekuensi: "monthly", prioritas: 0.5 },
  { path: "/rutin/dunia", frekuensi: "weekly", prioritas: 0.5 },
  { path: "/rutin/angka", frekuensi: "weekly", prioritas: 0.5 },
  { path: "/kebijakan/redaksi", frekuensi: "monthly", prioritas: 0.4 },
  { path: "/kebijakan/koreksi", frekuensi: "monthly", prioritas: 0.4 },
  { path: "/kebijakan/privasi", frekuensi: "monthly", prioritas: 0.4 },
  { path: "/kebijakan/syarat", frekuensi: "monthly", prioritas: 0.4 },
];

type BarisSlug = { slug: string; diperbarui_pada: string | null };

async function ambilSlugTerbit(
  tabel: string,
): Promise<BarisSlug[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return [];
  try {
    const res = await fetch(
      `${url}/rest/v1/${tabel}?status=eq.terbit&select=slug,diperbarui_pada&order=diperbarui_pada.desc&limit=500`,
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
    return baris
      .filter(
        (b): b is BarisSlug =>
          !!b &&
          typeof b === "object" &&
          typeof (b as BarisSlug).slug === "string",
      )
      .map((b) => ({
        slug: b.slug,
        diperbarui_pada:
          typeof b.diperbarui_pada === "string" ? b.diperbarui_pada : null,
      }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const dasar = urlSitus();
  const sekarang = new Date();

  const entri: MetadataRoute.Sitemap = HALAMAN_STATIS.map((h) => ({
    url: `${dasar}${h.path}`,
    lastModified: sekarang,
    changeFrequency: h.frekuensi,
    priority: h.prioritas,
  }));

  for (const k of KATEGORI_UTAMA) {
    entri.push({
      url: `${dasar}/kategori/${k.slug}`,
      lastModified: sekarang,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  const artikel = await ambilSlugTerbit("pf_articles");
  for (const a of artikel) {
    entri.push({
      url: `${dasar}/artikel/${a.slug}`,
      lastModified: a.diperbarui_pada
        ? new Date(a.diperbarui_pada)
        : sekarang,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  const pengetahuan = await ambilSlugTerbit("pf_knowledge_articles");
  for (const p of pengetahuan) {
    entri.push({
      url: `${dasar}/pengetahuan/${p.slug}`,
      lastModified: p.diperbarui_pada
        ? new Date(p.diperbarui_pada)
        : sekarang,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  return entri;
}
