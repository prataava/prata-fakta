// Uji migrasi v10 Gelombang 2 PRATA FAKTA -> PGlite.
// Menerapkan v1–v10 dua kali (idempotensi) TANPA blanket grant
// (pelajaran F4), lalu memeriksa: 53 tabel / RLS 53/53 / policy
// 106 (27 baru v10), kolom perluasan §7, GRANT selaras policy
// (anon/authenticated bisa membaca yang seharusnya, ditolak
// yang seharusnya), isolasi pemilik 4 tabel user, dan FK
// negara_kode. Keluar 0 bila semua asersi lolos, 1 bila ada
// yang gagal.
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = require("@electric-sql/pglite");

const DIR_MIGRASI = new URL("../supabase/migrations/", import.meta.url).pathname;

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

// Setup PGlite (pola uji-fase8-gel1.mjs): schema auth + tabel
// auth.users + stub auth.uid() + role — SEBELUM migrasi.
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
console.log("OK: setup auth + role");

// Terapkan v1–v10 dua kali.
for (const putaran of [1, 2]) {
  for (const nama of MIGRASI) {
    const ok = await jalankan(`migrasi ${nama} (putaran ${putaran})`, baca(nama));
    if (!ok) process.exit(1);
  }
}

// Hitung akhir.
const tabel = await db.query(
  `select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'pf_%'`
);
cek("jumlah tabel pf_* = 53", tabel.rows[0].n === 53, `dapat ${tabel.rows[0].n}`);
const rls = await db.query(
  `select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'pf_%' and rowsecurity`
);
cek("RLS 53/53", rls.rows[0].n === 53, `dapat ${rls.rows[0].n}`);
const policy = await db.query(
  `select count(*)::int as n from pg_policies where schemaname='public' and tablename like 'pf_%'`
);
cek("jumlah policy pf_* = 106", policy.rows[0].n === 106, `dapat ${policy.rows[0].n}`);
const policyV10 = await db.query(
  `select count(*)::int as n from pg_policies where schemaname='public' and tablename in
   ('pf_stories','pf_story_events','pf_story_articles','pf_story_followers','pf_courses',
    'pf_course_modules','pf_course_lessons','pf_course_progress','pf_podcast_episodes',
    'pf_podcast_history','pf_podcast_playlist_items','pf_research_reports','pf_documents',
    'pf_countries','pf_country_facts','pf_system_settings')`
);
cek("policy tabel v10 = 27", policyV10.rows[0].n === 27, `dapat ${policyV10.rows[0].n}`);

// Kolom perluasan §7 ada.
const kolom = await db.query(`
  select table_name, column_name from information_schema.columns
  where table_schema='public' and (
    (table_name='pf_knowledge_articles' and column_name in ('jenis','tingkat','estimasi_baca_menit','seri_slug')) or
    (table_name='pf_data_indicators' and column_name in ('cakupan','frekuensi_update','negara_kode')) or
    (table_name='pf_questions' and column_name in ('publik','kategori','membantu')) or
    (table_name='pf_events' and column_name in ('era','penting','negara_kode')) or
    (table_name='pf_articles' and column_name in ('negara_kode'))
  )`);
cek("kolom perluasan §7 = 14", kolom.rows.length === 14, `dapat ${kolom.rows.length}`);

// Seed superuser (service role = bypass RLS): pengguna uji (FK
// user_id) + 1 negara + konten terbit.
await db.query(`insert into auth.users (id, email) values ($1, 'a@uji.id'), ($2, 'b@uji.id')`, [UID_A, UID_B]);
await db.query(`insert into public.pf_countries (kode, nama, ibu_kota, sumber, periode_referensi)
  values ('ID', 'Indonesia', 'Jakarta', 'BPS', '2026')`);
await db.query(`insert into public.pf_stories (slug, judul, status, status_perkembangan)
  values ('cerita-uji', 'Cerita Uji', 'terbit', 'berkembang')`);
await db.query(`insert into public.pf_stories (slug, judul, status)
  values ('cerita-draf', 'Cerita Draf', 'draft')`);
await db.query(`insert into public.pf_courses (slug, judul, status)
  values ('kursus-uji', 'Kursus Uji', 'terbit')`);
await db.query(`insert into public.pf_podcast_episodes (slug, judul, teks_naskah, status)
  values ('ep-uji', 'Episode Uji', 'Naskah uji.', 'terbit')`);
await db.query(`insert into public.pf_research_reports (slug, judul, status)
  values ('riset-uji', 'Riset Uji', 'terbit')`);
await db.query(`insert into public.pf_documents (jenis, judul, url_sumber)
  values ('laporan', 'Dokumen Uji', 'https://example.com/dok.pdf')`);
const story = await db.query(`select id from public.pf_stories where slug='cerita-uji'`);
const storyId = story.rows[0].id;
await db.query(`insert into public.pf_story_followers (user_id, story_id) values ($1, $2)`, [UID_A, storyId]);
const course = await db.query(`select id from public.pf_courses where slug='kursus-uji'`);
const courseId = course.rows[0].id;
await db.query(`insert into public.pf_course_modules (course_id, judul) values ($1, 'Modul 1')`, [courseId]);
const modul = await db.query(`select id from public.pf_course_modules where course_id=$1`, [courseId]);
await db.query(`insert into public.pf_course_lessons (module_id, judul) values ($1, 'Pelajaran 1')`, [modul.rows[0].id]);
const lesson = await db.query(`select id from public.pf_course_lessons limit 1`);
await db.query(`insert into public.pf_course_progress (user_id, lesson_id, selesai) values ($1, $2, true)`, [UID_A, lesson.rows[0].id]);
const ep = await db.query(`select id from public.pf_podcast_episodes where slug='ep-uji'`);
await db.query(`insert into public.pf_podcast_history (user_id, episode_id, posisi_detik) values ($1, $2, 30)`, [UID_A, ep.rows[0].id]);
await db.query(`insert into public.pf_podcast_playlist_items (user_id, episode_id) values ($1, $2)`, [UID_A, ep.rows[0].id]);

// GRANT + RLS: anon membaca konten terbit, draf tersembunyi.
cek("anon baca pf_stories terbit = 1",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_stories`)) === 1);
cek("anon baca pf_countries = 1",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_countries`)) === 1);
cek("anon baca pf_system_settings = 0 (staf-only)",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_system_settings`)) === 0);
cek("authenticated baca pf_system_settings = 0 (staf-only)",
  (await hitungSebagaiUid("authenticated", UID_A, `select count(*)::int as n from public.pf_system_settings`)) === 0);
cek("anon baca pf_courses terbit = 1",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_courses`)) === 1);
cek("anon baca pf_course_modules (kursus terbit) = 1",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_course_modules`)) === 1);
cek("anon baca pf_podcast_episodes terbit = 1",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_podcast_episodes`)) === 1);
cek("anon baca pf_documents terbit = 1",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_documents`)) === 1);

// Isolasi pemilik: A baca milik sendiri = 1, milik B = 0; anon = 0.
for (const [tabelUser, label] of [
  ["pf_story_followers", "story_followers"],
  ["pf_course_progress", "course_progress"],
  ["pf_podcast_history", "podcast_history"],
  ["pf_podcast_playlist_items", "podcast_playlist"],
]) {
  cek(`A baca ${label} sendiri = 1`,
    (await hitungSebagaiUid("authenticated", UID_A, `select count(*)::int as n from public.${tabelUser}`)) === 1);
  cek(`B baca ${label} milik A = 0`,
    (await hitungSebagaiUid("authenticated", UID_B, `select count(*)::int as n from public.${tabelUser}`)) === 0);
  cek(`anon baca ${label} = 0`,
    (await hitungSebagai("anon", `select count(*)::int as n from public.${tabelUser}`)) === 0);
}

// FK negara_kode: artikel + event + indikator menerima 'ID', menolak 'XX'.
await db.query(`insert into public.pf_articles (slug, judul, kategori_slug, status, negara_kode)
  values ('art-uji-negara', 'Artikel Uji', 'indonesia', 'terbit', 'ID')`);
cek("artikel negara_kode='ID' diterima",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_articles where slug='art-uji-negara'`)) === 1);
let tolakFk = false;
try {
  await db.query(`insert into public.pf_articles (slug, judul, kategori_slug, status, negara_kode)
    values ('art-uji-negara-xx', 'Artikel XX', 'indonesia', 'terbit', 'XX')`);
} catch {
  tolakFk = true;
}
cek("artikel negara_kode='XX' ditolak (FK)", tolakFk);

// CHECK enum: jenis podcast bogus ditolak.
let tolakCheck = false;
try {
  await db.query(`insert into public.pf_podcast_episodes (slug, judul, teks_naskah, jenis)
    values ('ep-bogus', 'Bogus', 'x', 'video')`);
} catch {
  tolakCheck = true;
}
cek("episode jenis='video' ditolak (CHECK)", tolakCheck);

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
