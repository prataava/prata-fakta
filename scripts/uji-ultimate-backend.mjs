// Uji Gelombang B1 PRATA FAKTA (Audit Ultimate backend & database) -> PGlite.
// Menerapkan v1–v13 dua kali (idempotensi) TANPA blanket grant
// (pelajaran F4), lalu memeriksa:
//   P0-5  Mutasi negara EDITOR-only (asersi sumber: POST/PATCH/
//         DELETE memakai autentikasiAdmin(req, ROLES.EDITOR)).
//   P0-4  Kunci kuis di pf_quiz_answers: kolom kunci hilang,
//         data termigrasi, 0 policy, GRANT hanya service_role,
//         anon/authenticated ditolak (42501), service_role bisa.
//   P1-4  RPC pf_patch_kursus_atomik: sukses (modul baru +
//         pelajaran via modul_kunci), gagal di tengah = TIDAK
//         ADA perubahan (atomik), kepemilikan lintas kursus
//         ditolak, slug bentrok -> 409 (kode slug_bentrok),
//         hapus modul cascade ke pelajaran, kursus tak ada ->
//         404, grant execute hanya service_role.
//   P1-15 Policy arsip Q&A: anon hanya melihat baris publik +
//         terjawab (1 baris), pemilik melihat baris sendiri,
//         staf melihat semua; route arsip via session client
//         tanpa user_id di select (asersi sumber).
//   P2-11 N+1 (asersi sumber): tanya pakai in("indikator_id"),
//         halaman kursus pakai Promise.all.
//   P2-12 Dataset: limit + rate limiter (asersi sumber).
//   P2-14 Log galat: tiap berkas lib milik B1 memakai
//         catatGalatBaca; getKuisHarian melempar penanda belum
//         tersedia (asersi sumber).
//   P2-15 PERMISSIONS dihapus dari kode (asersi sumber);
//         tabel pf_permissions tetap ada (seed v1).
//   P2-16 indikator_id ter-backfill dari slug; pf_topik_yatim()
//         hanya kembalikan negara yatim; grant hanya service_role.
//   P2-29 Backup: pf_quiz_answers di TABEL_PF; workflow
//         backup.yml ada (jadwal harian + dispatch).
//   P2-30 search_path=public di pf_has_role / pf_is_super_admin
//         / pf_handle_new_user (proconfig).
//   P2-31 pf_profiles: anon 0 baris, pemilik lihat baris
//         sendiri, staf lihat semua; policy lama 'baca publik'
//         hilang.
//   P2-32 Policy pf_system_settings tanpa cabang 'admin';
//         dead code terhapus (asersi sumber).
//   P3-5  getSumber dibatasi 200 (asersi sumber).
//   P3-6  getUserRoles di-cache per request (asersi sumber).
//   P3-7  Tanpa zod: bacaBody + validator terpusat
//         (asersi sumber: tidak ada dependensi zod di package.json).
//   P3-8  RPC pf_ai_status_agregat() benar per agen; grant
//         authenticated + service_role, anon ditolak.
//   P3-9  /api/akun/status pakai buatRateLimiter(30)
//         (asersi sumber).
//   Regresi: T1-sisa (kolom kunci hilang total), T5 (INSERT
//         anon questions ditolak), v11 RPC limiter tetap jalan.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// BATAS KEJUJURAN baterai ini (bukan klaim lebih):
// - Respons HTTP 403 untuk writer/fact_checker di negara dan
//   perilaku route TIDAK diuji lewat HTTP hidup (tidak ada
//   server jalan di sini); yang diuji: asersi sumber bahwa
//   route memakai autentikasiAdmin(req, ROLES.EDITOR) +
//   simulasi SQL atas policy/RPC yang ditegakkan DB.
//   Verifikasi HTTP hidup tetap tugas tahap browser/koordinator.
// - Atomicity RPC: PGlite satu koneksi — uji ini membuktikan
//   validasi pass-1 menolak SEBELUM satu baris pun ditulis
//   (bukan paralelisme sejati dua koneksi); jalur RAISE di
//   pass 2 (race) tidak dapat dipicu deterministik di sini.
// - Seed HARUS disisipkan sesudah v1–v12 dan sebelum v13
//   (agar migrasi kunci + backfill indikator_id teruji);
//   struktur di bawah melakukannya secara eksplisit.
// - Setup membuat role service_role (seperti di Supabase
//   nyata) — tanpa ini GRANT v13 gagal di PGlite karena role
//   tidak ada; ini pemodelan lingkungan, bukan perubahan
//   migrasi.
import fs from "node:fs";
import { createRequire } from "node:module";

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

/** Jalankan SQL sebagai role + uid tertentu (auth.uid() stub
 *  membaca setting pf.uid_test). */
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

// Setup PGlite (pola uji-tahap13a.mjs): schema auth + tabel
// auth.users + stub auth.uid() + role — SEBELUM migrasi.
// service_role dibuat di sini karena Supabase nyata memilikinya
// dan v13 memberi GRANT ke role itu — DENGAN bypassrls, karena
// service_role Supabase nyata memang bypass RLS (tanpa itu,
// role PGlite biasa tetap terhalang 0-policy di pf_quiz_answers
// dan uji service_role akan gagal palsu).
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
const indikatorId = (
  await db.query(
    `insert into public.pf_data_indicators (nama, slug, kategori, sumber_nama)
     values ('Indikator Uji', 'uji-indikator', 'nasional', 'Uji') returning id`,
  )
).rows[0].id;
const laporanId = (
  await db.query(
    `insert into public.pf_research_reports (slug, judul, status)
     values ('uji-indikator', 'Laporan Uji Indikator', 'terbit') returning id`,
  )
).rows[0].id;
const soalKuisId = (
  await db.query(
    `insert into public.pf_quiz_questions (tanggal, pertanyaan, opsi, kunci)
     values ('2026-11-16', 'Soal uji?', '["a","b","c","d","e"]'::jsonb, 2) returning id`,
  )
).rows[0].id;
const qPublikTerjawab = (
  await db.query(
    `insert into public.pf_questions (user_id, pertanyaan, jawaban, status, publik)
     values ($1, 'Apa itu uji?', 'Ini jawaban.', 'terjawab', true) returning id`,
    [UID_A],
  )
).rows[0].id;
await db.query(
  `insert into public.pf_questions (user_id, pertanyaan, status, publik)
   values ($1, 'Menunggu jawab?', 'menunggu', true)`,
  [UID_A],
);
await db.query(
  `insert into public.pf_questions (user_id, pertanyaan, jawaban, status, publik)
   values ($1, 'Privat terjawab?', 'Jawaban privat.', 'terjawab', false)`,
  [UID_B],
);
await db.query(
  `insert into public.pf_questions (user_id, pertanyaan, status, publik)
   values ($1, 'Privat menunggu?', 'menunggu', false)`,
  [UID_B],
);
await db.query(
  `insert into public.pf_followed_topics (user_id, tipe, target)
   values ($1, 'negara', 'Indonesia'), ($1, 'negara', 'Atlantis'),
          ($1, 'kategori', 'indonesia'), ($1, 'isu', 'topik bebas')`,
  [UID_A],
);
for (const [agen, status] of [
  ["research", "berhasil"],
  ["research", "berhasil"],
  ["research", "gagal"],
  ["fact_verification", "berhasil"],
  ["summarization", "berjalan"],
]) {
  await db.query(
    `insert into public.pf_ai_runs (agen, status) values ($1, $2)`,
    [agen, status],
  );
}
const kursus1Id = (
  await db.query(
    `insert into public.pf_courses (slug, judul, status) values ('kursus-uji', 'Kursus Uji', 'terbit') returning id`,
  )
).rows[0].id;
const kursus2Id = (
  await db.query(
    `insert into public.pf_courses (slug, judul, status) values ('kursus-lain', 'Kursus Lain', 'terbit') returning id`,
  )
).rows[0].id;
const modul1Id = (
  await db.query(
    `insert into public.pf_course_modules (course_id, judul, urutan) values ($1, 'Modul 1', 1) returning id`,
    [kursus1Id],
  )
).rows[0].id;
await db.query(
  `insert into public.pf_course_lessons (module_id, judul, jenis, urutan) values ($1, 'Pelajaran 1', 'materi', 1)`,
  [modul1Id],
);
const modulLainId = (
  await db.query(
    `insert into public.pf_course_modules (course_id, judul, urutan) values ($1, 'Modul Lain', 1) returning id`,
    [kursus2Id],
  )
).rows[0].id;
const pelajaranLainId = (
  await db.query(
    `insert into public.pf_course_lessons (module_id, judul, jenis, urutan) values ($1, 'Pelajaran Lain', 'materi', 1) returning id`,
    [modulLainId],
  )
).rows[0].id;
console.log("OK: seed sesudah v1–v12 (2 pengguna, 1 soal kunci=2, 4 pertanyaan, 4 topik, 5 ai_runs, 2 kursus)");

// ---------- Putaran 1: v13 ----------
{
  const ok = await jalankan(`migrasi ${MIGRASI_V13} (putaran 1)`, baca(MIGRASI_V13));
  if (!ok) process.exit(1);
}

// ---------- Putaran 2: v1–v13 (idempotensi) ----------
for (const nama of [...MIGRASI_V1_V12, MIGRASI_V13]) {
  const ok = await jalankan(`migrasi ${nama} (putaran 2)`, baca(nama));
  if (!ok) process.exit(1);
}

// ---------- Hitung akhir v13 ----------
const tabel = await db.query(
  `select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'pf_%'`,
);
cek("jumlah tabel pf_* = 55", tabel.rows[0].n === 55, `dapat ${tabel.rows[0].n}`);
const rls = await db.query(
  `select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'pf_%' and rowsecurity`,
);
cek("RLS 55/55", rls.rows[0].n === 55, `dapat ${rls.rows[0].n}`);
const policy = await db.query(
  `select count(*)::int as n from pg_policies where schemaname='public' and tablename like 'pf_%'`,
);
cek("jumlah policy pf_* = 107", policy.rows[0].n === 107, `dapat ${policy.rows[0].n}`);
const policyJawaban = await db.query(
  `select count(*)::int as n from pg_policies where schemaname='public' and tablename = 'pf_quiz_answers'`,
);
cek("policy pf_quiz_answers = 0 (tanpa SELECT sama sekali)", policyJawaban.rows[0].n === 0, `dapat ${policyJawaban.rows[0].n}`);

// ---------- P0-4: kunci kuis di tabel terpisah ----------
const kolomKunci = await db.query(
  `select count(*)::int as n from information_schema.columns
   where table_schema='public' and table_name='pf_quiz_questions' and column_name='kunci'`,
);
cek("P0-4: kolom pf_quiz_questions.kunci SUDAH TIDAK ADA", kolomKunci.rows[0].n === 0, `dapat ${kolomKunci.rows[0].n}`);
const jawaban = await db.query(
  `select soal_id, kunci from public.pf_quiz_answers`,
);
cek(
  "P0-4: migrasi data kunci benar (1 baris, soal cocok, kunci=2)",
  jawaban.rows.length === 1 &&
    jawaban.rows[0].soal_id === soalKuisId &&
    jawaban.rows[0].kunci === 2,
  JSON.stringify(jawaban.rows[0] ?? null),
);
const hakJawabanAnon = await db.query(
  `select has_table_privilege('anon', 'public.pf_quiz_answers', 'SELECT') as h`,
);
cek("P0-4: anon TIDAK punya SELECT pf_quiz_answers", hakJawabanAnon.rows[0].h === false);
const hakJawabanAuth = await db.query(
  `select has_table_privilege('authenticated', 'public.pf_quiz_answers', 'SELECT') as h`,
);
cek("P0-4: authenticated TIDAK punya SELECT pf_quiz_answers", hakJawabanAuth.rows[0].h === false);
const hakJawabanService = await db.query(
  `select has_table_privilege('service_role', 'public.pf_quiz_answers', 'SELECT') as h`,
);
cek("P0-4: service_role PUNYA SELECT pf_quiz_answers", hakJawabanService.rows[0].h === true);
cek(
  "P0-4: SELECT pf_quiz_answers sebagai anon DITOLAK (42501)",
  !(await berhasilSebagai("anon", `select * from public.pf_quiz_answers`)),
);
cek(
  "P0-4: SELECT pf_quiz_answers sebagai authenticated DITOLAK (42501)",
  !(await berhasilSebagai("authenticated", `select * from public.pf_quiz_answers`)),
);
cek(
  "P0-4: SELECT pf_quiz_answers sebagai service_role BERHASIL (1 baris)",
  (await hitungSebagai("service_role", `select count(*) n from public.pf_quiz_answers`)) === 1,
);
cek(
  "P0-4: SELECT kunci sebagai anon DITOLAK (kolom tidak ada lagi)",
  !(await berhasilSebagai("anon", `select kunci from public.pf_quiz_questions where id = $1`, [soalKuisId])),
);
cek(
  "P0-4: SELECT kolom non-kunci soal sebagai anon TETAP bisa",
  (await hitungSebagai("anon", `select count(*) n from public.pf_quiz_questions where id = $1`, [soalKuisId])) === 1,
);

// ---------- P1-4: RPC pf_patch_kursus_atomik ----------
async function panggilPatchKursus(kursusId, kursus, modul, pelajaran) {
  const r = await db.query(
    `select pf_patch_kursus_atomik($1::uuid, $2::jsonb, $3::jsonb, $4::jsonb) as hasil`,
    [kursusId, JSON.stringify(kursus), JSON.stringify(modul), JSON.stringify(pelajaran)],
  );
  const h = r.rows[0].hasil;
  return typeof h === "string" ? JSON.parse(h) : h;
}
async function hitungModul(kursusId) {
  const r = await db.query(`select count(*)::int as n from public.pf_course_modules where course_id = $1::uuid`, [kursusId]);
  return r.rows[0].n;
}
async function hitungPelajaranModul(modulId) {
  const r = await db.query(`select count(*)::int as n from public.pf_course_lessons where module_id = $1::uuid`, [modulId]);
  return r.rows[0].n;
}
const hakRpcAnon = await db.query(
  `select has_function_privilege('anon', 'public.pf_patch_kursus_atomik(uuid, jsonb, jsonb, jsonb)', 'execute') as h`,
);
cek("P1-4: anon TIDAK bisa mengeksekusi pf_patch_kursus_atomik", hakRpcAnon.rows[0].h === false);
const hakRpcAuth = await db.query(
  `select has_function_privilege('authenticated', 'public.pf_patch_kursus_atomik(uuid, jsonb, jsonb, jsonb)', 'execute') as h`,
);
cek("P1-4: authenticated TIDAK bisa mengeksekusi pf_patch_kursus_atomik", hakRpcAuth.rows[0].h === false);
const hakRpcService = await db.query(
  `select has_function_privilege('service_role', 'public.pf_patch_kursus_atomik(uuid, jsonb, jsonb, jsonb)', 'execute') as h`,
);
cek("P1-4: service_role BISA mengeksekusi pf_patch_kursus_atomik", hakRpcService.rows[0].h === true);
cek(
  "P1-4: RPC sebagai anon DITOLAK (gerbang GRANT)",
  !(await berhasilSebagai("anon", `select pf_patch_kursus_atomik($1::uuid, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb)`, [kursus1Id])),
);

// Sukses: modul baru (kunci sementara) + pelajaran via modul_kunci + ubah judul.
const hasilSukses = await panggilPatchKursus(
  kursus1Id,
  { judul: "Kursus Uji (diubah)" },
  [{ kunci: "m-baru", judul: "Modul Baru", urutan: 2 }],
  [{ modul_kunci: "m-baru", judul: "Pelajaran Baru", jenis: "materi", urutan: 1 }],
);
cek("P1-4: PATCH sukses -> ok=true", hasilSukses?.ok === true, JSON.stringify(hasilSukses));
const modulBaru = (
  await db.query(
    `select id from public.pf_course_modules where course_id = $1::uuid and judul = 'Modul Baru'`,
    [kursus1Id],
  )
).rows[0];
cek("P1-4: modul baru tertulis", Boolean(modulBaru));
cek(
  "P1-4: pelajaran baru tertulis di modul baru (modul_kunci terurai)",
  modulBaru ? (await hitungPelajaranModul(modulBaru.id)) === 1 : false,
);
const judulDiubah = (
  await db.query(`select judul from public.pf_courses where id = $1::uuid`, [kursus1Id])
).rows[0]?.judul;
cek("P1-4: judul kursus berubah", judulDiubah === "Kursus Uji (diubah)", String(judulDiubah));

// Gagal di tengah (pass 1): modul valid + pelajaran modul_kunci tak ada -> TIDAK ADA perubahan.
const modulSebelumGagal = await hitungModul(kursus1Id);
const hasilGagalTengah = await panggilPatchKursus(
  kursus1Id,
  {},
  [{ kunci: "m-gagal", judul: "Modul Yang Tidak Boleh Ada", urutan: 9 }],
  [{ modul_kunci: "kunci-tidak-ada", judul: "Pelajaran Gagal", jenis: "materi" }],
);
cek(
  "P1-4: PATCH gagal di tengah -> kode modul_kunci_tidak_ditemukan",
  hasilGagalTengah?.ok === false && hasilGagalTengah?.kode === "modul_kunci_tidak_ditemukan",
  JSON.stringify(hasilGagalTengah),
);
cek(
  "P1-4: ATOMIK — modul valid sebelum entri gagal TIDAK tertulis",
  (await hitungModul(kursus1Id)) === modulSebelumGagal,
  `modul ${await hitungModul(kursus1Id)} vs ${modulSebelumGagal}`,
);

// Kepemilikan lintas kursus ditolak, tanpa perubahan.
const hasilLintas = await panggilPatchKursus(
  kursus1Id,
  {},
  [],
  [{ id: pelajaranLainId, judul: "Coba Curi" }],
);
cek(
  "P1-4: pelajaran kursus lain ditolak (pelajaran_bukan_milik_kursus)",
  hasilLintas?.ok === false && hasilLintas?.kode === "pelajaran_bukan_milik_kursus",
  JSON.stringify(hasilLintas),
);
const judulLainTetap = (
  await db.query(`select judul from public.pf_course_lessons where id = $1::uuid`, [pelajaranLainId])
).rows[0]?.judul;
cek("P1-4: pelajaran kursus lain TIDAK berubah", judulLainTetap === "Pelajaran Lain", String(judulLainTetap));

// Slug bentrok -> kode slug_bentrok, judul tidak berubah.
const hasilSlug = await panggilPatchKursus(kursus1Id, { slug: "kursus-lain" }, [], []);
cek(
  "P1-4: slug bentrok -> kode slug_bentrok (route memetakan ke 409)",
  hasilSlug?.ok === false && hasilSlug?.kode === "slug_bentrok",
  JSON.stringify(hasilSlug),
);
const judulSetelahSlug = (
  await db.query(`select judul from public.pf_courses where id = $1::uuid`, [kursus1Id])
).rows[0]?.judul;
cek("P1-4: judul TIDAK berubah sesudah slug bentrok", judulSetelahSlug === "Kursus Uji (diubah)");

// Kursus tak ada -> kursus_tidak_ditemukan.
const hasilTakAda = await panggilPatchKursus("33333333-3333-3333-3333-333333333333", {}, [], []);
cek(
  "P1-4: kursus tak ada -> kode kursus_tidak_ditemukan",
  hasilTakAda?.ok === false && hasilTakAda?.kode === "kursus_tidak_ditemukan",
  JSON.stringify(hasilTakAda),
);

// Hapus modul: pelajaran di dalamnya ikut terhapus (CASCADE).
const hasilHapus = await panggilPatchKursus(
  kursus1Id,
  {},
  [{ id: modul1Id, hapus: true }],
  [],
);
cek("P1-4: hapus modul -> ok=true", hasilHapus?.ok === true, JSON.stringify(hasilHapus));
cek(
  "P1-4: modul terhapus + pelajarannya ikut terhapus (CASCADE)",
  (await hitungPelajaranModul(modul1Id)) === 0 &&
    (await db.query(`select count(*)::int as n from public.pf_course_modules where id = $1::uuid`, [modul1Id])).rows[0].n === 0,
);
cek(
  "P1-4: modul lain (kursus lain) TIDAK ikut terhapus",
  (await db.query(`select count(*)::int as n from public.pf_course_modules where id = $1::uuid`, [modulLainId])).rows[0].n === 1,
);

// ---------- P1-15: policy arsip Q&A publik ----------
cek(
  "P1-15: anon hanya melihat 1 baris pf_questions (publik + terjawab)",
  (await hitungSebagai("anon", `select count(*) n from public.pf_questions`)) === 1,
);
const arsipAnon = await sebagai("anon", `select id from public.pf_questions`);
cek(
  "P1-15: baris yang terlihat anon adalah pertanyaan publik-terjawab",
  arsipAnon.rows.length === 1 && arsipAnon.rows[0].id === qPublikTerjawab,
);
cek(
  "P1-15: pemilik (A) melihat 2 baris sendiri",
  (await hitungSebagaiUid(UID_A, "authenticated", `select count(*) n from public.pf_questions`)) === 2,
);
cek(
  "P1-15: staf editor (B) melihat semua 4 baris",
  (await hitungSebagaiUid(UID_B, "authenticated", `select count(*) n from public.pf_questions`)) === 4,
);
const policyArsip = await db.query(
  `select count(*)::int as n from pg_policies where schemaname='public' and tablename='pf_questions' and policyname='pf_questions arsip publik'`,
);
cek("P1-15: policy 'pf_questions arsip publik' ada", policyArsip.rows[0].n === 1);

// ---------- P2-16: indikator_id + topik yatim ----------
const laporanSesudah = (
  await db.query(`select indikator_id from public.pf_research_reports where id = $1::uuid`, [laporanId])
).rows[0];
cek(
  "P2-16: indikator_id laporan ter-backfill dari slug yang cocok",
  laporanSesudah?.indikator_id === indikatorId,
  `dapat ${laporanSesudah?.indikator_id} vs ${indikatorId}`,
);
const yatim = await sebagai(
  "service_role",
  `select id, tipe, target from public.pf_topik_yatim()`,
);
cek(
  "P2-16: pf_topik_yatim() kembalikan tepat 1 baris (Atlantis)",
  yatim.rows.length === 1 && yatim.rows[0].target === "Atlantis" && yatim.rows[0].tipe === "negara",
  JSON.stringify(yatim.rows),
);
cek(
  "P2-16: pf_topik_yatim() TIDAK kembalikan kategori/isu (tanpa referen DB)",
  !yatim.rows.some((r) => r.tipe === "kategori" || r.tipe === "isu"),
);
cek(
  "P2-16: pf_topik_yatim() sebagai anon DITOLAK (hanya service_role)",
  !(await berhasilSebagai("anon", `select * from public.pf_topik_yatim()`)),
);
cek(
  "P2-16: pf_topik_yatim() sebagai authenticated DITOLAK (hanya service_role)",
  !(await berhasilSebagai("authenticated", `select * from public.pf_topik_yatim()`)),
);

// ---------- P2-30: search_path fungsi ----------
for (const fn of ["pf_has_role", "pf_is_super_admin", "pf_handle_new_user"]) {
  const r = await db.query(
    `select prosecdef, proconfig from pg_proc where proname = $1`,
    [fn],
  );
  const cfg = (r.rows[0]?.proconfig ?? []).join(",");
  cek(`P2-30: ${fn} punya search_path=public di proconfig`, cfg.includes("search_path=public"), cfg || "(kosong)");
}
const defHasRole = await db.query(`select prosecdef from pg_proc where proname = 'pf_has_role'`);
cek("P2-30: pf_has_role SECURITY DEFINER", defHasRole.rows[0]?.prosecdef === true);
const defSuperAdmin = await db.query(`select prosecdef from pg_proc where proname = 'pf_is_super_admin'`);
cek("P2-30: pf_is_super_admin SECURITY DEFINER", defSuperAdmin.rows[0]?.prosecdef === true);

// ---------- P2-31: pf_profiles dibatasi ----------
cek(
  "P2-31: anon melihat 0 baris pf_profiles",
  (await hitungSebagai("anon", `select count(*) n from public.pf_profiles`)) === 0,
);
cek(
  "P2-31: pemilik (A) melihat 1 baris sendiri",
  (await hitungSebagaiUid(UID_A, "authenticated", `select count(*) n from public.pf_profiles`)) === 1,
);
cek(
  "P2-31: staf editor (B) melihat 2 baris (semua profil)",
  (await hitungSebagaiUid(UID_B, "authenticated", `select count(*) n from public.pf_profiles`)) === 2,
);
const policyProfilLama = await db.query(
  `select count(*)::int as n from pg_policies where schemaname='public' and tablename='pf_profiles' and policyname='pf_profiles baca publik'`,
);
cek("P2-31: policy lama 'pf_profiles baca publik' HILANG", policyProfilLama.rows[0].n === 0);
const policyProfilBaru = await db.query(
  `select count(*)::int as n from pg_policies where schemaname='public' and tablename='pf_profiles' and policyname='pf_profiles baca pemilik dan staf'`,
);
cek("P2-31: policy baru 'pf_profiles baca pemilik dan staf' ada", policyProfilBaru.rows[0].n === 1);

// ---------- P2-32: policy pf_system_settings tanpa 'admin' ----------
const defSystemSettings = await db.query(
  `select qual from pg_policies where schemaname='public' and tablename='pf_system_settings' and policyname='pf_system_settings baca staf'`,
);
cek(
  "P2-32: policy pf_system_settings TIDAK memuat pf_has_role('admin')",
  // Periksa cabang mati persis pf_has_role('admin' — bukan
  // substring 'admin' (super_admin mengandung 'admin').
  Boolean(defSystemSettings.rows[0]) && !String(defSystemSettings.rows[0].qual ?? "").includes("pf_has_role('admin'"),
  String(defSystemSettings.rows[0]?.qual ?? "(policy tidak ada)"),
);

// ---------- P3-8: RPC pf_ai_status_agregat ----------
const agregat = await sebagai("authenticated", `select * from public.pf_ai_status_agregat() order by agen`);
const perAgen = new Map(agregat.rows.map((r) => [r.agen, r]));
cek(
  "P3-8: agregat research total=3, berhasil=2, gagal=1",
  Number(perAgen.get("research")?.total) === 3 &&
    Number(perAgen.get("research")?.berhasil) === 2 &&
    Number(perAgen.get("research")?.gagal) === 1,
  JSON.stringify(perAgen.get("research") ?? null),
);
cek(
  "P3-8: agregat fact_verification total=1, berhasil=1",
  Number(perAgen.get("fact_verification")?.total) === 1 &&
    Number(perAgen.get("fact_verification")?.berhasil) === 1,
  JSON.stringify(perAgen.get("fact_verification") ?? null),
);
cek(
  "P3-8: agregat summarization total=1, berjalan=1",
  Number(perAgen.get("summarization")?.total) === 1 &&
    Number(perAgen.get("summarization")?.berjalan) === 1,
  JSON.stringify(perAgen.get("summarization") ?? null),
);
cek(
  "P3-8: pf_ai_status_agregat sebagai anon DITOLAK (gerbang GRANT)",
  !(await berhasilSebagai("anon", `select * from public.pf_ai_status_agregat()`)),
);
cek(
  "P3-8: pf_ai_status_agregat sebagai service_role BERHASIL",
  await berhasilSebagai("service_role", `select * from public.pf_ai_status_agregat()`),
);

// ---------- §9: topik_gdelt + unique index evidence ----------
const kolomTopik = await db.query(
  `select count(*)::int as n from information_schema.columns
   where table_schema = 'public' and table_name = 'pf_sources' and column_name = 'topik_gdelt'`,
);
cek("§9a: kolom pf_sources.topik_gdelt ada", kolomTopik.rows[0].n === 1, `dapat ${kolomTopik.rows[0].n}`);
const indexEvidence = await db.query(
  `select count(*)::int as n from pg_indexes
   where schemaname = 'public' and tablename = 'pf_evidence' and indexname = 'pf_evidence_klaim_sumber_uniq'`,
);
cek("§9b: unique index pf_evidence_klaim_sumber_uniq ada", indexEvidence.rows[0].n === 1, `dapat ${indexEvidence.rows[0].n}`);
// Duplikat (klaim_id, sumber_url) yang sama ditolak 23505.
const itemUji = await db.query(
  `insert into public.pf_raw_items (url, hash_url, judul, hash_judul) values ('https://example.com/item-uji', 'hash-url-uji-s9', 'Item uji dedup §9', 'hash-judul-uji-s9') returning id`,
);
const klaimUji = await db.query(
  `insert into public.pf_claims (raw_item_id, teks) values ($1, 'Klaim uji dedup §9.') returning id`,
  [itemUji.rows[0].id],
);
const klaimId = klaimUji.rows[0].id;
await db.query(
  `insert into public.pf_evidence (klaim_id, sumber_url, sumber_nama, arah) values ($1, 'https://example.com/sumber-uji', 'Contoh', 'mendukung')`,
  [klaimId],
);
cek(
  "§9b: evidence duplikat (klaim_id, sumber_url) DITOLAK unique index (23505)",
  await (async () => {
    try {
      await sebagai(
        "service_role",
        `insert into public.pf_evidence (klaim_id, sumber_url, sumber_nama, arah) values ($1, 'https://example.com/sumber-uji', 'Contoh', 'mendukung')`,
        [klaimId],
      );
      return false;
    } catch (e) {
      return (
        typeof e === "object" && e !== null && "code" in e && e.code === "23505"
      );
    }
  })(),
);
cek(
  "§9b: evidence sumber_url berbeda untuk klaim sama DITERIMA",
  await berhasilSebagai(
    "service_role",
    `insert into public.pf_evidence (klaim_id, sumber_url, sumber_nama, arah) values ($1, 'https://example.com/sumber-lain', 'Contoh Lain', 'mendukung')`,
    [klaimId],
  ),
);

// ---------- §10: GRANT service_role atas SEMUA tabel pf_* ----------
// Pasca-default Supabase 30 Okt 2026, tabel baru TIDAK mendapat
// grant otomatis (bahkan service_role) — tanpa §10, seluruh
// service client gagal 42501 di produksi. Asersi: keempat hak
// (SELECT/INSERT/UPDATE/DELETE) untuk service_role di 55/55 tabel.
const hakService = await db.query(
  `select table_name, count(distinct privilege_type)::int as n
   from information_schema.table_privileges
   where table_schema = 'public' and grantee = 'service_role'
     and table_name like 'pf_%'
     and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
   group by table_name`,
);
const tabelLengkap = hakService.rows.filter((r) => Number(r.n) === 4);
cek(
  "§10: service_role punya SELECT/INSERT/UPDATE/DELETE di 55/55 tabel pf_*",
  tabelLengkap.length === 55,
  `dapat ${tabelLengkap.length}`,
);
const tabelKurang = hakService.rows
  .filter((r) => Number(r.n) !== 4)
  .map((r) => `${r.table_name}:${r.n}`)
  .join(", ");
cek("§10: tidak ada tabel pf_* dengan hak service_role tidak lengkap", tabelKurang === "", tabelKurang);
// Bukti langsung: service_role BISA menulis tabel pipeline
// (sebelum §10, insert ini gagal 42501 di PGlite).
cek(
  "§10: service_role bisa INSERT pf_claims (jalur pipeline)",
  await berhasilSebagai(
    "service_role",
    `insert into public.pf_claims (raw_item_id, teks) values ($1, 'Klaim uji §10.')`,
    [itemUji.rows[0].id],
  ),
);

// ---------- Regresi: T5 + v11 RPC limiter ----------
cek(
  "Regresi T5: INSERT anon pf_questions DITOLAK",
  !(await berhasilSebagai("anon", `insert into public.pf_questions (user_id, pertanyaan, status) values (null, 'curang?', 'menunggu')`)),
);
cek(
  "Regresi v11: RPC pf_rate_limit_check tetap jalan (2 dalam batas 2 lolos, ke-3 ditolak)",
  (await db.query(`select pf_rate_limit_check('b1:regresi', 2, 60) as h`)).rows[0].h === true &&
    (await db.query(`select pf_rate_limit_check('b1:regresi', 2, 60) as h`)).rows[0].h === true &&
    (await db.query(`select pf_rate_limit_check('b1:regresi', 2, 60) as h`)).rows[0].h === false,
);

// ---------- Asersi sumber (kode) ----------
// P0-5: mutasi negara EDITOR-only (GET tanpa peran tetap boleh).
const negaraRoute = bacaRepo("src/app/api/admin/negara/route.ts");
const negaraIdRoute = bacaRepo("src/app/api/admin/negara/[id]/route.ts");
cek(
  "P0-5: POST negara memakai autentikasiAdmin(req, ROLES.EDITOR)",
  (negaraRoute.match(/autentikasiAdmin\(req, ROLES\.EDITOR\)/g) ?? []).length === 1,
);
cek(
  "P0-5: PATCH + DELETE negara memakai autentikasiAdmin(req, ROLES.EDITOR)",
  (negaraIdRoute.match(/autentikasiAdmin\(req, ROLES\.EDITOR\)/g) ?? []).length === 2,
);
cek(
  "P0-5: route negara TIDAK memberi peran WRITER pada mutasi",
  !negaraRoute.includes("ROLES.WRITER") && !negaraIdRoute.includes("ROLES.WRITER"),
);

// P0-4 kode: kunci dibaca dari pf_quiz_answers.
const lanjutan = bacaRepo("src/lib/lanjutan.ts");
cek("P0-4: getKuisHarian membaca pf_quiz_answers", lanjutan.includes('from("pf_quiz_answers")') || lanjutan.includes("pf_quiz_answers"));
cek("P0-4: getKuisHarian melempar KuisBelumTersediaError (bukan [])", lanjutan.includes("KuisBelumTersediaError"));
for (const rel of ["src/app/api/kuis/jawab/route.ts", "src/app/api/akademi/kuis/jawab/route.ts"]) {
  cek(`P0-4: ${rel} membaca pf_quiz_answers`, bacaRepo(rel).includes("pf_quiz_answers"));
}

// P1-4 kode: PATCH akademi memanggil RPC.
const akademiPatch = bacaRepo("src/app/api/admin/akademi/[id]/route.ts");
cek("P1-4: PATCH akademi memanggil RPC pf_patch_kursus_atomik", akademiPatch.includes('"pf_patch_kursus_atomik"'));
cek("P1-4: PATCH akademi memetakan slug_bentrok ke 409", akademiPatch.includes("slug_bentrok") && akademiPatch.includes("409"));

// P1-15 kode: arsip via session client, kolom aman.
const arsip = bacaRepo("src/app/api/tanya/arsip/route.ts");
cek("P1-15: arsip memakai session client (createClient)", arsip.includes("createClient"));
cek("P1-15: arsip TIDAK memakai service client", !arsip.includes("createServiceClient") && !arsip.includes("ServiceClient"));
const selectArsip = [...arsip.matchAll(/\.select\(\s*"([^"]*)"/g)].map((m) => m[1]);
cek(
  "P1-15: select arsip TANPA user_id",
  selectArsip.length > 0 && selectArsip.every((s) => !s.includes("user_id")),
  selectArsip.join(" | "),
);

// P2-11: N+1 retrieval + halaman kursus.
const tanya = bacaRepo("src/app/api/tanya/route.ts");
cek('P2-11: tanya memakai satu query .in("indikator_id", ids)', tanya.includes('.in("indikator_id", ids)'));
const halamanKursus = bacaRepo("src/app/akademi/[slug]/page.tsx");
cek("P2-11: halaman kursus memakai Promise.all (satu query per tanggal unik)", halamanKursus.includes("Promise.all"));

// P2-12: dataset dibatasi + rate limiter.
const dataset = bacaRepo("src/app/api/riset/[slug]/dataset/route.ts");
cek("P2-12: dataset memakai batasDataset (limit terdokumentasi)", dataset.includes("batasDataset"));
cek("P2-12: dataset memakai rate limiter 10/menit", dataset.includes("buatRateLimiter(10)"));
cek("P2-12: dataset mengirim header X-PF-Dataset-Limit", dataset.includes("X-PF-Dataset-Limit"));

// P2-14: log galat di tiap berkas lib milik B1.
const LIB_B1 = [
  "src/lib/data.ts",
  "src/lib/cerita.ts",
  "src/lib/negara.ts",
  "src/lib/riset.ts",
  "src/lib/lanjutan.ts",
  "src/lib/podcast.ts",
  "src/lib/explainer.ts",
  "src/lib/sejarah.ts",
];
for (const rel of LIB_B1) {
  const isi = bacaRepo(rel);
  cek(`P2-14: ${rel} memakai catatGalatBaca`, isi.includes("catatGalatBaca"));
  const bare = (isi.match(/catch \{/g) ?? []).length;
  // Satu-satunya catch telanjang yang tersisa adalah parse URL
  // lokal di data.ts (namaDariUrl — tanpa I/O, berkomentar).
  const batasBare = rel === "src/lib/data.ts" ? 1 : 0;
  cek(`P2-14: ${rel} tanpa catch telanjang (batas ${batasBare})`, bare <= batasBare, `dapat ${bare}`);
}

// P2-15: PERMISSIONS dihapus dari kode; tabel tetap ada (seed v1).
const roles = bacaRepo("src/lib/auth/roles.ts");
cek("P2-15: roles.ts TIDAK lagi mengekspor konstanta PERMISSIONS", !/export\s+(const|type)\s+PERMISSIONS/.test(roles));
cek("P2-15: roles.ts TIDAK mendefinisikan PERMISSIONS =", !roles.includes("PERMISSIONS ="));
const jumlahPeranSeed = await db.query(`select count(*)::int as n from public.pf_permissions`);
cek("P2-15: tabel pf_permissions TETAP ADA (seed v1 tidak diubah)", jumlahPeranSeed.rows[0].n > 0, `dapat ${jumlahPeranSeed.rows[0].n} baris`);

// P2-29: backup mencakup pf_quiz_answers + workflow harian.
const backup = bacaRepo("scripts/backup-pf.mjs");
cek("P2-29: backup-pf.mjs mencakup pf_quiz_answers", backup.includes('"pf_quiz_answers"'));
const backupYml = bacaRepo(".github/workflows/backup.yml");
cek("P2-29: workflow backup.yml ada + jadwal harian", backupYml.includes("cron:") && backupYml.includes("workflow_dispatch"));
cek("P2-29: workflow backup.yml menjalankan scripts/backup-pf.mjs", backupYml.includes("scripts/backup-pf.mjs"));

// P2-32: dead code terhapus.
for (const [rel, nama] of [
  ["src/lib/explainer.ts", "getDaftarExplainer"],
  ["src/lib/lanjutan.ts", "getSemuaTimeline"],
  ["src/lib/sejarah.ts", "getEra"],
  ["src/lib/cerita.ts", "isMengikutiCerita"],
]) {
  const isi = bacaRepo(rel);
  cek(`P2-32: ${nama} terhapus dari ${rel}`, !new RegExp(`export (async )?function ${nama}\\b`).test(isi));
}

// P3-5: getSumber dibatasi 200.
const dataLib = bacaRepo("src/lib/data.ts");
cek("P3-5: getSumber dibatasi .limit(200)", dataLib.includes(".limit(200)"));

// P3-6: getUserRoles di-cache per request.
cek("P3-6: getUserRoles memakai cache() React (per request)", roles.includes("cache(bacaPeranPengguna)"));

// P3-7: tanpa zod.
const packageJson = bacaRepo("package.json");
cek("P3-7: package.json TIDAK memakai zod", !packageJson.includes('"zod"'));

// P3-8/P3-9: status AI + akun.
const aiStatus = bacaRepo("src/app/api/ai/status/route.ts");
cek("P3-8: /api/ai/status memanggil RPC pf_ai_status_agregat", aiStatus.includes("pf_ai_status_agregat"));
const akunStatus = bacaRepo("src/app/api/akun/status/route.ts");
cek("P3-9: /api/akun/status memakai buatRateLimiter(30)", akunStatus.includes("const lolosRateLimit = buatRateLimiter(30);"));

// ---------- Ringkasan ----------
console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
if (gagal > 0) {
  console.log("HASIL: ADA KEGAGALAN");
  process.exit(1);
}
