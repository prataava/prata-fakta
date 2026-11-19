// Pencarian terakhir di halaman /cari (Fase 4, ala Raycast):
// dibaca dari riwayat lokal yang SUDAH ADA (localStorage
// 'pf-riwayat-cari', pustaka SaranPencarian — maks 8, terbaru
// dulu). Client component: localStorage hanya ada di klien.
// Kosong = tidak tampil sama sekali (bukan kotak kosong).
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  bacaRiwayatCari,
  hapusSemuaRiwayatCari,
} from "@/components/SaranPencarian";
import gaya from "./RiwayatCariPanel.module.css";

export default function RiwayatCariPanel() {
  const [riwayat, setRiwayat] = useState<string[] | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage hanya ada di klien, jadi riwayat TIDAK BISA jadi state awal (SSR) — harus dibaca sesudah mount, tanpa mismatch.
    setRiwayat(bacaRiwayatCari());
  }, []);

  if (!riwayat || riwayat.length === 0) return null;

  return (
    <div className={gaya.panel}>
      <div className={gaya.kepala}>
        <h3 className={gaya.judul}>Pencarian terakhir</h3>
        <button
          type="button"
          className={gaya.hapus}
          onClick={() => {
            hapusSemuaRiwayatCari();
            setRiwayat([]);
          }}
        >
          Hapus semua
        </button>
      </div>
      <ul className={gaya.daftar}>
        {riwayat.map((teks) => (
          <li key={teks}>
            <Link href={`/cari?q=${encodeURIComponent(teks)}`}>{teks}</Link>
          </li>
        ))}
      </ul>
      <p className={gaya.catatan}>
        Tersimpan hanya di perangkat ini — tidak dikirim ke server.
      </p>
    </div>
  );
}
