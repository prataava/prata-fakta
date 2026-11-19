// Uji Explain the World + PRATA Academy (Fase 8 Gel. 2) -> PGlite.
// Menerapkan v1–v10 dua kali (idempotensi) TANPA blanket grant
// (pelajaran F4), lalu memeriksa: 53 tabel / RLS 53/53 / policy
// 106; kursus draf tersembunyi dari anon (beserta modul/
// pelajarannya); isolasi progres (A=1/B=0, anon=0); kolom
// explainer tersimpan + seri; kunci kuis tetap tertutup untuk
// anon/authenticated (kolom kunci tanpa SELECT — jawab kuis
// akademi tidak bisa membocorkan kunci lewat REST); soal kuis
// hanya tanggal pelajaran; fungsi murni explainer + validator
// API; pemeriksaan statis berkas baru.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import { createRequire } from "node:module";

import { PGlite } from "./butuh-pglite.mjs";

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

const UID_A = "11111111-1111-1111-1111-111111111111";
const UID_B = "22222222-2222-2222-2222-222222222222";

// Setup PGlite (pola uji-fase8-gel1.mjs): schema auth + tabel
// auth.users + stub auth.uid() + role — SEBELUM migrasi.
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

// Terapkan v1–v10 dua kali.
for (const putaran of [1, 2]) {
  for (const nama of MIGRASI) {
    const ok = await jalankan(`migrasi ${nama} (putaran ${putaran})`, baca(nama));
    if (!ok) process.exit(1);
  }
}

// Hitung akhir.
const tabel = await db.query(
  `select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'pf_%'`,
);
cek("jumlah tabel pf_* = 53", tabel.rows[0].n === 53, `dapat ${tabel.rows[0].n}`);
const rls = await db.query(
  `select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'pf_%' and rowsecurity`,
);
cek("RLS 53/53", rls.rows[0].n === 53, `dapat ${rls.rows[0].n}`);
const policy = await db.query(
  `select count(*)::int as n from pg_policies where schemaname='public' and tablename like 'pf_%'`,
);
cek("jumlah policy pf_* = 106", policy.rows[0].n === 106, `dapat ${policy.rows[0].n}`);

// Seed: pengguna uji + kursus terbit/draf + modul/pelajaran +
// progres A + artikel pengetahuan + soal kuis.
await db.query(`insert into auth.users (id, email) values ($1, 'a@uji.id'), ($2, 'b@uji.id')`, [UID_A, UID_B]);
await db.query(`insert into public.pf_courses (slug, judul, status, kategori, tingkat)
  values ('kursus-uji', 'Kursus Uji', 'terbit', 'umum', 'pemula')`);
await db.query(`insert into public.pf_courses (slug, judul, status, kategori, tingkat)
  values ('kursus-draf', 'Kursus Draf', 'draft', 'umum', 'pemula')`);
const kursusTerbit = await db.query(`select id from public.pf_courses where slug='kursus-uji'`);
const kursusTerbitId = kursusTerbit.rows[0].id;
const kursusDraf = await db.query(`select id from public.pf_courses where slug='kursus-draf'`);
await db.query(`insert into public.pf_course_modules (course_id, judul) values ($1, 'Modul 1')`, [kursusTerbitId]);
await db.query(`insert into public.pf_course_modules (course_id, judul) values ($1, 'Modul Draf')`, [kursusDraf.rows[0].id]);
const modulTerbit = await db.query(`select id from public.pf_course_modules where course_id=$1`, [kursusTerbitId]);
const modulTerbitId = modulTerbit.rows[0].id;
const modulDraf = await db.query(`select id from public.pf_course_modules where course_id=$1`, [kursusDraf.rows[0].id]);
await db.query(
  `insert into public.pf_course_lessons (module_id, judul, jenis, isi) values ($1, 'Pelajaran Materi', 'materi', 'Isi materi uji.')`,
  [modulTerbitId],
);
await db.query(
  `insert into public.pf_course_lessons (module_id, judul, jenis, kuis_tanggal) values ($1, 'Pelajaran Kuis', 'kuis', '2026-11-16')`,
  [modulTerbitId],
);
await db.query(
  `insert into public.pf_course_lessons (module_id, judul, jenis) values ($1, 'Pelajaran Draf', 'materi')`,
  [modulDraf.rows[0].id],
);
const lessonMateri = await db.query(
  `select id from public.pf_course_lessons where module_id=$1 and judul='Pelajaran Materi'`,
  [modulTerbitId],
);
const lessonMateriId = lessonMateri.rows[0].id;
await db.query(
  `insert into public.pf_course_progress (user_id, lesson_id, selesai, skor) values ($1, $2, true, 4)`,
  [UID_A, lessonMateriId],
);
// Artikel pengetahuan: explainer + seri + biasa + draf.
await db.query(
  `insert into public.pf_knowledge_articles (slug, judul, topik, status, jenis, tingkat, estimasi_baca_menit, seri_slug, isi, referensi)
   values ('explainer-uji', 'Explainer Uji', 'sains', 'terbit', 'explainer', 'mendalam', 8, 'seri-uji',
     'Ringkasan singkat explainer.' || chr(10) || chr(10) || 'Mengapa penting: karena ini penting.' || chr(10) || chr(10) || '2024 — Peristiwa penting terjadi.' || chr(10) || chr(10) || 'Paragraf mendalam pertama.',
     '[{"judul": "Istilah: Inflasi — kenaikan harga umum", "url": null}]'::jsonb)`,
);
await db.query(
  `insert into public.pf_knowledge_articles (slug, judul, topik, status, jenis, tingkat, seri_slug)
   values ('explainer-seri-2', 'Explainer Seri 2', 'sains', 'terbit', 'explainer', 'menengah', 'seri-uji')`,
);
await db.query(
  `insert into public.pf_knowledge_articles (slug, judul, topik, status)
   values ('artikel-biasa', 'Artikel Biasa', 'umum', 'terbit')`,
);
await db.query(
  `insert into public.pf_knowledge_articles (slug, judul, topik, status, jenis)
   values ('artikel-draf', 'Artikel Draf', 'umum', 'draft', 'explainer')`,
);
// Soal kuis: 5 soal tanggal pelajaran + 1 soal tanggal lain.
for (let i = 0; i < 5; i++) {
  await db.query(
    `insert into public.pf_quiz_questions (tanggal, pertanyaan, opsi, kunci, penjelasan)
     values ('2026-11-16', $1, '["A","B","C","D"]'::jsonb, $2, 'Pembahasan soal.')`,
    [`Soal ${i + 1}`, i % 4],
  );
}
await db.query(
  `insert into public.pf_quiz_questions (tanggal, pertanyaan, opsi, kunci, penjelasan)
   values ('2026-11-15', 'Soal tanggal lain', '["A","B","C","D"]'::jsonb, 1, 'Pembahasan lain.')`,
);

/* ---------- RLS: kursus draf tersembunyi dari anon ---------- */
cek("anon baca pf_courses terbit = 1",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_courses`)) === 1);
cek("anon baca pf_course_modules (kursus terbit) = 1",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_course_modules`)) === 1);
cek("anon baca pf_course_lessons (kursus terbit) = 2",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_course_lessons`)) === 2);
cek("authenticated baca pf_course_lessons (kursus terbit) = 2",
  (await hitungSebagaiUid("authenticated", UID_A, `select count(*)::int as n from public.pf_course_lessons`)) === 2);
cek("anon baca pf_course_progress = 0",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_course_progress`)) === 0);

/* ---------- Isolasi progres: A=1 / B=0 ---------- */
cek("A baca pf_course_progress sendiri = 1",
  (await hitungSebagaiUid("authenticated", UID_A, `select count(*)::int as n from public.pf_course_progress`)) === 1);
cek("B baca pf_course_progress milik A = 0",
  (await hitungSebagaiUid("authenticated", UID_B, `select count(*)::int as n from public.pf_course_progress`)) === 0);
cek("A baca progres selesai=1 skor=4",
  (await hitungSebagaiUid("authenticated", UID_A, `select count(*)::int as n from public.pf_course_progress where selesai = true and skor = 4`)) === 1);
// B tidak bisa mengubah progres A (0 baris terpengaruh).
const ubahB = await sebagaiUid(
  "authenticated",
  UID_B,
  `update public.pf_course_progress set selesai = false where lesson_id = $1`,
  [lessonMateriId],
);
cek("B ubah progres A = 0 baris", ubahB.rowCount === 0, `dapat ${ubahB.rowCount}`);
// A bisa mengubah progresnya sendiri.
const ubahA = await sebagaiUid(
  "authenticated",
  UID_A,
  `update public.pf_course_progress set skor = 5 where lesson_id = $1`,
  [lessonMateriId],
);
cek("A ubah progres sendiri = 1 baris", ubahA.rowCount === 1, `dapat ${ubahA.rowCount}`);

/* ---------- Kolom explainer tersimpan ---------- */
const explainer = await sebagai(
  "anon",
  `select jenis, tingkat, estimasi_baca_menit, seri_slug from public.pf_knowledge_articles where slug='explainer-uji'`,
);
cek("anon baca explainer terbit = 1 baris", explainer.rows.length === 1);
if (explainer.rows.length === 1) {
  const r = explainer.rows[0];
  cek("kolom jenis='explainer' tersimpan", r.jenis === "explainer", `dapat ${r.jenis}`);
  cek("kolom tingkat='mendalam' tersimpan", r.tingkat === "mendalam", `dapat ${r.tingkat}`);
  cek("kolom estimasi_baca_menit=8 tersimpan", r.estimasi_baca_menit === 8, `dapat ${r.estimasi_baca_menit}`);
  cek("kolom seri_slug='seri-uji' tersimpan", r.seri_slug === "seri-uji", `dapat ${r.seri_slug}`);
}
const biasa = await sebagai(
  "anon",
  `select jenis, tingkat from public.pf_knowledge_articles where slug='artikel-biasa'`,
);
cek("artikel biasa jenis default 'artikel'",
  biasa.rows.length === 1 && biasa.rows[0].jenis === "artikel",
  `dapat ${biasa.rows[0]?.jenis}`);
cek("anon baca artikel pengetahuan terbit = 3 (draf tersembunyi)",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_knowledge_articles`)) === 3);
cek("anon baca seri 'seri-uji' = 2",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_knowledge_articles where seri_slug='seri-uji'`)) === 2);

/* ---------- Kunci kuis tertutup (jawab kuis tanpa kunci) ---------- */
const kunciAnon = await sebagai(
  "anon",
  `select has_column_privilege('anon', 'public.pf_quiz_questions', 'kunci', 'SELECT') as punya`,
);
cek("anon tanpa SELECT(kunci) pf_quiz_questions",
  kunciAnon.rows[0]?.punya === false, `dapat ${kunciAnon.rows[0]?.punya}`);
const kunciAuth = await sebagaiUid(
  "authenticated",
  UID_A,
  `select has_column_privilege('authenticated', 'public.pf_quiz_questions', 'kunci', 'SELECT') as punya`,
);
cek("authenticated tanpa SELECT(kunci) pf_quiz_questions",
  kunciAuth.rows[0]?.punya === false, `dapat ${kunciAuth.rows[0]?.punya}`);
// Soal kuis tanggal pelajaran = 5; tanggal lain = 1 (pemisah tanggal).
cek("soal kuis tanggal pelajaran (2026-11-16) = 5",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_quiz_questions where tanggal='2026-11-16'`)) === 5);
cek("soal kuis tanggal lain (2026-11-15) = 1",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_quiz_questions where tanggal='2026-11-15'`)) === 1);

/* ---------- CHECK enum v10 ---------- */
let tolak = false;
try {
  await db.query(`insert into public.pf_courses (slug, judul, tingkat) values ('bogus-1', 'Bogus', 'ahli')`);
} catch { tolak = true; }
cek("kursus tingkat='ahli' ditolak (CHECK)", tolak);
tolak = false;
try {
  await db.query(`insert into public.pf_course_lessons (module_id, judul, jenis) values ($1, 'Bogus', 'video')`, [modulTerbitId]);
} catch { tolak = true; }
cek("pelajaran jenis='video' ditolak (CHECK)", tolak);
tolak = false;
try {
  await db.query(`insert into public.pf_knowledge_articles (slug, judul, topik, jenis) values ('bogus-2', 'Bogus', 'umum', 'podcast')`);
} catch { tolak = true; }
cek("pengetahuan jenis='podcast' ditolak (CHECK)", tolak);

/* ---------- Fungsi murni explainer (ekstraksi sumber) ---------- */
const explainerSrc = bacaRepo("src/lib/explainer.ts");
/* Ekstraksi sumber tanpa regex (pola indexOf — fungsi murni di
   repo ini selalu menutup bloknya dengan "}" di kolom 0, dan
   tidak ada "}" kolom-0 lain di dalam tubuhnya). */
function ekstrakFungsi(src, nama) {
  const awal = src.indexOf("function " + nama + "(");
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
const potonganExplainer = [
  ekstrakKonst(explainerSrc, "POLA_MENGAPA_PENTING"),
  ekstrakKonst(explainerSrc, "POLA_KRONOLOGI"),
  ekstrakKonst(explainerSrc, "POLA_ISTILAH"),
  ekstrakFungsi(explainerSrc, "paragrafIsi"),
  ekstrakFungsi(explainerSrc, "ambilMengapaPenting"),
  ekstrakFungsi(explainerSrc, "ambilKronologi"),
  ekstrakFungsi(explainerSrc, "ambilIstilah"),
  ekstrakFungsi(explainerSrc, "bagiIsiBerlapis"),
  ekstrakFungsi(explainerSrc, "labelTingkat"),
];
cek("fungsi murni explainer dapat diekstrak dari sumber",
  potonganExplainer.every(Boolean));
if (potonganExplainer.every(Boolean)) {
  const murni = new Function(
    transpileKeJs(
      `${potonganExplainer.join("\n")}\nreturn { paragrafIsi, ambilMengapaPenting, ambilKronologi, ambilIstilah, bagiIsiBerlapis, labelTingkat };`,
    ),
  )();
  const isiUji =
    "Ringkasan singkat explainer.\n\nMengapa penting: karena ini penting.\n\n2024 — Peristiwa penting terjadi.\n\nParagraf mendalam pertama.";
  const paragraf = murni.paragrafIsi(isiUji);
  cek("paragrafIsi pecah 4 paragraf", paragraf.length === 4, `dapat ${paragraf.length}`);
  cek("ambilMengapaPenting ambil isi sesudah judul",
    murni.ambilMengapaPenting(paragraf) === "karena ini penting.");
  cek("ambilMengapaPenting null bila tidak ada",
    murni.ambilMengapaPenting(["Paragraf biasa."]) === null);
  const kron = murni.ambilKronologi(paragraf);
  cek("ambilKronologi ambil 1 butir tahun",
    kron.length === 1 && kron[0].tanggal === "2024" && kron[0].peristiwa === "Peristiwa penting terjadi.",
    `dapat ${JSON.stringify(kron)}`);
  cek("ambilKronologi [] bila tidak ada", murni.ambilKronologi(["Paragraf biasa."]).length === 0);
  const istilah = murni.ambilIstilah([
    { judul: "Istilah: Inflasi — kenaikan harga umum", url: null },
    { judul: "Sumber resmi", url: "https://example.com" },
    { judul: "Istilah: PDB", url: null },
  ]);
  cek("ambilIstilah ambil 2 istilah, lewati referensi biasa",
    istilah.length === 2 &&
      istilah[0].istilah === "Inflasi" &&
      istilah[0].definisi === "kenaikan harga umum" &&
      istilah[1].istilah === "PDB" &&
      istilah[1].definisi === null,
    `dapat ${JSON.stringify(istilah)}`);
  const lapis = murni.bagiIsiBerlapis(isiUji);
  cek("bagiIsiBerlapis ringkas = paragraf pertama",
    lapis.ringkas.length === 1 && lapis.ringkas[0] === "Ringkasan singkat explainer.");
  cek("bagiIsiBerlapis mendalam = sisa (tanpa seksi turunan)",
    lapis.mendalam.length === 1 && lapis.mendalam[0] === "Paragraf mendalam pertama.");
  cek("bagiIsiBerlapis mengapaPenting terisi",
    lapis.mengapaPenting === "karena ini penting.");
  cek("bagiIsiBerlapis isi kosong → semua kosong",
    (() => {
      const kosong = murni.bagiIsiBerlapis(null);
      return kosong.ringkas.length === 0 && kosong.mendalam.length === 0 &&
        kosong.mengapaPenting === null && kosong.kronologi.length === 0;
    })());
  cek("labelTingkat mendalam → Mendalam", murni.labelTingkat("mendalam") === "Mendalam");
  cek("labelTingkat tak dikenal → Pemula", murni.labelTingkat("ahli") === "Pemula");
}

/* ---------- Validator API (ekstraksi sumber) ---------- */
function ekstrakValidator(src, nama) {
  return ekstrakFungsi(src, nama);
}
const jawabAkademiSrc = bacaRepo("src/app/api/akademi/kuis/jawab/route.ts");
// PERUBAHAN Gelombang B2-B: validasiJawabanAkademi kini memanggil
// validasiBentukJawaban (lib/akademi/penilaian.ts) untuk lima jenis
// soal — ekstraksi lama (hanya validator) crash ReferenceError.
// Ikut ekstrak dependensinya; asersi lama (jawaban angka default)
// tetap berlaku karena default jenis = pilihan_ganda.
// FU2 (16 Nov 2026): validasiJawabanAkademi PINDAH ke
// lib/akademi/penilaian.ts — ekstraksi validator dari sana
// (POLA_UUID tetap diekstrak dari route, masih ada di sana).
const penilaianSrc = bacaRepo("src/lib/akademi/penilaian.ts");
const potonganJawab = [
  ekstrakKonst(jawabAkademiSrc, "POLA_UUID"),
  ekstrakFungsi(penilaianSrc, "normalisasiIsian"),
  ekstrakFungsi(penilaianSrc, "validasiBentukJawaban"),
  ekstrakValidator(penilaianSrc, "validasiJawabanAkademi"),
];
cek("validasiJawabanAkademi dapat diekstrak", potonganJawab.every(Boolean));
if (potonganJawab.every(Boolean)) {
  const v = new Function(
    transpileKeJs(`${potonganJawab.join("\n")}\nreturn validasiJawabanAkademi;`),
  )();
  const UUID_UJI = "11111111-1111-1111-1111-111111111111";
  cek("jawab akademi: terima body sah",
    v({ lesson_id: UUID_UJI, soal_id: UUID_UJI, jawaban: 2 }).ok === true);
  cek("jawab akademi: tolak lesson_id buruk",
    v({ lesson_id: "x", soal_id: UUID_UJI, jawaban: 2 }).ok === false);
  cek("jawab akademi: tolak soal_id buruk",
    v({ lesson_id: UUID_UJI, soal_id: "x", jawaban: 2 }).ok === false);
  cek("jawab akademi: tolak jawaban 5",
    v({ lesson_id: UUID_UJI, soal_id: UUID_UJI, jawaban: 5 }).ok === false);
  cek("jawab akademi: tolak jawaban string",
    v({ lesson_id: UUID_UJI, soal_id: UUID_UJI, jawaban: "2" }).ok === false);
  cek("jawab akademi: tolak body null", v(null).ok === false);
}
const progresSrc = bacaRepo("src/app/api/akademi/progres/route.ts");
// FU2 (16 Nov 2026): validasiProgres PINDAH ke
// lib/akademi/penilaian.ts — ekstraksi dari sana (progresSrc
// tetap dipakai untuk pemeriksaan route di bawah).
const potonganProgres = [
  ekstrakKonst(penilaianSrc, "POLA_UUID"),
  ekstrakValidator(penilaianSrc, "validasiProgres"),
];
cek("validasiProgres dapat diekstrak", potonganProgres.every(Boolean));
if (potonganProgres.every(Boolean)) {
  const v = new Function(
    transpileKeJs(`${potonganProgres.join("\n")}\nreturn validasiProgres;`),
  )();
  const UUID_UJI = "11111111-1111-1111-1111-111111111111";
  // PERUBAHAN Gelombang B2-B (L-B1 / Addendum I-4): `skor` dari
  // klien TIDAK LAGI diterima — skor dihitung server dari jawaban
  // tersimpan. Asersi lama "terima body sah (skor: 4)" mengabadikan
  // celah pemalsuan sertifikat, diganti asersi penolakan di bawah
  // (bukan dihapus agar angka bagus — perilaku lama didokumentasi
  // di sini sebagai usang).
  cek("progres: tolak skor dari klien (B2-B, I-4)",
    v({ lesson_id: UUID_UJI, selesai: true, skor: 4 }).ok === false);
  cek("progres: terima tanpa skor",
    v({ lesson_id: UUID_UJI, selesai: true }).ok === true);
  cek("progres: terima skor null (kompat klien lama)",
    v({ lesson_id: UUID_UJI, selesai: true, skor: null }).ok === true);
  cek("progres: tolak selesai bukan boolean",
    v({ lesson_id: UUID_UJI, selesai: "ya" }).ok === false);
  cek("progres: tolak skor 101",
    v({ lesson_id: UUID_UJI, selesai: true, skor: 101 }).ok === false);
  cek("progres: tolak skor negatif",
    v({ lesson_id: UUID_UJI, selesai: true, skor: -1 }).ok === false);
  cek("progres: tolak lesson_id buruk",
    v({ lesson_id: "x", selesai: true }).ok === false);
}
// FU2 (16 Nov 2026): validator admin PINDAH ke
// src/lib/admin/validasi.ts — ekstraksi dari sana. Variabel
// pengetahuanSrc/kursusSrc TETAP menunjuk route (dipakai lagi
// untuk pemeriksaan route di bawah).
const validasiAdminSrc = bacaRepo("src/lib/admin/validasi.ts");
const pengetahuanSrc = bacaRepo("src/app/api/admin/pengetahuan/route.ts");
const awalTopik = validasiAdminSrc.indexOf("export const TOPIK_VALID = [");
const akhirTopik = validasiAdminSrc.indexOf("] as const;", awalTopik);
const konstTopik =
  awalTopik >= 0 && akhirTopik >= 0
    ? validasiAdminSrc
        .slice(awalTopik, akhirTopik + "] as const;".length)
        .replace("export const", "const")
    : null;
const potonganPengetahuan = [
  konstTopik ? konstTopik.replace("export const", "const") : null,
  ekstrakKonst(validasiAdminSrc, "POLA_SLUG"),
  ekstrakKonst(validasiAdminSrc, "POLA_TANGGAL"),
  ekstrakFungsi(validasiAdminSrc, "stringAtauNull"),
  ekstrakValidator(validasiAdminSrc, "validasiInputPengetahuan"),
];
cek("validasiInputPengetahuan dapat diekstrak", potonganPengetahuan.every(Boolean));
if (potonganPengetahuan.every(Boolean)) {
  const v = new Function(
    transpileKeJs(`${potonganPengetahuan.join("\n")}\nreturn validasiInputPengetahuan;`),
  )();
  cek("pengetahuan: terima explainer sah",
    v({
      judul: "Judul", slug: "slug-uji", topik: "sains", jenis: "explainer",
      tingkat: "mendalam", estimasi_baca_menit: 8, seri_slug: "seri-uji",
      status: "terbit",
    }).ok === true);
  cek("pengetahuan: tolak topik bogus",
    v({ judul: "J", slug: "s", topik: "astronomi" }).ok === false);
  cek("pengetahuan: tolak jenis bogus",
    v({ judul: "J", slug: "s", topik: "umum", jenis: "podcast" }).ok === false);
  cek("pengetahuan: tolak estimasi 0",
    v({ judul: "J", slug: "s", estimasi_baca_menit: 0 }).ok === false);
  cek("pengetahuan: tolak slug huruf besar",
    v({ judul: "J", slug: "Slug-Besar" }).ok === false);
  cek("pengetahuan: tolak referensi URL tanpa http",
    v({ judul: "J", slug: "s", referensi: [{ judul: "X", url: "ftp://x" }] }).ok === false);
}
const kursusSrc = bacaRepo("src/app/api/admin/akademi/route.ts");
const potonganKursus = [
  ekstrakKonst(validasiAdminSrc, "POLA_SLUG"),
  ekstrakFungsi(validasiAdminSrc, "stringAtauNull"),
  ekstrakValidator(validasiAdminSrc, "validasiInputKursus"),
];
cek("validasiInputKursus dapat diekstrak", potonganKursus.every(Boolean));
if (potonganKursus.every(Boolean)) {
  const v = new Function(
    transpileKeJs(`${potonganKursus.join("\n")}\nreturn validasiInputKursus;`),
  )();
  cek("kursus: terima body sah",
    v({ slug: "kursus-uji", judul: "Kursus Uji", tingkat: "pemula", status: "draft" }).ok === true);
  cek("kursus: tolak tingkat bogus",
    v({ slug: "k", judul: "K", tingkat: "ahli" }).ok === false);
  cek("kursus: tolak status bogus",
    v({ slug: "k", judul: "K", status: "arsip" }).ok === false);
  cek("kursus: tolak judul kosong",
    v({ slug: "k", judul: "  " }).ok === false);
}
const strukturSrc = validasiAdminSrc;
const potonganStruktur = [
  ekstrakKonst(strukturSrc, "POLA_SLUG"),
  ekstrakKonst(strukturSrc, "POLA_TANGGAL"),
  ekstrakKonst(strukturSrc, "POLA_UUID"),
  ekstrakFungsi(strukturSrc, "stringAtauNull"),
  ekstrakFungsi(strukturSrc, "validasiReferensi"),
  ekstrakValidator(strukturSrc, "validasiStruktur"),
];
cek("validasiStruktur dapat diekstrak", potonganStruktur.every(Boolean));
if (potonganStruktur.every(Boolean)) {
  const v = new Function(
    transpileKeJs(`${potonganStruktur.join("\n")}\nreturn validasiStruktur;`),
  )();
  const UUID_UJI = "11111111-1111-1111-1111-111111111111";
  cek("struktur: terima modul+pelajaran sah",
    v({
      modul: [{ judul: "Modul 1", urutan: 0 }],
      pelajaran: [{ module_id: UUID_UJI, judul: "Pelajaran 1", jenis: "kuis", kuis_tanggal: "2026-11-16" }],
    }).ok === true);
  cek("struktur: tolak pelajaran baru tanpa module_id",
    v({ pelajaran: [{ judul: "P" }] }).ok === false);
  cek("struktur: tolak jenis pelajaran bogus",
    v({ pelajaran: [{ module_id: UUID_UJI, judul: "P", jenis: "video" }] }).ok === false);
  cek("struktur: tolak hapus modul tanpa id",
    v({ modul: [{ hapus: true }] }).ok === false);
  cek("struktur: terima hapus dengan id",
    v({ modul: [{ id: UUID_UJI, hapus: true }] }).ok === true);
  cek("struktur: tolak kuis_tanggal format buruk",
    v({ pelajaran: [{ module_id: UUID_UJI, judul: "P", jenis: "kuis", kuis_tanggal: "16-11-2026" }] }).ok === false);
}

/* ---------- Pemeriksaan statis berkas baru ---------- */
cek("berkas src/lib/explainer.ts ada", fs.existsSync(`${DIR_REPO}/src/lib/explainer.ts`));
cek("berkas src/lib/akademi.ts ada", fs.existsSync(`${DIR_REPO}/src/lib/akademi.ts`));
cek("berkas src/app/akademi/page.tsx ada", fs.existsSync(`${DIR_REPO}/src/app/akademi/page.tsx`));
cek("berkas src/app/akademi/[slug]/page.tsx ada", fs.existsSync(`${DIR_REPO}/src/app/akademi/[slug]/page.tsx`));
cek("berkas src/app/api/akademi/progres/route.ts ada", fs.existsSync(`${DIR_REPO}/src/app/api/akademi/progres/route.ts`));
cek("berkas src/app/api/akademi/kuis/jawab/route.ts ada", fs.existsSync(`${DIR_REPO}/src/app/api/akademi/kuis/jawab/route.ts`));
cek("berkas src/app/admin/pengetahuan/page.tsx ada", fs.existsSync(`${DIR_REPO}/src/app/admin/pengetahuan/page.tsx`));
cek("berkas src/app/admin/akademi/page.tsx ada", fs.existsSync(`${DIR_REPO}/src/app/admin/akademi/page.tsx`));
cek("berkas src/app/api/admin/pengetahuan/route.ts ada", fs.existsSync(`${DIR_REPO}/src/app/api/admin/pengetahuan/route.ts`));
cek("berkas src/app/api/admin/pengetahuan/[id]/route.ts ada", fs.existsSync(`${DIR_REPO}/src/app/api/admin/pengetahuan/[id]/route.ts`));
cek("berkas src/app/api/admin/akademi/route.ts ada", fs.existsSync(`${DIR_REPO}/src/app/api/admin/akademi/route.ts`));
cek("berkas src/app/api/admin/akademi/[id]/route.ts ada", fs.existsSync(`${DIR_REPO}/src/app/api/admin/akademi/[id]/route.ts`));
cek("komponen KartuKursus ada", fs.existsSync(`${DIR_REPO}/src/components/akademi/KartuKursus.tsx`));
cek("komponen DaftarPelajaran ada", fs.existsSync(`${DIR_REPO}/src/components/akademi/DaftarPelajaran.tsx`));
cek("komponen PembahasanKuis ada", fs.existsSync(`${DIR_REPO}/src/components/akademi/PembahasanKuis.tsx`));

// Kunci TIDAK PERNAH ke klien di route jawab akademi: objek
// respons sukses hanya memuat benar/penjelasan/sumber — kunci
// hanya dipakai membandingkan di server (valid.jawaban === kunci).
const responsSukses = /return NextResponse\.json\(\{\s*ok: true,[\s\S]*?\}\);/.exec(jawabAkademiSrc)?.[0] ?? "";
cek("jawab akademi: respons sukses ada dan tanpa field kunci",
  responsSukses.length > 0 &&
    responsSukses.includes("benar:") &&
    responsSukses.includes("penjelasan:") &&
    // Properti kunci ("kunci:" atau shorthand "kunci," sesudah
    // "{" / ",") — perbandingan "valid.jawaban === kunci" di
    // server BOLEH ada, itu bukan pengiriman kunci.
    !/\bkunci\s*:/.test(responsSukses) &&
    !/,\s*kunci\s*[,}]/.test(responsSukses) &&
    !/\{\s*kunci\s*[,}]/.test(responsSukses),
  responsSukses.length === 0 ? "respons sukses tidak ditemukan" : "");
cek("jawab akademi: kunci hanya dipakai membandingkan di server",
  // PERUBAHAN Gelombang B2-B: perbandingan kunci pindah dari route
  // ke fungsi murni nilaiJawaban (lib/akademi/penilaian.ts) agar
  // lima jenis soal dinilai satu tempat. Asersi lama (string
  // "valid.jawaban === kunci" di route) usang — diganti: route
  // mendelegasikan ke nilaiJawaban, dan nilaiJawaban membandingkan
  // jawaban dengan kunci server.
  jawabAkademiSrc.includes("nilaiJawaban(kunciSoal, valid.jawaban)") &&
    bacaRepo("src/lib/akademi/penilaian.ts").includes("jawaban === kunciSoal.kunci"));
cek("jawab akademi: hanya soal tanggal pelajaran",
  jawabAkademiSrc.includes("tanggal !== kuisTanggal"));
cek("jawab akademi: rate limit 20/mnt (fail-closed, P0-7)",
  jawabAkademiSrc.includes("buatRateLimiterKeras(20)"));
cek("progres akademi: rate limit 20/mnt (fail-closed, B2)",
  progresSrc.includes("buatRateLimiterKeras(20)"));
cek("progres akademi: wajib login (401)",
  progresSrc.includes("Anda harus masuk terlebih dahulu") &&
    progresSrc.includes("status: 401"));
cek("progres akademi: cek pelajaran via RLS (404 bila draf)",
  progresSrc.includes('from("pf_course_lessons")') &&
    progresSrc.includes("Pelajaran tidak ditemukan"));
const pengetahuanIdSrc = bacaRepo("src/app/api/admin/pengetahuan/[id]/route.ts");
cek("admin pengetahuan: guard staf + service role",
  pengetahuanSrc.includes("autentikasiAdmin") &&
    pengetahuanSrc.includes("createServiceClient") &&
    pengetahuanIdSrc.includes("autentikasiAdmin"));
cek("admin pengetahuan: audit pengetahuan.buat/ubah/hapus",
  pengetahuanSrc.includes('"pengetahuan.buat"') &&
    pengetahuanIdSrc.includes('"pengetahuan.ubah"') &&
    pengetahuanIdSrc.includes('"pengetahuan.hapus"'));
const akademiIdSrc = bacaRepo("src/app/api/admin/akademi/[id]/route.ts");
cek("admin akademi: guard staf + service role",
  kursusSrc.includes("autentikasiAdmin") &&
    kursusSrc.includes("createServiceClient") &&
    akademiIdSrc.includes("autentikasiAdmin"));
cek("admin akademi: audit akademi.kursus/modul",
  kursusSrc.includes('"akademi.kursus"') &&
    akademiIdSrc.includes('"akademi.modul"'));
const tahuSlugSrc = bacaRepo("src/app/pengetahuan/[slug]/page.tsx");
cek("halaman pengetahuan: pakai getExplainer",
  tahuSlugSrc.includes("getExplainer") &&
    !tahuSlugSrc.includes("getPengetahuanLengkap"));
cek("halaman pengetahuan: seksi explainer berlapis",
  tahuSlugSrc.includes("Secara singkat") &&
    tahuSlugSrc.includes("Mengapa penting") &&
    tahuSlugSrc.includes("Lebih mendalam") &&
    tahuSlugSrc.includes("Linimasa") &&
    tahuSlugSrc.includes("Istilah kunci") &&
    tahuSlugSrc.includes("Dalam seri ini"));
cek("halaman pengetahuan: artikel biasa tetap tampil",
  tahuSlugSrc.includes("artikel.isi.split"));
cek("halaman akademi: empty state jujur",
  bacaRepo("src/app/akademi/page.tsx").includes("Belum ada kursus terbit."));
cek("halaman akademi detail: kunci distrip sebelum ke klien",
  bacaRepo("src/app/akademi/[slug]/page.tsx").includes("PfKuisSoalPublik") &&
    !bacaRepo("src/app/akademi/[slug]/page.tsx").includes("kunci:"));
cek("admin akademi: formulir kursus pertama + catatan isi menunggu editor",
  bacaRepo("src/app/admin/akademi/page.tsx").includes("Buat Kursus Pertama") &&
    bacaRepo("src/app/admin/akademi/page.tsx").includes("Isi modul menunggu editor"));

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
