import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Konten Rutin",
  description:
    "Konten rutin PRATA FAKTA: ringkasan pagi, rekap mingguan dan bulanan, penjelasan dunia, angka Indonesia, dan peristiwa hari ini — semuanya dari data nyata.",
};

// Halaman indeks statis (tanpa data) — TETAP dirender per request
// (`instant = false` + connection() di bawah), BUKAN prerender —
// 17 Nov 2026 (perbaikan CSP $RT/$RV): sebagai halaman statis
// murni, boundary loading.tsx root selesai di shell prerender
// sehingga skrip definisi $RV/$RC React ikut terpanggang TANPA
// nonce; CSP (script-src nonce+hash) memblokirnya → $RC undefined
// → hidrasi gagal (#419) → isi halaman ganda di DOM (h1=2).
// connection() menunda segmen halaman sampai request, jadi definisi
// $RV/$RC diterbitkan saat resume DENGAN nonce. JANGAN hapus
// connection() tanpa menguji ulang halaman ini di CDP (definisi
// $RV/$RC harus ber-nonce, h1 harus = 1).
export const instant = false;
const DAFTAR: {
  href: string;
  judul: string;
  deskripsi: string;
}[] = [
  {
    // F-S3: /rutin/pagi dilebur ke /brief — indeks menaut langsung
    // ke permukaan sumbernya.
    href: "/brief",
    judul: "Ringkasan Pagi",
    deskripsi:
      "Ringkasan pagi dari Daily Brief terbaru: berita terpenting Indonesia dan dunia untuk memulai hari.",
  },
  {
    href: "/rutin/mingguan",
    judul: "Ringkasan Mingguan",
    deskripsi:
      "Artikel terbit dan Daily Brief dalam 7 hari terakhir — daftar dan tautan saja, tanpa ringkasan karangan.",
  },
  {
    href: "/rutin/bulanan",
    judul: "Rekap Bulanan",
    deskripsi:
      "Artikel terbit dan Daily Brief dalam 30 hari terakhir — rekap sebulan dalam satu halaman.",
  },
  {
    href: "/rutin/dunia",
    judul: "Dunia Dijelaskan",
    deskripsi:
      "Pengetahuan tentang negara dan geografi, ditambah artikel terbaru kategori Dunia.",
  },
  {
    // F-S3: /rutin/angka dilebur ke /data?cakupan=indonesia.
    href: "/data?cakupan=indonesia",
    judul: "Indonesia dalam Angka",
    deskripsi:
      "Indikator nasional dari data resmi: nilai terakhir, tren yang dihitung agen Data Analysis, sumber, dan metodologi.",
  },
  {
    href: "/rutin/hari-ini",
    judul: "Hari Ini",
    deskripsi:
      "Peristiwa yang dimulai hari ini dan artikel yang terbit hari ini (waktu Indonesia Barat).",
  },
];

export default async function Rutin() {
  await connection();
  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-rutin">
        <span className="hero-label">Konten rutin</span>
        <h1 id="judul-rutin">Konten Rutin</h1>
        <p>
          Ringkasan dan rekap yang terbit berkala, semuanya disusun dari
          data yang benar-benar ada di PRATA FAKTA — artikel terbit, Daily
          Brief, indikator data, dan peristiwa tercatat. Bila belum ada
          data, halaman menampilkan keadaan sebenarnya, bukan isi karangan.
        </p>
      </section>

      <section className="seksi" aria-labelledby="seksi-daftar-rutin">
        <div className="seksi-kepala">
          <h2 id="seksi-daftar-rutin">Pilih edisi rutin</h2>
        </div>
        <div className="grid-berita">
          {DAFTAR.map((item) => (
            <Link
              key={item.href}
              className="kartu kartu-artikel"
              href={item.href}
            >
              <span className="kartu-kategori">Konten rutin</span>
              <span className="kartu-judul">{item.judul}</span>
              <span className="kartu-teks">{item.deskripsi}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
