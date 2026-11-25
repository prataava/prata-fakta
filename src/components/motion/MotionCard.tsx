// PRATA FAKTA — MotionCard (Fase 3 redesign).
// Kartu interaktif: hover naik + tap mengecil — HANYA
// transform (tanpa animasi layout/box-shadow). Reduced motion
// dimatikan MotionConfig (reducedMotion="user").
// Plasma (25 Nov 2026): hover lift spring aurora fisis
// (stiffness 120 / damping 11) — naik 4px dengan overshoot
// kenyal, bukan luncur linear.

"use client";

import { motion } from "motion/react";
import { SPRING_AURORA } from "./token";

type MotionCardProps = {
  children: React.ReactNode;
  className?: string;
  /** Matikan interaksi hover/tap (kartu statis yang tetap reveal). */
  nonaktif?: boolean;
};

export function MotionCard({ children, className, nonaktif }: MotionCardProps) {
  return (
    <motion.div
      className={className}
      whileHover={nonaktif ? undefined : { y: -4 }}
      whileTap={nonaktif ? undefined : { scale: 0.98 }}
      transition={SPRING_AURORA}
    >
      {children}
    </motion.div>
  );
}
