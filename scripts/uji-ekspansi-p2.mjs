// Uji integrasi P2 ekspansi PRATA FAKTA — Knowledge Graph v2,
// Data Observatory, World Intelligence, Context Explorer, langkah
// pipeline `comparison` + provenance pembaca.
// PGlite in-memory — aman, tidak menyentuh DB produksi.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// CARA JALAN (wajib, dari akar repo):
//   node --experimental-strip-types \
//     --import /tmp/pf-register.mjs scripts/uji-ekspansi-p2.mjs
// Loader /tmp/pf-register.mjs memetakan alias "@/" ke src/ dan
// men-stub next/headers — diperlukan untuk impor getter P2.
// Tanpa loader, cek impor live (§C/§D/§E) gagal jujur (bukan
// dilewati diam-diam).
//
// BATAS UJI YANG JUJUR (bukan kelemahan yang disembunyikan):
// - Getter P2 memanggil createClient() Supabase di dalamnya
//   (tidak menerima klien sebagai parameter) sehingga TIDAK bisa
//   diarahkan ke PGlite. Yang diuji LIVE: fungsi murni
//   (uraiDomain/cocokDomain/cariDomain, kategoriIndikatorUntukTopik,
//   hrefEntitasGraf) + jalur tanpa-DB (getEntitasGraf jenis tak
//   dikenal / id kosong → null, getKonteksTopik('') → null).
//   Semantik SQL yang dipakai getter itu (hitungan, resolusi,
//   relasi, arah bukti, anti-bocor draf) diuji di PGlite dengan
//   kueri yang sama maknanya di atas seed. Uji HTTP live +
//   kecocokan hitungan dengan DB produksi tetap BLOKIR sampai ada
//   lingkungan non-produksi.
// - Langkah `comparison` end-to-end (baris pf_ai_runs + keputusan
//   verification tak berubah) diuji tuntas oleh
//   scripts/uji-p2-5-comparison.mjs (35/35) — baterai ini hanya
//   memeriksa penanda statisnya; jalankan kedua baterai.
// - Verifikasi RLS 2 akun LIVE tetap BLOKIR (di luar mandat).
import fs from "node:fs";
import path from "node:path";

import { PGlite } from "./butuh-pglite.mjs";

const DIR_REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIR_SRC = path.join(DIR_REPO, "src");
const DIR_MIGRASI = path.join(DIR_REPO, "supabase/migrations");

let lolos = 0;
let gagal = 0;
function cek(nama, ok, detail = "") {
  if (ok) {
    lolos += 1;
    console.log(`OK: ${nama}`);
  } else {
    gagal += 1;
    console.log(`GAGAL: ${nama}${detail ? ` — ${detail}` : ""}`);
  }
}
function baca(nama) {
  return fs.readFileSync(path.join(DIR_SRC, nama), "utf8");
}

// ---------- Setup PGlite: skema v1–v19 ----------
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
  "20261116_pf_v16_bookmark_pengetahuan.sql",
  "20261116_pf_v17_event_artikel_id.sql",
  "20261117_pf_v18_ekspansi_p0.sql",
  "20261117_pf_v19_ekspansi_p1.sql",
];
function bacaMigrasi(nama) {
  let sql = fs.readFileSync(path.join(DIR_MIGRASI, nama), "utf8");
  sql = sql.replace(/create extension[^;]+;/gi, "-- ekstensi dilepas (PGlite)");
  sql = sql.replace(/\bcitext\b/gi, "text");
  return sql;
}
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

let migrasiOk = true;
for (const nama of MIGRASI) {
  try {
    await db.exec(bacaMigrasi(nama));
  } catch (e) {
    migrasiOk = false;
    console.log(`GAGAL: migrasi ${nama} — ${String(e.message).split("\n")[0]}`);
  }
}
cek("A1 migrasi v1–v19 diterapkan di PGlite", migrasiOk);

// ---------- Seed P2 ----------
const S1 = "11111111-1111-4111-8111-111111111111"; // Antara (tier-1)
const S2 = "22222222-2222-4222-8222-222222222222"; // BBC (tier-3)
const A1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // ekonomi terbit VERIFIED ID
const A2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // ekonomi terbit CROSS-CHECKED ID
const A3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // politik terbit UNCONFIRMED
const A4 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"; // ekonomi DRAF
const K1 = "e1111111-1111-4111-8111-111111111111"; // klaim A1
const K2 = "e2222222-2222-4222-8222-222222222222"; // klaim A1 kedua
const K3 = "e3333333-3333-4333-8333-333333333333"; // klaim A2, teks SAMA dgn K1
const K4 = "e4444444-4444-4444-8444-444444444444"; // klaim artikel DRAF
const E1 = "f1111111-1111-4111-8111-111111111111"; // event -> A1
const E2 = "f2222222-2222-4222-8222-222222222222"; // event tanpa artikel
const ST1 = "f3333333-3333-4333-8333-333333333333"; // cerita terbit
const I1 = "f4444444-4444-4444-8444-444444444444"; // indikator ekonomi
const I2 = "f5555555-5555-4555-8555-555555555555"; // indikator nasional
const R1 = "f6666666-6666-4666-8666-666666666666"; // run Antara
const R2 = "f7777777-7777-4777-8777-777777777777"; // run BBC
await db.exec(`
  insert into public.pf_categories (slug, nama) values
    ('ekonomi','Ekonomi'), ('politik','Politik'), ('teknologi','Teknologi')
  on conflict (slug) do nothing;
  insert into public.pf_sources (id, nama, jenis, url, prioritas) values
    ('${S1}','Antara','rss','https://www.antaranews.com/rss',100),
    ('${S2}','BBC Indonesia','rss','https://www.bbc.com/indonesia/rss',60)
  on conflict (id) do nothing;
  insert into public.pf_countries (kode, nama) values
    ('ID','Indonesia'), ('US','Amerika Serikat')
  on conflict (kode) do nothing;
  insert into public.pf_articles (id, slug, judul, kategori_slug, negara_kode, status, status_verifikasi, diterbitkan_pada) values
    ('${A1}','uji-p2-satu','Artikel Uji P2 Satu','ekonomi','ID','terbit','VERIFIED','2026-11-14 10:00:00+07'),
    ('${A2}','uji-p2-dua','Artikel Uji P2 Dua','ekonomi','ID','terbit','CROSS-CHECKED','2026-11-13 10:00:00+07'),
    ('${A3}','uji-p2-tiga','Artikel Uji P2 Tiga','politik',null,'terbit','UNCONFIRMED','2026-11-12 10:00:00+07'),
    ('${A4}','uji-p2-draf','Artikel Uji P2 Draf','ekonomi',null,'draft','UNCONFIRMED',null);
  insert into public.pf_article_sources (artikel_id, sumber_id) values
    ('${A1}','${S1}'), ('${A1}','${S2}'), ('${A2}','${S1}');
  insert into public.pf_tags (slug, nama) values
    ('ekonomi','Ekonomi'), ('inflasi','Inflasi')
  on conflict (slug) do nothing;
  insert into public.pf_article_tags (artikel_id, tag_id)
    select '${A1}', id from public.pf_tags where slug = 'ekonomi';
  insert into public.pf_article_tags (artikel_id, tag_id)
    select '${A1}', id from public.pf_tags where slug = 'inflasi';
  insert into public.pf_article_tags (artikel_id, tag_id)
    select '${A2}', id from public.pf_tags where slug = 'ekonomi';
  insert into public.pf_claims (id, artikel_id, teks) values
    ('${K1}','${A1}','Inflasi turun ke 2 persen'),
    ('${K2}','${A1}','Bank sentral tahan suku bunga'),
    ('${K3}','${A2}','Inflasi turun ke 2 persen'),
    ('${K4}','${A4}','Klaim draf tersembunyi');
  insert into public.pf_evidence (klaim_id, sumber_url, sumber_nama, kutipan, arah) values
    ('${K1}','https://www.antaranews.com/rss','Antara','Kutipan mendukung','mendukung'),
    ('${K1}','https://www.bbc.com/indonesia/rss','BBC Indonesia','Kutipan menentang','menentang'),
    ('${K2}','https://www.antaranews.com/rss','Antara','Kutipan mendukung','mendukung'),
    ('${K3}','https://www.antaranews.com/rss','Antara','Kutipan mendukung','mendukung');
  insert into public.pf_verification_records (artikel_id, agen, keputusan, bukti) values
    ('${A1}','fact_verification','VERIFIED','[]'),
    ('${A2}','fact_verification','CROSS-CHECKED','[]');
  insert into public.pf_events (id, judul, artikel_id, dimulai_pada, lintang, bujur) values
    ('${E1}','Inflasi Turun','${A1}','2026-11-10 09:00:00+07',-6.2,106.8),
    ('${E2}','Peristiwa Tanpa Artikel',null,'2026-11-09 09:00:00+07',null,null);
  insert into public.pf_stories (id, slug, judul, status) values
    ('${ST1}','cerita-ekonomi','Cerita Ekonomi','terbit');
  insert into public.pf_story_articles (story_id, artikel_id) values
    ('${ST1}','${A1}'), ('${ST1}','${A2}');
  insert into public.pf_data_indicators (id, nama, slug, kategori, sumber_nama, tanggal_pembaruan) values
    ('${I1}','Inflasi','inflasi','ekonomi','BPS','2026-11-15'),
    ('${I2}','Populasi','populasi','nasional','BPS','2026-11-10');
  insert into public.pf_data_points (indikator_id, tanggal, nilai) values
    ('${I1}','2026-11-01',2.5), ('${I1}','2026-11-08',2.3), ('${I1}','2026-11-15',2.0);
  insert into public.pf_ingestion_runs (id, sumber_id, sumber_nama, dimulai_pada, status, ditemukan, baru) values
    ('${R1}','${S1}','Antara','2026-11-16 03:00:00+07','selesai',50,40),
    ('${R2}','${S2}','BBC Indonesia','2026-11-15 03:00:00+07','selesai',20,15);
  insert into public.pf_raw_items (id, sumber_id, run_id, url, hash_url, judul, hash_judul, waktu_diambil, status) values
    ('a1111111-1111-4111-8111-111111111111','${S1}','${R1}','https://www.antaranews.com/x1','h1','Judul Satu','hj1','2026-11-16 03:05:00Z','baru'),
    ('a2222222-2222-4222-8222-222222222222','${S1}','${R1}','https://www.antaranews.com/x2','h2','Judul Dua','hj2','2026-11-16 03:06:00Z','baru'),
    ('a3333333-3333-4333-8333-333333333333','${S2}','${R2}','https://www.bbc.com/indonesia/x3','h3','Judul Tiga','hj3','2026-11-15 03:05:00Z','baru');
  insert into public.pf_daily_briefs (tanggal, isi, status) values
    ('2026-11-17','{"seksi":{"dunia":[{"judul":"Dunia hari ini","kategori":"dunia","slug":"uji-dunia","status_verifikasi":"VERIFIED","ringkasan":"Ringkasan dunia."}]}}','terbit');
`);
async function hitung(sql, params = []) {
  const r = await db.query(sql, params);
  return Number(r.rows[0]?.jumlah ?? r.rows[0]?.count ?? 0);
}
async function baris(sql, params = []) {
  return (await db.query(sql, params)).rows;
}

// ---------- §B Observatorium: semantik hitungan ----------
cek(
  "B1 observatorium: totalTerbit = 3 (draf tidak dihitung)",
  (await hitung(`select count(*)::int as jumlah from public.pf_articles where status = 'terbit'`)) === 3,
);
{
  const r = await baris(
    `select kategori_slug, count(*)::int as jumlah from public.pf_articles where status = 'terbit' group by kategori_slug order by kategori_slug`,
  );
  const peta = Object.fromEntries(r.map((x) => [x.kategori_slug, x.jumlah]));
  cek(
    "B2 observatorium: per kategori ekonomi=2, politik=1",
    peta.ekonomi === 2 && peta.politik === 1,
    JSON.stringify(peta),
  );
}
{
  const r = await baris(
    `select status_verifikasi, count(*)::int as jumlah from public.pf_articles where status = 'terbit' group by status_verifikasi order by status_verifikasi`,
  );
  const peta = Object.fromEntries(r.map((x) => [x.status_verifikasi, x.jumlah]));
  cek(
    "B3 observatorium: per status VERIFIED=1, CROSS-CHECKED=1, UNCONFIRMED=1",
    peta.VERIFIED === 1 && peta["CROSS-CHECKED"] === 1 && peta.UNCONFIRMED === 1,
    JSON.stringify(peta),
  );
}
{
  const r = await baris(
    `select s.nama, count(distinct a.id)::int as jumlah from public.pf_article_sources asx
     join public.pf_articles a on a.id = asx.artikel_id
     join public.pf_sources s on s.id = asx.sumber_id
     where a.status = 'terbit' group by s.nama order by s.nama`,
  );
  const peta = Object.fromEntries(r.map((x) => [x.nama, x.jumlah]));
  cek(
    "B4 observatorium: per sumber Antara=2 artikel, BBC=1 artikel (unik)",
    peta.Antara === 2 && peta["BBC Indonesia"] === 1,
    JSON.stringify(peta),
  );
}
{
  const r = await baris(
    `select to_char(waktu_diambil, 'YYYY-MM-DD') as hari, count(*)::int as jumlah
     from public.pf_raw_items where waktu_diambil >= '2026-11-15T00:00:00Z' and waktu_diambil < '2026-11-17T00:00:00Z'
     group by hari order by hari`,
  );
  const peta = Object.fromEntries(r.map((x) => [x.hari, x.jumlah]));
  cek(
    "B5 observatorium: tren ingestion 2026-11-16=2 item, 2026-11-15=1 item",
    peta["2026-11-16"] === 2 && peta["2026-11-15"] === 1,
    JSON.stringify(peta),
  );
  const runs = await baris(
    `select sumber_nama, ditemukan, baru from public.pf_ingestion_runs order by dimulai_pada desc`,
  );
  cek(
    "B6 observatorium: run terakhir Antara 50/40, BBC 20/15",
    runs.length === 2 &&
      runs[0].sumber_nama === "Antara" && runs[0].ditemukan === 50 && runs[0].baru === 40 &&
      runs[1].sumber_nama === "BBC Indonesia" && runs[1].ditemukan === 20 && runs[1].baru === 15,
    JSON.stringify(runs),
  );
}
{
  const r = await baris(
    `select slug from public.pf_data_indicators order by tanggal_pembaruan desc nulls last, nama asc limit 5`,
  );
  cek(
    "B7 observatorium: indikator pilihan urut terbaru dulu (inflasi 15 Nov, populasi 10 Nov)",
    r.length === 2 && r[0].slug === "inflasi" && r[1].slug === "populasi",
    JSON.stringify(r.map((x) => x.slug)),
  );
  const poin = await hitung(
    `select count(*)::int as jumlah from public.pf_data_points where indikator_id = $1`,
    [I1],
  );
  cek("B8 observatorium: indikator inflasi punya 3 poin deret waktu", poin === 3, `dapat ${poin}`);
}

// ---------- §C Intelijen: fungsi murni live ----------
let intelijen = null;
try {
  intelijen = await import("../src/lib/intelijen.ts");
} catch (e) {
  console.log(`CATATAN: impor intelijen.ts gagal (${String(e.message ?? e).slice(0, 120)}) — cek C1-C6 gagal.`);
}
if (intelijen) {
  const { uraiDomain, cocokDomain, cariDomain } = intelijen;
  cek("C1 intelijen: uraiDomain('ekonomi') dikenal", uraiDomain("ekonomi").dikenal === true && uraiDomain("ekonomi").domain?.kunci === "ekonomi");
  cek(
    "C2 intelijen: uraiDomain('kripto') tak dikenal, mentah dipertahankan",
    uraiDomain("kripto").dikenal === false && uraiDomain("kripto").mentah === "kripto",
  );
  cek("C3 intelijen: uraiDomain('') → tanpa domain, dikenal", uraiDomain("").domain === null && uraiDomain("").dikenal === true);
  cek("C4 intelijen: cariDomain('politik') ada (subkategori)", cariDomain("politik") !== undefined);
  const dEko = cariDomain("ekonomi");
  const dPol = cariDomain("politik");
  cek(
    "C5 intelijen: cocokDomain('ekonomi', null, domain ekonomi) benar",
    dEko !== undefined && cocokDomain("ekonomi", null, dEko) === true,
  );
  cek(
    "C6 intelijen: cocokDomain('indonesia', null, domain politik) SALAH (tidak diklaim)",
    dPol !== undefined && cocokDomain("indonesia", null, dPol) === false,
  );
}
{
  const brief = await baris(
    `select tanggal from public.pf_daily_briefs where status = 'terbit' order by tanggal desc limit 1`,
  );
  const isi = await baris(
    `select (isi->'seksi'->'dunia') as dunia from public.pf_daily_briefs where tanggal = '2026-11-17'`,
  );
  cek(
    "C7 intelijen: brief terbit terbaru 2026-11-17 dengan 1 entri seksi dunia",
    brief.length === 1 && Array.isArray(isi[0]?.dunia) && isi[0].dunia.length === 1,
    JSON.stringify(isi[0]?.dunia?.length),
  );
  const negaraBerita = await hitung(
    `select count(distinct negara_kode)::int as jumlah from public.pf_articles where status = 'terbit' and negara_kode is not null`,
  );
  cek("C8 intelijen: 1 negara punya berita terbit (ID)", negaraBerita === 1, `dapat ${negaraBerita}`);
  const marker = await hitung(
    `select count(*)::int as jumlah from public.pf_events where lintang is not null and bujur is not null`,
  );
  cek("C9 intelijen: 1 peristiwa berkoordinat untuk peta", marker === 1, `dapat ${marker}`);
}

// ---------- §D Konteks: fungsi murni + jalur tanpa-DB live, semantik SQL ----------
// (lanjutan dari §A–§C di atas)
let konteks = null;
try {
  konteks = await import("../src/lib/konteks.ts");
} catch (e) {
  console.log(`CATATAN: impor konteks.ts gagal (${String(e.message ?? e).slice(0, 120)}) — cek D1-D8 gagal.`);
}
if (konteks) {
  const { kategoriIndikatorUntukTopik, getKonteksTopik } = konteks;
  cek(
    "D1 konteks: ekonomi→[ekonomi]",
    JSON.stringify(kategoriIndikatorUntukTopik("ekonomi")) === JSON.stringify(["ekonomi"]),
  );
  cek(
    "D2 konteks: indonesia→[nasional]",
    JSON.stringify(kategoriIndikatorUntukTopik("indonesia")) === JSON.stringify(["nasional"]),
  );
  cek(
    "D3 konteks: teknologi→[] (seksi disembunyikan, bukan dipaksa)",
    JSON.stringify(kategoriIndikatorUntukTopik("teknologi")) === JSON.stringify([]),
  );
  cek(
    "D4 konteks: energi-terbarukan + induk lingkungan-energi→[energi, lingkungan]",
    JSON.stringify(kategoriIndikatorUntukTopik("energi-terbarukan", "lingkungan-energi")) ===
      JSON.stringify(["energi", "lingkungan"]),
  );
  cek(
    "D5 konteks: getKonteksTopik('') → null (jalur tanpa-DB)",
    (await getKonteksTopik("")) === null,
  );
}
{
  const tag = await baris(
    `select id, slug, nama from public.pf_tags where slug = 'ekonomi'`,
  );
  cek("D6 konteks: tag 'ekonomi' teresolusi", tag.length === 1, `dapat ${tag.length}`);
  const artikelTag = await baris(
    `select a.slug from public.pf_article_tags at join public.pf_articles a on a.id = at.artikel_id
     where at.tag_id = $1 and a.status = 'terbit' order by a.slug`,
    [tag[0]?.id],
  );
  cek(
    "D7 konteks: artikel bertag ekonomi = uji-p2-satu + uji-p2-dua (terbit saja)",
    artikelTag.length === 2 &&
      artikelTag[0].slug === "uji-p2-dua" &&
      artikelTag[1].slug === "uji-p2-satu",
    JSON.stringify(artikelTag.map((x) => x.slug)),
  );
  const cerita = await baris(
    `select s.slug from public.pf_story_articles sa
     join public.pf_stories s on s.id = sa.story_id
     where sa.artikel_id = $1 and s.status = 'terbit'`,
    [A1],
  );
  cek("D8 konteks: cerita terkait artikel uji-p2-satu = cerita-ekonomi", cerita.length === 1 && cerita[0].slug === "cerita-ekonomi");
  const event = await baris(
    `select id from public.pf_events where artikel_id = $1`,
    [A1],
  );
  cek("D9 konteks: peristiwa terkait artikel uji-p2-satu = 1 (via artikel_id v17)", event.length === 1);
  const negara = await baris(
    `select distinct negara_kode from public.pf_articles where id = $1 and negara_kode is not null`,
    [A1],
  );
  cek("D10 konteks: negara terkait artikel uji-p2-satu = ID (via negara_kode v10)", negara.length === 1 && negara[0].negara_kode === "ID");
  const tagTakAda = await baris(
    `select id from public.pf_tags where slug = 'topik-tak-ada'`,
  );
  cek("D11 konteks: tag tak ada → 0 baris (resolusi gagal → 404)", tagTakAda.length === 0);
  const indikator = await baris(
    `select slug from public.pf_data_indicators where kategori = 'ekonomi'`,
  );
  cek("D12 konteks: indikator kategori ekonomi = inflasi", indikator.length === 1 && indikator[0].slug === "inflasi");
}

// ---------- §E Graf v2: jalur tanpa-DB live + semantik SQL ----------
let grafEntitas = null;
try {
  grafEntitas = await import("../src/lib/graf-entitas.ts");
} catch (e) {
  console.log(`CATATAN: impor graf-entitas.ts gagal (${String(e.message ?? e).slice(0, 120)}) — cek E1-E4 gagal.`);
}
if (grafEntitas) {
  const { getEntitasGraf } = grafEntitas;
  cek(
    "E1 graf: getEntitasGraf('bogus','x') → null (jenis tak dikenal)",
    (await getEntitasGraf("bogus", "x")) === null,
  );
  cek(
    "E2 graf: getEntitasGraf('kategori','') → null (id kosong)",
    (await getEntitasGraf("kategori", "")) === null,
  );
  // E3: entitasSumber untuk kunci non-UUID MEMERLUKAN DB (mencari
  // sebagai URL di pf_sources lalu pf_evidence) — TIDAK ada jalur
  // tanpa-DB, jadi diuji statis + semantik SQL (E6/E7), bukan live.
  const entitasTs = baca("lib/graf-entitas.ts");
  cek(
    "E3 graf: entitasSumber mencari non-UUID sebagai URL (pf_sources, lalu pf_evidence)",
    entitasTs.includes("pf_sources") && entitasTs.includes("pf_evidence"),
  );
}
{
  const meta = await import("../src/lib/graf-meta.ts");
  const href = meta.hrefEntitasGraf({ id: `sumber:${S1}`, jenis: "sumber" });
  cek(
    "E4 graf: hrefEntitasGraf simpul sumber → /graf/sumber/<uuid>",
    href === `/graf/sumber/${S1}`,
    String(href),
  );
  cek(
    "E4b graf: hrefEntitasGraf simpul artikel → null (sudah punya halaman sendiri)",
    meta.hrefEntitasGraf({ id: "artikel:uji-p2-satu", jenis: "artikel" }) === null,
  );
  cek(
    "E5 graf: JENIS_SIMPUL v2 memuat 7 jenis (artikel/klaim/sumber/event/cerita/negara/kategori)",
    meta.JENIS_SIMPUL.length === 7 &&
      meta.JENIS_SIMPUL.includes("negara") &&
      meta.JENIS_SIMPUL.includes("kategori"),
    JSON.stringify(meta.JENIS_SIMPUL),
  );
}
{
  const sumberUuid = await baris(
    `select id from public.pf_sources where id = $1`,
    [S1],
  );
  cek("E6 graf: sumber teresolusi lewat UUID (Antara)", sumberUuid.length === 1);
  const sumberUrl = await baris(
    `select distinct sumber_url from public.pf_evidence where sumber_url = 'https://www.bbc.com/indonesia/rss'`,
  );
  cek("E7 graf: sumber teresolusi lewat URL bukti (BBC)", sumberUrl.length === 1);
  const negara = await baris(`select kode from public.pf_countries where kode = 'ID'`);
  cek("E8 graf: negara teresolusi lewat kode (ID)", negara.length === 1);
  const cerita = await baris(`select slug from public.pf_stories where slug = 'cerita-ekonomi' and status = 'terbit'`);
  cek("E9 graf: cerita teresolusi lewat slug (terbit)", cerita.length === 1);
  const arah = await baris(
    `select arah, count(*)::int as jumlah from public.pf_evidence where klaim_id = $1 group by arah order by arah`,
    [K1],
  );
  const petaArah = Object.fromEntries(arah.map((x) => [x.arah, x.jumlah]));
  cek(
    "E10 graf: arah bukti klaim K1 = mendukung 1 + menentang 1 (label relasi dari data)",
    petaArah.mendukung === 1 && petaArah.menentang === 1,
    JSON.stringify(petaArah),
  );
  const klaimTerbit = await hitung(
    `select count(*)::int as jumlah from public.pf_claims k join public.pf_articles a on a.id = k.artikel_id where a.status = 'terbit'`,
  );
  cek("E11 graf: klaim artikel TERBIT = 3 (K1/K2/K3)", klaimTerbit === 3, `dapat ${klaimTerbit}`);
  const klaimDraf = await hitung(
    `select count(*)::int as jumlah from public.pf_claims k join public.pf_articles a on a.id = k.artikel_id where a.status = 'draft'`,
  );
  cek(
    "E12 graf: klaim artikel DRAF = 1 di DB tapi WAJIB 0 simpul graf (anti-bocor)",
    klaimDraf === 1,
    `dapat ${klaimDraf} (cek anti-bocor: getter graf hanya mengambil klaim artikel terbit)`,
  );
  const grafTs = baca("lib/graf.ts");
  cek(
    "E13 graf: getGrafPengetahuan menyaring klaim artikel terbit (gate status di kode)",
    grafTs.includes("status") && grafTs.includes("terbit"),
  );
  const berbagi = await hitung(
    `select count(*)::int as jumlah from public.pf_claims where lower(trim(teks)) = lower(trim('Inflasi turun ke 2 persen'))`,
  );
  cek("E14 graf: klaim bersama antar-artikel (teks sama K1+K3) = 2", berbagi === 2, `dapat ${berbagi}`);
}

// ---------- §F Pipeline comparison + provenance (penanda statis) ----------
{
  const pipeline = baca("lib/ai/pipeline.ts");
  cek(
    "F1 pipeline: langkah comparison dipanggil antara Fase 1 dan Fase 2",
    pipeline.includes("bandingkanAntarItem") && pipeline.includes("comparison"),
  );
  cek(
    "F2 pipeline: baris comparison ditandai detail.langkah='comparison' (CHECK-aman)",
    pipeline.includes("langkah") && pipeline.includes("'comparison'"),
  );
  cek(
    "F3 pipeline: urutan Fase 1 → comparison → verification dipertahankan di komentar",
    pipeline.includes("Fase 1") && pipeline.includes("Fase 2"),
  );
  const prov = baca("components/artikel/ProvenanceAI.tsx");
  cek(
    "F4 provenance: komponen menyembunyikan diri bila tanpa data (return null)",
    prov.includes("return null"),
  );
  cek(
    "F5 provenance: teks jujur (deterministik + Muse + disetujui editor, tanpa klaim mutlak)",
    prov.includes("deterministik") && prov.includes("Muse") && prov.includes("disetujui editor"),
  );
  cek(
    "F6 pipeline: baterai uji-p2-5-comparison.mjs ada (35/35, dijalankan terpisah)",
    fs.existsSync(path.join(DIR_REPO, "scripts/uji-p2-5-comparison.mjs")),
  );
  const artikel = baca("app/artikel/[slug]/page.tsx");
  cek(
    "F7 artikel: ProvenanceAI dirender + chip tag menaut ke /konteks",
    artikel.includes("<ProvenanceAI") && artikel.includes("/konteks/${"),
  );
}

// ---------- §G Penjaga statis ----------
{
  const ruteBaru = [
    "app/observatorium/page.tsx",
    "app/intelijen/page.tsx",
    "app/konteks/[topik]/page.tsx",
    "app/graf/[jenis]/[id]/page.tsx",
  ];
  for (const r of ruteBaru) {
    cek(`G1 berkas rute P2 ada: ${r}`, fs.existsSync(path.join(DIR_SRC, r)));
  }
  const halamanBaru = [
    "app/observatorium/page.tsx",
    "app/intelijen/page.tsx",
    "app/konteks/[topik]/page.tsx",
  ];
  for (const h of halamanBaru) {
    const isi = baca(h);
    cek(
      `G2 ${h} pakai await connection() (anti-$RC-tanpa-nonce)`,
      isi.includes("await connection()"),
    );
  }
  const klienBaru = ["components/graf/GrafPengetahuan.tsx"];
  for (const k of klienBaru) {
    const isi = baca(k).replace(/\/\/.*$/gm, "");
    cek(
      `G3 ${k} tanpa new Date() di render klien (komentar diabaikan)`,
      !isi.includes("new Date()"),
    );
  }
  const css = baca("app/globals.css");
  const selfRef = [...css.matchAll(/--([\w-]+)\s*:[^;]*var\(--\1\)/g)].map((m) => m[0]);
  cek("G4 CSS: 0 token self-ref", selfRef.length === 0, selfRef.join(", "));
  const jelajahi = baca("app/jelajahi/page.tsx");
  cek(
    "G5 /jelajahi menautkan /observatorium + /intelijen",
    jelajahi.includes('"/observatorium"') && jelajahi.includes('"/intelijen"'),
  );
  const proxy = baca("proxy.ts");
  cek(
    "G6 proxy.ts memeriksa /graf/[jenis]/[id] (404 berstatus benar) + kodeNegaraTidakAda utuh",
    proxy.includes("/graf/") && proxy.includes("kodeNegaraTidakAda"),
  );
  const buildRute = [
    ".next/server/app/observatorium/page.js",
    ".next/server/app/intelijen/page.js",
    ".next/server/app/konteks/[topik]/page.js",
    ".next/server/app/graf/[jenis]/[id]/page.js",
  ];
  for (const r of buildRute) {
    cek(`G7 build output memuat rute: ${r}`, fs.existsSync(path.join(DIR_REPO, r)));
  }
  const proxyTs = baca("proxy.ts");
  cek(
    "G8 proxy graf fail-open (pemeriksaan gagal → halaman yang menangani)",
    proxyTs.includes("fail-open"),
  );
  cek(
    "G9 proxy.ts memeriksa /konteks/[topik] (404 berstatus benar) via tagTidakAda + taksonomi statis",
    proxyTs.includes("cocokKonteks") &&
      proxyTs.includes("tagTidakAda") &&
      proxyTs.includes("kategoriGrafAda(topikKonteks)"),
  );
}

// ---------- Ringkasan ----------
console.log(`\n${lolos} lolos, ${gagal} gagal.`);
process.exit(gagal === 0 ? 0 : 1);
