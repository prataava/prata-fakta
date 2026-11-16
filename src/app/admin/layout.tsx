import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/data";

export const metadata: Metadata = {
  title: "Dashboard Admin",
  description:
    "Dashboard admin PRATA FAKTA: artikel, review, koreksi, pengguna, dan sistem.",
  // Halaman staf — jangan diindeks mesin pencari (Fase 7). Konten
  // tetap dilindungi guard server di bawah; noindex menutup risiko
  // URL admin muncul di hasil pencarian.
  robots: { index: false, follow: false },
};

// Guard server: belum login → /masuk; bukan staf (super_admin /
// editor / fact_checker / writer) atau nonaktif → beranda publik.
// Halaman dibaca per request (pola cacheComponents seperti /brief).
export const instant = false;

const NAV: { grup: string; tautan: { href: string; label: string }[] }[] = [
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
      { href: "/admin/agen-ai", label: "Agen AI" },
      { href: "/admin/duplikat", label: "Duplikat" },
      { href: "/admin/kualitas", label: "Kualitas" },
      { href: "/admin/laporan-pengguna", label: "Laporan Pengguna" },
      { href: "/admin/kinerja", label: "Kinerja" },
      { href: "/admin/api-sehat", label: "API Sehat" },
      { href: "/admin/analitik", label: "Analitik" },
    ],
  },
];

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const sesi = await getAdminSession();
  if (!sesi) redirect("/masuk");
  if (
    !sesi.roles.some((r) =>
      ["super_admin", "editor", "fact_checker", "writer"].includes(r),
    )
  ) {
    redirect("/");
  }

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-admin">
        <span className="hero-label">Redaksi</span>
        <h1 id="judul-admin">Dashboard Admin</h1>
        <p>
          Kelola artikel, antrean review, laporan koreksi, pengguna, dan
          sistem PRATA FAKTA.
        </p>
        <p className="artikel-meta-kecil">
          Masuk sebagai {sesi.email ?? "pengguna staf"} · Role:{" "}
          {sesi.roles.join(", ")}
        </p>
      </section>

      <nav className="admin-nav" aria-label="Navigasi admin">
        {NAV.map((grup) => (
          <span key={grup.grup} className="admin-nav-grup">
            <span className="admin-nav-grup-label">{grup.grup}</span>
            {grup.tautan.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </span>
        ))}
        <Link href="/">Kembali ke Beranda</Link>
      </nav>

      {children}
    </div>
  );
}
