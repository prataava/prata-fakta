import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";

// Halaman dirender per request (`instant = false`), BUKAN prerender
// statis — 17 Nov 2026 (fitur izin browser, pola /jelajahi): sebagai
// halaman statis murni, skrip bootstrap $RC React ikut terpanggang
// TANPA nonce ke shell statis; CSP memblokirnya → $RC undefined →
// hidrasi gagal (#419) → isi halaman ganda di DOM (h1=2, terbukti
// sapuan CDP). Dengan `instant = false` + connection(), render
// terjadi per request dalam konteks nonce proxy dan $RC membawa
// nonce. JANGAN hapus tanpa menguji ulang /data/live di CDP
// (h1 harus = 1, tanpa $RC error).
export const instant = false;

export const metadata: Metadata = {
  title: "Data Live",
  description:
    "Data live gratis dari API publik: gempa dan cuaca BMKG, cuaca dunia, kurs, jadwal sholat dan Hijriah, Al-Qur'an, hadis, wilayah Indonesia, dan geocoding — semua diambil langsung dari sumbernya.",
};

// Hub statis: daftar kartu menuju tiap fitur Data Live.
const FITUR: {
  href: string;
  nama: string;
  sumber: string;
  keterangan: string;
}[] = [
  {
    href: "/data/live/gempa",
    nama: "Gempa Terkini",
    sumber: "BMKG",
    keterangan:
      "Gempa terbaru dan daftar gempa terkini di Indonesia, lengkap dengan magnitudo, kedalaman, dan wilayah dirasakan.",
  },
  {
    href: "/data/live/cuaca",
    nama: "Cuaca BMKG",
    sumber: "BMKG",
    keterangan:
      "Prakiraan cuaca per desa dari BMKG — pilih provinsi sampai desa, lihat suhu dan cuaca per 3 jam.",
  },
  {
    href: "/data/live/cuaca-dunia",
    nama: "Cuaca Dunia",
    sumber: "Open-Meteo",
    keterangan:
      "Cuaca saat ini dan 7 hari ke depan untuk kota mana pun di dunia, dari model cuaca terbuka Open-Meteo.",
  },
  {
    href: "/data/live/kurs",
    nama: "Kurs Mata Uang",
    sumber: "Frankfurter (ECB)",
    keterangan:
      "Konverter kurs dan tabel nilai tukar terhadap rupiah dari kurs referensi Bank Sentral Eropa.",
  },
  {
    href: "/data/live/sholat",
    nama: "Jadwal Sholat",
    sumber: "MyQuran",
    keterangan:
      "Jadwal sholat harian per kota di Indonesia — imsak, subuh, dzuhur, ashar, maghrib, dan isya.",
  },
  {
    href: "/data/live/sholat",
    nama: "Tanggal Hijriah",
    sumber: "MyQuran",
    keterangan:
      "Tanggal Hijriah hari ini, ditampilkan bersama jadwal sholat.",
  },
  {
    href: "/data/live/quran",
    nama: "Al-Qur'an",
    sumber: "api.quran.gading.dev",
    keterangan:
      "Daftar 114 surah dan baca tiap surah — teks Arab, transliterasi, dan terjemahan Indonesia.",
  },
  {
    href: "/data/live/hadis",
    nama: "Hadis",
    sumber: "MyQuran API",
    keterangan:
      "42 hadis Arbain Nawawi — teks Arab beserta terjemahannya. Bila sumber sedang tidak dapat dijangkau, halaman menampilkan korpus terverifikasi (3 hadis) dan mengatakannya dengan jujur.",
  },
  {
    href: "/data/live/wilayah",
    nama: "Wilayah Indonesia",
    sumber: "Emsifa",
    keterangan:
      "Penjelajah wilayah Indonesia: provinsi, kabupaten/kota, kecamatan, sampai desa.",
  },
  {
    href: "/data/live/geocoding",
    nama: "Alamat ke Koordinat",
    sumber: "Nominatim / OpenStreetMap",
    keterangan:
      "Cari alamat apa pun dan dapatkan koordinat lintang-bujurnya.",
  },
];

export default async function DataLive() {
  // Render per request (bukan prerender statis): connection()
  // memaksa halaman dirender dalam konteks request sehingga skrip
  // bootstrap $RC React membawa nonce proxy (lihat komentar
  // `instant = false` di atas — tanpa ini saja halaman tetap
  // ter-prerender dan $RC tetap tanpa nonce).
  await connection();
  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-data-live">
        <p className="hero-label">Data · Live · Gratis</p>
        <h1 id="judul-data-live">
          Data live, <em>langsung dari sumbernya.</em>
        </h1>
        <p className="hero-teks">
          Sepuluh API publik gratis — gempa, cuaca, kurs, jadwal sholat,
          Al-Qur&apos;an, hadis, wilayah, dan geocoding — masing-masing jadi
          fitur tersendiri di bawah. Data diambil langsung dari sumbernya
          saat halaman dibuka (dengan cache), dan bila sumber sedang mati,
          halaman memberitahukannya — tanpa angka karangan.
        </p>
      </section>

      <section className="seksi" aria-labelledby="judul-fitur">
        <div className="seksi-kepala">
          <h2 id="judul-fitur">Sepuluh fitur</h2>
        </div>
        <div className="grid-berita">
          {FITUR.map((f) => (
            <Link key={`${f.href}-${f.nama}`} className="kartu" href={f.href}>
              <span className="kartu-kategori">{f.sumber}</span>
              <span className="kartu-judul">{f.nama}</span>
              <span className="kartu-teks">{f.keterangan}</span>
            </Link>
          ))}
        </div>
      </section>

      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Aturan tiap sumber dihormati: batas request, cache, dan atribusi.
        Data live bukan bagian dari arsip berita terverifikasi PRATA FAKTA —
        ia ditampilkan apa adanya dari penyedia datanya.
      </p>
    </div>
  );
}
