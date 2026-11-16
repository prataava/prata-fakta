"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  {
    href: "/",
    label: "Beranda",
    ikon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M3 10.5 12 3l9 7.5V21h-6v-6h-6v6H3z" />
      </svg>
    ),
  },
  {
    href: "/kategori",
    label: "Kategori",
    ikon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z" />
      </svg>
    ),
  },
  {
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
    href: "/brief",
    label: "Brief",
    ikon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14l-4-3-4 3-4-3-4 3z" />
      </svg>
    ),
  },
  {
    // F-T2: satu permukaan akun — "Saya" (/saya), sama seperti Header.
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
    // F-S6: "Lainnya" membuka indeks /jelajahi agar semua rute
    // terjangkau dari mobile (nav bawah hanya memuat 6 pintu).
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

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="nav-bawah" aria-label="Navigasi bawah">
      <div className="nav-bawah-dalam">
        {ITEMS.map((item) => {
          const aktif =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-bawah-item${aktif ? " aktif" : ""}`}
              aria-current={aktif ? "page" : undefined}
            >
              <span className="nav-bawah-ikon" aria-hidden="true">
                {item.ikon}
              </span>
              <span className="nav-bawah-label">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
