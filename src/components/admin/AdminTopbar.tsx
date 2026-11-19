// Command bar admin (Fase 4 redesign): breadcrumb + judul halaman
// dinamis (AdminJudul) + tombol Ctrl+K ke Command Palette yang
// sudah ada + quick action + kontrol tema + menu pengguna.
// Client component; data sesi (email/roles) diterima dari layout
// server — tidak ada fetch baru di sini.
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { Dropdown, DropdownItem } from "@/components/motion";
import { createClient } from "@/lib/supabase/client";
import AdminJudul from "@/components/admin/AdminJudul";
import {
  labelHalamanAdmin,
  TombolMenuAdmin,
} from "@/components/admin/NavAdmin";
import styles from "./AdminTopbar.module.css";

export default function AdminTopbar({
  email,
  roles,
}: {
  email: string;
  roles: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const label = labelHalamanAdmin(pathname);
  const inisial = (email.trim()[0] ?? "?").toUpperCase();

  // Command Palette global sudah mendengarkan event ini
  // (src/components/CommandPalette.tsx) + Ctrl+K/Cmd+K.
  function bukaPalette() {
    window.dispatchEvent(new Event("pf:buka-palette"));
  }

  async function keluar() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/masuk");
    router.refresh();
  }

  return (
    <header className={styles.topbar}>
      <div className={styles.kiri}>
        <TombolMenuAdmin />
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <Link href="/admin">Admin</Link>
          {label && pathname !== "/admin" ? (
            <>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{label}</span>
            </>
          ) : null}
        </nav>
        {/* Satu <h1> per halaman — AdminJudul (F-R1). */}
        <AdminJudul />
      </div>
      <div className={styles.kanan}>
        <button
          type="button"
          className={styles.tombolCari}
          onClick={bukaPalette}
          aria-label="Buka palet perintah (Ctrl+K)"
          title="Palet perintah (Ctrl+K)"
        >
          <Search size={16} aria-hidden="true" />
          <span>Cari…</span>
          <kbd>Ctrl K</kbd>
        </button>
        <Link href="/admin/artikel/baru" className={styles.aksiCepat}>
          <Plus size={16} aria-hidden="true" />
          Artikel baru
        </Link>
        <ThemeToggle />
        <Dropdown
          pemicu={
            <button
              type="button"
              className={styles.pemicuPengguna}
              aria-label={`Menu pengguna ${email}`}
            >
              <span className={styles.avatar} aria-hidden="true">
                {inisial}
              </span>
              <span className={styles.email}>{email}</span>
            </button>
          }
        >
          <div className={styles.infoPengguna}>
            <span>{email}</span>
            <span>Role: {roles.join(", ")}</span>
          </div>
          <DropdownItem onPilih={() => router.push("/profil")}>
            Profil saya
          </DropdownItem>
          <DropdownItem onPilih={() => router.push("/")}>
            Lihat beranda publik
          </DropdownItem>
          <DropdownItem onPilih={keluar}>Keluar</DropdownItem>
        </Dropdown>
      </div>
    </header>
  );
}
