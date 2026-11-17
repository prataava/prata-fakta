"use client";

import { useSyncExternalStore } from "react";

// Store kecil status instalasi PWA (pekerja C).
//
// Menangkap event `beforeinstallprompt` yang dipasang SEKALI oleh
// PromptInstalasi di root layout, menyimpannya di module-level,
// dan mengekspos status lewat `useStatusInstalasi()` berbasis
// useSyncExternalStore — pola yang sama dengan pelajaran P3:
// JANGAN baca cookie/state saat render (hydration mismatch #418).
// Semua pembacaan browser (matchMedia, event) terjadi di
// useEffect / handler, bukan saat render. Server snapshot selalu
// "tidak-tersedia" sehingga render server dan render klien
// pertama identik.
//
// Status:
// - "dapat-diinstal": event beforeinstallprompt tertangkap dan
//   belum dipakai — tombol "Instal aplikasi" bisa memanggil
//   event.prompt().
// - "terinstal": event appinstalled tertangkap, atau halaman
//   dibuka dalam display-mode standalone (termasuk
//   navigator.standalone di iOS Safari lama).
// - "tidak-tersedia": belum ada event — bisa karena aplikasi
//   sudah terinstal, browser tidak mendukung instalasi, atau
//   kriteria instalasi belum terpenuhi. Ditampilkan jujur
//   sebagai "belum tersedia", bukan error.

export type StatusInstalasi =
  | "dapat-diinstal"
  | "terinstal"
  | "tidak-tersedia";

// Event ini belum ada di lib.dom TypeScript — didefinisikan
// mengikuti spesifikasi (MDN: BeforeInstallPromptEvent).
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

let eventTersimpan: BeforeInstallPromptEvent | null = null;
let terinstal = false;
let status: StatusInstalasi = "tidak-tersedia";
const pendengar = new Set<() => void>();

function hitungStatus(): StatusInstalasi {
  if (terinstal) return "terinstal";
  if (eventTersimpan) return "dapat-diinstal";
  return "tidak-tersedia";
}

function perbarui(): void {
  const baru = hitungStatus();
  if (baru !== status) {
    status = baru;
    pendengar.forEach((fn) => fn());
  }
}

// Dipanggil PromptInstalasi saat beforeinstallprompt tertangkap.
export function simpanEventInstalasi(
  event: BeforeInstallPromptEvent,
): void {
  eventTersimpan = event;
  perbarui();
}

// Dipanggil PromptInstalasi saat appinstalled tertangkap, atau
// saat display-mode standalone terdeteksi sesudah mount.
export function tandaiTerinstal(): void {
  terinstal = true;
  eventTersimpan = null;
  perbarui();
}

// Dipanggil sesudah event.prompt() dipakai — satu event hanya
// bisa dipakai sekali; tawaran berikutnya menunggu event baru
// dari browser.
export function bersihkanEventInstalasi(): void {
  eventTersimpan = null;
  perbarui();
}

export function ambilEventInstalasi(): BeforeInstallPromptEvent | null {
  return eventTersimpan;
}

// HANYA dipanggil dari useEffect/handler (sesudah mount) —
// membaca matchMedia saat render akan memecah hydration.
export function apakahTerinstal(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari lama tidak punya display-mode standalone.
  return (
    (window.navigator as Navigator & { standalone?: boolean })
      .standalone === true
  );
}

function langganan(cb: () => void): () => void {
  pendengar.add(cb);
  return () => {
    pendengar.delete(cb);
  };
}

function ambilSnapshot(): StatusInstalasi {
  return status;
}

function ambilSnapshotServer(): StatusInstalasi {
  return "tidak-tersedia";
}

export function useStatusInstalasi(): StatusInstalasi {
  return useSyncExternalStore(
    langganan,
    ambilSnapshot,
    ambilSnapshotServer,
  );
}
