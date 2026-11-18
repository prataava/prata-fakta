// Uji migrasi v28 PRATA FAKTA (scheduler pg_cron + atribusi 'pg_cron').
// PGlite in-memory — aman, tidak menyentuh DB produksi.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// CARA JALAN (wajib, dari akar repo):
//   node --experimental-strip-types scripts/jalankan-baterai.mjs scripts/uji-migrasi-v28.mjs
//
// YANG DIUJI:
//   §A  Statis: berkas v28 memuat §1 CHECK dipicu_oleh + §2
//       ekstensi + §3 fungsi pemanggil + §4 tiga job dengan
//       jadwal yang benar; TIDAK ADA nilai secret harfiah
//       (hanya nama Vault); TIDAK ADA perubahan CHECK agen
//       (koreksi premis: 'comparison' SUDAH di v22).
//   §B  Live PGlite: v1–v8 + v22 diterapkan, lalu v28 §1–§3
//       (bagian §4 dilepas — butuh skema cron/pg_net/Vault
//       asli): CHECK dipicu_oleh meluas ke 'pg_cron', nilai lama
//       tetap diterima, nilai liar ditolak, idempoten, fungsi
//       SECURITY DEFINER + search_path dipatok; agen
//       'comparison' DITERIMA CHECK v22 (bukti premis §1
//       dokumen KEPUTUSAN salah — tidak butuh migrasi baru).
//   §C  Statis: atribusi 'pg_cron' di kode (types, route-auth,
//       ingestion route) + workflow Actions TIDAK berubah
//       (tetap fallback sampai cutover terpisah).
//
// BATAS UJI YANG JUJUR:
// - §4 (cron.schedule) TIDAK bisa jalan di PGlite (tidak ada
//   skema cron / pg_net / Vault) — hanya diverifikasi statis
//   di §A; verifikasi live-nya adalah kueri di header migrasi
//   yang dijalankan pemilik di SQL Editor sesudah penerapan.
// - Fungsi pf_panggil_endpoint_terjadwal hanya dibuktikan
//   ADA + SECURITY DEFINER (§B); pemanggilan HTTP-nya tidak
//   diuji (butuh Vault + pg_net + endpoint live).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const requirePglite = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = requirePglite("@electric-sql/pglite");

const DIR_REPO = new URL("../", import.meta.url).pathname;
const DIR_MIGRASI = path.join(DIR_REPO, "supabase/migrations");
const V28 = "20261118_pf_v28_pg_cron_scheduler.sql";

let gagal = 0;
let lolos = 0;
function cek(label, kondisi, detail = "") {
  if (kondisi) {
    lolos++;
    console.log(`OK: ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    gagal++;
    console.log(`GAGAL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function baca(rel) {
  return fs.readFileSync(path.join(DIR_REPO, rel), "utf8");
}
function bacaMigrasi(nama) {
  let sql = fs.readFileSync(path.join(DIR_MIGRASI, nama), "utf8");
  sql = sql.replace(/create extension[^;]+;/gi, "-- ekstensi dilepas (PGlite)");
  sql = sql.replace(/\bcitext\b/gi, "text");
  return sql;
}

// ---------- §A: statis berkas v28 ----------
console.log("--- §A statis migrasi v28 ---");
{
  const sql = baca(`supabase/migrations/${V28}`);
  const sqlTanpaKomentar = sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  cek(
    "A1 §1: dua CHECK dipicu_oleh v28 (ingestion + ai_runs) memuat 'pg_cron'",
    sql.includes("pf_ingestion_runs_dipicu_oleh_check_v28") &&
      sql.includes("pf_ai_runs_dipicu_oleh_check_v28") &&
      (sql.match(/'pg_cron'/g) ?? []).length >= 2,
  );
  cek(
    "A2 §2: ekstensi pg_cron + pg_net + supabase_vault",
    sql.includes("create extension if not exists pg_cron") &&
      sql.includes("create extension if not exists pg_net") &&
      sql.includes("create extension if not exists supabase_vault"),
  );
  cek(
    "A3 §3: fungsi pf_panggil_endpoint_terjadwal SECURITY DEFINER + search_path dipatok + REVOKE PUBLIC",
    sql.includes("create or replace function public.pf_panggil_endpoint_terjadwal(") &&
      sql.includes("security definer") &&
      sql.includes("set search_path = public, vault, net") &&
      sql.includes("revoke execute on function public.pf_panggil_endpoint_terjadwal(text, text, text, jsonb) from public"),
  );
  cek(
    "A4 §3: secret dibaca dari Vault (bukan harfiah) + header x-pf-pemicu pg_cron",
    sql.includes("from vault.decrypted_secrets") &&
      sql.includes("'x-pf-pemicu', 'pg_cron'") &&
      sql.includes("secret vault % belum dibuat"),
  );
  const jobIngestion =
    sql.includes("'pf-ingestion-30mnt'") && sql.includes("'*/30 * * * *'");
  const jobPipeline =
    sql.includes("'pf-pipeline-24mnt'") && sql.includes("'*/24 * * * *'");
  const jobTanya =
    sql.includes("'pf-tanya-jawab-harian'") && sql.includes("'0 1 * * *'");
  cek(
    "A5 §4: tiga job (ingestion */30, pipeline */24 limit 10, tanya-jawab 0 1 * * *)",
    jobIngestion && jobPipeline && jobTanya,
  );
  cek(
    "A6 §4: job memanggil endpoint yang benar dengan secret Vault yang benar",
    sql.includes("'/api/ingestion/jalankan', 'x-pf-ingestion-secret', 'pf_ingestion_secret'") &&
      sql.includes("'/api/ai/jalankan', 'x-pf-ai-secret', 'pf_ai_secret'") &&
      sql.includes("'/api/tanya/draf', 'x-pf-ai-secret', 'pf_ai_secret'") &&
      sql.includes('{"dipicu_oleh":"pg_cron","limit":10}'),
  );
  cek(
    "A7 §4 idempoten: tiap job unschedule-bila-ada sebelum schedule",
    (sql.match(/perform cron\.unschedule\(/g) ?? []).length === 3 &&
      (sql.match(/perform cron\.schedule\(/g) ?? []).length === 3,
  );
  cek(
    "A8 TIDAK ADA nilai secret harfiah: create_secret hanya di komentar (0 di SQL eksekusi)",
    !sqlTanpaKomentar.includes("create_secret"),
    "bila gagal: nilai secret tertulis di SQL eksekusi",
  );
  cek(
    "A9 TIDAK ADA perubahan CHECK agen: v28 tidak menyebut pf_ai_runs_agen_check",
    !sql.includes("pf_ai_runs_agen_check"),
    "'comparison' sudah di v22 — jangan tambah lagi",
  );
  cek(
    "A10 header mendokumentasikan prasyarat Vault + batas fire-and-forget + jeda proyek gratis + rencana cutover",
    sql.includes("PRASYARAT PENERAPAN") &&
      sql.includes("FIRE-AND-FORGET") &&
      sql.includes("DIJEDA") &&
      sql.includes("RENCANA CUTOVER"),
  );
  cek(
    "A11 §4: perintah job memakai tag dollar BERBEDA dari do-block (bukan nested $$)",
    !sql.includes("$$select") &&
      (sql.match(/\$job\$select/g) ?? []).length === 3,
    "bila gagal: nested $$ = syntax error at or near select",
  );
}

// ---------- §B: live PGlite (v1–v8 + v22, lalu v28 tanpa §4) ----------
console.log("--- §B live PGlite: CHECK dipicu_oleh + fungsi ---");
{
  const MIGRASI_V1_V8 = [
    "20261116_pf_v1_foundation.sql",
    "20261116_pf_v2_articles.sql",
    "20261116_pf_v3_ingestion.sql",
    "20261116_pf_v4_ai.sql",
    "20261116_pf_v5_editorial.sql",
    "20261116_pf_v6_advanced.sql",
    "20261116_pf_v7_quiz_scores.sql",
    "20261116_pf_v8_expansion.sql",
  ];
  const db = new PGlite();
  await db.exec(`create schema if not exists auth;`);
  await db.exec(`create schema if not exists extensions;`);
  await db.exec(`create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);`);
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('pf.uid_test', true), '')::uuid $$;`);
  await db.exec(`create role anon nologin;`);
  await db.exec(`create role authenticated nologin;`);
  await db.exec(`create role service_role nologin;`);
  let dasarOk = true;
  for (const nama of [...MIGRASI_V1_V8, "20261117_pf_v22_global_intel.sql"]) {
    try {
      await db.exec(bacaMigrasi(nama));
    } catch (e) {
      dasarOk = false;
      console.log(`GAGAL: migrasi ${nama} — ${String(e.message).split("\n")[0]}`);
      break;
    }
  }
  cek("B1 migrasi v1–v8 + v22 diterapkan di PGlite", dasarOk);

  // v28 tanpa §4 (butuh skema cron/pg_net/Vault asli) + tanpa
  // ekstensi (sudah dilepas bacaMigrasi). §3 (fungsi) ikut
  // diterapkan — badan plpgsql tidak divalidasi saat CREATE.
  const sql28Penuh = bacaMigrasi(V28);
  const sql28TanpaS4 = sql28Penuh.split("-- §4.")[0];
  let v28Ok = false;
  let v28Galat = "";
  try {
    await db.exec(sql28TanpaS4);
    v28Ok = true;
  } catch (e) {
    v28Galat = String(e.message).split("\n")[0];
  }
  cek("B2 v28 §1–§3 diterapkan di PGlite (tanpa §4)", v28Ok, v28Galat);

  if (v28Ok) {
    const cons = await db.query(
      `select conrelid::regclass::text as tabel, conname from pg_constraint where conname like '%dipicu_oleh_check_v28' order by tabel`,
    );
    cek(
      "B3 tepat 2 constraint v28 (satu per tabel)",
      cons.rows.length === 2 &&
        cons.rows.some((r) => r.tabel === "pf_ingestion_runs") &&
        cons.rows.some((r) => r.tabel === "pf_ai_runs"),
      cons.rows.map((r) => `${r.tabel}.${r.conname}`).join(", "),
    );
    const consLama = await db.query(
      `select count(*)::int as n from pg_constraint where contype = 'c' and pg_get_constraintdef(oid) ilike '%dipicu_oleh%' and conname not like '%_v28'`,
    );
    cek("B4 CHECK dipicu_oleh lama sudah diganti (0 tersisa)", consLama.rows[0].n === 0);

    // pf_ai_runs butuh kolom agen (not null + CHECK v22).
    let pgCronAi = false;
    let pgCronIng = false;
    try {
      await db.query(
        `insert into public.pf_ai_runs (agen, dipicu_oleh) values ('fact_verification', 'pg_cron')`,
      );
      pgCronAi = true;
    } catch (e) {
      console.log(`GAGAL: insert ai_runs pg_cron — ${String(e.message).split("\n")[0]}`);
    }
    try {
      await db.query(
        `insert into public.pf_ingestion_runs (dipicu_oleh) values ('pg_cron')`,
      );
      pgCronIng = true;
    } catch (e) {
      console.log(`GAGAL: insert ingestion_runs pg_cron — ${String(e.message).split("\n")[0]}`);
    }
    cek("B5 insert dipicu_oleh 'pg_cron' diterima (ai_runs + ingestion_runs)", pgCronAi && pgCronIng);

    let lamaOk = true;
    for (const nilai of ["manual", "jadwal", "github_actions", "cron_muse"]) {
      try {
        await db.query(
          `insert into public.pf_ai_runs (agen, dipicu_oleh) values ('fact_verification', $1)`,
          [nilai],
        );
        await db.query(
          `insert into public.pf_ingestion_runs (dipicu_oleh) values ($1)`,
          [nilai],
        );
      } catch {
        lamaOk = false;
      }
    }
    cek("B6 nilai lama (manual/jadwal/github_actions/cron_muse) tetap diterima", lamaOk);

    let tolakLiar = true;
    for (const nilai of ["nilai_liar", "PG_CRON", "github"]) {
      try {
        await db.query(
          `insert into public.pf_ai_runs (agen, dipicu_oleh) values ('fact_verification', $1)`,
          [nilai],
        );
        tolakLiar = false;
      } catch {
        // ditolak — benar
      }
    }
    cek("B7 nilai liar ditolak CHECK v28", tolakLiar);

    // Bukti koreksi premis: agen 'comparison' DITERIMA CHECK v22
    // — jadi v28 memang tidak butuh (dan tidak memuat) perubahan
    // CHECK agen apa pun.
    let comparisonOk = false;
    try {
      await db.query(
        `insert into public.pf_ai_runs (agen, dipicu_oleh) values ('comparison', 'manual')`,
      );
      comparisonOk = true;
    } catch (e) {
      console.log(`GAGAL: insert agen comparison — ${String(e.message).split("\n")[0]}`);
    }
    cek("B8 agen 'comparison' DITERIMA CHECK v22 (tidak butuh migrasi baru)", comparisonOk);

    // Idempotensi §1: jalankan lagi — tanpa error, tetap 2 constraint.
    let idempotenOk = false;
    try {
      await db.exec(sql28TanpaS4);
      const cons2 = await db.query(
        `select count(*)::int as n from pg_constraint where conname like '%dipicu_oleh_check_v28'`,
      );
      idempotenOk = cons2.rows[0].n === 2;
    } catch (e) {
      console.log(`GAGAL: v28 kedua — ${String(e.message).split("\n")[0]}`);
    }
    cek("B9 v28 idempoten (jalan kedua tanpa error, tetap 2 constraint)", idempotenOk);

    const fn = await db.query(
      `select proname, prosecdef, proconfig from pg_proc where proname = 'pf_panggil_endpoint_terjadwal'`,
    );
    const proconfig = (fn.rows[0]?.proconfig ?? []).join(",");
    cek(
      "B10 fungsi pemanggil ada + SECURITY DEFINER + search_path dipatok",
      fn.rows.length === 1 &&
        fn.rows[0].prosecdef === true &&
        proconfig.includes("search_path=public, vault, net"),
      proconfig,
    );
  }
  await db.close();
}

// ---------- §C: statis atribusi kode + Actions tetap fallback ----------
console.log("--- §C statis atribusi pg_cron di kode ---");
{
  const types = baca("src/lib/ai/types.ts");
  cek(
    "C1 DipicuOleh memuat 'pg_cron'",
    types.includes('"pg_cron"'),
  );
  const auth = baca("src/lib/ai/route-auth.ts");
  cek(
    "C2 route-auth: secret + header x-pf-pemicu pg_cron -> dipicuOleh 'pg_cron'",
    auth.includes('req.headers.get("x-pf-pemicu")') &&
      auth.includes('pemicuHeader === "pg_cron" ? "pg_cron" : "github_actions"'),
  );
  cek(
    "C3 route-auth: normalisasiDipicuOleh menerima 'pg_cron'",
    auth.includes('nilai === "pg_cron"'),
  );
  const ingestion = baca("src/app/api/ingestion/jalankan/route.ts");
  cek(
    "C4 ingestion route: tipe + default + body menerima 'pg_cron'",
    ingestion.includes('"manual" | "github_actions" | "pg_cron"') &&
      ingestion.includes('req.headers.get("x-pf-pemicu") === "pg_cron"') &&
      ingestion.includes('body.dipicu_oleh === "pg_cron"'),
  );
  const wfIngestion = baca(".github/workflows/ingestion.yml");
  const wfPipeline = baca(".github/workflows/editorial-pipeline.yml");
  const wfTanya = baca(".github/workflows/tanya-jawab-draf.yml");
  cek(
    "C5 workflow Actions TIDAK berubah (schedule tetap ada — fallback sampai cutover terpisah)",
    wfIngestion.includes("schedule:") &&
      wfPipeline.includes("schedule:") &&
      wfTanya.includes("schedule:"),
  );
  const tanya = baca("src/app/api/tanya/draf/route.ts");
  cek(
    "C6 tanya/draf memakai autentikasiPemicuAi yang sama (ikut atribusi pg_cron)",
    tanya.includes("autentikasiPemicuAi(req)"),
  );
}

console.log(`\nMigrasi-v28: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
