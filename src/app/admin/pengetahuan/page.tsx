// Admin Pengetahuan (Area 4, Fase 8 Gel. 2) — kelola artikel
// pengetahuan + explainer (jenis/tingkat/estimasi baca/seri).
// Client component: memuat daftar lewat GET /api/admin/pengetahuan
// (staf saja, dijaga layout admin + guard API). Tanpa seed dummy:
// artikel pertama dibuat editor lewat formulir ini.
// Konvensi isi explainer (lihat src/lib/explainer.ts):
//  - paragraf diawali "Mengapa penting" → seksi Mengapa penting;
//  - paragraf diawali tahun/tanggal ("2024 — ...") → Linimasa;
//  - referensi berjudul "Istilah: kata — definisi" → Istilah kunci.
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Referensi = { judul: string | null; url: string | null };

type ArtikelAdmin = {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  isi: string | null;
  topik: string;
  referensi: Referensi[];
  status: string;
  harian_tanggal: string | null;
  penulis_nama: string | null;
  jenis: string;
  tingkat: string;
  estimasi_baca_menit: number | null;
  seri_slug: string | null;
};

const TOPIK = [
  "sejarah",
  "geografi",
  "negara",
  "sains",
  "teknologi",
  "ekonomi",
  "alam",
  "tubuh",
  "umum",
] as const;

const LABEL_TOPIK: Record<string, string> = {
  sejarah: "Sejarah",
  geografi: "Geografi",
  negara: "Negara",
  sains: "Sains",
  teknologi: "Teknologi",
  ekonomi: "Ekonomi",
  alam: "Alam",
  tubuh: "Tubuh Manusia",
  umum: "Umum",
};

function referensiKeTeks(referensi: Referensi[]): string {
  return referensi
    .map((r) => (r.url ? `${r.judul ?? ""} | ${r.url}` : (r.judul ?? "")))
    .filter((s) => s.trim() !== "")
    .join("\n");
}

function teksKeReferensi(teks: string): Referensi[] {
  const hasil: Referensi[] = [];
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

export default function AdminPengetahuan() {
  const [daftar, setDaftar] = useState<ArtikelAdmin[]>([]);
  const [tersedia, setTersedia] = useState(true);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const [judul, setJudul] = useState("");
  const [slug, setSlug] = useState("");
  const [topik, setTopik] = useState<string>("umum");
  const [jenis, setJenis] = useState<string>("artikel");
  const [tingkat, setTingkat] = useState<string>("pemula");
  const [estimasi, setEstimasi] = useState("");
  const [seri, setSeri] = useState("");
  const [status, setStatus] = useState<string>("draft");
  const [ringkasan, setRingkasan] = useState("");
  const [isi, setIsi] = useState("");
  const [referensiTeks, setReferensiTeks] = useState("");
  const [harian, setHarian] = useState("");
  const [penulis, setPenulis] = useState("");
  const [statusForm, setStatusForm] = useState<StatusForm>("idle");
  const [pesanForm, setPesanForm] = useState("");

  const muat = useCallback(async () => {
    setMemuat(true);
    setGalat("");
    try {
      const res = await fetch("/api/admin/pengetahuan");
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        artikel?: ArtikelAdmin[];
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
          artikel?: ArtikelAdmin[];
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

  function resetForm() {
    setEditId(null);
    setJudul("");
    setSlug("");
    setTopik("umum");
    setJenis("artikel");
    setTingkat("pemula");
    setEstimasi("");
    setSeri("");
    setStatus("draft");
    setRingkasan("");
    setIsi("");
    setReferensiTeks("");
    setHarian("");
    setPenulis("");
    setStatusForm("idle");
    setPesanForm("");
  }

  function mulaiUbah(a: ArtikelAdmin) {
    setEditId(a.id);
    setJudul(a.judul);
    setSlug(a.slug);
    setTopik(a.topik);
    setJenis(a.jenis);
    setTingkat(a.tingkat);
    setEstimasi(a.estimasi_baca_menit ? String(a.estimasi_baca_menit) : "");
    setSeri(a.seri_slug ?? "");
    setStatus(a.status);
    setRingkasan(a.ringkasan ?? "");
    setIsi(a.isi ?? "");
    setReferensiTeks(referensiKeTeks(a.referensi));
    setHarian(a.harian_tanggal ?? "");
    setPenulis(a.penulis_nama ?? "");
    setStatusForm("idle");
    setPesanForm("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function kirim(e: FormEvent) {
    e.preventDefault();
    setStatusForm("loading");
    setPesanForm("");
    const payload: Record<string, unknown> = {
      judul: judul.trim(),
      slug: slug.trim(),
      topik,
      jenis,
      tingkat,
      estimasi_baca_menit: estimasi.trim() === "" ? null : Number(estimasi),
      seri_slug: seri.trim() === "" ? null : seri.trim(),
      status,
      ringkasan: ringkasan.trim() === "" ? null : ringkasan.trim(),
      isi: isi.trim() === "" ? null : isi,
      referensi: teksKeReferensi(referensiTeks),
      harian_tanggal: harian.trim() === "" ? null : harian.trim(),
      penulis_nama: penulis.trim() === "" ? null : penulis.trim(),
    };
    try {
      const res = await fetch(
        editId ? `/api/admin/pengetahuan/${editId}` : "/api/admin/pengetahuan",
        {
          method: editId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStatusForm("error");
        setPesanForm(data.error ?? `Gagal menyimpan (${res.status}).`);
        return;
      }
      setStatusForm("sukses");
      setPesanForm(
        editId ? "Artikel berhasil diubah." : "Artikel berhasil ditambah.",
      );
      resetForm();
      void muat();
    } catch {
      setStatusForm("error");
      setPesanForm("Gagal menyimpan (jaringan).");
    }
  }

  async function hapus(a: ArtikelAdmin) {
    if (
      !window.confirm(
        `Hapus artikel "${a.judul}"? Artikel yang dirujuk pelajaran akademi akan kehilangan rujukannya.`,
      )
    ) {
      return;
    }
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
          <form className="formulir" onSubmit={kirim}>
            <label>
              Judul
              <input
                value={judul}
                onChange={(e) => setJudul(e.target.value)}
                required
                maxLength={200}
              />
            </label>
            <label>
              Slug (huruf kecil, angka, tanda -)
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </label>
            <label>
              Topik
              <select
                value={topik}
                onChange={(e) => setTopik(e.target.value)}
              >
                {TOPIK.map((t) => (
                  <option key={t} value={t}>
                    {LABEL_TOPIK[t] ?? t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Jenis
              <select
                value={jenis}
                onChange={(e) => setJenis(e.target.value)}
              >
                <option value="artikel">Artikel</option>
                <option value="explainer">Explainer</option>
              </select>
            </label>
            <label>
              Tingkat kesulitan
              <select
                value={tingkat}
                onChange={(e) => setTingkat(e.target.value)}
              >
                <option value="pemula">Pemula</option>
                <option value="menengah">Menengah</option>
                <option value="mendalam">Mendalam</option>
              </select>
            </label>
            <label>
              Estimasi baca (menit, opsional)
              <input
                value={estimasi}
                onChange={(e) => setEstimasi(e.target.value)}
                type="number"
                min={1}
                max={120}
                inputMode="numeric"
              />
            </label>
            <label>
              Seri (slug seri, opsional — kelompokkan explainer se-topik)
              <input
                value={seri}
                onChange={(e) => setSeri(e.target.value)}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </label>
            <label>
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="terbit">Terbit</option>
              </select>
            </label>
            <label>
              Ringkasan
              <textarea
                value={ringkasan}
                onChange={(e) => setRingkasan(e.target.value)}
                rows={3}
              />
            </label>
            <label>
              Isi (paragraf dipisah baris kosong)
              <textarea
                value={isi}
                onChange={(e) => setIsi(e.target.value)}
                rows={10}
              />
            </label>
            <p className="artikel-meta-kecil">
              Konvensi explainer: paragraf diawali &ldquo;Mengapa
              penting&rdquo; menjadi seksi Mengapa penting; paragraf
              diawali tahun/tanggal (&ldquo;2024 — ...&rdquo;) menjadi
              Linimasa; referensi berjudul &ldquo;Istilah: kata —
              definisi&rdquo; menjadi Istilah kunci.
            </p>
            <label>
              Referensi (satu per baris: Judul | https://... — tanpa |
              berarti judul saja)
              <textarea
                value={referensiTeks}
                onChange={(e) => setReferensiTeks(e.target.value)}
                rows={4}
              />
            </label>
            <label>
              Fakta Hari Ini (tanggal, opsional)
              <input
                value={harian}
                onChange={(e) => setHarian(e.target.value)}
                type="date"
              />
            </label>
            <label>
              Penulis (opsional)
              <input
                value={penulis}
                onChange={(e) => setPenulis(e.target.value)}
              />
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                className="tombol tombol-primer"
                type="submit"
                disabled={statusForm === "loading"}
              >
                {statusForm === "loading"
                  ? "Menyimpan…"
                  : editId
                    ? "Simpan perubahan"
                    : "Tambah artikel"}
              </button>
              {editId && (
                <button className="tombol" type="button" onClick={resetForm}>
                  Batal ubah
                </button>
              )}
            </div>
            {statusForm === "error" && (
              <p role="alert" className="pesan-error">
                {pesanForm}
              </p>
            )}
            {statusForm === "sukses" && (
              <p role="status" className="pesan-sukses">
                {pesanForm}
              </p>
            )}
          </form>
        </article>
      </section>

      <section className="seksi" aria-labelledby="judul-daftar-pengetahuan">
        <div className="seksi-kepala">
          <h2 id="judul-daftar-pengetahuan">Daftar Artikel Pengetahuan</h2>
        </div>
        {memuat ? (
          <p role="status">Memuat daftar…</p>
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
                          onClick={() => void hapus(a)}
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
    </>
  );
}
