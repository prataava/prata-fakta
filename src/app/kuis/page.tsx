import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import KuisHarian from "@/components/lanjutan/KuisHarian";
import { getKuisHarian } from "@/lib/lanjutan";

export const metadata: Metadata = {
  title: "Kuis Harian",
  description:
    "Kuis harian PRATA FAKTA: 5 pertanyaan setiap hari dari artikel dan data yang sudah terverifikasi.",
};

// Halaman kuis membaca data per request (pola cacheComponents untuk
// rute yang membaca data dinamis).
export const instant = false;

function tanggalHariIniJakarta(): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("/")
    .reverse()
    .join("-");
}

function formatTanggal(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

export default async function Kuis() {
  // Baca waktu HANYA sesudah connection() — aturan cacheComponents
  // (pola Fase 5): new Date() di jalur render tanpa connection()
  // membuat prerender gagal.
  await connection();
  const hariIni = tanggalHariIniJakarta();
  const soal = await getKuisHarian(hariIni);

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-kuis">
        <span className="hero-label">Kuis</span>
        <h1 id="judul-kuis">Kuis Harian</h1>
        <p>
          5 pertanyaan setiap hari dari artikel dan data yang sudah
          terverifikasi. Jawab satu per satu — kunci, penjelasan, dan sumber
          tampil sesudah Anda menjawab.
        </p>
        <p>
          <strong>{formatTanggal(hariIni)}</strong>
        </p>
        <p style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
          Skor hanya tampil di sesi ini.
        </p>
      </section>

      {soal.length === 0 ? (
        <section className="seksi">
          <EmptyState
            judul="Belum ada kuis hari ini."
            pesan="Redaksi belum menyiapkan 5 pertanyaan kuis untuk hari ini. Silakan kembali besok."
            aksi={
              <Link className="tombol" href="/pengetahuan">
                Baca Pengetahuan
              </Link>
            }
          />
        </section>
      ) : (
        <KuisHarian soal={soal} />
      )}
    </div>
  );
}
