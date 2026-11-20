// Daftar "Paling Banyak Dibaca" (muka baru, 20 Nov 2026):
// artikel populer dari data baca NYATA (getArtikelPopuler —
// baris pf_reading_history) tampil sebagai daftar bernomor
// dengan angka raksasa 01–05, bukan grid kartu. Angka baca
// mentah TIDAK ditampilkan (tidak diekspos data ringkas) —
// yang ditampilkan hanya urutan, judul, kategori, tanggal.
// Server component.
import Link from "next/link";
import type { PfArtikelRingkas } from "@/lib/data";
import { formatTanggal } from "@/lib/format";
import gaya from "./DaftarTerbaca.module.css";

export default function DaftarTerbaca({
  items,
}: {
  items: PfArtikelRingkas[];
}) {
  if (items.length === 0) return null;
  return (
    <ol className={gaya.daftar}>
      {items.map((a, i) => (
        <li key={a.id} className={gaya.butir}>
          <span className={gaya.angka} aria-hidden="true">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className={gaya.isi}>
            <Link href={`/artikel/${a.slug}`} className={gaya.judul}>
              {a.judul}
            </Link>
            <p className={gaya.meta}>
              <span className={gaya.kategori}>
                {a.kategori_slug ?? "Umum"}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {formatTanggal(a.diterbitkan_pada, "Tanggal belum tersedia")}
              </span>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
