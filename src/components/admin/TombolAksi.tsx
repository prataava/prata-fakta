"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Tombol aksi admin generik: POST/PATCH/DELETE ke route /api/admin/*
// (atau /api/sumber/*) dengan konfirmasi opsional dan pesan hasil.
// Setelah berhasil, halaman di-refresh agar data server terbaru tampil.
export default function TombolAksi({
  url,
  method = "POST",
  body,
  label,
  labelLoading,
  konfirmasi,
  varian = "biasa",
  onSelesai,
}: {
  url: string;
  method?: "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  label: string;
  labelLoading?: string;
  /** Teks konfirmasi (window.confirm). Kosong = tanpa konfirmasi. */
  konfirmasi?: string;
  varian?: "biasa" | "primer" | "bahaya" | "hantu";
  onSelesai?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [pesan, setPesan] = useState("");
  const [sukses, setSukses] = useState(false);
  const router = useRouter();

  async function jalankan() {
    if (konfirmasi && !window.confirm(konfirmasi)) return;
    setLoading(true);
    setPesan("");
    setSukses(false);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      let data: { ok?: boolean; error?: string; pesan?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Respons bukan JSON: pakai status HTTP saja.
      }
      if (!res.ok || data.ok === false) {
        setPesan(data.error ?? `Gagal (${res.status}). Coba lagi.`);
        return;
      }
      setSukses(true);
      setPesan(data.pesan ?? "Berhasil.");
      router.refresh();
      onSelesai?.();
    } catch {
      setPesan("Tidak dapat terhubung ke server.");
    } finally {
      setLoading(false);
    }
  }

  const kelas =
    varian === "primer"
      ? "tombol tombol-primer"
      : varian === "bahaya"
        ? "tombol tombol-bahaya"
        : varian === "hantu"
          ? "tombol tombol-hantu"
          : "tombol";

  return (
    <span className="admin-aksi-tombol">
      <button
        type="button"
        className={kelas}
        onClick={jalankan}
        disabled={loading}
      >
        {loading ? (labelLoading ?? "Memproses…") : label}
      </button>
      {pesan && (
        <span
          className={sukses ? "pesan-sukses" : "pesan-error"}
          role="status"
          style={{ marginBottom: 0 }}
        >
          {pesan}
        </span>
      )}
    </span>
  );
}
