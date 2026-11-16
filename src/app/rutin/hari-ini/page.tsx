import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import KartuArtikel from "@/components/artikel/KartuArtikel";
import {
  formatTanggalPanjang,
  getArtikelPadaTanggal,
  getEventPadaTanggal,
  tanggalWibHariIni,
} from "@/lib/rutin";

export const metadata: Metadata = {
  title: "Hari Ini",
  description:
    "Peristiwa yang dimulai hari ini dan artikel yang terbit hari ini di PRATA FAKTA (waktu Indonesia Barat).",
};

// Halaman membaca data per request — rute diblokir di server per
// request (pola resmi cacheComponents, seperti /brief), bukan
// di-prerender.
export const instant = false;

function formatWaktu(waktu: string): string {
  const d = new Date(waktu);
  if (Number.isNaN(d.getTime())) return waktu;
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export default async function RutinHariIni() {
  // tanggalWibHariIni() membaca waktu saat ini — hanya sesudah
  // connection() (aturan cacheComponents, pola Fase 5).
  await connection();
  const hariIni = tanggalWibHariIni();
  const [event, artikel] = await Promise.all([
    getEventPadaTanggal(hariIni),
    getArtikelPadaTanggal(hariIni),
  ]);
  const kosong = event.length === 0 && artikel.length === 0;

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-hari-ini">
        <span className="hero-label">Konten rutin · Harian</span>
        <h1 id="judul-hari-ini">Hari Ini</h1>
        <p>
          Peristiwa yang dimulai hari ini dan artikel yang terbit hari ini
          (waktu Indonesia Barat).
        </p>
        <p>
          <strong>{formatTanggalPanjang(hariIni)}</strong>
        </p>
      </section>

      {kosong ? (
        <section className="seksi">
          <EmptyState
            judul="Belum ada peristiwa tercatat hari ini"
            pesan="Belum ada peristiwa yang dimulai hari ini dan belum ada artikel yang terbit hari ini."
            aksi={
              <Link className="tombol tombol-primer" href="/arsip">
                Lihat arsip artikel
              </Link>
            }
          />
        </section>
      ) : (
        <>
          <section className="seksi" aria-labelledby="seksi-hari-ini-event">
            <div className="seksi-kepala">
              <h2 id="seksi-hari-ini-event">Peristiwa hari ini</h2>
              <p>{event.length} peristiwa dimulai hari ini.</p>
            </div>
            {event.length === 0 ? (
              <EmptyState
                judul="Belum ada peristiwa tercatat hari ini"
                pesan="Tidak ada peristiwa yang dimulai hari ini."
              />
            ) : (
              <div className="grid-berita">
                {event.map((e) => (
                  <div className="kartu" key={e.id}>
                    <span className="kartu-kategori">
                      Peristiwa · {formatWaktu(e.dimulai_pada)} WIB
                      {e.lokasi_teks ? ` · ${e.lokasi_teks}` : ""}
                    </span>
                    <span className="kartu-judul">{e.judul}</span>
                    {e.ringkasan && (
                      <span className="kartu-teks">{e.ringkasan}</span>
                    )}
                    {e.dampak && (
                      <span className="kartu-teks">Dampak: {e.dampak}</span>
                    )}
                    {e.sumber_url && (
                      <span className="kartu-meta">
                        <a
                          href={e.sumber_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Sumber
                        </a>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="seksi" aria-labelledby="seksi-hari-ini-artikel">
            <div className="seksi-kepala">
              <h2 id="seksi-hari-ini-artikel">Artikel terbit hari ini</h2>
              <p>{artikel.length} artikel terbit hari ini.</p>
            </div>
            {artikel.length === 0 ? (
              <EmptyState
                judul="Belum ada artikel terbit hari ini"
                pesan="Tidak ada artikel yang terbit hari ini."
              />
            ) : (
              <div className="grid-berita">
                {artikel.map((a) => (
                  <KartuArtikel key={a.id} artikel={a} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
