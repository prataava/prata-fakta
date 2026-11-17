"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./PetaDunia.module.css";
import { formatTanggal } from "@/lib/format";
import { mintaLokasi, pesanGagalLokasi } from "@/lib/geolokasi";

export type MarkerPeta = {
  lintang: number;
  bujur: number;
  judul: string;
  tanggal: string | null;
  lokasi: string | null;
  tautan: string;
  labelTautan: string;
};

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
  // Penanda "Lokasi Anda" — disimpan agar penekanan tombol
  // berikutnya mengganti penanda lama, bukan menumpuk.
  const penandaLokasiRef = useRef<import("leaflet").Layer | null>(null);
  const [pesanLokasi, setPesanLokasi] = useState<string | null>(null);
  const [memuatLokasi, setMemuatLokasi] = useState(false);

  // "Lokasi saya": minta geolocation sekali, pusatkan peta ke
  // koordinat pengguna dengan penanda biru yang jelas berbeda
  // dari pin artikel (merah). Lokasi TIDAK dikirim ke mana pun —
  // semuanya terjadi di perangkat ini. Bila gagal, tampilkan
  // pesan jujur dan JANGAN minta ulang otomatis.
  async function tampilkanLokasiSaya() {
    if (memuatLokasi) return;
    setMemuatLokasi(true);
    setPesanLokasi(null);
    const hasil = await mintaLokasi();
    if (!hasil.ok) {
      setPesanLokasi(pesanGagalLokasi(hasil.alasan, "peta"));
      setMemuatLokasi(false);
      return;
    }
    const peta = petaRef.current;
    if (!peta) {
      setPesanLokasi("Peta belum siap — coba lagi sebentar lagi.");
      setMemuatLokasi(false);
      return;
    }
    const L = (await import("leaflet")).default;
    penandaLokasiRef.current?.remove();
    const penanda = L.circleMarker([hasil.lintang, hasil.bujur], {
      radius: 9,
      color: "#ffffff",
      weight: 3,
      fillColor: "#2563eb",
      fillOpacity: 0.95,
    }).addTo(peta);
    penanda.bindTooltip("Lokasi Anda", {
      permanent: true,
      direction: "top",
      offset: [0, -12],
    });
    penandaLokasiRef.current = penanda;
    peta.setView([hasil.lintang, hasil.bujur], 13);
    setMemuatLokasi(false);
  }

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
          `${escapeHtml(formatTanggal(m.tanggal, "Tanggal belum tersedia"))}` +
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
    <div>
      {/* Bilah kontrol DI ATAS peta (bukan menimpa peta) agar tombol
          tidak pernah menutupi pin peristiwa. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          className="tombol"
          style={{ color: "var(--ink)" }}
          onClick={() => void tampilkanLokasiSaya()}
          disabled={memuatLokasi}
        >
          {memuatLokasi ? "Mencari lokasi…" : "◎ Lokasi saya"}
        </button>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: 0 }}>
          Lokasi hanya dipakai di perangkat ini untuk memusatkan peta —
          tidak dikirim atau disimpan ke server.
        </p>
      </div>
      {pesanLokasi && (
        <p role="status" style={{ color: "var(--muted)", marginBottom: 12 }}>
          {pesanLokasi}
        </p>
      )}
      <div
        ref={wadahRef}
        className={styles.peta}
        role="region"
        aria-label="Peta peristiwa"
      />
    </div>
  );
}
