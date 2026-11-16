// Uji Keamanan Gelombang B1 PRATA FAKTA (P0-6, P0-7, P0-8, P1-3,
// P1-5, P2-13, P2-28, P3-8) -> PGlite + uji TS murni (transpile +
// stub) + uji perilaku @supabase/ssr nyata.
// Menerapkan v1–v11 (idempotensi tidak diuji di sini — sudah
// dibuktikan uji-tahap13a.mjs), lalu memeriksa:
//   P0-7  Fail-closed rate limit: cekRateLimitDbKeras menolak
//         bila RPC gagal (bedakan "belum-siap" dari "transien"),
//         429 hanya bila benar-benar melewati batas; limiter
//         fail-open lama TETAP mengizinkan (regresi admin/GET);
//         log terstruktur JSON tercatat saat RPC gagal.
//   P0-8  cekOrigin: tolak lintas situs (Origin/Referer), lolos
//         origin aplikasi + host request, izinkan bila keduanya
//         absen (klien non-browser); 6 handler mutasi milik B1
//         memakainya. Sisa route yang belum dipasangi DICETAK
//         (bukan digagalkan — berkas milik agen lain).
//   P1-5  Vote "membantu": dedup lintas instance lewat RPC
//         (1/86400 dtk, per IP + per pertanyaan); Map in-memory
//         hilang; increment CAS + pola atomik satu pernyataan
//         di PGlite; podcast riwayat/playlist punya limiter 30.
//   P1-3  Audit fail-closed 4 jalur: helper best-effort hilang,
//         catatAuditWajib + compensating dipakai; aksi audit
//         lolos CHECK v11; simulasi SQL: audit gagal -> baris
//         dihapus-balik (compensating delete) -> 0 baris yatim.
//   P0-6  Cookie sesi: Secure di produksi di ketiga klien;
//         httpOnly SENGAJA false (terdokumentasi) — dibuktikan
//         mekanistik: cookie JS terbaca browser client,
//         cookie httpOnly-server TIDAK terbaca (getSession null);
//         opsi cookie mengalir ke setAll server client.
//   P2-13 responGalatAdmin: 500 generik + kode ERR-XXXX (acak
//         per galat), pesan mentah TIDAK sampai ke klien, pesan
//         lengkap hanya di log server; 503 belum-siap tetap.
//   P2-28 HSTS hadir di next.config.ts; TIDAK ADA report-to
//         (belum ada endpoint pengumpul — jangan buat palsu).
//   P3-8  Ekspor mati ambilIp hilang dari guard.ts + src/.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// BATAS KEJUJURAN baterai ini (bukan klaim lebih):
// - Respons HTTP hidup (403/429/503 nyata) TIDAK diuji — tidak
//   ada server jalan di sini; yang diuji: fungsi helper yang
//   dipakai handler (cekOrigin, limiter keras, responGalatAdmin)
//   + asersi sumber bahwa tiap handler memakainya. Verifikasi
//   HTTP hidup tetap tugas tahap browser/koordinator.
// - Refresh sesi di proxy TIDAK diuji end-to-end (butuh server
//   Next + Supabase); yang diuji: opsi cookie mengalir ke setAll
//   server client + perilaku baca cookie browser client.
// - Atomicity penuh tulis+audit (transaksi/RPC) TIDAK diuji —
//   belum ada; yang diuji: compensating delete mengembalikan
//   keadaan (simulasi SQL) + sumber memakainya.
import fs from "node:fs";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

const require = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = require("@electric-sql/pglite");
const requireRepo = createRequire(new URL("../package.json", import.meta.url).pathname);
const ts = requireRepo("typescript");
const ssr = requireRepo("@supabase/ssr");

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

function semuaBerkasSrc(dir, hasil = []) {
  for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${entri.name}`;
    if (entri.isDirectory()) semuaBerkasSrc(p, hasil);
    else if (/\.(ts|tsx)$/.test(entri.name)) hasil.push(p);
  }
  return hasil;
}

/** Balapan dengan timeout agar galat jaringan offline (fetch ke
 *  host Supabase palsu menggantung di VM ini) tidak membekukan
 *  baterai: timeout = kegagalan asersi yang jujur. */
async function denganTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((res) => {
        timer = setTimeout(() => res({ __timeout: true, label }), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const db = new PGlite();

async function jalankan(label, teks) {
  try {
    await db.exec(teks);
    return true;
  } catch (e) {
    console.log(`GAGAL: ${label}\n  -> ${String(e.message).split("\n")[0]}`);
    gagal++;
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
  "20261116_pf_v11_rate_limit_audit.sql",
];

const UID_A = "11111111-1111-1111-1111-111111111111";

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

for (const nama of MIGRASI) {
  const ok = await jalankan(`migrasi ${nama}`, baca(nama));
  if (!ok) process.exit(1);
}
console.log("OK: migrasi v1–v11 diterapkan");

await db.query(`insert into auth.users (id, email) values ($1, 'a@uji.id')`, [UID_A]);

// ---------- Ekstraksi TS bersama (route-auth + guard + types) ----------
const routeAuth = bacaRepo("src/lib/ai/route-auth.ts");
const guard = bacaRepo("src/lib/admin/guard.ts");
const typesAdmin = bacaRepo("src/lib/admin/types.ts");

function ekstrak(sumber, pola, nama) {
  const m = pola.exec(sumber);
  if (!m) console.log(`GAGAL: ekstrak ${nama} — pola tidak cocok`);
  return m?.[0] ?? null;
}
const fnIp = ekstrak(routeAuth, /export function ipDariRequest\([\s\S]*?\n\}/, "ipDariRequest");
const fnKunci = ekstrak(routeAuth, /export async function kunciRateLimit\([\s\S]*?\n\}/, "kunciRateLimit");
const fnKlasifikasi = ekstrak(routeAuth, /export function klasifikasiGalatRpc\([\s\S]*?\n\}/, "klasifikasiGalatRpc");
const fnCatatGalat = ekstrak(routeAuth, /export function catatGalatRateLimit\([\s\S]*?\n\}/, "catatGalatRateLimit");
const fnCekDb = ekstrak(routeAuth, /export async function cekRateLimitDb\([\s\S]*?\n\}/, "cekRateLimitDb");
const fnCekKeras = ekstrak(routeAuth, /export async function cekRateLimitDbKeras\([\s\S]*?\n\}/, "cekRateLimitDbKeras");
const fnBuatKeras = ekstrak(routeAuth, /export function buatRateLimiterKeras\([\s\S]*?\n\}/, "buatRateLimiterKeras");
const fnResponBelumSiap = ekstrak(routeAuth, /export function responRateLimitBelumSiap\([\s\S]*?\n\}/, "responRateLimitBelumSiap");
// Logika asal pindah ke lib/asal.ts (integrasi B1) agar dipakai
// proxy.ts (Edge) + route-auth.ts dari satu sumber kebenaran.
const asal = bacaRepo("src/lib/asal.ts");
const fnNormalisasiAsal = ekstrak(asal, /export function normalisasiOrigin\([\s\S]*?\n\}/, "normalisasiOrigin (asal)");
const fnApakahAsal = ekstrak(asal, /export function apakahAsalDiizinkan\([\s\S]*?\n\}/, "apakahAsalDiizinkan");
const fnResponOrigin = ekstrak(routeAuth, /export function responOriginTakCocok\([\s\S]*?\n\}/, "responOriginTakCocok");
const fnCekOrigin = ekstrak(routeAuth, /export function cekOrigin\([\s\S]*?\n\}/, "cekOrigin");
const fnResponGalatAdmin = ekstrak(guard, /export function responGalatAdmin\([\s\S]*?\n\}/, "responGalatAdmin");
const fnAdalahBelumSiap = ekstrak(typesAdmin, /export function adalahGalatBelumSiap\([\s\S]*?\n\}/, "adalahGalatBelumSiap");
const konstantaBelumSiap = ekstrak(typesAdmin, /export const AWALAN_BELUM_SIAP = "[^"]+";/, "AWALAN_BELUM_SIAP");

// Stub NextResponse (hanya .json yang dipakai helper yang diuji).
const NextResponseStub = {
  json: (body, init) => ({ status: init?.status ?? 200, body }),
};

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
      fnResponBelumSiap?.replace("export function", "function"),
      fnNormalisasiAsal?.replace("export function", "function"),
      fnApakahAsal?.replace("export function", "function"),
      fnResponOrigin?.replace("export function", "function"),
      fnCekOrigin?.replace("export function", "function"),
    ]
      .filter(Boolean)
      .join("\n") +
      `\nreturn { ipDariRequest, kunciRateLimit, klasifikasiGalatRpc, catatGalatRateLimit, cekRateLimitDb, cekRateLimitDbKeras, buatRateLimiterKeras, responRateLimitBelumSiap, cekOrigin, responOriginTakCocok, apakahAsalDiizinkan };`,
  );
  return new Function("createClient", "NextResponse", kode);
}

// ---------- §P0-7: fail-closed rate limit ----------
console.log("\n== P0-7: fail-closed rate limit (S-2/B-S7) ==");
cek("P0-7: route-auth punya cekRateLimitDbKeras", Boolean(fnCekKeras));
cek("P0-7: route-auth punya buatRateLimiterKeras", Boolean(fnBuatKeras));
cek("P0-7: route-auth punya responRateLimitBelumSiap (503)", Boolean(fnResponBelumSiap));
cek("P0-7: route-auth punya klasifikasiGalatRpc (belum-siap vs transien)", Boolean(fnKlasifikasi));
cek("P0-7: route-auth punya catatGalatRateLimit (log terstruktur)", Boolean(fnCatatGalat));

const galatBelumSiap = Object.assign(
  new Error("Could not find the function public.pf_rate_limit_check(p_kunci text, p_batas integer, p_jendela_detik integer) in the schema cache"),
  { code: "PGRST202" },
);
const galatTransien = new Error("fetch failed");
const galatTabel = Object.assign(new Error('relation "public.pf_rate_limits" does not exist'), { code: "42P01" });

{
  const buat = buatFungsiRouteAuth();
  const { klasifikasiGalatRpc, cekRateLimitDbKeras, cekRateLimitDb, responRateLimitBelumSiap } = buat(
    () => Promise.resolve({ auth: { getUser: async () => ({ data: { user: null } }) }, rpc: async () => { throw galatBelumSiap; } }),
    NextResponseStub,
  );
  cek("P0-7: klasifikasi PGRST202 -> belum-siap", klasifikasiGalatRpc(galatBelumSiap) === "belum-siap");
  cek("P0-7: klasifikasi 42P01 -> belum-siap", klasifikasiGalatRpc(galatTabel) === "belum-siap");
  cek("P0-7: klasifikasi 'relation does not exist' (tanpa kode) -> belum-siap", klasifikasiGalatRpc(new Error('relation "x" does not exist')) === "belum-siap");
  cek("P0-7: klasifikasi galat jaringan -> transien", klasifikasiGalatRpc(galatTransien) === "transien");

  // Fail-closed: RPC gagal -> ditolak + alasan rpc-gagal.
  const hasilBelumSiap = await cekRateLimitDbKeras("uji:1", 5, 60);
  cek(
    "P0-7: RPC gagal (fungsi belum ada) -> ditolak, alasan rpc-gagal, jenis belum-siap",
    hasilBelumSiap.lolos === false && hasilBelumSiap.alasan === "rpc-gagal" && hasilBelumSiap.jenisGalat === "belum-siap",
    JSON.stringify(hasilBelumSiap),
  );
  const buatTransien = buatFungsiRouteAuth();
  const kerasTransien = buatTransien(
    () => Promise.resolve({ auth: { getUser: async () => ({ data: { user: null } }) }, rpc: async () => { throw galatTransien; } }),
    NextResponseStub,
  ).cekRateLimitDbKeras;
  const hasilTransien = await kerasTransien("uji:2", 5, 60);
  cek(
    "P0-7: RPC gagal (transien) -> ditolak, jenis transien",
    hasilTransien.lolos === false && hasilTransien.alasan === "rpc-gagal" && hasilTransien.jenisGalat === "transien",
    JSON.stringify(hasilTransien),
  );

  // Log terstruktur saat RPC gagal (fail-closed + fail-open).
  const logTangkap = [];
  const consoleAsli = console.error;
  console.error = (...args) => { logTangkap.push(args.join(" ")); };
  try {
    await cekRateLimitDbKeras("uji:log", 5, 60);
  } finally {
    console.error = consoleAsli;
  }
  let logJson = null;
  try { logJson = JSON.parse(logTangkap[logTangkap.length - 1] ?? ""); } catch { logJson = null; }
  cek(
    "P0-7: log gagal RPC adalah JSON terstruktur (event/jenis/kunci/mode)",
    Boolean(logJson && logJson.event === "rate_limit_rpc_gagal" && logJson.jenis === "belum-siap" && logJson.kunci === "uji:log" && logJson.mode === "fail-closed"),
    logTangkap[logTangkap.length - 1]?.slice(0, 160) ?? "(tidak ada log)",
  );

  // Fail-open LAMA tetap mengizinkan (regresi: GET + admin internal).
  const logTangkap2 = [];
  console.error = (...args) => { logTangkap2.push(args.join(" ")); };
  let failOpen = null;
  try {
    failOpen = await cekRateLimitDb("uji:fo", 5, 60);
  } finally {
    console.error = consoleAsli;
  }
  cek("P0-7 (regresi): cekRateLimitDb fail-open TETAP mengizinkan bila RPC gagal", failOpen === true);
  let logJson2 = null;
  try { logJson2 = JSON.parse(logTangkap2[logTangkap2.length - 1] ?? ""); } catch { logJson2 = null; }
  cek(
    "P0-7 (regresi): log fail-open juga terstruktur (mode=fail-open)",
    Boolean(logJson2 && logJson2.event === "rate_limit_rpc_gagal" && logJson2.mode === "fail-open"),
  );

  // Batas terlampaui (RPC sehat, data=false) -> 429, bukan 503.
  const buatBatas = buatFungsiRouteAuth();
  const kerasBatas = buatBatas(
    () => Promise.resolve({ auth: { getUser: async () => ({ data: { user: null } }) }, rpc: async () => ({ data: false, error: null }) }),
    NextResponseStub,
  ).cekRateLimitDbKeras;
  const hasilBatas = await kerasBatas("uji:batas", 5, 60);
  cek(
    "P0-7: RPC sehat + melewati batas -> ditolak, alasan terbatas (bukan rpc-gagal)",
    hasilBatas.lolos === false && hasilBatas.alasan === "terbatas" && hasilBatas.jenisGalat === undefined,
    JSON.stringify(hasilBatas),
  );

  // buatRateLimiterKeras: kunci per-IP anon + jendela kustom.
  const panggilan = [];
  const buatLimiter = buatFungsiRouteAuth();
  const limiterKeras = buatLimiter(
    () => Promise.resolve({
      auth: { getUser: async () => ({ data: { user: null } }) },
      rpc: async (_nama, args) => { panggilan.push(args); return { data: true, error: null }; },
    }),
    NextResponseStub,
  ).buatRateLimiterKeras;
  const batasi = limiterKeras(5, 120_000);
  const hasilLimiter = await batasi(new Request("https://uji.id/api/x", { headers: { "x-forwarded-for": "1.2.3.4, 9.10.11.12" } }));
  cek("P0-7: buatRateLimiterKeras mengizinkan bila RPC sehat", hasilLimiter.lolos === true);
  cek(
    "P0-7: buatRateLimiterKeras memakai kunci ip: + jendela 120 dtk",
    panggilan.length === 1 && panggilan[0].p_kunci === "ip:9.10.11.12" && panggilan[0].p_jendela_detik === 120 && panggilan[0].p_batas === 5,
    JSON.stringify(panggilan[0] ?? null),
  );

  // responRateLimitBelumSiap: 503 + pesan dibedakan.
  const rBelumSiap = responRateLimitBelumSiap("belum-siap");
  const rTransien = responRateLimitBelumSiap("transien");
  cek("P0-7: responRateLimitBelumSiap(belum-siap) -> 503 + menyebut migrasi", rBelumSiap.status === 503 && String(rBelumSiap.body.error).includes("migrasi"));
  cek("P0-7: responRateLimitBelumSiap(transien) -> 503 + menyebut sementara", rTransien.status === 503 && String(rTransien.body.error).includes("sementara"));
}

// 10 route target P0-7 masih memakai limiter fail-open (berkas
// milik agen lain — helper keras sudah siap; peralihan satu baris
// per route dicatat di laporan, bukan diklaim selesai di sini).
const TARGET_P0_7 = [
  "src/app/api/laporan/route.ts",
  "src/app/api/kuis/jawab/route.ts",
  "src/app/api/akademi/kuis/jawab/route.ts",
  "src/app/api/tanya/route.ts",
  "src/app/api/ai/jalankan/route.ts",
  "src/app/api/ai/brief/route.ts",
  "src/app/api/ai/data-analysis/route.ts",
  "src/app/api/ingestion/jalankan/route.ts",
  "src/app/api/sumber/[id]/cek/route.ts",
  "src/app/api/langganan/route.ts",
];
console.log("CATATAN P0-7 — route berisiko yang MASIH memakai buatRateLimiter fail-open (perlu dialihkan ke buatRateLimiterKeras oleh pemilik berkas):");
for (const rel of TARGET_P0_7) {
  const isi = bacaRepo(rel);
  console.log(`  - ${rel}: fail-open=${isi.includes("buatRateLimiter(") && !isi.includes("buatRateLimiterKeras")} keras=${isi.includes("buatRateLimiterKeras")}`);
}

// ---------- §P0-8: cek Origin ----------
console.log("\n== P0-8: cek Origin/Referer (S-9/B-S6) ==");
cek("P0-8: route-auth punya cekOrigin", Boolean(fnCekOrigin));
cek("P0-8: route-auth punya responOriginTakCocok", Boolean(fnResponOrigin));
process.env.PF_SITE_URL = "https://prata-fakta.vercel.app";
{
  const { cekOrigin } = buatFungsiRouteAuth()(() => Promise.resolve({}), NextResponseStub);
  const buatReq = (url, headers = {}) => new Request(url, { headers });
  const rJahat = cekOrigin(buatReq("https://prata-fakta.vercel.app/api/admin/data", { origin: "https://jahat.example" }));
  cek("P0-8: Origin lintas situs -> 403", rJahat !== null && rJahat.status === 403, JSON.stringify(rJahat?.body ?? null));
  cek(
    "P0-8: Origin = PF_SITE_URL -> lolos",
    cekOrigin(buatReq("https://prata-fakta.vercel.app/api/admin/data", { origin: "https://prata-fakta.vercel.app" })) === null,
  );
  cek(
    "P0-8: Origin = host request sendiri -> lolos",
    cekOrigin(buatReq("https://prata-fakta.vercel.app/api/admin/data", { origin: "https://prata-fakta.vercel.app" })) === null,
  );
  cek(
    "P0-8: Origin http + host sama (dev, skema beda) -> lolos via host",
    cekOrigin(buatReq("http://localhost:3000/api/admin/data", { origin: "http://localhost:3000", host: "localhost:3000" })) === null,
  );
  cek(
    "P0-8: Origin https vs host http (dev) -> lolos via host",
    cekOrigin(buatReq("http://localhost:3000/api/admin/data", { origin: "https://localhost:3000", host: "localhost:3000" })) === null,
  );
  cek(
    "P0-8: Referer lintas situs (tanpa Origin) -> 403",
    cekOrigin(buatReq("https://prata-fakta.vercel.app/api/admin/data", { referer: "https://jahat.example/artikel/x" })) !== null,
  );
  cek(
    "P0-8: Referer aplikasi (tanpa Origin) -> lolos",
    cekOrigin(buatReq("https://prata-fakta.vercel.app/api/admin/data", { referer: "https://prata-fakta.vercel.app/artikel/x" })) === null,
  );
  cek(
    "P0-8: Origin + Referer keduanya absen (klien non-browser) -> lolos",
    cekOrigin(buatReq("https://prata-fakta.vercel.app/api/ingestion/jalankan")) === null,
  );
  cek(
    "P0-8: Origin 'null' (konteks sandbox) -> 403",
    cekOrigin(buatReq("https://prata-fakta.vercel.app/api/admin/data", { origin: "null" })) !== null,
  );
  cek(
    "P0-8: Origin bukan URL valid -> 403",
    cekOrigin(buatReq("https://prata-fakta.vercel.app/api/admin/data", { origin: "ht!tp://[rusak" })) !== null,
  );
}
// ---------- §P0-8-terpusat: cek Origin di proxy (integrasi B1) ----------
console.log("\n== P0-8-terpusat: cek Origin terpusat di proxy ==");
cek("P0-8: lib/asal.ts punya apakahAsalDiizinkan", Boolean(fnApakahAsal));
cek("P0-8: lib/asal.ts punya normalisasiOrigin", Boolean(fnNormalisasiAsal));
cek("P0-8: cekOrigin mendelegasikan ke apakahAsalDiizinkan (satu sumber kebenaran)", routeAuth.includes("apakahAsalDiizinkan"));
{
  const proxySrc = bacaRepo("src/proxy.ts");
  cek("P0-8: proxy mengimpor apakahAsalDiizinkan dari lib/asal", proxySrc.includes('from "@/lib/asal"'));
  cek(
    "P0-8: proxy memeriksa mutasi /api/* (POST/PATCH/PUT/DELETE)",
    proxySrc.includes('startsWith("/api/")') &&
      proxySrc.includes('"POST"') &&
      proxySrc.includes('"PATCH"') &&
      proxySrc.includes('"DELETE"') &&
      proxySrc.includes("apakahAsalDiizinkan(request.headers"),
  );
  cek("P0-8: proxy menjawab 403 untuk asal lintas situs", proxySrc.includes("Permintaan lintas situs ditolak") && proxySrc.includes("status: 403"));
}
{
  const { apakahAsalDiizinkan } = buatFungsiRouteAuth()(() => Promise.resolve({}), NextResponseStub);
  const buatReq = (url, headers = {}) => new Request(url, { headers });
  const site = process.env.PF_SITE_URL;
  cek(
    "P0-8: apakahAsalDiizinkan lintas situs -> false",
    apakahAsalDiizinkan(buatReq("https://prata-fakta.vercel.app/api/x", { origin: "https://jahat.example" }).headers, site) === false,
  );
  cek(
    "P0-8: apakahAsalDiizinkan origin aplikasi -> true",
    apakahAsalDiizinkan(buatReq("https://prata-fakta.vercel.app/api/x", { origin: "https://prata-fakta.vercel.app" }).headers, site) === true,
  );
  cek(
    "P0-8: apakahAsalDiizinkan tanpa Origin/Referer (non-browser) -> true",
    apakahAsalDiizinkan(buatReq("https://prata-fakta.vercel.app/api/ingestion/jalankan").headers, site) === true,
  );
  cek(
    "P0-8: apakahAsalDiizinkan Origin 'null' -> false",
    apakahAsalDiizinkan(buatReq("https://prata-fakta.vercel.app/api/x", { origin: "null" }).headers, site) === false,
  );
  cek(
    "P0-8: apakahAsalDiizinkan Referer lintas situs -> false",
    apakahAsalDiizinkan(buatReq("https://prata-fakta.vercel.app/api/x", { referer: "https://jahat.example/a" }).headers, site) === false,
  );
}
const HANDLER_B1_ORIGIN = [
  "src/app/api/admin/pengetahuan/route.ts",
  "src/app/api/admin/riset/route.ts",
  "src/app/api/admin/data/route.ts",
  "src/app/api/tanya/[id]/membantu/route.ts",
  "src/app/api/podcast/riwayat/route.ts",
  "src/app/api/podcast/playlist/route.ts",
];
for (const rel of HANDLER_B1_ORIGIN) {
  cek(`P0-8: ${rel} memanggil cekOrigin`, bacaRepo(rel).includes("cekOrigin(req)"));
}
// Sisa route mutasi yang belum dipasangi cekOrigin PER-ROUTE
// (informasi, bukan gagal): semuanya TETAP terlindung oleh cek
// terpusat di proxy.ts (P0-8-terpusat di atas) — cek per-route
// adalah lapis kedua, bukan satu-satunya.
{
  const berkasRoute = semuaBerkasSrc(`${DIR_REPO}/src/app/api`).filter((f) => f.endsWith("/route.ts"));
  const sisa = [];
  for (const f of berkasRoute) {
    const isi = fs.readFileSync(f, "utf8");
    if (!/export async function (POST|PATCH|DELETE)/.test(isi)) continue;
    if (!isi.includes("cekOrigin")) sisa.push(f.replace(`${DIR_REPO}/`, ""));
  }
  console.log(`CATATAN P0-8 — ${sisa.length} route mutasi BELUM memakai cekOrigin per-route (dilindungi proxy terpusat):`);
  for (const s of sisa) console.log(`  - ${s}`);
}

// ---------- §P1-5: vote membantu + limiter podcast ----------
console.log("\n== P1-5: vote membantu + limiter podcast (B-S1/B-S2/S-4) ==");
const membantu = bacaRepo("src/app/api/tanya/[id]/membantu/route.ts");
cek("P1-5: membantu memakai cekRateLimitDbKeras (dedup RPC)", membantu.includes("cekRateLimitDbKeras"));
cek("P1-5: membantu memakai kunci vote-membantu + jendela 86400", membantu.includes("vote-membantu:") && membantu.includes("86_400"));
cek("P1-5: membantu TIDAK lagi punya Map in-memory (SUDAH_VOTE)", !membantu.includes("SUDAH_VOTE") && !membantu.includes("new Map"));
cek("P1-5: membantu punya increment CAS (update bersyarat + ulang)", membantu.includes('.eq("membantu", terakhir)') && membantu.includes("MAKS_ULANG_CAS"));
cek("P1-5: membantu fail-closed bila RPC gagal (503)", membantu.includes("responRateLimitBelumSiap"));
cek("P1-5: podcast/riwayat memakai buatRateLimiter(30)", bacaRepo("src/app/api/podcast/riwayat/route.ts").includes("buatRateLimiter(30)"));
cek("P1-5: podcast/playlist memakai buatRateLimiter(30)", bacaRepo("src/app/api/podcast/playlist/route.ts").includes("buatRateLimiter(30)"));
// PGlite: dedup vote lintas "instance" (dua panggilan berurutan,
// kunci sama) — RPC yang sama dipakai semua instance.
const soalId = (
  await db.query(
    `insert into public.pf_questions (pertanyaan, status, publik, membantu)
     values ('Apakah hujan membasahi bumi?', 'terjawab', true, 0) returning id`,
  )
).rows[0].id;
async function panggilRpcVote(kunci) {
  const r = await db.query(`select pf_rate_limit_check($1, 1, 86400) as hasil`, [kunci]);
  return r.rows[0].hasil === true;
}
const kunciVoteA = `vote-membantu:203.0.113.9:${soalId}`;
cek("P1-5: vote pertama IP A untuk soal ini lolos (RPC)", await panggilRpcVote(kunciVoteA));
cek("P1-5: vote kedua IP A untuk soal ini DITOLAK (dedup 1/86400)", (await panggilRpcVote(kunciVoteA)) === false);
cek("P1-5: vote IP B untuk soal yang sama lolos (per-IP)", await panggilRpcVote(`vote-membantu:198.51.100.7:${soalId}`));
cek("P1-5: vote IP A untuk soal LAIN lolos (per-pertanyaan)", await panggilRpcVote(`vote-membantu:203.0.113.9:${UID_A}`));
// Pola atomik satu pernyataan (bentuk RPC follow-up migrasi).
const inc1 = await db.query(`update public.pf_questions set membantu = membantu + 1 where id = $1 returning membantu`, [soalId]);
const inc2 = await db.query(`update public.pf_questions set membantu = membantu + 1 where id = $1 returning membantu`, [soalId]);
cek("P1-5: increment satu pernyataan: 0 -> 1 -> 2 (tanpa vote hilang)", inc1.rows[0]?.membantu === 1 && inc2.rows[0]?.membantu === 2, `dapat ${inc1.rows[0]?.membantu}, ${inc2.rows[0]?.membantu}`);
// Penjaga CAS: update bersyarat nilai lama yang sudah berubah -> 0 baris.
const casGagal = await db.query(`update public.pf_questions set membantu = 99 where id = $1 and membantu = 1 returning id`, [soalId]);
cek("P1-5: CAS menolak update bersyarat nilai lama yang sudah berubah (0 baris)", casGagal.rows.length === 0);
const casLolos = await db.query(`update public.pf_questions set membantu = 3 where id = $1 and membantu = 2 returning membantu`, [soalId]);
cek("P1-5: CAS menerima update bersyarat nilai lama yang masih benar", casLolos.rows[0]?.membantu === 3);

// ---------- §P1-3: audit fail-closed 4 jalur ----------
console.log("\n== P1-3: audit fail-closed 4 jalur (B-T2/S-16) ==");
for (const [rel, aksi] of [
  ["src/app/api/admin/pengetahuan/route.ts", "pengetahuan.buat"],
  ["src/app/api/admin/riset/route.ts", "riset.buat"],
  ["src/app/api/admin/data/route.ts", "data.indikator"],
]) {
  const isi = bacaRepo(rel);
  cek(`P1-3: ${rel} memakai catatAuditWajib ('${aksi}')`, isi.includes("catatAuditWajib") && isi.includes(`"${aksi}"`));
  cek(`P1-3: ${rel} punya compensating delete`, isi.includes("audit_compensating_delete_gagal") && isi.includes(".delete()"));
}
const kendaliSrc = bacaRepo("src/lib/admin/kendali.ts");
cek("P1-3: kendali.ts setFlag memakai catatAuditWajib ('sistem.flag') + compensating restore", kendaliSrc.includes('"sistem.flag"') && kendaliSrc.includes("audit_compensating_restore_flag_gagal"));
cek("P1-3: kendali.ts pemicuJobManual memakai catatAuditWajib ('sistem.job') + compensating restore", kendaliSrc.includes('"sistem.job"') && kendaliSrc.includes("audit_compensating_restore_job_gagal"));
// SQL: aksi audit keempat jalur lolos CHECK v11.
for (const [aksi, entitas] of [
  ["pengetahuan.buat", "pengetahuan"],
  ["riset.buat", "pf_research_reports"],
  ["data.indikator", "pf_data_indicators"],
  ["sistem.flag", "pf_system_settings"],
  ["sistem.job", "pf_scheduled_jobs"],
]) {
  let ok = false;
  try {
    await db.query(
      `insert into public.pf_audit_logs (aktor_id, aksi, entitas, entitas_id)
       values ($1, $2, $3, 'uji-b1')`,
      [UID_A, aksi, entitas],
    );
    ok = true;
  } catch { ok = false; }
  cek(`P1-3: insert audit '${aksi}' lolos CHECK v11`, ok);
}
// Simulasi compensating delete: artikel dibuat, audit gagal
// (aksi bogus ditolak CHECK) -> baris dihapus-balik -> 0 yatim.
const artikelId = (
  await db.query(
    `insert into public.pf_knowledge_articles (slug, judul, topik)
     values ('uji-compensating', 'Artikel Uji Compensating', 'umum') returning id`,
  )
).rows[0].id;
let auditGagal = false;
try {
  await db.query(
    `insert into public.pf_audit_logs (aktor_id, aksi, entitas, entitas_id)
     values ($1, 'bogus.aksi', 'pengetahuan', $2)`,
    [UID_A, artikelId],
  );
} catch {
  auditGagal = true;
}
cek("P1-3 (simulasi): audit aksi bogus DITOLAK CHECK (pemicu compensating)", auditGagal);
await db.query(`delete from public.pf_knowledge_articles where id = $1`, [artikelId]);
const sisaArtikel = await db.query(`select count(*)::int as n from public.pf_knowledge_articles where id = $1`, [artikelId]);
cek("P1-3 (simulasi): sesudah compensating delete, 0 baris yatim tanpa audit", sisaArtikel.rows[0].n === 0, `dapat ${sisaArtikel.rows[0].n}`);

// ---------- §P0-6: cookie sesi ----------
console.log("\n== P0-6: cookie sesi (S-10) ==");
for (const rel of ["src/lib/supabase/server.ts", "src/lib/supabase/client.ts", "src/proxy.ts"]) {
  const isi = bacaRepo(rel);
  cek(`P0-6: ${rel} memakai cookieOptions`, isi.includes("cookieOptions"));
  cek(`P0-6: ${rel} memakai Secure di produksi`, isi.includes('secure: process.env.NODE_ENV === "production"'));
  cek(`P0-6: ${rel} menyatakan httpOnly: false secara eksplisit (keputusan terdokumentasi)`, isi.includes("httpOnly: false"));
  cek(`P0-6: ${rel} TIDAK memakai httpOnly: true`, !isi.includes("httpOnly: true"));
}
// (a) Opsi cookie mengalir ke setAll server client (diuji dengan
// opsi httpOnly:true+secure:true agar aliran terbukti —
// konfigurasi aplikasi sendiri memakai httpOnly:false, lihat
// asersi sumber di atas + §(b) mengapa).
{
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;
  const jwt = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: UID_A, exp, iat: now, email: "a@uji.id", role: "authenticated" })}.sig`;
  const sesi = { access_token: jwt, refresh_token: "refresh-xyz", expires_at: exp, expires_in: 3600, token_type: "bearer", user: { id: UID_A, email: "a@uji.id", app_metadata: {}, user_metadata: {} } };
  const KUNCI = "sb-xyzcompany-auth-token";
  const setAllCalls = [];
  const server = ssr.createServerClient("https://xyzcompany.supabase.co", "anon-key", {
    cookies: { getAll: () => [{ name: KUNCI, value: JSON.stringify(sesi) }], setAll: (cs) => { setAllCalls.push(cs); } },
    cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
  });
  // signOut lokal menggantung di sandbox offline (janji tidak
  // kunjung selesai) — balapan 8 dtk: setAll terpanggil SEBELUM
  // gantungan, dan itulah yang diuji di sini.
  await denganTimeout(server.auth.signOut({ scope: "local" }), 8000, "signOut server");
  const semuaOpsi = setAllCalls.flat();
  cek(
    "P0-6: setAll server client menerima httpOnly:true + secure:true dari cookieOptions",
    semuaOpsi.length > 0 && semuaOpsi.every((c) => c.options?.httpOnly === true && c.options?.secure === true),
    JSON.stringify(semuaOpsi[0]?.options ?? null),
  );
}
// (b) Mekanistik browser client: cookie JS terbaca, cookie
// httpOnly-server TIDAK terbaca — inilah alasan httpOnly:false
// tidak bisa diaktifkan tanpa refactor pembacaan sesi klien.
{
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;
  const jwt = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: UID_A, exp, iat: now, email: "a@uji.id", role: "authenticated" })}.sig`;
  const sesi = { access_token: jwt, refresh_token: "refresh-xyz", expires_at: exp, expires_in: 3600, token_type: "bearer", user: { id: UID_A, email: "a@uji.id", app_metadata: {}, user_metadata: {} } };
  const KUNCI = "sb-xyzcompany-auth-token";
  // Jar cookie semantik browser: document.cookie TIDAK PERNAH
  // memuat cookie httpOnly-server; penulisan via document.cookie
  // mengabaikan flag HttpOnly (cookie tetap tersimpan terbaca).
  class Jar {
    constructor() {
      this.js = new Map();
      this.httpOnly = new Map();
      this.visibilityState = "visible";
    }
    get cookie() {
      return [...this.js.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    set cookie(s) {
      const [nv, ...attrs] = s.split(";").map((x) => x.trim());
      const eq = nv.indexOf("=");
      const name = nv.slice(0, eq);
      const value = nv.slice(eq + 1);
      const lower = attrs.join(";").toLowerCase();
      if (lower.includes("max-age=0") || lower.includes("expires=thu, 01 jan 1970")) {
        this.js.delete(name);
        return;
      }
      this.js.set(name, value);
    }
    addEventListener() {}
    removeEventListener() {}
  }
  const jar = new Jar();
  const lsStub = {
    _m: new Map(),
    getItem(k) { return this._m.get(k) ?? null; },
    setItem(k, v) { this._m.set(k, String(v)); },
    removeItem(k) { this._m.delete(k); },
  };
  globalThis.document = jar;
  globalThis.window = { document: jar, location: { href: "https://uji.id/" }, localStorage: lsStub, addEventListener() {}, removeEventListener() {} };
  globalThis.localStorage = lsStub;

  const browser = ssr.createBrowserClient("https://xyzcompany.supabase.co", "anon-key", {
    cookieOptions: { secure: false, sameSite: "lax", path: "/" },
  });
  // (b1) Cookie ditulis JS (sign-in browser) -> sesi terbaca.
  // Catatan: user object ikut di-seed ke localStorage seperti
  // yang dilakukan library saat sign-in (tanpa itu, auth-js
  // mengganti user dengan proxy yang melempar saat diakses).
  jar.cookie = `${KUNCI}=${encodeURIComponent(JSON.stringify(sesi))}; path=/; SameSite=lax`;
  lsStub.setItem(`${KUNCI}-user`, JSON.stringify({ user: sesi.user }));
  const s1 = await denganTimeout(browser.auth.getSession(), 8000, "getSession JS-cookie");
  let idTerbaca = null;
  try {
    idTerbaca = s1?.data?.session?.user?.id ?? null;
  } catch {
    idTerbaca = "(proxy-user: user tidak tersedia)";
  }
  cek(
    "P0-6: browser client membaca sesi dari cookie JS (sign-in browser)",
    Boolean(s1 && !s1.__timeout && idTerbaca === UID_A),
    s1?.__timeout ? "TIMEOUT" : (s1?.error?.message ?? `id=${idTerbaca}`),
  );
  // (b2) Cookie HANYA ada sebagai httpOnly-server (simulasi
  // refresh token di proxy) -> sesi TIDAK terbaca.
  jar.js.clear();
  lsStub.removeItem(`${KUNCI}-user`);
  jar.httpOnly.set(KUNCI, JSON.stringify(sesi));
  const browser2 = ssr.createBrowserClient("https://xyzcompany.supabase.co", "anon-key", {
    cookieOptions: { secure: false },
  });
  const s2 = await denganTimeout(browser2.auth.getSession(), 8000, "getSession httpOnly-cookie");
  cek(
    "P0-6: browser client TIDAK membaca sesi dari cookie httpOnly-server (getSession null) — bukti httpOnly:true memecahkan AuthArea/profil",
    Boolean(s2 && !s2.__timeout && s2.data?.session == null),
    s2?.__timeout ? "TIMEOUT" : (s2?.data?.session ? "sesi MASIH terbaca (salah)" : "null"),
  );
  cek(
    "P0-6: document.cookie memang tidak memuat cookie httpOnly-server",
    !jar.cookie.includes(KUNCI),
    jar.cookie.slice(0, 60) || "(kosong)",
  );
}

// ---------- §P2-13: responGalatAdmin ----------
console.log("\n== P2-13: responGalatAdmin generik + ERR-XXXX (B-S8) ==");
cek("P2-13: guard.ts memakai randomBytes untuk kode galat", guard.includes("randomBytes"));
{
  const kode = transpileKeJs(
    `${(konstantaBelumSiap ?? "").replace("export const", "const")}\n` +
      `${fnAdalahBelumSiap?.replace("export function", "function") ?? ""}\n` +
      `${fnResponGalatAdmin?.replace("export function", "function") ?? ""}\n` +
      `return { responGalatAdmin };`,
  );
  const { responGalatAdmin } = new Function("NextResponse", "randomBytes", kode)(NextResponseStub, randomBytes);
  const logTangkap = [];
  const consoleAsli = console.error;
  console.error = (...args) => { logTangkap.push(args.join(" ")); };
  let r1;
  let r2;
  try {
    r1 = responGalatAdmin(new Error('duplicate key value violates unique constraint "pf_x_slug_key" on table "pf_knowledge_articles" column "slug"'));
    r2 = responGalatAdmin(new Error("column \"kunci_rahasia\" does not exist"));
  } finally {
    console.error = consoleAsli;
  }
  cek("P2-13: 500 TIDAK membocorkan nama tabel/kolom/constraint Postgres", r1.status === 500 && !String(r1.body.error).includes("pf_knowledge_articles") && !String(r1.body.error).includes("slug") && !String(r1.body.error).includes("duplicate key"));
  cek("P2-13: 500 membawa kode galat buram ERR-XXXXXXXX", /ERR-[0-9A-F]{8}/.test(String(r1.body.error)), String(r1.body.error));
  cek("P2-13: dua galat berbeda -> dua kode berbeda (acak)", String(r1.body.error) !== String(r2.body.error), `${r1.body.error} vs ${r2.body.error}`);
  let logJson = null;
  try { logJson = JSON.parse(logTangkap[0] ?? ""); } catch { logJson = null; }
  cek(
    "P2-13: pesan lengkap TETAP di log server (JSON: event/kode/pesan)",
    Boolean(logJson && logJson.event === "galat_admin" && String(logJson.pesan).includes("pf_knowledge_articles") && String(logJson.kode).startsWith("ERR-")),
    logTangkap[0]?.slice(0, 160) ?? "(tidak ada log)",
  );
  const r3 = responGalatAdmin(new Error("LAYANAN_BELUM_SIAP: Tabel x belum dibuat"));
  cek("P2-13: galat belum-siap tetap 503 jujur (bukan 500 generik)", r3.status === 503);
}

// ---------- §P2-28: HSTS ----------
console.log("\n== P2-28: HSTS (S-22) ==");
const nextConfig = bacaRepo("next.config.ts");
cek("P2-28: next.config.ts memakai Strict-Transport-Security", nextConfig.includes("Strict-Transport-Security"));
cek("P2-28: HSTS max-age=63072000", nextConfig.includes("max-age=63072000"));
cek("P2-28: HSTS includeSubDomains", nextConfig.includes("includeSubDomains"));
cek("P2-28: HSTS preload", nextConfig.includes("preload"));
cek(
  "P2-28: TIDAK ADA header Report-To (belum ada endpoint pengumpul — jangan buat palsu; follow-up)",
  !nextConfig.includes('"Report-To"') && !nextConfig.includes("'Report-To'"),
);
{
  // Perilaku nyata: header CSP yang dihasilkan buatHeaderCsp
  // TIDAK mengandung direktif report-to/report-uri.
  const fnHash = ekstrak(bacaRepo("src/lib/csp.ts"), /export const HASH_SKRIP_TEMA =[\s\S]*?";/, "HASH_SKRIP_TEMA");
  const fnCsp = ekstrak(bacaRepo("src/lib/csp.ts"), /export function buatHeaderCsp\([\s\S]*?\n\}/, "buatHeaderCsp");
  const kodeCsp = transpileKeJs(
    `${(fnHash ?? "").replace("export const", "const")}\n` +
      `${(fnCsp ?? "").replace("export function", "function")}\n` +
      `return { buatHeaderCsp };`,
  );
  const { buatHeaderCsp } = new Function(kodeCsp)();
  const headerCsp = buatHeaderCsp("nonce-uji-b1", { isDev: false, supabaseOrigin: "https://xyz.supabase.co" });
  cek(
    "P2-28: header CSP produksi TIDAK mengandung report-to/report-uri",
    typeof headerCsp === "string" && !headerCsp.includes("report-to") && !headerCsp.includes("report-uri"),
    headerCsp.slice(0, 120),
  );
}

// ---------- §P3-8: ekspor mati ambilIp ----------
console.log("\n== P3-8: hapus ekspor mati ambilIp (B-R4) ==");
cek("P3-8: guard.ts TIDAK lagi mengekspor ambilIp", !guard.includes("ambilIp"));
{
  const berkasSrc = semuaBerkasSrc(`${DIR_REPO}/src`);
  const pemakai = berkasSrc.filter((f) => fs.readFileSync(f, "utf8").includes("ambilIp"));
  cek("P3-8: TIDAK ADA pemakai ambilIp di seluruh src/ (aman dihapus)", pemakai.length === 0, pemakai.join("; "));
  cek("P3-8: guard.ts tetap mengekspor ipDariRequest (pengganti)", guard.includes("ipDariRequest"));
}

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
if (gagal > 0) {
  console.log("HASIL: ADA KEGAGALAN");
  process.exit(1);
}
process.exit(0);
