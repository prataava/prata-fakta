// Uji Fase 8 Gelombang 2 (Ask the World + PRATA Podcast) PRATA
// FAKTA -> PGlite + pemeriksaan statis.
// Menerapkan v1–v10 dua kali (idempotensi) TANPA blanket grant
// (pelajaran F4 — v9/v10 memberi GRANT eksplisit), lalu memeriksa:
//   - 53 tabel / RLS 53/53 / policy 106;
//   - kolom v10 pf_questions (publik/kategori/membantu) tersimpan;
//   - episode podcast draf tersembunyi dari anon, terbit terlihat;
//   - isolasi riwayat/playlist: A=1, B=0;
//   - arsip hanya publik+terjawab (filter kueri) + anon tak bisa
//     SELECT pf_questions langsung (alasan route arsip memakai
//     service role);
//   - CHECK jenis/status episode; slug episode unik;
//   - fungsi murni kataKunci / kategoriPertanyaan;
//   - statis: berkas Area 6+9 ada, jawaban tanpa referensi ->
//     tidak_ada_data, PATCH admin wajib referensi, pemutar punya
//     <audio> + kecepatan 0.75–2 + label TTS jujur, TIDAK ada RSS
//     enclosure podcast.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = require("@electric-sql/pglite");

const requireRepo = createRequire(new URL("../package.json", import.meta.url).pathname);
const ts = requireRepo("typescript");
function transpileKeJs(kodeTs) {
  return ts.transpileModule(kodeTs, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
}

const DIR_MIGRASI = new URL("../supabase/migrations/", import.meta.url).pathname;
const DIR_REPO = new URL("../", import.meta.url).pathname;

let gagal = 0;
let lolos = 0;
function cek(label, kondisi, detail = "") {
  if (kondisi) {
    lolos++;
    console.log(`OK: ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(`GAGAL: ${label}${detail ? ` — ${detail}` : ""}`);
    gagal++;
  }
}

function baca(nama) {
  let sql = fs.readFileSync(`${DIR_MIGRASI}/${nama}`, "utf8");
  sql = sql.replace(/create extension[^;]+;/gi, "-- ekstensi dilepas (PGlite)");
  sql = sql.replace(/\bcitext\b/gi, "text");
  return sql;
}

function bacaRepo(relatif) {
  return fs.readFileSync(`${DIR_REPO}/${relatif}`, "utf8");
}

const db = new PGlite();

async function jalankan(label, teks) {
  try {
    await db.exec(teks);
    console.log(`OK: ${label}`);
    return true;
  } catch (e) {
    console.log(`GAGAL: ${label}\n  -> ${String(e.message).split("\n")[0]}`);
    gagal++;
    return false;
  }
}

async function sebagai(role, sql, params = []) {
  await db.query(`set role ${role}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.query("reset role");
  }
}

async function sebagaiUid(role, uid, sql, params = []) {
  await db.query(`set role ${role}`);
  await db.query(`select set_config('pf.uid_test', $1, false)`, [uid]);
  try {
    return await db.query(sql, params);
  } finally {
    await db.query(`select set_config('pf.uid_test', '', false)`);
    await db.query("reset role");
  }
}

async function hitungSebagai(role, sql, params = []) {
  const r = await sebagai(role, sql, params);
  return Number(r.rows[0]?.n ?? 0);
}

async function hitungSebagaiUid(role, uid, sql, params = []) {
  const r = await sebagaiUid(role, uid, sql, params);
  return Number(r.rows[0]?.n ?? 0);
}

async function berhasilSebagaiUid(role, uid, sql, params = []) {
  try {
    await sebagaiUid(role, uid, sql, params);
    return true;
  } catch {
    return false;
  }
}

const hitung = async (sql, params = []) =>
  Number((await db.query(sql, params)).rows[0].n);

const MIGRASI = [
  "20261116_pf_v1_foundation.sql",
  "20261116_pf_v2_articles.sql",
  "20261116_pf_v3_ingestion.sql",
  "20261116_pf_v4_ai.sql",
  "20261116_pf_v5_editorial.sql",
  "20261116_pf_v6_advanced.sql",
  "20261116_pf_v7_quiz_scores.sql",
  "20261116_pf_v8_expansion.sql",
  "20261116_pf_v9_grants.sql",
  "20261116_pf_v10_wave2.sql",
];

const UID_A = "11111111-1111-1111-1111-111111111111";
const UID_B = "22222222-2222-2222-2222-222222222222";

await db.exec(`create schema if not exists auth;`);
await db.exec(`create schema if not exists extensions;`);
await db.exec(
  `create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);`,
);
await db.exec(
  `create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('pf.uid_test', true), '')::uuid $$;`,
);
await db.exec(`create role anon nologin;`);
await db.exec(`create role authenticated nologin;`);
await db.query(`insert into auth.users (id, email) values ($1, 'a@contoh.id'), ($2, 'b@contoh.id')`, [UID_A, UID_B]);
console.log("OK: setup auth + role + 2 pengguna");

for (const putaran of [1, 2]) {
  for (const nama of MIGRASI) {
    const ok = await jalankan(`migrasi ${nama} (putaran ${putaran})`, baca(nama));
    if (!ok) process.exit(1);
  }
}

cek(
  "tabel pf_* = 53",
  (await hitung(
    `select count(*) n from pg_tables where schemaname='public' and tablename like 'pf_%'`,
  )) === 53,
);
cek(
  "RLS 53/53",
  (await hitung(
    `select count(*) n from pg_tables where schemaname='public' and tablename like 'pf_%' and rowsecurity`,
  )) === 53,
);
cek(
  "policy total = 106",
  (await hitung(
    `select count(*) n from pg_policies where schemaname='public' and tablename like 'pf_%'`,
  )) === 106,
);

// ---------- Kolom v10 pf_questions ----------
cek(
  "kolom publik/kategori/membantu ada di pf_questions",
  (await hitung(
    `select count(*) n from information_schema.columns
     where table_schema='public' and table_name='pf_questions'
       and column_name in ('publik','kategori','membantu')`,
  )) === 3,
);
const qArsipId = (
  await db.query(
    `insert into public.pf_questions (user_id, pertanyaan, jawaban, referensi, status, kategori, publik, membantu)
     values (null, 'Berapa penduduk Indonesia?', 'Populasi: 281.600.000 jiwa. Sumber: BPS.', '[{"judul": "Populasi Indonesia", "url": "/data"}]'::jsonb, 'terjawab', 'ekonomi', true, 3)
     returning id`,
  )
).rows[0].id;
const qPrivatId = (
  await db.query(
    `insert into public.pf_questions (user_id, pertanyaan, jawaban, status, kategori, publik, membantu)
     values (null, 'Pertanyaan privat?', 'Jawaban privat.', 'terjawab', 'umum', false, 0)
     returning id`,
  )
).rows[0].id;
const qAntreId = (
  await db.query(
    `insert into public.pf_questions (user_id, pertanyaan, jawaban, status, kategori, publik, membantu)
     values (null, 'Pertanyaan tanpa data?', 'Belum ada data.', 'tidak_ada_data', 'umum', true, 0)
     returning id`,
  )
).rows[0].id;
cek(
  "publik/kategori/membantu tersimpan (baca balik = ekonomi/true/3)",
  (await db.query(
    `select kategori = 'ekonomi' and publik = true and membantu = 3 as v from public.pf_questions where id = $1`,
    [qArsipId],
  )).rows[0].v === true,
);
cek(
  "publik default false bila tak diisi",
  (await db.query(
    `select publik = false and membantu = 0 as v from public.pf_questions where id = $1`,
    [qPrivatId],
  )).rows[0].v === true,
);

// ---------- Arsip: hanya publik + terjawab ----------
cek(
  "arsip (publik + terjawab) = 1 dari 3 pertanyaan",
  (await hitung(
    `select count(*) n from public.pf_questions where publik = true and status = 'terjawab'`,
  )) === 1,
);
cek(
  "arsip: privat+terjawab TIDAK masuk",
  (await hitung(
    `select count(*) n from public.pf_questions where id = $1 and publik = true and status = 'terjawab'`,
    [qPrivatId],
  )) === 0,
);
cek(
  "arsip: publik+tidak_ada_data TIDAK masuk",
  (await hitung(
    `select count(*) n from public.pf_questions where id = $1 and publik = true and status = 'terjawab'`,
    [qAntreId],
  )) === 0,
);
cek(
  "anon SELECT pf_questions langsung = 0 baris (RLS pemilik+staf) — arsip WAJIB service role",
  (await hitungSebagai("anon", `select count(*) n from public.pf_questions`)) === 0,
);

// ---------- Podcast: draf tersembunyi, terbit terlihat ----------
const epTerbitId = (
  await db.query(
    `insert into public.pf_podcast_episodes (slug, judul, jenis, teks_naskah, tanggal, status)
     values ('uji-terbit', 'Episode Uji Terbit', 'brief', 'Naskah uji terbit.', '2026-11-16', 'terbit')
     returning id`,
  )
).rows[0].id;
const epDrafId = (
  await db.query(
    `insert into public.pf_podcast_episodes (slug, judul, jenis, teks_naskah, tanggal, status)
     values ('uji-draf', 'Episode Uji Draf', 'artikel', 'Naskah uji draf.', '2026-11-16', 'draft')
     returning id`,
  )
).rows[0].id;
cek(
  "episode terbit terlihat anon",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_podcast_episodes where id = $1`,
    [epTerbitId],
  )) === 1,
);
cek(
  "episode draf TERSEMBUNYI dari anon",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_podcast_episodes where id = $1`,
    [epDrafId],
  )) === 0,
);
cek(
  "anon melihat tepat 1 episode (hanya terbit)",
  (await hitungSebagai("anon", `select count(*) n from public.pf_podcast_episodes`)) === 1,
);

// ---------- CHECK episode ----------
async function insertLolos(sql, params = []) {
  try {
    await db.query(sql, params);
    return true;
  } catch {
    return false;
  }
}
cek(
  "episode jenis bogus ditolak",
  !(await insertLolos(
    `insert into public.pf_podcast_episodes (slug, judul, jenis, teks_naskah) values ('x-bogus', 'X', 'bogus', 'naskah')`,
  )),
);
cek(
  "episode status bogus ditolak",
  !(await insertLolos(
    `insert into public.pf_podcast_episodes (slug, judul, jenis, teks_naskah, status) values ('x-bogus-2', 'X', 'brief', 'naskah', 'bogus')`,
  )),
);
cek(
  "episode slug duplikat ditolak",
  !(await insertLolos(
    `insert into public.pf_podcast_episodes (slug, judul, jenis, teks_naskah) values ('uji-terbit', 'X', 'brief', 'naskah')`,
  )),
);
cek(
  "episode audio_url nullable (TTS tetap jalan tanpa audio)",
  (await db.query(
    `select audio_url is null as v from public.pf_podcast_episodes where id = $1`,
    [epTerbitId],
  )).rows[0].v === true,
);

// ---------- Riwayat + playlist: isolasi A=1, B=0 ----------
cek(
  "riwayat: insert milik A diterima",
  await berhasilSebagaiUid(
    "authenticated",
    UID_A,
    `insert into public.pf_podcast_history (user_id, episode_id, posisi_detik, selesai) values ($1, $2, 42, false)`,
    [UID_A, epTerbitId],
  ),
);
cek(
  "riwayat: A melihat 1 baris miliknya",
  (await hitungSebagaiUid(
    "authenticated",
    UID_A,
    `select count(*) n from public.pf_podcast_history where user_id = $1`,
    [UID_A],
  )) === 1,
);
cek(
  "riwayat: B melihat 0 baris milik A (isolasi)",
  (await hitungSebagaiUid(
    "authenticated",
    UID_B,
    `select count(*) n from public.pf_podcast_history`,
  )) === 0,
);
cek(
  "riwayat: B tidak bisa insert atas nama A",
  !(await berhasilSebagaiUid(
    "authenticated",
    UID_B,
    `insert into public.pf_podcast_history (user_id, episode_id, posisi_detik) values ($1, $2, 1)`,
    [UID_A, epTerbitId],
  )),
);
cek(
  "playlist: insert milik A diterima",
  await berhasilSebagaiUid(
    "authenticated",
    UID_A,
    `insert into public.pf_podcast_playlist_items (user_id, episode_id, urutan) values ($1, $2, 0)`,
    [UID_A, epTerbitId],
  ),
);
cek(
  "playlist: A melihat 1 item miliknya",
  (await hitungSebagaiUid(
    "authenticated",
    UID_A,
    `select count(*) n from public.pf_podcast_playlist_items where user_id = $1`,
    [UID_A],
  )) === 1,
);
cek(
  "playlist: B melihat 0 item milik A (isolasi)",
  (await hitungSebagaiUid(
    "authenticated",
    UID_B,
    `select count(*) n from public.pf_podcast_playlist_items`,
  )) === 0,
);
cek(
  "playlist: duplikat (user, episode) ditolak",
  !(await berhasilSebagaiUid(
    "authenticated",
    UID_A,
    `insert into public.pf_podcast_playlist_items (user_id, episode_id, urutan) values ($1, $2, 1)`,
    [UID_A, epTerbitId],
  )),
);

// ---------- Fungsi murni: kataKunci + kategoriPertanyaan ----------
const tanyaSrc = bacaRepo("src/app/api/tanya/route.ts");
const stopSrc = /const STOPWORDS = new Set\(\[[\s\S]*?\]\);/.exec(tanyaSrc)?.[0];
const katSrc = /const KATA_KATEGORI: \{ kategori: string; kata: string\[\] \}\[\] = \[[\s\S]*?\n\];/.exec(tanyaSrc)?.[0];
const fnKata = /export function kataKunci\([\s\S]*?\n\}/.exec(tanyaSrc)?.[0];
const fnKategori = /export function kategoriPertanyaan\([\s\S]*?\n\}/.exec(tanyaSrc)?.[0];
cek("kataKunci + kategoriPertanyaan dapat diekstrak dari sumber", Boolean(stopSrc && katSrc && fnKata && fnKategori));
if (stopSrc && katSrc && fnKata && fnKategori) {
  const { kataKunci, kategoriPertanyaan } = new Function(
    transpileKeJs(
      `${stopSrc}\n${katSrc}\n${fnKata.replace("export function", "function")}\n${fnKategori.replace("export function", "function")}\nreturn { kataKunci, kategoriPertanyaan };`,
    ),
  )();
  cek("kataKunci: stopwords + token <4 huruf dibuang", JSON.stringify(kataKunci("Berapa jumlah penduduk Indonesia?")) === JSON.stringify(["jumlah", "penduduk", "indonesia"]));
  cek("kataKunci: duplikat dihapus, maks 6", kataKunci("penduduk penduduk penduduk penduduk penduduk penduduk penduduk").length === 1);
  cek("kategori: inflasi → ekonomi", kategoriPertanyaan("Berapa inflasi bulan ini?") === "ekonomi");
  cek("kategori: penduduk → ekonomi", kategoriPertanyaan("Berapa jumlah penduduk Indonesia?") === "ekonomi");
  cek("kategori: teknologi → teknologi", kategoriPertanyaan("Apa itu kecerdasan buatan?") === "teknologi");
  cek("kategori: tanpa kata kunci → umum", kategoriPertanyaan("Apa kabar?") === "umum");
}

// ---------- Pemeriksaan statis ----------
for (const relatif of [
  "src/lib/podcast.ts",
  "src/app/tanya/arsip/page.tsx",
  "src/app/api/tanya/arsip/route.ts",
  "src/app/api/tanya/[id]/membantu/route.ts",
  "src/app/admin/tanya/page.tsx",
  "src/app/api/admin/tanya/route.ts",
  "src/app/api/admin/tanya/[id]/route.ts",
  "src/app/podcast/page.tsx",
  "src/app/podcast/[slug]/page.tsx",
  "src/app/api/podcast/route.ts",
  "src/app/api/podcast/riwayat/route.ts",
  "src/app/api/podcast/playlist/route.ts",
  "src/app/admin/podcast/page.tsx",
  "src/app/api/admin/podcast/route.ts",
  "src/app/api/admin/podcast/[id]/route.ts",
  "src/components/podcast/PemutarPodcast.tsx",
  "src/components/podcast/KartuEpisode.tsx",
  "src/components/podcast/TombolPlaylist.tsx",
]) {
  cek(`berkas ada: ${relatif}`, fs.existsSync(`${DIR_REPO}/${relatif}`));
}
cek(
  "retrieval tanpa referensi → tidak_ada_data (cabang else route tanya)",
  tanyaSrc.includes('status = "tidak_ada_data"') &&
    tanyaSrc.includes("JAWABAN_KOSONG"),
);
cek(
  "retrieval tanpa referensi TIDAK lagi menyimpan 'menunggu' dari route",
  !/status = "menunggu"/.test(tanyaSrc),
);
cek(
  "korpus retrieval mencakup indikator + event + negara",
  tanyaSrc.includes('from("pf_data_indicators")') &&
    tanyaSrc.includes('from("pf_data_points")') &&
    tanyaSrc.includes('from("pf_events")') &&
    tanyaSrc.includes('from("pf_countries")'),
);
cek(
  "route tanya menyimpan kategori + publik=false",
  tanyaSrc.includes("kategori,") && tanyaSrc.includes("publik: false"),
);
cek(
  "arsip memakai service role (RLS pemilik+staf memblokir anon)",
  bacaRepo("src/app/api/tanya/arsip/route.ts").includes("createServiceClient"),
);
cek(
  "arsip memfilter publik + terjawab",
  bacaRepo("src/app/api/tanya/arsip/route.ts").includes('.eq("publik", true)') &&
    bacaRepo("src/app/api/tanya/arsip/route.ts").includes('.eq("status", "terjawab")'),
);
cek(
  "membantu: satu vote per IP per pertanyaan per hari",
  bacaRepo("src/app/api/tanya/[id]/membantu/route.ts").includes("SUDAH_VOTE") &&
    bacaRepo("src/app/api/tanya/[id]/membantu/route.ts").includes("tanggalWibHariIni"),
);
cek(
  "admin tanya: PATCH jawab wajib referensi",
  bacaRepo("src/app/api/admin/tanya/[id]/route.ts").includes("wajib menunjuk referensi"),
);
cek(
  "admin tanya: antrean mencakup menunggu + tidak_ada_data",
  bacaRepo("src/app/api/admin/tanya/route.ts").includes('"tidak_ada_data"'),
);
cek(
  "halaman /tanya menautkan arsip + pesan tanpa jawaban otomatis instan",
  bacaRepo("src/app/tanya/page.tsx").includes('href="/tanya/arsip"') &&
    bacaRepo("src/app/tanya/page.tsx").includes("tanpa jawaban otomatis instan"),
);
cek(
  "lib/podcast mengekspor getDaftarEpisode/getEpisode/getRiwayat/getPlaylist",
  bacaRepo("src/lib/podcast.ts").includes("export async function getDaftarEpisode") &&
    bacaRepo("src/lib/podcast.ts").includes("export async function getEpisode") &&
    bacaRepo("src/lib/podcast.ts").includes("export async function getRiwayat") &&
    bacaRepo("src/lib/podcast.ts").includes("export async function getPlaylist"),
);
const pemutarSrc = bacaRepo("src/components/podcast/PemutarPodcast.tsx");
cek(
  "pemutar memakai <audio> native bila audio_url ada",
  pemutarSrc.includes("<audio") && pemutarSrc.includes("audioUrl"),
);
cek(
  "pemutar TTS memakai pola PembacaSuara (pecahUntukSuara + speechSynthesis)",
  pemutarSrc.includes("pecahUntukSuara") && pemutarSrc.includes("speechSynthesis"),
);
cek(
  "pemutar punya kecepatan 0.75/1/1.25/1.5/2",
  pemutarSrc.includes("[0.75, 1, 1.25, 1.5, 2]"),
);
cek(
  "pemutar menyimpan riwayat via POST /api/podcast/riwayat",
  pemutarSrc.includes('"/api/podcast/riwayat"'),
);
cek(
  "label jujur audio: 'Audio TTS browser' vs 'Audio rekaman'",
  bacaRepo("src/lib/podcast.ts").includes('"Audio TTS browser"') &&
    bacaRepo("src/lib/podcast.ts").includes('"Audio rekaman"'),
);
cek(
  "halaman podcast menyatakan batas audio + tanpa RSS",
  bacaRepo("src/app/podcast/page.tsx").includes("belum ada feed RSS") &&
    bacaRepo("src/app/podcast/page.tsx").includes("belum ada unduhan MP3"),
);
cek(
  "TIDAK ada RSS podcast enclosure (tanpa file audio — jangan klaim)",
  !fs.existsSync(`${DIR_REPO}/src/app/podcast/rss.xml`) &&
    !fs.existsSync(`${DIR_REPO}/src/app/api/podcast/rss`) &&
    !bacaRepo("src/app/api/podcast/route.ts").includes("<enclosure") &&
    !bacaRepo("src/app/podcast/page.tsx").includes("<enclosure"),
);
cek(
  "admin podcast: audio_url opsional + validasi brief/artikel sendiri",
  bacaRepo("src/app/api/admin/podcast/route.ts").includes("audio_url: audioUrl || null") &&
    bacaRepo("src/app/api/admin/podcast/route.ts").includes('from("pf_daily_briefs")') &&
    bacaRepo("src/app/api/admin/podcast/route.ts").includes('from("pf_articles")'),
);
cek(
  "riwayat API wajib login (401)",
  bacaRepo("src/app/api/podcast/riwayat/route.ts").includes("401"),
);
cek(
  "playlist API wajib login (401)",
  bacaRepo("src/app/api/podcast/playlist/route.ts").includes("401"),
);
cek(
  "tidak ada Date.now()/new Date() di render komponen klien baru (anchor aman)",
  !/new Date\(\)|Date\.now\(\)/.test(bacaRepo("src/app/tanya/arsip/page.tsx")) &&
    !/new Date\(\)|Date\.now\(\)/.test(bacaRepo("src/components/podcast/PemutarPodcast.tsx")) &&
    !/new Date\(\)|Date\.now\(\)/.test(bacaRepo("src/app/admin/tanya/page.tsx")) &&
    !/new Date\(\)|Date\.now\(\)/.test(bacaRepo("src/app/admin/podcast/page.tsx")),
);

// ---------- Ringkasan ----------
console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
if (gagal > 0) {
  console.log("HASIL: ADA KEGAGALAN");
  process.exit(1);
}
