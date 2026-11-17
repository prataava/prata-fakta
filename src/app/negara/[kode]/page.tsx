import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import TombolIkutiTopik from "@/components/lanjutan/TombolIkutiTopik";
import FaktaNegara from "@/components/negara/FaktaNegara";
import { formatAngka, getNegara } from "@/lib/negara";
import { getTopikDiikuti } from "@/lib/lanjutan";
import { urlSitus } from "@/lib/situs";
import { createClient } from "@/lib/supabase/server";

// 404 nyata untuk kode yang tidak ada DITANGANI DI PROXY
// (src/proxy.ts — pola yang sama dengan /pengetahuan/[slug]
// Fase 7): proxy memeriksa keberadaan kode di pf_countries
// SEBELUM halaman dirender. notFound() di sini tetap ada
// sebagai pengaman kedua (UI 404 + noindex).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ kode: string }>;
}): Promise<Metadata> {
  const { kode } = await params;
  const profil = await getNegara(kode);
  if (!profil) notFound();
  const url = `${urlSitus()}/negara/${profil.negara.kode}`;
  return {
    title: `Profil ${profil.negara.nama}`,
    description: `Profil ${profil.negara.nama}: identitas, angka bersumber, fakta kunci, berita terbaru, dan data historis.`,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: `Profil ${profil.negara.nama}`,
    },
  };
}

export const instant = false;

function formatTanggal(tanggal: string | null): string {
  if (!tanggal) return "—";
  const d = new Date(tanggal);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

export default async function ProfilNegara({
  params,
}: {
  params: Promise<{ kode: string }>;
}) {
  const { kode } = await params;
  const profil = await getNegara(kode);
  if (!profil) notFound();
  const { negara } = profil;

  // P1-5: status ikuti topik negara (target = nama negara; baris
  // lama yang memakai kode ISO-2 tetap dikenali agar tombol tidak
  // berbohong — berhenti mengikuti memakai id baris).
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
        (t) =>
          t.tipe === "negara" &&
          (t.target === negara.nama ||
            t.target.toUpperCase() === negara.kode.toUpperCase()),
      );
      mengikuti = Boolean(baris);
      mengikutiId = baris?.id ?? null;
    }
  } catch {
    masuk = false;
  }

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-negara">
        <span className="hero-label">Profil Negara · {negara.kode}</span>
        <h1 id="judul-negara">{negara.nama}</h1>
        <p>
          <TombolIkutiTopik
            tipe="negara"
            target={negara.nama}
            mengikutiAwal={mengikuti}
            mengikutiId={mengikutiId}
            masuk={masuk}
          />
        </p>
        <p>
          <Link href="/negara">← Semua negara</Link>
        </p>
      </section>

      <section className="seksi" aria-labelledby="seksi-identitas">
        <div className="seksi-kepala">
          <h2 id="seksi-identitas">Identitas</h2>
        </div>
        <ul>
          <li>
            <strong>Nama:</strong> {negara.nama}
          </li>
          {negara.ibu_kota && (
            <li>
              <strong>Ibu kota:</strong> {negara.ibu_kota}
            </li>
          )}
          {negara.sistem_pemerintahan && (
            <li>
              <strong>Sistem pemerintahan:</strong>{" "}
              {negara.sistem_pemerintahan}
            </li>
          )}
          {negara.bahasa && (
            <li>
              <strong>Bahasa:</strong> {negara.bahasa}
            </li>
          )}
          {negara.mata_uang && (
            <li>
              <strong>Mata uang:</strong> {negara.mata_uang}
            </li>
          )}
        </ul>
      </section>

      <section className="seksi" aria-labelledby="seksi-ekonomi">
        <div className="seksi-kepala">
          <h2 id="seksi-ekonomi">Ekonomi &amp; Penduduk</h2>
          {negara.sumber && (
            <p>
              Sumber: {negara.sumber}
              {negara.periode_referensi
                ? ` · Periode: ${negara.periode_referensi}`
                : ""}
            </p>
          )}
        </div>
        {!profil.angkaTersedia ? (
          <EmptyState
            judul="Angka belum tersedia."
            pesan="Profil negara ini belum mencatat sumber angka (populasi, PDB, luas), jadi angkanya tidak ditampilkan sampai editor mencatat sumbernya."
          />
        ) : (
          <ul>
            {negara.populasi !== null && (
              <li>
                <strong>Populasi:</strong> {formatAngka(negara.populasi)} jiwa
              </li>
            )}
            {negara.pdb !== null && (
              <li>
                <strong>PDB:</strong> {formatAngka(negara.pdb)}
              </li>
            )}
            {negara.luas_km2 !== null && (
              <li>
                <strong>Luas:</strong> {formatAngka(negara.luas_km2)} km²
              </li>
            )}
            {negara.populasi === null &&
              negara.pdb === null &&
              negara.luas_km2 === null && (
                <li>Belum ada angka yang tercatat untuk negara ini.</li>
              )}
          </ul>
        )}
      </section>

      {profil.faktaBernilai.length === 0 &&
      profil.faktaTanpaSumber.length === 0 ? (
        <section className="seksi">
          <EmptyState
            judul="Belum ada fakta kunci."
            pesan="Belum ada fakta kunci yang tercatat untuk negara ini."
          />
        </section>
      ) : (
        <FaktaNegara
          bernilai={profil.faktaBernilai}
          tanpaSumber={profil.faktaTanpaSumber}
        />
      )}

      <section className="seksi" aria-labelledby="seksi-berita">
        <div className="seksi-kepala">
          <h2 id="seksi-berita">Berita Terbaru</h2>
          <p>Artikel terbit yang ditandai untuk {negara.nama}.</p>
        </div>
        {profil.berita.length === 0 ? (
          <EmptyState
            judul="Belum ada berita untuk negara ini."
            pesan="Belum ada artikel terbit yang ditandai untuk negara ini."
          />
        ) : (
          <div className="grid-berita">
            {profil.berita.map((a) => (
              <Link
                className="kartu kartu-artikel"
                href={`/artikel/${a.slug}`}
                key={a.id}
              >
                <span className="kartu-kategori">
                  {a.status_verifikasi}
                </span>
                <span className="kartu-judul">{a.judul}</span>
                {a.ringkasan && (
                  <span className="kartu-teks">{a.ringkasan}</span>
                )}
                <span className="kartu-meta">
                  {formatTanggal(a.diterbitkan_pada)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="seksi" aria-labelledby="seksi-sejarah">
        <div className="seksi-kepala">
          <h2 id="seksi-sejarah">Data Historis</h2>
          <p>Peristiwa tercatat untuk {negara.nama}, terbaru dulu.</p>
        </div>
        {profil.events.length === 0 ? (
          <EmptyState
            judul="Belum ada data historis."
            pesan="Belum ada peristiwa yang ditandai untuk negara ini."
          />
        ) : (
          <ul>
            {profil.events.map((e) => (
              <li key={e.id}>
                <strong>{formatTanggal(e.dimulai_pada)}</strong> — {e.judul}
                {e.era ? ` (${e.era})` : ""}
                {e.penting ? " · Penting" : ""}
                {e.ringkasan ? ` — ${e.ringkasan}` : ""}
                {e.sumber_url && (
                  <>
                    {" "}
                    <a
                      href={e.sumber_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Sumber
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <p>
          <Link className="tombol tombol-hantu" href="/timeline">
            Lihat di Linimasa
          </Link>
        </p>
      </section>

      <section className="seksi" aria-labelledby="seksi-indikator">
        <div className="seksi-kepala">
          <h2 id="seksi-indikator">Indikator Data</h2>
          <p>Indikator yang ditandai untuk {negara.nama}.</p>
        </div>
        {profil.indikator.length === 0 ? (
          <EmptyState
            judul="Belum ada indikator untuk negara ini."
            pesan="Belum ada indikator data yang ditandai untuk negara ini."
          />
        ) : (
          <ul>
            {profil.indikator.map((ind) => (
              <li key={ind.id}>
                <strong>{ind.nama}</strong>
                {ind.nilai_terakhir !== null ? (
                  <>
                    {`: ${formatAngka(ind.nilai_terakhir)}${ind.satuan ? ` ${ind.satuan}` : ""}`}
                    {ind.sumber_nama ? ` — Sumber: ${ind.sumber_nama}` : ""}
                    {ind.tanggal_nilai_terakhir
                      ? ` (${formatTanggal(ind.tanggal_nilai_terakhir)})`
                      : ""}
                  </>
                ) : (
                  " — nilai terakhir belum tersedia"
                )}
              </li>
            ))}
          </ul>
        )}
        <p>
          <Link className="tombol tombol-hantu" href="/data">
            Lihat di Pusat Data
          </Link>
        </p>
      </section>

      <p>
        <Link className="tombol" href="/negara">
          Semua negara
        </Link>{" "}
        <Link className="tombol tombol-hantu" href="/peta">
          Lihat di Peta
        </Link>{" "}
        <Link className="tombol tombol-hantu" href={`/graf/negara/${negara.kode}`}>
          Lihat di graf
        </Link>
      </p>
    </div>
  );
}
