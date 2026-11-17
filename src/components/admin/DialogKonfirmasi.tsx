"use client";

import * as Dialog from "@radix-ui/react-dialog";

/* DialogKonfirmasi — dialog konfirmasi dalam-halaman (Radix) untuk aksi
 * admin. Dibuat 17 Nov 2026 (koordinator intel/global-news-24-7) untuk
 * menggantikan `window.confirm` di halaman admin — dialog bawaan browser
 * ditolak otomatisasi (tidak pernah tampil, POST tidak pernah jalan;
 * pelajaran: "window.confirm memblokir otomatisasi browser").
 *
 * Dipakai: /admin/akademi (cabut sertifikat), /admin/pengetahuan (hapus
 * artikel), /admin/podcast (hapus episode). BUKAN pengganti TombolAksi —
 * perbaikan TombolAksi milik agen utama di branch terpisah dan naik sebagai
 * PR kecil langsung ke main; komponen ini tetap hidup berdampingan.
 *
 * Pola Radix mengikuti CommandPalette; class CSS memakai pola
 * `.dialog-laporan` yang sudah ada di globals.css (modal solid, tanpa blur).
 * Tanpa window.confirm/alert; keyboard: fokus terjaga di dialog (Radix),
 * Esc menutup, Tab mencapai tombol. */

type VarianKonfirmasi = "bahaya" | "biasa";

type DialogKonfirmasiProps = {
  terbuka: boolean;
  judul: string;
  pesan: string;
  labelKonfirmasi: string;
  labelBatal?: string;
  varian?: VarianKonfirmasi;
  sibuk?: boolean;
  onKonfirmasi: () => void;
  onTutup: () => void;
};

export default function DialogKonfirmasi({
  terbuka,
  judul,
  pesan,
  labelKonfirmasi,
  labelBatal = "Batal",
  varian = "biasa",
  sibuk = false,
  onKonfirmasi,
  onTutup,
}: DialogKonfirmasiProps) {
  return (
    <Dialog.Root
      open={terbuka}
      onOpenChange={(buka) => {
        if (!buka) onTutup();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-laporan-latar" />
        <Dialog.Content className="dialog-laporan">
          <div className="dialog-laporan-kepala">
            <Dialog.Title asChild>
              <h3>{judul}</h3>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="tombol tombol-hantu"
                aria-label="Tutup dialog"
                disabled={sibuk}
              >
                ×
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description>{pesan}</Dialog.Description>
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              marginTop: 20,
            }}
          >
            <button
              type="button"
              className="tombol tombol-hantu"
              onClick={onTutup}
              disabled={sibuk}
            >
              {labelBatal}
            </button>
            <button
              type="button"
              className={
                varian === "bahaya"
                  ? "tombol tombol-bahaya"
                  : "tombol tombol-primer"
              }
              onClick={onKonfirmasi}
              disabled={sibuk}
            >
              {sibuk ? "Memproses…" : labelKonfirmasi}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
