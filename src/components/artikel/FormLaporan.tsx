// Dialog laporan kesalahan artikel (POST /api/laporan).
// Boleh anonim: nama & email opsional.
// Pembungkus tipis atas FormLaporanUmum (F-S1) — hanya cangkang
// dialog + daftar jenis koreksi artikel; alur submit ada di sana.
"use client";

import FormLaporanUmum from "@/components/laporan/FormLaporanUmum";

const JENIS_LAPORAN = [
  { nilai: "fakta_salah", label: "Fakta salah" },
  { nilai: "sumber", label: "Masalah sumber" },
  { nilai: "typo", label: "Kesalahan penulisan (typo)" },
  { nilai: "lainnya", label: "Lainnya" },
] as const;

export default function FormLaporan({
  artikelId,
  judulArtikel,
  onTutup,
}: {
  artikelId: string;
  judulArtikel: string;
  onTutup: () => void;
}) {
  return (
    <div
      className="dialog-laporan-latar"
      role="presentation"
      onClick={onTutup}
    >
      <div
        className="dialog-laporan"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-laporan-judul"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-laporan-kepala">
          <h3 id="dialog-laporan-judul">Laporkan Kesalahan</h3>
          <button
            type="button"
            className="tombol tombol-ikon"
            onClick={onTutup}
            aria-label="Tutup dialog"
          >
            ✕
          </button>
        </div>
        <FormLaporanUmum
          endpoint="/api/laporan"
          daftarJenis={JENIS_LAPORAN}
          artikelId={artikelId}
          judulArtikel={judulArtikel}
          labelJenis="Jenis kesalahan"
          teksSukses="Terima kasih — laporan Anda sudah diterima redaksi dan akan ditinjau. Koreksi yang disetujui diterbitkan sebagai pembaruan artikel."
          onTutup={onTutup}
        />
      </div>
    </div>
  );
}
