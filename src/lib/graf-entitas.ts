// Getter halaman entitas Knowledge Graph v2 (P2-1) —
// src/lib/graf-entitas.ts (BARU).
//
// Halaman /graf/[jenis]/[id] untuk jenis entitas yang BELUM punya
// halaman graf sendiri: sumber / negara / cerita / kategori.
// Klaim + artikel + event SENGAJA tidak ada di sini — ketiganya
// sudah punya halaman sendiri (/klaim/[id], /artikel/[slug],
// /timeline); graf hanya menautkan ke sana.
//
// Asal tiap relasi (tidak ada relasi karangan):
//   sumber↔klaim   : pf_evidence (sumber_url + arah bukti)
//   sumber↔artikel : pf_article_sources (sumber_id)
//   negara↔artikel : pf_articles.negara_kode (FK v10, kolom
//                    langsung — BUKAN lewat tag; lihat
//                    getNegaraDenganBerita di lib/negara.ts)
//   negara↔event   : pf_events.negara_kode
//   negara↔cerita  : pf_story_events -> pf_events.negara_kode
//                    (diturunkan getNegara — lihat lib/negara.ts)
//   cerita↔artikel : pf_story_articles
//   cerita↔event   : pf_story_events
//   kategori↔artikel: pf_articles.kategori_slug
//
// Aturan bocor-draf: hanya artikel TERBIT, cerita TERBIT, dan
// klaim dari artikel terbit yang jadi tetangga (getCerita sudah
// menyaring status='terbit'; artikel disaring di sini).
import { createClient } from "@/lib/supabase/server";
import { GalatBaca, catatGalatBaca } from "@/lib/galat";
import { KATEGORI_UTAMA, cariKategori } from "@/lib/categories";
import { getCerita } from "@/lib/cerita";
import { getArtikelPerKategori, getSumber } from "@/lib/data";
import { getNegara, kodeValid, normalisasiKode } from "@/lib/negara";
import {
  LABEL_ARAH_SISI,
  arahBuktiValid,
  type ArahBukti,
  type GrafPengetahuan,
  type SimpulGraf,
  type SisiGraf,
} from "@/lib/graf";
import {
  skorKredibilitas,
  tierDariPrioritas,
} from "@/lib/ai/source-analysis";

export type JenisEntitasGraf = "sumber" | "negara" | "cerita" | "kategori";

export const JENIS_ENTITAS_GRAF: readonly JenisEntitasGraf[] = [
  "sumber",
  "negara",
  "cerita",
  "kategori",
];

export const LABEL_JENIS_ENTITAS: Record<JenisEntitasGraf, string> = {
  sumber: "Sumber",
  negara: "Negara",
  cerita: "Cerita",
  kategori: "Kategori",
};

export type TetanggaEntitas = {
  simpul: SimpulGraf;
  /** Label relasi dari data (mis. "mendukung klaim"). */
  relasi: string;
  /** Arah bukti — hanya diisi pada tetangga klaim dari sumber. */
  arah?: ArahBukti | null;
  /** Keterangan tambahan jujur (mis. peran artikel di cerita). */
  detail?: string | null;
};

export type EntitasGraf = {
  jenis: JenisEntitasGraf;
  /** Kunci yang dipakai di URL /graf/[jenis]/[id]. */
  kunci: string;
  label: string;
  sublabel: string | null;
  deskripsi: string | null;
  /** Halaman asal di situs (mis. /negara/ID, /sumber, /cerita/[slug]). */
  hrefAsal: string;
  /** Tautan luar bila entitasnya situs eksternal (sumber saja). */
  tautanLuar: string | null;
  tetangga: TetanggaEntitas[];
  /** Mini-graf: simpul pusat + tetangga, untuk GrafPengetahuan. */
  graf: GrafPengetahuan;
  /** false bila tabel belum ada (pemanggil menampilkan EmptyState). */
  tersedia: boolean;
};

/** Batas tetangga per kelompok agar mini-graf tetap terbaca. */
const BATAS_TETANGGA_PER_KELOMPOK = 20;

const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalisasiUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function namaHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function hostDariUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function potongLabel(teks: string, maks = 80): string {
  const bersih = teks.replace(/\s+/g, " ").trim();
  return bersih.length > maks ? `${bersih.slice(0, maks - 1)}…` : bersih;
}

function simpulArtikel(a: {
  id: string;
  slug: string;
  judul: string;
}): SimpulGraf {
  return {
    id: `artikel:${a.id}`,
    jenis: "artikel",
    label: potongLabel(a.judul || "Artikel tanpa judul"),
    sublabel: null,
    href: `/artikel/${a.slug}`,
  };
}

/** Mini-graf bintang: simpul pusat + tiap tetangga, satu sisi per tetangga. */
function rakitMiniGraf(
  pusat: SimpulGraf,
  tetangga: TetanggaEntitas[],
): GrafPengetahuan {
  const simpul: SimpulGraf[] = [pusat, ...tetangga.map((t) => t.simpul)];
  const sisi: SisiGraf[] = tetangga.map((t) =>
    t.arah
      ? { dari: pusat.id, ke: t.simpul.id, label: t.relasi, arah: t.arah }
      : { dari: pusat.id, ke: t.simpul.id, label: t.relasi },
  );
  return { simpul, sisi, terpotong: false, batas: simpul.length, tersedia: true };
}

/** Entitas sumber: dicari dulu sebagai baris pf_sources (UUID atau
 *  URL persis), lalu sebagai URL bukti di pf_evidence. Bila tidak
 *  ada di keduanya → null (404 jujur). */
async function entitasSumber(kunci: string): Promise<EntitasGraf | null> {
  const supabase = await createClient();
  const kunciUrl = normalisasiUrl(kunci);

  // 1) Baris pf_sources — lewat UUID, atau lewat URL persis.
  let barisSumber: {
    id: string;
    nama: string;
    jenis: string;
    url: string;
    prioritas: number;
  } | null = null;
  if (POLA_UUID.test(kunci)) {
    const { data, error } = await supabase
      .from("pf_sources")
      .select("id, nama, jenis, url, prioritas")
      .eq("id", kunci)
      .maybeSingle();
    if (error) {
      if (catatGalatBaca("getEntitasGraf.sumber", error)) return null;
      throw new GalatBaca("getEntitasGraf.sumber", error);
    }
    if (data) {
      barisSumber = data as unknown as typeof barisSumber;
    }
  }
  if (!barisSumber) {
    const daftar = await getSumber();
    const cocok = daftar.find(
      (s) => normalisasiUrl(s.url).toLowerCase() === kunciUrl.toLowerCase(),
    );
    if (cocok) {
      barisSumber = {
        id: cocok.id,
        nama: cocok.nama,
        jenis: cocok.jenis,
        url: cocok.url,
        prioritas: cocok.prioritas,
      };
    }
  }

  // 2) Bukti yang memakai sumber ini. Bila baris pf_sources ada,
  //    cocokkan per HOST (URL bukti adalah URL artikel di domain
  //    sumber itu, bukan URL beranda sumber); bila tidak ada
  //    barisnya, hanya URL persis yang dihitung.
  const { data: buktiData, error: errBukti } = await supabase
    .from("pf_evidence")
    .select("klaim_id, sumber_url, sumber_nama, arah")
    .limit(2000);
  if (errBukti) {
    if (catatGalatBaca("getEntitasGraf.sumber.bukti", errBukti)) {
      return null;
    }
    throw new GalatBaca("getEntitasGraf.sumber.bukti", errBukti);
  }
  const hostSumber = barisSumber ? hostDariUrl(barisSumber.url) : "";
  const bukti = ((buktiData ?? []) as unknown as Record<string, unknown>[]).filter(
    (b) => {
      const url = normalisasiUrl(String(b.sumber_url ?? ""));
      if (!url) return false;
      if (barisSumber) {
        return (
          url.toLowerCase() === normalisasiUrl(barisSumber.url).toLowerCase() ||
          (hostSumber !== "" && hostDariUrl(url) === hostSumber)
        );
      }
      return url.toLowerCase() === kunciUrl.toLowerCase();
    },
  );

  // Sumber tidak dikenal sama sekali → 404.
  if (!barisSumber && bukti.length === 0) return null;

  const nama = barisSumber
    ? barisSumber.nama
    : String(bukti[0]?.sumber_nama ?? "") || namaHost(kunciUrl);
  const urlSumber = barisSumber ? barisSumber.url : kunciUrl;
  const tier = barisSumber ? tierDariPrioritas(barisSumber.prioritas) : null;
  // Kunci entitas: URL ternormalisasi — sama dengan id simpul di
  // graf utama (`sumber:<url>`) agar tautan dari /graf dan dari
  // /sumber bertemu di halaman yang sama.
  const kunciEntitas = normalisasiUrl(urlSumber);
  const pusat: SimpulGraf = {
    id: `sumber:${kunciEntitas}`,
    jenis: "sumber",
    label: potongLabel(nama),
    sublabel: namaHost(urlSumber),
    href: urlSumber,
  };

  const tetangga: TetanggaEntitas[] = [];
  let klaimTerpotong = false;

  // Tetangga klaim (pf_evidence) — arah bukti tercatat per sisi.
  const klaimIdUnik = [...new Set(bukti.map((b) => String(b.klaim_id ?? "")).filter(Boolean))];
  if (klaimIdUnik.length > 0) {
    const { data: klaimData, error: errKlaim } = await supabase
      .from("pf_claims")
      .select("id, artikel_id, teks")
      .in("id", klaimIdUnik)
      .limit(1000);
    if (errKlaim) {
      catatGalatBaca("getEntitasGraf.sumber.klaim", errKlaim);
    } else if (klaimData) {
      const klaim = klaimData as unknown as Record<string, unknown>[];
      // Artikel pemilik klaim — hanya yang TERBIT (anti-bocor draf).
      const idArtikel = [...new Set(klaim.map((k) => String(k.artikel_id ?? "")).filter(Boolean))];
      const judulArtikel = new Map<string, { slug: string; judul: string }>();
      if (idArtikel.length > 0) {
        const { data: artData, error: errArt } = await supabase
          .from("pf_articles")
          .select("id, slug, judul")
          .eq("status", "terbit")
          .in("id", idArtikel)
          .limit(1000);
        if (errArt) {
          catatGalatBaca("getEntitasGraf.sumber.artikelKlaim", errArt);
        } else if (artData) {
          for (const r of artData as unknown as Record<string, unknown>[]) {
            judulArtikel.set(String(r.id), {
              slug: String(r.slug ?? ""),
              judul: String(r.judul ?? ""),
            });
          }
        }
      }
      const arahPerKlaim = new Map<string, unknown>();
      for (const b of bukti) {
        const id = String(b.klaim_id ?? "");
        if (id && !arahPerKlaim.has(id)) arahPerKlaim.set(id, b.arah);
      }
      const klaimTerbit = klaim.filter((k) =>
        judulArtikel.has(String(k.artikel_id ?? "")),
      );
      if (klaimTerbit.length > BATAS_TETANGGA_PER_KELOMPOK) klaimTerpotong = true;
      for (const k of klaimTerbit.slice(0, BATAS_TETANGGA_PER_KELOMPOK)) {
        const arah = arahBuktiValid(arahPerKlaim.get(String(k.id)))
          ? (arahPerKlaim.get(String(k.id)) as ArahBukti)
          : null;
        const art = judulArtikel.get(String(k.artikel_id ?? ""));
        tetangga.push({
          simpul: {
            id: `klaim:${String(k.id)}`,
            jenis: "klaim",
            label: potongLabel(String(k.teks ?? "Klaim tanpa teks")),
            sublabel: null,
            href: `/klaim/${String(k.id)}`,
          },
          relasi: arah ? LABEL_ARAH_SISI[arah] : "dibuktikan oleh",
          arah,
          detail: art ? `Dari artikel: ${art.judul}` : null,
        });
      }
    }
  }

  // Tetangga artikel (pf_article_sources) — hanya bila baris
  // pf_sources-nya ada (butuh sumber_id untuk join).
  let artikelTerpotong = false;
  if (barisSumber) {
    const { data: tautanData, error: errTautan } = await supabase
      .from("pf_article_sources")
      .select("artikel_id")
      .eq("sumber_id", barisSumber.id)
      .limit(1000);
    if (errTautan) {
      catatGalatBaca("getEntitasGraf.sumber.artikel", errTautan);
    } else if (tautanData) {
      const idArtikel = [
        ...new Set(
          (tautanData as unknown as Record<string, unknown>[])
            .map((r) => String(r.artikel_id ?? ""))
            .filter(Boolean),
        ),
      ];
      if (idArtikel.length > 0) {
        const { data: artData, error: errArt } = await supabase
          .from("pf_articles")
          .select("id, slug, judul")
          .eq("status", "terbit")
          .in("id", idArtikel)
          .order("diterbitkan_pada", { ascending: false })
          .limit(1000);
        if (errArt) {
          catatGalatBaca("getEntitasGraf.sumber.artikelIsi", errArt);
        } else if (artData) {
          const artikel = artData as unknown as Record<string, unknown>[];
          if (artikel.length > BATAS_TETANGGA_PER_KELOMPOK) artikelTerpotong = true;
          for (const a of artikel.slice(0, BATAS_TETANGGA_PER_KELOMPOK)) {
            tetangga.push({
              simpul: simpulArtikel({
                id: String(a.id),
                slug: String(a.slug ?? ""),
                judul: String(a.judul ?? ""),
              }),
              relasi: "dipakai di artikel",
            });
          }
        }
      }
    }
  }

  const catatanBatas =
    klaimTerpotong || artikelTerpotong
      ? "Daftar tetangga dibatasi 20 per kelompok agar graf tetap terbaca."
      : null;
  const deskripsi = [
    tier !== null
      ? `Tier ${tier} · skor kredibilitas ${skorKredibilitas(tier)}.`
      : "Sumber ini tercatat sebagai bukti klaim, tapi belum terdaftar di /sumber.",
    catatanBatas,
  ]
    .filter((b): b is string => Boolean(b))
    .join(" ");
  return {
    jenis: "sumber",
    kunci: kunciEntitas,
    label: nama,
    sublabel: namaHost(urlSumber),
    deskripsi,
    hrefAsal: "/sumber",
    tautanLuar: urlSumber,
    tetangga,
    graf: rakitMiniGraf(pusat, tetangga),
    tersedia: true,
  };
}

/** Entitas negara: profil dari getNegara (berita + event + cerita). */
async function entitasNegara(kodeMentah: string): Promise<EntitasGraf | null> {
  const kode = normalisasiKode(kodeMentah);
  if (!kodeValid(kode)) return null;
  const profil = await getNegara(kode);
  if (!profil) return null;
  const { negara } = profil;
  const pusat: SimpulGraf = {
    id: `negara:${kode}`,
    jenis: "negara",
    label: negara.nama,
    sublabel: `Kode ${kode}`,
    href: `/negara/${kode}`,
  };
  const tetangga: TetanggaEntitas[] = [];
  for (const a of profil.berita) {
    tetangga.push({
      simpul: simpulArtikel({ id: a.id, slug: a.slug, judul: a.judul }),
      relasi: "profil negara",
    });
  }
  for (const e of profil.events) {
    tetangga.push({
      simpul: {
        id: `event:${e.id}`,
        jenis: "event",
        label: potongLabel(e.judul || "Peristiwa tanpa judul"),
        sublabel: e.lokasi_teks,
        href: "/timeline",
      },
      relasi: "peristiwa di negara ini",
    });
  }
  for (const c of profil.cerita) {
    tetangga.push({
      simpul: {
        id: `cerita:${c.slug}`,
        jenis: "cerita",
        label: potongLabel(c.judul),
        sublabel: null,
        href: `/cerita/${c.slug}`,
      },
      relasi: "cerita di negara ini",
    });
  }
  return {
    jenis: "negara",
    kunci: kode,
    label: negara.nama,
    sublabel: negara.ibu_kota ? `Ibu kota: ${negara.ibu_kota}` : `Kode ${kode}`,
    deskripsi: negara.sistem_pemerintahan,
    hrefAsal: `/negara/${kode}`,
    tautanLuar: null,
    tetangga,
    graf: rakitMiniGraf(pusat, tetangga),
    tersedia: true,
  };
}

/** Entitas cerita: slug atau UUID (UUID dipetakan dulu ke slug).
 *  Hanya cerita TERBIT (getCerita menyaring status='terbit'). */
async function entitasCerita(idMentah: string): Promise<EntitasGraf | null> {
  const supabase = await createClient();
  let slug = idMentah.trim();
  if (POLA_UUID.test(slug)) {
    const { data, error } = await supabase
      .from("pf_stories")
      .select("slug")
      .eq("id", slug)
      .maybeSingle();
    if (error) {
      if (catatGalatBaca("getEntitasGraf.cerita", error)) return null;
      throw new GalatBaca("getEntitasGraf.cerita", error);
    }
    if (!data || typeof (data as { slug?: unknown }).slug !== "string") return null;
    slug = (data as { slug: string }).slug;
  }
  const cerita = await getCerita(slug);
  if (!cerita) return null;
  const pusat: SimpulGraf = {
    id: `cerita:${cerita.slug}`,
    jenis: "cerita",
    label: potongLabel(cerita.judul),
    sublabel: null,
    href: `/cerita/${cerita.slug}`,
  };
  const tetangga: TetanggaEntitas[] = [];
  for (const a of cerita.artikel) {
    tetangga.push({
      simpul: simpulArtikel({ id: a.artikel_id, slug: a.slug, judul: a.judul }),
      relasi: "bagian dari cerita",
      detail: `Peran: ${a.peran}`,
    });
  }
  for (const e of cerita.events) {
    tetangga.push({
      simpul: {
        id: `event:${e.event_id}`,
        jenis: "event",
        label: potongLabel(e.judul || "Peristiwa tanpa judul"),
        sublabel: e.lokasi_teks,
        href: "/timeline",
      },
      relasi: "peristiwa dalam cerita",
    });
  }
  return {
    jenis: "cerita",
    kunci: cerita.slug,
    label: cerita.judul,
    sublabel:
      cerita.status_perkembangan === "selesai"
        ? "Story Tracker · Selesai"
        : "Story Tracker · Masih berkembang",
    deskripsi: cerita.ringkasan,
    hrefAsal: `/cerita/${cerita.slug}`,
    tautanLuar: null,
    tetangga,
    graf: rakitMiniGraf(pusat, tetangga),
    tersedia: true,
  };
}

/** Entitas kategori: slug kategori utama atau subkategori dari
 *  taksonomi KATEGORI_UTAMA. Slug lain → null (404 jujur). */
async function entitasKategori(slugMentah: string): Promise<EntitasGraf | null> {
  const slug = slugMentah.trim();
  const utama = cariKategori(slug);
  let nama = utama?.nama ?? null;
  const deskripsi = utama?.deskripsi ?? null;
  let sublabel: string | null = null;
  if (!utama) {
    for (const k of KATEGORI_UTAMA) {
      const sub = k.sub.find((s) => s.slug === slug);
      if (sub) {
        nama = sub.nama;
        sublabel = `Subkategori ${k.nama}`;
        break;
      }
    }
  }
  if (!nama) return null;
  const artikel = await getArtikelPerKategori(slug, BATAS_TETANGGA_PER_KELOMPOK);
  const pusat: SimpulGraf = {
    id: `kategori:${slug}`,
    jenis: "kategori",
    label: nama,
    sublabel,
    href: `/kategori/${slug}`,
  };
  const tetangga: TetanggaEntitas[] = artikel.map((a) => ({
    simpul: simpulArtikel({ id: a.id, slug: a.slug, judul: a.judul }),
    relasi: "kategori artikel",
  }));
  return {
    jenis: "kategori",
    kunci: slug,
    label: nama,
    sublabel,
    deskripsi,
    hrefAsal: `/kategori/${slug}`,
    tautanLuar: null,
    tetangga,
    graf: rakitMiniGraf(pusat, tetangga),
    tersedia: true,
  };
}

/**
 * Satu entitas graf beserta tetangganya, atau null bila jenis
 * tidak dikenal / id tidak ada (pemanggil memanggil notFound()).
 */
export async function getEntitasGraf(
  jenis: string,
  id: string,
): Promise<EntitasGraf | null> {
  if (!(JENIS_ENTITAS_GRAF as readonly string[]).includes(jenis)) return null;
  const kunci = id.trim();
  if (!kunci) return null;
  try {
    switch (jenis as JenisEntitasGraf) {
      case "sumber":
        return await entitasSumber(kunci);
      case "negara":
        return await entitasNegara(kunci);
      case "cerita":
        return await entitasCerita(kunci);
      case "kategori":
        return await entitasKategori(kunci);
    }
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getEntitasGraf", err)) return null;
    throw new GalatBaca("getEntitasGraf", err);
  }
}
