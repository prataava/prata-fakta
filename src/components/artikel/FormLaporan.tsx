// Dialog laporan kesalahan artikel (POST /api/laporan).
// Boleh anonim: nama & email opsional.
// Pembungkus tipis atas FormLaporanUmum (F-S1) — hanya cangkang
// dialog + daftar jenis koreksi artikel; alur submit ada di sana.
// Aksesibilitas dialog (UI-UX Pro Max P9): Esc menutup, fokus
// masuk ke dialog saat dibuka (tabIndex -1 + focus saat mount),
// fokus kembali ke pemicu saat dialog ditutup.
"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
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
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const pemicuRef = useRef<HTMLElement | null>(null);
  // onTutup dari induk berupa arrow inline (identitas berubah tiap
  // render) — simpan di ref agar efek fokus hanya jalan sekali
  // saat mount, bukan mengulang + mengembalikan fokus tiap render.
  const tutupRef = useRef(onTutup);
  tutupRef.current = onTutup;

  useEffect(() => {
    // Fokus masuk ke dialog saat dibuka; simpan pemicu agar fokus
    // kembali ke sana saat dialog ditutup (cleanup).
    pemicuRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    function saatTombol(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        tutupRef.current();
      }
    }
    document.addEventListener("keydown", saatTombol);
    return () => {
      document.removeEventListener("keydown", saatTombol);
      pemicuRef.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="dialog-laporan-latar"
      role="presentation"
      onClick={onTutup}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
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
            {/* Ikon tutup = SVG Lucide X (P4); karakter "✕" lama
              diganti agar satu keluarga ikon di seluruh situs. */}
            <X size={20} aria-hidden="true" />
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
