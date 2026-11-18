// Uji migrasi v30 PRATA FAKTA (policy baca staf pf_reading_history
//   untuk /admin/kinerja).
// PGlite in-memory — aman, tidak menyentuh DB produksi.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// CARA JALAN (wajib, dari akar repo):
//   node --experimental-strip-types scripts/jalankan-baterai.mjs scripts/uji-migrasi-v30.mjs
//
// YANG DIUJI:
//   §A  Statis: berkas v30 memuat SATU policy SELECT baru
//       "pf_reading_history baca staf" (drop if exists +
//       create, idempoten) dengan 4 peran staf yang sama dengan
//       v27 (super_admin/editor/fact_checker/writer) via
//       pf_has_role; TIDAK ada policy tulis untuk staf; policy
//       pemilik v2 TIDAK disentuh; TIDAK ada perubahan tabel/
//       kolom; TIDAK ADA nilai secret harfiah.
//   §B  Live PGlite: scaffold v1 (pf_roles, pf_user_roles,
//       pf_has_role) + pf_reading_history + 4 policy pemilik v2,
//       lalu v30 dua kali (idempoten). Staf (editor) melihat
//       SEMUA baris; pemilik hanya barisnya sendiri; pengguna
//       tanpa peran + anon melihat 0; tulis staf ditolak
//       (update 0 baris); tulis pemilik sendiri tetap jalan;
//       RLS tetap aktif; jumlah policy jadi 5.
//
// BATAS UJI YANG JUJUR:
// - RLS diuji lewat `set role` + stub auth.uid() (pola baterai
//   v22) — bukan lewat JWT Supabase asli.
// - Verifikasi live-nya adalah kueri di header migrasi yang
//   dijalankan di SQL Editor sesudah penerapan.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const requirePglite = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = requirePglite("@electric-sql/pglite");

const DIR_REPO = new URL("../", import.meta.url).pathname;
const DIR_MIGRASI = path.join(DIR_REPO, "supabase/migrations");
const V30 = "20261119_pf_v30_kinerja_baca_staf.sql";

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
function baca(rel) {
  return fs.readFileSync(path.join(DIR_REPO, rel), "utf8");
}
function bacaMigrasi(nama) {
  let sql = fs.readFileSync(path.join(DIR_MIGRASI, nama), "utf8");
  sql = sql.replace(/create extension[^;]+;/gi, "-- ekstensi dilepas (PGlite)");
  sql = sql.replace(/\bcitext\b/gi, "text");
  return sql;
}

// ---------- §A: statis berkas v30 ----------
console.log("--- §A statis migrasi v30 ---");
{
  const sql = baca(`supabase/migrations/${V30}`);
  const sqlTanpaKomentar = sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  cek(
    "A1 policy baru bernama persis 'pf_reading_history baca staf' (drop if exists + create)",
    sqlTanpaKomentar.includes(
      'drop policy if exists "pf_reading_history baca staf"',
    ) &&
      sqlTanpaKomentar.includes(
        'create policy "pf_reading_history baca staf"',
      ),
  );
  cek(
    "A2 policy memakai pf_has_role untuk 4 peran staf yang sama dengan v27",
    ["super_admin", "editor", "fact_checker", "writer"].every((r) =>
      sqlTanpaKomentar.includes(`pf_has_role('${r}')`),
    ) &&
      (sqlTanpaKomentar.match(/pf_has_role\('/g) ?? []).length === 4,
  );
  cek(
    "A3 policy HANYA for select — tidak ada policy tulis untuk staf",
    /for select using/i.test(sqlTanpaKomentar) &&
      !/for insert/i.test(sqlTanpaKomentar) &&
      !/for update/i.test(sqlTanpaKomentar) &&
      !/for delete/i.test(sqlTanpaKomentar),
  );
  cek(
    "A4 policy pemilik v2 TIDAK disentuh (tidak ada drop/create 'baca/buat/ubah/hapus sendiri')",
    !/baca sendiri|buat sendiri|ubah sendiri|hapus sendiri/.test(
      sqlTanpaKomentar,
    ) && (sqlTanpaKomentar.match(/drop policy/g) ?? []).length === 1,
  );
  cek(
    "A5 TIDAK ada perubahan tabel/kolom dan RLS tidak dimatikan",
    !/create table/i.test(sqlTanpaKomentar) &&
      !/alter table[^;]*add column/i.test(sqlTanpaKomentar) &&
      !/disable row level security/i.test(sqlTanpaKomentar),
  );
  cek(
    "A6 TIDAK ADA nilai secret harfiah di berkas",
    !/eyJ[A-Za-z0-9_-]{10,}/.test(sql) &&
      !/sk-[A-Za-z0-9]{10,}/.test(sql) &&
      !/VAPID_PRIVATE_KEY\s*=/.test(sql),
  );
}

// ---------- §B: live PGlite ----------
console.log("--- §B live PGlite ---");
const db = new PGlite();
await db.exec(`create schema if not exists auth;`);
await db.exec(
  `create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);`,
);
await db.exec(
  `create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('pf.uid_test', true), '')::uuid $$;`,
);
await db.exec(`create role anon nologin;`);
await db.exec(`create role authenticated nologin;`);
await db.exec(`create role service_role nologin;`);

// Scaffold minimal (disalin dari v1 + v2 §1g).
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
create table if not exists public.pf_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  judul text not null
);
create table if not exists public.pf_reading_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  artikel_id uuid not null references public.pf_articles (id) on delete cascade,
  dibaca_pada timestamptz not null default now(),
  durasi_detik integer,
  selesai boolean not null default false
);
`);
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
`);
// 4 policy pemilik v2 (verbatim) + RLS + grant (pola v9).
await db.exec(`
alter table public.pf_reading_history enable row level security;
drop policy if exists "pf_reading_history baca sendiri" on public.pf_reading_history;
create policy "pf_reading_history baca sendiri"
  on public.pf_reading_history for select using (auth.uid() = user_id);
drop policy if exists "pf_reading_history buat sendiri" on public.pf_reading_history;
create policy "pf_reading_history buat sendiri"
  on public.pf_reading_history for insert with check (auth.uid() = user_id);
drop policy if exists "pf_reading_history ubah sendiri" on public.pf_reading_history;
create policy "pf_reading_history ubah sendiri"
  on public.pf_reading_history for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "pf_reading_history hapus sendiri" on public.pf_reading_history;
create policy "pf_reading_history hapus sendiri"
  on public.pf_reading_history for delete using (auth.uid() = user_id);
grant select, insert, update, delete on public.pf_reading_history to anon, authenticated;
`);
await db.exec(
  `insert into public.pf_roles (nama) values ('super_admin'), ('editor'), ('fact_checker'), ('writer'), ('user') on conflict (nama) do nothing;`,
);

const UID_STAF = "11111111-1111-1111-1111-111111111111";
const UID_A = "22222222-2222-2222-2222-222222222222";
const UID_B = "33333333-3333-3333-3333-333333333333";
const UID_POLOS = "44444444-4444-4444-4444-444444444444";
await db.exec(
  `insert into auth.users (id, email) values
    ('${UID_STAF}', 'staf@uji.id'), ('${UID_A}', 'a@uji.id'),
    ('${UID_B}', 'b@uji.id'), ('${UID_POLOS}', 'polos@uji.id');`,
);
await db.exec(
  `insert into public.pf_user_roles (user_id, role_id)
   select '${UID_STAF}', id from public.pf_roles where nama = 'editor';`,
);
await db.exec(
  `insert into public.pf_articles (id, slug, judul) values
    ('55555555-5555-5555-5555-555555555555', 'a1', 'Artikel 1'),
    ('66666666-6666-6666-6666-666666666666', 'a2', 'Artikel 2');`,
);
// A punya 2 baris, B punya 1 baris (dimasukkan sebagai postgres,
// RLS tidak berlaku untuk pemilik tabel — pola scaffold v22).
await db.exec(
  `insert into public.pf_reading_history (user_id, artikel_id, durasi_detik, selesai) values
    ('${UID_A}', '55555555-5555-5555-5555-555555555555', 120, true),
    ('${UID_A}', '66666666-6666-6666-6666-666666666666', 30, false),
    ('${UID_B}', '55555555-5555-5555-5555-555555555555', 60, true);`,
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

// Terapkan v30 DUA kali (idempoten).
let v30Ok = true;
for (let i = 1; i <= 2; i++) {
  try {
    await db.exec(bacaMigrasi(V30));
  } catch (e) {
    v30Ok = false;
    console.log(`GAGAL: penerapan v30 putaran ${i} — ${e.message}`);
  }
}
cek("B1 migrasi v30 diterapkan 2x tanpa error (idempoten)", v30Ok);

{
  const rows = await query(
    `select policyname, cmd from pg_policies where tablename = 'pf_reading_history' order by policyname;`,
  );
  cek(
    "B2 pg_policies pf_reading_history = 5 (4 pemilik + 1 baca staf)",
    rows.length === 5,
    rows.map((r) => `${r.policyname}(${r.cmd})`).join(", "),
  );
  cek(
    "B3 policy 'baca staf' tercatat sebagai SELECT",
    rows.some((r) => r.policyname === "pf_reading_history baca staf" && r.cmd === "SELECT"),
  );
  const rs = await query(
    `select rowsecurity from pg_tables where tablename = 'pf_reading_history';`,
  );
  cek("B4 RLS pf_reading_history tetap aktif", rs[0]?.rowsecurity === true);
}

async function hitungBarisTerlihat(role, uid) {
  return sebagai(role, uid, async () => {
    const rows = await query(`select count(*)::int as n from public.pf_reading_history;`);
    return rows[0]?.n ?? -1;
  });
}
cek(
  "B5 staf (editor) melihat SEMUA 3 baris",
  (await hitungBarisTerlihat("authenticated", UID_STAF)) === 3,
);
cek(
  "B6 pemilik A tetap hanya melihat 2 barisnya sendiri",
  (await hitungBarisTerlihat("authenticated", UID_A)) === 2,
);
cek(
  "B7 pemilik B tetap hanya melihat 1 barisnya sendiri",
  (await hitungBarisTerlihat("authenticated", UID_B)) === 1,
);
cek(
  "B8 pengguna tanpa peran melihat 0 baris",
  (await hitungBarisTerlihat("authenticated", UID_POLOS)) === 0,
);
cek(
  "B9 anon melihat 0 baris",
  (await hitungBarisTerlihat("anon", null)) === 0,
);

// Tulis: staf tidak bisa menulis; pemilik sendiri tetap bisa.
{
  const sebelum = await query(
    `select count(*)::int as n from public.pf_reading_history where durasi_detik = 999;`,
  );
  await sebagai("authenticated", UID_STAF, async () => {
    await db.query(
      `update public.pf_reading_history set durasi_detik = 999 where user_id = '${UID_B}';`,
    );
  });
  const sesudah = await query(
    `select count(*)::int as n from public.pf_reading_history where durasi_detik = 999;`,
  );
  cek(
    "B10 update oleh staf mengubah 0 baris (tidak ada policy tulis staf)",
    sebelum[0]?.n === 0 && sesudah[0]?.n === 0,
  );
  const insertOrangLainGagal = await sebagai("authenticated", UID_A, async () =>
    gagalSql(
      `insert into public.pf_reading_history (user_id, artikel_id) values ('${UID_B}', '55555555-5555-5555-5555-555555555555');`,
    ),
  );
  cek(
    "B11 insert atas nama orang lain tetap ditolak (policy pemilik utuh)",
    insertOrangLainGagal === true,
  );
  const insertSendiriOk = await sebagai("authenticated", UID_A, async () =>
    !(await gagalSql(
      `insert into public.pf_reading_history (user_id, artikel_id) values ('${UID_A}', '55555555-5555-5555-5555-555555555555');`,
    )),
  );
  cek("B12 insert atas nama sendiri tetap jalan", insertSendiriOk === true);
}

console.log(`\nRINGKASAN: ${lolos} lolos, ${gagal} gagal.`);
process.exit(gagal === 0 ? 0 : 1);
