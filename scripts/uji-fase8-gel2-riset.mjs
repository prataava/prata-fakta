// Uji Fase 8 Gelombang 2 — Reality Check + PRATA Research.
// PGlite + pemeriksaan statis (pola scripts/uji-fase8-gel1.mjs
// dan uji-fase8-gel2-migrasi.mjs):
//   - Terapkan v1–v10 dua kali (idempotensi) TANPA blanket grant
//     (pelajaran F4): 53 tabel / RLS 53/53 / policy 106.
//   - Riset/dokumen DRAF tersembunyi dari anon + authenticated
//     (hanya 'terbit' yang terlihat — RLS v10).
//   - Kolom v10 cakupan/frekuensi_update/negara_kode tersimpan,
//     default cakupan 'indonesia', CHECK + FK menolak nilai bogus.
//   - Dataset CSV: kueri yang dipakai route /api/riset/[slug]/dataset
//     (laporan terbit + indikator berslug sama -> titik nyata);
//     laporan tanpa indikator terkait -> 0 baris (404 jujur).
//   - Fungsi murni hitungPerbandinganPeriode + daftarTahun
//     (diekstrak dari src/lib/reality.ts, pola gel1).
//   - Pemeriksaan statis: berkas + ekspor + POST riset memaksa
//     'draft' + route dataset (header CSV, 404) + guard admin +
//     tanpa pembacaan jam dinding di komponen klien.
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

async function hitungSebagai(role, sql, params = []) {
  const r = await sebagai(role, sql, params);
  return Number(r.rows[0]?.n ?? 0);
}

const hitung = async (sql, params = []) =>
  Number((await db.query(sql, params)).rows[0].n);

async function gagalSuperuser(sql, kode, params = []) {
  try {
    await db.query(sql, params);
    return false;
  } catch (e) {
    return e.code === kode || String(e.message).includes(kode);
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

for (const putaran of [1, 2]) {
  for (const nama of MIGRASI) {
    const ok = await jalankan(`migrasi ${nama} (putaran ${putaran})`, baca(nama));
    if (!ok) {
      console.log("HASIL: MIGRASI GAGAL");
      process.exit(1);
    }
  }
}

cek(
  "tabel pf_* = 53",
  (await hitung(
    `select count(*) n from pg_tables where schemaname='public' and tablename like 'pf_%'`,
  )) === 53,
);
cek(
  "RLS 53/53",
  (await hitung(
    `select count(*) n from pg_tables where schemaname='public' and tablename like 'pf_%' and rowsecurity`,
  )) === 53,
);
cek(
  "policy total = 106",
  (await hitung(
    `select count(*) n from pg_policies where schemaname='public' and tablename like 'pf_%'`,
  )) === 106,
);

// ---------- Data benih (superuser, bypass RLS) ----------
await db.query(
  `insert into public.pf_countries (kode, nama) values ('ID', 'Indonesia')`,
);
const indPopulasiId = (
  await db.query(
    `insert into public.pf_data_indicators
       (nama, slug, kategori, satuan, sumber_nama, cakupan, frekuensi_update, negara_kode)
     values ('Populasi Uji', 'populasi-uji', 'penduduk', 'juta jiwa', 'BPS Uji', 'dunia', 'tahunan', 'ID')
     returning id`,
  )
).rows[0].id;
const indPdbId = (
  await db.query(
    `insert into public.pf_data_indicators
       (nama, slug, kategori, satuan, sumber_nama)
     values ('PDB Uji', 'pdb-uji', 'ekonomi', 'triliun rupiah', 'BPS Uji')
     returning id`,
  )
).rows[0].id;
await db.query(
  `insert into public.pf_data_points (indikator_id, tanggal, nilai) values
     ($1, '2024-06-30', 100), ($1, '2024-12-31', 110), ($1, '2025-06-30', 121)`,
  [indPopulasiId],
);
await db.query(
  `insert into public.pf_research_reports (slug, judul, ringkasan, status, tanggal)
   values ('populasi-uji', 'Laporan Populasi Uji', 'Ringkasan uji.', 'terbit', '2025-01-15')`,
);
await db.query(
  `insert into public.pf_research_reports (slug, judul, status)
   values ('riset-draf', 'Laporan Draf Uji', 'draft')`,
);
await db.query(
  `insert into public.pf_research_reports (slug, judul, status)
   values ('tanpa-indikator', 'Laporan Tanpa Indikator', 'terbit')`,
);
await db.query(
  `insert into public.pf_documents (jenis, judul, penerbit, tanggal, url_sumber, kategori, metadata, status)
   values ('statistik', 'Dokumen Statistik Uji', 'BPS Uji', '2025-01-10', 'https://contoh.id/dok', 'penduduk', '{"riset_slug":"populasi-uji"}'::jsonb, 'terbit')`,
);
await db.query(
  `insert into public.pf_documents (jenis, judul, status)
   values ('laporan', 'Dokumen Draf Uji', 'draft')`,
);

// ---------- RLS: draf tersembunyi ----------
cek(
  "riset: anon hanya melihat laporan terbit (2 dari 3)",
  (await hitungSebagai("anon", `select count(*) n from public.pf_research_reports`)) === 2,
);
cek(
  "riset: anon tidak melihat laporan draf",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_research_reports where slug = 'riset-draf'`,
  )) === 0,
);
cek(
  "riset: authenticated pun tidak melihat laporan draf",
  (await hitungSebagai(
    "authenticated",
    `select count(*) n from public.pf_research_reports where slug = 'riset-draf'`,
  )) === 0,
);
cek(
  "dokumen: anon hanya melihat dokumen terbit (1 dari 2)",
  (await hitungSebagai("anon", `select count(*) n from public.pf_documents`)) === 1,
);
cek(
  "dokumen: anon tidak melihat dokumen draf",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_documents where judul = 'Dokumen Draf Uji'`,
  )) === 0,
);

// ---------- Kolom v10 indikator ----------
const indPop = (
  await db.query(
    `select cakupan, frekuensi_update, negara_kode from public.pf_data_indicators where id = $1`,
    [indPopulasiId],
  )
).rows[0];
cek(
  "cakupan/frekuensi/negara_kode tersimpan",
  indPop.cakupan === "dunia" &&
    indPop.frekuensi_update === "tahunan" &&
    indPop.negara_kode === "ID",
  `${indPop.cakupan}/${indPop.frekuensi_update}/${indPop.negara_kode}`,
);
const indPdb = (
  await db.query(
    `select cakupan from public.pf_data_indicators where id = $1`,
    [indPdbId],
  )
).rows[0];
cek(
  "default cakupan = 'indonesia' bila tak diisi",
  indPdb.cakupan === "indonesia",
);
cek(
  "CHECK cakupan bogus ditolak",
  await gagalSuperuser(
    `insert into public.pf_data_indicators (nama, slug, kategori, sumber_nama, cakupan)
     values ('Bogus', 'bogus-1', 'ekonomi', 'X', 'bogus')`,
    "23514",
  ),
);
cek(
  "FK negara_kode bogus ditolak",
  await gagalSuperuser(
    `insert into public.pf_data_indicators (nama, slug, kategori, sumber_nama, negara_kode)
     values ('Bogus', 'bogus-2', 'ekonomi', 'X', 'ZZ')`,
    "23503",
  ),
);
cek(
  "CHECK jenis dokumen bogus ditolak",
  await gagalSuperuser(
    `insert into public.pf_documents (jenis, judul) values ('bogus', 'X')`,
    "23514",
  ),
);
cek(
  "CHECK status riset bogus ditolak",
  await gagalSuperuser(
    `insert into public.pf_research_reports (slug, judul, status) values ('bogus-3', 'X', 'bogus')`,
    "23514",
  ),
);
cek(
  "status riset default = 'draft'",
  (
    await db.query(
      `insert into public.pf_research_reports (slug, judul) values ('default-draft', 'X') returning status`,
    )
  ).rows[0].status === "draft",
);

// ---------- Dataset CSV: kueri yang dipakai route ----------
// (Route /api/riset/[slug]/dataset: laporan terbit -> indikator
// berslug sama -> pf_data_points tertua dulu.)
async function titikDataset(slug) {
  const r = await db.query(
    `select p.tanggal, p.nilai
       from public.pf_research_reports r
       join public.pf_data_indicators i on i.slug = r.slug
       join public.pf_data_points p on p.indikator_id = i.id
      where r.slug = $1 and r.status = 'terbit'
      order by p.tanggal asc`,
    [slug],
  );
  return r.rows;
}
const titikPopulasi = await titikDataset("populasi-uji");
// PGlite mengembalikan kolom date sebagai objek Date —
// normalisasi ke YYYY-MM-DD sebelum membandingkan.
const tgl = (t) =>
  t instanceof Date ? t.toISOString().slice(0, 10) : String(t);
cek(
  "dataset: laporan terbit + indikator berslug sama -> 3 titik nyata",
  titikPopulasi.length === 3,
  titikPopulasi.map((t) => `${tgl(t.tanggal)}=${t.nilai}`).join(", "),
);
cek(
  "dataset: titik tertua dulu + nilai benar",
  tgl(titikPopulasi[0]?.tanggal) === "2024-06-30" &&
    Number(titikPopulasi[0]?.nilai) === 100 &&
    tgl(titikPopulasi[2]?.tanggal) === "2025-06-30" &&
    Number(titikPopulasi[2]?.nilai) === 121,
);
cek(
  "dataset: laporan terbit tanpa indikator terkait -> 0 baris (404 jujur)",
  (await titikDataset("tanpa-indikator")).length === 0,
);
cek(
  "dataset: laporan draf -> 0 baris (404 jujur, draf tak punya dataset publik)",
  (await titikDataset("riset-draf")).length === 0,
);
cek(
  "dokumen terkait: metadata riset_slug cocok",
  (await hitung(
    `select count(*) n from public.pf_documents where metadata->>'riset_slug' = 'populasi-uji' and status = 'terbit'`,
  )) === 1,
);

// ---------- Uji fungsi murni: hitungPerbandinganPeriode ----------
const realitySrc = bacaRepo("src/lib/reality.ts");
const fnTitikTerakhir = /function titikTerakhirTahun\([\s\S]*?\n\}/.exec(realitySrc)?.[0];
const fnBanding = /export function hitungPerbandinganPeriode\([\s\S]*?\n\}/.exec(realitySrc)?.[0];
const fnDaftarTahun = /export function daftarTahun\([\s\S]*?\n\}/.exec(realitySrc)?.[0];
cek(
  "hitungPerbandinganPeriode + daftarTahun dapat diekstrak dari sumber",
  Boolean(fnTitikTerakhir && fnBanding && fnDaftarTahun),
);
if (fnTitikTerakhir && fnBanding && fnDaftarTahun) {
  const { hitungPerbandinganPeriode: banding, daftarTahun: tahun } =
    new Function(
      transpileKeJs(
        `${fnTitikTerakhir}\n${fnBanding.replace("export function", "function")}\n${fnDaftarTahun.replace("export function", "function")}\nreturn { hitungPerbandinganPeriode, daftarTahun };`,
      ),
    )();
  const poin = [
    { tanggal: "2025-06-30", nilai: 121 },
    { tanggal: "2024-06-30", nilai: 100 },
    { tanggal: "2024-12-31", nilai: 110 },
  ];
  const h = banding(poin, 2024, 2025);
  cek(
    "banding: nilai = titik TERAKHIR tiap tahun (2024 -> 110, 2025 -> 121)",
    h.cukup === true && h.nilaiA === 110 && h.nilaiB === 121,
    `A=${h.nilaiA} B=${h.nilaiB}`,
  );
  cek(
    "banding: selisih 11 + persen 10",
    h.selisih === 11 && Math.abs((h.persen ?? -1) - 10) < 1e-9,
    `selisih=${h.selisih} persen=${h.persen}`,
  );
  cek(
    "banding: input tak terurut tetap benar (diurutkan di dalam)",
    banding(poin, 2024, 2025).nilaiA === 110,
  );
  const kurang = banding([{ tanggal: "2025-01-01", nilai: 5 }], 2024, 2025);
  cek(
    "banding: <2 titik -> cukup=false + pesan jujur",
    kurang.cukup === false &&
      typeof kurang.alasan === "string" &&
      kurang.alasan.includes("Data belum cukup"),
    kurang.alasan ?? "",
  );
  cek(
    "banding: 0 titik -> cukup=false",
    banding([], 2024, 2025).cukup === false,
  );
  const hilang = banding(
    [
      { tanggal: "2024-12-31", nilai: 110 },
      { tanggal: "2024-06-30", nilai: 100 },
    ],
    2024,
    2026,
  );
  cek(
    "banding: tahun tanpa titik -> cukup=false + alasan menyebut tahun",
    hilang.cukup === false && (hilang.alasan ?? "").includes("2026"),
    hilang.alasan ?? "",
  );
  const nol = banding(
    [
      { tanggal: "2024-12-31", nilai: 0 },
      { tanggal: "2025-12-31", nilai: 5 },
    ],
    2024,
    2025,
  );
  cek(
    "banding: nilai awal 0 -> selisih 5, persen null (bukan karangan)",
    nol.cukup === true && nol.selisih === 5 && nol.persen === null,
  );
  cek(
    "daftarTahun: [2023, 2024, 2025] dari titik acak",
    JSON.stringify(
      tahun([
        { tanggal: "2025-01-01", nilai: 1 },
        { tanggal: "2023-01-01", nilai: 1 },
        { tanggal: "2024-01-01", nilai: 1 },
        { tanggal: "2024-06-01", nilai: 1 },
      ]),
    ) === "[2023,2024,2025]",
  );
}

// ---------- Pemeriksaan statis: berkas + ekspor ----------
for (const relatif of [
  "src/lib/reality.ts",
  "src/lib/riset.ts",
  "src/components/data/GrafikInteraktif.tsx",
  "src/components/data/PerbandinganPeriode.tsx",
  "src/components/data/FormIndikator.tsx",
  "src/components/data/FormTitikData.tsx",
  "src/components/riset/FormRiset.tsx",
  "src/components/riset/FormDokumen.tsx",
  "src/app/data/page.tsx",
  "src/app/riset/page.tsx",
  "src/app/riset/[slug]/page.tsx",
  "src/app/api/riset/route.ts",
  "src/app/api/dokumen/route.ts",
  "src/app/api/riset/[slug]/dataset/route.ts",
  "src/app/admin/riset/page.tsx",
  "src/app/api/admin/riset/route.ts",
  "src/app/api/admin/riset/[id]/route.ts",
  "src/app/admin/data/page.tsx",
  "src/app/api/admin/data/route.ts",
  "src/app/api/admin/data/[id]/route.ts",
]) {
  cek(`berkas ada: ${relatif}`, fs.existsSync(`${DIR_REPO}/${relatif}`));
}
cek(
  "reality.ts mengekspor hitungPerbandinganPeriode + daftarTahun (murni)",
  realitySrc.includes("export function hitungPerbandinganPeriode") &&
    realitySrc.includes("export function daftarTahun"),
);
cek(
  "reality.ts TANPA rujukan server (aman diimpor komponen klien)",
  !realitySrc.includes("supabase/server") &&
    !realitySrc.includes("supabase/service") &&
    !realitySrc.includes("await import") &&
    !realitySrc.includes("next/headers"),
);
cek(
  "akses data indikator tinggal di halaman server (bukan lib klien)",
  bacaRepo("src/app/data/page.tsx").includes(
    "async function getIndikatorReality",
  ) &&
    bacaRepo("src/app/admin/data/page.tsx").includes(
      "async function getIndikatorAdmin",
    ),
);
const risetSrc = bacaRepo("src/lib/riset.ts");
cek(
  "riset.ts mengekspor getDaftarRiset/getRiset/cariDokumen/getDokumenTerkait",
  risetSrc.includes("export async function getDaftarRiset") &&
    risetSrc.includes("export async function getRiset") &&
    risetSrc.includes("export async function cariDokumen") &&
    risetSrc.includes("export async function getDokumenTerkait"),
);
cek(
  "riset.ts: baca publik filter status='terbit' (draf tak bocor lewat lib)",
  (risetSrc.match(/\.eq\("status", "terbit"\)/g) ?? []).length >= 3,
);

// POST riset memaksa draft: sumber route memuat status "draft" pada
// insert riset + komentar penegasan, dan TIDAK membaca body.status
// untuk laporan (body.status hanya dipakai cabang dokumen).
const adminRisetSrc = bacaRepo("src/app/api/admin/riset/route.ts");
cek(
  "admin riset POST: status laporan dipaksa 'draft'",
  adminRisetSrc.includes('status: "draft",') &&
    adminRisetSrc.includes("Status awal SELALU 'draft'"),
);
cek(
  "admin riset POST: body.status TIDAK dipakai untuk laporan riset",
  !/tipe === "riset"[\s\S]*?body\.status/.test(
    adminRisetSrc.split("// ---- Dokumen ----")[0],
  ),
);

// Route dataset: header CSV + 404 jujur + baca pf_data_points.
const datasetSrc = bacaRepo("src/app/api/riset/[slug]/dataset/route.ts");
cek(
  "dataset route: Content-Type text/csv + Content-Disposition attachment",
  datasetSrc.includes('"Content-Type": "text/csv; charset=utf-8"') &&
    datasetSrc.includes('attachment; filename="dataset-'),
);
cek(
  "dataset route: 404 untuk laporan tak ada/draf + tanpa indikator + tanpa titik",
  (datasetSrc.match(/status: 404/g) ?? []).length >= 3,
);
cek(
  "dataset route: membaca pf_data_points nyata",
  datasetSrc.includes('from("pf_data_points")') &&
    datasetSrc.includes('order("tanggal", { ascending: true })'),
);

// Guard admin + service role di route admin.
for (const [relatif, nama] of [
  ["src/app/api/admin/riset/route.ts", "admin riset"],
  ["src/app/api/admin/riset/[id]/route.ts", "admin riset [id]"],
  ["src/app/api/admin/data/route.ts", "admin data"],
  ["src/app/api/admin/data/[id]/route.ts", "admin data [id]"],
]) {
  const src = bacaRepo(relatif);
  cek(
    `${nama}: memakai autentikasiAdmin + createServiceClient`,
    src.includes("autentikasiAdmin") && src.includes("createServiceClient"),
  );
}

// Komponen klien: tanpa pembacaan jam dinding (cacheComponents).
for (const relatif of [
  "src/components/data/GrafikInteraktif.tsx",
  "src/components/data/PerbandinganPeriode.tsx",
]) {
  const src = bacaRepo(relatif);
  cek(
    `${relatif}: tanpa new Date / Date.now`,
    !src.includes("new Date") && !src.includes("Date.now"),
  );
}

// /data memakai komponen interaktif + filter cakupan.
const dataPageSrc = bacaRepo("src/app/data/page.tsx");
cek(
  "/data: memakai GrafikInteraktif + PerbandinganPeriode",
  dataPageSrc.includes("<GrafikInteraktif") &&
    dataPageSrc.includes("<PerbandinganPeriode"),
);
cek(
  "/data: filter cakupan Indonesia/Dunia + kartu tema",
  dataPageSrc.includes('cakupan') &&
    dataPageSrc.includes("Indonesia") &&
    dataPageSrc.includes("Dunia"),
);
cek(
  "/data: menampilkan satuan + metodologi + sumber per indikator",
  dataPageSrc.includes("Metodologi:") &&
    dataPageSrc.includes("Sumber:") &&
    dataPageSrc.includes("Frekuensi pembaruan:"),
);

// Halaman riset: tautan dataset + pencarian dokumen.
const risetDetailSrc = bacaRepo("src/app/riset/[slug]/page.tsx");
cek(
  "detail riset: tautan dataset CSV bila ada indikator terkait",
  risetDetailSrc.includes("/api/riset/") &&
    risetDetailSrc.includes("/dataset"),
);
cek(
  "daftar riset: pencarian dokumen (q/jenis/kategori)",
  bacaRepo("src/app/riset/page.tsx").includes('name="q"') &&
    bacaRepo("src/app/riset/page.tsx").includes('name="jenis"') &&
    bacaRepo("src/app/riset/page.tsx").includes('name="kategori"'),
);

// Audit: aksi riset/data sudah ada di CHECK v9 (dipakai route admin).
cek(
  "CHECK audit v9 memuat aksi riset.buat/riset.ubah/riset.hapus + data.indikator/data.titik",
  baca("20261116_pf_v9_grants.sql").includes("'riset.buat', 'riset.ubah', 'riset.hapus'") &&
    baca("20261116_pf_v9_grants.sql").includes("'data.indikator', 'data.titik'"),
);

// ---------- Ringkasan ----------
console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
if (gagal > 0) {
  console.log("HASIL: ADA KEGAGALAN");
  process.exit(1);
}
