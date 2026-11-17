// Admin Pengetahuan (Area 4, Fase 8 Gel. 2) — kelola artikel
// pengetahuan + explainer (jenis/tingkat/estimasi baca/seri).
// Client component: memuat daftar lewat GET /api/admin/pengetahuan
// (staf saja, dijaga layout admin + guard API). Tanpa seed dummy:
// artikel pertama dibuat editor lewat formulir ini.
// Formulir dipindah ke src/components/admin/FormPengetahuan (F-S8)
// — halaman ini tinggal menyusun.
// Konvensi isi explainer (lihat src/lib/explainer.ts):
//  - paragraf diawali "Mengapa penting" → seksi Mengapa penting;
//  - paragraf diawali tahun/tanggal ("2024 — ...") → Linimasa;
//  - referensi berjudul "Istilah: kata — definisi" → Istilah kunci.
"use client";

import { useCallback, useEffect, useState } from "react";
import DialogKonfirmasi from "@/components/admin/DialogKonfirmasi";
import FormPengetahuan, {
  LABEL_TOPIK,
  type ArtikelPengetahuanAdmin,
} from "@/components/admin/FormPengetahuan";

export default function AdminPengetahuan() {
  const [daftar, setDaftar] = useState<ArtikelPengetahuanAdmin[]>([]);
  const [tersedia, setTersedia] = useState(true);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");

  const [editId, setEditId] = useState<string | null>(null);

  // Artikel yang menunggu konfirmasi hapus (dialog dalam-halaman,
  // bukan window.confirm — dialog bawaan ditolak otomatisasi).
  const [hapusTarget, setHapusTarget] =
    useState<ArtikelPengetahuanAdmin | null>(null);

  const muat = useCallback(async () => {
    setMemuat(true);
    setGalat("");
    try {
      const res = await fetch("/api/admin/pengetahuan");
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        artikel?: ArtikelPengetahuanAdmin[];
      };
      if (!res.ok || !data.ok) {
        setTersedia(false);
        setGalat(data.error ?? `Gagal memuat daftar (${res.status}).`);
        return;
      }
      setTersedia(true);
      setDaftar(data.artikel ?? []);
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
    fetch("/api/admin/pengetahuan")
      .then(async (res) => {
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          artikel?: ArtikelPengetahuanAdmin[];
        };
        if (batal) return;
        if (!res.ok || !data.ok) {
          setTersedia(false);
          setGalat(data.error ?? `Gagal memuat daftar (${res.status}).`);
          return;
        }
        setTersedia(true);
        setDaftar(data.artikel ?? []);
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

  function mulaiUbah(a: ArtikelPengetahuanAdmin) {
    setEditId(a.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function sesudahSimpan() {
    setEditId(null);
    void muat();
  }

  async function hapus(a: ArtikelPengetahuanAdmin) {
    setHapusTarget(null);
    try {
      const res = await fetch(`/api/admin/pengetahuan/${a.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setGalat(data.error ?? `Gagal menghapus (${res.status}).`);
        return;
      }
      void muat();
    } catch {
      setGalat("Gagal menghapus (jaringan).");
    }
  }

  const artikelEdit = editId
    ? (daftar.find((a) => a.id === editId) ?? null)
    : null;

  return (
    <>
      <section className="seksi" aria-labelledby="judul-form-pengetahuan">
        <div className="seksi-kepala">
          <h2 id="judul-form-pengetahuan">
            {editId ? "Ubah Artikel" : "Tambah Artikel Pengetahuan"}
          </h2>
          <p>
            Artikel biasa tampil seperti biasa; pilih jenis Explainer
            untuk format berlapis (ringkas → mendalam, Mengapa penting,
            istilah kunci, linimasa, seri).
          </p>
        </div>
        <article className="kartu">
          <FormPengetahuan
            key={editId ?? "baru"}
            artikel={artikelEdit}
            onSelesai={sesudahSimpan}
            onBatal={() => setEditId(null)}
          />
        </article>
      </section>

      <section className="seksi" aria-labelledby="judul-daftar-pengetahuan">
        <div className="seksi-kepala">
          <h2 id="judul-daftar-pengetahuan">Daftar Artikel Pengetahuan</h2>
        </div>
        {memuat ? (
          <div className="kerangka" role="status" aria-label="Memuat daftar artikel…" />
        ) : !tersedia ? (
          <div className="kosong" role="status">
            <h3>Daftar belum tersedia</h3>
            <p>{galat || "Tabel pengetahuan tidak dapat dibaca — migrasi v10 mungkin belum dijalankan, atau kunci service belum diatur."}</p>
            <button className="tombol" type="button" onClick={() => void muat()}>
              Coba lagi
            </button>
          </div>
        ) : daftar.length === 0 ? (
          <div className="kosong" role="status">
            <h3>Belum ada artikel pengetahuan</h3>
            <p>
              Tambah artikel pertama lewat formulir di atas — tanpa
              data contoh; isi oleh redaksi.
            </p>
          </div>
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Judul</th>
                  <th>Topik</th>
                  <th>Jenis</th>
                  <th>Tingkat</th>
                  <th>Seri</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {daftar.map((a) => (
                  <tr key={a.id}>
                    <td>{a.judul}</td>
                    <td>{LABEL_TOPIK[a.topik] ?? a.topik}</td>
                    <td>{a.jenis === "explainer" ? "Explainer" : "Artikel"}</td>
                    <td>{a.tingkat}</td>
                    <td>{a.seri_slug ?? "—"}</td>
                    <td>{a.status}</td>
                    <td>
                      <span className="admin-aksi">
                        <button
                          className="tombol"
                          type="button"
                          onClick={() => mulaiUbah(a)}
                        >
                          Ubah
                        </button>
                        <button
                          className="tombol tombol-hantu"
                          type="button"
                          onClick={() => setHapusTarget(a)}
                        >
                          Hapus
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <DialogKonfirmasi
        terbuka={hapusTarget !== null}
        judul="Hapus artikel?"
        pesan={
          hapusTarget
            ? `Hapus artikel "${hapusTarget.judul}"? Artikel yang dirujuk pelajaran akademi akan kehilangan rujukannya.`
            : ""
        }
        labelKonfirmasi="Ya, hapus"
        varian="bahaya"
        onKonfirmasi={() => {
          if (hapusTarget) void hapus(hapusTarget);
        }}
        onTutup={() => setHapusTarget(null)}
      />
    </>
  );
}
