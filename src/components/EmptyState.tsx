import type { ReactNode } from "react";
import { t, TEKS_KOSONG, type Bahasa, type VarianKosong } from "@/lib/i18n";

// Empty state jujur: dipakai di semua seksi yang belum punya data.
// Tidak pernah menampilkan angka atau artikel palsu.
// Varian (Fase 9 Aurora): "kosong" (default), "error", "izin"
// (butuh login/hak akses), "tak-tersedia" (404/fitur belum ada),
// "memuat" (titik berdenyut — untuk status muat sebaris; skeleton
// halaman memakai .kerangka di loading.tsx).
// P3-3: judul/pesan menjadi OPSIONAL — bila tidak diberikan,
// dipakai teks baku varian dari kamus dalam `bahasa` (default
// "id"). Pemakaian lama (judul+pesan eksplisit) TIDAK berubah:
// string eksplisit selalu menang. Artinya: EmptyState baru
// menerjemahkan dirinya sendiri bila pemanggil memakai teks baku;
// pemanggil yang masih mengoper string Indonesia eksplisit tetap
// tampil Indonesia — migrasi pemanggil itu pekerjaan integrator
// (contoh yang sudah memakai kamus: /cari).
export default function EmptyState({
  judul,
  pesan,
  aksi,
  varian = "kosong",
  bahasa = "id",
}: {
  judul?: string;
  pesan?: string;
  aksi?: ReactNode;
  varian?: VarianKosong;
  bahasa?: Bahasa;
}) {
  const teks = TEKS_KOSONG[varian];
  return (
    <div
      className={`kosong${varian === "kosong" ? "" : ` kosong--${varian}`}`}
      role="status"
    >
      <h3>{judul ?? t(bahasa, teks.judul)}</h3>
      <p>{pesan ?? t(bahasa, teks.pesan)}</p>
      {aksi}
    </div>
  );
}
