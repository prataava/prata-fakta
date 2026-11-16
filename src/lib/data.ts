// Lapisan akses data PRATA FAKTA (server).
// Prinsip: tidak ada data palsu. Bila tabel pf_* belum dibuat (migrasi Fase 1
// masih menunggu dijalankan di SQL Editor) atau query gagal, fungsi-fungsi
// ini mengembalikan array kosong dan pemanggil menampilkan empty state
// jujur — bukan angka atau artikel karangan.
import { createClient } from "@/lib/supabase/server";
import { KATEGORI_UTAMA, type Kategori } from "@/lib/categories";
import type { IsiBrief } from "@/lib/ai/brief";
import {
  skorKredibilitas,
  tierDariPrioritas,
} from "@/lib/ai/source-analysis";

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
  /** Waktu verification record CORRECTED terbaru; null bila belum
   *  pernah dikoreksi. Dipakai lencana "Dikoreksi pada …" di halaman
   *  artikel publik. */
  koreksi_pada: string | null;
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

    const [kat, tag, sum, kor] = await Promise.all([
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
      // Verification record CORRECTED terbaru = tanggal koreksi.
      supabase
        .from("pf_verification_records")
        .select("dibuat_pada")
        .eq("artikel_id", artikelId)
        .eq("keputusan", "CORRECTED")
        .order("dibuat_pada", { ascending: false })
        .limit(1)
        .maybeSingle(),
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
      koreksi_pada:
        kor.data && !kor.error
          ? ((kor.data as { dibuat_pada: string | null }).dibuat_pada ?? null)
          : null,
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

export type BriefTerbit = {
  id: string;
  tanggal: string;
  isi: IsiBrief;
};

/**
 * Daily Brief terbaru berstatus 'terbit' dari pf_daily_briefs (Fase 4).
 * RLS mengizinkan publik membaca brief berstatus 'terbit' saja — brief
 * 'draft' tidak pernah bocor ke halaman ini. null bila belum ada brief
 * terbit / tabel belum ada — pemanggil menampilkan empty state jujur.
 * Bentuk isi divalidasi longgar (seksi harus objek); isi yang rusak
 * dianggap tidak ada, bukan ditampilkan setengah-setengah.
 */
export async function getBriefTerbit(): Promise<BriefTerbit | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_daily_briefs")
      .select("id, tanggal, isi")
      .eq("status", "terbit")
      .order("tanggal", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const isi = data.isi as IsiBrief | null;
    if (
      !isi ||
      typeof isi !== "object" ||
      !isi.seksi ||
      typeof isi.seksi !== "object"
    ) {
      return null;
    }
    return { id: data.id as string, tanggal: data.tanggal as string, isi };
  } catch {
    return null;
  }
}

/* ============================================================
   Jejak Fakta (Area 1) & Multi-Source View (Area 3) — Fase 8 Gel. 1
   ============================================================ */

export type JejakBukti = {
  id: string;
  sumber_url: string;
  sumber_nama: string | null;
  kutipan: string | null;
  arah: string;
  dibuat_pada: string | null;
};

export type JejakKlaim = {
  id: string;
  teks: string;
  jenis: string;
  status: string;
  dibuat_pada: string | null;
  bukti: JejakBukti[];
};

export type JejakVerifikasi = {
  id: string;
  keputusan: string;
  catatan: string | null;
  dibuat_pada: string | null;
};

export type JejakFakta = {
  artikelId: string;
  klaim: JejakKlaim[];
  verifikasi: JejakVerifikasi[];
  /** false = tabel Fase 4 belum ada / query gagal (pemanggil
   *  menampilkan empty state jujur, bukan jejak karangan). */
  tersedia: boolean;
};

/**
 * Jejak Fakta: rantai klaim → bukti → catatan verifikasi untuk
 * satu artikel TERBIT. Dibaca via session client; migrasi v8
 * membuka baca publik terbatas (hanya bila artikel terbit) untuk
 * pf_claims / pf_evidence / pf_verification_records. [] bila
 * artikel belum punya klaim — itu fakta, bukan kegagalan.
 */
export async function getJejakFakta(
  artikelId: string,
): Promise<JejakFakta> {
  const kosong: JejakFakta = { artikelId, klaim: [], verifikasi: [], tersedia: false };
  try {
    const supabase = await createClient();
    // Defense-in-depth (F-A1-1): cek status='terbit' di aplikasi,
    // jangan hanya mengandalkan RLS v8 — sama seperti
    // getPerbandinganSumber. Artikel draf/tak ada -> kosong.
    const { data: artikel, error: errArtikel } = await supabase
      .from("pf_articles")
      .select("id")
      .eq("id", artikelId)
      .eq("status", "terbit")
      .maybeSingle();
    if (errArtikel || !artikel) return kosong;
    const { data: klaim, error: errKlaim } = await supabase
      .from("pf_claims")
      .select("id, teks, jenis, status, dibuat_pada")
      .eq("artikel_id", artikelId)
      .order("dibuat_pada", { ascending: true });
    if (errKlaim || !klaim) return kosong;

    const klaimId = (klaim as { id: string }[]).map((k) => k.id);
    const [buktiRes, verRes] = await Promise.all([
      klaimId.length > 0
        ? supabase
            .from("pf_evidence")
            .select("id, klaim_id, sumber_url, sumber_nama, kutipan, arah, dibuat_pada")
            .in("klaim_id", klaimId)
            .order("dibuat_pada", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("pf_verification_records")
        .select("id, keputusan, catatan, dibuat_pada")
        .eq("artikel_id", artikelId)
        .order("dibuat_pada", { ascending: false }),
    ]);
    if (buktiRes.error || verRes.error) return kosong;

    const buktiPerKlaim = new Map<string, JejakBukti[]>();
    for (const b of (buktiRes.data ?? []) as unknown as Record<string, unknown>[]) {
      const kid = String(b.klaim_id ?? "");
      const baris: JejakBukti = {
        id: String(b.id),
        sumber_url: String(b.sumber_url ?? ""),
        sumber_nama: (b.sumber_nama as string | null) ?? null,
        kutipan: (b.kutipan as string | null) ?? null,
        arah: String(b.arah ?? "netral"),
        dibuat_pada: (b.dibuat_pada as string | null) ?? null,
      };
      const daftar = buktiPerKlaim.get(kid) ?? [];
      daftar.push(baris);
      buktiPerKlaim.set(kid, daftar);
    }

    return {
      artikelId,
      klaim: (klaim as unknown as Record<string, unknown>[]).map((k) => ({
        id: String(k.id),
        teks: String(k.teks ?? ""),
        jenis: String(k.jenis ?? "lain"),
        status: String(k.status ?? "belum_terverifikasi"),
        dibuat_pada: (k.dibuat_pada as string | null) ?? null,
        bukti: buktiPerKlaim.get(String(k.id)) ?? [],
      })),
      verifikasi: ((verRes.data ?? []) as unknown as Record<string, unknown>[]).map((v) => ({
        id: String(v.id),
        keputusan: String(v.keputusan ?? "UNCONFIRMED"),
        catatan: (v.catatan as string | null) ?? null,
        dibuat_pada: (v.dibuat_pada as string | null) ?? null,
      })),
      tersedia: true,
    };
  } catch {
    return kosong;
  }
}

export type StatusSelPerbandingan =
  | "sama"
  | "berbeda"
  | "beda_waktu"
  | "tanpa_bukti"
  | "belum_diketahui";

export type SumberPerbandingan = {
  id: string;
  nama: string;
  url: string | null;
  peran: string | null;
  kutipan: string | null;
  /** Tier deterministik dari prioritas pf_sources (90/75/60);
   *  null bila sumber bukan dari pf_sources (mis. sumber_url
   *  utama artikel tanpa baris pf_sources). */
  tier: number | null;
  skor: number | null;
  /** Sumber utama artikel (sumber_url artikel) — sumber awal. */
  utama: boolean;
  /** Id item akar rantai salinan (dari RPC pf_akar_salinan);
   *  null bila rantai kolom ini belum terverifikasi. */
  akarId: string | null;
  /** Nama sumber akar bila kolom ini berasal dari item salinan;
   *  null bila kolom ini item asli / bukan salinan. */
  disalinDari: string | null;
  /** Rantai salinan kolom ini terverifikasi lewat RPC
   *  pf_akar_salinan (false bila RPC tak tersedia atau URL
   *  kolom tak cocok ke satu pun item mentah). */
  rantaiTerverifikasi: boolean;
};

export type SelPerbandingan = {
  status: StatusSelPerbandingan;
  /** Sel dari sumber utama artikel (sumber awal). */
  sumberAwal: boolean;
  /** Sel ini berasal dari bukti yang merupakan salinan
   *  (disalin_dari_id terisi di rantai). */
  salinan: boolean;
  /** Nama sumber akar bila bukti sel ini disalin, null bila
   *  bukan salinan. */
  disalinDari: string | null;
};

export type BobotKlaim = {
  klaimId: string;
  mendukung: number;
  menentang: number;
  netral: number;
  /** Jumlah sumber INDEPENDEN berbeda yang mendukung klaim —
   *  dihitung dari AKAR rantai salinan (satu berita yang disalin
   *  3 media = 1), TIDAK termasuk akar yang dicurigai parafrase. */
  independen: number;
  /** Jumlah evidence mendukung yang merupakan salinan. */
  salinan: number;
  /** Jumlah evidence mendukung yang tak tercocokkan ke kolom
   *  sumber mana pun (terdaftar terpisah, tidak hilang). */
  buktiTakTercocokkan: number;
  /** Jumlah akar berbeda yang dicurigai parafrase (judul mirip
   *  tanpa rantai salinan) — tidak dihitung di independen. */
  kemungkinanParafrase: number;
  /** Jumlah kunci akar berbeda yang mendukung DAN rantainya
   *  terverifikasi lewat RPC (0 bila RPC tak tersedia). */
  independenTerverifikasi: number;
  /** Skor kredibilitas tertinggi di antara sumber pendukung,
   *  dihitung dari tier AKAR (tier 90/75/60); null bila tidak
   *  ada pendukung. */
  skorTertinggi: number | null;
};

/** Bukti yang tidak dapat dicocokkan ke kolom sumber mana pun —
 *  ditampilkan terpisah di komponen, bukan dibuang diam-diam. */
export type BuktiTakTercocokkan = {
  klaimId: string;
  sumber_url: string;
  sumber_nama: string | null;
  arah: string;
  kutipan: string | null;
};

/** Akar yang dicurigai parafrase: judulnya mirip (Jaccard >= 0,8)
 *  dengan akar lain tanpa rantai salinan yang menghubungkan. */
export type AkarParafrase = {
  akarKunci: string;
  akarNama: string | null;
  akarJudul: string | null;
  /** Judul akar lain yang mirip dengan akar ini. */
  miripDengan: string | null;
};

export type PerbandinganSumber = {
  artikelId: string;
  klaim: { id: string; teks: string; jenis: string; status: string }[];
  sumber: SumberPerbandingan[];
  /** sel[klaimId][sumberId] — selalu terisi bila klaim dan
   *  sumber ada (tanpa_bukti / belum_diketahui bila tidak ada
   *  bukti yang menghubungkan keduanya). */
  sel: Record<string, Record<string, SelPerbandingan>>;
  bobot: BobotKlaim[];
  tersedia: boolean;
  /** RPC pf_akar_salinan berhasil dipanggil (false bila RPC
   *  belum diterapkan / gagal — hitungan independen saat itu
   *  memakai kolom, belum terverifikasi rantai). */
  rantaiTersedia: boolean;
  buktiTakTercocokkan: BuktiTakTercocokkan[];
  parafrase: AkarParafrase[];
};

function tanggalKalender(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Normalisasi URL untuk pencocokan: buang spasi + garis miring
 *  akhir (RPC mencocokkan persis atau tanpa trailing slash). */
function normalisasiUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Normalisasi judul untuk perbandingan: huruf kecil, buang
 *  tanda baca, rapatkan spasi. */
export function normalisasiJudul(judul: string): string {
  return judul
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Kemiripan token Jaccard (0..1) antara dua judul setelah
 *  normalisasi. 1 bila judul ternormalisasi identik dan tak
 *  kosong; 0 bila salah satu judul kosong / tanpa token. */
export function kemiripanJudul(a: string, b: string): number {
  const normA = normalisasiJudul(a);
  const normB = normalisasiJudul(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  const tokenA = new Set(normA.split(" "));
  const tokenB = new Set(normB.split(" "));
  let iris = 0;
  for (const t of tokenA) {
    if (tokenB.has(t)) iris += 1;
  }
  const gabung = tokenA.size + tokenB.size - iris;
  if (gabung === 0) return 0;
  return iris / gabung;
}

/** Satu bukti yang sudah dicocokkan ke kolom + diurai akarnya —
 *  masukan fungsi murni hitungBobotPerbandingan. akarKunci =
 *  kunci akar rantai salinan (akar_sumber_id atau
 *  "item:"+akar_id); bila rantai tak tersedia, kunci kolom
 *  ("sumber:"+id kolom); null bila bukti tak tercocokkan. */
export type BuktiPerbandinganMasukan = {
  klaimId: string;
  sumberId: string | null;
  arah: string;
  tanggal: string | null;
  akarKunci: string | null;
  disalin: boolean;
  disalinDari: string | null;
  akarJudul: string | null;
  akarNama: string | null;
  rantaiTerverifikasi: boolean;
  sumberUrl: string;
  sumberNama: string | null;
  kutipan: string | null;
};

export type HasilHitungPerbandingan = {
  bobot: BobotKlaim[];
  sel: Record<string, Record<string, SelPerbandingan>>;
  buktiTakTercocokkan: BuktiTakTercocokkan[];
  parafrase: AkarParafrase[];
};

/** Logika murni matriks klaim × sumber (diekspor agar bisa diuji
 *  tanpa database — pola uji-fase7.mjs).
 *  - "Independen" dihitung dari AKAR rantai salinan, bukan dari
 *    kolom: satu berita yang disalin 3 media = 1 sumber.
 *  - Akar yang dicurigai parafrase (judul mirip Jaccard >= 0,8
 *    dengan akar lain, tanpa rantai salinan yang menghubungkan)
 *    TIDAK dihitung di independen.
 *  - "beda_waktu" HANYA bila bukti sel lebih lambat dari bukti
 *    paling awal klaim itu DAN akarnya berbeda (liputan
 *    independen baru); salinan telat tetap "sama".
 *  - skorTertinggi = skor terbesar dari tier AKAR pendukung
 *    (skorPerAkar), bukan tier kolom salinan.
 *  - Bukti yang tak tercocokkan ke kolom mana pun dikembalikan
 *    terpisah (buktiTakTercocokkan), tidak dibuang.
 *  Bila rantai tak tersedia, pemanggil mengisi akarKunci dengan
 *  kunci kolom — hitungan lalu sama seperti sebelum remediasi,
 *  dengan independenTerverifikasi = 0. */
export function hitungBobotPerbandingan(
  klaimId: string[],
  kolomId: string[],
  bukti: BuktiPerbandinganMasukan[],
  skorPerAkar: Record<string, number>,
  kolomUtamaId: string | null,
): HasilHitungPerbandingan {
  const AMBANG_PARAFRASE = 0.8;
  const buktiPerKlaim = new Map<string, BuktiPerbandinganMasukan[]>();
  for (const b of bukti) {
    const daftar = buktiPerKlaim.get(b.klaimId) ?? [];
    daftar.push(b);
    buktiPerKlaim.set(b.klaimId, daftar);
  }
  // Deteksi parafrase antar akar berbeda (global per artikel,
  // dari evidence mendukung): akar pertama dipertahankan,
  // akar berikutnya yang judulnya mirip ditandai.
  const akarDitemukan: { kunci: string; judul: string; nama: string | null }[] = [];
  const kunciDilihat = new Set<string>();
  for (const b of bukti) {
    if (b.arah !== "mendukung") continue;
    if (!b.akarKunci || !b.akarJudul) continue;
    if (kunciDilihat.has(b.akarKunci)) continue;
    kunciDilihat.add(b.akarKunci);
    akarDitemukan.push({ kunci: b.akarKunci, judul: b.akarJudul, nama: b.akarNama });
  }
  const dipertahankan: { kunci: string; judul: string }[] = [];
  const parafrasePerKunci = new Map<string, string>();
  for (const akar of akarDitemukan) {
    let mirip: string | null = null;
    for (const jaga of dipertahankan) {
      if (kemiripanJudul(akar.judul, jaga.judul) >= AMBANG_PARAFRASE) {
        mirip = jaga.judul;
        break;
      }
    }
    if (mirip !== null) {
      parafrasePerKunci.set(akar.kunci, mirip);
    } else {
      dipertahankan.push({ kunci: akar.kunci, judul: akar.judul });
    }
  }
  const bobot: BobotKlaim[] = [];
  const sel: Record<string, Record<string, SelPerbandingan>> = {};
  for (const kid of klaimId) {
    const daftar = buktiPerKlaim.get(kid) ?? [];
    const mendukung = daftar.filter((d) => d.arah === "mendukung");
    const menentang = daftar.filter((d) => d.arah === "menentang");
    const netral = daftar.filter((d) => d.arah === "netral");
    const kunciIndependen = new Set<string>();
    const kunciTerverifikasi = new Set<string>();
    const kunciParafrase = new Set<string>();
    let salinan = 0;
    let takTercocokkan = 0;
    let skorTertinggi: number | null = null;
    for (const d of mendukung) {
      if (d.disalin) salinan += 1;
      if (d.sumberId === null) takTercocokkan += 1;
      if (!d.akarKunci) continue;
      const skor = skorPerAkar[d.akarKunci];
      if (typeof skor === "number" && (skorTertinggi === null || skor > skorTertinggi)) {
        skorTertinggi = skor;
      }
      if (parafrasePerKunci.has(d.akarKunci)) {
        kunciParafrase.add(d.akarKunci);
        continue;
      }
      kunciIndependen.add(d.akarKunci);
      if (d.rantaiTerverifikasi) kunciTerverifikasi.add(d.akarKunci);
    }
    const tanggalAda = daftar
      .map((d) => d.tanggal)
      .filter((t): t is string => Boolean(t));
    const tanggalAwal = tanggalAda.length > 0 ? [...tanggalAda].sort()[0] : null;
    const kunciAwal = new Set<string>();
    if (tanggalAwal !== null) {
      for (const d of daftar) {
        if (d.tanggal === tanggalAwal && d.akarKunci) kunciAwal.add(d.akarKunci);
      }
    }
    bobot.push({
      klaimId: kid,
      mendukung: mendukung.length,
      menentang: menentang.length,
      netral: netral.length,
      independen: kunciIndependen.size,
      salinan,
      buktiTakTercocokkan: takTercocokkan,
      kemungkinanParafrase: kunciParafrase.size,
      independenTerverifikasi: kunciTerverifikasi.size,
      skorTertinggi,
    });
    const baris: Record<string, SelPerbandingan> = {};
    for (const sid of kolomId) {
      const buktiSel = daftar.filter((d) => d.sumberId === sid);
      let status: StatusSelPerbandingan;
      if (daftar.length === 0) {
        status = "tanpa_bukti";
      } else if (buktiSel.length === 0) {
        status = "belum_diketahui";
      } else if (buktiSel.some((d) => d.arah === "menentang")) {
        status = "berbeda";
      } else if (
        tanggalAwal !== null &&
        buktiSel.some(
          (d) =>
            d.tanggal !== null &&
            d.tanggal > tanggalAwal &&
            d.akarKunci !== null &&
            !kunciAwal.has(d.akarKunci),
        )
      ) {
        // Bukti lebih lambat dari bukti paling awal DAN dari akar
        // berbeda = liputan independen baru (cerita berkembang).
        // Salinan telat dari akar yang sama tetap "sama".
        status = "beda_waktu";
      } else if (buktiSel.some((d) => d.arah === "mendukung")) {
        status = "sama";
      } else {
        status = "belum_diketahui";
      }
      let disalinDariSel: string | null = null;
      for (const d of buktiSel) {
        if (d.disalinDari) {
          disalinDariSel = d.disalinDari;
          break;
        }
      }
      baris[sid] = {
        status,
        sumberAwal: sid === kolomUtamaId,
        salinan: buktiSel.some((d) => d.disalin),
        disalinDari: disalinDariSel,
      };
    }
    sel[kid] = baris;
  }
  const takCocok: BuktiTakTercocokkan[] = [];
  for (const b of bukti) {
    if (b.sumberId !== null) continue;
    takCocok.push({
      klaimId: b.klaimId,
      sumber_url: b.sumberUrl,
      sumber_nama: b.sumberNama,
      arah: b.arah,
      kutipan: b.kutipan,
    });
  }
  const parafrase: AkarParafrase[] = [];
  for (const akar of akarDitemukan) {
    const mirip = parafrasePerKunci.get(akar.kunci);
    if (mirip === undefined) continue;
    parafrase.push({
      akarKunci: akar.kunci,
      akarNama: akar.nama,
      akarJudul: akar.judul,
      miripDengan: mirip,
    });
  }
  return { bobot, sel, buktiTakTercocokkan: takCocok, parafrase };
}

/**
 * Multi-Source View: matriks klaim × sumber untuk satu artikel
 * TERBIT. Status sel dihitung dari pf_evidence (arah
 * mendukung/menentang/netral) yang dicocokkan ke sumber lewat
 * URL persis atau nama sumber — TANPA kesetaraan palsu: klaim
 * tanpa satu pun bukti ditandai "tanpa_bukti", dan sumber yang
 * tidak punya bukti untuk klaim itu ditandai "belum_diketahui"
 * (bukan "sama").
 *
 * "Sumber independen" dihitung dari AKAR rantai salinan lewat
 * RPC pf_akar_salinan (SECURITY DEFINER, migrasi v9) — pf_raw_items
 * hanya boleh dibaca staf, jadi klien anon di sini TIDAK BOLEH
 * query tabel itu langsung dan TIDAK memakai service-role client
 * (akan membypass RLS yang melindungi draf). Satu berita yang
 * disalin 3 media = 1 sumber independen. Bila RPC belum
 * diterapkan / gagal, rantaiTersedia=false dan hitungan memakai
 * kolom seperti sebelumnya — komponen wajib menampilkannya
 * sebagai belum terverifikasi, bukan sebagai angka pasti.
 *
 * "beda_waktu" HANYA bila bukti sel lebih lambat dari bukti
 * paling awal klaim itu DAN akarnya berbeda (liputan independen
 * baru = cerita berkembang); salinan telat dari akar yang sama
 * tetap "sama". Bukti yang tak tercocokkan ke kolom mana pun
 * dikembalikan terpisah (buktiTakTercocokkan), tidak dibuang.
 * Akar yang dicurigai parafrase (judul mirip tanpa rantai)
 * tidak dihitung di independen dan dilaporkan terpisah.
 * Bobot bukti eksplisit per klaim: jumlah sumber independen
 * yang mendukung + skor kredibilitas tertinggi dari tier AKAR
 * (tier 90/75/60).
 */
export async function getPerbandinganSumber(
  artikelId: string,
): Promise<PerbandinganSumber> {
  const kosong: PerbandinganSumber = {
    artikelId,
    klaim: [],
    sumber: [],
    sel: {},
    bobot: [],
    tersedia: false,
    rantaiTersedia: false,
    buktiTakTercocokkan: [],
    parafrase: [],
  };
  try {
    const supabase = await createClient();
    const { data: artikel, error: errArtikel } = await supabase
      .from("pf_articles")
      .select("id, sumber_url")
      .eq("id", artikelId)
      .eq("status", "terbit")
      .maybeSingle();
    if (errArtikel || !artikel) return kosong;

    const { data: klaim, error: errKlaim } = await supabase
      .from("pf_claims")
      .select("id, teks, jenis, status, dibuat_pada")
      .eq("artikel_id", artikelId)
      .order("dibuat_pada", { ascending: true });
    if (errKlaim || !klaim) return kosong;

    const { data: tautan, error: errTautan } = await supabase
      .from("pf_article_sources")
      .select("id, url, peran, kutipan, pf_sources(nama, url, prioritas)")
      .eq("artikel_id", artikelId);
    if (errTautan || !tautan) return kosong;

    const klaimId = (klaim as { id: string }[]).map((k) => k.id);
    const { data: bukti, error: errBukti } =
      klaimId.length > 0
        ? await supabase
            .from("pf_evidence")
            .select("id, klaim_id, sumber_url, sumber_nama, kutipan, arah, dibuat_pada")
            .in("klaim_id", klaimId)
        : { data: [], error: null };
    if (errBukti || !bukti) return kosong;

    // ---- Rantai salinan via RPC SECURITY DEFINER (v9) ----
    // pf_raw_items hanya boleh dibaca staf, jadi klien anon di sini
    // TIDAK BOLEH query tabel itu langsung; rantai ditelusuri lewat
    // RPC pf_akar_salinan. Bila RPC belum diterapkan / gagal,
    // JANGAN gagal total: rantaiTersedia=false dan hitungan memakai
    // kunci kolom seperti sebelumnya (ditandai belum terverifikasi
    // di komponen). JANGAN pakai service-role client di sini
    // (akan membypass RLS yang melindungi draf).
    const sumberUrlUtama =
      typeof (artikel as { sumber_url?: unknown }).sumber_url === "string"
        ? ((artikel as { sumber_url: string }).sumber_url as string)
        : null;
    const semuaUrl = [
      ...(sumberUrlUtama ? [sumberUrlUtama] : []),
      ...((tautan as unknown as Record<string, unknown>[])
        .map((t) => (typeof t.url === "string" ? (t.url as string) : ""))
        .filter(Boolean)),
      ...((bukti as unknown as Record<string, unknown>[])
        .map((b) =>
          typeof b.sumber_url === "string" ? (b.sumber_url as string) : "",
        )
        .filter(Boolean)),
    ];
    const urlUnik = [...new Set(semuaUrl)];
    type BarisRantai = {
      akarId: string;
      akarSumberId: string | null;
      akarNama: string | null;
      disalin: boolean;
      akarJudul: string | null;
    };
    let rantaiTersedia = false;
    const petaRantai = new Map<string, BarisRantai>();
    if (urlUnik.length > 0) {
      const { data: rantai, error: errRantai } = await supabase.rpc(
        "pf_akar_salinan",
        { p_artikel_id: artikelId, p_url: urlUnik },
      );
      if (!errRantai && Array.isArray(rantai)) {
        rantaiTersedia = true;
        for (const r of rantai as unknown as Record<string, unknown>[]) {
          const kunci = normalisasiUrl(String(r.url ?? ""));
          if (!kunci || petaRantai.has(kunci)) continue;
          const akarId =
            typeof r.akar_id === "string" ? (r.akar_id as string) : "";
          if (!akarId) continue;
          petaRantai.set(kunci, {
            akarId,
            akarSumberId: (r.akar_sumber_id as string | null) ?? null,
            akarNama: (r.akar_nama as string | null) ?? null,
            disalin: r.disalin === true,
            akarJudul: (r.akar_judul as string | null) ?? null,
          });
        }
      }
    }

    // ---- Tier akar (pf_sources BOLEH dibaca anon) ----
    const akarSumberIdUnik = [
      ...new Set(
        [...petaRantai.values()]
          .map((r) => r.akarSumberId)
          .filter((s): s is string => Boolean(s)),
      ),
    ];
    const tierPerSumberId = new Map<string, { tier: number; skor: number }>();
    if (akarSumberIdUnik.length > 0) {
      const { data: sumberAkar } = await supabase
        .from("pf_sources")
        .select("id, prioritas")
        .in("id", akarSumberIdUnik);
      for (const s of (sumberAkar ??
        []) as unknown as Record<string, unknown>[]) {
        const prioritas =
          typeof s.prioritas === "number" ? (s.prioritas as number) : null;
        if (prioritas !== null) {
          const tier = tierDariPrioritas(prioritas);
          tierPerSumberId.set(String(s.id), {
            tier,
            skor: skorKredibilitas(tier),
          });
        }
      }
    }

    // ---- Daftar sumber (kolom matriks) ----
    const sumber: SumberPerbandingan[] = [];
    const kunciAkarPerKolom = new Map<string, string>();
    // Resolusi akar per kolom: kunci akar = akar_sumber_id atau
    // "item:"+akar_id; bila URL kolom tak cocok RPC -> kunci
    // sendiri "sumber:"+id kolom, rantaiTerverifikasi=false.
    const uraiAkarKolom = (idKolom: string, url: string | null) => {
      const baris = url ? petaRantai.get(normalisasiUrl(url)) : undefined;
      if (baris) {
        return {
          akarKunci: baris.akarSumberId ?? `item:${baris.akarId}`,
          akarId: baris.akarId,
          disalinDari: baris.disalin ? baris.akarNama : null,
          rantaiTerverifikasi: true,
        };
      }
      return {
        akarKunci: `sumber:${idKolom}`,
        akarId: null,
        disalinDari: null,
        rantaiTerverifikasi: false,
      };
    };
    if (sumberUrlUtama) {
      const idUtama = `utama:${sumberUrlUtama}`;
      const akar = uraiAkarKolom(idUtama, sumberUrlUtama);
      kunciAkarPerKolom.set(idUtama, akar.akarKunci);
      // F-A3-3: sumber utama WAJIB mendapat tier/skor — resolve via
      // SELECT pf_sources berdasarkan url artikel, fallback via
      // akar_sumber_id dari RPC. Bila tetap tak ketemu, tier tetap
      // null dan komponen menampilkan "tier tidak diketahui".
      let tierUtama: number | null = null;
      let skorUtama: number | null = null;
      const { data: sUtama } = await supabase
        .from("pf_sources")
        .select("id, prioritas")
        .eq("url", sumberUrlUtama)
        .maybeSingle();
      const prioritasUtama =
        sUtama &&
        typeof (sUtama as Record<string, unknown>).prioritas === "number"
          ? ((sUtama as Record<string, unknown>).prioritas as number)
          : null;
      if (prioritasUtama !== null) {
        const tierHasil = tierDariPrioritas(prioritasUtama);
        tierUtama = tierHasil;
        skorUtama = skorKredibilitas(tierHasil);
      } else {
        const barisUtama = petaRantai.get(normalisasiUrl(sumberUrlUtama));
        const tierAkar = barisUtama?.akarSumberId
          ? tierPerSumberId.get(barisUtama.akarSumberId)
          : undefined;
        if (tierAkar) {
          tierUtama = tierAkar.tier;
          skorUtama = tierAkar.skor;
        }
      }
      sumber.push({
        id: idUtama,
        nama: namaDariUrl(sumberUrlUtama),
        url: sumberUrlUtama,
        peran: "utama",
        kutipan: null,
        tier: tierUtama,
        skor: skorUtama,
        utama: true,
        akarId: akar.akarId,
        disalinDari: akar.disalinDari,
        rantaiTerverifikasi: akar.rantaiTerverifikasi,
      });
    }
    for (const t of tautan as unknown as Record<string, unknown>[]) {
      const pf = t.pf_sources as {
        nama?: string;
        url?: string;
        prioritas?: number;
      } | null;
      const url =
        typeof t.url === "string" && t.url
          ? (t.url as string)
          : (pf?.url ?? null);
      const prioritas =
        typeof pf?.prioritas === "number" ? pf.prioritas : null;
      const tier = prioritas === null ? null : tierDariPrioritas(prioritas);
      const idKolom = String(t.id);
      const akar = uraiAkarKolom(idKolom, url);
      kunciAkarPerKolom.set(idKolom, akar.akarKunci);
      sumber.push({
        id: idKolom,
        nama: pf?.nama ?? (url ? namaDariUrl(url) : "Sumber"),
        url,
        peran: (t.peran as string | null) ?? null,
        kutipan: (t.kutipan as string | null) ?? null,
        tier,
        skor: tier === null ? null : skorKredibilitas(tier),
        utama: false,
        akarId: akar.akarId,
        disalinDari: akar.disalinDari,
        rantaiTerverifikasi: akar.rantaiTerverifikasi,
      });
    }

    // Skor per akar (untuk skorTertinggi): tier AKAR dulu; bila
    // akar tak dikenal di pf_sources, pakai tier kolomnya.
    const skorPerAkar: Record<string, number> = {};
    for (const s of sumber) {
      if (!s.rantaiTerverifikasi) continue;
      const baris = s.url ? petaRantai.get(normalisasiUrl(s.url)) : undefined;
      const tierAkar = baris?.akarSumberId
        ? tierPerSumberId.get(baris.akarSumberId)
        : undefined;
      const kunci = kunciAkarPerKolom.get(s.id);
      if (tierAkar && kunci && skorPerAkar[kunci] === undefined) {
        skorPerAkar[kunci] = tierAkar.skor;
      }
    }
    for (const s of sumber) {
      const kunci = kunciAkarPerKolom.get(s.id);
      if (!kunci || skorPerAkar[kunci] !== undefined) continue;
      if (s.skor !== null) skorPerAkar[kunci] = s.skor;
    }

    // ---- Bukti per klaim, dicocokkan ke sumber + diurai akarnya ----
    const cocokKeSumber = (
      b: Record<string, unknown>,
    ): SumberPerbandingan | null => {
      const urlBukti =
        typeof b.sumber_url === "string" ? (b.sumber_url as string) : "";
      const namaBukti =
        typeof b.sumber_nama === "string" ? (b.sumber_nama as string) : "";
      if (urlBukti) {
        const cocok = sumber.find((s) => s.url === urlBukti);
        if (cocok) return cocok;
      }
      if (namaBukti) {
        const cocok = sumber.find((s) => s.nama === namaBukti);
        if (cocok) return cocok;
      }
      return null;
    };

    const buktiMasukan: BuktiPerbandinganMasukan[] = [];
    for (const b of (bukti as unknown as Record<string, unknown>[])) {
      const kid = String(b.klaim_id ?? "");
      const s = cocokKeSumber(b);
      const urlBukti =
        typeof b.sumber_url === "string" ? (b.sumber_url as string) : "";
      // Akar evidence diutamakan dari baris RPC URL-nya sendiri
      // (URL evidence bisa berupa salinan yang URL kolomnya
      // berbeda bila cocok lewat nama); fallback ke akar kolom.
      const baris = urlBukti
        ? petaRantai.get(normalisasiUrl(urlBukti))
        : undefined;
      let akarKunci: string | null;
      let disalin = false;
      let disalinDari: string | null = null;
      let akarJudul: string | null = null;
      let akarNama: string | null = null;
      let terverifikasi = false;
      if (baris) {
        akarKunci = baris.akarSumberId ?? `item:${baris.akarId}`;
        disalin = baris.disalin;
        disalinDari = baris.disalin ? baris.akarNama : null;
        akarJudul = baris.akarJudul;
        akarNama = baris.akarNama;
        terverifikasi = true;
      } else if (s) {
        akarKunci = kunciAkarPerKolom.get(s.id) ?? `sumber:${s.id}`;
      } else {
        // Bukti tak tercocokkan: akarKunci null -> masuk daftar
        // buktiTakTercocokkan, tidak dihitung di independen.
        akarKunci = null;
      }
      buktiMasukan.push({
        klaimId: kid,
        sumberId: s ? s.id : null,
        arah: String(b.arah ?? "netral"),
        tanggal: tanggalKalender((b.dibuat_pada as string | null) ?? null),
        akarKunci,
        disalin,
        disalinDari,
        akarJudul,
        akarNama,
        rantaiTerverifikasi: terverifikasi,
        sumberUrl: urlBukti,
        sumberNama: (b.sumber_nama as string | null) ?? null,
        kutipan: (b.kutipan as string | null) ?? null,
      });
    }

    // ---- Matriks + bobot (logika murni, lihat hitungBobotPerbandingan) ----
    const daftarKlaim = (
      klaim as unknown as Record<string, unknown>[]
    ).map((k) => ({
      id: String(k.id),
      teks: String(k.teks ?? ""),
      jenis: String(k.jenis ?? "lain"),
      status: String(k.status ?? "belum_terverifikasi"),
    }));
    const idUtama = sumber.find((s) => s.utama)?.id ?? null;
    const hasil = hitungBobotPerbandingan(
      daftarKlaim.map((k) => k.id),
      sumber.map((s) => s.id),
      buktiMasukan,
      skorPerAkar,
      idUtama,
    );

    return {
      artikelId,
      klaim: daftarKlaim,
      sumber,
      sel: hasil.sel,
      bobot: hasil.bobot,
      tersedia: true,
      rantaiTersedia,
      buktiTakTercocokkan: hasil.buktiTakTercocokkan,
      parafrase: hasil.parafrase,
    };
  } catch {
    return kosong;
  }
}
