// Formulir event admin (F-S8) — dipindah dari src/app/admin/event/
// page.tsx tanpa mengubah logika submit/validasi. Dipakai tambah
// event baru maupun ubah event (details "Ubah" di daftar).
"use client";

import { useState, type FormEvent as ReactFormEvent } from "react";

export type EventAdmin = {
  id: string;
  judul: string;
  ringkasan: string | null;
  lokasi_teks: string | null;
  lintang: number | null;
  bujur: number | null;
  dimulai_pada: string | null;
  berakhir_pada: string | null;
  dampak: string | null;
  sumber_url: string | null;
  era: string | null;
  penting: boolean;
  negara_kode: string | null;
};

/** ISO timestamptz → nilai input datetime-local (YYYY-MM-DDTHH:mm). */
function keInputTanggal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16);
}

export default function FormEvent({
  event,
  onSelesai,
}: {
  event?: EventAdmin | null;
  onSelesai: () => void;
}) {
  const edit = Boolean(event);
  const [judul, setJudul] = useState(event?.judul ?? "");
  const [ringkasan, setRingkasan] = useState(event?.ringkasan ?? "");
  const [dimulai, setDimulai] = useState(keInputTanggal(event?.dimulai_pada ?? null));
  const [berakhir, setBerakhir] = useState(keInputTanggal(event?.berakhir_pada ?? null));
  const [lokasi, setLokasi] = useState(event?.lokasi_teks ?? "");
  const [era, setEra] = useState(event?.era ?? "");
  const [penting, setPenting] = useState(event?.penting ?? false);
  const [negara, setNegara] = useState(event?.negara_kode ?? "");
  const [sumberUrl, setSumberUrl] = useState(event?.sumber_url ?? "");
  const [dampak, setDampak] = useState(event?.dampak ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "sukses">("idle");
  const [pesan, setPesan] = useState("");

  async function kirim(e: ReactFormEvent) {
    e.preventDefault();
    setStatus("loading");
    setPesan("");
    const payload: Record<string, unknown> = {
      judul: judul.trim(),
      ringkasan: ringkasan.trim() || null,
      dimulai_pada: dimulai || null,
      berakhir_pada: berakhir || null,
      lokasi_teks: lokasi.trim() || null,
      era: era.trim() || null,
      penting,
      negara_kode: negara.trim().toUpperCase() || null,
      sumber_url: sumberUrl.trim() || null,
      dampak: dampak.trim() || null,
    };
    try {
      const res = await fetch(
        edit ? `/api/admin/event/${event?.id}` : "/api/admin/event",
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
        setPesan(data.error ?? `Gagal menyimpan event (${res.status}).`);
        return;
      }
      setStatus("sukses");
      setPesan(edit ? "Event berhasil diubah." : "Event berhasil ditambah.");
      if (!edit) {
        setJudul("");
        setRingkasan("");
        setDimulai("");
        setBerakhir("");
        setLokasi("");
        setEra("");
        setPenting(false);
        setNegara("");
        setSumberUrl("");
        setDampak("");
      }
      onSelesai();
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
        Judul event
        <input
          type="text"
          required
          maxLength={200}
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          placeholder="Contoh: Pemilihan umum 2024"
        />
      </label>
      <label>
        Ringkasan
        <textarea
          rows={3}
          maxLength={2000}
          value={ringkasan}
          onChange={(e) => setRingkasan(e.target.value)}
        />
      </label>
      <label>
        Dimulai pada
        <input
          type="datetime-local"
          required={!edit}
          value={dimulai}
          onChange={(e) => setDimulai(e.target.value)}
        />
      </label>
      <label>
        Berakhir pada (opsional)
        <input
          type="datetime-local"
          value={berakhir}
          onChange={(e) => setBerakhir(e.target.value)}
        />
      </label>
      <label>
        Lokasi (teks)
        <input
          type="text"
          maxLength={200}
          value={lokasi}
          onChange={(e) => setLokasi(e.target.value)}
          placeholder="Contoh: Jakarta"
        />
      </label>
      <label>
        Era (opsional — untuk Arsip Sejarah)
        <input
          type="text"
          maxLength={60}
          value={era}
          onChange={(e) => setEra(e.target.value)}
          placeholder="Contoh: Reformasi"
        />
      </label>
      <label>
        Kode negara (opsional, 2 huruf — mis. ID)
        <input
          type="text"
          maxLength={2}
          value={negara}
          onChange={(e) => setNegara(e.target.value)}
          placeholder="ID"
        />
      </label>
      <label>
        URL sumber (opsional)
        <input
          type="url"
          value={sumberUrl}
          onChange={(e) => setSumberUrl(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <label>
        Dampak (opsional)
        <textarea
          rows={2}
          maxLength={2000}
          value={dampak}
          onChange={(e) => setDampak(e.target.value)}
        />
      </label>
      <label
        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
      >
        <input
          type="checkbox"
          checked={penting}
          onChange={(e) => setPenting(e.target.checked)}
        />
        Event penting (ditampilkan di Arsip Sejarah bila difilter)
      </label>
      <button
        className="tombol tombol-primer"
        type="submit"
        disabled={status === "loading"}
      >
        {status === "loading"
          ? "Menyimpan…"
          : edit
            ? "Simpan perubahan"
            : "Tambah event"}
      </button>
    </form>
  );
}
