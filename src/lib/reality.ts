// Reality Check PRATA FAKTA (Fase 8 Gelombang 2, area 5).
// Modul MURNI — hanya fungsi murni + tipe, TANPA import runtime
// apa pun (bahkan dynamic import): modul ini DIIMPOR komponen
// klien (PerbandinganPeriode), dan Turbopack mengikuti dynamic
// import() secara statis — satu rujukan ke modul server Supabase
// (yang memakai API khusus server) di sini menggagalkan build
// (terbukti di build pertama). Karena itu akses data server
// / getIndikatorAdmin) tinggal di halaman server yang memakainya
// (src/app/data/page.tsx, src/app/admin/data/page.tsx), BUKAN di
// sini. Prinsip: gagal-aman, tanpa angka karangan; perbandingan
// HANYA dari pf_data_points nyata.
import type { PfIndikator, PfPoinIndikator } from "./lanjutan";

export type CakupanIndikator = "indonesia" | "dunia";

/** PfIndikator + kolom perluasan v10 (cakupan/frekuensi/negara). */
export type PfIndikatorReality = PfIndikator & {
  cakupan: CakupanIndikator;
  frekuensi_update: string | null;
  negara_kode: string | null;
};

export type HasilPerbandinganPeriode = {
  /** false bila data belum cukup (alasan diisi jujur). */
  cukup: boolean;
  tahunA: number;
  tahunB: number;
  /** Nilai titik TERAKHIR di tahun itu; null bila tahun tak punya titik. */
  nilaiA: number | null;
  tanggalA: string | null;
  nilaiB: number | null;
  tanggalB: string | null;
  /** nilaiB - nilaiA; null bila tak cukup data. */
  selisih: number | null;
  /** Persen perubahan terhadap |nilaiA|; null bila nilaiA = 0 / tak cukup data. */
  persen: number | null;
  /** Penjelasan jujur bila cukup = false; null bila cukup. */
  alasan: string | null;
};

/**
 * Tahun-tahun berbeda yang ada di titik-titik data, menaik.
 * Fungsi murni (dipakai pemilih tahun di PerbandinganPeriode).
 */
export function daftarTahun(points: PfPoinIndikator[]): number[] {
  const tahun = new Set<number>();
  for (const p of points) {
    const t = Number(String(p.tanggal).slice(0, 4));
    if (Number.isInteger(t)) tahun.add(t);
  }
  return [...tahun].sort((a, b) => a - b);
}

/** Titik terakhir (tanggal terbesar) dalam satu tahun, atau null. */
function titikTerakhirTahun(
  pointsTerurut: PfPoinIndikator[],
  tahun: number,
): PfPoinIndikator | null {
  const awalan = `${tahun}-`;
  let hasil: PfPoinIndikator | null = null;
  for (const p of pointsTerurut) {
    if (String(p.tanggal).startsWith(awalan)) hasil = p;
  }
  return hasil;
}

/**
 * Perbandingan periode dari titik-titik data NYATA (fungsi murni,
 * diekspos agar bisa diuji): bandingkan nilai titik terakhir
 * tahunA dengan titik terakhir tahunB.
 * - < 2 titik total -> cukup = false ("data belum cukup").
 * - Salah satu tahun tanpa titik -> cukup = false + alasan tahunnya.
 * - nilaiA = 0 -> persen null (tak terhitung, bukan 0 / karangan).
 */
export function hitungPerbandinganPeriode(
  points: PfPoinIndikator[],
  tahunA: number,
  tahunB: number,
): HasilPerbandinganPeriode {
  const dasar = {
    tahunA,
    tahunB,
    nilaiA: null as number | null,
    tanggalA: null as string | null,
    nilaiB: null as number | null,
    tanggalB: null as string | null,
    selisih: null as number | null,
    persen: null as number | null,
  };
  if (!Array.isArray(points) || points.length < 2) {
    return {
      ...dasar,
      cukup: false,
      alasan: `Data belum cukup: indikator ini baru punya ${Array.isArray(points) ? points.length : 0} titik data (butuh minimal satu titik di masing-masing tahun yang dibandingkan).`,
    };
  }
  const terurut = [...points].sort((a, b) =>
    String(a.tanggal).localeCompare(String(b.tanggal)),
  );
  const titikA = titikTerakhirTahun(terurut, tahunA);
  const titikB = titikTerakhirTahun(terurut, tahunB);
  if (!titikA || !titikB) {
    const hilang = [!titikA ? tahunA : null, !titikB ? tahunB : null].filter(
      (t): t is number => t !== null,
    );
    return {
      ...dasar,
      cukup: false,
      alasan: `Data belum cukup: tahun ${hilang.join(" dan ")} belum punya titik data.`,
    };
  }
  const selisih = titikB.nilai - titikA.nilai;
  const persen =
    titikA.nilai !== 0
      ? (selisih / Math.abs(titikA.nilai)) * 100
      : null;
  return {
    ...dasar,
    cukup: true,
    nilaiA: titikA.nilai,
    tanggalA: titikA.tanggal,
    nilaiB: titikB.nilai,
    tanggalB: titikB.tanggal,
    selisih,
    persen,
    alasan: null,
  };
}
