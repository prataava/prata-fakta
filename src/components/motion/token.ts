// PRATA FAKTA — token gerak untuk Motion (Fase 3 redesign).
// NILAI HARUS SAMA dengan token CSS di src/app/motion.css
// (--motion-cepat/dasar/halaman/penekanan + --ease-standar).
// Satu easing, empat durasi; hanya transform/opacity yang
// dianimasikan. Reduced motion ditangani MotionConfig
// reducedMotion="user" di MotionProvider.
// Plasma (25 Nov 2026): easing ini pendekatan CSS dari spring
// aurora (stiffness 120 / damping 11, spec §2); durasi tetap
// < 300 ms (budget one-shot Plasma).

/** Easing standar: cubic-bezier(0.16, 1, 0.3, 1). */
export const MOTION_EASE: [number, number, number, number] = [
  0.16, 1, 0.3, 1,
];

/** Durasi dalam detik (cermin token CSS ms). */
export const DURASI_CEPAT = 0.12;
export const DURASI_DASAR = 0.18;
export const DURASI_HALAMAN = 0.2;
export const DURASI_PENEKANAN = 0.25;

/** Jeda antar kartu saat stagger (40–60 ms, REDESIGN_DECISION §4). */
export const STAGGER_KARTU = 0.05;
