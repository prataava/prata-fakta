// Formulir cerita admin (F-S8) — dipindah dari
// src/app/admin/event/page.tsx tanpa mengubah logika
// submit/validasi. Dipakai tambah cerita baru maupun ubah cerita.
"use client";

import { useState, type FormEvent as ReactFormEvent } from "react";

export type TautanEvent = {
  id: string;
  event_id: string;
  urutan: number;
  catatan: string | null;
  judul: string | null;
  dimulai_pada: string | null;
};

export type TautanArtikel = {
  id: string;
  artikel_id: string;
  peran: string;
  judul: string | null;
  slug: string | null;
};

export type CeritaAdmin = {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  status: string;
  status_perkembangan: string;
  jumlah_event: number;
  jumlah_artikel: number;
  tautan_event: TautanEvent[];
  tautan_artikel: TautanArtikel[];
};

export type ArtikelPilihan = { id: string; slug: string; judul: string };

export default function FormCerita({
  cerita,
  onSelesai,
}: {
  cerita?: CeritaAdmin | null;
  onSelesai: () => void;
}) {
  const edit = Boolean(cerita);
  const [judul, setJudul] = useState(cerita?.judul ?? "");
  const [slug, setSlug] = useState(cerita?.slug ?? "");
  const [ringkasan, setRingkasan] = useState(cerita?.ringkasan ?? "");
  const [status, setStatus] = useState(cerita?.status ?? "draft");
  const [perkembangan, setPerkembangan] = useState(
    cerita?.status_perkembangan ?? "berkembang",
  );
  const [statusKirim, setStatusKirim] = useState<
    "idle" | "loading" | "error" | "sukses"
  >("idle");
  const [pesan, setPesan] = useState("");

  async function kirim(e: ReactFormEvent) {
    e.preventDefault();
    setStatusKirim("loading");
    setPesan("");
    const payload: Record<string, unknown> = {
      judul: judul.trim(),
      ringkasan: ringkasan.trim() || null,
      status,
      status_perkembangan: perkembangan,
    };
    if (slug.trim() !== "") payload.slug = slug.trim().toLowerCase();
    try {
      const res = await fetch(
        edit ? `/api/admin/cerita/${cerita?.id}` : "/api/admin/cerita",
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
        setStatusKirim("error");
        setPesan(data.error ?? `Gagal menyimpan cerita (${res.status}).`);
        return;
      }
      setStatusKirim("sukses");
      setPesan(edit ? "Cerita berhasil diubah." : "Cerita berhasil ditambah.");
      if (!edit) {
        setJudul("");
        setSlug("");
        setRingkasan("");
        setStatus("draft");
        setPerkembangan("berkembang");
      }
      onSelesai();
    } catch {
      setStatusKirim("error");
      setPesan("Tidak dapat terhubung ke server.");
    }
  }

  return (
    <form className="formulir" style={{ maxWidth: "100%" }} onSubmit={kirim}>
      {statusKirim === "error" && (
        <p className="pesan-error" role="alert">
          {pesan}
        </p>
      )}
      {statusKirim === "sukses" && (
        <p className="pesan-sukses" role="status">
          {pesan}
        </p>
      )}
      <label>
        Judul cerita
        <input
          type="text"
          required
          maxLength={200}
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          placeholder="Contoh: Krisis iklim global"
        />
      </label>
      <label>
        Slug {edit ? "" : "(opsional — dibuat otomatis dari judul bila kosong)"}
        <input
          type="text"
          maxLength={100}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="contoh: krisis-iklim-global"
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
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="draft">Draf (belum terlihat publik)</option>
          <option value="terbit">Terbit</option>
        </select>
      </label>
      <label>
        Status perkembangan
        <select
          value={perkembangan}
          onChange={(e) => setPerkembangan(e.target.value)}
        >
          <option value="berkembang">Masih berkembang</option>
          <option value="selesai">Selesai</option>
        </select>
      </label>
      <button
        className="tombol tombol-primer"
        type="submit"
        disabled={statusKirim === "loading"}
      >
        {statusKirim === "loading"
          ? "Menyimpan…"
          : edit
            ? "Simpan perubahan"
            : "Tambah cerita"}
      </button>
    </form>
  );
}
