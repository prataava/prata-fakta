// Navigasi utama header (F-S6): client component agar tautan aktif
// bisa ditandai aria-current="page" + kelas .aktif (pola BottomNav
// yang sudah benar). Header tetap server component — hanya nav ini
// yang butuh usePathname.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KATEGORI_UTAMA } from "@/lib/categories";

const TAUTAN: { href: string; label: string }[] = [
  { href: "/arsip", label: "Arsip" },
  { href: "/brief", label: "Daily Brief" },
  { href: "/peta", label: "Peta" },
  { href: "/data", label: "Data" },
  { href: "/riset", label: "Riset" },
  { href: "/timeline", label: "Timeline" },
  { href: "/cerita", label: "Cerita" },
  { href: "/sejarah", label: "Sejarah" },
  { href: "/pengetahuan", label: "Pengetahuan" },
  { href: "/akademi", label: "Akademi" },
  { href: "/negara", label: "Negara" },
  { href: "/kuis", label: "Kuis" },
  { href: "/tanya", label: "Tanya" },
  { href: "/podcast", label: "Podcast" },
  { href: "/rutin", label: "Rutin" },
  { href: "/feed-saya", label: "Feed Saya" },
  { href: "/saya", label: "Saya" },
  { href: "/laporkan", label: "Laporkan" },
  { href: "/jelajahi", label: "Jelajahi" },
];

export default function HeaderNav() {
  const pathname = usePathname();
  const aktif = (href: string): boolean =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="nav-kategori" aria-label="Kategori berita">
      <Link href="/" className={aktif("/") ? "aktif" : undefined} aria-current={aktif("/") ? "page" : undefined}>
        Beranda
      </Link>
      {KATEGORI_UTAMA.map((k) => {
        const href = `/kategori/${k.slug}`;
        const a = aktif(href);
        return (
          <Link key={k.slug} href={href} className={a ? "aktif" : undefined} aria-current={a ? "page" : undefined}>
            {k.nama}
          </Link>
        );
      })}
      {TAUTAN.map((item) => {
        const a = aktif(item.href);
        return (
          <Link key={item.href} href={item.href} className={a ? "aktif" : undefined} aria-current={a ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
