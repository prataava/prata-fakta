"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PfKuisSoalPublik } from "@/lib/lanjutan";

// Kuis harian interaktif (client component). Jawab satu per satu;
// sesudah menjawab satu soal tampil kunci + penjelasan + sumber.
// Fase 7: skor DISIMPAN untuk pengguna login (POST /api/kuis/skor
// sekali saat kuis selesai; main ulang di hari yang sama menimpa
// skor sebelumnya). Tahap C-3: klien HANYA mengirim tanggal —
// skor dihitung server dari jawaban tersimpan (satu jawaban
// tersimpan per soal lewat POST /api/kuis/jawab); angka benar/
// total dari klien tidak lagi dipercaya. Pengguna anonim tetap
// bisa bermain — skornya hanya tampil di sesi ini dan halaman
// menyatakan jujur bahwa riwayat skor butuh masuk.
// Keamanan (T1): soal yang diterima klien TIDAK mengandung kunci
// jawaban — setiap jawaban diperiksa server lewat POST
// /api/kuis/jawab, dan kunci soal itu saja dikembalikan sesudah
// pengguna menjawab.
type HasilJawaban = {
  benar: boolean;
  kunci: number;
  penjelasan: string | null;
  sumber_url: string | null;
  sumber_nama: string | null;
};

export default function KuisHarian({
  soal,
  tanggal,
  masuk,
}: {
  soal: PfKuisSoalPublik[];
  tanggal: string;
  masuk: boolean;
}) {
  const [indeks, setIndeks] = useState(0);
  const [pilihan, setPilihan] = useState<number | null>(null);
  const [hasil, setHasil] = useState<HasilJawaban | null>(null);
  const [memeriksa, setMemeriksa] = useState(false);
  const [galatJawab, setGalatJawab] = useState("");
  const [benar, setBenar] = useState(0);
  const [selesai, setSelesai] = useState(false);
  const [simpan, setSimpan] = useState<
    "idle" | "menyimpan" | "tersimpan" | "gagal"
  >("idle");
  const [pesanSimpan, setPesanSimpan] = useState("");

  const aktif = soal[indeks];
  const total = soal.length;

  const skorAkhir = useMemo(() => ({ benar, total }), [benar, total]);

  if (!aktif && !selesai) return null;

  async function simpanSkor() {
    if (!masuk) return;
    setSimpan("menyimpan");
    setPesanSimpan("");
    try {
      // Tahap C-3: hanya tanggal yang dikirim — skor dihitung
      // server dari jawaban tersimpan (benar/total klien tidak
      // lagi dipercaya; server mengabaikannya bila dikirim).
      const res = await fetch("/api/kuis/skor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tanggal }),
      });
      const hasil = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && hasil.ok) {
        setSimpan("tersimpan");
      } else {
        setSimpan("gagal");
        setPesanSimpan(hasil.error ?? "Skor gagal disimpan.");
      }
    } catch {
      setSimpan("gagal");
      setPesanSimpan("Skor gagal disimpan (jaringan).");
    }
  }

  async function jawab(i: number) {
    if (pilihan !== null || memeriksa) return;
    setPilihan(i);
    setGalatJawab("");
    setMemeriksa(true);
    try {
      const res = await fetch("/api/kuis/jawab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soal_id: aktif.id, jawaban: i }),
      });
      const data = (await res.json()) as HasilJawaban & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        // Gagal memeriksa — biarkan pengguna mencoba lagi.
        setPilihan(null);
        setGalatJawab(data.error ?? "Jawaban gagal diperiksa. Coba lagi.");
        return;
      }
      setHasil({
        benar: data.benar,
        kunci: data.kunci,
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
      // `benar` sudah final di titik ini (jawab() terjadi pada klik
      // sebelumnya, bukan klik ini) — tetapi skor TIDAK dikirim
      // dari klien (Tahap C-3): server menghitungnya dari jawaban
      // tersimpan.
      void simpanSkor();
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
    setSimpan("idle");
    setPesanSimpan("");
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
          {masuk ? (
            <p>
              {simpan === "menyimpan" && "Menyimpan skor…"}
              {simpan === "tersimpan" && "Skor tersimpan di riwayat Anda."}
              {simpan === "gagal" && `Skor tidak tersimpan: ${pesanSimpan}`}
              {simpan === "idle" && "Skor Anda akan disimpan."}
            </p>
          ) : (
            <p>
              Skor hanya tampil di sesi ini.{" "}
              <Link href="/masuk">Masuk</Link> untuk menyimpan riwayat skor.
            </p>
          )}
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
            const dijawab = hasil !== null;
            const iniKunci = hasil !== null && i === hasil.kunci;
            const iniPilihan = i === pilihan;
            let kelas = "tombol";
            if (dijawab && iniKunci) kelas += " tombol-primer";
            else if (dijawab && iniPilihan) kelas += " tombol-bahaya";
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
                {dijawab && iniKunci ? " ✓" : ""}
                {dijawab && iniPilihan && !iniKunci ? " ✗" : ""}
              </button>
            );
          })}
        </div>
        {memeriksa && pilihan !== null && (
          <p role="status" style={{ marginTop: 16 }}>
            Memeriksa jawaban…
          </p>
        )}
        {galatJawab && (
          <p role="alert" style={{ marginTop: 16 }}>
            {galatJawab}
          </p>
        )}
        {hasil !== null && (
          <div style={{ marginTop: 16 }}>
            <p role="status">
              {hasil.benar
                ? "Benar!"
                : `Kurang tepat. Jawaban benar: ${String.fromCharCode(65 + hasil.kunci)}. ${aktif.opsi[hasil.kunci]}`}
            </p>
            {hasil.penjelasan && <p>{hasil.penjelasan}</p>}
            {(hasil.sumber_url || hasil.sumber_nama) && (
              <p>
                Sumber:{" "}
                {hasil.sumber_url ? (
                  <a href={hasil.sumber_url} target="_blank" rel="noopener noreferrer">
                    {hasil.sumber_nama ?? hasil.sumber_url}
                  </a>
                ) : (
                  (hasil.sumber_nama ?? "—")
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
