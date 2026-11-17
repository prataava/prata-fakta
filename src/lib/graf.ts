// Getter Knowledge Graph v1 (P1-2) + v2 (P2-1) — src/lib/graf.ts.
//
// Graf HANYA memakai relasi yang SUDAH ADA di database — tidak ada
// entitas baru yang diekstrak dari teks:
//   simpul: klaim + sumber + artikel + event + cerita
//           (v2: + negara + kategori)
//   sisi:   pf_evidence (klaim↔sumber, berlabel arah bukti),
//           pf_events.artikel_id (artikel↔event, "diliput dalam"),
//           pf_story_articles (artikel↔cerita, "bagian dari cerita"),
//           pf_articles.negara_kode (artikel↔negara, "profil negara"
//             — kolom FK langsung ke pf_countries, v10; BUKAN lewat
//             tag: pf_article_tags hanya menautkan pf_tags),
//           pf_articles.kategori_slug (artikel↔kategori,
//             "kategori artikel")
//
// Aturan bocor-draf: hanya artikel TERBIT yang jadi simpul; klaim
// draf, event yang artikelnya draf, dan cerita draf tidak masuk
// graf (RLS v8/v10 sudah menutupnya di lapis database; getter ini
// menutupnya lagi di lapis aplikasi).
import { createClient } from "@/lib/supabase/server";
import { GalatBaca, catatGalatBaca } from "@/lib/galat";
import { KATEGORI_UTAMA } from "@/lib/categories";
import {
  JENIS_SIMPUL,
  LABEL_JENIS_SIMPUL,
  type JenisSimpul,
} from "@/lib/graf-meta";

export { JENIS_SIMPUL, LABEL_JENIS_SIMPUL, type JenisSimpul };

/** Arah bukti pf_evidence (CHECK v4: mendukung/menentang/netral). */
export type ArahBukti = "mendukung" | "menentang" | "netral";

/** Label sisi klaim↔sumber menurut arah bukti yang tercatat.
 *  Nama sengaja BUKAN LABEL_ARAH_BUKTI: lib/klaim.ts sudah
 *  mengekspor nama itu dengan nilai berbeda ("Mendukung" vs
 *  "mendukung klaim" di sini) — duplikasi nama dilarang H18
 *  baterai P1. */
export const LABEL_ARAH_SISI: Record<ArahBukti, string> = {
  mendukung: "mendukung klaim",
  menentang: "menentang klaim",
  netral: "netral terhadap klaim",
};

/** true bila nilai adalah arah bukti yang sah (bukan karangan). */
export function arahBuktiValid(v: unknown): v is ArahBukti {
  return v === "mendukung" || v === "menentang" || v === "netral";
}

export type SimpulGraf = {
  /** Id unik lintas jenis: "<jenis>:<kunci>". */
  id: string;
  jenis: JenisSimpul;
  label: string;
  sublabel: string | null;
  /** Tautan tujuan bila ada (artikel/klaim/cerita/event punya rute). */
  href: string | null;
};

export type SisiGraf = {
  dari: string;
  ke: string;
  /** Label relasi dari data yang sudah ada (bukan karangan). */
  label: string;
  /** Arah bukti pf_evidence — hanya diisi pada sisi klaim↔sumber. */
  arah?: ArahBukti | null;
};

export type GrafPengetahuan = {
  simpul: SimpulGraf[];
  sisi: SisiGraf[];
  /** true bila simpul yang ada melebihi batas dan dipotong. */
  terpotong: boolean;
  batas: number;
  /** false bila tabel belum ada (pemanggil menampilkan EmptyState). */
  tersedia: boolean;
};

export const BATAS_SIMPUL_GRAF = 100;

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

function potongLabel(teks: string, maks = 80): string {
  const bersih = teks.replace(/\s+/g, " ").trim();
  return bersih.length > maks ? `${bersih.slice(0, maks - 1)}…` : bersih;
}

/**
 * Graf pengetahuan v1+v2 dari relasi yang sudah ada, dibatasi
 * `batas` simpul (default 100). Urutan pengisian deterministik:
 * artikel terbit terbaru dulu, lalu klaimnya, sumber buktinya,
 * event yang menaut ke artikel itu, cerita terbit yang memuat
 * artikel itu, dan terakhir (v2) negara + kategori artikel —
 * agar simpul v1 tetap diprioritaskan dalam batas. Sisi yang
 * menyentuh simpul terpotong ikut dibuang agar graf tidak
 * menunjuk ke simpul yang tidak tampil.
 */
export async function getGrafPengetahuan(
  batas: number = BATAS_SIMPUL_GRAF,
): Promise<GrafPengetahuan> {
  const batasEfektif = Math.max(1, Math.floor(batas) || BATAS_SIMPUL_GRAF);
  const kosong: GrafPengetahuan = {
    simpul: [],
    sisi: [],
    terpotong: false,
    batas: batasEfektif,
    tersedia: false,
  };
  try {
    const supabase = await createClient();

    const { data: artikelData, error: errArtikel } = await supabase
      .from("pf_articles")
      .select("id, slug, judul, diterbitkan_pada, dibuat_pada, negara_kode, kategori_slug")
      .eq("status", "terbit")
      .order("diterbitkan_pada", { ascending: false })
      .limit(1000);
    if (errArtikel) {
      if (catatGalatBaca("getGrafPengetahuan.artikel", errArtikel)) return kosong;
      throw new GalatBaca("getGrafPengetahuan.artikel", errArtikel);
    }
    const artikel = (artikelData ?? []) as unknown as Record<string, unknown>[];
    if (artikel.length === 0) {
      return { ...kosong, tersedia: true };
    }
    const idArtikel = artikel.map((a) => String(a.id));

    const [klaimRes, eventRes, ceritaRes, tautanCeritaRes, negaraRes] = await Promise.all([
      supabase
        .from("pf_claims")
        .select("id, artikel_id, teks")
        .in("artikel_id", idArtikel)
        .order("dibuat_pada", { ascending: false })
        .limit(1000),
      supabase
        .from("pf_events")
        .select("id, judul, artikel_id")
        .in("artikel_id", idArtikel)
        .order("dimulai_pada", { ascending: false })
        .limit(1000),
      supabase
        .from("pf_stories")
        .select("id, slug, judul")
        .eq("status", "terbit")
        .order("dibuat_pada", { ascending: false })
        .limit(1000),
      supabase
        .from("pf_story_articles")
        .select("story_id, artikel_id")
        .in("artikel_id", idArtikel)
        .limit(1000),
      // Nama negara untuk label simpul negara (pf_countries).
      // Galat di sini TIDAK menggagalkan graf: simpul negara
      // tetap dibuat dengan label = kode ISO-2.
      supabase
        .from("pf_countries")
        .select("kode, nama")
        .order("nama", { ascending: true })
        .limit(500),
    ]);
    for (const [nama, res] of [
      ["klaim", klaimRes],
      ["event", eventRes],
      ["cerita", ceritaRes],
      ["tautanCerita", tautanCeritaRes],
    ] as const) {
      if (res.error) {
        if (catatGalatBaca(`getGrafPengetahuan.${nama}`, res.error)) return kosong;
        throw new GalatBaca(`getGrafPengetahuan.${nama}`, res.error);
      }
    }
    if (negaraRes.error) {
      catatGalatBaca("getGrafPengetahuan.negara", negaraRes.error);
    }

    const klaim = (klaimRes.data ?? []) as unknown as Record<string, unknown>[];
    const klaimId = klaim.map((k) => String(k.id));

    let bukti: Record<string, unknown>[] = [];
    if (klaimId.length > 0) {
      const buktiRes = await supabase
        .from("pf_evidence")
        .select("klaim_id, sumber_url, sumber_nama, arah")
        .in("klaim_id", klaimId)
        .limit(2000);
      if (buktiRes.error) {
        if (catatGalatBaca("getGrafPengetahuan.bukti", buktiRes.error)) {
          return { ...kosong, tersedia: true };
        }
        throw new GalatBaca("getGrafPengetahuan.bukti", buktiRes.error);
      }
      bukti = (buktiRes.data ?? []) as unknown as Record<string, unknown>[];
    }

    const event = (eventRes.data ?? []) as unknown as Record<string, unknown>[];
    const cerita = (ceritaRes.data ?? []) as unknown as Record<string, unknown>[];
    const tautanCerita = (tautanCeritaRes.data ?? []) as unknown as Record<string, unknown>[];

    // --- Rakit simpul (artikel dulu, lalu klaim, sumber, event, cerita).
    const simpul: SimpulGraf[] = [];
    const ada = new Set<string>();
    let terpotong = false;
    const tambah = (s: SimpulGraf): boolean => {
      if (ada.has(s.id)) return true;
      if (simpul.length >= batasEfektif) {
        terpotong = true;
        return false;
      }
      ada.add(s.id);
      simpul.push(s);
      return true;
    };

    const idSimpulArtikel = new Map<string, string>();
    for (const a of artikel) {
      const id = `artikel:${String(a.id)}`;
      if (!tambah({
        id,
        jenis: "artikel",
        label: potongLabel(String(a.judul ?? "Artikel tanpa judul")),
        sublabel: null,
        href: `/artikel/${String(a.slug ?? "")}`,
      })) break;
      idSimpulArtikel.set(String(a.id), id);
    }

    const idSimpulKlaim = new Map<string, string>();
    for (const k of klaim) {
      const artikelId = String(k.artikel_id ?? "");
      if (!idSimpulArtikel.has(artikelId)) continue;
      const id = `klaim:${String(k.id)}`;
      if (!tambah({
        id,
        jenis: "klaim",
        label: potongLabel(String(k.teks ?? "Klaim tanpa teks")),
        sublabel: null,
        href: `/klaim/${String(k.id)}`,
      })) break;
      idSimpulKlaim.set(String(k.id), id);
    }

    // Sumber didedup berdasarkan URL ternormalisasi (satu sumber
    // bisa jadi bukti banyak klaim — satu simpul, banyak sisi).
    const idSimpulSumber = new Map<string, string>();
    for (const b of bukti) {
      const klaimIdBukti = String(b.klaim_id ?? "");
      if (!idSimpulKlaim.has(klaimIdBukti)) continue;
      const url = normalisasiUrl(String(b.sumber_url ?? ""));
      if (!url) continue;
      const kunci = url.toLowerCase();
      if (idSimpulSumber.has(kunci)) continue;
      const id = `sumber:${kunci}`;
      if (!tambah({
        id,
        jenis: "sumber",
        label: potongLabel(String(b.sumber_nama ?? "") || namaHost(url)),
        sublabel: namaHost(url),
        href: url,
      })) break;
      idSimpulSumber.set(kunci, id);
    }

    const idSimpulEvent = new Map<string, string>();
    for (const e of event) {
      const artikelId = String(e.artikel_id ?? "");
      if (!idSimpulArtikel.has(artikelId)) continue;
      const id = `event:${String(e.id)}`;
      if (!tambah({
        id,
        jenis: "event",
        label: potongLabel(String(e.judul ?? "Peristiwa tanpa judul")),
        sublabel: null,
        href: "/timeline",
      })) break;
      idSimpulEvent.set(String(e.id), id);
    }

    const idSimpulCerita = new Map<string, string>();
    for (const c of cerita) {
      const id = `cerita:${String(c.id)}`;
      if (!tambah({
        id,
        jenis: "cerita",
        label: potongLabel(String(c.judul ?? "Cerita tanpa judul")),
        sublabel: null,
        href: `/cerita/${String(c.slug ?? "")}`,
      })) break;
      idSimpulCerita.set(String(c.id), id);
    }

    // v2: simpul negara — diisi TERAKHIR agar simpul v1 tetap
    // diprioritaskan dalam batas 100. Satu simpul per kode
    // negara (dedup); nama dari pf_countries, jatuh ke kode bila
    // baris negaranya belum ada.
    const namaNegara = new Map<string, string>();
    if (!negaraRes.error && negaraRes.data) {
      for (const r of negaraRes.data as unknown as Record<string, unknown>[]) {
        const kode = String(r.kode ?? "").toUpperCase();
        if (kode && typeof r.nama === "string" && r.nama) {
          namaNegara.set(kode, r.nama);
        }
      }
    }
    const idSimpulNegara = new Map<string, string>();
    for (const a of artikel) {
      const kode = String(a.negara_kode ?? "").toUpperCase();
      if (!kode || idSimpulNegara.has(kode)) continue;
      const id = `negara:${kode}`;
      if (!tambah({
        id,
        jenis: "negara",
        label: potongLabel(namaNegara.get(kode) ?? kode),
        sublabel: `Kode ${kode}`,
        href: `/negara/${kode}`,
      })) break;
      idSimpulNegara.set(kode, id);
    }

    // v2: simpul kategori — juga diisi terakhir. Satu simpul per
    // kategori_slug (dedup); label dari taksonomi statis
    // KATEGORI_UTAMA (utama + sub); slug tak dikenal tampil
    // apa adanya (jujur, bukan ditebak).
    const labelKategori = (slug: string): { label: string; sublabel: string | null } => {
      const utama = KATEGORI_UTAMA.find((k) => k.slug === slug);
      if (utama) return { label: utama.nama, sublabel: null };
      for (const k of KATEGORI_UTAMA) {
        const sub = k.sub.find((s) => s.slug === slug);
        if (sub) return { label: sub.nama, sublabel: `Subkategori ${k.nama}` };
      }
      return { label: slug, sublabel: null };
    };
    const idSimpulKategori = new Map<string, string>();
    for (const a of artikel) {
      const slug = String(a.kategori_slug ?? "").trim();
      if (!slug || idSimpulKategori.has(slug)) continue;
      const { label, sublabel } = labelKategori(slug);
      const id = `kategori:${slug}`;
      if (!tambah({
        id,
        jenis: "kategori",
        label: potongLabel(label),
        sublabel,
        href: `/kategori/${slug}`,
      })) break;
      idSimpulKategori.set(slug, id);
    }

    // Bila kandidat simpul melebihi batas, graf terpotong — tulis
    // jujur di UI (bukan diam-diam). Hitung dari URL sumber unik,
    // bukan dari jumlah baris bukti; v2 tambah negara + kategori unik.
    const urlUnik = new Set(
      bukti
        .map((b) => normalisasiUrl(String(b.sumber_url ?? "")).toLowerCase())
        .filter(Boolean),
    );
    if (
      artikel.length + klaim.length + urlUnik.size + event.length + cerita.length +
      idSimpulNegara.size + idSimpulKategori.size >
      batasEfektif
    ) {
      terpotong = true;
    }

    const sisi: SisiGraf[] = [];
    const tambahSisi = (dari: string, ke: string, label: string, arah?: ArahBukti | null) => {
      if (!ada.has(dari) || !ada.has(ke)) return;
      sisi.push(arah ? { dari, ke, label, arah } : { dari, ke, label });
    };
    for (const b of bukti) {
      const simpulKlaim = idSimpulKlaim.get(String(b.klaim_id ?? ""));
      const simpulSumber = idSimpulSumber.get(
        normalisasiUrl(String(b.sumber_url ?? "")).toLowerCase(),
      );
      if (simpulKlaim && simpulSumber) {
        // v2: label dari pf_evidence.arah yang tercatat; bila
        // arah tak dikenal (di luar CHECK v4), jatuh ke label v1.
        const arah = arahBuktiValid(b.arah) ? (b.arah as ArahBukti) : null;
        tambahSisi(
          simpulKlaim,
          simpulSumber,
          arah ? LABEL_ARAH_SISI[arah] : "dibuktikan oleh",
          arah,
        );
      }
    }
    for (const e of event) {
      const simpulArtikel = idSimpulArtikel.get(String(e.artikel_id ?? ""));
      const simpulEvent = idSimpulEvent.get(String(e.id));
      if (simpulArtikel && simpulEvent) {
        tambahSisi(simpulArtikel, simpulEvent, "diliput dalam");
      }
    }
    for (const t of tautanCerita) {
      const simpulArtikel = idSimpulArtikel.get(String(t.artikel_id ?? ""));
      const simpulCerita = idSimpulCerita.get(String(t.story_id ?? ""));
      if (simpulArtikel && simpulCerita) {
        tambahSisi(simpulArtikel, simpulCerita, "bagian dari cerita");
      }
    }
    // v2: artikel↔negara (pf_articles.negara_kode) + artikel↔kategori
    // (pf_articles.kategori_slug).
    for (const a of artikel) {
      const simpulArtikel = idSimpulArtikel.get(String(a.id));
      if (!simpulArtikel) continue;
      const kode = String(a.negara_kode ?? "").toUpperCase();
      const simpulNegara = kode ? idSimpulNegara.get(kode) : undefined;
      if (simpulNegara) {
        tambahSisi(simpulArtikel, simpulNegara, "profil negara");
      }
      const slug = String(a.kategori_slug ?? "").trim();
      const simpulKategori = slug ? idSimpulKategori.get(slug) : undefined;
      if (simpulKategori) {
        tambahSisi(simpulArtikel, simpulKategori, "kategori artikel");
      }
    }

    return { simpul, sisi, terpotong, batas: batasEfektif, tersedia: true };
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getGrafPengetahuan", err)) return kosong;
    throw new GalatBaca("getGrafPengetahuan", err);
  }
}
