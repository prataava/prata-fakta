import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import {
  getArsipSejarah,
  getHariIniDalamSejarah,
  tahunFilterValid,
} from "@/lib/sejarah";

export const metadata: Metadata = {
  title: "Arsip Sejarah",
  description:
    "Historical Archive PRATA FAKTA: hari ini dalam sejarah, navigasi tahun, dan filter era atas peristiwa yang tercatat.",
};

// Halaman arsip membaca data per request (pola cacheComponents
// untuk rute yang membaca data dinamis dan searchParams).
export const instant = false;

function formatTanggal(tanggal: string | null): string {
  if (!tanggal) return "Waktu belum tersedia";
  const d = new Date(tanggal);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function formatTanggalPanjang(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return yyyyMmDd;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

/** Bangun href /sejarah dengan parameter filter yang dipertahankan. */
function hrefSejarah(param: Record<string, string | undefined>): string {
  const cari = new URLSearchParams();
  for (const [k, v] of Object.entries(param)) {
    if (v !== undefined && v !== "") cari.set(k, v);
  }
  const q = cari.toString();
  return q ? `/sejarah?${q}` : "/sejarah";
}

export default async function Sejarah({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Baca waktu HANYA sesudah connection() — aturan cacheComponents
  // (pola /pengetahuan): new Date() di jalur render tanpa
  // connection() membuat prerender gagal.
  await connection();
  const sp = await searchParams;
  const tahunParam = typeof sp.tahun === "string" ? sp.tahun : undefined;
  const eraParam =
    typeof sp.era === "string" && sp.era.trim() !== ""
      ? sp.era.slice(0, 60)
      : undefined;
  const pentingParam = sp.penting === "1";
  const tahunAngka =
    tahunParam && /^\d{4}$/.test(tahunParam)
      ? Number(tahunParam)
      : undefined;
  const tahunValid =
    tahunAngka !== undefined && tahunFilterValid(tahunAngka)
      ? tahunAngka
      : undefined;

  const [hariIni, arsip] = await Promise.all([
    getHariIniDalamSejarah(),
    getArsipSejarah({
      tahun: tahunValid,
      era: eraParam,
      hanyaPenting: pentingParam,
    }),
  ]);

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-sejarah">
        <span className="hero-label">Historical Archive</span>
        <h1 id="judul-sejarah">Arsip Sejarah</h1>
        <p>
          Peristiwa yang tercatat di PRATA FAKTA, ditelusuri lewat
          tanggal, tahun, dan era — semuanya bersumber dari data
          peristiwa yang benar-benar ada.
        </p>
      </section>

      <section className="seksi" aria-labelledby="seksi-hari-ini">
        <div className="seksi-kepala">
          <h2 id="seksi-hari-ini">Hari ini dalam sejarah</h2>
          <p>{formatTanggalPanjang(hariIni.tanggal)}</p>
        </div>
        {!hariIni.tersedia ? (
          <EmptyState
            judul="Arsip sejarah belum tersedia."
            pesan="Tabel peristiwa tidak dapat dibaca — migrasi mungkin belum dijalankan."
          />
        ) : hariIni.events.length === 0 ? (
          <EmptyState
            judul="Tidak ada peristiwa yang tercatat pada tanggal ini."
            pesan="Belum ada peristiwa yang dimulai pada hari-bulan ini di tahun mana pun."
          />
        ) : (
          <div className="grid-berita">
            {hariIni.events.map((e) => (
              <article className="kartu" key={e.id}>
                <span className="kartu-kategori">
                  {formatTanggal(e.dimulai_pada)}
                  {e.era ? ` · Era ${e.era}` : ""}
                  {e.penting ? " · Penting" : ""}
                </span>
                <span className="kartu-judul">{e.judul}</span>
                {e.ringkasan && (
                  <span className="kartu-teks">{e.ringkasan}</span>
                )}
                <span className="kartu-meta">
                  {[e.lokasi_teks, e.negara_nama ?? e.negara_kode]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <Link href={`/timeline#event-${e.id}`}>Lihat di Timeline</Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="chip-baris" role="group" aria-label="Filter tahun">
        <Link
          className={`chip${!tahunValid ? " aktif" : ""}`}
          href={hrefSejarah({ era: eraParam, penting: pentingParam ? "1" : undefined })}
        >
          Semua tahun
        </Link>
        {arsip.tahun.map((t) => (
          <Link
            key={t}
            className={`chip${tahunValid === t ? " aktif" : ""}`}
            href={hrefSejarah({
              tahun: String(t),
              era: eraParam,
              penting: pentingParam ? "1" : undefined,
            })}
          >
            {t}
          </Link>
        ))}
      </div>

      {arsip.era.length > 0 && (
        <div
          className="chip-baris"
          role="group"
          aria-label="Filter era"
          style={{ marginTop: 8 }}
        >
          <Link
            className={`chip${!eraParam ? " aktif" : ""}`}
            href={hrefSejarah({
              tahun: tahunValid ? String(tahunValid) : undefined,
              penting: pentingParam ? "1" : undefined,
            })}
          >
            Semua era
          </Link>
          {arsip.era.map((era) => (
            <Link
              key={era}
              className={`chip${eraParam === era ? " aktif" : ""}`}
              href={hrefSejarah({
                tahun: tahunValid ? String(tahunValid) : undefined,
                era,
                penting: pentingParam ? "1" : undefined,
              })}
            >
              {era}
            </Link>
          ))}
        </div>
      )}

      <div className="chip-baris" role="group" aria-label="Filter penting">
        <Link
          className={`chip${!pentingParam ? " aktif" : ""}`}
          href={hrefSejarah({
            tahun: tahunValid ? String(tahunValid) : undefined,
            era: eraParam,
          })}
        >
          Semua peristiwa
        </Link>
        <Link
          className={`chip${pentingParam ? " aktif" : ""}`}
          href={hrefSejarah({
            tahun: tahunValid ? String(tahunValid) : undefined,
            era: eraParam,
            penting: "1",
          })}
        >
          Hanya yang penting
        </Link>
      </div>

      {!arsip.tersedia ? (
        <section className="seksi">
          <EmptyState
            judul="Arsip sejarah belum tersedia."
            pesan="Tabel peristiwa tidak dapat dibaca — migrasi mungkin belum dijalankan."
          />
        </section>
      ) : arsip.events.length === 0 ? (
        <section className="seksi">
          <EmptyState
            judul="Belum ada peristiwa untuk filter ini."
            pesan={
              tahunValid || eraParam || pentingParam
                ? "Tidak ada peristiwa yang tercatat untuk tahun, era, atau filter yang dipilih."
                : "Arsip sejarah akan terisi begitu redaksi mencatat peristiwa."
            }
            aksi={
              tahunValid || eraParam || pentingParam ? (
                <Link className="tombol" href="/sejarah">
                  Lihat semua peristiwa
                </Link>
              ) : undefined
            }
          />
        </section>
      ) : (
        <section className="seksi" aria-label="Daftar peristiwa sejarah">
          <div className="grid-berita">
            {arsip.events.map((e) => (
              <article className="kartu" key={e.id}>
                <span className="kartu-kategori">
                  {formatTanggal(e.dimulai_pada)}
                  {e.era ? ` · Era ${e.era}` : ""}
                  {e.penting ? " · Penting" : ""}
                </span>
                <span className="kartu-judul">{e.judul}</span>
                {e.ringkasan && (
                  <span className="kartu-teks">{e.ringkasan}</span>
                )}
                <span className="kartu-meta">
                  {[e.lokasi_teks, e.negara_nama ?? e.negara_kode]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <Link href={`/timeline#event-${e.id}`}>Lihat di Timeline</Link>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
