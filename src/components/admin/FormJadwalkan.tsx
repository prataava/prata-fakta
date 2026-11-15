"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

// Penjadwalan terbit artikel: isi tanggal-jam, kirim ke
// POST /api/admin/artikel/[id]/jadwalkan.
// Nilai awal diturunkan dari prop saat inisialisasi state (bukan
// lewat useEffect — setState di dalam effect dilarang lint
// react-hooks/set-state-in-effect). Formatter ini deterministik
// (hanya memformat string prop, bukan membaca waktu saat ini),
// jadi aman di jalur render.
export default function FormJadwalkan({
  artikelId,
  dijadwalkanPada,
}: {
  artikelId: string;
  dijadwalkanPada: string | null;
}) {
  // datetime-local butuh format YYYY-MM-DDTHH:mm (waktu lokal).
  const [nilai, setNilai] = useState(() => {
    if (!dijadwalkanPada) return "";
    const d = new Date(dijadwalkanPada);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
  });
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "sukses">(
    "idle",
  );
  const [pesan, setPesan] = useState("");
  const router = useRouter();

  async function kirim(e: FormEvent) {
    e.preventDefault();
    if (!nilai) {
      setStatus("error");
      setPesan("Pilih tanggal dan jam penjadwalan dulu.");
      return;
    }
    setStatus("loading");
    setPesan("");
    try {
      const res = await fetch(`/api/admin/artikel/${artikelId}/jadwalkan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dijadwalkan_pada: new Date(nilai).toISOString() }),
      });
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Bukan JSON.
      }
      if (!res.ok || data.ok === false) {
        setStatus("error");
        setPesan(data.error ?? `Gagal menjadwalkan (${res.status}).`);
        return;
      }
      setStatus("sukses");
      setPesan("Artikel berhasil dijadwalkan.");
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
        Terbit pada
        <input
          type="datetime-local"
          required
          value={nilai}
          onChange={(e) => setNilai(e.target.value)}
        />
      </label>
      <button
        className="tombol"
        type="submit"
        disabled={status === "loading"}
      >
        {status === "loading" ? "Menjadwalkan…" : "Jadwalkan terbit"}
      </button>
    </form>
  );
}
