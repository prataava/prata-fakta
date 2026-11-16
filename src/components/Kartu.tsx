// Kartu generik (F-S2) — satu pola tampilan untuk semua kartu
// daftar: artikel, cerita, negara, kursus, episode podcast.
// Bila `href` diisi, SELURUH kartu adalah satu tautan (artikel /
// negara / kursus). Bila tidak, kartu berupa <article> dengan judul
// sebagai tautan (`judulHref`) dan slot `aksi` di luar tautan
// (mis. tombol Ikuti cerita — tidak boleh bersarang di dalam <a>).
import type { ReactNode } from "react";
import Link from "next/link";

export type KartuProps = {
  /** Tautan seluruh kartu (bila diisi, kartu = satu <a>). */
  href?: string;
  /** Tautan judul saja (dipakai bila kartu bukan satu tautan). */
  judulHref?: string;
  kategori?: ReactNode;
  judul: ReactNode;
  teks?: ReactNode;
  meta?: ReactNode;
  /** Baris meta kedua (mis. progres kursus / sumber populasi). */
  metaTambahan?: ReactNode;
  /** Visual atas kartu (mis. placeholder gambar kategori). */
  gambar?: ReactNode;
  /** Aksi di luar tautan (mis. tombol Ikuti). */
  aksi?: ReactNode;
  /** Kartu fitur (asimetris, Fase 4 Aurora): gambar di kiri, isi di
   * kanan pada ≥1024px; di bawah itu tampil seperti kartu biasa. */
  fitur?: boolean;
};

export default function Kartu({
  href,
  judulHref,
  kategori,
  judul,
  teks,
  meta,
  metaTambahan,
  gambar,
  aksi,
  fitur,
}: KartuProps) {
  const teksIsi = (
    <>
      {kategori !== undefined && (
        <span className="kartu-kategori">{kategori}</span>
      )}
      {judulHref ? (
        <Link className="kartu-judul" href={judulHref}>
          {judul}
        </Link>
      ) : (
        <span className="kartu-judul">{judul}</span>
      )}
      {teks !== undefined && <span className="kartu-teks">{teks}</span>}
      {meta !== undefined && <span className="kartu-meta">{meta}</span>}
      {metaTambahan !== undefined && (
        <span className="kartu-meta">{metaTambahan}</span>
      )}
    </>
  );
  const isi = fitur ? (
    <>
      {gambar}
      <span className="kartu-isi">{teksIsi}</span>
    </>
  ) : (
    <>
      {gambar}
      {teksIsi}
    </>
  );
  const kelas = `kartu${fitur ? " kartu-fitur" : ""}`;

  if (href) {
    return (
      <Link className={`${kelas} kartu-artikel`} href={href}>
        {isi}
      </Link>
    );
  }

  return (
    <article className={kelas}>
      {isi}
      {aksi}
    </article>
  );
}
