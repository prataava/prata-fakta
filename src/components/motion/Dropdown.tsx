// PRATA FAKTA — Dropdown (Fase 3 redesign).
// Radix DropdownMenu (navigasi keyboard + aria bawaan) +
// Motion (fade + geser 120ms). Pemakai: butir menu apa pun.

"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion } from "motion/react";
import { DURASI_CEPAT, MOTION_EASE } from "./token";

type DropdownProps = {
  /** Elemen pemicu (biasanya tombol). */
  pemicu: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
};

/** Menu popover di bawah pemicu. */
export function Dropdown({ pemicu, children, align = "end" }: DropdownProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{pemicu}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          asChild
          align={align}
          sideOffset={8}
          collisionPadding={12}
        >
          <motion.div
            className="dropdown-gerak-konten"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURASI_CEPAT, ease: MOTION_EASE }}
          >
            {children}
          </motion.div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

type DropdownItemProps = {
  children: React.ReactNode;
  onPilih?: () => void;
  nonaktif?: boolean;
};

/** Butir menu di dalam <Dropdown>. */
export function DropdownItem({ children, onPilih, nonaktif }: DropdownItemProps) {
  return (
    <DropdownMenu.Item
      className="dropdown-gerak-item"
      onSelect={onPilih}
      disabled={nonaktif}
    >
      {children}
    </DropdownMenu.Item>
  );
}
