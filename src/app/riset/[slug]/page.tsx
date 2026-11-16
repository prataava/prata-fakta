import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import {
  getDokumenTerkait,
  getIndikatorTerkaitRiset,
  getRiset,
} from "@/lib/riset";

export const instant = false;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const riset = await getRiset(slug);
  if (!riset) return { title: "Laporan tidak ditemukan" };
  return {
    title: riset.judul,
    description:
      riset.ringkasan ??
      `Laporan riset PRATA FAKTA: ${riset.judul}.`,
  };
}

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

/** Isi laporan (teks biasa) dirender per paragraf — tanpa HTML mentah. */
function ParagrafIsi({ isi }: { isi: string | null }) {
  if (!isi || !isi.trim()) {
    return (
      <p style={{ color: "var(--muted)" }}>
        Isi laporan belum ditulis.
      </p>
    );
  }
  const paragraf = isi
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <>
      {paragraf.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </>
  );
}

export default async function DetailRiset({ params }: Params) {
  const { slug } = await params;
  const riset = await getRiset(slug);
  if (!riset) notFound();

  const [indikatorTerkait, dokumenTerkait] = await Promise.all([
    getIndikatorTerkaitRiset(slug),
    getDokumenTerkait(slug),
  ]);

  return (
    <div className="wadah">
      <article className="artikel">
        <header className="artikel-kepala">
          <p className="artikel-navigasi">
            <Link href="/riset">← Semua riset</Link>
          </p>
          <p className="artikel-tag">Laporan Riset</p>
          <h1>{riset.judul}</h1>
          {riset.ringkasan && <p className="artikel-subjudul">{riset.ringkasan}</p>}
          <p className="artikel-meta">
            {riset.penerbit ?? "Redaksi PRATA FAKTA"}
            {riset.tanggal ? ` · ${formatTanggal(riset.tanggal)}` : ""}
          </p>
        </header>

        <section className="artikel-isi" aria-label="Isi laporan">
          <ParagrafIsi isi={riset.isi} />
        </section>

        {riset.metodologi && (
          <section className="seksi" aria-labelledby="judul-metodologi">
            <div className="seksi-kepala">
              <h2 id="judul-metodologi">Metodologi</h2>
            </div>
            <p>{riset.metodologi}</p>
          </section>
        )}

        <section className="seksi" aria-labelledby="judul-dataset">
          <div className="seksi-kepala">
            <h2 id="judul-dataset">Dataset</h2>
          </div>
          {indikatorTerkait ? (
            <p>
              Laporan ini memakai indikator{" "}
              <Link href="/data">{indikatorTerkait.nama}</Link> — unduh titik
              datanya sebagai CSV:{" "}
              <a href={`/api/riset/${riset.slug}/dataset`} download>
                dataset-{riset.slug}.csv
              </a>
              . Dataset berisi titik data nyata dari pusat data, bukan angka
              ringkasan.
            </p>
          ) : (
            <EmptyState
              judul="Belum ada dataset terkait."
              pesan="Laporan ini belum ditautkan ke indikator pusat data — dataset CSV tersedia bila redaksi menautkannya lewat slug indikator yang sama."
            />
          )}
        </section>

        <section className="seksi" aria-labelledby="judul-dokumen-terkait">
          <div className="seksi-kepala">
            <h2 id="judul-dokumen-terkait">Dokumen Terkait</h2>
          </div>
          {dokumenTerkait.length === 0 ? (
            <EmptyState
              judul="Belum ada dokumen terkait."
              pesan="Belum ada dokumen arsip yang ditautkan ke laporan ini."
            />
          ) : (
            <div className="tabel-gulir">
              <table className="tabel-data">
                <thead>
                  <tr>
                    <th scope="col">Judul</th>
                    <th scope="col">Penerbit</th>
                    <th scope="col">Tanggal</th>
                    <th scope="col">Sumber</th>
                  </tr>
                </thead>
                <tbody>
                  {dokumenTerkait.map((d) => (
                    <tr key={d.id}>
                      <td>{d.judul}</td>
                      <td>{d.penerbit ?? "—"}</td>
                      <td>{formatTanggal(d.tanggal)}</td>
                      <td>
                        {d.url_sumber ? (
                          <a
                            href={d.url_sumber}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Buka sumber ↗
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </article>
    </div>
  );
}
