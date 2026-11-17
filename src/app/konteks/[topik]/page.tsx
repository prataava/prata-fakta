import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Globe,
  History,
  Newspaper,
  Tag,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import Kartu from "@/components/Kartu";
import KartuArtikel from "@/components/artikel/KartuArtikel";
import { getKonteksTopik } from "@/lib/konteks";
import { formatAngka, formatTanggal } from "@/lib/format";
import { urlSitus } from "@/lib/situs";

// Halaman penjelajah konteks (P2-4, RENCANA-EKSPANSI-P2 §4): satu
// tampilan yang merangkai topik -> cerita -> timeline -> negara ->
// artikel -> data. Data dibaca per request (topik dinamis), BUKAN
// prerender statis — `instant = false` + `await connection()`
// (aturan cacheComponents, pola /cari + /jelajahi): tanpa ini,
// skrip bootstrap $RC React bisa terpanggang tanpa nonce dan
// hidrasi gagal (#419, insiden /jelajahi).
export const instant = false;

const LABEL_JENIS: Record<string, string> = {
  tag: "Tag",
  kategori: "Kategori",
  subkategori: "Subkategori",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ topik: string }>;
}): Promise<Metadata> {
  const { topik } = await params;
  const konteks = await getKonteksTopik(topik);
  if (!konteks) return { title: "Topik tidak ditemukan" };
  const url = `${urlSitus()}/konteks/${konteks.topik.slug}`;
  return {
    title: `${konteks.topik.nama} — Konteks`,
    description:
      konteks.topik.deskripsi ??
      `Cerita, peristiwa, negara, artikel, dan data seputar topik ${konteks.topik.nama}.`,
    alternates: { canonical: url },
    openGraph: {
      url,
      title: `${konteks.topik.nama} — Konteks | PRATA FAKTA`,
    },
  };
}

export default async function HalamanKonteks({
  params,
}: {
  params: Promise<{ topik: string }>;
}) {
  // Baca data HANYA sesudah connection() — aturan cacheComponents.
  await connection();
  const { topik } = await params;
  const konteks = await getKonteksTopik(topik);
  if (!konteks) notFound();

  const { topik: info, cerita, events, negara, artikel, indikator } = konteks;
  const semuaKosong =
    cerita.length === 0 &&
    events.length === 0 &&
    negara.length === 0 &&
    artikel.length === 0 &&
    indikator.length === 0;

  const deskripsi =
    info.deskripsi ??
    (info.jenis === "subkategori" && info.induk
      ? `Subkategori ${info.nama} dalam kategori ${info.induk.nama} — cerita, peristiwa, negara, artikel, dan data seputar topik ini.`
      : `Cerita, peristiwa, negara, artikel, dan data seputar topik ${info.nama}.`);

  // Tautan "lihat semua" artikel mengikuti asal topik (pola halaman
  // kategori: subkategori -> /arsip?kategori=&q=; tag -> /cari?q=).
  const tautanSemuaArtikel =
    info.jenis === "tag"
      ? `/cari?q=${encodeURIComponent(info.nama)}`
      : info.jenis === "subkategori" && info.induk
        ? `/arsip?kategori=${info.induk.slug}&q=${encodeURIComponent(info.nama)}`
        : `/kategori/${info.slug}`;

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-konteks">
        <p className="artikel-navigasi">
          <Link href="/">Beranda</Link>
          {" / "}
          Konteks
          {" / "}
          {info.nama}
        </p>
        <span className="hero-label">
          Konteks · {LABEL_JENIS[info.jenis] ?? "Topik"}
        </span>
        <h1 id="judul-konteks">{info.nama}</h1>
        <p>{deskripsi}</p>
        <p className="chip-baris">
          {info.induk && (
            <Link className="chip" href={`/kategori/${info.induk.slug}`}>
              Kategori: {info.induk.nama}
            </Link>
          )}
          <Link className="chip" href={tautanSemuaArtikel}>
            <Tag size={14} aria-hidden="true" /> Lihat semua artikel
          </Link>
        </p>
      </section>

      {semuaKosong ? (
        <EmptyState
          judul={`Belum ada konteks untuk “${info.nama}”`}
          pesan="Topik ini dikenal, tapi belum ada cerita, peristiwa, artikel, atau data terkait yang terbit. Konteks akan terisi otomatis setelah artikel bertag topik ini terbit dan lolos verifikasi editorial."
          aksi={
            <>
              <Link className="tombol" href="/">
                Kembali ke beranda
              </Link>{" "}
              <Link className="tombol" href="/arsip">
                Buka arsip
              </Link>
            </>
          }
        />
      ) : (
        <>
          {cerita.length > 0 && (
            <section className="seksi" aria-labelledby="seksi-cerita">
              <div className="seksi-kepala">
                <h2 id="seksi-cerita">
                  <BookOpen size={20} aria-hidden="true" /> Cerita terkait
                </h2>
                <Link href="/cerita">Semua cerita</Link>
              </div>
              <div className="grid-berita">
                {cerita.map((c) => (
                  <Kartu
                    key={c.slug}
                    href={`/cerita/${c.slug}`}
                    kategori="Cerita"
                    judul={c.judul}
                    teks={c.ringkasan ?? undefined}
                    meta={
                      c.status_perkembangan
                        ? `Status: ${c.status_perkembangan}`
                        : undefined
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {events.length > 0 && (
            <section className="seksi" aria-labelledby="seksi-timeline">
              <div className="seksi-kepala">
                <h2 id="seksi-timeline">
                  <History size={20} aria-hidden="true" /> Timeline peristiwa
                </h2>
                <Link href="/timeline">Semua peristiwa</Link>
              </div>
              <div className="grid-berita">
                {events.map((e) => (
                  <Kartu
                    key={e.id}
                    judulHref={`/timeline#event-${e.id}`}
                    kategori="Peristiwa"
                    judul={e.judul}
                    teks={e.ringkasan ?? undefined}
                    meta={
                      <>
                        {formatTanggal(e.dimulai_pada, "Waktu belum tersedia")}
                        {e.lokasi_teks ? ` · ${e.lokasi_teks}` : ""}
                      </>
                    }
                    metaTambahan={
                      e.sumber_url ? (
                        <a
                          href={e.sumber_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Sumber peristiwa
                        </a>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {negara.length > 0 && (
            <section className="seksi" aria-labelledby="seksi-negara">
              <div className="seksi-kepala">
                <h2 id="seksi-negara">
                  <Globe size={20} aria-hidden="true" /> Negara terkait
                </h2>
                <Link href="/negara">Semua negara</Link>
              </div>
              <p className="chip-baris">
                {negara.map((n) => (
                  <Link
                    key={n.kode}
                    className="chip"
                    href={`/negara/${n.kode}`}
                  >
                    {n.nama}
                  </Link>
                ))}
              </p>
            </section>
          )}

          {artikel.length > 0 && (
            <section className="seksi" aria-labelledby="seksi-artikel">
              <div className="seksi-kepala">
                <h2 id="seksi-artikel">
                  <Newspaper size={20} aria-hidden="true" /> Artikel terbaru
                </h2>
                <Link href={tautanSemuaArtikel}>Lihat semua</Link>
              </div>
              <div className="grid-berita">
                {artikel.map((a) => (
                  <KartuArtikel key={a.id} artikel={a} />
                ))}
              </div>
            </section>
          )}

          {indikator.length > 0 && (
            <section className="seksi" aria-labelledby="seksi-data">
              <div className="seksi-kepala">
                <h2 id="seksi-data">
                  <BarChart3 size={20} aria-hidden="true" /> Data terkait
                </h2>
                <Link href="/data">Pusat data</Link>
              </div>
              <div className="grid-berita">
                {indikator.map((ind) => (
                  <Kartu
                    key={ind.id}
                    judulHref="/data"
                    kategori="Indikator"
                    judul={ind.nama}
                    teks={ind.ringkasan_tren ?? undefined}
                    meta={
                      ind.nilai_terakhir !== null
                        ? `${formatAngka(ind.nilai_terakhir)}${ind.satuan ? ` ${ind.satuan}` : ""}`
                        : "Nilai terakhir belum tersedia"
                    }
                    metaTambahan={
                      <>
                        {ind.sumber_nama
                          ? `Sumber: ${ind.sumber_nama}`
                          : "Sumber belum tercatat"}
                        {ind.tanggal_pembaruan
                          ? ` · diperbarui ${formatTanggal(ind.tanggal_pembaruan)}`
                          : ""}
                      </>
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
