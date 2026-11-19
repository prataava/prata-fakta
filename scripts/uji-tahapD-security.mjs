// Uji Keamanan TAHAP D PRATA FAKTA — verifikasi ulang T3/T6/T10/CSP/CSRF/
// cookie/RLS/SQLi/XSS/prompt-injection/eskalasi/admin/backup/upload/API.
// PGlite (v1–v14) + uji TS murni (transpile + stub) + uji HTTP live
// bila TAHAPD_LIVE_URL disetel (server `next start` sudah jalan).
//
// Cakupan per tugas koordinator (item 1–7):
//   1. T3: RPC pf_rate_limit_check atomik di PGlite; SIMULASI
//      kegagalan RPC (drop fungsi) -> 12+2 route keras menjawab
//      503 jujur (fail-closed) via helper; GET + admin internal
//      tetap fail-open sesuai desain + tercatat di log.
//   2. T6: fetchTerpin/fetchAman — IP privat ditolak, re-resolusi
//      pasca-fetch, timeout DNS 5 dtk (BATAS_DNS_MS), allowlist
//      8 host exact-match, GDELT lewat fetchAman. BATAS JUJUR:
//      pinning penuh butuh egress langsung (Vercel/staging) —
//      dari VM ini middlebox menjawab DNS palsu, jadi pinning
//      transport hanya dibuktikan ke server lokal + fallback.
//   3. T10: sapuan SEMUA route mutasi admin + perubahan sumber +
//      konfigurasi ingestion — tiap jalur memakai catatAuditWajib
//      (fail-closed) atau fungsi editorial/kendali yang mengaudit;
//      4 jalur best-effort lama (pengetahuan, riset, data, kendali
//      flags/jobs) diverifikasi sudah diganti.
//   4. CSP: header hadir di / + 404, nonce unik/request, hash
//      skrip tema sama persis, tanpa unsafe-inline/unsafe-eval
//      (script-src, produksi); fungsi aplikasi tetap jalan.
//   5. CSRF: cek Origin terpusat di proxy.ts + lapis kedua
//      per-route; live: Origin salah -> 403; tanpa Origin ->
//      perilaku terdokumentasi; GET tidak bermutasi.
//   6. Cookie: Secure:true produksi, sameSite lax, httpOnly:false
//      dengan alasan terdokumentasi (I-3); refresh sesi di proxy.
//   7. RLS + GRANT + SQLi + XSS + prompt injection + eskalasi +
//      admin + audit log + backup + upload + API abuse.
//
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
// TEMUAN: dicatat tanpa menggagalkan — residual risk objektif
// yang dilaporkan ke koordinator (bukan disembunyikan).
import fs from "node:fs";
import http from "node:http";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(new URL("../package.json", import.meta.url).pathname);
const { PGlite } = require("@electric-sql/pglite");
const requireRepo = createRequire(
  new URL("../package.json", import.meta.url).pathname,
);
const ts = requireRepo("typescript");

const DIR_MIGRASI = new URL("../supabase/migrations/", import.meta.url).pathname;
const DIR_REPO = new URL("../", import.meta.url).pathname;
const LIVE_URL = (process.env.TAHAPD_LIVE_URL ?? "").replace(/\/$/, "");
process.on("unhandledRejection", (e) => {
  console.log(`GAGAL: unhandledRejection — ${String(e?.message ?? e).split("\n")[0]}`);
  process.exit(1);
});

let gagal = 0;
let lolos = 0;
const temuan = [];
function cek(label, kondisi, detail = "") {
  if (kondisi) {
    lolos++;
    console.log(`OK: ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(`GAGAL: ${label}${detail ? ` — ${detail}` : ""}`);
    gagal++;
  }
}
/** Residual risk / celah terdokumentasi: dicatat, tidak menggagalkan. */
function catatTemuan(label, detail = "") {
  temuan.push(`${label}${detail ? ` — ${detail}` : ""}`);
  console.log(`TEMUAN: ${label}${detail ? ` — ${detail}` : ""}`);
}
function bacaRepo(rel) {
  return fs.readFileSync(`${DIR_REPO}/${rel}`, "utf8");
}
function transpileKeJs(kodeTs) {
  return ts.transpileModule(kodeTs, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      // WAJIB: tanpa ini `import http from "node:http"` menjadi
      // `node_http_1.default.request` (undefined) — crash fetchTerpin.
      esModuleInterop: true,
    },
  }).outputText;
}
function ekstrak(sumber, pola, nama) {
  const m = pola.exec(sumber);
  if (!m) console.log(`GAGAL: ekstrak ${nama} — pola tidak cocok`);
  return m?.[0] ?? null;
}
function semuaBerkas(dir, hasil = []) {
  for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${entri.name}`;
    if (entri.isDirectory()) semuaBerkas(p, hasil);
    else if (/\.(ts|tsx)$/.test(entri.name)) hasil.push(p);
  }
  return hasil;
}

// ---------- Setup PGlite + migrasi v1–v14 ----------
const db = new PGlite();
function bacaMigrasi(nama) {
  let sql = fs.readFileSync(`${DIR_MIGRASI}/${nama}`, "utf8");
  sql = sql.replace(/create extension[^;]+;/gi, "-- ekstensi dilepas (PGlite)");
  sql = sql.replace(/\bcitext\b/gi, "text");
  return sql;
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
  "20261116_pf_v12_seed_jobs.sql",
  "20261116_pf_v13_ultimate.sql",
  "20261116_pf_v14_gelombang_b2.sql",
];
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
for (const nama of MIGRASI) {
  try {
    await db.exec(bacaMigrasi(nama));
  } catch (e) {
    console.log(`GAGAL: migrasi ${nama}\n  -> ${String(e.message).split("\n")[0]}`);
    process.exit(1);
  }
}
console.log("OK: migrasi v1–v14 diterapkan (sekali; idempotensi sudah dibuktikan baterai B2)");

// ---------- §A. Hitung akhir v14: 61 tabel / RLS 61/61 / policy 119 ----------
console.log("\n== §A. Hitung akhir v14 (61/61/119) ==");
{
  const t = await db.query(
    `select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'pf_%'`,
  );
  cek("tabel pf_* = 61", t.rows[0].n === 61, `dapat ${t.rows[0].n}`);
  const r = await db.query(
    `select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'pf_%' and rowsecurity`,
  );
  cek("RLS 61/61", r.rows[0].n === 61, `dapat ${r.rows[0].n}`);
  const p = await db.query(
    `select count(*)::int as n from pg_policies where schemaname='public' and tablename like 'pf_%'`,
  );
  cek("policy pf_* = 119", p.rows[0].n === 119, `dapat ${p.rows[0].n}`);
  const pub = await db.query(
    `select count(*)::int as n from information_schema.role_table_grants where grantee='PUBLIC' and table_schema='public' and table_name like 'pf_%'`,
  );
  cek("0 grant tabel ke PUBLIC atas pf_*", pub.rows[0].n === 0, `dapat ${pub.rows[0].n}`);
  // GRANT service_role: keempat hak (SELECT/INSERT/UPDATE/DELETE) di SEMUA 61 tabel.
  const g = await db.query(
    `select table_name, count(distinct privilege_type)::int as n from information_schema.role_table_grants where grantee='service_role' and table_schema='public' and table_name like 'pf_%' group by table_name`,
  );
  const kurang = g.rows.filter((r) => r.n < 4).map((r) => `${r.table_name}(${r.n})`);
  cek(
    "service_role GRANT 4 hak di 61/61 tabel",
    g.rows.length === 61 && kurang.length === 0,
    `tabel ber-grant ${g.rows.length}, kurang: ${kurang.join(", ") || "tidak ada"}`,
  );
  // pf_rate_limits: TANPA policy — akses langsung ditolak RLS (hanya RPC).
  const pol = await db.query(
    `select count(*)::int as n from pg_policies where tablename='pf_rate_limits'`,
  );
  cek("pf_rate_limits tanpa policy (hanya RPC)", pol.rows[0].n === 0, `dapat ${pol.rows[0].n}`);
}

// ---------- §A2. Probe anon: 0 baris di tabel pemilik ----------
console.log("\n== §A2. Probe anon (isolasi data) ==");
async function sebagai(role, sql, params = []) {
  await db.query(`set role ${role}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.query(`reset role`);
  }
}
async function hitungSebagai(role, sql, params = []) {
  const r = await sebagai(role, sql, params);
  return Number(r.rows[0]?.n ?? 0);
}
{
  // Seed satu baris pemilik di tabel yang RLS-nya ketat.
  await db.query(
    `insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'pemilik@uji.id') on conflict (id) do nothing`,
  );
  await db.query(
    `insert into public.pf_profiles (id, nama_tampilan) values ('11111111-1111-1111-1111-111111111111', 'Pemilik') on conflict (id) do nothing`,
  );
  await db.query(
    `insert into public.pf_categories (slug, nama) values ('uji', 'Uji') on conflict (slug) do nothing`,
  );
  await db.query(
    `insert into public.pf_articles (id, slug, judul, status, kategori_slug) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'uji-isolasi', 'Uji', 'terbit', 'uji') on conflict (id) do nothing`,
  );
  cek(
    "anon: 0 baris pf_profiles",
    (await hitungSebagai("anon", `select count(*)::int as n from public.pf_profiles`)) === 0,
  );
  // pf_rate_limits: v11 me-REVOKE grant anon — SELECT langsung
  // melempar 42501 (lebih kuat dari 0 baris: akses ditolak total).
  let anonRateLimits = null;
  try {
    anonRateLimits = await hitungSebagai("anon", `select count(*)::int as n from public.pf_rate_limits`);
  } catch (e) {
    anonRateLimits = /42501/.test(String(e?.code ?? e?.message ?? e)) ? "42501-ditolak" : `galat-lain: ${String(e?.message ?? e).split("\n")[0]}`;
  }
  cek(
    "anon: pf_rate_limits tidak terbaca (0 baris ATAU 42501)",
    anonRateLimits === 0 || anonRateLimits === "42501-ditolak",
    `dapat ${anonRateLimits}`,
  );
  // service_role (bypassrls) BISA membaca/menulis — bukti grant + bypass bekerja.
  const sr = await sebagai(
    "service_role",
    `insert into public.pf_rate_limits (kunci, hitungan, jendela_detik, jendela_mulai) values ('uji:grant', 1, 60, now()) on conflict (kunci) do nothing returning kunci`,
  );
  cek("service_role bisa INSERT pf_rate_limits (grant+bypassrls)", sr.rows.length >= 0);
  await db.query(`delete from public.pf_rate_limits where kunci='uji:grant'`);
}

// ---------- §B. T3: RPC pf_rate_limit_check atomik (PGlite) ----------
console.log("\n== §B. T3: RPC pf_rate_limit_check ==");
async function panggilRpc(kunci, batas, jendelaDetik) {
  const r = await db.query(`select pf_rate_limit_check($1, $2, $3) as hasil`, [
    kunci,
    batas,
    jendelaDetik,
  ]);
  return r.rows[0].hasil === true;
}
{
  cek("RPC: di bawah batas -> true", (await panggilRpc("t3:a", 3, 60)) === true);
  cek("RPC: panggilan ke-2 di bawah batas -> true", (await panggilRpc("t3:a", 3, 60)) === true);
  cek("RPC: panggilan ke-3 (tepat batas) -> true", (await panggilRpc("t3:a", 3, 60)) === true);
  cek("RPC: panggilan ke-4 (lewat batas) -> false", (await panggilRpc("t3:a", 3, 60)) === false);
  cek("RPC: kunci lain tidak terpengaruh", (await panggilRpc("t3:b", 3, 60)) === true);
  cek("RPC: argumen tak valid (batas 0) -> false", (await panggilRpc("t3:c", 0, 60)) === false);
  // Atomicity: 35 panggilan paralel pada batas 30 -> tepat 30 lolos.
  const hasil = await Promise.all(
    Array.from({ length: 35 }, () => panggilRpc("t3:paralel", 30, 60)),
  );
  const lolosParalel = hasil.filter(Boolean).length;
  cek(
    "RPC atomik: 35 paralel / batas 30 -> tepat 30 lolos",
    lolosParalel === 30,
    `lolos ${lolosParalel}`,
  );
  // Jendela tetap: jendela 1 dtk kedaluwarsa -> hitungan kembali ke 1.
  await panggilRpc("t3:jendela", 1, 1);
  cek("RPC: jendela 1 dtk, panggilan ke-2 langsung -> false", (await panggilRpc("t3:jendela", 1, 1)) === false);
  await new Promise((r) => setTimeout(r, 1200));
  cek("RPC: sesudah jendela lewat -> true lagi", (await panggilRpc("t3:jendela", 1, 1)) === true);
}

// ---------- §C. T3: SIMULASI kegagalan RPC (drop fungsi) ----------
// Meniru "migrasi v11 belum dijalankan di produksi": fungsi tidak ada.
// Helper fail-closed WAJIB menolak (503 jujur di route); helper
// fail-open (GET + admin internal) WAJIB tetap mengizinkan + log.
console.log("\n== §C. T3: simulasi RPC gagal (fungsi di-drop) ==");
await db.exec(`drop function if exists public.pf_rate_limit_check(text, integer, integer)`);
{
  const r = await db.query(
    `select count(*)::int as n from pg_proc where proname='pf_rate_limit_check'`,
  );
  cek("simulasi: fungsi pf_rate_limit_check TIDAK ADA lagi", r.rows[0].n === 0);
}
const routeAuth = bacaRepo("src/lib/ai/route-auth.ts");
const asalSrc = bacaRepo("src/lib/asal.ts");
const fnIp = ekstrak(routeAuth, /export function ipDariRequest\([\s\S]*?\n\}/, "ipDariRequest");
const fnKunci = ekstrak(routeAuth, /export async function kunciRateLimit\([\s\S]*?\n\}/, "kunciRateLimit");
const fnKlasifikasi = ekstrak(routeAuth, /export function klasifikasiGalatRpc\([\s\S]*?\n\}/, "klasifikasiGalatRpc");
const fnCatatGalat = ekstrak(routeAuth, /export function catatGalatRateLimit\([\s\S]*?\n\}/, "catatGalatRateLimit");
const fnCekDb = ekstrak(routeAuth, /export async function cekRateLimitDb\([\s\S]*?\n\}/, "cekRateLimitDb");
const fnCekKeras = ekstrak(routeAuth, /export async function cekRateLimitDbKeras\([\s\S]*?\n\}/, "cekRateLimitDbKeras");
const fnBuatKeras = ekstrak(routeAuth, /export function buatRateLimiterKeras\([\s\S]*?\n\}/, "buatRateLimiterKeras");
const fnBuatLunak = ekstrak(routeAuth, /export function buatRateLimiter\([\s\S]*?\n\}/, "buatRateLimiter");
const fnResponBelumSiap = ekstrak(routeAuth, /export function responRateLimitBelumSiap\([\s\S]*?\n\}/, "responRateLimitBelumSiap");
const fnResponRateLimit = ekstrak(routeAuth, /export function responRateLimit\(\)[\s\S]*?\n\}/, "responRateLimit");
const fnNormalisasiAsal = ekstrak(asalSrc, /export function normalisasiOrigin\([\s\S]*?\n\}/, "normalisasiOrigin");
const fnApakahAsal = ekstrak(asalSrc, /export function apakahAsalDiizinkan\([\s\S]*?\n\}/, "apakahAsalDiizinkan");
const NextResponseStub = { json: (body, init) => ({ status: init?.status ?? 200, body }) };
function buatFungsiRouteAuth() {
  const kode = transpileKeJs(
    [
      fnIp?.replace("export function", "function"),
      fnKunci?.replace("export async function", "async function"),
      fnKlasifikasi?.replace("export function", "function"),
      fnCatatGalat?.replace("export function", "function"),
      fnCekDb?.replace("export async function", "async function"),
      fnCekKeras?.replace("export async function", "async function"),
      fnBuatKeras?.replace("export function", "function"),
      fnBuatLunak?.replace("export function", "function"),
      fnResponBelumSiap?.replace("export function", "function"),
      fnResponRateLimit?.replace("export function", "function"),
      fnNormalisasiAsal?.replace("export function", "function"),
      fnApakahAsal?.replace("export function", "function"),
    ]
      .filter(Boolean)
      .join("\n") +
      `\nreturn { ipDariRequest, kunciRateLimit, klasifikasiGalatRpc, catatGalatRateLimit, cekRateLimitDb, cekRateLimitDbKeras, buatRateLimiterKeras, buatRateLimiter, responRateLimitBelumSiap, responRateLimit, apakahAsalDiizinkan };`,
  );
  return new Function("createClient", "NextResponse", kode);
}
const galatBelumSiap = Object.assign(
  new Error(
    "Could not find the function public.pf_rate_limit_check(p_kunci text, p_batas integer, p_jendela_detik integer) in the schema cache",
  ),
  { code: "PGRST202" },
);
const galatTransien = new Error("fetch failed");
function klienRpcStub(perilaku) {
  // perilaku: {data,error} atau Error yang dilempar rpc().
  return () =>
    Promise.resolve({
      auth: { getUser: async () => ({ data: { user: null } }) },
      rpc: async () => {
        if (perilaku instanceof Error) throw perilaku;
        return perilaku;
      },
    });
}
{
  const buat = buatFungsiRouteAuth();
  const api = buat(klienRpcStub(galatBelumSiap), NextResponseStub);
  // Klasifikasi.
  cek("T3: PGRST202 -> belum-siap", api.klasifikasiGalatRpc(galatBelumSiap) === "belum-siap");
  cek("T3: galat jaringan -> transien", api.klasifikasiGalatRpc(galatTransien) === "transien");
  // Fail-closed: RPC gagal -> ditolak + alasan rpc-gagal.
  const h1 = await api.cekRateLimitDbKeras("uji:1", 5, 60);
  cek(
    "T3 fail-closed: RPC gagal (belum-siap) -> ditolak, alasan rpc-gagal",
    h1.lolos === false && h1.alasan === "rpc-gagal" && h1.jenisGalat === "belum-siap",
    JSON.stringify(h1),
  );
  const apiTransien = buat(klienRpcStub(galatTransien), NextResponseStub);
  const h2 = await apiTransien.cekRateLimitDbKeras("uji:2", 5, 60);
  cek(
    "T3 fail-closed: RPC gagal (transien) -> ditolak, jenis transien",
    h2.lolos === false && h2.alasan === "rpc-gagal" && h2.jenisGalat === "transien",
    JSON.stringify(h2),
  );
  // 503 jujur: pesan bedakan belum-siap vs transien.
  const r503a = api.responRateLimitBelumSiap("belum-siap");
  const r503b = api.responRateLimitBelumSiap("transien");
  cek(
    "T3: responRateLimitBelumSiap -> 503, pesan bedakan jenis",
    r503a.status === 503 &&
      /migrasi rate limit belum dijalankan/.test(r503a.body.error) &&
      r503b.status === 503 &&
      /sementara tidak tersedia/.test(r503b.body.error),
  );
  // Kontrol positif: RPC sehat (data:true) -> lolos; data:false -> terbatas (429).
  const apiOk = buat(klienRpcStub({ data: true, error: null }), NextResponseStub);
  cek("T3 fail-closed: RPC sehat data:true -> lolos", (await apiOk.cekRateLimitDbKeras("uji:3", 5, 60)).lolos === true);
  const apiPenuh = buat(klienRpcStub({ data: false, error: null }), NextResponseStub);
  const hPenuh = await apiPenuh.cekRateLimitDbKeras("uji:4", 5, 60);
  cek(
    "T3 fail-closed: RPC sehat data:false -> terbatas (bukan rpc-gagal)",
    hPenuh.lolos === false && hPenuh.alasan === "terbatas",
    JSON.stringify(hPenuh),
  );
  cek("T3: responRateLimit (429) beda dari 503", api.responRateLimit().status === 429);
  // Log terstruktur saat RPC gagal (kedua mode) + fail-open regresi.
  const tangkap = [];
  const consoleAsli = console.error;
  console.error = (...a) => tangkap.push(a.join(" "));
  try {
    await api.cekRateLimitDbKeras("uji:log-keras", 5, 60);
    const fo = await api.cekRateLimitDb("uji:log-lunak", 5, 60);
    cek("T3 (regresi desain): cekRateLimitDb fail-open TETAP mengizinkan bila RPC gagal", fo === true);
  } finally {
    console.error = consoleAsli;
  }
  const logJson = tangkap.map((t) => {
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  }).filter(Boolean);
  cek(
    "T3: log gagal RPC adalah JSON terstruktur (event/mode/jenis/kunci)",
    logJson.some((j) => j.event === "rate_limit_rpc_gagal" && j.mode === "fail-closed" && j.jenis === "belum-siap" && j.kunci === "uji:log-keras") &&
      logJson.some((j) => j.event === "rate_limit_rpc_gagal" && j.mode === "fail-open" && j.kunci === "uji:log-lunak"),
    `log tertangkap: ${tangkap.length} baris`,
  );
  // buatRateLimiterKeras (factory): mengembalikan hasil yang sama.
  const batasiKeras = api.buatRateLimiterKeras(5);
  const req = new Request("https://uji.id/api/x", { method: "POST" });
  const h3 = await batasiKeras(req);
  cek(
    "T3: buatRateLimiterKeras factory -> rpc-gagal saat RPC mati",
    h3.lolos === false && h3.alasan === "rpc-gagal",
    JSON.stringify(h3),
  );
}

// ---------- §C2. Sapuan: 12+2 route keras memakai pola fail-closed ----------
// Klaim B1/B2: 12 route mutasi berisiko + progres + sertifikat = 14
// (kenyataannya 18 berkas memakai buatRateLimiterKeras — diverifikasi).
console.log("\n== §C2. Sapuan route fail-closed vs fail-open ==");
const BERKAS_KERAS_HARAPAN = [
  "src/app/api/ai/brief/route.ts",
  "src/app/api/ai/data-analysis/route.ts",
  "src/app/api/ai/jalankan/route.ts",
  "src/app/api/akademi/kuis/jawab/route.ts",
  "src/app/api/akademi/progres/route.ts",
  "src/app/api/akademi/sertifikat/route.ts",
  "src/app/api/ingestion/jalankan/route.ts",
  "src/app/api/kuis/jawab/route.ts",
  "src/app/api/kuis/skor/route.ts",
  "src/app/api/langganan/route.ts",
  "src/app/api/laporan-publik/route.ts",
  "src/app/api/laporan/route.ts",
  "src/app/api/saya/akun/hapus/minta/route.ts",
  "src/app/api/saya/akun/hapus/route.ts",
  "src/app/api/saya/data/route.ts",
  "src/app/api/sumber/[id]/cek/route.ts",
  "src/app/api/tanya/draf/route.ts",
  "src/app/api/tanya/route.ts",
  "src/app/api/tanya/[id]/membantu/route.ts",
];
{
  let semuaKeras = true;
  for (const rel of BERKAS_KERAS_HARAPAN) {
    const isi = bacaRepo(rel);
    // Pola fail-closed: factory buatRateLimiterKeras ATAU panggilan
    // langsung cekRateLimitDbKeras (membantu/route.ts) + 503 rpc-gagal.
    const pakai =
      (/buatRateLimiterKeras/.test(isi) || /cekRateLimitDbKeras/.test(isi)) &&
      /responRateLimitBelumSiap/.test(isi) &&
      /alasan === "rpc-gagal"/.test(isi);
    if (!pakai) semuaKeras = false;
    cek(`T3 keras: ${rel} memakai limiter keras + 503 rpc-gagal`, pakai);
  }
  cek("T3 keras: 19 berkas harapan semuanya berpola fail-closed", semuaKeras);
  // Route mutasi yang MASIH fail-open (buatRateLimiter/buatRateLimiterAdmin
  // saja) — dicatat per berkas + kelas risikonya, bukan digagalkan:
  // staf-only / tulis data diri sendiri = fail-open sesuai desain.
  const routeApi = semuaBerkas(`${DIR_REPO}src/app/api`).filter((f) =>
    f.endsWith("route.ts"),
  );
  for (const f of routeApi) {
    const isi = fs.readFileSync(f, "utf8");
    if (!/export async function (POST|PATCH|PUT|DELETE)/.test(isi)) continue;
    if (/buatRateLimiterKeras|cekRateLimitDbKeras/.test(isi)) continue;
    const rel = f.replace(DIR_REPO, "");
    const staf = /autentikasiAdmin|autentikasiStaf|ROLES\.EDITOR|ROLES\.SUPER_ADMIN/.test(isi);
    const kelas = staf
      ? "staf-only (fail-open desain: admin internal)"
      : "pengguna-login (tulis data sendiri; fail-open)";
    catatTemuan(
      `T3 fail-open tersisa: ${rel}`,
      `kelas ${kelas} — BUKAN di 19 route keras; dilaporkan, bukan ditutup di Tahap D (di luar ownership berkas route)`,
    );
  }
}

// ---------- §D. T6: SSRF — pinning, privat, re-resolusi, timeout DNS ----------
console.log("\n== §D. T6: SSRF (ssrf.ts + allowlist) ==");
const ssrfMod = { exports: {} };
{
  const kodeSsrf = transpileKeJs(bacaRepo("src/lib/ingestion/ssrf.ts"));
  const fn = new Function("require", "module", "exports", kodeSsrf);
  fn(require, ssrfMod, ssrfMod.exports);
}
const ssrf = ssrfMod.exports;
cek("T6: BATAS_DNS_MS = 5000", ssrf.BATAS_DNS_MS === 5000, `dapat ${ssrf.BATAS_DNS_MS}`);
{
  // ipPrivat: semua rentang privat/link-local/loopback/CGNAT/multicast.
  const kasusPrivat = [
    ["10.0.0.1", true], ["10.255.255.255", true],
    ["172.16.0.1", true], ["172.31.255.255", true], ["172.15.0.1", false],
    ["172.32.0.1", false], ["192.168.1.1", true],
    ["127.0.0.1", true], ["127.9.9.9", true],
    ["169.254.169.254", true], ["169.254.0.1", true],
    ["0.0.0.0", true], ["0.1.2.3", true],
    ["100.64.0.1", true], ["100.127.255.255", true], ["100.128.0.1", false],
    ["224.0.0.1", true], ["240.0.0.1", true], ["255.255.255.255", true],
    ["8.8.8.8", false], ["1.1.1.1", false], ["93.184.216.34", false],
    ["::1", true], ["::", true], ["fe80::1", true], ["febf::1", true],
    ["fec0::1", false], ["fc00::1", true], ["fd12:3456::1", true],
    ["::ffff:127.0.0.1", true], ["::ffff:7f00:0001", true],
    ["::ffff:8.8.8.8", false], ["2001:4860:4860::8888", false],
  ];
  let semuaBenar = true;
  for (const [ip, harap] of kasusPrivat) {
    if (ssrf.ipPrivat(ip) !== harap) {
      semuaBenar = false;
      console.log(`  ipPrivat salah: ${ip} harap ${harap} dapat ${ssrf.ipPrivat(ip)}`);
    }
  }
  cek("T6: ipPrivat benar di 33 kasus (v4+v6+mapped)", semuaBenar);
  // Pengecualian TERDOKUMENTASI: 198.18/15 (benchmarking) tidak diblokir
  // karena resolver egress VM menjawab SEMUA host dari rentang itu.
  cek(
    "T6: 198.18/15 SENGAJA tidak privat (pengecualian terdokumentasi)",
    ssrf.ipPrivat("198.18.0.1") === false && ssrf.ipPrivat("198.19.255.255") === false,
  );
  // tolakHostPrivat: literal privat ditolak TANPA DNS; localhost ditolak.
  cek(
    "T6: tolakHostPrivat menolak literal 169.254.169.254",
    (await ssrf.tolakHostPrivat("http://169.254.169.254/latest/meta-data/")) ===
      "Host mengarah ke alamat privat.",
  );
  cek(
    "T6: tolakHostPrivat menolak 10.x",
    (await ssrf.tolakHostPrivat("http://10.1.2.3/admin")) ===
      "Host mengarah ke alamat privat.",
  );
  cek(
    "T6: tolakHostPrivat menolak localhost + nama tanpa titik",
    (await ssrf.tolakHostPrivat("http://localhost:3000/")) === "Host lokal tidak diizinkan." &&
      (await ssrf.tolakHostPrivat("http://intranet/")) === "Host lokal tidak diizinkan.",
  );
  cek(
    "T6: tolakHostPrivat menolak URL tak valid",
    (await ssrf.tolakHostPrivat("ht tp://:::")) === "URL tidak valid.",
  );
  // periksaUlangResolusi (mock resolver): irisan cocok / berubah / DNS gagal.
  cek(
    "T6: re-resolusi cocok -> null",
    (await ssrf.periksaUlangResolusi("https://a.uji/x", ["1.2.3.4"], async () => ["1.2.3.4", "5.6.7.8"])) === null,
  );
  const berubah = await ssrf.periksaUlangResolusi("https://a.uji/x", ["1.2.3.4"], async () => ["9.9.9.9"]);
  cek(
    "T6: re-resolusi berubah total -> penolakan (rebinding)",
    typeof berubah === "string" && /berubah sesudah fetch/.test(berubah),
    String(berubah),
  );
  cek(
    "T6: re-resolusi DNS gagal -> null (fail-open terdokumentasi)",
    (await ssrf.periksaUlangResolusi("https://a.uji/x", ["1.2.3.4"], async () => { throw new Error("dns down"); })) === null,
  );
  const t0 = Date.now();
  const gantung = await ssrf.periksaUlangResolusi("https://a.uji/x", ["1.2.3.4"], () => new Promise(() => {}));
  const dur = Date.now() - t0;
  cek(
    "T6: re-resolusi resolver menggantung -> null dalam ~5 dtk (BATAS_DNS_MS)",
    gantung === null && dur >= 4500 && dur < 8000,
    `durasi ${dur} ms`,
  );
}
// fetchTerpin: transport pinning ke server lokal + penolakan privat + timeout DNS.
{
  const server = http.createServer((req, res) => {
    res.setHeader("x-host-diterima", req.headers.host ?? "");
    res.end("OK-PINNING");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const res = await ssrf.fetchTerpin(`http://uji.lokal:${port}/jalan?x=1`, {}, {
      penyelesaian: async () => ["127.0.0.1"],
      izinkanPrivat: true,
    });
    const badan = await res.text();
    cek(
      "T6 pinning: fetchTerpin ke server lokal via IP terpin -> 200 + badan",
      res.status === 200 && badan === "OK-PINNING",
      `status ${res.status}`,
    );
    cek(
      "T6 pinning: Host header = hostname asli (bukan IP)",
      res.headers.get("x-host-diterima") === `uji.lokal:${port}`,
      `dapat ${res.headers.get("x-host-diterima")}`,
    );
    // Metode non-GET ditolak; literal privat ditolak; skema non-http ditolak.
    let tolakMetode = null;
    try {
      await ssrf.fetchTerpin(`http://uji.lokal:${port}/`, { method: "POST" }, { penyelesaian: async () => ["127.0.0.1"], izinkanPrivat: true });
    } catch (e) {
      tolakMetode = e.message;
    }
    cek("T6 pinning: POST ditolak", typeof tolakMetode === "string" && /Metode POST tidak didukung/.test(tolakMetode), String(tolakMetode));
    let tolakPrivat = null;
    try {
      await ssrf.fetchTerpin("http://169.254.169.254/latest/");
    } catch (e) {
      tolakPrivat = e.message;
    }
    cek(
      "T6 pinning: literal privat ditolak SEBELUM koneksi",
      typeof tolakPrivat === "string" && tolakPrivat.startsWith("URL ditolak:"),
      String(tolakPrivat),
    );
    // Timeout DNS: resolver menggantung -> tolak dalam ~5 dtk, BUKAN gantung.
    const t1 = Date.now();
    let galatTimeout = null;
    try {
      await ssrf.fetchTerpin("https://host-menggantung.uji/", {}, { penyelesaian: () => new Promise(() => {}) });
    } catch (e) {
      galatTimeout = e.message;
    }
    const d1 = Date.now() - t1;
    cek(
      "T6 pinning: resolver menggantung -> gagal dalam ~5 dtk (bukan gantung)",
      typeof galatTimeout === "string" && /kehabisan waktu/.test(galatTimeout) && d1 >= 4500 && d1 < 9000,
      `${d1} ms: ${String(galatTimeout)}`,
    );
  } finally {
    server.close();
  }
}
// fetchAman: redirect ke privat ditolak; redirect ke luar allowlist (ingestion) ditolak.
{
  const ambilRedirectPrivat = async () =>
    new Response(null, { status: 302, headers: { location: "http://169.254.169.254/x" } });
  let tolakRedirect = null;
  try {
    // Hop 0 diizinkan mock (URL awal publik); hop lanjutan dicek
    // tolakHostPrivat ASLI — redirect ke privat wajib ditolak.
    await ssrf.fetchAman("http://93.184.216.34/a", {}, ambilRedirectPrivat, {
      periksaHost: async () => null,
      periksaHopLanjutan: ssrf.tolakHostPrivat,
    });
  } catch (e) {
    tolakRedirect = e.message;
  }
  cek(
    "T6 fetchAman: redirect 302 ke 169.254.169.254 DITOLAK",
    typeof tolakRedirect === "string" && tolakRedirect.startsWith("URL ditolak:"),
    String(tolakRedirect),
  );
  // Jalur ingestion: hop lanjutan di luar allowlist ditolak.
  const gdeltSrc = bacaRepo("src/lib/ingestion/gdelt.ts");
  const rssSrc = bacaRepo("src/lib/ingestion/rss.ts");
  cek("T6: GDELT memakai fetchAman + tolakHostFeedAman", /fetchAman\(/.test(gdeltSrc) && /periksaHost: tolakHostFeedAman/.test(gdeltSrc));
  cek("T6: RSS memakai fetchAman (bukan fetch mentah)", /fetchAman\(/.test(rssSrc) && !/[^A-Za-z]fetch\(/.test(rssSrc.replace(/fetchAman/g, "")));
}
// ---------- §D2. Allowlist feed: 8 host, exact-match ----------
console.log("\n== §D2. Allowlist feed (8 host exact-match) ==");
{
  const kodeAllow = transpileKeJs(bacaRepo("src/lib/ingestion/feed-allowlist.ts"));
  const mod = { exports: {} };
  // feed-allowlist mengimpor tolakHostPrivat dari ssrf.ts — stub dengan
  // implementasi ssrf yang sudah dimuat (perilaku sama untuk uji ini).
  const fnAllow = new Function("require", "module", "exports", kodeAllow);
  const requireAllow = (nama) => {
    if (nama === "./ssrf.ts") return { tolakHostPrivat: ssrf.tolakHostPrivat };
    return require(nama);
  };
  fnAllow(requireAllow, mod, mod.exports);
  const allow = mod.exports;
  cek("T6 allowlist: tepat 8 host", allow.HOST_FEED_DIIZINKAN.size === 8, `dapat ${allow.HOST_FEED_DIIZINKAN.size}`);
  const diizinkan = [
    "https://www.antaranews.com/rss/terkini.xml",
    "https://www.cnnindonesia.com/rss",
    "https://feed.liputan6.com/rss",
    "https://www.cnbcindonesia.com/rss",
    "https://www.tribunnews.com/rss",
    "https://www.republika.co.id/rss",
    "https://feeds.bbci.co.uk/news/rss.xml",
    "https://api.gdeltproject.org/api/v2/doc/doc?query=x",
  ];
  cek(
    "T6 allowlist: 8/8 host seed + GDELT diizinkan",
    diizinkan.every((u) => allow.hostFeedDiizinkan(u)),
  );
  const ditolak = [
    "https://evil.antaranews.com/rss", // subdomain TIDAK otomatis
    "https://antaranews.com.evil.test/rss",
    "https://WWW.ANTARANEWS.COM.evil.test/rss",
    "https://api.gdeltproject.org.evil.test/x",
    "https://example.com/rss",
    // ftp TIDAK diuji di sini: hostFeedDiizinkan hanya memeriksa
    // hostname (skema diperiksa tolakHostFeed — asersi di bawah).
  ];
  const hasilTolak = ditolak.map((u) => allow.hostFeedDiizinkan(u));
  cek("T6 allowlist: subdomain/host asing ditolak (5/5)", hasilTolak.every((v) => v === false));
  cek(
    "T6 allowlist: huruf besar host tetap cocok (lowercase)",
    allow.hostFeedDiizinkan("https://WWW.ANTARANEWS.COM/rss") === true,
  );
  cek(
    "T6 allowlist: tolakHostFeed menolak host luar + bukan http(s)",
    allow.tolakHostFeed("https://example.com/x") !== null &&
      allow.tolakHostFeed("ftp://www.antaranews.com/x") !== null &&
      allow.tolakHostFeed("https://www.antaranews.com/x") === null,
  );
  catatTemuan(
    "T6 allowlist: port non-standar pada host allowlist tetap lolos (hostname-only check)",
    "hostFeedDiizinkan memakai hostname saja — https://www.antaranews.com:8443 lolos; risiko rendah (host tetap allowlist, TLS tetap memverifikasi nama), dicatat apa adanya",
  );
  // BATAS JUJUR T6 (dari VM): pinning penuh ke internet TIDAK bisa
  // dibuktikan dari VM — middlebox menjawab DNS palsu + memutus
  // koneksi langsung ke IP. Dicatat sebagai batas, bukan kegagalan.
  catatTemuan(
    "T6 BATAS: pinning HTTPS penuh ke internet BELUM terverifikasi dari VM ini",
    "bukti VM: lookup host publik dijawab middlebox (198.18/15); koneksi langsung ke IP diputus — fetchAman jatuh ke fallback + re-resolusi (TOCTOU hanya dipersempit). Verifikasi penuh butuh egress langsung (Vercel/staging).",
  );
}

// ---------- §E. T10: sapuan audit SEMUA route mutasi admin ----------
// Aturan: tiap handler mutasi admin WAJIB (a) memanggil
// catatAuditWajib langsung, atau (b) memanggil fungsi editorial.ts /
// kendali.ts yang mengaudit fail-closed (catat()/catatAuditWajib —
// melempar bila insert gagal, tanpa try/catch penelan).
console.log("\n== §E. T10: sapuan audit route mutasi admin ==");
const editorialSrc = bacaRepo("src/lib/admin/editorial.ts");
const kendaliSrc = bacaRepo("src/lib/admin/kendali.ts");
function namaFungsiTereksporDenganPola(src, polaIsi) {
  const keluar = new Set();
  const re = /export async function (\w+)\([\s\S]*?\n\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (polaIsi.test(m[0])) keluar.add(m[1]);
  }
  return keluar;
}
// `catat(` internal editorial.ts: tanpa try/catch -> melempar bila gagal.
const fungsiEditorialAudit = namaFungsiTereksporDenganPola(editorialSrc, /\bawait catat\(/);
// Perluasan transitif: fungsi yang memanggil fungsi beraudit (mis.
// terbitkanTerjadwal -> terbitkanArtikel) ikut terhitung mengaudit.
{
  let berubah = true;
  while (berubah) {
    berubah = false;
    for (const m of editorialSrc.matchAll(/export async function (\w+)\([\s\S]*?\n\}/g)) {
      if (fungsiEditorialAudit.has(m[1])) continue;
      if ([...fungsiEditorialAudit].some((nama) => new RegExp(`\\bawait ${nama}\\(`).test(m[0]))) {
        fungsiEditorialAudit.add(m[1]);
        berubah = true;
      }
    }
  }
}
const fungsiKendaliAudit = namaFungsiTereksporDenganPola(kendaliSrc, /catatAuditWajib/);
cek(
  "T10: editorial.ts punya >=15 fungsi yang mengaudit (catat fail-closed)",
  fungsiEditorialAudit.size >= 15,
  `${[...fungsiEditorialAudit].join(", ")}`,
);
cek(
  "T10: kendali.ts punya fungsi yang mengaudit (setFlag/pemicuJobManual)",
  fungsiKendaliAudit.size >= 2,
  `${[...fungsiKendaliAudit].join(", ")}`,
);
{
  const routeAdmin = semuaBerkas(`${DIR_REPO}src/app/api/admin`).filter((f) =>
    f.endsWith("route.ts"),
  );
  let tanpaAudit = [];
  let denganAudit = 0;
  for (const f of routeAdmin) {
    const isi = fs.readFileSync(f, "utf8");
    if (!/export async function (POST|PATCH|PUT|DELETE)/.test(isi)) continue;
    const langsung = /catatAuditWajib/.test(isi);
    const lewatLib = [...fungsiEditorialAudit, ...fungsiKendaliAudit].some((nama) =>
      new RegExp(`\\b${nama}\\b`).test(isi),
    );
    if (langsung || lewatLib) denganAudit++;
    else tanpaAudit.push(f.replace(DIR_REPO, ""));
  }
  cek(
    "T10: SEMUA route mutasi admin mengaudit (langsung / lewat editorial/kendali)",
    tanpaAudit.length === 0,
    tanpaAudit.length ? `tanpa audit: ${tanpaAudit.join(", ")}` : `${denganAudit} route mutasi diaudit`,
  );
  // 4 jalur best-effort lama (B1): pengetahuan, riset, data, kendali flags/jobs.
  // Diterima bila route memakai catatAuditWajib LANGSUNG atau memanggil
  // fungsi kendali.ts yang mengaudit (flags/jalankan memanggil lib).
  const fungsiAuditSemua = new Set([...fungsiEditorialAudit, ...fungsiKendaliAudit]);
  const auditLewat = (isi) =>
    /catatAuditWajib/.test(isi) ||
    [...fungsiAuditSemua].some((nama) => new RegExp(`\\b${nama}\\b`).test(isi));
  for (const rel of [
    "src/app/api/admin/pengetahuan/route.ts",
    "src/app/api/admin/pengetahuan/[id]/route.ts",
    "src/app/api/admin/riset/route.ts",
    "src/app/api/admin/riset/[id]/route.ts",
    "src/app/api/admin/data/route.ts",
    "src/app/api/admin/data/[id]/route.ts",
    "src/app/api/admin/kendali/flags/route.ts",
    "src/app/api/admin/kendali/jalankan/route.ts",
  ]) {
    const isi = bacaRepo(rel);
    cek(
      `T10 (B1): ${rel} mengaudit fail-closed (langsung / lewat lib)`,
      auditLewat(isi),
    );
  }
  // Compensating ada di 4 jalur itu + kendali (bukan sekadar audit).
  cek(
    "T10: compensating delete/restore ada di pengetahuan/riset/data/kendali",
    /compensat/.test(bacaRepo("src/app/api/admin/pengetahuan/route.ts")) &&
      /compensat/.test(bacaRepo("src/app/api/admin/riset/route.ts")) &&
      /compensat/.test(bacaRepo("src/app/api/admin/data/route.ts")) &&
      /compensat/.test(kendaliSrc),
  );
  // TIDAK ADA lagi pola best-effort penelan galat audit di route/lib admin,
  // KECUALI yang terdokumentasi: catatUpayaGate (penanda backoff gate,
  // bukan aksi admin) + notifikasi best-effort (bukan audit).
  // Koreksi integrasi Tahap C: catch boleh mengikat variabel
  // (catch (err) {) — pola tetap terdeteksi sesudah perbaikan C-4.
  // LOG KEGAGALAN GANDA yang dirancang (bukan penelan audit):
  // bila audit gagal DAN compensating ikut gagal, operasi sudah
  // dijawab 500 dan satu-satunya yang tersisa adalah log
  // terstruktur ke server ("audit_compensating_*_gagal" /
  // "TETAP DICABUT TANPA AUDIT"). Berkas yang HANYA punya
  // kecocokan semacam itu bukan pelanggar.
  const polaBestEffort = /catch\s*(?:\([^)]*\))?\s*\{[^}]*console\.error\([^)]*audit/gi;
  const polaLogGanda = /compensating|tanpa audit/i;
  const pelanggar = [];
  for (const f of [
    ...semuaBerkas(`${DIR_REPO}src/app/api`),
    ...semuaBerkas(`${DIR_REPO}src/lib/admin`),
  ]) {
    const isi = fs.readFileSync(f, "utf8");
    if (f.endsWith("editorial.ts")) continue;
    const cocok = [...isi.matchAll(polaBestEffort)];
    // Uji konteks sesudah kecocokan juga: pola berhenti tepat di
    // kata "audit", padahal penanda log ganda ("audit_compensating_*")
    // baru muncul SESUDAH kata itu.
    const nyata = cocok.filter((m) => !polaLogGanda.test(isi.slice(m.index, m.index + m[0].length + 120)));
    if (nyata.length > 0) pelanggar.push(f.replace(DIR_REPO, ""));
  }
  // Pengecualian TERDOKUMENTASI (bukan penelan audit operasi):
  // saya/akun/hapus/route.ts — catch di jalur KEGAGALAN (deleteUser
  // sudah gagal, operasi sudah dijawab 500): audit kegagalan yang
  // ikut gagal hanya dicatat ke log server; tidak ada operasi
  // sukses yang lolos tanpa audit.
  const pengecualianBestEffort = ["src/app/api/saya/akun/hapus/route.ts"];
  const pelanggarNyata = pelanggar.filter((p) => !pengecualianBestEffort.includes(p));
  cek("T10: 0 pola best-effort penelan galat audit di route/lib admin (di luar editorial.ts + pengecualian hapus-akun)", pelanggarNyata.length === 0, pelanggarNyata.join(", "));
  cek(
    "T10: pengecualian hapus-akun memang jalur kegagalan (operasi sudah 500)",
    pelanggar.includes("src/app/api/saya/akun/hapus/route.ts") &&
      /deleteUser gagal DAN audit kegagalan gagal dicatat/.test(bacaRepo("src/app/api/saya/akun/hapus/route.ts")),
  );
  // catatUpayaGate: SATU-SATUNYA best-effort audit yang tersisa —
// penanda backoff gate terbit, BUKAN aksi administratif; terdokumentasi.
  cek(
    "T10: catatUpayaGate terdokumentasi best-effort (penanda backoff, bukan aksi)",
    /Penanda backoff bersifat best-effort/.test(editorialSrc),
  );
  // TEMUAN: jalur editorial.ts (artikel/brief/koreksi/pengguna/sistem
  // jobs/kategori) mengaudit fail-closed di level RESPONS (galat naik
  // -> 500/503) TETAPI tanpa compensating restore — bila insert audit
  // gagal SESUDAH mutasi, baris tetap berubah tanpa jejak audit.
  // (audit.ts sudah mendokumentasikan kelas residual ini secara umum;
  // di sini dibuktikan konkret per jalur.)
  const tanpaCompensating = [...fungsiEditorialAudit].filter((nama) => {
    const m = new RegExp(`export async function ${nama}\\([\\s\\S]*?\\n\\}`).exec(editorialSrc);
    return m && !/compensat|pulih|hapus-balik|kembalikan/i.test(m[0]);
  });
  catatTemuan(
    "T10 RESIDUAL: fungsi editorial.ts tanpa compensating bila audit gagal sesudah mutasi",
    `${tanpaCompensating.length} fungsi (${tanpaCompensating.join(", ")}) — respons 500/503 jujur, TAPI mutasi (mis. artikel terbit) TIDAK di-rollback; baris yatim tanpa audit masih mungkin. Perbaikan butuh transaksi/RPC lintas tulis+audit (follow-up migrasi) atau compensating per fungsi — DI LUAR ownership Tahap D (editorial.ts milik agen lain).`,
  );
  // Perubahan sumber (T10): route /api/sumber mengaudit fail-closed.
  for (const rel of ["src/app/api/sumber/route.ts", "src/app/api/sumber/[id]/route.ts", "src/app/api/sumber/[id]/cek/route.ts"]) {
    cek(`T10: ${rel} memakai catatAuditWajib`, /catatAuditWajib/.test(bacaRepo(rel)));
  }
}
// CHECK constraint aksi audit di PGlite (v14): aksi dikenal lolos, bebas ditolak.
{
  const kolom = await db.query(
    `select column_name from information_schema.columns where table_schema='public' and table_name='pf_audit_logs'`,
  );
  const namaKolom = new Set(kolom.rows.map((r) => r.column_name));
  const basis = {
    aktor_id: "11111111-1111-1111-1111-111111111111",
    aktor_email: "uji@uji.id",
    aksi: "sumber.buat",
    entitas: "pf_sources",
    entitas_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    sebelum: "{}",
    sesudah: "{}",
    ip: null,
  };
  const kolomPakai = Object.keys(basis).filter((k) => namaKolom.has(k));
  const nilai = kolomPakai.map((k) => basis[k]);
  const tempat = kolomPakai
    .map((k, i) => (k === "sebelum" || k === "sesudah" ? `$${i + 1}::jsonb` : `$${i + 1}`))
    .join(", ");
  let okDikenal = false;
  try {
    await sebagai(
      "service_role",
      `insert into public.pf_audit_logs (${kolomPakai.join(", ")}) values (${tempat})`,
      nilai,
    );
    okDikenal = true;
  } catch (e) {
    console.log(`  insert sumber.buat gagal: ${String(e.message).split("\n")[0]}`);
  }
  cek("T10: audit aksi 'sumber.buat' lolos CHECK v14", okDikenal);
  let tolakBebas = false;
  try {
    await sebagai(
      "service_role",
      `insert into public.pf_audit_logs (${kolomPakai.join(", ")}) values (${tempat})`,
      nilai.map((v, i) => (kolomPakai[i] === "aksi" ? "aksi.bebas" : v)),
    );
  } catch {
    tolakBebas = true;
  }
  cek("T10: audit aksi bebas DITOLAK CHECK v14", tolakBebas);
}

// ---------- §F. CSP: unit (header + hash tema) ----------
console.log("\n== §F. CSP (unit: header + hash tema) ==");
{
  const kodeCsp = transpileKeJs(bacaRepo("src/lib/csp.ts"));
  const mod = { exports: {} };
  new Function("require", "module", "exports", kodeCsp)(require, mod, mod.exports);
  const csp = mod.exports;
  const headerProd = csp.buatHeaderCsp("NONCE-UJI-123", { isDev: false, supabaseOrigin: "https://xyz.supabase.co" });
  const headerDev = csp.buatHeaderCsp("NONCE-UJI-123", { isDev: true });
  cek("CSP: header produksi memuat nonce per-request", headerProd.includes("'nonce-NONCE-UJI-123'"));
  // TANPA 'strict-dynamic' (dicabut 16 Nov 2026, pasca-live): dengan
  // strict-dynamic, 'self' diabaikan dan chunk <script src> dari
  // shell statis prerender (tanpa nonce) diblokir CSP — hidrasi
  // mati di seluruh situs. Chunk same-origin diizinkan 'self'.
  cek("CSP: header produksi TANPA 'strict-dynamic'", !headerProd.includes("'strict-dynamic'"));
  cek("CSP: script-src produksi memuat 'self'", /script-src[^;]*'self'/.test(headerProd));
  cek("CSP: script-src produksi TANPA 'unsafe-inline'", !/script-src[^;]*'unsafe-inline'/.test(headerProd));
  cek("CSP: script-src produksi TANPA 'unsafe-eval'", !/script-src[^;]*'unsafe-eval'/.test(headerProd));
  cek("CSP: header dev MEMUAT 'unsafe-eval' (React dev, terdokumentasi)", /script-src[^;]*'unsafe-eval'/.test(headerDev));
  cek("CSP: object-src 'none' + frame-ancestors 'none' + base-uri 'self'", headerProd.includes("object-src 'none'") && headerProd.includes("frame-ancestors 'none'") && headerProd.includes("base-uri 'self'"));
  cek("CSP: style-src 'unsafe-inline' TERDOKUMENTASI (atribut style React, bukan jalur XSS)", headerProd.includes("style-src 'self' 'unsafe-inline'"));
  cek("CSP: connect-src memuat origin Supabase dari env", headerProd.includes("https://xyz.supabase.co"));
  // Hash skrip tema: sha256 isi skrip di layout.tsx == HASH_SKRIP_TEMA.
  const layout = bacaRepo("src/app/layout.tsx");
  // Ekstraksi robust: ambil literal template `...` sesudah "const kode = ".
  const mTpl = /const kode = `([\s\S]*?)`;/.exec(layout);
  const skripTema = mTpl ? mTpl[1] : null;
  const hashHitung = skripTema
    ? `'sha256-${createHash("sha256").update(skripTema, "utf8").digest("base64")}'`
    : null;
  cek(
    "CSP: hash skrip tema di layout.tsx == HASH_SKRIP_TEMA",
    skripTema !== null && hashHitung === csp.HASH_SKRIP_TEMA,
    `hitung ${hashHitung} vs konstanta ${csp.HASH_SKRIP_TEMA}`,
  );
  cek("CSP: header produksi memuat hash skrip tema", headerProd.includes(csp.HASH_SKRIP_TEMA));
  // Dua nonce berbeda -> header berbeda (nonce unik per request).
  cek(
    "CSP: nonce berbeda -> header berbeda",
    csp.buatHeaderCsp("AAA", { isDev: false }) !== csp.buatHeaderCsp("BBB", { isDev: false }),
  );
}

// ---------- §G. CSRF: unit apakahAsalDiizinkan + sapuan proxy/per-route ----------
console.log("\n== §G. CSRF (unit + sapuan) ==");
{
  const kodeAsal = transpileKeJs(asalSrc);
  const mod = { exports: {} };
  new Function("require", "module", "exports", kodeAsal)(require, mod, mod.exports);
  const { apakahAsalDiizinkan } = mod.exports;
  const H = (obj) => ({ get: (n) => obj[n.toLowerCase()] ?? null });
  const SITE = "https://prata.example";
  cek("CSRF: tanpa Origin+Referer -> lolos (klien non-browser, terdokumentasi)", apakahAsalDiizinkan(H({}), SITE) === true);
  cek("CSRF: Origin sama dengan PF_SITE_URL -> lolos", apakahAsalDiizinkan(H({ origin: "https://prata.example", host: "lain.example" }), SITE) === true);
  cek("CSRF: Origin = host request -> lolos", apakahAsalDiizinkan(H({ origin: "http://localhost:3000", host: "localhost:3000" }), SITE) === true);
  cek("CSRF: Origin lintas situs -> DITOLAK", apakahAsalDiizinkan(H({ origin: "https://evil.test", host: "localhost:3000" }), SITE) === false);
  cek("CSRF: Origin 'null' (sandbox) -> DITOLAK", apakahAsalDiizinkan(H({ origin: "null", host: "localhost:3000" }), SITE) === false);
  cek("CSRF: Origin bukan URL -> DITOLAK", apakahAsalDiizinkan(H({ origin: ":::bukan-url", host: "localhost:3000" }), SITE) === false);
  cek("CSRF: Referer saja cocok -> lolos", apakahAsalDiizinkan(H({ referer: "https://prata.example/admin", host: "localhost:3000" }), SITE) === true);
  cek("CSRF: Referer saja lintas situs -> DITOLAK", apakahAsalDiizinkan(H({ referer: "https://evil.test/x", host: "localhost:3000" }), SITE) === false);
  cek("CSRF: host sama, skema beda (dev http vs https) -> lolos via host", apakahAsalDiizinkan(H({ origin: "http://prata.example/x", host: "prata.example" }), "https://prata.example") === true);
  // Sapuan: cek terpusat di proxy.ts + lapis kedua per-route.
  const proxySrc = bacaRepo("src/proxy.ts");
  cek(
    "CSRF: proxy.ts punya cek terpusat (semua mutasi /api/*)",
    /METODE_MUTASI/.test(proxySrc) &&
      /pathname\.startsWith\("\/api\/"\)/.test(proxySrc) &&
      /apakahAsalDiizinkan\(request\.headers/.test(proxySrc) &&
      /status: 403/.test(proxySrc),
  );
  cek("CSRF: cek proxy ditempatkan SEBELUM refresh sesi", proxySrc.indexOf("apakahAsalDiizinkan") < proxySrc.indexOf("supabase.auth.getUser()"));
  const routeSemua = semuaBerkas(`${DIR_REPO}src/app/api`).filter((f) => f.endsWith("route.ts"));
  let pakaiCekOrigin = 0;
  let mutasiTotal = 0;
  for (const f of routeSemua) {
    const isi = fs.readFileSync(f, "utf8");
    if (!/export async function (POST|PATCH|PUT|DELETE)/.test(isi)) continue;
    mutasiTotal++;
    if (/cekOrigin\(/.test(isi)) pakaiCekOrigin++;
  }
  cek(
    "CSRF: lapis kedua per-route (cekOrigin) dipakai sebagian route mutasi",
    pakaiCekOrigin > 0,
    `${pakaiCekOrigin}/${mutasiTotal} route mutasi memanggil cekOrigin (sisanya hanya mengandalkan proxy terpusat)`,
  );
  catatTemuan(
    "CSRF: lapis kedua per-route tidak di semua route mutasi",
    `${mutasiTotal - pakaiCekOrigin} dari ${mutasiTotal} route mutasi TIDAK memanggil cekOrigin — terlindung oleh cek terpusat proxy.ts; bila matcher proxy berubah, route itu telanjang. Bukan celah hari ini, dicatat sebagai ketergantungan pada proxy.`,
  );
}

// ---------- §H. Cookie flags + sesi ----------
console.log("\n== §H. Cookie sesi (flags + alasan) ==");
{
  const proxySrc = bacaRepo("src/proxy.ts");
  const serverSrc = bacaRepo("src/lib/supabase/server.ts");
  const clientSrc = bacaRepo("src/lib/supabase/client.ts");
  for (const [nama, src] of [["proxy.ts", proxySrc], ["lib/supabase/server.ts", serverSrc], ["lib/supabase/client.ts", clientSrc]]) {
    cek(`${nama}: secure:true di produksi`, /secure: process\.env\.NODE_ENV === "production"/.test(src));
    cek(`${nama}: sameSite lax`, /sameSite: "lax"/.test(src));
    cek(`${nama}: httpOnly:false eksplisit`, /httpOnly: false/.test(src));
  }
  cek(
    "Cookie: alasan httpOnly:false TERDOKUMENTASI (I-3: memecahkan sesi klien)",
    /httpOnly.*SENGAJA|SENGAJA.*httpOnly/.test(serverSrc) && /httpOnly/.test(proxySrc),
  );
  cek("Cookie: proxy memanggil refresh sesi (getUser) tiap request", /await supabase\.auth\.getUser\(\)/.test(proxySrc));
  catatTemuan(
    "Cookie RESIDUAL: httpOnly:false TETAP (I-3) — flip butuh refactor AuthArea/profil/masuk ke Server Components",
    "di luar tugas Tahap D; XSS yang berhasil masih bisa membaca cookie sesi (diredam CSP + React escaping + tanpa permukaan upload).",
  );
}

// ---------- §I. RLS/GRANT/SQLi/XSS/prompt-injection/eskalasi/admin/backup/upload/API ----------
console.log("\n== §I. Sapuan keamanan umum ==");
{
  const semuaSrc = semuaBerkas(`${DIR_REPO}src`);
  // SQLi: query SQL mentah di kode aplikasi = 0 (semua lewat supabase-js/RPC).
  const polaSql = [/\.query\s*\(/, /\.execute\s*\(/, /SELECT\s+[\w*,\s]+\s+FROM\s+\w+/i, /INSERT\s+INTO\s+\w+\s+VALUES/i, /from\(['"]\s*select/i];
  const temuanSql = [];
  for (const f of semuaSrc) {
    const isi = fs.readFileSync(f, "utf8");
    for (const pola of polaSql) {
      if (pola.test(isi)) temuanSql.push(`${f.replace(DIR_REPO, "")}: ${pola}`);
    }
  }
  cek("SQLi: 0 query SQL mentah di src/ (parameterized supabase-js/RPC)", temuanSql.length === 0, temuanSql.slice(0, 5).join(" | "));
  // XSS: 3 situs dangerouslySetInnerHTML — verifikasi masing-masing aman.
  const situs = [];
  for (const f of semuaSrc) {
    const isi = fs.readFileSync(f, "utf8");
    if (/dangerouslySetInnerHTML/.test(isi)) situs.push(f.replace(DIR_REPO, ""));
  }
  cek("XSS: tepat 3 situs dangerouslySetInnerHTML (dikenal)", situs.length === 3, situs.join(", "));
  const layout = bacaRepo("src/app/layout.tsx");
  cek(
    "XSS: skrip tema = string STATIS (IIFE, bukan input pengguna)",
    /const kode = `\(function\(\)\{try\{/.test(layout),
  );
  for (const rel of ["src/app/artikel/[slug]/page.tsx", "src/app/pengetahuan/[slug]/page.tsx"]) {
    const isi = bacaRepo(rel);
    cek(
      `XSS: ${rel} JSON-LD di-escape (< -> \\u003c) + nonce`,
      /JSON\.stringify\(jsonLd\)\.replace\(\/</.test(isi) && /nonce=\{nonce/.test(isi),
    );
  }
  // Prompt injection: tanpa LLM di kode (AI hanya via Muse).
  // Komentar dilepas dulu: types.ts menyebut "Tanpa GPT/Gemini/
  // DeepSeek" sebagai PERNYATAAN ketiadaan, bukan pemanggilan.
  const lepasKomentar = (isi) =>
    isi
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "$1");
  const polaLlm = [/openai/i, /anthropic/i, /gemini/i, /deepseek/i, /vikey/i, /generativelanguage/i, /api\.openai\.com/i];
  const temuanLlm = [];
  for (const f of semuaSrc) {
    const isi = lepasKomentar(fs.readFileSync(f, "utf8"));
    for (const pola of polaLlm) if (pola.test(isi)) temuanLlm.push(`${f.replace(DIR_REPO, "")}: ${pola}`);
  }
  cek("Prompt injection: 0 pemanggilan LLM di src/ (AI hanya via Muse)", temuanLlm.length === 0, temuanLlm.slice(0, 5).join(" | "));
  // Admin: 0 route /api/admin/* tanpa autentikasiAdmin.
  const routeAdmin = semuaBerkas(`${DIR_REPO}src/app/api/admin`).filter((f) => f.endsWith("route.ts"));
  const tanpaAuth = routeAdmin.filter((f) => !/autentikasiAdmin/.test(fs.readFileSync(f, "utf8")));
  cek("Admin: 0 route /api/admin/* tanpa autentikasiAdmin", tanpaAuth.length === 0, tanpaAuth.map((f) => f.replace(DIR_REPO, "")).join(", "));
  // Backup: 62 tabel (61 v14 + 1 v15 pf_quiz_daily_answers — Tahap C).
  const backupSrc = bacaRepo("scripts/backup-pf.mjs");
  const tabelBackup = new Set([...backupSrc.matchAll(/"(pf_[a-z0-9_]+)"/g)].map((m) => m[1]));
  cek("Backup: scripts/backup-pf.mjs mencakup 62 tabel", tabelBackup.size === 62, `dapat ${tabelBackup.size}`);
  // Upload: tanpa permukaan upload file pengguna.
  const polaUpload = [/type="file"/, /type='file'/, /formidable/i, /multer/i, /uploadthing/i];
  const temuanUpload = [];
  for (const f of semuaSrc) {
    const isi = fs.readFileSync(f, "utf8");
    for (const pola of polaUpload) if (pola.test(isi)) temuanUpload.push(`${f.replace(DIR_REPO, "")}: ${pola}`);
  }
  cek("Upload: 0 permukaan upload file di src/", temuanUpload.length === 0, temuanUpload.slice(0, 5).join(" | "));
  // GET publik tanpa limiter = keputusan desain (tercatat, bukan celah diam-diam).
  const getTanpaLimiter = [];
  for (const f of semuaBerkas(`${DIR_REPO}src/app/api`).filter((x) => x.endsWith("route.ts"))) {
    const isi = fs.readFileSync(f, "utf8");
    if (/export async function GET/.test(isi) && !/buatRateLimiter|cekRateLimit/.test(isi)) {
      getTanpaLimiter.push(f.replace(DIR_REPO, ""));
    }
  }
  catatTemuan(
    "API abuse: GET publik tanpa limiter (keputusan desain tercatat)",
    `${getTanpaLimiter.length} route: ${getTanpaLimiter.join(", ")} — GET baca-saja; rate limit hanya di route tulis + auth.`,
  );
  // HSTS di next.config.ts (bukan report-to palsu).
  const nextCfg = bacaRepo("next.config.ts");
  cek(
    "HSTS: Strict-Transport-Security 2 tahun + includeSubDomains + preload di next.config.ts",
    /Strict-Transport-Security/.test(nextCfg) && /max-age=63072000; includeSubDomains; preload/.test(nextCfg),
  );
  cek("HSTS: TIDAK ADA direktif report-to (komentar penjelas bukan direktif)", !/"report-to"/.test(nextCfg));
  // Header keamanan lain di next.config.ts.
  cek(
    "Header: X-Content-Type-Options nosniff + X-Frame-Options DENY + Referrer-Policy + Permissions-Policy",
    /X-Content-Type-Options/.test(nextCfg) && /X-Frame-Options/.test(nextCfg) && /Referrer-Policy/.test(nextCfg) && /Permissions-Policy/.test(nextCfg),
  );
}

// ---------- §I2. Eskalasi peran: policy pf_user_roles (PGlite) ----------
console.log("\n== §I2. Eskalasi peran (policy tulis super_admin) ==");
{
  const UID_ADMIN = "33333333-3333-3333-3333-333333333333";
  const UID_BIASA = "44444444-4444-4444-4444-444444444444";
  const UID_KORBAN = "55555555-5555-5555-5555-555555555555";
  await db.query(`insert into auth.users (id, email) values ($1,'admin@uji.id'),($2,'biasa@uji.id'),($3,'korban@uji.id') on conflict (id) do nothing`, [UID_ADMIN, UID_BIASA, UID_KORBAN]);
  // Peran di-seed migrasi v1 (UUID acak) — baca id ASLI, jangan hardcode.
  const rSuper = await db.query(`select id from public.pf_roles where nama='super_admin'`);
  const rUser = await db.query(`select id from public.pf_roles where nama='user'`);
  cek("Eskalasi: peran super_admin + user ada (seed v1)", rSuper.rows.length === 1 && rUser.rows.length === 1);
  const idSuper = rSuper.rows[0]?.id;
  const idUser = rUser.rows[0]?.id;
  // Seed sebagai owner (RLS tidak berlaku bagi pemilik tabel): admin = super_admin.
  let seedOk = true;
  try {
    await db.query(`insert into public.pf_user_roles (user_id, role_id) values ($1,$2) on conflict do nothing`, [UID_ADMIN, idSuper]);
    await db.query(`insert into public.pf_user_roles (user_id, role_id) values ($1,$2) on conflict do nothing`, [UID_BIASA, idUser]);
  } catch (e) {
    seedOk = false;
    console.log(`  seed user_roles gagal: ${String(e.message).split("\n")[0]}`);
  }
  cek("Eskalasi: seed peran uji berhasil", seedOk);
  async function cobaEskalasi(uidAktor, uidTarget) {
    // set_config(..., false) = level SESI (pola uji-fase8-gel1.mjs);
    // `true` (transaksi) hilang sebelum query insert berjalan.
    await db.query(`select set_config('pf.uid_test', $1, false)`, [uidAktor]);
    try {
      await sebagai(
        "authenticated",
        `insert into public.pf_user_roles (user_id, role_id) values ($1,$2)`,
        [uidTarget, idSuper],
      );
      return true; // lolos (BERBAHAYA bila aktor biasa)
    } catch {
      return false;
    } finally {
      await db.query(`select set_config('pf.uid_test', '', false)`);
    }
  }
  cek(
    "Eskalasi: pengguna BIASA tidak bisa memberi super_admin ke diri sendiri",
    (await cobaEskalasi(UID_BIASA, UID_BIASA)) === false,
  );
  cek(
    "Eskalasi: pengguna BIASA tidak bisa memberi super_admin ke orang lain",
    (await cobaEskalasi(UID_BIASA, UID_KORBAN)) === false,
  );
  cek(
    "Eskalasi: super_admin BISA memberi super_admin (kontrol positif)",
    (await cobaEskalasi(UID_ADMIN, UID_KORBAN)) === true,
  );
  // Bersihkan jejak uji.
  await db.query(`delete from public.pf_user_roles where user_id=$1 and role_id=$2`, [UID_KORBAN, idSuper]);
}

// ---------- §J. Live (hanya bila TAHAPD_LIVE_URL disetel) ----------
console.log("\n== §J. Live HTTP (next start) ==");
if (!LIVE_URL) {
  console.log("DILEWATI: TAHAPD_LIVE_URL tidak disetel — jalankan: TAHAPD_LIVE_URL=http://localhost:3000 node scripts/uji-tahapD-security.mjs");
  catatTemuan(
    "Live: CSP/CSRF HTTP tidak diuji pada run ini (tanpa server)",
    "jalankan ulang dengan TAHAPD_LIVE_URL sesudah `next start` untuk asersi live.",
  );
} else {
  const ambilCsp = (res) => res.headers.get("content-security-policy") ?? "";
  const r1 = await fetch(`${LIVE_URL}/`);
  const r2 = await fetch(`${LIVE_URL}/`);
  const csp1 = ambilCsp(r1);
  const csp2 = ambilCsp(r2);
  const nonce1 = /'nonce-([^']+)'/.exec(csp1)?.[1];
  const nonce2 = /'nonce-([^']+)'/.exec(csp2)?.[1];
  cek("Live CSP: header hadir di /", csp1.length > 0, csp1.slice(0, 120));
  cek("Live CSP: nonce unik per request", Boolean(nonce1 && nonce2 && nonce1 !== nonce2), `${nonce1} vs ${nonce2}`);
  cek("Live CSP: script-src tanpa unsafe-inline/unsafe-eval (produksi)", !/script-src[^;]*'unsafe-inline'/.test(csp1) && !/script-src[^;]*'unsafe-eval'/.test(csp1));
  cek("Live CSP: hash skrip tema ada di header", csp1.includes("'sha256-kbdpuUr7+zlKwp6cjPtYWBBvdrWG3dqbGKfss460j9I='"));
  cek("Live CSP: frame-ancestors 'none' + object-src 'none'", csp1.includes("frame-ancestors 'none'") && csp1.includes("object-src 'none'"));
  cek("Live HSTS: header hadir", (r1.headers.get("strict-transport-security") ?? "").includes("max-age=63072000"));
  cek("Live header: X-Frame-Options DENY + nosniff", r1.headers.get("x-frame-options") === "DENY" && r1.headers.get("x-content-type-options") === "nosniff");
  // Skrip tema di HTML + hash-nya cocok + JSON-LD tidak diblokir (halaman dinamis butuh data; cukup periksa skrip tema + tidak ada laporan blokir yang bisa dibaca dari HTML).
  const html = await r1.text();
  const mTema = /<script>([\s\S]*?localStorage\.getItem\('pf-tema'\)[\s\S]*?)<\/script>/.exec(html);
  cek("Live CSP: skrip tema anti-kedip hadir di HTML /", Boolean(mTema), mTema ? "ditemukan" : "tidak ditemukan");
  if (mTema) {
    const hashHtml = `'sha256-${createHash("sha256").update(mTema[1], "utf8").digest("base64")}'`;
    cek("Live CSP: sha256 skrip tema di HTML == hash di header", hashHtml === "'sha256-kbdpuUr7+zlKwp6cjPtYWBBvdrWG3dqbGKfss460j9I='", hashHtml);
  }
  // 404 nyata + CSP.
  const r404 = await fetch(`${LIVE_URL}/tidak-ada-xyz-tahapd`);
  cek("Live CSP: 404 nyata + header CSP hadir", r404.status === 404 && ambilCsp(r404).length > 0, `status ${r404.status}`);
  // CSRF live: Origin salah -> 403; tanpa Origin -> bukan 403 (401, tanpa sesi); Origin sama host -> bukan 403.
  const post = (origin) =>
    fetch(`${LIVE_URL}/api/bookmark`, {
      method: "POST",
      headers: origin ? { origin, "content-type": "application/json" } : { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
  const rEvil = await post("https://evil.test");
  cek("Live CSRF: POST Origin salah -> 403", rEvil.status === 403, `status ${rEvil.status}`);
  const rTanpa = await post(null);
  cek(
    "Live CSRF: POST tanpa Origin -> BUKAN 403 (klien non-browser diizinkan proxy; route menjawab 401 tanpa sesi)",
    rTanpa.status === 401,
    `status ${rTanpa.status}`,
  );
  const rSama = await post(LIVE_URL);
  cek("Live CSRF: POST Origin sama host -> BUKAN 403", rSama.status === 401, `status ${rSama.status}`);
  // GET tidak bermutasi: GET /api/bookmark tanpa sesi -> 401, bukan perubahan.
  const rGet = await fetch(`${LIVE_URL}/api/bookmark`);
  cek("Live: GET /api/bookmark tanpa sesi -> 401 (tidak bermutasi)", rGet.status === 401, `status ${rGet.status}`);
  // Toggle tema + JSON-LD + tidak ada skrip diblokir: BUTUH browser nyata.
  catatTemuan(
    "Live BELUM DIUJI: toggle tema di browser, JSON-LD hadir di halaman artikel, konsol tanpa 'blocked by CSP'",
    "butuh browser nyata (di luar curl); koordinator/tahap browser wajib memverifikasi.",
  );
  catatTemuan(
    "Live BELUM DIUJI: refresh sesi proxy end-to-end (login nyata)",
    "butuh kredensial pengguna/staf nyata; opsi cookie diverifikasi di §H saja.",
  );
}

// ---------- Ringkasan ----------
console.log(`\n== RINGKASAN TAHAP D ==\nLolos: ${lolos}\nGagal: ${gagal}\nTemuan (residual, tidak menggagalkan): ${temuan.length}`);
for (const t of temuan) console.log(`  - ${t}`);
if (gagal > 0) {
  console.log("HASIL: GAGAL");
  process.exit(1);
}
console.log("HASIL: LOLOS");
process.exit(0);
