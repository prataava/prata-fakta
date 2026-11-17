import type { Metadata } from "next";
import { connection } from "next/server";
import EmptyState from "@/components/EmptyState";
import { getGempaTerbaru } from "@/lib/data-live";

export const metadata: Metadata = {
  title: "Gempa Terkini — Data Live",
  description:
    "Gempa terbaru dan daftar gempa terkini di Indonesia dari BMKG.",
};

// Halaman data live: dibaca per request (pola cacheComponents).
// + connection() di bawah (17 Nov 2026, perbaikan CSP $RT/$RV):
// getGempaTerbaru() memakai fetch ter-cache, jadi TANPA connection()
// segmen halaman selesai di shell prerender dan skrip definisi
// $RV/$RC React terpanggang TANPA nonce → CSP memblokir → $RC
// undefined → hidrasi gagal (#419) → isi ganda (h1=2). connection()
// menunda segmen sampai request, jadi definisi $RV/$RC diterbitkan
// saat resume DENGAN nonce. JANGAN hapus connection() tanpa menguji
// ulang halaman ini di CDP.
export const instant = false;

export default async function Gempa() {
  await connection();
  const hasil = await getGempaTerbaru();

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-gempa">
        <p className="hero-label">Data Live · BMKG</p>
        <h1 id="judul-gempa">
          Gempa <em>terkini.</em>
        </h1>
        <p className="hero-teks">
          Gempa terbaru dan daftar gempa terkini di Indonesia, langsung
          dari BMKG. Diperbarui tiap 5 menit (cache).
        </p>
      </section>

      {!hasil.ok || (hasil.data.terbaru === null && hasil.data.daftar.length === 0) ? (
        <EmptyState
          varian="tak-tersedia"
          judul="Data gempa belum tersedia"
          pesan="Sumber BMKG sedang tidak dapat dijangkau saat ini. Coba muat lagi beberapa saat lagi."
        />
      ) : (
        <>
          {hasil.data.terbaru && (
            <section className="seksi" aria-labelledby="judul-terbaru">
              <div className="seksi-kepala">
                <h2 id="judul-terbaru">Gempa terbaru</h2>
              </div>
              <div className="kartu">
                <span className="kartu-kategori">
                  Magnitudo {hasil.data.terbaru.magnitude}
                </span>
                <span className="kartu-judul">
                  {hasil.data.terbaru.wilayah}
                </span>
                <span className="kartu-teks">
                  {hasil.data.terbaru.tanggal} · {hasil.data.terbaru.jam}
                </span>
                <span className="kartu-meta">
                  {hasil.data.terbaru.lintang} · {hasil.data.terbaru.bujur} ·{" "}
                  Kedalaman {hasil.data.terbaru.kedalaman}
                </span>
                {hasil.data.terbaru.potensi && (
                  <span className="kartu-teks">
                    {hasil.data.terbaru.potensi}
                  </span>
                )}
                {hasil.data.terbaru.dirasakan && (
                  <span className="kartu-meta">
                    Dirasakan: {hasil.data.terbaru.dirasakan}
                  </span>
                )}
                {hasil.data.terbaru.shakemap && (
                  <a
                    className="tombol"
                    href={`https://data.bmkg.go.id/DataMKG/TEWS/${hasil.data.terbaru.shakemap}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ marginTop: 12 }}
                  >
                    Lihat Shakemap (BMKG)
                  </a>
                )}
              </div>
            </section>
          )}

          {hasil.data.daftar.length > 0 && (
            <section className="seksi" aria-labelledby="judul-daftar">
              <div className="seksi-kepala">
                <h2 id="judul-daftar">Gempa terkini lainnya</h2>
              </div>
              <div className="grid-berita">
                {hasil.data.daftar.map((g, i) => (
                  <div key={`${g.datetime}-${i}`} className="kartu">
                    <span className="kartu-kategori">
                      Magnitudo {g.magnitude}
                    </span>
                    <span className="kartu-judul">{g.wilayah}</span>
                    <span className="kartu-teks">
                      {g.tanggal} · {g.jam}
                    </span>
                    <span className="kartu-meta">
                      Kedalaman {g.kedalaman}
                      {g.dirasakan ? ` · Dirasakan: ${g.dirasakan}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Sumber:{" "}
        <a
          href="https://data.bmkg.go.id/"
          target="_blank"
          rel="noopener noreferrer"
        >
          BMKG (data.bmkg.go.id)
        </a>{" "}
        — data gempa ditampilkan apa adanya dari BMKG.
      </p>
    </div>
  );
}
