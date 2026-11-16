"use client";

import { useState } from "react";
import Link from "next/link";
import type { PfKuisSoalPublik } from "@/lib/lanjutan";

// Kuis satu pelajaran: jawab satu per satu; sesudah menjawab satu
// soal tampil penjelasan + sumber (pembahasan). Kunci jawaban
// TIDAK PERNAH dikirim ke klien (pola /api/kuis/jawab, T1): server
// hanya mengembalikan benar/salah + penjelasan + sumber, tanpa
// kunci. Skor akhir dilaporkan ke induk lewat onSelesai —
// onSelesai(benar, totalDinilai): totalDinilai HANYA menghitung
// soal yang dinilai otomatis; soal esai yang menunggu penilaian
// manual tidak masuk hitungan (B2-B, H2–H6).
// Jenis soal (dari soal.jenis):
// - pilihan_ganda: satu pilihan.
// - pilihan_ganda_kompleks: pilih SEMUA jawaban benar (tanpa
//   kredit parsial — jawaban sebagian benar tetap salah).
// - isian_singkat: ketik jawaban singkat.
// - benar_salah: pilih Benar atau Salah.
// - esai: tulis jawaban bebas; disimpan untuk review manual staf,
//   tidak dinilai otomatis (benar: null).
type HasilJawaban = {
  benar: boolean | null;
  status_penilaian: string | null;
  penjelasan: string | null;
  sumber_url: string | null;
  sumber_nama: string | null;
};

function labelJenis(jenis: string): string {
  if (jenis === "pilihan_ganda_kompleks") return "Pilihan ganda kompleks — pilih semua jawaban benar";
  if (jenis === "isian_singkat") return "Isian singkat";
  if (jenis === "benar_salah") return "Benar / salah";
  if (jenis === "esai") return "Esai — dinilai manual oleh staf";
  return "Pilihan ganda";
}

export default function PembahasanKuis({
  lessonId,
  soal,
  masuk,
  onSelesai,
}: {
  lessonId: string;
  soal: PfKuisSoalPublik[];
  masuk: boolean;
  onSelesai: (benar: number, totalDinilai: number) => void;
}) {
  const [indeks, setIndeks] = useState(0);
  const [pilihan, setPilihan] = useState<number | null>(null);
  const [pilihanJamaks, setPilihanJamaks] = useState<number[]>([]);
  const [teks, setTeks] = useState("");
  const [hasil, setHasil] = useState<HasilJawaban | null>(null);
  const [memeriksa, setMemeriksa] = useState(false);
  const [galatJawab, setGalatJawab] = useState("");
  const [benar, setBenar] = useState(0);
  const [dinilai, setDinilai] = useState(0);
  const [selesai, setSelesai] = useState(false);

  const aktif = soal[indeks];
  const total = soal.length;

  if (!aktif && !selesai) return null;

  function resetSoal() {
    setPilihan(null);
    setPilihanJamaks([]);
    setTeks("");
    setHasil(null);
    setGalatJawab("");
  }

  async function jawab(
    jawabanLangsung?: number | number[] | string,
  ) {
    if (hasil !== null || memeriksa || !aktif) return;
    const jenis = aktif.jenis ?? "pilihan_ganda";
    // Pilihan ganda / benar-salah mengoper nilai LANGSUNG (state
    // `pilihan` belum ter-update saat handler klik berjalan).
    let jawaban: number | number[] | string;
    if (jawabanLangsung !== undefined) {
      jawaban = jawabanLangsung;
    } else if (jenis === "pilihan_ganda_kompleks") {
      if (pilihanJamaks.length === 0) {
        setGalatJawab("Pilih minimal satu jawaban.");
        return;
      }
      jawaban = pilihanJamaks;
    } else if (jenis === "isian_singkat" || jenis === "esai") {
      if (teks.trim().length === 0) {
        setGalatJawab("Tulis dulu jawaban Anda.");
        return;
      }
      jawaban = teks.trim();
    } else {
      if (pilihan === null) return;
      jawaban = pilihan;
    }
    setGalatJawab("");
    setMemeriksa(true);
    try {
      const res = await fetch("/api/akademi/kuis/jawab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lesson_id: lessonId,
          soal_id: aktif.id,
          jawaban,
        }),
      });
      const data = (await res.json()) as HasilJawaban & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setGalatJawab(data.error ?? "Jawaban gagal diperiksa. Coba lagi.");
        return;
      }
      setHasil({
        benar: data.benar ?? null,
        status_penilaian: data.status_penilaian ?? null,
        penjelasan: data.penjelasan ?? null,
        sumber_url: data.sumber_url ?? null,
        sumber_nama: data.sumber_nama ?? null,
      });
      if (data.benar === true) setBenar((b) => b + 1);
      if (data.benar !== null) setDinilai((d) => d + 1);
    } catch {
      setGalatJawab("Jawaban gagal diperiksa (jaringan). Coba lagi.");
    } finally {
      setMemeriksa(false);
    }
  }

  function lanjut() {
    if (indeks + 1 >= total) {
      setSelesai(true);
      onSelesai(benar, dinilai);
    } else {
      setIndeks((x) => x + 1);
      resetSoal();
    }
  }

  function ulang() {
    setIndeks(0);
    resetSoal();
    setBenar(0);
    setDinilai(0);
    setSelesai(false);
  }

  if (selesai) {
    return (
      <div className="kosong" role="status">
        <h3>
          Skor kuis pelajaran ini: {benar} dari {dinilai} soal yang dinilai
        </h3>
        <p>
          {dinilai < total
            ? "Sebagian soal adalah esai dan menunggu penilaian manual staf — skor di atas hanya dari soal yang dinilai otomatis."
            : benar === total
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

  const jenis = aktif.jenis ?? "pilihan_ganda";
  const dijawab = hasil !== null;

  return (
    <div>
      <p>
        <strong>
          Soal {indeks + 1} dari {total}
        </strong>
        {` · ${labelJenis(jenis)}`}
        {` · Benar sejauh ini: ${benar}`}
      </p>
      <p>{aktif.pertanyaan}</p>

      {jenis === "pilihan_ganda" && (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {aktif.opsi.map((opsi, i) => {
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
                onClick={() => {
                  if (dijawab || memeriksa) return;
                  setPilihan(i);
                  void jawab(i);
                }}
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
      )}

      {jenis === "benar_salah" && (
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          {[1, 0].map((nilai) => {
            const label = nilai === 1 ? "Benar" : "Salah";
            const iniPilihan = pilihan === nilai;
            let kelas = "tombol";
            if (dijawab && iniPilihan && hasil.benar) kelas += " tombol-primer";
            else if (dijawab && iniPilihan && !hasil.benar)
              kelas += " tombol-bahaya";
            return (
              <button
                key={nilai}
                className={kelas}
                type="button"
                onClick={() => {
                  if (dijawab || memeriksa) return;
                  setPilihan(nilai);
                  void jawab(nilai);
                }}
                disabled={dijawab || memeriksa}
                aria-pressed={iniPilihan}
              >
                {label}
                {dijawab && iniPilihan && hasil.benar ? " ✓" : ""}
                {dijawab && iniPilihan && !hasil.benar ? " ✗" : ""}
              </button>
            );
          })}
        </div>
      )}

      {jenis === "pilihan_ganda_kompleks" && (
        <div>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {aktif.opsi.map((opsi, i) => {
              const dipilih = pilihanJamaks.includes(i);
              return (
                <button
                  key={i}
                  className="tombol"
                  type="button"
                  onClick={() =>
                    setPilihanJamaks((lama) =>
                      lama.includes(i)
                        ? lama.filter((x) => x !== i)
                        : [...lama, i],
                    )
                  }
                  disabled={dijawab || memeriksa}
                  aria-pressed={dipilih}
                  style={{ textAlign: "left", justifyContent: "flex-start" }}
                >
                  {dipilih ? "☑" : "☐"} {String.fromCharCode(65 + i)}. {opsi}
                </button>
              );
            })}
          </div>
          {!dijawab && (
            <button
              className="tombol tombol-primer"
              type="button"
              onClick={() => void jawab()}
              disabled={memeriksa}
              style={{ marginTop: 12 }}
            >
              {memeriksa ? "Memeriksa…" : "Periksa jawaban"}
            </button>
          )}
        </div>
      )}

      {(jenis === "isian_singkat" || jenis === "esai") && (
        <div style={{ marginTop: 12 }}>
          <label htmlFor={`jawaban-${aktif.id}`}>
            {jenis === "esai"
              ? "Tulis jawaban esai Anda (dinilai manual oleh staf, bukan otomatis):"
              : "Ketik jawaban singkat Anda:"}
          </label>
          {jenis === "esai" ? (
            <textarea
              id={`jawaban-${aktif.id}`}
              value={teks}
              onChange={(e) => setTeks(e.target.value)}
              disabled={dijawab || memeriksa}
              rows={5}
              maxLength={5000}
              style={{ width: "100%", marginTop: 8 }}
            />
          ) : (
            <input
              id={`jawaban-${aktif.id}`}
              type="text"
              value={teks}
              onChange={(e) => setTeks(e.target.value)}
              disabled={dijawab || memeriksa}
              maxLength={500}
              style={{ width: "100%", marginTop: 8 }}
            />
          )}
          {!dijawab && (
            <button
              className="tombol tombol-primer"
              type="button"
              onClick={() => void jawab()}
              disabled={memeriksa}
              style={{ marginTop: 12 }}
            >
              {memeriksa
                ? "Memeriksa…"
                : jenis === "esai"
                  ? "Kirim jawaban esai"
                  : "Periksa jawaban"}
            </button>
          )}
        </div>
      )}

      {memeriksa && (
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
            {hasil.benar === null
              ? "Jawaban esai tersimpan — menunggu penilaian manual staf."
              : hasil.benar
                ? "Benar!"
                : "Kurang tepat."}
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
