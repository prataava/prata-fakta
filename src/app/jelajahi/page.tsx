import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Jelajahi",
  description:
    "Indeks semua halaman PRATA FAKTA: berita, data, belajar, dan akun Anda — semua rute terjangkau dari satu tempat.",
};

// Indeks statis semua rute publik (F-S6): nav bawah mobile hanya
// memuat 6 pintu — "Lainnya" membuka halaman ini agar semua rute
// tetap terjangkau dari HP. Halaman statis (tanpa data).
const GRUP: {
  judul: string;
  deskripsi: string;
  tautan: { href: string; label: string; keterangan: string }[];
}[] = [
  {
    judul: "Berita",
    deskripsi: "Berita terverifikasi, arsip, dan ringkasan harian.",
    tautan: [
      { href: "/", label: "Beranda", keterangan: "Berita terbaru." },
      { href: "/brief", label: "Daily Brief", keterangan: "Ringkasan harian." },
      { href: "/arsip", label: "Arsip", keterangan: "Semua artikel terbit." },
      { href: "/kategori", label: "Kategori", keterangan: "Berita per kategori." },
      { href: "/cari", label: "Pencarian", keterangan: "Cari artikel, kategori, dan sumber." },
      { href: "/timeline", label: "Timeline", keterangan: "Kronologi peristiwa." },
      { href: "/cerita", label: "Cerita", keterangan: "Peristiwa yang diikuti perkembangannya." },
      { href: "/sejarah", label: "Arsip Sejarah", keterangan: "Peristiwa lampau per tahun dan era." },
    ],
  },
  {
    judul: "Data & Pengetahuan",
    deskripsi: "Angka, peta, riset, dan penjelasan dunia.",
    tautan: [
      { href: "/data", label: "Data", keterangan: "Indikator nasional dan dunia." },
      { href: "/peta", label: "Peta", keterangan: "Peristiwa di peta dunia." },
      { href: "/riset", label: "Riset", keterangan: "Laporan riset berbasis data." },
      { href: "/pengetahuan", label: "Pengetahuan", keterangan: "Artikel pengetahuan dan explainer." },
      { href: "/negara", label: "Negara", keterangan: "Profil negara." },
    ],
  },
  {
    judul: "Belajar",
    deskripsi: "Kursus, kuis, tanya jawab, dan podcast.",
    tautan: [
      { href: "/akademi", label: "Akademi", keterangan: "Kursus belajar." },
      { href: "/kuis", label: "Kuis", keterangan: "Kuis harian." },
      { href: "/tanya", label: "Tanya", keterangan: "Tanya jawab seputar berita." },
      { href: "/podcast", label: "Podcast", keterangan: "Episode audio." },
    ],
  },
  {
    judul: "Rutin",
    deskripsi: "Ringkasan dan rekap berkala.",
    tautan: [
      { href: "/rutin", label: "Konten Rutin", keterangan: "Semua edisi rutin." },
      { href: "/rutin/mingguan", label: "Ringkasan Mingguan", keterangan: "Konten 7 hari terakhir." },
      { href: "/rutin/bulanan", label: "Rekap Bulanan", keterangan: "Konten 30 hari terakhir." },
      { href: "/rutin/dunia", label: "Dunia Dijelaskan", keterangan: "Negara, geografi, dan berita dunia." },
      { href: "/rutin/hari-ini", label: "Hari Ini", keterangan: "Peristiwa dan artikel hari ini." },
    ],
  },
  {
    judul: "Saya",
    deskripsi: "Akun dan konten personal Anda.",
    tautan: [
      { href: "/saya", label: "Saya", keterangan: "Dasbor, profil, dan pengaturan akun." },
      { href: "/feed-saya", label: "Feed Saya", keterangan: "Artikel dari topik yang Anda ikuti." },
      { href: "/laporkan", label: "Laporkan", keterangan: "Laporkan kesalahan ke redaksi." },
      { href: "/laporkan/lacak", label: "Lacak Laporan", keterangan: "Periksa status laporan Anda." },
    ],
  },
];

export default function Jelajahi() {
  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-jelajahi">
        <span className="hero-label">Indeks situs</span>
        <h1 id="judul-jelajahi">Jelajahi PRATA FAKTA</h1>
        <p>
          Semua halaman dalam satu tempat — bila tidak menemukannya di
          navigasi atas atau bawah, carilah di sini.
        </p>
      </section>

      {GRUP.map((grup) => (
        <section
          className="seksi"
          aria-labelledby={`seksi-jelajahi-${grup.judul}`}
          key={grup.judul}
        >
          <div className="seksi-kepala">
            <h2 id={`seksi-jelajahi-${grup.judul}`}>{grup.judul}</h2>
            <p>{grup.deskripsi}</p>
          </div>
          <div className="grid-berita">
            {grup.tautan.map((item) => (
              <Link
                key={item.href}
                className="kartu kartu-artikel"
                href={item.href}
              >
                <span className="kartu-kategori">{grup.judul}</span>
                <span className="kartu-judul">{item.label}</span>
                <span className="kartu-teks">{item.keterangan}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
