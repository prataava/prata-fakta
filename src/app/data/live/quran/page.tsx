import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import EmptyState from "@/components/EmptyState";
import { getDaftarSurah } from "@/lib/data-live";

export const metadata: Metadata = {
  title: "Al-Qur'an — Data Live",
  description:
    "Daftar 114 surah Al-Qur'an — teks Arab, transliterasi, dan terjemahan Indonesia.",
};

// Halaman data live: dibaca per request (pola cacheComponents).
export const instant = false;

// 30 surah per halaman: daftar penuh (114 kartu) membuat payload
// RSC terlalu besar sehingga React menduplikasi isi halaman saat
// hidrasi (diukur CDP 16 Nov 2026: h1 ganda + 228 kartu). Paginasi
// menjaga payload tetap kecil; semua surah tetap terjangkau.
const PER_HALAMAN = 30;

async function DaftarSurah({ halaman }: { halaman: number }) {
  const hasil = await getDaftarSurah();
  if (!hasil.ok) {
    return (
      <EmptyState
        varian="tak-tersedia"
        judul="Daftar surah belum tersedia"
        pesan="Sumber Al-Qur'an sedang tidak dapat dijangkau saat ini. Coba muat lagi beberapa saat lagi."
      />
    );
  }
  const totalHalaman = Math.ceil(hasil.data.length / PER_HALAMAN);
  const halamanAktif = Math.min(Math.max(halaman, 1), totalHalaman);
  const mulai = (halamanAktif - 1) * PER_HALAMAN;
  const surah = hasil.data.slice(mulai, mulai + PER_HALAMAN);
  return (
    <div>
      <div className="grid-berita">
        {surah.map((s) => (
          <Link
            key={s.nomor}
            className="kartu"
            href={`/data/live/quran/${s.nomor}`}
          >
            <span className="kartu-kategori">
              {s.nomor} · {s.wahyu} · {s.jumlahAyat} ayat
            </span>
            <span className="kartu-judul" lang="ar" dir="rtl">
              {s.namaArab}
            </span>
            <span className="kartu-teks">
              {s.transliterasi} — {s.terjemahan}
            </span>
          </Link>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: 24,
        }}
        aria-label="Halaman daftar surah"
      >
        {halamanAktif > 1 && (
          <Link
            className="tombol"
            href={`/data/live/quran?halaman=${halamanAktif - 1}`}
          >
            ← Sebelumnya
          </Link>
        )}
        {Array.from({ length: totalHalaman }, (_, i) => i + 1).map((h) => (
          <Link
            key={h}
            className="chip"
            aria-current={h === halamanAktif ? "true" : undefined}
            href={`/data/live/quran?halaman=${h}`}
          >
            {h}
          </Link>
        ))}
        {halamanAktif < totalHalaman && (
          <Link
            className="tombol tombol-primer"
            href={`/data/live/quran?halaman=${halamanAktif + 1}`}
          >
            Berikutnya →
          </Link>
        )}
      </div>
    </div>
  );
}

export default async function Quran({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const halamanMentah =
    typeof sp.halaman === "string" ? Number(sp.halaman) : NaN;
  const halaman =
    Number.isInteger(halamanMentah) && halamanMentah >= 1
      ? halamanMentah
      : 1;

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-quran">
        <p className="hero-label">Data Live · api.quran.gading.dev</p>
        <h1 id="judul-quran">
          Al-Qur&apos;an <em>per surah.</em>
        </h1>
        <p className="hero-teks">
          114 surah — teks Arab, transliterasi, dan terjemahan Indonesia.
          Pilih surah untuk membacanya.
        </p>
      </section>

      <Suspense
        fallback={
          <div>
            <div className="kerangka" role="status" aria-label="Memuat…" />
            <p role="status">Memuat daftar surah…</p>
          </div>
        }
      >
        <DaftarSurah halaman={halaman} />
      </Suspense>

      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Sumber:{" "}
        <a
          href="https://api.quran.gading.dev/"
          target="_blank"
          rel="noopener noreferrer"
        >
          api.quran.gading.dev
        </a>
        .
      </p>
    </div>
  );
}
