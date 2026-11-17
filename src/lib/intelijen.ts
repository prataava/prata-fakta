// World Intelligence (P2-3) — rakitan, BUKAN sumber data baru.
// Halaman /intelijen MERAKIT getter yang sudah ada:
//   - Brief: getBriefTerbit (src/lib/data.ts) + susunBrief /
//     entriBriefDariDraf (src/lib/ai/brief.ts) — seksi "dunia".
//   - Negara: getDaftarNegara / getNegaraDenganBerita / getNegara
//     (src/lib/negara.ts) — profil + fakta bersumber.
//   - Timeline & peta: getSemuaEvent / getEventDenganKoordinat /
//     getArtikelDenganKoordinat (src/lib/lanjutan.ts).
//   - Kategori: KATEGORI_UTAMA (src/lib/categories.ts).
//
// DUA kueri kecil baru di berkas ini (bukan duplikasi getter):
// tidak ada getter ringkas yang mengembalikan kolom
// negara_kode + subkategori_slug artikel sekaligus —
// getArtikelPerKategori hanya mengembalikan KOLOM_ARTIKEL_RINGKAS
// (tanpa kedua kolom itu) dan getArtikelLengkap bekerja per slug.
//   (1) artikel terbit terbaru + negara_kode + subkategori_slug
//       (bahan Sorotan Negara + saring domain);
//   (2) peta id -> {kategori_slug, subkategori_slug} untuk
//       artikel yang ditautkan peristiwa (bahan saring timeline
//       — peristiwa sendiri TIDAK punya kategori; kategorinya
//       diturunkan dari artikel tautannya, pf_events.artikel_id
//       v17; peristiwa tanpa artikel tautan TIDAK dapat
//       diklasifikasikan ke domain dan jujur dilaporkan jumlahnya).
//
// Aturan angka: satu-satunya angka negara yang tampil di hub ini
// adalah populasi dari getNegara, dan HANYA bila angkaTersedia
// (baris pf_countries punya sumber) — beserta sumber + periode
// referensinya. Fakta yang tampil HANYA faktaBernilai
// (pf_country_facts yang bersumber). Tanpa sumber = tidak tampil.
import { createClient } from "@/lib/supabase/server";
import { GalatBaca, catatGalatBaca } from "@/lib/galat";
import { getBriefTerbit, type BriefTerbit } from "@/lib/data";
import {
  getSemuaEvent,
  getEventDenganKoordinat,
  getArtikelDenganKoordinat,
  type PfEvent,
} from "@/lib/lanjutan";
import {
  getNegara,
  getNegaraDenganBerita,
  type PfFaktaNegara,
  type PfNegara,
} from "@/lib/negara";
import type { EntriBrief } from "@/lib/ai/brief";
import type { MarkerPeta } from "@/components/peta/PetaDunia";

/* ============================================================
   Domain — filter ?domain= di /intelijen.
   Domain HANYA memetakan ke kategori/subkategori yang SUDAH ADA
   di KATEGORI_UTAMA (src/lib/categories.ts); tidak ada domain
   baru. Artikel dicocokkan lewat kategori_slug ATAU
   subkategori_slug (keduanya kolom nyata pf_articles).
   "politik" tidak punya kategori utama sendiri — ia hidup
   sebagai subkategori di bawah "indonesia" (politik,
   pemerintahan) dan "dunia" (geopolitik, diplomasi,
   konflik-internasional); jadi daftar kategorinya kosong dan
   penyaringannya murni lewat subkategori. Artikel tanpa
   subkategori TIDAK dapat diklaim sebagai artikel politik —
   ia tidak masuk filter politik (jujur, bukan tebakan).
   ============================================================ */

export type KunciDomain =
  | "ekonomi"
  | "teknologi"
  | "sains"
  | "lingkungan"
  | "politik"
  | "indonesia"
  | "dunia";

export type DomainIntelijen = {
  kunci: KunciDomain;
  nama: string;
  deskripsi: string;
  /** Slug kategori utama (pf_articles.kategori_slug). */
  kategori: string[];
  /** Slug subkategori (pf_articles.subkategori_slug). */
  subkategori: string[];
};

export const DOMAIN_INTELIJEN: DomainIntelijen[] = [
  {
    kunci: "ekonomi",
    nama: "Ekonomi",
    deskripsi: "Inflasi, nilai tukar, perdagangan, dan pasar.",
    kategori: ["ekonomi"],
    subkategori: [
      "ekonomi",
      "ekonomi-global",
      "inflasi",
      "nilai-tukar",
      "suku-bunga",
      "komoditas",
      "perdagangan",
      "investasi",
      "pasar-saham",
    ],
  },
  {
    kunci: "teknologi",
    nama: "Teknologi",
    deskripsi: "AI, software, hardware, dan keamanan siber.",
    kategori: ["teknologi"],
    subkategori: [
      "teknologi",
      "teknologi-global",
      "kecerdasan-buatan",
      "software",
      "hardware",
      "keamanan-siber",
      "startup",
      "inovasi",
    ],
  },
  {
    kunci: "sains",
    nama: "Sains",
    deskripsi: "Penelitian, kesehatan, dan antariksa.",
    kategori: ["sains"],
    subkategori: [
      "sains",
      "penelitian-ilmiah",
      "kesehatan",
      "biologi",
      "fisika",
      "kimia",
      "astronomi",
      "antariksa",
    ],
  },
  {
    kunci: "lingkungan",
    nama: "Lingkungan",
    deskripsi: "Iklim, hutan, dan energi.",
    kategori: ["lingkungan-energi"],
    subkategori: [
      "lingkungan",
      "perubahan-iklim",
      "bencana-alam",
      "hutan",
      "pertambangan",
      "energi-terbarukan",
      "energi-fosil",
      "konservasi",
    ],
  },
  {
    kunci: "politik",
    nama: "Politik",
    deskripsi: "Politik, pemerintahan, geopolitik, dan diplomasi.",
    kategori: [],
    subkategori: [
      "politik",
      "pemerintahan",
      "geopolitik",
      "diplomasi",
      "konflik-internasional",
    ],
  },
  {
    kunci: "indonesia",
    nama: "Indonesia",
    deskripsi: "Berita dari Indonesia.",
    kategori: ["indonesia"],
    subkategori: [
      "pemerintahan",
      "politik",
      "hukum",
      "ekonomi",
      "pendidikan",
      "sosial",
      "infrastruktur",
      "daerah",
      "bencana",
      "lingkungan",
    ],
  },
  {
    kunci: "dunia",
    nama: "Dunia",
    deskripsi: "Perkembangan internasional.",
    kategori: ["dunia"],
    subkategori: [
      "geopolitik",
      "diplomasi",
      "konflik-internasional",
      "ekonomi-global",
      "teknologi-global",
      "organisasi-internasional",
      "negara-dan-kawasan",
      "peristiwa-internasional",
    ],
  },
];

export function cariDomain(kunci: string): DomainIntelijen | undefined {
  return DOMAIN_INTELIJEN.find((d) => d.kunci === kunci);
}

/** Urai ?domain= mentah: kunci dikenal, kunci tak dikenal
 *  (tampilkan semua + pesan jujur di halaman), atau kosong. */
export function uraiDomain(
  mentah: string | string[] | undefined,
): { domain: DomainIntelijen | null; dikenal: boolean; mentah: string | null } {
  if (typeof mentah !== "string" || mentah.trim() === "") {
    return { domain: null, dikenal: true, mentah: null };
  }
  const kunci = mentah.trim().toLowerCase();
  const domain = cariDomain(kunci);
  if (!domain) {
    return { domain: null, dikenal: false, mentah: kunci };
  }
  return { domain, dikenal: true, mentah: kunci };
}

/** Fungsi murni: cocokkan satu artikel ke domain lewat
 *  kategori_slug ATAU subkategori_slug. */
export function cocokDomain(
  kategoriSlug: string | null,
  subkategoriSlug: string | null,
  domain: DomainIntelijen,
): boolean {
  if (kategoriSlug && domain.kategori.includes(kategoriSlug)) return true;
  if (subkategoriSlug && domain.subkategori.includes(subkategoriSlug)) {
    return true;
  }
  return false;
}

/* ============================================================
   Tipe rakitan
   ============================================================ */

export type PfArtikelIntelijen = {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  kategori_slug: string | null;
  subkategori_slug: string | null;
  negara_kode: string | null;
  status_verifikasi: string;
  diterbitkan_pada: string | null;
};

export type SorotanNegara = {
  negara: PfNegara;
  /** true bila baris negara punya sumber — baru bila ini true
   *  populasi boleh tampil (aturan angka-bersumber negara.ts). */
  angkaTersedia: boolean;
  /** Berita terbit terbaru negara ini (yang lolos filter domain). */
  artikel: PfArtikelIntelijen;
  /** Satu fakta bersumber pertama (urut kunci) — null bila
   *  negara ini tidak punya fakta bernilai. */
  faktaUtama: PfFaktaNegara | null;
};

export type SorotanIntelijen = {
  domain: DomainIntelijen | null;
  /** false bila ?domain= berisi kunci tak dikenal. */
  domainDikenal: boolean;
  /** Kunci ?domain= mentah (untuk pesan jujur), bila ada. */
  domainMentah: string | null;
  /** Brief terbit terbaru (null bila belum ada) — pemanggil
   *  menampilkan EmptyState. */
  brief: BriefTerbit | null;
  /** Entri brief seksi "dunia" (maks 4, terbaru dulu). */
  entriDunia: EntriBrief[];
  /** Marker peta dunia (ringkas, maks 50+50 — sama seperti
   *  /peta; filter domain TIDAK diterapkan ke peta: peta adalah
   *  gambaran dunia, bukan hasil saringan). */
  marker: MarkerPeta[];
  /** Hitungan marker per sumber (angka nyata dari getter). */
  jumlahMarkerPeristiwa: number;
  jumlahMarkerArtikel: number;
  /** Sorotan negara (maks 5). */
  sorotan: SorotanNegara[];
  /** Peristiwa terbaru (maks 5, sudah disaring domain bila ada). */
  timeline: PfEvent[];
  /** Peristiwa yang TIDAK dapat diklasifikasikan ke domain
   *  saat filter aktif (tanpa artikel tautan / artikelnya tak
   *  ditemukan) — dilaporkan jujur, bukan disembunyikan diam-diam. */
  peristiwaTakTerklasifikasi: number;
};

const BATAS_SOROTAN = 5;
const BATAS_TIMELINE = 5;
const BATAS_ENTRI_DUNIA = 4;
const BATAS_MARKER = 50;
const BATAS_ARTIKEL_INTELIJEN = 60;

const KOLOM_ARTIKEL_INTELIJEN =
  "id, slug, judul, ringkasan, kategori_slug, subkategori_slug, negara_kode, status_verifikasi, diterbitkan_pada";

function barisArtikelIntelijen(
  r: Record<string, unknown>,
): PfArtikelIntelijen {
  return {
    id: String(r.id),
    slug: String(r.slug ?? ""),
    judul: String(r.judul ?? ""),
    ringkasan: (r.ringkasan as string | null) ?? null,
    kategori_slug: (r.kategori_slug as string | null) ?? null,
    subkategori_slug: (r.subkategori_slug as string | null) ?? null,
    negara_kode: (r.negara_kode as string | null) ?? null,
    status_verifikasi: String(r.status_verifikasi ?? "UNCONFIRMED"),
    diterbitkan_pada: (r.diterbitkan_pada as string | null) ?? null,
  };
}

/**
 * Artikel terbit terbaru + negara_kode + subkategori_slug.
 * Kueri baru yang MINIMAL (lihat komentar kepala berkas):
 * tidak ada getter ringkas yang mengembalikan kedua kolom itu.
 * [] bila tabel belum ada / query gagal.
 */
export async function getArtikelIntelijenTerbaru(
  limit = BATAS_ARTIKEL_INTELIJEN,
): Promise<PfArtikelIntelijen[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_articles")
      .select(KOLOM_ARTIKEL_INTELIJEN)
      .eq("status", "terbit")
      .order("diterbitkan_pada", { ascending: false })
      .limit(limit);
    if (error) {
      if (catatGalatBaca("getArtikelIntelijenTerbaru", error)) return [];
      throw new GalatBaca("getArtikelIntelijenTerbaru", error);
    }
    if (!data) return [];
    return (data as unknown as Record<string, unknown>[]).map(
      barisArtikelIntelijen,
    );
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getArtikelIntelijenTerbaru", err)) return [];
    throw new GalatBaca("getArtikelIntelijenTerbaru", err);
  }
}

/**
 * Peta id artikel -> kategori/subkategori untuk artikel yang
 * ditautkan peristiwa. SATU kueri .in() (bukan N+1) — hanya
 * dipanggil saat filter domain aktif. {} bila tak ada id / gagal.
 */
export async function getKategoriArtikelTautan(
  ids: string[],
): Promise<
  Record<string, { kategori_slug: string | null; subkategori_slug: string | null }>
> {
  const unik = [...new Set(ids.filter(Boolean))];
  if (unik.length === 0) return {};
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_articles")
      .select("id, kategori_slug, subkategori_slug")
      .in("id", unik);
    if (error) {
      if (catatGalatBaca("getKategoriArtikelTautan", error)) return {};
      throw new GalatBaca("getKategoriArtikelTautan", error);
    }
    const peta: Record<
      string,
      { kategori_slug: string | null; subkategori_slug: string | null }
    > = {};
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
      peta[String(r.id)] = {
        kategori_slug: (r.kategori_slug as string | null) ?? null,
        subkategori_slug: (r.subkategori_slug as string | null) ?? null,
      };
    }
    return peta;
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getKategoriArtikelTautan", err)) return {};
    throw new GalatBaca("getKategoriArtikelTautan", err);
  }
}

/**
 * Rakit sorotan intelijen: brief dunia + peta + sorotan negara
 * + timeline — semuanya dari getter yang sudah ada (lihat kepala
 * berkas). `domainMentah` = nilai ?domain= apa adanya; kunci tak
 * dikenal -> domain null + domainDikenal false (halaman
 * menampilkan semua + pesan jujur).
 */
export async function getSorotanIntelijen(
  domainMentah?: string | string[],
): Promise<SorotanIntelijen> {
  const { domain, dikenal, mentah } = uraiDomain(domainMentah);

  const [
    brief,
    semuaEvent,
    eventBerkoordinat,
    artikelBerkoordinat,
    denganBerita,
    artikelTerbaru,
  ] = await Promise.all([
    getBriefTerbit(),
    getSemuaEvent(),
    getEventDenganKoordinat(BATAS_MARKER),
    getArtikelDenganKoordinat(BATAS_MARKER),
    getNegaraDenganBerita(),
    getArtikelIntelijenTerbaru(),
  ]);

  const entriDunia = ((brief?.isi.seksi.dunia ?? []) as EntriBrief[]).slice(
    0,
    BATAS_ENTRI_DUNIA,
  );

  // Peta dunia ringkas — pemetaan marker SAMA seperti /peta
  // (judul/tanggal/lokasi/tautan/label), dibatasi 50+50.
  const marker: MarkerPeta[] = [
    ...eventBerkoordinat.map((e) => ({
      lintang: e.lintang as number,
      bujur: e.bujur as number,
      judul: e.judul,
      tanggal: e.dimulai_pada,
      lokasi: e.lokasi_teks,
      tautan: e.sumber_url ?? "/timeline",
      labelTautan: e.sumber_url ? "Sumber" : "Lihat di Timeline",
    })),
    ...artikelBerkoordinat.map((a) => ({
      lintang: a.lintang,
      bujur: a.bujur,
      judul: a.judul,
      tanggal: a.diterbitkan_pada,
      lokasi: a.kategori_slug,
      tautan: `/artikel/${a.slug}`,
      labelTautan: "Baca artikel",
    })),
  ];

  // Sorotan negara: artikel terbit terbaru per negara_kode
  // (urut terbit menurun), disaring domain bila ada, lalu
  // dibatasi 5 negara. Hanya negara yang memang punya berita
  // terbit (getNegaraDenganBerita) yang masuk.
  const kodeDenganBerita = new Set(denganBerita.map((n) => n.kode));
  const terbaruPerNegara = new Map<string, PfArtikelIntelijen>();
  for (const a of artikelTerbaru) {
    if (!a.negara_kode || !kodeDenganBerita.has(a.negara_kode)) continue;
    if (domain && !cocokDomain(a.kategori_slug, a.subkategori_slug, domain)) {
      continue;
    }
    if (!terbaruPerNegara.has(a.negara_kode)) {
      terbaruPerNegara.set(a.negara_kode, a);
    }
  }
  const kodeSorotan = [...terbaruPerNegara.keys()].slice(0, BATAS_SOROTAN);
  // Profil + fakta per negara sorotan — pakai ulang getNegara
  // (satu-satunya sumber pf_country_facts). Galat per negara
  // tidak menggagalkan sorotan lain: negara itu dilewati.
  const profilSorotan = await Promise.all(
    kodeSorotan.map(async (kode) => {
      try {
        return await getNegara(kode);
      } catch {
        return null;
      }
    }),
  );
  const sorotan: SorotanNegara[] = [];
  for (let i = 0; i < kodeSorotan.length; i++) {
    const profil = profilSorotan[i];
    const artikel = terbaruPerNegara.get(kodeSorotan[i] as string);
    if (!profil || !artikel) continue;
    sorotan.push({
      negara: profil.negara,
      angkaTersedia: profil.angkaTersedia,
      artikel,
      faktaUtama: profil.faktaBernilai[0] ?? null,
    });
  }

  // Timeline dunia ringkas: 5 peristiwa terbaru. Bila domain
  // aktif, kategorinya diturunkan dari artikel tautan
  // (pf_events.artikel_id); peristiwa tanpa tautan yang dapat
  // diklasifikasikan dihitung jujur di
  // peristiwaTakTerklasifikasi, bukan ditebak kategorinya.
  let timeline = semuaEvent.events;
  let peristiwaTakTerklasifikasi = 0;
  if (domain) {
    const tautan = await getKategoriArtikelTautan(
      timeline.map((e) => e.artikel_id).filter((id): id is string => !!id),
    );
    const lolos: PfEvent[] = [];
    for (const e of timeline) {
      const kat = e.artikel_id ? tautan[e.artikel_id] : undefined;
      if (!kat) {
        peristiwaTakTerklasifikasi += 1;
        continue;
      }
      if (cocokDomain(kat.kategori_slug, kat.subkategori_slug, domain)) {
        lolos.push(e);
      }
    }
    timeline = lolos;
  }
  timeline = timeline.slice(0, BATAS_TIMELINE);

  return {
    domain,
    domainDikenal: dikenal,
    domainMentah: mentah,
    brief,
    entriDunia,
    marker,
    jumlahMarkerPeristiwa: eventBerkoordinat.length,
    jumlahMarkerArtikel: artikelBerkoordinat.length,
    sorotan,
    timeline,
    peristiwaTakTerklasifikasi,
  };
}
