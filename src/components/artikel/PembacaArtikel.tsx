"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  PfArtikelLengkap,
  PfArtikelRingkas,
  PfVersiArtikel,
} from "@/lib/data";
import KartuArtikel from "@/components/artikel/KartuArtikel";
// Pembaca suara + formulir laporan baru dipakai sesudah interaksi
// (tombol "Dengarkan" / "Laporkan Kesalahan") — dimuat malas
// (Fase 7) agar tidak membebani First Load halaman artikel.
import dynamic from "next/dynamic";
import gaya from "./PembacaArtikel.module.css";
import {
  bacaPreferensiBacaTamu,
  kirimPreferensiBaca,
  simpanPreferensiBacaTamu,
  terapkanKepadatan,
  type Kepadatan,
  type PreferensiBaca,
} from "@/lib/preferensi-baca";

const PembacaSuara = dynamic(
  () => import("@/components/artikel/PembacaSuara"),
  { loading: () => <p>Memuat pemutar suara…</p> },
);
const FormLaporan = dynamic(
  () => import("@/components/artikel/FormLaporan"),
  { loading: () => <p>Memuat formulir laporan…</p> },
);

export type ModeBaca = "1menit" | "3menit" | "mendalam";
export type UkuranFont = "S" | "M" | "L";

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

/** Pecah teks jadi kalimat (aman terhadap titik desimal "Rp 16.500"). */
function pecahKalimatArtikel(teks: string): string[] {
  const hasil: string[] = [];
  let awal = 0;
  const pola = /[.!?]+["”']?/g;
  let cocok: RegExpExecArray | null;
  while ((cocok = pola.exec(teks)) !== null) {
    const akhirTanda = cocok.index + cocok[0].length;
    const sebelum = teks[cocok.index - 1];
    const sesudah = teks[akhirTanda];
    if (
      cocok[0].startsWith(".") &&
      /\d/.test(sebelum ?? "") &&
      /\d/.test(sesudah ?? "")
    ) {
      continue;
    }
    const kalimat = teks
      .slice(awal, akhirTanda)
      .replace(/\s+/g, " ")
      .trim();
    if (kalimat) hasil.push(kalimat);
    awal = akhirTanda;
  }
  const sisa = teks.slice(awal).replace(/\s+/g, " ").trim();
  if (sisa) hasil.push(sisa);
  return hasil;
}

const MAKS_KALIMAT_SEDERHANA = 5;

/**
 * "Jelaskan sederhana" — EKSTRAKTIF murni: memilih kalimat-kalimat yang
 * sudah ada di artikel (verbatim, tanpa mengubah satu kata pun), bukan
 * parafrase/generatif. Dipilih: kalimat pembuka + kalimat yang memuat
 * kata kunci judul. summarization.ts memang ekstraktif, tapi hanya
 * mengambil kalimat awal ringkasan/isi_ringkas (maks 450 karakter) —
 * tidak mendukung pemilihan berbasis kata kunci dari isi penuh,
 * jadi pemilih ini ditulis lokal di komponen.
 */
function pilihKalimatSederhana(
  judul: string,
  ringkasan: string | null,
  isi: string | null,
): string[] {
  const kalimat = pecahKalimatArtikel(
    [ringkasan ?? "", isi ?? ""].filter(Boolean).join(" "),
  );
  if (kalimat.length === 0) return [];
  const kataKunci = Array.from(
    new Set(
      judul
        .toLowerCase()
        .replace(/[^a-z0-9\u00c0-\u024f\s]/g, " ")
        .split(/\s+/)
        .filter((k) => k.length >= 4),
    ),
  );
  const skor = kalimat.map((k, i) => {
    const bawah = k.toLowerCase();
    let nilai = i < 3 ? 1 : 0; // kalimat pembuka diutamakan
    for (const kata of kataKunci) {
      if (bawah.includes(kata)) nilai += 2;
    }
    return { k, i, nilai };
  });
  // Selalu sertakan kalimat pertama, lalu skor tertinggi.
  const terpilih = new Set<number>([0]);
  [...skor]
    .sort((a, b) => b.nilai - a.nilai || a.i - b.i)
    .slice(0, MAKS_KALIMAT_SEDERHANA)
    .forEach((s) => terpilih.add(s.i));
  return [...terpilih].sort((a, b) => a - b).map((i) => kalimat[i]);
}

// Pembaca artikel: mode baca, ukuran font, progress, bookmark, bagikan,
// laporan kesalahan, mode fokus, penjelasan sederhana (ekstraktif),
// dan pencatatan riwayat baca persisten (durasi + selesai, throttle
// 30 detik; dikirim saat mencapai akhir artikel dan saat dilepas).
// Preferensi baca (P3-2): nilai awal dari server lewat props
// `preferensiAwal` (halaman artikel, tanpa fetch baru dari klien);
// tamu memakai localStorage (pf-preferensi-baca). Perubahan
// ditulis via PATCH /api/saya/preferensi (debounce 800 md —
// bukan tiap ketik) bila login, atau ke localStorage bila tamu.
// Saat login, preferensi akun menang atas localStorage.
export default function PembacaArtikel({
  artikel,
  terkait,
  versi,
  loggedIn,
  bookmarkAwal,
  preferensiAwal,
}: {
  artikel: PfArtikelLengkap;
  terkait: PfArtikelRingkas[];
  versi: PfVersiArtikel[];
  loggedIn: boolean;
  bookmarkAwal: boolean;
  preferensiAwal?: PreferensiBaca;
}) {
  // Default mode baca = "3menit" (v27, jawaban F.2 #4 berbasis
  // kode): sama dengan DEFAULT_PREFERENSI_BACA.mode_baca
  // (src/lib/preferensi-baca.ts) + fallback dariBarisPreferensiBaca.
  // Sebelumnya "mendalam" — tamu melihat semua seksi lengkap di
  // render pertama, lalu berpindah ke "3menit" begitu preferensi
  // termuat; login tanpa baris preferensi langsung "3menit".
  // Perilaku lama "disengaja sementara" (P3-2); disamakan kini
  // karena tidak ada alasan produk yang membedakannya.
  const [mode, setMode] = useState<ModeBaca>(
    preferensiAwal?.mode_baca ?? "3menit",
  );
  const [ukuran, setUkuran] = useState<UkuranFont>(
    preferensiAwal?.ukuran_font ?? "M",
  );
  const [kepadatan, setKepadatan] = useState<Kepadatan>(
    preferensiAwal?.kepadatan ?? "nyaman",
  );
  const [progress, setProgress] = useState(0);
  const [bookmark, setBookmark] = useState(bookmarkAwal);
  const [bookmarkPesan, setBookmarkPesan] = useState("");
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [bagikanPesan, setBagikanPesan] = useState("");
  const [laporanTerbuka, setLaporanTerbuka] = useState(false);
  const [modeFokus, setModeFokus] = useState(false);
  const [selesaiBaca, setSelesaiBaca] = useState(false);
  const [sederhanaTerbuka, setSederhanaTerbuka] = useState(false);
  // Waktu dibaca dihitung dari ref (Date.now hanya di effect/handler,
  // tidak pernah di render — aturan cacheComponents/Next.js 16).
  const mulaiBacaRef = useRef<number | null>(null);
  const terakhirKirimRef = useRef(0);
  const selesaiRef = useRef(false);
  const timerPreferensiRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Simpan preferensi baca: PATCH (debounce 800 md) bila login,
  // localStorage langsung bila tamu. Gagal simpan diam-diam —
  // preferensi sesi ini tetap berlaku; bukan error pengguna.
  function simpanPreferensi(perubahan: Partial<PreferensiBaca>) {
    if (!loggedIn) {
      simpanPreferensiBacaTamu(perubahan);
      return;
    }
    if (timerPreferensiRef.current !== null) {
      clearTimeout(timerPreferensiRef.current);
    }
    timerPreferensiRef.current = setTimeout(() => {
      timerPreferensiRef.current = null;
      void kirimPreferensiBaca(perubahan);
    }, 800);
  }

  function ubahMode(nilai: ModeBaca) {
    setMode(nilai);
    simpanPreferensi({ mode_baca: nilai });
  }

  function ubahUkuran(nilai: UkuranFont) {
    setUkuran(nilai);
    simpanPreferensi({ ukuran_font: nilai });
  }

  // Tamu: muat preferensi localStorage saat mount (server menang
  // bila login — props sudah berisi preferensi akun). Kepadatan
  // diterapkan ke <body> agar daftar di halaman ini ikut rapat.
  // Disable lint set-state-in-effect sengaja: localStorage hanya
  // ada di klien, jadi nilai tamu TIDAK BISA jadi state awal
  // (SSR) — harus dikoreksi sesudah mount, tanpa mismatch.
  useEffect(() => {
    if (loggedIn) return;
    const tamu = bacaPreferensiBacaTamu();
    if (!tamu) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- koreksi mount (lihat komentar di atas)
    if (tamu.mode_baca) setMode(tamu.mode_baca);
    if (tamu.ukuran_font) setUkuran(tamu.ukuran_font);
    if (tamu.kepadatan) setKepadatan(tamu.kepadatan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    terapkanKepadatan(kepadatan);
  }, [kepadatan]);

  function hitungDurasiBaca(): number {
    if (mulaiBacaRef.current === null) return 0;
    return Math.max(0, Math.floor((Date.now() - mulaiBacaRef.current) / 1000));
  }

  // Kirim progres ke /api/riwayat. Throttle 30 detik untuk kiriman
  // durasi biasa; kiriman "selesai" selalu lolos (paksa). Diam-diam
  // bila belum login / 401 / jaringan gagal — bukan error pengguna.
  // Tidak mengirim bila durasi 0 (kecuali penanda selesai).
  function kirimRiwayat(selesai: boolean, paksa = false) {
    if (!loggedIn) return;
    const durasi = hitungDurasiBaca();
    if (durasi <= 0 && !selesai) return;
    const sekarang = Date.now();
    if (!paksa && sekarang - terakhirKirimRef.current < 30_000) return;
    terakhirKirimRef.current = sekarang;
    fetch("/api/riwayat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artikel_id: artikel.id,
        durasi_detik: durasi,
        selesai,
      }),
      // Tetap terkirim saat komponen dilepas (navigasi/tutup halaman).
      keepalive: true,
    }).catch(() => {
      // Riwayat gagal dicatat: bukan kesalahan fatal bagi pembaca.
    });
  }

  function tandaiSelesaiBaca() {
    if (selesaiRef.current) return;
    selesaiRef.current = true;
    setSelesaiBaca(true);
    kirimRiwayat(true, true);
  }

  // Progress baca dari scroll halaman; capai ~90% = selesai dibaca.
  useEffect(() => {
    const hitung = () => {
      const el = document.documentElement;
      const total = el.scrollHeight - el.clientHeight;
      const persen =
        total > 0
          ? Math.min(100, Math.max(0, (el.scrollTop / total) * 100))
          : 0;
      setProgress(persen);
      if (persen >= 90) tandaiSelesaiBaca();
    };
    hitung();
    window.addEventListener("scroll", hitung, { passive: true });
    window.addEventListener("resize", hitung);
    return () => {
      window.removeEventListener("scroll", hitung);
      window.removeEventListener("resize", hitung);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Status baca awal (lencana "Sudah dibaca") + kirim progres saat
  // komponen dilepas. Halaman artikel tidak diubah (di luar cakupan
  // berkas P0-E): status diambil lewat GET /api/riwayat.
  useEffect(() => {
    if (mulaiBacaRef.current === null) mulaiBacaRef.current = Date.now();
    if (!loggedIn) return;
    let batal = false;
    fetch(`/api/riwayat?artikel_id=${encodeURIComponent(artikel.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { selesai?: boolean } | null) => {
        if (batal || !data) return;
        if (data.selesai === true) {
          selesaiRef.current = true;
          setSelesaiBaca(true);
        }
      })
      .catch(() => {
        // Status gagal dibaca: tampil sebagai belum selesai, diam-diam.
      });
    return () => {
      batal = true;
      // Unmount (termasuk route disembunyikan Activity): kirim durasi
      // terakhir; selesai ikut bila sudah tercapai.
      kirimRiwayat(selesaiRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, artikel.id]);

  // Mode fokus: atribut pada <body> (aturan CSS di modul komponen);
  // Esc keluar; atribut selalu dibersihkan saat efek berakhir.
  useEffect(() => {
    if (!modeFokus) {
      document.body.removeAttribute("data-mode-fokus");
      return;
    }
    document.body.setAttribute("data-mode-fokus", "aktif");
    const keluarEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModeFokus(false);
    };
    window.addEventListener("keydown", keluarEsc);
    return () => {
      window.removeEventListener("keydown", keluarEsc);
      document.body.removeAttribute("data-mode-fokus");
    };
  }, [modeFokus]);

  const kalimatSederhana = sederhanaTerbuka
    ? pilihKalimatSederhana(artikel.judul, artikel.ringkasan, artikel.isi)
    : [];

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
              onClick={() => ubahMode(m.nilai)}
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
              onClick={() => ubahUkuran(u)}
            >
              {u}
            </button>
          ))}
        </div>
        <div className="artikel-aksi">
          {selesaiBaca && (
            <span className={gaya.lencanaSelesai} role="status">
              ✓ Sudah dibaca
            </span>
          )}
          <button
            type="button"
            className={`tombol ${gaya.tombolBaca}`}
            aria-pressed={modeFokus}
            onClick={() => setModeFokus((v) => !v)}
          >
            {modeFokus ? "Keluar mode fokus" : "Mode fokus"}
          </button>
          <button
            type="button"
            className={`tombol ${gaya.tombolBaca}`}
            aria-pressed={sederhanaTerbuka}
            aria-expanded={sederhanaTerbuka}
            aria-controls="seksi-sederhana"
            onClick={() => setSederhanaTerbuka((v) => !v)}
          >
            {sederhanaTerbuka ? "Tutup penjelasan" : "Jelaskan sederhana"}
          </button>
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
      {sederhanaTerbuka && (
        <div
          className={gaya.panelSederhana}
          id="seksi-sederhana"
          aria-label="Penjelasan sederhana"
        >
          <h3>Penjelasan sederhana</h3>
          <p className={gaya.labelJujur}>
            Ringkasan ekstraktif — kalimat diambil dari artikel ini, bukan
            ditulis ulang.
          </p>
          {kalimatSederhana.length === 0 ? (
            <p>Artikel ini belum punya kalimat yang bisa diringkas.</p>
          ) : (
            kalimatSederhana.map((k, i) => (
              <blockquote key={i}>{k}</blockquote>
            ))
          )}
        </div>
      )}
      <p className="artikel-mode-info">
        Mode {modeAktif.label} — {modeAktif.deskripsi}.
      </p>
      {!loggedIn && (
        <p className="artikel-meta-kecil" role="note">
          Preferensi baca Anda tersimpan hanya di perangkat ini. Masuk
          untuk menyinkronkannya ke semua perangkat.
        </p>
      )}

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
                  onClick={() => ubahMode("mendalam")}
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

      {modeFokus && (
        <button
          type="button"
          id="tombol-keluar-fokus"
          className={gaya.tombolKeluarFokus}
          onClick={() => setModeFokus(false)}
        >
          ✕ Keluar mode fokus (Esc)
        </button>
      )}
    </div>
  );
}
