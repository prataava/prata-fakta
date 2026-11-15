// Layout segmen /profil — metadata tidak bisa diekspor dari
// page.tsx (client component), jadi ditaruh di layout segmen.
// Halaman pengguna (butuh login) — jangan diindeks (Fase 7).
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profil",
  description: "Profil dan pengaturan akun PRATA FAKTA.",
  robots: { index: false, follow: false },
};

export default function ProfilLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
