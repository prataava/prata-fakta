"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Form satu feature flag (Gelombang 2, Area 14): boolean -> tombol
// nyala/mati; teks -> input + tombol simpan. PATCH ke
// /api/admin/kendali/flags (super_admin saja). Setelah berhasil,
// halaman di-refresh agar nilai terbaru tampil.
export default function FormFlag({
  kunci,
  label,
  deskripsi,
  jenis,
  nilai,
  disetel,
}: {
  kunci: string;
  label: string;
  deskripsi: string;
  jenis: "boolean" | "teks";
  nilai: boolean | string;
  disetel: boolean;
}) {
  const router = useRouter();
  const [teks, setTeks] = useState(
    typeof nilai === "string" ? nilai : "",
  );
  const [loading, setLoading] = useState(false);
  const [pesan, setPesan] = useState("");
  const [sukses, setSukses] = useState(false);

  async function simpan(nilaiBaru: boolean | string) {
    setLoading(true);
    setPesan("");
    setSukses(false);
    try {
      const res = await fetch("/api/admin/kendali/flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kunci, nilai: nilaiBaru }),
      });
      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // Respons bukan JSON: pakai status HTTP saja.
      }
      if (!res.ok || data.ok === false) {
        setPesan(data.error ?? `Gagal (${res.status}). Coba lagi.`);
        return;
      }
      setSukses(true);
      setPesan("Flag tersimpan.");
      router.refresh();
    } catch {
      setPesan("Tidak dapat terhubung ke server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="kartu" style={{ marginBottom: 16 }}>
      <span className="kartu-kategori">
        {label} · {disetel ? "sudah disetel" : "nilai bawaan"}
      </span>
      <span className="kartu-teks">{deskripsi}</span>
      {jenis === "boolean" ? (
        <p>
          <button
            type="button"
            className={
              nilai === true ? "tombol tombol-primer" : "tombol"
            }
            onClick={() => simpan(nilai !== true)}
            disabled={loading}
          >
            {loading
              ? "Menyimpan…"
              : nilai === true
                ? "Aktif — klik untuk menonaktifkan"
                : "Nonaktif — klik untuk mengaktifkan"}
          </button>
        </p>
      ) : (
        <p>
          <label>
            <span className="kartu-teks">{label}</span>
            <input
              type="text"
              value={teks}
              maxLength={2000}
              onChange={(e) => setTeks(e.target.value)}
              placeholder="Tulis pengumuman di sini"
              style={{ width: "100%", marginTop: 8 }}
            />
          </label>{" "}
          <button
            type="button"
            className="tombol tombol-primer"
            onClick={() => simpan(teks)}
            disabled={loading}
          >
            {loading ? "Menyimpan…" : "Simpan pengumuman"}
          </button>
        </p>
      )}
      {pesan && (
        <span
          className={sukses ? "pesan-sukses" : "pesan-error"}
          role="status"
        >
          {pesan}
        </span>
      )}
    </article>
  );
}
