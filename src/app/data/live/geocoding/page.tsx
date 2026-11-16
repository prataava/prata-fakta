import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import EmptyState from "@/components/EmptyState";
import { getGeocoding } from "@/lib/data-live";

export const metadata: Metadata = {
  title: "Alamat ke Koordinat — Data Live",
  description:
    "Cari alamat apa pun dan dapatkan koordinat lintang-bujurnya dari OpenStreetMap (Nominatim).",
};

// Halaman data live: dibaca per request (pola cacheComponents).
export const instant = false;

async function Hasil({ q }: { q: string }) {
  const hasil = await getGeocoding(q);
  if (!hasil.ok) {
    return (
      <EmptyState
        varian="tak-tersedia"
        judul="Pencarian belum tersedia"
        pesan="Sumber Nominatim sedang tidak dapat dijangkau saat ini. Coba muat lagi beberapa saat lagi."
      />
    );
  }
  if (hasil.data.length === 0) {
    return (
      <EmptyState
        judul="Tidak ditemukan"
        pesan={`Tidak ada alamat yang cocok dengan “${q}”. Coba kata kunci lain — misalnya nama tempat + kota.`}
      />
    );
  }
  return (
    <div className="grid-berita">
      {hasil.data.map((r) => (
        <div key={`${r.lat},${r.lon}-${r.nama}`} className="kartu">
          <span className="kartu-kategori">{r.jenis}</span>
          <span className="kartu-judul">{r.nama}</span>
          <span className="kartu-teks">
            Lintang {r.lat} · Bujur {r.lon}
          </span>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <a
              className="tombol"
              href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lon}#map=16/${r.lat}/${r.lon}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Buka di peta
            </a>
            <Link
              className="tombol"
              href={`/data/live/cuaca-dunia?kota=${encodeURIComponent(r.nama.split(",")[0])}&lat=${r.lat}&lon=${r.lon}`}
            >
              Cuaca di sini
            </Link>
          </span>
        </div>
      ))}
    </div>
  );
}

export default async function Geocoding({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-geocoding">
        <p className="hero-label">Data Live · Nominatim / OpenStreetMap</p>
        <h1 id="judul-geocoding">
          Alamat <em>ke koordinat.</em>
        </h1>
        <p className="hero-teks">
          Ketik alamat, tempat, atau nama gedung — dapatkan lintang dan
          bujurnya. Pencarian dibatasi sesuai kebijakan Nominatim
          (maks 1 permintaan per detik, dengan cache).
        </p>
      </section>

      <form method="get" className="kartu-form" style={{ marginBottom: 24 }}>
        <div className="formulir">
          <label htmlFor="cari-alamat">
            Alamat atau nama tempat
            <input
              id="cari-alamat"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Contoh: Monas, Jakarta"
              autoComplete="off"
            />
          </label>
        </div>
        <button type="submit" className="tombol tombol-primer">
          Cari koordinat
        </button>
      </form>

      {q !== "" && (
        <Suspense
          fallback={
            <div>
              <div className="kerangka" role="status" aria-label="Memuat…" />
              <p role="status">Mencari “{q}”…</p>
            </div>
          }
        >
          <Hasil q={q} />
        </Suspense>
      )}

      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Sumber:{" "}
        <a
          href="https://nominatim.openstreetmap.org/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Nominatim (OpenStreetMap)
        </a>{" "}
        — Data © OpenStreetMap contributors, ODbL 1.0.
      </p>
    </div>
  );
}
