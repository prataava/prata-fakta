// PRATA FAKTA — Reveal + Stagger (Fase 3 redesign).
// Reveal masuk viewport SEKALI (once) lalu menetap — Motion
// memakai IntersectionObserver di balik whileInView.
// Hanya opacity + translateY (transform), durasi token dasar.

"use client";

import { motion } from "motion/react";
import { DURASI_DASAR, MOTION_EASE, STAGGER_KARTU } from "./token";

type RevealProps = {
  children: React.ReactNode;
  /** Jeda sebelum reveal (detik). */
  delay?: number;
  /** Jarak geser awal (px). */
  y?: number;
  className?: string;
};

/** Reveal sekali saat masuk viewport. */
export function Reveal({ children, delay = 0, y = 12, className }: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: DURASI_DASAR, ease: MOTION_EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

const varianGrup = {
  tersembunyi: {},
  tampil: { transition: { staggerChildren: STAGGER_KARTU } },
};

const varianButir = {
  tersembunyi: { opacity: 0, y: 12 },
  tampil: {
    opacity: 1,
    y: 0,
    transition: { duration: DURASI_DASAR, ease: MOTION_EASE },
  },
};

/** Grup kartu yang tampil berurutan (stagger 50ms). */
export function Stagger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={varianGrup}
      initial="tersembunyi"
      whileInView="tampil"
      viewport={{ once: true, margin: "-40px" }}
    >
      {children}
    </motion.div>
  );
}

/** Butir di dalam <Stagger> — wajib anak langsung Stagger. */
export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={varianButir}>
      {children}
    </motion.div>
  );
}
