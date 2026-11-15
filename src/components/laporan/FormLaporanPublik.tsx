"use client";

import { useState } from "react";
import Link from "next/link";
import {
  JENIS_LAPORAN_PUBLIK,
  LABEL_JENIS_LAPORAN_PUBLIK,
} from "@/lib/laporan";

// Formulir laporan masyarakat (POST /api/laporan-publik).
// Boleh anonim: nama & email opsional. Sesudah terkirim, pelapor
// menerima nomor lacak untuk memeriksa status di /laporkan/lacak.
// SEMUA laporan wajib dimoderasi redaksi sebelum diproses.
export default function FormLaporanPublik() {
  const [jenis, setJenis] = useState<string>(JENIS_LAPORAN_PUBLIK[0]);
  const [tautan, setTautan] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sukses" | "error">(
    "idle",
  );
  const [pesanError, setPesanError] = useState("");
  const [nomorLacak, setNomorLacak] = useState("");

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (deskripsi.trim().length < 10) {
      setStatus("error");
      setPesanError("Deskripsi laporan wajib diisi (minimal 10 karakter).");
      return;
    }
    setStatus("loading");
    setPesanError("");
    try {
      const res = await fetch("/api/laporan-publik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jenis,
          tautan_artikel: tautan.trim() || undefined,
          deskripsi: deskripsi.trim(),
          nama: nama.trim() || undefined,
          email: email.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        nomor_lacak?: string;
      };
      if (!res.ok || !data.ok || !data.nomor_lacak) {
        setStatus("error");
        setPesanError(data.error ?? "Laporan gagal dikirim. Coba lagi.");
        return;
      }
      setNomorLacak(data.nomor_lacak);
      setStatus("sukses");
    } catch {
      setStatus("error");
      setPesanError("Tidak dapat terhubung ke server. Coba lagi.");
    }
  }

  if (status === "sukses") {
    return (
      <div className="kartu-form">
        <p className="pesan-sukses" role="status">
          Terima kasih — laporan Anda sudah diterima redaksi dan akan
          ditinjau. Semua laporan wajib dimoderasi sebelum diproses.
        </p>
        <p>
          Nomor lacak laporan Anda:{" "}
          <strong>
            <Link href={`/laporkan/lacak?nomor=${encodeURIComponent(nomorLacak)}`}>
              {nomorLacak}
            </Link>
          </strong>
        </p>
        <p style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
          Simpan nomor ini untuk memeriksa status laporan Anda di halaman{" "}
          <Link href="/laporkan/lacak">Lacak Laporan</Link>.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <Link className="tombol tombol-primer" href="/laporkan/lacak">
            Lacak status laporan
          </Link>
          <Link className="tombol" href="/">
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="formulir" onSubmit={kirim} style={{ maxWidth: 640 }}>
      {status === "error" && pesanError && (
        <p className="pesan-error" role="alert">
          {pesanError}
        </p>
      )}
      <label>
        Jenis laporan *
        <select value={jenis} onChange={(e) => setJenis(e.target.value)}>
          {JENIS_LAPORAN_PUBLIK.map((j) => (
            <option key={j} value={j}>
              {LABEL_JENIS_LAPORAN_PUBLIK[j]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Tautan artikel (opsional)
        <input
          type="url"
          value={tautan}
          onChange={(e) => setTautan(e.target.value)}
          placeholder="https://prata-fakta.vercel.app/artikel/contoh-slug"
          maxLength={500}
        />
      </label>
      <label>
        Deskripsi laporan *
        <textarea
          value={deskripsi}
          onChange={(e) => setDeskripsi(e.target.value)}
          rows={5}
          placeholder="Jelaskan apa yang Anda temukan: kesalahan apa, di mana, dan bila ada, fakta atau sumber yang benar…"
          required
          minLength={10}
          maxLength={2000}
        />
      </label>
      <label>
        Nama (opsional)
        <input
          type="text"
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="Nama Anda — boleh dikosongkan"
          maxLength={120}
        />
      </label>
      <label>
        Email (opsional — untuk kabar tindak lanjut)
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@contoh.id — boleh dikosongkan"
          maxLength={254}
        />
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="submit"
          className="tombol tombol-primer"
          disabled={status === "loading"}
        >
          {status === "loading" ? "Mengirim…" : "Kirim laporan"}
        </button>
        <Link className="tombol" href="/laporkan/lacak">
          Lacak laporan saya
        </Link>
      </div>
    </form>
  );
}
