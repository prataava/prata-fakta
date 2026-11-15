"use client";

import { useState } from "react";
import Link from "next/link";
import type { PfNotifikasi } from "@/lib/lanjutan";

// Daftar notifikasi (client component): tandai dibaca per item atau
// semua sekaligus via PATCH /api/notifikasi.
const LABEL_JENIS: Record<string, string> = {
  breaking: "Breaking",
  topik: "Topik",
  brief: "Daily Brief",
  artikel: "Artikel",
  koreksi: "Koreksi",
  peristiwa: "Peristiwa",
};

function formatTanggal(waktu: string | null): string {
  if (!waktu) return "—";
  const d = new Date(waktu);
  if (Number.isNaN(d.getTime())) return waktu;
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export default function NotifikasiSaya({ awal }: { awal: PfNotifikasi[] }) {
  const [notif, setNotif] = useState<PfNotifikasi[]>(awal);
  const [pesan, setPesan] = useState("");

  async function tandai(id: string) {
    setPesan("");
    try {
      const res = await fetch("/api/notifikasi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setPesan(data.error ?? "Gagal menandai notifikasi. Coba lagi.");
        return;
      }
      setNotif((lama) =>
        lama.map((n) => (n.id === id ? { ...n, dibaca: true } : n)),
      );
    } catch {
      setPesan("Gagal menandai notifikasi. Periksa koneksi lalu coba lagi.");
    }
  }

  async function tandaiSemua() {
    setPesan("");
    try {
      const res = await fetch("/api/notifikasi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semua: true }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setPesan(data.error ?? "Gagal menandai notifikasi. Coba lagi.");
        return;
      }
      setNotif((lama) => lama.map((n) => ({ ...n, dibaca: true })));
    } catch {
      setPesan("Gagal menandai notifikasi. Periksa koneksi lalu coba lagi.");
    }
  }

  const belumDibaca = notif.filter((n) => !n.dibaca).length;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <p style={{ margin: 0 }}>
          {belumDibaca > 0
            ? `${belumDibaca} belum dibaca.`
            : "Semua notifikasi sudah dibaca."}
        </p>
        {belumDibaca > 0 && (
          <button className="tombol" type="button" onClick={tandaiSemua}>
            Tandai semua dibaca
          </button>
        )}
      </div>
      {pesan && (
        <p className="pesan-error" role="alert" style={{ marginTop: 12 }}>
          {pesan}
        </p>
      )}
      {notif.length === 0 ? (
        <p style={{ color: "var(--muted)", marginTop: 12 }}>
          Belum ada notifikasi.
        </p>
      ) : (
        <div className="grid-berita" style={{ marginTop: 12 }}>
          {notif.map((n) => (
            <article
              className="kartu"
              key={n.id}
              style={n.dibaca ? { opacity: 0.7 } : undefined}
            >
              <span className="kartu-kategori">
                {LABEL_JENIS[n.jenis] ?? n.jenis}
                {n.dibaca ? " · Dibaca" : " · Belum dibaca"}
              </span>
              <span className="kartu-judul">{n.judul}</span>
              {n.isi && <span className="kartu-teks">{n.isi}</span>}
              <span className="kartu-meta">{formatTanggal(n.dibuat_pada)}</span>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {n.tautan && (
                  <Link className="tombol tombol-hantu" href={n.tautan}>
                    Buka
                  </Link>
                )}
                {!n.dibaca && (
                  <button
                    className="tombol"
                    type="button"
                    onClick={() => tandai(n.id)}
                  >
                    Tandai dibaca
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
