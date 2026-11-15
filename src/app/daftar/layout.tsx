// Layout segmen /daftar — metadata tidak bisa diekspor dari
// page.tsx (client component), jadi ditaruh di layout segmen.
// Halaman auth — jangan diindeks mesin pencari (Fase 7).
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Daftar",
  description: "Buat akun PRATA FAKTA untuk menyimpan artikel, mengikuti topik, dan menerima notifikasi.",
  robots: { index: false, follow: false },
};

export default function DaftarLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
