// PRATA FAKTA — Reveal + Stagger (Fase 3 redesign).
// Reveal masuk viewport SEKALI (once) lalu menetap — Motion
// memakai IntersectionObserver di balik whileInView.
// Plasma (25 Nov 2026): entrance memakai spring fisis aurora
// (stiffness 120 / damping 11) — formIn ~0.25 dtk, sedikit
// overshoot kenyal, bukan fade datar. Hanya opacity +
// translateY (transform).

"use client";

import { motion } from "motion/react";
import { SPRING_AURORA, STAGGER_KARTU } from "./token";

type RevealProps = {
  children: React.ReactNode;
  /** Jeda sebelum reveal (detik). */
  delay?: number;
  /** Jarak geser awal (px). */
  y?: number;
  className?: string;
};

/** Reveal sekali saat masuk viewport (spring aurora 120/11). */
export function Reveal({ children, delay = 0, y = 16, className }: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ ...SPRING_AURORA, delay }}
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
  tersembunyi: { opacity: 0, y: 16 },
  tampil: {
    opacity: 1,
    y: 0,
    transition: SPRING_AURORA,
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
