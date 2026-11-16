import Link from "next/link";
import { KATEGORI_UTAMA } from "@/lib/categories";
import SearchBar from "@/components/SearchBar";
import AuthArea from "@/components/AuthArea";
import ThemeToggle from "@/components/ThemeToggle";

export default function Header() {
  return (
    <header className="header">
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
            <AuthArea />
          </div>
        </div>
        <nav className="nav-kategori" aria-label="Kategori berita">
          <Link href="/">Beranda</Link>
          {KATEGORI_UTAMA.map((k) => (
            <Link key={k.slug} href={`/kategori/${k.slug}`}>
              {k.nama}
            </Link>
          ))}
          <Link href="/arsip">Arsip</Link>
          <Link href="/brief">Daily Brief</Link>
          <Link href="/peta">Peta</Link>
          <Link href="/data">Data</Link>
          <Link href="/riset">Riset</Link>
          <Link href="/timeline">Timeline</Link>
          <Link href="/cerita">Cerita</Link>
          <Link href="/sejarah">Sejarah</Link>
          <Link href="/pengetahuan">Pengetahuan</Link>
          <Link href="/akademi">Akademi</Link>
          <Link href="/negara">Negara</Link>
          <Link href="/kuis">Kuis</Link>
          <Link href="/tanya">Tanya</Link>
          <Link href="/podcast">Podcast</Link>
          <Link href="/rutin">Rutin</Link>
          <Link href="/feed-saya">Feed Saya</Link>
          <Link href="/saya">Saya</Link>
          <Link href="/laporkan">Laporkan</Link>
        </nav>
      </div>
    </header>
  );
}
