// Baterai Podcast TTS server via Piper — Gelombang B2-C (L-C2).
// Menguji: DDL v14 (audio_bytes + tts_suara) INLINE, builder feed
// RSS podcast.xml (enclosure dari data episode), fallback TTS
// browser tetap ada, gerbang lisensi workflow, dan status jujur
// di halaman podcast. Data uji SINTETIS (slug/judul buatan) —
// yang diuji adalah LOGIKA enclosure/feed + DDL, bukan isi berita.
// Piper TIDAK dijalankan di sini (tidak ada instalasi); yang
// diuji adalah jalur yang bisa diuji tanpa TTS: feed + fallback.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";

import { PGlite } from "./butuh-pglite.mjs";

import {
  bangunEnclosure,
  bangunFeedPodcastXml,
  escXml,
  formatDurasiItunes,
  urlAudioAbsolut,
} from "../src/lib/podcast/rss.ts";

const DIR_REPO = new URL("../", import.meta.url).pathname;

let lolos = 0;
let gagal = 0;
function cek(label, kondisi, detail = "") {
  if (kondisi) {
    lolos++;
    console.log(`OK: ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    gagal++;
    console.log(`GAGAL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function bacaRepo(rel) {
  return fs.readFileSync(`${DIR_REPO}${rel}`, "utf8");
}

// DDL v14 PERSIS — teks yang sama tercantum di laporan B2-C
// (migrasi v14 TIDAK dibuat di repo oleh agen ini; DDL ini
// diterapkan inline di setup baterai).
const DDL_V14 = `alter table public.pf_podcast_episodes
  add column if not exists audio_bytes bigint,
  add column if not exists tts_suara text;`;

// ---------- Setup PGlite + tabel episode (bentuk v10) ----------
const db = new PGlite();
await db.exec(`
create table public.pf_podcast_episodes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  judul text not null,
  deskripsi text,
  jenis text not null default 'artikel'
    check (jenis in ('brief', 'artikel', 'mingguan')),
  teks_naskah text not null,
  audio_url text,
  durasi_detik integer,
  tanggal date not null default current_date,
  status text not null default 'draft'
    check (status in ('draft', 'terbit')),
  artikel_id uuid,
  brief_tanggal date,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);`);

// ---------- DDL v14 ----------
let ddlOk = true;
try {
  await db.exec(DDL_V14);
  console.log("OK: DDL v14 diterapkan inline");
} catch (e) {
  console.log(`GAGAL: DDL v14\n  -> ${String(e.message).split("\n")[0]}`);
  gagal++;
  ddlOk = false;
}
if (!ddlOk) {
  console.log(`\nRINGKASAN: ${lolos} lolos, ${gagal} gagal (DDL v14 gagal)`);
  process.exit(1);
}

const kolom = await db.query(
  `select column_name, data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'pf_podcast_episodes'
   and column_name in ('audio_bytes', 'tts_suara')`,
);
cek(
  "v14: kolom audio_bytes ada",
  kolom.rows.some((r) => r.column_name === "audio_bytes"),
);
cek(
  "v14: audio_bytes bertipe bigint",
  kolom.rows.find((r) => r.column_name === "audio_bytes")?.data_type ===
    "bigint",
);
cek(
  "v14: kolom tts_suara ada",
  kolom.rows.some((r) => r.column_name === "tts_suara"),
);
cek(
  "v14: DDL persis seperti laporan (alter + add column if not exists)",
  DDL_V14.includes("alter table public.pf_podcast_episodes") &&
    DDL_V14.includes("add column if not exists audio_bytes bigint") &&
    DDL_V14.includes("add column if not exists tts_suara text"),
);

// ---------- Seed (sintetis) ----------
await db.query(
  `insert into public.pf_podcast_episodes
     (slug, judul, deskripsi, jenis, teks_naskah, audio_url, durasi_detik,
      audio_bytes, tts_suara, tanggal, status, dibuat_pada)
   values
     ('uji-dengan-audio', 'Uji & Berita <Penting>', 'Deskripsi "uji" episode.',
      'artikel', 'Naskah uji episode pertama.', 'https://cdn.contoh.test/audio/uji-dengan-audio.mp3',
      3661, 1234567, 'id_ID-contoh-medium', '2026-11-16', 'terbit', '2026-11-16 10:00:00+00'),
     ('uji-audio-tanpa-ukuran', 'Uji audio tanpa ukuran', null,
      'brief', 'Naskah uji episode kedua.', 'https://cdn.contoh.test/audio/uji2.mp3',
      null, null, null, '2026-11-15', 'terbit', '2026-11-15 10:00:00+00'),
     ('uji-tanpa-audio', 'Uji tanpa audio', 'Belum ada file audio.',
      'mingguan', 'Naskah uji episode ketiga.', null,
      null, null, null, '2026-11-14', 'terbit', '2026-11-14 10:00:00+00'),
     ('uji-draf', 'Uji draf (jangan tampil)', null,
      'artikel', 'Naskah draf.', 'https://cdn.contoh.test/audio/draf.mp3',
      60, 111, 'id_ID-contoh-medium', '2026-11-16', 'draft', '2026-11-16 11:00:00+00')`,
);
const barisTerbit = await db.query(
  `select slug, judul, deskripsi, jenis, audio_url, durasi_detik,
          audio_bytes, tts_suara, tanggal, dibuat_pada
   from public.pf_podcast_episodes
   where status = 'terbit' order by tanggal desc`,
);
cek(
  "seed: 3 episode terbit terbaca, draf tidak ikut",
  barisTerbit.rows.length === 3 &&
    barisTerbit.rows.every((r) => r.slug !== "uji-draf"),
  `${barisTerbit.rows.map((r) => r.slug).join(", ")}`,
);

// ---------- urlAudioAbsolut ----------
cek("url absolut https diterima", urlAudioAbsolut("https://x.test/a.mp3"));
cek("url absolut http diterima", urlAudioAbsolut("http://x.test/a.mp3"));
cek("url relatif ditolak", !urlAudioAbsolut("/audio/a.mp3"));
cek("url kosong ditolak", !urlAudioAbsolut(null));
cek("url ftp ditolak", !urlAudioAbsolut("ftp://x.test/a.mp3"));

// ---------- bangunEnclosure ----------
const epAudio = barisTerbit.rows.find((r) => r.slug === "uji-dengan-audio");
const epTanpaUkuran = barisTerbit.rows.find(
  (r) => r.slug === "uji-audio-tanpa-ukuran",
);
const epTanpaAudio = barisTerbit.rows.find((r) => r.slug === "uji-tanpa-audio");
const enc1 = bangunEnclosure(epAudio);
cek(
  "enclosure: url + length + type benar",
  enc1 ===
    '<enclosure url="https://cdn.contoh.test/audio/uji-dengan-audio.mp3" length="1234567" type="audio/mpeg" />',
  enc1 ?? "(null)",
);
cek(
  "enclosure: audio tanpa ukuran → length 0 (bukan hilang)",
  bangunEnclosure(epTanpaUkuran) ===
    '<enclosure url="https://cdn.contoh.test/audio/uji2.mp3" length="0" type="audio/mpeg" />',
);
cek(
  "enclosure: episode tanpa audio → null (fallback TTS browser)",
  bangunEnclosure(epTanpaAudio) === null,
);
cek(
  "enclosure: url relatif → null",
  bangunEnclosure({ ...epAudio, audio_url: "/audio/x.mp3" }) === null,
);

// ---------- formatDurasiItunes ----------
cek("durasi 3661 → 1:01:01", formatDurasiItunes(3661) === "1:01:01");
cek("durasi 90 → 1:30", formatDurasiItunes(90) === "1:30");
cek("durasi 0 → 0:00", formatDurasiItunes(0) === "0:00");
cek("durasi null → null", formatDurasiItunes(null) === null);
cek("durasi negatif → null", formatDurasiItunes(-5) === null);

// ---------- escXml ----------
cek(
  "escXml: & < > \" ' lolos",
  escXml(`a & b <c> "d" 'e'`) === "a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;",
);

// ---------- bangunFeedPodcastXml dari baris DB ----------
const feed = bangunFeedPodcastXml(barisTerbit.rows, "https://prata-fakta.vercel.app");
cek("feed: deklarasi XML + rss + namespace itunes", feed.startsWith('<?xml version="1.0" encoding="UTF-8"?>') &&
  feed.includes('<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">'));
cek("feed: channel podcast + bahasa id-ID", feed.includes("<title>PRATA FAKTA Podcast</title>") &&
  feed.includes("<language>id-ID</language>"));
cek("feed: 3 item (draf tidak masuk)", (feed.match(/<item>/g) ?? []).length === 3);
cek("feed: 2 enclosure (episode tanpa audio tidak punya)", (feed.match(/<enclosure /g) ?? []).length === 2);
cek("feed: enclosure memakai audio_bytes dari DB", feed.includes('length="1234567"'));
cek("feed: itunes:duration 1:01:01 untuk episode 3661 detik", feed.includes("<itunes:duration>1:01:01</itunes:duration>"));
cek("feed: hanya 1 itunes:duration (episode tanpa durasi tidak punya)", (feed.match(/<itunes:duration>/g) ?? []).length === 1);
cek("feed: judul dengan & < di-escape", feed.includes("Uji &amp; Berita &lt;Penting&gt;") && !feed.includes("Uji & Berita"));
cek("feed: tautan episode /podcast/<slug>", feed.includes("https://prata-fakta.vercel.app/podcast/uji-dengan-audio"));
cek("feed: pubDate ada per item", (feed.match(/<pubDate>/g) ?? []).length === 3);
cek(
  "feed: atribusi suara Piper pada episode ber-tts_suara",
  feed.includes("<copyright>Audio dibuat dengan Piper, suara id_ID-contoh-medium.</copyright>"),
);
cek(
  "feed: hanya 1 atribusi suara (episode tanpa tts_suara tidak punya)",
  (feed.match(/Audio dibuat dengan Piper/g) ?? []).length === 1,
);
cek(
  "feed: kebijakan lisensi tercantum di deskripsi channel",
  feed.includes("hanya dengan suara yang lisensinya sudah diverifikasi"),
);

// Feed kosong → valid tanpa item (jujur).
const feedKosong = bangunFeedPodcastXml([], "https://prata-fakta.vercel.app");
cek(
  "feed kosong: valid, 0 item, tanpa karangan",
  feedKosong.includes("<channel>") && !(feedKosong.match(/<item>/g) ?? []).length,
);

// ---------- Route /podcast.xml ----------
const routePodcastXml = bacaRepo("src/app/podcast.xml/route.ts");
cek("route podcast.xml ada + pakai bangunFeedPodcastXml", routePodcastXml.includes("bangunFeedPodcastXml"));
cek("route podcast.xml: Content-Type application/rss+xml", routePodcastXml.includes("application/rss+xml"));
cek("route podcast.xml: DB kosong → feed tanpa item (bukan error)", routePodcastXml.includes("episode = []"));

// ---------- lib/podcast.ts: kolom v14 + putusan lisensi ----------
const libPodcast = bacaRepo("src/lib/podcast.ts");
cek("lib podcast: tipe episode punya audio_bytes + tts_suara", libPodcast.includes("audio_bytes: number | null") && libPodcast.includes("tts_suara: string | null"));
cek("lib podcast: select memuat kolom v14", libPodcast.includes("audio_bytes, tts_suara"));
cek("lib podcast: SUARA_TTS_TERPILIH = null (belum ada suara berlisensi jelas)", libPodcast.includes("SUARA_TTS_TERPILIH: string | null = null"));
cek("lib podcast: suara id_ID yang dievaluasi didokumentasikan", libPodcast.includes("id_ID-news_tts-medium") && libPodcast.includes("BELUM BISA"));
cek("lib podcast: nama bucket podcast-audio", libPodcast.includes('NAMA_BUCKET_AUDIO_PODCAST = "podcast-audio"'));
cek("lib podcast: label 'Audio rekaman' tetap ada (kompatibel baterai fase8)", libPodcast.includes('"Audio rekaman"'));
cek("lib podcast: helper atribusiSuaraTts ada", libPodcast.includes("atribusiSuaraTts"));

// ---------- Fallback TTS browser tetap jalan ----------
const pemutar = bacaRepo("src/components/podcast/PemutarPodcast.tsx");
cek(
  "pemutar: mode audio_url memakai <audio> native",
  pemutar.includes("<audio") && pemutar.includes("audioUrl"),
);
cek(
  "pemutar: fallback TTS browser (SpeechSynthesis) tetap ada",
  pemutar.includes("speechSynthesis") && pemutar.includes("SpeechSynthesisUtterance"),
);
cek(
  "pemutar: tanpa audio_url tidak pura-pura rekaman",
  pemutar.includes('"Audio TTS browser"'),
);

// ---------- Halaman podcast: status jujur + tautan feed ----------
const halamanPodcast = bacaRepo("src/app/podcast/page.tsx");
cek("halaman podcast: tautan ke /podcast.xml", halamanPodcast.includes('href="/podcast.xml"'));
cek("halaman podcast: status audio server BELUM BISA jujur", halamanPodcast.includes("BELUM BISA dipakai") && halamanPodcast.includes("lisensi"));
cek("halaman podcast: tidak lagi klaim 'belum ada feed RSS podcast'", !halamanPodcast.includes("belum ada feed RSS"));
const halamanDetail = bacaRepo("src/app/podcast/[slug]/page.tsx");
cek("halaman detail: atribusi suara TTS ditampilkan bila ada", halamanDetail.includes("atribusiSuaraTts(episode)"));
cek("halaman detail: menyebut podcast.xml untuk episode ber-audio", halamanDetail.includes("podcast.xml"));

// ---------- Workflow podcast-tts.yml: gerbang lisensi ----------
const workflow = bacaRepo(".github/workflows/podcast-tts.yml");
cek("workflow: hanya workflow_dispatch (tanpa jadwal/auto-publish)", workflow.includes("workflow_dispatch") && !workflow.includes("schedule:") && !workflow.includes("cron:"));
cek("workflow: input suara wajib + tanpa default suara", workflow.includes("suara:") && !/suara:\s*\n(\s+\S+:\s+.*\n)*?\s+default:\s*"?id_ID/.test(workflow));
cek("workflow: konfirmasi_lisensi wajib 'ya'", workflow.includes("konfirmasi_lisensi") && workflow.includes('"ya"'));
cek("workflow: menolak id_ID-news_tts-medium mentah-mentah", workflow.includes('= "id_ID-news_tts-medium"'));
cek("workflow: memakai piper-tts 1.8.0", workflow.includes('piper-tts==1.8.0'));
cek("workflow: hanya episode status terbit (naskah disetujui editor)", workflow.includes('"terbit"'));
cek("workflow: unggah ke bucket podcast-audio + PATCH audio_bytes/tts_suara", workflow.includes("podcast-audio") && workflow.includes("audio_bytes") && workflow.includes("tts_suara"));
cek("workflow: secret lewat GitHub Secrets (bukan nilai di repo)", workflow.includes("secrets.PF_SUPABASE_URL") && workflow.includes("secrets.PF_SERVICE_ROLE_KEY"));
cek("workflow: mendokumentasikan bucket dibuat manual (bukan migrasi)", workflow.includes("Bucket TIDAK bisa dibuat via migrasi SQL"));

console.log(`\nRINGKASAN: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
