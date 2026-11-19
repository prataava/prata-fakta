// PRATA FAKTA — MotionProvider (Fase 3 redesign).
// "use client": membungkus <main> + BottomNav + CommandPalette
// di root layout. MotionConfig reducedMotion="user" membuat
// SEMUA komponen motion menghormati prefers-reduced-motion
// sistem (render keadaan akhir secara instan).
// Server component boleh dilewatkan sebagai children ke client
// component — jadi <main>{children}</main> tetap prerender.

"use client";

import { MotionConfig } from "motion/react";

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
