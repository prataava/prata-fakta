// Admin PRATA Academy — Antrean penilaian esai (integrasi B2).
// Client component: memuat daftar lewat GET /api/admin/akademi/esai;
// tiap esai dinilai lewat POST /api/admin/akademi/esai/[id]/nilai
// (staf saja, dijaga guard API). Esai yang sudah dinilai hilang
// dari antrean. Tanpa data contoh; tanggal ditampilkan sebagai
// potongan string ISO (tanpa new Date() di render, aturan Next 16).
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Esai = {
  id: string;
  user_id: string;
  nama_peserta: string | null;
  lesson_id: string;
  judul_pelajaran: string | null;
  soal_id: string;
  pertanyaan: string | null;
  jawaban: string;
  dibuat_pada: string;
};

export default function AdminEsai() {
  const [daftar, setDaftar] = useState<Esai[]>([]);
  const [tersedia, setTersedia] = useState(true);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const [menilai, setMenilai] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setMemuat(true);
    setGalat("");
    try {
      const res = await fetch("/api/admin/akademi/esai");
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        esai?: Esai[];
      };
      if (!res.ok || !data.ok) {
        setTersedia(false);
        setGalat(data.error ?? `Gagal memuat antrean (${res.status}).`);
        return;
      }
      setTersedia(true);
      setDaftar(data.esai ?? []);
    } catch {
      setTersedia(false);
      setGalat("Gagal memuat antrean (jaringan).");
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    let batal = false;
    fetch("/api/admin/akademi/esai")
      .then(async (res) => {
        if (batal) return;
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          esai?: Esai[];
        };
        if (!res.ok || !data.ok) {
          setTersedia(false);
          setGalat(data.error ?? `Gagal memuat antrean (${res.status}).`);
          return;
        }
        setTersedia(true);
        setDaftar(data.esai ?? []);
      })
      .catch(() => {
        if (batal) return;
        setTersedia(false);
        setGalat("Gagal memuat antrean (jaringan).");
      })
      .finally(() => {
        if (!batal) setMemuat(false);
      });
    return () => {
      batal = true;
    };
  }, []);

  async function nilai(id: string, benar: boolean) {
    setMenilai(id);
    setGalat("");
    try {
      const res = await fetch(`/api/admin/akademi/esai/${id}/nilai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benar }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setGalat(data.error ?? `Penilaian gagal (${res.status}).`);
        return;
      }
      setDaftar((d) => d.filter((e) => e.id !== id));
    } catch {
      setGalat("Penilaian gagal (jaringan).");
    } finally {
      setMenilai(null);
    }
  }

  return (
    <>
      <section className="seksi" aria-labelledby="judul-esai">
        <div className="seksi-kepala">
          <h2 id="judul-esai">Antrean Penilaian Esai</h2>
          <p>
            Esai jawaban pengguna yang masih menunggu penilaian manual.
            Dinilai Benar atau Salah — sesudah dinilai, skor kuis dan
            kelulusan pengguna dihitung ulang dari jawaban ini.{" "}
            <Link href="/admin/akademi">Kembali ke Academy</Link>
          </p>
        </div>
        {memuat ? (
          <div className="kerangka" role="status" aria-label="Memuat antrean esai…" />
        ) : !tersedia ? (
          <div className="kosong" role="status">
            <h3>Antrean belum tersedia</h3>
            <p>
              {galat ||
                "Tabel jawaban belum dapat dibaca — migrasi v14 mungkin belum dijalankan, atau kunci service belum diatur."}
            </p>
            <button className="tombol" type="button" onClick={() => void muat()}>
              Coba lagi
            </button>
          </div>
        ) : daftar.length === 0 ? (
          <div className="kosong" role="status">
            <h3>Belum ada esai menunggu penilaian</h3>
            <p>
              Semua esai sudah dinilai, atau belum ada pengguna yang
              menjawab soal esai.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {daftar.map((e) => (
              <article className="kartu" key={e.id}>
                <span className="kartu-kategori">
                  {e.judul_pelajaran ?? "Pelajaran"}
                </span>
                <span className="kartu-judul">
                  {e.nama_peserta ?? e.user_id.slice(0, 8)} —{" "}
                  {e.dibuat_pada.slice(0, 10)}
                </span>
                {e.pertanyaan && (
                  <span className="kartu-teks">
                    <strong>Soal:</strong> {e.pertanyaan}
                  </span>
                )}
                <span className="kartu-teks">
                  <strong>Jawaban:</strong> {e.jawaban}
                </span>
                {galat && (
                  <span className="kartu-teks" role="alert">
                    {galat}
                  </span>
                )}
                <span className="kartu-aksi">
                  <button
                    className="tombol"
                    type="button"
                    disabled={menilai === e.id}
                    onClick={() => void nilai(e.id, true)}
                  >
                    Benar
                  </button>
                  <button
                    className="tombol tombol-garis"
                    type="button"
                    disabled={menilai === e.id}
                    onClick={() => void nilai(e.id, false)}
                  >
                    Salah
                  </button>
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
