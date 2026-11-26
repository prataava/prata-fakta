// Saran pencarian (Worker C — P0 Ekspansi V3): dropdown saran di
// bawah input SearchBar + pustaka bersama riwayat pencarian
// (localStorage perangkat-lokal) + hook fetch saran yang dipakai
// juga oleh CommandPalette. Tanpa data dummy: bila endpoint
// /api/cari/saran belum ada / gagal / kosong, dropdown tidak
// tampil dan form GET biasa tetap berfungsi.
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gaya from "./SaranPencarian.module.css";

export type SaranCari = {
  teks: string;
  jenis: string;
  url: string;
};

/** Kunci riwayat pencarian di localStorage (perangkat-lokal). */
export const KUNCI_RIWAYAT_CARI = "pf-riwayat-cari";
export const MAKS_RIWAYAT_CARI = 8;

/** Baca riwayat pencarian (array teks, terbaru dulu). Gagal baca = []. */
export function bacaRiwayatCari(): string[] {
  try {
    const mentah = window.localStorage.getItem(KUNCI_RIWAYAT_CARI);
    if (!mentah) return [];
    const parsed: unknown = JSON.parse(mentah);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string =>
        typeof item === "string" && item.trim().length > 0,
    );
  } catch {
    return [];
  }
}

function tulisRiwayatCari(daftar: string[]): void {
  try {
    window.localStorage.setItem(
      KUNCI_RIWAYAT_CARI,
      JSON.stringify(daftar.slice(0, MAKS_RIWAYAT_CARI)),
    );
  } catch {
    // localStorage penuh / tidak tersedia: riwayat dilewati diam-diam.
  }
}

/** Simpan teks ke puncak riwayat (deduplikasi, maks 8). Kembalikan daftar baru. */
export function simpanRiwayatCari(teks: string): string[] {
  const bersih = teks.trim();
  if (bersih.length === 0) return bacaRiwayatCari();
  const daftar = bacaRiwayatCari().filter((item) => item !== bersih);
  daftar.unshift(bersih);
  const potong = daftar.slice(0, MAKS_RIWAYAT_CARI);
  tulisRiwayatCari(potong);
  return potong;
}

/** Hapus satu entri riwayat. Kembalikan daftar baru. */
export function hapusEntriRiwayatCari(teks: string): string[] {
  const daftar = bacaRiwayatCari().filter((item) => item !== teks);
  tulisRiwayatCari(daftar);
  return daftar;
}

/** Hapus seluruh riwayat pencarian. */
export function hapusSemuaRiwayatCari(): void {
  try {
    window.localStorage.removeItem(KUNCI_RIWAYAT_CARI);
  } catch {
    // Abaikan: tidak ada riwayat yang bisa dihapus.
  }
}

/** Normalisasi satu butir respons /api/cari/saran; null bila tak valid. */
function normalisasiSaran(item: unknown): SaranCari | null {
  if (typeof item !== "object" || item === null) return null;
  const data = item as Record<string, unknown>;
  if (typeof data.teks !== "string" || data.teks.trim().length === 0) {
    return null;
  }
  const teks = data.teks.trim();
  return {
    teks,
    jenis: typeof data.jenis === "string" ? data.jenis : "",
    url:
      typeof data.url === "string" && data.url.length > 0
        ? data.url
        : `/cari?q=${encodeURIComponent(teks)}`,
  };
}

/** Fetch saran dari /api/cari/saran dengan debounce ±200 ms dan
 *  pembatalan fetch basi (AbortController). Respons kosong / gagal
 *  = daftar kosong (dropdown tidak tampil), bukan error. */
export function useSaranCari(nilai: string): {
  saran: SaranCari[];
  memuat: boolean;
} {
  const [saran, setSaran] = useState<SaranCari[]>([]);
  const [memuat, setMemuat] = useState(false);

  useEffect(() => {
    const q = nilai.trim();
    if (q.length === 0) return;
    const pengendali = new AbortController();
    const tunda = window.setTimeout(() => {
      setMemuat(true);
      fetch(`/api/cari/saran?q=${encodeURIComponent(q)}`, {
        signal: pengendali.signal,
      })
        .then(async (res) => {
          if (!res.ok) return [];
          const data: unknown = await res.json().catch(() => null);
          if (typeof data !== "object" || data === null) return [];
          const daftar = (data as Record<string, unknown>).saran;
          if (!Array.isArray(daftar)) return [];
          return daftar
            .map(normalisasiSaran)
            .filter((item): item is SaranCari => item !== null);
        })
        .then((daftar) => {
          setSaran(daftar);
          setMemuat(false);
        })
        .catch((err: unknown) => {
          // Abort = fetch basi yang sengaja dibatalkan: diam.
          if (
            typeof err === "object" &&
            err !== null &&
            "name" in err &&
            (err as { name?: string }).name === "AbortError"
          ) {
            return;
          }
          setSaran([]);
          setMemuat(false);
        });
    }, 200);
    return () => {
      window.clearTimeout(tunda);
      pengendali.abort();
    };
  }, [nilai]);

  // Kueri kosong = tidak ada saran (diturunkan saat render, bukan
  // via setState di effect — aturan react-hooks/set-state-in-effect).
  const kosong = nilai.trim().length === 0;
  return { saran: kosong ? [] : saran, memuat: kosong ? false : memuat };
}

type PropsSaranPencarian = {
  /** Nilai input saat ini (cermin state SearchBar). */
  nilai: string;
  /** Ref input yang ditempeli dropdown (untuk keyboard + ARIA). */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Ref pembungkus .saran-pembungkus (untuk deteksi klik di luar). */
  pembungkusRef: React.RefObject<HTMLDivElement | null>;
  /** id unik <ul> daftar (dari useId di SearchBar — SearchBar
   *  dipakai 2x di beranda, jadi id statis akan bertabrakan). */
  idDaftar: string;
  /** Dipanggil saat saran dipilih via keyboard (Enter). */
  onPilih: (item: SaranCari) => void;
};

export default function SaranPencarian({
  nilai,
  inputRef,
  pembungkusRef,
  idDaftar,
  onPilih,
}: PropsSaranPencarian) {
  const { saran } = useSaranCari(nilai);
  const [ditutup, setDitutup] = useState(false);
  const [aktif, setAktif] = useState(-1);
  // Salinan terbaru untuk handler keydown yang ditempel imperatif
  // pada input (hindari closure basi tanpa re-attach tiap render).
  // Disinkronkan SESUDAH render (bukan saat render — aturan
  // react-hooks/refs).
  const terbaruRef = useRef({ saran, aktif, ditutup, onPilih });
  useEffect(() => {
    terbaruRef.current = { saran, aktif, ditutup, onPilih };
  });

  // Penyesuaian state saat render (pola resmi React "adjusting
  // state during render", dipakai juga BottomNav): nilai berubah =
  // pencarian baru (buka lagi dropdown, reset sorotan); daftar
  // menyusut di bawah indeks aktif = reset sorotan. setState
  // sinkron di badan effect dilarang react-hooks/set-state-in-effect.
  const [sebelumnya, setSebelumnya] = useState({
    nilai,
    panjang: saran.length,
  });
  if (sebelumnya.nilai !== nilai || sebelumnya.panjang !== saran.length) {
    setSebelumnya({ nilai, panjang: saran.length });
    if (sebelumnya.nilai !== nilai) {
      setDitutup(false);
      setAktif(-1);
    } else if (aktif >= saran.length) {
      setAktif(-1);
    }
  }

  const tampil = saran.length > 0 && !ditutup;

  // Sinkronkan ARIA combobox pada input (aria-expanded +
  // aria-activedescendant) — atribut ini tidak dikelola JSX
  // SearchBar, jadi diatur imperatif di sini.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.setAttribute("aria-expanded", tampil ? "true" : "false");
    if (tampil && aktif >= 0) {
      input.setAttribute(
        "aria-activedescendant",
        `${idDaftar}-opsi-${aktif}`,
      );
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }, [tampil, aktif, idDaftar, inputRef]);

  // Tutup saat klik di luar pembungkus, dan saat form disubmit.
  useEffect(() => {
    function saatKlikLuar(e: MouseEvent) {
      const pembungkus = pembungkusRef.current;
      if (
        pembungkus &&
        e.target instanceof Node &&
        !pembungkus.contains(e.target)
      ) {
        setDitutup(true);
        setAktif(-1);
      }
    }
    function saatSubmit() {
      setDitutup(true);
      setAktif(-1);
    }
    const form = pembungkusRef.current?.closest("form");
    document.addEventListener("mousedown", saatKlikLuar);
    form?.addEventListener("submit", saatSubmit);
    return () => {
      document.removeEventListener("mousedown", saatKlikLuar);
      form?.removeEventListener("submit", saatSubmit);
    };
  }, [pembungkusRef]);

  // Navigasi keyboard pada input: ↑/↓ pindah sorotan, Enter pilih
  // saran aktif (navigasi ke url-nya), Esc tutup dropdown.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    function saatTombol(e: KeyboardEvent) {
      const { saran: daftar, aktif: idx, ditutup: tutup, onPilih: pilih } =
        terbaruRef.current;
      if (e.key === "ArrowDown") {
        if (daftar.length === 0) return;
        e.preventDefault();
        if (tutup) {
          setDitutup(false);
          setAktif(0);
        } else {
          setAktif(idx < daftar.length - 1 ? idx + 1 : idx);
        }
      } else if (e.key === "ArrowUp") {
        if (daftar.length === 0) return;
        e.preventDefault();
        if (idx <= 0) {
          setDitutup(true);
          setAktif(-1);
        } else {
          setAktif(idx - 1);
        }
      } else if (e.key === "Enter") {
        if (!tutup && idx >= 0 && idx < daftar.length) {
          e.preventDefault();
          pilih(daftar[idx]);
        }
        // Tanpa sorotan: Enter dibiarkan — form GET submit biasa.
      } else if (e.key === "Escape") {
        if (!tutup && daftar.length > 0) {
          e.preventDefault();
          setDitutup(true);
          setAktif(-1);
        }
      }
    }
    input.addEventListener("keydown", saatTombol);
    return () => {
      input.removeEventListener("keydown", saatTombol);
    };
  }, [inputRef]);

  if (!tampil) return null;

  return (
    <ul
      id={idDaftar}
      role="listbox"
      aria-label="Saran pencarian"
      className={`saran-daftar ${gaya.daftar}`}
    >
      {saran.map((item, i) => {
        const eksternal =
          item.url.startsWith("http://") || item.url.startsWith("https://");
        const isi = (
          <>
            {/* Teks saran dipotong ellipsis (P5): teks lengkap
              tersedia lewat tooltip. */}
            <span className="saran-teks" title={item.teks}>{item.teks}</span>
            {item.jenis ? (
              <span className="saran-jenis">{item.jenis}</span>
            ) : null}
          </>
        );
        return (
          <li
            key={`${item.url}::${item.teks}`}
            id={`${idDaftar}-opsi-${i}`}
            role="option"
            aria-selected={aktif === i}
            className={`saran-item${aktif === i ? " aktif" : ""}`}
            onMouseEnter={() => setAktif(i)}
            onMouseLeave={() => setAktif(-1)}
          >
            {eksternal ? (
              <a
                href={item.url}
                onClick={() => simpanRiwayatCari(item.teks)}
              >
                {isi}
              </a>
            ) : (
              <Link
                href={item.url}
                onClick={() => simpanRiwayatCari(item.teks)}
              >
                {isi}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
