"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PfDokumen } from "@/lib/riset";

// Formulir tambah / ubah dokumen arsip (admin). Dokumen HANYA
// metadata + tautan ke sumbernya — isi berhak cipta TIDAK disalin.
// "Slug laporan terkait" (opsional) menulis metadata
// { "riset_slug": ... } agar dokumen muncul di halaman detail
// laporan itu.
const JENIS = ["laporan", "dokumen", "publikasi", "penelitian", "statistik"] as const;

const LABEL_JENIS: Record<string, string> = {
  laporan: "Laporan",
  dokumen: "Dokumen",
  publikasi: "Publikasi",
  penelitian: "Penelitian",
  statistik: "Statistik",
};

export default function FormDokumen({
  dokumen,
}: {
  dokumen?: PfDokumen | null;
}) {
  const edit = Boolean(dokumen);
  const [jenis, setJenis] = useState<string>(dokumen?.jenis ?? "laporan");
  const [judul, setJudul] = useState(dokumen?.judul ?? "");
  const [penerbit, setPenerbit] = useState(dokumen?.penerbit ?? "");
  const [tanggal, setTanggal] = useState(dokumen?.tanggal ?? "");
  const [urlSumber, setUrlSumber] = useState(dokumen?.url_sumber ?? "");
  const [kategori, setKategori] = useState(dokumen?.kategori ?? "");
  const [risetSlug, setRisetSlug] = useState(
    typeof dokumen?.metadata["riset_slug"] === "string"
      ? (dokumen?.metadata["riset_slug"] as string)
      : "",
  );
  const [statusDokumen, setStatusDokumen] = useState(
    dokumen?.status ?? "terbit",
  );
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "sukses">(
    "idle",
  );
  const [pesan, setPesan] = useState("");
  const router = useRouter();

  async function kirim(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setPesan("");
    const metadata: Record<string, unknown> = {
      ...(dokumen?.metadata ?? {}),
    };
    if (risetSlug.trim()) metadata["riset_slug"] = risetSlug.trim();
    else delete metadata["riset_slug"];
    const payload: Record<string, unknown> = {
      tipe: "dokumen",
      jenis,
      judul: judul.trim(),
      penerbit: penerbit.trim() || null,
      tanggal: tanggal || null,
      url_sumber: urlSumber.trim() || null,
      kategori: kategori.trim() || null,
      metadata,
      status: statusDokumen,
    };
    try {
      const res = await fetch(
        edit
          ? `/api/admin/riset/${dokumen?.id}?tipe=dokumen`
          : "/api/admin/riset",
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
        setPesan(data.error ?? `Gagal menyimpan dokumen (${res.status}).`);
        return;
      }
      setStatus("sukses");
      setPesan(
        edit ? "Dokumen berhasil diubah." : "Dokumen berhasil ditambah.",
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
        Jenis
        <select value={jenis} onChange={(e) => setJenis(e.target.value)}>
          {JENIS.map((j) => (
            <option key={j} value={j}>
              {LABEL_JENIS[j] ?? j}
            </option>
          ))}
        </select>
      </label>
      <label>
        Judul dokumen
        <input
          type="text"
          required
          maxLength={200}
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          placeholder="Contoh: Laporan Kemiskinan BPS 2024"
        />
      </label>
      <label>
        Penerbit
        <input
          type="text"
          maxLength={120}
          value={penerbit}
          onChange={(e) => setPenerbit(e.target.value)}
          placeholder="Contoh: Badan Pusat Statistik"
        />
      </label>
      <label>
        Tanggal dokumen
        <input
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
        />
      </label>
      <label>
        URL sumber
        <input
          type="url"
          value={urlSumber}
          onChange={(e) => setUrlSumber(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <label>
        Kategori
        <input
          type="text"
          maxLength={80}
          value={kategori}
          onChange={(e) => setKategori(e.target.value)}
          placeholder="Contoh: ekonomi"
        />
      </label>
      <label>
        Slug laporan terkait (opsional)
        <input
          type="text"
          maxLength={80}
          value={risetSlug}
          onChange={(e) => setRisetSlug(e.target.value)}
          placeholder="Slug laporan riset yang memakai dokumen ini"
        />
      </label>
      <label>
        Status
        <select
          value={statusDokumen}
          onChange={(e) => setStatusDokumen(e.target.value)}
        >
          <option value="terbit">Terbit</option>
          <option value="draft">Draf</option>
        </select>
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
            : "Tambah dokumen"}
      </button>
    </form>
  );
}
