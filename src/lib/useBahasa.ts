// Hook bahasa sisi klien (P3-3). Sumber kebenaran: cookie
// `pf-bahasa`; perubahan disiarkan lewat event window "pf:bahasa"
// (PemilihBahasa → semua komponen klien).
//
// KENAPA useSyncExternalStore (bukan useState + effect /
// setState saat render): cookie dibaca saat render klien, tapi
// SSR merender "id". Pola useState + koreksi sesudah mount
// menyebabkan hydration mismatch React #418 saat cookie "en"
// sudah ada sebelum muat (terbukti CDP 17 Nov 2026: #418 +
// TypeError parentNode di /cari + / 390px). useSyncExternalStore
// adalah pola resmi React untuk store eksternal: server memakai
// getServerSnapshot ("id", cocok dengan SSR), klien memakai
// getSnapshot (cookie) dan me-render ulang saat store berubah —
// tanpa hydration error. JANGAN kembalikan ke pola koreksi
// sesudah render tanpa menguji CDP dengan cookie "en" yang
// sudah terset sebelum muat pertama.
"use client";

import { useSyncExternalStore } from "react";
import {
  ACARA_BAHASA,
  COOKIE_BAHASA,
  type Bahasa,
} from "@/lib/i18n";

/** Baca cookie pf-bahasa; null bila belum ada / nilainya liar. */
export function bacaCookieBahasa(): Bahasa | null {
  if (typeof document === "undefined") return null;
  for (const bagian of document.cookie.split(";")) {
    const [nama, ...sisa] = bagian.trim().split("=");
    if (nama === COOKIE_BAHASA) {
      const nilai = decodeURIComponent(sisa.join("="));
      return nilai === "id" || nilai === "en" ? nilai : null;
    }
  }
  return null;
}

/** Tulis cookie pf-bahasa (1 tahun, path=/, SameSite=Lax).
 *  TANPA flag Secure: situs dev berjalan lewat http://localhost —
 *  cookie Secure tidak akan tersimpan di sana. CATATAN: menulis
 *  cookie TIDAK memberi tahu subscriber dengan sendirinya —
 *  pemanggil WAJIB menyiarkan event ACARA_BAHASA sesudahnya
 *  (PemilihBahasa melakukannya; router.refresh() juga memicu
 *  render ulang sehingga perubahan dari /saya/pengaturan tetap
 *  sampai). */
export function tulisCookieBahasa(bahasa: Bahasa): void {
  document.cookie =
    `${COOKIE_BAHASA}=${bahasa}; max-age=31536000; path=/; SameSite=Lax`;
}

/** Snapshot klien: bahasa dari cookie (default id). */
function getSnapshotBahasa(): Bahasa {
  return bacaCookieBahasa() ?? "id";
}

/** Snapshot server: selalu "id" (cocok dengan SSR). */
function getServerSnapshotBahasa(): Bahasa {
  return "id";
}

/** Langganan perubahan: event "pf:bahasa" dari PemilihBahasa. */
function langgananBahasa(beriTahu: () => void): () => void {
  window.addEventListener(ACARA_BAHASA, beriTahu);
  return () => {
    window.removeEventListener(ACARA_BAHASA, beriTahu);
  };
}

/** Bahasa aktif di klien (store eksternal berbasis cookie). */
export function useBahasa(): Bahasa {
  return useSyncExternalStore(
    langgananBahasa,
    getSnapshotBahasa,
    getServerSnapshotBahasa,
  );
}
