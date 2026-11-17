import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";

// Halaman fallback offline (P3-1). Dirender per request
// (`instant = false`), BUKAN prerender statis — pola yang sama
// dengan /kebijakan/metodologi: sebagai halaman statis murni,
// skrip bootstrap $RC React ikut terpanggang TANPA nonce ke shell
// statis, CSP memblokir skrip itu → hidrasi gagal (#419).
// Dengan `instant = false`, render terjadi per request dalam
// konteks nonce proxy dan hidrasi berhasil. Biaya: nyaris nol
// (teks statis tanpa DB). Halaman ini WAJIB masuk precache sw.js.
export const instant = false;

export const metadata: Metadata = {
  title: "Anda sedang offline",
  description:
    "Tidak ada koneksi internet. Artikel yang sudah dibuka sebelumnya tetap bisa dibaca.",
};

export default async function Offline() {
  await connection();
  return (
    <div className="wadah">
      <article className="prosa">
        <h1>Anda sedang offline</h1>
        <p>
          Tidak ada koneksi internet saat ini. Artikel yang sudah Anda buka
          sebelumnya tetap bisa dibaca — buka kembali dari riwayat browser
          atau dari perpustakaan Anda.
        </p>
        <p>
          <Link className="tombol tombol-primer" href="/">
            Kembali ke Beranda
          </Link>{" "}
          <Link className="tombol tombol-hantu" href="/perpustakaan">
            Buka Perpustakaan
          </Link>
        </p>
      </article>
    </div>
  );
}
