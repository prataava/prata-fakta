import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import SearchBar from "@/components/SearchBar";
import EmptyState from "@/components/EmptyState";
import KartuArtikel from "@/components/artikel/KartuArtikel";
import { cariKonten, cariArtikel } from "@/lib/data";

export const metadata: Metadata = {
  title: "Pencarian",
  description: "Cari berita, topik, kategori, dan sumber di PRATA FAKTA.",
};

// Halaman pencarian bergantung pada searchParams (?q) — rute diblokir di
// server per request (pola resmi cacheComponents), bukan di-prerender.
export const instant = false;

async function HasilCari({ q }: { q: string }) {
  const [hasil, hasilArtikel] = await Promise.all([
    cariKonten(q),
    cariArtikel(q, 10),
  ]);
  const kosong =
    hasil.kategori.length === 0 &&
    hasil.sumber.length === 0 &&
    hasilArtikel.artikel.length === 0;

  return (
    <div>
      <p style={{ color: "var(--muted)", marginBottom: 16 }}>
        Hasil untuk “<strong>{q}</strong>”
        {kosong
          ? " — tidak ditemukan."
          : ` — ${hasilArtikel.artikel.length} artikel, ${hasil.kategori.length} kategori, ${hasil.sumber.length} sumber.`}
      </p>

      {hasilArtikel.artikel.length > 0 && (
        <>
          <h2 className="kartu-kategori" style={{ marginBottom: 10 }}>Artikel</h2>
          <div className="grid-berita" style={{ marginBottom: 24 }}>
            {hasilArtikel.artikel.map((a) => (
              <KartuArtikel key={a.id} artikel={a} />
            ))}
          </div>
        </>
      )}

      {!hasilArtikel.tersedia && (
        <div className="kosong" style={{ marginBottom: 24 }}>
          <h3>Pencarian artikel belum tersedia</h3>
          <p>
            Tabel artikel (Fase 2) belum dibuat di database, jadi isi artikel
            belum bisa dicari. Yang bisa dicari saat ini: kategori dan sumber
            berita terdaftar.
          </p>
        </div>
      )}

      {hasil.kategori.length > 0 && (
        <>
          <h2 className="kartu-kategori" style={{ marginBottom: 10 }}>Kategori</h2>
          <div className="grid-berita" style={{ marginBottom: 24 }}>
            {hasil.kategori.map((k) => (
              <Link key={k.id} className="kartu" href={`/kategori/${k.slug}`}>
                <span className="kartu-kategori">{k.nama}</span>
                <span className="kartu-teks">{k.deskripsi ?? "Buka kategori"}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {hasil.sumber.length > 0 && (
        <>
          <h2 className="kartu-kategori" style={{ marginBottom: 10 }}>Sumber</h2>
          <div className="grid-berita" style={{ marginBottom: 24 }}>
            {hasil.sumber.map((s) => (
              <a
                key={s.id}
                className="kartu"
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="kartu-kategori">{s.jenis}</span>
                <span className="kartu-judul">{s.nama}</span>
                <span className="kartu-meta">{s.url}</span>
              </a>
            ))}
          </div>
        </>
      )}

      {kosong && (
        <EmptyState
          judul="Tidak ada hasil"
          pesan={`Tidak ada artikel, kategori, atau sumber yang cocok dengan “${q}”.`}
          aksi={
            <Link className="tombol" href="/arsip">
              Jelajahi arsip
            </Link>
          }
        />
      )}
    </div>
  );
}

export default async function Cari({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const mentah = sp.q;
  const q = typeof mentah === "string" ? mentah.trim() : "";

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-cari">
        <span className="hero-label">Pencarian</span>
        <h1 id="judul-cari">Cari di PRATA FAKTA</h1>
        <p>Cari kategori, sumber berita, dan (mulai Fase 2) isi artikel.</p>
        <div style={{ marginTop: 18 }}>
          <SearchBar nilaiAwal={q} />
        </div>
      </section>
      <section className="seksi">
        {q ? (
          <Suspense fallback={<div className="kerangka" aria-label="Mencari…" />}>
            <HasilCari q={q} />
          </Suspense>
        ) : (
          <EmptyState
            judul="Masukkan kata kunci"
            pesan="Ketik kata kunci di atas — misalnya nama kategori seperti “Ekonomi” atau nama sumber seperti “Antara”."
          />
        )}
      </section>
    </div>
  );
}
