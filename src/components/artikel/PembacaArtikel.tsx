"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  PfArtikelLengkap,
  PfArtikelRingkas,
  PfVersiArtikel,
} from "@/lib/data";
import KartuArtikel from "@/components/artikel/KartuArtikel";
import PembacaSuara from "@/components/artikel/PembacaSuara";
import FormLaporan from "@/components/artikel/FormLaporan";

type ModeBaca = "1menit" | "3menit" | "mendalam";
type UkuranFont = "S" | "M" | "L";

const UKURAN_FONT: Record<UkuranFont, string> = {
  S: "1rem",
  M: "1.125rem",
  L: "1.3rem",
};

const MODE_LABEL: { nilai: ModeBaca; label: string; deskripsi: string }[] = [
  { nilai: "1menit", label: "1 Menit", deskripsi: "Ringkasan + fakta penting" },
  { nilai: "3menit", label: "3 Menit", deskripsi: "Ringkasan + isi ringkas" },
  { nilai: "mendalam", label: "Deep Reading", deskripsi: "Semua seksi lengkap" },
];

const BATAS_KATA_3MENIT = 450;

function formatTanggal(iso: string | null): string {
  if (!iso) return "Tanggal belum tersedia";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTanggalWaktu(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Paragraf isi (dipisah baris kosong). */
function paragrafIsi(isi: string | null): string[] {
  if (!isi) return [];
  return isi
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Isi dipotong sampai kira-kira N kata, dipotong di batas paragraf. */
function potongKata(paragraf: string[], batasKata: number): string[] {
  const hasil: string[] = [];
  let kata = 0;
  for (const p of paragraf) {
    const n = p.split(/\s+/).filter(Boolean).length;
    if (kata + n > batasKata && hasil.length > 0) break;
    hasil.push(p);
    kata += n;
    if (kata >= batasKata) break;
  }
  return hasil;
}

// Pembaca artikel: mode baca, ukuran font, progress, bookmark, bagikan,
// laporan kesalahan, dan pencatatan riwayat baca (sekali saat mount).
export default function PembacaArtikel({
  artikel,
  terkait,
  versi,
  loggedIn,
  bookmarkAwal,
}: {
  artikel: PfArtikelLengkap;
  terkait: PfArtikelRingkas[];
  versi: PfVersiArtikel[];
  loggedIn: boolean;
  bookmarkAwal: boolean;
}) {
  const [mode, setMode] = useState<ModeBaca>("mendalam");
  const [ukuran, setUkuran] = useState<UkuranFont>("M");
  const [progress, setProgress] = useState(0);
  const [bookmark, setBookmark] = useState(bookmarkAwal);
  const [bookmarkPesan, setBookmarkPesan] = useState("");
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [bagikanPesan, setBagikanPesan] = useState("");
  const [laporanTerbuka, setLaporanTerbuka] = useState(false);
  const riwayatTerkirim = useRef(false);

  // Progress baca dari scroll halaman.
  useEffect(() => {
    const hitung = () => {
      const el = document.documentElement;
      const total = el.scrollHeight - el.clientHeight;
      setProgress(
        total > 0
          ? Math.min(100, Math.max(0, (el.scrollTop / total) * 100))
          : 0,
      );
    };
    hitung();
    window.addEventListener("scroll", hitung, { passive: true });
    window.addEventListener("resize", hitung);
    return () => {
      window.removeEventListener("scroll", hitung);
      window.removeEventListener("resize", hitung);
    };
  }, []);

  // Catat riwayat baca sekali saat mount (hanya bila login).
  useEffect(() => {
    if (!loggedIn || riwayatTerkirim.current) return;
    riwayatTerkirim.current = true;
    fetch("/api/riwayat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artikel_id: artikel.id }),
    }).catch(() => {
      // Riwayat gagal dicatat: bukan kesalahan fatal bagi pembaca.
    });
  }, [loggedIn, artikel.id]);

  async function toggleBookmark() {
    setBookmarkLoading(true);
    setBookmarkPesan("");
    try {
      const res = await fetch("/api/bookmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artikel_id: artikel.id }),
      });
      const data = (await res.json()) as { bookmarked?: boolean; error?: string };
      if (!res.ok) {
        setBookmarkPesan(data.error ?? "Gagal mengubah bookmark.");
        return;
      }
      setBookmark(Boolean(data.bookmarked));
      setBookmarkPesan(
        data.bookmarked ? "Artikel disimpan ke bookmark." : "Bookmark dihapus.",
      );
    } catch {
      setBookmarkPesan("Tidak dapat terhubung ke server.");
    } finally {
      setBookmarkLoading(false);
    }
  }

  async function bagikan() {
    setBagikanPesan("");
    const url = window.location.href;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: artikel.judul, url });
        return;
      } catch {
        // Pengguna membatalkan berbagi: diam saja.
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setBagikanPesan("Tautan artikel disalin ke clipboard.");
    } catch {
      setBagikanPesan("Gagal menyalin tautan. Salin alamat dari bilah alamat.");
    }
  }

  const paragraf = paragrafIsi(artikel.isi);
  const paragraf3Menit = potongKata(paragraf, BATAS_KATA_3MENIT);
  const isiTerpotong = paragraf3Menit.length < paragraf.length;
  const modeAktif =
    MODE_LABEL.find((m) => m.nilai === mode) ?? MODE_LABEL[2];

  return (
    <div className="artikel-pembaca">
      <div
        className="progress-baca"
        role="progressbar"
        aria-label="Progress baca"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{ width: `${progress}%` }} />
      </div>

      <div className="artikel-alat" aria-label="Alat baca">
        <div
          className="mode-baca"
          role="group"
          aria-label="Mode baca"
        >
          {MODE_LABEL.map((m) => (
            <button
              key={m.nilai}
              type="button"
              className={mode === m.nilai ? "aktif" : ""}
              aria-pressed={mode === m.nilai}
              onClick={() => setMode(m.nilai)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="mode-baca" role="group" aria-label="Ukuran font">
          {(["S", "M", "L"] as UkuranFont[]).map((u) => (
            <button
              key={u}
              type="button"
              className={ukuran === u ? "aktif" : ""}
              aria-pressed={ukuran === u}
              aria-label={`Ukuran font ${u}`}
              onClick={() => setUkuran(u)}
            >
              {u}
            </button>
          ))}
        </div>
        <div className="artikel-aksi">
          {loggedIn ? (
            <button
              type="button"
              className="tombol"
              onClick={toggleBookmark}
              disabled={bookmarkLoading}
              aria-pressed={bookmark}
            >
              {bookmarkLoading
                ? "Menyimpan…"
                : bookmark
                  ? "★ Tersimpan"
                  : "☆ Bookmark"}
            </button>
          ) : (
            <Link className="tombol" href="/masuk">
              ☆ Bookmark
            </Link>
          )}
          <button type="button" className="tombol" onClick={bagikan}>
            Bagikan
          </button>
          <button
            type="button"
            className="tombol tombol-hantu"
            onClick={() => setLaporanTerbuka(true)}
          >
            Laporkan Kesalahan
          </button>
        </div>
        <PembacaSuara
          judul={artikel.judul}
          teks={`${artikel.ringkasan ?? ""}\n\n${artikel.isi ?? ""}`}
        />
      </div>
      {(bookmarkPesan || bagikanPesan) && (
        <p className="pesan-sukses" role="status" style={{ marginTop: 12 }}>
          {bookmarkPesan || bagikanPesan}
        </p>
      )}
      <p className="artikel-mode-info">
        Mode {modeAktif.label} — {modeAktif.deskripsi}.
      </p>

      <div
        className="artikel-isi"
        style={{ fontSize: UKURAN_FONT[ukuran], lineHeight: 1.8 }}
      >
        {artikel.ringkasan && (
          <section className="artikel-seksi" aria-labelledby="seksi-ringkasan">
            <h2 id="seksi-ringkasan">Ringkasan 30–60 detik</h2>
            <p className="artikel-ringkasan">{artikel.ringkasan}</p>
          </section>
        )}

        {mode === "1menit" && artikel.fakta_penting.length > 0 && (
          <section className="artikel-seksi" aria-labelledby="seksi-fakta-1">
            <h2 id="seksi-fakta-1">Fakta Penting</h2>
            <ul className="artikel-daftar">
              {artikel.fakta_penting.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </section>
        )}

        {mode === "3menit" && (
          <section className="artikel-seksi" aria-labelledby="seksi-isi-3">
            <h2 id="seksi-isi-3">Isi Artikel</h2>
            {paragraf3Menit.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {isiTerpotong && (
              <div className="artikel-ajakan">
                <p>
                  Ini baru sebagian artikel. Lanjutkan ke Deep Reading untuk
                  membaca isi lengkap beserta kronologi, data pendukung, dan
                  sumber.
                </p>
                <button
                  type="button"
                  className="tombol tombol-primer"
                  onClick={() => setMode("mendalam")}
                >
                  Lanjutkan ke Deep Reading
                </button>
              </div>
            )}
          </section>
        )}

        {mode === "mendalam" && (
          <>
            {paragraf.length > 0 && (
              <section className="artikel-seksi" aria-labelledby="seksi-isi">
                <h2 id="seksi-isi">Isi Artikel</h2>
                {paragraf.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </section>
            )}

            {artikel.kronologi.length > 0 && (
              <section className="artikel-seksi" aria-labelledby="seksi-kronologi">
                <h2 id="seksi-kronologi">Kronologi</h2>
                <ol className="artikel-kronologi">
                  {artikel.kronologi.map((k, i) => (
                    <li key={i}>
                      <strong>{k.tanggal}</strong> — {k.peristiwa}
                      {k.sumber && (
                        <span className="artikel-kronologi-sumber">
                          {" "}
                          (Sumber: {k.sumber})
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {artikel.fakta_penting.length > 0 && (
              <section className="artikel-seksi" aria-labelledby="seksi-fakta">
                <h2 id="seksi-fakta">Fakta Penting</h2>
                <ul className="artikel-daftar">
                  {artikel.fakta_penting.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </section>
            )}

            {artikel.data_pendukung.length > 0 && (
              <section className="artikel-seksi" aria-labelledby="seksi-data">
                <h2 id="seksi-data">Data Pendukung</h2>
                <div className="tabel-gulir">
                  <table className="tabel-data">
                    <thead>
                      <tr>
                        <th>Label</th>
                        <th>Nilai</th>
                        <th>Satuan</th>
                        <th>Sumber</th>
                        <th>Tanggal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {artikel.data_pendukung.map((d, i) => (
                        <tr key={i}>
                          <td>{d.label}</td>
                          <td>{d.nilai}</td>
                          <td>{d.satuan}</td>
                          <td>{d.sumber}</td>
                          <td>{d.tanggal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {artikel.mengapa_penting && (
              <section className="artikel-seksi" aria-labelledby="seksi-penting">
                <h2 id="seksi-penting">Mengapa Ini Penting</h2>
                <p>{artikel.mengapa_penting}</p>
              </section>
            )}

            {artikel.dampak && (
              <section className="artikel-seksi" aria-labelledby="seksi-dampak">
                <h2 id="seksi-dampak">Dampak</h2>
                <p>{artikel.dampak}</p>
              </section>
            )}

            {artikel.belum_diketahui && (
              <section className="artikel-seksi" aria-labelledby="seksi-belum">
                <h2 id="seksi-belum">Hal yang Belum Diketahui</h2>
                <p>{artikel.belum_diketahui}</p>
              </section>
            )}

            {artikel.sumber_list.length > 0 && (
              <section className="artikel-seksi" aria-labelledby="seksi-sumber">
                <h2 id="seksi-sumber">Sumber &amp; Referensi</h2>
                <ul className="artikel-daftar">
                  {artikel.sumber_list.map((s, i) => (
                    <li key={i}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.nama}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="artikel-seksi" aria-labelledby="seksi-riwayat">
              <h2 id="seksi-riwayat">Riwayat Pembaruan</h2>
              <p className="artikel-meta-kecil">
                Dibuat: {formatTanggalWaktu(artikel.dibuat_pada)}
                {" · "}
                Terakhir diperbarui: {formatTanggalWaktu(artikel.diperbarui_pada)}
              </p>
              {versi.length > 0 ? (
                <ol className="artikel-kronologi">
                  {versi.map((v) => (
                    <li key={v.versi}>
                      <strong>Versi {v.versi}</strong>
                      {v.judul ? ` — ${v.judul}` : ""} ·{" "}
                      {formatTanggal(v.dibuat_pada)}
                      {v.catatan ? ` — ${v.catatan}` : ""}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="artikel-meta-kecil">
                  Belum ada riwayat versi tercatat untuk artikel ini.
                </p>
              )}
            </section>
          </>
        )}
      </div>

      {terkait.length > 0 && (
        <section className="seksi" aria-labelledby="seksi-terkait">
          <div className="seksi-kepala">
            <h2 id="seksi-terkait">Berita Terkait</h2>
            <Link href="/arsip">Lihat arsip</Link>
          </div>
          <div className="grid-berita">
            {terkait.map((a) => (
              <KartuArtikel key={a.id} artikel={a} />
            ))}
          </div>
        </section>
      )}

      {laporanTerbuka && (
        <FormLaporan
          artikelId={artikel.id}
          judulArtikel={artikel.judul}
          onTutup={() => setLaporanTerbuka(false)}
        />
      )}
    </div>
  );
}
