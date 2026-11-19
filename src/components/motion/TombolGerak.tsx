// PRATA FAKTA — TombolGerak, tombol 3-keadaan (Fase 3 redesign).
// Pola dari riset Ripplix: idle → memuat → sukses, lalu kembali
// ke idle. onKlik boleh async; tombol terkunci selama memuat.
// Warna + font eksplisit di .tombol-gerak (motion.css) karena
// <button> tidak mewarisi keduanya secara andal.

"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";

type KeadaanTombol = "idle" | "memuat" | "sukses";

type TombolGerakProps = {
  children: React.ReactNode;
  /** Aksi saat diklik; boleh async. Sukses = promise selesai. */
  onKlik: () => void | Promise<void>;
  varian?: "primer" | "garis";
  /** Label sesudah sukses (default: "Berhasil"). */
  labelSukses?: string;
  /** Lama tampilan sukses sebelum kembali idle (ms). */
  jedaSuksesMs?: number;
  nonaktif?: boolean;
  className?: string;
};

export function TombolGerak({
  children,
  onKlik,
  varian = "primer",
  labelSukses = "Berhasil",
  jedaSuksesMs = 1600,
  nonaktif,
  className,
}: TombolGerakProps) {
  const [keadaan, setKeadaan] = useState<KeadaanTombol>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function tanganiKlik() {
    if (keadaan !== "idle" || nonaktif) return;
    setKeadaan("memuat");
    try {
      await onKlik();
      setKeadaan("sukses");
      timer.current = setTimeout(() => setKeadaan("idle"), jedaSuksesMs);
    } catch {
      // Gagal: kembali idle agar pengguna bisa mencoba lagi.
      // Pesan galat menjadi tanggung jawab pemanggil (mis. Toast).
      setKeadaan("idle");
    }
  }

  return (
    <button
      type="button"
      className={`tombol-gerak${className ? ` ${className}` : ""}`}
      data-varian={varian}
      data-keadaan={keadaan}
      onClick={tanganiKlik}
      disabled={nonaktif || keadaan === "memuat"}
      aria-live="polite"
      aria-busy={keadaan === "memuat"}
    >
      {keadaan === "memuat" && (
        <Loader2 size={18} className="ikon-putar" aria-hidden="true" />
      )}
      {keadaan === "sukses" && <Check size={18} aria-hidden="true" />}
      {keadaan === "sukses" ? labelSukses : children}
    </button>
  );
}
