// Formulir minta tautan konfirmasi hapus akun (klien).
// POST /api/saya/akun/hapus/minta — tanpa kata sandi, tanpa data
// sensitif di body. Menampilkan status jujur (terkirim / gagal
// beserta alasan server), bukan klaim kosong.
"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "sukses" | "error";

export default function FormMintaHapus({ email }: { email: string | null }) {
  const [status, setStatus] = useState<Status>("idle");
  const [pesan, setPesan] = useState("");
  const [terkirimKe, setTerkirimKe] = useState<string | null>(null);

  async function unduhDulu() {
    setStatus("loading");
    setPesan("");
    try {
      const res = await fetch("/api/saya/ekspor");
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: unknown;
      };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setPesan(data.error ?? "Ekspor gagal. Coba lagi.");
        return;
      }
      const blob = new Blob([JSON.stringify(data.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "prata-fakta-data-saya.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("sukses");
      setPesan(
        "Data Anda berhasil diunduh sebagai JSON (lengkap, tanpa batas baris). Simpan berkas itu baik-baik sebelum melanjutkan.",
      );
    } catch {
      setStatus("error");
      setPesan("Tidak dapat terhubung ke server. Coba lagi.");
    }
  }

  async function mintaTautan() {
    setStatus("loading");
    setPesan("");
    try {
      const res = await fetch("/api/saya/akun/hapus/minta", {
        method: "POST",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        email?: string;
        pesan?: string;
      };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setPesan(data.error ?? "Permintaan gagal. Coba lagi.");
        return;
      }
      setTerkirimKe(data.email ?? email);
      setStatus("sukses");
      setPesan(
        data.pesan ??
          "Tautan konfirmasi telah dikirim ke email Anda. Tautan berlaku 24 jam dan hanya bisa dipakai sekali.",
      );
    } catch {
      setStatus("error");
      setPesan("Tidak dapat terhubung ke server. Coba lagi.");
    }
  }

  return (
    <div className="kartu-form">
      <p style={{ marginTop: 0 }}>
        Langkah pengaman: unduh data Anda dulu, baru minta tautan. Sesudah
        akun dihapus, data tidak dapat dikembalikan.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button
          className="tombol"
          type="button"
          onClick={unduhDulu}
          disabled={status === "loading"}
        >
          Unduh data saya dulu (JSON)
        </button>
        <button
          className="tombol tombol-primer"
          type="button"
          onClick={mintaTautan}
          disabled={status === "loading"}
        >
          {status === "loading"
            ? "Memproses…"
            : "Kirim tautan konfirmasi ke email saya"}
        </button>
      </div>
      {status === "sukses" && (
        <p className="pesan-sukses" role="status">
          {pesan}
          {terkirimKe ? ` Tautan dikirim ke ${terkirimKe}.` : ""}
          {" Periksa juga folder spam bila email tidak kunjung tiba."}
        </p>
      )}
      {status === "error" && (
        <p className="pesan-error" role="alert">
          {pesan}
        </p>
      )}
      {status === "idle" && (
        <p style={{ color: "var(--muted)" }}>
          Belum ada tautan yang diminta. Menekan tombol di atas belum
          menghapus apa pun — penghapusan hanya terjadi sesudah Anda
          mengklik tautan di email dan menekan konfirmasi akhir.
        </p>
      )}
    </div>
  );
}
