// Uji Fase 8 Gelombang 2 — Area 14 (Advanced Admin Control Center)
// PRATA FAKTA -> PGlite + pemeriksaan statis.
// Menerapkan v1–v10 dua kali (idempotensi) TANPA blanket grant
// (pelajaran F4), lalu memeriksa:
//   (1) 53 tabel / RLS 53/53 / policy 106;
//   (2) pf_system_settings staf-only: anon = 0, authenticated
//       tanpa peran = 0, super_admin = 1, editor = 1;
//   (3) agregat dashboard dari DATA SEED NYATA (bukan angka
//       karangan): ingestion_runs, antrean raw_items, klaster
//       rantai salinan (akar 1 vs salinan 2), agregat
//       verification_records per keputusan, run AI per agen
//       (termasuk editorial_quality lolos/gagal dari detail
//       jsonb), duplikat, laporan pengguna, kinerja baca
//       (artikel paling dibaca), job scheduler (seed 3 + 2
//       baris tambahan yang diizinkan CHECK v8), ekspor audit;
//   (4) pemeriksaan statis: semua berkas Area 14 ada, nav admin
//       memuat ke-19 tautan Gelombang 2 dalam grup
//       Konten/Kendali/Monitoring, ketiga route kendali memakai
//       guard super_admin, pemicu manual memanggil route internal
//       yang sudah ada (TANPA duplikasi logika engine/pipeline),
//       aksi audit 'sistem.flag'/'sistem.job' ada di CHECK v8/v9,
//       halaman analitik jujur "Belum tersedia" tanpa angka palsu,
//       dan fungsi selCsv meng-escape kutip dengan benar.
// Yang TIDAK diuji di sini (dilaporkan sebagai belum diuji):
// render live, klik browser, pemicu job manual live (butuh
// server Next + service key + sesi super_admin nyata), dan
// guard route pada level HTTP (butuh sesi penuh).
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

// ---------- Setup PGlite ----------
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

// Terapkan v1–v10 dua kali (idempotensi, TANPA blanket grant).
for (const putaran of [1, 2]) {
  for (const nama of MIGRASI) {
    const ok = await jalankan(`migrasi ${nama} (putaran ${putaran})`, baca(nama));
    if (!ok) process.exit(1);
  }
}

cek(
  "jumlah tabel pf_* = 53",
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
  "jumlah policy pf_* = 106",
  (await hitung(
    `select count(*) n from pg_policies where schemaname='public' and tablename like 'pf_%'`,
  )) === 106,
);

// ---------- Pengguna uji + peran ----------
const UID_SUPER = "11111111-1111-1111-1111-111111111111";
const UID_EDITOR = "22222222-2222-2222-2222-222222222222";
const UID_BIASA = "33333333-3333-3333-3333-333333333333";
await db.query(
  `insert into auth.users (id, email) values ($1, 'super@uji.id'), ($2, 'editor@uji.id'), ($3, 'biasa@uji.id')`,
  [UID_SUPER, UID_EDITOR, UID_BIASA],
);
async function beriPeran(uid, namaPeran) {
  const r = await db.query(
    `select id from public.pf_roles where nama = $1`,
    [namaPeran],
  );
  await db.query(
    `insert into public.pf_user_roles (user_id, role_id) values ($1, $2)`,
    [uid, r.rows[0].id],
  );
}
await beriPeran(UID_SUPER, "super_admin");
await beriPeran(UID_EDITOR, "editor");
cek(
  "pf_has_role('super_admin') benar untuk super_admin",
  (await sebagaiUid("authenticated", UID_SUPER, `select public.pf_has_role('super_admin') as v`)).rows[0].v === true,
);
cek(
  "pf_has_role('super_admin') salah untuk editor",
  (await sebagaiUid("authenticated", UID_EDITOR, `select public.pf_has_role('super_admin') as v`)).rows[0].v === false,
);

// ---------- Seed data nyata (service role = superuser PGlite) ----------
// Flag sistem (1 baris).
await db.query(
  `insert into public.pf_system_settings (kunci, nilai, deskripsi)
   values ('mode_pemeliharaan', '{"nilai": false}'::jsonb, 'Mode pemeliharaan.')`,
);
// Artikel terbit + draf (kinerja + antrean verifikasi).
const artikelAId = (
  await db.query(
    `insert into public.pf_articles (slug, judul, kategori_slug, status, status_verifikasi)
     values ('art-a', 'Artikel A Paling Dibaca', 'indonesia', 'terbit', 'VERIFIED') returning id`,
  )
).rows[0].id;
const artikelBId = (
  await db.query(
    `insert into public.pf_articles (slug, judul, kategori_slug, status, status_verifikasi)
     values ('art-b', 'Artikel B Menunggu', 'dunia', 'draft', 'UNCONFIRMED') returning id`,
  )
).rows[0].id;
await db.query(
  `insert into public.pf_articles (slug, judul, kategori_slug, status, status_verifikasi)
   values ('art-c', 'Artikel C Disengketakan', 'dunia', 'draft', 'DISPUTED')`,
);
// Sumber + ingestion runs (2 run: 1 selesai, 1 gagal).
const sumberId = (
  await db.query(
    `insert into public.pf_sources (nama, jenis, url) values ('Sumber Uji', 'rss', 'https://contoh.id/rss') returning id`,
  )
).rows[0].id;
await db.query(
  `insert into public.pf_ingestion_runs (sumber_id, sumber_nama, status, ditemukan, baru, duplikat, gagal, dipicu_oleh)
   values ($1, 'Sumber Uji', 'selesai', 10, 7, 2, 0, 'manual')`,
  [sumberId],
);
await db.query(
  `insert into public.pf_ingestion_runs (sumber_id, sumber_nama, status, ditemukan, baru, duplikat, gagal, error, dipicu_oleh)
   values ($1, 'Sumber Uji', 'gagal', 0, 0, 0, 1, 'timeout', 'jadwal')`,
  [sumberId],
);
// Raw items: 1 akar + 2 salinan (rantai) + 1 baru + 1 duplikat + 1 diterbitkan_ulang.
const rawAkarId = (
  await db.query(
    `insert into public.pf_raw_items (sumber_id, url, hash_url, judul, hash_judul, status)
     values ($1, 'https://contoh.id/akar', 'h-akar', 'Berita Akar', 'hj-akar', 'baru') returning id`,
    [sumberId],
  )
).rows[0].id;
const rawSalin1Id = (
  await db.query(
    `insert into public.pf_raw_items (sumber_id, url, hash_url, judul, hash_judul, disalin_dari_id, status)
     values ($1, 'https://contoh.id/salin1', 'h-salin1', 'Berita Salinan 1', 'hj-salin1', $2, 'disalin_dari') returning id`,
    [sumberId, rawAkarId],
  )
).rows[0].id;
await db.query(
  `insert into public.pf_raw_items (sumber_id, url, hash_url, judul, hash_judul, disalin_dari_id, status)
   values ($1, 'https://contoh.id/salin2', 'h-salin2', 'Berita Salinan 2', 'hj-salin2', $2, 'disalin_dari')`,
  [sumberId, rawSalin1Id],
);
await db.query(
  `insert into public.pf_raw_items (sumber_id, url, hash_url, judul, hash_judul, status)
   values ($1, 'https://contoh.id/baru', 'h-baru', 'Berita Baru', 'hj-baru', 'baru')`,
  [sumberId],
);
await db.query(
  `insert into public.pf_raw_items (sumber_id, url, hash_url, judul, hash_judul, status)
   values ($1, 'https://contoh.id/dup', 'h-dup', 'Berita Duplikat', 'hj-dup', 'duplikat')`,
  [sumberId],
);
await db.query(
  `insert into public.pf_raw_items (sumber_id, url, hash_url, judul, hash_judul, status, diterbitkan_ulang)
   values ($1, 'https://contoh.id/ulang', 'h-ulang', 'Berita Terbit Ulang', 'hj-ulang', 'baru', true)`,
  [sumberId],
);
// Verification records: VERIFIED x2, CROSS-CHECKED x1, UNCONFIRMED x1, DISPUTED x1.
for (const [artikel, keputusan] of [
  [artikelAId, "VERIFIED"],
  [artikelAId, "VERIFIED"],
  [artikelAId, "CROSS-CHECKED"],
  [artikelBId, "UNCONFIRMED"],
  [artikelBId, "DISPUTED"],
]) {
  await db.query(
    `insert into public.pf_verification_records (artikel_id, keputusan, agen) values ($1, $2, 'fact_verification')`,
    [artikel, keputusan],
  );
}
// AI runs: research x2 (1 berhasil, 1 gagal), editorial_quality x2
// (lolos true + lolos false), daily_brief x1.
await db.query(
  `insert into public.pf_ai_runs (agen, status, dipicu_oleh) values
   ('research', 'berhasil', 'manual'),
   ('research', 'gagal', 'jadwal'),
   ('daily_brief', 'berhasil', 'jadwal')`,
);
await db.query(
  `insert into public.pf_ai_runs (agen, input_ref, status, detail, dipicu_oleh)
   values ('editorial_quality', $1, 'berhasil', '{"lolos": true, "kegagalan": [], "siap_review": true}'::jsonb, 'manual')`,
  [artikelAId],
);
await db.query(
  `insert into public.pf_ai_runs (agen, input_ref, status, detail, dipicu_oleh)
   values ('editorial_quality', $1, 'berhasil', '{"lolos": false, "kegagalan": ["judul terlalu pendek"], "siap_review": false}'::jsonb, 'manual')`,
  [artikelBId],
);
// Laporan pengguna: 2 baru (duplikat + kesalahan_informasi), 1 ditinjau.
await db.query(
  `insert into public.pf_correction_reports (artikel_id, jenis, pesan, status, nomor_lacak)
   values ($1, 'duplikat', 'laporan duplikat', 'baru', 'PF-UJI0001')`,
  [artikelAId],
);
await db.query(
  `insert into public.pf_correction_reports (jenis, pesan, status, nomor_lacak, pelapor_email)
   values ('kesalahan_informasi', 'laporan tanpa artikel', 'baru', 'PF-UJI0002', 'pelapor@contoh.id')`,
);
await db.query(
  `insert into public.pf_correction_reports (artikel_id, jenis, pesan, status)
   values ($1, 'typo', 'laporan ditinjau', 'ditinjau')`,
  [artikelAId],
);
// Riwayat baca: Artikel A dibaca 3x (2 selesai, 2 pembaca), Artikel B 1x.
await db.query(
  `insert into public.pf_reading_history (user_id, artikel_id, selesai) values
   ($1, $2, true), ($1, $2, false), ($3, $2, true), ($1, $4, false)`,
  [UID_SUPER, artikelAId, UID_EDITOR, artikelBId],
);
// Audit log: 2 baris (sistem.flag + sistem.job).
await db.query(
  `insert into public.pf_audit_logs (aktor_id, aktor_email, aksi, entitas, entitas_id)
   values ($1, 'super@uji.id', 'sistem.flag', 'pf_system_settings', 'mode_pemeliharaan'),
          ($1, 'super@uji.id', 'sistem.job', 'pf_scheduled_jobs', 'ingestion')`,
  [UID_SUPER],
);
// Job tambahan yang diizinkan CHECK v8 (seed v5 hanya 3).
await db.query(
  `insert into public.pf_scheduled_jobs (nama, jadwal_cron, deskripsi, aktif, terakhir_jalan, status_terakhir)
   values ('data-analysis', '0 1 * * 1', 'Analisis data mingguan', true, now(), 'berhasil'),
          ('terbitkan-terjadwal', '0 * * * *', 'Terbitkan terjadwal tiap jam', true, null, 'belum_pernah')`,
);

// ---------- (2) pf_system_settings staf-only ----------
cek(
  "settings: anon = 0 baris (staf-only)",
  (await hitungSebagai("anon", `select count(*) n from public.pf_system_settings`)) === 0,
);
cek(
  "settings: authenticated tanpa peran = 0 baris",
  (await hitungSebagaiUid("authenticated", UID_BIASA, `select count(*) n from public.pf_system_settings`)) === 0,
);
cek(
  "settings: super_admin = 1 baris",
  (await hitungSebagaiUid("authenticated", UID_SUPER, `select count(*) n from public.pf_system_settings`)) === 1,
);
cek(
  "settings: editor = 1 baris (policy staf mencakup editor)",
  (await hitungSebagaiUid("authenticated", UID_EDITOR, `select count(*) n from public.pf_system_settings`)) === 1,
);
cek(
  "settings: kunci flag mode_pemeliharaan terbaca super_admin",
  (await sebagaiUid("authenticated", UID_SUPER, `select kunci from public.pf_system_settings`)).rows[0].kunci === "mode_pemeliharaan",
);

// ---------- (3) Agregat dashboard dari data seed nyata ----------
// Monitoring: 2 run ingestion (1 selesai, 1 gagal).
cek(
  "monitoring: run ingestion = 2",
  (await hitung(`select count(*) n from public.pf_ingestion_runs`)) === 2,
);
cek(
  "monitoring: run selesai = 1, gagal = 1",
  (await hitung(`select count(*) n from public.pf_ingestion_runs where status = 'selesai'`)) === 1 &&
    (await hitung(`select count(*) n from public.pf_ingestion_runs where status = 'gagal'`)) === 1,
);
cek(
  "monitoring: antrean baru = 3 (akar + baru + terbit-ulang)",
  (await hitung(`select count(*) n from public.pf_raw_items where status = 'baru'`)) === 3,
);
cek(
  "monitoring: antrean disalin_dari = 2",
  (await hitung(`select count(*) n from public.pf_raw_items where status = 'disalin_dari'`)) === 2,
);
cek(
  "monitoring: antrean duplikat = 1",
  (await hitung(`select count(*) n from public.pf_raw_items where status = 'duplikat'`)) === 1,
);
// Klaster: 2 salinan berantai ke 1 akar (RPC v9 ASLI).
const akarSalin2 = (
  await sebagai(
    "anon",
    `select * from public.pf_akar_salinan($1, $2)`,
    [artikelAId, ["https://contoh.id/salin2"]],
  )
).rows[0];
cek(
  "klaster: salinan ke-2 berakar ke item akar (bukan ke salinan-1)",
  Boolean(akarSalin2 && akarSalin2.akar_id === rawAkarId && akarSalin2.disalin === true),
  akarSalin2 ? `akar=${akarSalin2.akar_id === rawAkarId}` : "0 baris",
);
cek(
  "klaster: 2 salinan punya 1 akar berbeda (1 independen, bukan 2)",
  (await hitung(
    `select count(distinct disalin_dari_id) n from public.pf_raw_items where status = 'disalin_dari'`,
  )) === 2 &&
    (await hitung(
      `select count(*) n from public.pf_raw_items where id = $1`,
      [rawAkarId],
    )) === 1,
);
// Verifikasi: agregat per keputusan.
cek(
  "verifikasi: VERIFIED = 2",
  (await hitung(`select count(*) n from public.pf_verification_records where keputusan = 'VERIFIED'`)) === 2,
);
cek(
  "verifikasi: CROSS-CHECKED = 1, UNCONFIRMED = 1, DISPUTED = 1",
  (await hitung(`select count(*) n from public.pf_verification_records where keputusan = 'CROSS-CHECKED'`)) === 1 &&
    (await hitung(`select count(*) n from public.pf_verification_records where keputusan = 'UNCONFIRMED'`)) === 1 &&
    (await hitung(`select count(*) n from public.pf_verification_records where keputusan = 'DISPUTED'`)) === 1,
);
cek(
  "verifikasi: antrean review (UNCONFIRMED/DISPUTED) = 2 artikel",
  (await hitung(
    `select count(*) n from public.pf_articles where status_verifikasi in ('UNCONFIRMED','DISPUTED')`,
  )) === 2,
);
// Agen AI: per agen.
cek(
  "agen-ai: research = 2 (1 berhasil, 1 gagal)",
  (await hitung(`select count(*) n from public.pf_ai_runs where agen = 'research'`)) === 2 &&
    (await hitung(`select count(*) n from public.pf_ai_runs where agen = 'research' and status = 'gagal'`)) === 1,
);
cek(
  "agen-ai: daily_brief = 1",
  (await hitung(`select count(*) n from public.pf_ai_runs where agen = 'daily_brief'`)) === 1,
);
cek(
  "agen-ai: story_clustering = 0 (belum pernah berjalan)",
  (await hitung(`select count(*) n from public.pf_ai_runs where agen = 'story_clustering'`)) === 0,
);
// Kualitas: detail jsonb editorial_quality.
cek(
  "kualitas: editorial_quality = 2 run",
  (await hitung(`select count(*) n from public.pf_ai_runs where agen = 'editorial_quality'`)) === 2,
);
cek(
  "kualitas: lolos = 1, tidak lolos = 1 (dari detail jsonb)",
  (await hitung(`select count(*) n from public.pf_ai_runs where agen = 'editorial_quality' and detail->>'lolos' = 'true'`)) === 1 &&
    (await hitung(`select count(*) n from public.pf_ai_runs where agen = 'editorial_quality' and detail->>'lolos' = 'false'`)) === 1,
);
cek(
  "kualitas: kegagalan terbaca ('judul terlalu pendek')",
  (await hitung(
    `select count(*) n from public.pf_ai_runs where agen = 'editorial_quality' and detail->'kegagalan' @> '"judul terlalu pendek"'::jsonb`,
  )) === 1,
);
// Duplikat.
cek(
  "duplikat: diterbitkan_ulang = 1",
  (await hitung(`select count(*) n from public.pf_raw_items where diterbitkan_ulang = true`)) === 1,
);
cek(
  "duplikat: daftar (disalin/duplikat/ulang) = 4 baris",
  (await hitung(
    `select count(*) n from public.pf_raw_items where status in ('disalin_dari','duplikat') or diterbitkan_ulang = true`,
  )) === 4,
);
// Laporan pengguna.
cek(
  "laporan: total = 3 (baru 2, ditinjau 1)",
  (await hitung(`select count(*) n from public.pf_correction_reports`)) === 3 &&
    (await hitung(`select count(*) n from public.pf_correction_reports where status = 'baru'`)) === 2,
);
cek(
  "laporan: tanpa artikel_id = 1 (laporan umum)",
  (await hitung(`select count(*) n from public.pf_correction_reports where artikel_id is null`)) === 1,
);
// Kinerja: artikel paling dibaca.
cek(
  "kinerja: total baca = 4",
  (await hitung(`select count(*) n from public.pf_reading_history`)) === 4,
);
cek(
  "kinerja: Artikel A paling dibaca (3x) vs B (1x)",
  (await hitung(`select count(*) n from public.pf_reading_history where artikel_id = $1`, [artikelAId])) === 3 &&
    (await hitung(`select count(*) n from public.pf_reading_history where artikel_id = $1`, [artikelBId])) === 1,
);
cek(
  "kinerja: selesai dibaca = 2, pembaca unik = 2",
  (await hitung(`select count(*) n from public.pf_reading_history where selesai = true`)) === 2 &&
    (await hitung(`select count(distinct user_id) n from public.pf_reading_history`)) === 2,
);
// Scheduler: seed 3 + 2 tambahan.
cek(
  "scheduler: job tercatat = 5 (seed 3 + data-analysis + terbitkan-terjadwal)",
  (await hitung(`select count(*) n from public.pf_scheduled_jobs`)) === 5,
);
cek(
  "scheduler: digest/podcast/riset belum tercatat (F7)",
  (await hitung(
    `select count(*) n from public.pf_scheduled_jobs where nama in ('digest','podcast','riset')`,
  )) === 0,
);
cek(
  "scheduler: data-analysis terakhir_jalan terisi; terbitkan-terjadwal belum pernah jalan",
  (await hitung(
    `select count(*) n from public.pf_scheduled_jobs where nama = 'data-analysis' and terakhir_jalan is not null`,
  )) === 1 &&
    (await hitung(
      `select count(*) n from public.pf_scheduled_jobs where nama = 'terbitkan-terjadwal' and status_terakhir = 'belum_pernah'`,
    )) === 1,
);
// Audit: aksi kendali tercatat + CHECK v9 menerima keduanya.
cek(
  "audit: sistem.flag + sistem.job tercatat",
  (await hitung(`select count(*) n from public.pf_audit_logs where aksi in ('sistem.flag','sistem.job')`)) === 2,
);
const duaAuditTerbaru = (
  await db.query(
    `select aksi from public.pf_audit_logs order by dibuat_pada desc, aksi limit 2`,
  )
).rows.map((r) => r.aksi);
cek(
  "audit: ekspor CSV — 2 baris terbaru memuat sistem.flag + sistem.job",
  duaAuditTerbaru.includes("sistem.flag") &&
    duaAuditTerbaru.includes("sistem.job"),
  duaAuditTerbaru.join(", "),
);

// ---------- (4) Pemeriksaan statis ----------
for (const relatif of [
  "src/lib/admin/kendali.ts",
  "src/components/admin/FormFlag.tsx",
  "src/app/admin/kendali/page.tsx",
  "src/app/api/admin/kendali/flags/route.ts",
  "src/app/api/admin/kendali/jalankan/route.ts",
  "src/app/api/admin/kendali/ekspor-audit/route.ts",
  "src/app/admin/monitoring/page.tsx",
  "src/app/admin/klaster/page.tsx",
  "src/app/admin/verifikasi/page.tsx",
  "src/app/admin/agen-ai/page.tsx",
  "src/app/admin/duplikat/page.tsx",
  "src/app/admin/kualitas/page.tsx",
  "src/app/admin/laporan-pengguna/page.tsx",
  "src/app/admin/kinerja/page.tsx",
  "src/app/admin/api-sehat/page.tsx",
  "src/app/admin/analitik/page.tsx",
]) {
  cek(`berkas ada: ${relatif}`, fs.existsSync(`${DIR_REPO}/${relatif}`));
}

// Nav admin tinggal di NavAdmin.tsx (F-S6, Gelombang B1): layout
// hanya me-render <NavAdmin />. Periksa sumber kebenaran nav di
// sana, plus layout benar-benar memakainya.
const layout = bacaRepo("src/components/admin/NavAdmin.tsx");
cek(
  "layout: admin/layout.tsx me-render <NavAdmin />",
  bacaRepo("src/app/admin/layout.tsx").includes("<NavAdmin />"),
);
const TAUTAN_GEL2 = [
  "/admin/event", "/admin/pengetahuan", "/admin/akademi", "/admin/riset",
  "/admin/data", "/admin/negara", "/admin/tanya", "/admin/podcast",
  "/admin/kendali", "/admin/monitoring", "/admin/klaster",
  "/admin/verifikasi", "/admin/agen-ai", "/admin/duplikat",
  "/admin/kualitas", "/admin/laporan-pengguna", "/admin/kinerja",
  "/admin/api-sehat", "/admin/analitik",
];
cek(
  "layout: ke-19 tautan Gelombang 2 ada di nav",
  TAUTAN_GEL2.every((t) => layout.includes(`"${t}"`)),
  `kurang: ${TAUTAN_GEL2.filter((t) => !layout.includes(`"${t}"`)).join(", ") || "tidak ada"}`,
);
cek(
  "layout: nav dikelompokkan Konten / Kendali / Monitoring",
  layout.includes('"Konten"') &&
    layout.includes('"Kendali"') &&
    layout.includes('"Monitoring"'),
);
cek(
  "layout: tautan lama (Overview/Artikel/Sistem/Audit) tetap ada",
  layout.includes('"/admin"') &&
    layout.includes('"/admin/artikel"') &&
    layout.includes('"/admin/sistem"') &&
    layout.includes('"/admin/audit"'),
);

const kendali = bacaRepo("src/lib/admin/kendali.ts");
cek(
  "kendali: whitelist DAFTAR_FLAG ada (5 flag)",
  kendali.includes("DAFTAR_FLAG") &&
    ["mode_pemeliharaan", "pengumuman_pemeliharaan", "ingestion_aktif", "pipeline_editorial_aktif", "pendaftaran_terbuka"].every(
      (k) => kendali.includes(`"${k}"`),
    ),
);
cek(
  "kendali: setFlag menolak kunci di luar whitelist",
  kendali.includes("tidak dikenal"),
);
cek(
  "kendali: pemicu memanggil route internal yang sudah ada (5 route)",
  ["/api/ingestion/jalankan", "/api/ai/jalankan", "/api/ai/brief", "/api/ai/data-analysis", "/api/admin/artikel/terbitkan-terjadwal"].every(
    (r) => kendali.includes(r),
  ),
);
cek(
  "kendali: TIDAK menduplikasi logika engine/pipeline (tanpa import engine)",
  !kendali.includes("lib/ingestion/engine") &&
    !kendali.includes("lib/ai/pipeline") &&
    !kendali.includes("jalankanIngestion") &&
    !kendali.includes("jalankanPipelineEditorial"),
);
cek(
  "kendali: catatan F6 dinyatakan eksplisit",
  kendali.includes("CATATAN_F6") && kendali.includes("F6"),
);
cek(
  "kendali: digest/podcast/riset ditandai belum bisa dipicu (F7)",
  kendali.includes("belum bisa dipicu manual"),
);
cek(
  "kendali: ekspor CSV meng-escape kutip ganda",
  kendali.includes(`.replace(/"/g, '""')`),
);

for (const [relatif, nama] of [
  ["src/app/api/admin/kendali/flags/route.ts", "flags"],
  ["src/app/api/admin/kendali/jalankan/route.ts", "jalankan"],
  ["src/app/api/admin/kendali/ekspor-audit/route.ts", "ekspor-audit"],
]) {
  const src = bacaRepo(relatif);
  cek(
    `route ${nama}: guard super_admin`,
    src.includes("autentikasiAdmin(req, ROLES.SUPER_ADMIN)"),
  );
  cek(
    `route ${nama}: rate limit admin`,
    src.includes("buatRateLimiterAdmin"),
  );
}
cek(
  "route ekspor-audit: Content-Type text/csv + attachment",
  bacaRepo("src/app/api/admin/kendali/ekspor-audit/route.ts").includes("text/csv") &&
    bacaRepo("src/app/api/admin/kendali/ekspor-audit/route.ts").includes("attachment"),
);
cek(
  "route jalankan: meneruskan cookie sesi ke route internal",
  bacaRepo("src/app/api/admin/kendali/jalankan/route.ts").includes('req.headers.get("cookie")'),
);

const v8 = baca("20261116_pf_v8_expansion.sql");
const v9 = baca("20261116_pf_v9_grants.sql");
cek(
  "audit CHECK v8/v9 memuat aksi 'sistem.flag' + 'sistem.job'",
  v8.includes("'sistem.flag'") &&
    v8.includes("'sistem.job'") &&
    v9.includes("'sistem.flag'") &&
    v9.includes("'sistem.job'"),
);
cek(
  "kendali page: hanya super_admin (penjelasan jujur untuk staf lain)",
  bacaRepo("src/app/admin/kendali/page.tsx").includes('roles.includes("super_admin")'),
);
const apiSehat = bacaRepo("src/app/admin/api-sehat/page.tsx");
cek(
  "api-sehat: hanya NAMA secret (keberadaan env saja, nilai tak dibaca)",
  apiSehat.includes("HANYA nama secret") &&
    apiSehat.includes("Boolean(process.env[nama])") &&
    !apiSehat.includes("process.env.PF_AI_SECRET") &&
    !apiSehat.includes("process.env.SUPABASE_SERVICE_ROLE_KEY"),
);
const analitik = bacaRepo("src/app/admin/analitik/page.tsx");
cek(
  "analitik: angka nyata dari DB sendiri; bila v14 belum ada, jujur 'belum tersedia' tanpa angka contoh (B2-D)",
  analitik.includes("pf_kunjungan_harian") &&
    analitik.includes("pf_kunjungan_jalur") &&
    analitik.includes("Angka nyata dari tabel pf_kunjungan") &&
    analitik.includes("Analitik belum tersedia") &&
    analitik.includes("TIDAK menampilkan angka contoh"),
);
cek(
  "kualitas: jujur 'belum tersedia' bila tanpa run editorial_quality",
  bacaRepo("src/app/admin/kualitas/page.tsx").includes("Belum tersedia — belum ada hasil quality check"),
);
cek(
  "klaster: salinan dinyatakan BUKAN independen",
  bacaRepo("src/app/admin/klaster/page.tsx").includes("BUKAN sumber independen"),
);

// ---------- Uji fungsi murni: selCsv ----------
const kendaliSrc = bacaRepo("src/lib/admin/kendali.ts");
const fnCsv = /function selCsv\([\s\S]*?\n\}/.exec(kendaliSrc)?.[0];
cek("selCsv dapat diekstrak dari sumber", Boolean(fnCsv));
if (fnCsv) {
  const selCsv = new Function(
    transpileKeJs(`${fnCsv}\nreturn selCsv;`),
  )();
  cek("selCsv: teks biasa dikutip", selCsv("abc") === '"abc"');
  cek("selCsv: kutip ganda digandakan", selCsv('a"b') === '"a""b"');
  cek("selCsv: null -> kosong", selCsv(null) === "");
  cek("selCsv: angka -> string dikutip", selCsv(12) === '"12"');
}

// ---------- Ringkasan ----------
console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
if (gagal > 0) {
  console.log("HASIL: ADA KEGAGALAN");
  process.exit(1);
}
