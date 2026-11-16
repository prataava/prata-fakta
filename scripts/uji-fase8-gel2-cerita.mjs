// Uji Gelombang 2 Area 2/12 (Story Tracker + Historical Archive +
// /admin/event) PRATA FAKTA -> PGlite + pemeriksaan statis +
// uji fungsi murni (transpilasi TS, pola uji-fase8-gel1.mjs).
//   - Terapkan v1–v10 dua kali (idempotensi, tanpa blanket grant).
//   - RLS: cerita draf tersembunyi dari anon; tautan event/artikel
//     cerita draf tersembunyi; tautan ke artikel DRAF tidak bocor
//     lewat join aplikasi (filter status='terbit' eksplisit).
//   - Follow: isolasi pemilik pf_story_followers (A=1/B=0/anon=0;
//     B tak bisa tulis/hapus milik A).
//   - Kolom v10: era/penting/negara_kode tersimpan di pf_events.
//   - RPC pf_akar_salinan (v9 ASLI): salinan B+C dari akar A = 1
//     sumber independen; artikel draf -> kosong.
//   - Fungsi murni: cocokHariBulan/bulanHariWib/tahunWib/
//     hitungAkarIndependen/slugCeritaValid/validasiAksiIkuti/
//     tahunFilterValid + filter "hari ini" ujung-ke-ujung (JS).
//   - Statis: berkas area ada; cek status='terbit' eksplisit;
//     klaim independen dijaga rantai_tersedia; route ikuti 401;
//     route admin pakai guard + service role; filter ?cerita=
//     di /timeline.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = require("@electric-sql/pglite");

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

async function berhasilSebagaiUid(role, uid, sql, params = []) {
  try {
    await sebagaiUid(role, uid, sql, params);
    return true;
  } catch {
    return false;
  }
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

// Hari ini WIB (untuk seed "hari ini dalam sejarah").
const HARI_INI_WIB = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const [, BLN, HARI] = HARI_INI_WIB.split("-");

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

// ---------- Seed (service role = bypass RLS) ----------
await db.query(`insert into auth.users (id, email) values ($1, 'a@uji.id'), ($2, 'b@uji.id')`, [UID_A, UID_B]);
await db.query(`insert into public.pf_countries (kode, nama, ibu_kota, sumber, periode_referensi)
  values ('ID', 'Indonesia', 'Jakarta', 'BPS', '2026')`);
await db.query(`insert into public.pf_sources (nama, jenis, url, prioritas)
  values ('Sumber X', 'rss', 'https://x.id/rss', 90)`);
const sumberX = await db.query(`select id from public.pf_sources where url='https://x.id/rss'`);
const sumberXId = sumberX.rows[0].id;

// Artikel: 1 terbit (sumber_url = URL salinan B) + 1 draf.
await db.query(`insert into public.pf_articles (slug, judul, kategori_slug, status, sumber_url)
  values ('art-terbit', 'Artikel Terbit', 'indonesia', 'terbit', 'https://y.id/salinan-b')`);
await db.query(`insert into public.pf_articles (slug, judul, kategori_slug, status)
  values ('art-draf', 'Artikel Draf', 'indonesia', 'draft')`);
const artTerbit = await db.query(`select id from public.pf_articles where slug='art-terbit'`);
const artTerbitId = artTerbit.rows[0].id;
const artDraf = await db.query(`select id from public.pf_articles where slug='art-draf'`);
const artDrafId = artDraf.rows[0].id;

// Rantai salinan: A (asal) <- B, C (disalin dari A).
await db.query(`insert into public.pf_raw_items (sumber_id, url, hash_url, judul, hash_judul)
  values ($1, 'https://x.id/asal', 'h-asal', 'Judul Asal', 'hj-asal')`, [sumberXId]);
const itemA = await db.query(`select id from public.pf_raw_items where url='https://x.id/asal'`);
const itemAId = itemA.rows[0].id;
await db.query(`insert into public.pf_raw_items (sumber_id, url, hash_url, judul, hash_judul, disalin_dari_id)
  values ($1, 'https://y.id/salinan-b', 'h-b', 'Judul Asal', 'hj-b', $2)`, [sumberXId, itemAId]);
await db.query(`insert into public.pf_raw_items (sumber_id, url, hash_url, judul, hash_judul, disalin_dari_id)
  values ($1, 'https://z.id/salinan-c', 'h-c', 'Judul Asal', 'hj-c', $2)`, [sumberXId, itemAId]);

// Cerita: 1 terbit + 1 draf.
await db.query(`insert into public.pf_stories (slug, judul, status, status_perkembangan)
  values ('cerita-uji', 'Cerita Uji', 'terbit', 'berkembang')`);
await db.query(`insert into public.pf_stories (slug, judul, status)
  values ('cerita-draf', 'Cerita Draf', 'draft')`);
const story = await db.query(`select id from public.pf_stories where slug='cerita-uji'`);
const storyId = story.rows[0].id;
const storyDraf = await db.query(`select id from public.pf_stories where slug='cerita-draf'`);
const storyDrafId = storyDraf.rows[0].id;

// Event: hari ini WIB (penting, era Reformasi, ID), 1998 di
// hari-bulan yang sama (tahun berapa pun), dan 2020-05-20.
await db.query(`insert into public.pf_events (judul, dimulai_pada, era, penting, negara_kode, lokasi_teks)
  values ('Event Hari Ini', $1, 'Reformasi', true, 'ID', 'Jakarta')`, [`${HARI_INI_WIB}T08:00:00+07:00`]);
await db.query(`insert into public.pf_events (judul, dimulai_pada, era, penting, negara_kode)
  values ('Event 1998', $1, 'Reformasi', false, 'ID')`, [`1998-${BLN}-${HARI}T08:00:00+07:00`]);
await db.query(`insert into public.pf_events (judul, dimulai_pada, era, penting)
  values ('Event Lain', '2020-05-20T08:00:00+07:00', 'Orde Baru', false)`);
const evHariIni = await db.query(`select id from public.pf_events where judul='Event Hari Ini'`);
const evHariIniId = evHariIni.rows[0].id;
const evLain = await db.query(`select id from public.pf_events where judul='Event Lain'`);
const evLainId = evLain.rows[0].id;
await db.query(`insert into public.pf_event_timeline (event_id, waktu, peristiwa)
  values ($1, $2, 'Perkembangan pertama')`, [evHariIniId, `${HARI_INI_WIB}T09:00:00+07:00`]);

// Tautan cerita: terbit -> 2 event + 2 artikel (1 terbit, 1 draf);
// draf -> 1 event + 1 artikel terbit (harus tersembunyi dari anon).
await db.query(`insert into public.pf_story_events (story_id, event_id, urutan)
  values ($1, $2, 1), ($1, $3, 2)`, [storyId, evHariIniId, evLainId]);
await db.query(`insert into public.pf_story_events (story_id, event_id, urutan)
  values ($1, $2, 1)`, [storyDrafId, evLainId]);
await db.query(`insert into public.pf_story_articles (story_id, artikel_id, peran)
  values ($1, $2, 'pembaruan'), ($1, $3, 'terkait')`, [storyId, artTerbitId, artDrafId]);
await db.query(`insert into public.pf_story_articles (story_id, artikel_id, peran)
  values ($1, $2, 'terkait')`, [storyDrafId, artTerbitId]);

// Pengikut: A mengikuti cerita terbit.
await db.query(`insert into public.pf_story_followers (user_id, story_id) values ($1, $2)`, [UID_A, storyId]);
console.log("OK: seed cerita/event/artikel/rantai");

// ---------- RLS: cerita draf tersembunyi ----------
cek("anon baca pf_stories terbit = 1",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_stories`)) === 1);
cek("anon baca pf_story_events cerita terbit = 2",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_story_events where story_id=$1`, [storyId])) === 2);
cek("anon baca pf_story_events cerita draf = 0",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_story_events where story_id=$1`, [storyDrafId])) === 0);
cek("anon baca pf_story_articles cerita terbit = 2 (policy hanya cek status cerita)",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_story_articles where story_id=$1`, [storyId])) === 2);
cek("anon baca pf_story_articles cerita draf = 0",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_story_articles where story_id=$1`, [storyDrafId])) === 0);
// Celah yang ditutup di LAPISAN APLIKASI (getCerita: join inner +
// filter pf_articles.status='terbit'): tautan ke artikel draf
// tidak pernah sampai ke pembaca.
cek("join aplikasi: tautan artikel TERBIT dalam cerita terbit = 1",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_story_articles sa
     join public.pf_articles a on a.id = sa.artikel_id
     where sa.story_id=$1 and a.status='terbit'`, [storyId])) === 1);
cek("anon baca pf_articles draf = 0",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_articles where slug='art-draf'`)) === 0);

// ---------- Follow: isolasi pemilik ----------
cek("A baca pf_story_followers sendiri = 1",
  (await hitungSebagaiUid("authenticated", UID_A, `select count(*)::int as n from public.pf_story_followers`)) === 1);
cek("B baca pf_story_followers milik A = 0",
  (await hitungSebagaiUid("authenticated", UID_B, `select count(*)::int as n from public.pf_story_followers`)) === 0);
cek("anon baca pf_story_followers = 0",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_story_followers`)) === 0);
cek("B insert follow milik sendiri OK",
  await berhasilSebagaiUid("authenticated", UID_B,
    `insert into public.pf_story_followers (user_id, story_id) values ($1, $2)`, [UID_B, storyId]));
cek("B baca follow sendiri sesudah insert = 1",
  (await hitungSebagaiUid("authenticated", UID_B, `select count(*)::int as n from public.pf_story_followers`)) === 1);
cek("B insert follow atas nama A DITOLAK (RLS)",
  !(await berhasilSebagaiUid("authenticated", UID_B,
    `insert into public.pf_story_followers (user_id, story_id) values ($1, $2)`, [UID_A, storyDrafId])));
cek("B delete follow milik A DITOLAK (baris A tetap 1)",
  (await (async () => {
    await sebagaiUid("authenticated", UID_B,
      `delete from public.pf_story_followers where user_id=$1 and story_id=$2`, [UID_A, storyId]).catch(() => null);
    return hitungSebagaiUid("authenticated", UID_A, `select count(*)::int as n from public.pf_story_followers`);
  })()) === 1);
cek("A delete follow milik sendiri OK",
  (await (async () => {
    const ok = await berhasilSebagaiUid("authenticated", UID_A,
      `delete from public.pf_story_followers where user_id=$1 and story_id=$2`, [UID_A, storyId]);
    const sisa = await hitungSebagaiUid("authenticated", UID_A, `select count(*)::int as n from public.pf_story_followers`);
    return ok && sisa === 0;
  })()));

// ---------- Kolom v10 di pf_events ----------
const evRow = await db.query(`select era, penting, negara_kode, lokasi_teks from public.pf_events where id=$1`, [evHariIniId]);
cek("event hari ini: era='Reformasi', penting=true, negara='ID'",
  evRow.rows[0].era === "Reformasi" && evRow.rows[0].penting === true &&
  evRow.rows[0].negara_kode === "ID" && evRow.rows[0].lokasi_teks === "Jakarta");
const evLainRow = await db.query(`select era, penting, negara_kode from public.pf_events where id=$1`, [evLainId]);
cek("event lain: era='Orde Baru', penting=false, negara null",
  evLainRow.rows[0].era === "Orde Baru" && evLainRow.rows[0].penting === false &&
  evLainRow.rows[0].negara_kode === null);
let tolakFkEvent = false;
try {
  await db.query(`insert into public.pf_events (judul, dimulai_pada, negara_kode)
    values ('Event XX', '2026-01-01T00:00:00+07:00', 'XX')`);
} catch {
  tolakFkEvent = true;
}
cek("event negara_kode='XX' ditolak (FK)", tolakFkEvent);
cek("timeline event hari ini = 1 baris",
  (await hitungSebagai("anon", `select count(*)::int as n from public.pf_event_timeline where event_id=$1`, [evHariIniId])) === 1);

// ---------- RPC pf_akar_salinan (v9 ASLI): tanpa kesetaraan palsu ----------
const rpc = await sebagai("anon",
  `select * from public.pf_akar_salinan($1, $2)`, [artTerbitId, ["https://y.id/salinan-b", "https://z.id/salinan-c"]]);
cek("RPC salinan B+C: 2 baris", rpc.rows.length === 2, `dapat ${rpc.rows.length}`);
const akarUnik = new Set(rpc.rows.map((r) => r.akar_id));
cek("RPC salinan B+C: akar berbeda = 1 (bukan 2)",
  akarUnik.size === 1 && [...akarUnik][0] === itemAId, `akar=${[...akarUnik].join(",")}`);
cek("RPC salinan B+C: keduanya disalin=true",
  rpc.rows.every((r) => r.disalin === true));
const rpcDraf = await sebagai("anon",
  `select * from public.pf_akar_salinan($1, $2)`, [artDrafId, ["https://y.id/salinan-b"]]);
cek("RPC artikel draf = 0 baris", rpcDraf.rows.length === 0);
const rpcSumberUrl = await sebagai("anon",
  `select * from public.pf_akar_salinan($1, $2)`, [artTerbitId, ["https://y.id/salinan-b"]]);
cek("RPC via sumber_url artikel: akar = A, disalin=true",
  rpcSumberUrl.rows.length === 1 && rpcSumberUrl.rows[0].akar_id === itemAId &&
  rpcSumberUrl.rows[0].disalin === true);

// ---------- Fungsi murni (ekstrak + transpilasi TS) ----------
function ekstrak(src, pola, nama) {
  const m = pola.exec(src);
  cek(`${nama} dapat diekstrak dari sumber`, Boolean(m));
  return m ? m[0] : null;
}

const ceritaSrc = bacaRepo("src/lib/cerita.ts");
const fnHitungAkar = ekstrak(ceritaSrc,
  /export function hitungAkarIndependen\([\s\S]*?\n\}/, "hitungAkarIndependen");
if (fnHitungAkar) {
  const hitungAkar = new Function(
    transpileKeJs(`${fnHitungAkar.replace("export function", "function")}\nreturn hitungAkarIndependen;`),
  )();
  const r1 = hitungAkar([
    { akarId: itemAId, disalin: true },
    { akarId: itemAId, disalin: true },
    { akarId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", disalin: false },
  ]);
  cek("hitungAkarIndependen: B+C salinan + 1 asli = independen 2, salinan 2",
    r1.independen === 2 && r1.salinan === 2 && r1.terverifikasi === 3,
    JSON.stringify(r1));
  const r2 = hitungAkar([]);
  cek("hitungAkarIndependen: kosong = 0/0/0",
    r2.independen === 0 && r2.salinan === 0 && r2.terverifikasi === 0);
  const r3 = hitungAkar([{ akarId: null, disalin: false }]);
  cek("hitungAkarIndependen: akar null tidak dihitung",
    r3.independen === 0 && r3.terverifikasi === 0);
}

const fnSlug = ekstrak(ceritaSrc,
  /export function slugCeritaValid\([\s\S]*?\n\}/, "slugCeritaValid");
if (fnSlug) {
  const valid = new Function(
    transpileKeJs(`${fnSlug.replace("export function", "function")}\nreturn slugCeritaValid;`),
  )();
  cek("slugCeritaValid: 'cerita-uji' valid", valid("cerita-uji") === true);
  cek("slugCeritaValid: 'Cerita Uji' ditolak", valid("Cerita Uji") === false);
  cek("slugCeritaValid: 'ab' ditolak (terlalu pendek)", valid("ab") === false);
  cek("slugCeritaValid: 'a--b' ditolak", valid("a--b") === false);
}

const fnAksi = ekstrak(ceritaSrc,
  /export function validasiAksiIkuti\([\s\S]*?\n\}/, "validasiAksiIkuti");
if (fnAksi) {
  const validasi = new Function(
    transpileKeJs(`${fnAksi.replace("export function", "function")}\nreturn validasiAksiIkuti;`),
  )();
  cek("validasiAksiIkuti: 'ikuti' valid", validasi("ikuti") === null);
  cek("validasiAksiIkuti: 'berhenti' valid", validasi("berhenti") === null);
  cek("validasiAksiIkuti: 'bogus' ditolak", validasi("bogus") !== null);
}

const sejarahSrc = bacaRepo("src/lib/sejarah.ts");
const fnBulanHari = ekstrak(sejarahSrc,
  /export function bulanHariWib\([\s\S]*?\n\}/, "bulanHariWib");
const fnCocok = ekstrak(sejarahSrc,
  /export function cocokHariBulan\([\s\S]*?\n\}/, "cocokHariBulan");
const fnTahun = ekstrak(sejarahSrc,
  /export function tahunWib\([\s\S]*?\n\}/, "tahunWib");
const fnTahunValid = ekstrak(sejarahSrc,
  /export function tahunFilterValid\([\s\S]*?\n\}/, "tahunFilterValid");
if (fnBulanHari && fnCocok && fnTahun && fnTahunValid) {
  const { bulanHariWib, cocokHariBulan, tahunWib, tahunFilterValid } = new Function(
    transpileKeJs(
      `${fnBulanHari.replace("export function", "function")}\n` +
      `${fnCocok.replace("export function", "function")}\n` +
      `${fnTahun.replace("export function", "function")}\n` +
      `${fnTahunValid.replace("export function", "function")}\n` +
      `return { bulanHariWib, cocokHariBulan, tahunWib, tahunFilterValid };`,
    ),
  )();
  const bh = bulanHariWib(`${HARI_INI_WIB}T08:00:00+07:00`);
  cek("bulanHariWib: event hari ini = bulan/hari hari ini WIB",
    bh !== null && bh.bulan === Number(BLN) && bh.hari === Number(HARI),
    JSON.stringify(bh));
  cek("cocokHariBulan: event hari ini cocok", cocokHariBulan(`${HARI_INI_WIB}T08:00:00+07:00`, Number(BLN), Number(HARI)) === true);
  cek("cocokHariBulan: event 1998 cocok (tahun berapa pun)",
    cocokHariBulan(`1998-${BLN}-${HARI}T08:00:00+07:00`, Number(BLN), Number(HARI)) === true);
  cek("cocokHariBulan: event 2020-05-20 tidak cocok",
    cocokHariBulan("2020-05-20T08:00:00+07:00", Number(BLN), Number(HARI)) === false);
  cek("cocokHariBulan: iso tidak valid = false", cocokHariBulan("bukan-tanggal", 1, 1) === false);
  cek("cocokHariBulan: null = false", cocokHariBulan(null, 1, 1) === false);
  cek("tahunWib: event 1998 = 1998", tahunWib(`1998-${BLN}-${HARI}T08:00:00+07:00`) === 1998);
  cek("tahunFilterValid: 2026 valid, 1800/2101 ditolak",
    tahunFilterValid(2026) === true && tahunFilterValid(1800) === false && tahunFilterValid(2101) === false);

  // "Hari ini dalam sejarah" ujung-ke-ujung (logika JS yang sama
  // dipakai getHariIniDalamSejarah): query event sebagai anon,
  // filter dengan cocokHariBulan.
  const semuaEvent = await sebagai("anon",
    `select dimulai_pada from public.pf_events order by dimulai_pada desc`);
  const hariIni = semuaEvent.rows.filter((r) =>
    cocokHariBulan(r.dimulai_pada, Number(BLN), Number(HARI)));
  cek('"Hari ini dalam sejarah": 2 event cocok (hari ini + 1998)',
    hariIni.length === 2, `dapat ${hariIni.length}`);
}

// ---------- Pemeriksaan statis ----------
cek("berkas lib cerita ada + getCerita/getDaftarCerita diekspor",
  ceritaSrc.includes("export async function getCerita") &&
  ceritaSrc.includes("export async function getDaftarCerita") &&
  ceritaSrc.includes("export async function getCeritaDiikuti"));
cek("cerita.ts: cek status='terbit' eksplisit (min. 2 tempat)",
  (ceritaSrc.match(/\.eq\("status", "terbit"\)/g) ?? []).length >= 2,
  `dapat ${(ceritaSrc.match(/\.eq\("status", "terbit"\)/g) ?? []).length}`);
cek("cerita.ts: artikel terkait difilter status terbit (join inner)",
  ceritaSrc.includes("pf_articles!inner") &&
  ceritaSrc.includes('.eq("pf_articles.status", "terbit")'));
cek("cerita.ts: RPC pf_akar_salinan dipakai + sumber_independen null bila rantai tak tersedia",
  ceritaSrc.includes("pf_akar_salinan") &&
  ceritaSrc.includes("sumber_independen") &&
  ceritaSrc.includes("rantai_tersedia"));
const slugPageSrc = bacaRepo("src/app/cerita/[slug]/page.tsx");
cek("halaman cerita: tanpa klaim independen bila rantai belum terverifikasi",
  slugPageSrc.includes("tidak ditampilkan karena rantai salinan belum terverifikasi"));
cek("halaman cerita: pihak terkait hanya dari data (lokasi event)",
  slugPageSrc.includes("lokasi_teks") &&
  slugPageSrc.includes("tidak ada pihak atau lokasi tambahan"));
const ikutiSrc = bacaRepo("src/app/api/cerita/[slug]/ikuti/route.ts");
cek("route ikuti: 401 bila anonim + rate limit",
  ikutiSrc.includes("401") && ikutiSrc.includes("buatRateLimiter"));
cek("route ikuti: 404 bila cerita draf/tak ada",
  ikutiSrc.includes("404"));
const adminEventSrc = bacaRepo("src/app/api/admin/event/route.ts");
cek("route admin event: guard staf + service role",
  adminEventSrc.includes("autentikasiAdmin") &&
  adminEventSrc.includes("createServiceClient"));
const adminCeritaIdSrc = bacaRepo("src/app/api/admin/cerita/[id]/route.ts");
cek("route admin cerita [id]: 4 aksi tautan",
  ["tambah_event", "hapus_event", "tambah_artikel", "hapus_artikel"].every((a) =>
    adminCeritaIdSrc.includes(a)));
const adminPageSrc = bacaRepo("src/app/admin/event/page.tsx");
cek("halaman /admin/event: memanggil API admin event + cerita",
  adminPageSrc.includes("/api/admin/event") &&
  adminPageSrc.includes("/api/admin/cerita"));
cek("halaman /admin/event: formulir era + penting + negara_kode",
  adminPageSrc.includes("Era") &&
  adminPageSrc.includes("penting") &&
  adminPageSrc.includes("Kode negara"));
const timelineSrc = bacaRepo("src/app/timeline/page.tsx");
cek("timeline: filter ?cerita= + tautan kembali ke cerita",
  timelineSrc.includes("cerita") &&
  timelineSrc.includes("Kembali ke cerita") &&
  timelineSrc.includes("getEventIdDalamCerita"));
const sejarahPageSrc = bacaRepo("src/app/sejarah/page.tsx");
cek("halaman /sejarah: Hari ini dalam sejarah + filter tahun/era/penting",
  sejarahPageSrc.includes("Hari ini dalam sejarah") &&
  sejarahPageSrc.includes("getHariIniDalamSejarah") &&
  sejarahPageSrc.includes("Hanya yang penting"));
cek("halaman /cerita: daftar + EmptyState jujur",
  bacaRepo("src/app/cerita/page.tsx").includes("Belum ada cerita yang diterbitkan"));
cek("komponen KartuCerita + KronologiCerita ada",
  bacaRepo("src/components/cerita/KartuCerita.tsx").includes("TombolIkutiCerita") &&
  bacaRepo("src/components/cerita/KronologiCerita.tsx").includes("Lihat di Timeline"));

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
if (gagal > 0) {
  console.log("HASIL: ADA KEGAGALAN");
  process.exit(1);
}
