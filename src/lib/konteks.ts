// Lapisan akses data Context Explorer (P2-4, RENCANA-EKSPANSI-P2 §4).
// Merakit SATU tampilan topik dari data yang SUDAH ADA — tidak ada
// data baru, tidak ada relasi karangan. Dari mana tiap relasi berasal
// (ditulis di komentar tiap langkah):
//  - Resolusi topik: pf_tags.slug dulu, lalu KATEGORI_UTAMA
//    (kategori utama + subkategori). Dua-duanya tidak ada -> null
//    (pemanggil menampilkan 404 jujur).
//  - Artikel topik: tag -> pf_article_tags (artikel_id) + join
//    pf_articles status='terbit'; kategori/subkategori ->
//    pf_articles.kategori_slug = slug + status='terbit'.
//    CATATAN: kategori_slug artikel berisi slug kategori UTAMA
//    (pola getArtikelPerKategori); subkategori yang tidak pernah
//    dipakai sebagai kategori_slug menghasilkan 0 artikel —
//    seksi disembunyikan, bukan diisi artikel kategori induk.
//  - Cerita terkait: pf_story_articles yang artikel_id-nya salah
//    satu artikel topik, join pf_stories status='terbit' saja.
//  - Timeline peristiwa: pf_events.artikel_id (kolom v17) yang
//    menunjuk salah satu artikel topik.
//  - Negara terkait: pf_articles.negara_kode (kolom v10) dari
//    artikel topik, dipetakan ke pf_countries via getDaftarNegara.
//    BUKAN dari teks artikel.
//  - Indikator data: pf_data_indicators yang kolom `kategori`-nya
//    cocok dengan topik (peta kategoriIndikatorUntukTopik) via
//    getIndikator yang sudah ada; bila tidak ada yang cocok,
//    seksi disembunyikan.
// Prinsip gagal-aman seperti lib lain: tabel belum ada -> [] /
// null; galat lain -> GalatBaca (dilempar, bukan ditelan).
import { createClient } from "@/lib/supabase/server";
import { GalatBaca, catatGalatBaca } from "@/lib/galat";
import { KATEGORI_UTAMA } from "@/lib/categories";
import { getDaftarNegara } from "@/lib/negara";
import { getIndikator, type PfIndikator } from "@/lib/lanjutan";
import type { PfArtikelRingkas } from "@/lib/data";

/* ============================================================
   Tipe
   ============================================================ */

export type JenisTopikKonteks = "tag" | "kategori" | "subkategori";

export type InfoTopikKonteks = {
  slug: string;
  nama: string;
  jenis: JenisTopikKonteks;
  /** Deskripsi kategori (KATEGORI_UTAMA); null untuk tag /
   *  subkategori (tidak punya deskripsi sendiri). */
  deskripsi: string | null;
  /** Kategori induk bila jenis = subkategori. */
  induk: { slug: string; nama: string } | null;
};

/** Cerita TERBIT yang memuat sedikitnya satu artikel topik
 *  (asal: pf_story_articles -> pf_stories). */
export type KonteksCerita = {
  slug: string;
  judul: string;
  ringkasan: string | null;
  status_perkembangan: string;
};

/** Peristiwa yang artikel sumbernya bertag/berkategori topik
 *  (asal: pf_events.artikel_id, kolom v17). */
export type KonteksEvent = {
  id: string;
  judul: string;
  ringkasan: string | null;
  lokasi_teks: string | null;
  dimulai_pada: string | null;
  sumber_url: string | null;
};

/** Negara yang beritanya bertag/berkategori topik
 *  (asal: pf_articles.negara_kode, kolom v10). */
export type KonteksNegara = {
  kode: string;
  nama: string;
};

export type KonteksTopik = {
  topik: InfoTopikKonteks;
  /** Cerita terkait (maks 10, urut judul). */
  cerita: KonteksCerita[];
  /** Peristiwa terkait (maks 10, terbaru dulu). */
  events: KonteksEvent[];
  /** Negara terkait (urut nama). */
  negara: KonteksNegara[];
  /** Artikel terbaru topik itu (maks 5, terbaru dulu). */
  artikel: PfArtikelRingkas[];
  /** Indikator yang kategorinya cocok (maks 5, urut nama). */
  indikator: PfIndikator[];
};

/** Artikel topik + negara_kode (kolom v10) untuk turunan negara. */
type ArtikelKonteks = PfArtikelRingkas & { negara_kode: string | null };

const KOLOM_ARTIKEL_KONTEKS =
  "id, slug, judul, ringkasan, kategori_slug, status_verifikasi, diterbitkan_pada, negara_kode";

/* ============================================================
   Peta topik -> kategori indikator (fungsi murni, diuji tanpa DB)
   ============================================================ */

/** Nilai kolom `kategori` pf_data_indicators (CHECK v6). */
const KATEGORI_INDIKATOR = new Set([
  "nasional",
  "global",
  "penduduk",
  "pendidikan",
  "ekonomi",
  "energi",
  "lingkungan",
]);

/** Kategori utama -> kategori indikator yang sepadan. Kategori
 *  yang tidak ada di sini (teknologi, sains, fakta-mitos,
 *  pengetahuan, data-statistik) TIDAK punya indikator yang cocok
 *  — seksi indikator disembunyikan, bukan dipaksa. */
const PETA_KATEGORI_KE_INDIKATOR: Record<string, string[]> = {
  indonesia: ["nasional"],
  dunia: ["global"],
  ekonomi: ["ekonomi"],
  pendidikan: ["pendidikan"],
  "lingkungan-energi": ["energi", "lingkungan"],
};

/**
 * Kategori indikator yang cocok untuk sebuah topik. Urutan:
 * slug persis kategori indikator -> peta kategori utama ->
 * peta kategori induk (subkategori mewarisi cakupan induknya).
 * [] = tidak ada yang cocok (seksi disembunyikan).
 */
export function kategoriIndikatorUntukTopik(
  slug: string,
  indukSlug: string | null,
): string[] {
  if (KATEGORI_INDIKATOR.has(slug)) return [slug];
  if (PETA_KATEGORI_KE_INDIKATOR[slug]) {
    return PETA_KATEGORI_KE_INDIKATOR[slug];
  }
  if (indukSlug && PETA_KATEGORI_KE_INDIKATOR[indukSlug]) {
    return PETA_KATEGORI_KE_INDIKATOR[indukSlug];
  }
  return [];
}

/* ============================================================
   Util internal
   ============================================================ */

function urutkanArtikelTerbaru(artikel: ArtikelKonteks[]): ArtikelKonteks[] {
  return [...artikel].sort((a, b) => {
    const ta = a.diterbitkan_pada ? Date.parse(a.diterbitkan_pada) : NaN;
    const tb = b.diterbitkan_pada ? Date.parse(b.diterbitkan_pada) : NaN;
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });
}

function keArtikelKonteks(r: Record<string, unknown>): ArtikelKonteks {
  return {
    id: String(r.id),
    slug: String(r.slug ?? ""),
    judul: String(r.judul ?? ""),
    ringkasan: (r.ringkasan as string | null) ?? null,
    kategori_slug: (r.kategori_slug as string | null) ?? null,
    status_verifikasi: String(r.status_verifikasi ?? "UNCONFIRMED"),
    diterbitkan_pada: (r.diterbitkan_pada as string | null) ?? null,
    negara_kode: (r.negara_kode as string | null) ?? null,
  };
}

/* ============================================================
   Baca publik
   ============================================================ */

/**
 * Rakit konteks satu topik. null bila topik tidak ada di pf_tags
 * maupun KATEGORI_UTAMA (pemanggil: notFound()). Topik yang ADA
 * tapi belum punya satu pun artikel tetap mengembalikan hasil
 * (semua seksi kosong — pemanggil menampilkan satu EmptyState).
 */
export async function getKonteksTopik(
  topikMentah: string,
): Promise<KonteksTopik | null> {
  const slug = topikMentah.trim().toLowerCase();
  if (!slug) return null;

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getKonteksTopik", err)) return null;
    throw new GalatBaca("getKonteksTopik", err);
  }

  // ——— Langkah 1: resolusi — pf_tags dulu ———
  let tag: { id: string; slug: string; nama: string } | null = null;
  try {
    const { data, error } = await supabase
      .from("pf_tags")
      .select("id, slug, nama")
      .eq("slug", slug)
      .maybeSingle();
    if (error) {
      if (catatGalatBaca("getKonteksTopik.tag", error)) {
        tag = null;
      } else {
        throw new GalatBaca("getKonteksTopik.tag", error);
      }
    } else if (data) {
      const row = data as unknown as Record<string, unknown>;
      tag = {
        id: String(row.id),
        slug: String(row.slug ?? ""),
        nama: String(row.nama ?? ""),
      };
    }
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getKonteksTopik.tag", err)) tag = null;
    else throw new GalatBaca("getKonteksTopik.tag", err);
  }

  // ——— Langkah 2: bila bukan tag, cek KATEGORI_UTAMA ———
  let info: InfoTopikKonteks | null = null;
  let artikel: ArtikelKonteks[] = [];
  if (tag) {
    info = { slug: tag.slug, nama: tag.nama, jenis: "tag", deskripsi: null, induk: null };
    artikel = await artikelUntukTag(supabase, tag.id);
  } else {
    const kategoriUtama = KATEGORI_UTAMA.find((k) => k.slug === slug);
    if (kategoriUtama) {
      info = {
        slug: kategoriUtama.slug,
        nama: kategoriUtama.nama,
        jenis: "kategori",
        deskripsi: kategoriUtama.deskripsi,
        induk: null,
      };
      artikel = await artikelUntukKategori(supabase, slug);
    } else {
      for (const k of KATEGORI_UTAMA) {
        const sub = k.sub.find((s) => s.slug === slug);
        if (sub) {
          info = {
            slug: sub.slug,
            nama: sub.nama,
            jenis: "subkategori",
            deskripsi: null,
            induk: { slug: k.slug, nama: k.nama },
          };
          artikel = await artikelUntukKategori(supabase, slug);
          break;
        }
      }
    }
  }
  if (!info) return null;

  const artikelTerurut = urutkanArtikelTerbaru(artikel);
  const artikelId = artikelTerurut.map((a) => a.id);

  // ——— Langkah 3: turunan dari artikel topik (tiap-tiap
  // gagal-aman: satu turunan gagal tidak menggagalkan yang lain) ———
  const [cerita, events, negara, indikator] = await Promise.all([
    ceritaUntukArtikel(supabase, artikelId),
    eventUntukArtikel(supabase, artikelId),
    negaraUntukArtikel(artikelTerurut),
    indikatorUntukTopik(info),
  ]);

  return {
    topik: info,
    cerita,
    events,
    negara,
    artikel: artikelTerurut.slice(0, 5).map((a) => ({
      id: a.id,
      slug: a.slug,
      judul: a.judul,
      ringkasan: a.ringkasan,
      kategori_slug: a.kategori_slug,
      status_verifikasi: a.status_verifikasi,
      diterbitkan_pada: a.diterbitkan_pada,
    })),
    indikator,
  };
}

/** Artikel terbit bertag ini (asal: pf_article_tags + join
 *  pf_articles status='terbit'). Maks 50 — cukup untuk turunan
 *  cerita/event/negara; tampilan memakai 5 teratas. */
async function artikelUntukTag(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tagId: string,
): Promise<ArtikelKonteks[]> {
  try {
    const { data, error } = await supabase
      .from("pf_article_tags")
      .select(`artikel_id, pf_articles!inner(${KOLOM_ARTIKEL_KONTEKS}, status)`)
      .eq("tag_id", tagId)
      .eq("pf_articles.status", "terbit")
      .limit(50);
    if (error) {
      if (catatGalatBaca("getKonteksTopik.artikelTag", error)) return [];
      throw new GalatBaca("getKonteksTopik.artikelTag", error);
    }
    if (!data) return [];
    const hasil: ArtikelKonteks[] = [];
    for (const r of data as unknown as Record<string, unknown>[]) {
      const a = r.pf_articles as Record<string, unknown> | null;
      if (!a) continue;
      hasil.push(keArtikelKonteks(a));
    }
    return hasil;
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getKonteksTopik.artikelTag", err)) return [];
    throw new GalatBaca("getKonteksTopik.artikelTag", err);
  }
}

/** Artikel terbit berkategori ini (asal: pf_articles.
 *  kategori_slug + status='terbit'). Maks 50. */
async function artikelUntukKategori(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slugKategori: string,
): Promise<ArtikelKonteks[]> {
  try {
    const { data, error } = await supabase
      .from("pf_articles")
      .select(KOLOM_ARTIKEL_KONTEKS)
      .eq("status", "terbit")
      .eq("kategori_slug", slugKategori)
      .order("diterbitkan_pada", { ascending: false })
      .limit(50);
    if (error) {
      if (catatGalatBaca("getKonteksTopik.artikelKategori", error)) return [];
      throw new GalatBaca("getKonteksTopik.artikelKategori", error);
    }
    if (!data) return [];
    return (data as unknown as Record<string, unknown>[]).map(
      keArtikelKonteks,
    );
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getKonteksTopik.artikelKategori", err)) return [];
    throw new GalatBaca("getKonteksTopik.artikelKategori", err);
  }
}

/** Cerita TERBIT yang memuat sedikitnya satu artikel topik
 *  (asal: pf_story_articles -> pf_stories status='terbit').
 *  [] bila tidak ada artikel topik / tabel belum ada. */
async function ceritaUntukArtikel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  artikelId: string[],
): Promise<KonteksCerita[]> {
  if (artikelId.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from("pf_story_articles")
      .select(
        "pf_stories!inner(slug, judul, ringkasan, status, status_perkembangan)",
      )
      .in("artikel_id", artikelId)
      .eq("pf_stories.status", "terbit")
      .limit(100);
    if (error) {
      if (catatGalatBaca("getKonteksTopik.cerita", error)) return [];
      throw new GalatBaca("getKonteksTopik.cerita", error);
    }
    if (!data) return [];
    const perSlug = new Map<string, KonteksCerita>();
    for (const r of data as unknown as Record<string, unknown>[]) {
      const s = r.pf_stories as Record<string, unknown> | null;
      if (!s || typeof s.slug !== "string" || !s.slug) continue;
      if (!perSlug.has(s.slug)) {
        perSlug.set(s.slug, {
          slug: s.slug,
          judul: typeof s.judul === "string" ? s.judul : s.slug,
          ringkasan: (s.ringkasan as string | null) ?? null,
          status_perkembangan:
            typeof s.status_perkembangan === "string"
              ? s.status_perkembangan
              : "",
        });
      }
    }
    return [...perSlug.values()]
      .sort((a, b) => a.judul.localeCompare(b.judul, "id"))
      .slice(0, 10);
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getKonteksTopik.cerita", err)) return [];
    throw new GalatBaca("getKonteksTopik.cerita", err);
  }
}

/** Peristiwa yang artikel sumbernya salah satu artikel topik
 *  (asal: pf_events.artikel_id, kolom v17). Terbaru dulu, maks 10. */
async function eventUntukArtikel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  artikelId: string[],
): Promise<KonteksEvent[]> {
  if (artikelId.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from("pf_events")
      .select(
        "id, judul, ringkasan, lokasi_teks, dimulai_pada, berakhir_pada, sumber_url, artikel_id",
      )
      .in("artikel_id", artikelId)
      .order("dimulai_pada", { ascending: false })
      .limit(10);
    if (error) {
      if (catatGalatBaca("getKonteksTopik.event", error)) return [];
      throw new GalatBaca("getKonteksTopik.event", error);
    }
    if (!data) return [];
    return (data as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      judul: String(r.judul ?? ""),
      ringkasan: (r.ringkasan as string | null) ?? null,
      lokasi_teks: (r.lokasi_teks as string | null) ?? null,
      dimulai_pada: (r.dimulai_pada as string | null) ?? null,
      sumber_url: (r.sumber_url as string | null) ?? null,
    }));
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getKonteksTopik.event", err)) return [];
    throw new GalatBaca("getKonteksTopik.event", err);
  }
}

/** Negara yang beritanya bertag/berkategori topik (asal:
 *  pf_articles.negara_kode dari artikel topik, dipetakan ke
 *  pf_countries via getDaftarNegara). [] bila tidak ada. */
async function negaraUntukArtikel(
  artikel: ArtikelKonteks[],
): Promise<KonteksNegara[]> {
  const kode = [
    ...new Set(
      artikel
        .map((a) => a.negara_kode)
        .filter((k): k is string => Boolean(k)),
    ),
  ];
  if (kode.length === 0) return [];
  const daftar = await getDaftarNegara();
  const punya = new Set(kode);
  return daftar
    .filter((n) => punya.has(n.kode))
    .map((n) => ({ kode: n.kode, nama: n.nama }));
}

/** Indikator yang kategorinya cocok dengan topik (asal:
 *  pf_data_indicators.kategori via getIndikator). [] bila tidak
 *  ada kategori yang cocok — seksi disembunyikan pemanggil. */
async function indikatorUntukTopik(
  info: InfoTopikKonteks,
): Promise<PfIndikator[]> {
  const kategori = kategoriIndikatorUntukTopik(
    info.slug,
    info.induk?.slug ?? null,
  );
  if (kategori.length === 0) return [];
  const perId = new Map<string, PfIndikator>();
  for (const kat of kategori) {
    const daftar = await getIndikator(kat);
    for (const ind of daftar) {
      if (!perId.has(ind.id)) perId.set(ind.id, ind);
    }
  }
  return [...perId.values()]
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"))
    .slice(0, 5);
}
