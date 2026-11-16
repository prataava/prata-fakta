// Admin Tanya — antrean pertanyaan (staf).
// Client component: memuat /api/admin/tanya lalu menjawab lewat
// PATCH /api/admin/tanya/[id]. Jawaban WAJIB menunjuk referensi
// yang sudah ada (API menolak jawaban tanpa referensi); bila
// tidak ada data, staf menekan "Tolak" → status tidak_ada_data.
// Dijawab Muse/editor — tanpa jawaban otomatis instan.
"use client";

import { useEffect, useState } from "react";
import EmptyState from "@/components/EmptyState";

type Referensi = { judul: string | null; url: string | null };

type Pertanyaan = {
  id: string;
  pertanyaan: string;
  jawaban: string | null;
  referensi: Referensi[];
  status: string;
  kategori: string | null;
  publik: boolean;
  membantu: number;
  dibuat_pada: string | null;
  jawaban_draf: string | null;
  referensi_draf: Referensi[];
  draf_dibuat_pada: string | null;
};

const KATEGORI = ["umum", "ekonomi", "dunia", "indonesia", "sains", "teknologi"];

const LABEL_STATUS: Record<string, string> = {
  menunggu: "Menunggu",
  tidak_ada_data: "Tidak ada data",
  terjawab: "Terjawab",
};

function formatTanggal(waktu: string | null): string {
  if (!waktu) return "—";
  const d = new Date(waktu);
  if (Number.isNaN(d.getTime())) return waktu;
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export default function AdminTanya() {
  const [daftar, setDaftar] = useState<Pertanyaan[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [filter, setFilter] = useState("semua");
  const [jawaban, setJawaban] = useState<Record<string, string>>({});
  // Draf jawaban dari job /api/tanya/draf (B2-E, F1): editor bisa
  // menyunting, menyetujui (menjadi jawaban resmi), atau menolak.
  // Draf TIDAK PERNAH terbit sendiri.
  const [draf, setDraf] = useState<Record<string, string>>({});
  const [refJudul, setRefJudul] = useState<Record<string, string>>({});
  const [refUrl, setRefUrl] = useState<Record<string, string>>({});
  const [kategori, setKategori] = useState<Record<string, string>>({});
  const [publik, setPublik] = useState<Record<string, boolean>>({});
  const [pesan, setPesan] = useState<Record<string, string>>({});
  const [sibuk, setSibuk] = useState(false);

  // Muat awal mengikuti pola TabelPengguna (lihat /admin/akademi):
  // fetch di dalam effect dengan .then() — setState berjalan di
  // callback asinkron, bukan sinkron di badan effect (dilarang lint
  // react-hooks/set-state-in-effect).
  useEffect(() => {
    let batal = false;
    fetch(`/api/admin/tanya?status=${filter}`)
      .then(async (res) => {
        const data = (await res.json()) as {
          ok: boolean;
          pertanyaan?: Pertanyaan[];
          error?: string;
        };
        if (batal) return;
        if (!res.ok || !data.ok) {
          setGalat(data.error ?? "Antrean belum bisa dimuat.");
          setDaftar([]);
          return;
        }
        setDaftar(data.pertanyaan ?? []);
      })
      .catch(() => {
        if (!batal) {
          setGalat("Antrean belum bisa dimuat. Periksa koneksi lalu coba lagi.");
          setDaftar([]);
        }
      });
    return () => {
      batal = true;
    };
  }, [filter]);

  async function kirimPatch(id: string, body: Record<string, unknown>) {
    setSibuk(true);
    setPesan((p) => ({ ...p, [id]: "Mengirim…" }));
    try {
      const res = await fetch(`/api/admin/tanya/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok: boolean;
        pertanyaan?: Pertanyaan;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.pertanyaan) {
        setPesan((p) => ({ ...p, [id]: data.error ?? "Gagal menyimpan." }));
        return;
      }
      setDaftar((lama) =>
        (lama ?? []).map((q) => (q.id === id ? data.pertanyaan! : q)),
      );
      setPesan((p) => ({ ...p, [id]: "Tersimpan." }));
    } catch {
      setPesan((p) => ({ ...p, [id]: "Gagal menyimpan. Coba lagi." }));
    } finally {
      setSibuk(false);
    }
  }

  function jawab(id: string) {
    const j = (jawaban[id] ?? "").trim();
    if (!j) {
      setPesan((p) => ({ ...p, [id]: "Jawaban wajib diisi." }));
      return;
    }
    const body: Record<string, unknown> = { jawaban: j };
    const rj = (refJudul[id] ?? "").trim();
    if (rj) {
      body.referensi = [{ judul: rj, url: (refUrl[id] ?? "").trim() || null }];
    }
    const k = kategori[id];
    if (k) body.kategori = k;
    if (publik[id] !== undefined) body.publik = publik[id];
    void kirimPatch(id, body);
  }

  function simpanPenanda(id: string) {
    const body: Record<string, unknown> = {};
    const k = kategori[id];
    if (k) body.kategori = k;
    if (publik[id] !== undefined) body.publik = publik[id];
    if (Object.keys(body).length === 0) {
      setPesan((p) => ({ ...p, [id]: "Ubah kategori / publik dulu." }));
      return;
    }
    void kirimPatch(id, body);
  }

  function tolak(id: string) {
    void kirimPatch(id, { status: "tidak_ada_data" });
  }

  function setujuiDraf(id: string) {
    void kirimPatch(id, { aksi_draf: "setujui" });
  }

  function tolakDraf(id: string) {
    void kirimPatch(id, { aksi_draf: "tolak" });
  }

  function simpanEditDraf(id: string) {
    const d = (draf[id] ?? "").trim();
    if (!d) {
      setPesan((p) => ({ ...p, [id]: "Draf kosong — isi draf atau tekan Tolak draf." }));
      return;
    }
    void kirimPatch(id, { jawaban_draf: d });
  }

  return (
    <section className="seksi" aria-labelledby="judul-admin-tanya">
      <div className="seksi-kepala">
        <h2 id="judul-admin-tanya">Antrean Tanya</h2>
        <p>
          Pertanyaan pembaca yang belum terjawab. Jawab dengan referensi
          yang sudah ada di PRATA FAKTA — jangan mengarang. Bila tidak
          ada data yang bisa menjawab, tolak sebagai tidak_ada_data.
          Dijawab Muse/editor — tanpa jawaban otomatis instan. Draf
          dari job terjadwal hanya usulan: draf TIDAK PERNAH menjadi
          jawaban resmi sebelum editor menekan &quot;Setujui draf&quot;.
        </p>
      </div>

      <div className="chip-baris" role="group" aria-label="Filter status">
        {["semua", "menunggu", "tidak_ada_data", "terjawab"].map((s) => (
          <button
            key={s}
            type="button"
            className={`chip${filter === s ? " aktif" : ""}`}
            onClick={() => setFilter(s)}
          >
            {s === "semua" ? "Semua" : (LABEL_STATUS[s] ?? s)}
          </button>
        ))}
      </div>

      {daftar === null ? (
        <p role="status">Memuat antrean…</p>
      ) : daftar.length === 0 ? (
        <EmptyState
          judul="Antrean kosong."
          pesan={galat ?? "Tidak ada pertanyaan pada filter ini."}
        />
      ) : (
        <div className="grid-berita">
          {daftar.map((q) => (
            <article className="kartu" key={q.id}>
              <span className="kartu-kategori">
                {LABEL_STATUS[q.status] ?? q.status}
                {q.kategori ? ` · ${q.kategori}` : ""}
                {q.publik ? " · Publik" : " · Tidak publik"}
              </span>
              <span className="kartu-judul">{q.pertanyaan}</span>
              {q.jawaban && <span className="kartu-teks">{q.jawaban}</span>}
              {q.jawaban_draf && (
                <span className="kartu-teks">
                  <strong>DRAF (menunggu review — bukan jawaban resmi):</strong>{" "}
                  {q.jawaban_draf}
                  {q.referensi_draf && q.referensi_draf.length > 0 && (
                    <>
                      {" "}
                      Referensi draf:{" "}
                      {q.referensi_draf.map((r, i) => (
                        <span key={`${r.url ?? r.judul ?? i}-${i}`}>
                          {i > 0 ? " · " : ""}
                          {r.url ? <a href={r.url}>{r.judul ?? r.url}</a> : (r.judul ?? "Referensi")}
                        </span>
                      ))}
                    </>
                  )}
                  {q.draf_dibuat_pada && <> (dibuat {formatTanggal(q.draf_dibuat_pada)})</>}
                </span>
              )}
              {q.referensi.length > 0 && (
                <span className="kartu-teks">
                  Referensi:{" "}
                  {q.referensi.map((r, i) => (
                    <span key={`${r.url ?? r.judul ?? i}-${i}`}>
                      {i > 0 ? " · " : ""}
                      {r.url ? <a href={r.url}>{r.judul ?? r.url}</a> : (r.judul ?? "Referensi")}
                    </span>
                  ))}
                </span>
              )}
              <span className="kartu-meta">
                {formatTanggal(q.dibuat_pada)} · {q.membantu} membantu
              </span>
              <form
                className="formulir"
                onSubmit={(e) => {
                  e.preventDefault();
                  jawab(q.id);
                }}
              >
                <label>
                  Jawaban (wajib menunjuk referensi)
                  <textarea
                    value={jawaban[q.id] ?? q.jawaban ?? ""}
                    onChange={(e) =>
                      setJawaban((v) => ({ ...v, [q.id]: e.target.value }))
                    }
                    rows={3}
                    maxLength={2000}
                    placeholder="Tulis jawaban berdasarkan referensi di bawah…"
                  />
                </label>
                <label>
                  Judul referensi (isi bila pertanyaan belum punya referensi)
                  <input
                    type="text"
                    value={refJudul[q.id] ?? ""}
                    onChange={(e) =>
                      setRefJudul((v) => ({ ...v, [q.id]: e.target.value }))
                    }
                    placeholder="Contoh: Populasi Indonesia"
                  />
                </label>
                <label>
                  Tautan referensi (boleh kosong bila tanpa halaman khusus)
                  <input
                    type="text"
                    value={refUrl[q.id] ?? ""}
                    onChange={(e) =>
                      setRefUrl((v) => ({ ...v, [q.id]: e.target.value }))
                    }
                    placeholder="/data atau /artikel/…"
                  />
                </label>
                <label>
                  Kategori
                  <select
                    value={kategori[q.id] ?? q.kategori ?? "umum"}
                    onChange={(e) =>
                      setKategori((v) => ({ ...v, [q.id]: e.target.value }))
                    }
                  >
                    {KATEGORI.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={publik[q.id] ?? q.publik}
                    onChange={(e) =>
                      setPublik((v) => ({ ...v, [q.id]: e.target.checked }))
                    }
                  />{" "}
                  Tampilkan di arsip publik
                </label>
                <span>
                  <button
                    type="submit"
                    className="tombol tombol-primer"
                    disabled={sibuk}
                  >
                    Simpan jawaban
                  </button>{" "}
                  {q.jawaban_draf && q.status === "menunggu" && (
                    <>
                      <button
                        type="button"
                        className="tombol tombol-primer"
                        disabled={sibuk}
                        onClick={() => setujuiDraf(q.id)}
                      >
                        Setujui draf
                      </button>{" "}
                      <button
                        type="button"
                        className="tombol"
                        disabled={sibuk}
                        onClick={() => tolakDraf(q.id)}
                      >
                        Tolak draf
                      </button>{" "}
                    </>
                  )}
                  <button
                    type="button"
                    className="tombol"
                    disabled={sibuk}
                    onClick={() => simpanPenanda(q.id)}
                  >
                    Simpan kategori/publik
                  </button>{" "}
                  <button
                    type="button"
                    className="tombol"
                    disabled={sibuk}
                    onClick={() => tolak(q.id)}
                  >
                    Tolak (tidak ada data)
                  </button>
                </span>
                {q.jawaban_draf && q.status === "menunggu" && (
                  <label>
                    Edit draf (tetap draf — tidak mempublikasikan)
                    <textarea
                      value={draf[q.id] ?? q.jawaban_draf ?? ""}
                      onChange={(e) =>
                        setDraf((v) => ({ ...v, [q.id]: e.target.value }))
                      }
                      rows={3}
                      maxLength={2000}
                      placeholder="Sunting draf sebelum disetujui…"
                    />
                    <span>
                      <button
                        type="button"
                        className="tombol"
                        disabled={sibuk}
                        onClick={() => simpanEditDraf(q.id)}
                      >
                        Simpan edit draf
                      </button>
                    </span>
                  </label>
                )}
                {pesan[q.id] && (
                  <span className="kartu-meta" role="status">
                    {pesan[q.id]}
                  </span>
                )}
              </form>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
