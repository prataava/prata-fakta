// Kartu negara di halaman daftar /negara.
// Populasi HANYA tampil bila baris negara punya sumber (aturan
// angka-bersumber); tanpa sumber, kartu menampilkan "belum
// tersedia" — bukan angka tanpa asal.
import { punyaSumber, type PfNegara } from "@/lib/negara";
import { formatAngka } from "@/lib/format";
import Kartu from "@/components/Kartu";

export default function KartuNegara({ negara }: { negara: PfNegara }) {
  const adaSumber = punyaSumber(negara.sumber);
  return (
    <Kartu
      href={`/negara/${negara.kode}`}
      kategori={negara.kode}
      judul={negara.nama}
      teks={
        negara.ibu_kota ? `Ibu kota: ${negara.ibu_kota}` : undefined
      }
      meta={
        adaSumber && negara.populasi !== null
          ? `Populasi: ${formatAngka(negara.populasi)}${negara.periode_referensi ? ` (${negara.periode_referensi})` : ""}`
          : "Populasi: belum tersedia"
      }
      metaTambahan={
        adaSumber && negara.sumber ? `Sumber: ${negara.sumber}` : undefined
      }
    />
  );
}
