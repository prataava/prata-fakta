import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Database,
  Globe,
  Map,
  Microscope,
  Newspaper,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import GrafikInteraktif from "@/components/data/GrafikInteraktif";
import {
  getHitunganArtikel,
  getIndikatorPilihan,
  getTrenIngestion,
  type TrenHarian,
} from "@/lib/observatorium";

export const metadata: Metadata = {
  title: "Observatorium Data",
  description:
    "Observatorium PRATA FAKTA: indikator pilihan, hitungan artikel terbit, tren ingestion, dan pintu ke data live, riset, dan peta — semua angka bersumber dan bertanggal.",
};

// Halaman dirender per request (`instant = false`), BUKAN prerender
// statis — pola yang sama dengan /jelajahi (lihat komentar di
// src/app/jelajahi/page.tsx): halaman ini memakai komponen klien
// (GrafikInteraktif) + membaca data per request; tanpa
// connection(), skrip bootstrap $RC React bisa terpanggang tanpa
// nonce → hidrasi gagal (#419) → isi halaman ganda di DOM.
// JANGAN hapus baris ini tanpa menguji ulang halaman ini di CDP
// (h1 harus = 1, tanpa $RC error).
export const instant = false;

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

const NAMA_BULAN_SINGKAT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

const LABEL_STATUS_VERIFIKASI: Record<string, string> = {
  VERIFIED: "Terverifikasi",
  "CROSS-CHECKED": "Terkoroborasi",
  DEVELOPING: "Berkembang",
  UNCONFIRMED: "Belum terkonfirmasi",
  DISPUTED: "Disengketakan",
  CORRECTED: "Dikoreksi",
};

const LABEL_STATUS_RUN: Record<string, string> = {
  berjalan: "Berjalan",
  selesai: "Selesai",
  gagal: "Gagal",
  sebagian: "Sebagian",
};

/** "2026-11-17" → "17 November 2026"; pemecahan string murni. */
function formatTanggal(tanggal: string | null): string {
  if (!tanggal) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(tanggal);
  if (!m) return tanggal;
  const bulan = NAMA_BULAN[Number(m[2]) - 1];
  if (!bulan) return tanggal;
  return `${Number(m[3])} ${bulan} ${m[1]}`;
}

/** "2026-11-17" → "17 Nov" untuk label sumbu grafik batang. */
function formatTanggalSingkat(tanggal: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal);
  if (!m) return tanggal;
  const bulan = NAMA_BULAN_SINGKAT[Number(m[2]) - 1];
  if (!bulan) return tanggal;
  return `${Number(m[3])} ${bulan}`;
}

/** Cap waktu ISO → "17 November 2026, 21.42 WIB". */
function formatWaktu(tanggal: string | null): string {
  if (!tanggal) return "—";
  const d = new Date(tanggal);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function formatNilai(nilai: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(
    nilai,
  );
}

function formatHitungan(nilai: number, satuan: string): string {
  return `${new Intl.NumberFormat("id-ID").format(nilai)} ${satuan}`;
}

/* ============================================================
   Grafik batang SVG buatan tangan (tanpa library chart) —
   item mentah per hari. Server-rendered: tanpa JavaScript
   klien, tanpa membaca jam dinding.
   ============================================================ */

const GRAFIK_LEBAR = 560;
const GRAFIK_TINGGI = 180;
const GRAFIK_PAD_ATAS = 16;
const GRAFIK_PAD_BAWAH = 24;

function GrafikBatangTren({ perHari }: { perHari: TrenHarian[] }) {
  const maks = Math.max(0, ...perHari.map((p) => p.jumlah));
  const lebarBatang =
    perHari.length > 0
      ? (GRAFIK_LEBAR - 16) / perHari.length
      : 0;
  const tinggiBatang = (jumlah: number) =>
    maks === 0
      ? 0
      : ((GRAFIK_TINGGI - GRAFIK_PAD_ATAS - GRAFIK_PAD_BAWAH) * jumlah) /
        maks;
  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${GRAFIK_LEBAR} ${GRAFIK_TINGGI}`}
        width="100%"
        role="img"
        aria-label={`Grafik batang item mentah per hari: terbanyak ${maks} item dalam sehari, ${perHari.length} hari terakhir.`}
      >
        {perHari.map((p, i) => {
          const x = 8 + i * lebarBatang;
          const h = tinggiBatang(p.jumlah);
          const y = GRAFIK_TINGGI - GRAFIK_PAD_BAWAH - h;
          return (
            <g key={p.tanggal}>
              <rect
                x={x + 2}
                y={y}
                width={Math.max(1, lebarBatang - 4)}
                height={h}
                rx="2"
                fill="var(--accent)"
              >
                <title>
                  {formatTanggal(p.tanggal)}: {p.jumlah} item
                </title>
              </rect>
              {i % 2 === 0 && (
                <text
                  x={x + lebarBatang / 2}
                  y={GRAFIK_TINGGI - 6}
                  fontSize="10"
                  fill="var(--muted)"
                  textAnchor="middle"
                >
                  {formatTanggalSingkat(p.tanggal)}
                </text>
              )}
            </g>
          );
        })}
        <text
          x={8}
          y={12}
          fontSize="11"
          fill="var(--muted)"
        >
          {maks === 0
            ? "Belum ada item mentah pada periode ini."
            : `Tertinggi: ${maks} item dalam sehari`}
        </text>
      </svg>
      <figcaption
        style={{ fontSize: "0.92rem", color: "var(--muted)" }}
      >
        Item mentah per hari (berdasarkan waktu diambil ingestion),
        {` ${perHari.length} hari terakhir.`}
      </figcaption>
    </figure>
  );
}

export default async function Observatorium() {
  await connection();
  const [indikatorPilihan, hitungan, tren] = await Promise.all([
    getIndikatorPilihan(5),
    getHitunganArtikel(),
    getTrenIngestion(14),
  ]);
  const totalItemTren = tren.perHari.reduce((a, p) => a + p.jumlah, 0);

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-observatorium">
        <span className="hero-label">Observatorium</span>
        <h1 id="judul-observatorium">Observatorium Data</h1>
        <p>
          Satu hub untuk melihat isi PRATA FAKTA dari sisi data:
          indikator pilihan, hitungan artikel terbit, dan tren
          ingestion. Semua angka dihitung langsung dari database dan
          disertai satuan, sumber, dan tanggal — tanpa angka karangan.
        </p>
      </section>

      {/* (a) Indikator Pilihan — merakit /data, bukan menduplikasi. */}
      <section className="seksi" aria-labelledby="judul-indikator">
        <div className="seksi-kepala">
          <h2 id="judul-indikator">
            <BarChart3
              size={20}
              aria-hidden="true"
              style={{ verticalAlign: "-3px", marginRight: 6 }}
            />
            Indikator Pilihan
          </h2>
          <Link className="tombol" href="/data">
            Lihat semua indikator
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        {!indikatorPilihan.tersedia ? (
          <EmptyState
            varian="tak-tersedia"
            judul="Pusat data belum tersedia di lingkungan ini."
            pesan="Tabel indikator belum dibuat — jalankan migrasi data (v6) agar indikator tampil di sini."
          />
        ) : indikatorPilihan.indikator.length === 0 ? (
          <EmptyState
            judul="Belum ada indikator resmi yang terdaftar."
            pesan="Observatorium akan menampilkan indikator pilihan begitu redaksi mendaftarkan indikator dari sumber resmi beserta poin datanya."
            aksi={
              <Link className="tombol" href="/data">
                Buka Pusat Data
              </Link>
            }
          />
        ) : (
          <div className="grid-berita">
            {indikatorPilihan.indikator.map(({ indikator, poin }) => (
              <article className="kartu" key={indikator.id}>
                <span className="kartu-kategori">
                  {indikator.kategori}
                  {` · ${indikator.sumber_nama ?? "Sumber tidak tercatat"}`}
                </span>
                <span className="kartu-judul">{indikator.nama}</span>
                <span className="kartu-meta">
                  {indikator.nilai_terakhir !== null
                    ? `Nilai terakhir: ${formatNilai(indikator.nilai_terakhir)}${indikator.satuan ? ` ${indikator.satuan}` : ""}${indikator.tanggal_nilai_terakhir ? ` · ${formatTanggal(indikator.tanggal_nilai_terakhir)}` : ""}`
                    : "Belum ada poin data."}
                </span>
                {indikator.ringkasan_tren && (
                  <span className="kartu-teks">
                    {indikator.ringkasan_tren}
                  </span>
                )}
                <GrafikInteraktif
                  poin={poin}
                  label={indikator.nama}
                  satuan={indikator.satuan}
                />
                <span className="kartu-meta">
                  Sumber:{" "}
                  {indikator.sumber_url ? (
                    <a
                      href={indikator.sumber_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {indikator.sumber_nama ?? indikator.sumber_url}
                    </a>
                  ) : (
                    (indikator.sumber_nama ?? "—")
                  )}
                  {` · Diperbarui: ${formatTanggal(indikator.tanggal_pembaruan)}`}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* (b) Hitungan Artikel — langsung dari DB. */}
      <section className="seksi" aria-labelledby="judul-hitungan">
        <div className="seksi-kepala">
          <h2 id="judul-hitungan">
            <Newspaper
              size={20}
              aria-hidden="true"
              style={{ verticalAlign: "-3px", marginRight: 6 }}
            />
            Hitungan Artikel
          </h2>
        </div>
        {!hitungan.tersedia ? (
          <EmptyState
            varian="tak-tersedia"
            judul="Hitungan artikel belum tersedia di lingkungan ini."
            pesan="Tabel artikel belum dibuat — jalankan migrasi artikel (v2) agar hitungan tampil di sini."
          />
        ) : (
          <>
            <p>
              Total artikel terbit:{" "}
              <strong>{formatHitungan(hitungan.totalTerbit, "artikel")}</strong>
              . Hitungan di bawah ini hanya mencakup artikel berstatus
              terbit; draf tidak dihitung.
            </p>
            <div className="grid-berita">
              <article className="kartu">
                <span className="kartu-kategori">Per kategori</span>
                <span className="kartu-judul">Artikel terbit per kategori</span>
                {hitungan.perKategori.length === 0 ? (
                  <span className="kartu-teks">
                    Belum ada artikel terbit.
                  </span>
                ) : (
                  <div className="tabel-gulir">
                    <table className="tabel-data">
                      <thead>
                        <tr>
                          <th scope="col">Kategori</th>
                          <th scope="col">Artikel</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hitungan.perKategori.map((k) => (
                          <tr key={k.slug}>
                            <td>
                              <Link href={`/kategori/${k.slug}`}>
                                {k.nama}
                              </Link>
                            </td>
                            <td>{formatHitungan(k.jumlah, "artikel")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
              <article className="kartu">
                <span className="kartu-kategori">Per status verifikasi</span>
                <span className="kartu-judul">
                  Artikel terbit per status verifikasi
                </span>
                <div className="tabel-gulir">
                  <table className="tabel-data">
                    <thead>
                      <tr>
                        <th scope="col">Status verifikasi</th>
                        <th scope="col">Artikel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hitungan.perStatusVerifikasi.map((s) => (
                        <tr key={s.status}>
                          <td>
                            {LABEL_STATUS_VERIFIKASI[s.status] ?? s.status}
                          </td>
                          <td>{formatHitungan(s.jumlah, "artikel")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
              <article className="kartu">
                <span className="kartu-kategori">Per sumber</span>
                <span className="kartu-judul">Artikel terbit per sumber</span>
                {hitungan.perSumber.length === 0 ? (
                  <span className="kartu-teks">
                    Belum ada artikel terbit yang menaut ke sumber
                    terdaftar.
                  </span>
                ) : (
                  <div className="tabel-gulir">
                    <table className="tabel-data">
                      <thead>
                        <tr>
                          <th scope="col">Sumber</th>
                          <th scope="col">Artikel</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hitungan.perSumber.map((s) => (
                          <tr key={s.sumber_id}>
                            <td>{s.nama}</td>
                            <td>{formatHitungan(s.jumlah, "artikel")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            </div>
          </>
        )}
      </section>

      {/* (c) Tren Ingestion — dari pf_raw_items + pf_ingestion_runs. */}
      <section className="seksi" aria-labelledby="judul-ingestion">
        <div className="seksi-kepala">
          <h2 id="judul-ingestion">
            <Activity
              size={20}
              aria-hidden="true"
              style={{ verticalAlign: "-3px", marginRight: 6 }}
            />
            Tren Ingestion
          </h2>
        </div>
        {!tren.tersedia ? (
          <EmptyState
            varian="tak-tersedia"
            judul="Data ingestion belum tersedia di lingkungan ini."
            pesan="Tren ingestion hanya bisa dibaca dengan kunci layanan (tabel ingestion hanya boleh dibaca staf) atau sesudah migrasi ingestion (v3) dijalankan."
          />
        ) : tren.perHari.length === 0 && tren.runTerakhir.length === 0 ? (
          <EmptyState
            judul="Belum ada ingestion yang tercatat."
            pesan="Tren ingestion akan tampil begitu ingestion pertama berjalan dan menyimpan item mentah."
          />
        ) : (
          <>
            <p>
              Total item mentah yang pernah diambil:{" "}
              <strong>{formatHitungan(tren.totalItem, "item")}</strong>
              {` · ${formatHitungan(totalItemTren, "item")} item dalam ${tren.perHari.length} hari terakhir.`}
            </p>
            <div className="grid-berita">
              <article className="kartu">
                <span className="kartu-kategori">Per hari</span>
                <span className="kartu-judul">
                  Item mentah per hari, {tren.perHari.length} hari terakhir
                </span>
                <GrafikBatangTren perHari={tren.perHari} />
              </article>
              <article className="kartu">
                <span className="kartu-kategori">Run terakhir</span>
                <span className="kartu-judul">
                  Run ingestion terakhir per sumber
                </span>
                {tren.runTerakhir.length === 0 ? (
                  <span className="kartu-teks">
                    Belum ada run ingestion yang tercatat.
                  </span>
                ) : (
                  <div className="tabel-gulir">
                    <table className="tabel-data">
                      <thead>
                        <tr>
                          <th scope="col">Sumber</th>
                          <th scope="col">Status</th>
                          <th scope="col">Ditemukan</th>
                          <th scope="col">Baru</th>
                          <th scope="col">Dimulai</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tren.runTerakhir.map((r) => (
                          <tr key={r.sumber_nama}>
                            <td>{r.sumber_nama}</td>
                            <td>
                              {LABEL_STATUS_RUN[r.status] ?? r.status}
                              {r.gagal > 0
                                ? ` (${formatHitungan(r.gagal, "gagal")})`
                                : ""}
                            </td>
                            <td>{formatHitungan(r.ditemukan, "item")}</td>
                            <td>{formatHitungan(r.baru, "item")}</td>
                            <td>{formatWaktu(r.dimulai_pada)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            </div>
          </>
        )}
      </section>

      {/* (d) Pintu ke Live / Riset / Peta — tautan saja. */}
      <section className="seksi" aria-labelledby="judul-pintu">
        <div className="seksi-kepala">
          <h2 id="judul-pintu">
            <Database
              size={20}
              aria-hidden="true"
              style={{ verticalAlign: "-3px", marginRight: 6 }}
            />
            Jelajahi Lebih Dalam
          </h2>
        </div>
        <div className="grid-berita">
          <Link className="kartu kartu-artikel" href="/data/live">
            <span className="kartu-kategori">Data Live</span>
            <span className="kartu-judul">Data Live</span>
            <span className="kartu-teks">
              Gempa, cuaca, kurs, jadwal sholat, Al-Qur&apos;an, hadis,
              wilayah, dan geocoding — langsung dari API publik gratis.
            </span>
            <span className="kartu-meta">Buka Data Live →</span>
          </Link>
          <Link className="kartu kartu-artikel" href="/riset">
            <span className="kartu-kategori">Riset</span>
            <span className="kartu-judul">Riset</span>
            <span className="kartu-teks">
              Laporan riset berbasis data dan dataset yang dipakai
              redaksi.
            </span>
            <span className="kartu-meta">
              <Microscope
                size={16}
                aria-hidden="true"
                style={{ verticalAlign: "-2px", marginRight: 4 }}
              />
              Buka Riset →
            </span>
          </Link>
          <Link className="kartu kartu-artikel" href="/peta">
            <span className="kartu-kategori">Peta</span>
            <span className="kartu-judul">Peta Peristiwa</span>
            <span className="kartu-teks">
              Peristiwa dengan koordinat terverifikasi di peta dunia.
            </span>
            <span className="kartu-meta">
              <Map
                size={16}
                aria-hidden="true"
                style={{ verticalAlign: "-2px", marginRight: 4 }}
              />
              Buka Peta →
            </span>
          </Link>
          <Link className="kartu kartu-artikel" href="/data">
            <span className="kartu-kategori">Pusat Data</span>
            <span className="kartu-judul">Semua Indikator</span>
            <span className="kartu-teks">
              Seluruh indikator nasional dan global beserta grafik,
              perbandingan periode, dan tabel poin data.
            </span>
            <span className="kartu-meta">
              <Globe
                size={16}
                aria-hidden="true"
                style={{ verticalAlign: "-2px", marginRight: 4 }}
              />
              Buka Pusat Data →
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}
