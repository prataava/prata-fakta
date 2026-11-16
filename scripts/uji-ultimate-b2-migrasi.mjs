// Uji migrasi v14 PRATA FAKTA (Gelombang B2) -> PGlite.
// Menerapkan v1–v14 dua kali (idempotensi) TANPA blanket grant,
// lalu memeriksa hasil RAKITAN (bukan DDL inline tiap agen):
//   - jumlah tabel pf_* = 61 (55 v13 + 6 baru), RLS 61/61,
//     policy 119 (107 v13 + 12 baru);
//   - GRANT service_role eksplisit atas 6 tabel baru;
//   - kolom/index/trigger/fungsi/CHECK baru tiap § v14;
//   - TIDAK ADA grant tabel ke PUBLIC atas pf_*.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
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
  "20261116_pf_v11_rate_limit_audit.sql",
  "20261116_pf_v12_seed_jobs.sql",
  "20261116_pf_v13_ultimate.sql",
  "20261116_pf_v14_gelombang_b2.sql",
];

const db = new PGlite();

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
await db.exec(`create role service_role bypassrls nologin;`);
console.log("OK: setup auth + role (anon/authenticated/service_role)");

for (const putaran of [1, 2]) {
  for (const nama of MIGRASI) {
    try {
      await db.exec(baca(nama));
      console.log(`OK: migrasi ${nama} (putaran ${putaran})`);
    } catch (e) {
      console.log(`GAGAL: migrasi ${nama} (putaran ${putaran})\n  -> ${String(e.message).split("\n")[0]}`);
      gagal++;
      process.exit(1);
    }
  }
}

// ---------- Hitung akhir v14 ----------
const tabel = await db.query(
  `select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'pf_%'`,
);
cek("jumlah tabel pf_* = 61", tabel.rows[0].n === 61, `dapat ${tabel.rows[0].n}`);
const rls = await db.query(
  `select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'pf_%' and rowsecurity`,
);
cek("RLS 61/61", rls.rows[0].n === 61, `dapat ${rls.rows[0].n}`);
const policy = await db.query(
  `select count(*)::int as n from pg_policies where schemaname='public' and tablename like 'pf_%'`,
);
cek("jumlah policy pf_* = 119", policy.rows[0].n === 119, `dapat ${policy.rows[0].n}`);

// ---------- TIDAK ADA blanket grant ke PUBLIC ----------
const publik = await db.query(
  `select count(*)::int as n from information_schema.role_table_grants where grantee = 'PUBLIC' and table_schema = 'public' and table_name like 'pf_%'`,
);
cek("0 grant tabel ke PUBLIC atas pf_*", publik.rows[0].n === 0, `dapat ${publik.rows[0].n}`);

// ---------- GRANT service_role atas 6 tabel baru ----------
for (const t of [
  "pf_quiz_user_answers",
  "pf_certificates",
  "pf_account_deletions",
  "pf_push_subscriptions",
  "pf_kunjungan",
  "pf_app_errors",
]) {
  const g = await db.query(
    `select privilege_type from information_schema.role_table_grants where grantee = 'service_role' and table_schema = 'public' and table_name = $1 order by 1`,
    [t],
  );
  const hak = g.rows.map((r) => r.privilege_type);
  cek(
    `service_role punya SELECT/INSERT/UPDATE/DELETE atas ${t}`,
    ["SELECT", "INSERT", "UPDATE", "DELETE"].every((h) => hak.includes(h)),
    `dapat ${hak.join(",") || "(tidak ada)"}`,
  );
}

// ---------- §1 B2-E: kolom draf pf_questions ----------
const kolomTanya = await db.query(
  `select column_name from information_schema.columns where table_schema='public' and table_name='pf_questions' and column_name in ('jawaban_draf','referensi_draf','draf_dibuat_pada')`,
);
cek(
  "pf_questions punya 3 kolom draf",
  kolomTanya.rows.length === 3,
  `dapat ${kolomTanya.rows.length}`,
);
const idxDraf = await db.query(
  `select indexname from pg_indexes where schemaname='public' and tablename='pf_questions' and indexname='pf_questions_draf_menunggu_idx'`,
);
cek("index pf_questions_draf_menunggu_idx ada", idxDraf.rows.length === 1);

// ---------- §2 B2-C: kolom audio pf_podcast_episodes ----------
const kolomPod = await db.query(
  `select column_name, data_type from information_schema.columns where table_schema='public' and table_name='pf_podcast_episodes' and column_name in ('audio_bytes','tts_suara') order by 1`,
);
cek(
  "pf_podcast_episodes punya audio_bytes bigint + tts_suara text",
  kolomPod.rows.length === 2 &&
    kolomPod.rows.find((r) => r.column_name === "audio_bytes")?.data_type === "bigint" &&
    kolomPod.rows.find((r) => r.column_name === "tts_suara")?.data_type === "text",
  `dapat ${JSON.stringify(kolomPod.rows)}`,
);

// ---------- §3 B2-B: Academy ----------
const jenisKolom = await db.query(
  `select column_default from information_schema.columns where table_schema='public' and table_name='pf_quiz_questions' and column_name='jenis'`,
);
cek(
  "pf_quiz_questions.jenis ada (default pilihan_ganda)",
  jenisKolom.rows.length === 1 &&
    String(jenisKolom.rows[0].column_default).includes("pilihan_ganda"),
  `dapat ${jenisKolom.rows[0]?.column_default}`,
);
const kunciKolom = await db.query(
  `select column_name from information_schema.columns where table_schema='public' and table_name='pf_quiz_answers' and column_name in ('kunci_teks','kunci_jamaks')`,
);
cek("pf_quiz_answers punya kunci_teks + kunci_jamaks", kunciKolom.rows.length === 2);
const kunciNull = await db.query(
  `select is_nullable from information_schema.columns where table_schema='public' and table_name='pf_quiz_answers' and column_name='kunci'`,
);
cek("pf_quiz_answers.kunci boleh null (drop not null)", kunciNull.rows[0]?.is_nullable === "YES");
const cekOpsi = await db.query(
  `select pg_get_constraintdef(oid) as d from pg_constraint where conrelid='public.pf_quiz_questions'::regclass and conname='pf_quiz_questions_opsi_panjang_check_v14'`,
);
cek(
  "CHECK v14 opsi membebaskan isian_singkat/esai",
  cekOpsi.rows.length === 1 &&
    cekOpsi.rows[0].d.includes("isian_singkat") &&
    cekOpsi.rows[0].d.includes("esai"),
);
const triggerSkor = await db.query(
  `select tgname from pg_trigger where tgrelid='public.pf_course_progress'::regclass and tgname='pf_course_progress_skor_server' and not tgisinternal`,
);
cek("trigger pf_course_progress_skor_server ada", triggerSkor.rows.length === 1);
const fnSkor = await db.query(
  `select proname from pg_proc where proname='pf_hitung_skor_progres' and pronamespace='public'::regnamespace`,
);
cek("fungsi pf_hitung_skor_progres ada", fnSkor.rows.length === 1);

// ---------- §4 B2-D: notifikasi + analytics ----------
const cekJenis = await db.query(
  `select pg_get_constraintdef(oid) as d from pg_constraint where conrelid='public.pf_notifications'::regclass and conname='pf_notifications_jenis_check'`,
);
cek(
  "CHECK pf_notifications menerima jawaban + podcast",
  cekJenis.rows.length === 1 &&
    cekJenis.rows[0].d.includes("jawaban") &&
    cekJenis.rows[0].d.includes("podcast"),
  cekJenis.rows[0]?.d ?? "(tidak ada)",
);
const kolomPref = await db.query(
  `select column_name from information_schema.columns where table_schema='public' and table_name='pf_user_preferences' and column_name in ('notifikasi_jawaban','notifikasi_podcast','push_notifikasi')`,
);
cek("pf_user_preferences punya 3 kolom baru", kolomPref.rows.length === 3);
const idxDedup = await db.query(
  `select indexname from pg_indexes where schemaname='public' and tablename='pf_notifications' and indexname='pf_notifications_dedup_idx'`,
);
cek("index pf_notifications_dedup_idx ada", idxDedup.rows.length === 1);
for (const fn of ["pf_kunjungan_harian", "pf_kunjungan_jalur", "pf_bersihkan_data_lama"]) {
  const r = await db.query(
    `select proname from pg_proc where proname=$1 and pronamespace='public'::regnamespace`,
    [fn],
  );
  cek(`fungsi ${fn} ada`, r.rows.length === 1);
}

// ---------- §5 B2-A: akun ----------
const cekAudit = await db.query(
  `select pg_get_constraintdef(oid) as d from pg_constraint where conrelid='public.pf_audit_logs'::regclass and conname='pf_audit_logs_aksi_check_v14'`,
);
cek("CHECK audit v14 ada", cekAudit.rows.length === 1);
const defAudit = cekAudit.rows[0]?.d ?? "";
cek(
  "CHECK audit v14 memuat 4 aksi B2-A + aksi lama",
  ["akun.hapus.minta", "akun.hapus", "akun.hapus.gagal", "data.hapus", "tanya.jawab", "akademi.progres", "artikel.terbit"].every(
    (a) => defAudit.includes(`'${a}'`),
  ),
  defAudit.slice(0, 120),
);
const fkDeletions = await db.query(
  `select count(*)::int as n from pg_constraint where conrelid='public.pf_account_deletions'::regclass and contype='f'`,
);
cek("pf_account_deletions TANPA FK (jejak bertahan pasca-hapus)", fkDeletions.rows[0].n === 0);
const polDel = await db.query(
  `select tablename from pg_policies where schemaname='public' and policyname in ('pf_quiz_scores hapus pemilik','pf_notifications hapus pemilik','pf_user_preferences hapus pemilik','pf_questions hapus pemilik') order by 1`,
);
cek(
  "4 policy DELETE pemilik v14 ada",
  polDel.rows.length === 4,
  `dapat ${polDel.rows.map((r) => r.tablename).join(",")}`,
);
const grantDel = await db.query(
  `select table_name from information_schema.role_table_grants where grantee='authenticated' and table_schema='public' and privilege_type='DELETE' and table_name in ('pf_quiz_scores','pf_notifications','pf_user_preferences','pf_questions')`,
);
cek(
  "GRANT DELETE ke authenticated atas 4 tabel",
  grantDel.rows.length === 4,
  `dapat ${grantDel.rows.length}`,
);

// ---------- RPC v11 + seed v12 tetap utuh sesudah v14 ----------
const rpc = await db.query(`select pf_rate_limit_check('v14:uji', 1, 60) as hasil`);
cek("RPC pf_rate_limit_check tetap berfungsi", rpc.rows[0].hasil === true);
const jobs = await db.query(`select count(*)::int as n from public.pf_scheduled_jobs`);
cek("seed pf_scheduled_jobs tetap 5", jobs.rows[0].n === 5, `dapat ${jobs.rows[0].n}`);

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
