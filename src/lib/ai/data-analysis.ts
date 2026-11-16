// Langkah Data Analysis PRATA FAKTA (ke-10 dari 10 langkah
// pipeline deterministik) — DETERMINISTIK, tanpa LLM.
// Untuk tiap indikator di pf_data_indicators yang punya >= 2 titik
// data di pf_data_points, hitung dari angka NYATA: nilai terakhir,
// nilai sebelumnya, selisih + persen perubahan, min, maks, lalu tulis
// ringkasan_tren Bahasa Indonesia ke pf_data_indicators. Indikator
// dengan < 2 poin dilewati dengan alasan (tidak ada ringkasan
// karangan). Setiap indikator menulis SATU baris pf_ai_runs
// (agen 'data_analysis', input_ref = slug indikator).
// Pembacaan data memakai service role (createServiceClient) karena
// AiAdapter tidak menyediakan akses tabel data; pencatatan run
// memakai adapter (catatRun/tutupRun) seperti agen lain.
import { createServiceClient } from "../supabase/service.ts";
import { buatSupabaseAiAdapter } from "./supabase-adapter.ts";
import type { AiAdapter, DipicuOleh } from "./types.ts";

export interface HasilDataAnalysis {
  diproses: number;
  berhasil: number;
  dilewati: number;
  gagal: number;
}

export interface OpsiDataAnalysis {
  dipicu_oleh?: DipicuOleh;
}

interface Indikator {
  id: string;
  nama: string;
  slug: string;
  kategori: string | null;
  satuan: string | null;
}

interface TitikData {
  indikator_id: string;
  tanggal: string;
  nilai: number;
}

// Ambang label tren (persen perubahan): naik bila >= +1, turun bila
// <= -1, stabil bila di antaranya.
const AMBANG_TREN_PERSEN = 1;

/** Format angka gaya Indonesia: bulat tanpa desimal, pecahan 2 desimal. */
export function formatAngkaId(nilai: number): string {
  const bulat = Number.isInteger(nilai);
  return nilai.toLocaleString("id-ID", {
    minimumFractionDigits: bulat ? 0 : 2,
    maximumFractionDigits: bulat ? 0 : 2,
  });
}

/** Format tanggal YYYY-MM-DD menjadi "1 November 2026". */
export function formatTanggalId(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

export type LabelTren = "naik" | "turun" | "stabil";

/** Label tren deterministik dari persen perubahan (null bila tak terhitung). */
export function labelTrenDariPersen(
  persen: number | null,
  selisih: number,
): LabelTren {
  if (persen === null) {
    if (selisih > 0) return "naik";
    if (selisih < 0) return "turun";
    return "stabil";
  }
  if (persen >= AMBANG_TREN_PERSEN) return "naik";
  if (persen <= -AMBANG_TREN_PERSEN) return "turun";
  return "stabil";
}

export interface HitunganIndikator {
  nilaiTerakhir: number;
  tanggalTerakhir: string;
  nilaiSebelumnya: number;
  tanggalSebelumnya: string;
  selisih: number;
  persen: number | null;
  min: number;
  maks: number;
  tren: LabelTren;
  ringkasan: string;
}

/**
 * Hitung statistik + ringkasan tren dari titik-titik data yang SUDAH
 * terurut menaik berdasarkan tanggal. Minimal 2 titik. Semua angka
 * ringkasan berasal dari data — tidak ada karangan.
 */
export function hitungIndikator(
  indikator: Indikator,
  titikTerurut: TitikData[],
): HitunganIndikator {
  const terakhir = titikTerurut[titikTerurut.length - 1];
  const sebelumnya = titikTerurut[titikTerurut.length - 2];
  const nilai = titikTerurut.map((t) => t.nilai);
  const min = Math.min(...nilai);
  const maks = Math.max(...nilai);
  const selisih = terakhir.nilai - sebelumnya.nilai;
  const persen =
    sebelumnya.nilai !== 0
      ? (selisih / Math.abs(sebelumnya.nilai)) * 100
      : null;
  const tren = labelTrenDariPersen(persen, selisih);

  const satuan = indikator.satuan ? ` ${indikator.satuan}` : "";
  const kataTren = tren === "naik" ? "Naik" : tren === "turun" ? "Turun" : "Stabil";
  const persenTeks =
    persen === null
      ? ""
      : ` (${persen >= 0 ? "+" : ""}${formatAngkaId(persen)}%)`;
  const ringkasan =
    `Nilai terakhir ${formatAngkaId(terakhir.nilai)}${satuan} pada ` +
    `${formatTanggalId(terakhir.tanggal)}, ${kataTren.toLowerCase()} ` +
    `${formatAngkaId(Math.abs(selisih))}${satuan} dari ` +
    `${formatAngkaId(sebelumnya.nilai)}${satuan} pada ` +
    `${formatTanggalId(sebelumnya.tanggal)}${persenTeks}. ` +
    `Tertinggi ${formatAngkaId(maks)}${satuan}, terendah ${formatAngkaId(min)}${satuan}.`;

  return {
    nilaiTerakhir: terakhir.nilai,
    tanggalTerakhir: terakhir.tanggal,
    nilaiSebelumnya: sebelumnya.nilai,
    tanggalSebelumnya: sebelumnya.tanggal,
    selisih,
    persen,
    min,
    maks,
    tren,
    ringkasan,
  };
}

export async function jalankanDataAnalysis(
  adapter?: AiAdapter,
  opsi: OpsiDataAnalysis = {},
): Promise<HasilDataAnalysis> {
  const agen = adapter ?? buatSupabaseAiAdapter();
  const dipicuOleh: DipicuOleh = opsi.dipicu_oleh ?? "manual";

  // Service client untuk tabel data (v6). Gagal di sini (key belum
  // diatur / tabel belum ada) dilempar agar route menjawab 503 jujur.
  const service = createServiceClient();

  const { data: indikatorRows, error: errIndikator } = await service
    .from("pf_data_indicators")
    .select("id, nama, slug, kategori, satuan")
    .order("nama", { ascending: true });
  if (errIndikator) {
    throw new Error(
      `Data Analysis gagal membaca pf_data_indicators: ${errIndikator.message}`,
    );
  }
  const indikator = (indikatorRows ?? []) as Indikator[];

  const { data: titikRows, error: errTitik } = await service
    .from("pf_data_points")
    .select("indikator_id, tanggal, nilai")
    .order("tanggal", { ascending: true });
  if (errTitik) {
    throw new Error(
      `Data Analysis gagal membaca pf_data_points: ${errTitik.message}`,
    );
  }
  const titik = (titikRows ?? []) as TitikData[];

  const perIndikator = new Map<string, TitikData[]>();
  for (const t of titik) {
    const daftar = perIndikator.get(t.indikator_id) ?? [];
    daftar.push(t);
    perIndikator.set(t.indikator_id, daftar);
  }

  const hasil: HasilDataAnalysis = {
    diproses: indikator.length,
    berhasil: 0,
    dilewati: 0,
    gagal: 0,
  };

  for (const ind of indikator) {
    const mulai = Date.now();
    const runId = await agen.catatRun({
      agen: "data_analysis",
      input_ref: ind.slug,
      input_jenis: "lain",
      dipicu_oleh: dipicuOleh,
    });
    try {
      const daftar = (perIndikator.get(ind.id) ?? []).sort((a, b) =>
        a.tanggal.localeCompare(b.tanggal),
      );
      if (daftar.length < 2) {
        await agen.tutupRun(runId, {
          status: "dilewati",
          durasi_ms: Date.now() - mulai,
          error: `Dilewati: hanya ${daftar.length} titik data (butuh minimal 2).`,
          detail: {
            indikator: ind.nama,
            slug: ind.slug,
            jumlah_poin: daftar.length,
            alasan: "titik_data_kurang_dari_2",
          },
        });
        hasil.dilewati += 1;
        continue;
      }

      const hitung = hitungIndikator(ind, daftar);

      const { error: errUpdate } = await service
        .from("pf_data_indicators")
        .update({ ringkasan_tren: hitung.ringkasan })
        .eq("id", ind.id);
      if (errUpdate) {
        throw new Error(
          `Gagal menulis ringkasan_tren untuk ${ind.slug}: ${errUpdate.message}`,
        );
      }

      await agen.tutupRun(runId, {
        status: "berhasil",
        durasi_ms: Date.now() - mulai,
        output_ref: ind.slug,
        detail: {
          indikator: ind.nama,
          slug: ind.slug,
          jumlah_poin: daftar.length,
          nilai_terakhir: hitung.nilaiTerakhir,
          tanggal_terakhir: hitung.tanggalTerakhir,
          nilai_sebelumnya: hitung.nilaiSebelumnya,
          tanggal_sebelumnya: hitung.tanggalSebelumnya,
          selisih: hitung.selisih,
          persen_perubahan: hitung.persen,
          min: hitung.min,
          maks: hitung.maks,
          tren: hitung.tren,
          ringkasan_tren: hitung.ringkasan,
        },
      });
      hasil.berhasil += 1;
    } catch (err) {
      const pesan =
        err instanceof Error ? err.message : "kesalahan tidak diketahui";
      try {
        await agen.tutupRun(runId, {
          status: "gagal",
          durasi_ms: Date.now() - mulai,
          error: pesan,
          detail: { indikator: ind.nama, slug: ind.slug },
        });
      } catch {
        // Run sudah tercatat 'berjalan' dan gagal ditutup: jangan
        // sembunyikan error aslinya.
      }
      hasil.gagal += 1;
    }
  }

  return hasil;
}
