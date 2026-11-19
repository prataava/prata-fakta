// Navigasi admin gaya Linear (Fase 4 redesign) — sidebar rapi
// 36 halaman dikelompokkan: Dashboard, Editorial, Sumber &
// Pipeline, Sistem. Tujuan/href TIDAK berubah dari NAV lama;
// hanya pengelompokan + ikon + tampilan yang baru. Client
// component agar tautan aktif ditandai aria-current="page"
// (pola BottomNav). NAV dipakai juga AdminJudul untuk judul dinamis.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Database,
  Eye,
  FileText,
  FileWarning,
  Flag,
  FlaskConical,
  Gauge,
  GitMerge,
  Globe,
  GraduationCap,
  HeartPulse,
  LayoutDashboard,
  Layers,
  ListChecks,
  Menu,
  MessageSquare,
  Newspaper,
  Podcast,
  Radar,
  Radio,
  RefreshCw,
  Rss,
  Scale,
  ScrollText,
  Server,
  ShieldCheck,
  Tags,
  Terminal,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Drawer } from "@/components/motion";
import styles from "./NavAdmin.module.css";

export const NAV_ADMIN: {
  grup: string;
  tautan: { href: string; label: string; ikon: LucideIcon }[];
}[] = [
  {
    grup: "Dashboard",
    tautan: [
      { href: "/admin", label: "Overview", ikon: LayoutDashboard },
      { href: "/admin/command-center", label: "Command Center", ikon: Terminal },
      { href: "/admin/ops", label: "Ops Center", ikon: Activity },
      { href: "/admin/reliability", label: "Reliability", ikon: ShieldCheck },
      { href: "/admin/monitoring", label: "Monitoring", ikon: Eye },
      { href: "/admin/analitik", label: "Analitik", ikon: BarChart3 },
      { href: "/admin/kinerja", label: "Kinerja", ikon: Gauge },
      { href: "/admin/audiens", label: "Audiens", ikon: Users },
    ],
  },
  {
    grup: "Editorial",
    tautan: [
      { href: "/admin/artikel", label: "Artikel", ikon: Newspaper },
      { href: "/admin/review", label: "Review", ikon: ClipboardCheck },
      { href: "/admin/koreksi", label: "Koreksi", ikon: FileWarning },
      { href: "/admin/verifikasi", label: "Verifikasi", ikon: Scale },
      { href: "/admin/brief", label: "Brief", ikon: FileText },
      { href: "/admin/kualitas", label: "Kualitas", ikon: ListChecks },
      { href: "/admin/label-sikap", label: "Label Sikap", ikon: Tags },
      { href: "/admin/duplikat", label: "Duplikat", ikon: GitMerge },
      { href: "/admin/laporan-pengguna", label: "Laporan Pengguna", ikon: Flag },
      { href: "/admin/event", label: "Event", ikon: CalendarDays },
      { href: "/admin/pengetahuan", label: "Pengetahuan", ikon: BookOpen },
      { href: "/admin/akademi", label: "Akademi", ikon: GraduationCap },
      { href: "/admin/riset", label: "Riset", ikon: FlaskConical },
      { href: "/admin/data", label: "Data", ikon: Database },
      { href: "/admin/negara", label: "Negara", ikon: Globe },
      { href: "/admin/tanya", label: "Tanya", ikon: MessageSquare },
      { href: "/admin/podcast", label: "Podcast", ikon: Podcast },
    ],
  },
  {
    grup: "Sumber & Pipeline",
    tautan: [
      { href: "/admin/sumber", label: "Sumber", ikon: Rss },
      { href: "/admin/agen-ai", label: "Pipeline AI", ikon: RefreshCw },
      { href: "/admin/radar", label: "Radar", ikon: Radar },
      { href: "/admin/klaster", label: "Klaster", ikon: Layers },
      { href: "/admin/cakupan", label: "Cakupan", ikon: Radio },
      { href: "/admin/api-sehat", label: "API Sehat", ikon: HeartPulse },
    ],
  },
  {
    grup: "Sistem",
    tautan: [
      { href: "/admin/sistem", label: "Sistem", ikon: Server },
      { href: "/admin/pengguna", label: "Pengguna", ikon: Users },
      { href: "/admin/audit", label: "Audit", ikon: ScrollText },
      { href: "/admin/kendali", label: "Kendali", ikon: Wrench },
      { href: "/admin/notifikasi", label: "Notifikasi", ikon: Bell },
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

/** Daftar tautan yang sama untuk sidebar desktop + drawer mobile. */
function DaftarTautanAdmin({ padaPilih }: { padaPilih?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {NAV_ADMIN.map((grup) => (
        <div key={grup.grup} className={styles.grup}>
          <span className={styles.labelGrup}>{grup.grup}</span>
          <ul className={styles.daftar}>
            {grup.tautan.map((item) => {
              const aktif =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
              const Ikon = item.ikon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={padaPilih}
                    className={
                      aktif
                        ? `${styles.tautan} ${styles.tautanAktif}`
                        : styles.tautan
                    }
                    aria-current={aktif ? "page" : undefined}
                  >
                    <Ikon size={16} aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <Link href="/" className={styles.kembali} onClick={padaPilih}>
        <ArrowLeft size={16} aria-hidden="true" />
        Kembali ke Beranda
      </Link>
    </>
  );
}

export default function NavAdmin() {
  return (
    <aside className={styles.sidebar} aria-label="Navigasi admin">
      <Link href="/admin" className={styles.merek}>
        <span className={styles.merekNama}>PRATA FAKTA</span>
        <span className={styles.merekSub}>Redaksi · Admin</span>
      </Link>
      <nav aria-label="Navigasi admin">
        <DaftarTautanAdmin />
      </nav>
    </aside>
  );
}

/** Tombol hamburger mobile — membuka navigasi yang sama sebagai
 *  Drawer (bottom sheet Radix + Motion fondasi Fase 3). Dipakai
 *  AdminTopbar; disembunyikan di desktop lewat CSS modul. */
export function TombolMenuAdmin() {
  const [buka, setBuka] = useState(false);
  return (
    <>
      <button
        type="button"
        className={styles.tombolMenu}
        onClick={() => setBuka(true)}
        aria-label="Buka navigasi admin"
        aria-expanded={buka}
      >
        <Menu size={20} aria-hidden="true" />
      </button>
      <Drawer
        terbuka={buka}
        onTutup={setBuka}
        judul="Navigasi admin"
        deskripsi="Pilih halaman admin yang ingin dibuka."
      >
        <div className={styles.isiDrawer}>
          <nav aria-label="Navigasi admin">
            <DaftarTautanAdmin padaPilih={() => setBuka(false)} />
          </nav>
        </div>
      </Drawer>
    </>
  );
}
