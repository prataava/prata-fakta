"use client";

import { useMemo, useRef, useState } from "react";
import type { PfPoinIndikator } from "@/lib/lanjutan";

// Grafik garis SVG interaktif (tanpa library chart) — Reality Check.
// grafik interaktif, perbandingan periode, dan tabel poin data.",
// Hover menampilkan nilai + tanggal titik terdekat; pemilih rentang
// memfilter titik berdasarkan TAHUN titik terbaru (perbandingan
// string tanggal ISO — TANPA membaca jam dinding, sesuai aturan
// cacheComponents: komponen klien tidak boleh membaca waktu saat ini).
type Rentang = "semua" | "1th" | "5th";

const RENTANG_LABEL: { nilai: Rentang; label: string }[] = [
  { nilai: "semua", label: "Semua" },
  { nilai: "1th", label: "1 tahun" },
  { nilai: "5th", label: "5 tahun" },
];

function formatNilai(nilai: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(
    nilai,
  );
}

const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/**
 * Format tanggal ISO YYYY-MM-DD menjadi "30 Juni 2025" TANPA
 * membaca jam dinding — pemecahan string murni, deterministik di prerender.
 */
function formatTanggal(tanggal: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal);
  if (!m) return tanggal;
  const bulan = NAMA_BULAN[Number(m[2]) - 1];
  if (!bulan) return tanggal;
  return `${Number(m[3])} ${bulan} ${m[1]}`;
}

const LEBAR = 560;
const TINGGI = 180;
const PAD_KIRI = 8;
const PAD_KANAN = 8;
const PAD_ATAS = 12;
const PAD_BAWAH = 24;

export default function GrafikInteraktif({
  poin,
  label,
  satuan,
}: {
  poin: PfPoinIndikator[];
  label: string;
  satuan: string | null;
}) {
  const [rentang, setRentang] = useState<Rentang>("semua");
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const tampil = useMemo(() => {
    if (rentang === "semua" || poin.length === 0) return poin;
    const tahunTerbaru = Number(poin[poin.length - 1].tanggal.slice(0, 4));
    const mundur = rentang === "1th" ? 1 : 5;
    // Tahun kalender: titik masuk bila tahunnya >= tahunTerbaru - mundur.
    // Perbandingan numerik tahun dari string ISO — tanpa Date.
    return poin.filter(
      (p) => Number(p.tanggal.slice(0, 4)) >= tahunTerbaru - mundur,
    );
  }, [poin, rentang]);

  if (poin.length === 0) {
    return (
      <p style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
        Belum ada titik data untuk indikator ini.
      </p>
    );
  }
  if (tampil.length < 2) {
    return (
      <p style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
        Grafik membutuhkan minimal 2 poin data pada rentang ini; indikator
        ini baru punya {tampil.length} poin pada rentang{" "}
        {RENTANG_LABEL.find((r) => r.nilai === rentang)?.label ?? rentang}.
        Pilih rentang &ldquo;Semua&rdquo; untuk melihat seluruh titik.
      </p>
    );
  }

  const nilai = tampil.map((p) => p.nilai);
  const min = Math.min(...nilai);
  const maks = Math.max(...nilai);
  const rentangNilai = maks - min || 1;
  const x = (i: number) =>
    PAD_KIRI + (i * (LEBAR - PAD_KIRI - PAD_KANAN)) / (tampil.length - 1);
  const y = (v: number) =>
    PAD_ATAS + (1 - (v - min) / rentangNilai) * (TINGGI - PAD_ATAS - PAD_BAWAH);
  const d = tampil
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.nilai).toFixed(1)}`)
    .join(" ");
  const pertama = tampil[0];
  const terakhir = tampil[tampil.length - 1];
  const titikHover = hover !== null ? tampil[hover] : null;

  function saatGerak(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const px = ((e.clientX - rect.left) / rect.width) * LEBAR;
    let terdekat = 0;
    let jarakTerkecil = Number.POSITIVE_INFINITY;
    for (let i = 0; i < tampil.length; i++) {
      const jarak = Math.abs(x(i) - px);
      if (jarak < jarakTerkecil) {
        jarakTerkecil = jarak;
        terdekat = i;
      }
    }
    setHover(terdekat);
  }

  return (
    <div>
      <div
        className="chip-baris"
        role="group"
        aria-label={`Rentang grafik ${label}`}
        style={{ marginBottom: 8 }}
      >
        {RENTANG_LABEL.map((r) => (
          <button
            key={r.nilai}
            type="button"
            className={`chip${rentang === r.nilai ? " aktif" : ""}`}
            aria-pressed={rentang === r.nilai}
            onClick={() => {
              setRentang(r.nilai);
              setHover(null);
            }}
          >
            {r.label}
          </button>
        ))}
      </div>
      <figure style={{ margin: 0 }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${LEBAR} ${TINGGI}`}
          width="100%"
          role="img"
          aria-label={`Grafik tren ${label}: ${formatNilai(pertama.nilai)} pada ${pertama.tanggal} menjadi ${formatNilai(terakhir.nilai)} pada ${terakhir.tanggal}`}
          onMouseMove={saatGerak}
          onMouseLeave={() => setHover(null)}
        >
          <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" />
          {titikHover && (
            <line
              x1={x(hover as number)}
              y1={PAD_ATAS}
              x2={x(hover as number)}
              y2={TINGGI - PAD_BAWAH}
              stroke="var(--muted)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}
          {tampil.map((p, i) => (
            <circle
              key={`${p.tanggal}-${i}`}
              cx={x(i)}
              cy={y(p.nilai)}
              r={hover === i ? 5 : 3}
              fill="var(--accent)"
            >
              <title>
                {p.tanggal}: {formatNilai(p.nilai)}
              </title>
            </circle>
          ))}
          <text x={PAD_KIRI} y={TINGGI - 6} fontSize="11" fill="var(--muted)">
            {pertama.tanggal}
          </text>
          <text
            x={LEBAR - PAD_KANAN}
            y={TINGGI - 6}
            fontSize="11"
            fill="var(--muted)"
            textAnchor="end"
          >
            {terakhir.tanggal}
          </text>
        </svg>
        <figcaption
          style={{
            minHeight: "1.4em",
            fontSize: "0.92rem",
            color: "var(--muted)",
          }}
          aria-live="polite"
        >
          {titikHover
            ? `${formatTanggal(titikHover.tanggal)}: ${formatNilai(titikHover.nilai)}${satuan ? ` ${satuan}` : ""}`
            : "Arahkan kursor ke grafik untuk melihat nilai per tanggal."}
        </figcaption>
      </figure>
    </div>
  );
}
