// Navigasi admin (F-S6): client component agar tautan halaman yang
// sedang dibuka ditandai aria-current="page" + kelas .aktif (pola
// BottomNav). NAV dipakai juga AdminJudul untuk judul dinamis.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV_ADMIN: {
  grup: string;
  tautan: { href: string; label: string }[];
}[] = [
  {
    grup: "Utama",
    tautan: [
      { href: "/admin", label: "Overview" },
      { href: "/admin/artikel", label: "Artikel" },
      { href: "/admin/review", label: "Review" },
      { href: "/admin/koreksi", label: "Koreksi" },
      { href: "/admin/pengguna", label: "Pengguna" },
      { href: "/admin/sistem", label: "Sistem" },
      { href: "/admin/audit", label: "Audit" },
      { href: "/admin/brief", label: "Brief" },
      { href: "/admin/sumber", label: "Sumber" },
    ],
  },
  {
    // Halaman admin konten Gelombang 2 (area 2/4/5/6/8/9/10/11/12 —
    // dibangun agen area masing-masing; tautan di sini tetap).
    grup: "Konten",
    tautan: [
      { href: "/admin/event", label: "Event" },
      { href: "/admin/pengetahuan", label: "Pengetahuan" },
      { href: "/admin/akademi", label: "Akademi" },
      { href: "/admin/riset", label: "Riset" },
      { href: "/admin/data", label: "Data" },
      { href: "/admin/negara", label: "Negara" },
      { href: "/admin/tanya", label: "Tanya" },
      { href: "/admin/podcast", label: "Podcast" },
    ],
  },
  {
    // Advanced Admin Control Center (Gelombang 2, Area 14).
    grup: "Kendali",
    tautan: [{ href: "/admin/kendali", label: "Kendali" }],
  },
  {
    // Monitoring (Gelombang 2, Area 14) — angka nyata dari tabel.
    grup: "Monitoring",
    tautan: [
      { href: "/admin/monitoring", label: "Monitoring" },
      { href: "/admin/klaster", label: "Klaster" },
      { href: "/admin/verifikasi", label: "Verifikasi" },
      { href: "/admin/agen-ai", label: "Pipeline AI" },
      { href: "/admin/duplikat", label: "Duplikat" },
      { href: "/admin/kualitas", label: "Kualitas" },
      { href: "/admin/laporan-pengguna", label: "Laporan Pengguna" },
      { href: "/admin/kinerja", label: "Kinerja" },
      { href: "/admin/api-sehat", label: "API Sehat" },
      { href: "/admin/analitik", label: "Analitik" },
    ],
  },
];

/** Label halaman admin untuk pathname (cocokkan awalan terpanjang —
 *  /admin/artikel/baru ikut "Artikel"). null bila bukan /admin. */
export function labelHalamanAdmin(pathname: string): string | null {
  let cocok: { href: string; label: string } | null = null;
  for (const grup of NAV_ADMIN) {
    for (const item of grup.tautan) {
      const pas =
        item.href === "/admin"
          ? pathname === "/admin"
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (pas && (!cocok || item.href.length > cocok.href.length)) {
        cocok = item;
      }
    }
  }
  return cocok ? cocok.label : null;
}

export default function NavAdmin() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="Navigasi admin">
      {NAV_ADMIN.map((grup) => (
        <span key={grup.grup} className="admin-nav-grup">
          <span className="admin-nav-grup-label">{grup.grup}</span>
          {grup.tautan.map((item) => {
            const aktif =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={aktif ? "aktif" : undefined}
                aria-current={aktif ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </span>
      ))}
      <Link href="/">Kembali ke Beranda</Link>
    </nav>
  );
}
