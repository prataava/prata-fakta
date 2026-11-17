import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import {
  Cpu,
  Flag,
  FlaskConical,
  Globe,
  History,
  Landmark,
  Leaf,
  Map as IkonPeta,
  Newspaper,
  TrendingUp,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import PetaDuniaLazy from "@/components/peta/PetaDuniaLazy";
import {
  DOMAIN_INTELIJEN,
  getSorotanIntelijen,
  type KunciDomain,
} from "@/lib/intelijen";
import {
  formatAngka,
  formatTanggal,
  formatTanggalHari,
  formatTanggalJam,
} from "@/lib/format";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";
import type { EntriBrief } from "@/lib/ai/brief";

export const metadata: Metadata = {
  title: "Intelijen Dunia",
  description:
    "Hub intelijen dunia PRATA FAKTA: peta peristiwa, Brief Dunia terbaru, sorotan negara, dan timeline — disaring per domain dari kategori yang sudah ada.",
};

// Halaman membaca data + searchParams (?domain=) per request —
// rute diblokir di server per request (pola resmi cacheComponents).
// connection() di awal menjaga skrip $RC React tetap ber-nonce
// (insiden /jelajahi: halaman yang tampak statis tanpa connection()
// membuat skrip bootstrap terpanggang tanpa nonce -> hidrasi gagal).
export const instant = false;

// Ikon per domain (lucide-react saja — satu library ikon repo).
const IKON_DOMAIN: Record<KunciDomain, typeof Globe> = {
  ekonomi: TrendingUp,
  teknologi: Cpu,
  sains: FlaskConical,
  lingkungan: Leaf,
  politik: Landmark,
  indonesia: Flag,
  dunia: Globe,
};

function formatWaktu(waktu: string | null): string | null {
  if (!waktu) return null;
  const d = new Date(waktu);
  if (Number.isNaN(d.getTime())) return waktu;
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function KartuEntriDunia({ entri }: { entri: EntriBrief }) {
  const waktu = formatWaktu(entri.waktu);
  const meta = [
    waktu ?? entri.label_waktu ?? null,
    entri.lokasi,
    `Sumber: ${entri.sumber}`,
  ]
    .filter((b): b is string => !!b)
    .join(" · ");
  return (
    <a
      className="kartu kartu-artikel"
      href={entri.tautan}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="kartu-kategori">
        {entri.kategori} ·{" "}
        <span className={kelasLencanaStatus(entri.status_verifikasi)}>
          {labelStatusVerifikasi(entri.status_verifikasi)}
        </span>
      </span>
      <span className="kartu-judul">{entri.judul}</span>
      <span className="kartu-teks">{entri.ringkasan}</span>
      <span className="kartu-meta">{meta}</span>
    </a>
  );
}

export default async function Intelijen({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Baca waktu/request HANYA sesudah connection() — aturan
  // cacheComponents (lihat komentar di atas).
  await connection();
  const sp = searchParams ? await searchParams : {};
  const data = await getSorotanIntelijen(sp.domain);
  const { domain } = data;
  const sorotanUtama = data.sorotan[0];
  const sorotanLain = data.sorotan.slice(1);

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-intelijen">
        <span className="hero-label">Intelijen Dunia</span>
        <h1 id="judul-intelijen">Intelijen Dunia</h1>
        <p>
          Peta peristiwa, Brief Dunia terbaru, negara yang sedang
          disorot, dan kronologi dunia — dirakit dari data yang sudah
          terbit dan terverifikasi, bukan angka karangan. Pilih domain
          di bawah untuk menyaring sorotan negara dan timeline menurut
          kategori dan subkategori yang sudah ada.
        </p>
      </section>

      {/* Filter domain — menyaring Sorotan Negara + Timeline
          Dunia. Brief Dunia dan Peta Dunia tidak disaring:
          brief hanya membawa kategori utama (tanpa subkategori),
          dan peta adalah gambaran dunia, bukan hasil saringan. */}
      <div
        className="chip-baris"
        role="group"
        aria-label="Filter domain intelijen"
      >
        <Link
          className={`chip${!domain ? " aktif" : ""}`}
          href="/intelijen"
        >
          <Globe size={14} aria-hidden="true" /> Semua domain
        </Link>
        {DOMAIN_INTELIJEN.map((d) => {
          const Ikon = IKON_DOMAIN[d.kunci];
          return (
            <Link
              key={d.kunci}
              className={`chip${domain?.kunci === d.kunci ? " aktif" : ""}`}
              href={`/intelijen?domain=${d.kunci}`}
              title={d.deskripsi}
            >
              <Ikon size={14} aria-hidden="true" /> {d.nama}
            </Link>
          );
        })}
      </div>
      {domain ? (
        <p role="status" style={{ color: "var(--muted)", marginTop: 12 }}>
          Menampilkan sorotan negara dan timeline untuk domain{" "}
          <strong>{domain.nama}</strong> — {domain.deskripsi}
        </p>
      ) : null}
      {!data.domainDikenal && data.domainMentah ? (
        <p role="status" style={{ color: "var(--muted)", marginTop: 12 }}>
          Domain &ldquo;{data.domainMentah}&rdquo; tidak dikenal —
          menampilkan semua domain. Domain yang tersedia:{" "}
          {DOMAIN_INTELIJEN.map((d) => d.nama).join(", ")}.
        </p>
      ) : null}

      {/* (a) Peta Dunia ringkas — pakai ulang PetaDuniaLazy
          (Leaflet lazy, sama seperti /peta). */}
      <section className="seksi" aria-labelledby="seksi-peta-dunia">
        <div className="seksi-kepala">
          <h2 id="seksi-peta-dunia">
            <IkonPeta size={20} aria-hidden="true" /> Peta Dunia
          </h2>
          <p>
            Peristiwa dan artikel berkoordinat terverifikasi.{" "}
            <Link href="/peta">Lihat peta lengkap</Link>.
          </p>
        </div>
        <PetaDuniaLazy marker={data.marker} />
        <p style={{ color: "var(--muted)", fontSize: "0.92rem", marginTop: 8 }}>
          Peta: © kontributor OpenStreetMap. Menampilkan {data.marker.length}{" "}
          marker dari {data.jumlahMarkerPeristiwa} peristiwa berkoordinat
          dan {data.jumlahMarkerArtikel} artikel berkoordinat.
        </p>
        {data.marker.length === 0 && (
          <EmptyState
            judul="Belum ada marker di peta"
            pesan="Belum ada satu pun peristiwa atau artikel dengan koordinat terverifikasi. Marker akan muncul begitu redaksi memverifikasi lokasi peristiwa."
            aksi={
              <Link className="tombol" href="/peta">
                Lihat Peta Peristiwa
              </Link>
            }
          />
        )}
      </section>

      {/* (b) Brief Dunia terbaru — entri brief seksi "dunia"
          dari Daily Brief terbit. */}
      <section className="seksi" aria-labelledby="seksi-brief-dunia">
        <div className="seksi-kepala">
          <h2 id="seksi-brief-dunia">
            <Newspaper size={20} aria-hidden="true" /> Brief Dunia terbaru
          </h2>
          <p>
            {data.brief
              ? `Edisi ${formatTanggalHari(data.brief.tanggal)} — entri seksi Dunia dari Daily Brief terbit.`
              : "Entri seksi Dunia dari Daily Brief terbit."}{" "}
            <Link href="/brief">Lihat Daily Brief lengkap</Link>.
          </p>
        </div>
        {!data.brief ? (
          <EmptyState
            judul="Daily Brief belum terbit"
            pesan="Belum ada Daily Brief yang diterbitkan, jadi belum ada entri Brief Dunia untuk ditampilkan."
            aksi={
              <Link className="tombol" href="/brief">
                Lihat Daily Brief
              </Link>
            }
          />
        ) : data.entriDunia.length === 0 ? (
          <EmptyState
            judul="Belum ada entri Dunia di brief terbaru"
            pesan={`Daily Brief edisi ${formatTanggalHari(data.brief.tanggal)} belum memuat entri seksi Dunia.`}
            aksi={
              <Link className="tombol" href="/brief">
                Lihat Daily Brief
              </Link>
            }
          />
        ) : (
          <div className="grid-berita">
            {data.entriDunia.map((e) => (
              <KartuEntriDunia key={`${e.tautan}-${e.judul}`} entri={e} />
            ))}
          </div>
        )}
      </section>

      {/* (c) Sorotan Negara — 3–5 negara dengan berita terbaru.
          Komposisi editorial: satu sorotan utama (kartu besar)
          + sisanya kartu ringkas, bukan grid yang semuanya sama. */}
      <section className="seksi" aria-labelledby="seksi-sorotan-negara">
        <div className="seksi-kepala">
          <h2 id="seksi-sorotan-negara">
            <Globe size={20} aria-hidden="true" /> Sorotan Negara
          </h2>
          <p>
            Negara dengan berita terbit terbaru
            {domain ? ` — domain ${domain.nama}` : ""}.{" "}
            <Link href="/negara">Lihat semua profil negara</Link>.
          </p>
        </div>
        {data.sorotan.length === 0 ? (
          <EmptyState
            judul={
              domain
                ? `Belum ada sorotan negara untuk domain ${domain.nama}`
                : "Belum ada negara yang disorot"
            }
            pesan={
              domain
                ? "Belum ada berita terbit dari negara mana pun yang masuk domain ini. Coba domain lain atau lihat semua domain."
                : "Belum ada berita terbit yang ditautkan ke negara mana pun — sorotan akan muncul begitu ada artikel terbit dengan negara_kode."
            }
            aksi={
              <Link className="tombol" href="/negara">
                Lihat Profil Negara
              </Link>
            }
          />
        ) : (
          <>
            {sorotanUtama && (
              <article className="kartu" style={{ marginBottom: 16 }}>
                <span className="kartu-kategori">
                  Sorotan utama · {sorotanUtama.negara.nama}
                  {sorotanUtama.negara.ibu_kota
                    ? ` · Ibu kota: ${sorotanUtama.negara.ibu_kota}`
                    : ""}
                </span>
                <span className="kartu-judul">
                  <Link href={`/artikel/${sorotanUtama.artikel.slug}`}>
                    {sorotanUtama.artikel.judul}
                  </Link>
                </span>
                {sorotanUtama.artikel.ringkasan && (
                  <span className="kartu-teks">
                    {sorotanUtama.artikel.ringkasan}
                  </span>
                )}
                <span className="kartu-meta">
                  {formatTanggal(
                    sorotanUtama.artikel.diterbitkan_pada,
                    "Tanggal terbit belum tersedia",
                  )}
                  {sorotanUtama.artikel.kategori_slug
                    ? ` · ${sorotanUtama.artikel.kategori_slug}`
                    : ""}
                  {" · "}
                  <span
                    className={kelasLencanaStatus(
                      sorotanUtama.artikel.status_verifikasi,
                    )}
                  >
                    {labelStatusVerifikasi(
                      sorotanUtama.artikel.status_verifikasi,
                    )}
                  </span>
                </span>
                {sorotanUtama.angkaTersedia &&
                sorotanUtama.negara.populasi !== null ? (
                  <span className="kartu-meta">
                    Populasi: {formatAngka(sorotanUtama.negara.populasi)} jiwa
                    {sorotanUtama.negara.sumber
                      ? ` · Sumber: ${sorotanUtama.negara.sumber}`
                      : ""}
                    {sorotanUtama.negara.periode_referensi
                      ? ` (${sorotanUtama.negara.periode_referensi})`
                      : ""}
                  </span>
                ) : null}
                {sorotanUtama.faktaUtama ? (
                  <span className="kartu-meta">
                    {sorotanUtama.faktaUtama.kunci.replace(/_/g, " ")}:{" "}
                    {sorotanUtama.faktaUtama.nilai}
                    {sorotanUtama.faktaUtama.satuan
                      ? ` ${sorotanUtama.faktaUtama.satuan}`
                      : ""}
                    {sorotanUtama.faktaUtama.sumber
                      ? ` · Sumber: ${sorotanUtama.faktaUtama.sumber}`
                      : ""}
                    {sorotanUtama.faktaUtama.periode
                      ? ` (${sorotanUtama.faktaUtama.periode})`
                      : ""}
                  </span>
                ) : null}
                <span style={{ marginTop: 12 }}>
                  <Link
                    className="tombol tombol-primer"
                    href={`/negara/${sorotanUtama.negara.kode}`}
                  >
                    Profil {sorotanUtama.negara.nama}
                  </Link>
                </span>
              </article>
            )}
            {sorotanLain.length > 0 && (
              <div className="grid-berita">
                {sorotanLain.map((s) => (
                  <article className="kartu" key={s.negara.id}>
                    <span className="kartu-kategori">
                      {s.negara.nama}
                      {s.negara.ibu_kota ? ` · ${s.negara.ibu_kota}` : ""}
                    </span>
                    <span className="kartu-judul">
                      <Link href={`/artikel/${s.artikel.slug}`}>
                        {s.artikel.judul}
                      </Link>
                    </span>
                    <span className="kartu-meta">
                      {formatTanggal(
                        s.artikel.diterbitkan_pada,
                        "Tanggal terbit belum tersedia",
                      )}
                      {" · "}
                      <span
                        className={kelasLencanaStatus(
                          s.artikel.status_verifikasi,
                        )}
                      >
                        {labelStatusVerifikasi(s.artikel.status_verifikasi)}
                      </span>
                    </span>
                    {s.angkaTersedia && s.negara.populasi !== null ? (
                      <span className="kartu-meta">
                        Populasi: {formatAngka(s.negara.populasi)} jiwa
                        {s.negara.sumber
                          ? ` · Sumber: ${s.negara.sumber}`
                          : ""}
                        {s.negara.periode_referensi
                          ? ` (${s.negara.periode_referensi})`
                          : ""}
                      </span>
                    ) : null}
                    <span style={{ marginTop: 12 }}>
                      <Link
                        className="tombol tombol-hantu"
                        href={`/negara/${s.negara.kode}`}
                      >
                        Profil {s.negara.nama}
                      </Link>
                    </span>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* (d) Timeline Dunia ringkas — 5 peristiwa terbaru. */}
      <section className="seksi" aria-labelledby="seksi-timeline-dunia">
        <div className="seksi-kepala">
          <h2 id="seksi-timeline-dunia">
            <History size={20} aria-hidden="true" /> Timeline Dunia
          </h2>
          <p>
            Lima peristiwa terbaru
            {domain ? ` — domain ${domain.nama}` : ""}.{" "}
            <Link href="/timeline">Lihat timeline lengkap</Link>.
          </p>
        </div>
        {data.timeline.length === 0 ? (
          <EmptyState
            judul={
              domain
                ? `Belum ada peristiwa untuk domain ${domain.nama}`
                : "Belum ada peristiwa yang tercatat"
            }
            pesan={
              domain
                ? "Belum ada peristiwa yang artikel tautannya masuk domain ini." +
                  (data.peristiwaTakTerklasifikasi > 0
                    ? ` ${data.peristiwaTakTerklasifikasi} peristiwa tidak dapat diklasifikasikan karena tidak punya artikel tautan yang dapat dibaca — lihat semua peristiwa di Timeline.`
                    : " Coba domain lain atau lihat semua domain.")
                : "Timeline akan terisi begitu redaksi mencatat peristiwa beserta kronologinya."
            }
            aksi={
              <Link className="tombol" href="/timeline">
                Lihat Timeline
              </Link>
            }
          />
        ) : (
          <>
            <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {data.timeline.map((e) => (
                <li key={e.id} style={{ marginBottom: 16 }}>
                  <article className="kartu">
                    <span className="kartu-kategori">
                      {formatTanggalJam(e.dimulai_pada, "Waktu belum tersedia")}
                      {e.lokasi_teks ? ` · ${e.lokasi_teks}` : ""}
                    </span>
                    <span className="kartu-judul">
                      <Link href={`/timeline#event-${e.id}`}>{e.judul}</Link>
                    </span>
                    {e.ringkasan && (
                      <span className="kartu-teks">{e.ringkasan}</span>
                    )}
                    {e.sumber_url && (
                      <span className="kartu-meta">
                        Sumber:{" "}
                        <a
                          href={e.sumber_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {e.sumber_url}
                        </a>
                      </span>
                    )}
                  </article>
                </li>
              ))}
            </ol>
            {domain && data.peristiwaTakTerklasifikasi > 0 ? (
              <p
                role="status"
                style={{ color: "var(--muted)", marginTop: 12 }}
              >
                Catatan jujur: {data.peristiwaTakTerklasifikasi} peristiwa
                tidak dapat diklasifikasikan ke domain ini karena tidak
                punya artikel tautan yang dapat dibaca — peristiwa itu
                tidak ditampilkan di saringan ini, tapi tetap ada di{" "}
                <Link href="/timeline">Timeline lengkap</Link>.
              </p>
            ) : null}
            <p style={{ marginTop: 16 }}>
              <Link className="tombol tombol-primer" href="/timeline">
                Lihat Timeline lengkap
              </Link>
            </p>
          </>
        )}
      </section>
    </div>
  );
}
