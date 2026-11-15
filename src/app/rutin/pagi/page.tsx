import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import { getBriefTerbit } from "@/lib/data";
import { formatTanggalPanjang } from "@/lib/rutin";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";
import type { EntriBrief, SeksiBrief } from "@/lib/ai/brief";

export const metadata: Metadata = {
  title: "Morning Intelligence",
  description:
    "Ringkasan pagi dari Daily Brief terbaru PRATA FAKTA: berita terpenting Indonesia dan dunia untuk memulai hari.",
};

// Halaman membaca brief 'terbit' per request — rute diblokir di server
// per request (pola resmi cacheComponents untuk rute yang membaca
// data dinamis, seperti /brief), bukan di-prerender.
export const instant = false;

const SEKSI: { kunci: SeksiBrief; judul: string; deskripsi: string }[] = [
  { kunci: "indonesia", judul: "Indonesia", deskripsi: "Berita terpenting dari Indonesia hari ini." },
  { kunci: "dunia", judul: "Dunia", deskripsi: "Berita terpenting dunia hari ini." },
  { kunci: "ekonomi", judul: "Ekonomi", deskripsi: "Inflasi, nilai tukar, dan pasar hari ini." },
  { kunci: "teknologi", judul: "Teknologi", deskripsi: "Perkembangan teknologi dan AI hari ini." },
  { kunci: "sains", judul: "Sains", deskripsi: "Penelitian dan penemuan terbaru." },
];

function formatWaktu(waktu: string | null): string | null {
  if (!waktu) return null;
  const d = new Date(waktu);
  if (Number.isNaN(d.getTime())) return waktu;
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function KartuEntri({ entri }: { entri: EntriBrief }) {
  const waktu = formatWaktu(entri.waktu);
  const meta = [waktu, entri.lokasi, `Sumber: ${entri.sumber}`]
    .filter((b): b is string => !!b)
    .join(" · ");
  return (
    <a
      className="kartu kartu-artikel"
      href={entri.tautan}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="kartu-kategori">
        {entri.kategori} ·{" "}
        <span className={kelasLencanaStatus(entri.status_verifikasi)}>
          {labelStatusVerifikasi(entri.status_verifikasi)}
        </span>
      </span>
      <span className="kartu-judul">{entri.judul}</span>
      <span className="kartu-teks">{entri.ringkasan}</span>
      <span className="kartu-meta">{meta}</span>
    </a>
  );
}

export default async function RutinPagi() {
  const brief = await getBriefTerbit();

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-pagi">
        <span className="hero-label">Konten rutin · Setiap pagi</span>
        <h1 id="judul-pagi">Morning Intelligence</h1>
        <p>
          Ringkasan pagi dari Daily Brief terbaru: berita terpenting
          Indonesia dan dunia untuk memulai hari.
        </p>
        {brief && (
          <p>
            <strong>Edisi {formatTanggalPanjang(brief.tanggal)}</strong>
          </p>
        )}
      </section>

      {!brief ? (
        <section className="seksi">
          <EmptyState
            judul="Daily Brief terbaru belum terbit"
            pesan="Morning Intelligence menampilkan Daily Brief terbaru yang sudah terbit. Belum ada edisi yang diterbitkan, jadi belum ada ringkasan pagi yang bisa ditampilkan."
            aksi={
              <Link className="tombol tombol-primer" href="/brief">
                Lihat Daily Brief
              </Link>
            }
          />
        </section>
      ) : (
        <>
          {SEKSI.map(({ kunci, judul, deskripsi }) => {
            const entri = (brief.isi.seksi[kunci] ?? []) as EntriBrief[];
            if (entri.length === 0) return null;
            return (
              <section
                className="seksi"
                aria-labelledby={`seksi-pagi-${kunci}`}
                key={kunci}
              >
                <div className="seksi-kepala">
                  <h2 id={`seksi-pagi-${kunci}`}>{judul}</h2>
                  <p>{deskripsi}</p>
                </div>
                <div className="grid-berita">
                  {entri.map((e) => (
                    <KartuEntri key={`${kunci}-${e.tautan}`} entri={e} />
                  ))}
                </div>
              </section>
            );
          })}

          {brief.isi.isu_berkembang.length > 0 && (
            <section className="seksi" aria-labelledby="seksi-pagi-isu">
              <div className="seksi-kepala">
                <h2 id="seksi-pagi-isu">Isu Berkembang</h2>
                <p>
                  Peristiwa yang sedang dipantau redaksi — dihitung dari
                  volume pemberitaan nyata, bukan tebakan.
                </p>
              </div>
              <div className="grid-berita">
                {brief.isi.isu_berkembang.map((isu) => (
                  <div className="kartu" key={isu.topik}>
                    <span className="kartu-kategori">Isu berkembang</span>
                    <span className="kartu-judul">{isu.topik}</span>
                    <span className="kartu-teks">{isu.item_terbaru.judul}</span>
                    <span className="kartu-meta">
                      {isu.jumlah_24j} pemberitaan dalam 24 jam ·{" "}
                      {isu.jumlah_7h} dalam 7 hari · {isu.sumber_independen}{" "}
                      sumber independen
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="seksi">
            <EmptyState
              judul="Baca edisi lengkap"
              pesan="Morning Intelligence menampilkan edisi Daily Brief terbaru. Edisi lengkap dengan semua seksi ada di halaman Daily Brief."
              aksi={
                <Link className="tombol" href="/brief">
                  Buka Daily Brief
                </Link>
              }
            />
          </section>
        </>
      )}
    </div>
  );
}
