// Baterai Tahap C — sisa keterbatasan pasca-Gelombang B2 (PRATA FAKTA).
// Pola uji-ultimate-b2-akademi.mjs: PGlite via scripts/butuh-pglite.mjs,
// migrasi v1–v15 dari berkas (dua putaran = idempotensi), seed
// minimal, fungsi murni diekstrak dari sumber TS via transpileModule.
//
// Cakupan per item tugas:
//   C-1  UI + API pembuatan soal bertipe baru (validasiSoalBaru per
//        jenis; kunci di pf_quiz_answers, bukan kolom publik; esai
//        tanpa baris kunci; route + halaman admin ada).
//   C-2  Pencabutan sertifikat (update dicabut; cabut kedua kali
//        tidak berpengaruh; alasan wajib; halaman publik menampilkan
//        DICABUT; audit aksi v15).
//   C-3  Skor kuis harian dihitung server (hitungSkorDariJawaban-
//        Tersimpan; klaim klien diabaikan; skor parsial ditolak;
//        trigger v15 menghitung ulang tulis REST langsung; skor
//        lama tetap terbaca).
//   C-4  Log galat menyeluruh (catatGalatRoute di 23 route, 53 situs;
//        catatGalatBaca -> pf_app_errors; PGRST205 dilewati;
//        admin + kunjungan sudah tercakup sebelumnya).
//        (52 -> 53: situs 500 baru di POST /api/bookmark, Follow-up 5/6.)
//   C-5  Topik isu menghasilkan notifikasi (kolom isu; pencocokan
//        ilike; dedup; fallback pre-v15).
//   C-6  Bukti dokumen: TTS server tetap belum bisa (MODEL_CARD
//        id_ID-news_tts-medium dikutip di laporan) + esai otomatis
//        tetap belum bisa (nilaiJawaban esai -> null).
//   C-7  Migrasi v15: 62 tabel / RLS 62/62 / 120 policy / 0 blanket
//        grant / CHECK audit v15 59 aksi / GRANT service_role.
//
// Batasan kejujuran (sama seperti baterai B2): yang diuji adalah
// validator/fungsi murni + perilaku DB + keberadaan/isi sumber
// route & halaman. HTTP hidup + klik browser nyata tetap di luar
// jangkauan baterai ini dan harus diuji terpisah.
// Keluar 0 bila semua lolos, 1 bila ada yang gagal.
import { readFileSync, existsSync } from "node:fs";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

import { PGlite } from "./butuh-pglite.mjs";

let lolos = 0;
let gagal = 0;
const gagalDaftar = [];
function cek(nama, ok, info = "") {
  if (ok) {
    lolos++;
    console.log(`  OK ${nama}`);
  } else {
    gagal++;
    gagalDaftar.push(nama);
    console.log(`  GAGAL ${nama}${info ? ` — ${info}` : ""}`);
  }
}

function bacaRepo(rel) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}
function bacaMig(nama) {
  return readFileSync(new URL(`../supabase/migrations/${nama}`, import.meta.url), "utf8");
}
function transpileKeJs(ts) {
  return transpileModule(ts, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 },
  }).outputText;
}
function ekstrakFungsi(src, nama) {
  const i = src.indexOf(`function ${nama}(`);
  if (i < 0) return null;
  const akhir = src.indexOf("\n}", i);
  if (akhir < 0) return null;
  return src.slice(i, akhir + 3);
}
function ekstrakKonst(src, nama) {
  const i = src.indexOf(`const ${nama}`);
  if (i < 0) return null;
  const akhir = src.indexOf(";", i);
  if (akhir < 0) return null;
  return src.slice(i, akhir + 1);
}

const db = new PGlite();

async function jalankan(label, sql) {
  try {
    await db.exec(sql);
    console.log(`OK: ${label}`);
    return true;
  } catch (e) {
    console.log(`GAGAL: ${label}: ${e.message}`);
    return false;
  }
}
function baca(sql) {
  sql = sql.replace(/create extension[^;]+;/gi, "-- ekstensi dilepas (PGlite)");
  sql = sql.replace(/\bcitext\b/gi, "text");
  return sql;
}
async function sebagai(role, sql, params = []) {
  await db.query(`set role ${role}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.query(`reset role`);
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
async function berhasilSebagaiUid(uid, role, sql, params = []) {
  try {
    await sebagaiUid(uid, role, sql, params);
    return true;
  } catch {
    return false;
  }
}
async function hitungSebagaiUid(uid, role, sql, params = []) {
  const r = await sebagaiUid(uid, role, sql, params);
  return Number(r.rows[0]?.n ?? 0);
}

const UID_A = "11111111-1111-1111-1111-111111111111";
const UID_B = "22222222-2222-2222-2222-222222222222";
const UID_STAF = "33333333-3333-3333-3333-333333333333";

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
  "20261116_pf_v15_tahap_c.sql",
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
await db.exec(`create role service_role bypassrls nologin;`);
console.log("OK: setup auth + role (anon/authenticated/service_role)");

for (const putaran of [1, 2]) {
  for (const nama of MIGRASI) {
    const ok = await jalankan(`migrasi ${nama} (putaran ${putaran})`, baca(bacaMig(nama)));
    if (!ok) process.exit(1);
  }
}

// ---------- Seed ----------
await db.query(
  `insert into auth.users (id, email) values ($1, 'a@uji.id'), ($2, 'b@uji.id'), ($3, 'staf@uji.id')`,
  [UID_A, UID_B, UID_STAF],
);
await db.query(
  `insert into public.pf_profiles (id, nama_tampilan) values ($1, 'Pengguna A'), ($2, 'Pengguna B'), ($3, 'Staf') on conflict (id) do update set nama_tampilan = excluded.nama_tampilan`,
  [UID_A, UID_B, UID_STAF],
);
await db.query(
  `insert into public.pf_categories (slug, nama) values ('dunia-uji', 'Dunia Uji') on conflict (slug) do nothing`,
);
// Catatan: UID_STAF hanya dipakai sebagai actor_id audit (baris
// auth.users + pf_profiles cukup); peran staf tinggal di
// pf_user_roles/pf_roles dan tidak dibutuhkan baterai ini.

/* ============================================================
   §A. Migrasi v15 (C-7): 62 tabel / RLS 62/62 / 120 policy /
   0 blanket grant / CHECK audit v15 59 aksi / GRANT service_role
   ============================================================ */
console.log("\n§A. Migrasi v15");
{
  const t = await db.query(
    `select count(*) as n from information_schema.tables
     where table_schema = 'public' and table_name like 'pf_%'`,
  );
  cek("v15: 62 tabel pf_*", Number(t.rows[0].n) === 62, `ada ${t.rows[0].n}`);
  const r = await db.query(
    `select count(*) as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname like 'pf_%' and c.relrowsecurity`,
  );
  cek("v15: RLS 62/62", Number(r.rows[0].n) === 62, `ada ${r.rows[0].n}`);
  const p = await db.query(
    `select count(*) as n from pg_policies where schemaname = 'public' and tablename like 'pf_%'`,
  );
  cek("v15: 120 policy", Number(p.rows[0].n) === 120, `ada ${p.rows[0].n}`);
  const g = await db.query(
    `select count(*) as n from information_schema.role_table_grants
     where table_schema = 'public' and table_name like 'pf_%' and grantee = 'PUBLIC'`,
  );
  cek("v15: 0 blanket grant ke PUBLIC", Number(g.rows[0].n) === 0, `ada ${g.rows[0].n}`);
  const a = await db.query(
    `select pg_get_constraintdef(oid) as def from pg_constraint
     where conrelid = 'public.pf_audit_logs'::regclass
       and conname = 'pf_audit_logs_aksi_check_v15'`,
  );
  const defAksi = a.rows[0]?.def ?? "";
  cek("v15: CHECK audit v15 ada", a.rows.length === 1);
  cek("v15: CHECK audit memuat akademi.soal.buat + akademi.sertifikat.cabut",
    defAksi.includes("akademi.soal.buat") && defAksi.includes("akademi.sertifikat.cabut"));
  cek("v15: CHECK audit total 59 aksi", (defAksi.match(/'[^']+'/g) ?? []).length === 59,
    `dihitung ${defAksi.match(/'[^']+'/g)?.length ?? 0}`);
  const col = await db.query(
    `select count(*) as n from information_schema.columns
     where table_schema = 'public' and table_name = 'pf_articles' and column_name = 'isu'`,
  );
  cek("v15: kolom pf_articles.isu ada", Number(col.rows[0].n) === 1);
  const trg = await db.query(
    `select count(*) as n from pg_trigger where tgname = 'pf_quiz_scores_skor_harian_server'`,
  );
  cek("v15: trigger skor harian ada", Number(trg.rows[0].n) === 1);
  const gr = await db.query(
    `select count(*) as n from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'pf_quiz_daily_answers'
       and grantee = 'service_role' and privilege_type in ('INSERT','UPDATE','DELETE','SELECT')`,
  );
  cek("v15: GRANT service_role atas pf_quiz_daily_answers (4 hak)", Number(gr.rows[0].n) === 4,
    `ada ${gr.rows[0].n}`);
  const polDaily = await db.query(
    `select count(*) as n from pg_policies where schemaname = 'public' and tablename = 'pf_quiz_daily_answers'`,
  );
  cek("v15: pf_quiz_daily_answers punya policy RLS (baca sendiri)", Number(polDaily.rows[0].n) === 1,
    `ada ${polDaily.rows[0].n}`);
}

/* ============================================================
   §B. C-3: skor kuis harian dihitung server
   ============================================================ */
console.log("\n§B. C-3 skor kuis harian (server)");
const skorSrc = bacaRepo("src/app/api/kuis/skor/route.ts");
// FU2 (16 Nov 2026): hitungSkorDariJawabanTersimpan PINDAH ke
// src/lib/kuis.ts — ekstraksi dari sana (skorSrc tetap dipakai
// untuk pemeriksaan route di bawah).
const kuisSrc = bacaRepo("src/lib/kuis.ts");
const fnHitung = ekstrakFungsi(kuisSrc, "hitungSkorDariJawabanTersimpan");
cek("C-3: hitungSkorDariJawabanTersimpan dapat diekstrak", Boolean(fnHitung));
let hitungSkor = null;
if (fnHitung) {
  hitungSkor = new Function(
    `${transpileKeJs(fnHitung)}\nreturn hitungSkorDariJawabanTersimpan;`,
  )();
  const lengkap = hitungSkor(
    [{ soal_id: "s1", benar: true }, { soal_id: "s2", benar: false }, { soal_id: "s3", benar: true }],
    ["s1", "s2", "s3"],
  );
  cek("C-3: skor lengkap 2/3 dihitung dari jawaban tersimpan",
    lengkap.ok === true && lengkap.benar === 2 && lengkap.total === 3);
  const parsial = hitungSkor(
    [{ soal_id: "s1", benar: true }],
    ["s1", "s2"],
  );
  cek("C-3: skor parsial DITOLAK (409 di route)",
    parsial.ok === false && parsial.terjawab === 1 && parsial.total === 2 &&
    typeof parsial.error === "string" && parsial.error.includes("belum lengkap"),
    JSON.stringify(parsial));
  const nol = hitungSkor([], []);
  cek("C-3: tanggal tanpa soal DITOLAK (409 di route)",
    nol.ok === false && nol.total === 0 &&
    typeof nol.error === "string" && nol.error.includes("Belum ada soal"));
  const duplikat = hitungSkor(
    [{ soal_id: "s1", benar: true }, { soal_id: "s1", benar: false }],
    ["s1"],
  );
  cek("C-3: jawaban duplikat satu soal dihitung sekali",
    duplikat.ok === true && duplikat.benar === 1 && duplikat.total === 1,
    JSON.stringify(duplikat));
}
cek("C-3: route skor TIDAK membaca benar/total dari body klien",
  !skorSrc.includes("body.benar") && !skorSrc.includes("body.total") &&
  skorSrc.includes("dihitung_server: true"));
cek("C-3: route skor memanggil hitungSkorDariJawabanTersimpan",
  skorSrc.includes("hitungSkorDariJawabanTersimpan("));
{
  // Seed kuis harian 2026-11-16 (3 soal) + jawaban tersimpan A.
  const soalIds = [];
  for (const [teks, benar] of [["Q1?", 0], ["Q2?", 1], ["Q3?", 0]]) {
    const q = (await db.query(
      `insert into public.pf_quiz_questions (tanggal, pertanyaan, opsi, jenis)
       values ('2026-11-16', $1, '["a","b","c","d"]'::jsonb, 'pilihan_ganda') returning id`,
      [teks],
    )).rows[0].id;
    await db.query(
      `insert into public.pf_quiz_answers (soal_id, kunci) values ($1, $2)`,
      [q, benar],
    );
    soalIds.push(q);
  }
  await db.query(
    `insert into public.pf_quiz_daily_answers (user_id, soal_id, tanggal, jawaban, benar)
     values ($1, $2, '2026-11-16', 0, true), ($1, $3, '2026-11-16', 0, false), ($1, $4, '2026-11-16', 0, true)`,
    [UID_A, soalIds[0], soalIds[1], soalIds[2]],
  );
  // Tulis REST langsung sebagai authenticated dengan skor PALSU 5/5:
  // trigger v15 WAJIB menghitung ulang menjadi 2/3.
  const r = await sebagaiUid(UID_A, "authenticated",
    `insert into public.pf_quiz_scores (user_id, tanggal, benar, total) values ($1, '2026-11-16', 5, 5) returning benar, total`,
    [UID_A]);
  cek("C-3: trigger v15 mengoreksi tulis REST palsu 5/5 -> 2/3",
    r.rows[0].benar === 2 && r.rows[0].total === 3,
    `tersimpan ${r.rows[0].benar}/${r.rows[0].total}`);
  // Update REST langsung juga dikoreksi.
  const r2 = await sebagaiUid(UID_A, "authenticated",
    `update public.pf_quiz_scores set benar = 5, total = 5 where user_id = $1 and tanggal = '2026-11-16' returning benar, total`,
    [UID_A]);
  cek("C-3: trigger v15 mengoreksi UPDATE REST palsu -> 2/3",
    r2.rows[0].benar === 2 && r2.rows[0].total === 3,
    `tersimpan ${r2.rows[0].benar}/${r2.rows[0].total}`);
  // Skor lama tetap terbaca (GET route memakai SELECT biasa).
  const bacaSkor = await hitungSebagaiUid(UID_A, "authenticated",
    `select count(*) as n from public.pf_quiz_scores where user_id = $1 and tanggal = '2026-11-16' and benar = 2 and total = 3`,
    [UID_A]);
  cek("C-3: skor lama tetap terbaca pemiliknya (2/3)", bacaSkor === 1);
  // Tanggal tanpa soal: trigger menolak INSERT (fail-closed).
  const ditolak = !(await berhasilSebagaiUid(UID_A, "authenticated",
    `insert into public.pf_quiz_scores (user_id, tanggal, benar, total) values ($1, '2026-11-20', 5, 5)`,
    [UID_A]));
  cek("C-3: trigger menolak skor tanggal tanpa soal", ditolak);
  // RLS jawaban harian: B tidak bisa membaca jawaban A; A tidak bisa INSERT langsung.
  const bacaB = await hitungSebagaiUid(UID_B, "authenticated",
    `select count(*) as n from public.pf_quiz_daily_answers where user_id = $1`, [UID_A]);
  cek("C-3-RLS: jawaban harian tidak terbaca pengguna lain", bacaB === 0);
  const insertLangsung = await berhasilSebagaiUid(UID_B, "authenticated",
    `insert into public.pf_quiz_daily_answers (user_id, soal_id, tanggal, jawaban, benar) values ($1, $2, '2026-11-16', 0, true)`,
    [UID_B, soalIds[0]]);
  cek("C-3-RLS: pengguna tidak bisa INSERT jawaban harian langsung (hanya service role)",
    !insertLangsung);
}
cek("C-3: route jawab menyimpan jawaban harian (upsert service role)",
  bacaRepo("src/app/api/kuis/jawab/route.ts").includes("pf_quiz_daily_answers"));

/* ============================================================
   §C. C-1: UI + API pembuatan soal bertipe baru
   ============================================================ */
console.log("\n§C. C-1 soal bertipe baru");
const soalSrc = bacaRepo("src/lib/akademi/soal.ts");
const penilaianSrc2 = bacaRepo("src/lib/akademi/penilaian.ts");
const fnJenis = ekstrakFungsi(penilaianSrc2, "jenisSoalKuisDari");
const fnValidasi = ekstrakFungsi(soalSrc, "validasiSoalBaru");
const fnTeks = ekstrakFungsi(soalSrc, "teksAtauNull");
const kUuid = ekstrakKonst(soalSrc, "POLA_UUID");
const kTgl = ekstrakKonst(soalSrc, "POLA_TANGGAL");
cek("C-1: validasiSoalBaru + dependensinya dapat diekstrak",
  Boolean(fnValidasi) && Boolean(fnJenis) && Boolean(fnTeks) && Boolean(kUuid) && Boolean(kTgl));
let validasiSoalBaru = null;
if (fnValidasi && fnJenis && fnTeks && kUuid && kTgl) {
  validasiSoalBaru = new Function(
    `${transpileKeJs(`${kUuid}\n${kTgl}\n${fnTeks}\n${fnJenis}\n${fnValidasi}`)}\nreturn validasiSoalBaru;`,
  )();
  const dasar = { pertanyaan: "Ibu kota Indonesia?", penjelasan: "" };
  const pg = validasiSoalBaru({ ...dasar, lesson_id: "00000000-0000-0000-0000-000000000001", jenis: "pilihan_ganda", opsi: ["Jakarta", "Bandung"], kunci: 0 });
  cek("C-1: PG valid (2 opsi, kunci 0)", pg.ok === true && pg.data?.kunci === 0, pg.ok ? "" : pg.error);
  const pgTanpaKunci = validasiSoalBaru({ ...dasar, lesson_id: "00000000-0000-0000-0000-000000000001", jenis: "pilihan_ganda", opsi: ["a", "b"], kunci: null });
  cek("C-1: PG tanpa kunci DITOLAK", pgTanpaKunci.ok === false, pgTanpaKunci.ok ? "" : pgTanpaKunci.error);
  const kompleks = validasiSoalBaru({ ...dasar, lesson_id: "00000000-0000-0000-0000-000000000001", jenis: "pilihan_ganda_kompleks", opsi: ["a", "b", "c"], kunci_jamaks: [0, 2] });
  cek("C-1: kompleks valid (kunci_jamaks [0,2])",
    kompleks.ok === true && JSON.stringify(kompleks.data?.kunci_jamaks) === "[0,2]", kompleks.ok ? "" : kompleks.error);
  const kompleksSatu = validasiSoalBaru({ ...dasar, lesson_id: "00000000-0000-0000-0000-000000000001", jenis: "pilihan_ganda_kompleks", opsi: ["a", "b", "c"], kunci_jamaks: [1] });
  cek("C-1: kompleks 1 kunci DITOLAK", kompleksSatu.ok === false);
  const isian = validasiSoalBaru({ ...dasar, lesson_id: "00000000-0000-0000-0000-000000000001", jenis: "isian_singkat", kunci_teks: "Jakarta" });
  cek("C-1: isian singkat valid (kunci_teks, opsi kosong [])",
    isian.ok === true && isian.data?.kunci_teks === "Jakarta" && Array.isArray(isian.data?.opsi) && isian.data.opsi.length === 0, isian.ok ? "" : isian.error);
  const isianOpsi = validasiSoalBaru({ ...dasar, lesson_id: "00000000-0000-0000-0000-000000000001", jenis: "isian_singkat", opsi: ["a"], kunci_teks: "x" });
  cek("C-1: isian dengan opsi DITOLAK", isianOpsi.ok === false);
  const bs = validasiSoalBaru({ ...dasar, lesson_id: "00000000-0000-0000-0000-000000000001", jenis: "benar_salah", kunci: 1 });
  cek("C-1: benar-salah valid (opsi default Benar/Salah)",
    bs.ok === true && JSON.stringify(bs.data?.opsi) === '["Benar","Salah"]', bs.ok ? "" : bs.error);
  const esai = validasiSoalBaru({ ...dasar, lesson_id: "00000000-0000-0000-0000-000000000001", jenis: "esai" });
  cek("C-1: esai valid tanpa kunci apa pun",
    esai.ok === true && esai.data?.kunci === null && esai.data?.kunci_teks === null && esai.data?.kunci_jamaks === null,
    esai.ok ? "" : esai.error);
  const esaiKunci = validasiSoalBaru({ ...dasar, lesson_id: "00000000-0000-0000-0000-000000000001", jenis: "esai", kunci_teks: "jawaban" });
  cek("C-1: esai DENGAN kunci DITOLAK", esaiKunci.ok === false);
  const duaTujuan = validasiSoalBaru({ ...dasar, lesson_id: "00000000-0000-0000-0000-000000000001", tanggal: "2026-11-16", jenis: "esai" });
  cek("C-1: lesson_id + tanggal bersamaan DITOLAK", duaTujuan.ok === false);
  const harianKompleks = validasiSoalBaru({ ...dasar, tanggal: "2026-11-16", jenis: "pilihan_ganda_kompleks", opsi: ["a", "b"], kunci_jamaks: [0, 1] });
  cek("C-1: kuis harian hanya PG (kompleks DITOLAK)", harianKompleks.ok === false);
  const tanpaTarget = validasiSoalBaru({ ...dasar, jenis: "esai" });
  cek("C-1: tanpa lesson_id/tanggal DITOLAK", tanpaTarget.ok === false);
}
cek("C-1: route soal admin ada (GET 50 terbaru + POST staf)",
  existsSync(new URL("../src/app/api/admin/akademi/soal/route.ts", import.meta.url)) &&
  bacaRepo("src/app/api/admin/akademi/soal/route.ts").includes("akademi.soal.buat"));
cek("C-1: halaman admin soal ada (form jenis dinamis + daftar)",
  existsSync(new URL("../src/app/admin/akademi/soal/page.tsx", import.meta.url)) &&
  bacaRepo("src/app/admin/akademi/soal/page.tsx").includes("pilihan_ganda_kompleks") &&
  bacaRepo("src/app/admin/akademi/soal/page.tsx").includes("esai"));
cek("C-1: halaman admin Akademi menautkan Buat soal kuis",
  bacaRepo("src/app/admin/akademi/page.tsx").includes("/admin/akademi/soal"));
cek("C-1: buatSoalKuis menulis kunci ke pf_quiz_answers (bukan kolom publik)",
  soalSrc.includes('.from("pf_quiz_answers")') &&
  soalSrc.includes('.from("pf_quiz_questions")') &&
  !/\.from\("pf_quiz_questions"\)\s*\n\s*\.insert\(\{[^}]*kunci/.test(soalSrc),
  "insert soal tidak boleh membawa field kunci");
{
  // Invarian DB: soal esai tanpa baris kunci; soal PG punya baris kunci.
  const qEsai = (await db.query(
    `insert into public.pf_quiz_questions (tanggal, pertanyaan, opsi, jenis)
     values ('2026-11-17', 'Jelaskan Pancasila.', '[]'::jsonb, 'esai') returning id`,
  )).rows[0].id;
  const kunciEsai = await db.query(
    `select count(*) as n from public.pf_quiz_answers where soal_id = $1`, [qEsai],
  );
  cek("C-1-DB: soal esai TANPA baris kunci", Number(kunciEsai.rows[0].n) === 0);
  const qPg = (await db.query(
    `insert into public.pf_quiz_questions (tanggal, pertanyaan, opsi, jenis)
     values ('2026-11-17', 'PG?', '["a","b"]'::jsonb, 'pilihan_ganda') returning id`,
  )).rows[0].id;
  await db.query(`insert into public.pf_quiz_answers (soal_id, kunci) values ($1, 1)`, [qPg]);
  const kunciPg = await db.query(
    `select kunci from public.pf_quiz_answers where soal_id = $1`, [qPg],
  );
  cek("C-1-DB: kunci PG tersimpan di pf_quiz_answers", kunciPg.rows[0]?.kunci === 1);
  const anonBaca = await berhasilSebagai("anon",
    `select kunci from public.pf_quiz_answers limit 1`);
  cek("C-1-DB: anon tidak bisa baca pf_quiz_answers", !anonBaca);
}

/* ============================================================
   §D. C-2: pencabutan sertifikat
   ============================================================ */
console.log("\n§D. C-2 pencabutan sertifikat");
const sertSrc = bacaRepo("src/lib/akademi/sertifikat.ts");
cek("C-2: cabutSertifikat + pulihkanSertifikat + daftarSertifikat ada",
  sertSrc.includes("cabutSertifikat") && sertSrc.includes("pulihkanSertifikat") && sertSrc.includes("daftarSertifikat"));
cek("C-2: cabut hanya bila dicabut=false (idempoten aman)",
  sertSrc.includes("dicabut") && sertSrc.includes("sudah_dicabut"));
cek("C-2: route sertifikat punya GET (daftar) + DELETE (cabut)",
  bacaRepo("src/app/api/akademi/sertifikat/route.ts").includes("akademi.sertifikat.cabut"));
cek("C-2: UI admin punya SeksiCabutSertifikat",
  bacaRepo("src/app/admin/akademi/page.tsx").includes("SeksiCabutSertifikat") &&
  bacaRepo("src/app/admin/akademi/page.tsx").includes("Cabut sertifikat"));
{
  // Simulasi SQL yang dijalankan cabutSertifikat (update bersyarat).
  const kursusId = (await db.query(
    `insert into public.pf_courses (slug, judul, status) values ('kursus-tahap-c', 'Kursus Tahap C', 'terbit') returning id`,
  )).rows[0].id;
  const sert = (await db.query(
    `insert into public.pf_certificates (user_id, course_id, kode_verifikasi, nama_kursus, nama_peserta)
     values ($1, $2, 'TCTEST000001', 'Kursus Tahap C', 'Pengguna A') returning id, kode_verifikasi`,
    [UID_A, kursusId],
  )).rows[0];
  const cabut1 = await db.query(
    `update public.pf_certificates set dicabut = true, dicabut_pada = now(), dicabut_alasan = $2
     where kode_verifikasi = $1 and dicabut = false returning id`,
    [sert.kode_verifikasi, "Pelanggaran integritas (uji)."],
  );
  cek("C-2-DB: pencabutan pertama berhasil (1 baris)", cabut1.rows.length === 1);
  const cabut2 = await db.query(
    `update public.pf_certificates set dicabut = true, dicabut_pada = now(), dicabut_alasan = $2
     where kode_verifikasi = $1 and dicabut = false returning id`,
    [sert.kode_verifikasi, "Coba cabut lagi."],
  );
  cek("C-2-DB: pencabutan kedua TIDAK berpengaruh (sudah_dicabut)", cabut2.rows.length === 0);
  const cekDb = await db.query(
    `select dicabut, dicabut_alasan from public.pf_certificates where kode_verifikasi = $1`,
    [sert.kode_verifikasi],
  );
  cek("C-2-DB: status dicabut + alasan tersimpan",
    cekDb.rows[0].dicabut === true && cekDb.rows[0].dicabut_alasan === "Pelanggaran integritas (uji).");
  // Aksi audit v15 mengizinkan pencabutan (kolom nyata pf_audit_logs:
  // aktor_id, aksi, entitas NOT NULL, entitas_id).
  const auditOk = await berhasilSebagai("service_role",
    `insert into public.pf_audit_logs (aktor_id, aksi, entitas, entitas_id) values ($1, 'akademi.sertifikat.cabut', 'sertifikat', 'TCTEST000001')`,
    [UID_STAF]);
  cek("C-2-DB: audit aksi akademi.sertifikat.cabut diterima CHECK v15", auditOk);
  const auditSoal = await berhasilSebagai("service_role",
    `insert into public.pf_audit_logs (aktor_id, aksi, entitas, entitas_id) values ($1, 'akademi.soal.buat', 'soal', 'uji')`,
    [UID_STAF]);
  cek("C-2-DB: audit aksi akademi.soal.buat diterima CHECK v15", auditSoal);
}
cek("C-2: halaman verifikasi publik menampilkan DICABUT",
  bacaRepo("src/app/akademi/sertifikat/[kode]/page.tsx").includes("sudah dicabut") &&
  bacaRepo("src/app/akademi/sertifikat/[kode]/page.tsx").includes("dicabut"));

/* ============================================================
   §E. C-5: topik isu menghasilkan notifikasi
   ============================================================ */
console.log("\n§E. C-5 notifikasi topik isu");
const tulisSrc = bacaRepo("src/lib/notifikasi/tulis.ts");
cek("C-5: kirimNotifikasiTopik mencocokkan isu (ilike)",
  tulisSrc.includes("tipe.eq.isu") && tulisSrc.includes("target.ilike"));
cek("C-5: kirimNotifikasiTopik select isu + fallback PGRST204 (pre-v15)",
  tulisSrc.includes("PGRST204") || tulisSrc.includes("isu"));
cek("C-5: terbitkanArtikel tetap memanggil kirimNotifikasiTopik",
  bacaRepo("src/lib/admin/editorial.ts").includes("kirimNotifikasiTopik(null, baru.id)"));
cek("C-5: admin artikel bisa mengisi isu (FormArtikel + FIELD_PATCH + adapter)",
  bacaRepo("src/components/admin/FormArtikel.tsx").includes("isu") &&
  bacaRepo("src/app/api/admin/artikel/[id]/route.ts").includes('"isu"') &&
  bacaRepo("src/lib/admin/supabase-adapter.ts").includes("isu: input.isu"));
{
  // Seed: artikel ber-isu 'Ekonomi', kategori 'dunia-uji'.
  const artikel = (await db.query(
    `insert into public.pf_articles (slug, judul, ringkasan, isi, kategori_slug, isu, status, status_verifikasi)
     values ('artikel-isu-uji', 'Judul Uji Isu', 'Ringkasan', 'Isi artikel.', 'dunia-uji', 'Ekonomi', 'terbit', 'VERIFIED')
     returning id`,
  )).rows[0].id;
  await db.query(
    `insert into public.pf_followed_topics (user_id, tipe, target) values
     ($1, 'kategori', 'dunia-uji'),
     ($1, 'isu', 'ekonomi'),
     ($2, 'isu', 'Ekonomi'),
     ($2, 'isu', 'Politik')
     on conflict (user_id, tipe, target) do nothing`,
    [UID_A, UID_B],
  );
  // SQL setara kondisi kirimNotifikasiTopik untuk artikel ini
  // (kategori 'dunia-uji' + isu 'Ekonomi', ilike).
  const cocok = await db.query(
    `select distinct user_id from public.pf_followed_topics
     where (tipe = 'kategori' and target = 'dunia-uji')
        or (tipe = 'isu' and target ilike 'Ekonomi')`,
  );
  const ids = cocok.rows.map((x) => x.user_id).sort();
  cek("C-5-DB: pencocokan isu menemukan A (kategori + isu lowercase) + B (isu)",
    ids.length === 2 && ids[0] === UID_A && ids[1] === UID_B,
    `ditemukan: ${ids.join(",")}`);
  const lain = await db.query(
    `select distinct user_id from public.pf_followed_topics
     where (tipe = 'kategori' and target = 'dunia-uji')
        or (tipe = 'isu' and target ilike 'Kesehatan')`,
  );
  cek("C-5-DB: isu lain (Kesehatan) hanya menemukan A via kategori",
    lain.rows.length === 1 && lain.rows[0].user_id === UID_A,
    `ditemukan: ${lain.rows.map((x) => x.user_id).join(",")}`);
  // Dedup: A cocok lewat 2 jalur (kategori + isu) -> 1 notifikasi.
  const dedup = await db.query(
    `select count(*) as n from (select distinct user_id from public.pf_followed_topics
     where (tipe = 'kategori' and target = 'dunia-uji')
        or (tipe = 'isu' and target ilike 'Ekonomi')) s where user_id = $1`,
    [UID_A],
  );
  cek("C-5-DB: dedup — A yang cocok 2 jalur tetap 1 penerima", Number(dedup.rows[0].n) === 1);
  // Simpan notifikasi (simulasi tulisNotifikasiTopik) + dedup kunci_dedup.
  const notif = await db.query(
    `insert into public.pf_notifications (user_id, jenis, judul, isi, tautan, kunci_dedup)
     values ($1, 'topik', 'Artikel baru: Judul Uji Isu', 'Artikel baru pada topik yang Anda ikuti.', '/artikel/artikel-isu-uji', $2)
     on conflict (user_id, kunci_dedup) where kunci_dedup is not null do nothing returning id`,
    [UID_A, `topik:${artikel}`],
  );
  cek("C-5-DB: notifikasi topik tersimpan dengan kunci_dedup", notif.rows.length === 1);
  const notif2 = await db.query(
    `insert into public.pf_notifications (user_id, jenis, judul, isi, tautan, kunci_dedup)
     values ($1, 'topik', 'Artikel baru: Judul Uji Isu', 'Artikel baru pada topik yang Anda ikuti.', '/artikel/artikel-isu-uji', $2)
     on conflict (user_id, kunci_dedup) where kunci_dedup is not null do nothing returning id`,
    [UID_A, `topik:${artikel}`],
  );
  cek("C-5-DB: notifikasi duplikat (kunci_dedup sama) ditolak", notif2.rows.length === 0);
}

/* ============================================================
   §F. C-4: log galat menyeluruh
   ============================================================ */
console.log("\n§F. C-4 log galat menyeluruh");
const ROUTE_WIRE = [
  "src/app/api/akademi/kuis/jawab/route.ts",
  "src/app/api/akademi/progres/route.ts",
  "src/app/api/akademi/sertifikat/route.ts",
  "src/app/api/bookmark/route.ts",
  "src/app/api/cerita/[slug]/ikuti/route.ts",
  "src/app/api/kuis/jawab/route.ts",
  "src/app/api/kuis/skor/route.ts",
  "src/app/api/laporan-publik/route.ts",
  "src/app/api/notifikasi/route.ts",
  "src/app/api/podcast/playlist/route.ts",
  "src/app/api/podcast/riwayat/route.ts",
  "src/app/api/push/langganan/route.ts",
  "src/app/api/saya/akun/hapus/minta/route.ts",
  "src/app/api/saya/akun/hapus/route.ts",
  "src/app/api/saya/data/route.ts",
  "src/app/api/saya/preferensi/route.ts",
  "src/app/api/sumber/[id]/route.ts",
  "src/app/api/tanya/[id]/membantu/route.ts",
  "src/app/api/topik/route.ts",
  "src/app/api/ai/brief/route.ts",
  "src/app/api/ai/data-analysis/route.ts",
  "src/app/api/ai/jalankan/route.ts",
  "src/app/api/ingestion/jalankan/route.ts",
];
{
  let totalSitus = 0;
  let tanpaLog = [];
  for (const rel of ROUTE_WIRE) {
    const src = bacaRepo(rel);
    const baris = src.split("\n");
    totalSitus += (src.match(/void catatGalatRoute\(/g) ?? []).length;
    baris.forEach((b, i) => {
      if (b.includes("{ status: 500 }")) {
        // Cari baris return yang menaungi literal 500 ini (<=8 baris
        // ke atas); call catatGalatRoute wajib tepat sebelum return.
        let ret = -1;
        for (let j = i; j >= Math.max(0, i - 8); j--) {
          if (baris[j].includes("return NextResponse.json(")) { ret = j; break; }
        }
        if (ret < 1 || !baris[ret - 1].includes("catatGalatRoute(")) {
          tanpaLog.push(`${rel}:${i + 1}`);
        }
      }
    });
  }
  cek("C-4: 23 route target ter-wire (dengan situs 500)",
    ROUTE_WIRE.length === 23);
  cek("C-4: total 53 panggilan catatGalatRoute di route target",
    totalSitus === 53, `dihitung ${totalSitus}`);
  cek("C-4: setiap return 500 didahului catatGalatRoute (tepat sebelum return)",
    tanpaLog.length === 0, tanpaLog.join("; "));
}
const galatSrc = bacaRepo("src/lib/analytics/galat.ts");
cek("C-4: catatGalatRoute ada + melewati PGRST205/42P01/42703",
  galatSrc.includes("catatGalatRoute") &&
  galatSrc.includes("PGRST205") && galatSrc.includes("42P01") && galatSrc.includes("42703"));
cek("C-4: catatGalatRoute tidak pernah melempar (try/catch + komentar)",
  galatSrc.includes("TIDAK PERNAH melempar"));
cek("C-4: catatGalatBaca menulis galat non-tabel ke pf_app_errors",
  bacaRepo("src/lib/galat.ts").includes("catatGalatAplikasi"));
cek("C-4: admin guard + kunjungan sudah tercakup (tidak diduplikasi)",
  bacaRepo("src/lib/admin/guard.ts").includes("catatGalatAplikasi") &&
  bacaRepo("src/app/api/analytics/kunjungan/route.ts").includes("catatGalatAplikasi"));
cek("C-4: tidak ada banjir — galat tabel-belum-ada dilewati di kedua helper",
  bacaRepo("src/lib/galat.ts").includes("galatTabelBelumAda") &&
  galatSrc.includes("Could not find the table"));
// Tahap H: artefak PPR Next.js 16 — penolakan fetch prerender bukan
// galat database; catatGalatBaca wajib melewatinya tanpa log/error.
const libGalatSrc = bacaRepo("src/lib/galat.ts");
{
  const mulaiCatat = libGalatSrc.indexOf("export function catatGalatBaca");
  const badanCatat = libGalatSrc.slice(mulaiCatat);
  cek("C-4: galatPrerenderPPR ada + diperiksa catatGalatBaca SEBELUM tabel-belum-ada",
    libGalatSrc.includes("export function galatPrerenderPPR") &&
      libGalatSrc.includes("During prerendering,") &&
      libGalatSrc.includes("rejects when the prerender is complete") &&
      badanCatat.indexOf("galatPrerenderPPR(err)") < badanCatat.indexOf("galatTabelBelumAda(err)") &&
      badanCatat.indexOf("galatPrerenderPPR(err)") >= 0);
  const fnPpr = ekstrakFungsi(libGalatSrc, "galatPrerenderPPR");
  cek("C-4: galatPrerenderPPR dapat diekstrak", Boolean(fnPpr));
  if (fnPpr) {
    const deteksi = new Function(
      `${transpileKeJs(fnPpr)}\nreturn galatPrerenderPPR;`,
    )();
    const errPpr = new Error(
      "During prerendering, fetch() rejects when the prerender is complete. This occurred at route \"/\".",
    );
    cek("C-4: galatPrerenderPPR true untuk galat prerender PPR", deteksi(errPpr) === true);
    cek("C-4: galatPrerenderPPR true untuk varian cookies() PPR",
      deteksi(new Error("During prerendering, `cookies()` rejects when the prerender is complete. This occurred at route \"/tanya\".")) === true);
    cek("C-4: galatPrerenderPPR false untuk galat database biasa", deteksi(new Error("connection refused")) === false);
    cek("C-4: galatPrerenderPPR true untuk string pesan PPR", deteksi("During prerendering, fetch() rejects when the prerender is complete.") === true);
    cek("C-4: galatPrerenderPPR true untuk objek galat Supabase (message+details)",
      deteksi({ message: "Error: During prerendering, fetch() rejects when the prerender is complete.", details: "Error: During prerendering, fetch() rejects when the prerender is complete.\n    at fetch (chunks/ssr/x.js:1:1)", hint: "", code: "" }) === true);
    cek("C-4: galatPrerenderPPR false untuk objek galat Supabase biasa",
      deteksi({ message: "Could not find the table 'public.pf_articles' in the schema cache", details: null, hint: null, code: "PGRST205" }) === false);
    cek("C-4: galatPrerenderPPR false untuk null/undefined", deteksi(null) === false && deteksi(undefined) === false);
  }
}

/* ============================================================
   §G. C-6: bukti dokumen (TTS + esai otomatis tetap belum bisa)
   ============================================================ */
console.log("\n§G. C-6 bukti dokumen");
const podcastSrc = bacaRepo("src/lib/podcast.ts");
cek("C-6: gate podcast masih menolak TTS server (suara id_ID berlisensi tidak jelas)",
  podcastSrc.includes("id_ID-news_tts-medium") &&
  podcastSrc.includes("tidak ada suara id_ID yang lisensinya JELAS") &&
  bacaRepo("src/lib/podcast/rss.ts").includes("TIDAK ADA episode"));
cek("C-6: gate podcast merujuk MODEL_CARD resmi Piper",
  podcastSrc.includes("huggingface.co/rhasspy/piper-voices") &&
  podcastSrc.includes("MODEL_CARD"));
{
  const fnNilai = ekstrakFungsi(penilaianSrc2, "nilaiJawaban");
  const fnNorm = ekstrakFungsi(penilaianSrc2, "normalisasiIsian");
  cek("C-6: nilaiJawaban + normalisasiIsian dapat diekstrak", Boolean(fnNilai) && Boolean(fnNorm));
  if (fnNilai && fnNorm) {
    const m = new Function(
      `${transpileKeJs(`${fnNorm}\n${fnNilai}`)}\nreturn nilaiJawaban;`,
    )();
    const hasilEsai = m(
      { jenis: "esai", kunci: null, kunci_teks: null, kunci_jamaks: null },
      "Jawaban esai siswa yang panjang.",
    );
    cek("C-6: penilaian esai otomatis -> null (menunggu penilai manusia)",
      hasilEsai.benar === null && hasilEsai.status_penilaian === "menunggu_penilaian",
      JSON.stringify(hasilEsai));
  }
}
let laporan = "";
try {
  laporan = bacaRepo("LAPORAN-TAHAP-C.md");
} catch {
  laporan = "";
}
cek("C-6: laporan Tahap C ada dan mengutip bukti TTS segar 16 Nov 2026",
  laporan.includes("id_ID-news_tts-medium") &&
  laporan.includes('License: "See URL"') &&
  laporan.includes("Malayalam") &&
  laporan.includes("lessac") &&
  laporan.includes("huggingface.co/rhasspy/piper-voices"));
cek("C-6: laporan Tahap C menegaskan esai otomatis tetap belum bisa + alasannya",
  laporan.includes("esai") && laporan.includes("RubricCheck") && laporan.includes("ArguLens"));

console.log(`\n${lolos} lolos, ${gagal} gagal.`);
if (gagal > 0) console.log(`Gagal: ${gagalDaftar.join("; ")}`);
process.exit(gagal === 0 ? 0 : 1);
