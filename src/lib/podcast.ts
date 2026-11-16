// Lapisan akses data PRATA Podcast (Fase 8 Gelombang 2, Area 9).
// Prinsip (diperbarui Gelombang B1, P2-14): galat SELALU dicatat
// dengan konteks fungsi (lib/galat.ts); "tabel belum ada" →
// empty state jujur; galat lain → dilempar (bukan ditelan
// menjadi [] diam-diam). Bahasa Indonesia, tanpa data palsu.
// Episode 'terbit' saja yang dibaca publik (RLS); draf tidak
// pernah bocor. Riwayat + playlist hanya milik pengguna sendiri
// (RLS auth.uid() = user_id).
import { createClient } from "@/lib/supabase/server";
import { GalatBaca, catatGalatBaca } from "@/lib/galat";

export type JenisEpisode = "brief" | "artikel" | "mingguan";

export type PfPodcastEpisode = {
  id: string;
  slug: string;
  judul: string;
  deskripsi: string | null;
  jenis: JenisEpisode;
  teks_naskah: string;
  audio_url: string | null;
  durasi_detik: number | null;
  tanggal: string;
  status: string;
  artikel_id: string | null;
  brief_tanggal: string | null;
  dibuat_pada: string | null;
};

export type PfPodcastRiwayat = {
  episode_id: string;
  posisi_detik: number;
  selesai: boolean;
  diperbarui_pada: string | null;
};

export type PfPodcastPlaylistItem = {
  id: string;
  episode_id: string;
  urutan: number;
  episode: PfPodcastEpisode | null;
  dibuat_pada: string | null;
};

export const LABEL_JENIS_EPISODE: Record<JenisEpisode, string> = {
  brief: "Daily Brief",
  artikel: "Audio Article",
  mingguan: "Episode Mingguan",
};

export const JENIS_EPISODE: JenisEpisode[] = ["brief", "artikel", "mingguan"];

const KOLOM_EPISODE =
  "id, slug, judul, deskripsi, jenis, teks_naskah, audio_url, durasi_detik, tanggal, status, artikel_id, brief_tanggal, dibuat_pada";

function barisEpisode(r: Record<string, unknown>): PfPodcastEpisode {
  return {
    id: String(r.id),
    slug: String(r.slug ?? ""),
    judul: String(r.judul ?? ""),
    deskripsi: (r.deskripsi as string | null) ?? null,
    jenis: (r.jenis as JenisEpisode) ?? "artikel",
    teks_naskah: String(r.teks_naskah ?? ""),
    audio_url: (r.audio_url as string | null) ?? null,
    durasi_detik:
      typeof r.durasi_detik === "number" ? r.durasi_detik : null,
    tanggal: String(r.tanggal ?? ""),
    status: String(r.status ?? ""),
    artikel_id: (r.artikel_id as string | null) ?? null,
    brief_tanggal: (r.brief_tanggal as string | null) ?? null,
    dibuat_pada: (r.dibuat_pada as string | null) ?? null,
  };
}

/** Format durasi detik menjadi "m:ss"; "—" bila tidak diketahui. */
export function formatDurasi(detik: number | null): string {
  if (detik === null || !Number.isFinite(detik) || detik < 0) return "—";
  const menit = Math.floor(detik / 60);
  const sisa = Math.floor(detik % 60);
  return `${menit}:${String(sisa).padStart(2, "0")}`;
}

/** Label jujur sumber audio episode: rekaman bila audio_url ada,
 *  TTS browser bila tidak ada (tanpa file audio). */
export function labelAudio(episode: PfPodcastEpisode): string {
  return episode.audio_url ? "Audio rekaman" : "Audio TTS browser";
}

/** Daftar episode terbit, terbaru dulu; filter jenis opsional. */
export async function getDaftarEpisode(
  jenis?: JenisEpisode,
  limit = 50,
): Promise<PfPodcastEpisode[]> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("pf_podcast_episodes")
      .select(KOLOM_EPISODE)
      .eq("status", "terbit")
      .order("tanggal", { ascending: false })
      .limit(limit);
    if (jenis) query = query.eq("jenis", jenis);
    const { data, error } = await query;
    if (error) {
      if (catatGalatBaca("getDaftarEpisode", error)) return [];
      throw new GalatBaca("getDaftarEpisode", error);
    }
    if (!data) return [];
    return (data as unknown as Record<string, unknown>[]).map(barisEpisode);
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getDaftarEpisode", err)) return [];
    throw new GalatBaca("getDaftarEpisode", err);
  }
}

/** Satu episode terbit berdasarkan slug; null bila tidak ada / draf. */
export async function getEpisode(
  slug: string,
): Promise<PfPodcastEpisode | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_podcast_episodes")
      .select(KOLOM_EPISODE)
      .eq("slug", slug)
      .eq("status", "terbit")
      .maybeSingle();
    if (error) {
      if (catatGalatBaca("getEpisode", error)) return null;
      throw new GalatBaca("getEpisode", error);
    }
    if (!data) return null;
    return barisEpisode(data as unknown as Record<string, unknown>);
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getEpisode", err)) return null;
    throw new GalatBaca("getEpisode", err);
  }
}

/** Riwayat dengar pengguna: peta episode_id → riwayat. */
export async function getRiwayat(
  userId: string,
): Promise<Map<string, PfPodcastRiwayat>> {
  const kosong = new Map<string, PfPodcastRiwayat>();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_podcast_history")
      .select("episode_id, posisi_detik, selesai, diperbarui_pada")
      .eq("user_id", userId)
      .order("diperbarui_pada", { ascending: false })
      .limit(200);
    if (error) {
      if (catatGalatBaca("getRiwayat", error)) return kosong;
      throw new GalatBaca("getRiwayat", error);
    }
    if (!data) return kosong;
    for (const r of data as unknown as Record<string, unknown>[]) {
      kosong.set(String(r.episode_id), {
        episode_id: String(r.episode_id),
        posisi_detik:
          typeof r.posisi_detik === "number" ? r.posisi_detik : 0,
        selesai: r.selesai === true,
        diperbarui_pada:
          (r.diperbarui_pada as string | null) ?? null,
      });
    }
    return kosong;
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getRiwayat", err)) return kosong;
    throw new GalatBaca("getRiwayat", err);
  }
}

/** Playlist pengguna: episode terbit saja (episode draf / terhapus
 *  tidak ditampilkan — join inner ke episode terbit). */
export async function getPlaylist(
  userId: string,
): Promise<PfPodcastPlaylistItem[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_podcast_playlist_items")
      .select(
        `id, episode_id, urutan, dibuat_pada, pf_podcast_episodes!inner(${KOLOM_EPISODE})`,
      )
      .eq("user_id", userId)
      .eq("pf_podcast_episodes.status", "terbit")
      .order("urutan", { ascending: true })
      .order("dibuat_pada", { ascending: true });
    if (error) {
      if (catatGalatBaca("getPlaylist", error)) return [];
      throw new GalatBaca("getPlaylist", error);
    }
    if (!data) return [];
    const hasil: PfPodcastPlaylistItem[] = [];
    for (const r of data as unknown as Record<string, unknown>[]) {
      const ep = r.pf_podcast_episodes as Record<string, unknown> | null;
      if (!ep) continue;
      hasil.push({
        id: String(r.id),
        episode_id: String(r.episode_id),
        urutan: typeof r.urutan === "number" ? r.urutan : 0,
        episode: barisEpisode(ep),
        dibuat_pada: (r.dibuat_pada as string | null) ?? null,
      });
    }
    return hasil;
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getPlaylist", err)) return [];
    throw new GalatBaca("getPlaylist", err);
  }
}
