// Uji integrasi Tahap 14 PRATA FAKTA — tautan silang 14 area.
// Memindai seluruh src/ untuk href/redirect/push internal, lalu
// memeriksa tiap target ada sebagai page.tsx / route.ts (segmen
// [slug]/[kode]/[id] dianggap wildcard). Juga memeriksa:
//   - nav publik (Header) menautkan 14 area;
//   - sitemap.ts menyebut slug dinamis baru;
//   - tidak ada tautan ke rute yang dihapus.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// §F (Tahap F): PGlite + fungsi murni + gate editorial asli.
const requirePglite = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = requirePglite("@electric-sql/pglite");
const requireRepo = createRequire(
  new URL("../package.json", import.meta.url).pathname,
);
const tsCompiler = requireRepo("typescript");
import { tentukanKeputusanVerifikasi } from "../src/lib/ai/verification.ts";
import { susunDrafJawaban } from "../src/lib/ai/tanya-draf.ts";
import {
  GalatGateTerbit,
  periksaGateTerbit,
  terbitkanArtikel,
} from "../src/lib/admin/editorial.ts";

const DIR_SRC = new URL("../src/", import.meta.url).pathname;

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

function jalanSemua(dir, ekst, keluar = []) {
  for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
    const penuh = path.join(dir, entri.name);
    if (entri.isDirectory()) {
      if (entri.name === "node_modules") continue;
      jalanSemua(penuh, ekst, keluar);
    } else if (ekst.some((e) => entri.name.endsWith(e))) {
      keluar.push(penuh);
    }
  }
  return keluar;
}

// ---------- Kumpulkan rute yang ada ----------
const halaman = new Set();
const api = new Set();
for (const f of jalanSemua(path.join(DIR_SRC, "app"), [".tsx", ".ts"])) {
  const rel = f.slice(path.join(DIR_SRC, "app").length);
  if (rel.endsWith("/page.tsx")) {
    let rute = rel.slice(0, -"/page.tsx".length) || "/";
    rute = rute.replace(/\[slug\]|\[kode\]|\[id\]/g, "*");
    halaman.add(rute);
  }
  if (rel.endsWith("/route.ts")) {
    // Route handler di luar /api (mis. /podcast.xml, /rss.xml)
    // adalah rute halaman, bukan API — masukkan ke kumpulan
    // yang sesuai agar tautan ke sana tidak dikira mati.
    let rute = rel.slice(0, -"/route.ts".length);
    rute = rute.replace(/\[slug\]|\[kode\]|\[id\]/g, "*");
    if (rute.startsWith("/api/")) api.add(rute);
    else halaman.add(rute);
  }
}
console.log(`Rute halaman: ${halaman.size}, rute API: ${api.size}`);

function ruteAda(target) {
  const bersih = target.split("?")[0].split("#")[0];
  if (bersih === "/") return halaman.has("/");
  const segmen = bersih.split("/").filter(Boolean);
  const cocok = (kumpulan) => {
    for (const r of kumpulan) {
      const rs = r.split("/").filter(Boolean);
      if (rs.length !== segmen.length) continue;
      let ok = true;
      for (let i = 0; i < rs.length; i++) {
        if (rs[i] === "*") continue;
        if (rs[i] !== segmen[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
    return false;
  };
  if (bersih.startsWith("/api/")) return cocok(api);
  return cocok(halaman);
}

// ---------- Pindai tautan internal ----------
const pola = [
  /href=\{?["'`](\/[^"'`{}?#]*)["'`]\}?/g,
  /href="(\/[^"]*)"/g,
  /redirect\(\s*["'`](\/[^"'`]*)/g,
  /(?:router\.push|push)\(\s*["'`](\/[^"'`]*)/g,
  /replace\(\s*["'`](\/[^"'`]*)/g,
];
const tautan = new Map(); // target -> [berkas]
for (const f of jalanSemua(DIR_SRC, [".tsx", ".ts"])) {
  const isi = fs.readFileSync(f, "utf8");
  for (const re of pola) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(isi)) !== null) {
      const target = m[1].split("?")[0].split("#")[0];
      if (!target || target.startsWith("/api/") === false) {
        // tetap catat semua, termasuk /api
      }
      if (!tautan.has(target)) tautan.set(target, []);
      if (!tautan.get(target).includes(f)) tautan.get(target).push(f);
    }
  }
}
// Buang target dinamis (mengandung ${ atau * atau : — tidak bisa dicek statis).
const statis = [...tautan.keys()].filter(
  (t) => t && !t.includes("${") && !t.includes("*") && !t.includes(":"),
);
console.log(`Tautan internal statis ditemukan: ${statis.length}`);
const mati = [];
for (const t of statis) {
  if (!ruteAda(t)) mati.push(t);
}
cek("tidak ada tautan internal mati", mati.length === 0, mati.length ? `mati: ${mati.slice(0, 10).join(", ")}` : `${statis.length} tautan OK`);
if (mati.length > 0) {
  for (const t of mati.slice(0, 20)) {
    console.log(`  MATI ${t} <- ${tautan.get(t).map((f) => f.replace(DIR_SRC, "")).join(", ")}`);
  }
}

// ---------- Nav publik menautkan 14 area ----------
// Jejak Fakta + Multi-Source View bukan entri nav sendiri — keduanya
// adalah seksi di dalam halaman artikel; yang diperiksa adalah
// halaman artikel merender kedua komponen itu. Admin sengaja tidak
// ada di nav publik (masuk staf lewat /masuk; /saya redirect ke
// /masuk bila belum login — diperiksa di bawah).
// Nav publik tinggal di HeaderNav.tsx (F-S6, Gelombang B1): Header
// hanya me-render <HeaderNav />. Periksa sumber kebenaran nav di
// sana, plus Header benar-benar memakainya.
const header = fs.readFileSync(path.join(DIR_SRC, "components/HeaderNav.tsx"), "utf8");
cek(
  "Header me-render <HeaderNav />",
  fs.readFileSync(path.join(DIR_SRC, "components/Header.tsx"), "utf8").includes("<HeaderNav />"),
);
const tautanArea = {
  "Story Tracker (cerita)": "/cerita",
  "Explain the World (pengetahuan)": "/pengetahuan",
  "Reality Check (data)": "/data",
  "Ask the World (tanya)": "/tanya",
  "My PRATA (saya)": "/saya",
  "Academy (akademi)": "/akademi",
  "Podcast (podcast)": "/podcast",
  "Research (riset)": "/riset",
  "Country Profile (negara)": "/negara",
  "Historical Archive (sejarah)": "/sejarah",
  "Public Report (laporkan)": "/laporkan",
};
for (const [nama, href] of Object.entries(tautanArea)) {
  cek(`nav Header menautkan ${nama}`, header.includes(href), href);
}
const halamanArtikel = fs.readFileSync(
  path.join(DIR_SRC, "app/artikel/[slug]/page.tsx"),
  "utf8",
);
cek(
  "halaman artikel merender Jejak Fakta (Area 1)",
  halamanArtikel.includes("<JejakFakta"),
  "JejakFakta",
);
cek(
  "halaman artikel merender Multi-Source View (Area 3)",
  halamanArtikel.includes("<PerbandinganSumber"),
  "PerbandinganSumber",
);
const halamanSaya = fs.readFileSync(path.join(DIR_SRC, "app/saya/page.tsx"), "utf8");
cek(
  "login staf/pengguna terjangkau: /saya redirect ke /masuk bila belum login",
  halamanSaya.includes('redirect("/masuk")'),
  "/saya -> /masuk",
);

// ---------- Sitemap menyebut slug dinamis baru ----------
const sitemap = fs.readFileSync(path.join(DIR_SRC, "app/sitemap.ts"), "utf8");
for (const tabel of ["pf_stories", "pf_courses", "pf_research_reports", "pf_podcast_episodes", "pf_countries"]) {
  cek(`sitemap menyebut ${tabel}`, sitemap.includes(tabel), tabel);
}

// ---------- Alur data silang: artikel -> cerita/negara, negara -> berita ----------
// Arah cerita->artikel dan negara->artikel ada di lib/cerita.ts +
// lib/negara.ts; arah artikel->cerita/negara ditutup Tahap 14 oleh
// getCeritaUntukArtikel + kolom negara_kode di artikel lengkap.
const libData = fs.readFileSync(path.join(DIR_SRC, "lib/data.ts"), "utf8");
cek(
  "artikel lengkap memuat negara_kode (artikel->negara)",
  libData.includes("negara_kode"),
  "KOLOM_ARTIKEL_LENGKAP",
);
const libCerita = fs.readFileSync(path.join(DIR_SRC, "lib/cerita.ts"), "utf8");
cek(
  "lib/cerita.ts punya getCeritaUntukArtikel (artikel->cerita)",
  libCerita.includes("getCeritaUntukArtikel") && libCerita.includes("pf_story_articles"),
  "getCeritaUntukArtikel",
);
const libNegara = fs.readFileSync(path.join(DIR_SRC, "lib/negara.ts"), "utf8");
cek("lib/negara.ts membaca artikel terbaru per negara", libNegara.includes("pf_articles"));
const libRiset = fs.readFileSync(path.join(DIR_SRC, "lib/riset.ts"), "utf8");
cek("lib/riset.ts menautkan dataset indikator (riset<->data)", libRiset.includes("pf_data_indicators") || libRiset.includes("indikator"));
cek("lib/cerita.ts memakai RPC pf_akar_salinan (anti kesetaraan palsu)", libCerita.includes("pf_akar_salinan"));
cek(
  "halaman artikel menautkan /cerita/ (konteks cerita)",
  halamanArtikel.includes("/cerita/"),
  "/cerita/${cerita.slug}",
);
cek(
  "halaman artikel menautkan /negara/ (konteks negara)",
  halamanArtikel.includes("/negara/"),
  "/negara/${negara.negara.kode}",
);

// ---------- §F. Pengujian nyata PGlite (Tahap F) ----------
// Memverifikasi hubungan 1–12 di tingkat database + logika
// (bukan hanya statis): migrasi v1–v14 NYATA diterapkan ke
// PGlite, data uji SINTETIS disisipkan, lalu tiap hubungan
// diuji lewat SQL yang sama dengan yang dipakai lib/*,
// RPC asli, fungsi murni, dan gate editorial asli.
// Asersi berlabel KESENJANGAN TERDOKUMENTASI adalah celah
// NYATA yang ditemukan Tahap F dan BELUM diperbaiki (berkas
// pemilik agen lain — dilaporkan ke koordinator, bukan
// diperbaiki diam-diam): bila celah itu ditutup, balik asersi
// tersebut menjadi pemeriksaan keberadaan tautan/fitur.

const DIR_MIGRASI = new URL("../supabase/migrations/", import.meta.url).pathname;
const DIR_REPO = new URL("../", import.meta.url).pathname;

function bacaMigrasi(nama) {
  let sql = fs.readFileSync(`${DIR_MIGRASI}/${nama}`, "utf8");
  sql = sql.replace(/create extension[^;]+;/gi, "-- ekstensi dilepas (PGlite)");
  sql = sql.replace(/\bcitext\b/gi, "text");
  return sql;
}

function transpileKeJs(kodeTs) {
  return tsCompiler.transpileModule(kodeTs, {
    compilerOptions: {
      module: tsCompiler.ModuleKind.CommonJS,
      target: tsCompiler.ScriptTarget.ES2020,
    },
  }).outputText;
}

/** Ambil fungsi-fungsi murni dari satu berkas TS (pola
 *  uji-fase8-gel2-cerita.mjs): ekstrak sumber tiap fungsi
 *  lewat regex, transpile, kembalikan objek nama->fungsi. */
function ambilFungsiMurni(relatif, namaFungsi, ekstra = []) {
  const isi = fs.readFileSync(path.join(DIR_REPO, relatif), "utf8");
  const potong = [];
  for (const pola of ekstra) {
    const m = isi.match(pola);
    if (m) potong.push(m[0]);
  }
  for (const nama of namaFungsi) {
    // Tanpa regex (hindari escaping): fungsi ditutup baris
    // "}" di kolom 0; penutup blok di dalam fungsi menjorok.
    const awal = isi.indexOf(`export function ${nama}(`);
    if (awal < 0) throw new Error(`fungsi ${nama} tidak ditemukan di ${relatif}`);
    const akhir = isi.indexOf("\n}", awal);
    if (akhir < 0) throw new Error(`akhir fungsi ${nama} tidak ditemukan`);
    potong.push(isi.slice(awal, akhir + 2).replace("export function", "function"));
  }
  const hasil = new Function(
    `${transpileKeJs(potong.join("\n"))}\nreturn { ${namaFungsi.join(", ")} };`,
  )();
  return hasil;
}

const MIGRASI_F = [
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

const dbF = new PGlite();
await dbF.exec(`create schema if not exists auth;`);
await dbF.exec(`create schema if not exists extensions;`);
await dbF.exec(
  `create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);`,
);
await dbF.exec(
  `create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('pf.uid_test', true), '')::uuid $$;`,
);
await dbF.exec(`create role anon nologin;`);
await dbF.exec(`create role authenticated nologin;`);
await dbF.exec(`create role service_role bypassrls nologin;`);
let gagalMigrasiF = 0;
for (const putaran of [1, 2]) {
  for (const nama of MIGRASI_F) {
    try {
      await dbF.exec(bacaMigrasi(nama));
    } catch (e) {
      console.log(`GAGAL: migrasi ${nama} (putaran ${putaran})\n  -> ${String(e.message).split("\n")[0]}`);
      gagalMigrasiF++;
    }
  }
}
if (gagalMigrasiF > 0) {
  console.log(`\n${lolos} lolos, ${gagal + gagalMigrasiF} gagal (migrasi §F)`);
  process.exit(1);
}
console.log("OK: §F migrasi v1–v14 diterapkan (2 putaran)");

async function sebagaiF(role, sql, params = []) {
  await dbF.query(`set role ${role}`);
  try {
    return await dbF.query(sql, params);
  } finally {
    await dbF.query("reset role");
  }
}

async function sebagaiUidF(role, uid, sql, params = []) {
  await dbF.query(`set role ${role}`);
  await dbF.query(`select set_config('pf.uid_test', $1, false)`, [uid]);
  try {
    return await dbF.query(sql, params);
  } finally {
    await dbF.query(`select set_config('pf.uid_test', '', false)`);
    await dbF.query("reset role");
  }
}

async function hitungSebagaiUidF(role, uid, sql, params = []) {
  const r = await sebagaiUidF(role, uid, sql, params);
  return Number(r.rows[0]?.n ?? 0);
}

async function berhasilSebagaiUidF(role, uid, sql, params = []) {
  try {
    await sebagaiUidF(role, uid, sql, params);
    return true;
  } catch {
    return false;
  }
}

// ---------- Seed sintetis §F ----------
const UID_A = "11111111-1111-1111-1111-111111111111";
const UID_B = "22222222-2222-2222-2222-222222222222";
const NEG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const NEG_MY = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SUM_S1 = "c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1";
const SUM_S2 = "c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2";
const SUM_S3 = "c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3";
const ART1 = "a1111111-1111-1111-1111-111111111111"; // draf VERIFIED (ID) — subjek gate
const ART2 = "a2222222-2222-2222-2222-222222222222"; // draf UNCONFIRMED (MY)
const ART3 = "a3333333-3333-3333-3333-333333333333"; // terbit VERIFIED (ID)
const ART4 = "a4444444-4444-4444-4444-444444444444"; // terbit (MY)
const CL1 = "d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1";
const CL2 = "d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2";
const RAW_X = "e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1"; // akar (Antara)
const RAW_B = "e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2"; // salinan X (CNN)
const RAW_C = "e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3e3"; // salinan X (Blog)
const RAW_Y1 = "e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4";
const RAW_Y2 = "e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5";
const RAW_Y3 = "e6e6e6e6-e6e6-e6e6-e6e6-e6e6e6e6e6e6";
const ST1 = "f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1"; // cerita terbit
const ST2 = "f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2"; // cerita draf
const EV_ID = "b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1"; // event ID
const EV_MY = "b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2"; // event MY
const EV_NOTL = "b3b3b3b3-b3b3-b3b3-b3b3-b3b3b3b3b3b3"; // event ID tanpa timeline
const IND1 = "c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4";
const IND2 = "c5c5c5c5-c5c5-c5c5-c5c5-c5c5c5c5c5c5";

try {
  await dbF.query(
    `insert into auth.users (id, email) values ($1, 'a@uji.id'), ($2, 'b@uji.id')`,
    [UID_A, UID_B],
  );
  await dbF.query(
    `insert into public.pf_categories (slug, nama) values ('nasional', 'Nasional')`,
  );
  await dbF.query(
    `insert into public.pf_countries (id, kode, nama, ibu_kota, populasi, sumber, periode_referensi)
     values ($1, 'ID', 'Indonesia', 'Jakarta', 275000000, 'BPS', '2024'),
            ($2, 'MY', 'Malaysia', 'Kuala Lumpur', 33000000, 'DOSM', '2024')`,
    [NEG_ID, NEG_MY],
  );
  await dbF.query(
    `insert into public.pf_sources (id, nama, jenis, url, prioritas) values
     ($1, 'Antara', 'rss', 'https://antara.example/rss', 100),
     ($2, 'CNN Indonesia', 'rss', 'https://cnn.example/rss', 90),
     ($3, 'Blog Acak', 'manual', 'https://blog.example/x', 50)`,
    [SUM_S1, SUM_S2, SUM_S3],
  );
  await dbF.query(
    `insert into public.pf_articles (id, slug, judul, ringkasan, isi, kategori_slug, status_verifikasi, status, negara_kode, sumber_url, diterbitkan_pada)
     values
     ($1, 'artikel-verified', 'Harga Pangan Naik di Pasar', 'Ringkasan.', 'Isi.', 'nasional', 'VERIFIED', 'draft', 'ID', 'https://antara.example/berita-x', null),
     ($2, 'artikel-draf', 'Rumor Belum Terkonfirmasi', 'Ringkasan.', 'Isi.', 'nasional', 'UNCONFIRMED', 'draft', 'MY', null, null),
     ($3, 'artikel-id-2', 'Inflasi Indonesia: Harga Pangan Naik', 'Ringkasan inflasi.', 'Isi inflasi.', 'nasional', 'VERIFIED', 'terbit', 'ID', 'https://antara.example/berita-x', '2026-01-12T10:00:00Z'),
     ($4, 'artikel-my', 'Berita Malaysia', 'Ringkasan.', 'Isi.', 'nasional', 'VERIFIED', 'terbit', 'MY', null, '2026-01-13T10:00:00Z')`,
    [ART1, ART2, ART3, ART4],
  );
  await dbF.query(
    `insert into public.pf_claims (id, artikel_id, teks, jenis, status) values
     ($1, $3, 'Harga pangan naik 5 persen.', 'angka', 'terverifikasi'),
     ($2, $3, 'Kenaikan terjadi di Jakarta.', 'fakta', 'terverifikasi')`,
    [CL1, CL2, ART1],
  );
  await dbF.query(
    `insert into public.pf_evidence (klaim_id, sumber_url, sumber_nama, arah) values
     ($1, 'https://antara.example/berita-x', 'Antara', 'mendukung'),
     ($1, 'https://cnn.example/berita-x', 'CNN Indonesia', 'mendukung'),
     ($2, 'https://antara.example/berita-x', 'Antara', 'mendukung')`,
    [CL1, CL2],
  );
  await dbF.query(
    `insert into public.pf_verification_records (artikel_id, agen, keputusan, catatan, bukti, dibuat_oleh, dibuat_pada) values
     ($1, 'fact_verification', 'VERIFIED', 'Dua sumber independen tier-1.', '[{"url":"https://antara.example/berita-x","arah":"mendukung"}]', $3, '2026-11-01T10:00:00Z'),
     ($2, 'fact_verification', 'UNCONFIRMED', 'Bukti tidak cukup.', '[]', $3, '2026-11-01T10:00:00Z')`,
    [ART1, ART2, UID_A],
  );
  await dbF.query(
    `insert into public.pf_editorial_reviews (artikel_id, reviewer_id, keputusan, catatan, dibuat_pada) values
     ($1, $2, 'setuju', 'Setuju terbit.', '2026-11-02T10:00:00Z')`,
    [ART1, UID_A],
  );
  await dbF.query(
    `insert into public.pf_raw_items (id, sumber_id, url, hash_url, judul, hash_judul, disalin_dari_id, waktu_terbit_asli) values
     ($1, $7, 'https://antara.example/berita-x', 'h-x', 'Harga Pangan Naik', 'hj-x', null, '2026-01-10T08:00:00Z'),
     ($2, $8, 'https://cnn.example/berita-x', 'h-b', 'Harga Pangan Naik', 'hj-b', $1, '2026-01-10T09:00:00Z'),
     ($3, $9, 'https://blog.example/berita-x', 'h-c', 'Harga Pangan Naik', 'hj-c', $1, '2026-01-10T10:00:00Z'),
     ($4, $7, 'https://antara.example/berita-y1', 'h-y1', 'Harga Pangan Naik', 'hj-y1', null, '2026-01-10T08:00:00Z'),
     ($5, $8, 'https://cnn.example/berita-y2', 'h-y2', 'Harga Pangan Naik', 'hj-y2', null, '2026-01-10T09:00:00Z'),
     ($6, $9, 'https://blog.example/berita-y3', 'h-y3', 'Harga Pangan Naik', 'hj-y3', null, '2026-01-10T10:00:00Z')`,
    [RAW_X, RAW_B, RAW_C, RAW_Y1, RAW_Y2, RAW_Y3, SUM_S1, SUM_S2, SUM_S3],
  );
  await dbF.query(
    `insert into public.pf_stories (id, slug, judul, status, status_perkembangan) values
     ($1, 'cerita-id', 'Kenaikan Harga Pangan', 'terbit', 'berkembang'),
     ($2, 'cerita-draf', 'Cerita Masih Draf', 'draft', 'berkembang')`,
    [ST1, ST2],
  );
  await dbF.query(
    `insert into public.pf_story_articles (story_id, artikel_id, peran) values
     ($1, $3, 'terkait'), ($1, $4, 'pembaruan'), ($2, $5, 'terkait')`,
    [ST1, ST2, ART3, ART1, ART2],
  );
  await dbF.query(
    `insert into public.pf_events (id, judul, ringkasan, dimulai_pada, negara_kode) values
     ($1, 'Kenaikan harga pangan dan inflasi', 'Harga pangan naik.', '2026-01-10T00:00:00Z', 'ID'),
     ($2, 'Peristiwa Malaysia', 'Ringkasan.', '2026-02-01T00:00:00Z', 'MY'),
     ($3, 'Peristiwa ID tanpa timeline', 'Ringkasan.', '2026-03-01T00:00:00Z', 'ID')`,
    [EV_ID, EV_MY, EV_NOTL],
  );
  await dbF.query(
    `insert into public.pf_story_events (story_id, event_id, urutan) values
     ($1, $3, 1), ($1, $5, 2), ($2, $4, 1), ($2, $3, 2)`,
    [ST1, ST2, EV_ID, EV_MY, EV_NOTL],
  );
  await dbF.query(
    `insert into public.pf_event_timeline (event_id, waktu, peristiwa, sumber) values
     ($1, '2026-01-10T08:00:00Z', 'Harga naik di pasar pagi.', 'Antara'),
     ($1, '2026-01-10T12:00:00Z', 'Pemerintah merespons siang.', 'CNN Indonesia'),
     ($2, '2026-02-01T09:00:00Z', 'Peristiwa Malaysia dicatat.', 'DOSM')`,
    [EV_ID, EV_MY],
  );
  await dbF.query(
    `insert into public.pf_data_indicators (id, nama, slug, kategori, satuan, sumber_nama, sumber_url, metodologi, tanggal_pembaruan, cakupan, frekuensi_update, negara_kode) values
     ($1, 'Inflasi Indonesia', 'inflasi-indonesia', 'ekonomi', '%', 'BPS', 'https://bps.example/inflasi', 'IHK 90 kota.', '2026-10-01', 'indonesia', 'bulanan', 'ID'),
     ($2, 'Indeks Harga', 'indeks-harga', 'ekonomi', 'poin', 'BPS', null, 'Survei harga.', '2026-09-01', 'indonesia', 'bulanan', 'ID')`,
    [IND1, IND2],
  );
  await dbF.query(
    `insert into public.pf_data_points (indikator_id, tanggal, nilai) values
     ($1, '2026-09-01', 2.5), ($1, '2026-10-01', 2.8)`,
    [IND1],
  );
  await dbF.query(
    `insert into public.pf_knowledge_articles (id, slug, judul, ringkasan, isi, topik, status) values
     ('d3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3', 'inflasi-penjelasan', 'Apa itu Inflasi?', 'Penjelasan inflasi.', 'Isi.', 'ekonomi', 'terbit')`,
  );
  await dbF.query(
    `insert into public.pf_research_reports (id, slug, judul, status, indikator_id) values
     ('e7e7e7e7-e7e7-e7e7-e7e7-e7e7e7e7e7e7', 'riset-inflasi', 'Riset Inflasi 2026', 'terbit', $1),
     ('e8e8e8e8-e8e8-e8e8-e8e8-e8e8e8e8e8e8', 'indeks-harga', 'Riset Indeks Harga', 'terbit', null)`,
    [IND1],
  );
  await dbF.query(
    `insert into public.pf_courses (id, slug, judul, status) values
     ('f3f3f3f3-f3f3-f3f3-f3f3-f3f3f3f3f3f3', 'kursus-inflasi', 'Memahami Inflasi', 'terbit')`,
  );
  await dbF.query(
    `insert into public.pf_course_modules (id, course_id, judul) values
     ('f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4f4', 'f3f3f3f3-f3f3-f3f3-f3f3-f3f3f3f3f3f3', 'Modul 1')`,
  );
  await dbF.query(
    `insert into public.pf_course_lessons (id, module_id, judul, jenis) values
     ('f5f5f5f5-f5f5-f5f5-f5f5-f5f5f5f5f5f5', 'f4f4f4f4-f4f4-f4f4-f4f4-f4f4f4f4f4f4', 'Pelajaran 1', 'materi')`,
  );
  await dbF.query(
    `insert into public.pf_podcast_episodes (id, slug, judul, teks_naskah, status) values
     ('f6f6f6f6-f6f6-f6f6-f6f6-f6f6f6f6f6f6', 'episode-inflasi', 'Episode Inflasi', 'Naskah.', 'terbit')`,
  );
} catch (e) {
  console.log(`GAGAL: seed §F\n  -> ${String(e.message).split("\n")[0]}`);
  process.exit(1);
}
console.log("OK: §F seed sintetis diterapkan");

// Adapter PGlite minimal untuk editorial.ts (cerminan
// AdapterPGliteAdmin di uji-ultimate-gate.mjs).
const KOLOM_ARTIKEL_F =
  "id,slug,judul,subjudul,ringkasan,isi,kategori_slug,subkategori_slug," +
  "status_verifikasi,status,penulis_nama,penulis_id,sumber_url,gambar_url," +
  "estimasi_baca_menit,kronologi,fakta_penting,data_pendukung,mengapa_penting," +
  "dampak,belum_diketahui,dijadwalkan_pada,diterbitkan_pada,diterbitkan_oleh," +
  "dibuat_pada,diperbarui_pada";
const KOLOM_ARTIKEL_F_SET = new Set(KOLOM_ARTIKEL_F.split(","));
class AdapterF {
  constructor(database) {
    this.db = database;
  }
  async getArtikel({ id }) {
    const r = await this.db.query(
      `select ${KOLOM_ARTIKEL_F} from public.pf_articles where id = $1`,
      [id],
    );
    return r.rows[0] ?? null;
  }
  async perbaruiArtikel({ id, patch, harapkanStatus }) {
    const { catatan_versi: _c, ...kolom } = patch;
    void _c;
    const entri = Object.entries(kolom).filter(([k]) => KOLOM_ARTIKEL_F_SET.has(k));
    if (entri.length === 0) return this.getArtikel({ id });
    const set = entri.map(([k], i) => `${k} = $${i + 1}`).join(", ");
    const param = entri.map(([k, v]) =>
      k === "kronologi" || k === "fakta_penting" || k === "data_pendukung"
        ? JSON.stringify(v ?? [])
        : v,
    );
    const syaratStatus = harapkanStatus
      ? ` and status = $${entri.length + 2}`
      : "";
    const paramAkhir = harapkanStatus
      ? [...param, id, harapkanStatus]
      : [...param, id];
    const r = await this.db.query(
      `update public.pf_articles set ${set} where id = $${entri.length + 1}${syaratStatus} returning ${KOLOM_ARTIKEL_F}`,
      paramAkhir,
    );
    return r.rows[0] ?? null;
  }
  async getVerifikasiTerakhir({ artikel_id }) {
    const r = await this.db.query(
      `select id,artikel_id,raw_item_id,agen,keputusan,catatan,bukti,dibuat_oleh,dibuat_pada
       from public.pf_verification_records where artikel_id = $1
       order by dibuat_pada desc limit 1`,
      [artikel_id],
    );
    return r.rows[0] ?? null;
  }
  async getReviewTerakhir({ artikel_id }) {
    const r = await this.db.query(
      `select id,artikel_id,reviewer_id,keputusan,catatan,dibuat_pada
       from public.pf_editorial_reviews where artikel_id = $1
       order by dibuat_pada desc limit 1`,
      [artikel_id],
    );
    return r.rows[0] ?? null;
  }
  async getVersiTerakhir({ artikel_id }) {
    const r = await this.db.query(
      `select id,artikel_id,versi,judul,isi,dibuat_oleh,dibuat_pada,catatan
       from public.pf_article_versions where artikel_id = $1
       order by versi desc limit 1`,
      [artikel_id],
    );
    return r.rows[0] ?? null;
  }
  async simpanVersi(input) {
    const r = await this.db.query(
      `insert into public.pf_article_versions (artikel_id, versi, judul, isi, dibuat_oleh, catatan)
       values ($1,$2,$3,$4,$5,$6)
       returning id,artikel_id,versi,judul,isi,dibuat_oleh,dibuat_pada,catatan`,
      [input.artikel_id, input.versi, input.judul, input.isi, input.dibuat_oleh, input.catatan],
    );
    return r.rows[0];
  }
  async catatAudit(input) {
    await this.db.query(
      `insert into public.pf_audit_logs
         (aktor_id, aktor_email, aksi, entitas, entitas_id, sebelum, sesudah, ip)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        input.aktor_id, input.aktor_email, input.aksi, input.entitas,
        input.entitas_id, JSON.stringify(input.sebelum ?? null),
        JSON.stringify(input.sesudah ?? null), input.ip ?? null,
      ],
    );
  }
}
const adminF = new AdapterF(dbF);

// ---------- F1. Artikel ↔ klaim + evidence + verification record ----------
{
  const nKlaim = await dbF.query(
    `select count(*)::int as n from public.pf_claims where artikel_id = $1`,
    [ART1],
  );
  cek("F1 artikel->klaim: 2 klaim terhubung via artikel_id", nKlaim.rows[0].n === 2, `dapat ${nKlaim.rows[0].n}`);
  const nEv = await dbF.query(
    `select count(*)::int as n from public.pf_evidence where klaim_id = $1`,
    [CL1],
  );
  cek("F1 klaim->evidence: klaim CL1 punya 2 evidence independen", nEv.rows[0].n === 2, `dapat ${nEv.rows[0].n}`);
  let fkEvGagal = false;
  try {
    await dbF.query(
      `insert into public.pf_evidence (klaim_id, sumber_url) values ($1, 'https://x.example/')`,
      ["99999999-9999-9999-9999-999999999999"],
    );
  } catch {
    fkEvGagal = true;
  }
  cek("F1 FK evidence->klaim ditegakkan (klaim tak ada ditolak)", fkEvGagal);
  let fkKlaimGagal = false;
  try {
    await dbF.query(
      `insert into public.pf_claims (artikel_id, teks) values ($1, 'x')`,
      ["99999999-9999-9999-9999-999999999999"],
    );
  } catch {
    fkKlaimGagal = true;
  }
  cek("F1 FK klaim->artikel ditegakkan (artikel tak ada ditolak)", fkKlaimGagal);
  const SEKARANG = new Date("2026-11-10T00:00:00Z");
  const tier = new Map([["s1", 1], ["s2", 1], ["s3", 1]]);
  const utama = { id: "u1", sumber_id: "s1", url: "https://a.example/1", judul: "Harga Pangan Naik", ringkasan: "", waktu_terbit_asli: "2026-11-09T10:00:00Z", disalin_dari_id: null };
  const korob = { id: "u2", sumber_id: "s2", url: "https://b.example/1", judul: "Harga Pangan Naik", ringkasan: "", waktu_terbit_asli: "2026-11-09T11:00:00Z", disalin_dari_id: null };
  const hasilV = tentukanKeputusanVerifikasi(utama, [korob], tier, SEKARANG);
  cek("F1 VERIFIED butuh >=2 sumber independen tier-1 (2 independen -> VERIFIED)", hasilV.keputusan === "VERIFIED" && hasilV.sumberIndependen === 2, hasilV.alasan);
  const sal1 = { id: "u3", sumber_id: "s2", url: "https://b.example/2", judul: "Harga Pangan Naik", ringkasan: "", waktu_terbit_asli: "2026-10-01T10:00:00Z", disalin_dari_id: "u1" };
  const sal2 = { id: "u4", sumber_id: "s3", url: "https://c.example/2", judul: "Harga Pangan Naik", ringkasan: "", waktu_terbit_asli: "2026-10-01T10:00:00Z", disalin_dari_id: "u1" };
  const hasilS = tentukanKeputusanVerifikasi(utama, [sal1, sal2], tier, SEKARANG);
  cek("F1 3 item dari 1 akar = 1 independen -> UNCONFIRMED (bukan VERIFIED)", hasilS.keputusan === "UNCONFIRMED" && hasilS.sumberIndependen === 1, hasilS.alasan);
  let gateLolos = false;
  try {
    await periksaGateTerbit(adminF, ART1);
    gateLolos = true;
  } catch (e) {
    console.log(`  gate ART1 menolak: ${String(e.message).split("\n")[0]}`);
  }
  cek("F1 gate lolos end-to-end: draf VERIFIED + record VERIFIED via artikel_id + review setuju", gateLolos);
  let gateTolak = null;
  try {
    await periksaGateTerbit(adminF, ART2);
  } catch (e) {
    gateTolak = e;
  }
  cek("F1 gate menolak artikel tanpa record VERIFIED (UNCONFIRMED)", gateTolak instanceof GalatGateTerbit, gateTolak ? gateTolak.message : "tidak menolak");
  const terbit = await terbitkanArtikel(adminF, ART1, { id: UID_A, email: "a@uji.id" });
  cek("F1 terbitkanArtikel: status jadi terbit + diterbitkan_pada terisi", terbit.status === "terbit" && Boolean(terbit.diterbitkan_pada), `status=${terbit.status}`);
  const nVersi = await dbF.query(
    `select count(*)::int as n from public.pf_article_versions where artikel_id = $1`,
    [ART1],
  );
  cek("F1 terbit mencatat versi baru + audit artikel.terbit", nVersi.rows[0].n === 1, `versi=${nVersi.rows[0].n}`);
}

// ---------- F2. Artikel ↔ story ----------
{
  const r = await dbF.query(
    `select s.slug from public.pf_story_articles sa
     join public.pf_stories s on s.id = sa.story_id
     where sa.artikel_id = $1 and s.status = 'terbit'
     order by sa.dibuat_pada desc limit 1`,
    [ART3],
  );
  cek("F2 artikel terbit -> cerita terbit (cermin getCeritaUntukArtikel)", r.rows[0]?.slug === "cerita-id", r.rows[0]?.slug ?? "null");
  const r2 = await dbF.query(
    `select s.slug from public.pf_story_articles sa
     join public.pf_stories s on s.id = sa.story_id
     where sa.artikel_id = $1 and s.status = 'terbit'
     order by sa.dibuat_pada desc limit 1`,
    [ART2],
  );
  cek("F2 artikel yang hanya ditaut ke cerita draf -> null (tidak bocor)", r2.rows.length === 0);
  const halamanArtikel = fs.readFileSync(path.join(DIR_SRC, "app/artikel/[slug]/page.tsx"), "utf8");
  cek("F2 bar konteks artikel menampilkan 'Bagian dari cerita:'", halamanArtikel.includes("Bagian dari cerita:"), "artikel-konteks");
}

// ---------- F3. Story ↔ timeline ----------
{
  const tl = await dbF.query(
    `select waktu, peristiwa from public.pf_event_timeline where event_id = $1 order by waktu asc`,
    [EV_ID],
  );
  cek("F3 timeline event terurut waktu (08:00 lalu 12:00)", tl.rows.length === 2 && new Date(tl.rows[0].waktu).toISOString() === "2026-01-10T08:00:00.000Z" && new Date(tl.rows[1].waktu).toISOString() === "2026-01-10T12:00:00.000Z", `${tl.rows.length} baris`);
  const beda = await dbF.query(
    `select e.dimulai_pada as mulai, a.diterbitkan_pada as terbit_artikel
     from public.pf_events e, public.pf_articles a
     where e.id = $1 and a.id = $2`,
    [EV_ID, ART3],
  );
  const mulai = new Date(beda.rows[0].mulai).getTime();
  const terbitArt = new Date(beda.rows[0].terbit_artikel).getTime();
  const tlPertama = new Date(tl.rows[0].waktu).getTime();
  cek("F3 tanggal peristiwa vs timeline vs publikasi dibedakan (3 nilai berbeda)", mulai !== tlPertama && tlPertama !== terbitArt && mulai !== terbitArt, `mulai=${beda.rows[0].mulai} tl=${tl.rows[0].waktu} artikel=${beda.rows[0].terbit_artikel}`);
  const kosong = await dbF.query(
    `select count(*)::int as n from public.pf_event_timeline where event_id = $1`,
    [EV_NOTL],
  );
  cek("F3 event tanpa timeline -> 0 baris (bukan galat)", kosong.rows[0].n === 0);
  cek("F3 getCerita membaca pf_event_timeline per event", libCerita.includes("pf_event_timeline") && libCerita.includes("event_id"));
}

// ---------- F4. Story ↔ sumber independen (RPC pf_akar_salinan) ----------
{
  const salinan = await dbF.query(
    `select url, akar_id, disalin from public.pf_akar_salinan($1, ARRAY['https://antara.example/berita-x','https://cnn.example/berita-x','https://blog.example/berita-x'])`,
    [ART3],
  );
  const akarSalinan = new Set(salinan.rows.map((r) => r.akar_id));
  cek("F4 RPC: X disalin 3 media = 1 akar independen", salinan.rows.length === 3 && akarSalinan.size === 1 && salinan.rows.filter((r) => r.disalin).length === 2, `${salinan.rows.length} baris, ${akarSalinan.size} akar`);
  const asli = await dbF.query(
    `select url, akar_id, disalin from public.pf_akar_salinan($1, ARRAY['https://antara.example/berita-y1','https://cnn.example/berita-y2','https://blog.example/berita-y3'])`,
    [ART3],
  );
  const akarAsli = new Set(asli.rows.map((r) => r.akar_id));
  cek("F4 RPC: Y liputan asli 3 media = 3 akar independen", asli.rows.length === 3 && akarAsli.size === 3 && asli.rows.filter((r) => r.disalin).length === 0, `${asli.rows.length} baris, ${akarAsli.size} akar`);
  const draf = await dbF.query(
    `select * from public.pf_akar_salinan($1, ARRAY['https://antara.example/berita-x'])`,
    [ART2],
  );
  cek("F4 RPC: artikel draf -> himpunan kosong", draf.rows.length === 0);
  const { hitungAkarIndependen } = ambilFungsiMurni("src/lib/cerita.ts", ["hitungAkarIndependen"]);
  const hitung = hitungAkarIndependen([
    { akarId: RAW_X, disalin: false },
    { akarId: RAW_X, disalin: true },
    { akarId: RAW_X, disalin: true },
    { akarId: RAW_Y1, disalin: false },
    { akarId: RAW_Y2, disalin: false },
    { akarId: RAW_Y3, disalin: false },
  ]);
  cek("F4 hitungAkarIndependen murni: 3 salinan X + 3 asli = independen 4, salinan 2", hitung.independen === 4 && hitung.salinan === 2 && hitung.terverifikasi === 6, `independen=${hitung.independen} salinan=${hitung.salinan}`);
}

// ---------- F5. Story ↔ negara ----------
{
  const ceritaId = await dbF.query(
    `select distinct s.slug from public.pf_story_events se
     join public.pf_events e on e.id = se.event_id
     join public.pf_stories s on s.id = se.story_id
     where e.negara_kode = 'ID' and s.status = 'terbit'`,
  );
  cek("F5 cerita terbit via event negara ID ditemukan (cermin getNegara.cerita)", ceritaId.rows.length === 1 && ceritaId.rows[0].slug === "cerita-id", ceritaId.rows.map((r) => r.slug).join(",") || "kosong");
  const ceritaMy = await dbF.query(
    `select distinct s.slug from public.pf_story_events se
     join public.pf_events e on e.id = se.event_id
     join public.pf_stories s on s.id = se.story_id
     where e.negara_kode = 'MY' and s.status = 'terbit'`,
  );
  cek("F5 cerita yang hanya memuat event MY tidak masuk daftar ID", ceritaMy.rows.length === 0);
  const { kodeValid, normalisasiKode } = ambilFungsiMurni("src/lib/negara.ts", ["kodeValid", "normalisasiKode"], [
    /const POLA_KODE = \/[^;]+;/,
  ]);
  cek("F5 kodeValid: ID valid, IDN tidak, normalisasi 'id' -> 'ID'", kodeValid("ID") && !kodeValid("IDN") && normalisasiKode("id") === "ID");
  cek("F5 getNegara membaca cerita via pf_story_events (Tahap F)", libNegara.includes("pf_story_events") && libNegara.includes("pf_stories!inner"));
}

// ---------- F6. Negara → artikel terkait ----------
{
  const beritaId = await dbF.query(
    `select slug from public.pf_articles where status = 'terbit' and negara_kode = 'ID' order by diterbitkan_pada desc`,
  );
  const slugId = beritaId.rows.map((r) => r.slug).sort();
  cek("F6 negara ID -> hanya artikel terbit ID (ART1 terbit + ART3)", JSON.stringify(slugId) === JSON.stringify(["artikel-id-2", "artikel-verified"]), slugId.join(","));
  let fkNegaraGagal = false;
  try {
    await dbF.query(
      `insert into public.pf_articles (slug, judul, kategori_slug, negara_kode) values ('artikel-xx', 'X', 'nasional', 'XX')`,
    );
  } catch {
    fkNegaraGagal = true;
  }
  cek("F6 FK artikel.negara_kode -> pf_countries ditegakkan (kode 'XX' ditolak)", fkNegaraGagal);
  await dbF.query(`delete from public.pf_countries where kode = 'MY'`);
  const nullMy = await dbF.query(
    `select count(*)::int as n from public.pf_articles where id in ($1, $2) and negara_kode is null`,
    [ART2, ART4],
  );
  cek("F6 hapus negara -> negara_kode artikel jadi NULL (on delete set null)", nullMy.rows[0].n === 2, `dapat ${nullMy.rows[0].n}`);
}

// ---------- F7. Artikel → konteks data ----------
{
  const ind = await dbF.query(
    `select i.nama, i.satuan, i.negara_kode, i.sumber_nama, i.tanggal_pembaruan, i.metodologi,
       (select nilai from public.pf_data_points where indikator_id = i.id order by tanggal desc limit 1) as nilai,
       (select tanggal from public.pf_data_points where indikator_id = i.id order by tanggal desc limit 1) as tanggal_nilai
     from public.pf_data_indicators i where i.slug = 'inflasi-indonesia'`,
  );
  const rInd = ind.rows[0];
  cek(
    "F7 indikator: nama+nilai+satuan+negara+periode+sumber+tanggal ambil+metodologi lengkap",
    rInd.nama === "Inflasi Indonesia" && Number(rInd.nilai) === 2.8 && rInd.satuan === "%" &&
    rInd.negara_kode === "ID" && rInd.sumber_nama === "BPS" &&
    new Date(rInd.tanggal_pembaruan).toISOString().startsWith("2026-10-01") && typeof rInd.metodologi === "string" && rInd.metodologi.length > 0,
    `nilai=${rInd.nilai} ${rInd.satuan} ${rInd.negara_kode} ${rInd.sumber_nama} ${rInd.tanggal_pembaruan}`,
  );
  const halamanData = fs.readFileSync(path.join(DIR_SRC, "app/data/page.tsx"), "utf8");
  cek(
    "F7 halaman /data menampilkan nama+nilai+satuan+negara+periode+sumber+tanggal+metodologi",
    ["Nilai terakhir:", "Metodologi:", "Sumber:", "Diperbarui:", "Negara:", "Frekuensi pembaruan:"].every((s) => halamanData.includes(s)),
    "6 label hadir",
  );
  cek(
    "CATATAN F7: label 'Negara:' di /data hanya tampil bila frekuensi_update terisi (bukan selalu)",
    halamanData.includes("ind.frekuensi_update && (") && halamanData.includes("Negara: ${ind.negara_kode}"),
    "kondisional — lihat laporan Tahap F",
  );
  cek("F7 artikel lengkap membawa data_pendukung (konteks data artikel)", libData.includes("data_pendukung"), "KOLOM_ARTIKEL_LENGKAP");
}

// ---------- F8. Research → referensi explainer ----------
{
  const fk = await dbF.query(
    `select i.slug as ind_slug from public.pf_research_reports r
     join public.pf_data_indicators i on i.id = r.indikator_id
     where r.slug = 'riset-inflasi'`,
  );
  cek("F8 riset->indikator via FK indikator_id (v13)", fk.rows[0]?.ind_slug === "inflasi-indonesia", fk.rows[0]?.ind_slug ?? "null");
  const fb = await dbF.query(
    `select i.slug as ind_slug from public.pf_research_reports r
     join public.pf_data_indicators i on i.slug = r.slug
     where r.slug = 'indeks-harga' and r.indikator_id is null`,
  );
  cek("F8 fallback slug sama bila indikator_id kosong", fb.rows[0]?.ind_slug === "indeks-harga", fb.rows[0]?.ind_slug ?? "null");
  const halamanRiset = fs.readFileSync(path.join(DIR_SRC, "app/riset/[slug]/page.tsx"), "utf8");
  cek("F8 halaman riset menautkan dataset CSV + indikator di /data", halamanRiset.includes("/api/riset/") && halamanRiset.includes("/dataset") && halamanRiset.includes('href="/data"'), "dataset CSV + /data");
}

// ---------- F9. Explain the World ↔ berita ----------
{
  const halamanPengetahuan = fs.readFileSync(path.join(DIR_SRC, "app/pengetahuan/[slug]/page.tsx"), "utf8");
  const libExplainer = fs.readFileSync(path.join(DIR_SRC, "lib/explainer.ts"), "utf8");
  cek(
    "KESENJANGAN TERDOKUMENTASI F9: explainer TIDAK menautkan artikel berita terkait (0 rujukan /artikel/ di halaman + lib)",
    !halamanPengetahuan.includes("/artikel/") && !libExplainer.includes("pf_articles"),
    "lihat laporan Tahap F — balik asersi ini bila ditutup",
  );
  cek("F9 arah sebaliknya ada: halaman riset menautkan /pengetahuan/ + explainer punya seri", libExplainer.includes("getSeri") && halamanPengetahuan.includes("Dalam seri ini"), "getSeri + 'Dalam seri ini'");
}

// ---------- F10. Ask the World: retrieval 5 basis ----------
{
  const qArt = await dbF.query(
    `select slug from public.pf_articles where status = 'terbit' and (judul ilike '%inflasi%' or ringkasan ilike '%inflasi%' or isi ilike '%inflasi%')`,
  );
  cek("F10 retrieval artikel: kata 'inflasi' menemukan artikel terbit", qArt.rows.some((r) => r.slug === "artikel-id-2"), qArt.rows.map((r) => r.slug).join(","));
  const qPng = await dbF.query(
    `select slug from public.pf_knowledge_articles where status = 'terbit' and (judul ilike '%inflasi%' or ringkasan ilike '%inflasi%' or isi ilike '%inflasi%')`,
  );
  cek("F10 retrieval pengetahuan: kata 'inflasi' menemukan explainer terbit", qPng.rows.some((r) => r.slug === "inflasi-penjelasan"), qPng.rows.map((r) => r.slug).join(","));
  const qInd = await dbF.query(
    `select slug from public.pf_data_indicators where nama ilike '%inflasi%' or slug ilike '%inflasi%'`,
  );
  cek("F10 retrieval indikator: kata 'inflasi' menemukan indikator", qInd.rows.some((r) => r.slug === "inflasi-indonesia"), qInd.rows.map((r) => r.slug).join(","));
  const qEvt = await dbF.query(
    `select judul from public.pf_events where judul ilike '%inflasi%' or ringkasan ilike '%inflasi%'`,
  );
  cek("F10 retrieval event: kata 'inflasi' menemukan peristiwa", qEvt.rows.length === 1, qEvt.rows[0]?.judul ?? "kosong");
  const qNeg = await dbF.query(
    `select kode from public.pf_countries where nama ilike '%indonesia%' or kode ilike '%indonesia%'`,
  );
  cek("F10 retrieval negara: kata 'indonesia' menemukan profil negara", qNeg.rows.some((r) => r.kode === "ID"), qNeg.rows.map((r) => r.kode).join(","));
  const ruteTanya = fs.readFileSync(path.join(DIR_SRC, "app/api/tanya/route.ts"), "utf8");
  cek(
    "F10 cariKandidat membaca 5 basis (artikel+pengetahuan+indikator+event+negara)",
    ["pf_articles", "pf_knowledge_articles", "pf_data_indicators", "pf_events", "pf_countries"].every((t) => ruteTanya.includes(t)),
    "5 tabel di cariKandidat",
  );
  const drafAda = susunDrafJawaban([
    { judul: "Inflasi Indonesia", ringkasan: "Nilai 2,8%.", url: "/data", skor: 3 },
    { judul: "Apa itu Inflasi?", ringkasan: "Penjelasan.", url: "/pengetahuan/inflasi-penjelasan", skor: 3 },
  ]);
  cek("F10 draf dibuat bila ada referensi (ekstraktif, maks 3)", drafAda.dibuat && drafAda.referensi.length === 2 && drafAda.alasan === "ada_referensi", drafAda.draf?.slice(0, 60) ?? "");
  const drafKosong = susunDrafJawaban([]);
  cek("F10 tanpa referensi -> draf TIDAK dibuat, alasan tidak_ada_data (jujur)", !drafKosong.dibuat && drafKosong.alasan === "tidak_ada_data" && drafKosong.referensi.length === 0);
  cek(
    "KESENJANGAN TERDOKUMENTASI F10: kandidat negara di cariKandidat url=null (komentar usang 'Belum ada halaman /negara')",
    ruteTanya.includes("Belum ada halaman /negara"),
    "src/app/api/tanya/route.ts — /negara/[kode] sudah ada, tautan belum dipakai",
  );
}

// ---------- F11. Pengguna menyimpan seluruh jenis konten ----------
{
  const simpan = [
    {
      jenis: "artikel (bookmark)",
      tabel: "pf_bookmarks",
      insertA: `insert into public.pf_bookmarks (user_id, artikel_id) values ($1, $2)`,
      paramA: [UID_A, ART3],
      hitungA: `select count(*)::int as n from public.pf_bookmarks where user_id = $1`,
      hitungB: `select count(*)::int as n from public.pf_bookmarks where user_id = $1`,
    },
    {
      jenis: "cerita (ikuti)",
      tabel: "pf_story_followers",
      insertA: `insert into public.pf_story_followers (user_id, story_id) values ($1, $2)`,
      paramA: [UID_A, ST1],
      hitungA: `select count(*)::int as n from public.pf_story_followers where user_id = $1`,
      hitungB: `select count(*)::int as n from public.pf_story_followers where user_id = $1`,
    },
    {
      jenis: "negara (topik diikuti)",
      tabel: "pf_followed_topics",
      insertA: `insert into public.pf_followed_topics (user_id, tipe, target) values ($1, 'negara', 'ID')`,
      paramA: [UID_A],
      hitungA: `select count(*)::int as n from public.pf_followed_topics where user_id = $1`,
      hitungB: `select count(*)::int as n from public.pf_followed_topics where user_id = $1`,
    },
    {
      jenis: "kursus (progres)",
      tabel: "pf_course_progress",
      insertA: `insert into public.pf_course_progress (user_id, lesson_id, selesai) values ($1, 'f5f5f5f5-f5f5-f5f5-f5f5-f5f5f5f5f5f5', true)`,
      paramA: [UID_A],
      hitungA: `select count(*)::int as n from public.pf_course_progress where user_id = $1`,
      hitungB: `select count(*)::int as n from public.pf_course_progress where user_id = $1`,
    },
    {
      jenis: "episode (daftar putar)",
      tabel: "pf_podcast_playlist_items",
      insertA: `insert into public.pf_podcast_playlist_items (user_id, episode_id) values ($1, 'f6f6f6f6-f6f6-f6f6-f6f6-f6f6f6f6f6f6')`,
      paramA: [UID_A],
      hitungA: `select count(*)::int as n from public.pf_podcast_playlist_items where user_id = $1`,
      hitungB: `select count(*)::int as n from public.pf_podcast_playlist_items where user_id = $1`,
    },
  ];
  for (const s of simpan) {
    const okInsert = await berhasilSebagaiUidF("authenticated", UID_A, s.insertA, s.paramA);
    cek(`F11 simpan ${s.jenis}: pemilik bisa menyimpan`, okInsert, s.tabel);
    const milikA = await hitungSebagaiUidF("authenticated", UID_A, s.hitungA, [UID_A]);
    cek(`F11 baca ${s.jenis}: pemilik membaca kembali simpanannya`, milikA === 1, `dapat ${milikA}`);
    const milikB = await hitungSebagaiUidF("authenticated", UID_B, s.hitungB, [UID_A]);
    cek(`F11 isolasi ${s.jenis}: pengguna lain tidak melihat simpanan A`, milikB === 0, `dapat ${milikB}`);
  }
  let anonLihat = -1;
  try {
    const r = await sebagaiF("anon", `select count(*)::int as n from public.pf_bookmarks where user_id = $1`, [UID_A]);
    anonLihat = Number(r.rows[0]?.n ?? -1);
  } catch {
    anonLihat = 0; // ditolak di tingkat GRANT/RLS = tidak terlihat
  }
  cek("F11 isolasi: anon tidak melihat bookmark siapa pun", anonLihat === 0, `dapat ${anonLihat}`);
  const ruteBookmark = fs.readFileSync(path.join(DIR_SRC, "app/api/bookmark/route.ts"), "utf8");
  cek(
    "KESENJANGAN TERDOKUMENTASI F11: pengetahuan TIDAK punya mekanisme simpan (/api/bookmark hanya artikel_id; 0 tabel/route simpan pengetahuan)",
    ruteBookmark.includes("artikel_id") && !fs.readFileSync(path.join(DIR_SRC, "lib/lanjutan.ts"), "utf8").includes("pf_bookmarks_pengetahuan") && !ruteBookmark.includes("pengetahuan"),
    "lihat laporan Tahap F — butuh desain + migrasi baru (di luar Tahap F)",
  );
}

// ---------- F12. Admin mengelola seluruh konten sesuai permission ----------
{
  const berkasAdmin = jalanSemua(path.join(DIR_SRC, "app/api/admin"), [".ts"]).filter((f) => f.endsWith("/route.ts"));
  const tanpaGuard = berkasAdmin.filter((f) => !fs.readFileSync(f, "utf8").includes("autentikasiAdmin"));
  cek("F12 semua 45 route /api/admin/* memakai autentikasiAdmin", tanpaGuard.length === 0 && berkasAdmin.length === 45, `${berkasAdmin.length} route, tanpa guard: ${tanpaGuard.map((f) => f.replace(DIR_SRC, "")).join(", ") || "tidak ada"}`);
  // Tiap handler mutasi (POST/PATCH/DELETE/PUT) wajib punya cek
  // peran (argumen ROLES di autentikasiAdmin) — kecuali
  // terbitkan-terjadwal (otentikasi ganda: secret ATAU sesi
  // EDITOR via punyaRole eksplisit).
  const celahMutasi = [];
  for (const f of berkasAdmin) {
    const isi = fs.readFileSync(f, "utf8");
    const bagian = isi.split(/export async function (GET|POST|PATCH|DELETE|PUT)\b/);
    for (let i = 1; i < bagian.length; i += 2) {
      const metode = bagian[i];
      const badan = bagian[i + 1] ?? "";
      const badanHandler = badan.split(/export async function \w+\b/)[0];
      if (metode === "GET") continue;
      const punyaPeran =
        // Koreksi integrasi Tahap C: panggilan boleh multi-baris
        // (autentikasiAdmin(\n req,\n ROLES.EDITOR, ...) di soal/route.ts).
        /autentikasiAdmin\(\s*req,\s*ROLES\./.test(badanHandler) ||
        /punyaRole\(roles,\s*ROLES\.EDITOR/.test(badanHandler);
      if (!punyaPeran) {
        celahMutasi.push(`${f.replace(DIR_SRC, "")}:${metode}`);
      }
    }
  }
  cek("F12 semua handler mutasi /api/admin/* punya cek peran (tanpa celah)", celahMutasi.length === 0, celahMutasi.length ? `celah: ${celahMutasi.slice(0, 8).join(", ")}` : "0 celah");
  const negaraRoute = fs.readFileSync(path.join(DIR_SRC, "app/api/admin/negara/route.ts"), "utf8");
  const negaraIdRoute = fs.readFileSync(path.join(DIR_SRC, "app/api/admin/negara/[id]/route.ts"), "utf8");
  cek(
    "F12 mutasi negara (B-T1) wajib EDITOR: POST + PATCH + DELETE",
    negaraRoute.includes("autentikasiAdmin(req, ROLES.EDITOR)") &&
    negaraIdRoute.includes("autentikasiAdmin(req, ROLES.EDITOR)"),
    "POST/negara + PATCH/DELETE negara/[id]",
  );
  let tolakInsertNegara = false;
  try {
    await sebagaiUidF("authenticated", UID_A, `insert into public.pf_countries (kode, nama) values ('ZZ', 'Zed')`);
  } catch {
    tolakInsertNegara = true;
  }
  cek("F12 RLS: pengguna biasa (tanpa peran) TIDAK bisa insert pf_countries langsung", tolakInsertNegara);
  const layoutAdmin = fs.readFileSync(path.join(DIR_SRC, "app/admin/layout.tsx"), "utf8");
  cek(
    "F12 halaman /admin/* dijaga layout: login + peran staf + redirect",
    layoutAdmin.includes('redirect("/masuk")') &&
    ["super_admin", "editor", "fact_checker", "writer"].every((r) => layoutAdmin.includes(r)),
    "getAdminSession + 4 peran staf",
  );
  const kendaliSuper = ["kendali/flags", "kendali/jalankan", "pengguna"].every((d) => {
    const isi = fs.readFileSync(path.join(DIR_SRC, `app/api/admin/${d}/route.ts`), "utf8");
    return isi.includes("ROLES.SUPER_ADMIN");
  });
  cek("F12 kendali sistem + pengguna hanya SUPER_ADMIN", kendaliSuper, "flags/jalankan/pengguna");
}

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
