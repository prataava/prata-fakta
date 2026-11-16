import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import KartuEpisode from "@/components/podcast/KartuEpisode";
import { createClient } from "@/lib/supabase/server";
import {
  getDaftarEpisode,
  getPlaylist,
  getRiwayat,
  JENIS_EPISODE,
  LABEL_JENIS_EPISODE,
  type JenisEpisode,
} from "@/lib/podcast";

export const metadata: Metadata = {
  title: "PRATA Podcast",
  description:
    "Dengarkan Daily Brief, artikel pilihan, dan episode mingguan PRATA FAKTA — rekaman bila tersedia, atau dibacakan suara browser dari naskahnya.",
};

export const instant = false;

const DESKRIPSI_JENIS: Record<JenisEpisode, string> = {
  brief: "Ringkasan harian berita terpenting, dibacakan dari Daily Brief.",
  artikel: "Artikel pilihan PRATA FAKTA dalam bentuk audio.",
  mingguan: "Kompilasi mingguan berita dan pengetahuan.",
};

export default async function Podcast() {
  let penggunaId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    penggunaId = data.user?.id ?? null;
  } catch {
    penggunaId = null;
  }
  const [semua, riwayat, playlist] = await Promise.all([
    getDaftarEpisode(),
    penggunaId ? getRiwayat(penggunaId) : Promise.resolve(new Map()),
    penggunaId ? getPlaylist(penggunaId) : Promise.resolve([]),
  ]);

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-podcast">
        <span className="hero-label">Podcast</span>
        <h1 id="judul-podcast">PRATA Podcast</h1>
        <p>
          Dengarkan Daily Brief, artikel pilihan, dan episode mingguan.
          Episode berlabel &ldquo;Audio rekaman&rdquo; diputar dari file
          audio; episode berlabel &ldquo;Audio TTS browser&rdquo; dibacakan
          suara perangkat Anda dari naskahnya — karena pembuatan file
          audio server belum bisa dilakukan (tanpa layanan TTS server
          gratis), belum ada unduhan MP3 dan belum ada feed RSS
          podcast.
        </p>
      </section>

      {penggunaId && playlist.length > 0 && (
        <section className="seksi" aria-labelledby="seksi-playlist">
          <div className="seksi-kepala">
            <h2 id="seksi-playlist">Playlist saya</h2>
            <p>Episode yang Anda simpan.</p>
          </div>
          <div className="grid-berita">
            {playlist.map((item) =>
              item.episode ? (
                <KartuEpisode
                  key={item.id}
                  episode={item.episode}
                  posisiDetik={riwayat.get(item.episode_id)?.posisi_detik}
                  selesai={riwayat.get(item.episode_id)?.selesai}
                />
              ) : null,
            )}
          </div>
        </section>
      )}

      {semua.length === 0 ? (
        <section className="seksi">
          <EmptyState
            judul="Belum ada episode terbit."
            pesan="Episode podcast pertama belum diterbitkan redaksi. Episode dibuat dari Daily Brief dan artikel PRATA FAKTA sendiri."
            aksi={
              <Link className="tombol tombol-primer" href="/brief">
                Baca Daily Brief
              </Link>
            }
          />
        </section>
      ) : (
        JENIS_EPISODE.map((jenis) => {
          const daftar = semua.filter((e) => e.jenis === jenis);
          if (daftar.length === 0) return null;
          return (
            <section
              className="seksi"
              aria-labelledby={`seksi-podcast-${jenis}`}
              key={jenis}
            >
              <div className="seksi-kepala">
                <h2 id={`seksi-podcast-${jenis}`}>
                  {LABEL_JENIS_EPISODE[jenis]}
                </h2>
                <p>{DESKRIPSI_JENIS[jenis]}</p>
              </div>
              <div className="grid-berita">
                {daftar.map((e) => (
                  <KartuEpisode
                    key={e.id}
                    episode={e}
                    posisiDetik={riwayat.get(e.id)?.posisi_detik}
                    selesai={riwayat.get(e.id)?.selesai}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
