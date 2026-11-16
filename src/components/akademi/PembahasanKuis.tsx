"use client";

import { useState } from "react";
import Link from "next/link";
import type { PfKuisSoalPublik } from "@/lib/lanjutan";

// Kuis satu pelajaran: jawab satu per satu; sesudah menjawab satu
// soal tampil penjelasan + sumber (pembahasan). Kunci jawaban
// TIDAK PERNAH dikirim ke klien (pola /api/kuis/jawab, T1): server
// hanya mengembalikan benar/salah + penjelasan + sumber, tanpa
// kunci. Skor akhir dilaporkan ke induk lewat onSelesai.
type HasilJawaban = {
  benar: boolean;
  penjelasan: string | null;
  sumber_url: string | null;
  sumber_nama: string | null;
};

export default function PembahasanKuis({
  lessonId,
  soal,
  masuk,
  onSelesai,
}: {
  lessonId: string;
  soal: PfKuisSoalPublik[];
  masuk: boolean;
  onSelesai: (benar: number, total: number) => void;
}) {
  const [indeks, setIndeks] = useState(0);
  const [pilihan, setPilihan] = useState<number | null>(null);
  const [hasil, setHasil] = useState<HasilJawaban | null>(null);
  const [memeriksa, setMemeriksa] = useState(false);
  const [galatJawab, setGalatJawab] = useState("");
  const [benar, setBenar] = useState(0);
  const [selesai, setSelesai] = useState(false);

  const aktif = soal[indeks];
  const total = soal.length;

  if (!aktif && !selesai) return null;

  async function jawab(i: number) {
    if (pilihan !== null || memeriksa) return;
    setPilihan(i);
    setGalatJawab("");
    setMemeriksa(true);
    try {
      const res = await fetch("/api/akademi/kuis/jawab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lesson_id: lessonId,
          soal_id: aktif.id,
          jawaban: i,
        }),
      });
      const data = (await res.json()) as HasilJawaban & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setPilihan(null);
        setGalatJawab(data.error ?? "Jawaban gagal diperiksa. Coba lagi.");
        return;
      }
      setHasil({
        benar: data.benar,
        penjelasan: data.penjelasan ?? null,
        sumber_url: data.sumber_url ?? null,
        sumber_nama: data.sumber_nama ?? null,
      });
      if (data.benar) setBenar((b) => b + 1);
    } catch {
      setPilihan(null);
      setGalatJawab("Jawaban gagal diperiksa (jaringan). Coba lagi.");
    } finally {
      setMemeriksa(false);
    }
  }

  function lanjut() {
    if (indeks + 1 >= total) {
      setSelesai(true);
      onSelesai(benar, total);
    } else {
      setIndeks((x) => x + 1);
      setPilihan(null);
      setHasil(null);
      setGalatJawab("");
    }
  }

  function ulang() {
    setIndeks(0);
    setPilihan(null);
    setHasil(null);
    setGalatJawab("");
    setBenar(0);
    setSelesai(false);
  }

  if (selesai) {
    return (
      <div className="kosong" role="status">
        <h3>
          Skor kuis pelajaran ini: {benar} dari {total}
        </h3>
        <p>
          {benar === total
            ? "Sempurna! Semua jawaban benar."
            : "Pembahasan setiap soal sudah tampil sesudah Anda menjawab."}
        </p>
        {!masuk && (
          <p>
            Skor hanya tampil di sesi ini.{" "}
            <Link href="/masuk">Masuk</Link> untuk menyimpan progres
            belajar Anda.
          </p>
        )}
        <button className="tombol" type="button" onClick={ulang}>
          Ulangi kuis
        </button>
      </div>
    );
  }

  return (
    <div>
      <p>
        <strong>
          Soal {indeks + 1} dari {total}
        </strong>
        {` · Benar sejauh ini: ${benar}`}
      </p>
      <p>{aktif.pertanyaan}</p>
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {aktif.opsi.map((opsi, i) => {
          const dijawab = hasil !== null;
          const iniPilihan = i === pilihan;
          let kelas = "tombol";
          if (dijawab && iniPilihan && hasil.benar) kelas += " tombol-primer";
          else if (dijawab && iniPilihan && !hasil.benar)
            kelas += " tombol-bahaya";
          return (
            <button
              key={i}
              className={kelas}
              type="button"
              onClick={() => void jawab(i)}
              disabled={dijawab || memeriksa}
              aria-pressed={iniPilihan}
              style={{ textAlign: "left", justifyContent: "flex-start" }}
            >
              {String.fromCharCode(65 + i)}. {opsi}
              {dijawab && iniPilihan && hasil.benar ? " ✓" : ""}
              {dijawab && iniPilihan && !hasil.benar ? " ✗" : ""}
            </button>
          );
        })}
      </div>
      {memeriksa && pilihan !== null && (
        <p role="status" style={{ marginTop: 12 }}>
          Memeriksa jawaban…
        </p>
      )}
      {galatJawab && (
        <p role="alert" style={{ marginTop: 12 }}>
          {galatJawab}
        </p>
      )}
      {hasil !== null && (
        <div style={{ marginTop: 12 }}>
          <p role="status">
            {hasil.benar ? "Benar!" : "Kurang tepat."}
          </p>
          {hasil.penjelasan && <p>{hasil.penjelasan}</p>}
          {(hasil.sumber_url || hasil.sumber_nama) && (
            <p>
              Sumber:{" "}
              {hasil.sumber_url ? (
                <a
                  href={hasil.sumber_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {hasil.sumber_nama ?? hasil.sumber_url}
                </a>
              ) : (
                (hasil.sumber_nama ?? "—")
              )}
            </p>
          )}
          <button
            className="tombol tombol-primer"
            type="button"
            onClick={lanjut}
          >
            {indeks + 1 >= total ? "Lihat skor" : "Soal berikutnya"}
          </button>
        </div>
      )}
    </div>
  );
}
