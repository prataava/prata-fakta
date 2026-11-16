import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import { getWilayah } from "@/lib/data-live";

export const metadata: Metadata = {
  title: "Wilayah Indonesia — Data Live",
  description:
    "Penjelajah wilayah Indonesia: provinsi, kabupaten/kota, kecamatan, sampai desa.",
};

// Halaman data live: dibaca per request (pola cacheComponents).
export const instant = false;

type Tingkat = "provinsi" | "kabupaten" | "kecamatan" | "desa";

const TINGKAT_BERIKUTNYA: Record<Tingkat, Tingkat | null> = {
  provinsi: "kabupaten",
  kabupaten: "kecamatan",
  kecamatan: "desa",
  desa: null,
};

const LABEL_TINGKAT: Record<Tingkat, string> = {
  provinsi: "Provinsi",
  kabupaten: "Kabupaten / Kota",
  kecamatan: "Kecamatan",
  desa: "Desa / Kelurahan",
};

export default async function Wilayah({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tingkatMentah =
    typeof sp.tingkat === "string" ? sp.tingkat : "provinsi";
  const tingkat: Tingkat =
    tingkatMentah === "kabupaten" ||
    tingkatMentah === "kecamatan" ||
    tingkatMentah === "desa"
      ? tingkatMentah
      : "provinsi";
  const indukId =
    typeof sp.induk === "string" && /^\d+$/.test(sp.induk) ? sp.induk : undefined;
  const namaInduk = typeof sp.nama === "string" ? sp.nama : null;

  const hasil = await getWilayah(tingkat, indukId);
  const berikut = TINGKAT_BERIKUTNYA[tingkat];

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-wilayah">
        <p className="hero-label">Data Live · Emsifa</p>
        <h1 id="judul-wilayah">
          Wilayah <em>Indonesia.</em>
        </h1>
        <p className="hero-teks">
          {namaInduk
            ? `Menampilkan ${LABEL_TINGKAT[tingkat].toLowerCase()} di ${namaInduk}.`
            : "Jelajahi wilayah Indonesia dari provinsi sampai desa. Klik satu baris untuk masuk ke tingkat berikutnya."}
        </p>
      </section>

      {namaInduk && (
        <p style={{ marginBottom: 16 }}>
          <Link className="tombol" href="/data/live/wilayah">
            ← Kembali ke provinsi
          </Link>
        </p>
      )}

      {!hasil.ok ? (
        <EmptyState
          varian="tak-tersedia"
          judul="Daftar wilayah belum tersedia"
          pesan="Sumber wilayah sedang tidak dapat dijangkau saat ini. Coba muat lagi beberapa saat lagi."
        />
      ) : hasil.data.length === 0 ? (
        <EmptyState
          judul="Tidak ada wilayah"
          pesan="Tidak ada wilayah pada tingkat ini."
        />
      ) : (
        <div className="grid-berita">
          {hasil.data.map((w) => (
            <Link
              key={w.id}
              className="kartu"
              href={
                berikut
                  ? `/data/live/wilayah?tingkat=${berikut}&induk=${w.id}&nama=${encodeURIComponent(w.nama)}`
                  : `/data/live/cuaca?adm4=${w.id.slice(0, 2)}.${w.id.slice(2, 4)}.${w.id.slice(4, 6)}.${w.id.slice(6, 10)}`
              }
            >
              <span className="kartu-kategori">
                {LABEL_TINGKAT[tingkat]} · {w.id}
              </span>
              <span className="kartu-judul">{w.nama}</span>
              <span className="kartu-teks">
                {berikut
                  ? `Lihat ${LABEL_TINGKAT[berikut].toLowerCase()} di ${w.nama} →`
                  : `Lihat prakiraan cuaca BMKG di ${w.nama} →`}
              </span>
            </Link>
          ))}
        </div>
      )}

      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Sumber:{" "}
        <a
          href="https://emsifa.github.io/api-wilayah-indonesia/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Emsifa — api-wilayah-indonesia
        </a>{" "}
        (data wilayah Kemendagri).
      </p>
    </div>
  );
}
