"use client";

import { useState, type FormEvent } from "react";
import { KATEGORI_UTAMA } from "@/lib/categories";
import type { PfTopikDiikuti } from "@/lib/lanjutan";

// Kelola topik yang diikuti (client component): tambah via
// POST /api/topik, hapus via DELETE /api/topik.
const LABEL_TIPE: Record<string, string> = {
  kategori: "Kategori",
  negara: "Negara",
  isu: "Isu",
};

function namaTarget(t: PfTopikDiikuti): string {
  if (t.tipe === "kategori") {
    return KATEGORI_UTAMA.find((k) => k.slug === t.target)?.nama ?? t.target;
  }
  return t.target;
}

export default function TopikSaya({ awal }: { awal: PfTopikDiikuti[] }) {
  const [topik, setTopik] = useState<PfTopikDiikuti[]>(awal);
  const [tipe, setTipe] = useState<"kategori" | "negara" | "isu">("kategori");
  const [kategori, setKategori] = useState(KATEGORI_UTAMA[0].slug);
  const [teks, setTeks] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState("");

  async function tambah(e: FormEvent) {
    e.preventDefault();
    const target = tipe === "kategori" ? kategori : teks.trim();
    if (!target) return;
    setSibuk(true);
    setPesan("");
    try {
      const res = await fetch("/api/topik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipe, target }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        topik?: PfTopikDiikuti;
        sudahDiikuti?: boolean;
      };
      if (!res.ok || !data.ok) {
        setPesan(data.error ?? "Gagal mengikuti topik. Coba lagi.");
        return;
      }
      if (data.sudahDiikuti) {
        setPesan("Topik ini sudah Anda ikuti.");
        return;
      }
      if (data.topik) setTopik((lama) => [data.topik as PfTopikDiikuti, ...lama]);
      setTeks("");
    } catch {
      setPesan("Gagal mengikuti topik. Periksa koneksi lalu coba lagi.");
    } finally {
      setSibuk(false);
    }
  }

  async function hapus(id: string) {
    setPesan("");
    try {
      const res = await fetch("/api/topik", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setPesan(data.error ?? "Gagal berhenti mengikuti topik. Coba lagi.");
        return;
      }
      setTopik((lama) => lama.filter((t) => t.id !== id));
    } catch {
      setPesan("Gagal berhenti mengikuti topik. Periksa koneksi lalu coba lagi.");
    }
  }

  return (
    <div>
      <form className="formulir" onSubmit={tambah}>
        <label>
          Jenis topik
          <select
            value={tipe}
            onChange={(e) =>
              setTipe(e.target.value as "kategori" | "negara" | "isu")
            }
          >
            <option value="kategori">Kategori berita</option>
            <option value="negara">Negara</option>
            <option value="isu">Isu</option>
          </select>
        </label>
        {tipe === "kategori" ? (
          <label>
            Kategori
            <select
              value={kategori}
              onChange={(e) => setKategori(e.target.value)}
            >
              {KATEGORI_UTAMA.map((k) => (
                <option key={k.slug} value={k.slug}>
                  {k.nama}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            {tipe === "negara" ? "Nama negara" : "Nama isu"}
            <input
              type="text"
              value={teks}
              onChange={(e) => setTeks(e.target.value)}
              placeholder={
                tipe === "negara" ? "Contoh: Indonesia" : "Contoh: Perubahan iklim"
              }
              maxLength={120}
              required
            />
          </label>
        )}
        <button className="tombol tombol-primer" type="submit" disabled={sibuk}>
          {sibuk ? "Menyimpan…" : "Ikuti topik"}
        </button>
      </form>
      {pesan && (
        <p className="pesan-error" role="alert" style={{ marginTop: 12 }}>
          {pesan}
        </p>
      )}
      {topik.length === 0 ? (
        <p style={{ color: "var(--muted)", marginTop: 12 }}>
          Anda belum mengikuti topik apa pun.
        </p>
      ) : (
        <ul style={{ marginTop: 12, paddingLeft: 20 }}>
          {topik.map((t) => (
            <li key={t.id} style={{ marginBottom: 8 }}>
              {LABEL_TIPE[t.tipe] ?? t.tipe}: <strong>{namaTarget(t)}</strong>{" "}
              <button
                className="tombol tombol-hantu"
                type="button"
                onClick={() => hapus(t.id)}
              >
                Berhenti mengikuti
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
