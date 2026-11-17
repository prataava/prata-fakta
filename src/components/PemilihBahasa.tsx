// Pengalih bahasa ID | EN (P3-3, client). Dipasang di AuthArea
// (header-atas) sehingga terlihat di desktop MAUPUN seluler —
// HeaderNav (baris 2) disembunyikan di HP lewat CSS, jadi bukan
// tempatnya. JANGAN buat sistem nav kedua.
//
// State bahasa berasal dari store cookie (useBahasa,
// useSyncExternalStore) — komponen ini TIDAK menyimpan state
// bahasa sendiri. Perilaku saat ganti:
//  1. Cookie `pf-bahasa` ditulis (1 tahun, path=/, SameSite=Lax)
//     — cookie adalah sumber kebenaran rendering.
//  2. Event window "pf:bahasa" disiarkan → subscriber store
//     (nav, cari, palet, dock) memperbarui label tanpa reload.
//  3. Bila login, PATCH /api/saya/preferensi { bahasa } (endpoint
//     P3-2; kolom `bahasa` dari migrasi v21). BILA PATCH GAGAL
//     (kolom v21 belum ada → 503, offline, sesi habis), cookie
//     TETAP berlaku — kegagalan ditelan diam-diam, jangan blokir
//     UI dan jangan lempar.
//  4. router.refresh() → komponen server (footer, /cari) membaca
//     ulang cookie.
// Saat mount: atribut document.documentElement.lang mengikuti
// bahasa store; bila cookie belum ada dan preferensi akun tersedia
// (prop bahasaAkun dari AuthArea — dibaca klien dari
// GET /api/saya/preferensi, BUKAN dari props server: Header tidak
// boleh memanggil cookies()/DB agar shell tetap prerender),
// cookie ditulis dari akun + event disiarkan. Server-rendered
// `lang` tetap "id" (layout milik P3-1) — batas jujur, lihat
// src/lib/i18n.ts.
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ACARA_BAHASA,
  t,
  type Bahasa,
} from "@/lib/i18n";
import { bacaCookieBahasa, tulisCookieBahasa, useBahasa } from "@/lib/useBahasa";

export default function PemilihBahasa({
  bahasaAkun = null,
  masuk = false,
}: {
  /** Bahasa dari preferensi akun (bila login); null = tak diketahui. */
  bahasaAkun?: Bahasa | null;
  /** True bila pengguna login — hanya saat itu PATCH dikirim. */
  masuk?: boolean;
}) {
  const bahasa = useBahasa();
  const router = useRouter();

  // Atribut lang dokumen mengikuti bahasa store.
  useEffect(() => {
    document.documentElement.lang = bahasa;
  }, [bahasa]);

  // Sinkronkan cookie dari preferensi akun bila cookie belum ada
  // (sekali saat bahasaAkun ketemu). Siaran event WAJIB: menulis
  // cookie saja tidak memberi tahu subscriber store.
  useEffect(() => {
    if (!bacaCookieBahasa() && bahasaAkun) {
      tulisCookieBahasa(bahasaAkun);
      window.dispatchEvent(
        new CustomEvent(ACARA_BAHASA, { detail: bahasaAkun }),
      );
    }
  }, [bahasaAkun]);

  async function ganti(b: Bahasa) {
    if (b === bahasa) return;
    tulisCookieBahasa(b);
    window.dispatchEvent(new CustomEvent(ACARA_BAHASA, { detail: b }));
    // Simpan ke akun bila login — kegagalan tidak membatalkan
    // pilihan: cookie tetap berlaku (lihat komentar berkas).
    if (masuk) {
      try {
        await fetch("/api/saya/preferensi", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bahasa: b }),
        });
      } catch {
        // Sengaja ditelan: cookie tetap sumber kebenaran.
      }
    }
    router.refresh();
  }

  return (
    <div
      className="pemilih-bahasa"
      role="group"
      aria-label={t(bahasa, "bahasa.label")}
    >
      {(["id", "en"] as const).map((b) => (
        <button
          key={b}
          type="button"
          className={`pemilih-bahasa-tombol${bahasa === b ? " aktif" : ""}`}
          aria-pressed={bahasa === b}
          aria-label={t(bahasa, b === "id" ? "bahasa.indonesia" : "bahasa.inggris")}
          onClick={() => void ganti(b)}
        >
          {b.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
