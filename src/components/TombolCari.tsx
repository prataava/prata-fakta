"use client";

import { useState } from "react";

// Tombol pencarian seluler (Fase 3 Aurora): hanya tampil <768px.
// Membuka/menutup baris pencarian di header dengan menambah /
// menghapus class `cari-terbuka` pada <header>. Form pencarian
// sendiri tetap GET biasa ke /cari (SearchBar — berfungsi tanpa
// JavaScript); tombol ini hanya mengendalikan visibilitas.
export default function TombolCari() {
  const [terbuka, setTerbuka] = useState(false);

  function alihkan(e: React.MouseEvent<HTMLButtonElement>) {
    const baru = !terbuka;
    setTerbuka(baru);
    e.currentTarget.closest("header")?.classList.toggle("cari-terbuka", baru);
    if (baru) {
      // Fokuskan input begitu baris terbuka (tanpa mengubah URL).
      const header = e.currentTarget.closest("header");
      const input = header?.querySelector<HTMLInputElement>(".cari input");
      input?.focus();
    }
  }

  return (
    <button
      className="tombol tombol-ikon tombol-hantu tombol-cari"
      type="button"
      onClick={alihkan}
      aria-label={terbuka ? "Tutup pencarian" : "Buka pencarian"}
      aria-expanded={terbuka}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
    </button>
  );
}
