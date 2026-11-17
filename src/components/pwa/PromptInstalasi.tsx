"use client";

import { useEffect } from "react";
import {
  apakahTerinstal,
  simpanEventInstalasi,
  tandaiTerinstal,
  type BeforeInstallPromptEvent,
} from "@/lib/instalasi-pwa";

// Penangkap event instalasi PWA (pekerja C).
// Dipasang SEKALI di root layout, di samping PendaftaranSW dan
// BannerPembaruan. Komponen ini TIDAK merender banner atau
// tombol apa pun — hanya menangkap event ke store
// instalasi-pwa:
// - beforeinstallprompt: preventDefault (supaya browser tidak
//   menampilkan tawaran otomatis yang mengganggu) + simpan
//   event ke store untuk dipakai tombol "Instal aplikasi" di
//   SeksiIzin (/saya#izin-browser).
// - appinstalled: tandai terinstal + bersihkan store.
// - display-mode standalone (termasuk navigator.standalone di
//   iOS Safari lama): diperiksa sesudah mount — bila halaman
//   dibuka sebagai aplikasi terinstal, status langsung
//   "terinstal" walau tidak ada event yang tertangkap.
export default function PromptInstalasi() {
  useEffect(() => {
    if (apakahTerinstal()) tandaiTerinstal();

    function saatBeforeInstall(event: Event): void {
      event.preventDefault();
      simpanEventInstalasi(event as BeforeInstallPromptEvent);
    }
    function saatTerinstal(): void {
      tandaiTerinstal();
    }

    window.addEventListener("beforeinstallprompt", saatBeforeInstall);
    window.addEventListener("appinstalled", saatTerinstal);
    return () => {
      window.removeEventListener("beforeinstallprompt", saatBeforeInstall);
      window.removeEventListener("appinstalled", saatTerinstal);
    };
  }, []);

  return null;
}
