// Lapisan akses data PRATA Research (Fase 8 Gelombang 2, area 10).
// Prinsip sama seperti src/lib/data.ts: gagal-aman (try/catch ->
// [] / null), Bahasa Indonesia, tanpa data palsu. Pembacaan
// PUBLIK memakai session client sehingga RLS hanya menampilkan
// yang berstatus 'terbit' (draf tersembunyi). Pembacaan ADMIN
// memakai service role (cobaServiceClient) agar draf terlihat;
// tersedia=false bila service key belum diatur.
// Konvensi tautan dataset (tanpa kolom baru — migrasi v10 tidak
// punya kolom penghubung): laporan riset menautkan dataset CSV
// indikator yang SLUG-nya sama dengan slug laporan
// (lihat getIndikatorTerkaitRiset + /api/riset/[slug]/dataset).
// Dokumen terkait laporan ditandai lewat metadata jsonb
// { "riset_slug": "<slug laporan>" }.
import { createClient } from "@/lib/supabase/server";
import { cobaServiceClient } from "@/lib/supabase/service";

export type PfRiset = {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  isi: string | null;
  metodologi: string | null;
  penerbit: string | null;
  tanggal: string | null;
  status: string;
  dibuat_pada: string | null;
  diperbarui_pada: string | null;
};

export type PfDokumen = {
  id: string;
  jenis: string;
  judul: string;
  penerbit: string | null;
  tanggal: string | null;
  url_sumber: string | null;
  kategori: string | null;
  metadata: Record<string, unknown>;
  status: string;
  dibuat_pada: string | null;
};

export const JENIS_DOKUMEN = [
  "laporan",
  "dokumen",
  "publikasi",
  "penelitian",
  "statistik",
] as const;

export type JenisDokumen = (typeof JENIS_DOKUMEN)[number];

const KOLOM_RISET =
  "id, slug, judul, ringkasan, isi, metodologi, penerbit, tanggal, status, dibuat_pada, diperbarui_pada";
const KOLOM_DOKUMEN =
  "id, jenis, judul, penerbit, tanggal, url_sumber, kategori, metadata, status, dibuat_pada";

function barisRiset(r: Record<string, unknown>): PfRiset {
  return {
    id: String(r.id),
    slug: String(r.slug ?? ""),
    judul: String(r.judul ?? ""),
    ringkasan: (r.ringkasan as string | null) ?? null,
    isi: (r.isi as string | null) ?? null,
    metodologi: (r.metodologi as string | null) ?? null,
    penerbit: (r.penerbit as string | null) ?? null,
    tanggal: (r.tanggal as string | null) ?? null,
    status: String(r.status ?? ""),
    dibuat_pada: (r.dibuat_pada as string | null) ?? null,
    diperbarui_pada: (r.diperbarui_pada as string | null) ?? null,
  };
}

function barisDokumen(r: Record<string, unknown>): PfDokumen {
  const metadata =
    r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
      ? (r.metadata as Record<string, unknown>)
      : {};
  return {
    id: String(r.id),
    jenis: String(r.jenis ?? ""),
    judul: String(r.judul ?? ""),
    penerbit: (r.penerbit as string | null) ?? null,
    tanggal: (r.tanggal as string | null) ?? null,
    url_sumber: (r.url_sumber as string | null) ?? null,
    kategori: (r.kategori as string | null) ?? null,
    metadata,
    status: String(r.status ?? ""),
    dibuat_pada: (r.dibuat_pada as string | null) ?? null,
  };
}

/** Pola ilike yang aman dari karakter wildcard % _ \ . */
function polaCari(q: string): string {
  return `%${q.replace(/[%_\\]/g, "\\$&")}%`;
}

/* ============================================================
   Baca publik (hanya 'terbit' — RLS)
   ============================================================ */

/** Laporan riset terbit, terbaru dulu; q opsional (judul/ringkasan). */
export async function getDaftarRiset(
  limit = 20,
  q?: string,
): Promise<PfRiset[]> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("pf_research_reports")
      .select(KOLOM_RISET)
      .eq("status", "terbit")
      .order("tanggal", { ascending: false, nullsFirst: false })
      .order("dibuat_pada", { ascending: false })
      .limit(Math.min(100, Math.max(1, limit)));
    if (q && q.trim()) {
      const pola = polaCari(q.trim());
      query = query.or(`judul.ilike.${pola},ringkasan.ilike.${pola}`);
    }
    const { data, error } = await query;
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map(barisRiset);
  } catch {
    return [];
  }
}

/** Satu laporan riset terbit berdasarkan slug. null bila tidak ada / draf. */
export async function getRiset(slug: string): Promise<PfRiset | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_research_reports")
      .select(KOLOM_RISET)
      .eq("slug", slug)
      .eq("status", "terbit")
      .maybeSingle();
    if (error || !data) return null;
    return barisRiset(data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

/**
 * Cari dokumen terbit: kata kunci (judul/penerbit) + filter
 * jenis/kategori opsional. Terbaru dulu. Kosong bila tak ada.
 */
export async function cariDokumen(
  q?: string,
  jenis?: string,
  kategori?: string,
): Promise<PfDokumen[]> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("pf_documents")
      .select(KOLOM_DOKUMEN)
      .eq("status", "terbit")
      .order("tanggal", { ascending: false, nullsFirst: false })
      .order("dibuat_pada", { ascending: false })
      .limit(100);
    if (q && q.trim()) {
      const pola = polaCari(q.trim());
      query = query.or(`judul.ilike.${pola},penerbit.ilike.${pola}`);
    }
    if (jenis) query = query.eq("jenis", jenis);
    if (kategori) query = query.eq("kategori", kategori);
    const { data, error } = await query;
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map(barisDokumen);
  } catch {
    return [];
  }
}

/**
 * Dokumen terbit yang terkait satu laporan riset — ditandai lewat
 * metadata { "riset_slug": "<slug laporan>" }. [] bila belum ada.
 */
export async function getDokumenTerkait(
  risetSlug: string,
  limit = 5,
): Promise<PfDokumen[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_documents")
      .select(KOLOM_DOKUMEN)
      .eq("status", "terbit")
      .order("tanggal", { ascending: false, nullsFirst: false })
      .limit(100);
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[])
      .map(barisDokumen)
      .filter((d) => d.metadata["riset_slug"] === risetSlug)
      .slice(0, Math.max(1, limit));
  } catch {
    return [];
  }
}

/**
 * Indikator yang slug-nya SAMA dengan slug laporan (konvensi
 * tautan dataset — lihat kepala berkas). null bila tidak ada
 * indikator terkait. Dipakai halaman detail riset untuk
 * menampilkan tautan unduh CSV.
 */
export async function getIndikatorTerkaitRiset(
  risetSlug: string,
): Promise<{ id: string; slug: string; nama: string } | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_data_indicators")
      .select("id, slug, nama")
      .eq("slug", risetSlug)
      .maybeSingle();
    if (error || !data) return null;
    const r = data as unknown as Record<string, unknown>;
    return {
      id: String(r.id),
      slug: String(r.slug ?? ""),
      nama: String(r.nama ?? ""),
    };
  } catch {
    return null;
  }
}

/** Daftar kategori yang dipakai dokumen terbit (untuk filter). */
export async function daftarKategoriDokumen(): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_documents")
      .select("kategori")
      .eq("status", "terbit")
      .limit(500);
    if (error || !data) return [];
    const kategori = new Set<string>();
    for (const r of data as { kategori: string | null }[]) {
      if (r.kategori && r.kategori.trim()) kategori.add(r.kategori.trim());
    }
    return [...kategori].sort((a, b) => a.localeCompare(b, "id"));
  } catch {
    return [];
  }
}

/* ============================================================
   Baca admin (service role — draf ikut terlihat)
   ============================================================ */

/** Semua laporan riset (draf + terbit) untuk /admin/riset. */
export async function getRisetAdmin(): Promise<{
  riset: PfRiset[];
  tersedia: boolean;
}> {
  try {
    const service = cobaServiceClient();
    if (!service) return { riset: [], tersedia: false };
    const { data, error } = await service
      .from("pf_research_reports")
      .select(KOLOM_RISET)
      .order("dibuat_pada", { ascending: false })
      .limit(200);
    if (error || !data) return { riset: [], tersedia: false };
    return {
      riset: (data as unknown as Record<string, unknown>[]).map(barisRiset),
      tersedia: true,
    };
  } catch {
    return { riset: [], tersedia: false };
  }
}

/** Semua dokumen (draf + terbit) untuk /admin/riset. */
export async function getDokumenAdmin(): Promise<{
  dokumen: PfDokumen[];
  tersedia: boolean;
}> {
  try {
    const service = cobaServiceClient();
    if (!service) return { dokumen: [], tersedia: false };
    const { data, error } = await service
      .from("pf_documents")
      .select(KOLOM_DOKUMEN)
      .order("dibuat_pada", { ascending: false })
      .limit(200);
    if (error || !data) return { dokumen: [], tersedia: false };
    return {
      dokumen: (data as unknown as Record<string, unknown>[]).map(
        barisDokumen,
      ),
      tersedia: true,
    };
  } catch {
    return { dokumen: [], tersedia: false };
  }
}
