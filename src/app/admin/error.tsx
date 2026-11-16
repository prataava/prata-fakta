// Error boundary khusus admin (F-T1): sama seperti error root,
// tapi tautan kembali mengarah ke Dashboard Admin.
"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorAdmin({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="kartu-form" role="alert">
      <h2>Terjadi kesalahan</h2>
      <p>
        Maaf, halaman admin ini gagal dimuat. Coba muat lagi — bila
        masih gagal, kembali ke Dashboard Admin.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button
          type="button"
          className="tombol tombol-primer"
          onClick={() => retry()}
        >
          Coba lagi
        </button>
        <Link className="tombol" href="/admin">
          Dashboard Admin
        </Link>
        <Link className="tombol" href="/">
          Beranda
        </Link>
      </div>
    </div>
  );
}
