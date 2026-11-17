import { Suspense } from "react";
import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import AuthArea from "@/components/AuthArea";
import HeaderNav from "@/components/HeaderNav";
import NotifikasiBadge from "@/components/NotifikasiBadge";
import PelacakKunjungan from "@/components/PelacakKunjungan";
import ThemeToggle from "@/components/ThemeToggle";
import TombolCari from "@/components/TombolCari";
import { TombolPalette } from "@/components/CommandPalette";
import { bacaPemeliharaan } from "@/lib/scheduler/flags";

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

// Header (server component) — kini sinkron: seluruh isi statis
// (SearchBar, ThemeToggle, NotifikasiBadge, AuthArea,
// PelacakKunjungan, HeaderNav semuanya client component atau
// statis), sehingga shell-nya bisa di-prerender. Satu-satunya
// akses data runtime (banner di atas) sudah di dalam Suspense.
export default function Header() {
  return (
    <>
      <Suspense fallback={null}>
        <BannerPemeliharaan />
      </Suspense>
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
            <TombolCari />
            <TombolPalette />
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
