"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Pelacak kunjungan (Gelombang B2-D, D1): setiap pindah halaman,
// kirim SATU beacon { path } ke /api/analytics/kunjungan.
// PRIVASI: hanya pathname (tanpa query string / hash / IP /
// user-agent); pengunjung anonim tercatat tanpa user_id.
// Fire-and-forget: gagal kirim tidak menampilkan apa pun dan
// tidak menghalangi halaman. Mengikuti pola AuthArea (efek di
// useEffect, tanpa Date.now() di render — cacheComponents).
export default function PelacakKunjungan() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const muatan = JSON.stringify({ path: pathname });
    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([muatan], { type: "application/json" });
        navigator.sendBeacon("/api/analytics/kunjungan", blob);
        return;
      }
    } catch {
      // Jatuh ke fetch di bawah.
    }
    void fetch("/api/analytics/kunjungan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: muatan,
      keepalive: true,
    }).catch(() => {
      // Diam-diam: analitik tidak boleh mengganggu pengguna.
    });
  }, [pathname]);

  return null;
}
