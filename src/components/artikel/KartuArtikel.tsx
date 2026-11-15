import Link from "next/link";
import type { PfArtikelRingkas } from "@/lib/data";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";

// Kartu artikel — server-safe, dipakai beranda / arsip / kategori / cari.
// Seluruh kartu adalah tautan ke /artikel/[slug]. Tanpa foto dari situs
// berita: placeholder editorial (blok warna solid + label kategori).
export default function KartuArtikel({
  artikel,
  kategoriNama,
}: {
  artikel: PfArtikelRingkas;
  kategoriNama?: string | null;
}) {
  const kategori = kategoriNama ?? artikel.kategori_slug ?? "Umum";
  const tanggal = artikel.diterbitkan_pada
    ? new Date(artikel.diterbitkan_pada).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Tanggal belum tersedia";

  return (
    <Link className="kartu kartu-artikel" href={`/artikel/${artikel.slug}`}>
      <div className="placeholder-gambar" aria-hidden="true">
        <span>{kategori}</span>
      </div>
      <span className="kartu-kategori">
        {kategori} ·{" "}
        <span className={kelasLencanaStatus(artikel.status_verifikasi)}>
          {labelStatusVerifikasi(artikel.status_verifikasi)}
        </span>
      </span>
      <span className="kartu-judul">{artikel.judul}</span>
      {artikel.ringkasan && <span className="kartu-teks">{artikel.ringkasan}</span>}
      <span className="kartu-meta">{tanggal}</span>
    </Link>
  );
}
