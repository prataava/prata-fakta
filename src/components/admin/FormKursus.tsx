// Formulir buat kursus admin (F-S8) — dipindah dari
// src/app/admin/akademi/page.tsx tanpa mengubah logika
// submit/validasi. Sesudah kursus dibuat, modul & pelajaran
// diatur lewat FormStrukturAkademi.
"use client";

import { useState, type FormEvent as ReactFormEvent } from "react";

export type KursusAdmin = {
  id: string;
  slug: string;
  judul: string;
  deskripsi: string | null;
  kategori: string;
  tingkat: string;
  status: string;
  urutan: number;
  jumlah_modul: number;
  jumlah_pelajaran: number;
};

type StatusForm = "idle" | "loading" | "error" | "sukses";

export default function FormKursus({
  onSelesai,
}: {
  onSelesai: () => void;
}) {
  const [slug, setSlug] = useState("");
  const [judul, setJudul] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [kategori, setKategori] = useState("umum");
  const [tingkat, setTingkat] = useState("pemula");
  const [status, setStatus] = useState("draft");
  const [urutan, setUrutan] = useState("0");
  const [statusForm, setStatusForm] = useState<StatusForm>("idle");
  const [pesanForm, setPesanForm] = useState("");

  async function kirimKursus(e: ReactFormEvent) {
    e.preventDefault();
    setStatusForm("loading");
    setPesanForm("");
    try {
      const res = await fetch("/api/admin/akademi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim(),
          judul: judul.trim(),
          deskripsi: deskripsi.trim() === "" ? null : deskripsi.trim(),
          kategori: kategori.trim() || "umum",
          tingkat,
          status,
          urutan: Number(urutan) || 0,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStatusForm("error");
        setPesanForm(data.error ?? `Gagal menyimpan (${res.status}).`);
        return;
      }
      setStatusForm("sukses");
      setPesanForm("Kursus berhasil dibuat. Buka kursus di daftar untuk menambah modul dan pelajaran.");
      setSlug("");
      setJudul("");
      setDeskripsi("");
      setKategori("umum");
      setTingkat("pemula");
      setStatus("draft");
      setUrutan("0");
      onSelesai();
    } catch {
      setStatusForm("error");
      setPesanForm("Gagal menyimpan (jaringan).");
    }
  }

  return (
    <form className="formulir" onSubmit={kirimKursus}>
      <label>
        Judul kursus
        <input
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          required
          maxLength={200}
        />
      </label>
      <label>
        Slug (huruf kecil, angka, tanda -)
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
        />
      </label>
      <label>
        Deskripsi
        <textarea
          value={deskripsi}
          onChange={(e) => setDeskripsi(e.target.value)}
          rows={3}
        />
      </label>
      <label>
        Kategori
        <input
          value={kategori}
          onChange={(e) => setKategori(e.target.value)}
          required
          maxLength={60}
        />
      </label>
      <label>
        Tingkat
        <select
          value={tingkat}
          onChange={(e) => setTingkat(e.target.value)}
        >
          <option value="pemula">Pemula</option>
          <option value="menengah">Menengah</option>
          <option value="mendalam">Mendalam</option>
        </select>
      </label>
      <label>
        Status awal
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="draft">Draft</option>
          <option value="terbit">Terbit</option>
        </select>
      </label>
      <label>
        Urutan tampil
        <input
          value={urutan}
          onChange={(e) => setUrutan(e.target.value)}
          type="number"
          min={0}
          max={1000}
          inputMode="numeric"
        />
      </label>
      <button
        className="tombol tombol-primer"
        type="submit"
        disabled={statusForm === "loading"}
      >
        {statusForm === "loading" ? "Menyimpan…" : "Buat kursus"}
      </button>
      {statusForm === "error" && (
        <p role="alert" className="pesan-error">
          {pesanForm}
        </p>
      )}
      {statusForm === "sukses" && (
        <p role="status" className="pesan-sukses">
          {pesanForm}
        </p>
      )}
    </form>
  );
}
