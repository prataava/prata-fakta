"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PfIndikatorReality } from "@/lib/reality";

// Formulir tambah / ubah indikator (admin). Kategori mengikuti
// CHECK migrasi v6 (7 nilai); cakupan mengikuti CHECK v10
// ('indonesia'/'dunia'). Slug tidak bisa diubah sesudah dibuat —
// tautan dataset laporan riset dan URL bergantung padanya.
const KATEGORI = [
  "nasional",
  "global",
  "penduduk",
  "pendidikan",
  "ekonomi",
  "energi",
  "lingkungan",
] as const;

export default function FormIndikator({
  indikator,
}: {
  indikator?: (PfIndikatorReality & { jumlah_titik?: number }) | null;
}) {
  const edit = Boolean(indikator);
  const [nama, setNama] = useState(indikator?.nama ?? "");
  const [slug, setSlug] = useState(indikator?.slug ?? "");
  const [kategori, setKategori] = useState<string>(
    indikator?.kategori ?? "nasional",
  );
  const [satuan, setSatuan] = useState(indikator?.satuan ?? "");
  const [sumberNama, setSumberNama] = useState(indikator?.sumber_nama ?? "");
  const [sumberUrl, setSumberUrl] = useState(indikator?.sumber_url ?? "");
  const [metodologi, setMetodologi] = useState(indikator?.metodologi ?? "");
  const [tanggalPembaruan, setTanggalPembaruan] = useState(
    indikator?.tanggal_pembaruan ?? "",
  );
  const [cakupan, setCakupan] = useState<string>(
    indikator?.cakupan ?? "indonesia",
  );
  const [frekuensi, setFrekuensi] = useState(
    indikator?.frekuensi_update ?? "",
  );
  const [negaraKode, setNegaraKode] = useState(indikator?.negara_kode ?? "");
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
      kategori,
      satuan: satuan.trim() || null,
      sumber_nama: sumberNama.trim(),
      sumber_url: sumberUrl.trim() || null,
      metodologi: metodologi.trim() || null,
      tanggal_pembaruan: tanggalPembaruan || null,
      cakupan,
      frekuensi_update: frekuensi.trim() || null,
      negara_kode: negaraKode.trim().toUpperCase() || null,
    };
    if (!edit) payload.slug = slug.trim() || undefined;
    try {
      const res = await fetch(
        edit ? `/api/admin/data/${indikator?.id}` : "/api/admin/data",
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
        setPesan(data.error ?? `Gagal menyimpan indikator (${res.status}).`);
        return;
      }
      setStatus("sukses");
      setPesan(
        edit
          ? "Indikator berhasil diubah."
          : "Indikator berhasil ditambah. Tambahkan titik datanya lewat formulir titik data di daftar.",
      );
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
        Nama indikator
        <input
          type="text"
          required
          maxLength={200}
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="Contoh: Populasi Indonesia"
        />
      </label>
      {!edit && (
        <label>
          Slug (opsional — kosongkan bila dibuat otomatis)
          <input
            type="text"
            maxLength={80}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="populasi-indonesia"
          />
        </label>
      )}
      <label>
        Kategori
        <select
          value={kategori}
          onChange={(e) => setKategori(e.target.value)}
        >
          {KATEGORI.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <label>
        Satuan
        <input
          type="text"
          maxLength={40}
          value={satuan}
          onChange={(e) => setSatuan(e.target.value)}
          placeholder="Contoh: juta jiwa"
        />
      </label>
      <label>
        Nama sumber (wajib)
        <input
          type="text"
          required
          maxLength={120}
          value={sumberNama}
          onChange={(e) => setSumberNama(e.target.value)}
          placeholder="Contoh: Badan Pusat Statistik"
        />
      </label>
      <label>
        URL sumber
        <input
          type="url"
          value={sumberUrl}
          onChange={(e) => setSumberUrl(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <label>
        Metodologi
        <textarea
          rows={3}
          value={metodologi}
          onChange={(e) => setMetodologi(e.target.value)}
          placeholder="Cara sumber menghitung angka ini."
        />
      </label>
      <label>
        Tanggal pembaruan sumber
        <input
          type="date"
          value={tanggalPembaruan}
          onChange={(e) => setTanggalPembaruan(e.target.value)}
        />
      </label>
      <label>
        Cakupan
        <select
          value={cakupan}
          onChange={(e) => setCakupan(e.target.value)}
        >
          <option value="indonesia">Indonesia</option>
          <option value="dunia">Dunia</option>
        </select>
      </label>
      <label>
        Frekuensi pembaruan
        <input
          type="text"
          maxLength={80}
          value={frekuensi}
          onChange={(e) => setFrekuensi(e.target.value)}
          placeholder="Contoh: tahunan, bulanan, triwulanan"
        />
      </label>
      <label>
        Kode negara (ISO-2, opsional)
        <input
          type="text"
          maxLength={2}
          value={negaraKode}
          onChange={(e) => setNegaraKode(e.target.value)}
          placeholder="Contoh: ID"
        />
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
            : "Tambah indikator"}
      </button>
    </form>
  );
}
