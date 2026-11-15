import type { Metadata } from "next";
import FormLaporanPublik from "@/components/laporan/FormLaporanPublik";

export const metadata: Metadata = {
  title: "Laporkan",
  description:
    "Laporkan kesalahan informasi, sumber tidak valid, gambar tidak sesuai, berita duplikat, atau artikel yang perlu diperbarui ke redaksi PRATA FAKTA.",
};

export const instant = false;

export default function Laporkan() {
  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-laporkan">
        <span className="hero-label">Laporan Masyarakat</span>
        <h1 id="judul-laporkan">Laporkan ke Redaksi</h1>
        <p>
          Menemukan kesalahan informasi, sumber yang tidak valid, gambar
          yang tidak sesuai, berita duplikat, atau artikel yang perlu
          diperbarui? Laporkan di sini — boleh anonim. Setiap laporan
          ditinjau redaksi sebelum diproses, dan Anda menerima nomor
          lacak untuk memeriksa statusnya.
        </p>
      </section>
      <FormLaporanPublik />
    </div>
  );
}
