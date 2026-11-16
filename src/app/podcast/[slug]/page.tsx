import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import PemutarPodcast from "@/components/podcast/PemutarPodcast";
import TombolPlaylist from "@/components/podcast/TombolPlaylist";
import { createClient } from "@/lib/supabase/server";
import {
  formatDurasi,
  getEpisode,
  getPlaylist,
  getRiwayat,
  labelAudio,
  LABEL_JENIS_EPISODE,
} from "@/lib/podcast";

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const episode = await getEpisode(slug);
  if (!episode) return { title: "Episode tidak ditemukan" };
  return {
    title: episode.judul,
    description: episode.deskripsi ?? episode.judul,
  };
}

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

export default async function DetailPodcast({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const episode = await getEpisode(slug);
  if (!episode) notFound();

  let penggunaId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    penggunaId = data.user?.id ?? null;
  } catch {
    penggunaId = null;
  }
  const [riwayat, playlist] = await Promise.all([
    penggunaId ? getRiwayat(penggunaId) : Promise.resolve(new Map()),
    penggunaId ? getPlaylist(penggunaId) : Promise.resolve([]),
  ]);
  const riwayatEpisode = riwayat.get(episode.id);
  const sudahDiPlaylist = playlist.some((p) => p.episode_id === episode.id);

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-episode">
        <span className="hero-label">
          {LABEL_JENIS_EPISODE[episode.jenis]} · {labelAudio(episode)}
        </span>
        <h1 id="judul-episode">{episode.judul}</h1>
        {episode.deskripsi && <p>{episode.deskripsi}</p>}
        <p>
          {formatTanggal(episode.tanggal)} ·{" "}
          {formatDurasi(episode.durasi_detik)}
          {riwayatEpisode?.selesai
            ? " · Sudah selesai didengar"
            : riwayatEpisode && riwayatEpisode.posisi_detik > 0
              ? ` · Terakhir di ${Math.floor(riwayatEpisode.posisi_detik)} detik`
              : ""}
        </p>
        <p>
          <Link className="tombol" href="/podcast">
            Semua episode
          </Link>{" "}
          <TombolPlaylist
            episodeId={episode.id}
            sudahLogin={penggunaId !== null}
            sudahAdaAwal={sudahDiPlaylist}
          />
        </p>
      </section>

      <section className="seksi" aria-labelledby="seksi-pemutar">
        <div className="seksi-kepala">
          <h2 id="seksi-pemutar">Dengarkan</h2>
          <p>
            {episode.audio_url
              ? "Episode ini punya file audio rekaman."
              : "Episode ini belum punya file audio rekaman — dibacakan suara browser Anda dari naskah di bawah. Pembuatan file audio server belum bisa dilakukan (tanpa layanan TTS server gratis)."}
          </p>
        </div>
        <PemutarPodcast
          episodeId={episode.id}
          judul={episode.judul}
          teksNaskah={episode.teks_naskah}
          audioUrl={episode.audio_url}
          durasiDetik={episode.durasi_detik}
          posisiAwal={riwayatEpisode?.posisi_detik ?? 0}
          sudahLogin={penggunaId !== null}
        />
      </section>

      <section className="seksi" aria-labelledby="seksi-naskah">
        <div className="seksi-kepala">
          <h2 id="seksi-naskah">Naskah episode</h2>
        </div>
        {episode.teks_naskah.trim() ? (
          episode.teks_naskah
            .split(/\n+/)
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p, i) => (
              <p key={i}>{p}</p>
            ))
        ) : (
          <EmptyState
            judul="Naskah kosong."
            pesan="Episode ini belum punya teks naskah."
          />
        )}
      </section>
    </div>
  );
}
