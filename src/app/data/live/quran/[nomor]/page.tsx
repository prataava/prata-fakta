import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import { getSurah } from "@/lib/data-live";

export const metadata: Metadata = {
  title: "Baca Surah — Data Live",
  description: "Baca satu surah Al-Qur'an — teks Arab dan terjemahan Indonesia.",
};

// Halaman data live: dibaca per request (pola cacheComponents).
export const instant = false;

export default async function BacaSurah({
  params,
}: {
  params: Promise<{ nomor: string }>;
}) {
  const { nomor } = await params;
  const n = Number(nomor);
  if (!Number.isInteger(n) || n < 1 || n > 114) notFound();

  const hasil = await getSurah(n);

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-surah">
        <p className="hero-label">Data Live · Surah {n}</p>
        <h1 id="judul-surah">
          {hasil.ok ? (
            <>
              {hasil.data.transliterasi} <em>({hasil.data.terjemahan})</em>
            </>
          ) : (
            <>Surah {n}</>
          )}
        </h1>
        {hasil.ok && (
          <p className="hero-teks">
            {hasil.data.namaArab} · {hasil.data.wahyu} ·{" "}
            {hasil.data.jumlahAyat} ayat
          </p>
        )}
      </section>

      {!hasil.ok ? (
        <EmptyState
          varian="tak-tersedia"
          judul="Surah belum tersedia"
          pesan="Sumber Al-Qur'an sedang tidak dapat dijangkau saat ini. Coba muat lagi beberapa saat lagi."
        />
      ) : (
        <>
          {hasil.data.tafsir && (
            <div className="artikel-ringkasan" style={{ marginBottom: 24 }}>
              {hasil.data.tafsir}
            </div>
          )}
          <div className="prosa">
            {hasil.data.ayat.map((a) => (
              <article
                key={a.nomor}
                style={{
                  marginBottom: 24,
                  paddingBottom: 24,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <p
                  lang="ar"
                  dir="rtl"
                  style={{
                    fontSize: "1.4rem",
                    lineHeight: 2,
                    marginBottom: 8,
                  }}
                >
                  {a.arab}
                </p>
                <p style={{ color: "var(--muted)", marginBottom: 4 }}>
                  {a.nomor}. {a.transliterasi}
                </p>
                <p>{a.terjemahan}</p>
              </article>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {n > 1 && (
              <Link className="tombol" href={`/data/live/quran/${n - 1}`}>
                ← Surah sebelumnya
              </Link>
            )}
            {n < 114 && (
              <Link
                className="tombol tombol-primer"
                href={`/data/live/quran/${n + 1}`}
              >
                Surah berikutnya →
              </Link>
            )}
            <Link className="tombol" href="/data/live/quran">
              Daftar surah
            </Link>
          </div>
        </>
      )}

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
