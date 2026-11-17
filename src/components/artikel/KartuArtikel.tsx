import type { PfArtikelRingkas } from "@/lib/data";
import { formatTanggal } from "@/lib/format";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";
import Kartu from "@/components/Kartu";

// Kartu artikel — server-safe, dipakai beranda / arsip / kategori / cari.
// Seluruh kartu adalah tautan ke /artikel/[slug]. Bila artikel punya
// gambar_url (foto sumber), kartu menampilkan thumbnail foto itu;
// bila tidak ada, placeholder editorial (blok warna solid + label
// kategori) — kartu TIDAK PERNAH kosong.
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
        artikel.gambar_url ? (
          // next/image tidak dipakai: gambar_url berasal dari host
          // eksternal (CDN sumber berita) — <img> biasa, lazy.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="kartu-gambar"
            src={artikel.gambar_url}
            alt={`Ilustrasi: ${artikel.judul}`}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="placeholder-gambar" aria-hidden="true">
            <span>{kategori}</span>
          </div>
        )
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
