import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import { getPengetahuanLengkap } from "@/lib/lanjutan";

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
  return {
    title: artikel.judul,
    description: artikel.ringkasan ?? undefined,
  };
}

// Halaman detail pengetahuan membaca data per request (pola
// cacheComponents untuk rute dinamis).
// CATATAN (ditemukan smoke test 16 Nov 2026): `dynamic =
// "force-dynamic"` DITOLAK build karena tidak kompatibel dengan
// cacheComponents; dan notFound() di generateMetadata TIDAK
// mengubah status — dengan Partial Prerender, shell sudah terkirim
// 200 sebelum lubang dinamis memanggil notFound(), sehingga slug
// yang tidak ada menampilkan UI 404 yang benar tetapi dengan
// status HTTP 200 (bukan 404). Ini keterbatasan Next 16 PPR di
// rute ini, bukan kesalahan data; pengguna tetap melihat halaman
// "tidak ditemukan" yang benar. Perbaikan status menunggu
// keputusan arsitektur Fase 7.
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

  return (
    <div className="wadah">
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
