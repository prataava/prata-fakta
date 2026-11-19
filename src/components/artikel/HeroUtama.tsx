// Hero foto-led beranda (Fase 4 redesign, ala Lando Norris):
// berita utama pertama tampil dengan gambar BESAR-nya (gambar_url
// asli dari data; tanpa gambar = fallback editorial terdesain,
// bukan gambar stok acak) + headline dengan line reveal.
// Client component (animasi + GambarArtikel); data tetap dari
// server (props PfArtikelRingkas).
"use client";

import Link from "next/link";
import type { PfArtikelRingkas } from "@/lib/data";
import { formatTanggal } from "@/lib/format";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";
import { Reveal } from "@/components/motion";
import GambarArtikel from "./GambarArtikel";
import gaya from "./HeroUtama.module.css";

/** Pecah judul jadi baris ±7 kata untuk line reveal. */
function bagiBaris(judul: string): string[] {
  const kata = judul.split(/\s+/).filter(Boolean);
  const baris: string[] = [];
  for (let i = 0; i < kata.length; i += 7) {
    baris.push(kata.slice(i, i + 7).join(" "));
  }
  return baris.length > 0 ? baris : [judul];
}

export default function HeroUtama({
  artikel,
}: {
  artikel: PfArtikelRingkas;
}) {
  const kategori = artikel.kategori_slug ?? "Umum";
  const baris = bagiBaris(artikel.judul);
  return (
    <article className={gaya.heroUtama} aria-labelledby="hero-utama-judul">
      <Reveal>
        {artikel.gambar_url ? (
          <Link
            href={`/artikel/${artikel.slug}`}
            className={gaya.tautanGambar}
            aria-label={`Baca berita utama: ${artikel.judul}`}
          >
            <GambarArtikel
              src={artikel.gambar_url}
              alt={`Ilustrasi: ${artikel.judul}`}
              varian="hero"
              prioritas
            />
          </Link>
        ) : (
          <div
            className="placeholder-gambar placeholder-gambar-besar"
            aria-hidden="true"
          >
            <span>{kategori}</span>
          </div>
        )}
      </Reveal>
      <div className={gaya.isi}>
        <p className={gaya.meta}>
          <span className="hero-label" style={{ marginBottom: 0 }}>
            Berita Utama
          </span>
          <span className={gaya.metaPisah} aria-hidden="true">
            ·
          </span>
          <span>{kategori}</span>
          <span className={gaya.metaPisah} aria-hidden="true">
            ·
          </span>
          <span className={kelasLencanaStatus(artikel.status_verifikasi)}>
            {labelStatusVerifikasi(artikel.status_verifikasi)}
          </span>
          <span className={gaya.metaPisah} aria-hidden="true">
            ·
          </span>
          <span>{formatTanggal(artikel.diterbitkan_pada, "Tanggal belum tersedia")}</span>
        </p>
        <h2 id="hero-utama-judul" className={gaya.judul}>
          <Link href={`/artikel/${artikel.slug}`}>
            {baris.map((b, i) => (
              <span key={i} className={gaya.baris}>
                <span
                  style={{ animationDelay: `${0.08 + i * 0.07}s` }}
                >
                  {b}
                </span>
              </span>
            ))}
          </Link>
        </h2>
        {artikel.ringkasan && (
          <p className={gaya.ringkasan}>{artikel.ringkasan}</p>
        )}
        <p>
          <Link className="tombol tombol-primer" href={`/artikel/${artikel.slug}`}>
            Baca berita utama →
          </Link>
        </p>
      </div>
    </article>
  );
}
