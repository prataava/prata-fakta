import { Suspense } from "react";
import Link from "next/link";
import TanggalHariIni from "@/components/TanggalHariIni";
import SearchBar from "@/components/SearchBar";
import AuthArea from "@/components/AuthArea";
import HeaderNav from "@/components/HeaderNav";
import NotifikasiBadge from "@/components/NotifikasiBadge";
import PelacakKunjungan from "@/components/PelacakKunjungan";
import ThemeToggle from "@/components/ThemeToggle";
import TombolCari from "@/components/TombolCari";
import { TombolPalette } from "@/components/CommandPalette";
import { bacaPemeliharaan } from "@/lib/scheduler/flags";
import gaya from "./Header.module.css";

// Banner pemeliharaan (Tahap 13C): membaca flag mode_pemeliharaan
// dari Supabase — akses data runtime yang TIDAK BOLEH menghalangi
// prerender. Karena next.config memakai cacheComponents, komponen
// async ini WAJIB berada di dalam <Suspense> (per docs Next.js
// 16 di node_modules/next/dist/docs — "place the component that
// calls connection()/does request-time work inside a <Suspense>
// boundary"). Tanpa batas itu, build Vercel gagal: prerender
// /_not-found melempar "encountered uncached or runtime data
// during prerendering" (20.54 WIB — build lokal lolos karena
// service key tidak ada di .env.local sehingga fetch tidak
// pernah jalan; di Vercel key terisi sehingga fetch jalan).
// bacaPemeliharaan() TIDAK PERNAH melempar (gagal baca = tidak
// ada banner). Banner hanya muncul bila flag aktif; halaman
// statis membakukan ketiadaan banner saat build, banner terbaru
// muncul sesudah streaming di request dinamis.
async function BannerPemeliharaan() {
  const { aktif, pengumuman } = await bacaPemeliharaan();
  if (!aktif) return null;
  return (
    <div role="status" className="pengumuman-pemeliharaan">
      {pengumuman || "Situs sedang dalam pemeliharaan."}
    </div>
  );
}

// Header (server component) — masthead KORAN (muka baru,
// 20 Nov 2026): strip meta tipis (tanggal kiri + tagline
// kanan, desktop) + wordmark RAKSASA di tengah + sub-bar
// navigasi berbatas 1px (.header-subbar, lebar penuh, isi
// dalam .wadah). Susunan baris diatur Header.module.css:
// bertumpuk (wordmark / cari / aksi) di bawah 1200px,
// sebaris (cari | wordmark | aksi) di ≥1200px.
// Fungsi TIDAK berubah: SearchBar, ThemeToggle,
// NotifikasiBadge, AuthArea, PelacakKunjungan, HeaderNav
// semuanya client component atau statis, sehingga shell-nya
// bisa di-prerender. Satu-satunya akses data runtime (banner)
// sudah di dalam Suspense. Tagline pindah dari bawah wordmark
// ke strip meta (teksnya sama persis).
export default function Header() {
  return (
    <>
      <Suspense fallback={null}>
        <BannerPemeliharaan />
      </Suspense>
      <header className={`header ${gaya.masthead}`}>
      <PelacakKunjungan />
      <div className="wadah">
        <div className={gaya.stripMeta}>
          <TanggalHariIni />
          <span className={gaya.stripTagline}>
            Pahami dunia. Berdasarkan fakta.
          </span>
        </div>
        <div className="header-atas">
          <Link href="/" className="logo" aria-label="PRATA FAKTA — Beranda">
            <span className="logo-nama">
              PRATA <em>FAKTA</em>
            </span>
          </Link>
          <div className="header-cari">
            <SearchBar />
          </div>
          <div className="header-aksi">
            <TombolCari />
            <TombolPalette />
            <ThemeToggle />
            <NotifikasiBadge />
            <AuthArea />
          </div>
        </div>
      </div>
      <div className={`header-subbar ${gaya.subbar}`}>
        <div className="wadah">
          <HeaderNav />
        </div>
      </div>
    </header>
    </>
  );
}
