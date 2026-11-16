// Admin PRATA Academy (Area 8, Fase 8 Gel. 2) — kelola kursus,
// modul, dan pelajaran. Client component: memuat daftar lewat
// GET /api/admin/akademi; struktur isi diatur lewat PATCH
// /api/admin/akademi/[id] (staf saja, dijaga layout admin +
// guard API). Tanpa seed dummy: kursus pertama dibuat editor
// lewat formulir ini — modul dan pelajaran diisi sesudah kursus
// dibuat (tambah modul dulu, lalu pelajaran ke modul itu).
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Referensi = { judul: string | null; url: string | null };

type KursusAdmin = {
  id: string;
  slug: string;
  judul: string;
  deskripsi: string | null;
  kategori: string;
  tingkat: string;
  status: string;
  urutan: number;
  jumlah_modul: number;
  jumlah_pelajaran: number;
};

type ModulAdmin = {
  id: string;
  course_id: string;
  judul: string;
  deskripsi: string | null;
  urutan: number;
};

type PelajaranAdmin = {
  id: string;
  module_id: string;
  judul: string;
  isi: string | null;
  jenis: string;
  referensi: Referensi[];
  artikel_id: string | null;
  kuis_tanggal: string | null;
  urutan: number;
};

type DetailKursus = {
  kursus: KursusAdmin;
  modul: ModulAdmin[];
  pelajaran: PelajaranAdmin[];
};

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

export default function AdminAkademi() {
  const [daftar, setDaftar] = useState<KursusAdmin[]>([]);
  const [tersedia, setTersedia] = useState(true);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");

  // Formulir kursus baru.
  const [slug, setSlug] = useState("");
  const [judul, setJudul] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [kategori, setKategori] = useState("umum");
  const [tingkat, setTingkat] = useState("pemula");
  const [status, setStatus] = useState("draft");
  const [urutan, setUrutan] = useState("0");
  const [statusForm, setStatusForm] = useState<StatusForm>("idle");
  const [pesanForm, setPesanForm] = useState("");

  // Kursus yang sedang dibuka strukturnya.
  const [bukaId, setBukaId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailKursus | null>(null);
  const [memuatDetail, setMemuatDetail] = useState(false);
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

  async function muatDetail(id: string) {
    setMemuatDetail(true);
    setGalatDetail("");
    try {
      const res = await fetch(`/api/admin/akademi/${id}`);
      const data = (await res.json()) as DetailKursus & {
        ok?: boolean;
        error?: string;
      };
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
    } catch {
      setGalatDetail("Gagal memuat kursus (jaringan).");
      setDetail(null);
    } finally {
      setMemuatDetail(false);
    }
  }

  function bukaKursus(k: KursusAdmin) {
    if (bukaId === k.id) {
      setBukaId(null);
      setDetail(null);
      return;
    }
    setBukaId(k.id);
    setStatusStruktur("idle");
    setPesanStruktur("");
    void muatDetail(k.id);
  }

  async function kirimKursus(e: FormEvent) {
    e.preventDefault();
    setStatusForm("loading");
    setPesanForm("");
    try {
      const res = await fetch("/api/admin/akademi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim(),
          judul: judul.trim(),
          deskripsi: deskripsi.trim() === "" ? null : deskripsi.trim(),
          kategori: kategori.trim() || "umum",
          tingkat,
          status,
          urutan: Number(urutan) || 0,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStatusForm("error");
        setPesanForm(data.error ?? `Gagal menyimpan (${res.status}).`);
        return;
      }
      setStatusForm("sukses");
      setPesanForm("Kursus berhasil dibuat. Buka kursus di daftar untuk menambah modul dan pelajaran.");
      setSlug("");
      setJudul("");
      setDeskripsi("");
      setKategori("umum");
      setTingkat("pemula");
      setStatus("draft");
      setUrutan("0");
      void muat();
    } catch {
      setStatusForm("error");
      setPesanForm("Gagal menyimpan (jaringan).");
    }
  }

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
      void muat();
      return true;
    } catch {
      setPesanStruktur("Gagal menyimpan (jaringan).");
      setStatusStruktur("error");
      return false;
    }
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
    setStatusStruktur("loading");
    setPesanStruktur("");
    await patchKursus(k.id, { status: baru });
    if (bukaId === k.id) {
      setStatusStruktur("sukses");
      setPesanStruktur(
        baru === "terbit" ? "Kursus diterbitkan." : "Kursus dikembalikan ke draft.",
      );
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
        setDetail(null);
      }
      void muat();
    } catch {
      setGalat("Gagal menghapus (jaringan).");
    }
  }

  async function tambahModul(e: FormEvent) {
    e.preventDefault();
    if (!bukaId) return;
    setStatusStruktur("loading");
    setPesanStruktur("");
    const ok = await patchKursus(bukaId, {
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

  async function tambahPelajaran(e: FormEvent) {
    e.preventDefault();
    if (!bukaId) return;
    if (!pelModulId) {
      setStatusStruktur("error");
      setPesanStruktur("Pilih modul tujuan pelajaran.");
      return;
    }
    setStatusStruktur("loading");
    setPesanStruktur("");
    const ok = await patchKursus(bukaId, {
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
    if (!bukaId) return;
    if (
      !window.confirm(
        `Hapus modul "${m.judul}" beserta semua pelajaran dan progresnya?`,
      )
    ) {
      return;
    }
    setStatusStruktur("loading");
    setPesanStruktur("");
    const ok = await patchKursus(bukaId, { modul: [{ id: m.id, hapus: true }] });
    if (ok) {
      setStatusStruktur("sukses");
      setPesanStruktur("Modul berhasil dihapus.");
    }
  }

  async function hapusPelajaran(p: PelajaranAdmin) {
    if (!bukaId) return;
    if (!window.confirm(`Hapus pelajaran "${p.judul}" beserta progresnya?`)) {
      return;
    }
    setStatusStruktur("loading");
    setPesanStruktur("");
    const ok = await patchKursus(bukaId, {
      pelajaran: [{ id: p.id, hapus: true }],
    });
    if (ok) {
      setStatusStruktur("sukses");
      setPesanStruktur("Pelajaran berhasil dihapus.");
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
          <form className="formulir" onSubmit={kirimKursus}>
            <label>
              Judul kursus
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
              Deskripsi
              <textarea
                value={deskripsi}
                onChange={(e) => setDeskripsi(e.target.value)}
                rows={3}
              />
            </label>
            <label>
              Kategori
              <input
                value={kategori}
                onChange={(e) => setKategori(e.target.value)}
                required
                maxLength={60}
              />
            </label>
            <label>
              Tingkat
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
              Status awal
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="terbit">Terbit</option>
              </select>
            </label>
            <label>
              Urutan tampil
              <input
                value={urutan}
                onChange={(e) => setUrutan(e.target.value)}
                type="number"
                min={0}
                max={1000}
                inputMode="numeric"
              />
            </label>
            <button
              className="tombol tombol-primer"
              type="submit"
              disabled={statusForm === "loading"}
            >
              {statusForm === "loading" ? "Menyimpan…" : "Buat kursus"}
            </button>
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

      <section className="seksi" aria-labelledby="judul-daftar-kursus">
        <div className="seksi-kepala">
          <h2 id="judul-daftar-kursus">Daftar Kursus</h2>
        </div>
        {memuat ? (
          <p role="status">Memuat daftar…</p>
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
                    {memuatDetail ? (
                      <p role="status">Memuat struktur kursus…</p>
                    ) : galatDetail ? (
                      <p role="alert" className="pesan-error">
                        {galatDetail}
                      </p>
                    ) : detail ? (
                      <>
                        {detail.modul.length === 0 ? (
                          <p role="status">
                            Kursus ini belum memiliki modul. Tambah modul
                            pertama di bawah.
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
                    ) : null}
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
