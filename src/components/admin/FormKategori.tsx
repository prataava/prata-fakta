"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PfCategoryRow } from "@/lib/data";

// Formulir tambah / ubah kategori. Slug hanya bisa diisi saat buat —
// sesudah itu slug dipakai artikel sebagai FK, jadi tidak diubah.
export default function FormKategori({
  kategori,
}: {
  kategori?: PfCategoryRow | null;
}) {
  const edit = Boolean(kategori);
  const [slug, setSlug] = useState(kategori?.slug ?? "");
  const [nama, setNama] = useState(kategori?.nama ?? "");
  const [deskripsi, setDeskripsi] = useState(kategori?.deskripsi ?? "");
  const [urutan, setUrutan] = useState(String(kategori?.urutan ?? 0));
  const [aktif, setAktif] = useState(kategori?.aktif ?? true);
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
      deskripsi: deskripsi.trim() || undefined,
      urutan: Number(urutan),
      aktif,
      ...(edit ? {} : { slug: slug.trim() }),
    };
    try {
      const res = await fetch(
        edit
          ? `/api/admin/sistem/kategori/${kategori?.id}`
          : "/api/admin/sistem/kategori",
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
        setPesan(data.error ?? `Gagal menyimpan kategori (${res.status}).`);
        return;
      }
      setStatus("sukses");
      setPesan(edit ? "Kategori berhasil diubah." : "Kategori berhasil ditambah.");
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
      {!edit && (
        <label>
          Slug (unik, tanpa spasi)
          <input
            type="text"
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="contoh: teknologi"
          />
        </label>
      )}
      <label>
        Nama kategori
        <input
          type="text"
          required
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="Nama tampilan kategori"
        />
      </label>
      <label>
        Deskripsi (opsional)
        <textarea
          rows={2}
          value={deskripsi}
          onChange={(e) => setDeskripsi(e.target.value)}
          placeholder="Deskripsi singkat kategori"
        />
      </label>
      <label>
        Urutan tampil
        <input
          type="number"
          step={1}
          required
          value={urutan}
          onChange={(e) => setUrutan(e.target.value)}
        />
      </label>
      <label
        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
      >
        <input
          type="checkbox"
          checked={aktif}
          onChange={(e) => setAktif(e.target.checked)}
        />
        Kategori aktif
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
            : "Tambah kategori"}
      </button>
    </form>
  );
}
