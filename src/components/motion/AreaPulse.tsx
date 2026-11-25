// PRATA FAKTA — AreaPulse (Plasma, 25 Nov 2026).
// Klik di area KOSONG beranda → gelombang cincin (pulse) yang
// mengembang dan memudar dari titik klik — aproksimasi
// `usePlasmaRuntime().pulse(x, y)` dari paket Plasma asli
// (spec §6), tanpa WebGL: satu cincin Motion + glow.
// - Klik pada tautan/tombol/input/select (atau di dalam
//   [data-tanpa-denyut]) TIDAK memicu pulse — navigasi dan
//   interaksi lain tidak terganggu.
// - Cincin: scale 0.2 → 1 dengan spring aurora (stiffness 120 /
//   damping 11), opacity 0.55 → 0 (tween 0.55 dtk); dilepas
//   dari DOM ~0.7 dtk kemudian. pointer-events: none.
// - Reduced motion: tidak memicu sama sekali (cek matchMedia
//   + MotionConfig reducedMotion="user" sebagai jaring kedua).
// - Dipakai di beranda (page.tsx) membungkus .wadah.

"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "motion/react";
import { SPRING_AURORA } from "./token";

type Denyut = { id: number; x: number; y: number };

export function AreaPulse({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [denyut, setDenyut] = useState<Denyut[]>([]);
  const penghitung = useRef(0);

  const saatKlik = useCallback((e: React.MouseEvent) => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const target = e.target as HTMLElement | null;
    if (
      target?.closest(
        "a, button, input, textarea, select, [role='button'], [data-tanpa-denyut]",
      )
    ) {
      return;
    }
    penghitung.current += 1;
    const id = penghitung.current;
    const titik = { id, x: e.clientX, y: e.clientY };
    setDenyut((d) => [...d.slice(-5), titik]);
    window.setTimeout(() => {
      setDenyut((d) => d.filter((p) => p.id !== id));
    }, 700);
  }, []);

  return (
    <div className={className} onClick={saatKlik}>
      {children}
      {denyut.map((p) => (
        <motion.span
          key={p.id}
          className="denyut-plasma"
          aria-hidden="true"
          style={{ left: p.x, top: p.y }}
          initial={{ scale: 0.2, opacity: 0.55 }}
          animate={{ scale: 1, opacity: 0 }}
          transition={{
            ...SPRING_AURORA,
            opacity: { duration: 0.55, ease: "easeOut" },
          }}
        />
      ))}
    </div>
  );
}
