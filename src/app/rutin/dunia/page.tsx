import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import KartuArtikel from "@/components/artikel/KartuArtikel";
import { getArtikelPerKategori } from "@/lib/data";
import {
  formatTanggalSingkat,
  getArtikelPengetahuan,
} from "@/lib/rutin";

export const metadata: Metadata = {
  title: "Dunia Dijelaskan",
  description:
    "Pengetahuan tentang negara dan geografi, ditambah artikel terbaru kategori Dunia di PRATA FAKTA.",
};

// Halaman membaca data per request — rute diblokir di server per
// request (pola resmi cacheComponents, seperti /brief), bukan
// di-prerender.
export const instant = false;

// Topik artikel pengetahuan yang masuk "World Explained".
const TOPIK_DUNIA = ["negara", "geografi"];

export default async function RutinDunia() {
  const [pengetahuan, artikelDunia] = await Promise.all([
    getArtikelPengetahuan(TOPIK_DUNIA, 12),
    getArtikelPerKategori("dunia", 12),
  ]);
  const kosong = pengetahuan.length === 0 && artikelDunia.length === 0;

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-dunia">
        <span className="hero-label">Konten rutin · Dunia</span>
        <h1 id="judul-dunia">Dunia Dijelaskan</h1>
        <p>
          Pengetahuan tentang negara dan geografi, ditambah artikel
          terbaru kategori Dunia — semuanya dari data yang benar-benar
          terbit, bukan penjelasan karangan.
        </p>
      </section>

      {kosong ? (
        <section className="seksi">
          <EmptyState
            judul="Belum ada konten dunia"
            pesan="Belum ada artikel pengetahuan bertopik negara atau geografi yang terbit, dan belum ada artikel kategori Dunia yang terbit."
            aksi={
              <Link className="tombol tombol-primer" href="/kategori/dunia">
                Lihat kategori Dunia
              </Link>
            }
          />
        </section>
      ) : (
        <>
          <section className="seksi" aria-labelledby="seksi-dunia-pengetahuan">
            <div className="seksi-kepala">
              <h2 id="seksi-dunia-pengetahuan">Negara &amp; Geografi</h2>
              <p>
                Artikel pengetahuan terbit bertopik negara dan geografi.
              </p>
            </div>
            {pengetahuan.length === 0 ? (
              <EmptyState
                judul="Belum ada artikel pengetahuan dunia"
                pesan="Belum ada artikel pengetahuan bertopik negara atau geografi yang terbit."
              />
            ) : (
              <div className="grid-berita">
                {pengetahuan.map((a) => (
                  <Link
                    key={a.id}
                    className="kartu kartu-artikel"
                    href={`/pengetahuan/${a.slug}`}
                  >
                    <span className="kartu-kategori">
                      {a.topik ?? "Pengetahuan"}
                    </span>
                    <span className="kartu-judul">{a.judul}</span>
                    {a.ringkasan && (
                      <span className="kartu-teks">{a.ringkasan}</span>
                    )}
                    <span className="kartu-meta">
                      {a.harian_tanggal
                        ? formatTanggalSingkat(a.harian_tanggal)
                        : "Tanggal belum tersedia"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="seksi" aria-labelledby="seksi-dunia-artikel">
            <div className="seksi-kepala">
              <h2 id="seksi-dunia-artikel">Artikel Dunia terbaru</h2>
              <p>Artikel terbit kategori Dunia.</p>
            </div>
            {artikelDunia.length === 0 ? (
              <EmptyState
                judul="Belum ada artikel Dunia"
                pesan="Belum ada artikel kategori Dunia yang terbit."
              />
            ) : (
              <div className="grid-berita">
                {artikelDunia.map((a) => (
                  <KartuArtikel key={a.id} artikel={a} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
