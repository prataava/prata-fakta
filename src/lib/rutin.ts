// Lapisan data konten rutin PRATA FAKTA (server).
// Prinsip sama seperti src/lib/data.ts: tidak ada data palsu. Bila
// tabel v6 (pf_data_indicators, pf_data_points, pf_events,
// pf_knowledge_articles) belum dibuat atau query gagal, fungsi
// mengembalikan [] / null dan pemanggil menampilkan empty state
// jujur — bukan angka atau artikel karangan.
import { createClient } from "@/lib/supabase/server";
import type { PfArtikelRingkas } from "@/lib/data";
import type { IsiBrief } from "@/lib/ai/brief";

/** Tanggal hari ini dalam WIB (Asia/Jakarta), format YYYY-MM-DD. */
export function tanggalWibHariIni(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Batas UTC (ISO) untuk satu tanggal WIB: [awal, akhir). */
function batasHariWib(tanggal: string): { awal: string; akhir: string } {
  const awal = new Date(`${tanggal}T00:00:00+07:00`).toISOString();
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const besok = d.toISOString().slice(0, 10);
  const akhir = new Date(`${besok}T00:00:00+07:00`).toISOString();
  return { awal, akhir };
}

/** Tanggal (YYYY-MM-DD) N hari lalu dalam WIB. */
function tanggalWibLalu(hari: number): string {
  const d = new Date(`${tanggalWibHariIni()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - hari);
  return d.toISOString().slice(0, 10);
}

const KOLOM_ARTIKEL_RINGKAS =
  "id, slug, judul, ringkasan, kategori_slug, status_verifikasi, diterbitkan_pada";

/** Artikel terbit dalam N hari terakhir (maks limit). */
export async function getArtikelSejak(
  hari: number,
  limit = 20,
): Promise<PfArtikelRingkas[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_articles")
      .select(KOLOM_ARTIKEL_RINGKAS)
      .eq("status", "terbit")
      .gte("diterbitkan_pada", tanggalWibLalu(hari))
      .order("diterbitkan_pada", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as PfArtikelRingkas[];
  } catch {
    return [];
  }
}

/** Artikel terbit pada satu tanggal WIB. */
export async function getArtikelPadaTanggal(
  tanggal: string,
): Promise<PfArtikelRingkas[]> {
  try {
    const { awal, akhir } = batasHariWib(tanggal);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_articles")
      .select(KOLOM_ARTIKEL_RINGKAS)
      .eq("status", "terbit")
      .gte("diterbitkan_pada", awal)
      .lt("diterbitkan_pada", akhir)
      .order("diterbitkan_pada", { ascending: false });
    if (error || !data) return [];
    return data as PfArtikelRingkas[];
  } catch {
    return [];
  }
}

export type BriefRingkas = {
  id: string;
  tanggal: string;
  isi: IsiBrief;
};

function briefValid(
  row: Record<string, unknown>,
): BriefRingkas | null {
  const isi = row.isi as IsiBrief | null;
  if (
    !isi ||
    typeof isi !== "object" ||
    !isi.seksi ||
    typeof isi.seksi !== "object"
  ) {
    return null;
  }
  return {
    id: String(row.id),
    tanggal: String(row.tanggal),
    isi,
  };
}

/** Brief berstatus 'terbit' dalam N hari terakhir, terbaru dulu. */
export async function getBriefSejak(hari: number): Promise<BriefRingkas[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_daily_briefs")
      .select("id, tanggal, isi")
      .eq("status", "terbit")
      .gte("tanggal", tanggalWibLalu(hari))
      .order("tanggal", { ascending: false });
    if (error || !data) return [];
    return (data as Record<string, unknown>[])
      .map(briefValid)
      .filter((b): b is BriefRingkas => b !== null);
  } catch {
    return [];
  }
}

export type ArtikelPengetahuan = {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  topik: string | null;
  harian_tanggal: string | null;
};

/** Artikel pengetahuan terbit untuk topik tertentu (maks limit). */
export async function getArtikelPengetahuan(
  topik: string[],
  limit = 12,
): Promise<ArtikelPengetahuan[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_knowledge_articles")
      .select("id, slug, judul, ringkasan, topik, harian_tanggal")
      .eq("status", "terbit")
      .in("topik", topik)
      .order("harian_tanggal", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as ArtikelPengetahuan[];
  } catch {
    return [];
  }
}

export type IndikatorDenganNilai = {
  id: string;
  nama: string;
  slug: string;
  kategori: string | null;
  satuan: string | null;
  sumber_nama: string | null;
  sumber_url: string | null;
  metodologi: string | null;
  tanggal_pembaruan: string | null;
  ringkasan_tren: string | null;
  nilai_terakhir: number | null;
  tanggal_nilai_terakhir: string | null;
};

/**
 * Semua indikator + nilai terakhir tiap indikator (dari
 * pf_data_points). Indikator tanpa titik data tetap tampil dengan
 * nilai null — halaman menandainya jujur, bukan mengarang angka.
 */
export async function getIndikatorDenganNilai(): Promise<IndikatorDenganNilai[]> {
  try {
    const supabase = await createClient();
    const { data: indikator, error: errInd } = await supabase
      .from("pf_data_indicators")
      .select(
        "id, nama, slug, kategori, satuan, sumber_nama, sumber_url, " +
          "metodologi, tanggal_pembaruan, ringkasan_tren",
      )
      .order("nama", { ascending: true });
    if (errInd || !indikator) return [];
    const rows = indikator as unknown as (Omit<
      IndikatorDenganNilai,
      "nilai_terakhir" | "tanggal_nilai_terakhir"
    > & { id: string })[];

    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return [];
    const { data: titik, error: errTitik } = await supabase
      .from("pf_data_points")
      .select("indikator_id, tanggal, nilai")
      .in("indikator_id", ids)
      .order("tanggal", { ascending: false })
      .limit(5000);
    if (errTitik || !titik) {
      return rows.map((r) => ({
        ...r,
        nilai_terakhir: null,
        tanggal_nilai_terakhir: null,
      }));
    }
    const terbaru = new Map<
      string,
      { tanggal: string; nilai: number }
    >();
    for (const t of titik as {
      indikator_id: string;
      tanggal: string;
      nilai: number;
    }[]) {
      if (!terbaru.has(t.indikator_id)) {
        terbaru.set(t.indikator_id, { tanggal: t.tanggal, nilai: t.nilai });
      }
    }
    return rows.map((r) => ({
      ...r,
      nilai_terakhir: terbaru.get(r.id)?.nilai ?? null,
      tanggal_nilai_terakhir: terbaru.get(r.id)?.tanggal ?? null,
    }));
  } catch {
    return [];
  }
}

export type EventRutin = {
  id: string;
  judul: string;
  ringkasan: string | null;
  lokasi_teks: string | null;
  dimulai_pada: string;
  dampak: string | null;
  sumber_url: string | null;
};

/** Event yang dimulai pada satu tanggal WIB. */
export async function getEventPadaTanggal(
  tanggal: string,
): Promise<EventRutin[]> {
  try {
    const { awal, akhir } = batasHariWib(tanggal);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_events")
      .select("id, judul, ringkasan, lokasi_teks, dimulai_pada, dampak, sumber_url")
      .gte("dimulai_pada", awal)
      .lt("dimulai_pada", akhir)
      .order("dimulai_pada", { ascending: true });
    if (error || !data) return [];
    return data as EventRutin[];
  } catch {
    return [];
  }
}

/** Format tanggal YYYY-MM-DD menjadi "Senin, 16 November 2026" (WIB). */
export function formatTanggalPanjang(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/** Format tanggal YYYY-MM-DD menjadi "16 November 2026" (WIB). */
export function formatTanggalSingkat(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/** Format angka gaya Indonesia (bulat tanpa desimal, pecahan 2 desimal). */
export function formatAngkaRutin(nilai: number): string {
  const bulat = Number.isInteger(nilai);
  return nilai.toLocaleString("id-ID", {
    minimumFractionDigits: bulat ? 0 : 2,
    maximumFractionDigits: bulat ? 0 : 2,
  });
}
