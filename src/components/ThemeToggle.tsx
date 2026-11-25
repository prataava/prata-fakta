"use client";

import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SPRING_AURORA } from "@/components/motion";

// Saklar tema terang/gelap. Tema dibaca lewat useSyncExternalStore
// (MutationObserver pada atribut data-theme) — bukan setState di dalam
// effect — agar lolos lint react-hooks/set-state-in-effect dan tidak
// merusak prerender. Pilihan tersimpan di localStorage ('pf-tema').
function bacaTema(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

function langgananTema(cb: () => void): () => void {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => obs.disconnect();
}

export default function ThemeToggle() {
  const tema = useSyncExternalStore(langgananTema, bacaTema, () => "light");

  function alihkan() {
    const baru = tema === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", baru);
    try {
      localStorage.setItem("pf-tema", baru);
    } catch {
      // localStorage tidak tersedia: tema tetap berlaku untuk sesi ini.
    }
  }

  // Plasma (25 Nov 2026): tap kenyal (scale 0.88, spring aurora
  // 120/11) + ikon berganti dengan putaran spring — transisi
  // warna tema sendiri ditangani CSS (body/.header, 250ms).
  return (
    <motion.button
      className="tombol tombol-ikon tombol-hantu"
      type="button"
      onClick={alihkan}
      aria-label={tema === "dark" ? "Beralih ke mode terang" : "Beralih ke mode gelap"}
      title={tema === "dark" ? "Mode terang" : "Mode gelap"}
      whileTap={{ scale: 0.88 }}
      transition={SPRING_AURORA}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={tema}
          style={{ display: "inline-flex" }}
          initial={{ rotate: -90, opacity: 0, scale: 0.7 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.7 }}
          transition={SPRING_AURORA}
        >
          {tema === "dark" ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
          )}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
