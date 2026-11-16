import type { ReactNode } from "react";

// Empty state jujur: dipakai di semua seksi yang belum punya data.
// Tidak pernah menampilkan angka atau artikel palsu.
// Varian (Fase 9 Aurora): "kosong" (default), "error", "izin"
// (butuh login/hak akses), "tak-tersedia" (404/fitur belum ada),
// "memuat" (titik berdenyut — untuk status muat sebaris; skeleton
// halaman memakai .kerangka di loading.tsx).
export default function EmptyState({
  judul,
  pesan,
  aksi,
  varian = "kosong",
}: {
  judul: string;
  pesan: string;
  aksi?: ReactNode;
  varian?: "kosong" | "error" | "izin" | "tak-tersedia" | "memuat";
}) {
  return (
    <div
      className={`kosong${varian === "kosong" ? "" : ` kosong--${varian}`}`}
      role="status"
    >
      <h3>{judul}</h3>
      <p>{pesan}</p>
      {aksi}
    </div>
  );
}
