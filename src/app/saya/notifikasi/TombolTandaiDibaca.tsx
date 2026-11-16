"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Tombol "tandai semua dibaca" — PATCH /api/notifikasi
// { semua: true }, lalu muat ulang daftar.
export default function TombolTandaiDibaca() {
  const router = useRouter();
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  async function tandai() {
    if (sibuk) return;
    setSibuk(true);
    setPesan(null);
    try {
      const res = await fetch("/api/notifikasi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semua: true }),
      });
      if (!res.ok) {
        setPesan("Gagal menandai dibaca. Coba lagi.");
      } else {
        router.refresh();
      }
    } catch {
      setPesan("Gagal menandai dibaca. Coba lagi.");
    } finally {
      setSibuk(false);
    }
  }

  return (
    <p>
      <button
        className="tombol"
        type="button"
        onClick={() => void tandai()}
        disabled={sibuk}
      >
        {sibuk ? "Menyimpan…" : "Tandai semua dibaca"}
      </button>
      {pesan ? (
        <span role="status" style={{ marginLeft: 8 }}>
          {pesan}
        </span>
      ) : null}
    </p>
  );
}
