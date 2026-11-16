// Uji Tahap 13A PRATA FAKTA (T3 + T10 + T4) -> PGlite.
// Menerapkan v1–v11 dua kali (idempotensi) TANPA blanket grant
// (pelajaran F4), lalu memeriksa:
//   T3  RPC pf_rate_limit_check: N diizinkan / N+1 ditolak,
//       reset jendela, hapus baris kadaluarsa, argumen tidak
//       valid -> false, atomicity (2 panggilan batas 1 -> tepat
//       1 lolos), akses langsung tabel ditolak (42501), RPC bisa
//       dipanggil anon/authenticated; + uji TS ipDariRequest /
//       kunciRateLimit / buatRateLimiter (transpile + stub).
//   T10 CHECK v11 (53 aksi), insert audit 6 aksi baru, aksi
//       bogus ditolak, baris audit berisi admin + waktu, TIDAK
//       ADA policy INSERT pf_audit_logs (fail-closed lewat
//       service client); + asersi sumber bahwa tiap route
//       sumber/admin/akademi memanggil catatAuditWajib.
//   T4  prasyarat DB: kolom nonaktif, flag terbaca lewat policy
//       publik (yang dipakai tolakAkunNonaktif); + asersi sumber
//       bahwa 13 route pengguna memanggil tolakAkunNonaktif.
//   Regresi T5/T8/T1-sisa tetap lolos.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// BATAS KEJUJURAN baterai ini (bukan klaim lebih):
// - Penulisan audit oleh ROUTE dan respons HTTP 403 TIDAK diuji
//   lewat HTTP hidup (tidak ada server jalan di sini); yang
//   diuji: simulasi SQL atas insert audit yang dilakukan route,
//   asersi sumber bahwa tiap route memanggil catatAuditWajib
//   dengan aksi yang benar, dan prasyarat DB helper 403.
//   Verifikasi HTTP hidup tetap tugas tahap browser/koordinator.
// - Atomicity: PGlite satu koneksi — dua query Promise.all
//   diserialkan; uji ini membuktikan kebenaran pernyataan
//   atomik satu statement (INSERT ... ON CONFLICT), bukan
//   paralelisme sejati dua koneksi. Paralelisme sejati butuh
//   Postgres dengan 2 koneksi.
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

function bacaRepo(rel) {
  return fs.readFileSync(`${DIR_REPO}/${rel}`, "utf8");
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

async function berhasilSebagai(role, sql, params = []) {
  try {
    await sebagai(role, sql, params);
    return true;
  } catch {
    return false;
  }
}

async function hitungSebagai(role, sql, params = []) {
  const r = await sebagai(role, sql, params);
  return Number(r.rows[0]?.n ?? 0);
}

async function panggilRpc(kunci, batas, jendelaDetik) {
  const r = await db.query(
    `select pf_rate_limit_check($1, $2, $3) as hasil`,
    [kunci, batas, jendelaDetik],
  );
  return r.rows[0].hasil === true;
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
  "20261116_pf_v11_rate_limit_audit.sql",
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

// Terapkan v1–v11 dua kali.
for (const putaran of [1, 2]) {
  for (const nama of MIGRASI) {
    const ok = await jalankan(`migrasi ${nama} (putaran ${putaran})`, baca(nama));
    if (!ok) process.exit(1);
  }
}

// ---------- Hitung akhir v11 ----------
const tabel = await db.query(
  `select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'pf_%'`,
);
cek("jumlah tabel pf_* = 54", tabel.rows[0].n === 54, `dapat ${tabel.rows[0].n}`);
const rls = await db.query(
  `select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'pf_%' and rowsecurity`,
);
cek("RLS 54/54", rls.rows[0].n === 54, `dapat ${rls.rows[0].n}`);
const policy = await db.query(
  `select count(*)::int as n from pg_policies where schemaname='public' and tablename like 'pf_%'`,
);
cek("jumlah policy pf_* = 106", policy.rows[0].n === 106, `dapat ${policy.rows[0].n}`);
const policyRateLimit = await db.query(
  `select count(*)::int as n from pg_policies where schemaname='public' and tablename = 'pf_rate_limits'`,
);
cek("policy pf_rate_limits = 0 (akses langsung ditolak)", policyRateLimit.rows[0].n === 0, `dapat ${policyRateLimit.rows[0].n}`);
const hakAnon = await db.query(
  `select has_table_privilege('anon', 'public.pf_rate_limits', 'SELECT') as h`,
);
cek("anon TIDAK punya SELECT pf_rate_limits (REVOKE)", hakAnon.rows[0].h === false);
const hakAuth = await db.query(
  `select has_table_privilege('authenticated', 'public.pf_rate_limits', 'SELECT') as h`,
);
cek("authenticated TIDAK punya SELECT pf_rate_limits (REVOKE)", hakAuth.rows[0].h === false);
const rpcAda = await db.query(
  `select count(*)::int as n from pg_proc where proname = 'pf_rate_limit_check'`,
);
cek("RPC pf_rate_limit_check ada", rpcAda.rows[0].n === 1, `dapat ${rpcAda.rows[0].n}`);

// ---------- T3: RPC pf_rate_limit_check ----------
// N diizinkan, N+1 ditolak.
let limaLolos = true;
for (let i = 0; i < 5; i++) {
  if (!(await panggilRpc("t3:batas5", 5, 60))) limaLolos = false;
}
cek("RPC: 5 panggilan dalam batas 5 diizinkan", limaLolos);
cek("RPC: panggilan ke-6 melewati batas 5 ditolak", (await panggilRpc("t3:batas5", 5, 60)) === false);

// Jendela baru me-reset hitungan (jendela_mulai digeser ke masa lalu).
cek("RPC: batas 1 panggilan pertama lolos", await panggilRpc("t3:reset", 1, 60));
cek("RPC: batas 1 panggilan kedua ditolak", (await panggilRpc("t3:reset", 1, 60)) === false);
await db.query(
  `update public.pf_rate_limits set jendela_mulai = now() - interval '70 seconds' where kunci = 't3:reset'`,
);
cek("RPC: jendela baru me-reset hitungan ke 1 (lolos lagi)", await panggilRpc("t3:reset", 1, 60));
const hitunganReset = await db.query(
  `select hitungan from public.pf_rate_limits where kunci = 't3:reset'`,
);
cek("RPC: hitungan sesudah reset = 1", hitunganReset.rows[0]?.hitungan === 1, `dapat ${hitunganReset.rows[0]?.hitungan}`);

// Baris kadaluarsa dibersihkan oportunistik oleh panggilan lain.
await db.query(
  `insert into public.pf_rate_limits (kunci, hitungan, jendela_detik, jendela_mulai)
   values ('t3:kadaluarsa', 3, 60, now() - interval '10 minutes')`,
);
await panggilRpc("t3:pembersih", 5, 60);
const sisaKadaluarsa = await db.query(
  `select count(*)::int as n from public.pf_rate_limits where kunci = 't3:kadaluarsa'`,
);
cek("RPC: baris kadaluarsa dihapus oleh panggilan berikutnya", sisaKadaluarsa.rows[0].n === 0, `dapat ${sisaKadaluarsa.rows[0].n}`);

// Atomicity: 2 panggilan bersamaan pada batas 1 -> tepat 1 lolos.
const [atomik1, atomik2] = await Promise.all([
  db.query(`select pf_rate_limit_check('t3:atomik', 1, 60) as hasil`),
  db.query(`select pf_rate_limit_check('t3:atomik', 1, 60) as hasil`),
]);
const jumlahLolosAtomik = [atomik1.rows[0].hasil, atomik2.rows[0].hasil].filter(Boolean).length;
cek("RPC: 2 panggilan bersamaan batas 1 -> tepat 1 lolos", jumlahLolosAtomik === 1, `lolos ${jumlahLolosAtomik}`);

// Argumen tidak valid -> false (fail-closed di dalam RPC).
cek("RPC: kunci kosong -> false", (await panggilRpc("", 5, 60)) === false);
cek("RPC: kunci null -> false", (await panggilRpc(null, 5, 60)) === false);
cek("RPC: batas 0 -> false", (await panggilRpc("t3:argumen", 0, 60)) === false);
cek("RPC: jendela 0 -> false", (await panggilRpc("t3:argumen", 5, 0)) === false);

// RPC bisa dipanggil anon + authenticated; akses langsung ditolak.
cek(
  "RPC: anon bisa memanggil pf_rate_limit_check",
  (await sebagai("anon", `select pf_rate_limit_check('t3:anon', 1, 60) as hasil`)).rows[0].hasil === true,
);
cek(
  "RPC: authenticated bisa memanggil pf_rate_limit_check",
  (await sebagai("authenticated", `select pf_rate_limit_check('t3:auth', 1, 60) as hasil`)).rows[0].hasil === true,
);
cek(
  "T3: SELECT langsung pf_rate_limits sebagai anon DITOLAK (42501)",
  !(await berhasilSebagai("anon", `select * from public.pf_rate_limits`)),
);
cek(
  "T3: INSERT langsung pf_rate_limits sebagai anon DITOLAK (42501)",
  !(await berhasilSebagai("anon", `insert into public.pf_rate_limits (kunci, hitungan, jendela_detik) values ('t3:curang', 1, 60)`)),
);
cek(
  "T3: SELECT langsung pf_rate_limits sebagai authenticated DITOLAK (42501)",
  !(await berhasilSebagai("authenticated", `select * from public.pf_rate_limits`)),
);

// ---------- T10: CHECK v11 + audit sumber ----------
const cekV11 = await db.query(
  `select pg_get_constraintdef(oid) as def from pg_constraint
   where conrelid = 'public.pf_audit_logs'::regclass and conname = 'pf_audit_logs_aksi_check_v11'`,
);
cek("CHECK pf_audit_logs_aksi_check_v11 ada", cekV11.rows.length === 1);
const jumlahAksi = (cekV11.rows[0]?.def.match(/'[a-z_.]+'/g) ?? []).length;
cek("CHECK v11 berisi 53 aksi", jumlahAksi === 53, `dapat ${jumlahAksi}`);
const aksiBaru = ["sumber.buat", "sumber.ubah", "sumber.hapus", "sumber.cek", "sumber.aktif", "negara.hapus"];
for (const aksi of aksiBaru) {
  cek(`CHECK v11 memuat aksi '${aksi}'`, (cekV11.rows[0]?.def ?? "").includes(`'${aksi}'`));
}

// Seed pengguna uji (FK aktor_id) + artikel + soal kuis (untuk regresi).
await db.query(`insert into auth.users (id, email) values ($1, 'a@uji.id'), ($2, 'b@uji.id')`, [UID_A, UID_B]);
const artikelTerbitId = (
  await db.query(
    `insert into public.pf_articles (slug, judul, kategori_slug, status)
     values ('uji-terbit', 'Artikel Uji Terbit', 'indonesia', 'terbit') returning id`,
  )
).rows[0].id;
const soalKuisId = (
  await db.query(
    `insert into public.pf_quiz_questions (tanggal, pertanyaan, opsi, kunci)
     values ('2026-11-16', 'Soal uji?', '["a","b","c","d","e"]'::jsonb, 2) returning id`,
  )
).rows[0].id;

// Tiap operasi CRUD sumber menulis 1 baris audit (simulasi SQL
// atas insert yang dilakukan route — lihat batas kejujuran di atas).
for (const [aksi, entitas] of [
  ["sumber.buat", "pf_sources"],
  ["sumber.ubah", "pf_sources"],
  ["sumber.hapus", "pf_sources"],
  ["sumber.cek", "pf_sources"],
  ["sumber.aktif", "pf_sources"],
  ["negara.hapus", "pf_countries"],
]) {
  const ok = await (async () => {
    try {
      await db.query(
        `insert into public.pf_audit_logs (aktor_id, aktor_email, aksi, entitas, entitas_id, sebelum, sesudah, ip)
         values ($1, 'admin@uji.id', $2, $3, 'entitas-uji', '{"nama":"lama"}'::jsonb, '{"nama":"baru"}'::jsonb, '203.0.113.5')`,
        [UID_A, aksi, entitas],
      );
      return true;
    } catch {
      return false;
    }
  })();
  cek(`T10: insert audit aksi '${aksi}' berhasil`, ok);
}
// Baris audit berisi admin + waktu + sebelum/sesudah.
const barisAudit = await db.query(
  `select aktor_id, aktor_email, aksi, entitas, sebelum, sesudah, ip, dibuat_pada
   from public.pf_audit_logs where aksi = 'sumber.buat' limit 1`,
);
cek(
  "T10: baris audit sumber.buat berisi admin + waktu + sebelum/sesudah",
  barisAudit.rows.length === 1 &&
    barisAudit.rows[0].aktor_id === UID_A &&
    barisAudit.rows[0].aktor_email === "admin@uji.id" &&
    barisAudit.rows[0].dibuat_pada !== null &&
    barisAudit.rows[0].sebelum?.nama === "lama" &&
    barisAudit.rows[0].sesudah?.nama === "baru",
);
let tolakBogus = false;
try {
  await db.query(
    `insert into public.pf_audit_logs (aktor_id, aksi, entitas) values ($1, 'bogus.aksi', 'pf_sources')`,
    [UID_A],
  );
} catch {
  tolakBogus = true;
}
cek("T10: aksi audit bogus ditolak (CHECK 23514)", tolakBogus);
const policyInsertAudit = await db.query(
  `select count(*)::int as n from pg_policies where schemaname='public' and tablename='pf_audit_logs' and cmd='INSERT'`,
);
cek("T10: TIDAK ADA policy INSERT pf_audit_logs (hanya service client)", policyInsertAudit.rows[0].n === 0, `dapat ${policyInsertAudit.rows[0].n}`);
cek(
  "T10: INSERT audit sebagai anon DITOLAK (fail-closed: tanpa audit, operasi ditolak)",
  !(await berhasilSebagai("anon", `insert into public.pf_audit_logs (aktor_id, aksi, entitas) values ($1, 'sumber.buat', 'pf_sources')`, [UID_A])),
);

// ---------- T4: prasyarat DB ----------
const kolomNonaktif = await db.query(
  `select count(*)::int as n from information_schema.columns
   where table_schema='public' and table_name='pf_profiles' and column_name='nonaktif'`,
);
cek("T4: kolom pf_profiles.nonaktif ada", kolomNonaktif.rows[0].n === 1);
await db.query(
  `update public.pf_profiles set nama_tampilan = 'Nonaktif', nonaktif = true where id = $1::uuid`,
  [UID_A],
);
await db.query(
  `update public.pf_profiles set nama_tampilan = 'Aktif', nonaktif = false where id = $1::uuid`,
  [UID_B],
);
cek(
  "T4: flag nonaktif terbaca lewat policy publik (prasyarat tolakAkunNonaktif)",
  (await hitungSebagai("anon", `select count(*) n from public.pf_profiles where nonaktif = true`)) === 1,
);
cek(
  "T4: akun aktif tidak ikut terhitung nonaktif",
  (await hitungSebagai("anon", `select count(*) n from public.pf_profiles where nonaktif = false`)) === 1,
);

// ---------- T3/T10/T4: asersi sumber ----------
// (a) Limiter Map lama sudah tidak ada di src/.
function semuaBerkasSrc(dir, hasil = []) {
  for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${entri.name}`;
    if (entri.isDirectory()) semuaBerkasSrc(p, hasil);
    else if (/\.(ts|tsx)$/.test(entri.name)) hasil.push(p);
  }
  return hasil;
}
const berkasSrc = semuaBerkasSrc(`${DIR_REPO}/src`);
let polaLamaDitemukan = [];
for (const f of berkasSrc) {
  const isi = fs.readFileSync(f, "utf8");
  for (const pola of [
    "new Map<string, { n: number",
    "lolosRateLimit(ip",
    "batasi(ip",
    "batasiKirim(ip",
    "batasiLacak(ip",
  ]) {
    if (isi.includes(pola)) polaLamaDitemukan.push(`${f}: ${pola}`);
  }
}
cek("T3: tidak ada limiter Map / pemakaian ip() lama di src/", polaLamaDitemukan.length === 0, polaLamaDitemukan.join("; "));
const routeAuth = bacaRepo("src/lib/ai/route-auth.ts");
cek("T3: route-auth memakai RPC pf_rate_limit_check", routeAuth.includes("pf_rate_limit_check"));
cek("T3: route-auth TIDAK punya Map in-memory", !routeAuth.includes("new Map"));
cek(
  "T3: route-auth TIDAK percaya entri kiri XFF (pakai entri terakhir)",
  routeAuth.includes("rantai[rantai.length - 1]") && !routeAuth.includes('get("x-forwarded-for")?.split(",")[0]'),
);
cek("T3: route-auth punya kunci per-akun user:<id>", routeAuth.includes("`user:${user.id}`"));
cek("T3: buatRateLimiter mengembalikan fungsi async", /return async \(req: Request\)/.test(routeAuth));
// Semua pemanggilan limiter di-await (tidak ada pemakaian sinkron lama).
let pemakaianSinkron = [];
for (const f of berkasSrc) {
  const isi = fs.readFileSync(f, "utf8");
  if (!isi.includes("buatRateLimiter(")) continue;
  for (const baris of isi.split("\n")) {
    if (/(batasi|lolosRateLimit|batasiKirim|batasiLacak)\(req\)/.test(baris) && !baris.includes("await")) {
      pemakaianSinkron.push(`${f}: ${baris.trim()}`);
    }
  }
}
cek("T3: semua pemanggilan limiter di-await", pemakaianSinkron.length === 0, pemakaianSinkron.join("; "));
const jumlahLimiter = berkasSrc.filter((f) => {
  const isi = fs.readFileSync(f, "utf8");
  return isi.includes("buatRateLimiter(") || isi.includes("buatRateLimiterAdmin(");
}).length;
cek("T3: limiter DB dipakai di >= 70 berkas route", jumlahLimiter >= 70, `dapat ${jumlahLimiter}`);

// (b) Audit fail-closed: tiap route sumber/admin/akademi memanggil catatAuditWajib.
const auditRoutes = [
  ["src/app/api/sumber/route.ts", ["sumber.buat"]],
  ["src/app/api/sumber/[id]/route.ts", ["sumber.ubah", "sumber.hapus", "sumber.aktif"]],
  ["src/app/api/sumber/[id]/cek/route.ts", ["sumber.cek"]],
  ["src/app/api/admin/cerita/route.ts", ["cerita.buat"]],
  ["src/app/api/admin/cerita/[id]/route.ts", ["cerita.ubah", "cerita.hapus"]],
  ["src/app/api/admin/event/route.ts", ["event.buat"]],
  ["src/app/api/admin/event/[id]/route.ts", ["event.ubah", "event.hapus"]],
  ["src/app/api/admin/negara/route.ts", ["negara.buat", "negara.ubah"]],
  ["src/app/api/admin/negara/[id]/route.ts", ["negara.ubah", "negara.hapus"]],
  ["src/app/api/admin/tanya/[id]/route.ts", ["tanya.jawab"]],
  ["src/app/api/admin/podcast/route.ts", ["podcast.episode", "podcast.terbit"]],
  ["src/app/api/admin/podcast/[id]/route.ts", ["podcast.episode", "podcast.terbit"]],
  ["src/app/api/admin/akademi/route.ts", ["akademi.kursus"]],
  ["src/app/api/admin/akademi/[id]/route.ts", ["akademi.kursus", "akademi.modul"]],
];
for (const [rel, aksiList] of auditRoutes) {
  const isi = bacaRepo(rel);
  cek(`T10: ${rel} memanggil catatAuditWajib`, isi.includes("catatAuditWajib"));
  for (const aksi of aksiList) {
    cek(`T10: ${rel} mengaudit '${aksi}'`, isi.includes(`"${aksi}"`));
  }
}
const auditHelper = bacaRepo("src/lib/admin/audit.ts");
const fnAuditWajib = /export async function catatAuditWajib\([\s\S]*?\n\}/.exec(auditHelper)?.[0];
cek(
  "T10: helper catatAuditWajib ada (fail-closed: teruskan galat, tanpa try/catch penelan)",
  Boolean(
    fnAuditWajib &&
      fnAuditWajib.includes("await adapter.catatAudit(input)") &&
      !fnAuditWajib.includes("try") &&
      !fnAuditWajib.includes("catch") &&
      !fnAuditWajib.includes("console.error"),
  ),
);
for (const rel of ["src/app/api/admin/akademi/route.ts", "src/app/api/admin/akademi/[id]/route.ts"]) {
  cek(`T10: ${rel} TIDAK lagi punya helper best-effort catatAuditAkademi`, !bacaRepo(rel).includes("catatAuditAkademi"));
}

// (c) T4: 13 route pengguna memanggil tolakAkunNonaktif.
const t4Routes = [
  "src/app/api/akademi/progres/route.ts",
  "src/app/api/bookmark/route.ts",
  "src/app/api/cerita/[slug]/ikuti/route.ts",
  "src/app/api/kuis/skor/route.ts",
  "src/app/api/notifikasi/route.ts",
  "src/app/api/podcast/playlist/route.ts",
  "src/app/api/podcast/riwayat/route.ts",
  "src/app/api/riwayat/route.ts",
  "src/app/api/saya/ekspor/route.ts",
  "src/app/api/saya/preferensi/route.ts",
  "src/app/api/tanya/route.ts",
  "src/app/api/topik/route.ts",
  "src/app/api/ingestion/antrean/route.ts",
];
for (const rel of t4Routes) {
  cek(`T4: ${rel} memeriksa nonaktif (tolakAkunNonaktif)`, bacaRepo(rel).includes("tolakAkunNonaktif"));
}
cek(
  "T4: autentikasiStaf + autentikasiPemicuAi memakai tolakAkunNonaktif",
  (routeAuth.match(/tolakAkunNonaktif/g) ?? []).length >= 3,
  `dapat ${(routeAuth.match(/tolakAkunNonaktif/g) ?? []).length} kemunculan`,
);

// ---------- Uji TS murni: ipDariRequest / kunciRateLimit / buatRateLimiter ----------
const fnIp = /export function ipDariRequest\([\s\S]*?\n\}/.exec(routeAuth)?.[0];
const fnKunci = /export async function kunciRateLimit\([\s\S]*?\n\}/.exec(routeAuth)?.[0];
const fnCekDb = /export async function cekRateLimitDb\([\s\S]*?\n\}/.exec(routeAuth)?.[0];
const fnBuat = /export function buatRateLimiter\([\s\S]*?\n\}/.exec(routeAuth)?.[0];
cek("TS: ipDariRequest/kunciRateLimit/cekRateLimitDb/buatRateLimiter dapat diekstrak", Boolean(fnIp && fnKunci && fnCekDb && fnBuat));
if (fnIp && fnKunci && fnCekDb && fnBuat) {
  const kode = transpileKeJs(
    `${fnIp.replace("export function", "function")}\n` +
      `${fnKunci.replace("export async function", "async function")}\n` +
      `${fnCekDb.replace("export async function", "async function")}\n` +
      `${fnBuat.replace("export function", "function")}\n` +
      `return { ipDariRequest, kunciRateLimit, cekRateLimitDb, buatRateLimiter };`,
  );
  const buatReq = (headers) => new Request("https://uji.id/api/x", { headers });
  // ipDariRequest: XFF kiri palsu diabaikan, entri terakhir yang dipakai.
  const { ipDariRequest, kunciRateLimit } = new Function("createClient", kode)(
    () => Promise.resolve({ auth: { getUser: async () => ({ data: { user: null } }) } }),
  );
  cek(
    "TS: ipDariRequest memakai entri TERAKHIR XFF (kiri palsu diabaikan)",
    ipDariRequest(buatReq({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" })) === "9.10.11.12",
  );
  cek(
    "TS: ipDariRequest memakai entri PERTAMA x-vercel-forwarded-for",
    ipDariRequest(buatReq({ "x-vercel-forwarded-for": "203.0.113.5, 10.0.0.1", "x-forwarded-for": "1.2.3.4, 9.10.11.12" })) === "203.0.113.5",
  );
  cek(
    "TS: ipDariRequest tanpa header -> tak-dikenal",
    ipDariRequest(buatReq({})) === "tak-dikenal",
  );
  cek(
    "TS: ipDariRequest memangkas spasi entri XFF",
    ipDariRequest(buatReq({ "x-forwarded-for": "  1.1.1.1 , 2.2.2.2  " })) === "2.2.2.2",
  );
  // kunciRateLimit: login -> user:<id> walau XFF dipalsu; anon -> ip:<terakhir>.
  const kunciLogin = new Function("createClient", kode)(
    () => Promise.resolve({ auth: { getUser: async () => ({ data: { user: { id: UID_A } } }) } }),
  ).kunciRateLimit;
  cek(
    "TS: kunciRateLimit login -> user:<id> (XFF palsu tidak mengubah)",
    (await kunciLogin(buatReq({ "x-forwarded-for": "1.2.3.4, 9.10.11.12" }))) === `user:${UID_A}`,
  );
  cek(
    "TS: kunciRateLimit anon -> ip:<entri terakhir XFF>",
    (await kunciRateLimit(buatReq({ "x-forwarded-for": "1.2.3.4, 9.10.11.12" }))) === "ip:9.10.11.12",
  );
  const kunciGagalSesi = new Function("createClient", kode)(
    () => { throw new Error("sesi rusak"); },
  ).kunciRateLimit;
  cek(
    "TS: kunciRateLimit sesi gagal dibaca -> fallback ip:",
    (await kunciGagalSesi(buatReq({ "x-forwarded-for": "9.10.11.12" }))) === "ip:9.10.11.12",
  );
  // buatRateLimiter: panggil RPC stub dengan kunci turunan + batas + jendela.
  const panggilanRpc = [];
  const hitunganStub = new Map();
  const stubRpc = async (nama, args) => {
    panggilanRpc.push({ nama, ...args });
    const n = (hitunganStub.get(args.p_kunci) ?? 0) + 1;
    hitunganStub.set(args.p_kunci, n);
    return { data: n <= args.p_batas, error: null };
  };
  const buatDenganStub = (pengguna) =>
    new Function("createClient", kode)(() =>
      Promise.resolve({
        auth: { getUser: async () => ({ data: { user: pengguna } }) },
        rpc: stubRpc,
      }),
    ).buatRateLimiter;
  const limiterLogin = buatDenganStub({ id: UID_A })(3);
  const reqLogin = buatReq({ "x-forwarded-for": "1.2.3.4, 9.10.11.12" });
  const hasilLimiter = [];
  for (let i = 0; i < 4; i++) hasilLimiter.push(await limiterLogin(reqLogin));
  cek("TS: buatRateLimiter 3x lolos lalu 1x ditolak (stub RPC)", hasilLimiter.join(",") === "true,true,true,false", hasilLimiter.join(","));
  cek(
    "TS: buatRateLimiter memanggil RPC dengan kunci user:<id> + batas 3 + jendela 60",
    panggilanRpc.length === 4 &&
      panggilanRpc.every((p) => p.nama === "pf_rate_limit_check" && p.p_kunci === `user:${UID_A}` && p.p_batas === 3 && p.p_jendela_detik === 60),
    JSON.stringify(panggilanRpc[0] ?? null),
  );
  const limiterAnon = buatDenganStub(null)(5, 120_000);
  await limiterAnon(buatReq({ "x-forwarded-for": "1.2.3.4, 9.10.11.12" }));
  const panggilanAnon = panggilanRpc[panggilanRpc.length - 1];
  cek(
    "TS: buatRateLimiter anon memakai kunci ip: + jendela kustom 120 detik",
    panggilanAnon.p_kunci === "ip:9.10.11.12" && panggilanAnon.p_jendela_detik === 120 && panggilanAnon.p_batas === 5,
    JSON.stringify(panggilanAnon),
  );
  // Fail-open: RPC melempar -> limiter mengizinkan.
  const limiterGagalRpc = new Function("createClient", kode)(() =>
    Promise.resolve({
      auth: { getUser: async () => ({ data: { user: null } }) },
      rpc: async () => { throw new Error("DB putus"); },
    }),
  ).buatRateLimiter(1);
  cek(
    "TS: buatRateLimiter fail-open bila RPC gagal (mengizinkan + console.error)",
    (await limiterGagalRpc(buatReq({ "x-forwarded-for": "9.10.11.12" }))) === true,
  );
}

// ---------- Regresi T5 / T8 / T1-sisa (tetap berlaku sesudah v11) ----------
cek(
  "T5 tetap berlaku: INSERT anon newsletter DITOLAK",
  !(await berhasilSebagai("anon", `insert into public.pf_newsletter_subscribers (email) values ('pasca-v11@contoh.id')`)),
);
cek(
  "T5 tetap berlaku: INSERT anon correction_reports DITOLAK",
  !(await berhasilSebagai("anon", `insert into public.pf_correction_reports (artikel_id, jenis, pesan) values ($1, 'typo', 'uji')`, [artikelTerbitId])),
);
cek(
  "T5 tetap berlaku: INSERT anon questions DITOLAK",
  !(await berhasilSebagai("anon", `insert into public.pf_questions (user_id, pertanyaan, jawaban, status) values (null, 'apa itu?', null, 'menunggu')`)),
);
cek(
  "T8 tetap berlaku: anon SELECT pf_roles = 0 baris",
  (await hitungSebagai("anon", `select count(*) n from public.pf_roles`)) === 0,
);
cek(
  "T1-sisa tetap berlaku: SELECT kunci sebagai anon DITOLAK",
  !(await berhasilSebagai("anon", `select kunci from public.pf_quiz_questions where id = $1`, [soalKuisId])),
);
cek(
  "T1-sisa tetap berlaku: SELECT kunci sebagai authenticated DITOLAK",
  !(await berhasilSebagai("authenticated", `select kunci from public.pf_quiz_questions where id = $1`, [soalKuisId])),
);
cek(
  "T1-sisa tetap berlaku: SELECT kolom non-kunci sebagai anon TETAP bisa",
  (await hitungSebagai("anon", `select count(*) n from public.pf_quiz_questions where id = $1`, [soalKuisId])) === 1,
);

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
if (gagal > 0) {
  console.log("HASIL: ADA KEGAGALAN");
  process.exit(1);
}
