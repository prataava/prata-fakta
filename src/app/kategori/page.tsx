import type { Metadata } from "next";
import Link from "next/link";
import { KATEGORI_UTAMA } from "@/lib/categories";

export const metadata: Metadata = {
  title: "Kategori Berita",
  description:
    "Jelajahi berita berdasarkan kategori: Indonesia, Dunia, Ekonomi, Teknologi, Sains, Pendidikan, Lingkungan & Energi, Fakta & Mitos, Data, dan Pengetahuan.",
};

export default function DaftarKategori() {
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
