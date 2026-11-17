// Command Palette (Worker C — P0 Ekspansi V3): hand-rolled di atas
// Radix Dialog (TANPA cmdk / dependensi baru). Dibuka dengan
// Ctrl+K / Cmd+K, tombol pemicu di header (TombolPalette), atau
// event window "pf:buka-palette". Isi: input pencarian (saran dari
// /api/cari/saran yang sama dengan SearchBar), perintah cepat ke
// rute nyata, dan riwayat pencarian perangkat-lokal
// (localStorage 'pf-riwayat-cari', maks 8). Saat tertutup, Portal
// Radix dilepas — tidak ada overlay yang tertinggal. Dipasang
// SEKALI di layout.tsx.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  Archive,
  Compass,
  CornerDownLeft,
  History,
  Home,
  LayoutGrid,
  LogIn,
  Search,
  Sunrise,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  bacaRiwayatCari,
  hapusEntriRiwayatCari,
  hapusSemuaRiwayatCari,
  simpanRiwayatCari,
  useSaranCari,
  type SaranCari,
} from "@/components/SaranPencarian";

/** Perintah cepat — SEMUA rute nyata yang sudah ada. */
const AKSI_CEPAT: {
  href: string;
  label: string;
  deskripsi: string;
  ikon: LucideIcon;
}[] = [
  { href: "/", label: "Beranda", deskripsi: "Halaman utama", ikon: Home },
  {
    href: "/kategori",
    label: "Kategori",
    deskripsi: "Jelajahi semua kategori berita",
    ikon: LayoutGrid,
  },
  {
    href: "/data/live",
    label: "Data Live",
    deskripsi: "Gempa, cuaca, kurs, jadwal sholat",
    ikon: Activity,
  },
  {
    href: "/brief",
    label: "Daily Brief",
    deskripsi: "Ringkasan berita harian",
    ikon: Sunrise,
  },
  {
    href: "/arsip",
    label: "Arsip",
    deskripsi: "Semua artikel terdahulu",
    ikon: Archive,
  },
  {
    href: "/jelajahi",
    label: "Jelajahi",
    deskripsi: "Topik, negara, dan lainnya",
    ikon: Compass,
  },
  {
    href: "/masuk",
    label: "Masuk",
    deskripsi: "Masuk ke akun Anda",
    ikon: LogIn,
  },
];

type BarisPalette =
  | {
      macam: "saran";
      kunci: string;
      teks: string;
      sub: string;
      url: string;
    }
  | {
      macam: "aksi";
      kunci: string;
      href: string;
      label: string;
      deskripsi: string;
      ikon: LucideIcon;
    }
  | { macam: "riwayat"; kunci: string; teks: string };

type ItemRender =
  | { jenis: "judul"; judul: string; kunci: string }
  | { jenis: "baris"; baris: BarisPalette; indeks: number };

export default function CommandPalette() {
  const router = useRouter();
  const [terbuka, setTerbuka] = useState(false);
  const [query, setQuery] = useState("");
  const [riwayat, setRiwayat] = useState<string[]>([]);
  const [aktif, setAktif] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const barisRefs = useRef<(HTMLElement | null)[]>([]);
  const { saran, memuat } = useSaranCari(terbuka ? query : "");

  // Cermin status buka untuk listener global (dipasang sekali).
  const terbukaRef = useRef(false);
  useEffect(() => {
    terbukaRef.current = terbuka;
  }, [terbuka]);

  // Buka palette: reset query/sorotan + muat riwayat terbaru.
  // Reset dilakukan DI SINI (saat aksi buka), bukan di effect —
  // aturan react-hooks/set-state-in-effect melarang setState
  // sinkron di badan effect.
  const bukaPalette = useCallback(() => {
    setQuery("");
    setAktif(-1);
    setRiwayat(bacaRiwayatCari());
    setTerbuka(true);
  }, []);

  // Buka/tutup global: Ctrl+K / Cmd+K (desktop) — bekerja dari
  // mana saja, termasuk saat fokus di input lain.
  useEffect(() => {
    function saatTombol(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (terbukaRef.current) {
          setTerbuka(false);
        } else {
          bukaPalette();
        }
      }
    }
    window.addEventListener("keydown", saatTombol);
    return () => {
      window.removeEventListener("keydown", saatTombol);
    };
  }, [bukaPalette]);

  // Pemicu dari TombolPalette di header (event window).
  useEffect(() => {
    function saatBuka() {
      bukaPalette();
    }
    window.addEventListener("pf:buka-palette", saatBuka);
    return () => {
      window.removeEventListener("pf:buka-palette", saatBuka);
    };
  }, [bukaPalette]);

  // Daftar baris datar (saran + aksi + riwayat) beserta judul seksi.
  const itemRender = useMemo<ItemRender[]>(() => {
    const q = query.trim().toLowerCase();
    const hasil: ItemRender[] = [];
    let indeks = 0;
    const dorong = (baris: BarisPalette) => {
      hasil.push({ jenis: "baris", baris, indeks });
      indeks += 1;
    };
    if (q.length === 0) {
      hasil.push({ jenis: "judul", judul: "Perintah cepat", kunci: "j-aksi" });
      for (const aksi of AKSI_CEPAT) {
        dorong({
          macam: "aksi",
          kunci: `aksi:${aksi.href}`,
          href: aksi.href,
          label: aksi.label,
          deskripsi: aksi.deskripsi,
          ikon: aksi.ikon,
        });
      }
      if (riwayat.length > 0) {
        hasil.push({
          jenis: "judul",
          judul: "Terakhir dicari",
          kunci: "j-riwayat",
        });
        for (const teks of riwayat) {
          dorong({ macam: "riwayat", kunci: `riwayat:${teks}`, teks });
        }
      }
    } else {
      if (saran.length > 0) {
        hasil.push({ jenis: "judul", judul: "Saran", kunci: "j-saran" });
        for (const item of saran) {
          dorong({
            macam: "saran",
            kunci: `saran:${item.url}::${item.teks}`,
            teks: item.teks,
            sub: item.jenis,
            url: item.url,
          });
        }
      }
      const aksiCocok = AKSI_CEPAT.filter(
        (aksi) =>
          aksi.label.toLowerCase().includes(q) ||
          aksi.deskripsi.toLowerCase().includes(q),
      );
      if (aksiCocok.length > 0) {
        hasil.push({
          jenis: "judul",
          judul: "Perintah cepat",
          kunci: "j-aksi",
        });
        for (const aksi of aksiCocok) {
          dorong({
            macam: "aksi",
            kunci: `aksi:${aksi.href}`,
            href: aksi.href,
            label: aksi.label,
            deskripsi: aksi.deskripsi,
            ikon: aksi.ikon,
          });
        }
      }
    }
    return hasil;
  }, [query, saran, riwayat]);

  const jumlahBaris = useMemo(
    () =>
      itemRender.filter((item) => item.jenis === "baris").length,
    [itemRender],
  );

  // Penyesuaian state saat render (pola resmi React, dipakai juga
  // BottomNav): query berubah = daftar baru, atau daftar menyusut
  // di bawah indeks aktif → reset sorotan.
  const [sebelumnya, setSebelumnya] = useState({
    query,
    jumlah: jumlahBaris,
  });
  if (sebelumnya.query !== query || sebelumnya.jumlah !== jumlahBaris) {
    setSebelumnya({ query, jumlah: jumlahBaris });
    if (sebelumnya.query !== query || aktif >= jumlahBaris) {
      setAktif(-1);
    }
  }

  function tutup() {
    setTerbuka(false);
  }

  /** Cari teks bebas: simpan riwayat, tutup, ke /cari. */
  function cariTeks(teks: string) {
    const q = teks.trim();
    if (q.length === 0) return;
    setRiwayat(simpanRiwayatCari(q));
    tutup();
    router.push(`/cari?q=${encodeURIComponent(q)}`);
  }

  function saatTombolInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      if (jumlahBaris === 0) return;
      e.preventDefault();
      setAktif((a) => (a < jumlahBaris - 1 ? a + 1 : a));
    } else if (e.key === "ArrowUp") {
      if (jumlahBaris === 0) return;
      e.preventDefault();
      setAktif((a) => (a <= 0 ? -1 : a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (aktif >= 0) {
        // Aktifkan baris tersorot (klik elemennya — Link / tombol).
        barisRefs.current[aktif]?.click();
      } else {
        cariTeks(query);
      }
    }
    // Esc ditangani Radix Dialog (menutup palette).
  }

  function renderBaris(item: Extract<ItemRender, { jenis: "baris" }>) {
    const { baris, indeks } = item;
    const kelas = `palette-item${aktif === indeks ? " aktif" : ""}`;
    const propsUmum = {
      id: `palette-baris-${indeks}`,
      role: "option" as const,
      "aria-selected": aktif === indeks,
      className: kelas,
      onMouseEnter: () => setAktif(indeks),
      onMouseLeave: () => setAktif(-1),
      ref: (el: HTMLElement | null) => {
        barisRefs.current[indeks] = el;
      },
    };
    if (baris.macam === "saran") {
      const saranItem: SaranCari = {
        teks: baris.teks,
        jenis: baris.sub,
        url: baris.url,
      };
      const eksternal =
        baris.url.startsWith("http://") ||
        baris.url.startsWith("https://");
      const isi = (
        <>
          <span className="palette-item-ikon" aria-hidden="true">
            <Search size={16} />
          </span>
          <span className="palette-item-teks">
            <span className="palette-item-label">{baris.teks}</span>
            {baris.sub ? (
              <span className="palette-item-sub">{baris.sub}</span>
            ) : null}
          </span>
          <CornerDownLeft
            size={15}
            className="palette-item-enter"
            aria-hidden="true"
          />
        </>
      );
      if (eksternal) {
        return (
          <a
            key={baris.kunci}
            href={baris.url}
            {...propsUmum}
            onClick={() => {
              simpanRiwayatCari(saranItem.teks);
              tutup();
            }}
          >
            {isi}
          </a>
        );
      }
      return (
        <Link
          key={baris.kunci}
          href={baris.url}
          {...propsUmum}
          onClick={() => {
            simpanRiwayatCari(saranItem.teks);
            tutup();
          }}
        >
          {isi}
        </Link>
      );
    }
    if (baris.macam === "aksi") {
      const Ikon = baris.ikon;
      return (
        <Link
          key={baris.kunci}
          href={baris.href}
          {...propsUmum}
          onClick={tutup}
        >
          <span className="palette-item-ikon" aria-hidden="true">
            <Ikon size={16} />
          </span>
          <span className="palette-item-teks">
            <span className="palette-item-label">{baris.label}</span>
            <span className="palette-item-sub">{baris.deskripsi}</span>
          </span>
          <CornerDownLeft
            size={15}
            className="palette-item-enter"
            aria-hidden="true"
          />
        </Link>
      );
    }
    // Riwayat: tombol utama (cari lagi) + tombol hapus per entri.
    return (
      <div
        key={baris.kunci}
        className={`palette-baris-riwayat${aktif === indeks ? " aktif" : ""}`}
        onMouseEnter={() => setAktif(indeks)}
        onMouseLeave={() => setAktif(-1)}
      >
        <button
          type="button"
          id={`palette-baris-${indeks}`}
          role="option"
          aria-selected={aktif === indeks}
          className={kelas}
          ref={(el: HTMLButtonElement | null) => {
            barisRefs.current[indeks] = el;
          }}
          onClick={() => cariTeks(baris.teks)}
        >
          <span className="palette-item-ikon" aria-hidden="true">
            <History size={16} />
          </span>
          <span className="palette-item-teks">
            <span className="palette-item-label">{baris.teks}</span>
          </span>
        </button>
        <button
          type="button"
          className="palette-hapus"
          aria-label={`Hapus "${baris.teks}" dari riwayat`}
          onClick={() => setRiwayat(hapusEntriRiwayatCari(baris.teks))}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    );
  }

  const qKosong = query.trim().length === 0;

  return (
    <Dialog.Root open={terbuka} onOpenChange={setTerbuka}>
      <Dialog.Portal>
        <Dialog.Overlay className="palette-lapisan" />
        <Dialog.Content
          className="palette-konten"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <Dialog.Title className="sr-only">Palet perintah</Dialog.Title>
          <Dialog.Description className="sr-only">
            Cari berita, topik, atau sumber, atau lompat ke halaman
            PRATA FAKTA.
          </Dialog.Description>

          <div className="palette-kepala">
            <Search
              size={18}
              className="palette-kepala-ikon"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={saatTombolInput}
              placeholder="Cari berita, topik, atau perintah…"
              autoComplete="off"
              aria-label="Cari di PRATA FAKTA"
              role="combobox"
              aria-expanded={terbuka}
              aria-controls="palette-daftar"
              aria-autocomplete="list"
              aria-activedescendant={
                aktif >= 0 ? `palette-baris-${aktif}` : undefined
              }
            />
            <kbd className="palette-pintasan" aria-hidden="true">
              Esc
            </kbd>
            <Dialog.Close asChild>
              <button
                type="button"
                className="palette-tutup"
                aria-label="Tutup palet perintah"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <div
            id="palette-daftar"
            role="listbox"
            aria-label="Hasil pencarian dan perintah"
            className="palette-daftar"
          >
            {itemRender.map((item) =>
              item.jenis === "judul" ? (
                <div key={item.kunci} className="palette-judul-seksi">
                  <span>{item.judul}</span>
                  {item.kunci === "j-riwayat" ? (
                    <button
                      type="button"
                      className="palette-hapus-semua"
                      onClick={() => {
                        hapusSemuaRiwayatCari();
                        setRiwayat([]);
                      }}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      Hapus semua
                    </button>
                  ) : null}
                </div>
              ) : (
                renderBaris(item)
              ),
            )}
            {memuat && saran.length === 0 && !qKosong ? (
              <div className="palette-kosong" role="status">
                Memuat saran…
              </div>
            ) : null}
            {!qKosong && jumlahBaris === 0 && !memuat ? (
              <div className="palette-kosong">
                Tidak ada hasil untuk “{query.trim()}”. Tekan Enter
                untuk mencari.
              </div>
            ) : null}
          </div>

          <div className="palette-kaki" aria-hidden="true">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> navigasi
            </span>
            <span>
              <kbd>Enter</kbd> buka
            </span>
            <span>
              <kbd>Esc</kbd> tutup
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Tombol pemicu palet perintah — dipasang di header (Header.tsx,
 *  .header-aksi, di samping TombolCari). Membuka palette lewat
 *  event window "pf:buka-palette" agar CommandPalette tetap
 *  terpasang SEKALI di layout. Desktop: ikon + hint "Ctrl+K";
 *  seluler: ikon saja (hint disembunyikan CSS). */
export function TombolPalette() {
  function buka() {
    window.dispatchEvent(new Event("pf:buka-palette"));
  }
  return (
    <button
      type="button"
      className="tombol tombol-ikon tombol-hantu tombol-palette"
      onClick={buka}
      aria-label="Buka palet perintah (Ctrl+K)"
      title="Palet perintah (Ctrl+K)"
    >
      <Search size={20} aria-hidden="true" />
      <kbd className="palette-pintasan-tombol" aria-hidden="true">
        Ctrl+K
      </kbd>
    </button>
  );
}
