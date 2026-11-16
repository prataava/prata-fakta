// Baterai Tahap 13B — keamanan T6 (DNS rebinding) + CSP + sapuan secret.
// Menjalankan: node scripts/uji-tahap13b.mjs  (dari root repo)
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
// Bagian: (A) ipPrivat, (B) tolakHostPrivat, (C) fetchAman + mock,
// (D) allowlist feed + fetchRss, (E) re-resolusi pasca-fetch +
// fetchAman live (fetch global, VM), (F) fetchTerpin transport lokal,
// (G) CSP (nonce + directive + tanpa unsafe-inline/unsafe-eval di
// produksi), (H) sapuan secret, (I) penjaga regresi (grep sumber).
// BUKAN data dummy: semua angka berasal dari fungsi/kode nyata;
// satu-satunya jaringan live adalah (E) fetch example.com + DNS
// publik (sama seperti uji-ingestion memakai feed nyata).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  BATAS_DNS_MS,
  fetchAman,
  fetchTerpin,
  ipPrivat,
  periksaUlangResolusi,
  tolakHostPrivat,
} from "../src/lib/ingestion/ssrf.ts";
import {
  HOST_FEED_DIIZINKAN,
  hostFeedDiizinkan,
  tolakHostFeed,
  tolakHostFeedAman,
} from "../src/lib/ingestion/feed-allowlist.ts";
import { fetchRss } from "../src/lib/ingestion/rss.ts";
import { buatHeaderCsp, buatNonce, bacaNonceDariHeaders, HASH_SKRIP_TEMA } from "../src/lib/csp.ts";

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + "/..";

let lolos = 0;
let gagal = 0;
function cek(label, kondisi, detail = "") {
  if (kondisi) {
    lolos++;
    console.log(`OK: ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    gagal++;
    console.log(`GAGAL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
async function cekLempar(label, fn, detail = "") {
  try {
    await fn();
    cek(label, false, `tidak melempar${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    cek(label, true, `${detail ? `${detail} — ` : ""}melempar: ${String(e.message ?? e).slice(0, 90)}`);
  }
}
function mockRespons(status, badan = "", lokasi = null) {
  const h = new Headers();
  if (lokasi) h.set("location", lokasi);
  return { ok: status >= 200 && status < 300, status, headers: h, text: async () => badan };
}
const RSS_MINIMAL =
  `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>` +
  `<item><title>Judul Berita Uji Coba</title><link>https://www.antaranews.com/berita/1</link>` +
  `<description>Deskripsi singkat.</description></item></channel></rss>`;

// ---------- (A) ipPrivat ----------
console.log("\n--- (A) ipPrivat ---");
for (const ip of [
  "127.0.0.1", "10.0.0.1", "10.255.255.255", "192.168.1.1", "172.16.0.1",
  "172.31.255.255", "169.254.169.254", "0.0.0.0", "100.64.0.1", "100.127.9.9",
  "224.0.0.1", "240.0.0.1", "::1", "::", "0:0:0:0:0:0:0:1",
  "::ffff:127.0.0.1", "::ffff:10.0.0.9", "::ffff:7f00:0001",
  "fe80::1", "fe81::1", "febf::1", "fc00::1", "fd12:3456::1",
]) {
  cek(`ipPrivat(${ip}) = privat`, ipPrivat(ip) === true);
}
for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.215.14", "2001:4860:4860::8888", "172.32.0.1", "192.169.0.1"]) {
  cek(`ipPrivat(${ip}) = publik`, ipPrivat(ip) === false);
}
// 198.18/15 SENGAJA tidak diblokir (resolver egress VM menjawab SEMUA
// host dari sana; lihat ssrf.ts + laporan). Asersi ini mendokumentasikan
// perilaku itu — BUKAN klaim bahwa rentang itu diblokir.
cek("ipPrivat(198.18.0.1) = publik (pengecualian VM terdokumentasi)", ipPrivat("198.18.0.1") === false);

// ---------- (B) tolakHostPrivat ----------
console.log("\n--- (B) tolakHostPrivat ---");
cek("localhost ditolak", (await tolakHostPrivat("http://localhost:3000/x")) !== null);
cek("nama tanpa titik ditolak", (await tolakHostPrivat("http://intranet/x")) !== null);
cek("169.254.169.254 ditolak", (await tolakHostPrivat("http://169.254.169.254/latest/meta-data/")) !== null);
cek("http://[::1]/ ditolak", (await tolakHostPrivat("http://[::1]/")) !== null);
cek("URL tak valid ditolak", (await tolakHostPrivat("bukan-url")) !== null);
cek("example.com lolos (publik)", (await tolakHostPrivat("https://example.com/")) === null);

// ---------- (C) fetchAman + mock ----------
console.log("\n--- (C) fetchAman (mock) ---");
await cekLempar("host privat ditolak", () =>
  fetchAman("http://169.254.169.254/x", {}, async () => mockRespons(200, "rahasia")),
);
await cekLempar("redirect ke host privat ditolak", () =>
  fetchAman(
    "https://example.com/awal",
    {},
    async (url) =>
      url === "https://example.com/awal"
        ? mockRespons(302, "", "http://169.254.169.254/x")
        : mockRespons(200, "rahasia"),
  ),
);
await cekLempar("redirect berantai (>5 hop) ditolak", () =>
  fetchAman(
    "https://example.com/r0",
    {},
    async (url) => {
      const n = Number(url.slice("https://example.com/r".length));
      return mockRespons(302, "", `https://example.com/r${n + 1}`);
    },
  ),
);
await cekLempar("redirect ke host di luar allowlist (feed) ditolak", () =>
  fetchAman(
    "https://www.antaranews.com/rss/terkini.xml",
    {},
    async () => mockRespons(302, "", "https://www.detik.com/rss"),
    { periksaHost: tolakHostFeedAman, periksaHopLanjutan: tolakHostFeedAman },
  ),
);
{
  const res = await fetchAman("https://example.com/ok", {}, async () => mockRespons(200, "isi"));
  cek("fetch 200 mock dikembalikan", res.status === 200 && (await res.text()) === "isi");
}
{
  // Redirect 1 hop ke host publik yang sama → lolos.
  const res = await fetchAman(
    "https://example.com/lama",
    {},
    async (url) =>
      url === "https://example.com/lama"
        ? mockRespons(301, "", "https://example.com/baru")
        : mockRespons(200, "baru"),
  );
  cek("redirect 1 hop publik lolos", res.status === 200 && (await res.text()) === "baru");
}

// ---------- (D) allowlist feed + fetchRss ----------
console.log("\n--- (D) allowlist feed ---");
cek("allowlist berisi 8 host", HOST_FEED_DIIZINKAN.size === 8, `${HOST_FEED_DIIZINKAN.size} host`);
for (const host of [
  "www.antaranews.com", "www.cnnindonesia.com", "feed.liputan6.com",
  "www.cnbcindonesia.com", "www.tribunnews.com", "www.republika.co.id",
  "feeds.bbci.co.uk", "api.gdeltproject.org",
]) {
  cek(`allowlist: ${host}`, hostFeedDiizinkan(`https://${host}/x`) === true);
}
for (const host of ["www.detik.com", "evil.antaranews.com", "antaranews.com.evil.test", "antaranews.com", "api.gdeltproject.org.evil.test"]) {
  cek(`allowlist menolak: ${host}`, hostFeedDiizinkan(`https://${host}/x`) === false);
}
cek("tolakHostFeed menolak detik.com", tolakHostFeed("https://www.detik.com/rss") !== null);
cek("tolakHostFeed menerima antaranews", tolakHostFeed("https://www.antaranews.com/rss/terkini.xml") === null);
await cekLempar("fetchRss host di luar allowlist ditolak", () =>
  fetchRss("https://www.detik.com/rss", { fetchFn: async () => mockRespons(200, RSS_MINIMAL) }),
);
{
  const hasil = await fetchRss("https://www.antaranews.com/rss/terkini.xml", {
    fetchFn: async () => mockRespons(200, RSS_MINIMAL),
  });
  cek("fetchRss host allowlist + mock → 1 item ter-parse", hasil.items.length === 1 && hasil.items[0].judul === "Judul Berita Uji Coba");
}
{
  // Jalur opt-out HANYA untuk uji mock (sumber sintetis contoh.test).
  const hasil = await fetchRss("https://contoh.test/sintetis.xml", {
    fetchFn: async () => mockRespons(200, RSS_MINIMAL),
    lewatiAllowlist: true,
  });
  cek("fetchRss lewatiAllowlist (uji mock) → 1 item", hasil.items.length === 1);
}

// ---------- (E) re-resolusi pasca-fetch + live ----------
console.log("\n--- (E) re-resolusi pasca-fetch ---");
cek(
  "periksaUlangResolusi: IP sama → null",
  (await periksaUlangResolusi("https://example.com/", ["93.184.215.14"], async () => ["93.184.215.14"])) === null,
);
cek(
  "periksaUlangResolusi: IP berubah total → ditolak",
  (await periksaUlangResolusi("https://example.com/", ["93.184.215.14"], async () => ["10.0.0.9"])) !== null,
);
cek(
  "periksaUlangResolusi: irisan sebagian (round-robin) → null",
  (await periksaUlangResolusi("https://example.com/", ["1.1.1.1", "2.2.2.2"], async () => ["2.2.2.2", "3.3.3.3"])) === null,
);
cek(
  "periksaUlangResolusi: DNS gagal → null (fail-open terdokumentasi)",
  (await periksaUlangResolusi("https://example.com/", ["93.184.215.14"], async () => { throw new Error("NXDOMAIN"); })) === null,
);
{
  // Jalur live: fetch global nyata. Di VM, pinning gagal (middlebox)
  // → fallback + re-resolusi; di produksi, pinning yang dipakai.
  // Status 200 membuktikan jalur fallback tetap berfungsi.
  const t0 = Date.now();
  const res = await fetchAman("https://example.com/", { signal: AbortSignal.timeout(15000) });
  cek("fetchAman live example.com → 200", res.status === 200, `${Date.now() - t0} ms`);
  await res.arrayBuffer();
}
{
  // Batas DNS (integrasi B1): resolver yang menggantung TIDAK BOLEH
  // menahan fetch selamanya — dulu tahap13b §E menggantung >10 menit
  // di VM karena lookup example.com tak kembali sebelum signal
  // dibuat. Resolver mock yang tak pernah selesai harus ditolak
  // dalam BATAS_DNS_MS (+ toleransi), bukan gantung.
  const t0 = Date.now();
  let ditolak = false;
  try {
    await fetchTerpin("https://contoh.test/jalan", {}, {
      penyelesaian: () => new Promise(() => {}),
      izinkanPrivat: true,
    });
  } catch (err) {
    ditolak = String(err?.message ?? "").includes("kehabisan waktu");
  }
  const durasi = Date.now() - t0;
  cek("fetchTerpin: resolver menggantung → ditolak dalam batas DNS", ditolak && durasi < BATAS_DNS_MS + 3000, `${durasi} ms (batas ${BATAS_DNS_MS} ms)`);
  // Re-resolusi dengan resolver menggantung → null (fail-open) dalam batas.
  const t1 = Date.now();
  const hasil = await periksaUlangResolusi("https://example.com/", ["93.184.215.14"], () => new Promise(() => {}));
  const durasi2 = Date.now() - t1;
  cek("periksaUlangResolusi: resolver menggantung → null dalam batas", hasil === null && durasi2 < BATAS_DNS_MS + 3000, `${durasi2} ms (batas ${BATAS_DNS_MS} ms)`);
}

// ---------- (F) fetchTerpin transport lokal ----------
console.log("\n--- (F) fetchTerpin (server HTTP lokal) ---");
const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ host: req.headers.host ?? null, url: req.url ?? null }));
});
await new Promise((selesai) => server.listen(0, "127.0.0.1", selesai));
const port = server.address().port;
try {
  const res = await fetchTerpin(`http://contoh.test:${port}/jalan?x=1`, {}, {
    penyelesaian: async () => ["127.0.0.1"],
    izinkanPrivat: true,
  });
  const badan = await res.json();
  cek("fetchTerpin: status 200", res.status === 200);
  cek("fetchTerpin: Host header = hostname asli", badan.host === `contoh.test:${port}`, `host=${badan.host}`);
  cek("fetchTerpin: path + query diteruskan", badan.url === "/jalan?x=1", `url=${badan.url}`);
  await cekLempar("fetchTerpin: IP privat hasil resolve ditolak (tanpa izinkanPrivat)", () =>
    fetchTerpin(`http://contoh.test:${port}/`, {}, {
      penyelesaian: async () => ["10.0.0.5"],
    }),
  );
  await cekLempar("fetchTerpin: localhost ditolak", () =>
    fetchTerpin(`http://localhost:${port}/`, {}, { izinkanPrivat: true }),
  );
  await cekLempar("fetchTerpin: metode POST ditolak", () =>
    fetchTerpin(`http://contoh.test:${port}/`, { method: "POST" }, {
      penyelesaian: async () => ["127.0.0.1"],
      izinkanPrivat: true,
    }),
  );
} finally {
  await new Promise((selesai) => server.close(selesai));
}

// ---------- (G) CSP ----------
console.log("\n--- (G) CSP ---");
{
  const n1 = buatNonce();
  const n2 = buatNonce();
  cek("buatNonce: unik per panggilan", n1 !== n2 && n1.length > 0, `n1=${n1.slice(0, 8)}… n2=${n2.slice(0, 8)}…`);
  cek("buatNonce: hanya karakter nonce CSP", /^[A-Za-z0-9+/=]+$/.test(n1));
  const prod = buatHeaderCsp("NONCE-UJI-123");
  const skripProd = prod.split(";").map((s) => s.trim()).find((s) => s.startsWith("script-src")) ?? "";
  cek("CSP produksi: script-src berisi nonce", skripProd.includes("'nonce-NONCE-UJI-123'"), skripProd);
  cek("CSP produksi: script-src berisi 'strict-dynamic'", skripProd.includes("'strict-dynamic'"));
  cek("CSP produksi: script-src TANPA unsafe-inline", !skripProd.includes("unsafe-inline"));
  cek("CSP produksi: TANPA unsafe-eval di mana pun", !prod.includes("unsafe-eval"));
  for (const d of [
    "default-src 'self'", "style-src 'self'", "img-src 'self' https: data: blob:",
    "media-src 'self' https: blob:", "font-src 'self'", "object-src 'none'",
    "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ]) {
    cek(`CSP produksi: directive ada (${d.split(" ")[0]})`, prod.includes(d));
  }
  const dev = buatHeaderCsp("NONCE-UJI-123", { isDev: true });
  cek("CSP dev: unsafe-eval HANYA di dev (React dev, dok Next)", dev.includes("unsafe-eval"));
  const denganSupabase = buatHeaderCsp("N", { supabaseOrigin: "https://xyzcompany.supabase.co" });
  cek(
    "CSP connect-src: origin Supabase dari env",
    denganSupabase.includes("connect-src 'self' https://xyzcompany.supabase.co wss://xyzcompany.supabase.co"),
  );
  const h = new Headers({ "x-nonce": "abc-123" });
  cek("bacaNonceDariHeaders: membaca x-nonce", bacaNonceDariHeaders(h) === "abc-123");
  cek("bacaNonceDariHeaders: kosong → null", bacaNonceDariHeaders(new Headers()) === null);
}

// ---------- (H) sapuan secret ----------
console.log("\n--- (H) sapuan secret ---");
{
  const pola = [
    /sk-[A-Za-z0-9]{16,}/,
    /AKIA[0-9A-Z]{16}/,
    /ghp_[A-Za-z0-9]{20,}/,
    /gho_[A-Za-z0-9]{20,}/,
    /xox[baprs]-[A-Za-z0-9-]{10,}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /eyJhbGciOi[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  ];
  // Pola penetapan env (KEY=nilai) diperiksa PER BARIS dan baris
  // komentar dilewati: workflow/.env.example berisi
  // "PF_AI_SECRET=<redacted>" di komentar + referensi
  // "${{ secrets.PF_AI_SECRET }}" — keduanya BUKAN nilai secret.
  const polaEnv = [
    /SUPABASE_SERVICE_ROLE_KEY[ \t]*=[ \t]*\S+/,
    /PF_AI_SECRET[ \t]*=[ \t]*\S+/,
  ];
  const temuan = [];
  const jalan = (dir) => {
    for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entri.name);
      if (entri.isDirectory()) {
        if (entri.name === "node_modules" || entri.name === ".next") continue;
        jalan(p);
      } else if (/\.(ts|tsx|js|mjs|sql|yml|yaml|json|example)$/.test(entri.name)) {
        if (p.endsWith("scripts/uji-tahap13b.mjs")) continue; // berkas ini sendiri berisi pola uji
        const isi = fs.readFileSync(p, "utf8");
        pola.forEach((re, i) => {
          if (re.test(isi)) temuan.push(`${p} :: pola#${i}`);
        });
        for (const baris of isi.split("\n")) {
          const bersih = baris.trim();
          if (bersih.startsWith("#") || bersih.startsWith("//")) continue;
          polaEnv.forEach((re, i) => {
            const cocok = baris.match(re);
            if (cocok && !cocok[0].includes("<") && !cocok[0].includes("${")) {
              temuan.push(`${p} :: env#${i}: ${cocok[0].slice(0, 40)}`);
            }
          });
        }
      }
    }
  };
  for (const d of ["src", "supabase", ".github"]) jalan(path.join(ROOT, d));
  const envExample = path.join(ROOT, ".env.example");
  if (fs.existsSync(envExample)) {
    const isi = fs.readFileSync(envExample, "utf8");
    pola.forEach((re, i) => {
      if (re.test(isi)) temuan.push(`.env.example :: pola#${i}`);
    });
    for (const baris of isi.split("\n")) {
      const bersih = baris.trim();
      if (bersih.startsWith("#")) continue;
      polaEnv.forEach((re, i) => {
        const cocok = baris.match(re);
        if (cocok && !cocok[0].includes("<") && !cocok[0].includes("${")) {
          temuan.push(`.env.example :: env#${i}: ${cocok[0].slice(0, 40)}`);
        }
      });
    }
  }
  cek("sapuan secret: 0 temuan", temuan.length === 0, temuan.slice(0, 5).join("; "));
}

// ---------- (I) penjaga regresi (grep sumber) ----------
console.log("\n--- (I) penjaga regresi ---");
{
  const baca = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  cek("proxy.ts memasang CSP + x-nonce", baca("src/proxy.ts").includes("Content-Security-Policy") && baca("src/proxy.ts").includes("x-nonce"));
  cek("layout.tsx TIDAK memakai nonce skrip tema (pakai hash, Tahap 14)", !baca("src/app/layout.tsx").includes("nonce={nonce"));
  cek("layout.tsx TIDAK membaca headers() (prerender statis aman)", !baca("src/app/layout.tsx").includes('from "next/headers"') && !baca("src/app/layout.tsx").includes("await headers()"));
  cek("artikel/[slug] memakai nonce JSON-LD", baca("src/app/artikel/[slug]/page.tsx").includes("nonce={nonce"));
  cek("pengetahuan/[slug] memakai nonce JSON-LD", baca("src/app/pengetahuan/[slug]/page.tsx").includes("nonce={nonce"));
  cek("gdelt.ts memakai fetchAman (bukan fetch mentah)", baca("src/lib/ingestion/gdelt.ts").includes("fetchAman"));
  cek("rss.ts memakai allowlist feed", baca("src/lib/ingestion/rss.ts").includes("tolakHostFeed"));
  cek("ssrf.ts tidak mengandung unsafe-inline/unsafe-eval", !baca("src/lib/ingestion/ssrf.ts").includes("unsafe-inline") && !baca("src/lib/ingestion/ssrf.ts").includes("unsafe-eval"));
  cek("tidak ada fetch mentah ke URL arbitrer di ingestion/ai", !/await ambil\(url, \{/.test(baca("src/lib/ingestion/gdelt.ts")));
}

// ---------- (J) skrip tema pakai hash (perbaikan build Tahap 14) ----------
console.log("\n--- (J) skrip tema pakai hash ---");
{
  const baca = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  const layout = baca("src/app/layout.tsx");
  const csp = baca("src/lib/csp.ts");
  cek("HASH_SKRIP_TEMA diekspor csp.ts", typeof HASH_SKRIP_TEMA === "string" && HASH_SKRIP_TEMA.startsWith("'sha256-"));
  const prod = buatHeaderCsp("NONCE-UJI-123");
  const skripProd = prod.split(";").map((s) => s.trim()).find((s) => s.startsWith("script-src")) ?? "";
  cek("CSP produksi: script-src berisi hash skrip tema", skripProd.includes(HASH_SKRIP_TEMA), skripProd);
  // Ekstrak isi skrip tema dari layout.tsx (string `kode` di TemaInit)
  // dan hitung sha256-nya — harus sama dengan konstanta di csp.ts.
  const cocok = layout.match(/const kode = `([^`]+)`;/);
  cek("isi skrip tema dapat diekstrak dari layout.tsx", Boolean(cocok?.[1]));
  if (cocok?.[1]) {
    const hash = `'sha256-${createHash("sha256").update(cocok[1], "utf8").digest("base64")}'`;
    cek("hash skrip tema di layout.tsx SAMA dengan HASH_SKRIP_TEMA", hash === HASH_SKRIP_TEMA, hash);
  }
  cek("csp.ts mendokumentasikan hash skrip tema", csp.includes("HASH_SKRIP_TEMA") && csp.includes("sha256-"));
}

console.log(`\nHASIL: ${lolos} LOLOS, ${gagal} GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
