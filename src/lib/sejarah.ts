// Lapisan akses data Historical Archive PRATA FAKTA (Fase 8 Gel. 2).
// Prinsip sama seperti src/lib/data.ts: gagal-aman (try/catch → []
// / null), Bahasa Indonesia, tanpa data palsu. Arsip sejarah
// membaca pf_events (kolom era/penting/negara_kode dari migrasi
// v10) — event yang tampil adalah event yang benar-benar tercatat
// di database; tidak ada peristiwa karangan.
//
// "Hari ini dalam sejarah" memakai hari-bulan WIB (Asia/Jakarta)
// dari dimulai_pada, tahun berapa pun.
import { createClient } from "@/lib/supabase/server";
import type { PfEvent } from "@/lib/lanjutan";

export type PfEventSejarah = PfEvent & {
  era: string | null;
  penting: boolean;
  negara_kode: string | null;
  negara_nama: string | null;
};

export type FilterArsipSejarah = {
  tahun?: number;
  era?: string;
  hanyaPenting?: boolean;
};

export type HasilArsipSejarah = {
  events: PfEventSejarah[];
  /** Tahun (WIB) yang punya minimal satu event, terbaru dulu. */
  tahun: number[];
  /** Era yang tercatat (bukan null/kosong), urut abjad. */
  era: string[];
  tersedia: boolean;
};

/* ============================================================
   Fungsi murni (diekspor agar bisa diuji tanpa database).
   Regex-ekstrak di scripts/uji-fase8-gel2-cerita.mjs memakai
   pola `export function <nama>(...)` + penutup `\n}` — jangan
   ubah bentuk fungsi-fungsi ini tanpa memperbarui skrip uji.
   ============================================================ */

/** Tanggal YYYY-MM-DD hari ini di zona Asia/Jakarta. */
export function tanggalWibHariIni(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Bulan (1–12) + hari (1–31) WIB dari ISO timestamptz; null bila
 *  tanggal tidak valid. */
export function bulanHariWib(
  iso: string | null,
): { bulan: number; hari: number } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const bagian = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const bulan = Number(
    bagian.find((p) => p.type === "month")?.value ?? "0",
  );
  const hari = Number(bagian.find((p) => p.type === "day")?.value ?? "0");
  if (bulan < 1 || bulan > 12 || hari < 1 || hari > 31) return null;
  return { bulan, hari };
}

/** Tahun WIB dari ISO timestamptz; null bila tanggal tidak valid. */
export function tahunWib(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tahun = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
  }).format(d);
  const n = Number(tahun);
  return Number.isFinite(n) ? n : null;
}

/** Apakah event yang dimulai pada `iso` jatuh pada hari-bulan
 *  (bulan, hari) WIB — tahun berapa pun. */
export function cocokHariBulan(
  iso: string | null,
  bulan: number,
  hari: number,
): boolean {
  const bh = bulanHariWib(iso);
  if (!bh) return false;
  return bh.bulan === bulan && bh.hari === hari;
}

/** Tahun valid untuk filter arsip (1900–2100). */
export function tahunFilterValid(tahun: number): boolean {
  return Number.isInteger(tahun) && tahun >= 1900 && tahun <= 2100;
}

/* ============================================================
   Util internal
   ============================================================ */

const KOLOM_EVENT_SEJARAH =
  "id, judul, ringkasan, lokasi_teks, lintang, bujur, dimulai_pada, berakhir_pada, dampak, sumber_url, artikel_id, era, penting, negara_kode";

function barisSejarah(
  r: Record<string, unknown>,
  namaNegara: Map<string, string>,
): PfEventSejarah {
  const keAngka = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const kode =
    typeof r.negara_kode === "string" && r.negara_kode
      ? r.negara_kode
      : null;
  return {
    id: String(r.id),
    judul: String(r.judul ?? ""),
    ringkasan: (r.ringkasan as string | null) ?? null,
    lokasi_teks: (r.lokasi_teks as string | null) ?? null,
    lintang: keAngka(r.lintang),
    bujur: keAngka(r.bujur),
    dimulai_pada: (r.dimulai_pada as string | null) ?? null,
    berakhir_pada: (r.berakhir_pada as string | null) ?? null,
    dampak: (r.dampak as string | null) ?? null,
    sumber_url: (r.sumber_url as string | null) ?? null,
    artikel_id: (r.artikel_id as string | null) ?? null,
    era: (r.era as string | null) ?? null,
    penting: r.penting === true,
    negara_kode: kode,
    negara_nama: kode ? (namaNegara.get(kode) ?? null) : null,
  };
}

async function petaNamaNegara(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, string>> {
  const peta = new Map<string, string>();
  try {
    const { data, error } = await supabase
      .from("pf_countries")
      .select("kode, nama")
      .limit(300);
    if (error || !data) return peta;
    for (const r of data as unknown as Record<string, unknown>[]) {
      if (typeof r.kode === "string" && typeof r.nama === "string") {
        peta.set(r.kode, r.nama);
      }
    }
  } catch {
    // Tanpa peta negara, event tetap tampil dengan kode saja.
  }
  return peta;
}

/* ============================================================
   Baca publik
   ============================================================ */

/**
 * "Hari ini dalam sejarah": event yang dimulai_pada-nya jatuh
 * pada hari-bulan hari ini (WIB), tahun berapa pun, terbaru dulu.
 * `tanggal` opsional (YYYY-MM-DD WIB) untuk pengujian; bila tidak
 * diberikan, memakai hari ini WIB.
 */
export async function getHariIniDalamSejarah(
  tanggal?: string,
): Promise<{ tanggal: string; events: PfEventSejarah[]; tersedia: boolean }> {
  const hariIni = tanggal ?? tanggalWibHariIni();
  const kosong = { tanggal: hariIni, events: [] as PfEventSejarah[], tersedia: false };
  const cocok = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hariIni);
  if (!cocok) return kosong;
  const bulan = Number(cocok[2]);
  const hari = Number(cocok[3]);
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_events")
      .select(KOLOM_EVENT_SEJARAH)
      .order("dimulai_pada", { ascending: false })
      .limit(500);
    if (error || !data) return kosong;
    const namaNegara = await petaNamaNegara(supabase);
    const events = (data as unknown as Record<string, unknown>[])
      .map((r) => barisSejarah(r, namaNegara))
      .filter((e) => cocokHariBulan(e.dimulai_pada, bulan, hari));
    return { tanggal: hariIni, events, tersedia: true };
  } catch {
    return kosong;
  }
}

/**
 * Arsip sejarah: filter tahun (WIB) dan/atau era, plus saklar
 * hanya event penting. Tanpa filter = semua event, terbaru dulu.
 * Mengembalikan juga daftar tahun + era yang tercatat (untuk
 * navigasi) — keduanya dihitung dari data nyata, bukan daftar
 * statis.
 */
export async function getArsipSejarah(
  filter: FilterArsipSejarah = {},
  limit = 100,
): Promise<HasilArsipSejarah> {
  const kosong: HasilArsipSejarah = {
    events: [],
    tahun: [],
    era: [],
    tersedia: false,
  };
  try {
    const supabase = await createClient();
    let query = supabase
      .from("pf_events")
      .select(KOLOM_EVENT_SEJARAH)
      .order("dimulai_pada", { ascending: false })
      .limit(limit);
    if (filter.tahun !== undefined && tahunFilterValid(filter.tahun)) {
      query = query
        .gte("dimulai_pada", `${filter.tahun}-01-01T00:00:00+07:00`)
        .lt("dimulai_pada", `${filter.tahun + 1}-01-01T00:00:00+07:00`);
    }
    if (filter.era) query = query.eq("era", filter.era);
    if (filter.hanyaPenting) query = query.eq("penting", true);
    const { data, error } = await query;
    if (error || !data) return kosong;

    // Daftar navigasi dari seluruh event yang tercatat (bukan
    // hanya halaman yang difilter): tahun + era nyata.
    let tahun: number[] = [];
    let era: string[] = [];
    try {
      const { data: semua, error: errSemua } = await supabase
        .from("pf_events")
        .select("dimulai_pada, era")
        .limit(1000);
      if (!errSemua && semua) {
        const himpunanTahun = new Set<number>();
        const himpunanEra = new Set<string>();
        for (const r of semua as unknown as Record<string, unknown>[]) {
          const t = tahunWib(
            typeof r.dimulai_pada === "string" ? r.dimulai_pada : null,
          );
          if (t !== null) himpunanTahun.add(t);
          if (typeof r.era === "string" && r.era.trim() !== "") {
            himpunanEra.add(r.era);
          }
        }
        tahun = [...himpunanTahun].sort((a, b) => b - a);
        era = [...himpunanEra].sort((a, b) => a.localeCompare(b, "id"));
      }
    } catch {
      // Navigasi kosong; daftar event tetap tampil.
    }

    const namaNegara = await petaNamaNegara(supabase);
    return {
      events: (data as unknown as Record<string, unknown>[]).map((r) =>
        barisSejarah(r, namaNegara),
      ),
      tahun,
      era,
      tersedia: true,
    };
  } catch {
    return kosong;
  }
}

/** Daftar era yang tercatat di pf_events (urut abjad). */
export async function getEra(): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_events")
      .select("era")
      .not("era", "is", null)
      .limit(1000);
    if (error || !data) return [];
    const himpunan = new Set<string>();
    for (const r of data as unknown as Record<string, unknown>[]) {
      if (typeof r.era === "string" && r.era.trim() !== "") {
        himpunan.add(r.era);
      }
    }
    return [...himpunan].sort((a, b) => a.localeCompare(b, "id"));
  } catch {
    return [];
  }
}
