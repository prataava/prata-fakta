"use client";

import { useEffect, useRef, useState } from "react";

// Banner pembaruan service worker (P3-1).
// Mendengarkan pesan "SW_BARU" dari worker (dikirim saat worker
// baru terpasang di install) dan controllerchange sesudah
// SKIP_WAITING. Bila tidak ada update, tidak tampil apa-apa.
// Tombol "Muat ulang" mengirim SKIP_WAITING ke worker yang
// menunggu lalu reload saat controller berganti.
export default function BannerPembaruan() {
  const [adaUpdate, setAdaUpdate] = useState(false);
  const [memuatUlang, setMemuatUlang] = useState(false);
  // Reload HANYA sesudah pengguna menekan "Muat ulang".
  // (sw.js memanggil skipWaiting otomatis sesudah precache,
  // jadi controllerchange bisa terjadi tanpa tombol ditekan —
  // tanpa pagar ini halaman me-reload sendiri.)
  const dimintaMuatUlang = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    let batal = false;
    function saatPesan(event: MessageEvent) {
      if (batal) return;
      if (event.data && event.data.type === "SW_BARU") {
        setAdaUpdate(true);
      }
    }
    function saatControllerBerubah() {
      if (batal) return;
      if (dimintaMuatUlang.current) window.location.reload();
    }
    navigator.serviceWorker.addEventListener("message", saatPesan);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      saatControllerBerubah,
    );
    // Bila worker baru sudah menunggu sebelum komponen mount,
    // periksa registrasi yang ada.
    navigator.serviceWorker
      .getRegistration("/sw.js")
      .then((reg) => {
        if (!batal && reg && reg.waiting) setAdaUpdate(true);
      })
      .catch(() => undefined);
    return () => {
      batal = true;
      navigator.serviceWorker.removeEventListener("message", saatPesan);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        saatControllerBerubah,
      );
    };
  }, []);

  if (!adaUpdate) return null;

  async function muatUlang() {
    if (memuatUlang) return;
    setMemuatUlang(true);
    dimintaMuatUlang.current = true;
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (reg && reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        // controllerchange di atas akan me-reload; bila dalam
        // 3 detik tidak terjadi, reload paksa agar tombol
        // selalu memberi hasil.
        window.setTimeout(() => window.location.reload(), 3000);
      } else {
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  }

  return (
    <div
      role="status"
      className="banner-pembaruan"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
        transform: "translateX(-50%)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        maxWidth: "min(92vw, 26rem)",
        padding: "0.75rem 1rem",
        borderRadius: "0.75rem",
        background: "var(--glass-bg)",
        color: "var(--ink)",
        border: "1px solid var(--glass-border)",
        boxShadow: "0 0.5rem 1.5rem rgba(0, 0, 0, 0.35)",
        backdropFilter: "blur(12px)",
      }}
    >
      <p style={{ margin: 0, flex: 1, fontSize: "0.9rem" }}>
        Versi baru tersedia.
      </p>
      <button
        className="tombol tombol-primer"
        type="button"
        onClick={() => void muatUlang()}
        disabled={memuatUlang}
      >
        {memuatUlang ? "Memuat ulang…" : "Muat ulang"}
      </button>
    </div>
  );
}
