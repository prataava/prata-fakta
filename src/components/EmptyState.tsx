import type { ReactNode } from "react";

// Empty state jujur: dipakai di semua seksi yang belum punya data.
// Tidak pernah menampilkan angka atau artikel palsu.
export default function EmptyState({
  judul,
  pesan,
  aksi,
}: {
  judul: string;
  pesan: string;
  aksi?: ReactNode;
}) {
  return (
    <div className="kosong" role="status">
      <h3>{judul}</h3>
      <p>{pesan}</p>
      {aksi}
    </div>
  );
}
