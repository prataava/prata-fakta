"use client";

import { useState } from "react";
import Link from "next/link";

// Tombol terbitkan sertifikat Academy (B2). Hanya tampil bila
// pengguna LULUS menurut cek server (lihat getStatusKelulusan);
// bila sertifikat sudah ada, tampilkan tautan verifikasinya.
// Sertifikat berlabel INTERNAL — bukan resmi/terakreditasi.
export default function TombolSertifikat({
  courseId,
  kodeAda,
  lulus,
  alasan,
}: {
  courseId: string;
  kodeAda: string | null;
  lulus: boolean;
  alasan: string[];
}) {
  const [menerbitkan, setMenerbitkan] = useState(false);
  const [kode, setKode] = useState<string | null>(kodeAda);
  const [pesan, setPesan] = useState("");

  async function terbitkan() {
    setMenerbitkan(true);
    setPesan("");
    try {
      const res = await fetch("/api/akademi/sertifikat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course_id: courseId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        sertifikat?: { kode_verifikasi?: string };
      };
      if (!res.ok || !data.ok || !data.sertifikat?.kode_verifikasi) {
        setPesan(data.error ?? "Sertifikat gagal diterbitkan. Coba lagi.");
        return;
      }
      setKode(data.sertifikat.kode_verifikasi);
    } catch {
      setPesan("Sertifikat gagal diterbitkan (jaringan). Coba lagi.");
    } finally {
      setMenerbitkan(false);
    }
  }

  if (kode) {
    return (
      <div>
        <p role="status">
          Sertifikat Anda sudah terbit. Kode verifikasi:{" "}
          <code>{kode}</code>
        </p>
        <p>
          <Link href={`/akademi/sertifikat/${kode}`}>
            Lihat &amp; verifikasi sertifikat
          </Link>
        </p>
        <p style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
          Sertifikat PRATA Academy bersifat internal — bukan sertifikat
          resmi pemerintah atau lembaga terakreditasi.
        </p>
      </div>
    );
  }

  if (!lulus) {
    return (
      <div>
        <p>
          Anda belum memenuhi kriteria kelulusan kursus ini. Selesaikan
          pelajaran dan kuis di bawah untuk membuka sertifikat.
        </p>
        {alasan.length > 0 && (
          <ul>
            {alasan.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div>
      <p>
        Selamat — Anda memenuhi kriteria kelulusan kursus ini. Terbitkan
        sertifikat penyelesaian (internal) Anda.
      </p>
      <button
        className="tombol tombol-primer"
        type="button"
        disabled={menerbitkan}
        onClick={() => void terbitkan()}
      >
        {menerbitkan ? "Menerbitkan…" : "Terbitkan sertifikat saya"}
      </button>
      {pesan && (
        <p role="alert" style={{ marginTop: 12 }}>
          {pesan}
        </p>
      )}
    </div>
  );
}
