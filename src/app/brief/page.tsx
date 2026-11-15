import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";

export const metadata: Metadata = {
  title: "Daily Brief",
  description:
    "Ringkasan harian berita terpenting Indonesia dan dunia, dibuat setiap pagi oleh agen Daily Brief PRATA FAKTA.",
};

export default function Brief() {
  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-brief">
        <span className="hero-label">Setiap pagi</span>
        <h1 id="judul-brief">Daily Brief</h1>
        <p>
          Ringkasan harian berita terpenting Indonesia dan dunia: berita
          terpenting, ekonomi hari ini, teknologi hari ini, sains dan
          penemuan, serta isu yang sedang berkembang. Setiap butir memuat
          judul, ringkasan, waktu, lokasi, kategori, sumber, status
          verifikasi, dan tautan artikel lengkap.
        </p>
      </section>

      <section className="seksi">
        <EmptyState
          judul="Daily Brief pertama belum terbit"
          pesan="Daily Brief disusun setiap pagi oleh agen Daily Brief (Fase 4) dari artikel yang sudah terverifikasi. Karena mesin berita (Fase 3) belum berjalan, belum ada edisi yang diterbitkan. Daftarkan email Anda di bawah agar edisi pertama langsung terkirim begitu terbit."
          aksi={
            <Link className="tombol tombol-primer" href="/#seksi-newsletter">
              Berlangganan newsletter
            </Link>
          }
        />
      </section>

      <section className="seksi" aria-labelledby="seksi-isi-brief">
        <div className="seksi-kepala">
          <h2 id="seksi-isi-brief">Isi setiap edisi</h2>
        </div>
        <div className="grid-berita">
          {[
            { j: "Indonesia", t: "Berita terpenting dari Indonesia hari ini." },
            { j: "Dunia", t: "Berita terpenting dunia hari ini." },
            { j: "Ekonomi", t: "Inflasi, nilai tukar, dan pasar hari ini." },
            { j: "Teknologi", t: "Perkembangan teknologi dan AI hari ini." },
            { j: "Sains", t: "Penelitian dan penemuan terbaru." },
            { j: "Isu Berkembang", t: "Peristiwa yang sedang dipantau redaksi." },
          ].map((b) => (
            <div key={b.j} className="kartu">
              <span className="kartu-kategori">{b.j}</span>
              <span className="kartu-teks">{b.t}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
