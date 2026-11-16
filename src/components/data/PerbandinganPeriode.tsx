"use client";

import { useMemo, useState } from "react";
import {
  daftarTahun,
  hitungPerbandinganPeriode,
} from "@/lib/reality";
import type { PfPoinIndikator } from "@/lib/lanjutan";

// Perbandingan periode (Reality Check): pilih dua tahun, tampilkan
// nilai titik terakhir masing-masing tahun + selisih + persen
// perubahan — semuanya dihitung fungsi murni
// hitungPerbandinganPeriode dari pf_data_points NYATA. Bila data
// belum cukup, tampilkan pesan jujur (bukan angka karangan).
// TANPA membaca jam dinding: tahun diambil dari string tanggal
// ISO titik data.

function formatNilai(nilai: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(
    nilai,
  );
}

function formatPersen(persen: number): string {
  const teks = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
  }).format(persen);
  return `${persen > 0 ? "+" : ""}${teks}%`;
}

export default function PerbandinganPeriode({
  poin,
  satuan,
  nama,
}: {
  poin: PfPoinIndikator[];
  satuan: string | null;
  nama: string;
}) {
  const tahun = useMemo(() => daftarTahun(poin), [poin]);
  const [tahunA, setTahunA] = useState<number | null>(
    tahun.length >= 2 ? tahun[tahun.length - 2] : (tahun[0] ?? null),
  );
  const [tahunB, setTahunB] = useState<number | null>(
    tahun.length >= 1 ? tahun[tahun.length - 1] : null,
  );

  // Tahun yang tersedia bisa berubah bila poin berubah (mis. sesudah
  // admin menambah titik): bila pilihan lama tak lagi valid, pakai
  // dua tahun terakhir sebagai default yang jujur.
  const tahunAValid =
    tahunA !== null && tahun.includes(tahunA) ? tahunA : null;
  const tahunBValid =
    tahunB !== null && tahun.includes(tahunB) ? tahunB : null;
  const efektifA =
    tahunAValid ?? (tahun.length >= 2 ? tahun[tahun.length - 2] : (tahun[0] ?? null));
  const efektifB = tahunBValid ?? (tahun[tahun.length - 1] ?? null);

  if (tahun.length === 0) {
    return (
      <p style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
        Perbandingan periode belum bisa ditampilkan: indikator ini belum
        punya titik data.
      </p>
    );
  }

  const hasil =
    efektifA !== null && efektifB !== null
      ? hitungPerbandinganPeriode(poin, efektifA, efektifB)
      : null;

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <label style={{ fontSize: "0.92rem" }}>
          Tahun awal{" "}
          <select
            value={efektifA ?? ""}
            onChange={(e) => setTahunA(Number(e.target.value))}
            aria-label={`Tahun awal perbandingan ${nama}`}
          >
            {tahun.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <span aria-hidden="true">→</span>
        <label style={{ fontSize: "0.92rem" }}>
          Tahun akhir{" "}
          <select
            value={efektifB ?? ""}
            onChange={(e) => setTahunB(Number(e.target.value))}
            aria-label={`Tahun akhir perbandingan ${nama}`}
          >
            {tahun.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!hasil || !hasil.cukup ? (
        <p
          style={{ color: "var(--muted)", fontSize: "0.92rem" }}
          role="status"
        >
          {hasil?.alasan ??
            "Data belum cukup untuk membandingkan periode ini."}
        </p>
      ) : (
        <div className="tabel-gulir">
          <table className="tabel-data">
            <thead>
              <tr>
                <th scope="col">Tahun</th>
                <th scope="col">Nilai{satuan ? ` (${satuan})` : ""}</th>
                <th scope="col">Tanggal data</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{hasil.tahunA}</td>
                <td>{formatNilai(hasil.nilaiA as number)}</td>
                <td>{hasil.tanggalA}</td>
              </tr>
              <tr>
                <td>{hasil.tahunB}</td>
                <td>{formatNilai(hasil.nilaiB as number)}</td>
                <td>{hasil.tanggalB}</td>
              </tr>
              <tr>
                <td>
                  <strong>Selisih</strong>
                </td>
                <td>
                  <strong>
                    {(hasil.selisih as number) > 0 ? "+" : ""}
                    {formatNilai(hasil.selisih as number)}
                    {satuan ? ` ${satuan}` : ""}
                  </strong>
                </td>
                <td>
                  {hasil.persen === null
                    ? "Persen tak terhitung (nilai awal 0)"
                    : formatPersen(hasil.persen)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
