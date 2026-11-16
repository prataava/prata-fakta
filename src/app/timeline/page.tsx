import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import {
  getSemuaEvent,
  getTimelineEvent,
  type PfEvent,
} from "@/lib/lanjutan";
import { getCeritaDiikuti, getEventIdDalamCerita } from "@/lib/cerita";
import { createClient } from "@/lib/supabase/server";
import { formatTanggalJam } from "@/lib/format";

export const metadata: Metadata = {
  title: "Timeline Peristiwa",
  description:
    "Kronologi gabungan peristiwa PRATA FAKTA: setiap peristiwa beserta perkembangan waktunya, sumber, dan dampaknya.",
};

// Halaman timeline membaca data per request (pola cacheComponents
// untuk rute yang membaca data dinamis).
export const instant = false;

// "Sejarah" = peristiwa yang dimulai lebih dari setahun lalu.
// Arsip berdasarkan tahun/era tetap di /sejarah (section arsip).
const BATAS_SEJARAH_HARI = 365;

/** Saring peristiwa sejarah (dimulai lebih dari setahun lalu).
 *  Pemakaian Date dipusatkan di helper ini (bukan di badan render)
 *  mengikuti pola lib (tanggalWibHariIni dsb.) agar lint
 *  react-hooks/purity tidak menandai render sebagai tak murni. */
function hanyaSejarah(events: PfEvent[]): PfEvent[] {
  const batas = Date.now() - BATAS_SEJARAH_HARI * 24 * 60 * 60 * 1000;
  return events.filter((e) => {
    if (!e.dimulai_pada) return false;
    const t = new Date(e.dimulai_pada).getTime();
    return !Number.isNaN(t) && t < batas;
  });
}

async function KartuEvent({ event }: { event: PfEvent }) {
  const kronologi = await getTimelineEvent(event.id);
  return (
    <article className="kartu" id={`event-${event.id}`}>
      <span className="kartu-kategori">
        {formatTanggalJam(event.dimulai_pada, "Waktu belum tersedia")}
        {event.lokasi_teks ? ` · ${event.lokasi_teks}` : ""}
      </span>
      <span className="kartu-judul">{event.judul}</span>
      {event.ringkasan && <span className="kartu-teks">{event.ringkasan}</span>}
      {event.dampak && (
        <span className="kartu-teks">
          <strong>Dampak:</strong> {event.dampak}
        </span>
      )}
      {event.sumber_url && (
        <span className="kartu-meta">
          Sumber:{" "}
          <a href={event.sumber_url} target="_blank" rel="noopener noreferrer">
            {event.sumber_url}
          </a>
        </span>
      )}
      {kronologi.length > 0 && (
        <ol style={{ margin: "12px 0 0", paddingLeft: 20 }}>
          {kronologi.map((t) => (
            <li key={t.id} style={{ marginBottom: 8 }}>
              <strong>{formatTanggalJam(t.waktu, "Waktu belum tersedia")}</strong> — {t.peristiwa}
              {t.perubahan && (
                <>
                  <br />
                  <span style={{ color: "var(--muted)" }}>
                    Perubahan: {t.perubahan}
                  </span>
                </>
              )}
              {t.sumber && (
                <>
                  <br />
                  <span style={{ color: "var(--muted)" }}>
                    Sumber: {t.sumber}
                  </span>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

/** Bangun href /timeline dengan parameter filter yang dipertahankan. */
function hrefTimeline(param: Record<string, string | undefined>): string {
  const cari = new URLSearchParams();
  for (const [k, v] of Object.entries(param)) {
    if (v !== undefined && v !== "") cari.set(k, v);
  }
  const q = cari.toString();
  return q ? `/timeline?${q}` : "/timeline";
}

export default async function Timeline({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : {};
  // Filter cerita (Story Tracker, Fase 8 Gel. 2): ?cerita=<slug>
  // hanya menampilkan event dalam cerita terbit itu.
  const ceritaSlug =
    typeof sp.cerita === "string" && sp.cerita.trim() !== ""
      ? sp.cerita.trim()
      : undefined;
  // F-S4: ?diikuti=ya — hanya event dari cerita yang diikuti
  // pengguna yang sedang masuk.
  const diikutiParam = sp.diikuti === "ya";
  // F-S4: ?periode=sejarah — hanya peristiwa lebih dari setahun lalu.
  const periodeSejarah = sp.periode === "sejarah";
  const { events: semuaEvent } = await getSemuaEvent();
  let events = semuaEvent;
  let ceritaTidakDitemukan = false;
  let perluMasuk = false;
  let belumMengikuti = false;

  if (ceritaSlug) {
    const ids = await getEventIdDalamCerita(ceritaSlug);
    if (ids === null) {
      ceritaTidakDitemukan = true;
      events = [];
    } else {
      const himpunan = new Set(ids);
      events = semuaEvent.filter((e) => himpunan.has(e.id));
    }
  } else if (diikutiParam) {
    let penggunaId: string | null = null;
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      penggunaId = data.user?.id ?? null;
    } catch {
      penggunaId = null;
    }
    if (!penggunaId) {
      perluMasuk = true;
      events = [];
    } else {
      const diikuti = await getCeritaDiikuti(penggunaId);
      if (diikuti.length === 0) {
        belumMengikuti = true;
        events = [];
      } else {
        const daftarId = await Promise.all(
          diikuti.map((c) => getEventIdDalamCerita(c.slug)),
        );
        const himpunan = new Set(
          daftarId.flatMap((ids) => ids ?? []),
        );
        events = semuaEvent.filter((e) => himpunan.has(e.id));
      }
    }
  }

  if (periodeSejarah) {
    // Baca waktu HANYA sesudah connection() — aturan cacheComponents.
    await connection();
    events = hanyaSejarah(events);
  }

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-timeline">
        <span className="hero-label">Timeline</span>
        <h1 id="judul-timeline">Kronologi Peristiwa</h1>
        <p>
          Peristiwa terbaru beserta perkembangan waktunya — setiap entri
          disertai waktu, sumber, dan catatan perubahan bila ada.
          Arsip berdasarkan tahun dan era ada di{" "}
          <Link href="/sejarah">Arsip Sejarah</Link>.
        </p>
        {ceritaSlug && (
          <p>
            <Link className="tombol" href={`/cerita/${ceritaSlug}`}>
              ← Kembali ke cerita
            </Link>{" "}
            <Link className="tombol tombol-hantu" href="/timeline">
              Semua peristiwa
            </Link>
          </p>
        )}
      </section>

      {/* F-S4: /timeline satu-satunya permukaan kronologi — filter
          cerita / periode / diikuti di sini, bukan halaman baru. */}
      <div className="chip-baris" role="group" aria-label="Filter kronologi">
        <Link
          className={`chip${!periodeSejarah && !diikutiParam && !ceritaSlug ? " aktif" : ""}`}
          href={hrefTimeline({})}
        >
          Semua peristiwa
        </Link>
        <Link
          className={`chip${periodeSejarah ? " aktif" : ""}`}
          href={hrefTimeline({
            cerita: ceritaSlug,
            periode: "sejarah",
            diikuti: diikutiParam ? "ya" : undefined,
          })}
        >
          Sejarah (lebih dari setahun lalu)
        </Link>
        <Link
          className={`chip${diikutiParam ? " aktif" : ""}`}
          href={hrefTimeline({
            cerita: undefined,
            periode: periodeSejarah ? "sejarah" : undefined,
            diikuti: "ya",
          })}
        >
          Yang saya ikuti
        </Link>
      </div>

      {ceritaTidakDitemukan ? (
        <section className="seksi">
          <EmptyState
            judul="Cerita tidak ditemukan."
            pesan="Cerita yang diminta tidak ada atau belum diterbitkan, sehingga tidak ada peristiwa yang bisa ditampilkan untuk filter ini."
            aksi={
              <Link className="tombol" href="/timeline">
                Lihat semua peristiwa
              </Link>
            }
          />
        </section>
      ) : perluMasuk ? (
        <section className="seksi">
          <EmptyState
            judul="Masuk untuk melihat kronologi cerita yang Anda ikuti."
            pesan="Filter “Yang saya ikuti” hanya menampilkan peristiwa dari cerita yang Anda ikuti — masuk dulu untuk menggunakannya."
            aksi={
              <Link className="tombol" href="/masuk">
                Masuk
              </Link>
            }
          />
        </section>
      ) : belumMengikuti ? (
        <section className="seksi">
          <EmptyState
            judul="Anda belum mengikuti cerita apa pun."
            pesan="Ikuti cerita dari halaman Cerita agar kronologinya muncul di sini."
            aksi={
              <Link className="tombol" href="/cerita">
                Lihat cerita
              </Link>
            }
          />
        </section>
      ) : events.length === 0 ? (
        <section className="seksi">
          <EmptyState
            judul={
              ceritaSlug
                ? "Belum ada peristiwa dalam cerita ini."
                : periodeSejarah
                  ? "Belum ada peristiwa sejarah untuk filter ini."
                  : diikutiParam
                    ? "Belum ada peristiwa dalam cerita yang Anda ikuti."
                    : "Belum ada peristiwa yang tercatat."
            }
            pesan={
              ceritaSlug
                ? "Redaksi belum menautkan peristiwa ke cerita ini."
                : periodeSejarah
                  ? "Belum ada peristiwa yang dimulai lebih dari setahun lalu."
                  : diikutiParam
                    ? "Cerita yang Anda ikuti belum memiliki peristiwa yang ditautkan."
                    : "Timeline akan terisi begitu redaksi mencatat peristiwa beserta kronologinya."
            }
            aksi={
              ceritaSlug ? (
                <Link className="tombol" href={`/cerita/${ceritaSlug}`}>
                  Kembali ke cerita
                </Link>
              ) : (
                <Link className="tombol" href="/timeline">
                  Lihat semua peristiwa
                </Link>
              )
            }
          />
        </section>
      ) : (
        <section className="seksi" aria-label="Daftar peristiwa">
          <div className="grid-berita">
            {events.map((e) => (
              <KartuEvent key={e.id} event={e} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
