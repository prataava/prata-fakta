// Kartu episode podcast (server-friendly, tanpa state).
// Menampilkan jenis, label audio jujur (rekaman vs TTS browser),
// durasi, tanggal, dan riwayat dengar bila ada.
import Link from "next/link";
import {
  formatDurasi,
  labelAudio,
  LABEL_JENIS_EPISODE,
  type PfPodcastEpisode,
} from "@/lib/podcast";

function formatTanggal(tanggal: string): string {
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

export default function KartuEpisode({
  episode,
  posisiDetik,
  selesai,
}: {
  episode: PfPodcastEpisode;
  posisiDetik?: number;
  selesai?: boolean;
}) {
  return (
    <article className="kartu">
      <span className="kartu-kategori">
        {LABEL_JENIS_EPISODE[episode.jenis]} · {labelAudio(episode)}
      </span>
      <Link className="kartu-judul" href={`/podcast/${episode.slug}`}>
        {episode.judul}
      </Link>
      {episode.deskripsi && (
        <span className="kartu-teks">{episode.deskripsi}</span>
      )}
      <span className="kartu-meta">
        {formatTanggal(episode.tanggal)} · {formatDurasi(episode.durasi_detik)}
        {selesai
          ? " · Sudah selesai didengar"
          : posisiDetik !== undefined && posisiDetik > 0
            ? ` · Terakhir di ${Math.floor(posisiDetik)} detik`
            : ""}
      </span>
    </article>
  );
}
