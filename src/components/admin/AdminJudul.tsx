// Judul dinamis halaman admin (F-R1): SATU <h1> per halaman —
// layout tidak lagi memakai <h1> "Dashboard Admin" yang sama untuk
// semua halaman. Judul diambil dari label nav halaman yang sedang
// dibuka (/admin → "Dashboard Admin", lainnya → label navnya).
"use client";

import { usePathname } from "next/navigation";
import { labelHalamanAdmin } from "@/components/admin/NavAdmin";

export default function AdminJudul() {
  const pathname = usePathname();
  const label = labelHalamanAdmin(pathname);
  const judul =
    pathname === "/admin" ? "Dashboard Admin" : (label ?? "Dashboard Admin");
  return (
    <h1 id="judul-admin">{judul}</h1>
  );
}
