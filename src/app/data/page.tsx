import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import GrafikInteraktif from "@/components/data/GrafikInteraktif";
import PerbandinganPeriode from "@/components/data/PerbandinganPeriode";
import { getPoinIndikator, type PfPoinIndikator } from "@/lib/lanjutan";
import { createClient } from "@/lib/supabase/server";
import { cobaServiceClient } from "@/lib/supabase/service";
import type { CakupanIndikator, PfIndikatorReality } from "@/lib/reality";

export const metadata: Metadata = {
  title: "Pusat Data",
  description:
    "Pusat data PRATA FAKTA: indikator nasional dan global dari sumber resmi, lengkap dengan grafik interaktif, perbandingan periode, dan tabel poin data.",
};

// Halaman data membaca data per request (pola cacheComponents untuk
// rute yang membaca data dinamis dan searchParams).
export const instant = false;

const KATEGORI_DATA = [
  { slug: "nasional", nama: "Nasional" },
  { slug: "global", nama: "Global" },
  { slug: "penduduk", nama: "Penduduk" },
  { slug: "pendidikan", nama: "Pendidikan" },
  { slug: "ekonomi", nama: "Ekonomi" },
  { slug: "energi", nama: "Energi" },
  { slug: "lingkungan", nama: "Lingkungan" },
] as const;

const CAKUPAN_DATA = [
  { slug: "indonesia", nama: "Indonesia" },
  { slug: "dunia", nama: "Dunia" },
] as const;

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

function formatNilai(nilai: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(
    nilai,
  );
}

const KOLOM_INDIKATOR_REALITY =
  "id, nama, slug, kategori, satuan, sumber_nama, sumber_url, metodologi, tanggal_pembaruan, ringkasan_tren, cakupan, frekuensi_update, negara_kode";

function keAngka(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Semua indikator + nilai terakhir masing-masing, lengkap dengan
 * kolom v10 (cakupan/frekuensi_update/negara_kode). Tinggal di
 * halaman server ini (bukan lib/reality.ts) karena lib itu diimpor
 * komponen klien dan tidak boleh merujuk next/headers.
 * Bentuk dasarnya SAMA dengan getIndikator di lib/lanjutan
 * (PfIndikator) + tiga kolom tambahan — halaman lain yang memakai
 * getIndikator tidak berubah. [] bila tabel belum ada.
 */
async function getIndikatorReality(): Promise<PfIndikatorReality[]> {
  try {
    const supabase = cobaServiceClient() ?? (await createClient());
    const { data, error } = await supabase
      .from("pf_data_indicators")
      .select(KOLOM_INDIKATOR_REALITY)
      .order("nama", { ascending: true });
    if (error || !data) return [];

    const hasil: PfIndikatorReality[] = [];
    for (const r of data as unknown as Record<string, unknown>[]) {
      let nilai_terakhir: number | null = null;
      let tanggal_nilai_terakhir: string | null = null;
      try {
        const { data: poin, error: errPoin } = await supabase
          .from("pf_data_points")
          .select("tanggal, nilai")
          .eq("indikator_id", String(r.id))
          .order("tanggal", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!errPoin && poin) {
          nilai_terakhir = keAngka(
            (poin as Record<string, unknown>).nilai,
          );
          tanggal_nilai_terakhir =
            ((poin as Record<string, unknown>).tanggal as string | null) ??
            null;
        }
      } catch {
        // Poin gagal dibaca: indikator tetap tampil tanpa nilai.
      }
      hasil.push({
        id: String(r.id),
        nama: String(r.nama ?? ""),
        slug: String(r.slug ?? ""),
        kategori: String(r.kategori ?? ""),
        satuan: (r.satuan as string | null) ?? null,
        sumber_nama: (r.sumber_nama as string | null) ?? null,
        sumber_url: (r.sumber_url as string | null) ?? null,
        metodologi: (r.metodologi as string | null) ?? null,
        tanggal_pembaruan: (r.tanggal_pembaruan as string | null) ?? null,
        ringkasan_tren: (r.ringkasan_tren as string | null) ?? null,
        nilai_terakhir,
        tanggal_nilai_terakhir,
        cakupan:
          r.cakupan === "dunia" ? "dunia" : ("indonesia" as CakupanIndikator),
        frekuensi_update: (r.frekuensi_update as string | null) ?? null,
        negara_kode: (r.negara_kode as string | null) ?? null,
      });
    }
    return hasil;
  } catch {
    return [];
  }
}

export default async function Data({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const kategoriParam =
    typeof sp.kategori === "string" ? sp.kategori : undefined;
  const kategoriValid = KATEGORI_DATA.some((k) => k.slug === kategoriParam)
    ? kategoriParam
    : undefined;
  const cakupanParam =
    typeof sp.cakupan === "string" ? sp.cakupan : undefined;
  const cakupanValid = CAKUPAN_DATA.some((k) => k.slug === cakupanParam)
    ? cakupanParam
    : undefined;

  // Semua indikator (untuk kartu tema Indonesia vs Dunia yang
  // angkanya nyata), lalu filter tampilan di kode.
  const semuaIndikator = await getIndikatorReality();
  const jumlahIndonesia = semuaIndikator.filter(
    (i) => i.cakupan === "indonesia",
  ).length;
  const jumlahDunia = semuaIndikator.filter(
    (i) => i.cakupan === "dunia",
  ).length;
  const indikator = semuaIndikator.filter(
    (i) =>
      (!kategoriValid || i.kategori === kategoriValid) &&
      (!cakupanValid || i.cakupan === cakupanValid),
  );

  // Poin deret waktu per indikator (untuk grafik + tabel).
  const poinPerIndikator = new Map<string, PfPoinIndikator[]>();
  await Promise.all(
    indikator.map(async (ind) => {
      poinPerIndikator.set(ind.slug, await getPoinIndikator(ind.slug, 120));
    }),
  );

  // Pertahankan filter lain saat mengganti satu filter.
  const tautanFilter = (kategori?: string, cakupan?: string) => {
    const params = new URLSearchParams();
    if (kategori) params.set("kategori", kategori);
    if (cakupan) params.set("cakupan", cakupan);
    const qs = params.toString();
    return qs ? `/data?${qs}` : "/data";
  };

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-data">
        <span className="hero-label">Pusat Data</span>
        <h1 id="judul-data">Data &amp; Statistik</h1>
        <p>
          Indikator nasional dan global dari sumber resmi. Setiap angka
          disertai sumber, satuan, metodologi, dan tanggal pembaruan — tanpa
          angka karangan. Arahkan kursor ke grafik untuk melihat nilai per
          tanggal, dan bandingkan dua tahun pada tiap indikator.
        </p>
      </section>

      <section className="seksi" aria-labelledby="judul-tema">
        <div className="seksi-kepala">
          <h2 id="judul-tema">Tema</h2>
        </div>
        <div className="grid-berita">
          <Link className="kartu kartu-artikel" href="/data/live">
            <span className="kartu-kategori">Data Live</span>
            <span className="kartu-judul">Data Live</span>
            <span className="kartu-teks">
              Gempa, cuaca, kurs, jadwal sholat, Al-Qur&apos;an, hadis,
              wilayah, dan geocoding — langsung dari API publik gratis.
            </span>
            <span className="kartu-meta">Buka Data Live →</span>
          </Link>
          <Link
            className="kartu kartu-artikel"
            href={tautanFilter(kategoriValid, "indonesia")}
          >
            <span className="kartu-kategori">Cakupan</span>
            <span className="kartu-judul">Indonesia</span>
            <span className="kartu-teks">
              {jumlahIndonesia === 0
                ? "Belum ada indikator bercakupan Indonesia."
                : `${jumlahIndonesia} indikator nasional dari sumber resmi.`}
            </span>
            <span className="kartu-meta">Lihat indikator Indonesia →</span>
          </Link>
          <Link
            className="kartu kartu-artikel"
            href={tautanFilter(kategoriValid, "dunia")}
          >
            <span className="kartu-kategori">Cakupan</span>
            <span className="kartu-judul">Dunia</span>
            <span className="kartu-teks">
              {jumlahDunia === 0
                ? "Belum ada indikator bercakupan dunia."
                : `${jumlahDunia} indikator global dari sumber resmi.`}
            </span>
            <span className="kartu-meta">Lihat indikator dunia →</span>
          </Link>
        </div>
      </section>

      <div className="chip-baris" role="group" aria-label="Filter cakupan data">
        <Link
          className={`chip${!cakupanValid ? " aktif" : ""}`}
          href={tautanFilter(kategoriValid)}
        >
          Semua cakupan
        </Link>
        {CAKUPAN_DATA.map((k) => (
          <Link
            key={k.slug}
            className={`chip${cakupanValid === k.slug ? " aktif" : ""}`}
            href={tautanFilter(kategoriValid, k.slug)}
          >
            {k.nama}
          </Link>
        ))}
      </div>

      <div className="chip-baris" role="group" aria-label="Filter kategori data">
        <Link
          className={`chip${!kategoriValid ? " aktif" : ""}`}
          href={tautanFilter(undefined, cakupanValid)}
        >
          Semua kategori
        </Link>
        {KATEGORI_DATA.map((k) => (
          <Link
            key={k.slug}
            className={`chip${kategoriValid === k.slug ? " aktif" : ""}`}
            href={tautanFilter(k.slug, cakupanValid)}
          >
            {k.nama}
          </Link>
        ))}
      </div>

      {indikator.length === 0 ? (
        <section className="seksi">
          <EmptyState
            judul="Belum ada indikator resmi yang terdaftar."
            pesan={
              kategoriValid || cakupanValid
                ? "Belum ada indikator untuk filter ini. Coba filter lain atau lihat semua indikator."
                : "Pusat data akan terisi begitu redaksi mendaftarkan indikator dari sumber resmi beserta poin datanya."
            }
            aksi={
              kategoriValid || cakupanValid ? (
                <Link className="tombol" href="/data">
                  Lihat semua indikator
                </Link>
              ) : undefined
            }
          />
        </section>
      ) : (
        <section className="seksi" aria-label="Daftar indikator">
          <div className="grid-berita">
            {indikator.map((ind) => {
              const poin = poinPerIndikator.get(ind.slug) ?? [];
              return (
                <article className="kartu" key={ind.id}>
                  <span className="kartu-kategori">
                    {KATEGORI_DATA.find((k) => k.slug === ind.kategori)?.nama ??
                      ind.kategori}
                    {` · ${ind.cakupan === "dunia" ? "Dunia" : "Indonesia"}`}
                  </span>
                  <span className="kartu-judul">{ind.nama}</span>
                  <span className="kartu-meta">
                    {ind.nilai_terakhir !== null
                      ? `Nilai terakhir: ${formatNilai(ind.nilai_terakhir)}${ind.satuan ? ` ${ind.satuan}` : ""}${ind.tanggal_nilai_terakhir ? ` · ${formatTanggal(ind.tanggal_nilai_terakhir)}` : ""}`
                      : "Belum ada poin data."}
                  </span>
                  {ind.frekuensi_update && (
                    <span className="kartu-meta">
                      Frekuensi pembaruan: {ind.frekuensi_update}
                    </span>
                  )}
                  {ind.negara_kode && (
                    <span className="kartu-meta">
                      Negara: {ind.negara_kode}
                    </span>
                  )}
                  {ind.ringkasan_tren && (
                    <span className="kartu-teks">{ind.ringkasan_tren}</span>
                  )}
                  <GrafikInteraktif
                    poin={poin}
                    label={ind.nama}
                    satuan={ind.satuan}
                  />
                  <h3 style={{ fontSize: "1rem", margin: "12px 0 4px" }}>
                    Perbandingan periode
                  </h3>
                  <PerbandinganPeriode
                    poin={poin}
                    satuan={ind.satuan}
                    nama={ind.nama}
                  />
                  {ind.metodologi && (
                    <span className="kartu-teks">
                      <strong>Metodologi:</strong> {ind.metodologi}
                    </span>
                  )}
                  <span className="kartu-meta">
                    Sumber:{" "}
                    {ind.sumber_url ? (
                      <a
                        href={ind.sumber_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {ind.sumber_nama ?? ind.sumber_url}
                      </a>
                    ) : (
                      (ind.sumber_nama ?? "—")
                    )}
                    {` · Diperbarui: ${formatTanggal(ind.tanggal_pembaruan)}`}
                  </span>
                  {poin.length > 0 && (
                    <div className="tabel-gulir">
                      <table className="tabel-data">
                        <thead>
                          <tr>
                            <th scope="col">Tanggal</th>
                            <th scope="col">Nilai{ind.satuan ? ` (${ind.satuan})` : ""}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...poin].reverse().map((p) => (
                            <tr key={p.tanggal}>
                              <td>{formatTanggal(p.tanggal)}</td>
                              <td>{formatNilai(p.nilai)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
