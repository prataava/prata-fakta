// Kronologi cerita (Story Tracker, Fase 8 Gel. 2): daftar event
// dalam satu cerita beserta entri pf_event_timeline masing-masing.
// Server Component — hanya menampilkan data yang sudah ada.
import Link from "next/link";
import type { PfCeritaEvent } from "@/lib/cerita";

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

export default function KronologiCerita({
  events,
}: {
  events: PfCeritaEvent[];
}) {
  return (
    <ol style={{ margin: 0, paddingLeft: 20 }}>
      {events.map((e) => (
        <li key={e.tautan_id} style={{ marginBottom: 20 }}>
          <strong>{formatTanggalJam(e.dimulai_pada)}</strong>
          {e.era ? ` · Era ${e.era}` : ""}
          {e.penting ? " · Penting" : ""}
          <br />
          <strong>{e.judul}</strong>
          {e.ringkasan && (
            <>
              <br />
              {e.ringkasan}
            </>
          )}
          {e.catatan && (
            <>
              <br />
              <span style={{ color: "var(--muted)" }}>
                Catatan redaksi: {e.catatan}
              </span>
            </>
          )}
          {e.lokasi_teks && (
            <>
              <br />
              <span style={{ color: "var(--muted)" }}>
                Lokasi: {e.lokasi_teks}
              </span>
            </>
          )}
          {e.dampak && (
            <>
              <br />
              <span>
                <strong>Dampak:</strong> {e.dampak}
              </span>
            </>
          )}
          {e.sumber_url && (
            <>
              <br />
              <span style={{ color: "var(--muted)" }}>
                Sumber:{" "}
                <a
                  href={e.sumber_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {e.sumber_url}
                </a>
              </span>
            </>
          )}
          {e.timeline.length > 0 && (
            <ol style={{ margin: "8px 0 0", paddingLeft: 20 }}>
              {e.timeline.map((t) => (
                <li key={t.id} style={{ marginBottom: 6 }}>
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
          <br />
          <Link href={`/timeline#event-${e.event_id}`}>
            Lihat di Timeline
          </Link>
        </li>
      ))}
    </ol>
  );
}
