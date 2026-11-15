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

const NAV: { href: string; label: string }[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/artikel", label: "Artikel" },
  { href: "/admin/review", label: "Review" },
  { href: "/admin/koreksi", label: "Koreksi" },
  { href: "/admin/pengguna", label: "Pengguna" },
  { href: "/admin/sistem", label: "Sistem" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/brief", label: "Brief" },
  { href: "/admin/sumber", label: "Sumber" },
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
        {NAV.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
        <Link href="/">Kembali ke Beranda</Link>
      </nav>

      {children}
    </div>
  );
}
