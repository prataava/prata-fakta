import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/data";
import NavAdmin from "@/components/admin/NavAdmin";
import AdminJudul from "@/components/admin/AdminJudul";

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
        {/* F-R1: satu <h1> per halaman — judul dinamis dari halaman
            yang sedang dibuka (AdminJudul), bukan "Dashboard Admin"
            yang sama untuk semua halaman. */}
        <AdminJudul />
        <p>
          Kelola artikel, antrean review, laporan koreksi, pengguna, dan
          sistem PRATA FAKTA.
        </p>
        <p className="artikel-meta-kecil">
          Masuk sebagai {sesi.email ?? "pengguna staf"} · Role:{" "}
          {sesi.roles.join(", ")}
        </p>
      </section>

      <NavAdmin />

      {children}
    </div>
  );
}
