// PRATA FAKTA — MotionCard (Fase 3 redesign).
// Kartu interaktif: hover naik 2px + tap mengecil — HANYA
// transform (tanpa animasi layout/box-shadow). Reduced motion
// dimatikan MotionConfig (reducedMotion="user").

"use client";

import { motion } from "motion/react";
import { DURASI_DASAR, MOTION_EASE } from "./token";

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
      whileHover={nonaktif ? undefined : { y: -2 }}
      whileTap={nonaktif ? undefined : { scale: 0.98 }}
      transition={{ duration: DURASI_DASAR, ease: MOTION_EASE }}
    >
      {children}
    </motion.div>
  );
}
