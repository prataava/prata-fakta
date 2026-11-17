// Getter Knowledge Graph v1 (P1-2) — src/lib/graf.ts (BARU).
//
// Graf HANYA memakai relasi yang SUDAH ADA di database — tidak ada
// entitas baru yang diekstrak dari teks (itu KG v2, P2):
//   simpul: klaim + sumber + artikel + event + cerita
//   sisi:   pf_evidence (klaim↔sumber),
//           pf_events.artikel_id (artikel↔event),
//           pf_story_articles (artikel↔cerita)
// Pemeriksaan tautan artikel↔negara: pf_articles.punya kolom
// negara_kode (FK ke pf_countries, v10) — tautan langsung itu ADA,
// tetapi v1 SENGAJA tidak memakainya: simpul negara di luar
// cakupan P1-2 (simpul = 5 jenis di atas, sisi = 3 relasi di atas)
// dan pf_article_tags hanya menautkan tag (pf_tags), bukan negara.
// Bila pemilik meminta simpul negara, itu penambahan v1.1, bukan
// koreksi — catat di laporan, jangan diam-diam memperluas graf.
//
// Aturan bocor-draf: hanya artikel TERBIT yang jadi simpul; klaim
// draf, event yang artikelnya draf, dan cerita draf tidak masuk
// graf (RLS v8/v10 sudah menutupnya di lapis database; getter ini
// menutupnya lagi di lapis aplikasi).
import { createClient } from "@/lib/supabase/server";
import { GalatBaca, catatGalatBaca } from "@/lib/galat";
import {
  JENIS_SIMPUL,
  LABEL_JENIS_SIMPUL,
  type JenisSimpul,
} from "@/lib/graf-meta";

export { JENIS_SIMPUL, LABEL_JENIS_SIMPUL, type JenisSimpul };

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
  label: string;
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
 * Graf pengetahuan v1 dari relasi yang sudah ada, dibatasi
 * `batas` simpul (default 100). Urutan pengisian deterministik:
 * artikel terbit terbaru dulu, lalu klaimnya, sumber buktinya,
 * event yang menaut ke artikel itu, dan cerita terbit yang
 * memuat artikel itu. Sisi yang menyentuh simpul terpotong ikut
 * dibuang agar graf tidak menunjuk ke simpul yang tidak tampil.
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
      .select("id, slug, judul, diterbitkan_pada, dibuat_pada")
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

    const [klaimRes, eventRes, ceritaRes, tautanCeritaRes] = await Promise.all([
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

    const klaim = (klaimRes.data ?? []) as unknown as Record<string, unknown>[];
    const klaimId = klaim.map((k) => String(k.id));

    let bukti: Record<string, unknown>[] = [];
    if (klaimId.length > 0) {
      const buktiRes = await supabase
        .from("pf_evidence")
        .select("klaim_id, sumber_url, sumber_nama")
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

    // Bila kandidat simpul melebihi batas, graf terpotong — tulis
    // jujur di UI (bukan diam-diam). Hitung dari URL sumber unik,
    // bukan dari jumlah baris bukti.
    const urlUnik = new Set(
      bukti
        .map((b) => normalisasiUrl(String(b.sumber_url ?? "")).toLowerCase())
        .filter(Boolean),
    );
    if (
      artikel.length + klaim.length + urlUnik.size + event.length + cerita.length >
      batasEfektif
    ) {
      terpotong = true;
    }

    const sisi: SisiGraf[] = [];
    const tambahSisi = (dari: string, ke: string, label: string) => {
      if (!ada.has(dari) || !ada.has(ke)) return;
      sisi.push({ dari, ke, label });
    };
    for (const b of bukti) {
      const simpulKlaim = idSimpulKlaim.get(String(b.klaim_id ?? ""));
      const simpulSumber = idSimpulSumber.get(
        normalisasiUrl(String(b.sumber_url ?? "")).toLowerCase(),
      );
      if (simpulKlaim && simpulSumber) {
        tambahSisi(simpulKlaim, simpulSumber, "dibuktikan oleh");
      }
    }
    for (const e of event) {
      const simpulArtikel = idSimpulArtikel.get(String(e.artikel_id ?? ""));
      const simpulEvent = idSimpulEvent.get(String(e.id));
      if (simpulArtikel && simpulEvent) {
        tambahSisi(simpulArtikel, simpulEvent, "terkait peristiwa");
      }
    }
    for (const t of tautanCerita) {
      const simpulArtikel = idSimpulArtikel.get(String(t.artikel_id ?? ""));
      const simpulCerita = idSimpulCerita.get(String(t.story_id ?? ""));
      if (simpulArtikel && simpulCerita) {
        tambahSisi(simpulArtikel, simpulCerita, "bagian dari cerita");
      }
    }

    return { simpul, sisi, terpotong, batas: batasEfektif, tersedia: true };
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getGrafPengetahuan", err)) return kosong;
    throw new GalatBaca("getGrafPengetahuan", err);
  }
}
