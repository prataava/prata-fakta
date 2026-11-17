// Garis waktu SVG buatan tangan (P1-4) — tanpa library chart.
// Sumbu waktu + titik per event (posisi = tanggal) di atas
// /timeline. Klik titik → sorot kartu event + gulir ke kartu.
// Tombol zoom periode memfilter dari data yang SUDAH dimuat
// (client-side, tanpa fetch ulang). Penanda "TERBARU" pada event
// dengan perkembangan kronologi ≤7 hari (dihitung server).
//
// ATURAN WAKTU (pola GrafikInteraktif.tsx): komponen ini TIDAK
// membaca jam dinding dan TIDAK memakai `new Date()` sama sekali
// — semua tanggal/batas datang sebagai prop dari server, filter
// zoom membandingkan string ISO, posisi titik dihitung dari
// aritmetika kalender murni (hariDariISO). Lebar SVG minimum
// 560px di dalam pembungkus overflow-x:auto, jadi di layar 390px
// garis waktu bergulir di dalam komponen, BUKAN overflow halaman.
"use client";

import { useMemo, useRef, useState } from "react";
import { hariDariISO } from "@/lib/linimasa";

export type ItemGarisWaktu = {
  id: string;
  judul: string;
  /** Tanggal event, YYYY-MM-DD. */
  tanggal: string;
  /** Label tanggal siap tampil (diformat server). */
  labelTanggal: string;
  /** Perkembangan kronologi terbaru ≤7 hari. */
  terbaru: boolean;
};

export type BatasZoomGaris = {
  satuTahun: string;
  enamBulan: string;
  tigaBulan: string;
};

type Periode = "semua" | "1th" | "6bln" | "3bln";

const PERIODE_LABEL: { nilai: Periode; label: string }[] = [
  { nilai: "semua", label: "Semua" },
  { nilai: "1th", label: "1 tahun" },
  { nilai: "6bln", label: "6 bulan" },
  { nilai: "3bln", label: "3 bulan" },
];

const LEBAR = 1000;
const TINGGI = 150;
const PAD_X = 48;
const Y_SUMBU = 86;

export default function GarisWaktu({
  items,
  batas,
  tanpaTanggal,
}: {
  items: ItemGarisWaktu[];
  batas: BatasZoomGaris;
  /** Jumlah event yang tidak punya tanggal (tidak bisa dipetakan). */
  tanpaTanggal: number;
}) {
  const [periode, setPeriode] = useState<Periode>("semua");
  const [terpilih, setTerpilih] = useState<string | null>(null);
  const pemulihRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter zoom = perbandingan string ISO terhadap batas yang
  // dihitung server (tanpa fetch ulang, tanpa jam dinding).
  const tampil = useMemo(() => {
    const ambang =
      periode === "1th"
        ? batas.satuTahun
        : periode === "6bln"
          ? batas.enamBulan
          : periode === "3bln"
            ? batas.tigaBulan
            : null;
    const daftar = ambang
      ? items.filter((it) => it.tanggal >= ambang)
      : items;
    return [...daftar].sort((a, b) =>
      a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0,
    );
  }, [items, periode, batas]);

  const { titik, tanggalAwal, tanggalAkhir } = useMemo(() => {
    if (tampil.length === 0) {
      return {
        titik: [] as { item: ItemGarisWaktu; x: number }[],
        tanggalAwal: "",
        tanggalAkhir: "",
      };
    }
    const hari = tampil.map((it) => hariDariISO(it.tanggal));
    const min = Math.min(...hari);
    const maks = Math.max(...hari);
    const rentang = maks - min;
    const daftar = tampil.map((item, i) => ({
      item,
      // Satu tanggal unik (rentang 0) → semua titik di tengah.
      x:
        rentang === 0
          ? LEBAR / 2
          : PAD_X + ((hari[i] - min) / rentang) * (LEBAR - PAD_X * 2),
    }));
    return {
      titik: daftar,
      tanggalAwal: tampil[0].labelTanggal,
      tanggalAkhir: tampil[tampil.length - 1].labelTanggal,
    };
  }, [tampil]);

  function sorotKartu(id: string) {
    setTerpilih(id);
    if (typeof document === "undefined") return;
    const el = document.getElementById(`event-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const elHtml = el as HTMLElement;
    const gayaAsal = elHtml.style.boxShadow;
    const garisAsal = elHtml.style.outline;
    elHtml.style.outline = "3px solid var(--mint)";
    elHtml.style.boxShadow = "0 0 0 6px color-mix(in srgb, var(--mint) 25%, transparent)";
    if (pemulihRef.current) clearTimeout(pemulihRef.current);
    pemulihRef.current = setTimeout(() => {
      elHtml.style.outline = garisAsal;
      elHtml.style.boxShadow = gayaAsal;
    }, 3000);
  }

  return (
    <section
      className="seksi"
      aria-label="Garis waktu peristiwa"
      style={{ minWidth: 0 }}
    >
      <div className="seksi-kepala">
        <h2>Garis waktu</h2>
        <p>Klik titik untuk melompat ke kartunya.</p>
      </div>
      <div
        className="chip-baris"
        role="group"
        aria-label="Periode garis waktu"
      >
        {PERIODE_LABEL.map((p) => (
          <button
            key={p.nilai}
            type="button"
            className={`chip${periode === p.nilai ? " aktif" : ""}`}
            aria-pressed={periode === p.nilai}
            onClick={() => setPeriode(p.nilai)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {tampil.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          Tidak ada peristiwa pada periode ini — coba periode yang lebih
          panjang.
        </p>
      ) : (
        <div
          style={{
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
            minWidth: 0,
          }}
        >
          <svg
            viewBox={`0 0 ${LEBAR} ${TINGGI}`}
            style={{ display: "block", minWidth: 560, width: "100%" }}
            role="img"
            aria-label={`Garis waktu ${tampil.length} peristiwa, dari ${tanggalAwal} sampai ${tanggalAkhir}`}
          >
            <line
              x1={PAD_X}
              y1={Y_SUMBU}
              x2={LEBAR - PAD_X}
              y2={Y_SUMBU}
              stroke="var(--border)"
              strokeWidth={2}
            />
            <text x={PAD_X} y={TINGGI - 8} fontSize={12} fill="var(--muted)">
              {tanggalAwal}
            </text>
            <text
              x={LEBAR - PAD_X}
              y={TINGGI - 8}
              fontSize={12}
              fill="var(--muted)"
              textAnchor="end"
            >
              {tanggalAkhir}
            </text>
            {titik.map(({ item, x }) => (
              <g
                key={item.id}
                role="button"
                tabIndex={0}
                aria-label={`${item.judul} — ${item.labelTanggal}${item.terbaru ? " — perkembangan terbaru" : ""}`}
                onClick={() => sorotKartu(item.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    sorotKartu(item.id);
                  }
                }}
                style={{ cursor: "pointer", outline: "none" }}
              >
                <title>{`${item.judul} — ${item.labelTanggal}`}</title>
                {item.terbaru && (
                  <text
                    x={x}
                    y={Y_SUMBU - 26}
                    fontSize={10}
                    fontWeight={700}
                    fill="var(--mint)"
                    textAnchor="middle"
                  >
                    TERBARU
                  </text>
                )}
                <circle
                  cx={x}
                  cy={Y_SUMBU}
                  r={terpilih === item.id ? 10 : 7}
                  fill={
                    terpilih === item.id
                      ? "var(--mint)"
                      : item.terbaru
                        ? "var(--mint)"
                        : "var(--surface)"
                  }
                  stroke="var(--mint)"
                  strokeWidth={2}
                />
                <text
                  x={x}
                  y={Y_SUMBU + 24}
                  fontSize={11}
                  fill="var(--muted)"
                  textAnchor="middle"
                >
                  {item.labelTanggal.length > 14
                    ? item.labelTanggal.slice(0, 14)
                    : item.labelTanggal}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}
      <p style={{ color: "var(--muted)", marginTop: 8 }}>
        Menampilkan {tampil.length} dari {items.length} peristiwa
        bertanggal
        {tanpaTanggal > 0
          ? ` · ${tanpaTanggal} peristiwa tanpa tanggal tidak tampil di garis waktu.`
          : "."}
      </p>
    </section>
  );
}
