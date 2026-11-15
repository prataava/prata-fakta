import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import {
  getArtikelPengetahuan,
  getPengetahuanHarian,
  TOPIK_PENGETAHUAN,
} from "@/lib/lanjutan";

export const metadata: Metadata = {
  title: "Pengetahuan",
  description:
    "Perpustakaan pengetahuan PRATA FAKTA: sejarah, geografi, negara, sains, teknologi, ekonomi, alam, tubuh manusia, dan pengetahuan umum — semuanya dengan referensi yang dapat diperiksa.",
};

// Halaman pengetahuan membaca data per request (pola cacheComponents
// untuk rute yang membaca data dinamis dan searchParams).
export const instant = false;

function tanggalHariIniJakarta(): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("/")
    .reverse()
    .join("-");
}

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

export default async function Pengetahuan({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Baca waktu HANYA sesudah connection() — aturan cacheComponents
  // (pola Fase 5): new Date() di jalur render tanpa connection()
  // membuat prerender gagal.
  await connection();
  const sp = await searchParams;
  const topikParam = typeof sp.topik === "string" ? sp.topik : undefined;
  const topikValid = (TOPIK_PENGETAHUAN as readonly string[]).includes(
    topikParam ?? "",
  )
    ? topikParam
    : undefined;
  const hariIni = tanggalHariIniJakarta();
  const [faktaHariIni, daftar] = await Promise.all([
    getPengetahuanHarian(hariIni),
    getArtikelPengetahuan(topikValid),
  ]);

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-pengetahuan">
        <span className="hero-label">Pengetahuan</span>
        <h1 id="judul-pengetahuan">Perpustakaan Pengetahuan</h1>
        <p>
          Sejarah, geografi, negara, sains, teknologi, ekonomi, alam, tubuh
          manusia, dan pengetahuan umum — semuanya dengan referensi yang dapat
          diperiksa.
        </p>
        <p>
          <Link className="tombol tombol-primer" href="/kuis">
            Ikuti Kuis Harian
          </Link>
        </p>
      </section>

      <section className="seksi" aria-labelledby="seksi-fakta-hari-ini">
        <div className="seksi-kepala">
          <h2 id="seksi-fakta-hari-ini">Fakta Hari Ini</h2>
          <p>{formatTanggal(hariIni)}</p>
        </div>
        {!faktaHariIni ? (
          <EmptyState
            judul="Fakta hari ini belum tersedia."
            pesan="Belum ada artikel pengetahuan yang dijadwalkan sebagai Fakta Hari Ini untuk tanggal ini."
          />
        ) : (
          <div className="grid-berita">
            <Link
              className="kartu kartu-artikel"
              href={`/pengetahuan/${faktaHariIni.slug}`}
            >
              <span className="kartu-kategori">
                {LABEL_TOPIK[faktaHariIni.topik] ?? faktaHariIni.topik}
              </span>
              <span className="kartu-judul">{faktaHariIni.judul}</span>
              {faktaHariIni.ringkasan && (
                <span className="kartu-teks">{faktaHariIni.ringkasan}</span>
              )}
              <span className="kartu-meta">
                {faktaHariIni.penulis_nama ?? "Redaksi PRATA FAKTA"}
              </span>
            </Link>
          </div>
        )}
      </section>

      <div className="chip-baris" role="group" aria-label="Filter topik">
        <Link
          className={`chip${!topikValid ? " aktif" : ""}`}
          href="/pengetahuan"
        >
          Semua topik
        </Link>
        {TOPIK_PENGETAHUAN.map((t) => (
          <Link
            key={t}
            className={`chip${topikValid === t ? " aktif" : ""}`}
            href={`/pengetahuan?topik=${t}`}
          >
            {LABEL_TOPIK[t] ?? t}
          </Link>
        ))}
      </div>

      {daftar.length === 0 ? (
        <section className="seksi">
          <EmptyState
            judul="Belum ada artikel pengetahuan."
            pesan={
              topikValid
                ? `Belum ada artikel pengetahuan terbit untuk topik ${LABEL_TOPIK[topikValid] ?? topikValid}.`
                : "Perpustakaan pengetahuan akan terisi begitu redaksi menerbitkan artikel pengetahuan pertama."
            }
            aksi={
              topikValid ? (
                <Link className="tombol" href="/pengetahuan">
                  Lihat semua topik
                </Link>
              ) : undefined
            }
          />
        </section>
      ) : (
        <section className="seksi" aria-label="Daftar artikel pengetahuan">
          <div className="grid-berita">
            {daftar.map((a) => (
              <Link
                className="kartu kartu-artikel"
                href={`/pengetahuan/${a.slug}`}
                key={a.id}
              >
                <span className="kartu-kategori">
                  {LABEL_TOPIK[a.topik] ?? a.topik}
                </span>
                <span className="kartu-judul">{a.judul}</span>
                {a.ringkasan && <span className="kartu-teks">{a.ringkasan}</span>}
                <span className="kartu-meta">
                  {a.harian_tanggal
                    ? `Fakta ${formatTanggal(a.harian_tanggal)}`
                    : (a.penulis_nama ?? "Redaksi PRATA FAKTA")}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
