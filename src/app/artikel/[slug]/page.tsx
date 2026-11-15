import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getArtikelLengkap,
  getArtikelTerkait,
  getVersiArtikel,
  isBookmarked,
} from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";
import PembacaArtikel from "@/components/artikel/PembacaArtikel";

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
  return {
    title: artikel.judul,
    description: artikel.ringkasan ?? artikel.subjudul ?? undefined,
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

  const [terkait, versi, pengguna] = await Promise.all([
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
  ]);

  const loggedIn = Boolean(pengguna);
  const bookmarkAwal = pengguna
    ? await isBookmarked(pengguna.id, artikel.id)
    : false;
  const estimasi = hitungEstimasiBaca(artikel);

  return (
    <div className="wadah">
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

        {artikel.gambar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="artikel-gambar"
            src={artikel.gambar_url}
            alt={`Ilustrasi: ${artikel.judul}`}
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
      </article>
    </div>
  );
}
