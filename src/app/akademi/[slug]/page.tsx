import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import DaftarPelajaran from "@/components/akademi/DaftarPelajaran";
import {
  getKursusDetail,
  getProgresPengguna,
  type PfProgresPelajaran,
} from "@/lib/akademi";
import { labelTingkat } from "@/lib/explainer";
import { getKuisHarian, type PfKuisSoalPublik } from "@/lib/lanjutan";
import { createClient } from "@/lib/supabase/server";
import { urlSitus } from "@/lib/situs";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getKursusDetail(slug);
  if (!detail) notFound();
  const url = `${urlSitus()}/akademi/${slug}`;
  return {
    title: detail.kursus.judul,
    description: detail.kursus.deskripsi ?? undefined,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: detail.kursus.judul,
      description: detail.kursus.deskripsi ?? undefined,
    },
  };
}

// Halaman detail kursus membaca data per request (pola
// cacheComponents untuk rute dinamis).
export const instant = false;

export default async function AkademiDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getKursusDetail(slug);
  if (!detail) notFound();

  // Pengguna login mendapat progres nyata; anonim tetap bisa
  // membaca materi tetapi progres tidak tersimpan.
  let masuk = false;
  let progres: Record<string, PfProgresPelajaran> = {};
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      masuk = true;
      const lessonIds = detail.modul.flatMap((m) =>
        m.pelajaran.map((p) => p.id),
      );
      const peta = await getProgresPengguna(data.user.id, lessonIds);
      progres = Object.fromEntries(peta.entries());
    }
  } catch {
    masuk = false;
  }

  // Soal kuis pelajaran diambil di server (pola /kuis): kunci
  // TIDAK PERNAH dikirim ke klien — hanya soal publik (tanpa kunci).
  // Pelajaran kuis tanpa soal untuk tanggalnya menampilkan pesan
  // jujur di komponen.
  const soalKuis: Record<string, PfKuisSoalPublik[]> = {};
  for (const m of detail.modul) {
    for (const p of m.pelajaran) {
      if (p.jenis !== "kuis" || !p.kuis_tanggal) continue;
      const soal = await getKuisHarian(p.kuis_tanggal);
      soalKuis[p.id] = soal.map((s) => ({
        id: s.id,
        tanggal: s.tanggal,
        pertanyaan: s.pertanyaan,
        opsi: s.opsi,
        penjelasan: s.penjelasan,
        sumber_url: s.sumber_url,
        sumber_nama: s.sumber_nama,
        artikel_id: s.artikel_id,
      }));
    }
  }

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-kursus">
        <p>
          <Link href="/akademi">← PRATA Academy</Link>
        </p>
        <span className="hero-label">Kursus</span>
        <h1 id="judul-kursus">{detail.kursus.judul}</h1>
        {detail.kursus.deskripsi && <p>{detail.kursus.deskripsi}</p>}
        <p className="kartu-meta">
          {`Kategori ${detail.kursus.kategori} · Tingkat ${labelTingkat(detail.kursus.tingkat)} · ${detail.kursus.jumlah_modul} modul · ${detail.total_pelajaran} pelajaran`}
        </p>
        {!masuk && (
          <p style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
            Anda membaca sebagai tamu.{" "}
            <Link href="/masuk">Masuk</Link> untuk menyimpan progres
            belajar.
          </p>
        )}
      </section>

      {detail.total_pelajaran === 0 ? (
        <section className="seksi">
          <EmptyState
            judul="Kursus ini belum memiliki pelajaran."
            pesan="Redaksi sedang menyusun modul dan pelajaran kursus ini."
          />
        </section>
      ) : (
        <DaftarPelajaran
          detail={detail}
          progresAwal={progres}
          soalKuis={soalKuis}
          masuk={masuk}
        />
      )}

      <p>
        <Link className="tombol tombol-hantu" href="/akademi">
          Semua kursus
        </Link>{" "}
        <Link className="tombol" href="/pengetahuan">
          Perpustakaan Pengetahuan
        </Link>
      </p>
    </div>
  );
}
