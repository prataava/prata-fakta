// Uji Fase 7 PRATA FAKTA -> PGlite + pemeriksaan statis berkas.
// Langkah: (a) PGlite + stub auth + migrasi v1..v8 (v7 2x, v8 2x);
// (b) hitung tabel/RLS/policy; (c) skenario pf_quiz_scores
// (insert, upsert, unique, check, FK, trigger); (d) pemeriksaan
// statis: proxy 404 pengetahuan/kategori, rute SEO (sitemap,
// robots, RSS, health), JSON-LD + canonical, noindex admin,
// skrip backup mencakup 37 tabel; (e) perbaikan keamanan audit
// Fase 7: T1 (kunci kuis server-side), T3 (rate limit 4 route),
// T4 (nonaktif di autentikasiStaf), T6 (pelindung SSRF),
// T7 (search_path fungsi SECURITY DEFINER), T9 (timing-safe
// perbandingan secret).
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = require("@electric-sql/pglite");

// TypeScript repo (untuk mentranspilasi fungsi murni yang diekstrak
// dari sumber .ts sebelum diuji dengan new Function — sumber TS
// tidak bisa dieval langsung karena anotasi tipe).
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

// ---------- Setup PGlite ----------
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

await db.exec(`create schema if not exists auth;`);
await db.exec(`create schema if not exists extensions;`);
await db.exec(
  `create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);`,
);
await db.exec(
  `create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`,
);
// Role Supabase (wajib ada sebelum v8: REVOKE/GRANT FROM anon,
// authenticated di §4 T1-sisa). Pola sama seperti uji-fase8-gel1.
// service_role ditambah Gelombang B1: v13 §10 memberi GRANT
// eksplisit ke service_role atas semua tabel.
await db.exec(`create role anon nologin;`);
await db.exec(`create role authenticated nologin;`);
await db.exec(`create role service_role bypassrls nologin;`);

let ok = await jalankan("v1", baca("20261116_pf_v1_foundation.sql"));
if (ok) ok = await jalankan("v2", baca("20261116_pf_v2_articles.sql"));
if (ok) ok = await jalankan("v3", baca("20261116_pf_v3_ingestion.sql"));
if (ok) ok = await jalankan("v4", baca("20261116_pf_v4_ai.sql"));
if (ok) ok = await jalankan("v5", baca("20261116_pf_v5_editorial.sql"));
if (ok) ok = await jalankan("v6", baca("20261116_pf_v6_advanced.sql"));
if (ok) ok = await jalankan("v7 putaran 1", baca("20261116_pf_v7_quiz_scores.sql"));
if (ok) ok = await jalankan("v7 putaran 2 (idempotensi)", baca("20261116_pf_v7_quiz_scores.sql"));
// v8 (Fase 8 Gelombang 1) + v9–v14 diterapkan di sini agar baterai
// ini menguji skrip backup terhadap skema repo saat ini (62 tabel):
// backup-pf.mjs mendaftar 62 tabel pasca-v15, jadi DB uji harus
// v1–v16 — bukan v1–v8 — supaya perbandingan daftar = DB jujur.
// (Diperbarui Gelombang B1: v9 GRANT, v10 16 tabel, v11 limiter,
//  v12 seed 5 job, v13 pf_quiz_answers + GRANT service_role;
//  Gelombang B2: v14 +6 tabel; Tahap C: v15 pf_quiz_daily_answers;
//  Follow-up 5/6: v16 bookmark pengetahuan — tanpa tabel baru.)
if (ok) ok = await jalankan("v8 putaran 1", baca("20261116_pf_v8_expansion.sql"));
if (ok) ok = await jalankan("v8 putaran 2 (idempotensi)", baca("20261116_pf_v8_expansion.sql"));
if (ok) ok = await jalankan("v9", baca("20261116_pf_v9_grants.sql"));
if (ok) ok = await jalankan("v10", baca("20261116_pf_v10_wave2.sql"));
if (ok) ok = await jalankan("v11", baca("20261116_pf_v11_rate_limit_audit.sql"));
if (ok) ok = await jalankan("v12", baca("20261116_pf_v12_seed_jobs.sql"));
if (ok) ok = await jalankan("v13", baca("20261116_pf_v13_ultimate.sql"));
if (ok) ok = await jalankan("v14", baca("20261116_pf_v14_gelombang_b2.sql"));
if (ok) ok = await jalankan("v15", baca("20261116_pf_v15_tahap_c.sql"));
if (ok) ok = await jalankan("v16", baca("20261116_pf_v16_bookmark_pengetahuan.sql"));
if (!ok) {
  console.log("HASIL: MIGRASI GAGAL");
  process.exit(1);
}

const hitung = async (sql, params = []) =>
  Number((await db.query(sql, params)).rows[0].n);

cek(
  "tabel pf_* = 62",
  (await hitung(
    `select count(*) n from pg_tables where schemaname='public' and tablename like 'pf_%'`,
  )) === 62,
  "35 (v1-v6) + 1 (v7) + 1 (v8: pf_user_preferences) + 16 (v10) + 1 (v11: pf_rate_limits) + 1 (v13: pf_quiz_answers) + 6 (v14) + 1 (v15: pf_quiz_daily_answers)",
);
const rlsAktif = await hitung(
  `select count(*) n from pg_tables where schemaname='public' and tablename like 'pf_%' and rowsecurity`,
);
cek("RLS 62/62", rlsAktif === 62, `${rlsAktif} aktif`);
cek(
  "policy total = 120",
  (await hitung(
    `select count(*) n from pg_policies where schemaname='public' and tablename like 'pf_%'`,
  )) === 120,
  "79 (v1-v8) + 27 (v10) + 1 (v13: arsip Q&A publik) + 12 (v14) + 1 (v15: pf_quiz_daily_answers baca sendiri)",
);
cek(
  "policy pf_quiz_scores = 4",
  (await hitung(
    `select count(*) n from pg_policies where schemaname='public' and tablename='pf_quiz_scores'`,
  )) === 4,
  "baca pemilik, tambah pemilik, ubah pemilik, hapus pemilik (v14)",
);

// ---------- Skenario pf_quiz_scores ----------
const HARI_INI = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

async function harusBerhasil(label, teks, params = []) {
  try {
    const r = await db.query(teks, params);
    console.log(`OK: ${label}`);
    return r;
  } catch (e) {
    console.log(`GAGAL: ${label}\n  -> ${String(e.message).split("\n")[0]}`);
    gagal++;
    return null;
  }
}

async function harusGagal(label, teks, params = []) {
  try {
    await db.query(teks, params);
    console.log(`GAGAL: ${label} (seharusnya ditolak, malah lolos)`);
    gagal++;
    return false;
  } catch {
    console.log(`OK: ${label} (ditolak)`);
    return true;
  }
}

const U1 = "11111111-1111-1111-1111-111111111111";
await harusBerhasil(
  "seed pengguna u1",
  `insert into auth.users (id, email) values ($1, 'pembaca@uji.id')`,
  [U1],
);

// (Diperbarui Follow-up Tahap H: trigger v15 (Tahap C-3) menghitung
//  ulang benar/total pf_quiz_scores dari jawaban tersimpan — skor
//  tanpa soal ditolak, skor palsu dikoreksi. Skenario ini men-seed
//  5 soal HARI_INI + jawaban tersimpan u1 (4 benar, 1 salah) sebelum
//  menguji insert/upsert — pola yang sama seperti baterai Tahap C.)
const soalIdsHariIni = [];
for (let i = 1; i <= 5; i++) {
  const q = (
    await db.query(
      `insert into public.pf_quiz_questions (tanggal, pertanyaan, opsi, jenis)
       values ($1, $2, '["a","b","c","d"]'::jsonb, 'pilihan_ganda') returning id`,
      [HARI_INI, `Soal ${i}?`],
    )
  ).rows[0].id;
  soalIdsHariIni.push(q);
}
for (let i = 0; i < 5; i++) {
  await db.query(
    `insert into public.pf_quiz_daily_answers (user_id, soal_id, tanggal, jawaban, benar)
     values ($1, $2, $3, 0, $4)`,
    [U1, soalIdsHariIni[i], HARI_INI, i < 4],
  );
}

const skor1 = (
  await harusBerhasil(
    "insert skor u1 hari ini (4/5)",
    `insert into public.pf_quiz_scores (user_id, tanggal, benar, total)
     values ($1, $2, 4, 5) returning id, benar, total, dibuat_pada, diperbarui_pada`,
    [U1, HARI_INI],
  )
)?.rows[0];
cek("skor tersimpan mengembalikan id", typeof skor1?.id === "string");
cek(
  "skor tersimpan = hitungan trigger v15 (4/5)",
  skor1?.benar === 4 && skor1?.total === 5,
  `tersimpan ${skor1?.benar}/${skor1?.total}`,
);

await harusGagal(
  "duplikat (user, tanggal) ditolak tanpa upsert",
  `insert into public.pf_quiz_scores (user_id, tanggal, benar, total) values ($1, $2, 5, 5)`,
  [U1, HARI_INI],
);

// Jawaban ke-5 dikoreksi jadi benar dulu — baru upsert boleh jadi 5/5
// (trigger menghitung ulang dari jawaban tersimpan, bukan dari body).
await harusBerhasil(
  "koreksi jawaban ke-5 jadi benar",
  `update public.pf_quiz_daily_answers set benar = true where user_id = $1 and soal_id = $2 and tanggal = $3`,
  [U1, soalIdsHariIni[4], HARI_INI],
);
const upsert = (
  await harusBerhasil(
    "upsert main ulang hari yang sama (5/5)",
    `insert into public.pf_quiz_scores (user_id, tanggal, benar, total)
     values ($1, $2, 5, 5)
     on conflict (user_id, tanggal) do update set benar = excluded.benar, total = excluded.total
     returning benar, total`,
    [U1, HARI_INI],
  )
)?.rows[0];
cek(
  "upsert menimpa skor menjadi 5/5",
  upsert?.benar === 5 && upsert?.total === 5,
);
cek(
  "tetap 1 baris sesudah upsert",
  (await hitung(
    `select count(*) n from public.pf_quiz_scores where user_id = $1`,
    [U1],
  )) === 1,
);

// CHECK benar/total TIDAK lagi bisa diuji lewat penolakan insert:
// trigger v15 menimpa benar/total SEBELUM CHECK dievaluasi (tanggal
// bersoal -> dikoreksi ke nilai sah; tanggal tanpa soal -> ditolak
// trigger, bukan CHECK). Keberadaan definisi CHECK diuji lewat
// katalog pg_constraint — nilai di luar rentang tetap tidak bisa
// tersimpan lewat jalur mana pun, karena trigger selalu menulis
// nilai hasil hitungan (0..jumlah soal).
const cekDefinisi = await db.query(
  `select pg_get_constraintdef(oid) as def from pg_constraint
   where conrelid = 'public.pf_quiz_scores'::regclass and contype = 'c'`,
);
const definisiCek = cekDefinisi.rows.map((r) => r.def).join(" ");
cek(
  "CHECK benar 0..5 ada di skema",
  definisiCek.includes("benar >= 0") && definisiCek.includes("benar <= 5"),
  definisiCek,
);
cek(
  "CHECK total 1..10 ada di skema",
  definisiCek.includes("total >= 1") && definisiCek.includes("total <= 10"),
  definisiCek,
);
cek(
  "CHECK benar <= total ada di skema",
  definisiCek.includes("benar <= total"),
  definisiCek,
);
await harusGagal(
  "skor tanggal tanpa soal ditolak trigger v15",
  `insert into public.pf_quiz_scores (user_id, tanggal, benar, total) values ($1, '2026-11-20', 5, 5)`,
  [U1],
);
await harusGagal(
  "FK user tidak ada ditolak",
  `insert into public.pf_quiz_scores (user_id, tanggal, benar, total) values ('22222222-2222-2222-2222-222222222222', $1, 3, 5)`,
  [HARI_INI],
);
await harusGagal(
  "user_id null ditolak (hanya login)",
  `insert into public.pf_quiz_scores (user_id, tanggal, benar, total) values (null, '2026-11-15', 3, 5)`,
  [],
);

// Trigger diperbarui_pada berubah saat update.
const sebelum = (
  await db.query(
    `select diperbarui_pada from public.pf_quiz_scores where user_id = $1`,
    [U1],
  )
).rows[0].diperbarui_pada;
await new Promise((r) => setTimeout(r, 1100));
await harusBerhasil(
  "update skor memicu trigger",
  `update public.pf_quiz_scores set benar = 3 where user_id = $1`,
  [U1],
);
const sesudah = (
  await db.query(
    `select diperbarui_pada from public.pf_quiz_scores where user_id = $1`,
    [U1],
  )
).rows[0].diperbarui_pada;
cek(
  "diperbarui_pada berubah sesudah update",
  new Date(sesudah).getTime() > new Date(sebelum).getTime(),
);

// ---------- Pemeriksaan statis Fase 7 ----------
const proxy = bacaRepo("src/proxy.ts");
cek("proxy memeriksa pf_knowledge_articles", proxy.includes("pf_knowledge_articles"));
cek("proxy memeriksa kategori statis", proxy.includes("cariKategori"));
cek("proxy memakai helper slugTidakAda", proxy.includes("slugTidakAda"));

cek("sitemap.ts ada", fs.existsSync(`${DIR_REPO}/src/app/sitemap.ts`));
cek("robots.ts ada", fs.existsSync(`${DIR_REPO}/src/app/robots.ts`));
cek("rss.xml route ada", fs.existsSync(`${DIR_REPO}/src/app/rss.xml/route.ts`));
cek("api/health route ada", fs.existsSync(`${DIR_REPO}/src/app/api/health/route.ts`));
cek("api/kuis/skor route ada", fs.existsSync(`${DIR_REPO}/src/app/api/kuis/skor/route.ts`));

const artikelPage = bacaRepo("src/app/artikel/[slug]/page.tsx");
cek("artikel: JSON-LD NewsArticle", artikelPage.includes("NewsArticle"));
cek("artikel: JSON-LD BreadcrumbList", artikelPage.includes("BreadcrumbList"));
cek("artikel: canonical", artikelPage.includes("alternates: { canonical: url }"));
const tahuPage = bacaRepo("src/app/pengetahuan/[slug]/page.tsx");
cek("pengetahuan: JSON-LD Article", tahuPage.includes('"@type": "Article"'));
cek("pengetahuan: canonical", tahuPage.includes("alternates: { canonical: url }"));
cek(
  "pengetahuan: komentar utang 404 diperbarui",
  tahuPage.includes("KEPUTUSAN FASE 7") &&
    !tahuPage.includes("Perbaikan status menunggu"),
);

const adminLayout = bacaRepo("src/app/admin/layout.tsx");
cek("admin layout noindex", adminLayout.includes("index: false"));
cek("masuk layout noindex", bacaRepo("src/app/masuk/layout.tsx").includes("index: false"));
cek("daftar layout noindex", bacaRepo("src/app/daftar/layout.tsx").includes("index: false"));
cek("profil layout noindex", bacaRepo("src/app/profil/layout.tsx").includes("index: false"));

const nextConfig = bacaRepo("next.config.ts");
cek("next.config: security headers", nextConfig.includes("X-Content-Type-Options") && nextConfig.includes("X-Frame-Options"));
cek("next.config: Cache-Control sitemap/rss", nextConfig.includes("sitemap.xml|robots.txt|rss.xml"));

const layout = bacaRepo("src/app/layout.tsx");
cek("layout tidak lagi memuat CSS Leaflet global", !layout.includes("leaflet/dist/leaflet.css"));
cek(
  "PetaDuniaLazy memuat CSS Leaflet",
  bacaRepo("src/components/peta/PetaDuniaLazy.tsx").includes("leaflet/dist/leaflet.css"),
);

// Skrip backup mencakup semua 62 tabel (pasca-v15; v16 tanpa tabel baru).
const backup = bacaRepo("scripts/backup-pf.mjs");
const daftarTabel = [...backup.matchAll(/"(pf_[a-z_]+)"/g)].map((m) => m[1]);
const unikTabel = [...new Set(daftarTabel)];
cek("backup: 62 tabel unik", unikTabel.length === 62, `${unikTabel.length} ditemukan`);
const tabelDb = (
  await db.query(
    `select tablename from pg_tables where schemaname='public' and tablename like 'pf_%'`,
  )
).rows.map((r) => r.tablename);
cek(
  "backup: daftar tabel = tabel di DB",
  unikTabel.length === tabelDb.length &&
    unikTabel.every((t) => tabelDb.includes(t)),
);

// ---------- Perbaikan keamanan audit Fase 7 ----------
// T7: tiga fungsi SECURITY DEFINER v1 harus punya search_path
// yang dikunci (diperbaiki di migrasi v7 tanpa mengubah v1).
const fungsi = (
  await db.query(
    `select proname, proconfig from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and proname in ('pf_has_role', 'pf_is_super_admin', 'pf_handle_new_user')`,
  )
).rows;
cek(
  "T7: 3 fungsi SECURITY DEFINER ditemukan",
  fungsi.length === 3,
  fungsi.map((f) => f.proname).join(", "),
);
for (const f of fungsi) {
  const cfg = Array.isArray(f.proconfig) ? f.proconfig : [];
  cek(
    `T7: ${f.proname} search_path=public`,
    cfg.some((c) => String(c).includes("search_path=public")),
    JSON.stringify(cfg),
  );
}
cek(
  "T7: migrasi v7 memuat ALTER FUNCTION search_path",
  baca("20261116_pf_v7_quiz_scores.sql").includes(
    "alter function public.pf_has_role(text) set search_path = public",
  ) &&
    baca("20261116_pf_v7_quiz_scores.sql").includes(
      "alter function public.pf_is_super_admin() set search_path = public",
    ) &&
    baca("20261116_pf_v7_quiz_scores.sql").includes(
      "alter function public.pf_handle_new_user() set search_path = public",
    ),
);

// T1: kunci kuis tidak lagi dikirim ke klien.
cek("T1: route /api/kuis/jawab ada", fs.existsSync(`${DIR_REPO}/src/app/api/kuis/jawab/route.ts`));
const jawabSrc = bacaRepo("src/app/api/kuis/jawab/route.ts");
// FU2 (16 Nov 2026): validasiJawabanKuis pindah ke src/lib/kuis.ts
// (route.ts dilarang mengekspor non-handler) — route tetap
// memanggilnya, batas 0..4 kini diperiksa dari lib.
const kuisSrc = bacaRepo("src/lib/kuis.ts");
cek("T1: route jawab memvalidasi jawaban 0..4", kuisSrc.includes("jawaban > 4") && jawabSrc.includes("validasiJawabanKuis"));
cek("T1: route jawab membatasi tanggal hari ini/kemarin", jawabSrc.includes("kemarinWib"));
const kuisKlien = bacaRepo("src/components/lanjutan/KuisHarian.tsx");
cek("T1: KuisHarian memakai /api/kuis/jawab", kuisKlien.includes("/api/kuis/jawab"));
cek("T1: KuisHarian TIDAK lagi membaca aktif.kunci", !kuisKlien.includes("aktif.kunci"));
cek("T1: KuisHarian memakai tipe publik tanpa kunci", kuisKlien.includes("PfKuisSoalPublik"));
const kuisPage = bacaRepo("src/app/kuis/page.tsx");
cek("T1: /kuis memetakan soal ke tipe publik", kuisPage.includes("soalPublik") && kuisPage.includes("PfKuisSoalPublik"));
cek("T1: /kuis TIDAK lagi mengirim soal mentah ke klien", !kuisPage.includes("soal={soal} tanggal"));
cek(
  "T1: tipe PfKuisSoalPublik menghilangkan kunci",
  bacaRepo("src/lib/lanjutan.ts").includes('Omit<PfKuisSoal, "kunci">'),
);

// T1 (lanjutan): uji fungsi murni validasiJawabanKuis via ekstraksi
// sumber (pola uji Fase 6 — fungsi diekspos di lib agar bisa diuji;
// FU2: sumber ekstraksi pindah dari route ke src/lib/kuis.ts).
const polaUuid = /const POLA_UUID =\n  \/.*\/i;/.exec(kuisSrc)?.[0];
const fnValidasi = /export function validasiJawabanKuis\([\s\S]*?\n\}/.exec(kuisSrc)?.[0];
cek("T1: validasiJawabanKuis dapat diekstrak dari sumber", Boolean(polaUuid && fnValidasi));
if (polaUuid && fnValidasi) {
  const validasi = new Function(
    transpileKeJs(
      `${polaUuid}\n${fnValidasi.replace("export function", "function")}\nreturn validasiJawabanKuis;`,
    ),
  )();
  const UUID_UJI = "11111111-1111-1111-1111-111111111111";
  cek("T1: validasi menerima jawaban sah", validasi({ soal_id: UUID_UJI, jawaban: 2 }).ok === true);
  cek("T1: validasi menolak UUID buruk", validasi({ soal_id: "bukan-uuid", jawaban: 2 }).ok === false);
  cek("T1: validasi menolak jawaban 5", validasi({ soal_id: UUID_UJI, jawaban: 5 }).ok === false);
  cek("T1: validasi menolak jawaban -1", validasi({ soal_id: UUID_UJI, jawaban: -1 }).ok === false);
  cek("T1: validasi menolak jawaban pecahan", validasi({ soal_id: UUID_UJI, jawaban: 2.5 }).ok === false);
  cek("T1: validasi menolak jawaban string", validasi({ soal_id: UUID_UJI, jawaban: "2" }).ok === false);
  cek("T1: validasi menolak body null", validasi(null).ok === false);
  cek("T1: validasi menolak soal_id hilang", validasi({ jawaban: 1 }).ok === false);
}

// T3: rate limit 30/menit di keempat route yang sebelumnya tanpa limiter.
// (Tahap 13A: pola lama `batasi(ipDariRequest(req))` sinkron atas Map
// in-memory diganti `await batasi(req)` — limiter DB, kunci per-akun/
// per-IP diturunkan di dalam route-auth.ts; jumlah pemeriksaan per
// handler tetap sama.)
const hitungBatasi = (relatif) =>
  (bacaRepo(relatif).match(/await batasi\(req\)/g) ?? []).length;
for (const [relatif, harap] of [
  ["src/app/api/bookmark/route.ts", 2],
  ["src/app/api/notifikasi/route.ts", 2],
  ["src/app/api/riwayat/route.ts", 1],
  ["src/app/api/topik/route.ts", 3],
]) {
  const src = bacaRepo(relatif);
  cek(
    `T3: ${relatif} punya limiter 30/mnt`,
    src.includes("buatRateLimiter(30)") && hitungBatasi(relatif) === harap,
    `${hitungBatasi(relatif)} pemeriksaan, harap ${harap}`,
  );
}

// T4: akun nonaktif ditolak di autentikasiStaf (route AI).
const routeAuth = bacaRepo("src/lib/ai/route-auth.ts");
cek(
  "T4: autentikasiStaf memeriksa pf_profiles.nonaktif",
  routeAuth.includes('from("pf_profiles")') &&
    routeAuth.includes("nonaktif") &&
    routeAuth.includes("Akun Anda dibatasi"),
);

// T6: pelindung SSRF diterapkan di fetchRss + cek sumber.
cek("T6: src/lib/ingestion/ssrf.ts ada", fs.existsSync(`${DIR_REPO}/src/lib/ingestion/ssrf.ts`));
const ssrfSrc = bacaRepo("src/lib/ingestion/ssrf.ts");
cek("T6: ssrf mengekspor ipPrivat + tolakHostPrivat", ssrfSrc.includes("export function ipPrivat") && ssrfSrc.includes("export async function tolakHostPrivat"));
cek("T6: fetchRss memakai tolakHostPrivat", bacaRepo("src/lib/ingestion/rss.ts").includes("tolakHostPrivat"));
cek("T6: route cek sumber memakai tolakHostPrivat", bacaRepo("src/app/api/sumber/[id]/cek/route.ts").includes("tolakHostPrivat"));

// T6 (lanjutan): uji fungsi murni ipPrivat via ekstraksi sumber.
const fnIp = /export function ipPrivat\([\s\S]*?\n\}/.exec(ssrfSrc)?.[0];
cek("T6: ipPrivat dapat diekstrak dari sumber", Boolean(fnIp));
if (fnIp) {
  const ipPrivat = new Function(
    transpileKeJs(
      `${fnIp.replace("export function", "function")}\nreturn ipPrivat;`,
    ),
  )();
  for (const [ip, harap] of [
    ["10.0.0.1", true],
    ["127.0.0.1", true],
    ["192.168.1.1", true],
    ["172.16.0.5", true],
    ["172.31.255.255", true],
    ["169.254.169.254", true],
    ["0.0.0.0", true],
    ["8.8.8.8", false],
    ["1.1.1.1", false],
    ["172.32.0.1", false],
    ["::1", true],
    ["fe80::1", true],
    ["fd00::1", true],
    ["fc00::1", true],
    ["2001:db8::1", false],
  ]) {
    cek(`T6: ipPrivat(${ip}) = ${harap}`, ipPrivat(ip) === harap);
  }
}

// T9: perbandingan secret timing-safe di ketiga lokasi.
cek(
  "T9: route-auth mengekspor bandingkanSecret (timingSafeEqual)",
  routeAuth.includes("export function bandingkanSecret") &&
    routeAuth.includes("timingSafeEqual"),
);
cek(
  "T9: route-auth memakai bandingkanSecret",
  routeAuth.includes("bandingkanSecret(secretHeader, secretEnv)"),
);
cek(
  "T9: ingestion/jalankan memakai bandingkanSecret",
  bacaRepo("src/app/api/ingestion/jalankan/route.ts").includes(
    "bandingkanSecret(secretHeader, secretEnv)",
  ),
);
cek(
  "T9: terbitkan-terjadwal memakai bandingkanSecret",
  bacaRepo("src/app/api/admin/artikel/terbitkan-terjadwal/route.ts").includes(
    "bandingkanSecret(secretHeader, secretEnv)",
  ),
);
for (const relatif of [
  "src/lib/ai/route-auth.ts",
  "src/app/api/ingestion/jalankan/route.ts",
  "src/app/api/admin/artikel/terbitkan-terjadwal/route.ts",
]) {
  cek(
    `T9: ${relatif} tanpa lagi '=== secretEnv'`,
    !bacaRepo(relatif).includes("=== secretEnv"),
  );
}

// ---------- Ringkasan ----------
console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
if (gagal > 0) {
  console.log("HASIL: ADA KEGAGALAN");
  process.exit(1);
}
console.log("HASIL: SEMUA LOLOS");
