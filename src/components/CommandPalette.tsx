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
import { t, type KunciBahasa } from "@/lib/i18n";
import { useBahasa } from "@/lib/useBahasa";
import gaya from "./CommandPalette.module.css";

/** Alias cepat (Fase 4, ala Raycast): awalan kueri yang
 *  mengarahkan pencarian — k: kategori, s: sumber, g: graf,
 *  t: topik. Awalan dikupas sebelum saran dicari; navigasi
 *  keyboard dan logika pencarian lainnya TIDAK berubah. */
const AKSI_ALIAS: Record<
  string,
  { href: string; label: string; deskripsi: string; ikon: LucideIcon }
> = {
  k: {
    href: "/kategori",
    label: "Kategori",
    deskripsi: "Buka semua kategori berita",
    ikon: LayoutGrid,
  },
  s: {
    href: "/sumber",
    label: "Sumber",
    deskripsi: "Buka daftar sumber berita",
    ikon: Search,
  },
  g: {
    href: "/graf",
    label: "Graf Pengetahuan",
    deskripsi: "Buka peta relasi klaim dan sumber",
    ikon: Compass,
  },
  t: {
    href: "/jelajahi",
    label: "Jelajahi topik",
    deskripsi: "Buka topik, negara, dan lainnya",
    ikon: Compass,
  },
};

const PETUNJUK_ALIAS: Record<string, string> = {
  k: "Alias k: — mencari kategori",
  s: "Alias s: — mencari sumber",
  g: "Alias g: — mencari di graf pengetahuan",
  t: "Alias t: — mencari topik",
};

/** Kupas awalan alias (k:/s:/g:/t:) dari kueri; null bila tidak ada. */
function kupasAlias(teks: string): { alias: string | null; sisa: string } {
  const cocok = /^([ksgt]):\s*(.*)$/i.exec(teks.trim());
  if (!cocok) return { alias: null, sisa: teks };
  return { alias: cocok[1].toLowerCase(), sisa: cocok[2] ?? "" };
}

/** Perintah cepat — SEMUA rute nyata yang sudah ada. Label dari
 *  kamus (P3-3); "Data Live" sama di kedua bahasa sehingga tetap
 *  literal. Deskripsi item SENGAJA tetap Indonesia (di luar
 *  cakupan minimal P3-3). */
const AKSI_CEPAT: {
  href: string;
  kunci?: KunciBahasa;
  label?: string;
  deskripsi: string;
  ikon: LucideIcon;
}[] = [
  { href: "/", kunci: "nav.beranda", deskripsi: "Halaman utama", ikon: Home },
  {
    href: "/kategori",
    kunci: "nav.kategori",
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
    kunci: "nav.brief",
    deskripsi: "Ringkasan berita harian",
    ikon: Sunrise,
  },
  {
    href: "/arsip",
    kunci: "nav.arsip",
    deskripsi: "Semua artikel terdahulu",
    ikon: Archive,
  },
  {
    href: "/jelajahi",
    kunci: "nav.jelajahi",
    deskripsi: "Topik, negara, dan lainnya",
    ikon: Compass,
  },
  {
    href: "/masuk",
    kunci: "auth.masuk",
    deskripsi: "Masuk ke akun Anda",
    ikon: LogIn,
  },
];

/** Label tampil sebuah aksi cepat dalam bahasa aktif. */
function labelAksi(bahasa: "id" | "en", aksi: (typeof AKSI_CEPAT)[number]): string {
  return aksi.kunci ? t(bahasa, aksi.kunci) : (aksi.label ?? "");
}

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
  const bahasa = useBahasa();
  const [terbuka, setTerbuka] = useState(false);
  const [query, setQuery] = useState("");
  const [riwayat, setRiwayat] = useState<string[]>([]);
  const [aktif, setAktif] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const barisRefs = useRef<(HTMLElement | null)[]>([]);
  // Alias dikupas SEBELUM saran dicari agar "k:ekonomi" mencari
  // "ekonomi" (bukan literal "k:ekonomi").
  const { alias, sisa: queryCari } = kupasAlias(query);
  const { saran, memuat } = useSaranCari(terbuka ? queryCari : "");

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
    const q = queryCari.trim().toLowerCase();
    const hasil: ItemRender[] = [];
    let indeks = 0;
    const dorong = (baris: BarisPalette) => {
      hasil.push({ jenis: "baris", baris, indeks });
      indeks += 1;
    };
    if (q.length === 0 && !alias) {
      hasil.push({ jenis: "judul", judul: t(bahasa, "palette.aksiCepat"), kunci: "j-aksi" });
      for (const aksi of AKSI_CEPAT) {
        dorong({
          macam: "aksi",
          kunci: `aksi:${aksi.href}`,
          href: aksi.href,
          label: labelAksi(bahasa, aksi),
          deskripsi: aksi.deskripsi,
          ikon: aksi.ikon,
        });
      }
      if (riwayat.length > 0) {
        hasil.push({
          jenis: "judul",
          judul: t(bahasa, "palette.terakhirDicari"),
          kunci: "j-riwayat",
        });
        for (const teks of riwayat) {
          dorong({ macam: "riwayat", kunci: `riwayat:${teks}`, teks });
        }
      }
    } else {
      // Alias aktif: baris pintasan ke halaman tujuannya dulu.
      if (alias && AKSI_ALIAS[alias]) {
        const a = AKSI_ALIAS[alias];
        hasil.push({ jenis: "judul", judul: "Pintasan", kunci: "j-alias" });
        dorong({
          macam: "aksi",
          kunci: `alias:${alias}`,
          href: a.href,
          label: a.label,
          deskripsi: a.deskripsi,
          ikon: a.ikon,
        });
      }
      if (saran.length > 0) {
        hasil.push({ jenis: "judul", judul: t(bahasa, "palette.saran"), kunci: "j-saran" });
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
          labelAksi(bahasa, aksi).toLowerCase().includes(q) ||
          aksi.deskripsi.toLowerCase().includes(q),
      );
      if (aksiCocok.length > 0) {
        hasil.push({
          jenis: "judul",
          judul: t(bahasa, "palette.aksiCepat"),
          kunci: "j-aksi",
        });
        for (const aksi of aksiCocok) {
          dorong({
            macam: "aksi",
            kunci: `aksi:${aksi.href}`,
            href: aksi.href,
            label: labelAksi(bahasa, aksi),
            deskripsi: aksi.deskripsi,
            ikon: aksi.ikon,
          });
        }
      }
    }
    return hasil;
  }, [queryCari, alias, saran, riwayat, bahasa]);

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

  /** Cari teks bebas: kupas alias dulu, simpan riwayat, tutup,
   *  ke /cari. */
  function cariTeks(teks: string) {
    const q = kupasAlias(teks).sisa.trim();
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
          className={`palette-konten ${gaya.kontenKaca}`}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <Dialog.Title className="sr-only">{t(bahasa, "palette.judul")}</Dialog.Title>
          <Dialog.Description className="sr-only">
            {t(bahasa, "palette.deskripsi")}
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
              placeholder={t(bahasa, "palette.placeholder")}
              autoComplete="off"
              aria-label={t(bahasa, "palette.judul")}
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
                aria-label={t(bahasa, "palette.tutup")}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          {alias ? (
            <div className={gaya.alias} role="status">
              {PETUNJUK_ALIAS[alias] ?? `Alias ${alias}:`}
            </div>
          ) : null}

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
                      {t(bahasa, "palette.hapusSemua")}
                    </button>
                  ) : null}
                </div>
              ) : (
                renderBaris(item)
              ),
            )}
            {memuat && saran.length === 0 && !qKosong ? (
              <div className="palette-kosong" role="status">
                {t(bahasa, "palette.memuat")}
              </div>
            ) : null}
            {!qKosong && jumlahBaris === 0 && !memuat ? (
              <div className={`palette-kosong ${gaya.kosongBersaran}`}>
                <p>
                  {t(bahasa, "palette.tidakAdaHasil", {
                    q: queryCari.trim(),
                  })}
                </p>
                <p className={gaya.kosongSub}>
                  Coba kata kunci lain, atau mulai dari salah satu ini:
                </p>
                <div className={gaya.kosongAksi}>
                  <Link href="/kategori" onClick={tutup}>
                    Kategori
                  </Link>
                  <Link href="/arsip" onClick={tutup}>
                    Arsip
                  </Link>
                  <Link href="/brief" onClick={tutup}>
                    Daily Brief
                  </Link>
                  <button
                    type="button"
                    onClick={() => cariTeks(queryCari)}
                  >
                    Cari di arsip
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="palette-kaki" aria-hidden="true">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> {t(bahasa, "palette.kakiNavigasi")}
            </span>
            <span>
              <kbd>Enter</kbd> {t(bahasa, "palette.kakiBuka")}
            </span>
            <span>
              <kbd>Esc</kbd> {t(bahasa, "palette.kakiTutup")}
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
  const bahasa = useBahasa();
  function buka() {
    window.dispatchEvent(new Event("pf:buka-palette"));
  }
  return (
    <button
      type="button"
      className="tombol tombol-ikon tombol-hantu tombol-palette"
      onClick={buka}
      aria-label={t(bahasa, "palette.buka")}
      title={t(bahasa, "palette.buka")}
    >
      <Search size={20} aria-hidden="true" />
      <kbd className="palette-pintasan-tombol" aria-hidden="true">
        Ctrl+K
      </kbd>
    </button>
  );
}
