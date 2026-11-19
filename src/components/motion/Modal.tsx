// PRATA FAKTA — Modal + Drawer (Fase 3 redesign).
// Radix Dialog (focus trap + Esc menutup + aria bawaan) +
// Motion (fade/scale 180ms). Tutup SELALU instan — tanpa exit
// yang menunda (konten di belakang langsung bisa dipakai lagi).

"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "motion/react";
import { DURASI_CEPAT, DURASI_DASAR, MOTION_EASE } from "./token";

type ModalProps = {
  terbuka: boolean;
  onTutup: (terbuka: boolean) => void;
  judul: string;
  deskripsi?: string;
  children: React.ReactNode;
};

/** Dialog tengah layar. */
export function Modal({ terbuka, onTutup, judul, deskripsi, children }: ModalProps) {
  return (
    <Dialog.Root open={terbuka} onOpenChange={onTutup}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            className="modal-gerak-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DURASI_CEPAT, ease: MOTION_EASE }}
          />
        </Dialog.Overlay>
        <Dialog.Content asChild>
          <motion.div
            className="modal-gerak-konten"
            initial={{ opacity: 0, scale: 0.96, x: "-50%", y: "-50%" }}
            animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
            transition={{ duration: DURASI_DASAR, ease: MOTION_EASE }}
          >
            <Dialog.Title>{judul}</Dialog.Title>
            {deskripsi ? (
              <Dialog.Description>{deskripsi}</Dialog.Description>
            ) : null}
            {children}
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type DrawerProps = {
  terbuka: boolean;
  onTutup: (terbuka: boolean) => void;
  judul: string;
  deskripsi?: string;
  children: React.ReactNode;
};

/** Lembar bawah (bottom sheet) untuk mobile. */
export function Drawer({ terbuka, onTutup, judul, deskripsi, children }: DrawerProps) {
  return (
    <Dialog.Root open={terbuka} onOpenChange={onTutup}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            className="modal-gerak-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DURASI_CEPAT, ease: MOTION_EASE }}
          />
        </Dialog.Overlay>
        <Dialog.Content asChild>
          <motion.div
            className="laci-gerak-konten"
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURASI_DASAR, ease: MOTION_EASE }}
          >
            <div className="laci-gerak-gagang" aria-hidden="true" />
            <Dialog.Title>{judul}</Dialog.Title>
            {deskripsi ? (
              <Dialog.Description>{deskripsi}</Dialog.Description>
            ) : null}
            {children}
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
