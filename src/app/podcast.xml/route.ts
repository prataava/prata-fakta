// GET /podcast.xml — umpan RSS 2.0 + iTunes PRATA Podcast.
// Isi: 50 episode terbit terbaru (judul, tautan, deskripsi,
// tanggal, enclosure MP3 bila episode punya audio_url).
// Episode TANPA audio_url tidak punya <enclosure> — pemutar
// memakai TTS browser sebagai fallback; feed tetap VALID.
// Atribusi suara TTS tercantum per item bila episode dibuat
// Piper (kolom tts_suara, migrasi v14). Bila database belum
// tersedia, feed tetap VALID tetapi tanpa item — jujur, tanpa
// episode karangan. Pola mengikuti src/app/rss.xml/route.ts.
import { getDaftarEpisode } from "@/lib/podcast";
import {
  bangunFeedPodcastXml,
  type EpisodeFeed,
} from "@/lib/podcast/rss";
import { urlSitus } from "@/lib/situs";

export async function GET() {
  const dasar = urlSitus();
  let episode: EpisodeFeed[] = [];
  try {
    episode = (await getDaftarEpisode()).map((ep) => ({
      slug: ep.slug,
      judul: ep.judul,
      deskripsi: ep.deskripsi,
      jenis: ep.jenis,
      audio_url: ep.audio_url,
      durasi_detik: ep.durasi_detik,
      audio_bytes: ep.audio_bytes,
      tts_suara: ep.tts_suara,
      tanggal: ep.tanggal,
      dibuat_pada: ep.dibuat_pada,
    }));
  } catch {
    episode = [];
  }

  return new Response(bangunFeedPodcastXml(episode, dasar), {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=900",
    },
  });
}
