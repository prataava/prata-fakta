import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import KartuArtikel from "@/components/artikel/KartuArtikel";
import {
  formatTanggalPanjang,
  getArtikelSejak,
  getBriefSejak,
} from "@/lib/rutin";

export const metadata: Metadata = {
  title: "Weekly Recap",
  description:
    "Artikel terbit dan Daily Brief dalam 7 hari terakhir di PRATA FAKTA.",
};

// Halaman membaca data per request — rute diblokir di server per
// request (pola resmi cacheComponents, seperti /brief), bukan
// di-prerender.
export const instant = false;

export default async function RutinMingguan() {
  // getArtikelSejak/getBriefSejak membaca tanggal hari ini — hanya
  // sesudah connection() (aturan cacheComponents, pola Fase 5).
  await connection();
  const [artikel, brief] = await Promise.all([
    getArtikelSejak(7, 20),
    getBriefSejak(7),
  ]);
  const kosong = artikel.length === 0 && brief.length === 0;

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-mingguan">
        <span className="hero-label">Konten rutin · Mingguan</span>
        <h1 id="judul-mingguan">Weekly Recap</h1>
        <p>
          Artikel terbit dan Daily Brief dalam 7 hari terakhir — daftar
          dan tautan saja, tanpa ringkasan karangan.
        </p>
      </section>

      {kosong ? (
        <section className="seksi">
          <EmptyState
            judul="Belum ada konten dalam 7 hari terakhir"
            pesan="Tidak ada artikel yang terbit dan tidak ada Daily Brief yang terbit dalam 7 hari terakhir, jadi belum ada rekap mingguan yang bisa ditampilkan."
            aksi={
              <Link className="tombol tombol-primer" href="/arsip">
                Lihat arsip artikel
              </Link>
            }
          />
        </section>
      ) : (
        <>
          <section className="seksi" aria-labelledby="seksi-mingguan-artikel">
            <div className="seksi-kepala">
              <h2 id="seksi-mingguan-artikel">Artikel 7 hari terakhir</h2>
              <p>{artikel.length} artikel terbit.</p>
            </div>
            {artikel.length === 0 ? (
              <EmptyState
                judul="Tidak ada artikel 7 hari terakhir"
                pesan="Tidak ada artikel yang terbit dalam 7 hari terakhir."
              />
            ) : (
              <div className="grid-berita">
                {artikel.map((a) => (
                  <KartuArtikel key={a.id} artikel={a} />
                ))}
              </div>
            )}
          </section>

          <section className="seksi" aria-labelledby="seksi-mingguan-brief">
            <div className="seksi-kepala">
              <h2 id="seksi-mingguan-brief">Daily Brief 7 hari terakhir</h2>
              <p>{brief.length} edisi terbit.</p>
            </div>
            {brief.length === 0 ? (
              <EmptyState
                judul="Tidak ada Daily Brief 7 hari terakhir"
                pesan="Tidak ada Daily Brief yang terbit dalam 7 hari terakhir."
              />
            ) : (
              <div className="grid-berita">
                {brief.map((b) => (
                  <Link
                    key={b.id}
                    className="kartu kartu-artikel"
                    href="/brief"
                  >
                    <span className="kartu-kategori">Daily Brief</span>
                    <span className="kartu-judul">
                      Edisi {formatTanggalPanjang(b.tanggal)}
                    </span>
                    <span className="kartu-teks">
                      Daily Brief edisi {formatTanggalPanjang(b.tanggal)}.
                      Buka halaman Daily Brief untuk membaca edisi terbaru.
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
