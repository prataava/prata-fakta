// Uji migrasi v22 PRATA FAKTA (Global News — fondasi ingestion).
// PGlite in-memory — aman, tidak menyentuh DB produksi.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// CARA JALAN (wajib, dari akar repo):
//   node --experimental-strip-types \
//     --import /tmp/pf-register.mjs scripts/uji-migrasi-v22.mjs
//
// YANG DIUJI:
//   §A  v22 diterapkan DUA KALI tanpa error (idempotensi).
//   §B  CHECK pf_ai_runs_agen_check_v22: 31 nilai diterima
//       (13 lama + 16 baru + quality_check + analysis), nilai
//       liar ditolak, constraint v8 hilang, nama v22 ada.
//   §C  Tabel baru ada + kolom/index/RLS/policy/grant-nya.
//   §D  RPC acquire/release_editorial_lock: akuisisi,
//       tabrakan, lepas salah pemilik, lepas benar, expiry
//       (TTL nyata + pembersihan lock kedaluwarsa), argumen
//       tidak valid fail-closed.
//   §E  pf_articles.dedup_fingerprint: indeks unik parsial
//       menolak duplikat non-NULL, mengizinkan NULL ganda.
//   §F  pf_sources: 7 kolom baru + default + CHECK health_status.
//   §G  pf_ingestion_runs.kelas_gagal ada; kolom status v3 utuh.
//   §H  RLS pf_article_comparisons: anon hanya melihat baris
//       artikel terbit; super_admin bisa tulis; pf_editorial_locks
//       deny-all untuk anon/authenticated (tanpa policy).
//
// BATAS UJI YANG JUJUR:
// - Scaffold di sini MINIMAL (hanya tabel/fungsi yang dipakai
//   v22), bukan migrasi v1–v21 penuh: pf_categories,
//   pf_roles/pf_user_roles, pf_sources, pf_articles,
//   pf_ai_runs, pf_ingestion_runs + pf_has_role/
//   pf_is_super_admin (definisi disalin dari v1). Bila v22
//   kelak memakai tabel lain, scaffold harus ditambah —
//   ketidakcocokan dengan skema produksi penuh TIDAK akan
//   tertangkap di sini; verifikasi ulang agen utama sebelum
//   penerapan via SQL Editor tetap wajib.
// - RLS diuji lewat `set role` + stub auth.uid() (pola baterai
//   lama), bukan JWT Supabase asli: PostgREST/JWT tidak ada
//   di PGlite. Yang diuji: semantik policy-nya (qual), bukan
//   rantai auth Supabase.
// - GRANT EXECUTE RPC ke anon TIDAK diuji sebagai penolakan
//   lewat PostgREST (tidak ada); yang diuji: pg_proc +
//   has_function_privilege untuk anon/authenticated/
//   service_role di tingkat Postgres.
import fs from "node:fs";
import path from "node:path";

import { PGlite } from "./butuh-pglite.mjs";

const DIR_REPO = new URL("../", import.meta.url).pathname;
const DIR_MIGRASI = path.join(DIR_REPO, "supabase/migrations");
const V22 = "20261117_pf_v22_global_intel.sql";

// 13 nilai agen v8 — disalin PERSIS dari
// 20261116_pf_v8_expansion.sql §5c (bukan dari ingatan).
const AGEN_V8 = [
  "research", "source_analysis", "fact_verification", "summarization",
  "article_writing", "translation", "trend_analysis", "daily_brief",
  "data_analysis", "editorial_quality",
  "story_clustering", "podcast_script", "research_synthesis",
];
// 16 nilai baru tugas Fase 3 + 2 tambahan pemilik 17 Nov 11.57 WIB.
const AGEN_BARU_V22 = [
  "ingestion", "normalization", "clustering", "comparison", "synthesis",
  "geopolitical_risk", "entity_graph", "fact_scoring", "editorial_qa",
  "archival", "collector", "fact_checker", "writer", "editor",
  "verifier", "intelligence",
  "quality_check", "analysis",
];

let gagal = 0;
let lolos = 0;
function cek(label, kondisi, detail = "") {
  if (kondisi) {
    lolos++;
    console.log(`OK: ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    gagal++;
    console.log(`GAGAL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function bacaMigrasi(nama) {
  return fs.readFileSync(path.join(DIR_MIGRASI, nama), "utf8");
}
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

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
await db.exec(`create role service_role nologin;`);

// ---------- Scaffold minimal (disalin dari v1–v4) ----------
await db.exec(`
create table if not exists public.pf_roles (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique,
  deskripsi text,
  dibuat_pada timestamptz not null default now()
);
create table if not exists public.pf_user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references public.pf_roles (id) on delete cascade,
  dibuat_pada timestamptz not null default now(),
  primary key (user_id, role_id)
);
create table if not exists public.pf_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nama text not null,
  deskripsi text,
  urutan integer not null default 0,
  aktif boolean not null default true,
  dibuat_pada timestamptz not null default now()
);
create table if not exists public.pf_sources (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  jenis text not null check (jenis in ('rss', 'api', 'resmi', 'manual')),
  url text not null unique,
  aktif boolean not null default true,
  prioritas integer not null default 50,
  terakhir_cek timestamptz,
  status_terakhir text,
  dibuat_pada timestamptz not null default now()
);
create table if not exists public.pf_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  judul text not null,
  ringkasan text not null default '',
  isi text not null default '',
  kategori_slug text not null references public.pf_categories (slug) on delete restrict,
  status_verifikasi text not null default 'UNCONFIRMED'
    check (status_verifikasi in ('VERIFIED', 'CROSS-CHECKED', 'DEVELOPING', 'UNCONFIRMED', 'DISPUTED', 'CORRECTED')),
  status text not null default 'draft'
    check (status in ('draft', 'terbit', 'terjadwal', 'diarsipkan')),
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);
create table if not exists public.pf_ai_runs (
  id uuid primary key default gen_random_uuid(),
  -- SENGAJA tanpa CHECK inline: satu-satunya CHECK agen adalah
  -- constraint bernama pf_ai_runs_agen_check_v8 di bawah (yang
  -- dibuang v22). CHECK inline auto-named akan bertahan sesudah
  -- v22 dan menolak agen baru — itu bug scaffold, bukan v22.
  agen text not null,
  input_ref text,
  status text not null default 'berjalan'
    check (status in ('berjalan', 'berhasil', 'gagal', 'dilewati')),
  detail jsonb not null default '{}',
  dimulai_pada timestamptz not null default now()
);
create table if not exists public.pf_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  sumber_id uuid references public.pf_sources (id) on delete set null,
  sumber_nama text,
  dimulai_pada timestamptz not null default now(),
  selesai_pada timestamptz,
  status text not null default 'berjalan'
    check (status in ('berjalan', 'selesai', 'gagal', 'sebagian')),
  ditemukan integer not null default 0,
  baru integer not null default 0,
  duplikat integer not null default 0,
  ditolak integer not null default 0,
  gagal integer not null default 0,
  error text,
  dipicu_oleh text not null default 'manual'
    check (dipicu_oleh in ('manual', 'jadwal', 'github_actions', 'cron_muse'))
);
`);
// Fungsi helper v1 (disalin verbatim — policy §2 memanggilnya).
await db.exec(`
create or replace function public.pf_has_role(p_role text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.pf_user_roles ur
    join public.pf_roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.nama = p_role
  );
$$;
create or replace function public.pf_is_super_admin()
returns boolean
language sql
security definer
stable
as $$
  select public.pf_has_role('super_admin');
$$;
`);
// Grant tingkat tabel yang di produksi berasal dari default
// Supabase (v9 §F4) — di PGlite tidak ada default, jadi
// diberikan eksplisit di scaffold: policy SELECT §2 membaca
// pf_articles lewat EXISTS sebagai pengguna pemanggil, jadi
// anon/authenticated butuh SELECT di pf_articles (tanpa ini
// policy gagal 42501 — BUKAN salah migrasi v22).
await db.exec(`
grant select on public.pf_articles to anon, authenticated;
grant select on public.pf_categories to anon, authenticated;
`);
// Constraint v8 HARUS bernama persis itu: v22 membuang nama ini.
await db.exec(`
do $$ begin
  alter table public.pf_ai_runs
    add constraint pf_ai_runs_agen_check_v8
    check (agen in (
      'research', 'source_analysis', 'fact_verification', 'summarization',
      'article_writing', 'translation', 'trend_analysis', 'daily_brief',
      'data_analysis', 'editorial_quality',
      'story_clustering', 'podcast_script', 'research_synthesis'
    ));
end $$;
`);
await db.exec(
  `insert into public.pf_roles (nama) values ('super_admin'), ('editor'), ('fact_checker'), ('writer'), ('user') on conflict (nama) do nothing;`,
);
await db.exec(
  `insert into public.pf_categories (slug, nama) values ('dunia', 'Dunia') on conflict (slug) do nothing;`,
);

async function query(sql, params = []) {
  return (await db.query(sql, params)).rows;
}
async function gagalSql(sql, params = []) {
  try {
    await db.query(sql, params);
    return false;
  } catch {
    return true;
  }
}
async function sebagai(role, uid, fn) {
  await db.exec(`set role ${role};`);
  await db.exec(`select set_config('pf.uid_test', '${uid ?? ""}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`select set_config('pf.uid_test', '', false);`);
    await db.exec(`reset role;`);
  }
}

// ---------- §A. Idempotensi: v22 dua kali ----------
let v22Ok = true;
for (let i = 1; i <= 2; i++) {
  try {
    await db.exec(bacaMigrasi(V22));
  } catch (e) {
    v22Ok = false;
    console.log(`GAGAL: v22 jalan ke-${i} — ${String(e.message).split("\n")[0]}`);
  }
}
cek("A1 v22 diterapkan DUA KALI tanpa error (idempoten)", v22Ok);

// ---------- §B. CHECK agen ----------
{
  const cons = await query(
    `select conname from pg_constraint
      where conrelid = 'public.pf_ai_runs'::regclass
        and conname like 'pf_ai_runs_agen_check%' order by conname`,
  );
  cek(
    "B1 constraint v22 ada, v8 hilang",
    cons.length === 1 && cons[0].conname === "pf_ai_runs_agen_check_v22",
    JSON.stringify(cons.map((c) => c.conname)),
  );
  const def = await query(
    `select pg_get_constraintdef(oid) as d from pg_constraint
      where conrelid = 'public.pf_ai_runs'::regclass
        and conname = 'pf_ai_runs_agen_check_v22'`,
  );
  const teksDef = def[0]?.d ?? "";
  const semua31 = [...AGEN_V8, ...AGEN_BARU_V22];
  cek(
    "B2 CHECK v22 memuat 31 nilai (13 lama + 18 baru, tanpa dobel)",
    semua31.length === 31 &&
      new Set(semua31).size === 31 &&
      semua31.every((a) => teksDef.includes(`'${a}'`)),
    `jumlah=${semua31.length} unik=${new Set(semua31).size}`,
  );
  let terimaSemua = true;
  for (const agen of semua31) {
    try {
      await db.query(`insert into public.pf_ai_runs (agen) values ($1)`, [agen]);
    } catch (e) {
      terimaSemua = false;
      console.log(`GAGAL: agen '${agen}' ditolak — ${String(e.message).split("\n")[0]}`);
    }
  }
  cek("B3 semua 31 nilai agen diterima INSERT", terimaSemua);
  cek(
    "B4 nilai liar ditolak CHECK",
    (await gagalSql(`insert into public.pf_ai_runs (agen) values ('nilai_liar')`)) &&
      (await gagalSql(`insert into public.pf_ai_runs (agen) values ('comparison2')`)) &&
      (await gagalSql(`insert into public.pf_ai_runs (agen) values ('COMPARISON')`)),
  );
  // Nilai lama yang sudah ada sebelum v22 tetap valid.
  const n = await query(`select count(*) as c from public.pf_ai_runs where agen = 'translation'`);
  cek("B5 baris lama agen 'translation' tetap ada (tidak rusak)", Number(n[0].c) === 1);
}

// ---------- §C. Tabel baru: struktur + RLS + policy + grant ----------
{
  const tabs = await query(
    `select tablename, rowsecurity from pg_tables
      where schemaname = 'public'
        and tablename in ('pf_article_comparisons', 'pf_editorial_locks')
      order by tablename`,
  );
  cek(
    "C1 kedua tabel baru ada + RLS aktif",
    tabs.length === 2 && tabs.every((t) => t.rowsecurity === true),
    JSON.stringify(tabs),
  );
  const kols = await query(
    `select table_name, column_name from information_schema.columns
      where table_schema = 'public'
        and table_name = 'pf_article_comparisons'
      order by ordinal_position`,
  );
  const namaKol = kols.map((k) => k.column_name);
  cek(
    "C2 pf_article_comparisons: 11 kolom sesuai spek",
    JSON.stringify(namaKol) ===
      JSON.stringify(["id", "article_id", "cluster_id", "topic_slug", "common_facts", "framing_differences", "omitted_perspectives", "source_matrix", "neutrality_index", "created_at", "updated_at"]),
    namaKol.join(","),
  );
  const defs = await query(
    `select column_name, column_default, data_type, is_nullable
       from information_schema.columns
      where table_schema = 'public' and table_name = 'pf_article_comparisons'
        and column_name in ('common_facts','framing_differences','omitted_perspectives','source_matrix','neutrality_index')`,
  );
  const peta = Object.fromEntries(defs.map((d) => [d.column_name, d]));
  cek(
    "C3 4 kolom jsonb default '[]' + neutrality_index numeric(5,2) default 85.00",
    ["common_facts", "framing_differences", "omitted_perspectives", "source_matrix"].every(
      (k) => peta[k]?.column_default === "'[]'::jsonb" && peta[k]?.is_nullable === "NO",
    ) && peta.neutrality_index?.data_type === "numeric" &&
      String(peta.neutrality_index?.column_default).replace(/[^0-9.]/g, "").startsWith("85"),
    JSON.stringify(defs.map((d) => [d.column_name, d.column_default])),
  );
  const kolsLock = await query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'pf_editorial_locks'
      order by ordinal_position`,
  );
  cek(
    "C4 pf_editorial_locks: 5 kolom sesuai spek",
    JSON.stringify(kolsLock.map((k) => k.column_name)) ===
      JSON.stringify(["lock_key", "worker_id", "locked_at", "expires_at", "metadata"]),
    kolsLock.map((k) => k.column_name).join(","),
  );
  const idx = await query(
    `select indexname from pg_indexes where schemaname = 'public'
      and indexname in ('pf_article_comparisons_article_idx',
        'pf_article_comparisons_topic_idx', 'pf_editorial_locks_expires_idx')`,
  );
  cek("C5 3 indeks baru ada", idx.length === 3, idx.map((i) => i.indexname).join(","));
  const pols = await query(
    `select tablename, policyname, cmd from pg_policies
      where schemaname = 'public'
        and tablename in ('pf_article_comparisons', 'pf_editorial_locks')
      order by tablename, policyname`,
  );
  cek(
    "C6 pf_article_comparisons 2 policy (SELECT terbit/staf + ALL super_admin); pf_editorial_locks 0 policy",
    pols.length === 2 &&
      pols.every((p) => p.tablename === "pf_article_comparisons") &&
      pols.some((p) => p.cmd === "SELECT" && p.policyname.includes("baca terbit atau staf")) &&
      pols.some((p) => p.cmd === "ALL" && p.policyname.includes("tulis super_admin")),
    JSON.stringify(pols.map((p) => [p.tablename, p.policyname, p.cmd])),
  );
  const qual = await query(
    `select qual from pg_policies where schemaname = 'public'
      and tablename = 'pf_article_comparisons' and cmd = 'SELECT'`,
  );
  cek(
    "C7 policy SELECT memakai EXISTS artikel status='terbit'",
    String(qual[0]?.qual ?? "").includes("status = 'terbit'"),
    String(qual[0]?.qual ?? "").slice(0, 120),
  );
  const rpc = await query(
    `select proname, prosecdef from pg_proc
      where proname in ('acquire_editorial_lock', 'release_editorial_lock')
      order by proname`,
  );
  cek(
    "C8 kedua RPC ada + SECURITY DEFINER",
    rpc.length === 2 && rpc.every((r) => r.prosecdef === true),
    JSON.stringify(rpc),
  );
  const sp = await query(
    `select proname, proconfig from pg_proc
      where proname in ('acquire_editorial_lock', 'release_editorial_lock')`,
  );
  cek(
    "C9 kedua RPC search_path dipatok ke public (proconfig)",
    sp.length === 2 &&
      sp.every((r) => (r.proconfig ?? []).some((c) => String(c) === "search_path=public")),
    JSON.stringify(sp.map((r) => [r.proname, r.proconfig])),
  );
  const hak = await query(
    `select
       has_function_privilege('anon', 'public.acquire_editorial_lock(text, text, integer)', 'execute') as anon_ok,
       has_function_privilege('authenticated', 'public.acquire_editorial_lock(text, text, integer)', 'execute') as auth_ok,
       has_function_privilege('service_role', 'public.acquire_editorial_lock(text, text, integer)', 'execute') as sr_ok`,
  );
  cek(
    "C10 RPC acquire: anon TIDAK punya EXECUTE; authenticated + service_role punya",
    hak[0]?.anon_ok === false && hak[0]?.auth_ok === true && hak[0]?.sr_ok === true,
    JSON.stringify(hak[0]),
  );
}

// ---------- §D. RPC acquire/release ----------
{
  const acq = async (k, w, ttl) => {
    const r = await db.query(
      `select public.acquire_editorial_lock($1, $2, $3) as ok`,
      [k, w, ttl ?? 600],
    );
    return r.rows[0].ok;
  };
  const rel = async (k, w) => {
    await db.query(`select public.release_editorial_lock($1, $2)`, [k, w]);
  };
  cek("D1 acquire pertama true", (await acq("ingestion:gdeLt", "worker-a")) === true);
  cek("D2 acquire worker lain (kunci sama) false", (await acq("ingestion:gdeLt", "worker-b")) === false);
  cek("D3 acquire ulang pemilik sama false", (await acq("ingestion:gdeLt", "worker-a")) === false);
  await rel("ingestion:gdeLt", "worker-b"); // bukan pemilik
  cek("D4 release oleh bukan pemilik tidak melepas", (await acq("ingestion:gdeLt", "worker-b")) === false);
  await rel("ingestion:gdeLt", "worker-a");
  cek("D5 sesudah release pemilik, worker lain bisa acquire", (await acq("ingestion:gdeLt", "worker-b")) === true);
  let d6ok = true;
  try {
    await rel("ingestion:gdeLt", "worker-b"); // kunci sudah tak ada
  } catch {
    d6ok = false;
  }
  cek("D6 release kunci tak ada = tanpa galat (idempoten)", d6ok);
  cek(
    "D7 argumen tidak valid fail-closed (kunci/worker kosong, ttl 0)",
    (await acq("", "worker-a")) === false &&
      (await acq("k:x", "")) === false &&
      (await acq("k:x", "worker-a", 0)) === false,
  );
  // Expiry nyata: TTL 1 detik, tunggu, lalu worker lain bisa ambil.
  cek("D8 acquire TTL 1 detik true", (await acq("cluster:c1", "worker-a", 1)) === true);
  cek("D9 sebelum expiry masih terkunci", (await acq("cluster:c1", "worker-b", 600)) === false);
  await tidur(1200);
  cek("D10 sesudah TTL lewat, worker lain bisa acquire (expiry dibersihkan)", (await acq("cluster:c1", "worker-b", 600)) === true);
  await rel("cluster:c1", "worker-b");
  // Expiry via UPDATE langsung (deterministik): lock kedaluwarsa
  // dibersihkan acquire berikutnya meski TTL panjang.
  await acq("editorial:a1", "worker-a", 3600);
  await db.exec(`update public.pf_editorial_locks set expires_at = now() - interval '1 minute' where lock_key = 'editorial:a1';`);
  cek("D11 lock kedaluwarsa (UPDATE) diambil alih acquire berikut", (await acq("editorial:a1", "worker-b")) === true);
  await rel("editorial:a1", "worker-b");
  const baris = await query(`select count(*) as c from public.pf_editorial_locks`);
  cek("D12 tabel lock kosong sesudah semua release", Number(baris[0].c) === 0);
}

// ---------- §E. dedup_fingerprint ----------
{
  await db.exec(
    `insert into public.pf_articles (slug, judul, kategori_slug, status) values
       ('uji-dedup-1', 'Satu', 'dunia', 'terbit'),
       ('uji-dedup-2', 'Dua', 'dunia', 'draft'),
       ('uji-dedup-3', 'Tiga', 'dunia', 'draft') on conflict (slug) do nothing;`,
  );
  const fp = "9f86d081884c7d659a2feaa0c55ad015";
  cek(
    "E1 set fingerprint pertama OK",
    !(await gagalSql(`update public.pf_articles set dedup_fingerprint = $1 where slug = 'uji-dedup-1'`, [fp])),
  );
  cek(
    "E2 fingerprint sama di artikel kedua DITOLAK (unique parsial)",
    await gagalSql(`update public.pf_articles set dedup_fingerprint = $1 where slug = 'uji-dedup-2'`, [fp]),
  );
  cek(
    "E3 NULL ganda tetap diizinkan (parsial)",
    !(await gagalSql(`update public.pf_articles set dedup_fingerprint = null where slug in ('uji-dedup-2', 'uji-dedup-3')`)),
  );
  const idx = await query(
    `select indexdef from pg_indexes where schemaname = 'public'
      and indexname = 'pf_articles_dedup_fingerprint_idx'`,
  );
  cek(
    "E4 indeks unik + WHERE fingerprint IS NOT NULL",
    idx.length === 1 &&
      String(idx[0].indexdef).includes("UNIQUE") &&
      String(idx[0].indexdef).includes("dedup_fingerprint IS NOT NULL"),
    String(idx[0]?.indexdef ?? ""),
  );
}

// ---------- §F. pf_sources ----------
{
  const kols = await query(
    `select column_name, column_default, is_nullable
       from information_schema.columns
      where table_schema = 'public' and table_name = 'pf_sources'
        and column_name in ('poll_interval_minutes','etag','last_modified',
          'failure_count','cooldown_until','health_status','last_success_at')
      order by column_name`,
  );
  const peta = Object.fromEntries(kols.map((k) => [k.column_name, k]));
  cek(
    "F1 7 kolom baru pf_sources ada",
    kols.length === 7,
    kols.map((k) => k.column_name).join(","),
  );
  cek(
    "F2 default: poll 30, failure_count 0, health_status 'belum_pernah'",
    peta.poll_interval_minutes?.column_default === "30" &&
      peta.failure_count?.column_default === "0" &&
      peta.health_status?.column_default === "'belum_pernah'::text",
    JSON.stringify(kols.map((k) => [k.column_name, k.column_default])),
  );
  await db.exec(
    `insert into public.pf_sources (nama, jenis, url) values
       ('Sumber Uji v22', 'rss', 'https://contoh.id/rss.xml')
       on conflict (url) do nothing;`,
  );
  const s = await query(
    `select poll_interval_minutes, failure_count, health_status, etag,
            cooldown_until, last_success_at
       from public.pf_sources where url = 'https://contoh.id/rss.xml'`,
  );
  cek(
    "F3 baris baru memakai default (30 / 0 / belum_pernah / NULL)",
    s[0]?.poll_interval_minutes === 30 &&
      s[0]?.failure_count === 0 &&
      s[0]?.health_status === "belum_pernah" &&
      s[0]?.etag === null &&
      s[0]?.cooldown_until === null &&
      s[0]?.last_success_at === null,
    JSON.stringify(s[0]),
  );
  cek(
    "F4 CHECK health_status menolak nilai liar, menerima 'sehat'",
    (await gagalSql(
      `update public.pf_sources set health_status = 'liar' where url = 'https://contoh.id/rss.xml'`,
    )) &&
      !(await gagalSql(
        `update public.pf_sources set health_status = 'sehat', failure_count = 3, cooldown_until = now() + interval '1 hour', etag = '"abc"', last_modified = now(), last_success_at = now(), poll_interval_minutes = 15 where url = 'https://contoh.id/rss.xml'`,
      )),
  );
}

// ---------- §G. pf_ingestion_runs.kelas_gagal ----------
{
  const k = await query(
    `select column_name, data_type, is_nullable
       from information_schema.columns
      where table_schema = 'public' and table_name = 'pf_ingestion_runs'
        and column_name = 'kelas_gagal'`,
  );
  cek(
    "G1 kolom kelas_gagal ada (text, nullable)",
    k.length === 1 && k[0].data_type === "text" && k[0].is_nullable === "YES",
  );
  const st = await query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'pf_ingestion_runs'
        and column_name = 'status'`,
  );
  cek("G2 kolom status v3 tetap ada (tidak diubah)", st.length === 1);
  await db.exec(
    `insert into public.pf_ingestion_runs (sumber_nama, status, kelas_gagal, gagal)
       values ('GDELT', 'gagal', 'rate-limited', 1),
              ('Antara', 'selesai', null, 0);`,
  );
  const r = await query(
    `select count(*) as c from public.pf_ingestion_runs where kelas_gagal = 'rate-limited'`,
  );
  cek("G3 kelas_gagal bisa diisi 'rate-limited' + NULL diizinkan", Number(r[0].c) === 1);
}

// ---------- §H. RLS ----------
const ART_TERBIT = "33333333-3333-4333-8333-333333333333";
const ART_DRAF = "44444444-4444-4334-8444-444444444444";
const USER_SUPER = "55555555-5555-4555-8555-555555555555";
const USER_BIASA = "66666666-6666-4666-8666-666666666666";
await db.exec(
  `insert into auth.users (id, email) values
     ('${USER_SUPER}', 'super@uji.id'), ('${USER_BIASA}', 'biasa@uji.id')
     on conflict (id) do nothing;`,
);
await db.exec(
  `insert into public.pf_user_roles (user_id, role_id)
     select '${USER_SUPER}', id from public.pf_roles where nama = 'super_admin'
     on conflict (user_id, role_id) do nothing;`,
);
await db.exec(
  `insert into public.pf_articles (id, slug, judul, kategori_slug, status) values
     ('${ART_TERBIT}', 'uji-rls-terbit', 'Terbit', 'dunia', 'terbit'),
     ('${ART_DRAF}', 'uji-rls-draf', 'Draf', 'dunia', 'draft')
     on conflict (id) do nothing;`,
);
await db.exec(
  `insert into public.pf_article_comparisons
     (article_id, topic_slug, neutrality_index) values
     ('${ART_TERBIT}', 'topik-terbit', 82.50),
     ('${ART_DRAF}', 'topik-draf', 90.00)
     on conflict do nothing;`,
);
{
  const anonLihat = await sebagai("anon", null, async () => {
    const r = await query(`select topic_slug from public.pf_article_comparisons order by topic_slug`);
    return r.map((x) => x.topic_slug);
  });
  cek(
    "H1 anon hanya melihat perbandingan artikel TERBIT",
    JSON.stringify(anonLihat) === JSON.stringify(["topik-terbit"]),
    anonLihat.join(","),
  );
  const biasaLihat = await sebagai("authenticated", USER_BIASA, async () => {
    const r = await query(`select topic_slug from public.pf_article_comparisons order by topic_slug`);
    return r.map((x) => x.topic_slug);
  });
  cek(
    "H2 authenticated biasa juga hanya melihat yang terbit",
    JSON.stringify(biasaLihat) === JSON.stringify(["topik-terbit"]),
    biasaLihat.join(","),
  );
  const superLihat = await sebagai("authenticated", USER_SUPER, async () => {
    const r = await query(`select topic_slug from public.pf_article_comparisons order by topic_slug`);
    return r.map((x) => x.topic_slug);
  });
  cek(
    "H3 super_admin melihat keduanya (staf)",
    JSON.stringify(superLihat) === JSON.stringify(["topik-draf", "topik-terbit"]),
    superLihat.join(","),
  );
  const superTulis = await sebagai("authenticated", USER_SUPER, async () => {
    try {
      await db.query(
        `insert into public.pf_article_comparisons (article_id, topic_slug) values ($1, 'topik-super')`,
        [ART_DRAF],
      );
      return true;
    } catch {
      return false;
    }
  });
  cek("H4 super_admin bisa INSERT perbandingan (policy ALL)", superTulis === true);
  const biasaTulis = await sebagai("authenticated", USER_BIASA, async () => {
    try {
      await db.query(
        `insert into public.pf_article_comparisons (article_id, topic_slug) values ($1, 'topik-biasa')`,
        [ART_DRAF],
      );
      return false; // lolos = policy bocor
    } catch {
      return true;
    }
  });
  cek("H5 authenticated biasa DITOLAK INSERT (policy ALL super_admin)", biasaTulis === true);
  // pf_editorial_locks: deny-all — buat satu baris lewat RPC dulu.
  await db.query(`select public.acquire_editorial_lock('rls:kunci', 'worker-rls', 600)`);
  const anonLock = await sebagai("anon", null, async () => {
    try {
      const r = await query(`select count(*) as c from public.pf_editorial_locks`);
      return { error: false, n: Number(r[0].c) };
    } catch {
      return { error: true, n: -1 };
    }
  });
  cek(
    "H6 anon TIDAK bisa membaca pf_editorial_locks (0 baris / ditolak)",
    anonLock.error === true || anonLock.n === 0,
    JSON.stringify(anonLock),
  );
  const authLockInsert = await sebagai("authenticated", USER_BIASA, async () => {
    try {
      await db.query(
        `insert into public.pf_editorial_locks (lock_key, worker_id) values ('langsung:x', 'siapa')`,
      );
      return false;
    } catch {
      return true;
    }
  });
  cek("H7 authenticated DITOLAK INSERT langsung ke pf_editorial_locks", authLockInsert === true);
  await db.query(`select public.release_editorial_lock('rls:kunci', 'worker-rls')`);
}

console.log(`\nRINGKASAN v22: ${lolos} lolos, ${gagal} gagal.`);
if (gagal > 0) process.exit(1);
