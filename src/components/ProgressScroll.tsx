// ProgressScroll — bilah progres gulir halaman (Fase 4):
// dipakai /timeline + /observatorium (scroll-linked HANYA di
// dua halaman itu). Tipis di atas (fixed, z di atas header
// sticky), HANYA transform scaleX (bukan width) + rAF throttle.
// Client component; tanpa Date/waktu.
"use client";

import { useEffect, useState } from "react";
import gaya from "./ProgressScroll.module.css";

export default function ProgressScroll({
  label = "Progress halaman",
}: {
  label?: string;
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const hitung = () => {
      const el = document.documentElement;
      const total = el.scrollHeight - el.clientHeight;
      setProgress(
        total > 0
          ? Math.min(100, Math.max(0, (el.scrollTop / total) * 100))
          : 0,
      );
    };
    const saatGulir = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(hitung);
    };
    hitung();
    window.addEventListener("scroll", saatGulir, { passive: true });
    window.addEventListener("resize", saatGulir);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", saatGulir);
      window.removeEventListener("resize", saatGulir);
    };
  }, []);

  return (
    <div
      className={gaya.batang}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={gaya.isi}
        style={{ transform: `scaleX(${progress / 100})` }}
      />
    </div>
  );
}
