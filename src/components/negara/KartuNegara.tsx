import Link from "next/link";
import { formatAngka, punyaSumber, type PfNegara } from "@/lib/negara";

// Kartu profil negara di halaman daftar /negara.
// Populasi HANYA tampil bila baris negara punya sumber (aturan
// angka-bersumber); tanpa sumber, kartu menampilkan "belum
// tersedia" — bukan angka tanpa asal.
export default function KartuNegara({ negara }: { negara: PfNegara }) {
  const adaSumber = punyaSumber(negara.sumber);
  return (
    <Link className="kartu kartu-artikel" href={`/negara/${negara.kode}`}>
      <span className="kartu-kategori">{negara.kode}</span>
      <span className="kartu-judul">{negara.nama}</span>
      {negara.ibu_kota && (
        <span className="kartu-teks">Ibu kota: {negara.ibu_kota}</span>
      )}
      <span className="kartu-meta">
        {adaSumber && negara.populasi !== null
          ? `Populasi: ${formatAngka(negara.populasi)}${negara.periode_referensi ? ` (${negara.periode_referensi})` : ""}`
          : "Populasi: belum tersedia"}
      </span>
      {adaSumber && negara.sumber && (
        <span className="kartu-meta">Sumber: {negara.sumber}</span>
      )}
    </Link>
  );
}
