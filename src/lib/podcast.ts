// Lapisan akses data PRATA Podcast (Fase 8 Gelombang 2, Area 9).
// Prinsip (diperbarui Gelombang B1, P2-14): galat SELALU dicatat
// dengan konteks fungsi (lib/galat.ts); "tabel belum ada" →
// empty state jujur; galat lain → dilempar (bukan ditelan
// menjadi [] diam-diam). Bahasa Indonesia, tanpa data palsu.
// Episode 'terbit' saja yang dibaca publik (RLS); draf tidak
// pernah bocor. Riwayat + playlist hanya milik pengguna sendiri
// (RLS auth.uid() = user_id).
//
// AUDIO SERVER — GELOMBANG B2-C (L-C2), 16 Nov 2026:
// Kolom audio_bytes + tts_suara berasal dari MIGRASI v14 (BELUM
// diterapkan — DDL ada di laporan Gelombang B2-C; TERAPKAN v14
// SEBELUM deploy kode ini, sonst select episode gagal PGRST204).
// audio_url + durasi_detik sudah ada sejak v10.
//
// VERIFIKASI LISENSI SUARA — PUTUSAN: BELUM BISA (16 Nov 2026).
// Katalog resmi Piper (rhasspy/piper-voices, voices.json) hanya
// punya SATU suara id_ID: "id_ID-news_tts-medium" (medium,
// 1 penutur, 22.050 Hz, .onnx 62.950.044 byte,
// md5 17de01db7ac654655436b6e509893c72). MODEL_CARD-nya TIDAK
// menyatakan lisensi yang jelas: "License: See URL" menunjuk
// notebook Kaggle "Indic TTS Malayalam Speech Corpus" (bahasa
// Malayalam, BUKAN Indonesia; Apache 2.0 di halaman itu hanya
// melingkupi kode notebook, bukan data latih), dan suara ini
// "Finetuned from U.S. English lessac voice" yang data latihnya
// (Blizzard Challenge 2013, CSTR Edinburgh) berlisensi riset
// yang mengecualikan pemakaian komersial termasuk produk
// sintesis suara. Korpus yang dirujuk adalah database IndicTTS
// IIT Madras dengan perjanjian lisensi "COPYRIGHT 2016 TTS
// Consortium ... ALL RIGHTS RESERVED" (redistribusi belum
// terkonfirmasi). Halaman suara Piper sendiri menyatakan suara
// "meant only for personal use and speech research" dengan
// peringatan sebagian suara punya syarat restriktif. Engine
// Piper: rhasspy/piper MIT (diarsip 6 Okt 2025); aktif
// OHF-Voice/piper1-gpl GPL-3.0-or-later, v1.8.0, PyPI piper-tts.
// KESIMPULAN: tidak ada suara id_ID yang lisensinya JELAS
// membolehkan pemakaian ini → SUARA_TTS_TERPILIH = null dan
// workflow podcast-tts.yml MENOLAK jalan tanpa suara + konfirmasi
// lisensi eksplisit dari editor. Jangan isi konstanta ini dengan
// id_ID-news_tts-medium sebelum lisensinya diklarifikasi
// tertulis. Bila suatu hari ada suara id_ID berlisensi jelas
// (mis. CC-BY / CC0), isi konstanta ini + catat lisensi +
// sumbernya di sini dan di halaman podcast.
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
  /** Ukuran file audio (byte) untuk <enclosure length> — v14. */
  audio_bytes: number | null;
  /** Kunci suara Piper pembuat audio (mis. id_ID-...-medium) — v14. */
  tts_suara: string | null;
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
  "id, slug, judul, deskripsi, jenis, teks_naskah, audio_url, durasi_detik, audio_bytes, tts_suara, tanggal, status, artikel_id, brief_tanggal, dibuat_pada";

/** Nama bucket Supabase Storage untuk file MP3 episode.
 *  Bucket TIDAK bisa dibuat via migrasi SQL — dibuat manual
 *  sekali di Dashboard Supabase (Storage → New bucket, publik),
 *  lihat laporan Gelombang B2-C. */
export const NAMA_BUCKET_AUDIO_PODCAST = "podcast-audio";

/** Suara Piper id_ID yang dipilih untuk TTS server.
 *  null = BELUM ADA suara berlisensi jelas (putusan B2-C,
 *  lihat komentar kepala berkas). Workflow podcast-tts.yml
 *  menolak jalan bila nilai ini null dan editor tidak memasok
 *  suara + konfirmasi lisensi secara eksplisit saat dispatch. */
export const SUARA_TTS_TERPILIH: string | null = null;

/** Suara id_ID yang dievaluasi B2-C beserta hasil evaluasinya —
 *  ditampilkan jujur di halaman podcast supaya statusnya jelas
 *  (bukan disembunyikan). */
export const EVALUASI_SUARA_ID_ID = {
  kunci: "id_ID-news_tts-medium",
  sumberSuara: "rhasspy/piper-voices (voices.json)",
  modelCard:
    "https://huggingface.co/rhasspy/piper-voices/resolve/main/id/id_ID/news_tts/medium/MODEL_CARD",
  lisensiTercatat: "See URL (tidak menyatakan lisensi eksplisit)",
  putusan:
    "BELUM BISA dipakai — lisensi data latih tidak jelas (rujukan Kaggle Malayalam + fine-tune dari lessac berlisensi riset).",
} as const;

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
    audio_bytes:
      typeof r.audio_bytes === "number" ? r.audio_bytes : null,
    tts_suara: (r.tts_suara as string | null) ?? null,
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

/** Label sumber audio yang lebih rinci: menyebut suara Piper
 *  bila audio dibuat workflow TTS (tts_suara terisi), sonst
 *  sama dengan labelAudio. */
export function labelSumberAudio(episode: PfPodcastEpisode): string {
  if (episode.tts_suara && episode.audio_url) {
    return `Audio Piper (${episode.tts_suara})`;
  }
  return labelAudio(episode);
}

/** Atribusi lisensi suara untuk episode yang audionya dibuat
 *  Piper; null bila audio bukan hasil TTS server. Teks ini
 *  tampil di halaman episode + RSS podcast.xml. */
export function atribusiSuaraTts(episode: PfPodcastEpisode): string | null {
  if (!episode.tts_suara || !episode.audio_url) return null;
  return `Audio episode ini dibuat dengan Piper (suara ${episode.tts_suara}).`;
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
