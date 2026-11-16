// Uji Gelombang B2-A PRATA FAKTA (Akun & Privasi: hapus akun mandiri
// A1 + ekspor/privasi A2) -> PGlite.
// Menerapkan v1–v13 (pola uji-ultimate-backend.mjs) + DDL v14
// INLINE (bukan migrasi — v14 dirakit koordinator), lalu memeriksa:
//
//   A. Helper murni (KODE ASLI, diimpor langsung — Node 24
//      type-stripping): token hapus (acak/unika, sha256, hash
//      email case-insensitive, kedaluwarsa 24 jam), paginasi
//      ekspor penuh (multi-halaman, batas halaman persis, kosong,
//      batas keselamatan, galat merambat), JENIS_DATA (11 jenis).
//   B. BUKTI CASCADE (SQL, bukan klaim audit): hapus satu pengguna
//      dari auth.users -> 12 tabel personal KOSONG untuk pengguna
//      itu; 8 FK SET NULL menganonimkan konten (artikel,
//      versi, laporan koreksi, kajian verifikasi, audit, review,
//      penerbit, pertanyaan) — baris tetap ada, FK null;
//      langganan newsletter TIDAK ikut terhapus (tanpa FK) —
//      membuktikan route WAJIB menghapusnya eksplisit menurut
//      email; pengguna lain tidak tersentuh.
//   C. DDL v14 inline: pf_account_deletions (kolom, CHECK status,
//      token_hash unik + format sha256, user_id TANPA FK agar
//      jejak bertahan sesudah akun hilang, 0 policy — service
//      role saja); token sekali pakai (klaim kedua 0 baris);
//      kedaluwarsa (baris lewat waktu tidak lolos verifikasi);
//      CHECK audit v14: 4 aksi baru DITOLAK sebelum v14 dan
//      DITERIMA sesudah v14 (membuktikan dependensi v14);
//      policy DELETE pemilik baru (skor/notifikasi/preferensi/
//      pertanyaan): pemilik bisa hapus miliknya, orang lain 0.
//   D. Audit migrasi v1–v13 (grep SQL): tepat 12 FK CASCADE +
//      8 FK SET NULL ke auth.users; pf_account_deletions TIDAK
//      ADA di v1–v13 (klaim audit "migrasi v13" SALAH —
//      dibuktikan di sini); newsletter tanpa FK.
//   E. Asersi sumber route/UI: minta tautan (signInWithOtp,
//      redirect konfirmasi, limiter keras 3/jam, audit
//      akun.hapus.minta, TANPA password); eksekusi hapus
//      (deleteUser, audit akun.hapus + akun.hapus.gagal, penjaga
//      super_admin terakhir, hapus newsletter, cekOrigin);
//      hapus per item (data.hapus, filter user_id, 404 bila 0);
//      ekspor tanpa batas (.range, tanpa .limit, lengkap, 4
//      tabel baru); halaman + komponen UI + empty state.
//
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// BATAS KEJUJURAN baterai ini (bukan klaim lebih):
// - Pengiriman email + klik tautan + DELETE HTTP hidup TIDAK
//   diuji di sini (butuh Supabase Auth + SMTP + server jalan);
//   yang diuji: token/hash/kedaluwarsa/sekali-pakai di SQL +
//   asersi sumber bahwa route memakai signInWithOtp +
//   deleteUser + audit wajib. Verifikasi HTTP hidup + klik
//   browser nyata tetap tugas tahap browser/koordinator.
// - Atomicity klaim token: PGlite satu koneksi — uji ini
//   membuktikan klaim kedua (status sudah berubah) 0 baris,
//   bukan race dua koneksi bersamaan.
// - pf_account_deletions diuji dari DDL INLINE di bawah
//   (teks yang sama dilaporkan ke koordinator untuk v14),
//   bukan dari berkas migrasi — karena v14 belum ada.
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = require("@electric-sql/pglite");

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

async function sebagaiUid(uid, role, sql, params = []) {
  await db.query(`select set_config('pf.uid_test', $1, false)`, [uid]);
  try {
    return await sebagai(role, sql, params);
  } finally {
    await db.query(`select set_config('pf.uid_test', '', false)`);
  }
}

async function hitung(sql, params = []) {
  const r = await db.query(sql, params);
  return Number(r.rows[0]?.n ?? 0);
}

// ---------- DDL v14 (TEKS PERSIS yang dilaporkan ke koordinator) ----------
const DDL_V14 = `
-- §1. pf_account_deletions — jejak permintaan + penghapusan akun.
-- user_id SENGAJA TANPA FK ke auth.users: baris ini HARUS bertahan
-- sesudah akun dihapus (bukti penghapusan); FK cascade akan
-- menghapus buktinya sendiri. Email hanya sebagai hash sha256.
create table if not exists public.pf_account_deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'menunggu'
    check (status in ('menunggu', 'dikonfirmasi', 'dihapus', 'gagal', 'dibatalkan')),
  diminta_pada timestamptz not null default now(),
  dipakai_pada timestamptz,
  dihapus_pada timestamptz,
  kedaluwarsa_pada timestamptz not null
);
create index if not exists pf_account_deletions_user_idx
  on public.pf_account_deletions (user_id);
alter table public.pf_account_deletions enable row level security;
revoke all on public.pf_account_deletions from public;
revoke all on public.pf_account_deletions from anon, authenticated;
grant select, insert, update, delete on public.pf_account_deletions to service_role;

-- §2. CHECK audit v14: 53 aksi v11 + 4 aksi B2-A.
do $$
declare
  r record;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_audit_logs'::regclass
      and conname = 'pf_audit_logs_aksi_check_v14'
  ) then
    return;
  end if;
  for r in
    select conname from pg_constraint
    where conrelid = 'public.pf_audit_logs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%aksi%'
  loop
    execute 'alter table public.pf_audit_logs drop constraint ' || quote_ident(r.conname);
  end loop;
  alter table public.pf_audit_logs
    add constraint pf_audit_logs_aksi_check_v14
    check (aksi in (
      'artikel.buat', 'artikel.ubah', 'artikel.hapus', 'artikel.terbit', 'artikel.batal_terbit', 'artikel.jadwalkan',
      'review.setuju', 'review.tolak', 'review.kembalikan',
      'verifikasi.ubah', 'koreksi.terima', 'koreksi.tolak', 'koreksi.ditinjau',
      'pengguna.role', 'pengguna.nonaktif', 'pengguna.aktifkan',
      'sistem.job', 'sistem.kategori', 'brief.terbit',
      'cerita.buat', 'cerita.ubah', 'cerita.hapus',
      'pengetahuan.buat', 'pengetahuan.ubah', 'pengetahuan.hapus',
      'event.buat', 'event.ubah', 'event.hapus',
      'data.indikator', 'data.titik',
      'riset.buat', 'riset.ubah', 'riset.hapus',
      'negara.buat', 'negara.ubah', 'negara.hapus',
      'tanya.jawab',
      'akademi.kursus', 'akademi.modul', 'akademi.progres',
      'podcast.episode', 'podcast.terbit',
      'sistem.flag', 'sistem.pengumuman',
      'kuis.buat', 'kuis.ubah',
      'preferensi.ubah', 'ekspor.data',
      'sumber.buat', 'sumber.ubah', 'sumber.hapus', 'sumber.cek', 'sumber.aktif',
      'akun.hapus.minta', 'akun.hapus', 'akun.hapus.gagal', 'data.hapus'
    ));
end $$;

-- §3. Policy DELETE pemilik (baru di v14 — belum ada di v1–v13).
drop policy if exists "pf_quiz_scores hapus pemilik" on public.pf_quiz_scores;
create policy "pf_quiz_scores hapus pemilik"
  on public.pf_quiz_scores for delete using (auth.uid() = user_id);
drop policy if exists "pf_notifications hapus pemilik" on public.pf_notifications;
create policy "pf_notifications hapus pemilik"
  on public.pf_notifications for delete using (auth.uid() = user_id);
drop policy if exists "pf_user_preferences hapus pemilik" on public.pf_user_preferences;
create policy "pf_user_preferences hapus pemilik"
  on public.pf_user_preferences for delete using (auth.uid() = user_id);
drop policy if exists "pf_questions hapus pemilik" on public.pf_questions;
create policy "pf_questions hapus pemilik"
  on public.pf_questions for delete using (auth.uid() = user_id);

-- §3b. GRANT DELETE (v9 hanya memberi SELECT/INSERT/UPDATE
-- pada tabel-tabel ini — policy DELETE tanpa GRANT tetap
-- ditolak 42501 "permission denied"). Hanya authenticated
-- (pemilik, via policy); anon tidak diberi apa pun.
grant delete on public.pf_quiz_scores to authenticated;
grant delete on public.pf_notifications to authenticated;
grant delete on public.pf_user_preferences to authenticated;
grant delete on public.pf_questions to authenticated;
`;

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
const UID_C = "33333333-3333-3333-3333-333333333333";

// ================= A. Helper murni (kode asli) =================
const tokenMod = await import(
  pathToFileURL(`${DIR_REPO}/src/lib/akun/token-hapus.ts`).href
);
const paginasiMod = await import(
  pathToFileURL(`${DIR_REPO}/src/lib/akun/paginasi.ts`).href
);
const jenisMod = await import(
  pathToFileURL(`${DIR_REPO}/src/lib/akun/jenis-data.ts`).href
);

const t1 = tokenMod.buatTokenHapus();
const t2 = tokenMod.buatTokenHapus();
cek("A1 token acak: dua token berbeda", t1 !== t2);
cek(
  "A2 token base64url aman URL (tanpa +/=)",
  /^[A-Za-z0-9_-]+$/.test(t1) && t1.length >= 32,
  `panjang ${t1.length}`,
);
cek(
  "A3 hashToken deterministik 64 hex + bukan token mentah",
  tokenMod.hashToken(t1) === tokenMod.hashToken(t1) &&
    /^[0-9a-f]{64}$/.test(tokenMod.hashToken(t1)) &&
    tokenMod.hashToken(t1) !== t1,
);
cek(
  "A4 hashToken berbeda per token",
  tokenMod.hashToken(t1) !== tokenMod.hashToken(t2),
);
cek(
  "A5 hashEmail case-insensitive + bukan email mentah",
  tokenMod.hashEmail("A@Uji.ID") === tokenMod.hashEmail("a@uji.id") &&
    tokenMod.hashEmail("a@uji.id") !== "a@uji.id",
);
cek(
  "A6 token baru tidak kedaluwarsa; 25 jam lalu kedaluwarsa; tanggal rusak kedaluwarsa",
  tokenMod.apakahTokenKedaluwarsa(new Date().toISOString()) === false &&
    tokenMod.apakahTokenKedaluwarsa(
      new Date(Date.now() - 25 * 3600 * 1000).toISOString(),
    ) === true &&
    tokenMod.apakahTokenKedaluwarsa("bukan-tanggal") === true,
);
cek(
  "A7 KEDALUWARSA_HAPUS_MS = 24 jam",
  tokenMod.KEDALUWARSA_HAPUS_MS === 24 * 3600 * 1000,
);

// Paginasi: tiruan ambilHalaman atas array (kontrak .range inklusif).
async function tiruanAmbil(semua) {
  return async (dari, sampai) => semua.slice(dari, sampai + 1);
}
{
  const r = await paginasiMod.ambilSemuaHalaman(
    await tiruanAmbil([1, 2, 3, 4, 5], 2),
    { ukuranHalaman: 2 },
  );
  cek(
    "A8 paginasi 5 baris / halaman 2 -> 5 baris, lengkap",
    r.baris.length === 5 && r.lengkap && !r.terpotong,
    JSON.stringify(r.baris),
  );
  const r2 = await paginasiMod.ambilSemuaHalaman(
    await tiruanAmbil([1, 2, 3, 4], 2),
    { ukuranHalaman: 2 },
  );
  cek(
    "A9 paginasi batas persis (4 baris / halaman 2) -> 4 baris, lengkap",
    r2.baris.length === 4 && r2.lengkap,
  );
  const r3 = await paginasiMod.ambilSemuaHalaman(
    await tiruanAmbil([], 2),
    { ukuranHalaman: 2 },
  );
  cek(
    "A10 paginasi kosong -> 0 baris, lengkap",
    r3.baris.length === 0 && r3.lengkap,
  );
  const r4 = await paginasiMod.ambilSemuaHalaman(
    await tiruanAmbil([1, 2, 3, 4, 5, 6, 7], 2),
    { ukuranHalaman: 2, batasMaks: 5 },
  );
  cek(
    "A11 paginasi batas keselamatan: 7 baris, cap 5 -> 5 baris, terpotong",
    r4.baris.length === 5 && !r4.lengkap && r4.terpotong,
  );
  let galatMerambat = false;
  try {
    await paginasiMod.ambilSemuaHalaman(
      async () => {
        throw new Error("db-putus");
      },
      { ukuranHalaman: 2 },
    );
  } catch (e) {
    galatMerambat = e.message === "db-putus";
  }
  cek("A12 paginasi galat halaman merambat (tidak ditelan)", galatMerambat);
}
cek(
  "A13 JENIS_DATA 11 jenis + tabel sesuai migrasi",
  jenisMod.DAFTAR_JENIS_DATA.length === 11 &&
    jenisMod.JENIS_DATA.bookmark.tabel === "pf_bookmarks" &&
    jenisMod.JENIS_DATA.skor.tabel === "pf_quiz_scores" &&
    jenisMod.JENIS_DATA.preferensi.tabel === "pf_user_preferences",
);
cek(
  "A14 apakahJenisData menerima 'skor', menolak 'bogus'/null",
  jenisMod.apakahJenisData("skor") === true &&
    jenisMod.apakahJenisData("bogus") === false &&
    jenisMod.apakahJenisData(null) === false,
);

// ================= D. Audit migrasi v1–v13 (grep SQL) =================
{
  const semuaSql = [...MIGRASI_V1_V12, MIGRASI_V13]
    .map((n) => fs.readFileSync(`${DIR_MIGRASI}/${n}`, "utf8"))
    .join("\n");
  const cascade = semuaSql.match(
    /references auth\.users \(id\) on delete cascade/gi,
  ) ?? [];
  const setNull = semuaSql.match(
    /references auth\.users \(id\) on delete set null/gi,
  ) ?? [];
  cek(
    "D1 tepat 12 FK ON DELETE CASCADE ke auth.users (data personal)",
    cascade.length === 12,
    `ditemukan ${cascade.length}`,
  );
  cek(
    "D2 tepat 8 FK ON DELETE SET NULL ke auth.users (anonimisasi konten)",
    setNull.length === 8,
    `ditemukan ${setNull.length}`,
  );
  cek(
    "D3 pf_account_deletions TIDAK ADA di v1–v13 (klaim audit v13 salah)",
    !semuaSql.includes("pf_account_deletions"),
  );
  const v1 = fs.readFileSync(
    `${DIR_MIGRASI}/20261116_pf_v1_foundation.sql`,
    "utf8",
  );
  cek(
    "D4 pf_newsletter_subscribers tanpa FK ke auth.users (celah cascade)",
    !/pf_newsletter_subscribers[\s\S]{0,400}references auth\.users/.test(v1),
  );
  // Nama tabel cascade (bukti eksplisit untuk laporan).
  const tabelCascade = [
    "pf_profiles",
    "pf_user_roles",
    "pf_bookmarks",
    "pf_reading_history",
    "pf_followed_topics",
    "pf_notifications",
    "pf_quiz_scores",
    "pf_user_preferences",
    "pf_story_followers",
    "pf_course_progress",
    "pf_podcast_history",
    "pf_podcast_playlist_items",
  ];
  for (const t of tabelCascade) {
    const ada = new RegExp(
      `create table if not exists public\\.${t} [\\s\\S]{0,600}?references auth\\.users \\(id\\) on delete cascade`,
      "i",
    ).test(semuaSql);
    cek(`D5 cascade: ${t}`, ada);
  }
}

// ================= Setup PGlite + migrasi =================
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

for (const nama of MIGRASI_V1_V12) {
  const ok = await jalankan(`migrasi ${nama} (putaran 1)`, baca(nama));
  if (!ok) process.exit(1);
}

// Seed pengguna (sesudah v1–v12, SEBELUM v13 — pola B1).
await db.query(
  `insert into auth.users (id, email) values ($1, 'a@uji.id'), ($2, 'b@uji.id')`,
  [UID_A, UID_B],
);
await db.query(
  `insert into public.pf_user_roles (user_id, role_id)
   select $1::uuid, id from public.pf_roles where nama = 'user'
   on conflict (user_id, role_id) do nothing`,
  [UID_A],
);
await db.query(
  `insert into public.pf_user_roles (user_id, role_id)
   select $1::uuid, id from public.pf_roles where nama = 'user'
   on conflict (user_id, role_id) do nothing`,
  [UID_B],
);
console.log("OK: seed pengguna A + B");

{
  const ok = await jalankan(`migrasi ${MIGRASI_V13}`, baca(MIGRASI_V13));
  if (!ok) process.exit(1);
}

// ---------- C0. Aksi audit baru DITOLAK sebelum v14 ----------
{
  let ditolak = false;
  try {
    await db.query(
      `insert into public.pf_audit_logs (aktor_id, aksi, entitas) values (null, 'akun.hapus', 'auth.users')`,
    );
  } catch {
    ditolak = true;
  }
  cek(
    "C0 audit 'akun.hapus' DITOLAK sebelum v14 (CHECK v11)",
    ditolak,
  );
}

// ---------- Seed data pengguna A (12 cascade + 8 set-null + newsletter) ----------
await db.query(
  `insert into public.pf_categories (slug, nama) values ('uji', 'Uji') on conflict (slug) do nothing`,
);
const artikelA = (
  await db.query(
    `insert into public.pf_articles (slug, judul, kategori_slug, penulis_id, diterbitkan_oleh)
     values ('uji-a', 'Artikel Uji A', 'uji', $1::uuid, $1::uuid) returning id`,
    [UID_A],
  )
).rows[0].id;
const artikelB = (
  await db.query(
    `insert into public.pf_articles (slug, judul, kategori_slug)
     values ('uji-b', 'Artikel Uji B', 'uji') returning id`,
    [],
  )
).rows[0].id;
const storyId = (
  await db.query(
    `insert into public.pf_stories (slug, judul) values ('story-uji', 'Story Uji') returning id`,
  )
).rows[0].id;
const kursusId = (
  await db.query(
    `insert into public.pf_courses (slug, judul) values ('kursus-uji', 'Kursus Uji') returning id`,
  )
).rows[0].id;
const modulId = (
  await db.query(
    `insert into public.pf_course_modules (course_id, judul) values ($1::uuid, 'Modul Uji') returning id`,
    [kursusId],
  )
).rows[0].id;
const lessonId = (
  await db.query(
    `insert into public.pf_course_lessons (module_id, judul) values ($1::uuid, 'Pelajaran Uji') returning id`,
    [modulId],
  )
).rows[0].id;
const episodeId = (
  await db.query(
    `insert into public.pf_podcast_episodes (slug, judul, teks_naskah) values ('ep-uji', 'Episode Uji', 'naskah') returning id`,
  )
).rows[0].id;

await db.query(
  `insert into public.pf_bookmarks (user_id, artikel_id) values ($1::uuid, $2::uuid)`,
  [UID_A, artikelA],
);
await db.query(
  `insert into public.pf_bookmarks (user_id, artikel_id) values ($1::uuid, $2::uuid)`,
  [UID_B, artikelB],
);
await db.query(
  `insert into public.pf_reading_history (user_id, artikel_id, selesai) values ($1::uuid, $2::uuid, true)`,
  [UID_A, artikelA],
);
await db.query(
  `insert into public.pf_followed_topics (user_id, tipe, target) values ($1::uuid, 'kategori', 'uji')`,
  [UID_A],
);
await db.query(
  `insert into public.pf_notifications (user_id, jenis, judul) values ($1::uuid, 'artikel', 'Notif Uji')`,
  [UID_A],
);
await db.query(
  `insert into public.pf_quiz_scores (user_id, tanggal, benar, total) values ($1::uuid, '2026-11-16', 4, 5)`,
  [UID_A],
);
await db.query(
  `insert into public.pf_user_preferences (user_id) values ($1::uuid)`,
  [UID_A],
);
await db.query(
  `insert into public.pf_story_followers (user_id, story_id) values ($1::uuid, $2::uuid)`,
  [UID_A, storyId],
);
await db.query(
  `insert into public.pf_course_progress (user_id, lesson_id, selesai) values ($1::uuid, $2::uuid, true)`,
  [UID_A, lessonId],
);
await db.query(
  `insert into public.pf_podcast_history (user_id, episode_id) values ($1::uuid, $2::uuid)`,
  [UID_A, episodeId],
);
await db.query(
  `insert into public.pf_podcast_playlist_items (user_id, episode_id) values ($1::uuid, $2::uuid)`,
  [UID_A, episodeId],
);
// SET NULL: konten milik A yang harus bertahan tanpa nama.
await db.query(
  `insert into public.pf_article_versions (artikel_id, versi, dibuat_oleh) values ($1::uuid, 1, $2::uuid)`,
  [artikelA, UID_A],
);
await db.query(
  `insert into public.pf_correction_reports (artikel_id, pelapor_id, jenis, pesan) values ($1::uuid, $2::uuid, 'typo', 'ada salah ketik')`,
  [artikelA, UID_A],
);
await db.query(
  `insert into public.pf_verification_records (artikel_id, keputusan, dibuat_oleh) values ($1::uuid, 'VERIFIED', $2::uuid)`,
  [artikelA, UID_A],
);
await db.query(
  `insert into public.pf_audit_logs (aktor_id, aksi, entitas, entitas_id) values ($1::uuid, 'artikel.buat', 'pf_articles', $2::uuid)`,
  [UID_A, artikelA],
);
await db.query(
  `insert into public.pf_editorial_reviews (artikel_id, reviewer_id, keputusan, catatan) values ($1::uuid, $2::uuid, 'setuju', 'ok')`,
  [artikelA, UID_A],
);
const pertanyaanA = (
  await db.query(
    `insert into public.pf_questions (user_id, pertanyaan) values ($1::uuid, 'Apa itu uji?') returning id`,
    [UID_A],
  )
).rows[0].id;
await db.query(
  `insert into public.pf_newsletter_subscribers (email) values ('a@uji.id')`,
);
console.log("OK: seed data pengguna A (cascade + set-null + newsletter)");

// ---------- B. BUKTI CASCADE ----------
{
  const sebelum = {
    profil: await hitung(`select count(*) n from public.pf_profiles where id = $1::uuid`, [UID_A]),
    bookmarkA: await hitung(`select count(*) n from public.pf_bookmarks where user_id = $1::uuid`, [UID_A]),
    bookmarkB: await hitung(`select count(*) n from public.pf_bookmarks where user_id = $1::uuid`, [UID_B]),
  };
  cek("B0 seed lengkap sebelum hapus (profil 1, bookmark A 1, B 1)", sebelum.profil === 1 && sebelum.bookmarkA === 1 && sebelum.bookmarkB === 1);

  await db.query(`delete from auth.users where id = $1::uuid`, [UID_A]);

  const tabelPersonal = [
    "pf_profiles",
    "pf_user_roles",
    "pf_bookmarks",
    "pf_reading_history",
    "pf_followed_topics",
    "pf_notifications",
    "pf_quiz_scores",
    "pf_user_preferences",
    "pf_story_followers",
    "pf_course_progress",
    "pf_podcast_history",
    "pf_podcast_playlist_items",
  ];
  for (const t of tabelPersonal) {
    const kolom = t === "pf_profiles" ? "id" : "user_id";
    const sisa = await hitung(
      `select count(*) n from public.${t} where ${kolom} = $1::uuid`,
      [UID_A],
    );
    cek(`B1 cascade hapus: ${t} 0 baris untuk A`, sisa === 0, `sisa ${sisa}`);
  }
  // SET NULL: baris bertahan, FK null.
  const cekNull = [
    ["pf_articles.penulis_id", `select count(*) n from public.pf_articles where id = $1::uuid and penulis_id is null`, [artikelA]],
    ["pf_articles.diterbitkan_oleh", `select count(*) n from public.pf_articles where id = $1::uuid and diterbitkan_oleh is null`, [artikelA]],
    ["pf_article_versions.dibuat_oleh", `select count(*) n from public.pf_article_versions where artikel_id = $1::uuid and dibuat_oleh is null`, [artikelA]],
    ["pf_correction_reports.pelapor_id", `select count(*) n from public.pf_correction_reports where artikel_id = $1::uuid and pelapor_id is null`, [artikelA]],
    ["pf_verification_records.dibuat_oleh", `select count(*) n from public.pf_verification_records where artikel_id = $1::uuid and dibuat_oleh is null`, [artikelA]],
    ["pf_audit_logs.aktor_id", `select count(*) n from public.pf_audit_logs where entitas_id = $1::text and aktor_id is null`, [artikelA]],
    ["pf_editorial_reviews.reviewer_id", `select count(*) n from public.pf_editorial_reviews where artikel_id = $1::uuid and reviewer_id is null`, [artikelA]],
    ["pf_questions.user_id", `select count(*) n from public.pf_questions where id = $1::uuid and user_id is null`, [pertanyaanA]],
  ];
  for (const [label, sql, params] of cekNull) {
    cek(`B2 anonimisasi (SET NULL, baris bertahan): ${label}`, (await hitung(sql, params)) === 1);
  }
  // Newsletter TIDAK ikut terhapus — bukti route wajib hapus eksplisit.
  cek(
    "B3 newsletter BERTAHAN sesudah akun hilang (tanpa FK) — route wajib hapus menurut email",
    (await hitung(`select count(*) n from public.pf_newsletter_subscribers where email = 'a@uji.id'`)) === 1,
  );
  // Pengguna B tidak tersentuh.
  cek(
    "B4 pengguna B utuh (bookmark 1, profil 1)",
    (await hitung(`select count(*) n from public.pf_bookmarks where user_id = $1::uuid`, [UID_B])) === 1 &&
      (await hitung(`select count(*) n from public.pf_profiles where id = $1::uuid`, [UID_B])) === 1,
  );
  // Artikel A sendiri bertahan (bukan milik personal).
  cek(
    "B5 artikel A bertahan sebagai arsip anonim",
    (await hitung(`select count(*) n from public.pf_articles where id = $1::uuid`, [artikelA])) === 1,
  );
}

// ---------- C. DDL v14 inline ----------
{
  const ok = await jalankan("DDL v14 inline (pf_account_deletions + CHECK + policy)", DDL_V14);
  if (!ok) process.exit(1);
}
{
  const kolom = await db.query(
    `select column_name, data_type, is_nullable from information_schema.columns
     where table_schema = 'public' and table_name = 'pf_account_deletions' order by ordinal_position`,
  );
  const namaKolom = kolom.rows.map((r) => r.column_name);
  cek(
    "C1 pf_account_deletions punya kolom lengkap",
    ["id", "user_id", "email_hash", "token_hash", "status", "diminta_pada", "dipakai_pada", "dihapus_pada", "kedaluwarsa_pada"].every((k) => namaKolom.includes(k)),
    namaKolom.join(","),
  );
  const fk = await hitung(
    `select count(*) n from pg_constraint where conrelid = 'public.pf_account_deletions'::regclass and contype = 'f'`,
  );
  cek("C2 pf_account_deletions TANPA FK (jejak bertahan sesudah hapus)", fk === 0);
  const rls = await hitung(
    `select count(*) n from pg_tables where schemaname = 'public' and tablename = 'pf_account_deletions' and rowsecurity`,
  );
  cek("C3 RLS aktif di pf_account_deletions", rls === 1);
  const nPolicy = await hitung(
    `select count(*) n from pg_policies where schemaname = 'public' and tablename = 'pf_account_deletions'`,
  );
  cek("C4 0 policy di pf_account_deletions (service role saja)", nPolicy === 0);
  const grantSvc = await db.query(
    `select has_table_privilege('service_role', 'public.pf_account_deletions', 'SELECT, INSERT, UPDATE, DELETE') as ok`,
  );
  cek("C5 service_role punya SELECT/INSERT/UPDATE/DELETE", grantSvc.rows[0].ok === true);
  const grantAnon = await db.query(
    `select has_table_privilege('anon', 'public.pf_account_deletions', 'SELECT') as ok`,
  );
  cek("C6 anon DITOLAK atas pf_account_deletions", grantAnon.rows[0].ok === false);

  // Status CHECK menolak nilai liar.
  let statusDitolak = false;
  try {
    await db.query(
      `insert into public.pf_account_deletions (user_id, email_hash, token_hash, status, kedaluwarsa_pada)
       values ($1::uuid, repeat('a', 64), repeat('b', 64), 'bogus', now() + interval '1 day')`,
      [UID_B],
    );
  } catch {
    statusDitolak = true;
  }
  cek("C7 CHECK status menolak 'bogus'", statusDitolak);
  // token_hash harus sha256 hex.
  let formatDitolak = false;
  try {
    await db.query(
      `insert into public.pf_account_deletions (user_id, email_hash, token_hash, status, kedaluwarsa_pada)
       values ($1::uuid, repeat('a', 64), 'bukan-hash', 'menunggu', now() + interval '1 day')`,
      [UID_B],
    );
  } catch {
    formatDitolak = true;
  }
  cek("C8 CHECK token_hash menolak bukan sha256 hex", formatDitolak);

  // Siklus token: verifikasi -> klaim sekali pakai -> klaim kedua 0.
  const hashB = tokenMod.hashToken("token-uji-b");
  await db.query(
    `insert into public.pf_account_deletions (user_id, email_hash, token_hash, status, kedaluwarsa_pada)
     values ($1::uuid, $2, $3, 'menunggu', now() + interval '1 day')`,
    [UID_B, tokenMod.hashEmail("b@uji.id"), hashB],
  );
  const lolosVerifikasi = await hitung(
    `select count(*) n from public.pf_account_deletions
     where token_hash = $1 and user_id = $2::uuid and status = 'menunggu' and kedaluwarsa_pada > now()`,
    [hashB, UID_B],
  );
  cek("C9 token menunggu + belum kedaluwarsa lolos verifikasi", lolosVerifikasi === 1);
  const klaim1 = await db.query(
    `update public.pf_account_deletions set status = 'dikonfirmasi', dipakai_pada = now()
     where token_hash = $1 and status = 'menunggu'`,
    [hashB],
  );
  cek("C10 klaim pertama 1 baris", klaim1.rowCount === 1);
  const klaim2 = await db.query(
    `update public.pf_account_deletions set status = 'dikonfirmasi', dipakai_pada = now()
     where token_hash = $1 and status = 'menunggu'`,
    [hashB],
  );
  cek("C11 klaim kedua 0 baris (sekali pakai)", klaim2.rowCount === 0);
  // token_hash unik.
  let duplikatDitolak = false;
  try {
    await db.query(
      `insert into public.pf_account_deletions (user_id, email_hash, token_hash, status, kedaluwarsa_pada)
       values ($1::uuid, $2, $3, 'menunggu', now() + interval '1 day')`,
      [UID_B, tokenMod.hashEmail("b@uji.id"), hashB],
    );
  } catch {
    duplikatDitolak = true;
  }
  cek("C12 token_hash unik (duplikat ditolak)", duplikatDitolak);
  // Kedaluwarsa: baris lewat waktu tidak lolos verifikasi.
  const hashKedaluwarsa = tokenMod.hashToken("token-kedaluwarsa");
  await db.query(
    `insert into public.pf_account_deletions (user_id, email_hash, token_hash, status, kedaluwarsa_pada)
     values ($1::uuid, $2, $3, 'menunggu', now() - interval '1 hour')`,
    [UID_B, tokenMod.hashEmail("b@uji.id"), hashKedaluwarsa],
  );
  const lolosKedaluwarsa = await hitung(
    `select count(*) n from public.pf_account_deletions
     where token_hash = $1 and status = 'menunggu' and kedaluwarsa_pada > now()`,
    [hashKedaluwarsa],
  );
  cek("C13 token kedaluwarsa TIDAK lolos verifikasi", lolosKedaluwarsa === 0);
  // Jejak bertahan sesudah akun hilang: baris untuk A (sudah dihapus) bisa disisip.
  const hashA = tokenMod.hashToken("token-uji-a");
  let jejakBisa = false;
  try {
    await db.query(
      `insert into public.pf_account_deletions (user_id, email_hash, token_hash, status, dihapus_pada, kedaluwarsa_pada)
       values ($1::uuid, $2, $3, 'dihapus', now(), now() + interval '1 day')`,
      [UID_A, tokenMod.hashEmail("a@uji.id"), hashA],
    );
    jejakBisa = true;
  } catch {
    jejakBisa = false;
  }
  cek("C14 jejak penghapusan untuk pengguna yang SUDAH dihapus bisa disisip", jejakBisa);
  // CHECK audit v14: 4 aksi baru diterima; aksi liar tetap ditolak.
  for (const aksi of ["akun.hapus.minta", "akun.hapus", "akun.hapus.gagal", "data.hapus"]) {
    let bisa = false;
    try {
      await db.query(
        `insert into public.pf_audit_logs (aktor_id, aksi, entitas) values (null, $1, 'uji')`,
        [aksi],
      );
      bisa = true;
    } catch {
      bisa = false;
    }
    cek(`C15 CHECK v14 menerima aksi '${aksi}'`, bisa);
  }
  let aksiLiarDitolak = false;
  try {
    await db.query(
      `insert into public.pf_audit_logs (aktor_id, aksi, entitas) values (null, 'aksi.bogus', 'uji')`,
    );
  } catch {
    aksiLiarDitolak = true;
  }
  cek("C16 CHECK v14 tetap menolak aksi liar", aksiLiarDitolak);

  // Policy DELETE pemilik baru: pemilik bisa, orang lain 0 baris.
  await db.query(
    `insert into public.pf_quiz_scores (user_id, tanggal, benar, total) values ($1::uuid, '2026-11-15', 3, 5)`,
    [UID_B],
  );
  await db.query(
    `insert into public.pf_notifications (user_id, jenis, judul) values ($1::uuid, 'topik', 'Notif B')`,
    [UID_B],
  );
  await db.query(
    `insert into public.pf_user_preferences (user_id) values ($1::uuid)`,
    [UID_B],
  );
  const pertanyaanB = (
    await db.query(
      `insert into public.pf_questions (user_id, pertanyaan) values ($1::uuid, 'Tanya B?') returning id`,
      [UID_B],
    )
  ).rows[0].id;
  const hapusSkor = await sebagaiUid(
    UID_B,
    "authenticated",
    `delete from public.pf_quiz_scores where user_id = $1::uuid`,
    [UID_B],
  );
  cek("C17 policy DELETE: pemilik hapus skor sendiri (1 baris)", hapusSkor.rowCount === 1);
  await db.query(
    `insert into public.pf_quiz_scores (user_id, tanggal, benar, total) values ($1::uuid, '2026-11-14', 2, 5)`,
    [UID_B],
  );
  const hapusOrangLain = await sebagaiUid(
    UID_C,
    "authenticated",
    `delete from public.pf_quiz_scores where user_id = $1::uuid`,
    [UID_B],
  );
  cek("C18 policy DELETE: bukan pemilik hapus skor orang lain (0 baris)", hapusOrangLain.rowCount === 0);
  const hapusNotif = await sebagaiUid(
    UID_B,
    "authenticated",
    `delete from public.pf_notifications where user_id = $1::uuid`,
    [UID_B],
  );
  cek("C19 policy DELETE: pemilik hapus notifikasi sendiri", hapusNotif.rowCount === 1);
  const hapusPref = await sebagaiUid(
    UID_B,
    "authenticated",
    `delete from public.pf_user_preferences where user_id = $1::uuid`,
    [UID_B],
  );
  cek("C20 policy DELETE: pemilik hapus preferensi sendiri", hapusPref.rowCount === 1);
  const hapusTanya = await sebagaiUid(
    UID_B,
    "authenticated",
    `delete from public.pf_questions where id = $1::uuid`,
    [pertanyaanB],
  );
  cek("C21 policy DELETE: pemilik hapus pertanyaan sendiri", hapusTanya.rowCount === 1);
}

// ================= E. Asersi sumber =================
{
  const minta = bacaRepo("src/app/api/saya/akun/hapus/minta/route.ts");
  const hapus = bacaRepo("src/app/api/saya/akun/hapus/route.ts");
  const dataRoute = bacaRepo("src/app/api/saya/data/route.ts");
  const ekspor = bacaRepo("src/app/api/saya/ekspor/route.ts");
  const types = bacaRepo("src/lib/admin/types.ts");

  cek("E1 minta: kirim tautan via signInWithOtp (email Supabase Auth)", minta.includes("signInWithOtp"));
  cek("E2 minta: redirect ke /saya/hapus-akun/konfirmasi?token=", minta.includes("/saya/hapus-akun/konfirmasi?token="));
  cek("E3 minta: limiter keras 3/jam", minta.includes("buatRateLimiterKeras(3, 3_600_000)"));
  cek("E4 minta: audit akun.hapus.minta", minta.includes('"akun.hapus.minta"'));
  cek("E5 minta: hanya sha256 token yang disimpan (token_hash)", minta.includes("token_hash: hashToken(token)"));
  cek("E6 minta: TANPA penanganan password", !minta.includes("password") && !minta.includes("signInWithPassword"));
  cek("E7 minta: cek Origin (CSRF)", minta.includes("cekOrigin(req)"));
  cek("E8 minta: 503 jujur bila v14 belum siap", minta.includes("responV14BelumSiap()"));

  cek("E9 hapus: auth.admin.deleteUser", hapus.includes("auth.admin.deleteUser"));
  cek("E10 hapus: audit akun.hapus SEBELUM deleteUser (cek urutan di sumber)", hapus.indexOf('aksi: "akun.hapus"') < hapus.indexOf("service.auth.admin.deleteUser") && hapus.indexOf('aksi: "akun.hapus"') > 0);
  cek("E11 hapus: audit kegagalan akun.hapus.gagal", hapus.includes('"akun.hapus.gagal"'));
  cek("E12 hapus: penjaga super_admin terakhir", hapus.includes("ROLES.SUPER_ADMIN") && hapus.includes("satu-satunya admin"));
  cek("E13 hapus: hapus newsletter menurut email (celah B3)", hapus.includes('from("pf_newsletter_subscribers")') && hapus.includes(".delete()"));
  cek("E14 hapus: limiter keras 5/jam + cek Origin", hapus.includes("buatRateLimiterKeras(5, 3_600_000)") && hapus.includes("cekOrigin(req)"));
  cek("E15 hapus: TANPA password", !hapus.includes("password"));
  cek("E16 hapus: token sekali pakai (klaim status menunggu)", hapus.includes('.eq("status", "menunggu")'));

  cek("E17 data: audit data.hapus", dataRoute.includes('"data.hapus"'));
  cek("E18 data: filter kepemilikan user_id di hapus", dataRoute.includes('.eq("user_id", userId)'));
  cek("E19 data: 404 bila hapus satu item 0 baris", dataRoute.includes("Item tidak ditemukan atau bukan milik Anda"));
  cek("E20 data: hapus massal butuh semua: true eksplisit", dataRoute.includes("semua === true") || dataRoute.includes("body?.semua === true"));
  cek("E21 data: limiter keras + cek Origin", dataRoute.includes("buatRateLimiterKeras(30)") && dataRoute.includes("cekOrigin(req)"));

  cek("E22 ekspor: TANPA .limit(BATAS_BARIS)", !ekspor.includes(".limit(BATAS_BARIS)") && !ekspor.includes("BATAS_BARIS"));
  cek("E23 ekspor: paginasi .range() penuh", ekspor.includes("ambilSemuaHalaman") && ekspor.includes(".range(dari, sampai)"));
  cek("E24 ekspor: 4 tabel baru (kursus/podcast/cerita)", ekspor.includes("pf_course_progress") && ekspor.includes("pf_podcast_history") && ekspor.includes("pf_podcast_playlist_items") && ekspor.includes("pf_story_followers"));
  cek("E25 ekspor: penanda lengkap + jumlah per bagian", ekspor.includes("lengkap") && ekspor.includes("jumlah"));

  for (const aksi of ["akun.hapus.minta", "akun.hapus", "akun.hapus.gagal", "data.hapus"]) {
    cek(`E26 types.ts memuat aksi '${aksi}'`, types.includes(`"${aksi}"`));
  }

  const halamanMinta = bacaRepo("src/app/saya/hapus-akun/page.tsx");
  const formMinta = bacaRepo("src/app/saya/hapus-akun/FormMintaHapus.tsx");
  const formKonfirmasi = bacaRepo("src/app/saya/hapus-akun/konfirmasi/FormKonfirmasiHapus.tsx");
  const hapusItem = bacaRepo("src/app/saya/HapusDataPerItem.tsx");
  const saya = bacaRepo("src/app/saya/page.tsx");
  cek("E27 halaman hapus-akun menjelaskan dihapus vs dianonimkan", halamanMinta.includes("Dianonimkan") && halamanMinta.includes("Dihapus sepenuhnya"));
  cek("E28 form minta: unduh data dulu + kirim tautan", formMinta.includes("Unduh data saya dulu") && formMinta.includes("Kirim tautan konfirmasi"));
  cek("E29 form konfirmasi: checkbox paham + tombol hapus permanen", formKonfirmasi.includes("Hapus akun saya secara permanen") && formKonfirmasi.includes("Saya memahami"));
  cek("E30 UI hapus per item: empty state jujur per jenis", hapusItem.includes("Belum ada data — tidak ada yang dihapus"));
  cek("E31 UI hapus per item: konfirmasi dua langkah", hapusItem.includes("Yakin hapus semua"));
  cek("E32 /saya menautkan seksi Akun & Data Saya + hapus akun", saya.includes("HapusDataPerItem") && saya.includes("/saya/hapus-akun"));
}

// ================= Ringkasan =================
console.log(`\nRINGKASAN B2-AKUN: ${lolos} lolos, ${gagal} gagal.`);
process.exit(gagal === 0 ? 0 : 1);
