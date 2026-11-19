// PRATA FAKTA — Toast (Fase 3 redesign).
// Sistem toast ringan berbasis context: panggil
// tampilkanToast("...") dari komponen mana pun di bawah
// <ToastProvider> (pasang sekali, mis. di layout).
// Otomatis hilang 4 detik; maksimal 3 toast; aria-live sopan.
// Masuk/keluar via AnimatePresence — ini BUKAN transisi halaman,
// jadi exit di sini tidak menunda navigasi apa pun.

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { DURASI_DASAR, MOTION_EASE } from "./token";

type JenisToast = "info" | "sukses" | "galat";

type EntriToast = {
  id: number;
  pesan: string;
  jenis: JenisToast;
};

type KonteksToast = {
  tampilkanToast: (pesan: string, jenis?: JenisToast) => void;
};

const ToastContext = createContext<KonteksToast | null>(null);

export function useToast(): KonteksToast {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast harus dipakai di dalam <ToastProvider>");
  }
  return ctx;
}

const MAKS_TOAST = 3;
const LAMA_TAMPIL_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [daftar, setDaftar] = useState<EntriToast[]>([]);
  const berikut = useRef(1);

  const tampilkanToast = useCallback(
    (pesan: string, jenis: JenisToast = "info") => {
      const id = berikut.current;
      berikut.current += 1;
      setDaftar((lama) => [...lama.slice(-(MAKS_TOAST - 1)), { id, pesan, jenis }]);
      window.setTimeout(() => {
        setDaftar((lama) => lama.filter((t) => t.id !== id));
      }, LAMA_TAMPIL_MS);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ tampilkanToast }}>
      {children}
      <div className="toast-viewport" aria-live="polite">
        <AnimatePresence>
          {daftar.map((t) => (
            <motion.div
              key={t.id}
              className="toast-item"
              data-jenis={t.jenis}
              role="status"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: DURASI_DASAR, ease: MOTION_EASE }}
            >
              {t.pesan}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
