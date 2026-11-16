// Kartu episode podcast (server-friendly, tanpa state).
// Menampilkan jenis, label audio jujur (rekaman vs TTS browser),
// durasi, tanggal, dan riwayat dengar bila ada.
import {
  formatDurasi,
  labelAudio,
  LABEL_JENIS_EPISODE,
  type PfPodcastEpisode,
} from "@/lib/podcast";
import { formatTanggalHari } from "@/lib/format";
import Kartu from "@/components/Kartu";

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
    <Kartu
      judulHref={`/podcast/${episode.slug}`}
      kategori={`${LABEL_JENIS_EPISODE[episode.jenis]} · ${labelAudio(episode)}`}
      judul={episode.judul}
      teks={episode.deskripsi ?? undefined}
      meta={
        `${formatTanggalHari(episode.tanggal)} · ${formatDurasi(episode.durasi_detik)}` +
        (selesai
          ? " · Sudah selesai didengar"
          : posisiDetik !== undefined && posisiDetik > 0
            ? ` · Terakhir di ${Math.floor(posisiDetik)} detik`
            : "")
      }
    />
  );
}
