// Laporan masyarakat (Area 13, Fase 8 Gelombang 1) — konstanta
// bersama dipakai route API, formulir publik, dan admin.
// Jenis laporan masyarakat (5 nilai baru migrasi v8) — BERBEDA
// dari 4 jenis koreksi artikel lama (fakta_salah, sumber, typo,
// lainnya) yang tetap dipakai POST /api/laporan + FormLaporan.
export const JENIS_LAPORAN_PUBLIK = [
  "kesalahan_informasi",
  "sumber_tidak_valid",
  "gambar_tidak_sesuai",
  "duplikat",
  "perlu_pembaruan",
] as const;

export type JenisLaporanPublik = (typeof JENIS_LAPORAN_PUBLIK)[number];

export const LABEL_JENIS_LAPORAN_PUBLIK: Record<string, string> = {
  kesalahan_informasi: "Kesalahan informasi",
  sumber_tidak_valid: "Sumber tidak valid",
  gambar_tidak_sesuai: "Gambar tidak sesuai",
  duplikat: "Berita duplikat",
  perlu_pembaruan: "Artikel perlu diperbarui",
};

/** Nomor lacak laporan: 'PF-' + 8 karakter alfanumerik acak. */
export function buatNomorLacak(): string {
  const acak = crypto
    .randomUUID()
    .replace(/-/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return `PF-${acak.slice(0, 8)}`;
}

const POLA_NOMOR_LACAK = /^PF-[A-Z0-9]{8}$/;

export function nomorLacakValid(nomor: string): boolean {
  return POLA_NOMOR_LACAK.test(nomor);
}
