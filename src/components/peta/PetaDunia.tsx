"use client";

import { useEffect, useRef } from "react";
import styles from "./PetaDunia.module.css";

export type MarkerPeta = {
  lintang: number;
  bujur: number;
  judul: string;
  tanggal: string | null;
  lokasi: string | null;
  tautan: string;
  labelTautan: string;
};

function formatTanggal(tanggal: string | null): string {
  if (!tanggal) return "Tanggal belum tersedia";
  const d = new Date(tanggal);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Peta dunia interaktif (Leaflet + tile OpenStreetMap, gratis tanpa key).
// Marker HANYA dari event/artikel berkoordinat terverifikasi yang
// dikirim lewat props — komponen ini tidak pernah menebak koordinat.
export default function PetaDunia({ marker }: { marker: MarkerPeta[] }) {
  const wadahRef = useRef<HTMLDivElement | null>(null);
  const petaRef = useRef<import("leaflet").Map | null>(null);

  useEffect(() => {
    let batal = false;
    (async () => {
      if (!wadahRef.current || petaRef.current) return;
      const L = (await import("leaflet")).default;
      if (batal || !wadahRef.current) return;

      const peta = L.map(wadahRef.current, {
        worldCopyJump: true,
      }).setView([-2.5, 118], 5);
      petaRef.current = peta;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(peta);

      // divIcon HTML sendiri — JANGAN pakai ikon gambar bawaan Leaflet
      // (rusak di bundler karena path asetnya tidak tersalin).
      // Gaya pin ada di kelas global .pf-pin (globals.css) memakai
      // token var(--danger)/var(--surface) — adaptif mode gelap.
      const ikon = L.divIcon({
        className: "pf-pin-pembungkus",
        html: `<span class="pf-pin"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -10],
      });

      const batas: [number, number][] = [];
      for (const m of marker) {
        const isiPopup =
          `<strong>${escapeHtml(m.judul)}</strong><br>` +
          `${escapeHtml(formatTanggal(m.tanggal))}` +
          (m.lokasi ? `<br>${escapeHtml(m.lokasi)}` : "") +
          `<br><a href="${escapeHtml(m.tautan)}">${escapeHtml(m.labelTautan)}</a>`;
        L.marker([m.lintang, m.bujur], { icon: ikon })
          .addTo(peta)
          .bindPopup(isiPopup);
        batas.push([m.lintang, m.bujur]);
      }
      if (batas.length > 0) {
        peta.fitBounds(L.latLngBounds(batas), { padding: [40, 40], maxZoom: 10 });
      }
    })();
    return () => {
      batal = true;
      petaRef.current?.remove();
      petaRef.current = null;
    };
    // Marker dihitung sekali saat halaman dimuat (props server).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={wadahRef}
      className={styles.peta}
      role="application"
      aria-label="Peta peristiwa"
    />
  );
}
