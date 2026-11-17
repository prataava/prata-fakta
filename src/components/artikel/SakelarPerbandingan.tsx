// Sakelar tampilan perbandingan di halaman artikel (P1-3,
// integrator): "Matriks | Bersebelahan", default tetap Matriks
// (tampilan yang sudah terverifikasi — jangan ubah default).
// Mode Bersebelahan memakai perbandingan dua artikel yang sudah
// diambil server (getPerbandinganDuaArtikel, artikel kedua =
// artikel terkait pertama). Bila artikel kedua tidak ada atau
// perbandingannya tidak tersedia, mode Bersebelahan menampilkan
// pesan jujur + tautan ke /bandingkan — bukan tabel kosong.
"use client";

import { useState } from "react";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import PerbandinganSumber from "@/components/artikel/PerbandinganSumber";
import PerbandinganBersebelahan from "@/components/artikel/PerbandinganBersebelahan";
import type {
  PerbandinganSumber as TipePerbandinganSumber,
  PerbandinganDuaArtikel,
} from "@/lib/data";

export default function SakelarPerbandingan({
  perbandingan,
  perbandinganDua,
  slug,
  slugBanding,
}: {
  perbandingan: TipePerbandinganSumber;
  perbandinganDua: PerbandinganDuaArtikel | null;
  slug: string;
  slugBanding: string | null;
}) {
  const [mode, setMode] = useState<"matriks" | "bersebelahan">("matriks");

  const tautanBanding = slugBanding
    ? `/bandingkan?a=${encodeURIComponent(slug)}&b=${encodeURIComponent(slugBanding)}`
    : `/bandingkan?a=${encodeURIComponent(slug)}`;

  return (
    <section className="seksi" aria-labelledby="seksi-perbandingan">
      <div className="seksi-kepala">
        <h2 id="seksi-perbandingan">Perbandingan</h2>
        <p>
          Matriks membandingkan klaim dalam artikel ini dengan
          sumber-sumbernya; Bersebelahan membandingkan artikel ini
          dengan liputan lain, klaim demi klaim.
        </p>
      </div>

      <div
        role="group"
        aria-label="Tampilan perbandingan"
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}
      >
        <button
          type="button"
          className="tombol"
          aria-pressed={mode === "matriks"}
          onClick={() => setMode("matriks")}
        >
          Matriks
        </button>
        <button
          type="button"
          className="tombol"
          aria-pressed={mode === "bersebelahan"}
          onClick={() => setMode("bersebelahan")}
        >
          Bersebelahan
        </button>
        <Link className="tombol tombol-hantu" href={tautanBanding}>
          Bandingkan dengan liputan lain
        </Link>
      </div>

      {mode === "matriks" ? (
        <PerbandinganSumber perbandingan={perbandingan} />
      ) : perbandinganDua && perbandinganDua.tersedia ? (
        <PerbandinganBersebelahan perbandingan={perbandinganDua} />
      ) : (
        <EmptyState
          judul="Perbandingan bersebelahan belum tersedia"
          pesan={
            slugBanding
              ? "Artikel pembanding tidak dapat dibaca saat ini (mungkin masih draf atau datanya belum tersedia). Pilih dua artikel lain dari halaman Bandingkan Liputan."
              : "Belum ada artikel terkait untuk dibandingkan dengan artikel ini. Pilih dua artikel lain dari halaman Bandingkan Liputan."
          }
          aksi={
            <Link className="tombol" href={tautanBanding}>
              Buka Bandingkan Liputan
            </Link>
          }
        />
      )}
    </section>
  );
}
