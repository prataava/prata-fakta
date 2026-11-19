import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { bacaNonceDariHeaders } from "@/lib/csp";
import {
  getArtikelLengkap,
  getArtikelTerkait,
  getJejakFakta,
  getJumlahKoreksiTerbuka,
  getPerbandinganSumber,
  getPerbandinganDuaArtikel,
  getVersiArtikel,
  isBookmarked,
} from "@/lib/data";
import { getCeritaUntukArtikel } from "@/lib/cerita";
import { getNegara } from "@/lib/negara";
import { hitungFactScore, type HasilFactScore } from "@/lib/fact-score";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_PREFERENSI_BACA,
  dariBarisPreferensiBaca,
  type PreferensiBaca,
} from "@/lib/preferensi-baca";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";
import { urlSitus } from "@/lib/situs";
import { gambarBesar } from "@/lib/gambar";
import PembacaArtikel from "@/components/artikel/PembacaArtikel";
import LencanaFactScore from "@/components/artikel/LencanaFactScore";
import { Reveal } from "@/components/motion";
import JejakFakta from "@/components/artikel/JejakFakta";
import MetodeVerifikasi from "@/components/artikel/MetodeVerifikasi";
import ProvenanceAI from "@/components/artikel/ProvenanceAI";
import CatatanPribadi from "@/components/artikel/CatatanPribadi";
import SakelarPerbandingan from "@/components/artikel/SakelarPerbandingan";

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
  const penulisBersih = bersihkanPenulis(artikel.penulis_nama);
  // og:image / twitter memakai varian BESAR (≥1200px) agar kartu
  // Google Discover & Top Stories memakai gambar besar.
  const gambarOg = gambarBesar(artikel.gambar_url);
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
      authors: penulisBersih ? [penulisBersih] : undefined,
      images: gambarOg ? [gambarOg] : undefined,
    },
    twitter: {
      card: gambarOg ? "summary_large_image" : "summary",
      title: artikel.judul,
      description: deskripsi,
      images: gambarOg ? [gambarOg] : undefined,
    },
  };
}

// Fase 5: nama penulis BERSIH untuk pembaca + mesin pencari —
// suffix jargon internal "(draf pipeline)" tidak tampil di mana
// pun (byline, metadata, JSON-LD). Data/DB tidak diubah.
function bersihkanPenulis(nama: string | null | undefined): string | null {
  const bersih = nama?.replace(/\s*\(draf pipeline\)\s*/gi, "").trim();
  return bersih ? bersih : null;
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

  const [terkait, versi, sesi, jejak, perbandingan, cerita, negara, koreksiTerbuka] =
    await Promise.all([
      getArtikelTerkait(artikel, 4),
      getVersiArtikel(artikel.id, 5),
      (async (): Promise<{
        pengguna: { id: string } | null;
        preferensiBaca: PreferensiBaca;
      }> => {
        try {
          const supabase = await createClient();
          const { data } = await supabase.auth.getUser();
          const pengguna = data.user ?? null;
          if (!pengguna) {
            return { pengguna: null, preferensiBaca: DEFAULT_PREFERENSI_BACA };
          }
          // P3-2: preferensi baca awal untuk PembacaArtikel
          // (tanpa fetch baru dari klien). Kolom v21 belum ada /
          // baris belum ada → default (pola fallback v14).
          const { data: baris } = await supabase
            .from("pf_user_preferences")
            .select("mode_baca, ukuran_font, kepadatan, bahasa")
            .eq("user_id", pengguna.id)
            .maybeSingle();
          return {
            pengguna,
            preferensiBaca: dariBarisPreferensiBaca(
              baris as Record<string, unknown> | null,
            ),
          };
        } catch {
          return { pengguna: null, preferensiBaca: DEFAULT_PREFERENSI_BACA };
        }
      })(),
      // Jejak Fakta (Area 1) + Multi-Source View (Area 3), Fase 8 Gel. 1.
      getJejakFakta(artikel.id),
      getPerbandinganSumber(artikel.id),
      // Tahap 14 — tautan silang: cerita yang memuat artikel ini +
      // profil negara artikel (bila negara_kode tercatat).
      getCeritaUntukArtikel(artikel.id),
      artikel.negara_kode ? getNegara(artikel.negara_kode) : Promise.resolve(null),
      // FACT SCORE (P0 Worker F): hitungan laporan koreksi terbuka
      // (komponen D) — 1 query agregat, tanpa isi laporan.
      getJumlahKoreksiTerbuka(artikel.id),
    ]);

  const pengguna = sesi.pengguna;
  const preferensiBaca = sesi.preferensiBaca;
  const loggedIn = Boolean(pengguna);
  const bookmarkAwal = pengguna
    ? await isBookmarked(pengguna.id, artikel.id)
    : false;

  // P1-3 (integrator): artikel kedua untuk mode Bersebelahan =
  // artikel terkait pertama (sudah diambil di atas, tanpa query
  // baru untuk daftarnya). Bila tidak ada artikel terkait,
  // toggle Bersebelahan tetap tampil tapi mengarah ke
  // /bandingkan — bukan perbandingan kosong yang menyesatkan.
  const slugBanding = terkait[0]?.slug ?? null;
  const perbandinganDua = slugBanding
    ? await getPerbandinganDuaArtikel(slug, slugBanding)
    : null;
  const estimasi = hitungEstimasiBaca(artikel);

  // Hitungan sumber untuk MetodeVerifikasi — dari perbandingan
  // yang SUDAH diambil di atas (tanpa query baru). "Independen"
  // = akar rantai salinan berbeda; bila rantai belum terverifikasi
  // (akarId null), tiap kolom dihitung sendiri, sama seperti
  // fallback di getPerbandinganSumber.
  const kunciAkarPerSumber = new Set(
    perbandingan.sumber.map((s) =>
      s.akarId ? `akar:${s.akarId}` : `kolom:${s.id}`,
    ),
  );
  const jumlahSumberIndependen = kunciAkarPerSumber.size;

  // P2-5 (provenance pembaca): record verifikasi artikel terbaru
  // yang VERIFIED/CROSS-CHECKED — dari jejak yang SUDAH diambil
  // di atas (tanpa query baru). Bila tidak ada, ProvenanceAI
  // menyembunyikan seksinya sendiri (bukan "0 klaim").
  const recordVerifikasiArtikel = jejak.verifikasi.find(
    (v) => v.keputusan === "VERIFIED" || v.keputusan === "CROSS-CHECKED",
  );

  // FACT SCORE (P0 Worker F) — dihitung dari perbandingan yang
  // SUDAH diambil di atas (tanpa query baru kecuali hitungan
  // koreksi terbuka):
  //   A: gabungan kunci akar pendukung semua klaim (satu akar
  //      dihitung sekali) — dari bobot[].akarPendukung.
  //   B: skor kredibilitas tertinggi antar klaim — dari
  //      bobot[].skorTertinggi (tier AKAR, 90/75/60).
  //   C: klaim dengan >= 1 bukti 'mendukung' DAN 0 bukti
  //      'menentang' — dari bobot[].mendukung/menentang (arah
  //      pf_evidence sudah ada di select getPerbandinganSumber).
  //   D: laporan koreksi terbuka — dari getJumlahKoreksiTerbuka.
  // Bila perbandingan.tersedia = false (data klaim/sumber tak
  // terbaca): JANGAN karang angka — lencana "Belum dinilai".
  const hasilFactScore: HasilFactScore = perbandingan.tersedia
    ? hitungFactScore({
        jumlahAkarPendukung: new Set(
          perbandingan.bobot.flatMap((b) => b.akarPendukung),
        ).size,
        skorKredibilitasTertinggi: perbandingan.bobot.reduce<number | null>(
          (maks, b) =>
            b.skorTertinggi !== null && (maks === null || b.skorTertinggi > maks)
              ? b.skorTertinggi
              : maks,
          null,
        ),
        jumlahKlaim: perbandingan.klaim.length,
        jumlahKlaimDidukungTanpaMenentang: perbandingan.bobot.filter(
          (b) => b.mendukung >= 1 && b.menentang === 0,
        ).length,
        laporanKoreksiTerbuka: koreksiTerbuka ?? 0,
      })
    : {
        skor: null,
        label: null,
        komponen: { independen: 0, kredibilitas: 0, konsistensi: 0, koreksi: 0 },
        dinilai: false,
        alasanTidakDinilai:
          "Belum dinilai — data klaim dan sumber belum dapat dibaca",
      };

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
        ...(artikel.gambar_url
          ? { image: [gambarBesar(artikel.gambar_url) ?? artikel.gambar_url] }
          : {}),
        ...(artikel.diterbitkan_pada
          ? { datePublished: artikel.diterbitkan_pada }
          : {}),
        ...(artikel.diperbarui_pada
          ? { dateModified: artikel.diperbarui_pada }
          : {}),
        author: {
          "@type": "Organization",
          name: bersihkanPenulis(artikel.penulis_nama) ?? "Redaksi PRATA FAKTA",
          url: urlSitus(),
        },
        publisher: {
          "@type": "Organization",
          name: "PRATA FAKTA",
          url: urlSitus(),
          // Logo penerbit (ikon PWA 512) — Google memakainya untuk
          // kartu Top Stories / Discover; tanpa logo, kartu berita
          // tampil tanpa identitas penerbit.
          logo: {
            "@type": "ImageObject",
            url: `${urlSitus()}/icons/icon-512.png`,
          },
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

  // Byline BERSIH (Fase 4, level tampilan saja — data/DB tidak
  // diubah): suffix jargon internal "(draf pipeline)" pada
  // penulis_nama tidak ditampilkan ke pembaca.
  const penulisTampil = bersihkanPenulis(artikel.penulis_nama);

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
          <div style={{ marginTop: 12 }}>
            <Reveal>
              <LencanaFactScore
                hasil={hasilFactScore}
                koreksiDiketahui={koreksiTerbuka !== null}
              />
            </Reveal>
          </div>
          {artikel.subjudul && <p className="artikel-subjudul">{artikel.subjudul}</p>}
          <p className="artikel-meta">
            {penulisTampil ? `Oleh ${penulisTampil}` : "Redaksi PRATA FAKTA"}
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
                <Link
                  key={t.slug}
                  className="chip"
                  href={`/konteks/${t.slug}`}
                  title={`Jelajahi konteks ${t.nama}`}
                >
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
          // F-R5: width/height dicantumkan agar ruang gambar
          // dicadangkan sebelum dimuat (mengurangi geser tata letak).
          // next/image tidak dipakai: gambar_url berasal dari host
          // eksternal mana pun dan next.config.ts tidak punya
          // images.remotePatterns (di luar cakupan perbaikan ini);
          // CSS .artikel-gambar (width 100%, height auto) memakai
          // rasio atribut ini tanpa pernah mendistorsi gambar.
          // Reveal Fase 4: gambar hero masuk dengan fade + naik.
          <Reveal>
            {/* eslint-disable-next-line @next/next/no-img-element -- gambar_url eksternal, lihat F-R5 di atas */}
            <img
              className="artikel-gambar"
              src={gambarBesar(artikel.gambar_url) ?? artikel.gambar_url}
              alt={`Ilustrasi: ${artikel.judul}`}
              width={1200}
              height={675}
              loading="lazy"
              decoding="async"
            />
          </Reveal>
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
          preferensiAwal={loggedIn ? preferensiBaca : undefined}
        />

        <CatatanPribadi
          artikelId={artikel.id}
          judulTarget={artikel.judul}
          loggedIn={loggedIn}
        />

        <Reveal>
          <JejakFakta jejak={jejak} peranSumber={perbandingan.sumber} />
        </Reveal>
        <Reveal>
          <MetodeVerifikasi
            statusVerifikasi={artikel.status_verifikasi}
            jumlahSumber={perbandingan.sumber.length}
            jumlahSumberIndependen={jumlahSumberIndependen}
            tersedia={perbandingan.tersedia}
          />
        </Reveal>
        <Reveal>
          <ProvenanceAI
            tersedia={jejak.tersedia && perbandingan.tersedia}
            jumlahKlaim={jejak.klaim.length}
            jumlahSumberIndependen={jumlahSumberIndependen}
            keputusan={recordVerifikasiArtikel?.keputusan ?? null}
            diverifikasiPada={recordVerifikasiArtikel?.dibuat_pada ?? null}
            diterbitkanPada={artikel.diterbitkan_pada}
          />
        </Reveal>
        <Reveal>
          <SakelarPerbandingan
            perbandingan={perbandingan}
            perbandinganDua={perbandinganDua}
            slug={slug}
            slugBanding={slugBanding}
          />
        </Reveal>
      </article>
    </div>
  );
}
