"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// Formulir tambah titik data ke satu indikator (admin).
// POST /api/admin/data/[id] — upsert: bila tanggal yang sama sudah
// ada, nilainya DIPERBARUI (bukan duplikat).
export default function FormTitikData({
  indikatorId,
  namaIndikator,
}: {
  indikatorId: string;
  namaIndikator: string;
}) {
  const [tanggal, setTanggal] = useState("");
  const [nilai, setNilai] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "sukses">(
    "idle",
  );
  const [pesan, setPesan] = useState("");
  const router = useRouter();

  async function kirim(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setPesan("");
    try {
      const res = await fetch(`/api/admin/data/${indikatorId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tanggal, nilai: Number(nilai) }),
      });
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Bukan JSON.
      }
      if (!res.ok || data.ok === false) {
        setStatus("error");
        setPesan(data.error ?? `Gagal menyimpan titik data (${res.status}).`);
        return;
      }
      setStatus("sukses");
      setPesan(`Titik data ${tanggal} untuk ${namaIndikator} berhasil disimpan.`);
      setTanggal("");
      setNilai("");
      router.refresh();
    } catch {
      setStatus("error");
      setPesan("Tidak dapat terhubung ke server.");
    }
  }

  return (
    <form className="formulir" style={{ maxWidth: "100%" }} onSubmit={kirim}>
      {status === "error" && (
        <p className="pesan-error" role="alert">
          {pesan}
        </p>
      )}
      {status === "sukses" && (
        <p className="pesan-sukses" role="status">
          {pesan}
        </p>
      )}
      <label>
        Tanggal
        <input
          type="date"
          required
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
        />
      </label>
      <label>
        Nilai
        <input
          type="number"
          step="any"
          required
          value={nilai}
          onChange={(e) => setNilai(e.target.value)}
          placeholder="Contoh: 281.6"
        />
      </label>
      <button
        className="tombol tombol-primer"
        type="submit"
        disabled={status === "loading"}
      >
        {status === "loading" ? "Menyimpan…" : "Simpan titik data"}
      </button>
    </form>
  );
}
