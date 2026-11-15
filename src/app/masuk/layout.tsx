// Layout segmen /masuk — metadata tidak bisa diekspor dari
// page.tsx (client component), jadi ditaruh di layout segmen.
// Halaman auth — jangan diindeks mesin pencari (Fase 7).
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Masuk",
  description: "Masuk ke akun PRATA FAKTA.",
  robots: { index: false, follow: false },
};

export default function MasukLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
