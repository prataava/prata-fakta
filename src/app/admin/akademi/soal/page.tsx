// Admin PRATA Academy — buat soal kuis bertipe baru (Tahap C-1).
// Satu formulir untuk SEMUA jenis soal (pilihan_ganda,
// pilihan_ganda_kompleks, isian_singkat, benar_salah, esai):
// tujuan soal = pelajaran kuis Academy (tanggal soal diambil
// dari kuis_tanggal pelajaran) ATAU tanggal kuis harian
// (hanya pilihan_ganda). Kunci jawaban TIDAK PERNAH tampil
// kembali di daftar soal (hanya staf pembuat yang
// memasukkannya di formulir ini; kunci tersimpan ke
// pf_quiz_answers via POST /api/admin/akademi/soal).
"use client";

import { useCallback, useEffect, useState, type FormEvent as ReactFormEvent } from "react";
import Link from "next/link";
import type { KursusAdmin } from "@/components/admin/FormKursus";

type PelajaranKuis = {
  id: string;
  module_id: string;
  judul: string;
  jenis: string;
  kuis_tanggal: string | null;
};

type SoalBaru = {
  id: string;
  tanggal: string;
  pertanyaan: string;
  jenis: string;
  opsi: string[];
};

const JENIS_LABEL: Record<string, string> = {
  pilihan_ganda: "Pilihan ganda (satu jawaban benar)",
  pilihan_ganda_kompleks: "Pilihan ganda kompleks (jawaban benar lebih dari satu)",
  isian_singkat: "Isian singkat (jawaban teks)",
  benar_salah: "Benar / salah",
  esai: "Esai (dinilai manual oleh staf)",
};

export default function AdminAkademiSoal() {
  const [mode, setMode] = useState<"pelajaran" | "harian">("pelajaran");
  const [daftarKursus, setDaftarKursus] = useState<KursusAdmin[]>([]);
  const [kursusId, setKursusId] = useState("");
  const [pelajaranKuis, setPelajaranKuis] = useState<PelajaranKuis[]>([]);
  const [lessonId, setLessonId] = useState("");
  const [tanggal, setTanggal] = useState("");
  const [pertanyaan, setPertanyaan] = useState("");
  const [jenis, setJenis] = useState("pilihan_ganda");
  const [opsi, setOpsi] = useState<string[]>(["", ""]);
  const [kunci, setKunci] = useState(0);
  const [kunciJamaks, setKunciJamaks] = useState<number[]>([]);
  const [kunciTeks, setKunciTeks] = useState("");
  const [penjelasan, setPenjelasan] = useState("");
  const [sumberUrl, setSumberUrl] = useState("");
  const [sumberNama, setSumberNama] = useState("");
  const [statusForm, setStatusForm] = useState<"idle" | "loading" | "error" | "sukses">("idle");
  const [pesanForm, setPesanForm] = useState("");
  const [daftarSoal, setDaftarSoal] = useState<SoalBaru[]>([]);
  const [memuatSoal, setMemuatSoal] = useState(true);

  const muatSoal = useCallback(async () => {
    setMemuatSoal(true);
    try {
      const res = await fetch("/api/admin/akademi/soal");
      const data = (await res.json()) as { ok?: boolean; soal?: SoalBaru[] };
      if (res.ok && data.ok) setDaftarSoal(data.soal ?? []);
    } catch {
      // Daftar gagal dimuat — formulir tetap bisa dipakai.
    } finally {
      setMemuatSoal(false);
    }
  }, []);

  useEffect(() => {
    let batal = false;
    fetch("/api/admin/akademi")
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; kursus?: KursusAdmin[] };
        if (!batal && res.ok && data.ok) setDaftarKursus(data.kursus ?? []);
      })
      .catch(() => undefined);
    // Muat soal mengikuti pola yang sama: setState hanya di
    // callback promise (dilarang lint set-state-in-effect).
    fetch("/api/admin/akademi/soal")
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; soal?: SoalBaru[] };
        if (!batal && res.ok && data.ok) setDaftarSoal(data.soal ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!batal) setMemuatSoal(false);
      });
    return () => {
      batal = true;
    };
  }, []);

  async function pilihKursus(id: string) {
    setKursusId(id);
    setLessonId("");
    setPelajaranKuis([]);
    if (!id) return;
    try {
      const res = await fetch(`/api/admin/akademi/${id}`);
      const data = (await res.json()) as {
        ok?: boolean;
        pelajaran?: PelajaranKuis[];
      };
      if (res.ok && data.ok) {
        setPelajaranKuis(
          (data.pelajaran ?? []).filter(
            (p) => p.jenis === "kuis" && p.kuis_tanggal,
          ),
        );
      }
    } catch {
      // Pelajaran gagal dimuat — pesan tampil saat submit.
    }
  }

  function ubahOpsi(i: number, nilai: string) {
    setOpsi((lama) => lama.map((o, x) => (x === i ? nilai : o)));
  }

  function tambahOpsi() {
    if (opsi.length < 10) setOpsi((lama) => [...lama, ""]);
  }

  function hapusOpsi(i: number) {
    if (opsi.length <= 2) return;
    setOpsi((lama) => lama.filter((_, x) => x !== i));
    setKunciJamaks((lama) => lama.filter((k) => k !== i).map((k) => (k > i ? k - 1 : k)));
    setKunci((lama) => (lama === i ? 0 : lama > i ? lama - 1 : lama));
  }

  function alihKunciJamaks(i: number) {
    setKunciJamaks((lama) =>
      lama.includes(i) ? lama.filter((k) => k !== i) : [...lama, i],
    );
  }

  function resetSetelahSukses() {
    setPertanyaan("");
    setOpsi(["", ""]);
    setKunci(0);
    setKunciJamaks([]);
    setKunciTeks("");
    setPenjelasan("");
    setSumberUrl("");
    setSumberNama("");
  }

  async function kirimSoal(e: ReactFormEvent) {
    e.preventDefault();
    setStatusForm("loading");
    setPesanForm("");
    const body: Record<string, unknown> = {
      pertanyaan: pertanyaan.trim(),
      jenis,
      penjelasan: penjelasan.trim() === "" ? null : penjelasan.trim(),
      sumber_url: sumberUrl.trim() === "" ? null : sumberUrl.trim(),
      sumber_nama: sumberNama.trim() === "" ? null : sumberNama.trim(),
    };
    if (mode === "pelajaran") {
      body.lesson_id = lessonId;
    } else {
      body.tanggal = tanggal;
    }
    if (jenis === "pilihan_ganda" || jenis === "benar_salah") {
      body.opsi = jenis === "benar_salah" ? ["Benar", "Salah"] : opsi;
      body.kunci = kunci;
    } else if (jenis === "pilihan_ganda_kompleks") {
      body.opsi = opsi;
      body.kunci_jamaks = kunciJamaks;
    } else if (jenis === "isian_singkat") {
      body.kunci_teks = kunciTeks;
    }
    try {
      const res = await fetch("/api/admin/akademi/soal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        soal?: { id: string; tanggal: string };
      };
      if (!res.ok || !data.ok) {
        setStatusForm("error");
        setPesanForm(data.error ?? `Gagal menyimpan (${res.status}).`);
        return;
      }
      setStatusForm("sukses");
      setPesanForm(
        `Soal berhasil dibuat untuk ${data.soal?.tanggal ?? ""}. Kunci jawaban tersimpan terpisah (tidak tampil di daftar).`,
      );
      resetSetelahSukses();
      void muatSoal();
    } catch {
      setStatusForm("error");
      setPesanForm("Gagal menyimpan (jaringan).");
    }
  }

  const butuhOpsi =
    jenis === "pilihan_ganda" || jenis === "pilihan_ganda_kompleks";
  const pelajaranTerpilih = pelajaranKuis.find((p) => p.id === lessonId);

  return (
    <>
      <section className="seksi" aria-labelledby="judul-form-soal">
        <div className="seksi-kepala">
          <h2 id="judul-form-soal">Buat Soal Kuis</h2>
          <p>
            Soal untuk pelajaran kuis Academy atau kuis harian. Kunci
            jawaban hanya dimasukkan di sini dan tersimpan terpisah —
            tidak pernah tampil di daftar soal maupun ke pengguna.
            Soal esai tidak punya kunci (dinilai manual lewat{" "}
            <Link href="/admin/akademi/esai">antrean penilaian esai</Link>).
          </p>
          <p>
            <Link href="/admin/akademi">← Kembali ke daftar kursus</Link>
          </p>
        </div>
        <article className="kartu">
          <form className="formulir" onSubmit={kirimSoal}>
            <div>
              <label htmlFor="mode-soal">Tujuan soal</label>
              <select
                id="mode-soal"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as "pelajaran" | "harian");
                  setPesanForm("");
                }}
              >
                <option value="pelajaran">Pelajaran kuis Academy</option>
                <option value="harian">Kuis harian (tanggal)</option>
              </select>
            </div>

            {mode === "pelajaran" ? (
              <>
                <div>
                  <label htmlFor="kursus-soal">Kursus</label>
                  <select
                    id="kursus-soal"
                    value={kursusId}
                    onChange={(e) => void pilihKursus(e.target.value)}
                    required
                  >
                    <option value="">— Pilih kursus —</option>
                    {daftarKursus.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.judul}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="pelajaran-soal">Pelajaran kuis</label>
                  <select
                    id="pelajaran-soal"
                    value={lessonId}
                    onChange={(e) => setLessonId(e.target.value)}
                    required
                    disabled={pelajaranKuis.length === 0}
                  >
                    <option value="">— Pilih pelajaran kuis —</option>
                    {pelajaranKuis.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.judul} ({p.kuis_tanggal})
                      </option>
                    ))}
                  </select>
                  {kursusId && pelajaranKuis.length === 0 && (
                    <p>
                      Kursus ini belum punya pelajaran kuis bertanggal —
                      tambah pelajaran jenis kuis dengan tanggal kuis dulu.
                    </p>
                  )}
                  {pelajaranTerpilih && (
                    <p>
                      Tanggal soal: {pelajaranTerpilih.kuis_tanggal} (dari
                      pelajaran).
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="tanggal-soal">Tanggal kuis harian</label>
                <input
                  id="tanggal-soal"
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  required
                />
                <p>Kuis harian hanya memakai soal pilihan ganda.</p>
              </div>
            )}

            <div>
              <label htmlFor="jenis-soal">Jenis soal</label>
              <select
                id="jenis-soal"
                value={jenis}
                onChange={(e) => {
                  const j = e.target.value;
                  setJenis(j);
                  setKunci(0);
                  setKunciJamaks([]);
                  setKunciTeks("");
                  if (j === "pilihan_ganda" || j === "pilihan_ganda_kompleks") {
                    setOpsi(["", ""]);
                  }
                }}
              >
                {Object.entries(JENIS_LABEL)
                  .filter(([nilai]) =>
                    mode === "harian" ? nilai === "pilihan_ganda" : true,
                  )
                  .map(([nilai, label]) => (
                    <option key={nilai} value={nilai}>
                      {label}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label htmlFor="pertanyaan-soal">Pertanyaan</label>
              <textarea
                id="pertanyaan-soal"
                value={pertanyaan}
                onChange={(e) => setPertanyaan(e.target.value)}
                required
                rows={3}
                placeholder="Tulis pertanyaan soal di sini"
              />
            </div>

            {butuhOpsi && (
              <div>
                <span>Opsi jawaban (2–10)</span>
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {opsi.map((o, i) => (
                    <div
                      key={i}
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <span aria-hidden="true">
                        {String.fromCharCode(65 + i)}.
                      </span>
                      <input
                        type="text"
                        value={o}
                        onChange={(e) => ubahOpsi(i, e.target.value)}
                        placeholder={`Opsi ${String.fromCharCode(65 + i)}`}
                        aria-label={`Opsi ${String.fromCharCode(65 + i)}`}
                        required
                      />
                      <button
                        className="tombol tombol-hantu"
                        type="button"
                        onClick={() => hapusOpsi(i)}
                        disabled={opsi.length <= 2}
                        aria-label={`Hapus opsi ${String.fromCharCode(65 + i)}`}
                      >
                        Hapus
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="tombol"
                  type="button"
                  onClick={tambahOpsi}
                  disabled={opsi.length >= 10}
                  style={{ marginTop: 8 }}
                >
                  Tambah opsi
                </button>
              </div>
            )}

            {jenis === "pilihan_ganda" && (
              <div>
                <label htmlFor="kunci-soal">Jawaban benar</label>
                <select
                  id="kunci-soal"
                  value={kunci}
                  onChange={(e) => setKunci(Number(e.target.value))}
                >
                  {opsi.map((o, i) => (
                    <option key={i} value={i}>
                      {String.fromCharCode(65 + i)}
                      {o ? ` — ${o}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {jenis === "benar_salah" && (
              <div>
                <label htmlFor="kunci-benar-salah">Jawaban benar</label>
                <select
                  id="kunci-benar-salah"
                  value={kunci}
                  onChange={(e) => setKunci(Number(e.target.value))}
                >
                  <option value={1}>Benar</option>
                  <option value={0}>Salah</option>
                </select>
              </div>
            )}

            {jenis === "pilihan_ganda_kompleks" && (
              <div>
                <span>Jawaban benar (pilih lebih dari satu)</span>
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {opsi.map((o, i) => (
                    <label key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={kunciJamaks.includes(i)}
                        onChange={() => alihKunciJamaks(i)}
                      />
                      {String.fromCharCode(65 + i)}
                      {o ? ` — ${o}` : ""}
                    </label>
                  ))}
                </div>
                <p>
                  Jawaban pengguna harus sama persis dengan himpunan ini
                  (tanpa kredit parsial).
                </p>
              </div>
            )}

            {jenis === "isian_singkat" && (
              <div>
                <label htmlFor="kunci-teks">Kunci jawaban (teks)</label>
                <input
                  id="kunci-teks"
                  type="text"
                  value={kunciTeks}
                  onChange={(e) => setKunciTeks(e.target.value)}
                  required
                  placeholder="Contoh: Jakarta"
                />
                <p>
                  Perbandingan mengabaikan huruf besar/kecil, spasi
                  berlebih, dan tanda baca akhir.
                </p>
              </div>
            )}

            {jenis === "esai" && (
              <p>
                Soal esai tidak punya kunci jawaban — jawaban pengguna
                dinilai manual oleh staf lewat antrean penilaian esai.
              </p>
            )}

            <div>
              <label htmlFor="penjelasan-soal">Penjelasan / pembahasan (opsional)</label>
              <textarea
                id="penjelasan-soal"
                value={penjelasan}
                onChange={(e) => setPenjelasan(e.target.value)}
                rows={2}
                placeholder="Pembahasan yang tampil sesudah pengguna menjawab"
              />
            </div>
            <div>
              <label htmlFor="sumber-url-soal">URL sumber (opsional)</label>
              <input
                id="sumber-url-soal"
                type="url"
                value={sumberUrl}
                onChange={(e) => setSumberUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
            <div>
              <label htmlFor="sumber-nama-soal">Nama sumber (opsional)</label>
              <input
                id="sumber-nama-soal"
                type="text"
                value={sumberNama}
                onChange={(e) => setSumberNama(e.target.value)}
                placeholder="Contoh: PRATA FAKTA"
              />
            </div>

            {pesanForm && (
              <p role={statusForm === "error" ? "alert" : "status"}>{pesanForm}</p>
            )}
            <button
              className="tombol tombol-primer"
              type="submit"
              disabled={
                statusForm === "loading" ||
                (mode === "pelajaran" && !lessonId) ||
                (mode === "harian" && !tanggal)
              }
            >
              {statusForm === "loading" ? "Menyimpan…" : "Buat soal"}
            </button>
          </form>
        </article>
      </section>

      <section className="seksi" aria-labelledby="judul-daftar-soal">
        <div className="seksi-kepala">
          <h2 id="judul-daftar-soal">Soal Terbaru (50 terakhir)</h2>
          <p>
            Daftar ini TIDAK menampilkan kunci jawaban — kunci hanya ada
            di tabel jawaban terpisah yang tidak bisa dibaca lewat API
            ini.
          </p>
        </div>
        {memuatSoal ? (
          <div className="kerangka" role="status" aria-label="Memuat daftar soal…" />
        ) : daftarSoal.length === 0 ? (
          <div className="kosong" role="status">
            <h3>Belum ada soal</h3>
            <p>Buat soal pertama lewat formulir di atas.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {daftarSoal.map((s) => (
              <article className="kartu" key={s.id}>
                <span className="kartu-kategori">
                  {JENIS_LABEL[s.jenis] ?? s.jenis} · {s.tanggal}
                </span>
                <span className="kartu-judul">{s.pertanyaan}</span>
                {s.opsi.length > 0 && (
                  <span className="kartu-teks">
                    {s.opsi.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("  ")}
                  </span>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
