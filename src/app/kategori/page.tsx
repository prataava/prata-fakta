import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { KATEGORI_UTAMA } from "@/lib/categories";

export const metadata: Metadata = {
  title: "Kategori Berita",
  description:
    "Jelajahi berita berdasarkan kategori: Indonesia, Dunia, Ekonomi, Teknologi, Sains, Pendidikan, Lingkungan & Energi, Fakta & Mitos, Data, dan Pengetahuan.",
};

// Halaman dirender per request (`instant = false` + connection() di
// bawah), BUKAN prerender statis — 17 Nov 2026 (perbaikan CSP
// $RT/$RV): sebagai halaman statis murni, boundary loading.tsx root
// selesai di shell prerender sehingga skrip definisi $RV/$RC React
// ikut terpanggang TANPA nonce; CSP (script-src nonce+hash)
// memblokirnya → $RC undefined → hidrasi gagal (#419) → isi halaman
// ganda di DOM (h1=2). connection() menunda segmen halaman sampai
// request, jadi definisi $RV/$RC diterbitkan saat resume DENGAN
// nonce. JANGAN hapus connection() tanpa menguji ulang /kategori di
// CDP (definisi $RV/$RC harus ber-nonce, h1 harus = 1).
export const instant = false;

export default async function DaftarKategori() {
  await connection();
  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-kategori">
        <span className="hero-label">Navigasi</span>
        <h1 id="judul-kategori">Kategori Berita</h1>
        <p>
          Sepuluh kanal redaksi PRATA FAKTA. Pilih kategori untuk melihat
          artikel, subkategori, dan arsipnya.
        </p>
      </section>
      <section className="seksi">
        <div className="grid-berita">
          {KATEGORI_UTAMA.map((k) => (
            <Link key={k.slug} className="kartu" href={`/kategori/${k.slug}`}>
              <span className="kartu-kategori">{k.nama}</span>
              <span className="kartu-judul">{k.deskripsi}</span>
              <span className="kartu-meta">
                {k.sub.length > 0
                  ? `${k.sub.length} subkategori: ${k.sub.map((s) => s.nama).join(", ")}`
                  : "Kanal khusus"}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
