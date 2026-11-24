"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Archive,
  Grip,
  Home,
  LayoutGrid,
  Newspaper,
  User,
  type LucideIcon,
} from "lucide-react";
import { t, type KunciBahasa } from "@/lib/i18n";
import { useBahasa } from "@/lib/useBahasa";

// Amicro (24 Nov 2026): SATU pil solid bergerak (bukan kapsul
// per item, bukan lagi lensa kaca + rainbow). Komponen ini
// dirender SEKALI di root layout
// (src/app/layout.tsx) sehingga instance-nya HIDUP selama
// perpindahan antarrute (App Router tidak me-remount layout) —
// posisi pil tidak pernah hilang dan animasi benar-benar
// terlihat berpindah dari menu sebelumnya ke menu berikutnya.
//
// Mekanisme:
// - Indeks aktif = turunan usePathname() (selalu sinkron dengan
//   URL: klik Link di halaman mana pun, back/forward browser,
//   maupun klik menu — tanpa listener popstate manual).
// - Indikator: satu <div> absolut, digeser dengan
//   translate3d(indeks * 100%, 0, 0) + transisi 250ms
//   (cubic-bezier Amicro [0.16,1,0.3,1], tanpa overshoot) —
//   lihat .prata-glass-indicator.
// - Navigasi TIDAK ditunda: Link Next bekerja normal (SPA,
//   tanpa preventDefault / setTimeout 250ms). Pil meluncur
//   BERSAMAAN dengan pergantian halaman, bukan sebelumnya.
// - Rute tak dikenal (mis. /kuis, /artikel/...) → tidak ada
//   item aktif dan indikator disembunyikan (opacity 0), BUKAN
//   dipaksa ke Beranda. Posisi terakhir disimpan di ref agar
//   kapsul tidak melompat ke 0 saat kembali.
// - Ikon: lucide-react (Fase 3 redesign — ganti SVG gambar tangan;
//   satu stroke weight, satu bahasa visual).
// - "Saya" = /saya (permukaan akun tunggal F-T2); /masuk dan
//   /daftar juga memetakan ke "Saya". "Lainnya" = /jelajahi.
const ITEMS: { id: string; href: string; kunci: KunciBahasa; ikon: LucideIcon }[] = [
  { id: "beranda", href: "/", kunci: "nav.beranda", ikon: Home },
  { id: "kategori", href: "/kategori", kunci: "nav.kategori", ikon: LayoutGrid },
  { id: "arsip", href: "/arsip", kunci: "nav.arsip", ikon: Archive },
  { id: "brief", href: "/brief", kunci: "nav.brief", ikon: Newspaper },
  { id: "saya", href: "/saya", kunci: "auth.saya", ikon: User },
  { id: "lainnya", href: "/jelajahi", kunci: "nav.lainnya", ikon: Grip },
];

function indeksDariPath(pathname: string): number | null {
  if (pathname === "/") return 0;
  if (pathname.startsWith("/kategori")) return 1;
  if (pathname.startsWith("/arsip")) return 2;
  if (pathname.startsWith("/brief")) return 3;
  if (
    pathname.startsWith("/saya") ||
    pathname.startsWith("/masuk") ||
    pathname.startsWith("/daftar")
  )
    return 4;
  if (pathname.startsWith("/jelajahi")) return 5;
  return null;
}

export default function BottomNav() {
  const pathname = usePathname();
  // P3-3: label dock dari kamus (cookie pf-bahasa via useBahasa).
  const bahasa = useBahasa();
  const aktif = indeksDariPath(pathname);
  // Posisi terakhir kapsul — dipakai saat rute tak dikenal
  // (indikator disembunyikan tapi transform-nya dipertahankan,
  // supaya tidak melompat ke slot 0 saat kembali). Pola resmi
  // React "adjusting state during render": setState saat render
  // (bukan di effect) agar render pertama sesudah pindah rute
  // sudah benar tanpa render berjenjang / pelanggaran lint
  // react-hooks/set-state-in-effect.
  const [terakhir, setTerakhir] = useState(0);
  if (aktif !== null && terakhir !== aktif) {
    setTerakhir(aktif);
  }

  return (
    <nav className="prata-glass-dock" aria-label="Navigasi utama">
      <div className="prata-glass-track">
        {/* SATU pil solid bergerak — satu-satunya indikator. */}
        <div
          className="prata-glass-indicator"
          aria-hidden="true"
          style={{
            transform: `translate3d(${terakhir * 100}%, 0, 0)`,
            opacity: aktif === null ? 0 : 1,
          }}
        />
        {ITEMS.map((item, index) => {
          const isActive = aktif === index;
          const Ikon = item.ikon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`prata-glass-item${isActive ? " is-active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="prata-glass-icon" aria-hidden="true">
                <Ikon size={22} strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="prata-glass-label">{t(bahasa, item.kunci)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
