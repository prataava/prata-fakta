"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// Form keputusan review editorial: Setujui / Tolak / Kembalikan.
// Catatan wajib diisi (sesuai skema pf_editorial_reviews).
export default function FormKeputusanReview({
  artikelId,
}: {
  artikelId: string;
}) {
  const [keputusan, setKeputusan] = useState<"setuju" | "tolak" | "kembalikan">(
    "setuju",
  );
  const [catatan, setCatatan] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "sukses">(
    "idle",
  );
  const [pesan, setPesan] = useState("");
  const router = useRouter();

  async function kirim(e: FormEvent) {
    e.preventDefault();
    if (!catatan.trim()) {
      setStatus("error");
      setPesan("Catatan wajib diisi — setiap keputusan harus punya alasan tertulis.");
      return;
    }
    setStatus("loading");
    setPesan("");
    try {
      const res = await fetch(`/api/admin/artikel/${artikelId}/review`, {
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
        setPesan(data.error ?? `Gagal menyimpan keputusan (${res.status}).`);
        return;
      }
      setStatus("sukses");
      setPesan("Keputusan review berhasil disimpan.");
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
        Keputusan
        <select
          value={keputusan}
          onChange={(e) =>
            setKeputusan(e.target.value as "setuju" | "tolak" | "kembalikan")
          }
        >
          <option value="setuju">Setujui — artikel siap terbit</option>
          <option value="tolak">Tolak — artikel tidak layak terbit</option>
          <option value="kembalikan">Kembalikan — perlu revisi penulis</option>
        </select>
      </label>
      <label>
        Catatan (wajib)
        <textarea
          required
          rows={4}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Alasan keputusan ini — dibaca penulis dan tercatat di audit."
        />
      </label>
      <button
        className="tombol tombol-primer"
        type="submit"
        disabled={status === "loading"}
      >
        {status === "loading" ? "Menyimpan…" : "Simpan keputusan"}
      </button>
    </form>
  );
}
