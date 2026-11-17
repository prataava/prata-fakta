"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatTanggalJam } from "@/lib/format";

// Catatan pribadi pada satu artikel (P1-1): tambah/ubah/hapus
// catatan milik sendiri lewat /api/catatan. Hanya tampil
// penuh bila login; tamu melihat ajakan masuk (bukan form mati).
// Dipasang integrator di halaman artikel (di bawah PembacaArtikel
// / dekat JejakFakta) dan halaman pengetahuan — komponen ini
// TIDAK dipasang sendiri dari sini.
const MAKS_ISI = 2000;

type CatatanApi = {
  id: string;
  isi: string;
  dibuat_pada: string | null;
  diubah_pada: string | null;
};

export default function CatatanPribadi({
  artikelId,
  pengetahuanId,
  judulTarget,
  loggedIn,
}: {
  artikelId?: string;
  pengetahuanId?: string;
  judulTarget: string;
  loggedIn: boolean;
}) {
  const [catatan, setCatatan] = useState<CatatanApi[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [isiBaru, setIsiBaru] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const [pesan, setPesan] = useState("");
  const [galat, setGalat] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [isiEdit, setIsiEdit] = useState("");
  const [hapusId, setHapusId] = useState<string | null>(null);

  const paramTarget = artikelId
    ? `artikel_id=${encodeURIComponent(artikelId)}`
    : pengetahuanId
      ? `pengetahuan_id=${encodeURIComponent(pengetahuanId)}`
      : "";

  // Muat catatan sekali saat mount (pola PembacaArtikel: setState
  // hanya di callback promise, bukan sinkron di badan effect —
  // aturan react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!loggedIn || !paramTarget) return;
    let batal = false;
    fetch(`/api/catatan?${paramTarget}`)
      .then((res) =>
        res.json().then((data) => ({ ok: res.ok, data }) as {
          ok: boolean;
          data: { catatan?: CatatanApi[]; error?: string };
        }),
      )
      .then(({ ok, data }) => {
        if (batal) return;
        if (!ok) {
          setGalat(data.error ?? "Gagal memuat catatan.");
          return;
        }
        setCatatan(Array.isArray(data.catatan) ? data.catatan : []);
      })
      .catch(() => {
        if (!batal) setGalat("Tidak dapat terhubung ke server.");
      })
      .finally(() => {
        if (!batal) setMemuat(false);
      });
    return () => {
      batal = true;
    };
  }, [loggedIn, paramTarget]);

  if (!artikelId && !pengetahuanId) return null;

  async function tambah() {
    const isi = isiBaru.trim();
    if (isi.length < 1 || isi.length > MAKS_ISI) {
      setGalat(
        isi.length < 1
          ? "Isi catatan tidak boleh kosong."
          : `Isi catatan terlalu panjang (maksimal ${MAKS_ISI} karakter).`,
      );
      return;
    }
    setMenyimpan(true);
    setPesan("");
    setGalat("");
    try {
      const res = await fetch("/api/catatan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(artikelId ? { artikel_id: artikelId } : {}),
          ...(pengetahuanId ? { pengetahuan_id: pengetahuanId } : {}),
          isi,
        }),
      });
      const data = (await res.json()) as {
        catatan?: CatatanApi;
        error?: string;
      };
      if (!res.ok) {
        setGalat(data.error ?? "Gagal menyimpan catatan.");
        return;
      }
      if (data.catatan) setCatatan((v) => [data.catatan as CatatanApi, ...v]);
      setIsiBaru("");
      setPesan("Catatan disimpan.");
    } catch {
      setGalat("Tidak dapat terhubung ke server.");
    } finally {
      setMenyimpan(false);
    }
  }

  async function simpanEdit() {
    if (!editId) return;
    const isi = isiEdit.trim();
    if (isi.length < 1 || isi.length > MAKS_ISI) {
      setGalat("Isi catatan 1–2000 karakter.");
      return;
    }
    setMenyimpan(true);
    setPesan("");
    setGalat("");
    try {
      const res = await fetch("/api/catatan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editId, isi }),
      });
      const data = (await res.json()) as {
        catatan?: CatatanApi;
        error?: string;
      };
      if (!res.ok) {
        setGalat(data.error ?? "Gagal mengubah catatan.");
        return;
      }
      if (data.catatan) {
        setCatatan((v) =>
          v.map((c) =>
            c.id === editId ? (data.catatan as CatatanApi) : c,
          ),
        );
      }
      setEditId(null);
      setIsiEdit("");
      setPesan("Catatan diubah.");
    } catch {
      setGalat("Tidak dapat terhubung ke server.");
    } finally {
      setMenyimpan(false);
    }
  }

  async function hapus() {
    if (!hapusId) return;
    setMenyimpan(true);
    setPesan("");
    setGalat("");
    try {
      const res = await fetch("/api/catatan", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: hapusId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setGalat(data.error ?? "Gagal menghapus catatan.");
        return;
      }
      setCatatan((v) => v.filter((c) => c.id !== hapusId));
      setHapusId(null);
      setPesan("Catatan dihapus.");
    } catch {
      setGalat("Tidak dapat terhubung ke server.");
    } finally {
      setMenyimpan(false);
    }
  }

  if (!loggedIn) {
    return (
      <section className="seksi" aria-labelledby="seksi-catatan">
        <div className="seksi-kepala">
          <h2 id="seksi-catatan">Catatan pribadi</h2>
          <p>Catatan Anda untuk artikel ini — hanya Anda yang bisa melihatnya.</p>
        </div>
        <div className="kosong kosong--izin" role="status">
          <h3>Masuk untuk menulis catatan.</h3>
          <p>
            Catatan pribadi tersimpan di akun Anda dan tidak dibagikan ke
            siapa pun.
          </p>
          <Link className="tombol" href="/masuk">
            Masuk
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="seksi" aria-labelledby="seksi-catatan">
      <div className="seksi-kepala">
        <h2 id="seksi-catatan">Catatan pribadi</h2>
        <p>
          Catatan Anda untuk “{judulTarget}” — hanya Anda yang bisa
          melihatnya.
        </p>
      </div>

      <label
        htmlFor="catatan-baru"
        style={{ display: "block", fontWeight: 600, marginBottom: 6 }}
      >
        Tulis catatan baru
      </label>
      <textarea
        id="catatan-baru"
        value={isiBaru}
        maxLength={MAKS_ISI}
        rows={3}
        placeholder="Tulis hal yang ingin Anda ingat dari artikel ini…"
        onChange={(e) => setIsiBaru(e.target.value)}
        style={{ width: "100%", resize: "vertical" }}
      />
      <p style={{ color: "var(--muted)", fontSize: "0.88rem", margin: "4px 0 8px" }}>
        {isiBaru.length}/{MAKS_ISI} karakter
      </p>
      <button
        type="button"
        className="tombol tombol-primer"
        onClick={tambah}
        disabled={menyimpan || isiBaru.trim().length < 1}
      >
        {menyimpan ? "Menyimpan…" : "Simpan catatan"}
      </button>
      {pesan && (
        <p className="pesan-sukses" role="status" style={{ marginTop: 8 }}>
          {pesan}
        </p>
      )}
      {galat && (
        <p className="pesan-error" role="alert" style={{ marginTop: 8 }}>
          {galat}
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        {memuat ? (
          <p style={{ color: "var(--muted)" }}>Memuat catatan…</p>
        ) : catatan.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            Belum ada catatan untuk artikel ini.
          </p>
        ) : (
          <ul
            style={{
              display: "grid",
              gap: 8,
              listStyle: "none",
              padding: 0,
              margin: 0,
            }}
          >
            {catatan.map((c) => (
              <li key={c.id} className="kartu" style={{ margin: 0 }}>
                {editId === c.id ? (
                  <>
                    <textarea
                      value={isiEdit}
                      maxLength={MAKS_ISI}
                      rows={3}
                      aria-label="Ubah catatan"
                      onChange={(e) => setIsiEdit(e.target.value)}
                      style={{ width: "100%", resize: "vertical" }}
                    />
                    <p
                      style={{
                        color: "var(--muted)",
                        fontSize: "0.88rem",
                        margin: "4px 0 8px",
                      }}
                    >
                      {isiEdit.length}/{MAKS_ISI} karakter
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="tombol tombol-primer"
                        onClick={simpanEdit}
                        disabled={menyimpan}
                      >
                        Simpan perubahan
                      </button>
                      <button
                        type="button"
                        className="tombol tombol-hantu"
                        onClick={() => {
                          setEditId(null);
                          setIsiEdit("");
                        }}
                      >
                        Batal
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{c.isi}</p>
                    <p
                      style={{
                        color: "var(--muted)",
                        fontSize: "0.88rem",
                        margin: "6px 0 8px",
                      }}
                    >
                      Ditulis {formatTanggalJam(c.dibuat_pada)}
                      {c.diubah_pada &&
                        c.diubah_pada !== c.dibuat_pada &&
                        ` · Diubah ${formatTanggalJam(c.diubah_pada)}`}
                    </p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="tombol"
                        onClick={() => {
                          setEditId(c.id);
                          setIsiEdit(c.isi);
                        }}
                      >
                        Ubah
                      </button>
                      {hapusId === c.id ? (
                        <>
                          <button
                            type="button"
                            className="tombol tombol-primer"
                            onClick={hapus}
                            disabled={menyimpan}
                          >
                            Ya, hapus
                          </button>
                          <button
                            type="button"
                            className="tombol tombol-hantu"
                            onClick={() => setHapusId(null)}
                          >
                            Batal
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="tombol tombol-hantu"
                          onClick={() => setHapusId(c.id)}
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
