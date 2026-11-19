import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/data";
import NavAdmin from "@/components/admin/NavAdmin";
import AdminTopbar from "@/components/admin/AdminTopbar";
import styles from "./layout.module.css";

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

  // Shell Linear (Fase 4 redesign): sidebar + command bar di atas
  // kolom utama. Judul dinamis tetap lewat AdminJudul (F-R1) di
  // dalam AdminTopbar — satu <h1> per halaman.
  return (
    <div className={styles.shell}>
      <NavAdmin />
      <div className={styles.kolom}>
        <AdminTopbar
          email={sesi.email ?? "pengguna staf"}
          roles={sesi.roles}
        />
        <div className="wadah">{children}</div>
      </div>
    </div>
  );
}
