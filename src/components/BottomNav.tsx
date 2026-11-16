"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// V2 — Liquid Glass: SATU indikator kaca bergerak (bukan kapsul
// per item). Komponen ini dirender SEKALI di root layout
// (src/app/layout.tsx) sehingga instance-nya HIDUP selama
// perpindahan antarrute (App Router tidak me-remount layout) —
// posisi kapsul tidak pernah hilang dan animasi benar-benar
// terlihat berpindah dari menu sebelumnya ke menu berikutnya.
//
// Mekanisme:
// - Indeks aktif = turunan usePathname() (selalu sinkron dengan
//   URL: klik Link di halaman mana pun, back/forward browser,
//   maupun klik menu — tanpa listener popstate manual).
// - Indikator: satu <div> absolut, digeser dengan
//   translate3d(indeks * 100%, 0, 0) + transisi spring 560ms
//   (cubic-bezier overshoot) — lihat .prata-glass-indicator.
// - Navigasi TIDAK ditunda: Link Next bekerja normal (SPA,
//   tanpa preventDefault / setTimeout 560ms). Kapsul meluncur
//   BERSAMAAN dengan pergantian halaman, bukan sebelumnya.
// - Rute tak dikenal (mis. /kuis, /artikel/...) → tidak ada
//   item aktif dan indikator disembunyikan (opacity 0), BUKAN
//   dipaksa ke Beranda. Posisi terakhir disimpan di ref agar
//   kapsul tidak melompat ke 0 saat kembali.
// - Ikon: SVG proyek (lucide-react TIDAK terinstal).
// - "Saya" = /saya (permukaan akun tunggal F-T2); /masuk dan
//   /daftar juga memetakan ke "Saya". "Lainnya" = /jelajahi.
const ITEMS = [
  {
    id: "beranda",
    href: "/",
    label: "Beranda",
    ikon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M3 10.5 12 3l9 7.5V21h-6v-6h-6v6H3z" />
      </svg>
    ),
  },
  {
    id: "kategori",
    href: "/kategori",
    label: "Kategori",
    ikon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z" />
      </svg>
    ),
  },
  {
    id: "arsip",
    href: "/arsip",
    label: "Arsip",
    ikon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="4" width="18" height="5" rx="1" />
        <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
      </svg>
    ),
  },
  {
    id: "brief",
    href: "/brief",
    label: "Brief",
    ikon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14l-4-3-4 3-4-3-4 3z" />
      </svg>
    ),
  },
  {
    id: "saya",
    href: "/saya",
    label: "Saya",
    ikon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
  {
    id: "lainnya",
    href: "/jelajahi",
    label: "Lainnya",
    ikon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="5" cy="5" r="1.6" />
        <circle cx="12" cy="5" r="1.6" />
        <circle cx="19" cy="5" r="1.6" />
        <circle cx="5" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="19" cy="12" r="1.6" />
        <circle cx="5" cy="19" r="1.6" />
        <circle cx="12" cy="19" r="1.6" />
        <circle cx="19" cy="19" r="1.6" />
      </svg>
    ),
  },
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
        {/* SATU lensa kaca bergerak — satu-satunya indikator. */}
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
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`prata-glass-item${isActive ? " is-active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="prata-glass-icon" aria-hidden="true">
                {item.ikon}
              </span>
              <span className="prata-glass-label">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
