// Formulir laporan masyarakat (POST /api/laporan-publik).
// Boleh anonim: nama & email opsional. Sesudah terkirim, pelapor
// menerima nomor lacak untuk memeriksa status di /laporkan/lacak.
// SEMUA laporan wajib dimoderasi redaksi sebelum diproses.
// Pembungkus tipis atas FormLaporanUmum (F-S1) — hanya parameter
// endpoint/daftar jenis; alur submit ada di sana.
"use client";

import FormLaporanUmum from "@/components/laporan/FormLaporanUmum";
import {
  JENIS_LAPORAN_PUBLIK,
  LABEL_JENIS_LAPORAN_PUBLIK,
} from "@/lib/laporan";

export default function FormLaporanPublik() {
  return (
    <FormLaporanUmum
      endpoint="/api/laporan-publik"
      daftarJenis={JENIS_LAPORAN_PUBLIK.map((nilai) => ({
        nilai,
        label: LABEL_JENIS_LAPORAN_PUBLIK[nilai] ?? nilai,
      }))}
      denganTautanArtikel
      denganNomorLacak
      namaFieldPesan="deskripsi"
      minPesan={10}
      lebarMaks={640}
      labelPesan="Deskripsi laporan"
      placeholderPesan="Jelaskan apa yang Anda temukan: kesalahan apa, di mana, dan bila ada, fakta atau sumber yang benar…"
    />
  );
}
