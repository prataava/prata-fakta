import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { bacaNonceDariHeaders } from "@/lib/csp";
import {
  getArtikelLengkap,
  getArtikelTerkait,
  getJejakFakta,
  getPerbandinganSumber,
  getVersiArtikel,
  isBookmarked,
} from "@/lib/data";
import { getCeritaUntukArtikel } from "@/lib/cerita";
import { getNegara } from "@/lib/negara";
import { createClient } from "@/lib/supabase/server";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";
import { urlSitus } from "@/lib/situs";
import PembacaArtikel from "@/components/artikel/PembacaArtikel";
import JejakFakta from "@/components/artikel/JejakFakta";
import PerbandinganSumber from "@/components/artikel/PerbandinganSumber";

// Halaman artikel: data dibaca per request (slug dinamis) — rute diblokir
// di server per request (pola resmi cacheComponents), bukan di-prerender.
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const artikel = await getArtikelLengkap(slug);
  if (!artikel) return { title: "Artikel tidak ditemukan" };
  const url = `${urlSitus()}/artikel/${slug}`;
  const deskripsi = artikel.ringkasan ?? artikel.subjudul ?? undefined;
  return {
    title: artikel.judul,
    description: deskripsi,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: artikel.judul,
      description: deskripsi,
      publishedTime: artikel.diterbitkan_pada ?? undefined,
      modifiedTime: artikel.diperbarui_pada ?? undefined,
      authors: artikel.penulis_nama ? [artikel.penulis_nama] : undefined,
      images: artikel.gambar_url ? [artikel.gambar_url] : undefined,
    },
    twitter: {
      card: artikel.gambar_url ? "summary_large_image" : "summary",
      title: artikel.judul,
      description: deskripsi,
      images: artikel.gambar_url ? [artikel.gambar_url] : undefined,
    },
  };
}

function formatTanggal(iso: string | null): string {
  if (!iso) return "Tanggal belum tersedia";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function hitungEstimasiBaca(
  artikel: { estimasi_baca_menit: number | null; isi: string | null },
): number {
  if (artikel.estimasi_baca_menit && artikel.estimasi_baca_menit > 0) {
    return artikel.estimasi_baca_menit;
  }
  const kata = (artikel.isi ?? "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(kata / 200));
}

export default async function HalamanArtikel({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artikel = await getArtikelLengkap(slug);
  if (!artikel) notFound();

  const [terkait, versi, pengguna, jejak, perbandingan, cerita, negara] =
    await Promise.all([
      getArtikelTerkait(artikel, 4),
      getVersiArtikel(artikel.id, 5),
      (async () => {
        try {
          const supabase = await createClient();
          const { data } = await supabase.auth.getUser();
          return data.user ?? null;
        } catch {
          return null;
        }
      })(),
      // Jejak Fakta (Area 1) + Multi-Source View (Area 3), Fase 8 Gel. 1.
      getJejakFakta(artikel.id),
      getPerbandinganSumber(artikel.id),
      // Tahap 14 — tautan silang: cerita yang memuat artikel ini +
      // profil negara artikel (bila negara_kode tercatat).
      getCeritaUntukArtikel(artikel.id),
      artikel.negara_kode ? getNegara(artikel.negara_kode) : Promise.resolve(null),
    ]);

  const loggedIn = Boolean(pengguna);
  const bookmarkAwal = pengguna
    ? await isBookmarked(pengguna.id, artikel.id)
    : false;
  const estimasi = hitungEstimasiBaca(artikel);

  // Structured data JSON-LD (Fase 7): NewsArticle + BreadcrumbList
  // agar mesin pencari memahami artikel ini sebagai berita. Data
  // diambil dari baris artikel nyata — tanpa nilai karangan; tanggal
  // yang tidak ada dihilangkan dari objek (bukan ditebak).
  const urlArtikel = `${urlSitus()}/artikel/${slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "NewsArticle",
        headline: artikel.judul,
        description: artikel.ringkasan ?? artikel.subjudul ?? undefined,
        ...(artikel.gambar_url ? { image: [artikel.gambar_url] } : {}),
        ...(artikel.diterbitkan_pada
          ? { datePublished: artikel.diterbitkan_pada }
          : {}),
        ...(artikel.diperbarui_pada
          ? { dateModified: artikel.diperbarui_pada }
          : {}),
        author: {
          "@type": "Organization",
          name: artikel.penulis_nama ?? "Redaksi PRATA FAKTA",
          url: urlSitus(),
        },
        publisher: {
          "@type": "Organization",
          name: "PRATA FAKTA",
          url: urlSitus(),
        },
        mainEntityOfPage: urlArtikel,
        inLanguage: "id-ID",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Beranda",
            item: urlSitus(),
          },
          ...(artikel.kategori_slug
            ? [
                {
                  "@type": "ListItem",
                  position: 2,
                  name: artikel.kategori_nama ?? artikel.kategori_slug,
                  item: `${urlSitus()}/kategori/${artikel.kategori_slug}`,
                },
              ]
            : []),
          {
            "@type": "ListItem",
            position: artikel.kategori_slug ? 3 : 2,
            name: artikel.judul,
            item: urlArtikel,
          },
        ],
      },
    ],
  };

  // Nonce CSP untuk skrip JSON-LD (Tahap 13B): dibaca dari header
  // request yang dipasang proxy; tanpa nonce, CSP memblokir skrip
  // inline ini. Halaman ini sudah membaca data per request.
  const nonce = bacaNonceDariHeaders(await headers());

  return (
    <div className="wadah">
      <script
        type="application/ld+json"
        nonce={nonce ?? undefined}
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <article className="artikel">
        <header className="artikel-kepala">
          <p className="artikel-navigasi">
            <Link href="/">Beranda</Link>
            {" / "}
            {artikel.kategori_slug ? (
              <Link href={`/kategori/${artikel.kategori_slug}`}>
                {artikel.kategori_nama ?? artikel.kategori_slug}
              </Link>
            ) : (
              "Umum"
            )}
          </p>
          <span className={kelasLencanaStatus(artikel.status_verifikasi)}>
            {labelStatusVerifikasi(artikel.status_verifikasi)}
          </span>
          {artikel.status_verifikasi === "CORRECTED" && artikel.koreksi_pada && (
            <>
              {" "}
              <span className="lencana lencana-corrected">
                Dikoreksi pada {formatTanggal(artikel.koreksi_pada)}
              </span>
            </>
          )}
          <h1>{artikel.judul}</h1>
          {artikel.subjudul && <p className="artikel-subjudul">{artikel.subjudul}</p>}
          <p className="artikel-meta">
            {artikel.penulis_nama ? `Oleh ${artikel.penulis_nama}` : "Redaksi PRATA FAKTA"}
            {" · "}
            Diterbitkan {formatTanggal(artikel.diterbitkan_pada)}
            {" · "}
            Diperbarui {formatTanggal(artikel.diperbarui_pada)}
            {" · "}
            ±{estimasi} menit baca
          </p>
          {artikel.tags.length > 0 && (
            <p className="artikel-tag">
              {artikel.tags.map((t) => (
                <Link key={t.slug} className="chip" href={`/cari?q=${encodeURIComponent(t.nama)}`}>
                  {t.nama}
                </Link>
              ))}
            </p>
          )}
        </header>

        {(cerita || negara) && (
          <p className="artikel-konteks">
            {cerita && (
              <>
                Bagian dari cerita:{" "}
                <Link href={`/cerita/${cerita.slug}`}>
                  {cerita.judul}
                  {cerita.status_perkembangan
                    ? ` (${cerita.status_perkembangan})`
                    : ""}
                </Link>
              </>
            )}
            {cerita && negara && " · "}
            {negara && (
              <>
                Negara:{" "}
                <Link href={`/negara/${negara.negara.kode}`}>
                  {negara.negara.nama}
                </Link>
              </>
            )}
          </p>
        )}

        {artikel.gambar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="artikel-gambar"
            src={artikel.gambar_url}
            alt={`Ilustrasi: ${artikel.judul}`}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="placeholder-gambar placeholder-gambar-besar" aria-hidden="true">
            <span>{artikel.kategori_nama ?? artikel.kategori_slug ?? "PRATA FAKTA"}</span>
          </div>
        )}

        <PembacaArtikel
          artikel={artikel}
          terkait={terkait}
          versi={versi}
          loggedIn={loggedIn}
          bookmarkAwal={bookmarkAwal}
        />

        <JejakFakta jejak={jejak} />
        <PerbandinganSumber perbandingan={perbandingan} />
      </article>
    </div>
  );
}
