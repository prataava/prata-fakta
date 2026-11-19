// PRATA FAKTA — template root (Fase 3 redesign).
// Template (bukan layout) REMOUNT tiap navigasi — di sinilah
// entrance halaman diputar ulang. Tanpa usePathname (aturan
// cacheComponents: hook itu memblokir prerender halaman
// dinamis di Next 16).
// Entrance = opacity 200ms, content-first: konten tampil tanpa
// menunggu animasi; keluar instan (tanpa AnimatePresence exit
// yang menunda navigasi). Mati total saat reduced motion lewat
// MotionConfig reducedMotion="user" di MotionProvider.

"use client";

import { motion } from "motion/react";
import { DURASI_HALAMAN, MOTION_EASE } from "@/components/motion/token";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: DURASI_HALAMAN, ease: MOTION_EASE }}
    >
      {children}
    </motion.div>
  );
}
