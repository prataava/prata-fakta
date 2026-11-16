// Uji migrasi v12 PRATA FAKTA (Tahap 13C — seed 5 job) -> PGlite.
// Menerapkan v1–v12 dua kali (idempotensi) TANPA blanket grant,
// lalu memeriksa:
//   - jumlah tabel pf_* = 54, RLS 54/54, policy 106 (v12 tidak
//     menambah tabel/policy);
//   - seed pf_scheduled_jobs = 5 baris dengan nama + cron persis;
//   - CHECK nama v12 mengizinkan 5 nama dan menolak nama bogus;
//   - RPC pf_rate_limit_check (v11) tetap berfungsi sesudah v12.
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
console.log("OK: setup auth + role");

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

// ---------- Hitung akhir v12 ----------
const tabel = await db.query(
  `select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'pf_%'`,
);
cek("jumlah tabel pf_* = 54", tabel.rows[0].n === 54, `dapat ${tabel.rows[0].n}`);
const rls = await db.query(
  `select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'pf_%' and rowsecurity`,
);
cek("RLS 54/54", rls.rows[0].n === 54, `dapat ${rls.rows[0].n}`);
const policy = await db.query(
  `select count(*)::int as n from pg_policies where schemaname='public' and tablename like 'pf_%'`,
);
cek("jumlah policy pf_* = 106", policy.rows[0].n === 106, `dapat ${policy.rows[0].n}`);

// ---------- Seed 5 job ----------
const jobs = await db.query(
  `select nama, jadwal_cron from public.pf_scheduled_jobs order by nama`,
);
const namaJob = jobs.rows.map((r) => r.nama);
cek(
  "seed pf_scheduled_jobs = 5 baris",
  jobs.rows.length === 5,
  `dapat ${jobs.rows.length}: ${namaJob.join(", ")}`,
);
for (const [nama, cron] of [
  ["brief", "0 22 * * *"],
  ["data-analysis", "0 1 * * 1"],
  ["editorial", "0 0,6,12,18 * * *"],
  ["ingestion", "*/30 * * * *"],
  ["terbitkan-terjadwal", "0 * * * *"],
]) {
  const baris = jobs.rows.find((r) => r.nama === nama);
  cek(`seed job ${nama} cron benar`, baris?.jadwal_cron === cron, `dapat ${baris?.jadwal_cron}`);
}

// ---------- CHECK nama v12 ----------
const cekDef = await db.query(
  `select pg_get_constraintdef(oid) as d from pg_constraint where conrelid = 'public.pf_scheduled_jobs'::regclass and conname = 'pf_scheduled_jobs_nama_check_v12'`,
);
cek("CHECK pf_scheduled_jobs_nama_check_v12 ada", cekDef.rows.length === 1);
const def = cekDef.rows[0]?.d ?? "";
cek(
  "CHECK v12 menyebut 5 nama",
  ["ingestion", "editorial", "brief", "data-analysis", "terbitkan-terjadwal"].every((n) =>
    def.includes(n),
  ),
  def,
);
let bogusDitolak = false;
try {
  await db.query(
    `insert into public.pf_scheduled_jobs (nama, jadwal_cron) values ('bogus', '* * * * *')`,
  );
} catch {
  bogusDitolak = true;
}
cek("insert nama job bogus ditolak CHECK", bogusDitolak);

// ---------- RPC v11 tetap berfungsi ----------
const rpc = await db.query(`select pf_rate_limit_check('v12:uji', 2, 60) as hasil`);
cek("RPC pf_rate_limit_check panggilan 1 lolos", rpc.rows[0].hasil === true);
const rpc2 = await db.query(`select pf_rate_limit_check('v12:uji', 2, 60) as hasil`);
cek("RPC pf_rate_limit_check panggilan 2 lolos", rpc2.rows[0].hasil === true);
const rpc3 = await db.query(`select pf_rate_limit_check('v12:uji', 2, 60) as hasil`);
cek("RPC pf_rate_limit_check panggilan 3 ditolak", rpc3.rows[0].hasil === false);

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
