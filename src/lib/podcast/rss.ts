// Pembangun feed RSS podcast PRATA FAKTA (Gelombang B2-C, L-C2).
// Modul MURNI (tanpa impor, tanpa akses database) supaya bisa
// diuji langsung dari Node oleh scripts/uji-ultimate-b2-podcast.mjs.
//
// Aturan enclosure (RSS 2.0 + iTunes):
//  - <enclosure> HANYA bila episode punya audio_url absolut http(s).
//    Episode tanpa audio_url TIDAK punya enclosure — pemutar memakai
//    TTS browser sebagai fallback (lihat PemutarPodcast.tsx).
//  - length = audio_bytes bila diketahui, sonst 0 (kolom audio_bytes
//    dari migrasi v14; workflow podcast-tts SELALU mengisinya).
//  - type SELALU audio/mpeg — workflow menghasilkan MP3; unggahan
//    manual wajib MP3 (lihat header workflow podcast-tts.yml).
//  - pubDate dari dibuat_pada bila ada, sonst tanggal (tengah malam UTC).
//  - Atribusi suara: bila episode.tts_suara terisi, item memuat
//    <copyright> "Audio dibuat dengan Piper, suara <kunci>.".
//    Suara yang dipakai HARUS yang lisensinya sudah diverifikasi
//    editor — lihat SUARA_TTS_TERPILIH di src/lib/podcast.ts.
//    Sampai ada suara id_ID berlisensi jelas, TIDAK ADA episode
//    yang boleh membawa tts_suara (lihat evaluasi di berkas itu).
export type EpisodeFeed = {
  slug: string;
  judul: string;
  deskripsi: string | null;
  jenis: string;
  audio_url: string | null;
  durasi_detik: number | null;
  audio_bytes: number | null;
  tts_suara: string | null;
  tanggal: string;
  dibuat_pada: string | null;
};

export function escXml(teks: string | null | undefined): string {
  return (teks ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** true bila URL absolut http(s) — syarat enclosure yang valid. */
export function urlAudioAbsolut(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Satu elemen <enclosure>, atau null bila episode belum punya
 *  file audio (fallback TTS browser; bukan enclosure kosong). */
export function bangunEnclosure(ep: EpisodeFeed): string | null {
  if (!urlAudioAbsolut(ep.audio_url)) return null;
  const panjang =
    typeof ep.audio_bytes === "number" &&
    Number.isFinite(ep.audio_bytes) &&
    ep.audio_bytes > 0
      ? Math.floor(ep.audio_bytes)
      : 0;
  return `<enclosure url="${escXml(ep.audio_url)}" length="${panjang}" type="audio/mpeg" />`;
}

/** Durasi iTunes "H:MM:SS" / "M:SS"; null bila tidak diketahui. */
export function formatDurasiItunes(detik: number | null): string | null {
  if (detik === null || !Number.isFinite(detik) || detik < 0) return null;
  const total = Math.floor(detik);
  const jam = Math.floor(total / 3600);
  const menit = Math.floor((total % 3600) / 60);
  const sisa = total % 60;
  const mm = String(menit).padStart(2, "0");
  const ss = String(sisa).padStart(2, "0");
  return jam > 0 ? `${jam}:${mm}:${ss}` : `${menit}:${ss}`;
}

function tanggalPub(ep: EpisodeFeed, sekarang: string): string {
  const sumber = ep.dibuat_pada || (ep.tanggal ? `${ep.tanggal}T00:00:00Z` : "");
  if (!sumber) return sekarang;
  const d = new Date(sumber);
  return Number.isNaN(d.getTime()) ? sekarang : d.toUTCString();
}

/** Feed RSS 2.0 + iTunes lengkap untuk daftar episode terbit.
 *  Daftar kosong → feed VALID tanpa item (jujur, tanpa karangan). */
export function bangunFeedPodcastXml(
  episode: EpisodeFeed[],
  dasar: string,
): string {
  const sekarang = new Date().toUTCString();
  const item = episode
    .map((ep) => {
      const tautan = `${dasar}/podcast/${ep.slug}`;
      const enclosure = bangunEnclosure(ep);
      const durasi = formatDurasiItunes(ep.durasi_detik);
      const baris: string[] = [
        "    <item>",
        `      <title>${escXml(ep.judul)}</title>`,
        `      <link>${escXml(tautan)}</link>`,
        `      <guid isPermaLink="true">${escXml(tautan)}</guid>`,
        `      <description>${escXml(ep.deskripsi)}</description>`,
        `      <category>${escXml(ep.jenis)}</category>`,
        `      <pubDate>${tanggalPub(ep, sekarang)}</pubDate>`,
      ];
      if (enclosure) baris.push(`      ${enclosure}`);
      if (durasi) baris.push(`      <itunes:duration>${durasi}</itunes:duration>`);
      if (ep.tts_suara) {
        baris.push(
          `      <copyright>Audio dibuat dengan Piper, suara ${escXml(ep.tts_suara)}.</copyright>`,
        );
      }
      baris.push("    </item>");
      return baris.join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">',
    "  <channel>",
    "    <title>PRATA FAKTA Podcast</title>",
    `    <link>${escXml(dasar)}/podcast</link>`,
    "    <description>Daily Brief, artikel pilihan, dan episode mingguan PRATA FAKTA. Episode yang sudah punya file audio MP3 dapat diunduh lewat enclosure; episode tanpa file audio dibacakan suara browser dari naskahnya. File audio server hanya dibuat dari naskah yang disetujui editor dan hanya dengan suara yang lisensinya sudah diverifikasi — lihat halaman podcast.</description>",
    "    <language>id-ID</language>",
    "    <itunes:author>PRATA FAKTA</itunes:author>",
    "    <itunes:explicit>false</itunes:explicit>",
    "    <copyright>PRATA FAKTA — isi episode milik PRATA FAKTA; atribusi suara TTS tercantum per episode bila ada.</copyright>",
    `    <lastBuildDate>${sekarang}</lastBuildDate>`,
    item,
    "  </channel>",
    "</rss>",
  ].join("\n");
}
