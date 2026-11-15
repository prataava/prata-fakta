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
};

export type SelPerbandingan = {
  status: StatusSelPerbandingan;
  /** Sel dari sumber utama artikel (sumber awal). */
  sumberAwal: boolean;
};

export type BobotKlaim = {
  klaimId: string;
  mendukung: number;
  menentang: number;
  netral: number;
  /** Jumlah sumber INDEPENDEN berbeda yang mendukung klaim. */
  independen: number;
  /** Skor kredibilitas tertinggi di antara sumber pendukung
   *  (tier 90/75/60); null bila tidak ada pendukung. */
  skorTertinggi: number | null;
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
};

function tanggalKalender(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Multi-Source View: matriks klaim × sumber untuk satu artikel
 * TERBIT. Status sel dihitung dari pf_evidence (arah
 * mendukung/menentang/netral) yang dicocokkan ke sumber lewat
 * URL persis atau nama sumber — TANPA kesetaraan palsu: klaim
 * tanpa satu pun bukti ditandai "tanpa_bukti", dan sumber yang
 * tidak punya bukti untuk klaim itu ditandai "belum_diketahui"
 * (bukan "sama"). "beda_waktu" dipakai bila bukti untuk klaim
 * yang sama dicatat pada tanggal berbeda (cerita berkembang).
 * Bobot bukti eksplisit per klaim: jumlah sumber independen
 * yang mendukung + skor kredibilitas tertinggi (tier 90/75/60).
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
            .select("klaim_id, sumber_url, sumber_nama, arah, dibuat_pada")
            .in("klaim_id", klaimId)
        : { data: [], error: null };
    if (errBukti || !bukti) return kosong;

    // ---- Daftar sumber (kolom matriks) ----
    const sumber: SumberPerbandingan[] = [];
    const sumberUrlUtama =
      typeof (artikel as { sumber_url?: unknown }).sumber_url === "string"
        ? ((artikel as { sumber_url: string }).sumber_url as string)
        : null;
    if (sumberUrlUtama) {
      sumber.push({
        id: `utama:${sumberUrlUtama}`,
        nama: namaDariUrl(sumberUrlUtama),
        url: sumberUrlUtama,
        peran: "utama",
        kutipan: null,
        tier: null,
        skor: null,
        utama: true,
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
      sumber.push({
        id: String(t.id),
        nama: pf?.nama ?? (url ? namaDariUrl(url) : "Sumber"),
        url,
        peran: (t.peran as string | null) ?? null,
        kutipan: (t.kutipan as string | null) ?? null,
        tier,
        skor: tier === null ? null : skorKredibilitas(tier),
        utama: false,
      });
    }

    // ---- Bukti per klaim, dicocokkan ke sumber ----
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

    const buktiPerKlaim = new Map<
      string,
      { sumberId: string | null; arah: string; tanggal: string | null }[]
    >();
    for (const b of (bukti as unknown as Record<string, unknown>[])) {
      const kid = String(b.klaim_id ?? "");
      const daftar = buktiPerKlaim.get(kid) ?? [];
      const s = cocokKeSumber(b);
      daftar.push({
        sumberId: s ? s.id : null,
        arah: String(b.arah ?? "netral"),
        tanggal: tanggalKalender((b.dibuat_pada as string | null) ?? null),
      });
      buktiPerKlaim.set(kid, daftar);
    }

    // ---- Matriks + bobot ----
    const daftarKlaim = (
      klaim as unknown as Record<string, unknown>[]
    ).map((k) => ({
      id: String(k.id),
      teks: String(k.teks ?? ""),
      jenis: String(k.jenis ?? "lain"),
      status: String(k.status ?? "belum_terverifikasi"),
    }));
    const sel: Record<string, Record<string, SelPerbandingan>> = {};
    const bobot: BobotKlaim[] = [];

    for (const k of daftarKlaim) {
      const daftar = buktiPerKlaim.get(k.id) ?? [];
      const tanggalUnik = [
        ...new Set(daftar.map((d) => d.tanggal).filter((t): t is string => Boolean(t))),
      ];
      const tanggalAwal = tanggalUnik.length > 0 ? [...tanggalUnik].sort()[0] : null;
      const mendukung = daftar.filter((d) => d.arah === "mendukung");
      const menentang = daftar.filter((d) => d.arah === "menentang");
      const netral = daftar.filter((d) => d.arah === "netral");
      const independen = new Set(
        mendukung.map((d) => d.sumberId).filter((s): s is string => Boolean(s)),
      ).size;
      const skorPendukung = sumber
        .filter(
          (s) =>
            s.skor !== null &&
            mendukung.some((d) => d.sumberId === s.id),
        )
        .map((s) => s.skor as number);
      bobot.push({
        klaimId: k.id,
        mendukung: mendukung.length,
        menentang: menentang.length,
        netral: netral.length,
        independen,
        skorTertinggi:
          skorPendukung.length > 0 ? Math.max(...skorPendukung) : null,
      });

      const baris: Record<string, SelPerbandingan> = {};
      for (const s of sumber) {
        const buktiSel = daftar.filter((d) => d.sumberId === s.id);
        let status: StatusSelPerbandingan;
        if (daftar.length === 0) {
          status = "tanpa_bukti";
        } else if (buktiSel.length === 0) {
          status = "belum_diketahui";
        } else if (buktiSel.some((d) => d.arah === "menentang")) {
          status = "berbeda";
        } else if (
          tanggalAwal !== null &&
          buktiSel.some((d) => d.tanggal !== null && d.tanggal !== tanggalAwal)
        ) {
          // Bukti untuk klaim ini dicatat pada tanggal berbeda —
          // cerita berkembang; bukan sekadar "sama".
          status = "beda_waktu";
        } else if (buktiSel.some((d) => d.arah === "mendukung")) {
          status = "sama";
        } else {
          status = "belum_diketahui";
        }
        baris[s.id] = { status, sumberAwal: s.utama };
      }
      sel[k.id] = baris;
    }

    return { artikelId, klaim: daftarKlaim, sumber, sel, bobot, tersedia: true };
  } catch {
    return kosong;
  }
}
