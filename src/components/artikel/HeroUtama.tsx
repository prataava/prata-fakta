// Hero SINEMATIK beranda (muka baru, 20 Nov 2026): berita utama
// memenuhi layar pertama — foto asli artikel layar penuh
// (gambarBesar: varian 1200px dari helper yang sama dengan
// halaman artikel), gradasi gelap dari bawah, judul serif
// raksasa menimpa foto, kicker kategori + lencana verifikasi
// di atas foto, ringkasan + tanggal + tombol baca di dalam
// area foto. Seluruh hero dapat diklik lewat tautan judul
// (stretched link) — satu tab stop saja.
// Tanpa foto (atau foto GAGAL dimuat): fallback blok gelap
// berani dengan tipografi raksasa — bukan kartu kosong.
// Client component (state gagal-muat + GambarArtikel); data
// tetap dari server (props PfArtikelRingkas). FACT SCORE
// angka tidak tampil di sini: data ringkas beranda tidak
// memuat skor (menghitungnya butuh kueri klaim per artikel)
// — lencana yang tampil adalah status verifikasi, lencana
// pemeriksaan fakta yang sama di seluruh situs.
"use client";

import Link from "next/link";
import { useState } from "react";
import type { PfArtikelRingkas } from "@/lib/data";
import { formatTanggal } from "@/lib/format";
import { gambarBesar } from "@/lib/gambar";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";
import GambarArtikel from "./GambarArtikel";
import gaya from "./HeroUtama.module.css";

/** Pecah judul jadi baris ±6 kata untuk line reveal. */
function bagiBaris(judul: string): string[] {
  const kata = judul.split(/\s+/).filter(Boolean);
  const baris: string[] = [];
  for (let i = 0; i < kata.length; i += 6) {
    baris.push(kata.slice(i, i + 6).join(" "));
  }
  return baris.length > 0 ? baris : [judul];
}

export default function HeroUtama({
  artikel,
}: {
  artikel: PfArtikelRingkas;
}) {
  const [gagal, setGagal] = useState(false);
  const kategori = artikel.kategori_slug ?? "Umum";
  const baris = bagiBaris(artikel.judul);
  const pakaiFoto = Boolean(artikel.gambar_url) && !gagal;
  const href = `/artikel/${artikel.slug}`;
  return (
    <article
      className={`${gaya.sinema}${pakaiFoto ? "" : ` ${gaya.tanpaFoto}`}`}
      aria-labelledby="hero-utama-judul"
    >
      {pakaiFoto && (
        <GambarArtikel
          src={gambarBesar(artikel.gambar_url) ?? artikel.gambar_url!}
          alt={`Ilustrasi: ${artikel.judul}`}
          varian="sinema"
          prioritas
          onGagal={() => setGagal(true)}
        />
      )}
      {!pakaiFoto && (
        <span className={gaya.kataRaksasa} aria-hidden="true">
          {kategori}
        </span>
      )}
      <div className={gaya.gradasi} aria-hidden="true" />
      <div className={gaya.isi}>
        <p className={gaya.kicker}>
          <span className={gaya.kickerUtama}>Berita Utama</span>
          <span className={gaya.kickerKategori}>{kategori}</span>
          <span className={kelasLencanaStatus(artikel.status_verifikasi)}>
            {labelStatusVerifikasi(artikel.status_verifikasi)}
          </span>
        </p>
        <h1 id="hero-utama-judul" className={gaya.judul}>
          <Link href={href} className={gaya.tautanJudul}>
            {baris.map((b, i) => (
              <span key={i} className={gaya.baris}>
                <span style={{ animationDelay: `${0.08 + i * 0.07}s` }}>
                  {b}
                </span>
              </span>
            ))}
          </Link>
        </h1>
        {artikel.ringkasan && (
          <p className={gaya.ringkasan}>{artikel.ringkasan}</p>
        )}
        <p className={gaya.meta}>
          <span>
            {formatTanggal(artikel.diterbitkan_pada, "Tanggal belum tersedia")}
          </span>
          <span className={gaya.tombolBaca}>Baca berita utama →</span>
        </p>
      </div>
    </article>
  );
}
