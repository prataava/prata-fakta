// Uji INTEGRASI remediasi Gelombang 1 — RPC v9 ASLI + logika tampilan.
// Menutup celah antara dua baterai: uji-remediasi-multisource.mjs
// menguji RPC DDL test-lokal (plpgsql) + logika murni, sedangkan
// uji-fase8-gel1.mjs menguji RPC v9 ASLI (SQL recursive CTE) saja.
// Skrip ini memakai RPC v9 ASLI (migrasi v1–v9) pada seed Kasus
// X/Y yang sama, lalu mengalirkan baris RPC itu ke fungsi murni
// hitungBobotPerbandingan dari src/lib/data.ts — membuktikan
// ujung-ke-ujung bahwa salinan 3x TAMPIL 1 independen dan liputan
// independen 3x TAMPIL 3, dengan RPC produksi (bukan DDL uji).
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

let ok = await jalankan("v1", baca("20261116_pf_v1_foundation.sql"));
if (ok) ok = await jalankan("v2", baca("20261116_pf_v2_articles.sql"));
if (ok) ok = await jalankan("v3", baca("20261116_pf_v3_ingestion.sql"));
if (ok) ok = await jalankan("v4", baca("20261116_pf_v4_ai.sql"));
if (ok) ok = await jalankan("v5", baca("20261116_pf_v5_editorial.sql"));
if (ok) ok = await jalankan("v6", baca("20261116_pf_v6_advanced.sql"));
if (ok) ok = await jalankan("v7 putaran 1", baca("20261116_pf_v7_quiz_scores.sql"));
if (ok) ok = await jalankan("v7 putaran 2 (idempotensi)", baca("20261116_pf_v7_quiz_scores.sql"));
if (ok) ok = await jalankan("v8 putaran 1", baca("20261116_pf_v8_expansion.sql"));
if (ok) ok = await jalankan("v8 putaran 2 (idempotensi)", baca("20261116_pf_v8_expansion.sql"));
if (ok) ok = await jalankan("v9 putaran 1", baca("20261116_pf_v9_grants.sql"));
if (ok) ok = await jalankan("v9 putaran 2 (idempotensi)", baca("20261116_pf_v9_grants.sql"));
if (!ok) {
  console.log("HASIL: MIGRASI GAGAL");
  process.exit(1);
}

// ---------- Seed Kasus X / Y (sama persis dengan uji-remediasi-multisource) ----------
const ART_X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ART_Y = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const S_ASLI = "11111111-1111-4111-8111-111111111101";
const S_SALIN1 = "11111111-1111-4111-8111-111111111102";
const S_SALIN2 = "11111111-1111-4111-8111-111111111103";
const S_MA = "11111111-1111-4111-8111-111111111104";
const S_MB = "11111111-1111-4111-8111-111111111105";
const S_MC = "11111111-1111-4111-8111-111111111106";
const I_ASLI = "22222222-2222-4222-8222-222222222201";
const I_S1 = "22222222-2222-4222-8222-222222222202";
const I_S2 = "22222222-2222-4222-8222-222222222203";
const I_YA = "22222222-2222-4222-8222-222222222205";
const I_YB = "22222222-2222-4222-8222-222222222206";
const I_YC = "22222222-2222-4222-8222-222222222207";
const K_X = "33333333-3333-4333-8333-333333333301";
const K_Y = "33333333-3333-4333-8333-333333333302";

const katSlug = (
  await db.query(
    `select slug from pf_categories where induk_id is null order by slug limit 1`,
  )
).rows[0].slug;

await db.exec(`
insert into public.pf_sources (id, nama, jenis, url, prioritas) values
  ('${S_ASLI}', 'Uji Asli', 'manual', 'https://uji.local/asli', 100),
  ('${S_SALIN1}', 'Uji Salin Satu', 'manual', 'https://uji.local/salin1', 60),
  ('${S_SALIN2}', 'Uji Salin Dua', 'manual', 'https://uji.local/salin2', 50),
  ('${S_MA}', 'Uji Mandiri A', 'manual', 'https://uji.local/mandiri-a', 100),
  ('${S_MB}', 'Uji Mandiri B', 'manual', 'https://uji.local/mandiri-b', 80),
  ('${S_MC}', 'Uji Mandiri C', 'manual', 'https://uji.local/mandiri-c', 60);
insert into public.pf_articles (id, slug, judul, ringkasan, isi, kategori_slug, status, sumber_url) values
  ('${ART_X}', 'uji-multisource-x', 'Artikel Uji X', '', '', '${katSlug}', 'terbit', 'https://uji.local/artikel-x'),
  ('${ART_Y}', 'uji-multisource-y', 'Artikel Uji Y', '', '', '${katSlug}', 'terbit', 'https://uji.local/artikel-y');
insert into public.pf_raw_items (id, sumber_id, url, hash_url, judul, hash_judul, status, disalin_dari_id, waktu_terbit_asli) values
  ('${I_ASLI}', '${S_ASLI}', 'https://uji.local/berita/asli', 'hash-x-asli', 'Pemerintah naikkan gaji guru 2026', 'hj-x-asli', 'baru', null, '2026-11-10 08:00:00+07'),
  ('${I_S1}', '${S_SALIN1}', 'https://uji.local/berita/salin1', 'hash-x-s1', 'Pemerintah naikkan gaji guru 2026', 'hj-x-s1', 'disalin_dari', '${I_ASLI}', '2026-11-10 09:00:00+07'),
  ('${I_S2}', '${S_SALIN2}', 'https://uji.local/berita/salin2', 'hash-x-s2', 'Pemerintah naikkan gaji guru 2026', 'hj-x-s2', 'disalin_dari', '${I_ASLI}', '2026-11-10 10:00:00+07'),
  ('${I_YA}', '${S_MA}', 'https://uji.local/berita/ya', 'hash-y-a', 'Pemerintah naikkan gaji guru 2026', 'hj-y-a', 'baru', null, '2026-11-10 08:00:00+07'),
  ('${I_YB}', '${S_MB}', 'https://uji.local/berita/yb', 'hash-y-b', 'Gaji guru naik, pemerintah siapkan anggaran baru', 'hj-y-b', 'baru', null, '2026-11-10 09:00:00+07'),
  ('${I_YC}', '${S_MC}', 'https://uji.local/berita/yc', 'hash-y-c', 'Kenaikan gaji guru disambut serikat pekerja', 'hj-y-c', 'baru', null, '2026-11-10 10:00:00+07');
insert into public.pf_article_sources (artikel_id, sumber_id, url, peran) values
  ('${ART_X}', '${S_ASLI}', 'https://uji.local/berita/asli', 'koroborasi'),
  ('${ART_X}', '${S_SALIN1}', 'https://uji.local/berita/salin1', 'koroborasi'),
  ('${ART_X}', '${S_SALIN2}', 'https://uji.local/berita/salin2', 'koroborasi'),
  ('${ART_Y}', '${S_MA}', 'https://uji.local/berita/ya', 'koroborasi'),
  ('${ART_Y}', '${S_MB}', 'https://uji.local/berita/yb', 'koroborasi'),
  ('${ART_Y}', '${S_MC}', 'https://uji.local/berita/yc', 'koroborasi');
insert into public.pf_claims (id, artikel_id, teks, jenis) values
  ('${K_X}', '${ART_X}', 'Gaji guru naik pada 2026', 'fakta'),
  ('${K_Y}', '${ART_Y}', 'Gaji guru naik pada 2026', 'fakta');
insert into public.pf_evidence (klaim_id, sumber_url, sumber_nama, arah, dibuat_pada) values
  ('${K_X}', 'https://uji.local/berita/asli', 'Uji Asli', 'mendukung', '2026-11-10 08:00:00+07'),
  ('${K_X}', 'https://uji.local/berita/salin1', 'Uji Salin Satu', 'mendukung', '2026-11-10 09:00:00+07'),
  ('${K_X}', 'https://uji.local/berita/salin2', 'Uji Salin Dua', 'mendukung', '2026-11-10 10:00:00+07'),
  ('${K_Y}', 'https://uji.local/berita/ya', 'Uji Mandiri A', 'mendukung', '2026-11-10 08:00:00+07'),
  ('${K_Y}', 'https://uji.local/berita/yb', 'Uji Mandiri B', 'mendukung', '2026-11-10 09:00:00+07'),
  ('${K_Y}', 'https://uji.local/berita/yc', 'Uji Mandiri C', 'mendukung', '2026-11-10 10:00:00+07');
`);

// ---------- (a) RPC v9 ASLI sebagai anon ----------
const panggilRpc = (artikelId, urls) =>
  sebagai("anon", `select * from public.pf_akar_salinan($1, $2)`, [artikelId, urls]);

const rx = (
  await panggilRpc(ART_X, [
    "https://uji.local/berita/asli",
    "https://uji.local/berita/salin1",
    "https://uji.local/berita/salin2",
  ])
).rows;
cek("INTEGRASI RPC v9 X: 3 baris untuk 3 URL", rx.length === 3, `${rx.length} baris`);
cek(
  "INTEGRASI RPC v9 X: 1 akar berbeda",
  new Set(rx.map((r) => r.akar_id)).size === 1,
);
cek("INTEGRASI RPC v9 X: akar = item asli", rx.every((r) => r.akar_id === I_ASLI));
cek(
  "INTEGRASI RPC v9 X: flag disalin [asli=false, salin1=true, salin2=true]",
  rx.find((r) => r.url === "https://uji.local/berita/asli").disalin === false &&
    rx.find((r) => r.url === "https://uji.local/berita/salin1").disalin === true &&
    rx.find((r) => r.url === "https://uji.local/berita/salin2").disalin === true,
);

const ry = (
  await panggilRpc(ART_Y, [
    "https://uji.local/berita/ya",
    "https://uji.local/berita/yb",
    "https://uji.local/berita/yc",
  ])
).rows;
cek("INTEGRASI RPC v9 Y: 3 baris untuk 3 URL", ry.length === 3, `${ry.length} baris`);
cek(
  "INTEGRASI RPC v9 Y: 3 akar berbeda",
  new Set(ry.map((r) => r.akar_id)).size === 3,
);
cek(
  "INTEGRASI RPC v9 Y: semua disalin=false",
  ry.every((r) => r.disalin === false),
);

// ---------- (b) Alirkan baris RPC v9 ASLI ke logika tampilan ----------
// Replika pemetaan getPerbandinganSumber: evidence -> kolom (URL
// persis lalu nama), akar dari baris RPC per URL.
const dataSrc = bacaRepo("src/lib/data.ts");
const analisisSrc = bacaRepo("src/lib/ai/source-analysis.ts");
const fnNormalisasi = /export function normalisasiJudul\([\s\S]*?\n\}/.exec(dataSrc)?.[0];
const fnKemiripan = /export function kemiripanJudul\([\s\S]*?\n\}/.exec(dataSrc)?.[0];
const fnHitung = /export function hitungBobotPerbandingan\([\s\S]*?\n\}/.exec(dataSrc)?.[0];
const fnTier = /export function tierDariPrioritas\([\s\S]*?\n\}/.exec(analisisSrc)?.[0];
const fnSkor = /export function skorKredibilitas\([\s\S]*?\n\}/.exec(analisisSrc)?.[0];
cek("hitungBobotPerbandingan + tier/skor dapat diekstrak", Boolean(fnHitung && fnTier && fnSkor));

let hitungBobotPerbandingan;
let tierDariPrioritas;
let skorKredibilitas;
if (fnNormalisasi && fnKemiripan && fnHitung && fnTier && fnSkor) {
  ({ hitungBobotPerbandingan } = new Function(
    transpileKeJs(
      `${fnNormalisasi.replace("export function", "function")}\n${fnKemiripan.replace("export function", "function")}\n${fnHitung.replace("export function", "function")}\nreturn { normalisasiJudul, kemiripanJudul, hitungBobotPerbandingan };`,
    ),
  )());
  ({ tierDariPrioritas, skorKredibilitas } = new Function(
    transpileKeJs(
      `${fnTier.replace("export function", "function")}\n${fnSkor.replace("export function", "function")}\nreturn { tierDariPrioritas, skorKredibilitas };`,
    ),
  )());
}

function tanggalKalender(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function hitungTampilan(artikelId, klaimId, sumberUrlUtama, rpcRows) {
  const tautan = (
    await db.query(
      `select id, url from public.pf_article_sources where artikel_id = $1 order by url`,
      [artikelId],
    )
  ).rows;
  const kolom = [
    { id: `utama:${sumberUrlUtama}`, url: sumberUrlUtama, nama: sumberUrlUtama },
    ...tautan.map((t) => ({ id: String(t.id), url: t.url, nama: t.url })),
  ];
  const sumberPrioritas = new Map(
    (
      await db.query(`select id, prioritas from public.pf_sources`)
    ).rows.map((r) => [String(r.id), Number(r.prioritas)]),
  );
  const buktiDb = (
    await db.query(
      `select sumber_url, sumber_nama, arah, dibuat_pada, kutipan from public.pf_evidence where klaim_id = $1 order by dibuat_pada`,
      [klaimId],
    )
  ).rows;
  const rpcPerUrl = new Map(rpcRows.map((r) => [String(r.url), r]));
  const skorPerAkar = {};
  for (const r of rpcRows) {
    const kunci = r.akar_sumber_id ?? `item:${r.akar_id}`;
    if (!(kunci in skorPerAkar) && r.akar_sumber_id && sumberPrioritas.has(String(r.akar_sumber_id))) {
      skorPerAkar[kunci] = skorKredibilitas(
        tierDariPrioritas(sumberPrioritas.get(String(r.akar_sumber_id))),
      );
    }
  }
  const bukti = buktiDb.map((b) => {
    const kolomCocok =
      kolom.find((k) => k.url === b.sumber_url) ??
      kolom.find((k) => k.nama === b.sumber_nama) ??
      null;
    const rpc = rpcPerUrl.get(String(b.sumber_url)) ?? null;
    return {
      klaimId,
      sumberId: kolomCocok ? kolomCocok.id : null,
      arah: String(b.arah ?? "netral"),
      tanggal: tanggalKalender(b.dibuat_pada ? new Date(b.dibuat_pada).toISOString() : null),
      akarKunci: rpc ? (rpc.akar_sumber_id ?? `item:${rpc.akar_id}`) : null,
      disalin: rpc ? Boolean(rpc.disalin) : false,
      disalinDari: rpc && rpc.disalin ? rpc.akar_nama : null,
      akarJudul: rpc ? rpc.akar_judul : null,
      akarNama: rpc ? rpc.akar_nama : null,
      rantaiTerverifikasi: Boolean(rpc),
      sumberUrl: String(b.sumber_url ?? ""),
      sumberNama: b.sumber_nama ?? null,
      kutipan: b.kutipan ?? null,
    };
  });
  return hitungBobotPerbandingan(
    [klaimId],
    kolom.map((k) => k.id),
    bukti,
    skorPerAkar,
    `utama:${sumberUrlUtama}`,
  );
}

if (hitungBobotPerbandingan) {
  const hasilX = await hitungTampilan(ART_X, K_X, "https://uji.local/artikel-x", rx);
  const bobotX = hasilX.bobot[0];
  cek("INTEGRASI TAMPILAN X: independen = 1 (RPC v9 ASLI)", bobotX.independen === 1, `independen=${bobotX.independen}`);
  cek("INTEGRASI TAMPILAN X: salinan = 2", bobotX.salinan === 2, `salinan=${bobotX.salinan}`);
  cek("INTEGRASI TAMPILAN X: independenTerverifikasi = 1", bobotX.independenTerverifikasi === 1, `terverifikasi=${bobotX.independenTerverifikasi}`);
  cek("INTEGRASI TAMPILAN X: skorTertinggi = 90 (tier akar)", bobotX.skorTertinggi === 90, `skor=${bobotX.skorTertinggi}`);
  cek(
    "INTEGRASI TAMPILAN X: sel kolom bukti semua 'sama'",
    Object.values(hasilX.sel[K_X] ?? {}).filter((s) => s.status === "sama").length === 3,
  );

  const hasilY = await hitungTampilan(ART_Y, K_Y, "https://uji.local/artikel-y", ry);
  const bobotY = hasilY.bobot[0];
  cek("INTEGRASI TAMPILAN Y: independen = 3 (RPC v9 ASLI)", bobotY.independen === 3, `independen=${bobotY.independen}`);
  cek("INTEGRASI TAMPILAN Y: salinan = 0", bobotY.salinan === 0, `salinan=${bobotY.salinan}`);
  cek("INTEGRASI TAMPILAN Y: independenTerverifikasi = 3", bobotY.independenTerverifikasi === 3, `terverifikasi=${bobotY.independenTerverifikasi}`);
  cek(
    "INTEGRASI TAMPILAN: X (1) dibedakan dari Y (3) lewat RPC v9 ASLI",
    bobotX.independen === 1 && bobotY.independen === 3,
  );
}

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
if (gagal > 0) {
  console.log("HASIL: ADA KEGAGALAN");
  process.exit(1);
} else {
  console.log("HASIL: SEMUA LOLOS");
  process.exit(0);
}
