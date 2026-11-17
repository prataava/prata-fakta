import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import { bacaNonceDariHeaders } from "@/lib/csp";
import {
  ambilIstilah,
  bagiIsiBerlapis,
  getArtikelTerkait,
  getExplainer,
  getSeri,
  labelTingkat,
} from "@/lib/explainer";
import { createClient } from "@/lib/supabase/server";
import TombolSimpan from "./TombolSimpan";
import CatatanPribadi from "@/components/artikel/CatatanPribadi";
import { urlSitus } from "@/lib/situs";

// Metadata per artikel (judul asli di tab + SEO). notFound() di sini
// penting: generateMetadata berjalan SEBELUM shell dikirim, sehingga
// slug yang tidak ada menghasilkan status 404 yang benar — bila
// pengecekan hanya di badan halaman, Partial Prerender sudah
// mengirim shell 200 dan notFound() di lubang dinamis tidak lagi
// bisa mengubah status (terbukti di smoke test: 200 + UI 404).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const artikel = await getExplainer(slug);
  if (!artikel) notFound();
  const url = `${urlSitus()}/pengetahuan/${slug}`;
  return {
    title: artikel.judul,
    description: artikel.ringkasan ?? undefined,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: artikel.judul,
      description: artikel.ringkasan ?? undefined,
      authors: artikel.penulis_nama ? [artikel.penulis_nama] : undefined,
    },
    twitter: {
      card: "summary",
      title: artikel.judul,
      description: artikel.ringkasan ?? undefined,
    },
  };
}

// Halaman detail pengetahuan membaca data per request (pola
// cacheComponents untuk rute dinamis).
// KEPUTUSAN FASE 7 (menutup utang Fase 6): status HTTP 404 untuk
// slug yang tidak ada DITANGANI DI PROXY (src/proxy.ts — pola yang
// sama dengan perbaikan 404 artikel Fase 2): proxy memeriksa
// keberadaan slug di pf_knowledge_articles SEBELUM halaman
// dirender dan me-rewrite ke /_not-found bila tidak ada.
// `dynamic = "force-dynamic"` tetap tidak dipakai (ditolak build
// karena tidak kompatibel dengan cacheComponents); notFound() di
// sini tetap ada sebagai pengaman kedua (UI 404 + noindex).
export const instant = false;

const LABEL_TOPIK: Record<string, string> = {
  sejarah: "Sejarah",
  geografi: "Geografi",
  negara: "Negara",
  sains: "Sains",
  teknologi: "Teknologi",
  ekonomi: "Ekonomi",
  alam: "Alam",
  tubuh: "Tubuh Manusia",
  umum: "Umum",
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

export default async function PengetahuanDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artikel = await getExplainer(slug);
  if (!artikel) notFound();

  // Format explainer berlapis (Area 4): hanya bila jenis='explainer'.
  // Semua seksi turunan dihitung dari data yang ada; yang tidak ada
  // di data tidak ditampilkan (lihat src/lib/explainer.ts).
  const explainer = artikel.jenis === "explainer";
  const lapis = explainer ? bagiIsiBerlapis(artikel.isi) : null;
  const istilah = explainer ? ambilIstilah(artikel.referensi) : [];
  const seri =
    explainer && artikel.seri_slug
      ? (await getSeri(artikel.seri_slug)).filter((a) => a.slug !== slug)
      : [];

  // F9: artikel berita terbit terkait topik artikel ini.
  // Seksi "Berita terkait" hanya tampil bila ada hasil.
  const terkait = await getArtikelTerkait(artikel.topik);

  // F11: status bookmark pengetahuan pengguna ini (v16).
  // Gagal-aman: kolom belum ada / belum login → false.
  let penggunaMasuk = false;
  let bookmarkAwal = false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      penggunaMasuk = true;
      const { data: simpan } = await supabase
        .from("pf_bookmarks")
        .select("pengetahuan_id")
        .eq("user_id", data.user.id)
        .eq("pengetahuan_id", artikel.id)
        .maybeSingle();
      bookmarkAwal = Boolean(simpan);
    }
  } catch {
    penggunaMasuk = false;
    bookmarkAwal = false;
  }

  // Structured data JSON-LD (Fase 7): Article + BreadcrumbList.
  const urlArtikel = `${urlSitus()}/pengetahuan/${slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: artikel.judul,
        description: artikel.ringkasan ?? undefined,
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
          {
            "@type": "ListItem",
            position: 2,
            name: "Pengetahuan",
            item: `${urlSitus()}/pengetahuan`,
          },
          {
            "@type": "ListItem",
            position: 3,
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
      <article className="prosa">
        <p>
          <Link href="/pengetahuan">← Pengetahuan</Link>
        </p>
        <span className="kartu-kategori">
          {LABEL_TOPIK[artikel.topik] ?? artikel.topik}
        </span>
        {explainer && (
          <span className="kartu-kategori">Explainer</span>
        )}
        <h1>{artikel.judul}</h1>
        <p className="kartu-meta">
          {artikel.penulis_nama ?? "Redaksi PRATA FAKTA"}
          {artikel.harian_tanggal
            ? ` · Fakta ${formatTanggal(artikel.harian_tanggal)}`
            : ""}
          {explainer && (
            <>
              {` · Tingkat ${labelTingkat(artikel.tingkat)}`}
              {artikel.estimasi_baca_menit
                ? ` · ±${artikel.estimasi_baca_menit} menit baca`
                : ""}
            </>
          )}
        </p>
        {artikel.ringkasan && <p><strong>{artikel.ringkasan}</strong></p>}
        {explainer && lapis ? (
          <>
            {lapis.ringkas.length > 0 && (
              <section aria-labelledby="seksi-ringkas">
                <h2 id="seksi-ringkas">Secara singkat</h2>
                {lapis.ringkas.map((par, i) => (
                  <p key={i}>{par}</p>
                ))}
              </section>
            )}
            {lapis.mengapaPenting && (
              <section aria-labelledby="seksi-mengapa-penting">
                <h2 id="seksi-mengapa-penting">Mengapa penting</h2>
                <p>{lapis.mengapaPenting}</p>
              </section>
            )}
            {lapis.mendalam.length > 0 && (
              <section aria-labelledby="seksi-mendalam">
                <h2 id="seksi-mendalam">Lebih mendalam</h2>
                {lapis.mendalam.map((par, i) => (
                  <p key={i}>{par}</p>
                ))}
              </section>
            )}
            {lapis.kronologi.length > 0 && (
              <section aria-labelledby="seksi-linimasa">
                <h2 id="seksi-linimasa">Linimasa</h2>
                <ul>
                  {lapis.kronologi.map((k, i) => (
                    <li key={i}>
                      <strong>{k.tanggal}</strong> — {k.peristiwa}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {istilah.length > 0 && (
              <section aria-labelledby="seksi-istilah">
                <h2 id="seksi-istilah">Istilah kunci</h2>
                <ul>
                  {istilah.map((t, i) => (
                    <li key={i}>
                      <strong>{t.istilah}</strong>
                      {t.definisi ? ` — ${t.definisi}` : ""}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {lapis.ringkas.length === 0 &&
              lapis.mendalam.length === 0 &&
              !lapis.mengapaPenting && (
                <EmptyState
                  judul="Isi explainer belum tersedia."
                  pesan="Explainer ini sudah terbit tetapi isinya belum tersimpan."
                />
              )}
          </>
        ) : artikel.isi ? (
          artikel.isi.split(/\n{2,}/).map((par, i) => (
            <p key={i}>{par}</p>
          ))
        ) : (
          <EmptyState
            judul="Isi artikel belum tersedia."
            pesan="Artikel ini sudah terbit tetapi isinya belum tersimpan."
          />
        )}
      </article>

      {/* P1-1 (integrator): catatan pribadi pada artikel
          pengetahuan — prop pengetahuanId, pola sama seperti
          halaman artikel berita. */}
      <CatatanPribadi
        pengetahuanId={artikel.id}
        judulTarget={artikel.judul}
        loggedIn={penggunaMasuk}
      />

      {seri.length > 0 && (
        <section className="seksi" aria-labelledby="seksi-seri">
          <div className="seksi-kepala">
            <h2 id="seksi-seri">Dalam seri ini</h2>
            <p>Artikel lain dari seri yang sama.</p>
          </div>
          <div className="grid-berita">
            {seri.map((a) => (
              <Link
                className="kartu kartu-artikel"
                href={`/pengetahuan/${a.slug}`}
                key={a.id}
              >
                <span className="kartu-kategori">
                  {LABEL_TOPIK[a.topik] ?? a.topik}
                </span>
                <span className="kartu-judul">{a.judul}</span>
                {a.ringkasan && (
                  <span className="kartu-teks">{a.ringkasan}</span>
                )}
                <span className="kartu-meta">
                  {a.jenis === "explainer" ? "Explainer" : "Artikel"}
                  {` · Tingkat ${labelTingkat(a.tingkat)}`}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* F9: berita terbit terkait topik — hanya bila ada hasil. */}
      {terkait.length > 0 && (
        <section className="seksi" aria-labelledby="seksi-berita-terkait">
          <div className="seksi-kepala">
            <h2 id="seksi-berita-terkait">Berita terkait</h2>
            <p>Berita terbaru tentang topik yang sama.</p>
          </div>
          <div className="grid-berita">
            {terkait.map((a) => (
              <Link
                className="kartu kartu-artikel"
                href={`/artikel/${a.slug}`}
                key={a.slug}
              >
                <span className="kartu-judul">{a.judul}</span>
                {a.ringkasan && (
                  <span className="kartu-teks">{a.ringkasan}</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Entri referensi "Istilah: ..." ditampilkan di seksi Istilah
          kunci (explainer), bukan digandakan di sini. */}
      {(() => {
        const referensiTampil = explainer
          ? artikel.referensi.filter(
              (r) => !/^istilah:\s*/i.test((r.judul ?? "").trim()),
            )
          : artikel.referensi;
        return referensiTampil.length > 0 ? (
          <section className="seksi" aria-labelledby="seksi-referensi">
            <div className="seksi-kepala">
              <h2 id="seksi-referensi">Referensi</h2>
              <p>Periksa sendiri sumber artikel ini.</p>
            </div>
            <ul>
              {referensiTampil.map((r, i) => (
                <li key={`${r.url ?? r.judul ?? i}-${i}`}>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer">
                      {r.judul ?? r.url}
                    </a>
                  ) : (
                    (r.judul ?? "Referensi")
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null;
      })()}

      <p>
        <TombolSimpan
          pengetahuanId={artikel.id}
          bookmarkAwal={bookmarkAwal}
          loggedIn={penggunaMasuk}
        />{" "}
        <Link className="tombol" href="/kuis">
          Ikuti Kuis Harian
        </Link>{" "}
        <Link className="tombol tombol-hantu" href="/pengetahuan">
          Semua artikel pengetahuan
        </Link>
      </p>
    </div>
  );
}
