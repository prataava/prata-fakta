import type { PfArtikelRingkas } from "@/lib/data";
import { formatTanggal } from "@/lib/format";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";
import Kartu from "@/components/Kartu";

// Kartu artikel — server-safe, dipakai beranda / arsip / kategori / cari.
// Seluruh kartu adalah tautan ke /artikel/[slug]. Tanpa foto dari situs
// berita: placeholder editorial (blok warna solid + label kategori).
export default function KartuArtikel({
  artikel,
  kategoriNama,
  fitur,
}: {
  artikel: PfArtikelRingkas;
  kategoriNama?: string | null;
  /** Teruskan ke Kartu: tata letak fitur asimetris (Fase 4 Aurora). */
  fitur?: boolean;
}) {
  const kategori = kategoriNama ?? artikel.kategori_slug ?? "Umum";
  return (
    <Kartu
      href={`/artikel/${artikel.slug}`}
      fitur={fitur}
      gambar={
        <div className="placeholder-gambar" aria-hidden="true">
          <span>{kategori}</span>
        </div>
      }
      kategori={
        <>
          {kategori} ·{" "}
          <span className={kelasLencanaStatus(artikel.status_verifikasi)}>
            {labelStatusVerifikasi(artikel.status_verifikasi)}
          </span>
        </>
      }
      judul={artikel.judul}
      teks={artikel.ringkasan ?? undefined}
      meta={formatTanggal(artikel.diterbitkan_pada, "Tanggal belum tersedia")}
    />
  );
}
