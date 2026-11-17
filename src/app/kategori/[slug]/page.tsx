import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import EmptyState from "@/components/EmptyState";
import KartuArtikel from "@/components/artikel/KartuArtikel";
import TombolIkutiTopik from "@/components/lanjutan/TombolIkutiTopik";
import { KATEGORI_UTAMA, cariKategori } from "@/lib/categories";
import { getArtikelPerKategori } from "@/lib/data";
import { getTopikDiikuti } from "@/lib/lanjutan";
import { urlSitus } from "@/lib/situs";
import { createClient } from "@/lib/supabase/server";

export function generateStaticParams() {
  return KATEGORI_UTAMA.map((k) => ({ slug: k.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const k = cariKategori(slug);
  if (!k) return { title: "Kategori tidak ditemukan" };
  const url = `${urlSitus()}/kategori/${slug}`;
  return {
    title: k.nama,
    description: k.deskripsi,
    alternates: { canonical: url },
    openGraph: {
      url,
      title: `${k.nama} — PRATA FAKTA`,
      description: k.deskripsi,
    },
  };
}

export default async function HalamanKategori({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const kategori = cariKategori(slug);
  if (!kategori) notFound();

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-kat">
        <span className="hero-label">Kategori</span>
        <h1 id="judul-kat">{kategori.nama}</h1>
        <p>{kategori.deskripsi}</p>
        <p>
          <Suspense fallback={null}>
            <IkutiKategori slug={slug} />
          </Suspense>
        </p>
        <p>
          <Link className="tombol tombol-hantu" href={`/graf/kategori/${slug}`}>
            Lihat di graf
          </Link>
        </p>
      </section>

      {kategori.sub.length > 0 && (
        <section className="seksi" aria-label="Subkategori">
          <div className="chip-baris">
            {kategori.sub.map((s) => (
              <Link
                key={s.slug}
                className="chip"
                href={`/arsip?kategori=${kategori.slug}&q=${encodeURIComponent(s.nama)}`}
              >
                {s.nama}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="seksi" aria-labelledby="seksi-artikel-kat">
        <div className="seksi-kepala">
          <h2 id="seksi-artikel-kat">Artikel {kategori.nama}</h2>
          <Link href="/arsip">Arsip</Link>
        </div>
        <Suspense fallback={<div className="kerangka" aria-label="Memuat artikel…" />}>
          <DaftarArtikelKategori slug={slug} nama={kategori.nama} />
        </Suspense>
      </section>
    </div>
  );
}

// Tombol Ikuti kategori (P1-5) — dibaca di dalam Suspense agar
// shell kategori tetap bisa di-prerender (generateStaticParams)
// sementara status login/ikuti mengalir dinamis. Komponen dan
// logika yang sama dengan permukaan topik lain
// (TombolIkutiTopik), bukan duplikasi.
async function IkutiKategori({ slug }: { slug: string }) {
  let masuk = false;
  let mengikuti = false;
  let mengikutiId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const penggunaId = data.user?.id ?? null;
    if (penggunaId) {
      masuk = true;
      const topik = await getTopikDiikuti(penggunaId);
      const baris = topik.find(
        (t) => t.tipe === "kategori" && t.target === slug,
      );
      mengikuti = Boolean(baris);
      mengikutiId = baris?.id ?? null;
    }
  } catch {
    masuk = false;
  }
  return (
    <TombolIkutiTopik
      tipe="kategori"
      target={slug}
      mengikutiAwal={mengikuti}
      mengikutiId={mengikutiId}
      masuk={masuk}
    />
  );
}

// Daftar artikel dibaca di dalam Suspense agar shell kategori tetap bisa
// di-prerender (generateStaticParams) sementara datanya mengalir dinamis.
async function DaftarArtikelKategori({
  slug,
  nama,
}: {
  slug: string;
  nama: string;
}) {
  const artikel = await getArtikelPerKategori(slug, 12);
  if (artikel.length === 0) {
    return (
      <EmptyState
        judul={`Belum ada artikel ${nama}`}
        pesan="Artikel kanal ini mulai terbit setelah mesin berita Fase 3 aktif dan artikelnya lolos verifikasi editorial. Arsip akan terisi secara otomatis."
        aksi={
          <Link className="tombol" href="/arsip">
            Buka arsip
          </Link>
        }
      />
    );
  }
  return (
    <div className="grid-berita">
      {artikel.map((a) => (
        <KartuArtikel key={a.id} artikel={a} />
      ))}
    </div>
  );
}
