// Halaman 404 root (F-T1): tampil saat notFound() dipanggil di
// segmen mana pun (mis. artikel/cerita/negara tak ada).
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wadah">
      <div className="kartu-form kartu-form--tak-tersedia">
        <h1>Halaman tidak ditemukan</h1>
        <p>
          Alamat yang Anda buka tidak ada atau sudah dipindahkan.
          Periksa kembali alamatnya, atau jelajahi dari Beranda dan
          Arsip.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Link className="tombol tombol-primer" href="/">
            Beranda
          </Link>
          <Link className="tombol" href="/arsip">
            Arsip
          </Link>
        </div>
      </div>
    </div>
  );
}
