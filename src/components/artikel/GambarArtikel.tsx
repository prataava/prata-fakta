// Gambar artikel dengan skeleton saat memuat (Fase 4 redesign).
// <img> tetap memakai kelas global .kartu-gambar (rasio 16:9,
// crop tengah) sehingga tinggi kartu tidak bergeser; selama
// gambar belum termuat, lapisan placeholder menutupinya (bukan
// ruang kosong). Opacity saja yang dianimasikan — tanpa geser
// tata letak. Gagal muat = placeholder tetap tampil, bukan alt
// mentah yang merusak kartu.
"use client";

import { useState } from "react";
import gaya from "./GambarArtikel.module.css";

export default function GambarArtikel({
  src,
  alt,
  fitur,
  varian,
  prioritas,
  onGagal,
}: {
  src: string;
  alt: string;
  /** Kartu fitur (Beranda): gambar memenuhi tinggi kartu. */
  fitur?: boolean;
  /** "hero": rasio lebar 21:9 di desktop (hero beranda lama).
   * "sinema": pembungkus absolut memenuhi induk (hero sinematik
   * muka baru — foto layar penuh di belakang gradasi + judul). */
  varian?: "kartu" | "hero" | "sinema";
  /** Gambar utama halaman (LCP): muat segera, bukan lazy. */
  prioritas?: boolean;
  /** Dipanggil bila gambar GAGAL dimuat (mis. hero sinematik
   * beralih ke fallback blok gelap). Opsional. */
  onGagal?: () => void;
}) {
  const [muat, setMuat] = useState(false);
  return (
    <span
      className={`${gaya.pembungkus}${fitur ? ` ${gaya.pembungkusFitur}` : ""}${varian === "hero" ? ` ${gaya.pembungkusHero}` : ""}${varian === "sinema" ? ` ${gaya.pembungkusSinema}` : ""}`}
    >
      {!muat && (
        <span className={gaya.kerangka} aria-hidden="true">
          <span>Memuat gambar…</span>
        </span>
      )}
      {/* next/image tidak dipakai: gambar_url berasal dari host
          eksternal mana pun (lihat KartuArtikel). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="kartu-gambar"
        src={src}
        alt={alt}
        loading={prioritas ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setMuat(true)}
        onError={() => {
          setMuat(true);
          onGagal?.();
        }}
        style={{ opacity: muat ? 1 : 0 }}
      />
    </span>
  );
}
