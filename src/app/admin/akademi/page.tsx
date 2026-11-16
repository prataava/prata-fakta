// Admin PRATA Academy (Area 8, Fase 8 Gel. 2) — kelola kursus,
// modul, dan pelajaran. Client component: memuat daftar lewat
// GET /api/admin/akademi; struktur isi diatur lewat PATCH
// /api/admin/akademi/[id] (staf saja, dijaga layout admin +
// guard API). Tanpa seed dummy: kursus pertama dibuat editor
// lewat formulir ini — modul dan pelajaran diisi sesudah kursus
// dibuat (tambah modul dulu, lalu pelajaran ke modul itu).
// Formulir dipindah ke src/components/admin/ (F-S8): FormKursus,
// FormStrukturAkademi — halaman ini tinggal menyusun.
"use client";

import { useCallback, useEffect, useState } from "react";
import FormKursus, { type KursusAdmin } from "@/components/admin/FormKursus";
import FormStrukturAkademi from "@/components/admin/FormStrukturAkademi";

export default function AdminAkademi() {
  const [daftar, setDaftar] = useState<KursusAdmin[]>([]);
  const [tersedia, setTersedia] = useState(true);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");

  // Kursus yang sedang dibuka strukturnya.
  const [bukaId, setBukaId] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setMemuat(true);
    setGalat("");
    try {
      const res = await fetch("/api/admin/akademi");
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        kursus?: KursusAdmin[];
      };
      if (!res.ok || !data.ok) {
        setTersedia(false);
        setGalat(data.error ?? `Gagal memuat daftar (${res.status}).`);
        return;
      }
      setTersedia(true);
      setDaftar(data.kursus ?? []);
    } catch {
      setTersedia(false);
      setGalat("Gagal memuat daftar (jaringan).");
    } finally {
      setMemuat(false);
    }
  }, []);

  // Muat awal mengikuti pola TabelPengguna: fetch di dalam effect
  // dengan .then() — setState berjalan di callback asinkron, bukan
  // sinkron di badan effect (dilarang lint
  // react-hooks/set-state-in-effect). `muat` dipakai tombol
  // "Coba lagi" dan sesudah simpan/hapus.
  useEffect(() => {
    let batal = false;
    fetch("/api/admin/akademi")
      .then(async (res) => {
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          kursus?: KursusAdmin[];
        };
        if (batal) return;
        if (!res.ok || !data.ok) {
          setTersedia(false);
          setGalat(data.error ?? `Gagal memuat daftar (${res.status}).`);
          return;
        }
        setTersedia(true);
        setDaftar(data.kursus ?? []);
      })
      .catch(() => {
        if (!batal) {
          setTersedia(false);
          setGalat("Gagal memuat daftar (jaringan).");
        }
      })
      .finally(() => {
        if (!batal) setMemuat(false);
      });
    return () => {
      batal = true;
    };
  }, []);

  function bukaKursus(k: KursusAdmin) {
    if (bukaId === k.id) {
      setBukaId(null);
      return;
    }
    setBukaId(k.id);
  }

  async function ubahStatusKursus(k: KursusAdmin) {
    const baru = k.status === "terbit" ? "draft" : "terbit";
    if (
      baru === "terbit" &&
      !window.confirm(
        `Terbitkan kursus "${k.judul}"? Kursus langsung tampil publik di /akademi.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/akademi/${k.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: baru }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setGalat(data.error ?? `Gagal menyimpan (${res.status}).`);
        return;
      }
      void muat();
    } catch {
      setGalat("Gagal menyimpan (jaringan).");
    }
  }

  async function hapusKursus(k: KursusAdmin) {
    if (
      !window.confirm(
        `Hapus kursus "${k.judul}" beserta semua modul, pelajaran, dan progres belajarnya?`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/akademi/${k.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setGalat(data.error ?? `Gagal menghapus (${res.status}).`);
        return;
      }
      if (bukaId === k.id) {
        setBukaId(null);
      }
      void muat();
    } catch {
      setGalat("Gagal menghapus (jaringan).");
    }
  }

  return (
    <>
      <section className="seksi" aria-labelledby="judul-form-kursus">
        <div className="seksi-kepala">
          <h2 id="judul-form-kursus">Buat Kursus Pertama</h2>
          <p>
            Langkah 1: buat kursus (mulai sebagai draft). Langkah 2: buka
            kursus di daftar bawah, tambah modul, lalu tambah pelajaran
            ke modul itu. Langkah 3: ubah status menjadi terbit bila
            isinya sudah siap. Isi modul menunggu editor — tidak ada
            kursus contoh.
          </p>
        </div>
        <article className="kartu">
          <FormKursus onSelesai={muat} />
        </article>
      </section>

      <section className="seksi" aria-labelledby="judul-daftar-kursus">
        <div className="seksi-kepala">
          <h2 id="judul-daftar-kursus">Daftar Kursus</h2>
        </div>
        {memuat ? (
          <div className="kerangka" role="status" aria-label="Memuat daftar kursus…" />
        ) : !tersedia ? (
          <div className="kosong" role="status">
            <h3>Daftar belum tersedia</h3>
            <p>
              {galat ||
                "Tabel akademi tidak dapat dibaca — migrasi v10 mungkin belum dijalankan, atau kunci service belum diatur."}
            </p>
            <button className="tombol" type="button" onClick={() => void muat()}>
              Coba lagi
            </button>
          </div>
        ) : daftar.length === 0 ? (
          <div className="kosong" role="status">
            <h3>Belum ada kursus</h3>
            <p>
              Buat kursus pertama lewat formulir di atas — tanpa data
              contoh; isi oleh redaksi.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {daftar.map((k) => (
              <article className="kartu" key={k.id}>
                <span className="kartu-kategori">{k.kategori}</span>
                <span className="kartu-judul">{k.judul}</span>
                {k.deskripsi && (
                  <span className="kartu-teks">{k.deskripsi}</span>
                )}
                <span className="kartu-meta">
                  {`Tingkat ${k.tingkat} · ${k.jumlah_modul} modul · ${k.jumlah_pelajaran} pelajaran · ${k.status}`}
                </span>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    marginTop: 12,
                  }}
                >
                  <button
                    className="tombol"
                    type="button"
                    onClick={() => bukaKursus(k)}
                    aria-expanded={bukaId === k.id}
                  >
                    {bukaId === k.id ? "Tutup struktur" : "Atur modul & pelajaran"}
                  </button>
                  <button
                    className="tombol tombol-primer"
                    type="button"
                    onClick={() => void ubahStatusKursus(k)}
                  >
                    {k.status === "terbit" ? "Kembalikan ke draft" : "Terbitkan"}
                  </button>
                  <button
                    className="tombol tombol-hantu"
                    type="button"
                    onClick={() => void hapusKursus(k)}
                  >
                    Hapus kursus
                  </button>
                </div>

                {bukaId === k.id && (
                  <div style={{ marginTop: 16 }}>
                    {/* key per kursus: ganti kursus = remount, jadi
                        FormStrukturAkademi memuat detail kursus baru. */}
                    <FormStrukturAkademi key={k.id} kursusId={k.id} onSelesai={muat} />
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
