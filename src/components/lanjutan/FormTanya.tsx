"use client";

import { useState, type FormEvent } from "react";

// Formulir tanya jawab (client component). Mengirim pertanyaan ke
// POST /api/tanya dan menampilkan jawaban ekstraktif beserta
// referensinya — atau pesan jujur bila belum ada data yang menjawab.
export default function FormTanya() {
  const [pertanyaan, setPertanyaan] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sukses" | "error">("idle");
  const [pesan, setPesan] = useState("");
  const [jawaban, setJawaban] = useState<string | null>(null);
  const [statusJawaban, setStatusJawaban] = useState<string | null>(null);
  const [referensi, setReferensi] = useState<{ judul: string; url: string }[]>([]);

  async function kirim(e: FormEvent) {
    e.preventDefault();
    if (!pertanyaan.trim()) return;
    setStatus("loading");
    setPesan("");
    setJawaban(null);
    setReferensi([]);
    setStatusJawaban(null);
    try {
      const res = await fetch("/api/tanya", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pertanyaan: pertanyaan.trim() }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        jawaban?: string;
        status?: string;
        referensi?: { judul: string; url: string }[];
      };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setPesan(data.error ?? "Gagal mengirim pertanyaan. Coba lagi.");
        return;
      }
      setStatus("sukses");
      setJawaban(data.jawaban ?? null);
      setStatusJawaban(data.status ?? null);
      setReferensi(data.referensi ?? []);
    } catch {
      setStatus("error");
      setPesan("Gagal mengirim pertanyaan. Periksa koneksi lalu coba lagi.");
    }
  }

  return (
    <div>
      <form className="formulir" onSubmit={kirim}>
        <label htmlFor="tanya-pertanyaan">
          Pertanyaan Anda
          <textarea
            id="tanya-pertanyaan"
            value={pertanyaan}
            onChange={(e) => setPertanyaan(e.target.value)}
            placeholder="Contoh: Berapa jumlah penduduk Indonesia menurut data resmi terbaru?"
            rows={3}
            maxLength={500}
            required
          />
        </label>
        <p style={{ color: "var(--muted)", fontSize: "0.88rem" }}>
          Jawaban hanya diambil dari artikel dan pengetahuan yang sudah ada di
          PRATA FAKTA, beserta referensinya. Bila belum ada data yang bisa
          menjawab, pertanyaan Anda masuk antrean editor.
        </p>
        <button className="tombol tombol-primer" type="submit" disabled={status === "loading"}>
          {status === "loading" ? "Mencari…" : "Tanyakan"}
        </button>
      </form>

      {status === "error" && (
        <p className="pesan-error" role="alert" style={{ marginTop: 12 }}>
          {pesan}
        </p>
      )}

      {status === "sukses" && jawaban && (
        <div className="kartu" role="status" style={{ marginTop: 16 }}>
          <span className="kartu-kategori">
            {statusJawaban === "terjawab"
              ? "Terjawab dari data PRATA FAKTA"
              : "Masuk antrean"}
          </span>
          <span className="kartu-teks">{jawaban}</span>
          {referensi.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong>Referensi:</strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                {referensi.map((r) => (
                  <li key={r.url}>
                    <a href={r.url}>{r.judul}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
