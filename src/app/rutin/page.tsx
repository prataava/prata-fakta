import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Konten Rutin",
  description:
    "Konten rutin PRATA FAKTA: ringkasan pagi, rekap mingguan dan bulanan, penjelasan dunia, angka Indonesia, dan peristiwa hari ini — semuanya dari data nyata.",
};

// Halaman indeks statis (tanpa data): boleh di-prerender.
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

export default function Rutin() {
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
