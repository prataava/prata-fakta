"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";

// Tombol aksi admin generik: POST/PATCH/DELETE ke route /api/admin/*
// (atau /api/sumber/*) dengan konfirmasi opsional dan pesan hasil.
// Setelah berhasil, halaman di-refresh agar data server terbaru tampil.
//
// Konfirmasi memakai dialog dalam-halaman (Radix Dialog), BUKAN
// window.confirm: dialog bawaan browser ditolak otomatis oleh
// lapisan otomasi (terbukti 17 Nov 2026: tombol "Terbitkan" diklik
// tapi POST tidak pernah jalan, 0/14 draf terbit). Dialog Radix
// adalah elemen DOM biasa — bisa diklik manusia maupun otomatisasi.
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
  /** Teks konfirmasi (dialog dalam-halaman). Kosong = tanpa konfirmasi. */
  konfirmasi?: string;
  varian?: "biasa" | "primer" | "bahaya" | "hantu";
  onSelesai?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [pesan, setPesan] = useState("");
  const [sukses, setSukses] = useState(false);
  const [terbuka, setTerbuka] = useState(false);
  const router = useRouter();

  async function jalankan() {
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
      setTerbuka(false);
      router.refresh();
      onSelesai?.();
    } catch {
      setPesan("Tidak dapat terhubung ke server.");
    } finally {
      setLoading(false);
    }
  }

  function klik() {
    if (konfirmasi) {
      setTerbuka(true);
      return;
    }
    void jalankan();
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
        onClick={klik}
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
      {konfirmasi && (
        <Dialog.Root open={terbuka} onOpenChange={setTerbuka}>
          <Dialog.Portal>
            <Dialog.Overlay className="palette-lapisan" />
            <Dialog.Content
              className="palette-konten"
              style={{ padding: 20, maxWidth: 440 }}
            >
              <Dialog.Title
                style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}
              >
                {label}
              </Dialog.Title>
              <Dialog.Description
                style={{ color: "var(--muted)", margin: "0 0 20px" }}
              >
                {konfirmasi}
              </Dialog.Description>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                }}
              >
                <Dialog.Close asChild>
                  <button type="button" className="tombol tombol-hantu">
                    Batal
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  className={kelas}
                  onClick={() => void jalankan()}
                  disabled={loading}
                >
                  {loading ? (labelLoading ?? "Memproses…") : label}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </span>
  );
}
