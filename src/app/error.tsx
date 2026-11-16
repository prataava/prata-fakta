// Error boundary root (F-T1): "use client" wajib (dokumen Next 16:
// error.tsx menerima { error, retry }). Pesan generik ke pengguna —
// detail galat hanya dicatat ke konsol, tidak ditampilkan.
"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
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
    <div className="wadah">
      <div className="kartu-form" role="alert">
        <h1>Terjadi kesalahan</h1>
        <p>
          Maaf, halaman ini gagal dimuat. Coba muat lagi — bila masih
          gagal, kembali ke Beranda atau hubungi redaksi.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button
            type="button"
            className="tombol tombol-primer"
            onClick={() => retry()}
          >
            Coba lagi
          </button>
          <Link className="tombol" href="/">
            Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
