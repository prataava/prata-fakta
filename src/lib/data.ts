// Lapisan akses data PRATA FAKTA (server).
// Prinsip: tidak ada data palsu. Bila tabel pf_* belum dibuat (migrasi Fase 1
// masih menunggu dijalankan di SQL Editor) atau query gagal, fungsi-fungsi
// ini mengembalikan array kosong dan pemanggil menampilkan empty state
// jujur — bukan angka atau artikel karangan.
import { createClient } from "@/lib/supabase/server";
import { KATEGORI_UTAMA, type Kategori } from "@/lib/categories";

export type PfCategoryRow = {
  id: string;
  slug: string;
  nama: string;
  deskripsi: string | null;
  induk_id: string | null;
  urutan: number;
  aktif: boolean;
};

export type PfSourceRow = {
  id: string;
  nama: string;
  jenis: string;
  url: string;
  aktif: boolean;
  prioritas: number;
  terakhir_cek: string | null;
  status_terakhir: string | null;
};

/** Kategori dari database; fallback ke taksonomi statis bila tabel belum ada. */
export async function getKategori(): Promise<PfCategoryRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_categories")
      .select("id, slug, nama, deskripsi, induk_id, urutan, aktif")
      .eq("aktif", true)
      .order("urutan", { ascending: true });
    if (error || !data || data.length === 0) return taksonomiKeBaris();
    return data as PfCategoryRow[];
  } catch {
    return taksonomiKeBaris();
  }
}

function taksonomiKeBaris(): PfCategoryRow[] {
  const baris: PfCategoryRow[] = [];
  KATEGORI_UTAMA.forEach((k: Kategori, i: number) => {
    baris.push({
      id: `statis-${k.slug}`,
      slug: k.slug,
      nama: k.nama,
      deskripsi: k.deskripsi,
      induk_id: null,
      urutan: i + 1,
      aktif: true,
    });
    k.sub.forEach((s, j) => {
      baris.push({
        id: `statis-${k.slug}-${s.slug}`,
        slug: s.slug,
        nama: s.nama,
        deskripsi: null,
        induk_id: `statis-${k.slug}`,
        urutan: j + 1,
        aktif: true,
      });
    });
  });
  return baris;
}

/** Sumber berita aktif dari database; [] bila tabel belum ada. */
export async function getSumber(): Promise<PfSourceRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_sources")
      .select("id, nama, jenis, url, aktif, prioritas, terakhir_cek, status_terakhir")
      .eq("aktif", true)
      .order("prioritas", { ascending: false });
    if (error || !data) return [];
    return data as PfSourceRow[];
  } catch {
    return [];
  }
}

export type PfArtikelRingkas = {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  kategori_slug: string | null;
  status_verifikasi: string;
  diterbitkan_pada: string | null;
};

export type FilterArsip = {
  kategori?: string;
  status?: string;
  q?: string;
  /** Format YYYY-MM-DD; filter diterbitkan_pada >= dari. */
  dari?: string;
  /** Format YYYY-MM-DD; filter diterbitkan_pada <= sampai (inklusif). */
  sampai?: string;
  /** UUID pf_sources; filter lewat join pf_article_sources. */
  sumber?: string;
};

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;
const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tanggalValid(s: string): boolean {
  if (!POLA_TANGGAL.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Hari sesudah tanggal YYYY-MM-DD (untuk batas atas inklusif). */
function hariSesudah(s: string): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Artikel arsip dari pf_articles (tabel Fase 2). Selama tabel belum ada,
 * mengembalikan [] — pemanggil menampilkan empty state jujur.
 */
export async function getArtikel(filter: FilterArsip): Promise<PfArtikelRingkas[]> {
  try {
    const supabase = await createClient();
    const pakaiSumber =
      Boolean(filter.sumber) && POLA_UUID.test(filter.sumber as string);
    const kolom =
      "id, slug, judul, ringkasan, kategori_slug, status_verifikasi, diterbitkan_pada" +
      (pakaiSumber ? ", pf_article_sources!inner(sumber_id)" : "");
    let query = supabase
      .from("pf_articles")
      .select(kolom)
      .eq("status", "terbit")
      .order("diterbitkan_pada", { ascending: false })
      .limit(24);
    if (filter.kategori) query = query.eq("kategori_slug", filter.kategori);
    if (filter.status) query = query.eq("status_verifikasi", filter.status);
    if (filter.q) {
      const pola = `%${filter.q.replace(/[%_]/g, "")}%`;
      query = query.or(`judul.ilike.${pola},ringkasan.ilike.${pola}`);
    }
    if (filter.dari && tanggalValid(filter.dari)) {
      query = query.gte("diterbitkan_pada", filter.dari);
    }
    if (filter.sampai && tanggalValid(filter.sampai)) {
      query = query.lt("diterbitkan_pada", hariSesudah(filter.sampai));
    }
    if (pakaiSumber) {
      query = query.eq("pf_article_sources.sumber_id", filter.sumber as string);
    }
    const { data, error } = await query;
    if (error || !data) return [];
    // Select memakai string dinamis (join sumber opsional), jadi tipe
    // Supabase tidak terinferensi — cast lewat unknown.
    return data as unknown as PfArtikelRingkas[];
  } catch {
    return [];
  }
}

export type HasilCari = {
  kategori: PfCategoryRow[];
  sumber: PfSourceRow[];
  /** false = tabel artikel (Fase 2) belum ada; pencarian artikel belum aktif. */
  artikelTersedia: boolean;
};

/** Pencarian atas data yang benar-benar ada (kategori + sumber). */
export async function cariKonten(q: string): Promise<HasilCari> {
  const kata = q.trim();
  const hasil: HasilCari = { kategori: [], sumber: [], artikelTersedia: false };
  if (!kata) return hasil;
  try {
    const supabase = await createClient();
    const pola = `%${kata.replace(/[%_]/g, "")}%`;
    const [kat, sum] = await Promise.all([
      supabase
        .from("pf_categories")
        .select("id, slug, nama, deskripsi, induk_id, urutan, aktif")
        .or(`nama.ilike.${pola},deskripsi.ilike.${pola}`)
        .eq("aktif", true)
        .limit(10),
      supabase
        .from("pf_sources")
        .select("id, nama, jenis, url, aktif, prioritas, terakhir_cek, status_terakhir")
        .or(`nama.ilike.${pola},url.ilike.${pola}`)
        .eq("aktif", true)
        .limit(10),
    ]);
    if (!kat.error && kat.data) hasil.kategori = kat.data as PfCategoryRow[];
    if (!sum.error && sum.data) hasil.sumber = sum.data as PfSourceRow[];
  } catch {
    // Tabel belum ada: hasil tetap kosong dan jujur.
  }
  // Bila tabel kategori di DB belum ada, cari juga di taksonomi statis.
  if (hasil.kategori.length === 0) {
    const rendah = kata.toLowerCase();
    hasil.kategori = taksonomiKeBaris().filter(
      (k) =>
        k.nama.toLowerCase().includes(rendah) ||
        (k.deskripsi ?? "").toLowerCase().includes(rendah),
    );
  }
  return hasil;
}

/* ============================================================
   Fase 2 — Artikel lengkap
   Semua fungsi gagal-aman: bila tabel pf_* belum ada atau query
   gagal, kembalikan [] / null / tersedia=false. Tanpa artikel
   atau angka palsu.
   ============================================================ */

export type PfKronologiItem = {
  tanggal: string;
  peristiwa: string;
  sumber: string;
};

export type PfDataPendukungItem = {
  label: string;
  nilai: string;
  satuan: string;
  sumber: string;
  tanggal: string;
};

export type PfArtikelLengkap = {
  id: string;
  slug: string;
  judul: string;
  subjudul: string | null;
  ringkasan: string | null;
  isi: string | null;
  kategori_slug: string | null;
  subkategori_slug: string | null;
  status_verifikasi: string;
  status: string;
  penulis_nama: string | null;
  penulis_id: string | null;
  sumber_url: string | null;
  gambar_url: string | null;
  estimasi_baca_menit: number | null;
  kronologi: PfKronologiItem[];
  fakta_penting: string[];
  data_pendukung: PfDataPendukungItem[];
  mengapa_penting: string | null;
  dampak: string | null;
  belum_diketahui: string | null;
  dijadwalkan_pada: string | null;
  diterbitkan_pada: string | null;
  dibuat_pada: string | null;
  diperbarui_pada: string | null;
  kategori_nama: string | null;
  tags: { slug: string; nama: string }[];
  sumber_list: { nama: string; url: string }[];
};

export type PfVersiArtikel = {
  versi: number;
  judul: string | null;
  dibuat_oleh: string | null;
  dibuat_pada: string | null;
  catatan: string | null;
};

const KOLOM_ARTIKEL_LENGKAP =
  "id, slug, judul, subjudul, ringkasan, isi, kategori_slug, subkategori_slug, status_verifikasi, status, penulis_nama, penulis_id, sumber_url, gambar_url, estimasi_baca_menit, kronologi, fakta_penting, data_pendukung, mengapa_penting, dampak, belum_diketahui, dijadwalkan_pada, diterbitkan_pada, dibuat_pada, diperbarui_pada";

const KOLOM_ARTIKEL_RINGKAS =
  "id, slug, judul, ringkasan, kategori_slug, status_verifikasi, diterbitkan_pada";

function namaDariUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Sumber";
  }
}

/** Artikel lengkap berdasarkan slug; hanya status='terbit'. */
export async function getArtikelLengkap(
  slug: string,
): Promise<PfArtikelLengkap | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_articles")
      .select(KOLOM_ARTIKEL_LENGKAP)
      .eq("slug", slug)
      .eq("status", "terbit")
      .maybeSingle();
    if (error || !data) return null;

    const row = data as Record<string, unknown>;
    const artikelId = String(row.id);
    const kategoriSlug =
      typeof row.kategori_slug === "string" ? row.kategori_slug : null;

    const [kat, tag, sum] = await Promise.all([
      kategoriSlug
        ? supabase
            .from("pf_categories")
            .select("nama")
            .eq("slug", kategoriSlug)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("pf_article_tags")
        .select("pf_tags(slug, nama)")
        .eq("artikel_id", artikelId),
      supabase
        .from("pf_article_sources")
        .select("url, pf_sources(nama)")
        .eq("artikel_id", artikelId),
    ]);

    const tags: { slug: string; nama: string }[] = [];
    if (!tag.error && tag.data) {
      for (const r of tag.data as unknown as {
        pf_tags: { slug: string; nama: string } | null;
      }[]) {
        if (r.pf_tags) tags.push(r.pf_tags);
      }
    }

    const sumber_list: { nama: string; url: string }[] = [];
    if (typeof row.sumber_url === "string" && row.sumber_url) {
      sumber_list.push({
        nama: namaDariUrl(row.sumber_url),
        url: row.sumber_url,
      });
    }
    if (!sum.error && sum.data) {
      for (const r of sum.data as unknown as {
        url: string;
        pf_sources: { nama: string } | null;
      }[]) {
        if (!r.url) continue;
        if (sumber_list.some((s) => s.url === r.url)) continue;
        sumber_list.push({ nama: r.pf_sources?.nama ?? namaDariUrl(r.url), url: r.url });
      }
    }

    return {
      id: artikelId,
      slug: String(row.slug),
      judul: String(row.judul),
      subjudul: (row.subjudul as string | null) ?? null,
      ringkasan: (row.ringkasan as string | null) ?? null,
      isi: (row.isi as string | null) ?? null,
      kategori_slug: kategoriSlug,
      subkategori_slug: (row.subkategori_slug as string | null) ?? null,
      status_verifikasi: String(row.status_verifikasi ?? "UNCONFIRMED"),
      status: String(row.status ?? ""),
      penulis_nama: (row.penulis_nama as string | null) ?? null,
      penulis_id: (row.penulis_id as string | null) ?? null,
      sumber_url: (row.sumber_url as string | null) ?? null,
      gambar_url: (row.gambar_url as string | null) ?? null,
      estimasi_baca_menit:
        typeof row.estimasi_baca_menit === "number" ? row.estimasi_baca_menit : null,
      kronologi: Array.isArray(row.kronologi)
        ? (row.kronologi as PfKronologiItem[])
        : [],
      fakta_penting: Array.isArray(row.fakta_penting)
        ? (row.fakta_penting as string[])
        : [],
      data_pendukung: Array.isArray(row.data_pendukung)
        ? (row.data_pendukung as PfDataPendukungItem[])
        : [],
      mengapa_penting: (row.mengapa_penting as string | null) ?? null,
      dampak: (row.dampak as string | null) ?? null,
      belum_diketahui: (row.belum_diketahui as string | null) ?? null,
      dijadwalkan_pada: (row.dijadwalkan_pada as string | null) ?? null,
      diterbitkan_pada: (row.diterbitkan_pada as string | null) ?? null,
      dibuat_pada: (row.dibuat_pada as string | null) ?? null,
      diperbarui_pada: (row.diperbarui_pada as string | null) ?? null,
      kategori_nama:
        kat.data && !kat.error
          ? ((kat.data as { nama: string }).nama ?? null)
          : null,
      tags,
      sumber_list,
    };
  } catch {
    return null;
  }
}

/** Artikel terkait: kategori sama, terbit, bukan artikel itu sendiri. */
export async function getArtikelTerkait(
  artikel: PfArtikelLengkap,
  limit = 4,
): Promise<PfArtikelRingkas[]> {
  if (!artikel.kategori_slug) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_articles")
      .select(KOLOM_ARTIKEL_RINGKAS)
      .eq("status", "terbit")
      .eq("kategori_slug", artikel.kategori_slug)
      .neq("id", artikel.id)
      .order("diterbitkan_pada", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as PfArtikelRingkas[];
  } catch {
    return [];
  }
}

/** Artikel terbit terbaru. */
export async function getArtikelTerbaru(
  limit = 6,
): Promise<PfArtikelRingkas[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_articles")
      .select(KOLOM_ARTIKEL_RINGKAS)
      .eq("status", "terbit")
      .order("diterbitkan_pada", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as PfArtikelRingkas[];
  } catch {
    return [];
  }
}

/** Artikel terbit terbaru dari satu kategori. */
export async function getArtikelPerKategori(
  slug: string,
  limit = 12,
): Promise<PfArtikelRingkas[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_articles")
      .select(KOLOM_ARTIKEL_RINGKAS)
      .eq("status", "terbit")
      .eq("kategori_slug", slug)
      .order("diterbitkan_pada", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as PfArtikelRingkas[];
  } catch {
    return [];
  }
}

/**
 * Artikel populer — HANYA dari baris baca nyata di pf_reading_history.
 * [] bila tabel belum ada, error, atau belum ada satu pun baris baca.
 */
export async function getArtikelPopuler(
  limit = 5,
): Promise<PfArtikelRingkas[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_reading_history")
      .select("artikel_id")
      .limit(2000);
    if (error || !data || data.length === 0) return [];

    const hitung = new Map<string, number>();
    for (const r of data as { artikel_id: string }[]) {
      hitung.set(r.artikel_id, (hitung.get(r.artikel_id) ?? 0) + 1);
    }
    const teratas = [...hitung.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
    if (teratas.length === 0) return [];

    const { data: artikel, error: errArtikel } = await supabase
      .from("pf_articles")
      .select(KOLOM_ARTIKEL_RINGKAS)
      .eq("status", "terbit")
      .in("id", teratas);
    if (errArtikel || !artikel) return [];
    const peta = new Map(
      (artikel as PfArtikelRingkas[]).map((a) => [a.id, a]),
    );
    return teratas
      .map((id) => peta.get(id))
      .filter((a): a is PfArtikelRingkas => Boolean(a));
  } catch {
    return [];
  }
}

export type HasilCariArtikel = {
  artikel: PfArtikelRingkas[];
  /** false = query error (mis. tabel artikel belum ada). */
  tersedia: boolean;
};

/** Pencarian isi artikel (judul/ringkasan/isi), hanya yang terbit. */
export async function cariArtikel(
  q: string,
  limit = 10,
): Promise<HasilCariArtikel> {
  const kata = q.trim();
  if (!kata) return { artikel: [], tersedia: true };
  try {
    const supabase = await createClient();
    const pola = `%${kata.replace(/[%_]/g, "")}%`;
    const { data, error } = await supabase
      .from("pf_articles")
      .select(KOLOM_ARTIKEL_RINGKAS)
      .eq("status", "terbit")
      .or(`judul.ilike.${pola},ringkasan.ilike.${pola},isi.ilike.${pola}`)
      .order("diterbitkan_pada", { ascending: false })
      .limit(limit);
    if (error) return { artikel: [], tersedia: false };
    return { artikel: (data ?? []) as PfArtikelRingkas[], tersedia: true };
  } catch {
    return { artikel: [], tersedia: false };
  }
}

/** Bookmark pengguna (artikel terbit), terbaru dulu. */
export async function getBookmarkPengguna(
  userId: string,
  limit = 6,
): Promise<PfArtikelRingkas[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_bookmarks")
      .select(`artikel_id, pf_articles!inner(${KOLOM_ARTIKEL_RINGKAS})`)
      .eq("user_id", userId)
      .eq("pf_articles.status", "terbit")
      .limit(limit);
    if (error || !data) return [];
    const hasil: PfArtikelRingkas[] = [];
    for (const r of data as unknown as {
      pf_articles: PfArtikelRingkas | null;
    }[]) {
      if (r.pf_articles) hasil.push(r.pf_articles);
    }
    return hasil;
  } catch {
    return [];
  }
}

/** Apakah pengguna sudah mem-bookmark artikel ini. */
export async function isBookmarked(
  userId: string,
  artikelId: string,
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_bookmarks")
      .select("artikel_id")
      .eq("user_id", userId)
      .eq("artikel_id", artikelId)
      .maybeSingle();
    if (error || !data) return false;
    return true;
  } catch {
    return false;
  }
}

/** Riwayat versi artikel (untuk seksi "Riwayat pembaruan"). */
export async function getVersiArtikel(
  artikelId: string,
  limit = 5,
): Promise<PfVersiArtikel[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_article_versions")
      .select("versi, judul, dibuat_oleh, dibuat_pada, catatan")
      .eq("artikel_id", artikelId)
      .order("versi", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as PfVersiArtikel[];
  } catch {
    return [];
  }
}
