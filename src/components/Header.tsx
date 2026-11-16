import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import AuthArea from "@/components/AuthArea";
import HeaderNav from "@/components/HeaderNav";
import NotifikasiBadge from "@/components/NotifikasiBadge";
import PelacakKunjungan from "@/components/PelacakKunjungan";
import ThemeToggle from "@/components/ThemeToggle";
import { bacaPemeliharaan } from "@/lib/scheduler/flags";

// Header (server component) — menegakkan flag mode_pemeliharaan
// (Tahap 13C): bila flag aktif, pengumuman tampil di atas header
// di semua halaman yang memakai layout ini. bacaPemeliharaan()
// TIDAK PERNAH melempar (gagal baca = tidak ada banner).
// Catatan jujur: halaman yang di-prerender statis saat build
// membakukan banner apa adanya saat itu; banner terbaru muncul
// penuh di halaman yang dirender dinamis / sesudah revalidasi.
export default async function Header() {
  const { aktif, pengumuman } = await bacaPemeliharaan();
  return (
    <>
      {aktif ? (
        <div role="status" className="pengumuman-pemeliharaan">
          {pengumuman || "Situs sedang dalam pemeliharaan."}
        </div>
      ) : null}
      <header className="header">
      <PelacakKunjungan />
      <div className="wadah">
        <div className="header-atas">
          <Link href="/" className="logo" aria-label="PRATA FAKTA — Beranda">
            <span className="logo-nama">
              PRATA <em>FAKTA</em>
            </span>
            <span className="logo-tag">Pahami dunia. Berdasarkan fakta.</span>
          </Link>
          <div className="header-cari">
            <SearchBar />
          </div>
          <div className="header-aksi">
            <ThemeToggle />
            <NotifikasiBadge />
            <AuthArea />
          </div>
        </div>
        <HeaderNav />
      </div>
    </header>
    </>
  );
}
