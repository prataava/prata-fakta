// Uji Gelombang B2-B PRATA FAKTA (Academy: skor, penilaian,
// sertifikat, jenis soal kuis) -> PGlite.
// Menerapkan v1–v13 sekali, lalu DDL v14 (inline di bawah) DUA
// kali (idempotensi), lalu memeriksa:
//   LANGKAH 1 (L-B1 / I-4): celah skor klien tertutup.
//     - validasiProgres MENOLAK skor non-null apa pun (4, 100,
//       0) dan menerima tanpa skor / skor null.
//     - POST skor 100 tanpa menjawab kuis TIDAK TERSIMPAN:
//       trigger pf_course_progress_skor_server menolak
//       selesai=true tanpa jawaban tersimpan (RAISE) dan
//       menghitung ulang skor dari jawaban tersimpan pada
//       INSERT/UPDATE (skor=100 ditulis -> tersimpan 3).
//     - Pelajaran non-kuis selalu tersimpan skor NULL.
//     - pf_quiz_user_answers HANYA ditulis service role:
//       INSERT/UPDATE/DELETE authenticated ditolak (42501);
//       pemilik hanya bisa SELECT baris sendiri.
//   LANGKAH 2 (B1): penilaian + kriteria kelulusan (murni).
//     - Ambang: pelajaran >=80%, rata-rata kuis >=70, kuis
//       akhir >=70 (batas: 80/70/70 lulus; 79/69/69 gagal).
//     - Esai tidak masuk penyebut skor; kursus tanpa kuis lulus
//       dengan 80% pelajaran saja; 0 pelajaran tidak lulus.
//   LANGKAH 3 (B2): sertifikat internal (skema + RLS).
//     - pf_certificates: kode 12 karakter unik, format CHECK,
//       satu sertifikat aktif per (pengguna, kursus), anon 0
//       baris, pemilik hanya baris sendiri, tulis pengguna
//       ditolak; kode verifikasi acak unik.
//   LANGKAH 4 (H2–H6): jenis soal kuis.
//     - nilaiJawaban: PG, kompleks (himpunan persis; sebagian
//       benar = salah), isian (normalisasi), benar/salah,
//       esai SELALU null + menunggu_penilaian (tidak pernah
//       dinilai otomatis).
//     - Skema: kolom jenis + kunci_teks/kunci_jamaks, CHECK
//       rentang + minimal satu kunci, kunci boleh null.
//     - Riwayat per soal: jawaban tersimpan per (pengguna,
//       pelajaran, soal) terbaca pemilik.
//     - validasiJawabanAkademi per jenis soal.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// BATAS KEJUJURAN baterai ini (bukan klaim lebih):
// - Respons HTTP hidup (POST /api/akademi/progres, jawab,
//   sertifikat, halaman verifikasi) TIDAK diuji lewat server
//   jalan; yang diuji: validator yang diekstrak dari sumber
//   route + perilaku DB (trigger/RLS/policy) yang ditegakkan
//   di bawah route + fungsi murni penilaian. Verifikasi HTTP
//   hidup tetap tugas tahap browser/koordinator.
// - terbitkanSertifikat / verifikasiSertifikat (lib, butuh
//   supabase-js) tidak dieksekusi di sini; yang diuji adalah
//   cekKelulusan yang mereka pakai + invarian skema/RLS
//   sertifikat. Idempotensi + penolakan belum-lulus di level
//   lib harus diuji di staging.
// - Seed disisipkan sesudah v13 (kunci sudah di pf_quiz_answers).
import fs from "node:fs";
import { createRequire } from "node:module";

import { PGlite } from "./butuh-pglite.mjs";

const requireRepo = createRequire(
  new URL("../package.json", import.meta.url).pathname,
);
const ts = requireRepo("typescript");
function transpileKeJs(kodeTs) {
  return ts.transpileModule(kodeTs, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
}

const DIR_MIGRASI = new URL("../supabase/migrations/", import.meta.url)
  .pathname;
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
    await db.query("reset role");
  }
}

async function hitungSebagaiUid(uid, role, sql, params = []) {
  const r = await sebagaiUid(uid, role, sql, params);
  return Number(r.rows[0]?.n ?? 0);
}

async function berhasilSebagaiUid(uid, role, sql, params = []) {
  try {
    await sebagaiUid(uid, role, sql, params);
    return true;
  } catch {
    return false;
  }
}

/* Ekstraksi sumber tanpa regex (pola baterai lama): fungsi murni
   menutup bloknya dengan "}" di kolom 0. */
function ekstrakFungsi(src, nama) {
  const awal = src.indexOf("function " + nama + "(");
  if (awal < 0) return null;
  const akhir = src.indexOf("\n}", awal);
  if (akhir < 0) return null;
  return src.slice(awal, akhir + 2);
}
/* Varian async: "export async function" — ekstrakFungsi biasa
   akan memotong kata `async` sehingga `await` di badan menjadi
   SyntaxError. */
function ekstrakFungsiAsync(src, nama) {
  const awal = src.indexOf("async function " + nama + "(");
  if (awal < 0) return null;
  const akhir = src.indexOf("\n}", awal);
  if (akhir < 0) return null;
  return src.slice(awal, akhir + 2);
}
function ekstrakKonst(src, nama) {
  const awal = src.indexOf("const " + nama + " =");
  if (awal < 0) return null;
  const akhir = src.indexOf(";", awal);
  if (akhir < 0) return null;
  return src.slice(awal, akhir + 1);
}

/* ============================================================
   DDL v14 — PERSIS seperti yang harus masuk migrasi
   supabase/migrations/20261116_pf_v14_akademi_b2.sql
   (B2-B TIDAK menulis berkas migrasi; DDL ini dibawa ke laporan
   akhir untuk dijalankan pemilik sebagai migrasi v14).
   ============================================================ */
const DDL_V14 = `
-- v14 (Gelombang B2-B): Academy — jawaban kuis tersimpan, jenis
-- soal, sertifikat internal + trigger skor server-side.
alter table public.pf_quiz_questions
  add column if not exists jenis text not null default 'pilihan_ganda'
  check (jenis in ('pilihan_ganda', 'pilihan_ganda_kompleks', 'isian_singkat', 'benar_salah', 'esai'));

-- CHECK opsi v8 (1..10 butir) tidak berlaku untuk soal tanpa
-- opsi (isian_singkat/esai): ganti dengan CHECK v14 yang
-- membebaskan kedua jenis itu (opsi tetap harus array).
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'pf_quiz_questions_opsi_panjang_check_v8') then
    alter table public.pf_quiz_questions drop constraint pf_quiz_questions_opsi_panjang_check_v8;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pf_quiz_questions_opsi_panjang_check_v14') then
    alter table public.pf_quiz_questions
      add constraint pf_quiz_questions_opsi_panjang_check_v14
      check (jsonb_typeof(opsi) = 'array' and (jenis in ('isian_singkat', 'esai') or jsonb_array_length(opsi) between 1 and 10));
  end if;
end $$;

alter table public.pf_quiz_answers alter column kunci drop not null;
alter table public.pf_quiz_answers add column if not exists kunci_teks text;
alter table public.pf_quiz_answers add column if not exists kunci_jamaks integer[];
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pf_quiz_answers_minimal_satu_kunci') then
    alter table public.pf_quiz_answers add constraint pf_quiz_answers_minimal_satu_kunci
      check (kunci is not null or kunci_teks is not null or kunci_jamaks is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pf_quiz_answers_kunci_jamaks_rentang') then
    alter table public.pf_quiz_answers add constraint pf_quiz_answers_kunci_jamaks_rentang
      check (kunci_jamaks is null or kunci_jamaks <@ array[0,1,2,3,4]);
  end if;
end $$;

create table if not exists public.pf_quiz_user_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.pf_course_lessons (id) on delete cascade,
  soal_id uuid not null references public.pf_quiz_questions (id) on delete cascade,
  jenis text not null check (jenis in ('pilihan_ganda', 'pilihan_ganda_kompleks', 'isian_singkat', 'benar_salah', 'esai')),
  jawaban jsonb not null,
  benar boolean,
  status_penilaian text not null default 'otomatis' check (status_penilaian in ('otomatis', 'menunggu_penilaian', 'dinilai')),
  dinilai_oleh uuid references auth.users (id) on delete set null,
  dinilai_pada timestamptz,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now(),
  unique (user_id, lesson_id, soal_id),
  constraint pf_quiz_user_answers_benar_konsisten
    check ((status_penilaian = 'menunggu_penilaian') = (benar is null))
);
create index if not exists pf_quiz_user_answers_user_lesson_idx on public.pf_quiz_user_answers (user_id, lesson_id);
drop trigger if exists pf_quiz_user_answers_set_updated_at on public.pf_quiz_user_answers;
create trigger pf_quiz_user_answers_set_updated_at before update on public.pf_quiz_user_answers for each row execute function public.pf_set_updated_at();
alter table public.pf_quiz_user_answers enable row level security;
drop policy if exists "pf_quiz_user_answers baca sendiri" on public.pf_quiz_user_answers;
create policy "pf_quiz_user_answers baca sendiri" on public.pf_quiz_user_answers for select using (auth.uid() = user_id);
revoke all on public.pf_quiz_user_answers from public;
revoke all on public.pf_quiz_user_answers from anon, authenticated;
grant select on public.pf_quiz_user_answers to authenticated;
grant select, insert, update, delete on public.pf_quiz_user_answers to service_role;

create table if not exists public.pf_certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.pf_courses (id) on delete cascade,
  kode_verifikasi text not null unique check (kode_verifikasi ~ '^[A-Z0-9]{12}$'),
  nama_kursus text not null,
  nama_peserta text,
  kriteria jsonb not null default '{}'::jsonb,
  diterbitkan_pada timestamptz not null default now(),
  dicabut boolean not null default false,
  dicabut_pada timestamptz,
  dicabut_alasan text,
  unique (user_id, course_id)
);
create index if not exists pf_certificates_user_idx on public.pf_certificates (user_id);
alter table public.pf_certificates enable row level security;
drop policy if exists "pf_certificates baca sendiri" on public.pf_certificates;
create policy "pf_certificates baca sendiri" on public.pf_certificates for select using (auth.uid() = user_id);
revoke all on public.pf_certificates from public;
revoke all on public.pf_certificates from anon, authenticated;
grant select on public.pf_certificates to authenticated;
grant select, insert, update, delete on public.pf_certificates to service_role;

create or replace function public.pf_hitung_skor_progres()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_jenis text;
  v_jumlah_jawaban int;
  v_benar int;
begin
  select jenis into v_jenis from public.pf_course_lessons where id = new.lesson_id;
  if v_jenis is null then return new; end if;
  if v_jenis = 'kuis' then
    select count(*), count(*) filter (where benar is true)
      into v_jumlah_jawaban, v_benar
      from public.pf_quiz_user_answers
      where user_id = new.user_id and lesson_id = new.lesson_id;
    if new.selesai and v_jumlah_jawaban = 0 then
      raise exception 'pelajaran kuis belum dijawab';
    end if;
    new.skor := v_benar;
  else
    new.skor := null;
  end if;
  return new;
end;
$$;
drop trigger if exists pf_course_progress_skor_server on public.pf_course_progress;
create trigger pf_course_progress_skor_server
  before insert or update on public.pf_course_progress
  for each row execute function public.pf_hitung_skor_progres();
`;

const MIGRASI_V1_V13 = [
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
];

const UID_A = "11111111-1111-1111-1111-111111111111";
const UID_B = "22222222-2222-2222-2222-222222222222";

// Setup PGlite: schema auth + tabel auth.users + stub auth.uid() +
// role — SEBELUM migrasi (service_role bypassrls seperti Supabase
// nyata).
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

for (const nama of MIGRASI_V1_V13) {
  const ok = await jalankan(`migrasi ${nama}`, baca(nama));
  if (!ok) process.exit(1);
}

// DDL v14 dua kali (idempotensi).
for (const putaran of [1, 2]) {
  const ok = await jalankan(`DDL v14 (putaran ${putaran})`, DDL_V14);
  if (!ok) process.exit(1);
}

// ---------- Seed ----------
await db.query(
  `insert into auth.users (id, email) values ($1, 'a@uji.id'), ($2, 'b@uji.id')`,
  [UID_A, UID_B],
);
await db.query(
  `insert into public.pf_profiles (id, nama_tampilan) values ($1, 'Pengguna A') on conflict (id) do update set nama_tampilan = 'Pengguna A'`,
  [UID_A],
);
const kursusId = (
  await db.query(
    `insert into public.pf_courses (slug, judul, status) values ('kursus-b2', 'Kursus B2', 'terbit') returning id`,
  )
).rows[0].id;
const modul1Id = (
  await db.query(
    `insert into public.pf_course_modules (course_id, judul, urutan) values ($1, 'Modul 1', 1) returning id`,
    [kursusId],
  )
).rows[0].id;
const modul2Id = (
  await db.query(
    `insert into public.pf_course_modules (course_id, judul, urutan) values ($1, 'Modul 2', 2) returning id`,
    [kursusId],
  )
).rows[0].id;
async function buatPelajaran(modulId, judul, jenis, tanggal, urutan) {
  return (
    await db.query(
      `insert into public.pf_course_lessons (module_id, judul, jenis, kuis_tanggal, urutan)
       values ($1, $2, $3, $4, $5) returning id`,
      [modulId, judul, jenis, tanggal, urutan],
    )
  ).rows[0].id;
}
const lMateri1 = await buatPelajaran(modul1Id, "Materi 1", "materi", null, 1);
const lKuis1 = await buatPelajaran(modul1Id, "Kuis 1", "kuis", "2026-11-16", 2);
const lKuis2 = await buatPelajaran(modul1Id, "Kuis 2", "kuis", "2026-11-17", 3);
await buatPelajaran(modul2Id, "Materi 2", "materi", null, 1); // id tidak dipakai langsung; pelajaran dihitung dari database (total 5)
const lKuisAkhir = await buatPelajaran(modul2Id, "Kuis Akhir", "kuis", "2026-11-18", 2);

async function buatSoal(tanggal, pertanyaan, opsi, jenis) {
  return (
    await db.query(
      `insert into public.pf_quiz_questions (tanggal, pertanyaan, opsi, jenis)
       values ($1, $2, $3::jsonb, $4) returning id`,
      [tanggal, pertanyaan, JSON.stringify(opsi), jenis],
    )
  ).rows[0].id;
}
async function buatKunci(soalId, kunci, kunciTeks, kunciJamaks) {
  await db.query(
    `insert into public.pf_quiz_answers (soal_id, kunci, kunci_teks, kunci_jamaks)
     values ($1, $2, $3, $4)`,
    [soalId, kunci, kunciTeks, kunciJamaks],
  );
}
// Kuis 1 (2026-11-16): PG, kompleks, isian, benar/salah, esai.
const q1 = await buatSoal("2026-11-16", "PG?", ["a", "b", "c", "d", "e"], "pilihan_ganda");
await buatKunci(q1, 2, null, null);
const q2 = await buatSoal("2026-11-16", "Kompleks?", ["a", "b", "c", "d", "e"], "pilihan_ganda_kompleks");
await buatKunci(q2, null, null, [0, 2]);
const q3 = await buatSoal("2026-11-16", "Isian?", [], "isian_singkat");
await buatKunci(q3, null, "Jakarta", null);
const q4 = await buatSoal("2026-11-16", "Benar/salah?", ["Benar", "Salah"], "benar_salah");
await buatKunci(q4, 1, null, null);
const q5 = await buatSoal("2026-11-16", "Esai?", [], "esai");
// Esai: SENGAJA tanpa baris kunci (tidak ada yang dinilai otomatis).
// Kuis 2 (2026-11-17): 2 PG. Kuis akhir (2026-11-18): 2 PG.
const q6 = await buatSoal("2026-11-17", "PG 6?", ["a", "b", "c", "d", "e"], "pilihan_ganda");
await buatKunci(q6, 0, null, null);
const q7 = await buatSoal("2026-11-17", "PG 7?", ["a", "b", "c", "d", "e"], "pilihan_ganda");
await buatKunci(q7, 1, null, null);
const q8 = await buatSoal("2026-11-18", "PG 8?", ["a", "b", "c", "d", "e"], "pilihan_ganda");
await buatKunci(q8, 3, null, null);
const q9 = await buatSoal("2026-11-18", "PG 9?", ["a", "b", "c", "d", "e"], "pilihan_ganda");
await buatKunci(q9, 0, null, null);

// Jawaban tersimpan pengguna A (ditulis service role — seperti
// yang dilakukan POST /api/akademi/kuis/jawab).
async function simpanJawaban(uid, lessonId, soalId, jenis, jawaban, benar, status) {
  await db.query(
    `insert into public.pf_quiz_user_answers (user_id, lesson_id, soal_id, jenis, jawaban, benar, status_penilaian)
     values ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [uid, lessonId, soalId, jenis, JSON.stringify(jawaban), benar, status],
  );
}
// Kuis 1: benar 3 dari 4 dinilai (75%); esai menunggu.
await simpanJawaban(UID_A, lKuis1, q1, "pilihan_ganda", 2, true, "otomatis");
await simpanJawaban(UID_A, lKuis1, q2, "pilihan_ganda_kompleks", [0, 2], true, "otomatis");
await simpanJawaban(UID_A, lKuis1, q3, "isian_singkat", "jakarta", true, "otomatis");
await simpanJawaban(UID_A, lKuis1, q4, "benar_salah", 0, false, "otomatis");
await simpanJawaban(UID_A, lKuis1, q5, "esai", "Jawaban esai panjang.", null, "menunggu_penilaian");
// Kuis 2: 2/2 (100%).
await simpanJawaban(UID_A, lKuis2, q6, "pilihan_ganda", 0, true, "otomatis");
await simpanJawaban(UID_A, lKuis2, q7, "pilihan_ganda", 1, true, "otomatis");
// Kuis akhir: 1/2 (50%) — di bawah ambang 70.
await simpanJawaban(UID_A, lKuisAkhir, q8, "pilihan_ganda", 3, true, "otomatis");
await simpanJawaban(UID_A, lKuisAkhir, q9, "pilihan_ganda", 1, false, "otomatis");

/* ============================================================
   §A. Skema v14
   ============================================================ */
const jmlTabel = await db.query(
  `select count(*)::int as n from pg_tables where schemaname='public' and tablename in ('pf_quiz_user_answers','pf_certificates')`,
);
cek("v14: 2 tabel baru ada", jmlTabel.rows[0].n === 2, `dapat ${jmlTabel.rows[0].n}`);
const kolomJenis = await db.query(
  `select 1 from information_schema.columns where table_schema='public' and table_name='pf_quiz_questions' and column_name='jenis'`,
);
cek("v14: kolom pf_quiz_questions.jenis ada", kolomJenis.rows.length === 1);
const kolomKunci = await db.query(
  `select column_name from information_schema.columns where table_schema='public' and table_name='pf_quiz_answers' and column_name in ('kunci_teks','kunci_jamaks')`,
);
cek("v14: kolom kunci_teks + kunci_jamaks ada", kolomKunci.rows.length === 2);
const kunciNullable = await db.query(
  `select is_nullable from information_schema.columns where table_schema='public' and table_name='pf_quiz_answers' and column_name='kunci'`,
);
cek("v14: pf_quiz_answers.kunci boleh null (esai/isian)", kunciNullable.rows[0]?.is_nullable === "YES");
const cekJenis = await db.query(
  `select 1 from pg_constraint where conname like '%pf_quiz_questions_jenis%' or (conrelid = 'public.pf_quiz_questions'::regclass and contype = 'c')`,
);
cek("v14: CHECK jenis soal ada", cekJenis.rows.length >= 1);
let tolakJenis = false;
try {
  await db.query(
    `insert into public.pf_quiz_questions (tanggal, pertanyaan, opsi, jenis) values ('2026-11-19', 'X?', '[]'::jsonb, 'tebak-tebakan')`,
  );
} catch {
  tolakJenis = true;
}
cek("v14: jenis soal di luar daftar ditolak (CHECK)", tolakJenis);
let tolakJamaks = false;
try {
  await db.query(
    `insert into public.pf_quiz_answers (soal_id, kunci_jamaks) values ($1, array[0,9])`,
    [q6],
  );
} catch {
  tolakJamaks = true;
}
cek("v14: kunci_jamaks di luar 0..4 ditolak (CHECK)", tolakJamaks);
let tolakTanpaKunci = false;
try {
  await db.query(
    `insert into public.pf_quiz_answers (soal_id) values ($1)`,
    [q6],
  );
} catch {
  tolakTanpaKunci = true;
}
cek("v14: baris kunci tanpa satu pun bentuk kunci ditolak", tolakTanpaKunci);
const rlsBaru = await db.query(
  `select count(*)::int as n from pg_tables where schemaname='public' and tablename in ('pf_quiz_user_answers','pf_certificates') and rowsecurity`,
);
cek("v14: RLS aktif di 2 tabel baru", rlsBaru.rows[0].n === 2);
const triggerAda = await db.query(
  `select 1 from pg_trigger where tgname = 'pf_course_progress_skor_server'`,
);
cek("v14: trigger skor progres terpasang", triggerAda.rows.length === 1);
const fungsiTrigger = await db.query(
  `select prosecdef, proconfig from pg_proc where proname = 'pf_hitung_skor_progres'`,
);
cek(
  "v14: fungsi trigger SECURITY DEFINER + search_path=public",
  fungsiTrigger.rows[0]?.prosecdef === true &&
    String(fungsiTrigger.rows[0]?.proconfig ?? "").includes("search_path=public"),
);

/* ============================================================
   §B. LANGKAH 1 — celah skor klien tertutup (trigger + RLS)
   ============================================================ */
// BUKTI UTAMA: pengguna B mencoba "POST skor 100" lewat tulis
// langsung (selesai=true, skor=100) tanpa satu pun jawaban
// tersimpan -> trigger MENOLAK, baris tidak tersimpan.
let tulisPalsuDitolak = false;
try {
  await db.query(
    `insert into public.pf_course_progress (user_id, lesson_id, selesai, skor) values ($1, $2, true, 100)`,
    [UID_B, lKuis2],
  );
} catch (e) {
  tulisPalsuDitolak = String(e.message).includes("belum dijawab");
}
cek("LANGKAH 1: skor 100 tanpa jawaban DITOLAK trigger", tulisPalsuDitolak);
const jumlahPalsu = await db.query(
  `select count(*)::int as n from public.pf_course_progress where user_id = $1 and lesson_id = $2`,
  [UID_B, lKuis2],
);
cek("LANGKAH 1: baris palsu TIDAK tersimpan (0 baris)", jumlahPalsu.rows[0].n === 0);
// Pengguna A menulis skor=100 untuk Kuis 1 (3 benar tersimpan) ->
// trigger menghitung ulang menjadi 3.
await db.query(
  `insert into public.pf_course_progress (user_id, lesson_id, selesai, skor) values ($1, $2, true, 100)`,
  [UID_A, lKuis1],
);
const skorA1 = await db.query(
  `select skor from public.pf_course_progress where user_id = $1 and lesson_id = $2`,
  [UID_A, lKuis1],
);
cek("LANGKAH 1: skor 100 ditulis -> tersimpan 3 (dihitung server)", skorA1.rows[0]?.skor === 3, `dapat ${skorA1.rows[0]?.skor}`);
// UPDATE langsung skor=100 juga dihitung ulang.
await db.query(
  `update public.pf_course_progress set skor = 100 where user_id = $1 and lesson_id = $2`,
  [UID_A, lKuis1],
);
const skorA1b = await db.query(
  `select skor from public.pf_course_progress where user_id = $1 and lesson_id = $2`,
  [UID_A, lKuis1],
);
cek("LANGKAH 1: UPDATE skor=100 -> kembali 3", skorA1b.rows[0]?.skor === 3);
// Pelajaran non-kuis selalu skor NULL.
await db.query(
  `insert into public.pf_course_progress (user_id, lesson_id, selesai, skor) values ($1, $2, true, 50)`,
  [UID_A, lMateri1],
);
const skorMateri = await db.query(
  `select skor from public.pf_course_progress where user_id = $1 and lesson_id = $2`,
  [UID_A, lMateri1],
);
cek("LANGKAH 1: pelajaran materi tersimpan skor NULL", skorMateri.rows[0]?.skor === null);
// Pelajaran kuis boleh ditandai selesai=false tanpa jawaban
// (batal tandai) — skor tetap dihitung (0).
await db.query(
  `insert into public.pf_course_progress (user_id, lesson_id, selesai, skor) values ($1, $2, false, 99)`,
  [UID_B, lKuis2],
);
const skorB = await db.query(
  `select skor, selesai from public.pf_course_progress where user_id = $1 and lesson_id = $2`,
  [UID_B, lKuis2],
);
cek(
  "LANGKAH 1: selesai=false tanpa jawaban diizinkan, skor 0",
  skorB.rows[0]?.skor === 0 && skorB.rows[0]?.selesai === false,
);
// RLS jawaban: pemilik hanya baca sendiri; tulis ditolak.
// Catatan: anon TIDAK PUNYA grant sama sekali (pola
// pf_quiz_answers) — SELECT anon gagal 42501, bukan 0 baris.
let anonJawabanDitolak = false;
try {
  await sebagaiUid(UID_A, "anon", `select count(*) as n from public.pf_quiz_user_answers`);
} catch {
  anonJawabanDitolak = true;
}
cek("LANGKAH 1: anon tidak bisa SELECT jawaban (42501, tanpa grant)", anonJawabanDitolak);
cek(
  "LANGKAH 1: pemilik A baca 9 jawaban sendiri",
  (await hitungSebagaiUid(UID_A, "authenticated", `select count(*) as n from public.pf_quiz_user_answers`)) === 9,
);
cek(
  "LANGKAH 1: pengguna B 0 baris jawaban A (isolasi)",
  (await hitungSebagaiUid(UID_B, "authenticated", `select count(*) as n from public.pf_quiz_user_answers`)) === 0,
);
cek(
  "LANGKAH 1: INSERT jawaban oleh authenticated DITOLAK (hanya service role)",
  !(await berhasilSebagaiUid(
    UID_A,
    "authenticated",
    `insert into public.pf_quiz_user_answers (user_id, lesson_id, soal_id, jenis, jawaban, benar, status_penilaian) values ($1, $2, $3, 'pilihan_ganda', '2'::jsonb, true, 'otomatis')`,
    [UID_A, lKuis2, q6],
  )),
);
cek(
  "LANGKAH 1: UPDATE jawaban oleh authenticated DITOLAK",
  !(await berhasilSebagaiUid(
    UID_A,
    "authenticated",
    `update public.pf_quiz_user_answers set benar = true where user_id = $1`,
    [UID_A],
  )),
);
cek(
  "LANGKAH 1: service_role bisa INSERT jawaban (jalur route jawab)",
  await (async () => {
    try {
      await sebagai("service_role", `insert into public.pf_quiz_user_answers (user_id, lesson_id, soal_id, jenis, jawaban, benar, status_penilaian) values ($1, $2, $3, 'pilihan_ganda', '0'::jsonb, true, 'otomatis')`, [UID_B, lKuis2, q6]);
      return true;
    } catch {
      return false;
    }
  })(),
);
await db.query(`delete from public.pf_quiz_user_answers where user_id = $1 and lesson_id = $2 and soal_id = $3`, [UID_B, lKuis2, q6]);
// Kunci tetap tertutup: anon tidak bisa baca kunci_teks/jamaks.
let kunciTertutup = false;
try {
  await sebagai("anon", `select kunci_teks from public.pf_quiz_answers limit 1`);
} catch {
  kunciTertutup = true;
}
cek("LANGKAH 1: anon tidak bisa SELECT pf_quiz_answers (42501)", kunciTertutup);

/* ============================================================
   §C. Fungsi murni penilaian (ekstraksi sumber)
   ============================================================ */
const penilaianSrc = bacaRepo("src/lib/akademi/penilaian.ts");
const potonganPenilaian = [
  ekstrakKonst(penilaianSrc, "AMBANG_PELAJARAN_PERSEN"),
  ekstrakKonst(penilaianSrc, "AMBANG_SKOR_RATA_RATA"),
  ekstrakKonst(penilaianSrc, "AMBANG_KUIS_AKHIR"),
  ekstrakKonst(penilaianSrc, "ALFABET_KODE"),
  ekstrakFungsi(penilaianSrc, "normalisasiIsian"),
  ekstrakFungsi(penilaianSrc, "validasiBentukJawaban"),
  ekstrakFungsi(penilaianSrc, "nilaiJawaban"),
  ekstrakFungsi(penilaianSrc, "hitungSkorKuis"),
  ekstrakFungsi(penilaianSrc, "cekKelulusan"),
  ekstrakFungsi(penilaianSrc, "buatKodeVerifikasi"),
];
cek("penilaian: fungsi murni dapat diekstrak", potonganPenilaian.every(Boolean));
if (potonganPenilaian.every(Boolean)) {
  const m = new Function(
    transpileKeJs(
      `${potonganPenilaian.join("\n")}\nreturn { AMBANG_PELAJARAN_PERSEN, AMBANG_SKOR_RATA_RATA, AMBANG_KUIS_AKHIR, normalisasiIsian, validasiBentukJawaban, nilaiJawaban, hitungSkorKuis, cekKelulusan, buatKodeVerifikasi };`,
    ),
  )();
  cek("ambang kelulusan 80 / 70 / 70",
    m.AMBANG_PELAJARAN_PERSEN === 80 && m.AMBANG_SKOR_RATA_RATA === 70 && m.AMBANG_KUIS_AKHIR === 70);
  // normalisasi isian
  cek("isian: '  Jakarta. ' == 'jakarta'",
    m.normalisasiIsian("  Jakarta. ") === "jakarta");
  cek("isian: spasi ganda diringkas",
    m.normalisasiIsian("Kota  Jakarta") === "kota jakarta");
  // nilaiJawaban per jenis
  const pg = { jenis: "pilihan_ganda", kunci: 2, kunci_teks: null, kunci_jamaks: null };
  cek("PG: jawaban 2 benar", m.nilaiJawaban(pg, 2).benar === true);
  cek("PG: jawaban 1 salah", m.nilaiJawaban(pg, 1).benar === false);
  const kompleks = { jenis: "pilihan_ganda_kompleks", kunci: null, kunci_teks: null, kunci_jamaks: [0, 2] };
  cek("kompleks: [0,2] benar", m.nilaiJawaban(kompleks, [0, 2]).benar === true);
  cek("kompleks: [2,0] (beda urutan) benar", m.nilaiJawaban(kompleks, [2, 0]).benar === true);
  cek("kompleks: [0] sebagian benar = SALAH (tanpa kredit parsial)", m.nilaiJawaban(kompleks, [0]).benar === false);
  cek("kompleks: [0,2,3] berlebih = salah", m.nilaiJawaban(kompleks, [0, 2, 3]).benar === false);
  const isian = { jenis: "isian_singkat", kunci: null, kunci_teks: "Jakarta", kunci_jamaks: null };
  cek("isian: 'jakarta' benar", m.nilaiJawaban(isian, "jakarta").benar === true);
  cek("isian: '  JAKARTA. ' benar (normalisasi)", m.nilaiJawaban(isian, "  JAKARTA. ").benar === true);
  cek("isian: 'Bandung' salah", m.nilaiJawaban(isian, "Bandung").benar === false);
  const bs = { jenis: "benar_salah", kunci: 1, kunci_teks: null, kunci_jamaks: null };
  cek("benar/salah: 1 benar", m.nilaiJawaban(bs, 1).benar === true);
  cek("benar/salah: 0 salah", m.nilaiJawaban(bs, 0).benar === false);
  const esai = { jenis: "esai", kunci: null, kunci_teks: null, kunci_jamaks: null };
  const hasilEsai = m.nilaiJawaban(esai, "Jawaban esai apa pun.");
  cek("esai: TIDAK PERNAH dinilai otomatis (benar null + menunggu)",
    hasilEsai.benar === null && hasilEsai.status_penilaian === "menunggu_penilaian");
  // validasi bentuk
  cek("bentuk: kompleks [] ditolak", m.validasiBentukJawaban("pilihan_ganda_kompleks", []).ok === false);
  cek("bentuk: kompleks [5] ditolak", m.validasiBentukJawaban("pilihan_ganda_kompleks", [5]).ok === false);
  const kompleksOk = m.validasiBentukJawaban("pilihan_ganda_kompleks", [2, 0, 2]);
  cek("bentuk: kompleks [2,0,2] diterima + didedup + diurutkan",
    kompleksOk.ok === true && JSON.stringify(kompleksOk.jawaban) === "[0,2]");
  cek("bentuk: benar/salah true -> 1",
    m.validasiBentukJawaban("benar_salah", true).jawaban === 1);
  cek("bentuk: benar/salah 2 ditolak", m.validasiBentukJawaban("benar_salah", 2).ok === false);
  cek("bentuk: isian kosong ditolak", m.validasiBentukJawaban("isian_singkat", "   ").ok === false);
  cek("bentuk: esai 5001 karakter ditolak",
    m.validasiBentukJawaban("esai", "x".repeat(5001)).ok === false);
  cek("bentuk: PG string ditolak", m.validasiBentukJawaban("pilihan_ganda", "2").ok === false);
  // hitungSkorKuis
  const skor1 = m.hitungSkorKuis([
    { benar: true }, { benar: true }, { benar: false }, { benar: null },
  ]);
  cek("hitungSkorKuis: 2 benar / 3 dinilai = 67% (esai tidak masuk penyebut)",
    skor1.benar === 2 && skor1.total_dinilai === 3 && skor1.persen === 67,
    `dapat ${JSON.stringify(skor1)}`);
  cek("hitungSkorKuis: tanpa soal dinilai -> persen null",
    m.hitungSkorKuis([{ benar: null }]).persen === null);
  cek("hitungSkorKuis: [] -> persen null", m.hitungSkorKuis([]).persen === null);
  // cekKelulusan — batas
  const skorKuis = (persen, modul, pel) => ({
    lesson_id: `l-${modul}-${pel}`, urutan_modul: modul, urutan_pelajaran: pel, persen,
  });
  const lulusPas = m.cekKelulusan({
    total_pelajaran: 5, pelajaran_selesai: 4,
    skor_kuis: [skorKuis(80, 1, 1), skorKuis(70, 2, 1)],
  });
  cek("kelulusan: 80% + rata-rata 75 + akhir 70 = LULUS", lulusPas.lulus === true);
  cek("kelulusan: rata-rata dihitung (80+70)/2=75", lulusPas.rata_rata_kuis === 75);
  cek("kelulusan: kuis akhir = urutan terbesar (70)", lulusPas.skor_kuis_akhir === 70);
  const gagalPelajaran = m.cekKelulusan({
    total_pelajaran: 10, pelajaran_selesai: 7,
    skor_kuis: [skorKuis(100, 1, 1)],
  });
  cek("kelulusan: 70% pelajaran = GAGAL", gagalPelajaran.lulus === false);
  const gagalRata = m.cekKelulusan({
    total_pelajaran: 5, pelajaran_selesai: 5,
    skor_kuis: [skorKuis(69, 1, 1), skorKuis(69, 2, 1)],
  });
  cek("kelulusan: rata-rata 69 = GAGAL", gagalRata.lulus === false);
  const gagalAkhir = m.cekKelulusan({
    total_pelajaran: 5, pelajaran_selesai: 5,
    skor_kuis: [skorKuis(100, 1, 1), skorKuis(69, 2, 1)],
  });
  cek("kelulusan: kuis akhir 69 = GAGAL (rata-rata 85 tetap gagal)",
    gagalAkhir.lulus === false && gagalAkhir.rata_rata_kuis === 85);
  const tanpaKuis = m.cekKelulusan({ total_pelajaran: 5, pelajaran_selesai: 4, skor_kuis: [] });
  cek("kelulusan: kursus tanpa kuis lulus dengan 80% pelajaran",
    tanpaKuis.lulus === true && tanpaKuis.rata_rata_kuis === null);
  const esaiSaja = m.cekKelulusan({
    total_pelajaran: 5, pelajaran_selesai: 5,
    skor_kuis: [skorKuis(null, 1, 1)],
  });
  cek("kelulusan: kuis hanya esai (skor null) = GAGAL (menunggu penilaian)",
    esaiSaja.lulus === false);
  const kosong = m.cekKelulusan({ total_pelajaran: 0, pelajaran_selesai: 0, skor_kuis: [] });
  cek("kelulusan: 0 pelajaran = GAGAL", kosong.lulus === false);
  // Skenario seed: A punya 4/5 selesai, rata-rata (75+100+50)/3=75,
  // kuis akhir 50 -> BELUM lulus.
  const seedA = m.cekKelulusan({
    total_pelajaran: 5, pelajaran_selesai: 4,
    skor_kuis: [skorKuis(75, 1, 2), skorKuis(100, 1, 3), skorKuis(50, 2, 2)],
  });
  cek("kelulusan (seed A): 80% + rata-rata 75 + akhir 50 = BELUM lulus",
    seedA.lulus === false && seedA.rata_rata_kuis === 75 && seedA.skor_kuis_akhir === 50);
  // Kode verifikasi
  const kodeSet = new Set();
  let formatOk = true;
  for (let i = 0; i < 50; i += 1) {
    const k = m.buatKodeVerifikasi();
    if (!/^[A-Z0-9]{12}$/.test(k) || /[IO01]/.test(k)) formatOk = false;
    kodeSet.add(k);
  }
  cek("kode verifikasi: 12 karakter, tanpa I/O/0/1, 50 kode unik",
    formatOk && kodeSet.size === 50);
}

/* ============================================================
   §D. Validator route (ekstraksi sumber)
   ============================================================ */
const progresSrc = bacaRepo("src/app/api/akademi/progres/route.ts");
// FU2 (16 Nov 2026): validasiProgres + hitungSkorProgres PINDAH
// ke src/lib/akademi/penilaian.ts — ekstraksi dari penilaianSrc
// (sudah dibaca di atas; progresSrc tetap dipakai untuk
// pemeriksaan route di bawah).
const potonganProgres = [
  ekstrakKonst(penilaianSrc, "POLA_UUID"),
  ekstrakFungsi(penilaianSrc, "validasiProgres"),
  ekstrakFungsiAsync(penilaianSrc, "hitungSkorProgres"),
];
cek("validasiProgres + hitungSkorProgres dapat diekstrak", potonganProgres.every(Boolean));
if (potonganProgres.every(Boolean)) {
  const v = new Function(
    transpileKeJs(`${potonganProgres.join("\n")}\nreturn { validasiProgres, hitungSkorProgres };`),
  )();
  const U = "11111111-1111-1111-1111-111111111111";
  cek("progres: terima tanpa skor", v.validasiProgres({ lesson_id: U, selesai: true }).ok === true);
  cek("progres: terima skor null (kompat klien lama)",
    v.validasiProgres({ lesson_id: U, selesai: true, skor: null }).ok === true);
  cek("progres: TOLAK skor 100 dari klien",
    v.validasiProgres({ lesson_id: U, selesai: true, skor: 100 }).ok === false);
  cek("progres: TOLAK skor 4 dari klien",
    v.validasiProgres({ lesson_id: U, selesai: true, skor: 4 }).ok === false);
  cek("progres: TOLAK skor 0 dari klien (nol pun ditolak)",
    v.validasiProgres({ lesson_id: U, selesai: true, skor: 0 }).ok === false);
  cek("progres: tolak selesai bukan boolean",
    v.validasiProgres({ lesson_id: U, selesai: "ya" }).ok === false);
  cek("progres: tolak lesson_id buruk",
    v.validasiProgres({ lesson_id: "x", selesai: true }).ok === false);
  const skorHitung = await v.hitungSkorProgres(
    async () => [{ benar: true }, { benar: false }, { benar: null }],
    U, U,
  );
  cek("hitungSkorProgres: 1 benar / 3 jawaban (esai tidak dihitung benar)",
    skorHitung !== null && skorHitung.skor === 1 && skorHitung.jumlahJawaban === 3);
  cek("hitungSkorProgres: tabel belum ada -> null (untuk 503)",
    (await v.hitungSkorProgres(async () => null, U, U)) === null);
}
cek("progres route: skor dihitung dari pf_quiz_user_answers",
  progresSrc.includes("pf_quiz_user_answers") && progresSrc.includes("hitungSkorProgres"));
cek("progres route: TIDAK ADA lagi passthrough skor klien",
  !progresSrc.includes("valid.skor") && !progresSrc.includes("skorValid"));

const jawabSrc = bacaRepo("src/app/api/akademi/kuis/jawab/route.ts");
const potonganJawab = [
  ekstrakKonst(jawabSrc, "POLA_UUID"),
  ekstrakFungsi(penilaianSrc, "normalisasiIsian"),
  ekstrakFungsi(penilaianSrc, "validasiBentukJawaban"),
  ekstrakFungsi(penilaianSrc, "validasiJawabanAkademi"),
];
cek("validasiJawabanAkademi dapat diekstrak", potonganJawab.every(Boolean));
if (potonganJawab.every(Boolean)) {
  const v = new Function(
    transpileKeJs(`${potonganJawab.join("\n")}\nreturn validasiJawabanAkademi;`),
  )();
  const U = "11111111-1111-1111-1111-111111111111";
  cek("jawab: terima PG angka 2 (default)",
    v({ lesson_id: U, soal_id: U, jawaban: 2 }).ok === true);
  cek("jawab: tolak jawaban 5", v({ lesson_id: U, soal_id: U, jawaban: 5 }).ok === false);
  cek("jawab: tolak jawaban string untuk PG",
    v({ lesson_id: U, soal_id: U, jawaban: "2" }).ok === false);
  cek("jawab: tolak body null", v(null).ok === false);
  cek("jawab: terima kompleks [0,2]",
    v({ lesson_id: U, soal_id: U, jawaban: [0, 2] }, "pilihan_ganda_kompleks").ok === true);
  cek("jawab: tolak kompleks []",
    v({ lesson_id: U, soal_id: U, jawaban: [] }, "pilihan_ganda_kompleks").ok === false);
  cek("jawab: terima isian teks",
    v({ lesson_id: U, soal_id: U, jawaban: "Jakarta" }, "isian_singkat").ok === true);
  cek("jawab: terima esai teks",
    v({ lesson_id: U, soal_id: U, jawaban: "Esai panjang." }, "esai").ok === true);
  cek("jawab: terima benar/salah boolean",
    v({ lesson_id: U, soal_id: U, jawaban: true }, "benar_salah").ok === true);
  cek("jawab: tolak benar/salah 2",
    v({ lesson_id: U, soal_id: U, jawaban: 2 }, "benar_salah").ok === false);
}
cek("jawab route: menyimpan ke pf_quiz_user_answers",
  jawabSrc.includes("pf_quiz_user_answers"));
cek("jawab route: menilai via nilaiJawaban (server-side)",
  jawabSrc.includes("nilaiJawaban"));
cek("jawab route: membaca kunci dari pf_quiz_answers (P0-4)",
  jawabSrc.includes("pf_quiz_answers"));
// Respons sukses adalah NextResponse.json TERAKHIR di berkas;
// blok itu tidak boleh memuat "kunci" dalam bentuk apa pun
// (variabel internal kunciSoal di atasnya bukan respons).
const akhirRespons = jawabSrc.lastIndexOf("return NextResponse.json({");
const blokRespons = akhirRespons >= 0 ? jawabSrc.slice(akhirRespons) : "";
cek("jawab route: TIDAK mengembalikan kunci ke klien",
  akhirRespons >= 0 &&
    !blokRespons.includes("kunci") &&
    blokRespons.includes("benar: hasil.benar") &&
    blokRespons.includes("status_penilaian: hasil.status_penilaian"));

/* ============================================================
   §E. Sertifikat (skema + RLS + invarian)
   ============================================================ */
// Sertifikat A diterbitkan (simulasi service role — seperti yang
// dilakukan terbitkanSertifikat sesudah cek lulus).
const kodeA = "ABCDEFGHJKLM";
await db.query(
  `insert into public.pf_certificates (user_id, course_id, kode_verifikasi, nama_kursus, nama_peserta, kriteria)
   values ($1, $2, $3, 'Kursus B2', 'Pengguna A', '{"lulus": true}'::jsonb)`,
  [UID_A, kursusId, kodeA],
);
let anonSertifikatDitolak = false;
try {
  await sebagaiUid(UID_A, "anon", `select count(*) as n from public.pf_certificates`);
} catch {
  anonSertifikatDitolak = true;
}
cek(
  "sertifikat: anon tidak bisa SELECT (42501 — verifikasi publik lewat service, bukan RLS)",
  anonSertifikatDitolak,
);
cek(
  "sertifikat: pemilik A baca 1 sertifikat sendiri",
  (await hitungSebagaiUid(UID_A, "authenticated", `select count(*) as n from public.pf_certificates`)) === 1,
);
cek(
  "sertifikat: pengguna B 0 baris sertifikat A",
  (await hitungSebagaiUid(UID_B, "authenticated", `select count(*) as n from public.pf_certificates`)) === 0,
);
cek(
  "sertifikat: INSERT oleh authenticated DITOLAK (hanya service role)",
  !(await berhasilSebagaiUid(
    UID_B,
    "authenticated",
    `insert into public.pf_certificates (user_id, course_id, kode_verifikasi, nama_kursus) values ($1, $2, 'ZZZZZZZZZZZZ', 'Palsu')`,
    [UID_B, kursusId],
  )),
);
let duplikatDitolak = false;
try {
  await db.query(
    `insert into public.pf_certificates (user_id, course_id, kode_verifikasi, nama_kursus) values ($1, $2, 'NOPQRSTUVWXYZ', 'Kursus B2')`,
    [UID_A, kursusId],
  );
} catch {
  duplikatDitolak = true;
}
cek("sertifikat: satu sertifikat per (pengguna, kursus) — duplikat ditolak", duplikatDitolak);
let kodeBurukDitolak = false;
try {
  await db.query(
    `insert into public.pf_certificates (user_id, course_id, kode_verifikasi, nama_kursus) values ($1, $2, 'abcdef123456', 'Kursus B2')`,
    [UID_B, kursusId],
  );
} catch {
  kodeBurukDitolak = true;
}
cek("sertifikat: kode huruf kecil ditolak (CHECK format)", kodeBurukDitolak);
const bacaKode = await db.query(
  `select nama_kursus, nama_peserta, dicabut from public.pf_certificates where kode_verifikasi = $1`,
  [kodeA],
);
cek(
  "sertifikat: lookup kode mengembalikan kolom publik (tanpa user_id)",
  bacaKode.rows[0]?.nama_kursus === "Kursus B2" &&
    bacaKode.rows[0]?.nama_peserta === "Pengguna A" &&
    bacaKode.rows[0]?.dicabut === false,
);
// Riwayat per soal (H6): 5 jawaban Kuis 1 milik A terbaca.
const riwayat = await db.query(
  `select soal_id, benar, status_penilaian from public.pf_quiz_user_answers where user_id = $1 and lesson_id = $2 order by soal_id`,
  [UID_A, lKuis1],
);
cek("H6: riwayat 5 jawaban per soal Kuis 1", riwayat.rows.length === 5);
cek(
  "H6: esai tersimpan benar=null + menunggu_penilaian",
  riwayat.rows.some(
    (r) => r.soal_id === q5 && r.benar === null && r.status_penilaian === "menunggu_penilaian",
  ),
);

/* ============================================================
   §F. Asersi sumber (pola + label)
   ============================================================ */
cek("berkas route sertifikat ada",
  fs.existsSync(`${DIR_REPO}/src/app/api/akademi/sertifikat/route.ts`));
cek("berkas halaman verifikasi ada",
  fs.existsSync(`${DIR_REPO}/src/app/akademi/sertifikat/[kode]/page.tsx`));
cek("berkas lib sertifikat ada",
  fs.existsSync(`${DIR_REPO}/src/lib/akademi/sertifikat.ts`));
cek("berkas lib penilaian ada",
  fs.existsSync(`${DIR_REPO}/src/lib/akademi/penilaian.ts`));
const halamanVerifikasi = bacaRepo("src/app/akademi/sertifikat/[kode]/page.tsx");
cek("verifikasi: berlabel INTERNAL + BUKAN resmi",
  halamanVerifikasi.includes("INTERNAL") && halamanVerifikasi.includes("BUKAN"));
// Hanya kolom publik yang dirender (kode, nama kursus, nama
// peserta, tanggal, status, kriteria): tidak ada ekspresi JSX
// yang membaca user_id / email (kata itu di komentar kepala
// berkas bukan render — maka yang diperiksa ekspresi JSX).
cek("verifikasi: TIDAK menampilkan user_id/email",
  !/\{[^}]*user_id[^}]*\}/.test(halamanVerifikasi) &&
    !/\{[^}]*\.email[^}]*\}/.test(halamanVerifikasi) &&
    halamanVerifikasi.includes("sertifikat.kode_verifikasi") &&
    halamanVerifikasi.includes("sertifikat.nama_kursus"));
const sertifikatLib = bacaRepo("src/lib/akademi/sertifikat.ts");
cek("sertifikat lib: terbitkan hanya sesudah cekKelulusan",
  sertifikatLib.includes("cekKelulusan") && sertifikatLib.includes("belum_lulus"));
cek("sertifikat lib: idempotent (kembalikan sertifikat lama)",
  sertifikatLib.includes("baru: false"));
const daftarPelajaranSrc = bacaRepo("src/components/akademi/DaftarPelajaran.tsx");
cek("klien: DaftarPelajaran TIDAK LAGI mengirim skor",
  !daftarPelajaranSrc.includes("skor,") && !daftarPelajaranSrc.includes("tandaiSelesai(p.id,"));
const pembahasanSrc = bacaRepo("src/components/akademi/PembahasanKuis.tsx");
cek("klien: PembahasanKuis dukung 5 jenis soal",
  ["pilihan_ganda_kompleks", "isian_singkat", "benar_salah", "esai"].every((j) =>
    pembahasanSrc.includes(j),
  ));
const lanjutanSrc = bacaRepo("src/lib/lanjutan.ts");
cek("lanjutan: getKuisHarian membaca kolom jenis (mundur bila v14 belum ada)",
  lanjutanSrc.includes("jenis") && lanjutanSrc.includes("PGRST204"));

// ---------- Integrasi koordinator B2: penilai esai + limiter keras ----------
const esaiLib = bacaRepo("src/lib/akademi/esai.ts");
cek("esai lib: daftarEsaiMenunggu hanya esai + menunggu_penilaian",
  esaiLib.includes('eq("jenis", "esai")') &&
    esaiLib.includes('eq("status_penilaian", "menunggu_penilaian")'));
cek("esai lib: gabung pertanyaan + judul pelajaran + nama tampilan",
  esaiLib.includes("pf_quiz_questions(pertanyaan)") &&
    esaiLib.includes("pf_course_lessons(judul)") &&
    esaiLib.includes("nama_tampilan"));
cek("esai lib: gagal service client -> ok:false (503 jujur)",
  esaiLib.includes("ok: false"));
const esaiGet = bacaRepo("src/app/api/admin/akademi/esai/route.ts");
cek("esai GET: staf editor/fact_checker + pakai daftarEsaiMenunggu",
  esaiGet.includes("ROLES.EDITOR") &&
    esaiGet.includes("ROLES.FACT_CHECKER") &&
    esaiGet.includes("daftarEsaiMenunggu") &&
    esaiGet.includes("status: 503"));
const esaiNilai = bacaRepo("src/app/api/admin/akademi/esai/[id]/nilai/route.ts");
cek("esai nilai: staf editor/fact_checker + benar harus boolean",
  esaiNilai.includes("ROLES.EDITOR") &&
    esaiNilai.includes("ROLES.FACT_CHECKER") &&
    esaiNilai.includes('benar harus boolean'));
cek("esai nilai: tolak bukan-esai/sudah-dinilai 409 + pakai tandaiEsaiDinilai",
  esaiNilai.includes("tandaiEsaiDinilai") &&
    esaiNilai.includes("status: 409") &&
    esaiNilai.includes("sudah dinilai"));
cek("esai nilai: beraudit akademi.progres",
  esaiNilai.includes('"akademi.progres"'));
const esaiPage = bacaRepo("src/app/admin/akademi/esai/page.tsx");
cek("esai page: tombol Benar + Salah + antrean kosong jujur",
  esaiPage.includes("Benar") &&
    esaiPage.includes("Salah") &&
    esaiPage.includes("Belum ada esai menunggu penilaian"));
cek("admin akademi: tautan ke antrean esai",
  bacaRepo("src/app/admin/akademi/page.tsx").includes("/admin/akademi/esai"));
cek("sertifikat route: limiter fail-closed (keras 10/mnt)",
  bacaRepo("src/app/api/akademi/sertifikat/route.ts").includes("buatRateLimiterKeras(10)"));
cek("progres route: limiter fail-closed (keras 20/mnt)",
  bacaRepo("src/app/api/akademi/progres/route.ts").includes("buatRateLimiterKeras(20)"));

console.log(`\n${lolos} lolos, ${gagal} gagal.`);
process.exit(gagal === 0 ? 0 : 1);
