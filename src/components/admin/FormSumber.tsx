"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PfSourceAdmin } from "@/lib/admin/data";

// Formulir tambah / ubah sumber berita. Memakai route /api/sumber
// yang sudah ada sejak Fase 3 (POST tambah, PATCH ubah).
const JENIS = ["rss", "api", "resmi", "manual"] as const;

export default function FormSumber({
  sumber,
}: {
  sumber?: PfSourceAdmin | null;
}) {
  const edit = Boolean(sumber);
  const [nama, setNama] = useState(sumber?.nama ?? "");
  const [jenis, setJenis] = useState<string>(sumber?.jenis ?? "rss");
  const [url, setUrl] = useState(sumber?.url ?? "");
  const [prioritas, setPrioritas] = useState(String(sumber?.prioritas ?? 50));
  const [aktif, setAktif] = useState(sumber?.aktif ?? true);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "sukses">(
    "idle",
  );
  const [pesan, setPesan] = useState("");
  const router = useRouter();

  async function kirim(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setPesan("");
    const payload: Record<string, unknown> = {
      nama: nama.trim(),
      jenis,
      url: url.trim(),
      prioritas: Number(prioritas),
      ...(edit ? { aktif } : {}),
    };
    try {
      const res = await fetch(
        edit ? `/api/sumber/${sumber?.id}` : "/api/sumber",
        {
          method: edit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Bukan JSON.
      }
      if (!res.ok || data.ok === false) {
        setStatus("error");
        setPesan(data.error ?? `Gagal menyimpan sumber (${res.status}).`);
        return;
      }
      setStatus("sukses");
      setPesan(edit ? "Sumber berhasil diubah." : "Sumber berhasil ditambah.");
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
        Nama sumber
        <input
          type="text"
          required
          maxLength={120}
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="Contoh: Antara — RSS Nasional"
        />
      </label>
      <label>
        Jenis
        <select value={jenis} onChange={(e) => setJenis(e.target.value)}>
          {JENIS.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>
      </label>
      <label>
        URL
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <label>
        Prioritas (0–100)
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          required
          value={prioritas}
          onChange={(e) => setPrioritas(e.target.value)}
        />
      </label>
      {edit && (
        <label
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <input
            type="checkbox"
            checked={aktif}
            onChange={(e) => setAktif(e.target.checked)}
          />
          Sumber aktif
        </label>
      )}
      <button
        className="tombol tombol-primer"
        type="submit"
        disabled={status === "loading"}
      >
        {status === "loading"
          ? "Menyimpan…"
          : edit
            ? "Simpan perubahan"
            : "Tambah sumber"}
      </button>
    </form>
  );
}
