import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import {
  cariDokumen,
  daftarKategoriDokumen,
  getDaftarRiset,
  JENIS_DOKUMEN,
} from "@/lib/riset";

export const metadata: Metadata = {
  title: "Riset",
  description:
    "PRATA Research: laporan riset PRATA FAKTA beserta arsip dokumen, publikasi, dan statistik dari sumber resmi — metadata dan tautan saja, tanpa menyalin isi berhak cipta.",
};

// Halaman riset membaca data per request (pola cacheComponents untuk
// rute yang membaca data dinamis dan searchParams).
export const instant = false;

const LABEL_JENIS: Record<string, string> = {
  laporan: "Laporan",
  dokumen: "Dokumen",
  publikasi: "Publikasi",
  penelitian: "Penelitian",
  statistik: "Statistik",
};

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

export default async function Riset({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const jenisParam = typeof sp.jenis === "string" ? sp.jenis : undefined;
  const jenisValid = (JENIS_DOKUMEN as readonly string[]).includes(
    jenisParam ?? "",
  )
    ? jenisParam
    : undefined;
  const kategoriParam =
    typeof sp.kategori === "string" ? sp.kategori : undefined;

  const [riset, dokumen, kategoriTersedia] = await Promise.all([
    getDaftarRiset(50),
    cariDokumen(q, jenisValid, kategoriParam),
    daftarKategoriDokumen(),
  ]);
  const kategoriValid =
    kategoriParam && kategoriTersedia.includes(kategoriParam)
      ? kategoriParam
      : undefined;

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-riset">
        <span className="hero-label">PRATA Research</span>
        <h1 id="judul-riset">Riset &amp; Dokumen</h1>
        <p>
          Laporan riset yang disusun redaksi PRATA FAKTA beserta arsip
          dokumen, publikasi, penelitian, dan statistik dari sumber resmi.
          Dokumen diarsipkan sebagai metadata dan tautan ke sumbernya saja —
          isinya tidak disalin.
        </p>
      </section>

      <section className="seksi" aria-labelledby="judul-cari-dokumen">
        <div className="seksi-kepala">
          <h2 id="judul-cari-dokumen">Cari dokumen</h2>
        </div>
        <form
          className="formulir"
          style={{ maxWidth: "100%" }}
          method="get"
          action="/riset"
        >
          <label>
            Kata kunci
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Contoh: kemiskinan, BPS, pendidikan"
              maxLength={120}
            />
          </label>
          <label>
            Jenis
            <select name="jenis" defaultValue={jenisValid ?? ""}>
              <option value="">Semua jenis</option>
              {JENIS_DOKUMEN.map((j) => (
                <option key={j} value={j}>
                  {LABEL_JENIS[j] ?? j}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kategori
            <select name="kategori" defaultValue={kategoriValid ?? ""}>
              <option value="">Semua kategori</option>
              {kategoriTersedia.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <button className="tombol tombol-primer" type="submit">
            Cari dokumen
          </button>
          {(q || jenisValid || kategoriParam) && (
            <Link className="tombol" href="/riset">
              Bersihkan pencarian
            </Link>
          )}
        </form>
      </section>

      <section className="seksi" aria-labelledby="judul-laporan">
        <div className="seksi-kepala">
          <h2 id="judul-laporan">Laporan Riset</h2>
        </div>
        {riset.length === 0 ? (
          <EmptyState
            judul="Belum ada laporan riset terbit."
            pesan="Laporan riset disusun redaksi dan diterbitkan manual sesudah ditinjau — belum ada yang terbit saat ini."
          />
        ) : (
          <div className="grid-berita">
            {riset.map((r) => (
              <Link
                className="kartu kartu-artikel"
                href={`/riset/${r.slug}`}
                key={r.id}
              >
                <span className="kartu-kategori">Laporan Riset</span>
                <span className="kartu-judul">{r.judul}</span>
                {r.ringkasan && (
                  <span className="kartu-teks">{r.ringkasan}</span>
                )}
                <span className="kartu-meta">
                  {r.penerbit ?? "Redaksi PRATA FAKTA"}
                  {r.tanggal ? ` · ${formatTanggal(r.tanggal)}` : ""}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="seksi" aria-labelledby="judul-arsip">
        <div className="seksi-kepala">
          <h2 id="judul-arsip">Arsip Dokumen &amp; Sumber</h2>
        </div>
        {dokumen.length === 0 ? (
          <EmptyState
            judul={
              q || jenisValid || kategoriParam
                ? "Tidak ada dokumen yang cocok."
                : "Arsip dokumen masih kosong."
            }
            pesan={
              q || jenisValid || kategoriParam
                ? "Coba kata kunci atau filter lain."
                : "Arsip akan terisi begitu redaksi mengarsipkan dokumen dari sumber resmi."
            }
          />
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th scope="col">Judul</th>
                  <th scope="col">Jenis</th>
                  <th scope="col">Penerbit</th>
                  <th scope="col">Kategori</th>
                  <th scope="col">Tanggal</th>
                  <th scope="col">Sumber</th>
                </tr>
              </thead>
              <tbody>
                {dokumen.map((d) => (
                  <tr key={d.id}>
                    <td>{d.judul}</td>
                    <td>{LABEL_JENIS[d.jenis] ?? d.jenis}</td>
                    <td>{d.penerbit ?? "—"}</td>
                    <td>{d.kategori ?? "—"}</td>
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
    </div>
  );
}
