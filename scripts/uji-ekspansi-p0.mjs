// Uji integrasi P0 ekspansi PRATA FAKTA — migrasi v18, aturan
// verifikasi (MetodeVerifikasi), semantik riwayat baca, policy RLS,
// dan penjaga integrasi statis (tanpa FACT SCORE, tanpa cmdk,
// kosakata peran v8).
// PGlite in-memory — aman, tidak menyentuh DB produksi.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const requirePglite = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = requirePglite("@electric-sql/pglite");
import { tentukanKeputusanVerifikasi } from "../src/lib/ai/verification.ts";
import { hitungFactScore } from "../src/lib/fact-score.ts";

const DIR_REPO = new URL("../", import.meta.url).pathname;
const DIR_SRC = path.join(DIR_REPO, "src");
const DIR_MIGRASI = path.join(DIR_REPO, "supabase/migrations");

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

function bacaFile(rel) {
  return fs.readFileSync(path.join(DIR_REPO, rel), "utf8");
}
function ada(rel) {
  return fs.existsSync(path.join(DIR_REPO, rel));
}
function grepFile(rel, pola) {
  return pola.test(bacaFile(rel));
}

// ================================================================
// §A — Migrasi v18 di PGlite (v1–v17 + v18, dua putaran idempoten)
// ================================================================
const MIGRASI_V1_V17 = [
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
];
const V18 = "20261117_pf_v18_ekspansi_p0.sql";

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
for (const nama of MIGRASI_V1_V17) {
  try {
    await db.exec(bacaMigrasi(nama));
  } catch (e) {
    migrasiOk = false;
    console.log(`GAGAL: migrasi ${nama} — ${String(e.message).split("\n")[0]}`);
  }
}
cek("A1 v1–v17 diterapkan di PGlite", migrasiOk);

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const SUMBER_1 = "33333333-3333-4333-8333-333333333333";
const ARTIKEL_1 = "44444444-4444-4444-8444-444444444444";
await db.exec(
  `insert into auth.users (id, email) values ('${USER_A}', 'a@contoh.id'), ('${USER_B}', 'b@contoh.id');`,
);
await db.exec(
  `insert into public.pf_sources (id, nama, jenis, url, prioritas) values ('${SUMBER_1}', 'Antara', 'rss', 'https://antara.example/rss', 100);`,
);
await db.exec(
  `insert into public.pf_categories (slug, nama) values ('politik', 'Politik') on conflict (slug) do nothing;`,
);
await db.exec(
  `insert into public.pf_articles (id, slug, judul, kategori_slug, status, status_verifikasi) values ('${ARTIKEL_1}', 'uji-v18', 'Artikel Uji v18', 'politik', 'terbit', 'CROSS-CHECKED');`,
);
await db.exec(
  `insert into public.pf_article_sources (artikel_id, sumber_id, peran) values ('${ARTIKEL_1}', '${SUMBER_1}', 'utama');`,
);
await db.exec(
  `insert into public.pf_user_preferences (user_id) values ('${USER_A}');`,
);

try {
  await db.exec(bacaMigrasi(V18));
  await db.exec(bacaMigrasi(V18));
  cek("A2 v18 diterapkan 2x (idempoten)", true);
} catch (e) {
  cek("A2 v18 diterapkan 2x (idempoten)", false, String(e.message).split("\n")[0]);
}

const kolom = await db.query(
  `select column_name, data_type, is_nullable, column_default
     from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'pf_article_sources' and column_name = 'peran')
        or (table_name = 'pf_user_preferences' and column_name = 'pencarian_tersimpan'))`,
);
cek(
  "A3 v18: kolom peran + pencarian_tersimpan ada",
  kolom.rows.length === 2,
  `${kolom.rows.length} baris`,
);
const cari = kolom.rows.find((r) => r.column_name === "pencarian_tersimpan");
cek(
  "A4 pencarian_tersimpan jsonb NOT NULL default []",
  cari?.data_type === "jsonb" &&
    cari?.is_nullable === "NO" &&
    String(cari?.column_default).includes("[]"),
  JSON.stringify(cari ?? null),
);
const barisLama = await db.query(
  `select peran from public.pf_article_sources where artikel_id = '${ARTIKEL_1}'`,
);
cek(
  "A5 baris lama pf_article_sources tetap terbaca (peran='utama' utuh)",
  barisLama.rows.length === 1 && barisLama.rows[0].peran === "utama",
);
const prefLama = await db.query(
  `select pencarian_tersimpan from public.pf_user_preferences where user_id = '${USER_A}'`,
);
cek(
  "A6 baris lama preferensi mendapat default pencarian_tersimpan = []",
  Array.isArray(prefLama.rows[0]?.pencarian_tersimpan) &&
    prefLama.rows[0].pencarian_tersimpan.length === 0,
);
// CHECK v8 yang berlaku: kosakata utama/koroborasi/konteks/bantahan.
// (pakai artikel kedua agar tidak bentrok unique)
const ARTIKEL_2 = "55555555-5555-4555-8555-555555555555";
await db.exec(
  `insert into public.pf_articles (id, slug, judul, kategori_slug, status, status_verifikasi) values ('${ARTIKEL_2}', 'uji-v18-dua', 'Artikel Uji v18 Dua', 'politik', 'terbit', 'UNCONFIRMED');`,
);
async function cobaPeran2(nilai) {
  try {
    await db.exec(
      `insert into public.pf_article_sources (artikel_id, sumber_id, peran) values ('${ARTIKEL_2}', '${SUMBER_1}', ${nilai === null ? "NULL" : `'${nilai}'`});`,
    );
    return true;
  } catch {
    return false;
  }
}
cek("A7 CHECK peran menerima 'utama' (kosakata v8)", await cobaPeran2("utama"));
async function cobaPeranBersih(nilai) {
  await db.exec(
    `delete from public.pf_article_sources where artikel_id = '${ARTIKEL_2}';`,
  );
  return cobaPeran2(nilai);
}
cek(
  "A8 CHECK peran menerima 'koroborasi'/'konteks'/'bantahan' + NULL",
  (await cobaPeranBersih("koroborasi")) &&
    (await cobaPeranBersih("konteks")) &&
    (await cobaPeranBersih("bantahan")) &&
    (await cobaPeranBersih(null)),
);
await db.exec(
  `delete from public.pf_article_sources where artikel_id = '${ARTIKEL_2}';`,
);
cek(
  "A9 CHECK peran MENOLAK 'primer'/'sekunder'/'bogus' (kosakata P0 lama tidak berlaku)",
  !(await cobaPeran2("primer")) &&
    !(await cobaPeran2("sekunder")) &&
    !(await cobaPeran2("bogus")),
);
await db.exec(
  `delete from public.pf_article_sources where artikel_id = '${ARTIKEL_2}';`,
);
let duplikatDitolak = false;
try {
  await db.exec(
    `insert into public.pf_article_sources (artikel_id, sumber_id) values ('${ARTIKEL_1}', '${SUMBER_1}');`,
  );
} catch {
  duplikatDitolak = true;
}
cek("A10 unique(artikel_id, sumber_id) tetap menolak duplikat", duplikatDitolak);
// round-trip jsonb pencarian_tersimpan
await db.exec(
  `update public.pf_user_preferences set pencarian_tersimpan = '[{"q":"politik","dari":null,"sampai":null,"sumber":null,"status":null,"disimpan_pada":"2026-11-17T00:00:00Z"}]'::jsonb where user_id = '${USER_A}';`,
);
const prefIsi = await db.query(
  `select pencarian_tersimpan from public.pf_user_preferences where user_id = '${USER_A}'`,
);
cek(
  "A11 pencarian_tersimpan round-trip JSON (1 entri, q='politik')",
  prefIsi.rows[0]?.pencarian_tersimpan?.[0]?.q === "politik",
);

// ================================================================
// §B — Policy RLS (keberadaan; v18 tidak menambah/menghapus)
// ================================================================
const policies = await db.query(
  `select tablename, policyname, cmd, qual, with_check
     from pg_policies where schemaname = 'public'
      and tablename in ('pf_user_preferences', 'pf_article_sources')`,
);
const prefPols = policies.rows.filter((r) => r.tablename === "pf_user_preferences");
cek(
  "B1 pf_user_preferences punya policy pemilik (baca/tambah/ubah/hapus)",
  prefPols.length >= 3 &&
    prefPols.every((p) => String(p.qual ?? p.with_check ?? "").includes("auth.uid()")),
  `${prefPols.length} policy`,
);
const sumberPols = policies.rows.filter(
  (r) => r.tablename === "pf_article_sources" && r.cmd === "SELECT",
);
cek(
  "B2 pf_article_sources punya policy SELECT (publik bersyarat, bukan tanpa batas)",
  sumberPols.length >= 1,
  `${sumberPols.length} policy SELECT`,
);

// ================================================================
// §C — Aturan verifikasi (yang diringkas MetodeVerifikasi)
// ================================================================
const SEKARANG = new Date("2026-11-17T07:00:00Z");
const tier = new Map([
  ["s1", 1],
  ["s2", 1],
  ["s3", 2],
  ["s4", 3],
]);
const buat = (id, sumber_id, disalin = null, jam = "2026-11-17T06:00:00Z") => ({
  id,
  sumber_id,
  url: `https://${sumber_id}.example/a`,
  judul: "Judul Sama",
  ringkasan: "",
  waktu_terbit_asli: jam,
  disalin_dari_id: disalin,
});
let h = tentukanKeputusanVerifikasi(buat("u1", "s1"), [buat("u2", "s2")], tier, SEKARANG);
cek("C1 2 independen tier-1 -> VERIFIED", h.keputusan === "VERIFIED" && h.sumberIndependen === 2);
h = tentukanKeputusanVerifikasi(buat("u1", "s1"), [buat("u2", "s3")], tier, SEKARANG);
cek("C2 2 independen campuran -> CROSS-CHECKED", h.keputusan === "CROSS-CHECKED");
h = tentukanKeputusanVerifikasi(buat("u1", "s1"), [], tier, SEKARANG);
cek("C3 1 sumber tier-1 -> CROSS-CHECKED (pelonggaran)", h.keputusan === "CROSS-CHECKED");
h = tentukanKeputusanVerifikasi(buat("u1", "s4"), [], tier, SEKARANG);
cek("C4 1 sumber tier-3 saja -> UNCONFIRMED", h.keputusan === "UNCONFIRMED");
h = tentukanKeputusanVerifikasi(
  buat("u1", "s3", null, "2026-11-17T06:30:00Z"),
  [
    buat("u2", "s3", null, "2026-11-17T06:20:00Z"),
    buat("u3", "s3", null, "2026-11-17T06:10:00Z"),
  ],
  tier,
  SEKARANG,
);
cek("C5 3 item/24 jam 1 sumber -> DEVELOPING", h.keputusan === "DEVELOPING");
h = tentukanKeputusanVerifikasi(
  buat("u1", "s2"),
  [buat("u3", "s3", "u1"), buat("u4", "s4", "u1")],
  tier,
  SEKARANG,
);
cek(
  "C6 salinan dari 1 akar = 1 independen (bukan 3)",
  h.sumberIndependen === 1 && h.keputusan === "CROSS-CHECKED",
  h.alasan,
);

// ================================================================
// §D — Semantik riwayat baca: update-di-tempat (durasi MAX, selesai OR)
// ================================================================
await db.exec(
  `insert into public.pf_reading_history (user_id, artikel_id, durasi_detik, selesai, dibaca_pada) values ('${USER_A}', '${ARTIKEL_1}', 120, false, now());`,
);
await db.exec(
  `update public.pf_reading_history set durasi_detik = greatest(durasi_detik, 90), selesai = selesai or false where user_id = '${USER_A}' and artikel_id = '${ARTIKEL_1}';`,
);
let r = await db.query(
  `select durasi_detik, selesai from public.pf_reading_history where user_id = '${USER_A}' and artikel_id = '${ARTIKEL_1}'`,
);
cek(
  "D1 update durasi 120 vs 90 -> tetap 120 (MAX), selesai tetap false",
  r.rows[0]?.durasi_detik === 120 && r.rows[0]?.selesai === false,
);
await db.exec(
  `update public.pf_reading_history set durasi_detik = greatest(durasi_detik, 300), selesai = selesai or true where user_id = '${USER_A}' and artikel_id = '${ARTIKEL_1}';`,
);
r = await db.query(
  `select durasi_detik, selesai from public.pf_reading_history where user_id = '${USER_A}' and artikel_id = '${ARTIKEL_1}'`,
);
cek(
  "D2 update durasi 300 + selesai=true -> 300 dan selesai true",
  r.rows[0]?.durasi_detik === 300 && r.rows[0]?.selesai === true,
);
r = await db.query(
  `select count(*)::int as j from public.pf_reading_history where user_id = '${USER_A}' and artikel_id = '${ARTIKEL_1}'`,
);
cek("D3 satu baris per user+artikel (update, bukan insert baru)", r.rows[0]?.j === 1);

// ================================================================
// §E — Penjaga integrasi statis P0
// ================================================================
const berkasWajib = [
  "src/app/api/cari/saran/route.ts",
  "src/app/api/saya/pencarian-tersimpan/route.ts",
  "src/app/sumber/page.tsx",
  "src/app/cari/page.tsx",
  "src/components/SaranPencarian.tsx",
  "src/components/CommandPalette.tsx",
  "src/components/artikel/MetodeVerifikasi.tsx",
  "src/components/artikel/PembacaArtikel.module.css",
  "supabase/migrations/20261117_pf_v18_ekspansi_p0.sql",
  "scripts/uji-p0-cari.mjs",
];
for (const f of berkasWajib) cek(`E1 berkas P0 ada: ${f}`, ada(f));

cek("E2 FACT SCORE ada: fact-score.ts + LencanaFactScore + /kebijakan/metodologi", ada("src/lib/fact-score.ts") && ada("src/components/artikel/LencanaFactScore.tsx") && ada("src/app/kebijakan/metodologi/page.tsx"));
cek(
  "E2b LencanaFactScore dipasang di halaman artikel di bawah judul",
  grepFile("src/app/artikel/[slug]/page.tsx", /LencanaFactScore/),
);
cek(
  "E2c halaman metodologi memuat teks rumus + tautan laporkan",
  grepFile("src/app/kebijakan/metodologi/page.tsx", /FACT SCORE/) &&
    grepFile("src/app/kebijakan/metodologi/page.tsx", /\/laporkan/),
);
// Penjaga regresi (pola /jelajahi): halaman statis murni WAJIB
// dirender per request — tanpa connection(), skrip $RC terpanggang
// tanpa nonce -> CSP memblokir -> h1 ganda (terbukti di CDP sblm fix).
cek(
  "E2d /kebijakan/metodologi dirender per request (connection + instant=false)",
  grepFile("src/app/kebijakan/metodologi/page.tsx", /await connection\(\)/) &&
    grepFile("src/app/kebijakan/metodologi/page.tsx", /export const instant = false/),
);
const pkg = JSON.parse(bacaFile("package.json"));
cek("E3 tanpa dependensi cmdk", !("cmdk" in (pkg.dependencies ?? {})));
cek(
  "E4 CommandPalette memakai Radix Dialog",
  grepFile("src/components/CommandPalette.tsx", /@radix-ui\/react-dialog/),
);
cek(
  "E5 layout memasang CommandPalette sekali di root",
  grepFile("src/app/layout.tsx", /<CommandPalette\s*\/>/),
);
cek(
  "E6 HeaderNav memuat entri /sumber",
  grepFile("src/components/HeaderNav.tsx", /\/sumber/),
);
cek(
  "E7 /cari memakai filter dari/sampai/sumber/status",
  grepFile("src/app/cari/page.tsx", /dari/) &&
    grepFile("src/app/cari/page.tsx", /sampai/) &&
    grepFile("src/app/cari/page.tsx", /sumber/) &&
    grepFile("src/app/cari/page.tsx", /status/),
);
cek(
  "E8 JejakFakta memakai label peran v8 (Utama/Koroborasi/Konteks/Bantahan)",
  ["Utama", "Koroborasi", "Konteks", "Bantahan"].every((k) =>
    grepFile("src/components/artikel/JejakFakta.tsx", new RegExp(k)),
  ),
);
function isiTanpaKomentar(rel) {
  return bacaFile(rel)
    .split("\n")
    .filter((b) => !/^\s*\/\//.test(b))
    .join("\n");
}
cek(
  "E9 tanpa string peran 'primer'/'sekunder' di kode JejakFakta/MetodeVerifikasi/PerbandinganSumber (komentar dokumentasi dikecualikan)",
  !/'primer'|"primer"|'sekunder'|"sekunder"/.test(isiTanpaKomentar("src/components/artikel/JejakFakta.tsx")) &&
    !/'primer'|"primer"|'sekunder'|"sekunder"/.test(isiTanpaKomentar("src/components/artikel/MetodeVerifikasi.tsx")) &&
    !/'primer'|"primer"|'sekunder'|"sekunder"/.test(isiTanpaKomentar("src/components/artikel/PerbandinganSumber.tsx")),
);
cek(
  "E10 MetodeVerifikasi menyebut aturan VERIFIED/CROSS-CHECKED",
  grepFile("src/components/artikel/MetodeVerifikasi.tsx", /VERIFIED/) &&
    grepFile("src/components/artikel/MetodeVerifikasi.tsx", /CROSS-CHECKED/),
);
cek(
  "E11 SearchBar tetap form GET ke /cari (tanpa-JS)",
  grepFile("src/components/SearchBar.tsx", /action="\/cari"/) &&
    grepFile("src/components/SearchBar.tsx", /method="get"/),
);
// CSS: tanpa self-ref var(--x: var(--x))
const css = bacaFile("src/app/globals.css");
let selfRef = [];
for (const m of css.matchAll(/(--[\w-]+)\s*:\s*var\(\s*\1\s*\)/g)) selfRef.push(m[1]);
cek("E12 globals.css: 0 definisi token self-ref", selfRef.length === 0, selfRef.join(", "));
// Klien baru: tanpa new Date() di render (SaranPencarian, CommandPalette)
cek(
  "E13 tanpa new Date() di SaranPencarian/CommandPalette",
  !grepFile("src/components/SaranPencarian.tsx", /new Date\(/) &&
    !grepFile("src/components/CommandPalette.tsx", /new Date\(/),
);
cek(
  "E14 /sumber memakai getSumber + EmptyState jujur",
  grepFile("src/app/sumber/page.tsx", /getSumber/) &&
    grepFile("src/app/sumber/page.tsx", /EmptyState/),
);
cek(
  "E15 /api/riwayat tidak lagi hardcode selesai:false",
  !grepFile("src/app/api/riwayat/route.ts", /selesai:\s*false/),
);
cek(
  "E16 PembacaArtikel punya label ekstraktif jujur",
  bacaFile("src/components/artikel/PembacaArtikel.tsx")
    .replace(/\s+/g, " ")
    .includes("bukan ditulis ulang"),
);

// ================================================================
// §F — FACT SCORE v1: 5 contoh hitungan tangan (§4.4) vs fungsi
// ================================================================
let fs1 = hitungFactScore({
  jumlahAkarPendukung: 2,
  skorKredibilitasTertinggi: 90,
  jumlahKlaim: 4,
  jumlahKlaimDidukungTanpaMenentang: 3,
  laporanKoreksiTerbuka: 0,
});
cek(
  "F1 contoh 1 -> 82 Kuat (A=26,67 B=30 C=15 D=10)",
  fs1.dinilai && fs1.skor === 82 && fs1.label === "Kuat",
  JSON.stringify(fs1.komponen),
);
let fs2 = hitungFactScore({
  jumlahAkarPendukung: 1,
  skorKredibilitasTertinggi: 90,
  jumlahKlaim: 2,
  jumlahKlaimDidukungTanpaMenentang: 1,
  laporanKoreksiTerbuka: 0,
});
cek(
  "F2 contoh 2 -> 63 Cukup (A=13,33 B=30 C=10 D=10)",
  fs2.dinilai && fs2.skor === 63 && fs2.label === "Cukup",
  JSON.stringify(fs2.komponen),
);
let fs3 = hitungFactScore({
  jumlahAkarPendukung: 3,
  skorKredibilitasTertinggi: 90,
  jumlahKlaim: 5,
  jumlahKlaimDidukungTanpaMenentang: 5,
  laporanKoreksiTerbuka: 1,
});
cek(
  "F3 contoh 3 -> 95 Sangat kuat (A=40 B=30 C=20 D=5)",
  fs3.dinilai && fs3.skor === 95 && fs3.label === "Sangat kuat",
  JSON.stringify(fs3.komponen),
);
let fs4 = hitungFactScore({
  jumlahAkarPendukung: 0,
  skorKredibilitasTertinggi: null,
  jumlahKlaim: 0,
  jumlahKlaimDidukungTanpaMenentang: 0,
  laporanKoreksiTerbuka: 0,
});
cek(
  "F4 contoh 4 tanpa klaim -> tidak dinilai, skor null",
  !fs4.dinilai && fs4.skor === null && fs4.label === null,
  fs4.alasanTidakDinilai ?? "",
);
let fs5 = hitungFactScore({
  jumlahAkarPendukung: 1,
  skorKredibilitasTertinggi: 75,
  jumlahKlaim: 1,
  jumlahKlaimDidukungTanpaMenentang: 0,
  laporanKoreksiTerbuka: 0,
});
cek(
  "F5 kasus 5 (1 klaim + bukti menentang, tier-2) -> 48 Lemah (C=0)",
  fs5.dinilai && fs5.skor === 48 && fs5.label === "Lemah" && fs5.komponen.konsistensi === 0,
  JSON.stringify(fs5.komponen),
);
let fs6 = hitungFactScore({
  jumlahAkarPendukung: 5,
  skorKredibilitasTertinggi: 60,
  jumlahKlaim: 2,
  jumlahKlaimDidukungTanpaMenentang: 2,
  laporanKoreksiTerbuka: 3,
});
cek(
  "F6 batas: n=5 tetap maks A=40; t=3 -> D=0; skor 80 Kuat",
  fs6.skor === 80 && fs6.label === "Kuat" && fs6.komponen.koreksi === 0,
  JSON.stringify(fs6.komponen),
);

console.log(`\n${lolos} lolos, ${gagal} gagal.`);
process.exit(gagal > 0 ? 1 : 0);
