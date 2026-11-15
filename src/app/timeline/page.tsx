import type { Metadata } from "next";
import EmptyState from "@/components/EmptyState";
import {
  getSemuaEvent,
  getTimelineEvent,
  type PfEvent,
} from "@/lib/lanjutan";

export const metadata: Metadata = {
  title: "Timeline Peristiwa",
  description:
    "Kronologi gabungan peristiwa PRATA FAKTA: setiap peristiwa beserta perkembangan waktunya, sumber, dan dampaknya.",
};

// Halaman timeline membaca data per request (pola cacheComponents
// untuk rute yang membaca data dinamis).
export const instant = false;

function formatTanggalJam(waktu: string | null): string {
  if (!waktu) return "Waktu belum tersedia";
  const d = new Date(waktu);
  if (Number.isNaN(d.getTime())) return waktu;
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

async function KartuEvent({ event }: { event: PfEvent }) {
  const kronologi = await getTimelineEvent(event.id);
  return (
    <article className="kartu" id={`event-${event.id}`}>
      <span className="kartu-kategori">
        {formatTanggalJam(event.dimulai_pada)}
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
              <strong>{formatTanggalJam(t.waktu)}</strong> — {t.peristiwa}
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

export default async function Timeline() {
  const { events } = await getSemuaEvent();

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-timeline">
        <span className="hero-label">Timeline</span>
        <h1 id="judul-timeline">Kronologi Peristiwa</h1>
        <p>
          Peristiwa terbaru beserta perkembangan waktunya — setiap entri
          disertai waktu, sumber, dan catatan perubahan bila ada.
        </p>
      </section>

      {events.length === 0 ? (
        <section className="seksi">
          <EmptyState
            judul="Belum ada peristiwa yang tercatat."
            pesan="Timeline akan terisi begitu redaksi mencatat peristiwa beserta kronologinya."
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
