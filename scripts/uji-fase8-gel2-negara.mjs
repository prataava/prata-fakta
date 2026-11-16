// Uji Country Profile (Area 11, Fase 8 Gelombang 2) PRATA FAKTA -> PGlite +
// pemeriksaan statis + uji fungsi murni.
// Menerapkan v1–v10 dua kali (idempotensi) TANPA blanket grant
// (pelajaran F4 — v9/v10 memberi GRANT eksplisit), lalu memeriksa:
//   - anon baca pf_countries / pf_country_facts (SELECT publik);
//   - anon INSERT negara/fakta DITOLAK (tak ada policy tulis);
//   - FK negara_kode menolak kode tak ada (artikel/event/indikator);
//   - getNegara-equivalent: berita terbit + event + indikator
//     terkait negara_kode kembali; artikel DRAF tidak bocor;
//   - unique kode + unique (country_id, kunci); hapus negara
//     cascade ke fakta.
// Fungsi murni lib/negara.ts (aturan angka-bersumber): kodeValid,
// angkaDariNilai, pisahkanFakta, validasiNegaraInput,
// validasiFaktaInput, kelompokkanFakta.
// Pemeriksaan statis: berkas Area 11 ada, proxy 404 negara,
// validasi topik negara di /api/topik, parameter topik GDELT.
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

async function hitungSebagai(role, sql, params = []) {
  const r = await sebagai(role, sql, params);
  return Number(r.rows[0]?.n ?? 0);
}

async function gagalKode(role, sql, kode, params = []) {
  try {
    await sebagai(role, sql, params);
    return false;
  } catch (e) {
    return e.code === kode || String(e.message).includes(kode);
  }
}

async function gagalSuperuser(sql, kode, params = []) {
  try {
    await db.query(sql, params);
    return false;
  } catch (e) {
    return e.code === kode || String(e.message).includes(kode);
  }
}

const hitung = async (sql, params = []) =>
  Number((await db.query(sql, params)).rows[0].n);

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
console.log("OK: setup auth + role");

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
    if (!ok) process.exit(1);
  }
}

cek(
  "jumlah tabel pf_* = 53",
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
  "jumlah policy pf_* = 106",
  (await hitung(
    `select count(*) n from pg_policies where schemaname='public' and tablename like 'pf_%'`,
  )) === 106,
);

// ---------- Seed (superuser, bypass RLS) ----------
// ID = Indonesia BERSUMBER (BPS) + populasi; SG = tanpa sumber
// (angkaTersedia=false di lib); MY = untuk uji cascade hapus.
const idID = (
  await db.query(
    `insert into public.pf_countries (kode, nama, ibu_kota, populasi, pdb, luas_km2, sumber, periode_referensi)
     values ('ID', 'Indonesia', 'Jakarta', 275000000, 1400000000000, 1904569, 'BPS', '2024')
     returning id`,
  )
).rows[0].id;
await db.query(
  `insert into public.pf_countries (kode, nama, ibu_kota)
   values ('SG', 'Singapura', 'Singapura')`,
);
const idMY = (
  await db.query(
    `insert into public.pf_countries (kode, nama, sumber) values ('MY', 'Malaysia', 'DOSM') returning id`,
  )
).rows[0].id;

// Fakta ID: numerik bersumber, numerik TANPA sumber, teks bersumber.
await db.query(
  `insert into public.pf_country_facts (country_id, kunci, nilai, satuan, sumber, periode)
   values ($1, 'jumlah_pulau', '17001', 'pulau', 'BPS', '2024')`,
  [idID],
);
await db.query(
  `insert into public.pf_country_facts (country_id, kunci, nilai, satuan)
   values ($1, 'angka_tanpa_sumber', '999', 'unit')`,
  [idID],
);
await db.query(
  `insert into public.pf_country_facts (country_id, kunci, nilai, sumber)
   values ($1, 'sistem_pemerintahan', 'Republik', 'BPS')`,
  [idID],
);
await db.query(
  `insert into public.pf_country_facts (country_id, kunci, nilai, satuan, sumber)
   values ($1, 'fakta_hapus', '1', 'unit', 'DOSM')`,
  [idMY],
);

// Artikel terbit + draf dengan negara_kode='ID'; event + indikator ID.
await db.query(
  `insert into public.pf_articles (slug, judul, kategori_slug, status, negara_kode)
   values ('art-id-terbit', 'Artikel Indonesia Terbit', 'indonesia', 'terbit', 'ID')`,
);
await db.query(
  `insert into public.pf_articles (slug, judul, kategori_slug, status, negara_kode)
   values ('art-id-draf', 'Artikel Indonesia Draf', 'indonesia', 'draft', 'ID')`,
);
await db.query(
  `insert into public.pf_events (judul, dimulai_pada, negara_kode, era, penting)
   values ('Peristiwa Indonesia', '2026-01-01 00:00:00+00', 'ID', 'modern', true)`,
);
await db.query(
  `insert into public.pf_data_indicators (nama, slug, kategori, sumber_nama, negara_kode)
   values ('Indikator Indonesia', 'indikator-indonesia', 'nasional', 'BPS', 'ID')`,
);

// ---------- Baca publik (anon) ----------
cek(
  "anon baca pf_countries = 3",
  (await hitungSebagai("anon", `select count(*) n from public.pf_countries`)) === 3,
);
cek(
  "anon baca pf_country_facts = 4",
  (await hitungSebagai("anon", `select count(*) n from public.pf_country_facts`)) === 4,
);
cek(
  "anon baca fakta Indonesia = 3",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_country_facts where country_id = $1`,
    [idID],
  )) === 3,
);

// ---------- Tulis publik DITOLAK ----------
cek(
  "anon INSERT pf_countries DITOLAK (42501, grant select saja)",
  await gagalKode(
    "anon",
    `insert into public.pf_countries (kode, nama) values ('TH', 'Thailand')`,
    "42501",
  ),
);
cek(
  "anon INSERT pf_country_facts DITOLAK (42501)",
  await gagalKode(
    "anon",
    `insert into public.pf_country_facts (country_id, kunci, nilai) values ($1, 'x', '1')`,
    "42501",
    [idID],
  ),
);
cek(
  "authenticated INSERT pf_countries DITOLAK (42501)",
  await gagalKode(
    "authenticated",
    `insert into public.pf_countries (kode, nama) values ('TH', 'Thailand')`,
    "42501",
  ),
);

// ---------- FK negara_kode ----------
cek(
  "artikel negara_kode='ID' diterima",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_articles where slug='art-id-terbit'`,
  )) === 1,
);
cek(
  "artikel negara_kode='ZZ' ditolak (FK 23503)",
  await gagalSuperuser(
    `insert into public.pf_articles (slug, judul, kategori_slug, status, negara_kode)
     values ('art-zz', 'Artikel ZZ', 'indonesia', 'terbit', 'ZZ')`,
    "23503",
  ),
);
cek(
  "event negara_kode='ZZ' ditolak (FK 23503)",
  await gagalSuperuser(
    `insert into public.pf_events (judul, dimulai_pada, negara_kode)
     values ('Event ZZ', now(), 'ZZ')`,
    "23503",
  ),
);
cek(
  "indikator negara_kode='ZZ' ditolak (FK 23503)",
  await gagalSuperuser(
    `insert into public.pf_data_indicators (nama, slug, kategori, sumber_nama, negara_kode)
     values ('Indikator ZZ', 'ind-zz', 'nasional', 'X', 'ZZ')`,
    "23503",
  ),
);

// ---------- getNegara-equivalent (kueri yang sama dengan lib) ----------
cek(
  "getNegara: berita terbit negara ID = 1",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_articles where status='terbit' and negara_kode='ID'`,
  )) === 1,
);
cek(
  "getNegara: artikel DRAF negara ID TIDAK terlihat anon (0)",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_articles where status='draft' and negara_kode='ID'`,
  )) === 0,
);
cek(
  "getNegara: event negara ID = 1",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_events where negara_kode='ID'`,
  )) === 1,
);
cek(
  "getNegara: indikator negara ID = 1",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_data_indicators where negara_kode='ID'`,
  )) === 1,
);
cek(
  "getNegara: negara SG tanpa berita/event/indikator (0/0/0)",
  (await hitungSebagai(
    "anon",
    `select count(*) n from public.pf_articles where status='terbit' and negara_kode='SG'`,
  )) === 0 &&
    (await hitungSebagai(
      "anon",
      `select count(*) n from public.pf_events where negara_kode='SG'`,
    )) === 0 &&
    (await hitungSebagai(
      "anon",
      `select count(*) n from public.pf_data_indicators where negara_kode='SG'`,
    )) === 0,
);
cek(
  "getNegaraDenganBerita-equivalent: hanya ID punya berita terbit",
  (
    await sebagai(
      "anon",
      `select distinct negara_kode from public.pf_articles where status='terbit' and negara_kode is not null`,
    )
  ).rows.map((r) => r.negara_kode).join(",") === "ID",
);

// ---------- Unique + cascade ----------
cek(
  "kode duplikat 'ID' ditolak (23505)",
  await gagalSuperuser(
    `insert into public.pf_countries (kode, nama) values ('ID', 'Indonesia Lagi')`,
    "23505",
  ),
);
cek(
  "fakta duplikat (country_id, kunci) ditolak (23505)",
  await gagalSuperuser(
    `insert into public.pf_country_facts (country_id, kunci, nilai) values ($1, 'jumlah_pulau', '2')`,
    "23505",
    [idID],
  ),
);
cek(
  "hapus negara MY cascade ke faktanya",
  (await (async () => {
    await db.query(`delete from public.pf_countries where id = $1`, [idMY]);
    return (
      (await hitung(
        `select count(*) n from public.pf_country_facts where country_id = $1`,
        [idMY],
      )) === 0
    );
  })()),
);
cek(
  "negara ID + SG tetap ada sesudah hapus MY",
  (await hitungSebagai("anon", `select count(*) n from public.pf_countries`)) === 2,
);

// ---------- Uji fungsi murni lib/negara.ts ----------
const negaraSrc = bacaRepo("src/lib/negara.ts");
function ekstrak(nama) {
  const pola = new RegExp(
    `(?:export )?function ${nama}\\([\\s\\S]*?\\n\\}`,
  );
  const m = pola.exec(negaraSrc);
  return m ? m[0] : null;
}
function ekstrakKonst(nama) {
  const pola = new RegExp(`const ${nama}[^;]*;`, "s");
  const m = pola.exec(negaraSrc);
  return m ? m[0] : null;
}
const potongan = [
  ekstrakKonst("POLA_KODE"),
  ekstrakKonst("POLA_UUID"),
  ekstrakKonst("KATA_KUNCI_KELOMPOK"),
  ekstrak("normalisasiKode"),
  ekstrak("kodeValid"),
  ekstrak("punyaSumber"),
  ekstrak("keAngka"),
  ekstrak("angkaDariNilai"),
  ekstrak("pisahkanFakta"),
  ekstrak("kelompokkanFakta"),
  ekstrak("teksValid"),
  ekstrak("angkaOpsionalValid"),
  ekstrak("validasiNegaraInput"),
  ekstrak("validasiFaktaInput"),
];
cek(
  "fungsi murni lib/negara.ts dapat diekstrak",
  potongan.every(Boolean),
  potongan.map((p, i) => (p ? "" : i)).filter((x) => x !== "").join(",") || "semua ada",
);
let murni = null;
if (potongan.every(Boolean)) {
  murni = new Function(
    transpileKeJs(
      `${potongan
        .join("\n")
        .replace(/export function/g, "function")
        .replace(/export const/g, "const")}
       return { normalisasiKode, kodeValid, punyaSumber, angkaDariNilai, pisahkanFakta, kelompokkanFakta, validasiNegaraInput, validasiFaktaInput };`,
    ),
  )();
}
if (murni) {
  cek("kodeValid: 'id' -> true", murni.kodeValid("id") === true);
  cek("kodeValid: 'IDN' -> false", murni.kodeValid("IDN") === false);
  cek("kodeValid: '1D' -> false", murni.kodeValid("1D") === false);
  cek(
    "normalisasiKode: ' id ' -> 'ID'",
    murni.normalisasiKode(" id ") === "ID",
  );
  cek("angkaDariNilai: '275,5' -> 275.5", murni.angkaDariNilai("275,5") === 275.5);
  cek(
    "angkaDariNilai: '1.234.567' -> 1234567",
    murni.angkaDariNilai("1.234.567") === 1234567,
  );
  cek(
    "angkaDariNilai: '1,234,567' -> 1234567",
    murni.angkaDariNilai("1,234,567") === 1234567,
  );
  cek("angkaDariNilai: '17001' -> 17001", murni.angkaDariNilai("17001") === 17001);
  cek("angkaDariNilai: 'Republik' -> null", murni.angkaDariNilai("Republik") === null);
  cek(
    "angkaDariNilai: 'lebih dari 17.000 pulau' -> null",
    murni.angkaDariNilai("lebih dari 17.000 pulau") === null,
  );

  // Aturan angka-bersumber: fakta numerik tanpa sumber TIDAK
  // masuk bernilai; fakta teks bersumber tetap bernilai (teks).
  const pisah = murni.pisahkanFakta([
    { id: "1", country_id: "c", kunci: "jumlah_pulau", nilai: "17001", satuan: "pulau", sumber: "BPS", periode: "2024" },
    { id: "2", country_id: "c", kunci: "angka_tanpa_sumber", nilai: "999", satuan: "unit", sumber: null, periode: null },
    { id: "3", country_id: "c", kunci: "sistem_pemerintahan", nilai: "Republik", satuan: null, sumber: "BPS", periode: null },
    { id: "4", country_id: "c", kunci: "teks_tanpa_sumber", nilai: "Sesuatu", satuan: null, sumber: null, periode: null },
  ]);
  cek(
    "pisahkanFakta: numerik bersumber -> bernilai",
    pisah.bernilai.some((f) => f.kunci === "jumlah_pulau"),
  );
  cek(
    "pisahkanFakta: numerik TANPA sumber -> tanpaSumber (tidak tampil sebagai angka)",
    pisah.tanpaSumber.some((f) => f.kunci === "angka_tanpa_sumber") &&
      !pisah.bernilai.some((f) => f.kunci === "angka_tanpa_sumber"),
  );
  cek(
    "pisahkanFakta: teks bersumber -> bernilai (sebagai teks)",
    pisah.bernilai.some((f) => f.kunci === "sistem_pemerintahan"),
  );
  cek(
    "pisahkanFakta: teks tanpa sumber -> tanpaSumber",
    pisah.tanpaSumber.some((f) => f.kunci === "teks_tanpa_sumber"),
  );

  cek(
    "validasiNegaraInput: angka tanpa sumber DITOLAK",
    murni.validasiNegaraInput({ kode: "ID", nama: "Indonesia", populasi: 275000000 }) !== null,
  );
  cek(
    "validasiNegaraInput: angka + sumber diterima",
    murni.validasiNegaraInput({ kode: "ID", nama: "Indonesia", populasi: 275000000, sumber: "BPS" }) === null,
  );
  cek(
    "validasiNegaraInput: tanpa angka, tanpa sumber diterima",
    murni.validasiNegaraInput({ kode: "SG", nama: "Singapura" }) === null,
  );
  cek(
    "validasiNegaraInput: kode 3 huruf ditolak",
    murni.validasiNegaraInput({ kode: "IDN", nama: "Indonesia" }) !== null,
  );
  cek(
    "validasiNegaraInput: populasi negatif ditolak",
    murni.validasiNegaraInput({ kode: "ID", nama: "Indonesia", populasi: -5, sumber: "BPS" }) !== null,
  );
  cek(
    "validasiFaktaInput: nilai angka tanpa sumber DITOLAK",
    murni.validasiFaktaInput({ country_id: "11111111-1111-1111-1111-111111111111", kunci: "x", nilai: "999" }) !== null,
  );
  cek(
    "validasiFaktaInput: nilai angka + sumber diterima",
    murni.validasiFaktaInput({ country_id: "11111111-1111-1111-1111-111111111111", kunci: "x", nilai: "999", sumber: "BPS" }) === null,
  );
  cek(
    "validasiFaktaInput: kunci kosong ditolak",
    murni.validasiFaktaInput({ country_id: "11111111-1111-1111-1111-111111111111", kunci: "", nilai: "x" }) !== null,
  );

  const kelompok = murni.kelompokkanFakta([
    { id: "1", country_id: "c", kunci: "jumlah_pulau", nilai: "17001", satuan: null, sumber: "BPS", periode: null },
    { id: "2", country_id: "c", kunci: "angka_literasi", nilai: "96", satuan: "%", sumber: "BPS", periode: null },
    { id: "3", country_id: "c", kunci: "konsumsi_listrik", nilai: "100", satuan: "TWh", sumber: "BPS", periode: null },
    { id: "4", country_id: "c", kunci: "anggota_asean", nilai: "Ya", satuan: null, sumber: "BPS", periode: null },
    { id: "5", country_id: "c", kunci: "makanan_khas", nilai: "Rendang", satuan: null, sumber: "BPS", periode: null },
  ]);
  cek("kelompokkanFakta: jumlah_pulau -> geografi", kelompok.geografi.some((f) => f.kunci === "jumlah_pulau"));
  cek("kelompokkanFakta: angka_literasi -> pendidikan", kelompok.pendidikan.some((f) => f.kunci === "angka_literasi"));
  cek("kelompokkanFakta: konsumsi_listrik -> energi", kelompok.energi.some((f) => f.kunci === "konsumsi_listrik"));
  cek("kelompokkanFakta: anggota_asean -> hubungan_internasional", kelompok.hubungan_internasional.some((f) => f.kunci === "anggota_asean"));
  cek("kelompokkanFakta: makanan_khas -> lainnya", kelompok.lainnya.some((f) => f.kunci === "makanan_khas"));
}

// ---------- Pemeriksaan statis: berkas Area 11 ----------
for (const relatif of [
  "src/lib/negara.ts",
  "src/app/negara/page.tsx",
  "src/app/negara/[kode]/page.tsx",
  "src/app/api/negara/route.ts",
  "src/app/api/negara/[kode]/route.ts",
  "src/app/admin/negara/page.tsx",
  "src/app/api/admin/negara/route.ts",
  "src/app/api/admin/negara/[id]/route.ts",
  "src/components/negara/KartuNegara.tsx",
  "src/components/negara/FaktaNegara.tsx",
  "src/components/negara/FormNegara.tsx",
  "src/components/negara/FormFaktaNegara.tsx",
]) {
  cek(`berkas ada: ${relatif}`, fs.existsSync(`${DIR_REPO}/${relatif}`));
}
cek(
  "lib/negara.ts mengekspor getDaftarNegara + getNegara + getNegaraDenganBerita",
  negaraSrc.includes("export async function getDaftarNegara") &&
    negaraSrc.includes("export async function getNegara(") &&
    negaraSrc.includes("export async function getNegaraDenganBerita"),
);
cek(
  "lib/negara.ts: getNegara hanya baca artikel terbit",
  negaraSrc.includes('.eq("status", "terbit")'),
);
cek(
  "halaman daftar: empty state jujur 'Belum ada profil negara'",
  bacaRepo("src/app/negara/page.tsx").includes("Belum ada profil negara — profil pertama (Indonesia) diisi editor lewat /admin"),
);
cek(
  "halaman detail: angka digerbang angkaTersedia",
  bacaRepo("src/app/negara/[kode]/page.tsx").includes("angkaTersedia"),
);
cek(
  "KartuNegara: populasi digerbang punyaSumber",
  bacaRepo("src/components/negara/KartuNegara.tsx").includes("punyaSumber"),
);
cek(
  "FaktaNegara: fakta tanpa sumber tidak tampil sebagai angka",
  bacaRepo("src/components/negara/FaktaNegara.tsx").includes("tidak ditampilkan"),
);
cek(
  "proxy: 404 nyata untuk /negara/[kode]",
  bacaRepo("src/proxy.ts").includes("kodeNegaraTidakAda") &&
    bacaRepo("src/proxy.ts").includes("/^\\/negara\\/([^/]+)$/"),
);
cek(
  "topik: POST negara divalidasi terhadap pf_countries",
  bacaRepo("src/app/api/topik/route.ts").includes("negaraAda") &&
    bacaRepo("src/app/api/topik/route.ts").includes("belum ada profilnya"),
);
cek(
  "topik: DELETE tidak divalidasi negaraAda (berhenti mengikuti tetap bisa)",
  !/DELETE[\\s\\S]*negaraAda/.test(bacaRepo("src/app/api/topik/route.ts")),
);
cek(
  "GDELT: topik jadi parameter (default tetap Indonesia)",
  bacaRepo("src/lib/ingestion/engine.ts").includes("topikGdelt") &&
    bacaRepo("src/lib/ingestion/engine.ts").includes('opsi.topikGdelt ?? "Indonesia"'),
);
cek(
  "GDELT: tidak ada lagi fetchGdelt(\"Indonesia\" hardcoded di engine",
  !bacaRepo("src/lib/ingestion/engine.ts").includes('fetchGdelt("Indonesia"'),
);
cek(
  "admin API negara: guard staf + service role",
  bacaRepo("src/app/api/admin/negara/route.ts").includes("autentikasiAdmin") &&
    bacaRepo("src/app/api/admin/negara/route.ts").includes("createServiceClient") &&
    bacaRepo("src/app/api/admin/negara/[id]/route.ts").includes("autentikasiAdmin"),
);
cek(
  "admin API [id]: tolak ubah kode negara",
  bacaRepo("src/app/api/admin/negara/[id]/route.ts").includes("Kode negara tidak bisa diubah"),
);
cek(
  "TIDAK ada seed angka di kode Area 11 (tanpa angka karangan)",
  !/275000000|1904569|17001/.test(
    bacaRepo("src/lib/negara.ts") +
      bacaRepo("src/components/negara/FormNegara.tsx") +
      bacaRepo("src/components/negara/FormFaktaNegara.tsx"),
  ),
);

// ---------- Ringkasan ----------
console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
if (gagal > 0) {
  console.log("HASIL: ADA KEGAGALAN");
  process.exit(1);
}
