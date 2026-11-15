"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PfKuisSoal } from "@/lib/lanjutan";

// Kuis harian interaktif (client component). Jawab satu per satu;
// sesudah menjawab satu soal tampil kunci + penjelasan + sumber.
// Skor hanya tampil di sesi ini — Fase 6 tidak menyimpan skor
// persisten (tidak ada tabel skor di migrasi v6), jadi tidak ada
// tombol simpan.
export default function KuisHarian({ soal }: { soal: PfKuisSoal[] }) {
  const [indeks, setIndeks] = useState(0);
  const [pilihan, setPilihan] = useState<number | null>(null);
  const [benar, setBenar] = useState(0);
  const [selesai, setSelesai] = useState(false);

  const aktif = soal[indeks];
  const total = soal.length;

  const skorAkhir = useMemo(() => ({ benar, total }), [benar, total]);

  if (!aktif && !selesai) return null;

  function jawab(i: number) {
    if (pilihan !== null) return;
    setPilihan(i);
    if (i === aktif.kunci) setBenar((b) => b + 1);
  }

  function lanjut() {
    if (indeks + 1 >= total) {
      setSelesai(true);
    } else {
      setIndeks((x) => x + 1);
      setPilihan(null);
    }
  }

  function ulang() {
    setIndeks(0);
    setPilihan(null);
    setBenar(0);
    setSelesai(false);
  }

  if (selesai) {
    return (
      <section className="seksi" aria-labelledby="judul-skor">
        <div className="kosong" role="status">
          <h3 id="judul-skor">Skor Anda: {skorAkhir.benar} dari {skorAkhir.total}</h3>
          <p>
            {skorAkhir.benar === skorAkhir.total
              ? "Sempurna! Semua jawaban benar."
              : skorAkhir.benar >= Math.ceil(skorAkhir.total / 2)
                ? "Bagus! Tinjau penjelasan soal yang terlewat di bawah."
                : "Terus belajar — jawaban dan penjelasannya sudah tampil di setiap soal."}
          </p>
          <p>Skor hanya tampil di sesi ini.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <button className="tombol tombol-primer" type="button" onClick={ulang}>
              Main lagi
            </button>
            <Link className="tombol" href="/pengetahuan">
              Baca Pengetahuan
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="seksi" aria-labelledby="judul-kuis">
      <div className="seksi-kepala">
        <h2 id="judul-kuis">
          Soal {indeks + 1} dari {total}
        </h2>
        <p>Benar sejauh ini: {benar}</p>
      </div>
      <div className="kartu">
        <span className="kartu-judul">{aktif.pertanyaan}</span>
        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {aktif.opsi.map((opsi, i) => {
            const dijawab = pilihan !== null;
            const iniKunci = i === aktif.kunci;
            const iniPilihan = i === pilihan;
            let kelas = "tombol";
            if (dijawab && iniKunci) kelas += " tombol-primer";
            else if (dijawab && iniPilihan) kelas += " tombol-bahaya";
            return (
              <button
                key={i}
                className={kelas}
                type="button"
                onClick={() => jawab(i)}
                disabled={dijawab}
                aria-pressed={iniPilihan}
                style={{ textAlign: "left", justifyContent: "flex-start" }}
              >
                {String.fromCharCode(65 + i)}. {opsi}
                {dijawab && iniKunci ? " ✓" : ""}
                {dijawab && iniPilihan && !iniKunci ? " ✗" : ""}
              </button>
            );
          })}
        </div>
        {pilihan !== null && (
          <div style={{ marginTop: 16 }}>
            <p role="status">
              {pilihan === aktif.kunci
                ? "Benar!"
                : `Kurang tepat. Jawaban benar: ${String.fromCharCode(65 + aktif.kunci)}. ${aktif.opsi[aktif.kunci]}`}
            </p>
            {aktif.penjelasan && <p>{aktif.penjelasan}</p>}
            {(aktif.sumber_url || aktif.sumber_nama) && (
              <p>
                Sumber:{" "}
                {aktif.sumber_url ? (
                  <a href={aktif.sumber_url} target="_blank" rel="noopener noreferrer">
                    {aktif.sumber_nama ?? aktif.sumber_url}
                  </a>
                ) : (
                  (aktif.sumber_nama ?? "—")
                )}
              </p>
            )}
            <button className="tombol tombol-primer" type="button" onClick={lanjut}>
              {indeks + 1 >= total ? "Lihat skor" : "Soal berikutnya"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
