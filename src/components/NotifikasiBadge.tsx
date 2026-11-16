"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Lencana notifikasi di Header (Gelombang B2-D, E1).
// Membaca jumlah belum dibaca dari /api/notifikasi/jumlah saat
// mount + tiap 60 detik; 401 (belum login) / 503 (tabel belum
// ada) → tidak tampil (bukan angka palsu). Mengikuti pola
// AuthArea: semua pembacaan waktu/state di useEffect agar tidak
// menghalangi prerender shell statis (cacheComponents).
export default function NotifikasiBadge() {
  const [jumlah, setJumlah] = useState<number | null>(null);

  useEffect(() => {
    let batal = false;
    async function muat() {
      try {
        const res = await fetch("/api/notifikasi/jumlah", {
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (!batal) setJumlah(null);
          return;
        }
        const data = (await res.json()) as {
          ok?: boolean;
          belum_dibaca?: number;
        };
        if (!batal) {
          setJumlah(
            data.ok && typeof data.belum_dibaca === "number"
              ? data.belum_dibaca
              : null,
          );
        }
      } catch {
        if (!batal) setJumlah(null);
      }
    }
    void muat();
    const timer = setInterval(() => void muat(), 60_000);
    return () => {
      batal = true;
      clearInterval(timer);
    };
  }, []);

  if (jumlah === null) return null;

  return (
    <Link
      className="tombol tombol-hantu"
      href="/saya/notifikasi"
      aria-label={
        jumlah > 0
          ? `${jumlah} notifikasi belum dibaca — buka daftar notifikasi`
          : "Notifikasi — buka daftar notifikasi"
      }
    >
      🔔
      {jumlah > 0 ? (
        <span
          aria-hidden="true"
          style={{
            marginLeft: 4,
            minWidth: 20,
            display: "inline-block",
            textAlign: "center",
            borderRadius: 999,
            padding: "0 6px",
            fontSize: 12,
            fontWeight: 700,
            color: "#fff",
            background: "var(--merah, #c0392b)",
          }}
        >
          {jumlah > 99 ? "99+" : jumlah}
        </span>
      ) : null}
    </Link>
  );
}
