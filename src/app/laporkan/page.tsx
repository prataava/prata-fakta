import type { Metadata } from "next";
import { connection } from "next/server";
import FormLaporanPublik from "@/components/laporan/FormLaporanPublik";

export const metadata: Metadata = {
  title: "Laporkan",
  description:
    "Laporkan kesalahan informasi, sumber tidak valid, gambar tidak sesuai, berita duplikat, atau artikel yang perlu diperbarui ke redaksi PRATA FAKTA.",
};

export const instant = false;

// 17 Nov 2026 (perbaikan CSP $RT/$RV): halaman ini statis murni
// (formulir dimuat klien) — TANPA connection(), boundary loading.tsx
// root selesai di shell prerender sehingga skrip definisi $RV/$RC
// React terpanggang TANPA nonce; CSP memblokir → $RC undefined →
// hidrasi gagal (#419) → isi ganda (h1=2). connection() menunda
// segmen halaman sampai request, jadi definisi $RV/$RC diterbitkan
// saat resume DENGAN nonce. JANGAN hapus connection() tanpa menguji
// ulang halaman ini di CDP.
export default async function Laporkan() {
  await connection();
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
