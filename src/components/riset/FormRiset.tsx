"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PfRiset } from "@/lib/riset";

// Formulir tambah / ubah laporan riset (admin).
// Status awal laporan baru SELALU 'draft' (ditegakkan route API —
// laporan TIDAK auto-terbit; penerbitan dilakukan manual staf
// sesudah ditinjau, lewat tombol "Terbitkan" di daftar).
// Slug: bila dikosongkan, dibuat otomatis dari judul. Bila diisi
// dengan slug indikator yang sama, laporan menautkan dataset CSV
// indikator itu (lihat /api/riset/[slug]/dataset).
export default function FormRiset({ riset }: { riset?: PfRiset | null }) {
  const edit = Boolean(riset);
  const [judul, setJudul] = useState(riset?.judul ?? "");
  const [slug, setSlug] = useState(riset?.slug ?? "");
  const [ringkasan, setRingkasan] = useState(riset?.ringkasan ?? "");
  const [isi, setIsi] = useState(riset?.isi ?? "");
  const [metodologi, setMetodologi] = useState(riset?.metodologi ?? "");
  const [penerbit, setPenerbit] = useState(riset?.penerbit ?? "");
  const [tanggal, setTanggal] = useState(riset?.tanggal ?? "");
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
      tipe: "riset",
      judul: judul.trim(),
      slug: slug.trim() || undefined,
      ringkasan: ringkasan.trim() || null,
      isi: isi.trim() || null,
      metodologi: metodologi.trim() || null,
      penerbit: penerbit.trim() || null,
      tanggal: tanggal || null,
    };
    try {
      const res = await fetch(
        edit ? `/api/admin/riset/${riset?.id}?tipe=riset` : "/api/admin/riset",
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
        setPesan(data.error ?? `Gagal menyimpan laporan (${res.status}).`);
        return;
      }
      setStatus("sukses");
      setPesan(
        edit
          ? "Laporan berhasil diubah."
          : "Laporan berhasil ditambah sebagai DRAF (tidak langsung terbit).",
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
        Judul laporan
        <input
          type="text"
          required
          maxLength={200}
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          placeholder="Contoh: Kemiskinan di Indonesia 2024"
        />
      </label>
      <label>
        Slug (opsional — kosongkan bila dibuat otomatis)
        <input
          type="text"
          maxLength={80}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="kemiskinan-indonesia-2024"
        />
      </label>
      <p style={{ color: "var(--muted)", fontSize: "0.92rem", margin: 0 }}>
        Isi slug dengan slug indikator yang sama (mis. slug indikator di
        Pusat Data) agar laporan ini menautkan dataset CSV indikator itu.
      </p>
      <label>
        Ringkasan
        <textarea
          rows={3}
          maxLength={1000}
          value={ringkasan}
          onChange={(e) => setRingkasan(e.target.value)}
          placeholder="Ringkasan singkat temuan laporan."
        />
      </label>
      <label>
        Isi laporan
        <textarea
          rows={10}
          value={isi}
          onChange={(e) => setIsi(e.target.value)}
          placeholder="Isi lengkap laporan. Paragraf dipisah baris kosong."
        />
      </label>
      <label>
        Metodologi
        <textarea
          rows={3}
          value={metodologi}
          onChange={(e) => setMetodologi(e.target.value)}
          placeholder="Sumber data, cara pengumpulan, dan cara analisis."
        />
      </label>
      <label>
        Penerbit
        <input
          type="text"
          maxLength={120}
          value={penerbit}
          onChange={(e) => setPenerbit(e.target.value)}
          placeholder="Contoh: Redaksi PRATA FAKTA"
        />
      </label>
      <label>
        Tanggal laporan
        <input
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
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
            : "Tambah laporan (sebagai draf)"}
      </button>
    </form>
  );
}
