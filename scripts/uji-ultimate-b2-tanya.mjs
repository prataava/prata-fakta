// Uji Gelombang B2-E PRATA FAKTA (Ask the World draf + arsip + MyMemory) -> PGlite.
// Menerapkan v1–v13 SEKALI + DDL v14 INLINE DUA KALI (idempotensi),
// lalu memeriksa:
//   F1  susunDrafJawaban (murni): draf dibuat dari referensi nyata
//       (mock retrieval), draf TIDAK PERNAH dibuat tanpa referensi,
//       maks 3 referensi, draf <= 2000 karakter, ekstraktif.
//   F1  Route /api/tanya/draf (asersi sumber): memakai autentikasi
//       PemicuAi + limiter keras + cariKandidat + susunDrafJawaban;
//       HANYA menulis kolom draf — TIDAK PERNAH menulis jawaban /
//       status / publik (anti auto-publish, diverifikasi pola regex).
//       Simulasi SQL siklus draf: tulis draf -> status tetap
//       'menunggu', publik tetap false, jawaban resmi tetap NULL;
//       setujui (salin draf -> jawaban) -> 'terjawab'; tolak ->
//       draf bersih, status tetap 'menunggu'.
//   F1  Admin PATCH [id] (asersi sumber): aksi_draf setujui/tolak,
//       setujui wajib referensi, audit 'tanya.draf'; GET admin
//       memuat kolom draf; GET /api/tanya (pengguna) TIDAK
//       memuat draf (draf tidak bocor ke penanya).
//   F1  Workflow tanya-jawab-draf.yml: jadwal + endpoint + secret
//       + assert gagal; halaman admin punya tombol Setujui/Tolak/
//       Simpan edit draf.
//   F2  Policy arsip v13: ada di pg_policies (publik=true AND
//       status='terjawab'); anon HANYA melihat baris publik+
//       terjawab; pemilik melihat baris sendiri; route arsip via
//       session client, select tanpa user_id, filter di kode
//       cocok dengan policy.
//   G2  MyMemory: URL benar (q + langpair=en|id, tanpa kunci),
//       bagiSegmen <= 450 byte, mock fetch sukses -> terjemahan
//       + atribusi; 429 (HTTP maupun responseStatus) ->
//       kuota_habis; jaringan -> jaringan (retry); respons tak
//       valid -> respons_tidak_valid; timeout -> timeout; teks
//       kosong -> teks_kosong (fetch TIDAK dipanggil); multi
//       segmen digabung. TIDAK ADA panggilan API live di baterai
//       ini — semua lewat mock fetch.
//   G2  Pipeline (asersi sumber): langkah translation memakai
//       MyMemory hanya untuk judul Inggris, menyimpan draf
//       terpisah metadata.terjemahan.judul_id (teks asli tidak
//       ditimpa), gagal -> dilewati jujur.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// BATAS KEJUJURAN baterai ini (bukan klaim lebih):
// - Perilaku HTTP hidup route draf/admin TIDAK diuji (tidak ada
//   server jalan di sini); yang diuji: logika murni + simulasi
//   SQL atas kolom/status yang ditulis route + asersi sumber.
//   Verifikasi HTTP hidup tetap tugas tahap browser/koordinator.
// - MyMemory TIDAK dipanggil live; kualitas terjemahan nyata
//   (akurasi bahasa) tidak dinilai di sini — hanya kontrak
//   pemanggilan + penanganan gagal.
import fs from "node:fs";

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

async function jalankan(db, label, teks) {
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

async function sebagai(db, role, sql, params = []) {
  await db.query(`set role ${role}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.query("reset role");
  }
}

async function sebagaiUid(db, uid, role, sql, params = []) {
  await db.query(`select set_config('pf.uid_test', $1, false)`, [uid]);
  try {
    return await sebagai(db, role, sql, params);
  } finally {
    await db.query(`select set_config('pf.uid_test', '', false)`);
  }
}

async function hitungSebagai(db, role, sql, params = []) {
  const r = await sebagai(db, role, sql, params);
  return Number(r.rows[0]?.n ?? 0);
}

async function hitungSebagaiUid(db, uid, role, sql, params = []) {
  const r = await sebagaiUid(db, uid, role, sql, params);
  return Number(r.rows[0]?.n ?? 0);
}

// DDL v14 (B2-E, F1) — PERSIS seperti yang harus masuk migrasi
// 20261116_pf_v14_tanya_draf.sql (lihat laporan akhir B2-E).
// Kolom draf TERPISAH dari jawaban resmi; indeks parsial cocok
// dengan kueri job (/api/tanya/draf: status='menunggu' DAN
// jawaban_draf IS NULL, tertua dulu).
const DDL_V14 = `
alter table public.pf_questions
  add column if not exists jawaban_draf text;
alter table public.pf_questions
  add column if not exists referensi_draf jsonb not null default '[]';
alter table public.pf_questions
  add column if not exists draf_dibuat_pada timestamptz;
create index if not exists pf_questions_draf_menunggu_idx
  on public.pf_questions (dibuat_pada)
  where status = 'menunggu' and jawaban_draf is null;
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

const db = new PGlite();

// ---------- Setup auth + role (pola uji-ultimate-backend.mjs) ----------
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

// ---------- v1–v13 ----------
for (const nama of MIGRASI_V1_V13) {
  const ok = await jalankan(db, `migrasi ${nama}`, baca(nama));
  if (!ok) process.exit(1);
}

// ---------- DDL v14 inline, dua kali (idempotensi) ----------
{
  const ok1 = await jalankan(db, "DDL v14 (putaran 1)", DDL_V14);
  const ok2 = await jalankan(db, "DDL v14 (putaran 2, idempoten)", DDL_V14);
  if (!ok1 || !ok2) process.exit(1);
}

// ---------- Seed ----------
await db.query(
  `insert into auth.users (id, email) values ($1, 'a@uji.id'), ($2, 'b@uji.id')`,
  [UID_A, UID_B],
);
const qMenungguPublik = (
  await db.query(
    `insert into public.pf_questions (user_id, pertanyaan, status, publik)
     values ($1, 'Menunggu jawab?', 'menunggu', true) returning id`,
    [UID_A],
  )
).rows[0].id;
const qTerjawabPublik = (
  await db.query(
    `insert into public.pf_questions (user_id, pertanyaan, jawaban, status, publik)
     values ($1, 'Apa itu uji?', 'Ini jawaban.', 'terjawab', true) returning id`,
    [UID_A],
  )
).rows[0].id;
const qTerjawabPrivat = (
  await db.query(
    `insert into public.pf_questions (user_id, pertanyaan, jawaban, status, publik)
     values ($1, 'Privat terjawab?', 'Jawaban privat.', 'terjawab', false) returning id`,
    [UID_B],
  )
).rows[0].id;
const qMenungguPrivat = (
  await db.query(
    `insert into public.pf_questions (user_id, pertanyaan, status, publik)
     values ($1, 'Privat menunggu?', 'menunggu', false) returning id`,
    [UID_B],
  )
).rows[0].id;
console.log("OK: seed 2 pengguna + 4 pertanyaan");

// ============================================================
// F1 — susunDrafJawaban (murni, mock retrieval)
// ============================================================
const { susunDrafJawaban } = await import("../src/lib/ai/tanya-draf.ts");
const kandidatMock = [
  { judul: "Populasi Indonesia", ringkasan: "Populasi Indonesia mencapai 280 juta jiwa.", url: "/data", skor: 6 },
  { judul: "Inflasi 2026", ringkasan: "Inflasi tahunan tercatat 2,5 persen.", url: "/artikel/inflasi", skor: 3 },
  { judul: "Sejarah Nusantara", ringkasan: null, url: null, skor: 1 },
];
const draf1 = susunDrafJawaban(kandidatMock);
cek("F1 draf dibuat dari referensi nyata", draf1.dibuat === true && draf1.alasan === "ada_referensi");
cek("F1 draf memuat judul referensi", typeof draf1.draf === "string" && draf1.draf.includes("Populasi Indonesia"));
cek("F1 draf memuat ringkasan referensi (ekstraktif)", typeof draf1.draf === "string" && draf1.draf.includes("280 juta"));
cek("F1 draf memuat semua referensi", draf1.referensi.length === 3 && draf1.referensi[0].url === "/data");
cek("F1 draf ditandai DRAF menunggu review", typeof draf1.draf === "string" && draf1.draf.startsWith("DRAF"));
const drafKosong = susunDrafJawaban([]);
cek("F1 tanpa referensi -> TIDAK ada draf (tidak mengarang)", drafKosong.dibuat === false && drafKosong.draf === undefined && drafKosong.alasan === "tidak_ada_data");
const drafJudulKosong = susunDrafJawaban([{ judul: "   ", ringkasan: "isi", url: null, skor: 5 }]);
cek("F1 kandidat tanpa judul diabaikan -> tidak ada draf", drafJudulKosong.dibuat === false);
const banyak = Array.from({ length: 5 }, (_, i) => ({
  judul: `Judul ${i}`, ringkasan: `Ringkasan ${i}.`, url: `/x/${i}`, skor: 5 - i,
}));
const drafBanyak = susunDrafJawaban(banyak);
cek("F1 draf memakai maks 3 referensi", drafBanyak.referensi.length === 3);
const panjang = susunDrafJawaban([
  { judul: "Judul panjang", ringkasan: "kata ".repeat(500), url: null, skor: 9 },
]);
cek("F1 draf tidak melebihi 2000 karakter", typeof panjang.draf === "string" && panjang.draf.length <= 2000);

// ============================================================
// F2 — policy arsip v13 (verifikasi, bukan bangun ulang)
// ============================================================
const policy = await db.query(
  `select policyname, qual from pg_policies where schemaname='public' and tablename='pf_questions' and policyname='pf_questions arsip publik'`,
);
cek("F2 policy arsip publik ADA", policy.rows.length === 1, `dapat ${policy.rows.length}`);
const qual = String(policy.rows[0]?.qual ?? "");
cek("F2 policy mensyaratkan publik=true", /publik\s*=\s*true/.test(qual), qual);
cek("F2 policy mensyaratkan status='terjawab'", /status\s*=\s*'terjawab'/.test(qual), qual);
cek(
  "F2 anon HANYA melihat publik+terjawab (1 baris)",
  (await hitungSebagai(db, "anon", `select count(*)::int as n from public.pf_questions`)) === 1,
);
cek(
  "F2 anon melihat baris terjawab publik",
  (await hitungSebagai(db, "anon", `select count(*)::int as n from public.pf_questions where id=$1`, [qTerjawabPublik])) === 1,
);
cek(
  "F2 anon TIDAK melihat menunggu walau publik=true",
  (await hitungSebagai(db, "anon", `select count(*)::int as n from public.pf_questions where id=$1`, [qMenungguPublik])) === 0,
);
cek(
  "F2 anon TIDAK melihat terjawab privat",
  (await hitungSebagai(db, "anon", `select count(*)::int as n from public.pf_questions where id=$1`, [qTerjawabPrivat])) === 0,
);
cek(
  "F2 pemilik melihat baris sendiri (2 baris A)",
  (await hitungSebagaiUid(db, UID_A, "authenticated", `select count(*)::int as n from public.pf_questions`)) === 2,
);
const arsipRoute = bacaRepo("src/app/api/tanya/arsip/route.ts");
cek("F2 route arsip via session client (bukan service role)", arsipRoute.includes("createClient") && !arsipRoute.includes("createServiceClient"));
cek("F2 route arsip select TANPA user_id", !/select\([\s\S]*?user_id[\s\S]*?\)/.test(arsipRoute.split(".eq(")[0]) && !arsipRoute.includes('"id, user_id'));
cek("F2 route arsip filter publik=true + status terjawab", arsipRoute.includes('.eq("publik", true)') && arsipRoute.includes('.eq("status", "terjawab")'));

// ============================================================
// F1 — DDL v14 + simulasi siklus draf di SQL
// ============================================================
const kolomV14 = await db.query(
  `select column_name from information_schema.columns where table_schema='public' and table_name='pf_questions' and column_name in ('jawaban_draf','referensi_draf','draf_dibuat_pada')`,
);
cek("F1 kolom v14 ada (jawaban_draf, referensi_draf, draf_dibuat_pada)", kolomV14.rows.length === 3, `dapat ${kolomV14.rows.length}`);
const tipeDraf = await db.query(
  `select data_type from information_schema.columns where table_schema='public' and table_name='pf_questions' and column_name='referensi_draf'`,
);
cek("F1 referensi_draf bertipe jsonb", tipeDraf.rows[0]?.data_type === "jsonb");
const idxV14 = await db.query(
  `select indexname from pg_indexes where schemaname='public' and tablename='pf_questions' and indexname='pf_questions_draf_menunggu_idx'`,
);
cek("F1 indeks parsial draf menunggu ada", idxV14.rows.length === 1);
// Simulasi tulis draf (persis UPDATE di /api/tanya/draf): hanya kolom draf.
await db.query(
  `update public.pf_questions set jawaban_draf=$2, referensi_draf=$3, draf_dibuat_pada=now() where id=$1`,
  [qMenungguPrivat, "DRAF — Menurut Populasi Indonesia: Populasi Indonesia mencapai 280 juta jiwa.", JSON.stringify([{ judul: "Populasi Indonesia", url: "/data" }])],
);
const sesudahDraf = (await db.query(`select status, publik, jawaban, jawaban_draf from public.pf_questions where id=$1`, [qMenungguPrivat])).rows[0];
cek("F1 tulis draf: status TETAP 'menunggu'", sesudahDraf.status === "menunggu");
cek("F1 tulis draf: publik TETAP false", sesudahDraf.publik === false);
cek("F1 tulis draf: jawaban resmi TETAP NULL (tidak auto-publish)", sesudahDraf.jawaban === null);
cek("F1 tulis draf: jawaban_draf terisi", typeof sesudahDraf.jawaban_draf === "string" && sesudahDraf.jawaban_draf.includes("280 juta"));
cek(
  "F1 draf TIDAK tampil di arsip anon (masih menunggu)",
  (await hitungSebagai(db, "anon", `select count(*)::int as n from public.pf_questions where id=$1`, [qMenungguPrivat])) === 0,
);
// Simulasi setujui (persis PATCH aksi_draf=setujui): salin draf -> jawaban, bersihkan draf.
await db.query(
  `update public.pf_questions set jawaban=jawaban_draf, status='terjawab', dijawab_pada=now(), jawaban_draf=null, referensi_draf='[]', draf_dibuat_pada=null where id=$1`,
  [qMenungguPrivat],
);
const sesudahSetuju = (await db.query(`select status, jawaban, jawaban_draf from public.pf_questions where id=$1`, [qMenungguPrivat])).rows[0];
cek("F1 setujui: status menjadi 'terjawab'", sesudahSetuju.status === "terjawab");
cek("F1 setujui: jawaban resmi = isi draf", sesudahSetuju.jawaban === "DRAF — Menurut Populasi Indonesia: Populasi Indonesia mencapai 280 juta jiwa.");
cek("F1 setujui: draf dibersihkan sesudah disalin", sesudahSetuju.jawaban_draf === null);
// Simulasi tolak draf pada pertanyaan lain.
await db.query(
  `update public.pf_questions set jawaban_draf='DRAF contoh.', referensi_draf='[{"judul":"X","url":null}]', draf_dibuat_pada=now() where id=$1`,
  [qMenungguPublik],
);
await db.query(
  `update public.pf_questions set jawaban_draf=null, referensi_draf='[]', draf_dibuat_pada=null where id=$1`,
  [qMenungguPublik],
);
const sesudahTolak = (await db.query(`select status, jawaban, jawaban_draf from public.pf_questions where id=$1`, [qMenungguPublik])).rows[0];
cek("F1 tolak draf: status TETAP 'menunggu'", sesudahTolak.status === "menunggu");
cek("F1 tolak draf: jawaban tetap NULL, draf bersih", sesudahTolak.jawaban === null && sesudahTolak.jawaban_draf === null);

// ============================================================
// F1 — asersi sumber route draf / admin / workflow / halaman
// ============================================================
const drafRoute = bacaRepo("src/app/api/tanya/draf/route.ts");
cek("F1 route draf memakai autentikasiPemicuAi", drafRoute.includes("autentikasiPemicuAi"));
cek("F1 route draf memakai limiter keras (fail-closed)", drafRoute.includes("buatRateLimiterKeras"));
cek("F1 route draf memakai ulang cariKandidat", drafRoute.includes("cariKandidat"));
cek("F1 route draf memakai susunDrafJawaban", drafRoute.includes("susunDrafJawaban"));
cek("F1 route draf hanya memproses status menunggu tanpa draf", drafRoute.includes('.eq("status", "menunggu")') && drafRoute.includes('.is("jawaban_draf", null)'));
cek("F1 route draf menulis kolom jawaban_draf", drafRoute.includes("jawaban_draf: hasil.draf"));
cek("F1 route draf TIDAK PERNAH menulis status terjawab", !/status:\s*"terjawab"/.test(drafRoute));
cek("F1 route draf TIDAK PERNAH menulis kolom jawaban resmi", !/[^_]jawaban:\s*hasil\.draf/.test(drafRoute) && !drafRoute.includes("patch.jawaban"));
cek("F1 route draf TIDAK PERNAH menulis publik", !/publik:\s*(true|false)/.test(drafRoute));
const adminPatch = bacaRepo("src/app/api/admin/tanya/[id]/route.ts");
cek("F1 admin PATCH kenal aksi_draf setujui/tolak", adminPatch.includes('"setujui"') && adminPatch.includes('"tolak"'));
cek("F1 admin PATCH setujui wajib referensi", adminPatch.includes("Draf tanpa referensi tidak bisa disetujui"));
cek("F1 admin PATCH setujui membersihkan draf", adminPatch.includes("patch.jawaban_draf = null"));
cek("F1 admin PATCH audit draf memakai aksi tanya.jawab (union tertutup CHECK v11; tanpa aksi baru)", adminPatch.includes('aksi: "tanya.jawab"') && !/aksi:\s*"tanya\.draf"/.test(adminPatch) && adminPatch.includes("CHECK pf_audit_logs"));
const adminGet = bacaRepo("src/app/api/admin/tanya/route.ts");
cek("F1 admin GET memuat kolom draf", adminGet.includes("jawaban_draf") && adminGet.includes("referensi_draf"));
const tanyaRoute = bacaRepo("src/app/api/tanya/route.ts");
cek("F1 GET /api/tanya pengguna TIDAK membocorkan draf", !tanyaRoute.includes("jawaban_draf"));
// (Follow-up 5/6: cariKandidat pindah dari route /api/tanya ke
//  src/lib/tanya/retrieval.ts — dipakai ulang route + job draf.)
const retrievalTanya = bacaRepo("src/lib/tanya/retrieval.ts");
cek("F1 cariKandidat diekspor untuk dipakai ulang job draf", retrievalTanya.includes("export async function cariKandidat"));
cek("F1 job draf mengimpor cariKandidat dari lib", bacaRepo("src/app/api/tanya/draf/route.ts").includes('from "@/lib/tanya/retrieval"'));
const workflow = bacaRepo(".github/workflows/tanya-jawab-draf.yml");
cek("F1 workflow draf ada + jadwal harian", workflow.includes('cron: "0 1 * * *"'));
cek("F1 workflow memanggil POST /api/tanya/draf", workflow.includes("/api/tanya/draf"));
cek("F1 workflow memakai secret PF_AI_SECRET", workflow.includes("PF_AI_SECRET"));
cek("F1 workflow assert gagal > 0", workflow.includes("(.gagal // 0) == 0"));
cek("F1 workflow menegaskan larangan auto-publish di komentar", /TIDAK ADA AUTO-PUBLISH/.test(workflow));
const adminPage = bacaRepo("src/app/admin/tanya/page.tsx");
cek("F1 halaman admin punya tombol Setujui draf", adminPage.includes("Setujui draf"));
cek("F1 halaman admin punya tombol Tolak draf", adminPage.includes("Tolak draf"));
cek("F1 halaman admin punya Simpan edit draf", adminPage.includes("Simpan edit draf"));
cek("F1 halaman admin melabeli draf bukan jawaban resmi", adminPage.includes("bukan jawaban resmi"));

// ============================================================
// G2 — MyMemory (mock fetch; TANPA panggilan API live)
// ============================================================
const mymemory = await import("../src/lib/terjemahan/mymemory.ts");
const { terjemahkanEnKeId, bagiSegmen, buatUrlMyMemory } = mymemory;
cek("G2 konstanta batas anon 5000 karakter/hari", mymemory.BATAS_ANON_HARIAN_KARAKTER === 5000);
cek("G2 konstanta batas email 50000 karakter/hari", mymemory.BATAS_EMAIL_HARIAN_KARAKTER === 50000);
cek("G2 konstanta maks q 450 byte (di bawah batas resmi 500)", mymemory.MAKS_Q_BYTE === 450);
const urlMm = buatUrlMyMemory("Hello World!");
cek("G2 URL memakai host resmi MyMemory", urlMm.startsWith("https://api.mymemory.translated.net/get?"));
cek("G2 URL memakai langpair en|id", urlMm.includes("langpair=en%7Cid"));
cek("G2 URL tanpa kunci (tanpa key/api_key)", !/key=|api_key/.test(urlMm));
const urlMmEmail = buatUrlMyMemory("Hello World!", "a@uji.id");
cek("G2 URL dengan email memakai parameter de", urlMmEmail.includes("de=a%40uji.id"));
cek("G2 bagiSegmen: teks pendek = 1 segmen", bagiSegmen("Hello world.").length === 1);
const teksPanjang = "This is a long English sentence about the economy. ".repeat(12);
const segmenPanjang = bagiSegmen(teksPanjang);
cek("G2 bagiSegmen: teks panjang dipecah >1 segmen", segmenPanjang.length > 1);
cek(
  "G2 bagiSegmen: tiap segmen <= 450 byte",
  segmenPanjang.every((s) => new TextEncoder().encode(s).length <= 450),
);

function mockFetchRespons(badan, status = 200) {
  const panggilan = [];
  const fn = async (url) => {
    panggilan.push(String(url));
    return new Response(JSON.stringify(badan), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  fn.panggilan = panggilan;
  return fn;
}
const mockSukses = mockFetchRespons({
  responseData: { translatedText: "Halo dunia!" },
  responseStatus: 200,
  matches: [],
});
const hasilOk = await terjemahkanEnKeId("Hello world!", { fetchFn: mockSukses });
cek("G2 mock sukses -> ok + terjemahan", hasilOk.ok === true && hasilOk.terjemahan === "Halo dunia!");
cek("G2 mock sukses -> sumber MyMemory", hasilOk.ok === true && hasilOk.sumber === "MyMemory");
cek("G2 mock sukses -> atribusi MyMemory", hasilOk.ok === true && hasilOk.atribusi.includes("MyMemory"));
cek("G2 mock sukses -> fetch ke host MyMemory", mockSukses.panggilan.length === 1 && mockSukses.panggilan[0].includes("api.mymemory.translated.net/get"));
const mock429 = mockFetchRespons({ responseData: { translatedText: "" }, responseStatus: 429 }, 429);
const hasil429 = await terjemahkanEnKeId("Hello world!", { fetchFn: mock429 });
cek("G2 HTTP 429 -> kuota_habis (dilewati jujur)", hasil429.ok === false && hasil429.alasan === "kuota_habis");
const mock429Badan = mockFetchRespons({ responseData: {}, responseStatus: 429, responseDetails: "QUOTA EXCEEDED" }, 200);
const hasil429b = await terjemahkanEnKeId("Hello world!", { fetchFn: mock429Badan });
cek("G2 responseStatus 429 di badan -> kuota_habis", hasil429b.ok === false && hasil429b.alasan === "kuota_habis");
let panggilanJaringan = 0;
const mockJaringan = async () => {
  panggilanJaringan++;
  throw new Error("fetch failed");
};
const hasilJaringan = await terjemahkanEnKeId("Hello world!", { fetchFn: mockJaringan });
cek("G2 jaringan gagal -> jaringan (bukan karangan)", hasilJaringan.ok === false && hasilJaringan.alasan === "jaringan");
cek("G2 jaringan gagal -> dicoba ulang (3 percobaan)", panggilanJaringan === 3, `dapat ${panggilanJaringan}`);
const mockTakValid = mockFetchRespons({ responseData: {}, responseStatus: 200 }, 200);
const hasilTakValid = await terjemahkanEnKeId("Hello world!", { fetchFn: mockTakValid });
cek("G2 tanpa translatedText -> respons_tidak_valid", hasilTakValid.ok === false && hasilTakValid.alasan === "respons_tidak_valid");
const mockTimeout = async () => {
  const e = new Error("timeout");
  e.name = "TimeoutError";
  throw e;
};
const hasilTimeout = await terjemahkanEnKeId("Hello world!", { fetchFn: mockTimeout });
cek("G2 timeout -> timeout", hasilTimeout.ok === false && hasilTimeout.alasan === "timeout");
let panggilanKosong = 0;
const mockKosong = async () => {
  panggilanKosong++;
  return new Response("{}", { status: 200 });
};
const hasilKosong = await terjemahkanEnKeId("   ", { fetchFn: mockKosong });
cek("G2 teks kosong -> teks_kosong + fetch TIDAK dipanggil", hasilKosong.ok === false && hasilKosong.alasan === "teks_kosong" && panggilanKosong === 0);
let hitungSegmen = 0;
const mockMulti = async () => {
  hitungSegmen++;
  return new Response(JSON.stringify({ responseData: { translatedText: `Bagian ${hitungSegmen}.` }, responseStatus: 200 }), { status: 200 });
};
const hasilMulti = await terjemahkanEnKeId(teksPanjang, { fetchFn: mockMulti });
cek("G2 multi segmen digabung", hasilMulti.ok === true && hitungSegmen > 1 && hasilMulti.segmen === hitungSegmen && hasilMulti.terjemahan.includes("Bagian 1."));
const mmSource = bacaRepo("src/lib/terjemahan/mymemory.ts");
cek("G2 transport bawaan = fetchAman (SSRF-safe)", mmSource.includes("fetchAman"));
cek("G2 tidak ada kunci/secret di kode MyMemory", !/MYMEMORY_KEY|api_key|API_KEY/.test(mmSource));

// ============================================================
// G2 — periksaTerjemahan tetap heuristik + integrasi pipeline
// ============================================================
const { periksaTerjemahan } = await import("../src/lib/ai/translation.ts");
const cekId = periksaTerjemahan({ judul: "Berita hari ini", metadata: null }, { nama: "Kompas" });
cek("G2 sumber Indonesia -> tidak diperlukan (id)", cekId.bahasa === "id" && cekId.alasan === "tidak diperlukan");
const cekEn = periksaTerjemahan({ judul: "The president said the economy will grow after the election", metadata: null }, { nama: "BBC News" });
cek("G2 judul Inggris -> bahasa en, menunggu terjemahan", cekEn.bahasa === "en");
const pipeline = bacaRepo("src/lib/ai/pipeline.ts");
cek("G2 pipeline langkah translation memakai MyMemory", pipeline.includes("cobaTerjemahkanJudul"));
cek("G2 pipeline hanya menerjemahkan judul (bukan isi)", pipeline.includes("cobaTerjemahkanJudul(item.judul)"));
cek("G2 pipeline menyimpan draf terpisah metadata.terjemahan", pipeline.includes("terjemahan: {") && pipeline.includes("judul_id: hasil.terjemahan"));
cek("G2 pipeline gagal MyMemory -> dilewati jujur", pipeline.includes("terjemahan MyMemory gagal"));
cek("G2 pipeline TIDAK menimpa judul asli", !pipeline.includes("item.judul = hasil.terjemahan"));
const adapter = bacaRepo("src/lib/ai/supabase-adapter.ts");
cek("G2 adapter punya simpanMetadataItem", adapter.includes("simpanMetadataItem"));
const types = bacaRepo("src/lib/ai/types.ts");
cek("G2 interface AiAdapter punya simpanMetadataItem", types.includes("simpanMetadataItem("));

console.log(`\nRingkasan B2-E: ${lolos} lolos, ${gagal} gagal.`);
process.exit(gagal > 0 ? 1 : 0);
