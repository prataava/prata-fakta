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
import { gambarBesar } from "@/lib/gambar";

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
  { path: "/riset", frekuensi: "weekly", prioritas: 0.7 },
  { path: "/peta", frekuensi: "weekly", prioritas: 0.7 },
  { path: "/timeline", frekuensi: "weekly", prioritas: 0.7 },
  { path: "/cerita", frekuensi: "daily", prioritas: 0.7 },
  { path: "/sejarah", frekuensi: "weekly", prioritas: 0.6 },
  { path: "/akademi", frekuensi: "weekly", prioritas: 0.7 },
  { path: "/negara", frekuensi: "weekly", prioritas: 0.7 },
  { path: "/kuis", frekuensi: "daily", prioritas: 0.6 },
  { path: "/tanya", frekuensi: "weekly", prioritas: 0.6 },
  { path: "/tanya/arsip", frekuensi: "weekly", prioritas: 0.5 },
  { path: "/podcast", frekuensi: "weekly", prioritas: 0.6 },
  { path: "/laporkan", frekuensi: "monthly", prioritas: 0.5 },
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

type BarisSlug = {
  slug: string;
  diperbarui_pada: string | null;
  gambar_url?: string | null;
};

async function ambilSlugTerbit(
  tabel: string,
  denganGambar = false,
): Promise<BarisSlug[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return [];
  try {
    const kolom = denganGambar
      ? "slug,diperbarui_pada,gambar_url"
      : "slug,diperbarui_pada";
    const res = await fetch(
      `${url}/rest/v1/${tabel}?status=eq.terbit&select=${kolom}&order=diperbarui_pada.desc&limit=500`,
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
        gambar_url:
          typeof b.gambar_url === "string" ? b.gambar_url : null,
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

  // Artikel terbit: sertakan gambar utama (images) agar Google
  // menemukan thumbnail artikel — syarat tampil di hasil
  // pencarian bergambar / Discover. Tanpa gambar_url, entri
  // tetap ada tanpa images (bukan URL karangan).
  const artikel = await ambilSlugTerbit("pf_articles", true);
  for (const a of artikel) {
    entri.push({
      url: `${dasar}/artikel/${a.slug}`,
      lastModified: a.diperbarui_pada
        ? new Date(a.diperbarui_pada)
        : sekarang,
      changeFrequency: "weekly",
      priority: 0.7,
      ...(a.gambar_url
        ? { images: [gambarBesar(a.gambar_url) ?? a.gambar_url] }
        : {}),
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

  // Gelombang 2: cerita, kursus, laporan riset, episode podcast
  // (semua memakai kolom slug + status terbit, pola sama).
  const petaDinamis: Array<{ tabel: string; awalan: string }> = [
    { tabel: "pf_stories", awalan: "/cerita" },
    { tabel: "pf_courses", awalan: "/akademi" },
    { tabel: "pf_research_reports", awalan: "/riset" },
    { tabel: "pf_podcast_episodes", awalan: "/podcast" },
  ];
  for (const { tabel, awalan } of petaDinamis) {
    const baris = await ambilSlugTerbit(tabel);
    for (const b of baris) {
      entri.push({
        url: `${dasar}${awalan}/${b.slug}`,
        lastModified: b.diperbarui_pada
          ? new Date(b.diperbarui_pada)
          : sekarang,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }

  // Negara memakai kolom kode (bukan slug) dan tidak punya kolom
  // status — semua baris publik, jadi tanpa filter status.
  const urlNegara = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonNegara = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (urlNegara && anonNegara) {
    try {
      const resNegara = await fetch(
        `${urlNegara}/rest/v1/pf_countries?select=kode,diperbarui_pada&order=nama.asc&limit=500`,
        {
          headers: {
            apikey: anonNegara,
            Authorization: `Bearer ${anonNegara}`,
          },
          cache: "no-store",
        },
      );
      if (resNegara.ok) {
        const barisNegara = (await resNegara.json()) as unknown[];
        if (Array.isArray(barisNegara)) {
          for (const b of barisNegara) {
            if (
              b &&
              typeof b === "object" &&
              typeof (b as { kode?: unknown }).kode === "string"
            ) {
              const kode = (b as { kode: string }).kode;
              const diubah = (b as { diperbarui_pada?: unknown })
                .diperbarui_pada;
              entri.push({
                url: `${dasar}/negara/${kode}`,
                lastModified:
                  typeof diubah === "string" ? new Date(diubah) : sekarang,
                changeFrequency: "monthly",
                priority: 0.6,
              });
            }
          }
        }
      }
    } catch {
      // Negara tidak masuk sitemap bila DB belum tersedia.
    }
  }

  return entri;
}
