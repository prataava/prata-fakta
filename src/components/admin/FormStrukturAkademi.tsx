// Struktur kursus admin (F-S8) — dipindah dari
// src/app/admin/akademi/page.tsx tanpa mengubah logika
// submit/validasi: memuat detail kursus (modul + pelajaran),
// tambah/hapus modul, tambah/hapus pelajaran — semuanya lewat
// PATCH /api/admin/akademi/[id] yang sama.
"use client";

import { useEffect, useState, type FormEvent as ReactFormEvent } from "react";
import type { KursusAdmin } from "@/components/admin/FormKursus";

export type ReferensiAkademi = { judul: string | null; url: string | null };

export type ModulAdmin = {
  id: string;
  course_id: string;
  judul: string;
  deskripsi: string | null;
  urutan: number;
};

export type PelajaranAdmin = {
  id: string;
  module_id: string;
  judul: string;
  isi: string | null;
  jenis: string;
  referensi: ReferensiAkademi[];
  artikel_id: string | null;
  kuis_tanggal: string | null;
  urutan: number;
};

export type DetailKursus = {
  kursus: KursusAdmin;
  modul: ModulAdmin[];
  pelajaran: PelajaranAdmin[];
};

function teksKeReferensi(teks: string): ReferensiAkademi[] {
  const hasil: ReferensiAkademi[] = [];
  for (const baris of teks.split("\n")) {
    const s = baris.trim();
    if (!s) continue;
    const pisah = s.split("|");
    if (pisah.length >= 2) {
      hasil.push({
        judul: (pisah[0] ?? "").trim() || null,
        url: pisah.slice(1).join("|").trim() || null,
      });
    } else {
      hasil.push({ judul: s, url: null });
    }
  }
  return hasil;
}

type StatusForm = "idle" | "loading" | "error" | "sukses";

export default function FormStrukturAkademi({
  kursusId,
  onSelesai,
}: {
  kursusId: string;
  /** Dipanggil sesudah struktur berubah agar daftar halaman segar. */
  onSelesai: () => void;
}) {
  const [detail, setDetail] = useState<DetailKursus | null>(null);
  // Detail selalu dimuat saat komponen dipasang (di-remount per
  // kursus lewat key di halaman) — state awal "memuat" agar effect
  // tidak perlu setState sinkron (dilarang lint set-state-in-effect).
  const [memuatDetail, setMemuatDetail] = useState(true);
  const [galatDetail, setGalatDetail] = useState("");

  // Formulir modul baru.
  const [modulJudul, setModulJudul] = useState("");
  const [modulDeskripsi, setModulDeskripsi] = useState("");
  const [modulUrutan, setModulUrutan] = useState("0");
  // Formulir pelajaran baru.
  const [pelModulId, setPelModulId] = useState("");
  const [pelJudul, setPelJudul] = useState("");
  const [pelJenis, setPelJenis] = useState("materi");
  const [pelIsi, setPelIsi] = useState("");
  const [pelReferensi, setPelReferensi] = useState("");
  const [pelArtikelId, setPelArtikelId] = useState("");
  const [pelKuisTanggal, setPelKuisTanggal] = useState("");
  const [pelUrutan, setPelUrutan] = useState("0");
  const [statusStruktur, setStatusStruktur] = useState<StatusForm>("idle");
  const [pesanStruktur, setPesanStruktur] = useState("");

  useEffect(() => {
    let batal = false;
    fetch(`/api/admin/akademi/${kursusId}`)
      .then(async (res) => {
        const data = (await res.json()) as DetailKursus & {
          ok?: boolean;
          error?: string;
        };
        if (batal) return;
        if (!res.ok || !data.ok) {
          setGalatDetail(data.error ?? `Gagal memuat kursus (${res.status}).`);
          setDetail(null);
          return;
        }
        setDetail({
          kursus: data.kursus,
          modul: data.modul ?? [],
          pelajaran: data.pelajaran ?? [],
        });
        const pertama = (data.modul ?? [])[0];
        if (pertama) setPelModulId(pertama.id);
      })
      .catch(() => {
        if (!batal) {
          setGalatDetail("Gagal memuat kursus (jaringan).");
          setDetail(null);
        }
      })
      .finally(() => {
        if (!batal) setMemuatDetail(false);
      });
    return () => {
      batal = true;
    };
  }, [kursusId]);

  async function patchKursus(
    id: string,
    perubahan: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      const res = await fetch(`/api/admin/akademi/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(perubahan),
      });
      const data = (await res.json()) as DetailKursus & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setPesanStruktur(data.error ?? `Gagal menyimpan (${res.status}).`);
        setStatusStruktur("error");
        return false;
      }
      setDetail({
        kursus: data.kursus,
        modul: data.modul ?? [],
        pelajaran: data.pelajaran ?? [],
      });
      onSelesai();
      return true;
    } catch {
      setPesanStruktur("Gagal menyimpan (jaringan).");
      setStatusStruktur("error");
      return false;
    }
  }

  async function tambahModul(e: ReactFormEvent) {
    e.preventDefault();
    setStatusStruktur("loading");
    setPesanStruktur("");
    const ok = await patchKursus(kursusId, {
      modul: [
        {
          judul: modulJudul.trim(),
          deskripsi:
            modulDeskripsi.trim() === "" ? null : modulDeskripsi.trim(),
          urutan: Number(modulUrutan) || 0,
        },
      ],
    });
    if (ok) {
      setStatusStruktur("sukses");
      setPesanStruktur("Modul berhasil ditambah.");
      setModulJudul("");
      setModulDeskripsi("");
      setModulUrutan("0");
    }
  }

  async function tambahPelajaran(e: ReactFormEvent) {
    e.preventDefault();
    if (!pelModulId) {
      setStatusStruktur("error");
      setPesanStruktur("Pilih modul tujuan pelajaran.");
      return;
    }
    setStatusStruktur("loading");
    setPesanStruktur("");
    const ok = await patchKursus(kursusId, {
      pelajaran: [
        {
          module_id: pelModulId,
          judul: pelJudul.trim(),
          isi: pelIsi.trim() === "" ? null : pelIsi,
          jenis: pelJenis,
          referensi: teksKeReferensi(pelReferensi),
          artikel_id:
            pelArtikelId.trim() === "" ? null : pelArtikelId.trim(),
          kuis_tanggal:
            pelKuisTanggal.trim() === "" ? null : pelKuisTanggal.trim(),
          urutan: Number(pelUrutan) || 0,
        },
      ],
    });
    if (ok) {
      setStatusStruktur("sukses");
      setPesanStruktur("Pelajaran berhasil ditambah.");
      setPelJudul("");
      setPelIsi("");
      setPelReferensi("");
      setPelArtikelId("");
      setPelKuisTanggal("");
      setPelUrutan("0");
    }
  }

  async function hapusModul(m: ModulAdmin) {
    if (
      !window.confirm(
        `Hapus modul "${m.judul}" beserta semua pelajaran dan progresnya?`,
      )
    ) {
      return;
    }
    setStatusStruktur("loading");
    setPesanStruktur("");
    const ok = await patchKursus(kursusId, { modul: [{ id: m.id, hapus: true }] });
    if (ok) {
      setStatusStruktur("sukses");
      setPesanStruktur("Modul berhasil dihapus.");
    }
  }

  async function hapusPelajaran(p: PelajaranAdmin) {
    if (!window.confirm(`Hapus pelajaran "${p.judul}" beserta progresnya?`)) {
      return;
    }
    setStatusStruktur("loading");
    setPesanStruktur("");
    const ok = await patchKursus(kursusId, {
      pelajaran: [{ id: p.id, hapus: true }],
    });
    if (ok) {
      setStatusStruktur("sukses");
      setPesanStruktur("Pelajaran berhasil dihapus.");
    }
  }

  if (memuatDetail) {
    return <div className="kerangka" role="status" aria-label="Memuat struktur kursus…" />;
  }
  if (galatDetail) {
    return (
      <p role="alert" className="pesan-error">
        {galatDetail}
      </p>
    );
  }
  if (!detail) return null;

  return (
    <>
      {detail.modul.length === 0 ? (
        <p role="status">
          Kursus ini belum memiliki modul. Tambah modul pertama di bawah.
        </p>
      ) : (
        detail.modul.map((m) => {
          const pelajaranModul = detail.pelajaran.filter(
            (p) => p.module_id === m.id,
          );
          return (
            <div key={m.id} style={{ marginBottom: 16 }}>
              <h3>
                {m.judul}
                {m.deskripsi ? ` — ${m.deskripsi}` : ""}
              </h3>
              <button
                className="tombol tombol-hantu"
                type="button"
                onClick={() => void hapusModul(m)}
              >
                Hapus modul
              </button>
              {pelajaranModul.length === 0 ? (
                <p>Modul ini belum memiliki pelajaran.</p>
              ) : (
                <ul>
                  {pelajaranModul.map((p) => (
                    <li key={p.id}>
                      <strong>
                        {p.jenis === "artikel"
                          ? "Artikel"
                          : p.jenis === "kuis"
                            ? "Kuis"
                            : "Materi"}
                      </strong>
                      {` — ${p.judul}`}
                      {p.jenis === "kuis" && p.kuis_tanggal
                        ? ` (kuis ${p.kuis_tanggal})`
                        : ""}
                      {p.jenis === "artikel" && p.artikel_id
                        ? ` (artikel ${p.artikel_id.slice(0, 8)}…)`
                        : ""}{" "}
                      <button
                        className="tombol tombol-hantu"
                        type="button"
                        onClick={() => void hapusPelajaran(p)}
                      >
                        Hapus
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })
      )}

      <h3>Tambah modul</h3>
      <form className="formulir" onSubmit={tambahModul}>
        <label>
          Judul modul
          <input
            value={modulJudul}
            onChange={(e) => setModulJudul(e.target.value)}
            required
          />
        </label>
        <label>
          Deskripsi modul (opsional)
          <input
            value={modulDeskripsi}
            onChange={(e) => setModulDeskripsi(e.target.value)}
          />
        </label>
        <label>
          Urutan
          <input
            value={modulUrutan}
            onChange={(e) => setModulUrutan(e.target.value)}
            type="number"
            min={0}
            max={1000}
            inputMode="numeric"
          />
        </label>
        <button
          className="tombol tombol-primer"
          type="submit"
          disabled={statusStruktur === "loading"}
        >
          Tambah modul
        </button>
      </form>

      <h3>Tambah pelajaran</h3>
      <form className="formulir" onSubmit={tambahPelajaran}>
        <label>
          Modul tujuan
          <select
            value={pelModulId}
            onChange={(e) => setPelModulId(e.target.value)}
            required
          >
            <option value="">— pilih modul —</option>
            {detail.modul.map((m) => (
              <option key={m.id} value={m.id}>
                {m.judul}
              </option>
            ))}
          </select>
        </label>
        <label>
          Judul pelajaran
          <input
            value={pelJudul}
            onChange={(e) => setPelJudul(e.target.value)}
            required
          />
        </label>
        <label>
          Jenis pelajaran
          <select
            value={pelJenis}
            onChange={(e) => setPelJenis(e.target.value)}
          >
            <option value="materi">Materi (teks)</option>
            <option value="artikel">Artikel (rujukan)</option>
            <option value="kuis">Kuis (tanggal kuis harian)</option>
          </select>
        </label>
        <label>
          Isi materi (paragraf dipisah baris kosong;
          untuk jenis artikel/kuis boleh kosong)
          <textarea
            value={pelIsi}
            onChange={(e) => setPelIsi(e.target.value)}
            rows={6}
          />
        </label>
        <label>
          Referensi belajar (satu per baris: Judul |
          https://...)
          <textarea
            value={pelReferensi}
            onChange={(e) => setPelReferensi(e.target.value)}
            rows={3}
          />
        </label>
        {pelJenis === "artikel" && (
          <label>
            ID artikel rujukan (UUID pf_articles,
            opsional)
            <input
              value={pelArtikelId}
              onChange={(e) => setPelArtikelId(e.target.value)}
            />
          </label>
        )}
        {pelJenis === "kuis" && (
          <label>
            Tanggal kuis harian (YYYY-MM-DD — soal
            diambil dari kuis tanggal itu)
            <input
              value={pelKuisTanggal}
              onChange={(e) => setPelKuisTanggal(e.target.value)}
              type="date"
              required
            />
          </label>
        )}
        <label>
          Urutan
          <input
            value={pelUrutan}
            onChange={(e) => setPelUrutan(e.target.value)}
            type="number"
            min={0}
            max={1000}
            inputMode="numeric"
          />
        </label>
        <button
          className="tombol tombol-primer"
          type="submit"
          disabled={statusStruktur === "loading"}
        >
          Tambah pelajaran
        </button>
      </form>
      {statusStruktur === "error" && (
        <p role="alert" className="pesan-error">
          {pesanStruktur}
        </p>
      )}
      {statusStruktur === "sukses" && (
        <p role="status" className="pesan-sukses">
          {pesanStruktur}
        </p>
      )}
    </>
  );
}
