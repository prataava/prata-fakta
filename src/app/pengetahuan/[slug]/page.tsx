import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import { getPengetahuanLengkap } from "@/lib/lanjutan";
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
  const artikel = await getPengetahuanLengkap(slug);
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
  const artikel = await getPengetahuanLengkap(slug);
  if (!artikel) notFound();

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

  return (
    <div className="wadah">
      <script
        type="application/ld+json"
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
        <h1>{artikel.judul}</h1>
        <p className="kartu-meta">
          {artikel.penulis_nama ?? "Redaksi PRATA FAKTA"}
          {artikel.harian_tanggal
            ? ` · Fakta ${formatTanggal(artikel.harian_tanggal)}`
            : ""}
        </p>
        {artikel.ringkasan && <p><strong>{artikel.ringkasan}</strong></p>}
        {artikel.isi ? (
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

      {artikel.referensi.length > 0 && (
        <section className="seksi" aria-labelledby="seksi-referensi">
          <div className="seksi-kepala">
            <h2 id="seksi-referensi">Referensi</h2>
            <p>Periksa sendiri sumber artikel ini.</p>
          </div>
          <ul>
            {artikel.referensi.map((r, i) => (
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
      )}

      <p>
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
