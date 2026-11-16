"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// Tindak lanjut laporan koreksi pembaca: terima (laporan benar,
// artikel diperbaiki), tandai ditinjau (laporan sedang ditinjau
// redaksi — termasuk laporan umum tanpa artikel), atau tolak.
// Catatan wajib — menjadi alasan tertulis yang tercatat di audit.
export default function FormKoreksi({
  laporanId,
}: {
  laporanId: string;
}) {
  const [catatan, setCatatan] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "sukses">(
    "idle",
  );
  const [pesan, setPesan] = useState("");
  const router = useRouter();

  async function kirim(aksi: "terima" | "tolak" | "ditinjau", e: FormEvent) {
    e.preventDefault();
    if (!catatan.trim()) {
      setStatus("error");
      setPesan("Catatan wajib diisi — alasan tindak lanjut harus tertulis.");
      return;
    }
    setStatus("loading");
    setPesan("");
    try {
      const res = await fetch(`/api/admin/koreksi/${laporanId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aksi, catatan: catatan.trim() }),
      });
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Bukan JSON.
      }
      if (!res.ok || data.ok === false) {
        setStatus("error");
        setPesan(data.error ?? `Gagal menindaklanjuti (${res.status}).`);
        return;
      }
      setStatus("sukses");
      setPesan(
        aksi === "terima"
          ? "Laporan diterima — artikel ditandai perlu diperbaiki."
          : aksi === "ditinjau"
            ? "Laporan ditandai sedang ditinjau."
            : "Laporan ditolak.",
      );
      router.refresh();
    } catch {
      setStatus("error");
      setPesan("Tidak dapat terhubung ke server.");
    }
  }

  return (
    <form
      className="formulir"
      style={{ maxWidth: "100%" }}
      onSubmit={(e) => kirim("terima", e)}
    >
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
        Catatan tindak lanjut (wajib)
        <textarea
          required
          rows={2}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Alasan menerima / meninjau / menolak laporan ini."
        />
      </label>
      <div className="admin-aksi">
        <button
          className="tombol tombol-primer"
          type="submit"
          disabled={status === "loading"}
        >
          {status === "loading" ? "Memproses…" : "Terima laporan"}
        </button>
        <button
          className="tombol"
          type="button"
          disabled={status === "loading"}
          onClick={(e) => kirim("ditinjau", e)}
        >
          Tandai ditinjau
        </button>
        <button
          className="tombol"
          type="button"
          disabled={status === "loading"}
          onClick={(e) => kirim("tolak", e)}
        >
          Tolak laporan
        </button>
      </div>
    </form>
  );
}
