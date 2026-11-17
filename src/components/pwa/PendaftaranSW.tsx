"use client";

import { useEffect } from "react";

// Pendaftaran service worker selalu-aktif (P3-1).
// Mendaftar "/sw.js" saat window load; register() idempotent —
// bila sudah terdaftar, yang dipakai adalah registrasi yang sama,
// jadi alur PengalihPush (getRegistration("/sw.js") yang sama)
// tidak terganggu dan tidak ada registrasi kedua.
export default function PendaftaranSW() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    let batal = false;
    function daftar() {
      if (batal) return;
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registrasi gagal (mis. mode privat ketat): situs tetap
        // berfungsi penuh tanpa offline — bukan error fatal.
      });
    }
    if (document.readyState === "complete") {
      daftar();
    } else {
      window.addEventListener("load", daftar, { once: true });
    }
    return () => {
      batal = true;
      window.removeEventListener("load", daftar);
    };
  }, []);

  return null;
}
