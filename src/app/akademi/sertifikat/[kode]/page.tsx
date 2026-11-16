import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { verifikasiSertifikat } from "@/lib/akademi/sertifikat";
import { urlSitus } from "@/lib/situs";

// Halaman verifikasi publik sertifikat Academy (baca saja).
// Hanya menampilkan kolom publik: kode, nama kursus, nama peserta,
// tanggal terbit, status dicabut, snapshot kriteria. TIDAK PERNAH
// menampilkan user_id / email / data akun lain. Sertifikat
// berlabel INTERNAL dengan jelas — BUKAN sertifikat resmi /
// terakreditasi.
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kode: string }>;
}): Promise<Metadata> {
  const { kode } = await params;
  return {
    title: `Verifikasi Sertifikat ${kode.toUpperCase()} — PRATA Academy`,
    description:
      "Periksa keaslian sertifikat penyelesaian kursus PRATA Academy.",
    alternates: {
      canonical: `${urlSitus()}/akademi/sertifikat/${kode.toUpperCase()}`,
    },
  };
}

export default async function VerifikasiSertifikat({
  params,
}: {
  params: Promise<{ kode: string }>;
}) {
  const { kode } = await params;
  const sertifikat = await verifikasiSertifikat(kode);
  if (!sertifikat) notFound();

  const tanggal = sertifikat.diterbitkan_pada
    ? new Date(sertifikat.diterbitkan_pada).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";
  const k = sertifikat.kriteria;

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-verifikasi">
        <p>
          <Link href="/akademi">← PRATA Academy</Link>
        </p>
        <span className="hero-label">Verifikasi Sertifikat</span>
        <h1 id="judul-verifikasi">
          {sertifikat.dicabut
            ? "Sertifikat ini sudah dicabut"
            : "Sertifikat terverifikasi ✓"}
        </h1>
        <p>
          Sertifikat penyelesaian kursus PRATA Academy. Sertifikat ini
          bersifat <strong>INTERNAL</strong> — diterbitkan PRATA sebagai
          tanda penyelesaian kursus, <strong>bukan</strong> sertifikat
          resmi pemerintah atau lembaga terakreditasi.
        </p>
      </section>

      <section className="seksi" aria-labelledby="judul-rincian">
        <div className="seksi-kepala">
          <h2 id="judul-rincian">Rincian sertifikat</h2>
        </div>
        <dl>
          <div>
            <dt>Kode verifikasi</dt>
            <dd>
              <code>{sertifikat.kode_verifikasi}</code>
            </dd>
          </div>
          <div>
            <dt>Kursus</dt>
            <dd>{sertifikat.nama_kursus}</dd>
          </div>
          <div>
            <dt>Nama peserta</dt>
            <dd>{sertifikat.nama_peserta ?? "—"}</dd>
          </div>
          <div>
            <dt>Diterbitkan</dt>
            <dd>{tanggal}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              {sertifikat.dicabut
                ? `Dicabut${sertifikat.dicabut_alasan ? ` — ${sertifikat.dicabut_alasan}` : ""}`
                : "Aktif"}
            </dd>
          </div>
        </dl>
      </section>

      {k && (
        <section className="seksi" aria-labelledby="judul-kriteria">
          <div className="seksi-kepala">
            <h2 id="judul-kriteria">Kriteria kelulusan saat diterbitkan</h2>
            <p>
              Kriteria dihitung server dari data belajar nyata (bukan
              klaim peserta): pelajaran selesai, rata-rata skor kuis,
              dan skor kuis akhir.
            </p>
          </div>
          <dl>
            <div>
              <dt>Pelajaran selesai</dt>
              <dd>
                {k.pelajaran_selesai} dari {k.total_pelajaran} (
                {k.persen_pelajaran}%, ambang{" "}
                {k.kriteria.ambang_pelajaran_persen}%)
              </dd>
            </div>
            <div>
              <dt>Rata-rata skor kuis</dt>
              <dd>
                {k.rata_rata_kuis === null
                  ? "Tidak ada kuis yang dinilai"
                  : `${k.rata_rata_kuis} (ambang ${k.kriteria.ambang_skor_rata_rata})`}
              </dd>
            </div>
            <div>
              <dt>Skor kuis akhir</dt>
              <dd>
                {k.skor_kuis_akhir === null
                  ? "Tidak ada kuis akhir yang dinilai"
                  : `${k.skor_kuis_akhir} (ambang ${k.kriteria.ambang_kuis_akhir})`}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <p>
        <Link className="tombol" href="/akademi">
          Lihat semua kursus
        </Link>
      </p>
    </div>
  );
}
