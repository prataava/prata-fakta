import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import DaftarPelajaran from "@/components/akademi/DaftarPelajaran";
import TombolSertifikat from "@/components/akademi/TombolSertifikat";
import {
  getKursusDetail,
  getProgresPengguna,
  getRiwayatNilaiPerSoal,
  getStatusKelulusan,
  type PfProgresPelajaran,
  type RiwayatNilaiSoal,
} from "@/lib/akademi";
import { getSertifikatPengguna } from "@/lib/akademi/sertifikat";
import { labelTingkat } from "@/lib/explainer";
import { getKuisHarian, KuisBelumTersediaError, type PfKuisSoalPublik } from "@/lib/lanjutan";
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
  let riwayatKuis: Record<string, RiwayatNilaiSoal[]> = {};
  let statusKelulusan: Awaited<ReturnType<typeof getStatusKelulusan>> = null;
  let kodeSertifikat: string | null = null;
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
      const kuisIds = detail.modul.flatMap((m) =>
        m.pelajaran.filter((p) => p.jenis === "kuis").map((p) => p.id),
      );
      const petaRiwayat = await getRiwayatNilaiPerSoal(
        data.user.id,
        kuisIds,
      );
      riwayatKuis = Object.fromEntries(petaRiwayat.entries());
      // Kelulusan + sertifikat (B2): dihitung server dari data
      // nyata — tombol sertifikat hanya tampil bila lulus.
      statusKelulusan = await getStatusKelulusan(data.user.id, slug);
      if (statusKelulusan) {
        const sertifikat = await getSertifikatPengguna(
          data.user.id,
          statusKelulusan.course_id,
        );
        kodeSertifikat = sertifikat?.kode_verifikasi ?? null;
      }
    }
  } catch {
    masuk = false;
  }

  // Soal kuis pelajaran diambil di server (pola /kuis): kunci
  // TIDAK PERNAH dikirim ke klien — hanya soal publik (tanpa kunci).
  // Pelajaran kuis tanpa soal untuk tanggalnya menampilkan pesan
  // jujur di komponen.
  // P2-11 (B-S12): N+1 dihapus — kumpulkan tanggal kuis UNIK,
  // satu panggilan per tanggal secara paralel (Promise.all),
  // lalu petakan ke pelajaran. Bila layanan kuis belum tersedia
  // (service key / tabel v13 belum ada), tampilkan pesan jujur
  // "kuis belum tersedia" — bukan kuis kosong diam-diam (P2-14).
  const soalKuis: Record<string, PfKuisSoalPublik[]> = {};
  let kuisBelumTersedia = false;
  const tanggalUnik = [
    ...new Set(
      detail.modul.flatMap((m) =>
        m.pelajaran
          .filter((p) => p.jenis === "kuis" && p.kuis_tanggal)
          .map((p) => p.kuis_tanggal as string),
      ),
    ),
  ];
  const soalPerTanggal = new Map<string, PfKuisSoalPublik[]>();
  const hasilTanggal = await Promise.all(
    tanggalUnik.map(async (tanggal) => {
      try {
        const soal = await getKuisHarian(tanggal);
        return { tanggal, soal, gagal: false };
      } catch (err) {
        if (err instanceof KuisBelumTersediaError) {
          return { tanggal, soal: [], gagal: true };
        }
        throw err;
      }
    }),
  );
  for (const { tanggal, soal, gagal } of hasilTanggal) {
    if (gagal) kuisBelumTersedia = true;
    soalPerTanggal.set(
      tanggal,
      soal.map((s) => ({
        id: s.id,
        tanggal: s.tanggal,
        pertanyaan: s.pertanyaan,
        opsi: s.opsi,
        jenis: s.jenis,
        penjelasan: s.penjelasan,
        sumber_url: s.sumber_url,
        sumber_nama: s.sumber_nama,
        artikel_id: s.artikel_id,
      })),
    );
  }
  for (const m of detail.modul) {
    for (const p of m.pelajaran) {
      if (p.jenis !== "kuis" || !p.kuis_tanggal) continue;
      soalKuis[p.id] = soalPerTanggal.get(p.kuis_tanggal) ?? [];
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

      {kuisBelumTersedia && (
        <section className="seksi">
          <EmptyState
            judul="Kuis pelajaran belum tersedia."
            pesan="Layanan kuis belum aktif (kunci layanan atau migrasi database belum diatur). Materi kursus tetap bisa dibaca."
          />
        </section>
      )}

      {masuk && statusKelulusan && (
        <section className="seksi" aria-labelledby="judul-sertifikat">
          <div className="seksi-kepala">
            <h2 id="judul-sertifikat">Sertifikat penyelesaian</h2>
            <p>
              {`Pelajaran selesai ${statusKelulusan.kelulusan.persen_pelajaran}% · `}
              {statusKelulusan.kelulusan.rata_rata_kuis === null
                ? "Belum ada skor kuis yang dinilai"
                : `Rata-rata skor kuis ${statusKelulusan.kelulusan.rata_rata_kuis}`}
              {statusKelulusan.kelulusan.skor_kuis_akhir !== null &&
                ` · Skor kuis akhir ${statusKelulusan.kelulusan.skor_kuis_akhir}`}
            </p>
          </div>
          <TombolSertifikat
            courseId={statusKelulusan.course_id}
            kodeAda={kodeSertifikat}
            lulus={statusKelulusan.kelulusan.lulus}
            alasan={statusKelulusan.kelulusan.alasan}
          />
        </section>
      )}

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
          riwayatKuis={riwayatKuis}
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
