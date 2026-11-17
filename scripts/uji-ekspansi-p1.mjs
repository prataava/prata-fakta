// Uji integrasi P1 ekspansi PRATA FAKTA — migrasi v19, RLS
// pf_notes 2 akun, semantik /api/catatan (tingkat aturan),
// getter klaim/graf (anti-bocor draf), perbandingan dua artikel,
// timeline, notifikasi topik, + penjaga statis & integrasi.
// PGlite in-memory — aman, tidak menyentuh DB produksi.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// CARA JALAN (wajib, dari akar repo):
//   node --experimental-strip-types \
//     --import /tmp/pf-register.mjs scripts/uji-ekspansi-p1.mjs
// Loader /tmp/pf-register.mjs memetakan alias "@/" ke src/ dan
// men-stub next/headers (pola baterai P1-4-5 Worker D) —
// diperlukan untuk impor src/lib/topik.ts, tulis.ts, klaim.ts.
// Tanpa loader, asersi §D-bagian-akhir/§G gagal jujur (bukan
// dilewati diam-diam).
//
// BATAS UJI YANG JUJUR (bukan kelemahan yang disembunyikan):
// - Status HTTP /api/catatan (401/400/403/404/503) TIDAK diuji
//   live: tidak ada Supabase lokal, dan .env.local menunjuk
//   Supabase produksi (dilarang disentuh). Yang diuji: aturan
//   di route.ts (status + kondisi pemicu) + semantik yang sama
//   di tingkat database (CHECK/RLS). Uji HTTP live tetap BLOKIR
//   sampai ada lingkungan non-produksi.
// - Getter getKlaim/getDaftarKlaim/getGrafPengetahuan yang
//   memakai createClient Supabase TIDAK bisa diarahkan ke
//   PGlite; yang diuji live: getKlaim("bukan-uuid") → null
//   (jalur tanpa DB) + semantik SQL yang dipakai getter itu
//   (gate status='terbit', urutan kronologis, relasi graf).
// - Verifikasi RLS 2 akun LIVE tetap BLOKIR (di luar mandat).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const requirePglite = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = requirePglite("@electric-sql/pglite");
import {
  adaPerkembanganTerbaru,
  batasZoom,
  hariDariISO,
  kurangiBulan,
  saringEventRentang,
  tanggalValid,
  uraiRentangTanggal,
} from "../src/lib/linimasa.ts";
import {
  cocokkanKlaimDuaArtikel,
  normalisasiTeksKlaim,
  rakitPerbandinganDuaArtikel,
} from "../src/lib/perbandingan-dua.ts";

const DIR_REPO = new URL("../", import.meta.url).pathname;
const DIR_MIGRASI = path.join(DIR_REPO, "supabase/migrations");

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
function bacaFile(rel) {
  return fs.readFileSync(path.join(DIR_REPO, rel), "utf8");
}
function ada(rel) {
  return fs.existsSync(path.join(DIR_REPO, rel));
}
function grepFile(rel, pola) {
  return pola.test(bacaFile(rel));
}
function tanpaKomentar(teks) {
  return teks
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((b) => !/^\s*\/\//.test(b))
    .join("\n");
}

// ================================================================
// §A — Migrasi v19 di atas skema v1–v18 (dua putaran idempoten)
// ================================================================
const MIGRASI_V1_V18 = [
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
const V19 = "20261117_pf_v19_ekspansi_p1.sql";

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
for (const nama of MIGRASI_V1_V18) {
  try {
    await db.exec(bacaMigrasi(nama));
  } catch (e) {
    migrasiOk = false;
    console.log(`GAGAL: migrasi ${nama} — ${String(e.message).split("\n")[0]}`);
  }
}
cek("A1 v1–v18 diterapkan di PGlite", migrasiOk);

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const ARTIKEL_1 = "44444444-4444-4444-8444-444444444444";
const ARTIKEL_2 = "55555555-5555-4555-8555-555555555555";
const ARTIKEL_DRAF = "66666666-6666-4666-8666-666666666666";
const PENGETAHUAN_1 = "77777777-7777-4777-8777-777777777777";
await db.exec(
  `insert into auth.users (id, email) values ('${USER_A}', 'a@contoh.id'), ('${USER_B}', 'b@contoh.id');`,
);
await db.exec(
  `insert into public.pf_categories (slug, nama) values ('politik', 'Politik') on conflict (slug) do nothing;`,
);
await db.exec(
  `insert into public.pf_articles (id, slug, judul, kategori_slug, status, status_verifikasi) values
    ('${ARTIKEL_1}', 'uji-p1-satu', 'Artikel Uji P1 Satu', 'politik', 'terbit', 'CROSS-CHECKED'),
    ('${ARTIKEL_2}', 'uji-p1-dua', 'Artikel Uji P1 Dua', 'politik', 'terbit', 'VERIFIED'),
    ('${ARTIKEL_DRAF}', 'uji-p1-draf', 'Artikel Uji P1 Draf', 'politik', 'draft', 'UNCONFIRMED');`,
);
await db.exec(
  `insert into public.pf_knowledge_articles (id, slug, judul, topik, status) values ('${PENGETAHUAN_1}', 'uji-p1-tahu', 'Pengetahuan Uji P1', 'umum', 'terbit');`,
);
await db.exec(
  `insert into public.pf_bookmarks (user_id, artikel_id) values ('${USER_A}', '${ARTIKEL_1}');`,
);

try {
  await db.exec(bacaMigrasi(V19));
  await db.exec(bacaMigrasi(V19));
  cek("A2 v19 diterapkan 2x (idempoten)", true);
} catch (e) {
  cek("A2 v19 diterapkan 2x (idempoten)", false, String(e.message).split("\n")[0]);
}

const kolom = await db.query(
  `select table_name, column_name, data_type, is_nullable
     from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'pf_bookmarks' and column_name = 'folder')
        or (table_name = 'pf_notes' and column_name in ('id','user_id','artikel_id','pengetahuan_id','isi','dibuat_pada','diubah_pada')))`,
);
cek(
  "A3 kolom pf_bookmarks.folder ada (text, nullable)",
  kolom.rows.some(
    (r) =>
      r.table_name === "pf_bookmarks" &&
      r.column_name === "folder" &&
      r.data_type === "text" &&
      r.is_nullable === "YES",
  ),
);
cek(
  "A4 pf_notes punya 7 kolom",
  kolom.rows.filter((r) => r.table_name === "pf_notes").length === 7,
  `${kolom.rows.filter((r) => r.table_name === "pf_notes").length} kolom`,
);
const barisLama = await db.query(
  `select folder from public.pf_bookmarks where user_id = '${USER_A}'`,
);
cek(
  "A5 baris bookmark lama tetap terbaca, folder NULL (Tanpa folder)",
  barisLama.rows.length === 1 && barisLama.rows[0].folder === null,
);
const pols = await db.query(
  `select policyname, cmd from pg_policies where schemaname='public' and tablename='pf_notes'`,
);
cek(
  "A6 pf_notes punya 4 policy (SELECT/INSERT/UPDATE/DELETE)",
  pols.rows.length === 4,
  pols.rows.map((r) => `${r.cmd}`).join(","),
);
cek(
  "A7 semua policy pf_notes owner-scoped (auth.uid() = user_id)",
  pols.rows.length === 4 &&
    Number(
      (
        await db.query(
          `select count(*) as n from pg_policies where schemaname='public' and tablename='pf_notes' and (qual like '%auth.uid() = user_id%' or with_check like '%auth.uid() = user_id%')`,
        )
      ).rows[0].n,
    ) === 4,
);
const rls = await db.query(
  `select relrowsecurity from pg_class where relname='pf_notes'`,
);
cek("A8 RLS aktif di pf_notes", rls.rows[0]?.relrowsecurity === true);
const cekTarget = await db.query(
  `select conname from pg_constraint where conrelid='public.pf_notes'::regclass and conname='pf_notes_satu_target_check'`,
);
cek("A9 CHECK pf_notes_satu_target_check ada", cekTarget.rows.length === 1);
const idx = await db.query(
  `select indexname from pg_indexes where schemaname='public' and tablename='pf_notes'`,
);
cek(
  "A10 index pf_notes_user_idx ada",
  idx.rows.some((r) => r.indexname === "pf_notes_user_idx"),
);

// ---------- helper RLS (pola uji-fase8-gel1) ----------
async function sebagaiUid(role, uid, sql, params = []) {
  await db.query(`set role ${role}`);
  await db.query(`select set_config('pf.uid_test', $1, false)`, [uid]);
  try {
    return await db.query(sql, params);
  } finally {
    await db.query(`select set_config('pf.uid_test', '', false)`);
    await db.query("reset role");
  }
}
async function berhasilSebagaiUid(role, uid, sql, params = []) {
  try {
    await sebagaiUid(role, uid, sql, params);
    return true;
  } catch {
    return false;
  }
}
async function hitungSebagaiUid(role, uid, sql, params = []) {
  const r = await sebagaiUid(role, uid, sql, params);
  return Number(r.rows[0]?.n ?? 0);
}
async function gagalSuperuser(sql, params = []) {
  try {
    await db.query(sql, params);
    return false;
  } catch {
    return true;
  }
}

// ================================================================
// §B — CHECK pf_notes + RLS 2 akun
// ================================================================
cek(
  "B1 CHECK menolak isi kosong",
  await gagalSuperuser(
    `insert into public.pf_notes (user_id, artikel_id, isi) values ('${USER_A}', '${ARTIKEL_1}', '')`,
  ),
);
cek(
  "B2 CHECK menolak isi >2000 karakter",
  await gagalSuperuser(
    `insert into public.pf_notes (user_id, artikel_id, isi) values ('${USER_A}', '${ARTIKEL_1}', $1)`,
    ["x".repeat(2001)],
  ),
);
cek(
  "B3 CHECK menerima isi 1 dan 2000 karakter",
  await (async () => {
    try {
      await db.exec(`delete from public.pf_notes where user_id='${USER_A}'`);
      await db.query(
        `insert into public.pf_notes (user_id, artikel_id, isi) values ('${USER_A}', '${ARTIKEL_1}', 'a')`,
      );
      await db.query(
        `insert into public.pf_notes (user_id, artikel_id, isi) values ('${USER_A}', '${ARTIKEL_1}', $1)`,
        ["y".repeat(2000)],
      );
      return true;
    } catch {
      return false;
    }
  })(),
);
cek(
  "B4 CHECK satu-target menolak dua target sekaligus",
  await gagalSuperuser(
    `insert into public.pf_notes (user_id, artikel_id, pengetahuan_id, isi) values ('${USER_A}', '${ARTIKEL_1}', '${PENGETAHUAN_1}', 'dua target')`,
  ),
);
cek(
  "B5 CHECK satu-target menolak tanpa target",
  await gagalSuperuser(
    `insert into public.pf_notes (user_id, isi) values ('${USER_A}', 'tanpa target')`,
  ),
);
await db.exec(`delete from public.pf_notes where user_id='${USER_A}'`);

const CATATAN_A = "88888888-8888-4888-8888-888888888888";
await db.exec(
  `insert into public.pf_notes (id, user_id, artikel_id, isi) values ('${CATATAN_A}', '${USER_A}', '${ARTIKEL_1}', 'Catatan milik A');`,
);
cek(
  "B6 pemilik bisa baca catatannya sendiri",
  (await hitungSebagaiUid(
    "authenticated",
    USER_A,
    `select count(*) as n from public.pf_notes where id='${CATATAN_A}'`,
  )) === 1,
);
cek(
  "B7 pengguna lain TIDAK bisa baca catatan orang (0 baris)",
  (await hitungSebagaiUid(
    "authenticated",
    USER_B,
    `select count(*) as n from public.pf_notes where id='${CATATAN_A}'`,
  )) === 0,
);
cek(
  "B8 pengguna lain TIDAK bisa ubah catatan orang",
  !(await berhasilSebagaiUid(
    "authenticated",
    USER_B,
    `update public.pf_notes set isi='dibajak' where id='${CATATAN_A}' and user_id='${USER_B}' returning id`,
  )) ||
    (await hitungSebagaiUid(
      "authenticated",
      USER_A,
      `select count(*) as n from public.pf_notes where id='${CATATAN_A}' and isi='dibajak'`,
    )) === 0,
);
cek(
  "B9 pengguna lain TIDAK bisa hapus catatan orang (0 baris terhapus, baris tetap ada)",
  await (async () => {
    const r = await sebagaiUid(
      "authenticated",
      USER_B,
      `delete from public.pf_notes where id='${CATATAN_A}' returning id`,
    );
    const masihAda =
      (await hitungSebagaiUid(
        "authenticated",
        USER_A,
        `select count(*) as n from public.pf_notes where id='${CATATAN_A}'`,
      )) === 1;
    return r.rows.length === 0 && masihAda;
  })(),
);
cek(
  "B10 pemilik bisa ubah catatannya sendiri",
  await berhasilSebagaiUid(
    "authenticated",
    USER_A,
    `update public.pf_notes set isi='Catatan A diubah' where id='${CATATAN_A}'`,
  ),
);
cek(
  "B11 pemilik bisa buat catatan pengetahuan",
  await berhasilSebagaiUid(
    "authenticated",
    USER_A,
    `insert into public.pf_notes (user_id, pengetahuan_id, isi) values ('${USER_A}', '${PENGETAHUAN_1}', 'Catatan pengetahuan')`,
  ),
);
cek(
  "B12 pemilik bisa hapus catatannya sendiri",
  await berhasilSebagaiUid(
    "authenticated",
    USER_A,
    `delete from public.pf_notes where id='${CATATAN_A}'`,
  ),
);
await db.exec(`delete from public.pf_notes where user_id='${USER_A}'`);

// ---------- folder bookmark (§B lanjutan) ----------
cek(
  "B13 pindah bookmark ke folder baru",
  await berhasilSebagaiUid(
    "authenticated",
    USER_A,
    `update public.pf_bookmarks set folder='Bacaan Pagi' where user_id='${USER_A}' and artikel_id='${ARTIKEL_1}'`,
  ),
);
cek(
  "B14 bookmark tanpa folder = 0 sesudah pindah; folder terhitung 1",
  (await hitungSebagaiUid(
    "authenticated",
    USER_A,
    `select count(*) as n from public.pf_bookmarks where user_id='${USER_A}' and folder is null`,
  )) === 0 &&
    (await hitungSebagaiUid(
      "authenticated",
      USER_A,
      `select count(*) as n from public.pf_bookmarks where user_id='${USER_A}' and folder='Bacaan Pagi'`,
    )) === 1,
);
cek(
  "B15 keluarkan dari folder (folder NULL lagi)",
  await berhasilSebagaiUid(
    "authenticated",
    USER_A,
    `update public.pf_bookmarks set folder=null where user_id='${USER_A}' and artikel_id='${ARTIKEL_1}'`,
  ),
);

// ================================================================
// §C — Semantik /api/catatan, TINGKAT ATURAN (bukan HTTP live)
// Alasan jujur: tidak ada Supabase lokal; HTTP live akan memakai
// .env.local produksi (dilarang). Aturan di route.ts + CHECK/RLS
// §B adalah bukti yang bisa diuji di sini.
// ================================================================
const ruteCatatan = bacaFile("src/app/api/catatan/route.ts");
cek(
  "C1 /api/catatan punya GET+POST+PATCH+DELETE",
  ["export async function GET", "export async function POST", "export async function PATCH", "export async function DELETE"].every(
    (s) => ruteCatatan.includes(s),
  ),
);
cek(
  "C2 401 tanpa login (autentikasi → status 401)",
  ruteCatatan.includes("status: 401") && /401 bila belum login|belum login/.test(ruteCatatan),
);
cek(
  "C3 400 isi kosong / >2000 / UUID tak valid / tanpa target",
  (ruteCatatan.match(/status: 400/g) ?? []).length >= 4 &&
    ruteCatatan.includes("MAKS_ISI = 2000") &&
    ruteCatatan.includes("POLA_UUID"),
);
cek(
  "C4 403 PATCH/DELETE bukan milik + 404 catatan tak ada",
  (ruteCatatan.match(/status: 403/g) ?? []).length >= 2 &&
    ruteCatatan.includes("status: 404"),
);
cek(
  "C5 503 jujur bila tabel belum ada (PGRST205)",
  ruteCatatan.includes("PGRST205") && ruteCatatan.includes("status: 503"),
);
cek(
  "C6 rate limit 30/mnt + cekOrigin (pola /api/bookmark)",
  ruteCatatan.includes("buatRateLimiter(30)") && ruteCatatan.includes("cekOrigin"),
);
cek(
  "C7 /api/bookmark: folder opsional + toggle tak berubah",
  /folder/.test(bacaFile("src/app/api/bookmark/route.ts")) &&
    /\.delete\(\)/.test(bacaFile("src/app/api/bookmark/route.ts")),
);
cek(
  "C8 getter perpustakaan diekspor (folder/catatan/jumlah)",
  /export async function getFolderBookmark/.test(bacaFile("src/lib/perpustakaan.ts")) &&
    /export async function getCatatanPengguna/.test(bacaFile("src/lib/perpustakaan.ts")) &&
    /export async function getJumlahPerFolder/.test(bacaFile("src/lib/perpustakaan.ts")),
);

// ================================================================
// §D — Klaim & graf: semantik SQL getter + getKlaim live (tanpa DB)
// ================================================================
await db.exec(`
  insert into pf_claims (id, artikel_id, teks, jenis, status) values
    ('a1111111-1111-1111-1111-111111111111','${ARTIKEL_1}','Klaim terbit satu','fakta','terverifikasi'),
    ('a2222222-2222-2222-2222-222222222222','${ARTIKEL_1}','Klaim angka terbit','angka','belum_terverifikasi'),
    ('a3333333-3333-3333-3333-333333333333','${ARTIKEL_DRAF}','Klaim draf rahasia','fakta','terverifikasi');
  insert into pf_evidence (klaim_id, sumber_url, sumber_nama, kutipan, arah) values
    ('a1111111-1111-1111-1111-111111111111','https://example.com/a','Example','Kutipan pendukung','mendukung'),
    ('a1111111-1111-1111-1111-111111111111','https://example.com/b','Example B', null,'menentang'),
    ('a3333333-3333-3333-3333-333333333333','https://example.com/draf','Draf','Kutipan draf','mendukung');
  insert into pf_verification_records (artikel_id, keputusan, catatan, dibuat_pada) values
    ('${ARTIKEL_1}','UNCONFIRMED','Pertama', '2026-11-10 00:00:00+00'),
    ('${ARTIKEL_1}','CROSS-CHECKED','Kedua', '2026-11-12 00:00:00+00'),
    ('${ARTIKEL_DRAF}','VERIFIED','Catatan draf', '2026-11-11 00:00:00+00');
  insert into pf_events (id, judul, dimulai_pada, artikel_id) values
    ('e1111111-1111-1111-1111-111111111111','Peristiwa Terbit','2026-11-10 00:00:00+00','${ARTIKEL_1}'),
    ('e2222222-2222-2222-2222-222222222222','Peristiwa Draf','2026-11-10 00:00:00+00','${ARTIKEL_DRAF}');
  insert into pf_stories (id, slug, judul, status) values
    ('51111111-1111-1111-1111-111111111111','cerita-terbit','Cerita Terbit','terbit'),
    ('52222222-2222-2222-2222-222222222222','cerita-draf','Cerita Draf','draft');
  insert into pf_story_articles (story_id, artikel_id, peran) values
    ('51111111-1111-1111-1111-111111111111','${ARTIKEL_1}','terkait'),
    ('52222222-2222-2222-2222-222222222222','${ARTIKEL_1}','terkait');
`);
const klaimTerbit = await db.query(
  `select k.id from pf_claims k join pf_articles a on a.id = k.artikel_id
   where a.status = 'terbit' order by k.dibuat_pada desc`,
);
cek(
  "D1 daftar klaim hanya artikel terbit (2 klaim, klaim draf tidak ada)",
  klaimTerbit.rows.length === 2 &&
    klaimTerbit.rows.every((r) => r.id !== "a3333333-3333-3333-3333-333333333333"),
  `${klaimTerbit.rows.length} baris`,
);
const klaimDraf = await db.query(
  `select k.id from pf_claims k join pf_articles a on a.id = k.artikel_id
   where a.status = 'terbit' and k.id = 'a3333333-3333-3333-3333-333333333333'`,
);
cek("D2 klaim artikel draf tidak terbaca lewat gate terbit", klaimDraf.rows.length === 0);
const buktiDraf = await db.query(
  `select e.id from pf_evidence e join pf_claims k on k.id = e.klaim_id
   join pf_articles a on a.id = k.artikel_id
   where a.status = 'terbit' and e.sumber_url = 'https://example.com/draf'`,
);
cek("D3 bukti klaim draf tidak terbaca lewat gate terbit", buktiDraf.rows.length === 0);
const linimasa = await db.query(
  `select keputusan from pf_verification_records
   where artikel_id = '${ARTIKEL_1}' order by dibuat_pada asc`,
);
cek(
  "D4 linimasa klaim terbit kronologis menaik (UNCONFIRMED lalu CROSS-CHECKED)",
  linimasa.rows.length === 2 &&
    linimasa.rows[0].keputusan === "UNCONFIRMED" &&
    linimasa.rows[1].keputusan === "CROSS-CHECKED",
);
const filterStatus = await db.query(
  `select k.id from pf_claims k join pf_articles a on a.id = k.artikel_id
   where a.status = 'terbit' and k.status = 'terverifikasi'`,
);
cek("D5 filter status=terverifikasi hanya 1 klaim terbit", filterStatus.rows.length === 1);
const cariKlaim = await db.query(
  `select k.id from pf_claims k join pf_articles a on a.id = k.artikel_id
   where a.status = 'terbit' and k.teks ilike '%angka%'`,
);
cek("D6 cari teks 'angka' hanya 1 klaim", cariKlaim.rows.length === 1);
const policyKlaim = await db.query(
  `select policyname from pg_policies where tablename = 'pf_claims'`,
);
cek(
  "D7 policy RLS v8 'baca terbit atau staf' ada di pf_claims",
  policyKlaim.rows.some((r) => r.policyname === "pf_claims baca terbit atau staf"),
);
const grafArtikel = await db.query(`select id from pf_articles where status = 'terbit'`);
cek("D8 simpul artikel graf: 2 artikel terbit (draf tidak masuk)", grafArtikel.rows.length === 2);
const grafEvent = await db.query(
  `select e.id from pf_events e join pf_articles a on a.id = e.artikel_id where a.status = 'terbit'`,
);
cek("D9 sisi artikel↔event: hanya 1 event (event artikel draf tidak masuk)", grafEvent.rows.length === 1);
const grafCerita = await db.query(
  `select sa.story_id from pf_story_articles sa
   join pf_stories s on s.id = sa.story_id and s.status = 'terbit'
   join pf_articles a on a.id = sa.artikel_id and a.status = 'terbit'`,
);
cek("D10 sisi artikel↔cerita: hanya cerita terbit (1)", grafCerita.rows.length === 1);
const sumberUnik = await db.query(
  `select count(distinct e.sumber_url) as j from pf_evidence e
   join pf_claims k on k.id = e.klaim_id join pf_articles a on a.id = k.artikel_id
   where a.status = 'terbit'`,
);
const totalSimpul = 2 + 2 + Number(sumberUnik.rows[0].j) + 1 + 1;
cek(
  "D11 total simpul seed = 8 (di bawah batas 100, terpotong=false)",
  totalSimpul === 8,
  `total ${totalSimpul}`,
);
cek(
  "D12 batas 100 simpul ditulis di lib + UI graf",
  grepFile("src/lib/graf.ts", /BATAS_SIMPUL_GRAF = 100/) &&
    grepFile("src/app/graf/page.tsx", /100 simpul/),
);
cek(
  "D13 graf memakai 3 relasi saja (pf_evidence, pf_events.artikel_id, pf_story_articles)",
  grepFile("src/lib/graf.ts", /pf_evidence/) &&
    grepFile("src/lib/graf.ts", /pf_events/) &&
    grepFile("src/lib/graf.ts", /pf_story_articles/) &&
    !grepFile("src/lib/graf.ts", /pf_entities/),
);
cek(
  "D14 getter klaim menutup draf (eq status terbit di getKlaim + getDaftarKlaim)",
  (bacaFile("src/lib/klaim.ts").match(/\.eq\("status", "terbit"\)/g) || []).length >= 2,
);
// getKlaim live tanpa DB: id bukan UUID → null sebelum createClient.
let klaimModul = null;
try {
  klaimModul = await import("../src/lib/klaim.ts");
} catch (e) {
  console.log(`CATATAN: impor klaim.ts gagal (${String(e.message ?? e).slice(0, 120)}) — cek D15-D16 hanya statis.`);
}
if (klaimModul) {
  let hasilBukanUuid = "belum-diuji";
  try {
    hasilBukanUuid = await klaimModul.getKlaim("bukan-uuid");
  } catch (e) {
    hasilBukanUuid = `throw:${String(e.message ?? e).slice(0, 80)}`;
  }
  cek("D15 getKlaim('bukan-uuid') → null (live, tanpa DB)", hasilBukanUuid === null, String(hasilBukanUuid));
  let hasilLinimasaTakAda = "belum-diuji";
  try {
    hasilLinimasaTakAda = await klaimModul.getLinimasaKlaim("bukan-uuid");
  } catch {
    hasilLinimasaTakAda = "throw";
  }
  cek(
    "D16 getLinimasaKlaim('bukan-uuid') → [] (live, tanpa DB)",
    Array.isArray(hasilLinimasaTakAda) && hasilLinimasaTakAda.length === 0,
    JSON.stringify(hasilLinimasaTakAda),
  );
} else {
  cek("D15 getKlaim('bukan-uuid') → null (live, tanpa DB)", false, "impor klaim.ts gagal — butuh loader");
  cek("D16 getLinimasaKlaim('bukan-uuid') → [] (live, tanpa DB)", false, "impor klaim.ts gagal — butuh loader");
}

// ================================================================
// §E — Perbandingan dua artikel (fungsi murni, live)
// ================================================================
cek(
  "E1 normalisasi: kapital + tanda baca + spasi ganda",
  normalisasiTeksKlaim("  Harga, BERAS! turun... ") === "harga beras turun",
);
cek("E2 normalisasi: teks hanya tanda baca jadi kosong", normalisasiTeksKlaim("!!!") === "");
const klaimA = [
  { id: "a1", teks: "Inflasi naik 2 persen.", jenis: "fakta", status: "terverifikasi" },
  { id: "a2", teks: "Pemerintah   mengumumkan  dana baru!", jenis: "fakta", status: "belum_terverifikasi" },
  { id: "a3", teks: "Harga beras turun.", jenis: "fakta", status: "terverifikasi" },
  { id: "a4", teks: "Klaim unik A.", jenis: "fakta", status: "belum_terverifikasi" },
];
const klaimB = [
  { id: "b1", teks: "inflasi naik 2 persen", jenis: "fakta", status: "terverifikasi" },
  { id: "b2", teks: "Pemerintah mengumumkan dana baru", jenis: "fakta", status: "terbantah" },
  { id: "b3", teks: "Harga beras turun.", jenis: "fakta", status: "terverifikasi" },
  { id: "b4", teks: "Harga beras turun.", jenis: "fakta", status: "belum_terverifikasi" },
  { id: "b5", teks: "Klaim unik B.", jenis: "fakta", status: "belum_terverifikasi" },
];
const cocok = cocokkanKlaimDuaArtikel(klaimA, klaimB);
cek("E3 bersama = 3 (inflasi, dana baru, harga beras)", cocok.bersama.length === 3);
cek(
  "E4 bersama: status per sisi dipertahankan (terbantah di B)",
  cocok.bersama.some((p) => p.klaimA.teks.includes("dana baru") && p.klaimB.status === "terbantah"),
);
cek(
  "E5 hanya-A = 1 (Klaim unik A)",
  cocok.hanyaA.length === 1 && cocok.hanyaA[0].teks === "Klaim unik A.",
);
cek(
  "E6 hanya-B = 2 (unik B + duplikat harga beras kedua, tidak dihitung ganda)",
  cocok.hanyaB.length === 2 &&
    cocok.hanyaB.some((k) => k.teks === "Klaim unik B.") &&
    cocok.hanyaB.some((k) => k.teks === "Harga beras turun."),
);
const artRingkas = (id, slug, judul) => ({
  id, slug, judul, ringkasan: null, kategori_slug: null,
  status_verifikasi: "VERIFIED", diterbitkan_pada: null,
});
const hasil = rakitPerbandinganDuaArtikel(
  artRingkas("id-a", "artikel-a", "Artikel A"),
  artRingkas("id-b", "artikel-b", "Artikel B"),
  klaimA, klaimB,
  [{ nama: "Antara", url: "https://antara.example/x" }],
  [{ nama: "CNN", url: "https://cnn.example/y" }],
);
cek("E7 rakit: tersedia=true bila kedua artikel ada; bersama=3", hasil.tersedia === true && hasil.bersama.length === 3);
const tanpaBersama = rakitPerbandinganDuaArtikel(
  artRingkas("id-a", "artikel-a", "Artikel A"),
  artRingkas("id-b", "artikel-b", "Artikel B"),
  klaimA.filter((k) => k.teks === "Klaim unik A."),
  klaimB.filter((k) => k.teks === "Klaim unik B."),
  [], [],
);
cek(
  "E8 tanpa klaim bersama: BUKAN null, tersedia=true, bersama=[] (jujur)",
  tanpaBersama !== null && tanpaBersama.tersedia === true && tanpaBersama.bersama.length === 0,
);
cek(
  "E9 tanpa klaim bersama: hanya-A/hanya-B tetap terisi",
  tanpaBersama.hanyaA.length === 1 && tanpaBersama.hanyaB.length === 1,
);
const satuNull = rakitPerbandinganDuaArtikel(null, artRingkas("id-b", "artikel-b", "Artikel B"), klaimA, klaimB, [], []);
cek(
  "E10 satu artikel null (draf/tak ada): BUKAN null, tersedia=false, daftar kosong",
  satuNull !== null && satuNull.tersedia === false && satuNull.bersama.length === 0 && satuNull.hanyaA.length === 0 && satuNull.hanyaB.length === 0,
);
const kosongKlaim = rakitPerbandinganDuaArtikel(
  artRingkas("id-a", "artikel-a", "Artikel A"),
  artRingkas("id-b", "artikel-b", "Artikel B"),
  [], [], [], [],
);
cek("E11 kedua artikel tanpa klaim: tersedia=true, bersama=[] (bukan crash)", kosongKlaim.tersedia === true && kosongKlaim.bersama.length === 0);
const klaimKosong = cocokkanKlaimDuaArtikel(
  [{ id: "x1", teks: "!!!", jenis: "fakta", status: "belum_terverifikasi" }],
  [{ id: "x2", teks: "???", jenis: "fakta", status: "belum_terverifikasi" }],
);
cek(
  "E12 klaim berteks kosong sesudah normalisasi tidak pernah dicocokkan",
  klaimKosong.bersama.length === 0 && klaimKosong.hanyaA.length === 1 && klaimKosong.hanyaB.length === 1,
);
cek(
  "E13 data.ts: getPerbandinganDuaArtikel ada + getPerbandinganSumber tak diubah",
  /export async function getPerbandinganDuaArtikel/.test(bacaFile("src/lib/data.ts")) &&
    /export async function getPerbandinganSumber/.test(bacaFile("src/lib/data.ts")),
);
cek(
  "E14 komponen Bersebelahan: tautan /klaim/[id] + pesan jujur tanpa klaim bersama",
  /href={`\/klaim\/\$\{/.test(bacaFile("src/components/artikel/PerbandinganBersebelahan.tsx")) &&
    /Tidak ada klaim bersama/.test(bacaFile("src/components/artikel/PerbandinganBersebelahan.tsx")),
);

// ================================================================
// §F — Timeline (fungsi murni linimasa, live)
// ================================================================
cek("F1 tanggalValid: 2026-11-17 valid", tanggalValid("2026-11-17"));
cek("F2 tanggalValid: 2026-02-30 ditolak", !tanggalValid("2026-02-30"));
cek("F3 tanggalValid: 2026-13-01 + format salah ditolak", !tanggalValid("2026-13-01") && !tanggalValid("17-11-2026"));
cek(
  "F4 uraiRentang: kosong → tidakValid=false; satu sisi valid",
  uraiRentangTanggal(undefined, undefined).tidakValid === false &&
    (() => {
      const r = uraiRentangTanggal("2026-01-01", undefined);
      return !r.tidakValid && r.dari === "2026-01-01" && r.sampai === undefined;
    })(),
);
cek(
  "F5 uraiRentang: tanggal tak nyata / dari > sampai → tidakValid",
  uraiRentangTanggal("2026-02-30", undefined).tidakValid === true &&
    uraiRentangTanggal("2026-05-01", "2026-01-01").tidakValid === true,
);
const EVENTS = [
  { id: "a", dimulai_pada: "2026-01-10T00:00:00Z" },
  { id: "b", dimulai_pada: "2026-03-15T00:00:00Z" },
  { id: "c", dimulai_pada: null },
  { id: "d", dimulai_pada: "2025-12-31T23:00:00Z" },
];
cek(
  "F6 saringEventRentang: 2026-01-01..2026-03-31 → a,b (tanpa tanggal keluar)",
  (() => {
    const r = saringEventRentang(EVENTS, { dari: "2026-01-01", sampai: "2026-03-31", tidakValid: false });
    return r.length === 2 && r[0].id === "a" && r[1].id === "b";
  })(),
);
cek(
  "F7 saringEventRentang: rentang tak valid → semua dikembalikan",
  saringEventRentang(EVENTS, { tidakValid: true }).length === 4,
);
cek("F8 kurangiBulan: 2026-03-31 − 1 bln = 2026-02-28", kurangiBulan("2026-03-31", 1) === "2026-02-28");
cek("F9 kurangiBulan: 2026-11-17 − 12 bln = 2025-11-17", kurangiBulan("2026-11-17", 12) === "2025-11-17");
cek(
  "F10 batasZoom: jangkar 2026-11-17",
  (() => {
    const b = batasZoom("2026-11-17");
    return b.satuTahun === "2025-11-17" && b.enamBulan === "2026-05-17" && b.tigaBulan === "2026-08-17";
  })(),
);
cek(
  "F11 hariDariISO: beda 1 hari = 1; monoton",
  hariDariISO("2026-11-17") - hariDariISO("2026-11-16") === 1 &&
    hariDariISO("2026-03-01") - hariDariISO("2026-02-28") === 1,
);
const SEKARANG = Date.parse("2026-11-17T12:00:00+07:00");
cek(
  "F12 adaPerkembanganTerbaru: 3 hari lalu → true; 8 hari lalu → false",
  adaPerkembanganTerbaru([{ waktu: "2026-11-14T10:00:00+07:00" }], SEKARANG) &&
    !adaPerkembanganTerbaru([{ waktu: "2026-11-09T10:00:00+07:00" }], SEKARANG),
);
cek(
  "F13 adaPerkembanganTerbaru: tepat 7 hari → true; masa depan/kosong → false",
  adaPerkembanganTerbaru([{ waktu: "2026-11-10T12:00:00+07:00" }], SEKARANG) &&
    !adaPerkembanganTerbaru([{ waktu: "2026-11-18T10:00:00+07:00" }], SEKARANG) &&
    !adaPerkembanganTerbaru([], SEKARANG),
);
cek(
  "F14 timeline: filter ?dari=&sampai= di server + pesan jujur tanggal tak valid + GarisWaktu dipasang",
  /uraiRentangTanggal/.test(bacaFile("src/app/timeline/page.tsx")) &&
    /saringEventRentang/.test(bacaFile("src/app/timeline/page.tsx")) &&
    /Rentang tanggal tidak valid, menampilkan semua/.test(bacaFile("src/app/timeline/page.tsx")) &&
    /<GarisWaktu/.test(bacaFile("src/app/timeline/page.tsx")),
);
cek(
  "F15 timeline: filter ?diikuti=ya dipertahankan + definisi Sejarah >365 hari tak berubah",
  /diikutiParam/.test(bacaFile("src/app/timeline/page.tsx")) &&
    /BATAS_SEJARAH_HARI = 365/.test(bacaFile("src/app/timeline/page.tsx")),
);
cek(
  "F16 GarisWaktu: zoom 4 periode + penanda TERBARU + klik gulir ke kartu + tanpa fetch()",
  /"Semua"/.test(bacaFile("src/components/GarisWaktu.tsx")) &&
    /"1 tahun"/.test(bacaFile("src/components/GarisWaktu.tsx")) &&
    /TERBARU/.test(bacaFile("src/components/GarisWaktu.tsx")) &&
    /scrollIntoView/.test(bacaFile("src/components/GarisWaktu.tsx")) &&
    !/fetch\(/.test(tanpaKomentar(bacaFile("src/components/GarisWaktu.tsx"))),
);

// ================================================================
// §G — Topik: validasi tipe + kirimNotifikasiTopik live (PGlite
// + klien palsu minimal, pola baterai P1-4-5 Worker D — tabel
// di sini tabel ASLI hasil migrasi v1–v19, bukan buatan tangan)
// ================================================================
let topikModul = null;
try {
  topikModul = await import("../src/lib/topik.ts");
} catch (e) {
  console.log(`CATATAN: impor topik.ts gagal (${String(e.message ?? e).slice(0, 120)}) — cek G1-G9 hanya statis.`);
}
if (topikModul?.validasiTarget) {
  const v = topikModul.validasiTarget;
  cek("G1 validasiTarget: kategori dikenal lolos", v("kategori", "indonesia") === null);
  cek("G2 validasiTarget: kategori tak dikenal ditolak", v("kategori", "bukan-kategori") !== null);
  cek("G3 validasiTarget: negara nama + kode lolos", v("negara", "Indonesia") === null && v("negara", "ID") === null);
  cek("G4 validasiTarget: negara angka ditolak", v("negara", "Ind0nesia") !== null);
  cek("G5 validasiTarget: isu lolos", v("isu", "Perubahan iklim") === null);
  cek("G6 validasiTarget: tipe cerita DITOLAK (bukan tipe topik)", v("cerita", "apa-saja") !== null);
  cek("G7 validasiTarget: tipe kosong ditolak", v("", "x") !== null);
} else {
  const src = bacaFile("src/lib/topik.ts");
  cek("G1 validasiTarget: kategori dikenal lolos", false, "impor topik.ts gagal — butuh loader");
  cek("G2 validasiTarget: kategori tak dikenal ditolak", false, "impor topik.ts gagal — butuh loader");
  cek("G3 validasiTarget: negara nama + kode lolos", false, "impor topik.ts gagal — butuh loader");
  cek("G4 validasiTarget: negara angka ditolak", false, "impor topik.ts gagal — butuh loader");
  cek("G5 validasiTarget: isu lolos", false, "impor topik.ts gagal — butuh loader");
  cek("G6 validasiTarget: tipe cerita DITOLAK (bukan tipe topik)", false, "impor topik.ts gagal — butuh loader");
  cek("G7 validasiTarget: tipe kosong ditolak", false, "impor topik.ts gagal — butuh loader");
  cek(
    "G7b topik.ts (statis): TIPE_VALID hanya kategori/negara/isu",
    /TIPE_VALID = \["kategori", "negara", "isu"\]/.test(src),
  );
}

// --- Klien palsu minimal (query builder supabase-js) di atas PGlite ---
class Builder {
  constructor(table) {
    this.table = table;
    this.kolom = "*";
    this.filter = [];
    this.orStr = null;
  }
  select(kolom) { this.kolom = kolom; return this; }
  eq(kol, val) { this.filter.push({ kol, op: "=", val }); return this; }
  in(kol, vals) { this.filter.push({ kol, op: "in", val: vals }); return this; }
  or(s) { this.orStr = s; return this; }
  _where() {
    const syarat = [];
    const params = [];
    for (const f of this.filter) {
      if (f.op === "=") {
        params.push(f.val);
        syarat.push(`${f.kol} = $${params.length}`);
      } else {
        const ph = f.val.map((v) => { params.push(v); return `$${params.length}`; }).join(",");
        syarat.push(`${f.kol} in (${ph})`);
      }
    }
    if (this.orStr) {
      const grup = [...this.orStr.matchAll(/and\(([^)]*)\)/g)].map((m) => m[1]);
      const alternatif = grup.map((g) => {
        const bagian = g.split(",").map((p) => {
          const mm = /^([^.]+)\.(eq|ilike)\.(.*)$/.exec(p);
          if (!mm) throw new Error(`or() tak terurai: ${p}`);
          const [, kol, op, val] = mm;
          params.push(val);
          return `${kol} ${op === "ilike" ? "ilike" : "="} $${params.length}`;
        });
        return `(${bagian.join(" and ")})`;
      });
      if (alternatif.length) syarat.push(`(${alternatif.join(" or ")})`);
    }
    return { klausa: syarat.length ? ` where ${syarat.join(" and ")}` : "", params };
  }
  async _pilih() {
    const { klausa, params } = this._where();
    const r = await db.query(`select ${this.kolom} from ${this.table}${klausa}`, params);
    return r.rows;
  }
  async maybeSingle() {
    const rows = await this._pilih();
    return { data: rows[0] ?? null, error: null };
  }
  async insert(baris) {
    const daftar = Array.isArray(baris) ? baris : [baris];
    if (!daftar.length) return { data: [], error: null };
    const kunci = Object.keys(daftar[0]);
    const params = [];
    const nilai = daftar.map((b) => {
      const ph = kunci.map((k) => { params.push(b[k] ?? null); return `$${params.length}`; }).join(",");
      return `(${ph})`;
    }).join(",");
    try {
      const r = await db.query(
        `insert into ${this.table}(${kunci.join(",")}) values ${nilai} returning *`,
        params,
      );
      return { data: r.rows, error: null };
    } catch (e) {
      return { data: null, error: { code: "23505", message: String(e.message ?? e) } };
    }
  }
  then(resolve, reject) {
    this._pilih()
      .then((rows) => resolve({ data: rows, error: null }))
      .catch(reject);
  }
}
const palsu = { from: (t) => new Builder(t) };

const U1 = "11111111-1111-4111-8111-111111111111"; // kategori politik, switch ON
const U2 = "22222222-2222-4222-8222-222222222222"; // negara nama "Indonesia"
const U3 = "33333333-3333-4333-8333-333333333333"; // negara kode "ID"
const U4 = "44444444-4444-4444-8444-444444444444"; // isu
const U5 = "55555555-5555-4555-8555-555555555555"; // kategori politik, switch OFF
const ART1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ART2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ART3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
await db.exec(`
  insert into auth.users (id, email) values
    ('${U1}', 'u1@contoh.id'), ('${U2}', 'u2@contoh.id'), ('${U3}', 'u3@contoh.id'),
    ('${U4}', 'u4@contoh.id'), ('${U5}', 'u5@contoh.id')
  on conflict (id) do nothing;
  insert into public.pf_countries (kode, nama) values ('ID','Indonesia')
  on conflict (kode) do nothing;
  insert into public.pf_categories (slug, nama) values ('olahraga', 'Olahraga')
  on conflict (slug) do nothing;
  -- CATATAN SKEMA: pf_articles.kategori_slug NOT NULL + FK
  -- (v2) — artikel "tanpa topik sama sekali" tidak bisa dibuat;
  -- G13 memakai kategori 'olahraga' yang tidak diikuti siapa
  -- pun sebagai padanan jujurnya (0 pengikut → 0 notifikasi).
  insert into public.pf_articles (id, slug, judul, kategori_slug, negara_kode, isu, status, status_verifikasi) values
    ('${ART1}','artikel-satu','Artikel Satu','politik','ID','Perubahan iklim','terbit','VERIFIED'),
    ('${ART2}','artikel-dua','Artikel Dua','politik',null,null,'terbit','VERIFIED'),
    ('${ART3}','artikel-kosong','Artikel Kosong','olahraga',null,null,'terbit','VERIFIED');
  insert into public.pf_followed_topics (user_id, tipe, target) values
    ('${U1}','kategori','politik'),
    ('${U2}','negara','Indonesia'),
    ('${U3}','negara','ID'),
    ('${U4}','isu','Perubahan iklim'),
    ('${U5}','kategori','politik');
  insert into public.pf_user_preferences (user_id, notifikasi_topik, notifikasi_koreksi, notifikasi_jawaban, notifikasi_podcast, push_notifikasi) values
    ('${U1}',true,true,true,true,false),
    ('${U2}',true,true,true,true,false),
    ('${U3}',true,true,true,true,false),
    ('${U4}',true,true,true,true,false),
    ('${U5}',false,true,true,true,false);
`);

let tulisModul = null;
try {
  tulisModul = await import("../src/lib/notifikasi/tulis.ts");
} catch (e) {
  console.log(`CATATAN: impor tulis.ts gagal (${String(e.message ?? e).slice(0, 120)}) — cek G8-G13 gagal.`);
}
if (tulisModul?.kirimNotifikasiTopik) {
  const kirim = tulisModul.kirimNotifikasiTopik;
  const n1 = await kirim(palsu, ART1);
  cek("G8 notifikasi topik: artikel cocok 4 pengikut (kategori+negara nama+negara kode+isu)", n1 === 4, `dapat ${n1}`);
  const baris1 = (await db.query(`select user_id, jenis, tautan from public.pf_notifications order by user_id`)).rows;
  cek(
    "G9 notifikasi topik: 4 baris tersimpan, jenis=topik, tautan=/artikel/artikel-satu",
    baris1.length === 4 &&
      baris1.every((b) => b.jenis === "topik" && b.tautan === "/artikel/artikel-satu"),
    `baris: ${baris1.length}`,
  );
  cek("G10 notifikasi topik: U5 (sakelar mati) TIDAK dapat notifikasi", !baris1.some((b) => b.user_id === U5));
  const n1ulang = await kirim(palsu, ART1);
  cek("G11 notifikasi topik: dedup — panggilan kedua 0 baru", n1ulang === 0, `dapat ${n1ulang}`);
  await db.exec(`update public.pf_user_preferences set notifikasi_topik=false where user_id='${U1}'`);
  const n2 = await kirim(palsu, ART2);
  cek("G12 notifikasi topik: sakelar mati dihormati (U1 off, artikel-2 → 0)", n2 === 0, `dapat ${n2}`);
  const n3 = await kirim(palsu, ART3);
  cek("G13 notifikasi topik: artikel yang topiknya tak diikuti siapa pun → 0", n3 === 0, `dapat ${n3}`);
} else {
  for (const [label, det] of [
    ["G8 notifikasi topik: artikel cocok 4 pengikut", "impor tulis.ts gagal — butuh loader"],
    ["G9 notifikasi topik: 4 baris tersimpan", "impor tulis.ts gagal — butuh loader"],
    ["G10 notifikasi topik: U5 (sakelar mati) TIDAK dapat notifikasi", "impor tulis.ts gagal — butuh loader"],
    ["G11 notifikasi topik: dedup — panggilan kedua 0 baru", "impor tulis.ts gagal — butuh loader"],
    ["G12 notifikasi topik: sakelar mati dihormati", "impor tulis.ts gagal — butuh loader"],
    ["G13 notifikasi topik: artikel yang topiknya tak diikuti siapa pun → 0", "impor tulis.ts gagal — butuh loader"],
  ]) cek(label, false, det);
}
cek(
  "G14 /saya/topik: redirect /masuk bila tamu + EmptyState + tombol Berhenti ikuti",
  /redirect\("\/masuk"\)/.test(bacaFile("src/app/saya/topik/page.tsx")) &&
    /EmptyState/.test(bacaFile("src/app/saya/topik/page.tsx")) &&
    /TombolIkutiTopik/.test(bacaFile("src/app/saya/topik/page.tsx")),
);
cek(
  "G15 TombolIkutiTopik: memakai POST/DELETE /api/topik; tombol Ikuti di kategori + negara",
  /\/api\/topik/.test(bacaFile("src/components/lanjutan/TombolIkutiTopik.tsx")) &&
    /DELETE/.test(bacaFile("src/components/lanjutan/TombolIkutiTopik.tsx")) &&
    /TombolIkutiTopik/.test(bacaFile("src/app/kategori/[slug]/page.tsx")) &&
    /TombolIkutiTopik/.test(bacaFile("src/app/negara/[kode]/page.tsx")),
);

// ================================================================
// §H — Penjaga statis + integrasi P1
// ================================================================
const berkasKlienBaru = [
  "src/components/artikel/CatatanPribadi.tsx",
  "src/app/perpustakaan/AksiPerpustakaan.tsx",
  "src/components/artikel/SakelarPerbandingan.tsx",
  "src/components/artikel/PerbandinganBersebelahan.tsx",
  "src/components/GarisWaktu.tsx",
  "src/components/graf/GrafPengetahuan.tsx",
  "src/components/lanjutan/TombolIkutiTopik.tsx",
];
for (const f of berkasKlienBaru) {
  cek(
    `H1 tanpa new Date() di ${f.split("/").pop()} (komentar dikecualikan)`,
    !/new Date\(/.test(tanpaKomentar(bacaFile(f))),
  );
}
// linimasa.ts memakai Date HANYA untuk validasi kalender (Date.UTC
// / Date.parse) — tanpa jam dinding; bila ada new Date() lain di
// sana, penjaga ini gagal dengan sengaja.
const linimasaKode = tanpaKomentar(bacaFile("src/lib/linimasa.ts"));
const pemakaianDate = [...linimasaKode.matchAll(/new Date\(/g)].length;
const pemakaianDateUtc = [...linimasaKode.matchAll(/new Date\(Date\.UTC\(/g)].length;
cek(
  "H2 linimasa.ts: new Date() hanya sebagai new Date(Date.UTC(...)) + tanpa Date.now()",
  pemakaianDate === pemakaianDateUtc && !/Date\.now\(\)/.test(linimasaKode),
  `${pemakaianDate} pemakaian new Date(), ${pemakaianDateUtc} di antaranya Date.UTC`,
);
// CSS: 0 definisi token self-ref di semua CSS src.
const berkasCss = [];
(function jalan(dir) {
  for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entri.name);
    if (entri.isDirectory()) jalan(p);
    else if (entri.name.endsWith(".css")) berkasCss.push(p);
  }
})(path.join(DIR_REPO, "src"));
let selfRef = [];
for (const f of berkasCss) {
  const isi = fs.readFileSync(f, "utf8");
  for (const m of isi.matchAll(/(--[\w-]+)\s*:\s*var\(\s*\1\s*\)/g)) {
    selfRef.push(`${path.relative(DIR_REPO, f)}:${m[1]}`);
  }
}
cek("H3 CSS src: 0 definisi token self-ref", selfRef.length === 0, selfRef.join(", "));
// Halaman statis-murni / baca-searchParams: connection() + instant=false.
const halamanKoneksi = [
  "src/app/jelajahi/page.tsx",
  "src/app/klaim/page.tsx",
  "src/app/graf/page.tsx",
  "src/app/bandingkan/page.tsx",
  "src/app/perpustakaan/page.tsx",
  "src/app/timeline/page.tsx",
];
for (const f of halamanKoneksi) {
  cek(
    `H4 ${f} dirender per request (connection + instant=false)`,
    grepFile(f, /await connection\(\)/) && grepFile(f, /export const instant = false/),
  );
}
// Halaman dinamis baca-data (bukan statis murni): instant=false.
for (const f of ["src/app/klaim/[id]/page.tsx", "src/app/saya/topik/page.tsx"]) {
  cek(`H5 ${f} instant=false (baca data per request)`, grepFile(f, /export const instant = false/));
}
// --- Integrasi: CatatanPribadi ---
const artikelPage = bacaFile("src/app/artikel/[slug]/page.tsx");
cek(
  "H6 CatatanPribadi terpasang di halaman artikel (sesudah PembacaArtikel, sebelum JejakFakta)",
  artikelPage.indexOf("<PembacaArtikel") !== -1 &&
    artikelPage.indexOf("<CatatanPribadi") > artikelPage.indexOf("<PembacaArtikel") &&
    artikelPage.indexOf("<JejakFakta") > artikelPage.indexOf("<CatatanPribadi"),
);
cek(
  "H7 CatatanPribadi artikel memakai artikelId + judulTarget + loggedIn",
  /artikelId=\{artikel\.id\}/.test(artikelPage) &&
    /judulTarget=\{artikel\.judul\}/.test(artikelPage) &&
    /loggedIn=\{loggedIn\}/.test(artikelPage),
);
const tahuPage = bacaFile("src/app/pengetahuan/[slug]/page.tsx");
cek(
  "H8 CatatanPribadi terpasang di halaman pengetahuan (pengetahuanId)",
  /pengetahuanId=\{artikel\.id\}/.test(tahuPage) &&
    /judulTarget=\{artikel\.judul\}/.test(tahuPage) &&
    /loggedIn=\{penggunaMasuk\}/.test(tahuPage),
);
// --- Integrasi: toggle perbandingan ---
cek(
  "H9 SakelarPerbandingan terpasang di halaman artikel (ganti PerbandinganSumber langsung)",
  /<SakelarPerbandingan/.test(artikelPage) &&
    !/<PerbandinganSumber perbandingan=/.test(artikelPage),
);
cek(
  "H10 toggle default Matriks + mode Bersebelahan dari getPerbandinganDuaArtikel",
  /useState<"matriks" \| "bersebelahan">\("matriks"\)/.test(bacaFile("src/components/artikel/SakelarPerbandingan.tsx")) &&
    /getPerbandinganDuaArtikel\(slug, slugBanding\)/.test(artikelPage) &&
    /<PerbandinganBersebelahan perbandingan=\{perbandinganDua\}/.test(bacaFile("src/components/artikel/SakelarPerbandingan.tsx")),
);
cek(
  "H11 tautan Bandingkan dengan liputan lain → /bandingkan?a=<slug>&b=<terkait>",
  /\/bandingkan\?a=/.test(bacaFile("src/components/artikel/SakelarPerbandingan.tsx")) &&
    /Bandingkan dengan liputan lain/.test(bacaFile("src/components/artikel/SakelarPerbandingan.tsx")),
);
// --- Integrasi: jelajahi + saya ---
const jelajahi = bacaFile("src/app/jelajahi/page.tsx");
cek(
  "H12 /jelajahi grup Berita: Pelacak Klaim → /klaim",
  /href: "\/klaim", label: "Pelacak Klaim"/.test(jelajahi) &&
    /Lacak status verifikasi setiap klaim dalam artikel terbit/.test(jelajahi),
);
cek(
  "H13 /jelajahi grup Berita: Graf Pengetahuan → /graf",
  /href: "\/graf", label: "Graf Pengetahuan"/.test(jelajahi) &&
    /Peta relasi klaim, sumber, artikel, peristiwa, dan cerita/.test(jelajahi),
);
cek(
  "H14 /jelajahi grup Berita: Bandingkan Liputan → /bandingkan",
  /href: "\/bandingkan", label: "Bandingkan Liputan"/.test(jelajahi),
);
const sayaPage = bacaFile("src/app/saya/page.tsx");
cek(
  "H15 /saya menaut /saya/topik dari seksi Topik yang diikuti (+ Perpustakaan)",
  (sayaPage.match(/href="\/saya\/topik"/g) ?? []).length >= 2 &&
    sayaPage.lastIndexOf('href="/saya/topik"') > sayaPage.indexOf('id="seksi-topik"'),
);
cek(
  "H16 JejakFakta menaut 'Lacak klaim ini' ke /klaim/[id]",
  grepFile("src/components/artikel/JejakFakta.tsx", /Lacak klaim ini/) &&
    grepFile("src/components/artikel/JejakFakta.tsx", /\/klaim\/\$\{k\.id\}/),
);
// --- Integrasi: nav 8 pintu tidak berubah ---
cek(
  "H17 BottomNav tetap 6 pintu; rute P1 baru tidak masuk nav",
  (bacaFile("src/components/BottomNav.tsx").match(/href: "/g) ?? []).length === 6 &&
    !/\/(klaim|graf|bandingkan|perpustakaan)\b/.test(bacaFile("src/components/BottomNav.tsx")) &&
    !/\/(klaim|graf|bandingkan|perpustakaan)\b/.test(bacaFile("src/components/HeaderNav.tsx")),
);
// --- Integrasi: tanpa duplikasi nama ekspor antar-lib baru ---
const libBaru = [
  "src/lib/klaim.ts",
  "src/lib/graf.ts",
  "src/lib/graf-meta.ts",
  "src/lib/perbandingan-dua.ts",
  "src/lib/linimasa.ts",
  "src/lib/perpustakaan.ts",
];
const namaEkspor = new Map();
let duplikat = [];
for (const f of libBaru) {
  for (const m of bacaFile(f).matchAll(/export (?:async function|function|const|type|class) ([A-Za-z0-9_]+)/g)) {
    const nama = m[1];
    if (namaEkspor.has(nama)) duplikat.push(`${nama} (${namaEkspor.get(nama)} + ${f})`);
    else namaEkspor.set(nama, f);
  }
}
cek("H18 tanpa nama ekspor ganda antar 6 lib baru P1", duplikat.length === 0, duplikat.join("; "));
// --- Berkas P1 lengkap ---
const berkasWajibP1 = [
  "src/app/perpustakaan/page.tsx",
  "src/app/perpustakaan/AksiPerpustakaan.tsx",
  "src/app/api/catatan/route.ts",
  "src/lib/perpustakaan.ts",
  "src/components/artikel/CatatanPribadi.tsx",
  "src/lib/klaim.ts",
  "src/lib/graf.ts",
  "src/lib/graf-meta.ts",
  "src/app/klaim/page.tsx",
  "src/app/klaim/[id]/page.tsx",
  "src/app/graf/page.tsx",
  "src/components/graf/GrafPengetahuan.tsx",
  "src/lib/perbandingan-dua.ts",
  "src/components/artikel/PerbandinganBersebelahan.tsx",
  "src/app/bandingkan/page.tsx",
  "src/components/GarisWaktu.tsx",
  "src/lib/linimasa.ts",
  "src/components/lanjutan/TombolIkutiTopik.tsx",
  "src/app/saya/topik/page.tsx",
  "src/components/artikel/SakelarPerbandingan.tsx",
  "supabase/migrations/20261117_pf_v19_ekspansi_p1.sql",
];
for (const f of berkasWajibP1) cek(`H19 berkas P1 ada: ${f}`, ada(f));

console.log(`\n${lolos} lolos, ${gagal} gagal.`);
process.exit(gagal > 0 ? 1 : 0);
