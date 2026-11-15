import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import { getIndikator, getPoinIndikator, type PfPoinIndikator } from "@/lib/lanjutan";

export const metadata: Metadata = {
  title: "Pusat Data",
  description:
    "Pusat data PRATA FAKTA: indikator nasional dan global dari sumber resmi, lengkap dengan grafik tren dan tabel poin data.",
};

// Halaman data membaca data per request (pola cacheComponents untuk
// rute yang membaca data dinamis dan searchParams).
export const instant = false;

const KATEGORI_DATA = [
  { slug: "nasional", nama: "Nasional" },
  { slug: "global", nama: "Global" },
  { slug: "penduduk", nama: "Penduduk" },
  { slug: "pendidikan", nama: "Pendidikan" },
  { slug: "ekonomi", nama: "Ekonomi" },
  { slug: "energi", nama: "Energi" },
  { slug: "lingkungan", nama: "Lingkungan" },
] as const;

function formatTanggal(tanggal: string | null): string {
  if (!tanggal) return "—";
  const d = new Date(`${tanggal}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function formatNilai(nilai: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(
    nilai,
  );
}

/** Grafik garis SVG buatan tangan (tanpa library chart). */
function GrafikGaris({ poin, label }: { poin: PfPoinIndikator[]; label: string }) {
  if (poin.length < 2) {
    return (
      <p style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
        Grafik membutuhkan minimal 2 poin data; indikator ini baru punya{" "}
        {poin.length} poin.
      </p>
    );
  }
  const lebar = 560;
  const tinggi = 180;
  const padKiri = 8;
  const padKanan = 8;
  const padAtas = 12;
  const padBawah = 24;
  const nilai = poin.map((p) => p.nilai);
  const min = Math.min(...nilai);
  const maks = Math.max(...nilai);
  const rentang = maks - min || 1;
  const x = (i: number) =>
    padKiri + (i * (lebar - padKiri - padKanan)) / (poin.length - 1);
  const y = (v: number) =>
    padAtas + (1 - (v - min) / rentang) * (tinggi - padAtas - padBawah);
  const d = poin
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.nilai).toFixed(1)}`)
    .join(" ");
  const pertama = poin[0];
  const terakhir = poin[poin.length - 1];
  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox={`0 0 ${lebar} ${tinggi}`}
        width="100%"
        role="img"
        aria-label={`Grafik tren ${label}: ${formatNilai(pertama.nilai)} pada ${pertama.tanggal} menjadi ${formatNilai(terakhir.nilai)} pada ${terakhir.tanggal}`}
      >
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" />
        {poin.map((p, i) => (
          <circle key={`${p.tanggal}-${i}`} cx={x(i)} cy={y(p.nilai)} r="3" fill="var(--accent)">
            <title>
              {p.tanggal}: {formatNilai(p.nilai)}
            </title>
          </circle>
        ))}
        <text x={padKiri} y={tinggi - 6} fontSize="11" fill="var(--muted)">
          {pertama.tanggal}
        </text>
        <text
          x={lebar - padKanan}
          y={tinggi - 6}
          fontSize="11"
          fill="var(--muted)"
          textAnchor="end"
        >
          {terakhir.tanggal}
        </text>
      </svg>
    </figure>
  );
}

export default async function Data({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const kategoriParam =
    typeof sp.kategori === "string" ? sp.kategori : undefined;
  const kategoriValid = KATEGORI_DATA.some((k) => k.slug === kategoriParam)
    ? kategoriParam
    : undefined;
  const indikator = await getIndikator(kategoriValid);

  // Poin deret waktu per indikator (untuk grafik + tabel).
  const poinPerIndikator = new Map<string, PfPoinIndikator[]>();
  await Promise.all(
    indikator.map(async (ind) => {
      poinPerIndikator.set(ind.slug, await getPoinIndikator(ind.slug, 60));
    }),
  );

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-data">
        <span className="hero-label">Pusat Data</span>
        <h1 id="judul-data">Data &amp; Statistik</h1>
        <p>
          Indikator nasional dan global dari sumber resmi. Setiap angka
          disertai sumber, satuan, metodologi, dan tanggal pembaruan — tanpa
          angka karangan.
        </p>
      </section>

      <div className="chip-baris" role="group" aria-label="Filter kategori data">
        <Link
          className={`chip${!kategoriValid ? " aktif" : ""}`}
          href="/data"
        >
          Semua kategori
        </Link>
        {KATEGORI_DATA.map((k) => (
          <Link
            key={k.slug}
            className={`chip${kategoriValid === k.slug ? " aktif" : ""}`}
            href={`/data?kategori=${k.slug}`}
          >
            {k.nama}
          </Link>
        ))}
      </div>

      {indikator.length === 0 ? (
        <section className="seksi">
          <EmptyState
            judul="Belum ada indikator resmi yang terdaftar."
            pesan="Pusat data akan terisi begitu redaksi mendaftarkan indikator dari sumber resmi beserta poin datanya."
          />
        </section>
      ) : (
        <section className="seksi" aria-label="Daftar indikator">
          <div className="grid-berita">
            {indikator.map((ind) => {
              const poin = poinPerIndikator.get(ind.slug) ?? [];
              return (
                <article className="kartu" key={ind.id}>
                  <span className="kartu-kategori">
                    {KATEGORI_DATA.find((k) => k.slug === ind.kategori)?.nama ??
                      ind.kategori}
                  </span>
                  <span className="kartu-judul">{ind.nama}</span>
                  <span className="kartu-meta">
                    {ind.nilai_terakhir !== null
                      ? `Nilai terakhir: ${formatNilai(ind.nilai_terakhir)}${ind.satuan ? ` ${ind.satuan}` : ""}${ind.tanggal_nilai_terakhir ? ` · ${formatTanggal(ind.tanggal_nilai_terakhir)}` : ""}`
                      : "Belum ada poin data."}
                  </span>
                  {ind.ringkasan_tren && (
                    <span className="kartu-teks">{ind.ringkasan_tren}</span>
                  )}
                  <GrafikGaris poin={poin} label={ind.nama} />
                  {ind.metodologi && (
                    <span className="kartu-teks">
                      <strong>Metodologi:</strong> {ind.metodologi}
                    </span>
                  )}
                  <span className="kartu-meta">
                    Sumber:{" "}
                    {ind.sumber_url ? (
                      <a
                        href={ind.sumber_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {ind.sumber_nama ?? ind.sumber_url}
                      </a>
                    ) : (
                      (ind.sumber_nama ?? "—")
                    )}
                    {` · Diperbarui: ${formatTanggal(ind.tanggal_pembaruan)}`}
                  </span>
                  {poin.length > 0 && (
                    <div className="tabel-gulir">
                      <table className="tabel-data">
                        <thead>
                          <tr>
                            <th scope="col">Tanggal</th>
                            <th scope="col">Nilai{ind.satuan ? ` (${ind.satuan})` : ""}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...poin].reverse().map((p) => (
                            <tr key={p.tanggal}>
                              <td>{formatTanggal(p.tanggal)}</td>
                              <td>{formatNilai(p.nilai)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
