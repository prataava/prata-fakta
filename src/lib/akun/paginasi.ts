// Paginasi penuh untuk ekspor data pengguna (Gelombang B2-A, A2).
//
// Ekspor pra-hapus WAJIB lengkap: batas 1000 baris/tabel di
// /api/saya/ekspor dihapus dengan membaca SEMUA halaman lewat
// .range() sampai satu halaman kembali kurang dari penuh.
// Batas keselamatan 100.000 baris/tabel HANYA penjaga agar satu
// tabel yang tumbuh tanpa batas tidak menggantung respons —
// bila kena, hasilnya ditandai terpotong: true (jujur, bukan
// diam-diam); secara praktis tidak terjangkau data pengguna.
//
// Berkas ini MURNI (tanpa import) agar bisa diuji langsung oleh
// baterai scripts/uji-ultimate-b2-akun.mjs tanpa server.
export const UKURAN_HALAMAN_EKSPOR = 1000;
export const BATAS_MAKS_EKSPOR_PER_TABEL = 100_000;

export type HasilPaginasi<T> = {
  baris: T[];
  /** false hanya bila batas keselamatan tercapai. */
  lengkap: boolean;
  terpotong: boolean;
};

/**
 * Baca semua halaman dari `ambilHalaman(dari, sampai)` — indeks
 * INKLUSIF di kedua ujung (kontrak .range() Supabase/PostgREST).
 * Berhenti bila satu halaman kembali kurang dari penuh (tanda
 * halaman terakhir) atau tidak ada baris sama sekali.
 */
export async function ambilSemuaHalaman<T>(
  ambilHalaman: (dari: number, sampai: number) => Promise<T[]>,
  opts: { ukuranHalaman?: number; batasMaks?: number } = {},
): Promise<HasilPaginasi<T>> {
  const ukuranHalaman = opts.ukuranHalaman ?? UKURAN_HALAMAN_EKSPOR;
  const batasMaks = opts.batasMaks ?? BATAS_MAKS_EKSPOR_PER_TABEL;
  const baris: T[] = [];
  let dari = 0;
  for (;;) {
    const halaman = await ambilHalaman(dari, dari + ukuranHalaman - 1);
    if (halaman.length === 0) break;
    baris.push(...halaman);
    if (baris.length >= batasMaks) {
      return {
        baris: baris.slice(0, batasMaks),
        lengkap: false,
        terpotong: true,
      };
    }
    if (halaman.length < ukuranHalaman) break;
    dari += ukuranHalaman;
  }
  return { baris, lengkap: true, terpotong: false };
}
