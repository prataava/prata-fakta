"use client";

import { useState } from "react";

// Dialog laporan kesalahan artikel (POST /api/laporan).
// Boleh anonim: nama & email opsional.
const JENIS_LAPORAN = [
  { nilai: "fakta_salah", label: "Fakta salah" },
  { nilai: "sumber", label: "Masalah sumber" },
  { nilai: "typo", label: "Kesalahan penulisan (typo)" },
  { nilai: "lainnya", label: "Lainnya" },
] as const;

export default function FormLaporan({
  artikelId,
  judulArtikel,
  onTutup,
}: {
  artikelId: string;
  judulArtikel: string;
  onTutup: () => void;
}) {
  const [jenis, setJenis] = useState<string>("fakta_salah");
  const [pesan, setPesan] = useState("");
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sukses" | "error">(
    "idle",
  );
  const [pesanError, setPesanError] = useState("");

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    if (!pesan.trim()) {
      setStatus("error");
      setPesanError("Pesan laporan wajib diisi.");
      return;
    }
    setStatus("loading");
    setPesanError("");
    try {
      const res = await fetch("/api/laporan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artikel_id: artikelId,
          jenis,
          pesan: pesan.trim(),
          nama: nama.trim() || undefined,
          email: email.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setPesanError(data.error ?? "Laporan gagal dikirim. Coba lagi.");
        return;
      }
      setStatus("sukses");
    } catch {
      setStatus("error");
      setPesanError("Tidak dapat terhubung ke server. Coba lagi.");
    }
  }

  return (
    <div
      className="dialog-laporan-latar"
      role="presentation"
      onClick={onTutup}
    >
      <div
        className="dialog-laporan"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-laporan-judul"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-laporan-kepala">
          <h3 id="dialog-laporan-judul">Laporkan Kesalahan</h3>
          <button
            type="button"
            className="tombol tombol-ikon"
            onClick={onTutup}
            aria-label="Tutup dialog"
          >
            ✕
          </button>
        </div>

        {status === "sukses" ? (
          <>
            <p className="pesan-sukses">
              Terima kasih — laporan Anda sudah diterima redaksi dan akan
              ditinjau. Koreksi yang disetujui diterbitkan sebagai pembaruan
              artikel.
            </p>
            <button type="button" className="tombol tombol-primer" onClick={onTutup}>
              Tutup
            </button>
          </>
        ) : (
          <form className="formulir" onSubmit={kirim} style={{ maxWidth: "100%" }}>
            <p style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
              Artikel: <strong>{judulArtikel}</strong>
            </p>
            {status === "error" && pesanError && (
              <p className="pesan-error" role="alert">
                {pesanError}
              </p>
            )}
            <label>
              Jenis kesalahan
              <select
                value={jenis}
                onChange={(e) => setJenis(e.target.value)}
              >
                {JENIS_LAPORAN.map((j) => (
                  <option key={j.nilai} value={j.nilai}>
                    {j.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pesan laporan *
              <textarea
                value={pesan}
                onChange={(e) => setPesan(e.target.value)}
                rows={5}
                placeholder="Jelaskan kesalahan yang Anda temukan dan, bila ada, fakta atau sumber yang benar…"
                required
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
              Email (opsional)
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
              <button type="button" className="tombol" onClick={onTutup}>
                Batal
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
