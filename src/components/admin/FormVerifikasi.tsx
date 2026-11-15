"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// Form ubah status verifikasi artikel (pemeriksaan fakta).
// Keputusan = salah satu dari 6 status verifikasi resmi.
const STATUS = [
  "VERIFIED",
  "CROSS-CHECKED",
  "DEVELOPING",
  "UNCONFIRMED",
  "DISPUTED",
  "CORRECTED",
] as const;

export default function FormVerifikasi({
  artikelId,
  statusSaatIni,
}: {
  artikelId: string;
  statusSaatIni: string;
}) {
  const awal = (STATUS as readonly string[]).includes(statusSaatIni)
    ? statusSaatIni
    : "UNCONFIRMED";
  const [keputusan, setKeputusan] = useState<string>(awal);
  const [catatan, setCatatan] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "sukses">(
    "idle",
  );
  const [pesan, setPesan] = useState("");
  const router = useRouter();

  async function kirim(e: FormEvent) {
    e.preventDefault();
    // API fakta mewajibkan catatan terisi.
    if (!catatan.trim()) {
      setStatus("error");
      setPesan("Catatan wajib diisi — dasar perubahan status harus tertulis.");
      return;
    }
    setStatus("loading");
    setPesan("");
    try {
      const res = await fetch(`/api/admin/artikel/${artikelId}/fakta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keputusan, catatan: catatan.trim() }),
      });
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Bukan JSON.
      }
      if (!res.ok || data.ok === false) {
        setStatus("error");
        setPesan(data.error ?? `Gagal menyimpan verifikasi (${res.status}).`);
        return;
      }
      setStatus("sukses");
      setPesan("Status verifikasi berhasil diubah.");
      router.refresh();
    } catch {
      setStatus("error");
      setPesan("Tidak dapat terhubung ke server.");
    }
  }

  return (
    <form className="formulir form-lebar" onSubmit={kirim}>
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
        Status verifikasi baru
        <select
          value={keputusan}
          onChange={(e) => setKeputusan(e.target.value)}
        >
          {STATUS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label>
        Catatan (wajib)
        <textarea
          required
          rows={3}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Dasar perubahan status ini."
        />
      </label>
      <button
        className="tombol tombol-primer"
        type="submit"
        disabled={status === "loading"}
      >
        {status === "loading" ? "Menyimpan…" : "Simpan status verifikasi"}
      </button>
    </form>
  );
}
