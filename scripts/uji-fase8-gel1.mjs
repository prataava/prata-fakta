// Uji Fase 8 Gelombang 1 PRATA FAKTA -> PGlite + pemeriksaan statis.
// Langkah: (a) PGlite + stub auth + role anon/authenticated +
// migrasi v1..v7 (v7 2x); (b) SEBELUM v8: INSERT anon ke 3 tabel
// T5 berhasil + SELECT kunci berhasil + SELECT pf_roles terlihat
// (membuktikan celah yang ditutup v8 memang ada); (c) migrasi v8
// 2x (idempotensi); hitung tabel/RLS/policy; (d) SESUDAH v8:
// uji negatif T5 (INSERT anon ditolak), T1-sisa (SELECT kunci
// ditolak, kolom lain tetap bisa), T8 (baca pf_roles/
// pf_permissions/pf_role_permissions/article_sources/
// article_tags dibatasi), Area 1 (klaim/evidence/verification
// hanya bila artikel terbit), CHECK enum D4, D1/D2, tabel
// pf_user_preferences, kolom pf_article_sources,
// perluasan pf_correction_reports; (e) pemeriksaan statis:
// patch service role 3 route T5 + kuis/jawab + getKuisHarian,
// perbaikan desain G1/G2/G3, berkas Area 1/3/13/7, uji fungsi
// murni hitungStreakKuis / validasiTarget / nomor lacak.
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

/** Jalankan SQL sebagai role tertentu (RLS berlaku), lalu kembali. */
async function sebagai(role, sql, params = []) {
  await db.query(`set role ${role}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.query("reset role");
  }
}

async function berhasilSebagai(role, sql, params = []) {
  try {
    await sebagai(role, sql, params);
    return true;
  } catch {
    return false;
  }
}

async function hitungSebagai(role, sql, params = []) {
  const r = await sebagai(role, sql, params);
  return Number(r.rows[0]?.n ?? 0);
}

const hitung = async (sql, params = []) =>
  Number((await db.query(sql, params)).rows[0].n);

// ---------- Setup PGlite ----------
await db.exec(`create schema if not exists auth;`);
await db.exec(`create schema if not exists extensions;`);
await db.exec(
  `create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);`,
);
await db.exec(
  `create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`,
);
// Role Supabase (wajib ada sebelum v8: REVOKE FROM anon, authenticated).
await db.exec(`create role anon nologin;`);
await db.exec(`create role authenticated nologin;`);

let ok = await jalankan("v1", baca("20261116_pf_v1_foundation.sql"));
if (ok) ok = await jalankan("v2", baca("20261116_pf_v2_articles.sql"));
if (ok) ok = await jalankan("v3", baca("20261116_pf_v3_ingestion.sql"));
if (ok) ok = await jalankan("v4", baca("20261116_pf_v4_ai.sql"));
if (ok) ok = await jalankan("v5", baca("20261116_pf_v5_editorial.sql"));
if (ok) ok = await jalankan("v6", baca("20261116_pf_v6_advanced.sql"));
if (ok) ok = await jalankan("v7 putaran 1", baca("20261116_pf_v7_quiz_scores.sql"));
if (ok) ok = await jalankan("v7 putaran 2 (idempotensi)", baca("20261116_pf_v7_quiz_scores.sql"));
if (!ok) {
  console.log("HASIL: MIGRASI GAGAL");
  process.exit(1);
}

// Simulasi grant default Supabase: anon/authenticated boleh
// SELECT + INSERT (RLS yang membatasi, bukan grant).
await db.exec(
  `grant select, insert on all tables in schema public to anon, authenticated;`,
);

// Data pendukung untuk uji sebelum/sesudah v8 (superuser, bypass RLS).
const artikelTerbitId = (
  await db.query(
    `insert into public.pf_articles (slug, judul, kategori_slug, status)
     values ('uji-terbit', 'Artikel Uji Terbit', 'indonesia', 'terbit')
     returning id`,
  )
).rows[0].id;
const artikelDrafId = (
  await db.query(
    `insert into public.pf_articles (slug, judul, kategori_slug, status)
     values ('uji-draf', 'Artikel Uji Draf', 'indonesia', 'draft')
     returning id`,
  )
).rows[0].id;
const soalKuisId = (
  await db.query(
    `insert into public.pf_quiz_questions (tanggal, pertanyaan, opsi, kunci)
     values ('2026-11-16', 'Soal uji?', '["a","b","c","d","e"]'::jsonb, 2)
     returning id`,
  )
).rows[0].id;

// ---------- SEBELUM v8: celah memang ada ----------
// (Membuktikan v8 menutup sesuatu yang nyata, bukan menutup
// pintu yang sudah tertutup.)
cek(
  "pra-v8: INSERT anon newsletter berhasil (celah T5)",
  await berhasilSebagai(
    "anon",
    `insert into public.pf_newsletter_subscribers (email) values ('pra-v8@contoh.id')`,
  ),
);
cek(
  "pra-v8: INSERT anon correction_reports berhasil (celah T5)",
  await berhasilSebagai(
    "anon",
    `insert into public.pf_correction_reports (artikel_id, jenis, pesan) values ($1, 'typo', 'uji')`,
    [artikelTerbitId],
  ),
);
cek(
  "pra-v8: INSERT anon questions berhasil (celah T5)",
  await berhasilSebagai(
    "anon",
    `insert into public.pf_questions (user_id, pertanyaan, jawaban, status) values (null, 'apa itu?', null, 'menunggu')`,
  ),
);
cek(
  "pra-v8: SELECT kunci kuis sebagai anon berhasil (celah T1-sisa)",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_quiz_questions where id = $1 and kunci = 2`,
    [soalKuisId],
  )) === 1,
);
cek(
  "pra-v8: SELECT pf_roles sebagai anon terlihat (celah T8)",
  (await hitungSebagai("anon", `select count(*) n from public.pf_roles`)) === 5,
);

// ---------- Migrasi v8 (2x, idempotensi) ----------
ok = await jalankan("v8 putaran 1", baca("20261116_pf_v8_expansion.sql"));
if (ok) ok = await jalankan("v8 putaran 2 (idempotensi)", baca("20261116_pf_v8_expansion.sql"));
if (!ok) {
  console.log("HASIL: MIGRASI v8 GAGAL");
  process.exit(1);
}

cek(
  "tabel pf_* = 37",
  (await hitung(
    `select count(*) n from pg_tables where schemaname='public' and tablename like 'pf_%'`,
  )) === 37,
  "36 (v1-v7) + 1 (v8: pf_user_preferences)",
);
cek(
  "RLS 37/37",
  (await hitung(
    `select count(*) n from pg_tables where schemaname='public' and tablename like 'pf_%' and rowsecurity`,
  )) === 37,
);
cek(
  "policy total = 79",
  (await hitung(
    `select count(*) n from pg_policies where schemaname='public' and tablename like 'pf_%'`,
  )) === 79,
  "79 (v1-v7) − 3 (T5) + 3 (pf_user_preferences)",
);
cek(
  "policy pf_user_preferences = 3",
  (await hitung(
    `select count(*) n from pg_policies where schemaname='public' and tablename='pf_user_preferences'`,
  )) === 3,
);
cek(
  "v8: tidak ada policy insert anonim tersisa di 3 tabel T5",
  (await hitung(
    `select count(*) n from pg_policies
     where schemaname='public'
       and tablename in ('pf_newsletter_subscribers','pf_correction_reports','pf_questions')
       and cmd = 'INSERT'`,
  )) === 0,
);

// ---------- SESUDAH v8: uji negatif T5 ----------
cek(
  "T5: INSERT anon newsletter DITOLAK sesudah v8",
  !(await berhasilSebagai(
    "anon",
    `insert into public.pf_newsletter_subscribers (email) values ('pasca-v8@contoh.id')`,
  )),
);
cek(
  "T5: INSERT anon correction_reports DITOLAK sesudah v8",
  !(await berhasilSebagai(
    "anon",
    `insert into public.pf_correction_reports (artikel_id, jenis, pesan) values ($1, 'typo', 'uji')`,
    [artikelTerbitId],
  )),
);
cek(
  "T5: INSERT anon questions DITOLAK sesudah v8",
  !(await berhasilSebagai(
    "anon",
    `insert into public.pf_questions (user_id, pertanyaan, jawaban, status) values (null, 'apa itu?', null, 'menunggu')`,
  )),
);

// ---------- SESUDAH v8: uji negatif T1-sisa ----------
cek(
  "T1-sisa: SELECT kunci sebagai anon DITOLAK sesudah v8",
  !(await berhasilSebagai(
    "anon",
    `select kunci from public.pf_quiz_questions where id = $1`,
    [soalKuisId],
  )),
);
cek(
  "T1-sisa: SELECT kunci sebagai authenticated DITOLAK sesudah v8",
  !(await berhasilSebagai(
    "authenticated",
    `select kunci from public.pf_quiz_questions where id = $1`,
    [soalKuisId],
  )),
);
cek(
  "T1-sisa: SELECT kolom non-kunci sebagai anon TETAP bisa",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_quiz_questions where id = $1`,
    [soalKuisId],
  )) === 1,
);

// ---------- SESUDAH v8: T8 ----------
cek(
  "T8: SELECT pf_roles sebagai anon = 0 baris",
  (await hitungSebagai("anon", `select count(*) n from public.pf_roles`)) === 0,
);
cek(
  "T8: SELECT pf_permissions sebagai anon = 0 baris",
  (await hitungSebagai("anon", `select count(*) n from public.pf_permissions`)) === 0,
);
cek(
  "T8: SELECT pf_role_permissions sebagai anon = 0 baris",
  (await hitungSebagai("anon", `select count(*) n from public.pf_role_permissions`)) === 0,
);

// article_sources / article_tags: terbit terlihat, draf tidak.
const sumberId = (
  await db.query(
    `insert into public.pf_sources (nama, jenis, url) values ('Sumber Uji', 'resmi', 'https://contoh.id/uji') returning id`,
  )
).rows[0].id;
await db.query(
  `insert into public.pf_article_sources (artikel_id, sumber_id, peran, kutipan) values ($1, $2, 'utama', 'kutipan uji')`,
  [artikelTerbitId, sumberId],
);
await db.query(
  `insert into public.pf_article_sources (artikel_id, sumber_id) values ($1, $2)`,
  [artikelDrafId, sumberId],
);
const tagId = (
  await db.query(
    `insert into public.pf_tags (slug, nama) values ('uji-tag', 'Uji Tag') returning id`,
  )
).rows[0].id;
await db.query(
  `insert into public.pf_article_tags (artikel_id, tag_id) values ($1, $2)`,
  [artikelTerbitId, tagId],
);
await db.query(
  `insert into public.pf_article_tags (artikel_id, tag_id) values ($1, $2)`,
  [artikelDrafId, tagId],
);
cek(
  "T8: article_sources artikel terbit terlihat anon",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_article_sources where artikel_id = $1`,
    [artikelTerbitId],
  )) === 1,
);
cek(
  "T8: article_sources artikel draf TIDAK terlihat anon",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_article_sources where artikel_id = $1`,
    [artikelDrafId],
  )) === 0,
);
cek(
  "T8: article_tags artikel terbit terlihat anon",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_article_tags where artikel_id = $1`,
    [artikelTerbitId],
  )) === 1,
);
cek(
  "T8: article_tags artikel draf TIDAK terlihat anon",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_article_tags where artikel_id = $1`,
    [artikelDrafId],
  )) === 0,
);

// ---------- SESUDAH v8: Area 1 (baca terbit) ----------
const klaimTerbitId = (
  await db.query(
    `insert into public.pf_claims (artikel_id, teks, jenis, status) values ($1, 'Klaim uji terbit', 'fakta', 'terverifikasi') returning id`,
    [artikelTerbitId],
  )
).rows[0].id;
await db.query(
  `insert into public.pf_evidence (klaim_id, sumber_url, arah, kutipan) values ($1, 'https://contoh.id/uji', 'mendukung', 'kutipan bukti')`,
  [klaimTerbitId],
);
await db.query(
  `insert into public.pf_verification_records (artikel_id, keputusan) values ($1, 'VERIFIED')`,
  [artikelTerbitId],
);
const klaimDrafId = (
  await db.query(
    `insert into public.pf_claims (artikel_id, teks) values ($1, 'Klaim uji draf') returning id`,
    [artikelDrafId],
  )
).rows[0].id;
cek(
  "Area 1: klaim artikel terbit terlihat anon",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_claims where artikel_id = $1`,
    [artikelTerbitId],
  )) === 1,
);
cek(
  "Area 1: klaim artikel draf TIDAK terlihat anon",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_claims where artikel_id = $1`,
    [artikelDrafId],
  )) === 0,
);
cek(
  "Area 1: evidence klaim terbit terlihat anon",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_evidence where klaim_id = $1`,
    [klaimTerbitId],
  )) === 1,
);
cek(
  "Area 1: evidence klaim draf TIDAK terlihat anon",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_evidence where klaim_id = $1`,
    [klaimDrafId],
  )) === 0,
);
cek(
  "Area 1: verification record artikel terbit terlihat anon",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_verification_records where artikel_id = $1`,
    [artikelTerbitId],
  )) === 1,
);
cek(
  "Area 1: verification record artikel draf TIDAK terlihat anon",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_verification_records where artikel_id = $1`,
    [artikelDrafId],
  )) === 0,
);

// ---------- CHECK enum D4 ----------
async function insertLolos(sql, params = []) {
  try {
    await db.query(sql, params);
    return true;
  } catch {
    return false;
  }
}
cek(
  "D4: audit aksi baru 'cerita.buat' diterima",
  await insertLolos(
    `insert into public.pf_audit_logs (aksi, entitas) values ('cerita.buat', 'cerita')`,
  ),
);
cek(
  "D4: audit aksi baru 'preferensi.ubah' diterima",
  await insertLolos(
    `insert into public.pf_audit_logs (aksi, entitas) values ('preferensi.ubah', 'preferensi')`,
  ),
);
cek(
  "D4: audit aksi baru 'ekspor.data' diterima",
  await insertLolos(
    `insert into public.pf_audit_logs (aksi, entitas) values ('ekspor.data', 'pengguna')`,
  ),
);
cek(
  "D4: audit aksi lama 'artikel.terbit' tetap diterima",
  await insertLolos(
    `insert into public.pf_audit_logs (aksi, entitas) values ('artikel.terbit', 'artikel')`,
  ),
);
cek(
  "D4: audit aksi bogus ditolak",
  !(await insertLolos(
    `insert into public.pf_audit_logs (aksi, entitas) values ('bogus.aksi', 'x')`,
  )),
);
cek(
  "D4: job 'digest' diterima",
  await insertLolos(
    `insert into public.pf_scheduled_jobs (nama, jadwal_cron) values ('digest', '0 6 * * *')`,
  ),
);
cek(
  "D4: job 'terbitkan-terjadwal' diterima",
  await insertLolos(
    `insert into public.pf_scheduled_jobs (nama, jadwal_cron) values ('terbitkan-terjadwal', '0 * * * *')`,
  ),
);
cek(
  "D4: job lama v5 (ingestion/editorial/brief) tetap ada",
  (await hitung(
    `select count(*) n from public.pf_scheduled_jobs where nama in ('ingestion','editorial','brief')`,
  )) === 3,
);
cek(
  "D4: job bogus ditolak",
  !(await insertLolos(
    `insert into public.pf_scheduled_jobs (nama, jadwal_cron) values ('bogus', '* * * * *')`,
  )),
);
cek(
  "D4: agen 'story_clustering' diterima",
  await insertLolos(
    `insert into public.pf_ai_runs (agen) values ('story_clustering')`,
  ),
);
cek(
  "D4: agen lama 'research' tetap diterima",
  await insertLolos(
    `insert into public.pf_ai_runs (agen) values ('research')`,
  ),
);
cek(
  "D4: agen bogus ditolak",
  !(await insertLolos(
    `insert into public.pf_ai_runs (agen) values ('bogus')`,
  )),
);

// ---------- D1 / D2 ----------
cek(
  "D1: opsi kuis 11 butir ditolak",
  !(await insertLolos(
    `insert into public.pf_quiz_questions (tanggal, pertanyaan, opsi, kunci)
     values ('2026-11-17', 'Soal?', '["a","b","c","d","e","f","g","h","i","j","k"]'::jsonb, 0)`,
  )),
);
cek(
  "D1: opsi kuis 0 butir ditolak",
  !(await insertLolos(
    `insert into public.pf_quiz_questions (tanggal, pertanyaan, opsi, kunci)
     values ('2026-11-17', 'Soal?', '[]'::jsonb, 0)`,
  )),
);
cek(
  "D1: opsi kuis 5 butir diterima",
  await insertLolos(
    `insert into public.pf_quiz_questions (tanggal, pertanyaan, opsi, kunci)
     values ('2026-11-17', 'Soal?', '["a","b","c","d","e"]'::jsonb, 0)`,
  ),
);
cek(
  "D2: event lintang 91 ditolak",
  !(await insertLolos(
    `insert into public.pf_events (judul, dimulai_pada, lintang, bujur)
     values ('Event uji', now(), 91, 100)`,
  )),
);
cek(
  "D2: event bujur 181 ditolak",
  !(await insertLolos(
    `insert into public.pf_events (judul, dimulai_pada, lintang, bujur)
     values ('Event uji', now(), -6, 181)`,
  )),
);
cek(
  "D2: event lintang -90 / bujur 180 diterima",
  await insertLolos(
    `insert into public.pf_events (judul, dimulai_pada, lintang, bujur)
     values ('Event uji', now(), -90, 180)`,
  ),
);
cek(
  "D2: artikel lintang 100 ditolak",
  !(await insertLolos(
    `update public.pf_articles set lintang = 100 where id = $1`,
    [artikelTerbitId],
  )),
);
cek(
  "D2: artikel lintang -6.2 diterima",
  await insertLolos(
    `update public.pf_articles set lintang = -6.2, bujur = 106.8 where id = $1`,
    [artikelTerbitId],
  ),
);

// ---------- pf_user_preferences (Area 7) ----------
const userUji = (
  await db.query(`select gen_random_uuid() as id`)
).rows[0].id;
await db.query(`insert into auth.users (id, email) values ($1, 'uji@contoh.id')`, [
  userUji,
]);
cek(
  "Area 7: insert preferensi diterima",
  await insertLolos(
    `insert into public.pf_user_preferences (user_id, digest_harian) values ($1, false)`,
    [userUji],
  ),
);
cek(
  "Area 7: preferensi duplikat per user ditolak (unique user_id)",
  !(await insertLolos(
    `insert into public.pf_user_preferences (user_id) values ($1)`,
    [userUji],
  )),
);
cek(
  "Area 7: kolom preferensi ada",
  (await hitung(
    `select count(*) n from information_schema.columns
     where table_schema='public' and table_name='pf_user_preferences'
       and column_name in ('digest_harian','notifikasi_topik','notifikasi_koreksi','tampilkan_profil_publik')`,
  )) === 4,
);

// ---------- Kolom pf_article_sources (Area 3) ----------
cek(
  "Area 3: kolom peran + kutipan ada di pf_article_sources",
  (await hitung(
    `select count(*) n from information_schema.columns
     where table_schema='public' and table_name='pf_article_sources'
       and column_name in ('peran','kutipan')`,
  )) === 2,
);
const sumberId2 = (
  await db.query(
    `insert into public.pf_sources (nama, jenis, url) values ('Sumber Uji 2', 'api', 'https://contoh.id/uji2') returning id`,
  )
).rows[0].id;
cek(
  "Area 3: peran 'bantahan' diterima",
  await insertLolos(
    `insert into public.pf_article_sources (artikel_id, sumber_id, peran) values ($1, $2, 'bantahan')`,
    [artikelTerbitId, sumberId2],
  ),
);
cek(
  "Area 3: peran bogus ditolak",
  !(await insertLolos(
    `insert into public.pf_article_sources (artikel_id, sumber_id, peran) values ($1, $2, 'bogus')`,
    [artikelDrafId, sumberId2],
  )),
);

// ---------- Perluasan pf_correction_reports (Area 13) ----------
cek(
  "Area 13: jenis baru 'duplikat' diterima",
  await insertLolos(
    `insert into public.pf_correction_reports (artikel_id, jenis, pesan, nomor_lacak) values ($1, 'duplikat', 'uji duplikat', 'PF-TEST0001')`,
    [artikelTerbitId],
  ),
);
cek(
  "Area 13: jenis baru 'perlu_pembaruan' diterima",
  await insertLolos(
    `insert into public.pf_correction_reports (artikel_id, jenis, pesan, nomor_lacak) values ($1, 'perlu_pembaruan', 'uji', 'PF-TEST0002')`,
    [artikelTerbitId],
  ),
);
cek(
  "Area 13: jenis lama 'typo' tetap diterima",
  await insertLolos(
    `insert into public.pf_correction_reports (artikel_id, jenis, pesan) values ($1, 'typo', 'uji')`,
    [artikelTerbitId],
  ),
);
cek(
  "Area 13: jenis bogus ditolak",
  !(await insertLolos(
    `insert into public.pf_correction_reports (artikel_id, jenis, pesan) values ($1, 'bogus', 'uji')`,
    [artikelTerbitId],
  )),
);
cek(
  "Area 13: laporan tanpa artikel_id diterima (nullable)",
  await insertLolos(
    `insert into public.pf_correction_reports (jenis, pesan, pelapor_email, nomor_lacak, tautan_artikel)
     values ('sumber_tidak_valid', 'uji tanpa artikel', 'uji@contoh.id', 'PF-TEST0003', 'https://contoh.id/artikel')`,
  ),
);
cek(
  "Area 13: nomor_lacak duplikat ditolak (unique)",
  !(await insertLolos(
    `insert into public.pf_correction_reports (jenis, pesan, nomor_lacak) values ('duplikat', 'uji', 'PF-TEST0001')`,
  )),
);
cek(
  "Area 13: kolom pelapor_email + tautan_artikel ada",
  (await hitung(
    `select count(*) n from information_schema.columns
     where table_schema='public' and table_name='pf_correction_reports'
       and column_name in ('pelapor_email','nomor_lacak','tautan_artikel')`,
  )) === 3,
);

// ---------- Pemeriksaan statis: patch T5 / T1-sisa ----------
const v8 = baca("20261116_pf_v8_expansion.sql");
cek(
  "v8: DROP POLICY ketiga policy insert anonim",
  v8.includes('drop policy if exists "pf_newsletter daftar publik"') &&
    v8.includes('drop policy if exists "pf_correction_reports kirim publik"') &&
    v8.includes('drop policy if exists "pf_questions tambah publik"'),
);
cek(
  "v8: pf_roles Opsi A (auth.uid() is not null)",
  v8.includes("using (auth.uid() is not null)"),
);
cek(
  "v8: T1-sisa cabut SELECT tabel + GRANT per kolom tanpa kunci",
  v8.includes("revoke select on public.pf_quiz_questions from anon, authenticated") &&
    v8.includes("grant select (id, tanggal, pertanyaan, opsi, penjelasan, sumber_url, sumber_nama, artikel_id, dibuat_pada)") &&
    !v8.includes("revoke select (kunci)"),
);
for (const [relatif, nama] of [
  ["src/app/api/langganan/route.ts", "langganan"],
  ["src/app/api/laporan/route.ts", "laporan"],
  ["src/app/api/tanya/route.ts", "tanya"],
]) {
  const src = bacaRepo(relatif);
  cek(
    `T5: ${nama} memakai createServiceClient untuk insert`,
    src.includes("createServiceClient") && src.includes("service"),
  );
  cek(
    `T5: ${nama} 503 jujur bila service key belum ada`,
    src.includes("kunci layanan belum diatur") && src.includes("503"),
  );
}
const jawabSrc = bacaRepo("src/app/api/kuis/jawab/route.ts");
cek(
  "T1-sisa: /api/kuis/jawab membaca kunci via service role",
  jawabSrc.includes("createServiceClient") &&
    jawabSrc.includes("service") &&
    !jawabSrc.includes("createClient()"),
);
cek(
  "T1-sisa: getKuisHarian memakai service bila ada",
  bacaRepo("src/lib/lanjutan.ts").includes("cobaServiceClient()"),
);

// ---------- Pemeriksaan statis: desain G1/G2/G3 ----------
cek(
  "G1: data/page.tsx memakai var(--accent) tanpa fallback hex",
  !bacaRepo("src/app/data/page.tsx").includes("--aksen") &&
    bacaRepo("src/app/data/page.tsx").includes('var(--accent)'),
);
cek(
  "G1: PembacaSuara.module.css memakai --border/--surface",
  !bacaRepo("src/components/artikel/PembacaSuara.module.css").includes("--garis") &&
    !bacaRepo("src/components/artikel/PembacaSuara.module.css").includes("--latar-kartu") &&
    bacaRepo("src/components/artikel/PembacaSuara.module.css").includes("var(--border)") &&
    bacaRepo("src/components/artikel/PembacaSuara.module.css").includes("var(--surface)"),
);
cek(
  "G1: PetaDunia.module.css memakai --border/--surface-2 tanpa hex",
  !bacaRepo("src/components/peta/PetaDunia.module.css").includes("--garis") &&
    !bacaRepo("src/components/peta/PetaDunia.module.css").includes("#eef2f5") &&
    bacaRepo("src/components/peta/PetaDunia.module.css").includes("var(--surface-2)"),
);
cek(
  "G2: PetaDunia memakai kelas .pf-pin (token, tanpa hex di string)",
  bacaRepo("src/components/peta/PetaDunia.tsx").includes('class="pf-pin"') &&
    !bacaRepo("src/components/peta/PetaDunia.tsx").includes("#b91c1c"),
);
cek(
  "G2: globals.css mendefinisikan .pf-pin dengan var(--danger)",
  bacaRepo("src/app/globals.css").includes(".pf-pin") &&
    bacaRepo("src/app/globals.css").includes("background: var(--danger)"),
);
cek(
  "G3: token mati --navy dan --muted-token dihapus",
  !bacaRepo("src/app/globals.css").includes("--navy:") &&
    !bacaRepo("src/app/globals.css").includes("--muted-token:"),
);

// ---------- Pemeriksaan statis: berkas Area 1/3/13/7 ----------
for (const relatif of [
  "src/components/artikel/JejakFakta.tsx",
  "src/components/artikel/PerbandinganSumber.tsx",
  "src/components/laporan/FormLaporanPublik.tsx",
  "src/components/saya/FormPengaturan.tsx",
  "src/app/laporkan/page.tsx",
  "src/app/laporkan/lacak/page.tsx",
  "src/app/saya/page.tsx",
  "src/app/saya/pengaturan/page.tsx",
  "src/app/api/laporan-publik/route.ts",
  "src/app/api/saya/preferensi/route.ts",
  "src/app/api/saya/ekspor/route.ts",
  "src/lib/laporan.ts",
]) {
  cek(`berkas ada: ${relatif}`, fs.existsSync(`${DIR_REPO}/${relatif}`));
}
cek(
  "Area 1: getJejakFakta diekspor di lib/data.ts",
  bacaRepo("src/lib/data.ts").includes("export async function getJejakFakta"),
);
cek(
  "Area 3: getPerbandinganSumber diekspor di lib/data.ts",
  bacaRepo("src/lib/data.ts").includes("export async function getPerbandinganSumber"),
);
cek(
  "Area 3: tanpa kesetaraan palsu (tanpa_bukti + belum_diketahui)",
  bacaRepo("src/lib/data.ts").includes('"tanpa_bukti"') &&
    bacaRepo("src/lib/data.ts").includes('"belum_diketahui"'),
);
cek(
  "Area 7: getRingkasanSaya + hitungStreakKuis diekspor di lib/lanjutan.ts",
  bacaRepo("src/lib/lanjutan.ts").includes("export async function getRingkasanSaya") &&
    bacaRepo("src/lib/lanjutan.ts").includes("export function hitungStreakKuis"),
);
cek(
  "Area 1+3: halaman artikel memakai JejakFakta + PerbandinganSumber",
  bacaRepo("src/app/artikel/[slug]/page.tsx").includes("<JejakFakta") &&
    bacaRepo("src/app/artikel/[slug]/page.tsx").includes("<PerbandinganSumber"),
);
cek(
  "Area 13: /api/laporan-publik TIDAK mengembalikan data pelapor",
  bacaRepo("src/app/api/laporan-publik/route.ts").includes("TANPA data pelapor") &&
    !/laporan:\s*\{[^}]*pelapor_email/.test(
      bacaRepo("src/app/api/laporan-publik/route.ts"),
    ),
);
cek(
  "Area 13: admin koreksi punya filter jenis",
  bacaRepo("src/app/admin/koreksi/page.tsx").includes("JENIS_KOREKSI") &&
    bacaRepo("src/lib/admin/data.ts").includes("jenis?: string"),
);
cek(
  "Area 7: /profil menautkan Dasbor Saya",
  bacaRepo("src/app/profil/page.tsx").includes('href="/saya"'),
);
cek(
  "Area 7: Header menautkan /saya; navigasi menautkan /laporkan",
  bacaRepo("src/components/Header.tsx").includes('href="/saya"') &&
    bacaRepo("src/components/Header.tsx").includes('href="/laporkan"'),
);
cek(
  "D3: validasiTarget diekspor di /api/topik",
  bacaRepo("src/app/api/topik/route.ts").includes("export function validasiTarget"),
);

// ---------- Uji fungsi murni: hitungStreakKuis ----------
const lanjutanSrc = bacaRepo("src/lib/lanjutan.ts");
const fnGeser = /function geserTanggal\([\s\S]*?\n\}/.exec(lanjutanSrc)?.[0];
const fnStreak = /export function hitungStreakKuis\([\s\S]*?\n\}/.exec(lanjutanSrc)?.[0];
cek("hitungStreakKuis dapat diekstrak dari sumber", Boolean(fnGeser && fnStreak));
if (fnGeser && fnStreak) {
  const hitungStreak = new Function(
    transpileKeJs(
      `${fnGeser}\n${fnStreak.replace("export function", "function")}\nreturn hitungStreakKuis;`,
    ),
  )();
  cek("streak: 3 hari beruntun", hitungStreak(["2026-11-16", "2026-11-15", "2026-11-14"], "2026-11-16") === 3);
  cek("streak: hari ini saja = 1", hitungStreak(["2026-11-16"], "2026-11-16") === 1);
  cek("streak: kemarin saja = 1", hitungStreak(["2026-11-15"], "2026-11-16") === 1);
  cek("streak: terakhir 2 hari lalu = 0", hitungStreak(["2026-11-14"], "2026-11-16") === 0);
  cek("streak: bolong di tengah = 1", hitungStreak(["2026-11-16", "2026-11-14"], "2026-11-16") === 1);
  cek("streak: kosong = 0", hitungStreak([], "2026-11-16") === 0);
}

// ---------- Uji fungsi murni: validasiTarget ----------
const topikSrc = bacaRepo("src/app/api/topik/route.ts");
const fnValidasi = /export function validasiTarget\([\s\S]*?\n\}/.exec(topikSrc)?.[0];
cek("validasiTarget dapat diekstrak dari sumber", Boolean(fnValidasi));
if (fnValidasi) {
  const validasi = new Function(
    transpileKeJs(
      `const TIPE_VALID = ["kategori", "negara", "isu"];
       const KATEGORI_UTAMA = [{ slug: "indonesia" }, { slug: "dunia" }];
       ${fnValidasi.replace("export function", "function")}
       return validasiTarget;`,
    ),
  )();
  cek("D3: kategori dikenal diterima", validasi("kategori", "indonesia") === null);
  cek("D3: kategori asing ditolak", validasi("kategori", "tidak-ada") !== null);
  cek("D3: negara huruf diterima", validasi("negara", "Indonesia") === null);
  cek("D3: negara berangka ditolak", validasi("negara", "Ind0nesia") !== null);
  cek("D3: isu ber-URL ditolak", validasi("isu", "https://contoh.id") !== null);
  cek("D3: tipe bogus ditolak", validasi("bogus", "Indonesia") !== null);
}

// ---------- Uji fungsi murni: nomor lacak ----------
const laporanSrc = bacaRepo("src/lib/laporan.ts");
const fnNomor = /export function buatNomorLacak\(\)[\s\S]*?\n\}/.exec(laporanSrc)?.[0];
const fnNomorValid = /export function nomorLacakValid\([\s\S]*?\n\}/.exec(laporanSrc)?.[0];
const konstantaPola = /const POLA_NOMOR_LACAK = [^;]+;/.exec(laporanSrc)?.[0];
cek("buatNomorLacak + nomorLacakValid dapat diekstrak", Boolean(fnNomor && fnNomorValid && konstantaPola));
if (fnNomor && fnNomorValid && konstantaPola) {
  const { buatNomorLacak: buat, nomorLacakValid: valid } = new Function(
    transpileKeJs(
      `${fnNomor.replace("export function", "function")}\n${konstantaPola}\n${fnNomorValid.replace("export function", "function")}\nreturn { buatNomorLacak, nomorLacakValid };`,
    ),
  )();
  const n1 = buat();
  const n2 = buat();
  cek("nomor lacak format PF-XXXXXXXX", /^PF-[A-Z0-9]{8}$/.test(n1), n1);
  cek("nomor lacak acak (dua panggilan berbeda)", n1 !== n2, `${n1} vs ${n2}`);
  cek("nomorLacakValid menerima format benar", valid("PF-ABCDEFG1") === true);
  cek("nomorLacakValid menolak format salah", valid("PF-abc") === false && valid("XX-ABCDEFG1") === false);
}

// ---------- Ringkasan ----------
console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
if (gagal > 0) {
  console.log("HASIL: ADA KEGAGALAN");
  process.exit(1);
}
