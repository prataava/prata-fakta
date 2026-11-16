import type { Metadata } from "next";
import { Suspense } from "react";
import EmptyState from "@/components/EmptyState";
import PemilihWilayah from "@/components/data-live/PemilihWilayah";
import { getCuacaBmkg } from "@/lib/data-live";

export const metadata: Metadata = {
  title: "Cuaca BMKG — Data Live",
  description:
    "Prakiraan cuaca per desa dari BMKG — suhu dan cuaca per 3 jam.",
};

// Halaman data live: dibaca per request (pola cacheComponents).
export const instant = false;

const ADM4_DEFAULT = "31.71.01.1001"; // Gambir, Jakarta Pusat

function formatTanggal(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

async function Prakiraan({ adm4 }: { adm4: string }) {
  const hasil = await getCuacaBmkg(adm4);
  if (!hasil.ok) {
    return (
      <EmptyState
        varian="tak-tersedia"
        judul="Prakiraan belum tersedia"
        pesan="Sumber BMKG sedang tidak dapat dijangkau, atau kode wilayah tidak ditemukan. Coba muat lagi atau pilih wilayah lain."
      />
    );
  }
  const data = hasil.data;
  return (
    <div>
      <p style={{ color: "var(--muted)", marginBottom: 16 }}>
        Prakiraan untuk <strong>{data.desa}</strong>, {data.kecamatan},{" "}
        {data.kotkab}, {data.provinsi}
        {data.lat !== null && data.lon !== null
          ? ` (${data.lat}, ${data.lon})`
          : ""}
        .
      </p>
      {data.hari.map((h) => (
        <section
          key={h.tanggal}
          className="seksi"
          aria-labelledby={`judul-${h.tanggal}`}
        >
          <div className="seksi-kepala">
            <h2 id={`judul-${h.tanggal}`}>{formatTanggal(h.tanggal)}</h2>
          </div>
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th scope="col">Jam</th>
                  <th scope="col">Cuaca</th>
                  <th scope="col">Suhu</th>
                  <th scope="col">Kelembapan</th>
                  <th scope="col">Angin</th>
                </tr>
              </thead>
              <tbody>
                {h.jam.map((j) => (
                  <tr key={j.datetime}>
                    <td>{j.datetime.slice(11, 16)} WIB</td>
                    <td>{j.deskripsi}</td>
                    <td>{j.suhu === null ? "—" : `${j.suhu}°C`}</td>
                    <td>{j.kelembapan === null ? "—" : `${j.kelembapan}%`}</td>
                    <td>
                      {j.kecepatanAngin === null
                        ? "—"
                        : `${j.kecepatanAngin} km/jam ${j.arahAngin}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

export default async function Cuaca({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const mentah = sp.adm4;
  const adm4 =
    typeof mentah === "string" && /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(mentah)
      ? mentah
      : ADM4_DEFAULT;

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-cuaca">
        <p className="hero-label">Data Live · BMKG</p>
        <h1 id="judul-cuaca">
          Cuaca <em>per desa.</em>
        </h1>
        <p className="hero-teks">
          Prakiraan cuaca resmi BMKG sampai tingkat desa — suhu dan cuaca
          per 3 jam. Bila belum memilih wilayah, ditampilkan prakiraan
          Gambir, Jakarta Pusat.
        </p>
      </section>

      <PemilihWilayah />

      <Suspense
        fallback={
          <div>
            <div className="kerangka" role="status" aria-label="Memuat…" />
            <p role="status">Memuat prakiraan…</p>
          </div>
        }
      >
        <Prakiraan adm4={adm4} />
      </Suspense>

      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Sumber:{" "}
        <a
          href="https://www.bmkg.go.id/"
          target="_blank"
          rel="noopener noreferrer"
        >
          BMKG (api.bmkg.go.id)
        </a>
        ; daftar wilayah:{" "}
        <a
          href="https://emsifa.github.io/api-wilayah-indonesia/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Emsifa (api-wilayah-indonesia)
        </a>
        .
      </p>
    </div>
  );
}
