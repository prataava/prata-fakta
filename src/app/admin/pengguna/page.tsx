import type { Metadata } from "next";
import TabelPengguna from "@/components/admin/TabelPengguna";
import { getAdminSession } from "@/lib/admin/data";

export const metadata: Metadata = {
  title: "Pengguna — Admin",
  description: "Kelola role dan status akun pengguna PRATA FAKTA.",
};

export const instant = false;

export default async function AdminPengguna() {
  const sesi = await getAdminSession();
  const isSuperAdmin = Boolean(sesi?.roles.includes("super_admin"));

  return (
    <section className="seksi" aria-labelledby="judul-pengguna">
      <div className="seksi-kepala">
        <h2 id="judul-pengguna">Pengguna</h2>
      </div>
      <p className="artikel-meta-kecil">
        Daftar pengguna beserta role-nya. Mengubah role atau menonaktifkan
        akun hanya bisa dilakukan super_admin — dan tetap ditegakkan juga
        oleh API di server.
      </p>
      <TabelPengguna isSuperAdmin={isSuperAdmin} />
    </section>
  );
}
