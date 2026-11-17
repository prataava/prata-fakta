// Navigasi utama header — V3 Fase 3 (17 Nov 2026): baris 2 header
// desktop berisi TEPAT 8 pintu inti (Beranda, Kategori, Fakta & Data,
// Wawasan, Belajar, Daily Brief, Arsip, Jelajahi). Empat grup memakai
// dropdown Radix (klik + keyboard + ARIA bawaan; tanpa hover-intent
// agar tidak terbuka tanpa sengaja). Semua tautan dari route yang
// benar-benar ada — tanpa tautan fiktif. Deskripsi kategori diambil
// dari KATEGORI_UTAMA (data nyata); deskripsi grup ditulis singkat
// sebagai copy UI (bukan klaim data).
// Mobile (<768px): nav ini disembunyikan (CSS) — navigasi HP lewat
// dock bawah + /jelajahi (Lainnya), sesuai brief Fase 4–5.
// Ikon: SATU library (lucide-react), ukuran konsisten 17–18px.
// P3-3 (17 Nov 2026): label 8 pintu + "Semua kategori" dari kamus
// (src/lib/i18n.ts, cookie pf-bahasa via useBahasa). Label item
// submenu + deskripsinya dan nama kategori SENGAJA tetap Indonesia
// (nama resmi; di luar cakupan minimal P3-3). PemilihBahasa TIDAK
// dipasang di sini (tersembunyi di HP) — ia ada di AuthArea.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Activity,
  Archive,
  BarChart3,
  BookOpen,
  ChevronDown,
  ClipboardList,
  Compass,
  Cpu,
  Database,
  Flag,
  FlaskConical,
  Globe,
  GraduationCap,
  History,
  Home,
  Landmark,
  LayoutGrid,
  Leaf,
  Lightbulb,
  Map,
  MessageCircleQuestion,
  Newspaper,
  Podcast,
  Scale,
  School,
  Sunrise,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { KATEGORI_UTAMA } from "@/lib/categories";
import { t } from "@/lib/i18n";
import { useBahasa } from "@/lib/useBahasa";

type ItemMenu = {
  href: string;
  label: string;
  deskripsi: string;
  ikon: LucideIcon;
};

/** Ikon per kategori (berdasarkan slug KATEGORI_UTAMA). */
const IKON_KATEGORI: Record<string, LucideIcon> = {
  indonesia: Flag,
  dunia: Globe,
  ekonomi: TrendingUp,
  teknologi: Cpu,
  sains: FlaskConical,
  pendidikan: GraduationCap,
  "lingkungan-energi": Leaf,
  "fakta-mitos": Scale,
  "data-statistik": BarChart3,
  pengetahuan: BookOpen,
};

const FAKTA_DATA: ItemMenu[] = [
  { href: "/kategori/fakta-mitos", label: "Fakta & Mitos", deskripsi: "Periksa klaim publik dengan bukti.", ikon: Scale },
  { href: "/kategori/data-statistik", label: "Data & Statistik", deskripsi: "Grafik dan tren indikator resmi.", ikon: BarChart3 },
  { href: "/data", label: "Data", deskripsi: "Indikator nasional dan dunia.", ikon: Database },
  { href: "/sumber", label: "Sumber", deskripsi: "Daftar sumber berita beserta tier dan rekam pemeriksaannya.", ikon: Database },
  { href: "/data/live", label: "Data Live", deskripsi: "Gempa, cuaca, kurs, sholat — langsung dari API publik.", ikon: Activity },
  { href: "/peta", label: "Peta", deskripsi: "Peristiwa di peta dunia.", ikon: Map },
  { href: "/riset", label: "Riset", deskripsi: "Laporan riset berbasis data.", ikon: FlaskConical },
  { href: "/timeline", label: "Timeline", deskripsi: "Kronologi peristiwa.", ikon: History },
];

const WAWASAN: ItemMenu[] = [
  { href: "/pengetahuan", label: "Pusat Pengetahuan", deskripsi: "Penjelasan dunia, topik demi topik.", ikon: BookOpen },
  { href: "/cerita", label: "Cerita", deskripsi: "Peristiwa yang diikuti perkembangannya.", ikon: Newspaper },
  { href: "/sejarah", label: "Sejarah", deskripsi: "Arsip sejarah per tahun dan era.", ikon: Landmark },
  { href: "/negara", label: "Negara", deskripsi: "Profil negara.", ikon: Globe },
];

const BELAJAR: ItemMenu[] = [
  { href: "/akademi", label: "Akademi", deskripsi: "Kursus belajar.", ikon: School },
  { href: "/kuis", label: "Kuis", deskripsi: "Kuis harian.", ikon: ClipboardList },
  { href: "/tanya", label: "Tanya", deskripsi: "Tanya jawab seputar berita.", ikon: MessageCircleQuestion },
  { href: "/podcast", label: "Podcast", deskripsi: "Episode audio.", ikon: Podcast },
];

function ItemMenuTautan({ item }: { item: ItemMenu }) {
  const Ikon = item.ikon;
  return (
    <DropdownMenu.Item asChild>
      <Link href={item.href} className="menu-item">
        <span className="menu-item-ikon" aria-hidden="true">
          <Ikon size={18} />
        </span>
        <span className="menu-item-teks">
          <span className="menu-item-label">{item.label}</span>
          <span className="menu-item-deskripsi">{item.deskripsi}</span>
        </span>
      </Link>
    </DropdownMenu.Item>
  );
}

function DropdownGrup({
  label,
  ikon: Ikon,
  aktif,
  lebar,
  children,
}: {
  label: string;
  ikon: LucideIcon;
  aktif: boolean;
  lebar?: boolean;
  children: React.ReactNode;
}) {
  // DropdownGrup komponen tersendiri: baca bahasa sendiri lewat
  // hook yang sama (bukan prop) agar HeaderNav tidak perlu
  // meneruskan bahasa ke tiap grup.
  const bahasa = useBahasa();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={`nav-pemicu${aktif ? " aktif" : ""}`}
          aria-label={`${label} — ${t(bahasa, "nav.submenu")}`}
        >
          <Ikon size={17} aria-hidden="true" />
          <span>{label}</span>
          <ChevronDown size={15} className="nav-chevron" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={`menu-panel${lebar ? " menu-panel-lebar" : ""}`}
          sideOffset={8}
          align="start"
          collisionPadding={16}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export default function HeaderNav() {
  const pathname = usePathname();
  const bahasa = useBahasa();
  const aktif = (href: string): boolean =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);
  const aktifGrup = (awalan: string[]): boolean =>
    awalan.some((h) => pathname === h || pathname.startsWith(`${h}/`));

  const aktifKategori = aktifGrup(["/kategori"]);
  const aktifFaktaData = aktifGrup([
    "/data",
    "/sumber",
    "/peta",
    "/riset",
    "/timeline",
    "/kategori/fakta-mitos",
    "/kategori/data-statistik",
  ]);
  const aktifWawasan = aktifGrup(["/pengetahuan", "/cerita", "/sejarah", "/negara"]);
  const aktifBelajar = aktifGrup(["/akademi", "/kuis", "/tanya", "/podcast"]);

  const tautan = (href: string, label: string, Ikon: LucideIcon) => (
    <Link
      href={href}
      className={`nav-tautan${aktif(href) ? " aktif" : ""}`}
      aria-current={aktif(href) ? "page" : undefined}
    >
      <Ikon size={17} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );

  return (
    <nav className="nav-utama" aria-label="Navigasi utama">
      {tautan("/", t(bahasa, "nav.beranda"), Home)}

      <DropdownGrup label={t(bahasa, "nav.kategori")} ikon={LayoutGrid} aktif={aktifKategori} lebar>
        <ItemMenuTautan
          item={{
            href: "/kategori",
            label: t(bahasa, "nav.semuaKategori"),
            deskripsi: "Jelajahi semua kategori berita.",
            ikon: LayoutGrid,
          }}
        />
        {KATEGORI_UTAMA.map((k) => (
          <ItemMenuTautan
            key={k.slug}
            item={{
              href: `/kategori/${k.slug}`,
              label: k.nama,
              deskripsi: k.deskripsi,
              ikon: IKON_KATEGORI[k.slug] ?? BookOpen,
            }}
          />
        ))}
      </DropdownGrup>

      <DropdownGrup label={t(bahasa, "nav.faktaData")} ikon={Database} aktif={aktifFaktaData}>
        {FAKTA_DATA.map((item) => (
          <ItemMenuTautan key={item.href} item={item} />
        ))}
      </DropdownGrup>

      <DropdownGrup label={t(bahasa, "nav.wawasan")} ikon={Lightbulb} aktif={aktifWawasan}>
        {WAWASAN.map((item) => (
          <ItemMenuTautan key={item.href} item={item} />
        ))}
      </DropdownGrup>

      <DropdownGrup label={t(bahasa, "nav.belajar")} ikon={GraduationCap} aktif={aktifBelajar}>
        {BELAJAR.map((item) => (
          <ItemMenuTautan key={item.href} item={item} />
        ))}
      </DropdownGrup>

      {tautan("/brief", t(bahasa, "nav.brief"), Sunrise)}
      {tautan("/arsip", t(bahasa, "nav.arsip"), Archive)}
      {tautan("/jelajahi", t(bahasa, "nav.jelajahi"), Compass)}
    </nav>
  );
}
