// Uji Global Search P0 (Worker B) PRATA FAKTA — PGlite + kode asli.
//   A. SQL di PGlite (migrasi v1–v18): semantik filter cariArtikel
//      (tanggal/sumber/status/draf) + cariNegara + round-trip jsonb
//      pencarian_tersimpan.
//   B. Kode asli src/lib/data.ts + kedua route, ditranspile dan
//      dijalankan dengan klien Supabase PALSU yang merekam rantai
//      query — menguji cabang filter (tanggal tidak valid diabaikan,
//      UUID bukan-sumber diabaikan, status di luar daftar diabaikan,
//      batas limit) dan CRUD pencarian tersimpan (401/400/409/503,
//      idempotent, hapus per q+disimpan_pada, redirect form).
//   C. Pemeriksaan statis berkas yang disentuh.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../package.json", import.meta.url).pathname);
const { PGlite } = require("@electric-sql/pglite");
const requireRepo = createRequire(
  new URL("../package.json", import.meta.url).pathname,
);
const ts = requireRepo("typescript");

const DIR_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
function kanonik(v) {
  if (Array.isArray(v)) return `[${v.map(kanonik).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${kanonik(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}
function sama(a, b) {
  // Perbandingan tak peka urutan kunci (jsonb menormalisasi urutan
  // kunci objek saat round-trip).
  return kanonik(a) === kanonik(b);
}

/* ================= A. PGlite ================= */
function bacaMigrasi(nama) {
  let sql = fs.readFileSync(path.join(DIR_MIGRASI, nama), "utf8");
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
  "20261116_pf_v15_tahap_c.sql",
  "20261116_pf_v16_bookmark_pengetahuan.sql",
  "20261116_pf_v17_event_artikel_id.sql",
  "20261117_pf_v18_ekspansi_p0.sql",
];

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

for (const nama of MIGRASI) {
  try {
    await db.exec(bacaMigrasi(nama));
  } catch (e) {
    console.log(`GAGAL: migrasi ${nama}\n  -> ${String(e.message).split("\n")[0]}`);
    process.exit(1);
  }
}
console.log("OK: migrasi v1–v18 diterapkan");

// ---------- Fixture ----------
await db.query(
  `insert into public.pf_categories (slug, nama, deskripsi, urutan, aktif) values
   ('ekonomi', 'Ekonomi', 'Berita ekonomi', 1, true),
   ('teknologi', 'Teknologi', 'Berita teknologi', 2, true)
   on conflict (slug) do nothing`,
);
const s1 = "11111111-1111-1111-1111-111111111111";
const s2 = "22222222-2222-2222-2222-222222222222";
await db.query(
  `insert into public.pf_sources (id, nama, jenis, url, aktif, prioritas) values
   ('${s1}', 'Antara', 'rss', 'https://antara.example/rss', true, 90),
   ('${s2}', 'CNN', 'rss', 'https://cnn.example/rss', true, 90)`,
);
const a1 = "a1111111-1111-1111-1111-111111111111";
const a2 = "a2222222-2222-2222-2222-222222222222";
const a3 = "a3333333-3333-3333-3333-333333333333";
const a4 = "a4444444-4444-4444-4444-444444444444";
const a5 = "a5555555-5555-5555-5555-555555555555";
await db.query(
  `insert into public.pf_articles
   (id, slug, judul, ringkasan, isi, kategori_slug, status_verifikasi, status, diterbitkan_pada) values
   ('${a1}', 'ekonomi-indonesia-tumbuh', 'Ekonomi Indonesia tumbuh', 'Ringkasan A1', 'Isi A1', 'ekonomi', 'VERIFIED', 'terbit', '2026-11-10 08:00:00+00'),
   ('${a2}', 'ekonomi-global-melemah', 'Ekonomi global melemah', 'Ringkasan A2', 'Isi A2', 'ekonomi', 'CROSS-CHECKED', 'terbit', '2026-11-12 08:00:00+00'),
   ('${a3}', 'teknologi-ai-indonesia', 'Teknologi AI di Indonesia', 'Ringkasan A3', 'Isi A3', 'teknologi', 'UNCONFIRMED', 'terbit', '2026-11-15 08:00:00+00'),
   ('${a4}', 'ekonomi-digital-naik', 'Ekonomi digital naik', 'Ringkasan A4', 'Isi A4', 'ekonomi', 'VERIFIED', 'draft', '2026-11-14 08:00:00+00'),
   ('${a5}', 'ekonomi-hijau', 'Ekonomi hijau', 'Ringkasan A5', 'Isi A5', 'ekonomi', 'DISPUTED', 'terbit', '2026-11-09 08:00:00+00')`,
);
await db.query(
  `insert into public.pf_article_sources (artikel_id, sumber_id, url) values
   ('${a1}', '${s1}', 'https://antara.example/a1'),
   ('${a2}', '${s2}', 'https://cnn.example/a2'),
   ('${a3}', '${s1}', 'https://antara.example/a3')`,
);
await db.query(
  `insert into public.pf_countries (kode, nama, ibu_kota) values
   ('ID', 'Indonesia', 'Jakarta'),
   ('IN', 'India', 'New Delhi'),
   ('JP', 'Jepang', 'Tokyo')
   on conflict (kode) do nothing`,
);
console.log("OK: fixture 5 artikel + 2 sumber + 3 negara");

/** SQL yang setara dengan query PostgREST cariArtikel. */
async function cariSql(q, { dari, sampai, sumberId, status } = {}) {
  const params = [`%${q}%`];
  let sql = `select a.id from public.pf_articles a`;
  if (sumberId) sql += ` inner join public.pf_article_sources s on s.artikel_id = a.id`;
  sql += ` where a.status = 'terbit' and (a.judul ilike $1 or a.ringkasan ilike $1 or a.isi ilike $1)`;
  if (dari) {
    params.push(dari);
    sql += ` and a.diterbitkan_pada >= $${params.length}`;
  }
  if (sampai) {
    // hariSesudah("2026-11-11") = "2026-11-12" (batas atas inklusif).
    const d = new Date(`${sampai}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    params.push(d.toISOString().slice(0, 10));
    sql += ` and a.diterbitkan_pada < $${params.length}`;
  }
  if (sumberId) {
    params.push(sumberId);
    sql += ` and s.sumber_id = $${params.length}`;
  }
  if (status) {
    params.push(status);
    sql += ` and a.status_verifikasi = $${params.length}`;
  }
  sql += ` order by a.diterbitkan_pada desc limit 10`;
  const res = await db.query(sql, params);
  return res.rows.map((r) => r.id);
}

cek("cari ekonomi tanpa filter", sama(await cariSql("ekonomi"), [a2, a1, a5]), "draf A4 tidak bocor");
cek(
  "cari ekonomi dari 2026-11-10 sampai 2026-11-11",
  sama(await cariSql("ekonomi", { dari: "2026-11-10", sampai: "2026-11-11" }), [a1]),
  "sampai inklusif (A1 10 Nov masuk)",
);
cek(
  "cari ekonomi dari 2026-11-12 saja",
  sama(await cariSql("ekonomi", { dari: "2026-11-12" }), [a2]),
);
cek(
  "cari ekonomi sumber CNN",
  sama(await cariSql("ekonomi", { sumberId: s2 }), [a2]),
  "join inner menyaring A1/A5",
);
cek(
  "cari ekonomi sumber Antara",
  sama(await cariSql("ekonomi", { sumberId: s1 }), [a1]),
);
cek(
  "cari ekonomi status DISPUTED",
  sama(await cariSql("ekonomi", { status: "DISPUTED" }), [a5]),
);
cek(
  "cari ekonomi status VERIFIED + sumber Antara",
  sama(await cariSql("ekonomi", { status: "VERIFIED", sumberId: s1 }), [a1]),
);
cek(
  "cari teknologi",
  sama(await cariSql("teknologi"), [a3]),
);
cek(
  "cari kata yang tidak ada",
  sama(await cariSql("zzz-tidak-ada"), []),
);

async function negaraSql(q) {
  const res = await db.query(
    `select kode from public.pf_countries where nama ilike $1 or kode ilike $1 order by nama asc limit 10`,
    [`%${q}%`],
  );
  return res.rows.map((r) => r.kode);
}
cek("cari negara 'ind'", sama(await negaraSql("ind"), ["IN", "ID"]), "India + Indonesia, urut nama");
cek("cari negara 'jep'", sama(await negaraSql("jep"), ["JP"]));
cek("cari negara 'id' cocok kode", (await negaraSql("id")).includes("ID"));

// ---------- Round-trip jsonb pencarian_tersimpan (v18) ----------
const uid = "99999999-9999-9999-9999-999999999999";
await db.query(`insert into auth.users (id, email) values ('${uid}', 'uji@example.test')`);
const tersimpan = [
  { q: "ekonomi", dari: "2026-11-01", sampai: null, sumber: null, status: "VERIFIED", disimpan_pada: "2026-11-17T00:00:00.000Z" },
  { q: "ikn", dari: null, sampai: null, sumber: null, status: null, disimpan_pada: "2026-11-17T01:00:00.000Z" },
];
await db.query(
  `insert into public.pf_user_preferences (user_id, pencarian_tersimpan) values ('${uid}', $1::jsonb)
   on conflict (user_id) do update set pencarian_tersimpan = excluded.pencarian_tersimpan`,
  [JSON.stringify(tersimpan)],
);
const bacaPref = await db.query(
  `select pencarian_tersimpan from public.pf_user_preferences where user_id = '${uid}'`,
);
cek(
  "upsert pencarian_tersimpan round-trip",
  sama(bacaPref.rows[0].pencarian_tersimpan, tersimpan),
);
await db.query(
  `update public.pf_user_preferences set pencarian_tersimpan =
     (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(pencarian_tersimpan) e
      where not (e->>'q' = 'ikn' and e->>'disimpan_pada' = '2026-11-17T01:00:00.000Z'))
   where user_id = '${uid}'`,
);
const bacaLagi = await db.query(
  `select pencarian_tersimpan from public.pf_user_preferences where user_id = '${uid}'`,
);
cek(
  "hapus satu entri lewat q+disimpan_pada",
  sama(bacaLagi.rows[0].pencarian_tersimpan, [tersimpan[0]]),
  "sisa 1 entri",
);
const cekKolom = await db.query(
  `select column_name, data_type, column_default from information_schema.columns
   where table_name = 'pf_user_preferences' and column_name = 'pencarian_tersimpan'`,
);
cek(
  "kolom pencarian_tersimpan jsonb ada (v18)",
  cekKolom.rows.length === 1 && cekKolom.rows[0].data_type === "jsonb",
  `default ${cekKolom.rows[0]?.column_default ?? "-"}`,
);

/* ================= B. Kode asli + klien palsu ================= */
// Loader mini: transpile TS -> CJS, alias @/ -> src/, stub modul berat.
const stubNextServer = {
  NextResponse: class {
    static json(data, init) {
      return { status: init?.status ?? 200, body: data, json: async () => data };
    }
    static redirect(url, status = 302) {
      return { status, redirect: String(url), body: null, json: async () => null };
    }
  },
  connection: async () => {},
};
const stubGalat = {
  GalatBaca: class extends Error {
    constructor(fungsi, err) {
      super(`GalatBaca ${fungsi}: ${err instanceof Error ? err.message : String(err)}`);
      this.fungsi = fungsi;
    }
  },
  // Cerminan kontrak lib/galat.ts: true bila tabel belum ada.
  catatGalatBaca(fungsi, err) {
    const kode = err && typeof err === "object" ? String(err.code ?? "") : "";
    const pesan = err instanceof Error ? err.message : typeof err === "string" ? err : "";
    if (
      kode === "PGRST205" ||
      kode === "42P01" ||
      pesan.includes("Could not find the table") ||
      pesan.includes("does not exist")
    ) {
      return true;
    }
    return false;
  },
};
const stubRouteAuth = {
  buatRateLimiter: () => async () => true,
  cekOrigin: () => null,
  responRateLimit: () => stubNextServer.NextResponse.json(
    { ok: false, error: "Terlalu banyak percobaan." },
    { status: 429 },
  ),
  tolakAkunNonaktif: async () => null,
};
const stubAnalyticsGalat = { catatGalatRoute: async () => {} };

// --- Klien Supabase palsu: merekam rantai query, menjawab dari handler ---
const klienPalsu = {
  panggilan: [],
  penggunaAktif: null,
  handler: {},
  auth: {
    getUser: async () => ({ data: { user: klienPalsu.penggunaAktif } }),
  },
  from(tabel) {
    const ops = [];
    const b = {
      select(kolom) { ops.push(["select", kolom]); return b; },
      eq(k, v) { ops.push(["eq", k, v]); return b; },
      or(s) { ops.push(["or", s]); return b; },
      ilike(k, v) { ops.push(["ilike", k, v]); return b; },
      gte(k, v) { ops.push(["gte", k, v]); return b; },
      lt(k, v) { ops.push(["lt", k, v]); return b; },
      order(k, o) { ops.push(["order", k, o]); return b; },
      limit(n) { ops.push(["limit", n]); return b; },
      maybeSingle() { ops.push(["maybeSingle"]); return b; },
      upsert(baris, opts) { ops.push(["upsert", baris, opts]); return b; },
      then(onF, onR) {
        klienPalsu.panggilan.push({ tabel, ops: [...ops] });
        let hasil;
        try {
          const h = klienPalsu.handler[tabel];
          hasil = h ? h(ops) : { data: [], error: null };
        } catch (e) {
          return Promise.reject(e).then(onF, onR);
        }
        return Promise.resolve(hasil).then(onF, onR);
      },
    };
    return b;
  },
};
const stubSupabaseServer = { createClient: () => klienPalsu };
// Service client: diuji sebagai "tidak tersedia" (null) —
// getJumlahKoreksiTerbuka mengembalikan null secara jujur.
const stubSupabaseService = { cobaServiceClient: () => null };

const cacheModul = new Map();
function muatModul(absPath) {
  if (cacheModul.has(absPath)) return cacheModul.get(absPath).exports;
  const kode = fs.readFileSync(absPath, "utf8");
  const js = ts.transpileModule(kode, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  cacheModul.set(absPath, mod);
  const requireLokal = (spec) => {
    if (spec === "@/lib/supabase/server") return stubSupabaseServer;
    if (spec === "@/lib/supabase/service") return stubSupabaseService;
    if (spec === "@/lib/galat") return stubGalat;
    if (spec === "@/lib/ai/route-auth") return stubRouteAuth;
    if (spec === "@/lib/analytics/galat") return stubAnalyticsGalat;
    if (spec === "next/server") return stubNextServer;
    if (spec.startsWith("@/")) {
      const rel = spec.slice(2);
      for (const cand of [rel + ".ts", rel + ".tsx", rel + "/index.ts"]) {
        const p = path.join(DIR_REPO, "src", cand);
        if (fs.existsSync(p)) return muatModul(p);
      }
      throw new Error(`Tidak dapat resolve ${spec}`);
    }
    if (spec.startsWith("./") || spec.startsWith("../")) {
      const dasar = path.resolve(path.dirname(absPath), spec);
      for (const cand of [dasar, dasar + ".ts", dasar + ".tsx"]) {
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return muatModul(cand);
      }
      throw new Error(`Tidak dapat resolve ${spec} dari ${absPath}`);
    }
    return require(spec);
  };
  const fn = new Function("require", "module", "exports", "__filename", "__dirname", js);
  fn(requireLokal, mod, mod.exports, absPath, path.dirname(absPath));
  return mod.exports;
}

const dataLib = muatModul(path.join(DIR_REPO, "src/lib/data.ts"));
cek("STATUS_VERIFIKASI diekspor (6 nilai)", sama([...dataLib.STATUS_VERIFIKASI], [
  "VERIFIED", "CROSS-CHECKED", "DEVELOPING", "UNCONFIRMED", "DISPUTED", "CORRECTED",
]));

// ---------- cariArtikel: rantai query yang direkam ----------
function opsTerakhir() {
  return klienPalsu.panggilan[klienPalsu.panggilan.length - 1];
}
function adaOp(nama, kunci, nilai) {
  return opsTerakhir().ops.some(([m, k, v]) => {
    if (m !== nama) return false;
    if (kunci !== undefined && k !== kunci) return false;
    if (nilai !== undefined && k !== nilai && v !== nilai) return false;
    return true;
  });
}
function tidakAdaOp(nama, kunci) {
  return !opsTerakhir().ops.some(
    ([m, k]) => m === nama && (kunci === undefined || k === kunci),
  );
}

klienPalsu.handler = {
  pf_articles: () => ({ data: [{ id: "x1", slug: "s", judul: "J", ringkasan: null, kategori_slug: null, status_verifikasi: "VERIFIED", diterbitkan_pada: null }], error: null }),
};
klienPalsu.panggilan = [];
let r = await dataLib.cariArtikel("", 10);
cek("cariArtikel q kosong: tanpa query DB", r.artikel.length === 0 && r.tersedia === true && klienPalsu.panggilan.length === 0);

r = await dataLib.cariArtikel("ekonomi", 10);
cek("cariArtikel dasar: eq status terbit", adaOp("eq", "status", "terbit"));
cek("cariArtikel dasar: or judul/ringkasan/isi", opsTerakhir().ops.some(([m, s]) => m === "or" && s.includes("judul.ilike") && s.includes("ringkasan.ilike") && s.includes("isi.ilike")));
cek("cariArtikel dasar: limit 10, tanpa filter lain", adaOp("limit", undefined, 10) && tidakAdaOp("gte") && tidakAdaOp("lt") && tidakAdaOp("eq", "pf_article_sources.sumber_id"));

r = await dataLib.cariArtikel("ekonomi", { dari: "2026-11-10", sampai: "2026-11-11" });
cek("cariArtikel tanggal valid: gte dari", adaOp("gte", "diterbitkan_pada", "2026-11-10"));
cek("cariArtikel tanggal valid: lt hariSesudah(sampai)", adaOp("lt", "diterbitkan_pada", "2026-11-12"), "sampai inklusif");

r = await dataLib.cariArtikel("ekonomi", { dari: "2026-13-40", sampai: "bukan-tanggal" });
cek("cariArtikel tanggal tidak valid: DIABAIKAN", tidakAdaOp("gte") && tidakAdaOp("lt"));

r = await dataLib.cariArtikel("ekonomi", { dari: "2026-02-30" });
cek("cariArtikel 2026-02-30 (regex lolos, kalender tidak): DIABAIKAN", tidakAdaOp("gte"));

const UUID_S1 = "11111111-1111-1111-1111-111111111111";
r = await dataLib.cariArtikel("ekonomi", { sumberId: UUID_S1 });
cek("cariArtikel sumber valid: join inner", opsTerakhir().ops.some(([m, k]) => m === "select" && String(k).includes("pf_article_sources!inner(sumber_id)")));
cek("cariArtikel sumber valid: eq sumber_id", adaOp("eq", "pf_article_sources.sumber_id", UUID_S1));

r = await dataLib.cariArtikel("ekonomi", { sumberId: "bukan-uuid" });
cek("cariArtikel sumber bukan-UUID: DIABAIKAN", tidakAdaOp("eq", "pf_article_sources.sumber_id") && opsTerakhir().ops.every(([m, k]) => !(m === "select" && String(k).includes("!inner"))));

r = await dataLib.cariArtikel("ekonomi", { statusVerifikasi: "VERIFIED" });
cek("cariArtikel status VERIFIED: eq", adaOp("eq", "status_verifikasi", "VERIFIED"));
r = await dataLib.cariArtikel("ekonomi", { statusVerifikasi: "ASAL" });
cek("cariArtikel status di luar daftar: DIABAIKAN", tidakAdaOp("eq", "status_verifikasi"));

r = await dataLib.cariArtikel("ekonomi", 3);
cek("cariArtikel limit angka 3", adaOp("limit", undefined, 3));
r = await dataLib.cariArtikel("ekonomi", { limit: 99 });
cek("cariArtikel limit 99 dibatasi 50", adaOp("limit", undefined, 50));

klienPalsu.handler = { pf_articles: () => ({ data: null, error: { code: "PGRST205", message: "Could not find the table" } }) };
r = await dataLib.cariArtikel("ekonomi");
cek("cariArtikel tabel belum ada: tersedia=false", r.artikel.length === 0 && r.tersedia === false);

// ---------- cariNegara ----------
klienPalsu.handler = {
  pf_countries: () => ({ data: [{ id: "n1", kode: "ID", nama: "Indonesia", ibu_kota: "Jakarta" }], error: null }),
};
klienPalsu.panggilan = [];
r = await dataLib.cariNegara("ind");
cek("cariNegara: or nama/kode ilike", opsTerakhir().ops.some(([m, s]) => m === "or" && s.includes("nama.ilike") && s.includes("kode.ilike")));
cek("cariNegara: limit 10 + tersedia", r.negara.length === 1 && r.tersedia === true);
r = await dataLib.cariNegara("");
cek("cariNegara q kosong: tanpa query", r.negara.length === 0 && klienPalsu.panggilan.length === 1);
klienPalsu.handler = { pf_countries: () => ({ data: null, error: { code: "PGRST205", message: "Could not find the table" } }) };
r = await dataLib.cariNegara("ind");
cek("cariNegara tabel belum ada: tersedia=false", r.negara.length === 0 && r.tersedia === false);

/* ================= B2. Route pencarian-tersimpan ================= */
const statePref = { adaBaris: false, daftar: [], kolomAda: true };
const UID_UJI = "99999999-9999-9999-9999-999999999999";
klienPalsu.penggunaAktif = { id: UID_UJI, email: "uji@example.test" };
klienPalsu.handler = {
  pf_user_preferences: (ops) => {
    if (!statePref.kolomAda) {
      return { data: null, error: { code: "PGRST204", message: 'Could not find the column "pencarian_tersimpan"' } };
    }
    if (ops.some(([m]) => m === "upsert")) {
      const baris = ops.find(([m]) => m === "upsert")[1];
      statePref.daftar = baris.pencarian_tersimpan;
      statePref.adaBaris = true;
      return { data: null, error: null };
    }
    return { data: statePref.adaBaris ? { pencarian_tersimpan: statePref.daftar } : null, error: null };
  },
};
const routeSimpan = muatModul(path.join(DIR_REPO, "src/app/api/saya/pencarian-tersimpan/route.ts"));
// FU2: konstanta pindah dari route ke lib — nilai tetap 10.
const libPerpustakaan = muatModul(path.join(DIR_REPO, "src/lib/perpustakaan.ts"));
cek("MAX_PENCARIAN_TERSIMPAN = 10 diekspor dari lib/perpustakaan", libPerpustakaan.MAX_PENCARIAN_TERSIMPAN === 10);
const reqJson = (method, body, path2 = "/api/saya/pencarian-tersimpan") =>
  new Request(`http://localhost${path2}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

klienPalsu.penggunaAktif = null;
let res = await routeSimpan.GET(reqJson("GET"));
cek("GET tanpa login: 401", res.status === 401 && res.body.ok === false);
res = await routeSimpan.POST(reqJson("POST", { q: "ekonomi" }));
cek("POST tanpa login: 401", res.status === 401);

klienPalsu.penggunaAktif = { id: UID_UJI, email: "uji@example.test" };
statePref.adaBaris = false; statePref.daftar = []; statePref.kolomAda = true;
res = await routeSimpan.GET(reqJson("GET"));
cek("GET login tanpa baris: []", res.status === 200 && sama(res.body.pencarian, []));

res = await routeSimpan.POST(reqJson("POST", { q: "ekonomi", dari: "2026-11-01", status: "VERIFIED" }));
cek("POST valid: tersimpan", res.status === 200 && res.body.pencarian.length === 1 && res.body.pencarian[0].q === "ekonomi" && res.body.pencarian[0].dari === "2026-11-01" && res.body.pencarian[0].status === "VERIFIED" && typeof res.body.pencarian[0].disimpan_pada === "string");

res = await routeSimpan.POST(reqJson("POST", { q: "ekonomi", dari: "2026-11-01", status: "VERIFIED" }));
cek("POST filter sama: idempotent", res.status === 200 && res.body.sudahDisimpan === true && res.body.pencarian.length === 1);

for (let i = 2; i <= 10; i++) {
  res = await routeSimpan.POST(reqJson("POST", { q: `topik-${i}` }));
  if (res.status !== 200) break;
}
cek("POST sampai 10 entri", res.status === 200 && statePref.daftar.length === 10);
res = await routeSimpan.POST(reqJson("POST", { q: "kesebelas" }));
cek("POST ke-11: 409 batas maksimum", res.status === 409 && /10/.test(res.body.error));

res = await routeSimpan.POST(reqJson("POST", { q: "" }));
cek("POST q kosong: 400", res.status === 400);
res = await routeSimpan.POST(reqJson("POST", { q: "x", dari: "2026-02-30" }));
cek("POST tanggal tidak valid: 400", res.status === 400);
res = await routeSimpan.POST(reqJson("POST", { q: "x", status: "ASAL" }));
cek("POST status tidak valid: 400", res.status === 400);
res = await routeSimpan.POST(reqJson("POST", { q: "x", sumber: "bukan-uuid" }));
cek("POST sumber bukan-UUID: 400", res.status === 400);

const target = statePref.daftar.find((d) => d.q === "topik-2");
res = await routeSimpan.DELETE(reqJson("DELETE", { q: "topik-2", disimpan_pada: target.disimpan_pada }));
cek("DELETE q+disimpan_pada: dihapus", res.status === 200 && res.body.dihapus === true && res.body.pencarian.length === 9);
res = await routeSimpan.DELETE(reqJson("DELETE", { q: "tidak-ada", disimpan_pada: "2026-01-01T00:00:00.000Z" }));
cek("DELETE entri tak ada: dihapus=false", res.status === 200 && res.body.dihapus === false && res.body.pencarian.length === 9);
res = await routeSimpan.DELETE(reqJson("DELETE", { q: "x" }));
cek("DELETE tanpa disimpan_pada: 400", res.status === 400);

// Form POST (tanpa JS) -> redirect 303 ke /cari.
const formBody = new URLSearchParams({ q: "ikn", status: "UNCONFIRMED" });
res = await routeSimpan.POST(new Request("http://localhost/api/saya/pencarian-tersimpan", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: formBody.toString(),
}));
cek("POST form: 303 ke /cari", res.status === 303 && res.redirect.includes("/cari?q=ikn") && res.redirect.includes("status=UNCONFIRMED") && res.redirect.includes("tersimpan=1"));

// Kolom v18 belum ada -> 503 jujur.
statePref.kolomAda = false;
res = await routeSimpan.GET(reqJson("GET"));
cek("GET kolom belum ada: 503", res.status === 503);
res = await routeSimpan.POST(reqJson("POST", { q: "baru" }));
cek("POST kolom belum ada: 503", res.status === 503);
statePref.kolomAda = true;

/* ================= B3. Route saran ================= */
const kemarin = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const tigaHariLalu = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
klienPalsu.handler = {
  pf_articles: () => ({
    data: [
      { id: "t1", judul: "Ekonomi Indonesia Tumbuh Pesat", diterbitkan_pada: kemarin },
      { id: "t2", judul: "Ekonomi Global Melemah", diterbitkan_pada: kemarin },
      { id: "t3", judul: "Teknologi AI di Indonesia", diterbitkan_pada: tigaHariLalu },
    ],
    error: null,
  }),
  pf_categories: () => ({
    data: [{ id: "k1", slug: "ekonomi", nama: "Ekonomi", deskripsi: null, induk_id: null, urutan: 1, aktif: true }],
    error: null,
  }),
  pf_sources: () => ({
    data: [{ id: "s1", nama: "Antara", jenis: "rss", url: "https://antara.example/rss", aktif: true, prioritas: 90, terakhir_cek: null, status_terakhir: null }],
    error: null,
  }),
  pf_countries: () => ({
    data: [{ id: "n1", kode: "ID", nama: "Indonesia", ibu_kota: "Jakarta" }],
    error: null,
  }),
};
const routeSaran = muatModul(path.join(DIR_REPO, "src/app/api/cari/saran/route.ts"));
res = await routeSaran.GET(new Request("http://localhost/api/cari/saran"));
cek("saran q kosong: { saran: [] }", res.status === 200 && sama(res.body.saran, []));
res = await routeSaran.GET(new Request("http://localhost/api/cari/saran?q=eko"));
const jenis = res.body.saran.map((s) => s.jenis);
cek("saran q=eko: ada tren", jenis.includes("tren") && res.body.saran.some((s) => s.jenis === "tren" && s.teks === "ekonomi"));
cek("saran q=eko: ada artikel", jenis.includes("artikel"));
cek("saran q=eko: kategori Ekonomi tetap ada meski tren ekonomi ada", res.body.saran.some((s) => s.jenis === "kategori" && s.teks === "Ekonomi" && s.url === "/kategori/ekonomi"));
cek("saran q=eko: ada negara + sumber", jenis.includes("negara") && jenis.includes("sumber"));
cek("saran: tanpa duplikat (jenis, teks)", new Set(res.body.saran.map((s) => `${s.jenis}:${s.teks.toLowerCase()}`)).size === res.body.saran.length);

klienPalsu.handler = {
  pf_articles: () => ({ data: null, error: { code: "PGRST205", message: "Could not find the table" } }),
  pf_categories: () => ({ data: null, error: { code: "PGRST205", message: "Could not find the table" } }),
  pf_sources: () => ({ data: null, error: { code: "PGRST205", message: "Could not find the table" } }),
  pf_countries: () => ({ data: null, error: { code: "PGRST205", message: "Could not find the table" } }),
};
res = await routeSaran.GET(new Request("http://localhost/api/cari/saran?q=eko"));
cek(
  "saran DB error: 200, bukan 500 (hanya fallback taksonomi statis)",
  res.status === 200 &&
    res.body.saran.every((s) => s.jenis === "kategori"),
  `saran kembali: ${res.body.saran.map((s) => s.teks).join(", ") || "(kosong)"}`,
);

/* ================= C. Pemeriksaan statis ================= */
const bacaRepo = (rel) => fs.readFileSync(path.join(DIR_REPO, rel), "utf8");
const page = bacaRepo("src/app/cari/page.tsx");
cek("page: await connection()", page.includes("await connection()"));
cek("page: <Suspense>", page.includes("<Suspense"));
cek("page: export const instant = false", page.includes("export const instant = false"));
cek("page: seksi Pencarian tersimpan", page.includes("Pencarian tersimpan"));
cek("page: tombol Simpan pencarian ini", page.includes("Simpan pencarian ini"));
cek("page: form POST ke endpoint tersimpan", page.includes('action="/api/saya/pencarian-tersimpan"') && page.includes('method="post"'));
cek("page: panel filter (dari/sampai/sumber/status)", page.includes('name="dari"') && page.includes('name="sampai"') && page.includes('name="sumber"') && page.includes('name="status"'));
cek("page: seksi Negara", page.includes("Negara") && page.includes("/negara/${"));
cek("page: server component (tanpa \"use client\")", !page.includes('"use client"'));
const saranSrc = bacaRepo("src/app/api/cari/saran/route.ts");
cek("saran: fallback { saran: [] }", (saranSrc.match(/\{\s*saran:\s*\[\]\s*\}/g) ?? []).length >= 2);
cek("saran: pakai hitungTren()", saranSrc.includes("hitungTren("));
const simpanSrc = bacaRepo("src/app/api/saya/pencarian-tersimpan/route.ts");
cek("tersimpan: cekOrigin POST/DELETE", (simpanSrc.match(/cekOrigin\(req\)/g) ?? []).length === 2);
cek("tersimpan: rate limit 30", simpanSrc.includes("buatRateLimiter(30)"));
cek("tersimpan: 401 bila tidak login", simpanSrc.includes("401"));
const dataSrc = bacaRepo("src/lib/data.ts");
cek("data: cariArtikel memakai FilterCariArtikel", dataSrc.includes("FilterCariArtikel"));
cek("data: cariNegara ada", dataSrc.includes("export async function cariNegara"));

console.log(`\nRINGKASAN: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
