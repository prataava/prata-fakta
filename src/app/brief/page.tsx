import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import { getBriefTerbit } from "@/lib/data";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";
import type { EntriBrief, SeksiBrief } from "@/lib/ai/brief";

export const metadata: Metadata = {
  title: "Daily Brief",
  description:
    "Ringkasan harian berita terpenting Indonesia dan dunia, dibuat setiap pagi oleh agen Daily Brief PRATA FAKTA.",
};

// Halaman brief membaca brief 'terbit' dari Supabase per request —
// rute diblokir di server per request (pola resmi cacheComponents
// untuk rute yang membaca data dinamis, seperti /arsip dan /cari),
// bukan di-prerender.
export const instant = false;

const SEKSI: { kunci: SeksiBrief; judul: string; deskripsi: string }[] = [
  { kunci: "indonesia", judul: "Indonesia", deskripsi: "Berita terpenting dari Indonesia hari ini." },
  { kunci: "dunia", judul: "Dunia", deskripsi: "Berita terpenting dunia hari ini." },
  { kunci: "ekonomi", judul: "Ekonomi", deskripsi: "Inflasi, nilai tukar, dan pasar hari ini." },
  { kunci: "teknologi", judul: "Teknologi", deskripsi: "Perkembangan teknologi dan AI hari ini." },
  { kunci: "sains", judul: "Sains", deskripsi: "Penelitian dan penemuan terbaru." },
];

function formatTanggal(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

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
  const meta = [
    waktu,
    entri.lokasi,
    `Sumber: ${entri.sumber}`,
  ]
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

export default async function Brief() {
  // Brief terbaru berstatus 'terbit' saja (RLS); null bila belum ada.
  const brief = await getBriefTerbit();

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-brief">
        <span className="hero-label">Setiap pagi</span>
        <h1 id="judul-brief">Daily Brief</h1>
        <p>
          Ringkasan harian berita terpenting Indonesia dan dunia: berita
          terpenting, ekonomi hari ini, teknologi hari ini, sains dan
          penemuan, serta isu yang sedang berkembang. Setiap butir memuat
          judul, ringkasan, waktu, lokasi, kategori, sumber, status
          verifikasi, dan tautan artikel lengkap.
        </p>
        {brief && (
          <p>
            <strong>Edisi {formatTanggal(brief.tanggal)}</strong>
          </p>
        )}
      </section>

      {!brief ? (
        <section className="seksi">
          <EmptyState
            judul="Daily Brief pertama belum terbit"
            pesan="Daily Brief disusun setiap pagi oleh agen Daily Brief dari artikel yang sudah terverifikasi dan diterbitkan. Mesin berita sudah berjalan dan draf artikel sudah dibuat — tetapi belum ada edisi yang diterbitkan, karena belum ada artikel yang lolos review editor dan terbit. Daftarkan email Anda di bawah agar edisi pertama langsung terkirim begitu terbit."
            aksi={
              <Link className="tombol tombol-primer" href="/#seksi-newsletter">
                Berlangganan newsletter
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
                aria-labelledby={`seksi-brief-${kunci}`}
                key={kunci}
              >
                <div className="seksi-kepala">
                  <h2 id={`seksi-brief-${kunci}`}>{judul}</h2>
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
            <section className="seksi" aria-labelledby="seksi-isu-berkembang">
              <div className="seksi-kepala">
                <h2 id="seksi-isu-berkembang">Isu Berkembang</h2>
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
                    <span className="kartu-teks">
                      {isu.item_terbaru.judul}
                    </span>
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
        </>
      )}

      <section className="seksi" aria-labelledby="seksi-isi-brief">
        <div className="seksi-kepala">
          <h2 id="seksi-isi-brief">Isi setiap edisi</h2>
        </div>
        <div className="grid-berita">
          {[
            { j: "Indonesia", t: "Berita terpenting dari Indonesia hari ini." },
            { j: "Dunia", t: "Berita terpenting dunia hari ini." },
            { j: "Ekonomi", t: "Inflasi, nilai tukar, dan pasar hari ini." },
            { j: "Teknologi", t: "Perkembangan teknologi dan AI hari ini." },
            { j: "Sains", t: "Penelitian dan penemuan terbaru." },
            { j: "Isu Berkembang", t: "Peristiwa yang sedang dipantau redaksi." },
          ].map((b) => (
            <div key={b.j} className="kartu">
              <span className="kartu-kategori">{b.j}</span>
              <span className="kartu-teks">{b.t}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
