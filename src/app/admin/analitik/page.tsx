import type { Metadata } from "next";
import EmptyState from "@/components/EmptyState";

export const metadata: Metadata = {
  title: "Traffic Analytics — Admin",
  description:
    "Analitik lalu lintas belum tersedia: belum ada layanan analitik terpasang.",
};

export const instant = false;

export default function AdminAnalitik() {
  return (
    <section className="seksi" aria-label="Analitik belum tersedia">
      <EmptyState
        judul="Belum tersedia — belum ada layanan analitik terpasang"
        pesan="PRATA FAKTA tidak memasang layanan analitik lalu lintas apa pun (tidak ada Plausible, Umami, Google Analytics, atau sejenisnya), dan tidak ada tabel yang menyimpan kunjungan halaman. Karena itu halaman ini TIDAK menampilkan angka kunjungan, pengunjung, atau halaman populer — angka semacam itu akan palsu."
      />
      <p>
        Yang tersedia saat ini (angka nyata, dari tabel sendiri):
      </p>
      <ul className="artikel-daftar">
        <li>
          <a href="/admin/kinerja">/admin/kinerja</a> — artikel paling
          dibaca dari pf_reading_history (pengguna login yang membaca
          artikel).
        </li>
        <li>
          <a href="/admin/monitoring">/admin/monitoring</a> — run
          ingestion dan antrean item mentah.
        </li>
        <li>
          <a href="/admin/api-sehat">/admin/api-sehat</a> — status
          /api/health dan run terakhir.
        </li>
      </ul>
      <p className="artikel-meta-kecil">
        Bila pemilik memutuskan memasang layanan analitik (gratis,
        tanpa cookie pelacak bila memungkinkan), halaman ini diisi dari
        layanan itu — dan hanya dari layanan itu. Keputusan pemasangan
        belum ada.
      </p>
    </section>
  );
}
