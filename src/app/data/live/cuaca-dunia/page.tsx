import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import EmptyState from "@/components/EmptyState";
import { getCuacaDunia, labelKodeCuaca } from "@/lib/data-live";

export const metadata: Metadata = {
  title: "Cuaca Dunia — Data Live",
  description:
    "Cuaca saat ini dan 7 hari ke depan untuk kota mana pun di dunia dari Open-Meteo.",
};

// Halaman data live: dibaca per request (pola cacheComponents).
export const instant = false;

const KOTA = [
  { nama: "Jakarta", lat: -6.2, lon: 106.8 },
  { nama: "Bandung", lat: -6.9, lon: 107.6 },
  { nama: "Surabaya", lat: -7.25, lon: 112.75 },
  { nama: "Medan", lat: 3.59, lon: 98.67 },
  { nama: "Makassar", lat: -5.14, lon: 119.42 },
  { nama: "Denpasar", lat: -8.67, lon: 115.21 },
  { nama: "Singapura", lat: 1.35, lon: 103.82 },
  { nama: "Tokyo", lat: 35.68, lon: 139.69 },
] as const;

function formatTanggal(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jakarta",
  });
}

async function CuacaKota({ lat, lon }: { lat: number; lon: number }) {
  const hasil = await getCuacaDunia(lat, lon);
  if (!hasil.ok) {
    return (
      <EmptyState
        varian="tak-tersedia"
        judul="Cuaca belum tersedia"
        pesan="Sumber Open-Meteo sedang tidak dapat dijangkau saat ini. Coba muat lagi beberapa saat lagi."
      />
    );
  }
  const data = hasil.data;
  return (
    <div>
      <div className="kartu" style={{ marginBottom: 24 }}>
        <span className="kartu-kategori">Saat ini</span>
        <span className="kartu-judul">
          {data.suhu === null ? "—" : `${data.suhu}°C`} ·{" "}
          {labelKodeCuaca(data.kodeCuaca)}
        </span>
        <span className="kartu-teks">
          Kelembapan {data.kelembapan === null ? "—" : `${data.kelembapan}%`} ·
          Angin {data.angin === null ? "—" : `${data.angin} km/jam`}
        </span>
        {data.waktu && (
          <span className="kartu-meta">Diukur {data.waktu.replace("T", " ")}</span>
        )}
      </div>

      {data.harian.length > 0 && (
        <section className="seksi" aria-labelledby="judul-harian">
          <div className="seksi-kepala">
            <h2 id="judul-harian">7 hari ke depan</h2>
          </div>
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th scope="col">Tanggal</th>
                  <th scope="col">Cuaca</th>
                  <th scope="col">Min</th>
                  <th scope="col">Maks</th>
                </tr>
              </thead>
              <tbody>
                {data.harian.map((h) => (
                  <tr key={h.tanggal}>
                    <td>{formatTanggal(h.tanggal)}</td>
                    <td>{labelKodeCuaca(h.kode)}</td>
                    <td>{h.min === null ? "—" : `${h.min}°C`}</td>
                    <td>{h.maks === null ? "—" : `${h.maks}°C`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export default async function CuacaDunia({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const latMentah = typeof sp.lat === "string" ? Number(sp.lat) : NaN;
  const lonMentah = typeof sp.lon === "string" ? Number(sp.lon) : NaN;
  const lat = Number.isFinite(latMentah) && latMentah >= -90 && latMentah <= 90 ? latMentah : -6.2;
  const lon = Number.isFinite(lonMentah) && lonMentah >= -180 && lonMentah <= 180 ? lonMentah : 106.8;
  const namaKota = typeof sp.kota === "string" ? sp.kota : "Jakarta";

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-cuaca-dunia">
        <p className="hero-label">Data Live · Open-Meteo</p>
        <h1 id="judul-cuaca-dunia">
          Cuaca <em>dunia.</em>
        </h1>
        <p className="hero-teks">
          Cuaca saat ini dan 7 hari ke depan untuk {namaKota} ({lat},{" "}
          {lon}) — dari model cuaca terbuka Open-Meteo, tanpa kunci.
        </p>
      </section>

      <div className="formulir" style={{ marginBottom: 24 }}>
        <p style={{ color: "var(--muted)", marginBottom: 8 }}>
          Pilih kota:
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {KOTA.map((k) => (
            <Link
              key={k.nama}
              className="chip"
              aria-current={k.nama === namaKota ? "true" : undefined}
              href={`/data/live/cuaca-dunia?kota=${encodeURIComponent(k.nama)}&lat=${k.lat}&lon=${k.lon}`}
            >
              {k.nama}
            </Link>
          ))}
        </div>
      </div>

      <Suspense
        fallback={
          <div>
            <div className="kerangka" role="status" aria-label="Memuat…" />
            <p role="status">Memuat cuaca…</p>
          </div>
        }
      >
        <CuacaKota lat={lat} lon={lon} />
      </Suspense>

      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Sumber:{" "}
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open-Meteo (open-meteo.com)
        </a>{" "}
        — data cuaca ditampilkan apa adanya dari Open-Meteo.
      </p>
    </div>
  );
}
