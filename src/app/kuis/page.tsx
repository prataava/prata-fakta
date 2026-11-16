import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import KuisHarian from "@/components/lanjutan/KuisHarian";
import {
  getKuisHarian,
  getRiwayatSkor,
  KuisBelumTersediaError,
  type PfKuisSoalPublik,
} from "@/lib/lanjutan";
import { createClient } from "@/lib/supabase/server";

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
  // P0-4 (B-T3, v13): getKuisHarian melempar KuisBelumTersediaError
  // bila service key belum diatur / tabel jawaban v13 belum dibuat —
  // tampilkan pesan jujur "kuis belum tersedia" (EmptyState), BUKAN
  // halaman error Next. Galat lain tetap dilempar (jangan menutupi
  // bug nyata). Pola sama dipakai akademi/[slug]/page.tsx.
  let soal: Awaited<ReturnType<typeof getKuisHarian>> = [];
  let kuisBelumTersedia = false;
  try {
    soal = await getKuisHarian(hariIni);
  } catch (err) {
    if (err instanceof KuisBelumTersediaError) {
      kuisBelumTersedia = true;
    } else {
      throw err;
    }
  }
  // Kunci jawaban TIDAK PERNAH dikirim ke klien (T1, Fase 7):
  // petakan ke tipe publik yang menghilangkan field `kunci`.
  // Pemeriksaan jawaban dilakukan server via POST /api/kuis/jawab.
  const soalPublik: PfKuisSoalPublik[] = soal.map((s) => ({
    id: s.id,
    tanggal: s.tanggal,
    pertanyaan: s.pertanyaan,
    opsi: s.opsi,
    penjelasan: s.penjelasan,
    sumber_url: s.sumber_url,
    sumber_nama: s.sumber_nama,
    artikel_id: s.artikel_id,
  }));

  // Pengguna login mendapat riwayat skor (Fase 7 — migrasi v7);
  // pengguna anonim tetap bisa bermain, skornya hanya tampil di sesi.
  let masuk = false;
  let riwayat: Awaited<ReturnType<typeof getRiwayatSkor>> = [];
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      masuk = true;
      riwayat = await getRiwayatSkor(data.user.id, 7);
    }
  } catch {
    masuk = false;
  }

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
          {masuk
            ? "Skor Anda tersimpan dan tampil di riwayat di bawah."
            : "Skor hanya tampil di sesi ini. Masuk untuk menyimpan riwayat skor."}
        </p>
      </section>

      {kuisBelumTersedia ? (
        <section className="seksi">
          <EmptyState
            judul="Kuis belum tersedia."
            pesan="Layanan kuis sedang belum siap (konfigurasi server belum lengkap). Silakan kembali lagi nanti."
            aksi={
              <Link className="tombol" href="/pengetahuan">
                Baca Pengetahuan
              </Link>
            }
          />
        </section>
      ) : soalPublik.length === 0 ? (
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
        <KuisHarian soal={soalPublik} tanggal={hariIni} masuk={masuk} />
      )}

      {masuk && (
        <section className="seksi" aria-labelledby="judul-riwayat-skor">
          <div className="seksi-kepala">
            <h2 id="judul-riwayat-skor">Riwayat Skor Anda</h2>
            <p>7 hari terakhir. Main ulang di hari yang sama menimpa skor sebelumnya.</p>
          </div>
          {riwayat.length === 0 ? (
            <p className="artikel-meta-kecil">
              Belum ada skor tersimpan — selesaikan kuis hari ini untuk
              mencatat skor pertama Anda.
            </p>
          ) : (
            <div className="tabel-gulir">
              <table className="tabel-data">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>Benar</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {riwayat.map((r) => (
                    <tr key={r.tanggal}>
                      <td>{formatTanggal(r.tanggal)}</td>
                      <td>{r.benar}</td>
                      <td>{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
