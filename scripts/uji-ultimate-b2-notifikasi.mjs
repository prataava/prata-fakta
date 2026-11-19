// Uji Gelombang B2-D PRATA FAKTA (Notifikasi + Analytics DB sendiri)
// -> PGlite. Menerapkan v1–v13 dua kali (idempotensi) lalu DDL v14
// INLINE (tabel/kolom baru dibuat di setup baterai — migrasi v14
// BELUM ada di repo, DDL persisnya dilaporkan di laporan akhir
// B2-D untuk koordinator), lalu memeriksa:
//   E1  Penulis notifikasi: hook di terbitkanArtikel /
//       tindaklanjutiKoreksi / PATCH tanya / POST+PATCH podcast
//       (asersi sumber — TIDAK ada server HTTP hidup di sini);
//       preferensi per jenis; dedup kunci_dedup (unique index);
//       RLS pf_notifications (pemilik saja).
//   E3  Push VAPID: langganan (RLS pemilik, endpoint unik);
//       JWT ES256 dibuat + terverifikasi dengan node:crypto
//       (algoritma yang sama dengan lib/notifikasi/push.ts);
//       kunci hanya dari env (asersi sumber: tanpa hardcode).
//   D1  pf_kunjungan: kolom HANYA path+user_id+masuk+waktu
//       (privasi: tanpa IP/user-agent/query); RPC harian +
//       jalur mengembalikan agregasi benar dari baris seed;
//       RLS staf-only; retensi 90 hari (pf_bersihkan_data_lama).
//       pf_app_errors: tulis service_role, baca staf-only.
//   UI  Badge di Header, tracker beacon, halaman
//       /saya/notifikasi, /admin/analitik baca RPC (bukan angka
//       contoh), /admin/monitoring baca pf_app_errors,
//       responGalatAdmin mencatat ke DB.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// BATAS KEJUJURAN baterai ini (bukan klaim lebih):
// - Perilaku HTTP hidup (POST /api/analytics/kunjungan,
//   /api/push/langganan, PATCH /api/notifikasi, dsb.) TIDAK
//   diuji lewat HTTP — yang diuji: asersi sumber bahwa route
//   memakai pola yang benar + simulasi SQL atas tabel/policy/
//   RPC yang ditegakkan DB. Verifikasi HTTP hidup tetap tugas
//   tahap browser/koordinator.
// - Pengiriman push ke endpoint layanan push nyata TIDAK diuji
//   (butuh kunci VAPID deploy + langganan browser nyata); yang
//   diuji: konstruksi + verifikasi JWT VAPID dan aturan
//   langganan di DB.
// - Fan-out notifikasi (kirimNotifikasiTopik dsb.) adalah kode
//   TypeScript — baterai menguji invarian DB-nya (dedup,
//   preferensi default, pencocokan topik via SQL setara) +
//   asersi sumber bahwa hook terpanggil di jalur kejadian.
import fs from "node:fs";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";

import { PGlite } from "./butuh-pglite.mjs";

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

function bacaRepo(rel) {
  return fs.readFileSync(`${DIR_REPO}/${rel}`, "utf8");
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

async function berhasilSebagai(role, sql, params = []) {
  try {
    await sebagai(role, sql, params);
    return true;
  } catch {
    return false;
  }
}

async function sebagaiUid(uid, role, sql, params = []) {
  await db.query(`select set_config('pf.uid_test', $1, false)`, [uid]);
  try {
    return await sebagai(role, sql, params);
  } finally {
    await db.query(`select set_config('pf.uid_test', '', false)`);
  }
}

async function hitungSebagaiUid(uid, role, sql, params = []) {
  const r = await sebagaiUid(uid, role, sql, params);
  return Number(r.rows[0]?.n ?? 0);
}

const MIGRASI_V1_V12 = [
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
const MIGRASI_V13 = "20261116_pf_v13_ultimate.sql";

const UID_A = "11111111-1111-1111-1111-111111111111";
const UID_B = "22222222-2222-2222-2222-222222222222";

// ---------- Setup PGlite (pola uji-ultimate-backend.mjs) ----------
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

// ---------- Putaran 1: v1–v12 ----------
for (const nama of MIGRASI_V1_V12) {
  const ok = await jalankan(`migrasi ${nama} (putaran 1)`, baca(nama));
  if (!ok) process.exit(1);
}

// ---------- Seed (sesudah v1–v12, SEBELUM v13) ----------
await db.query(`insert into auth.users (id, email) values ($1, 'a@uji.id'), ($2, 'b@uji.id')`, [UID_A, UID_B]);
await db.query(`update public.pf_profiles set nama_tampilan = 'Pengguna A', nonaktif = false where id = $1::uuid`, [UID_A]);
await db.query(`update public.pf_profiles set nama_tampilan = 'Editor B', nonaktif = true where id = $1::uuid`, [UID_B]);
await db.query(
  `insert into public.pf_user_roles (user_id, role_id)
   select $1::uuid, id from public.pf_roles where nama = 'editor'`,
  [UID_B],
);
await db.query(
  `insert into public.pf_countries (kode, nama) values ('ID', 'Indonesia')`,
);
await db.query(
  `insert into public.pf_data_indicators (nama, slug, kategori, sumber_nama)
   values ('Indikator Uji', 'uji-indikator', 'nasional', 'Uji') returning id`,
);
await db.query(
  `insert into public.pf_research_reports (slug, judul, status)
   values ('uji-indikator', 'Laporan Uji Indikator', 'terbit')`,
);
await db.query(
  `insert into public.pf_quiz_questions (tanggal, pertanyaan, opsi, kunci)
   values ('2026-11-16', 'Soal uji?', '["a","b","c","d","e"]'::jsonb, 2)`,
);
await db.query(
  `insert into public.pf_questions (user_id, pertanyaan, jawaban, status, publik)
   values ($1, 'Apa itu uji?', 'Ini jawaban.', 'terjawab', true)`,
  [UID_A],
);
await db.query(
  `insert into public.pf_questions (user_id, pertanyaan, status, publik)
   values ($1, 'Menunggu jawab?', 'menunggu', true)`,
  [UID_A],
);
await db.query(
  `insert into public.pf_followed_topics (user_id, tipe, target)
   values ($1, 'negara', 'Indonesia'), ($1, 'negara', 'Atlantis'),
          ($1, 'kategori', 'indonesia'), ($1, 'isu', 'topik bebas')`,
  [UID_A],
);
console.log("OK: seed sesudah v1–v12");

// ---------- Putaran 2: v13 ----------
{
  const ok = await jalankan(`migrasi ${MIGRASI_V13} (putaran 1)`, baca(MIGRASI_V13));
  if (!ok) process.exit(1);
}

// ---------- Seed B2-D (sesudah v13) ----------
await db.query(
  `insert into public.pf_categories (slug, nama) values ('dunia-uji', 'Dunia Uji')`,
);
const artikelId = (
  await db.query(
    `insert into public.pf_articles (slug, judul, kategori_slug, negara_kode, status)
     values ('artikel-uji', 'Artikel Uji', 'dunia-uji', 'ID', 'terbit') returning id`,
  )
).rows[0].id;
await db.query(
  `insert into public.pf_followed_topics (user_id, tipe, target)
   values ($1, 'kategori', 'dunia-uji'), ($2, 'negara', 'ID')`,
  [UID_A, UID_B],
);
await db.query(
  `insert into public.pf_questions (user_id, pertanyaan, status)
   values ($1, 'Pertanyaan B2-D?', 'menunggu') returning id`,
  [UID_A],
);
await db.query(
  `insert into public.pf_correction_reports (artikel_id, pelapor_id, jenis, pesan, status)
   values ($1, $2, 'fakta_salah', 'Ada angka salah.', 'baru') returning id`,
  [artikelId, UID_A],
);
await db.query(
  `insert into public.pf_user_preferences (user_id) values ($1)`,
  [UID_A],
);
console.log("OK: seed B2-D (1 artikel, 2 pengikut topik, 1 pertanyaan, 1 koreksi)");

// ============================================================
// DDL v14 INLINE — PERSIS DDL yang dilaporkan ke koordinator.
// (Migrasi v14 BELUM ada di repo; DDL ini yang harus dijalankan.)
// ============================================================
const DDL_V14 = `
-- ---------- 1. pf_notifications: jenis baru + dedup ----------
alter table public.pf_notifications
  drop constraint if exists pf_notifications_jenis_check;
alter table public.pf_notifications
  add constraint pf_notifications_jenis_check
  check (jenis in ('breaking', 'topik', 'brief', 'artikel', 'koreksi', 'peristiwa', 'jawaban', 'podcast'));
alter table public.pf_notifications
  add column if not exists kunci_dedup text;
create unique index if not exists pf_notifications_dedup_idx
  on public.pf_notifications (user_id, kunci_dedup)
  where kunci_dedup is not null;

-- ---------- 2. pf_user_preferences: kolom baru ----------
alter table public.pf_user_preferences
  add column if not exists notifikasi_jawaban boolean not null default true,
  add column if not exists notifikasi_podcast boolean not null default true,
  add column if not exists push_notifikasi boolean not null default false;

-- ---------- 3. pf_push_subscriptions ----------
create table if not exists public.pf_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);
create index if not exists pf_push_subscriptions_user_idx
  on public.pf_push_subscriptions (user_id);
alter table public.pf_push_subscriptions enable row level security;
drop policy if exists "pf_push_subscriptions baca pemilik" on public.pf_push_subscriptions;
create policy "pf_push_subscriptions baca pemilik"
  on public.pf_push_subscriptions for select using (auth.uid() = user_id);
drop policy if exists "pf_push_subscriptions tambah pemilik" on public.pf_push_subscriptions;
create policy "pf_push_subscriptions tambah pemilik"
  on public.pf_push_subscriptions for insert with check (auth.uid() = user_id);
drop policy if exists "pf_push_subscriptions ubah pemilik" on public.pf_push_subscriptions;
create policy "pf_push_subscriptions ubah pemilik"
  on public.pf_push_subscriptions for update using (auth.uid() = user_id);
drop policy if exists "pf_push_subscriptions hapus pemilik" on public.pf_push_subscriptions;
create policy "pf_push_subscriptions hapus pemilik"
  on public.pf_push_subscriptions for delete using (auth.uid() = user_id);
-- GRANT tingkat tabel (pola v9): RLS tetap penegak baris.
grant select, insert, update, delete on public.pf_push_subscriptions to authenticated;
-- service_role (kunci server) menulis/membaca penuh — di Supabase
-- nyata ia memang punya akses penuh; GRANT eksplisit ini membuat
-- perilaku sama di PGlite dan terdokumentasi.
grant all on public.pf_push_subscriptions to service_role;

-- ---------- 4. pf_kunjungan (privasi: HANYA path + user_id + masuk + waktu) ----------
create table if not exists public.pf_kunjungan (
  id uuid primary key default gen_random_uuid(),
  path text not null check (path like '/%'),
  user_id uuid references auth.users (id) on delete set null,
  masuk boolean not null default false,
  dibuat_pada timestamptz not null default now()
);
create index if not exists pf_kunjungan_waktu_idx
  on public.pf_kunjungan (dibuat_pada desc);
create index if not exists pf_kunjungan_path_waktu_idx
  on public.pf_kunjungan (path, dibuat_pada desc);
alter table public.pf_kunjungan enable row level security;
drop policy if exists "pf_kunjungan baca staf" on public.pf_kunjungan;
create policy "pf_kunjungan baca staf"
  on public.pf_kunjungan for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );
-- GRANT select saja (pola v9): tulis HANYA via service role (API),
-- tidak ada policy INSERT untuk pengguna.
grant select on public.pf_kunjungan to anon, authenticated;
grant all on public.pf_kunjungan to service_role;

-- ---------- 5. pf_app_errors ----------
create table if not exists public.pf_app_errors (
  id uuid primary key default gen_random_uuid(),
  sumber text not null,
  pesan text not null,
  kode text,
  rute text,
  stack text,
  dibuat_pada timestamptz not null default now()
);
create index if not exists pf_app_errors_waktu_idx
  on public.pf_app_errors (dibuat_pada desc);
create index if not exists pf_app_errors_sumber_idx
  on public.pf_app_errors (sumber, dibuat_pada desc);
alter table public.pf_app_errors enable row level security;
drop policy if exists "pf_app_errors baca staf" on public.pf_app_errors;
create policy "pf_app_errors baca staf"
  on public.pf_app_errors for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );
-- GRANT select saja (pola v9): tulis HANYA via service role.
grant select on public.pf_app_errors to anon, authenticated;
grant all on public.pf_app_errors to service_role;

-- Penulis notifikasi (service role) INSERT ke pf_notifications:
-- v9 hanya memberi select+update ke anon/authenticated; service
-- role butuh INSERT eksplisit agar penulis E1 bekerja.
grant select, insert, update, delete on public.pf_notifications to service_role;

-- ---------- 6. RPC agregasi (security invoker: RLS staf tetap berlaku) ----------
create or replace function public.pf_kunjungan_harian(hari integer default 30)
returns table (tanggal date, kunjungan bigint, pengunjung_masuk bigint)
language sql stable security invoker as $$
  select d::date as tanggal,
         count(k.id) as kunjungan,
         count(distinct k.user_id) as pengunjung_masuk
  from generate_series(current_date - (hari - 1) * interval '1 day', current_date, interval '1 day') as d
  left join public.pf_kunjungan k on k.dibuat_pada::date = d::date
  group by d order by d;
$$;
grant execute on function public.pf_kunjungan_harian(integer) to authenticated, service_role;

create or replace function public.pf_kunjungan_jalur(hari integer default 30, batas integer default 20)
returns table (path text, kunjungan bigint)
language sql stable security invoker as $$
  select k.path, count(*) as kunjungan
  from public.pf_kunjungan k
  where k.dibuat_pada >= current_date - (hari - 1) * interval '1 day'
  group by k.path order by kunjungan desc, k.path asc limit batas;
$$;
grant execute on function public.pf_kunjungan_jalur(integer, integer) to authenticated, service_role;

-- ---------- 7. Retensi 90 hari ----------
create or replace function public.pf_bersihkan_data_lama()
returns table (kunjungan_dihapus bigint, galat_dihapus bigint)
language plpgsql security definer set search_path = public as $$
declare jml_k bigint; jml_g bigint;
begin
  delete from public.pf_kunjungan where dibuat_pada < now() - interval '90 days';
  get diagnostics jml_k = row_count;
  delete from public.pf_app_errors where dibuat_pada < now() - interval '90 days';
  get diagnostics jml_g = row_count;
  return query select jml_k, jml_g;
end;
$$;
grant execute on function public.pf_bersihkan_data_lama() to service_role;
`;

{
  const ok = await jalankan("DDL v14 inline", DDL_V14);
  if (!ok) process.exit(1);
}

// ---------- Seed data v14 ----------
await db.query(
  `insert into public.pf_kunjungan (path, user_id, masuk, dibuat_pada) values
   ('/artikel/artikel-uji', $1, true, now()),
   ('/', null, false, now()),
   ('/artikel/artikel-uji', $2, true, now() - interval '1 day'),
   ('/tanya', null, false, now() - interval '2 days')`,
  [UID_A, UID_B],
);
await db.query(
  `insert into public.pf_app_errors (sumber, pesan, kode, rute) values
   ('responGalatAdmin', 'Galat uji admin.', 'ERR-TEST1', '/api/admin/tanya'),
   ('api/analytics/kunjungan', 'Gagal mencatat kunjungan (uji).', null, '/tanya')`,
);
await db.query(
  `insert into public.pf_notifications (user_id, jenis, judul, isi, tautan, kunci_dedup)
   values ($1, 'topik', 'Artikel baru: Artikel Uji', 'Artikel baru terbit.', '/artikel/artikel-uji', 'topik:' || $2::text)`,
  [UID_A, artikelId],
);
await db.query(
  `insert into public.pf_push_subscriptions (user_id, endpoint, p256dh, auth)
   values ($1, 'https://push-contoh.invalid/uji-a', 'p256dh-uji', 'auth-uji')`,
  [UID_A],
);
console.log("OK: seed data v14 (4 kunjungan, 2 galat, 1 notifikasi, 1 langganan push)");

// ============================================================
// ASERSI
// ============================================================
async function kolomTabel(tabel) {
  const r = await db.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = $1 order by column_name`,
    [tabel],
  );
  return r.rows.map((x) => x.column_name);
}
async function rlsAktif(tabel) {
  const r = await db.query(
    `select relrowsecurity from pg_class where relname = $1`,
    [tabel],
  );
  return r.rows[0]?.relrowsecurity === true;
}

// ---------- DDL v14: skema ----------
cek(
  "v14: tabel pf_push_subscriptions ada",
  (await kolomTabel("pf_push_subscriptions")).length > 0,
);
cek(
  "v14: tabel pf_kunjungan ada",
  (await kolomTabel("pf_kunjungan")).length > 0,
);
cek(
  "v14: tabel pf_app_errors ada",
  (await kolomTabel("pf_app_errors")).length > 0,
);
{
  const kolom = await kolomTabel("pf_kunjungan");
  cek(
    "D1-privasi: pf_kunjungan HANYA berisi path/user_id/masuk/waktu (tanpa ip/user-agent/query)",
    JSON.stringify(kolom) ===
      JSON.stringify(["dibuat_pada", "id", "masuk", "path", "user_id"]),
    `kolom: ${kolom.join(",")}`,
  );
}
{
  const kolom = await kolomTabel("pf_app_errors");
  cek(
    "D1: pf_app_errors berisi sumber/pesan/kode/rute/stack/waktu",
    ["dibuat_pada", "id", "kode", "pesan", "rute", "stack", "sumber"].every(
      (k) => kolom.includes(k),
    ),
  );
}
{
  const kolom = await kolomTabel("pf_user_preferences");
  cek(
    "E1: pf_user_preferences punya notifikasi_jawaban/notifikasi_podcast/push_notifikasi",
    kolom.includes("notifikasi_jawaban") &&
      kolom.includes("notifikasi_podcast") &&
      kolom.includes("push_notifikasi"),
  );
}
cek(
  "E1: pf_notifications punya kolom kunci_dedup",
  (await kolomTabel("pf_notifications")).includes("kunci_dedup"),
);
cek("v14: RLS aktif pf_push_subscriptions", await rlsAktif("pf_push_subscriptions"));
cek("v14: RLS aktif pf_kunjungan", await rlsAktif("pf_kunjungan"));
cek("v14: RLS aktif pf_app_errors", await rlsAktif("pf_app_errors"));

// ---------- E1: jenis + dedup + preferensi default ----------
{
  const pref = (
    await db.query(
      `select notifikasi_jawaban, notifikasi_podcast, push_notifikasi,
              notifikasi_topik, notifikasi_koreksi
       from public.pf_user_preferences where user_id = $1`,
      [UID_A],
    )
  ).rows[0];
  cek(
    "E1: preferensi baru default jawaban=true, podcast=true, push=false",
    pref.notifikasi_jawaban === true &&
      pref.notifikasi_podcast === true &&
      pref.push_notifikasi === false &&
      pref.notifikasi_topik === true &&
      pref.notifikasi_koreksi === true,
  );
}
{
  // jenis 'jawaban' + 'podcast' diterima CHECK baru.
  const okJawaban = await berhasilSebagai(
    "service_role",
    `insert into public.pf_notifications (user_id, jenis, judul) values ($1, 'jawaban', 'Jawaban uji')`,
    [UID_A],
  );
  const okPodcast = await berhasilSebagai(
    "service_role",
    `insert into public.pf_notifications (user_id, jenis, judul) values ($1, 'podcast', 'Podcast uji')`,
    [UID_A],
  );
  const tolakSpam = !(await berhasilSebagai(
    "service_role",
    `insert into public.pf_notifications (user_id, jenis, judul) values ($1, 'spam', 'Spam uji')`,
    [UID_A],
  ));
  cek(
    "E1: CHECK jenis menerima 'jawaban' + 'podcast', menolak 'spam'",
    okJawaban && okPodcast && tolakSpam,
  );
}
{
  // Dedup: kunci sama untuk pengguna sama → 23505.
  const duplikatDitolak = !(await berhasilSebagai(
    "service_role",
    `insert into public.pf_notifications (user_id, jenis, judul, kunci_dedup)
     values ($1, 'topik', 'Duplikat', 'topik:' || $2::text)`,
    [UID_A, artikelId],
  ));
  const kunciLainLolos = await berhasilSebagai(
    "service_role",
    `insert into public.pf_notifications (user_id, jenis, judul, kunci_dedup)
     values ($1, 'topik', 'Lain', 'topik:lain')`,
    [UID_A],
  );
  cek(
    "E1: dedup (user_id, kunci_dedup) menolak duplikat, menerima kunci lain",
    duplikatDitolak && kunciLainLolos,
  );
}
{
  // RLS notifikasi: pemilik melihat baris sendiri, bukan milik orang lain.
  const milikA = await hitungSebagaiUid(
    UID_A,
    "authenticated",
    `select count(*) as n from public.pf_notifications where user_id = $1`,
    [UID_A],
  );
  const milikBdariA = await hitungSebagaiUid(
    UID_A,
    "authenticated",
    `select count(*) as n from public.pf_notifications where user_id = $1`,
    [UID_B],
  );
  cek(
    "E1-RLS: pengguna melihat notifikasi sendiri saja",
    milikA >= 1 && milikBdariA === 0,
    `A melihat ${milikA} milik sendiri, ${milikBdariA} milik B`,
  );
}

// ---------- E1: pencocokan topik (SQL setara kirimNotifikasiTopik) ----------
{
  // Artikel negara ID + kategori dunia. Pengikut: A via kategori
  // 'dunia' + via negara nama 'Indonesia'; B via negara kode 'ID'.
  const r = await db.query(
    `select distinct user_id from public.pf_followed_topics
     where (tipe = 'kategori' and target = 'dunia-uji')
        or (tipe = 'negara' and target ilike 'ID')
        or (tipe = 'negara' and target ilike 'Indonesia')`,
  );
  const ids = r.rows.map((x) => x.user_id).sort();
  cek(
    "E1: pencocokan topik menemukan A (kategori+nagara-nama) + B (negara-kode)",
    ids.length === 2 && ids[0] === UID_A && ids[1] === UID_B,
    `ditemukan: ${ids.join(",")}`,
  );
}

// ---------- E3: langganan push ----------
{
  const duplikatDitolak = !(await berhasilSebagai(
    "service_role",
    `insert into public.pf_push_subscriptions (user_id, endpoint, p256dh, auth)
     values ($1, 'https://push-contoh.invalid/uji-a', 'x', 'y')`,
    [UID_B],
  ));
  cek(
    "E3: endpoint langganan push unik global (duplikat ditolak)",
    duplikatDitolak,
  );
}
{
  const milikA = await hitungSebagaiUid(
    UID_A,
    "authenticated",
    `select count(*) as n from public.pf_push_subscriptions where user_id = $1`,
    [UID_A],
  );
  const milikBdariA = await hitungSebagaiUid(
    UID_A,
    "authenticated",
    `select count(*) as n from public.pf_push_subscriptions where user_id = $1`,
    [UID_B],
  );
  cek(
    "E3-RLS: langganan push hanya terlihat pemiliknya",
    milikA === 1 && milikBdariA === 0,
  );
}

// ---------- D1: RLS kunjungan + galat ----------
{
  const anon = await hitungSebagaiUid(
    "",
    "anon",
    `select count(*) as n from public.pf_kunjungan`,
  );
  const nonStaf = await hitungSebagaiUid(
    UID_A,
    "authenticated",
    `select count(*) as n from public.pf_kunjungan`,
  );
  const staf = await hitungSebagaiUid(
    UID_B,
    "authenticated",
    `select count(*) as n from public.pf_kunjungan`,
  );
  cek(
    "D1-RLS: pf_kunjungan hanya dibaca staf (anon 0, non-staf 0, staf 4)",
    anon === 0 && nonStaf === 0 && staf === 4,
    `anon=${anon} non-staf=${nonStaf} staf=${staf}`,
  );
}
{
  const anon = await hitungSebagaiUid(
    "",
    "anon",
    `select count(*) as n from public.pf_app_errors`,
  );
  const nonStaf = await hitungSebagaiUid(
    UID_A,
    "authenticated",
    `select count(*) as n from public.pf_app_errors`,
  );
  const staf = await hitungSebagaiUid(
    UID_B,
    "authenticated",
    `select count(*) as n from public.pf_app_errors`,
  );
  cek(
    "D1-RLS: pf_app_errors hanya dibaca staf (anon 0, non-staf 0, staf 2)",
    anon === 0 && nonStaf === 0 && staf === 2,
    `anon=${anon} non-staf=${nonStaf} staf=${staf}`,
  );
}
{
  // Service role (bypass RLS) bisa menulis keduanya.
  const tulisKunjungan = await berhasilSebagai(
    "service_role",
    `insert into public.pf_kunjungan (path, user_id, masuk) values ('/uji-service', null, false)`,
  );
  const tulisGalat = await berhasilSebagai(
    "service_role",
    `insert into public.pf_app_errors (sumber, pesan) values ('uji-service', 'uji')`,
  );
  cek(
    "D1: service_role bisa menulis pf_kunjungan + pf_app_errors",
    tulisKunjungan && tulisGalat,
  );
  // Bersihkan baris uji-service agar tidak mengotori RPC.
  await db.query(`delete from public.pf_kunjungan where path = '/uji-service'`);
  await db.query(`delete from public.pf_app_errors where sumber = 'uji-service'`);
}

// ---------- D1: RPC agregasi ----------
{
  const r = await sebagaiUid(
    UID_B,
    "authenticated",
    `select tanggal, kunjungan, pengunjung_masuk from public.pf_kunjungan_harian(30)
     where tanggal >= current_date - interval '2 days' order by tanggal`,
  );
  const perHari = new Map(
    r.rows.map((x) => [
      x.tanggal instanceof Date
        ? x.tanggal.toISOString().slice(0, 10)
        : String(x.tanggal).slice(0, 10),
      [Number(x.kunjungan), Number(x.pengunjung_masuk)],
    ]),
  );
  const hariIni = new Date().toISOString().slice(0, 10);
  const kemarin = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const lusa = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const ok =
    JSON.stringify(perHari.get(hariIni)) === JSON.stringify([2, 1]) &&
    JSON.stringify(perHari.get(kemarin)) === JSON.stringify([1, 1]) &&
    JSON.stringify(perHari.get(lusa)) === JSON.stringify([1, 0]);
  cek(
    "D1-RPC: pf_kunjungan_harian benar per hari (hari ini 2/1, kemarin 1/1, lusa 1/0)",
    ok,
    `got: ${JSON.stringify([...perHari])}`,
  );
}
{
  const r = await sebagaiUid(
    UID_B,
    "authenticated",
    `select path, kunjungan from public.pf_kunjungan_jalur(30, 20)`,
  );
  const pertama = r.rows[0];
  cek(
    "D1-RPC: pf_kunjungan_jalur menempatkan /artikel/artikel-uji teratas (2)",
    pertama?.path === "/artikel/artikel-uji" && Number(pertama?.kunjungan) === 2,
    `teratas: ${pertama?.path} (${pertama?.kunjungan})`,
  );
}
{
  // Non-staf memanggil RPC → angka NOL (RLS), bukan angka orang lain.
  const r = await sebagaiUid(
    UID_A,
    "authenticated",
    `select sum(kunjungan)::bigint as total from public.pf_kunjungan_harian(30)`,
  );
  cek(
    "D1-RPC: non-staf memanggil RPC harian mendapat total 0 (RLS)",
    Number(r.rows[0]?.total ?? -1) === 0,
  );
}

// ---------- D1: retensi 90 hari ----------
{
  await db.query(
    `insert into public.pf_kunjungan (path, user_id, masuk, dibuat_pada)
     values ('/lama', null, false, now() - interval '120 days')`,
  );
  await db.query(
    `insert into public.pf_app_errors (sumber, pesan, dibuat_pada)
     values ('lama', 'galat lama', now() - interval '120 days')`,
  );
  const hasil = (
    await sebagai(
      "service_role",
      `select * from public.pf_bersihkan_data_lama()`,
    )
  ).rows[0];
  const sisaKunjungan = await hitungSebagaiUid(
    UID_B,
    "authenticated",
    `select count(*) as n from public.pf_kunjungan where path = '/lama'`,
  );
  const sisaGalat = await hitungSebagaiUid(
    UID_B,
    "authenticated",
    `select count(*) as n from public.pf_app_errors where sumber = 'lama'`,
  );
  const totalKunjungan = await hitungSebagaiUid(
    UID_B,
    "authenticated",
    `select count(*) as n from public.pf_kunjungan`,
  );
  cek(
    "D1-retensi: pf_bersihkan_data_lama menghapus 1 kunjungan + 1 galat lama, baris baru utuh (4)",
    Number(hasil.kunjungan_dihapus) === 1 &&
      Number(hasil.galat_dihapus) === 1 &&
      sisaKunjungan === 0 &&
      sisaGalat === 0 &&
      totalKunjungan === 4,
    `dihapus: ${hasil.kunjungan_dihapus}/${hasil.galat_dihapus}, total kini ${totalKunjungan}`,
  );
}

// ---------- E3: JWT VAPID (algoritma sama dengan lib/notifikasi/push.ts) ----------
{
  // Generate pasangan kunci P-256 uji, lalu bangun JWT persis
  // langkah buatJwtVapid (header.typ JWT, alg ES256; klaim aud/
  // exp/sub; tanda tangan sha256 ieee-p1363), lalu verifikasi.
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const pubJwk = publicKey.export({ format: "jwk" });
  const privJwk = privateKey.export({ format: "jwk" });
  const publikB64 = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(pubJwk.x, "base64url"),
    Buffer.from(pubJwk.y, "base64url"),
  ]).toString("base64url");
  const b64 = (b) => Buffer.from(b).toString("base64url");
  const header = b64(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const klaim = b64(
    JSON.stringify({
      aud: "https://push-contoh.invalid",
      exp: Math.floor(Date.now() / 1000) + 12 * 3600,
      sub: "mailto:uji@prata.id",
    }),
  );
  const data = `${header}.${klaim}`;
  const kunciPrivat = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: pubJwk.x,
      y: pubJwk.y,
      d: privJwk.d,
    },
    format: "jwk",
  });
  const tanda = sign("sha256", Buffer.from(data, "utf8"), {
    key: kunciPrivat,
    dsaEncoding: "ieee-p1363",
  });
  const jwt = `${data}.${b64(tanda)}`;
  const kunciPublik = createPublicKey({
    key: { kty: "EC", crv: "P-256", x: pubJwk.x, y: pubJwk.y },
    format: "jwk",
  });
  const sah = verify("sha256", Buffer.from(data, "utf8"), {
    key: kunciPublik,
    dsaEncoding: "ieee-p1363",
  }, Buffer.from(jwt.split(".")[2], "base64url"));
  const klaimBacaan = JSON.parse(
    Buffer.from(klaim, "base64url").toString("utf8"),
  );
  cek(
    "E3-JWT: JWT VAPID ES256 terverifikasi kunci publik (header/klaim benar)",
    sah &&
      jwt.split(".").length === 3 &&
      klaimBacaan.aud === "https://push-contoh.invalid" &&
      klaimBacaan.sub === "mailto:uji@prata.id" &&
      publikB64.length > 80,
  );
}

// ---------- Asersi sumber ----------
// E1: hook kejadian nyata
const editorial = bacaRepo("src/lib/admin/editorial.ts");
cek(
  "E1-hook: terbitkanArtikel memanggil kirimNotifikasiTopik",
  editorial.includes("kirimNotifikasiTopik(null, baru.id)"),
);
cek(
  "E1-hook: tindaklanjutiKoreksi memberi notifikasi pelapor (3 status)",
  editorial.includes('beriNotifikasiKoreksi(adapter, koreksi, "ditinjau")') &&
    editorial.includes('beriNotifikasiKoreksi(adapter, koreksi, "ditolak")') &&
    editorial.includes('beriNotifikasiKoreksi(adapter, koreksi, "diperbaiki")'),
);
const tanyaRoute = bacaRepo("src/app/api/admin/tanya/[id]/route.ts");
cek(
  "E1-hook: PATCH tanya memanggil kirimNotifikasiJawaban saat terjawab/tidak_ada_data",
  tanyaRoute.includes("kirimNotifikasiJawaban(null, id)") &&
    tanyaRoute.includes('patch.status === "terjawab"'),
);
const podcastRoute = bacaRepo("src/app/api/admin/podcast/route.ts");
const podcastIdRoute = bacaRepo("src/app/api/admin/podcast/[id]/route.ts");
cek(
  "E1-hook: POST podcast memanggil kirimNotifikasiPodcast saat status terbit",
  podcastRoute.includes("kirimNotifikasiPodcast(") &&
    podcastRoute.includes('status === "terbit"'),
);
cek(
  "E1-hook: PATCH podcast memanggil kirimNotifikasiPodcast saat status terbit",
  podcastIdRoute.includes("kirimNotifikasiPodcast(null, id)") &&
    podcastIdRoute.includes('patch.status === "terbit"'),
);
// E1: penulis + preferensi + dedup
const tulis = bacaRepo("src/lib/notifikasi/tulis.ts");
cek(
  "E1-tulis: penulis memeriksa preferensi per jenis",
  tulis.includes('"notifikasi_topik"') &&
    tulis.includes('"notifikasi_koreksi"') &&
    tulis.includes('"notifikasi_jawaban"') &&
    tulis.includes('"notifikasi_podcast"'),
);
cek(
  "E1-tulis: dedup kunci_dedup + alasan preferensi-nonaktif/duplikat",
  tulis.includes("kunci_dedup") &&
    tulis.includes("preferensi-nonaktif") &&
    tulis.includes("duplikat"),
);
cek(
  "E1-tulis: fan-out dibatasi (topik 1000, podcast 500, push 100)",
  tulis.includes("slice(0, 1000)") &&
    tulis.includes(".limit(500)") &&
    tulis.includes("slice(0, 100)"),
);
cek(
  "E1-tulis: pencocokan negara memakai kode DAN nama (ilike)",
  tulis.includes("target.ilike.${a.negara_kode}") &&
    tulis.includes("target.ilike.${namaNegara}"),
);
cek(
  "E1-tulis: notifikasi jawaban hanya membaca id/user_id/status pertanyaan (tanpa isi pertanyaan)",
  tulis.includes('"id, user_id, status"') &&
    !tulis.includes("select(\"id, user_id, pertanyaan"),
);
// E1: API + UI
const notifRoute = bacaRepo("src/app/api/notifikasi/route.ts");
cek(
  "E1-api: GET/PATCH /api/notifikasi tetap ada (baca + tandai dibaca)",
  notifRoute.includes("export async function GET") &&
    notifRoute.includes("export async function PATCH"),
);
const jumlahRoute = bacaRepo("src/app/api/notifikasi/jumlah/route.ts");
cek(
  "E1-api: /api/notifikasi/jumlah menghitung belum dibaca (count exact)",
  jumlahRoute.includes("belum_dibaca") && jumlahRoute.includes("count"),
);
const header = bacaRepo("src/components/Header.tsx");
cek(
  "E1-ui: Header memasang NotifikasiBadge + PelacakKunjungan",
  header.includes("<NotifikasiBadge />") &&
    header.includes("<PelacakKunjungan />"),
);
const badge = bacaRepo("src/components/NotifikasiBadge.tsx");
cek(
  "E1-ui: badge membaca /api/notifikasi/jumlah + tautan /saya/notifikasi",
  badge.includes("/api/notifikasi/jumlah") &&
    badge.includes("/saya/notifikasi"),
);
cek(
  "E1-ui: halaman /saya/notifikasi ada (daftar + preferensi + push)",
  fs.existsSync(`${DIR_REPO}/src/app/saya/notifikasi/page.tsx`) &&
    bacaRepo("src/app/saya/notifikasi/page.tsx").includes("FormPreferensiNotifikasi") &&
    bacaRepo("src/app/saya/notifikasi/page.tsx").includes("PengalihPush"),
);
const preferensiRoute = bacaRepo("src/app/api/saya/preferensi/route.ts");
cek(
  "E1-api: preferensi mendukung notifikasi_jawaban/notifikasi_podcast/push_notifikasi",
  preferensiRoute.includes("notifikasi_jawaban") &&
    preferensiRoute.includes("notifikasi_podcast") &&
    preferensiRoute.includes("push_notifikasi"),
);
// E3: push
const push = bacaRepo("src/lib/notifikasi/push.ts");
cek(
  "E3-kode: push memakai env VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT",
  push.includes("VAPID_PUBLIC_KEY") &&
    push.includes("VAPID_PRIVATE_KEY") &&
    push.includes("VAPID_SUBJECT"),
);
cek(
  "E3-kode: JWT ditandatangani ES256 via node:crypto (tanpa lib push)",
  push.includes('sign("sha256"') &&
    push.includes('dsaEncoding: "ieee-p1363"') &&
    push.includes("createPrivateKey") &&
    !push.includes('from "web-push"') &&
    !push.includes("require(\"web-push\")") &&
    !push.includes("BEGIN EC PRIVATE KEY"),
);
const packageJson = JSON.parse(bacaRepo("package.json"));
cek(
  "E3-dep: tanpa dependensi web-push di package.json (laporan instalasi bila dibutuhkan nanti)",
  !("web-push" in (packageJson.dependencies ?? {})) &&
    !("web-push" in (packageJson.devDependencies ?? {})),
);
const sw = bacaRepo("public/sw.js");
cek(
  "E3-sw: service worker menangani push + notificationclick + ambil /api/notifikasi",
  sw.includes('addEventListener("push"') &&
    sw.includes('addEventListener("notificationclick"') &&
    sw.includes("/api/notifikasi"),
);
cek(
  "E3-api: /api/push/langganan ada (GET/POST/DELETE) + /api/push/uji ada",
  fs.existsSync(`${DIR_REPO}/src/app/api/push/langganan/route.ts`) &&
    fs.existsSync(`${DIR_REPO}/src/app/api/push/uji/route.ts`) &&
    bacaRepo("src/app/api/push/langganan/route.ts").includes("export async function DELETE"),
);
// D1: tracker + analitik + monitoring
const tracker = bacaRepo("src/components/PelacakKunjungan.tsx");
cek(
  "D1-ui: tracker mengirim beacon path ke /api/analytics/kunjungan",
  tracker.includes("sendBeacon") &&
    tracker.includes("/api/analytics/kunjungan"),
);
const kunjunganRoute = bacaRepo("src/app/api/analytics/kunjungan/route.ts");
cek(
  "D1-api: route kunjungan menormalisasi path (tanpa query/hash)",
  kunjunganRoute.includes("normalisasiPath"),
);
const kunjunganLib = bacaRepo("src/lib/analytics/kunjungan.ts");
cek(
  "D1-privasi: insert kunjungan hanya berisi path/user_id/masuk (tanpa ip/header)",
  kunjunganLib.includes("path: input.path") &&
    kunjunganLib.includes("user_id: input.userId") &&
    kunjunganLib.includes("masuk: input.userId !== null") &&
    !kunjunganLib.includes("headers") &&
    !kunjunganLib.includes("x-forwarded-for") &&
    !kunjunganRoute.includes("x-forwarded-for"),
);
const analitik = bacaRepo("src/app/admin/analitik/page.tsx");
cek(
  "D1-admin: /admin/analitik membaca RPC harian + jalur (angka nyata)",
  analitik.includes("pf_kunjungan_harian") &&
    analitik.includes("pf_kunjungan_jalur"),
);
cek(
  "D1-admin: /admin/analitik jujur bila tabel belum ada (tanpa angka contoh)",
  analitik.includes("TIDAK menampilkan angka contoh") ||
    analitik.includes("tanpa tabel, tidak ada angka"),
);
const monitoring = bacaRepo("src/app/admin/monitoring/page.tsx");
cek(
  "D1-admin: /admin/monitoring menampilkan pf_app_errors",
  monitoring.includes("pf_app_errors") && monitoring.includes("Galat Aplikasi"),
);
const guard = bacaRepo("src/lib/admin/guard.ts");
cek(
  "D1-galat: responGalatAdmin mencatat ke pf_app_errors (catatGalatAplikasi)",
  guard.includes("catatGalatAplikasi"),
);
// DDL v14 inline di baterai = DDL yang dilaporkan
cek(
  "v14-ddl: baterai memuat DDL v14 inline (bukan migrasi repo)",
  bacaRepo("scripts/uji-ultimate-b2-notifikasi.mjs").includes("DDL_V14") &&
    bacaRepo("scripts/uji-ultimate-b2-notifikasi.mjs").includes("pf_bersihkan_data_lama"),
);

// ---------- Ringkasan ----------
console.log(`\nRingkasan B2-D: ${lolos} lolos, ${gagal} gagal.`);
if (gagal > 0) {
  console.log("BATAS: lihat 'BATAS KEJUJURAN' di kepala berkas — HTTP hidup + push nyata belum teruji.");
  process.exit(1);
}
process.exit(0);
