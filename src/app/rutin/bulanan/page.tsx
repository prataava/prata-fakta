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
  title: "Rekap Bulanan",
  description:
    "Artikel terbit dan Daily Brief dalam 30 hari terakhir di PRATA FAKTA.",
};

// Halaman membaca data per request — rute diblokir di server per
// request (pola resmi cacheComponents, seperti /brief), bukan
// di-prerender.
export const instant = false;

export default async function RutinBulanan() {
  // getArtikelSejak/getBriefSejak membaca tanggal hari ini — hanya
  // sesudah connection() (aturan cacheComponents, pola Fase 5).
  await connection();
  const [artikel, brief] = await Promise.all([
    getArtikelSejak(30, 20),
    getBriefSejak(30),
  ]);
  const kosong = artikel.length === 0 && brief.length === 0;

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-bulanan">
        <span className="hero-label">Konten rutin · Bulanan</span>
        <h1 id="judul-bulanan">Rekap Bulanan</h1>
        <p>
          Artikel terbit dan Daily Brief dalam 30 hari terakhir — rekap
          sebulan dalam satu halaman, daftar dan tautan saja, tanpa
          ringkasan karangan.
        </p>
      </section>

      {kosong ? (
        <section className="seksi">
          <EmptyState
            judul="Belum ada konten dalam 30 hari terakhir"
            pesan="Tidak ada artikel yang terbit dan tidak ada Daily Brief yang terbit dalam 30 hari terakhir, jadi belum ada rekap bulanan yang bisa ditampilkan."
            aksi={
              <Link className="tombol tombol-primer" href="/arsip">
                Lihat arsip artikel
              </Link>
            }
          />
        </section>
      ) : (
        <>
          <section className="seksi" aria-labelledby="seksi-bulanan-artikel">
            <div className="seksi-kepala">
              <h2 id="seksi-bulanan-artikel">Artikel 30 hari terakhir</h2>
              <p>{artikel.length} artikel terbit terbaru.</p>
            </div>
            {artikel.length === 0 ? (
              <EmptyState
                judul="Tidak ada artikel 30 hari terakhir"
                pesan="Tidak ada artikel yang terbit dalam 30 hari terakhir."
              />
            ) : (
              <div className="grid-berita">
                {artikel.map((a) => (
                  <KartuArtikel key={a.id} artikel={a} />
                ))}
              </div>
            )}
          </section>

          <section className="seksi" aria-labelledby="seksi-bulanan-brief">
            <div className="seksi-kepala">
              <h2 id="seksi-bulanan-brief">Daily Brief 30 hari terakhir</h2>
              <p>{brief.length} edisi terbit.</p>
            </div>
            {brief.length === 0 ? (
              <EmptyState
                judul="Tidak ada Daily Brief 30 hari terakhir"
                pesan="Tidak ada Daily Brief yang terbit dalam 30 hari terakhir."
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
