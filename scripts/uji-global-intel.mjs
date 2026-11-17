// Baterai konsolidasi integrasi "Global News Intelligence 24/7"
// PRATA FAKTA (integrator, 17 Nov 2026) — HANYA titik integrasi
// antar-paket A–I, BUKAN duplikasi isi baterai per-paket.
// PGlite in-memory + impor live + grep statis — aman, tidak
// menyentuh DB produksi. Keluar 0 bila semua asersi lolos,
// 1 bila ada yang gagal.
//
// CARA JALAN (wajib, dari akar repo):
//   node --experimental-strip-types scripts/jalankan-baterai.mjs scripts/uji-global-intel.mjs
// (JANGAN --import loader: di Node 24.22.1 --import TIDAK
// mendaftarkan hook resolve sehingga impor @/ crash di §B;
// module.register() lewat jalankan-baterai.mjs adalah jalurnya.)
//
// YANG DIUJI:
//   §A  Migrasi v1–v26 diterapkan BERURUTAN di PGlite (25 berkas,
//       v20 memang tidak ada) + v22–v25 diulang (idempoten):
//       68 tabel pf_*, RLS 68/68, CHECK v22 31 nilai (semua
//       diterima incl. quality_check + analysis; nilai liar
//       ditolak), kolom v23, tabel v24/v25/v19.
//   §B  Wiring pipeline.ts (live, mock adapter in-memory):
//       2 item judul identik tier-1 -> VERIFIED + 2 draf;
//       baris run 'quality_check' + 'analysis' HARFIAH tercatat;
//       baris run auto_publish tercatat (TIDAK PERNAH diterbitkan
//       di baterai: tanpa service key, percobaan gagal sebelum
//       gate; dengan service key pun gate menolak jujur karena
//       artikel mock tidak ada di DB admin. Yang diuji: wiring
//       terpanggil + hasil TERCATAT, bukan penerbitan).
//   §C  Fallback pra-v22 (live, mock adapter yang menolak
//       'quality_check'/'analysis' dengan galat CHECK 23514):
//       baris tercatat ulang agen 'editorial_quality' +
//       detail.langkah 'quality_check' dan agen
//       'article_writing' + detail.langkah 'analysis'; draf
//       tetap dibuat (fallback tidak menggagalkan item).
//   §D  window.confirm — INVENTARIS BEKU (bukan 0 literal):
//       TombolAksi.tsx SUDAH Radix di main (PR #7, merge
//       d626cbb) — tanpa window.confirm — + 5 pemakaian
//       window.confirm( yang DIKETAHUI (akademi 2,
//       TabelPengguna 1, FormStrukturAkademi 2) — pemakaian
//       BARU di luar inventaris = GAGAL.
//       DialogKonfirmasi.tsx ada, dipakai 3 halaman admin, dan
//       tidak memanggil window.confirm( sendiri.
//   §E  Backup mencakup semua tabel migrasi: TABEL_PF di
//       scripts/backup-pf.mjs SAMA PERSIS dengan CREATE TABLE
//       di migrasi v1–v25 (68/68, tanpa selisih dua arah).
//   §F  Perbaikan temuan G/H: guard `if (!tujuan)` -> 400 di
//       POST /api/admin/sistem/jobs/[nama]; klaster diteruskan
//       route /api/ingestion/jalankan; angka CUTOVER §2.1 +
//       §10 + §11 kini 68 tabel (baris per versi dipertahankan).
//   §G  Regresi K2 quality-check (temuan integrator): angka
//       berpemisah ("Rp 16.500", "2,5") TERTELUSUR ke klaim;
//       angka yang benar-benar tanpa sumber tetap ditolak.
//   §H  Regresi PGRST108 ambilAntrean (run #27/#28, 17 Nov 2026):
//       PostgREST menolak .order by foreignTable bila tabel asing
//       tidak di-embed di select — select kandidat WAJIB meng-embed
//       pf_sources(prioritas); satu-satunya pemakaian foreignTable
//       di src/ ada di supabase-adapter.ts.
//   §I  Push notifications (Tugas 1, v26, 17 Nov 2026): migrasi
//       v26 melonggarkan user_id pf_push_subscriptions (tamu NULL)
//       + policy tamu, idempoten; route subscribe tamu validasi
//       ketat + service client + rate limit keras + TIDAK percaya
//       userId klien; route broadcast HANYA super_admin +
//       setVapidDetails malas di dalam handler; sw.js tetap cache
//       offline + handler push ber-ikon; kunci publik VAPID
//       punya fallback NEXT_PUBLIC_*.
//
// BATAS UJI YANG JUJUR:
// - "0 window.confirm di jalur admin" TIDAK BISA ditegakkan
//   literal: TombolAksi.tsx sudah Radix (PR #7, di main) dan
//   5 pemakaian lain di aksi admin (akademi/TabelPengguna/
//   FormStrukturAkademi) belum dikonversi. §D menegakkan
//   "tidak ada window.confirm BARU" sebagai pengganti yang
//   jujur; konversi sisa dicatat tindak lanjut, bukan
//   disembunyikan.
// - Auto-publish TIDAK dieksekusi di sini (tidak ada penerbitan
//   nyata): mock artikel tidak ada di DB admin, jadi gate
//   menolak. Uji penerbitan nyata milik verifikasi live.
// - RLS diuji lewat hitungan pg_tables.rowsecurity, bukan JWT
//   Supabase asli (pola baterai lama).
// - Migrasi TIDAK diterapkan ke produksi di sini; yang diuji
//   urutan + isi berkas di PGlite.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const requirePglite = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = requirePglite("@electric-sql/pglite");

const DIR_REPO = new URL("../", import.meta.url).pathname;
const DIR_MIGRASI = path.join(DIR_REPO, "supabase/migrations");
const DIR_SRC = path.join(DIR_REPO, "src");

let lolos = 0;
let gagal = 0;
function cek(label, kondisi, detail = "") {
  if (kondisi) {
    lolos += 1;
    console.log(`OK: ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    gagal += 1;
    console.log(`GAGAL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function baca(relatif) {
  return fs.readFileSync(path.join(DIR_REPO, relatif), "utf8");
}
function bacaMigrasi(nama) {
  let sql = fs.readFileSync(path.join(DIR_MIGRASI, nama), "utf8");
  sql = sql.replace(/create extension[^;]+;/gi, "-- ekstensi dilepas (PGlite)");
  sql = sql.replace(/\bcitext\b/gi, "text");
  return sql;
}

// ---------- §A: migrasi v1–v26 berurutan di PGlite ----------

const DAFTAR_MIGRASI = fs
  .readdirSync(DIR_MIGRASI)
  .filter((f) => f.endsWith(".sql"))
  // Urutan KRONOLOGIS per nomor versi — sort leksikografis SALAH
  // (menaruh v10 sebelum v1: "v1_" > "v10" karena '_' > '0').
  .sort((a, b) => {
    const va = Number(/_pf_v(\d+)_/.exec(a)?.[1] ?? 0);
    const vb = Number(/_pf_v(\d+)_/.exec(b)?.[1] ?? 0);
    return va - vb;
  });
const VERSI_MIGRASI = DAFTAR_MIGRASI.map(
  (f) => Number(/_pf_v(\d+)_/.exec(f)?.[1] ?? 0),
);
cek(
  "A0 urutan migrasi: 25 berkas v1–v26, v20 memang tidak ada",
  DAFTAR_MIGRASI.length === 25 &&
    JSON.stringify(VERSI_MIGRASI) ===
      JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26]),
  `versi: ${VERSI_MIGRASI.join(",")}`,
);

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
let migrasiGagal = "";
for (const nama of DAFTAR_MIGRASI) {
  try {
    await db.exec(bacaMigrasi(nama));
  } catch (e) {
    migrasiOk = false;
    migrasiGagal = `${nama}: ${String(e.message).split("\n")[0]}`;
    break;
  }
}
cek("A1 migrasi v1–v26 diterapkan BERURUTAN tanpa error", migrasiOk, migrasiGagal);

let idempotenOk = true;
let idempotenGagal = "";
if (migrasiOk) {
  for (const nama of DAFTAR_MIGRASI.filter((f) => /_pf_v2[2-5]_/.test(f))) {
    try {
      await db.exec(bacaMigrasi(nama));
    } catch (e) {
      idempotenOk = false;
      idempotenGagal = `${nama}: ${String(e.message).split("\n")[0]}`;
      break;
    }
  }
}
cek("A2 migrasi v22–v25 idempoten (putaran ke-2 tanpa error)", idempotenOk, idempotenGagal);

if (migrasiOk) {
  const jmlTabel = await db.query(
    `select count(*) as n from pg_tables where schemaname = 'public' and tablename like 'pf_%'`,
  );
  cek("A3 jumlah tabel pf_* = 68", Number(jmlTabel.rows[0].n) === 68, `${jmlTabel.rows[0].n} tabel`);
  const jmlRls = await db.query(
    `select count(*) as n from pg_tables where schemaname = 'public' and tablename like 'pf_%' and rowsecurity`,
  );
  cek("A4 tabel ber-RLS = 68/68", Number(jmlRls.rows[0].n) === 68, `${jmlRls.rows[0].n}/68`);
  const cekV22 = await db.query(
    `select pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.pf_ai_runs'::regclass and conname = 'pf_ai_runs_agen_check_v22'`,
  );
  const defV22 = cekV22.rows[0]?.def ?? "";
  const nilaiV22 = (defV22.match(/'[^']+'/g) ?? []).length;
  cek(
    "A5 CHECK pf_ai_runs_agen_check_v22 ada, 31 nilai incl. quality_check + analysis",
    cekV22.rows.length === 1 &&
      nilaiV22 === 31 &&
      defV22.includes("'quality_check'") &&
      defV22.includes("'analysis'"),
    `${nilaiV22} nilai`,
  );
  const cekV8 = await db.query(
    `select count(*) as n from pg_constraint where conrelid = 'public.pf_ai_runs'::regclass and conname = 'pf_ai_runs_agen_check_v8'`,
  );
  cek("A6 CHECK v8 sudah diganti (tidak ada lagi)", Number(cekV8.rows[0].n) === 0);
  // Insert live: tiap nilai baru diterima, nilai liar ditolak.
  let terimaSemua = true;
  for (const agen of ["quality_check", "analysis", "comparison", "ingestion"]) {
    try {
      await db.query(`insert into public.pf_ai_runs (agen) values ('${agen}')`);
    } catch {
      terimaSemua = false;
    }
  }
  let tolakLiar = false;
  try {
    await db.query(`insert into public.pf_ai_runs (agen) values ('agen_liar')`);
  } catch {
    tolakLiar = true;
  }
  cek("A7 insert agen v22 (quality_check/analysis/comparison/ingestion) diterima", terimaSemua);
  cek("A8 insert agen liar ditolak CHECK v22", tolakLiar);
  const kolomV23 = await db.query(
    `select count(*) as n from information_schema.columns where table_schema = 'public' and table_name = 'pf_raw_items' and column_name = 'diproses_pada'`,
  );
  cek("A9 kolom v23 pf_raw_items.diproses_pada ada", Number(kolomV23.rows[0].n) === 1);
  for (const tabel of [
    "pf_article_comparisons",
    "pf_editorial_locks",
    "pf_item_clusters",
    "pf_item_cluster_members",
    "pf_alerts",
    "pf_notes",
  ]) {
    const ada = await db.query(
      `select count(*) as n from pg_tables where schemaname = 'public' and tablename = '${tabel}'`,
    );
    cek(`A10 tabel ${tabel} ada`, Number(ada.rows[0].n) === 1);
  }
}

// ---------- §B + §C: wiring pipeline live (mock adapter) ----------

const { jalankanPipelineEditorial } = await import(
  "../src/lib/ai/pipeline.ts"
);

const SUMBER_A = { id: "00000000-0000-0000-0000-0000000000a1", nama: "Antara", prioritas: 100 };
const SUMBER_B = { id: "00000000-0000-0000-0000-0000000000b2", nama: "CNN Indonesia", prioritas: 90 };
const JUDUL_SAMA = "Pemerintah salurkan bantuan pangan kepada warga Jakarta";
const SEKARANG_ISO = new Date().toISOString();
function buatItem(id, sumber) {
  return {
    id,
    sumber_id: sumber.id,
    sumber_nama: sumber.nama,
    sumber_prioritas: sumber.prioritas,
    url: `https://contoh.test/berita/${id.slice(-4)}`,
    judul: JUDUL_SAMA,
    ringkasan:
      "Pemerintah menyalurkan bantuan pangan kepada warga Jakarta melalui program baru.",
    isi_ringkas: "",
    penulis: null,
    waktu_terbit_asli: SEKARANG_ISO,
    waktu_diambil: SEKARANG_ISO,
    status: "baru",
    disalin_dari_id: null,
    metadata: null,
  };
}

/** Mock AiAdapter in-memory. `tolakCheckUntuk`: agen yang
 *  catatRun-nya melempar galat CHECK 23514 (simulasi DB pra-v22). */
function buatMockAdapter(tolakCheckUntuk = new Set()) {
  const runs = [];
  const artikel = [];
  const statusItem = new Map();
  let n = 0;
  const idBaru = () => {
    n += 1;
    return `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  };
  const sumber = new Map([
    [SUMBER_A.id, SUMBER_A],
    [SUMBER_B.id, SUMBER_B],
  ]);
  return {
    runs,
    artikel,
    statusItem,
    async ambilWaktuAntreanTertua() {
      return null;
    },
    async ambilAntrean() {
      return [buatItem("00000000-0000-0000-0000-000000000101", SUMBER_A), buatItem("00000000-0000-0000-0000-000000000102", SUMBER_B)];
    },
    async ambilSumber(id) {
      return sumber.get(id) ?? null;
    },
    async ambilItemSerupa(hash, kecualikanId) {
      const semua = [
        buatItem("00000000-0000-0000-0000-000000000101", SUMBER_A),
        buatItem("00000000-0000-0000-0000-000000000102", SUMBER_B),
      ];
      return semua
        .filter((i) => i.id !== kecualikanId)
        .map((i) => ({
          id: i.id,
          sumber_id: i.sumber_id,
          url: i.url,
          judul: i.judul,
          ringkasan: i.ringkasan,
          waktu_terbit_asli: i.waktu_terbit_asli,
          disalin_dari_id: i.disalin_dari_id,
        }));
    },
    async cariKlaimSerupa() {
      return [];
    },
    async cariKlaimSama() {
      return null;
    },
    async simpanKlaim() {
      return idBaru();
    },
    async simpanBukti() {},
    async cariBuktiSama() {
      return false;
    },
    async simpanVerification() {
      return idBaru();
    },
    async perbaruiStatusItem(id, status) {
      statusItem.set(id, status);
    },
    async simpanArtikel(d) {
      const id = idBaru();
      artikel.push({ id, ...d });
      return id;
    },
    async cariArtikelUntukItem() {
      return null;
    },
    async simpanMetadataItem() {},
    async catatRun(run) {
      if (tolakCheckUntuk.has(run.agen)) {
        throw new Error(
          `catatRun gagal: new row for relation "pf_ai_runs" violates check constraint "pf_ai_runs_agen_check_v8"`,
        );
      }
      const id = idBaru();
      runs.push({ id, ...run, tutup: null });
      return id;
    },
    async tutupRun(runId, patch) {
      const r = runs.find((x) => x.id === runId);
      if (r) r.tutup = patch;
    },
  };
}

const fetchGagal = async () => {
  throw new Error("tanpa jaringan di baterai");
};

// Run B1: DB pasca-v22 (agen harfiah diterima).
const mockB1 = buatMockAdapter();
const hasilB1 = await jalankanPipelineEditorial(mockB1, {
  dipicu_oleh: "manual",
  fetchFn: fetchGagal,
  rekonsiliasi: false,
});
cek("B1 pipeline: 2 item VERIFIED + 2 draf", hasilB1.draf === 2 && hasilB1.terverifikasi === 2, JSON.stringify(hasilB1));
const agenB1 = mockB1.runs.map((r) => r.agen);
cek(
  "B2 baris run agen harfiah 'quality_check' tercatat",
  agenB1.includes("quality_check"),
  `agen: ${[...new Set(agenB1)].join(",")}`,
);
cek(
  "B3 baris run agen harfiah 'analysis' tercatat",
  agenB1.includes("analysis"),
  `agen: ${[...new Set(agenB1)].join(",")}`,
);
const autoB1 = mockB1.runs.filter((r) => r.tutup?.detail?.langkah === "auto_publish");
cek(
  "B4 baris run auto_publish tercatat (TIDAK PERNAH diterbitkan di baterai)",
  autoB1.length === 2 &&
    autoB1.every((r) => r.tutup.detail.diterbitkan !== true) &&
    // Dua hasil jujur yang mungkin di baterai (tanpa service key):
    // 'gagal' (baca flag/service key gagal sebelum gate) atau
    // 'dilewati' (gate menolak: artikel mock tidak ada di DB admin).
    autoB1.every((r) => r.tutup.status === "gagal" || r.tutup.status === "dilewati"),
  `${autoB1.length} baris: ${autoB1.map((r) => `${r.tutup.status}/${String(r.tutup.detail.diterbitkan)}`).join(", ")}`,
);
cek(
  "B5 skor auto-publish dihitung dari jalur pipeline-native (draf, bukan perbandingan terbit)",
  autoB1.length === 2 && autoB1.every((r) => r.tutup.detail.sumber_skor === "pipeline"),
  autoB1.map((r) => String(r.tutup.detail.sumber_skor)).join(","),
);
cek(
  "B6 status item jadi VERIFIED (wiring tidak mengubah keputusan)",
  mockB1.statusItem.get("00000000-0000-0000-0000-000000000101") === "VERIFIED" &&
    mockB1.statusItem.get("00000000-0000-0000-0000-000000000102") === "VERIFIED",
);

// Run C1: DB pra-v22 (agen harfiah ditolak CHECK) -> fallback.
const mockC1 = buatMockAdapter(new Set(["quality_check", "analysis"]));
const hasilC1 = await jalankanPipelineEditorial(mockC1, {
  dipicu_oleh: "manual",
  fetchFn: fetchGagal,
  rekonsiliasi: false,
});
cek("C1 pipeline pra-v22: 2 draf tetap dibuat (fallback tidak menggagalkan item)", hasilC1.draf === 2, JSON.stringify(hasilC1));
const qcFallback = mockC1.runs.filter(
  (r) => r.agen === "editorial_quality" && r.tutup?.detail?.langkah === "quality_check",
);
cek("C2 quality_check jatuh ke agen 'editorial_quality' + detail.langkah", qcFallback.length === 2, `${qcFallback.length} baris`);
const anFallback = mockC1.runs.filter(
  (r) => r.agen === "article_writing" && r.tutup?.detail?.langkah === "analysis",
);
cek("C3 analysis jatuh ke agen 'article_writing' + detail.langkah", anFallback.length === 2, `${anFallback.length} baris`);
cek(
  "C4 TIDAK ADA baris agen harfiah 'quality_check'/'analysis' pada run pra-v22",
  !mockC1.runs.some((r) => r.agen === "quality_check" || r.agen === "analysis"),
);

// ---------- §D: window.confirm — inventaris beku ----------
// Di main (pasca-PR #9), TombolAksi.tsx adalah versi Radix dari
// PR #7 — tanpa window.confirm. D1 menegakkan itu (bukan lagi
// "identik de2f062", yang hanya berlaku di branch PR #9).

const tombolAksiTanpaConfirm =
  pemakaianConfirm("src/components/admin/TombolAksi.tsx").length === 0;
cek(
  "D1 TombolAksi.tsx sudah Radix (tanpa window.confirm)",
  tombolAksiTanpaConfirm,
);

function pemakaianConfirm(relatif) {
  const isi = baca(relatif);
  const baris = isi.split("\n");
  const hasil = [];
  baris.forEach((teks, i) => {
    if (/window\.confirm\s*\(/.test(teks)) hasil.push(`${relatif}:${i + 1}`);
  });
  return hasil;
}
const INVENTARIS_BEKU = new Set([
  "src/app/admin/akademi/page.tsx:364",
  "src/app/admin/akademi/page.tsx:389",
  "src/components/admin/TabelPengguna.tsx:184",
  "src/components/admin/FormStrukturAkademi.tsx:221",
  "src/components/admin/FormStrukturAkademi.tsx:237",
]);
const semuaConfirm = [];
for (const f of [
  "src/components/admin/TombolAksi.tsx",
  "src/app/admin/akademi/page.tsx",
  "src/app/admin/pengetahuan/page.tsx",
  "src/app/admin/podcast/page.tsx",
  "src/components/admin/TabelPengguna.tsx",
  "src/components/admin/FormStrukturAkademi.tsx",
  "src/components/admin/DialogKonfirmasi.tsx",
  "src/app/admin/page.tsx",
  "src/app/admin/kendali/page.tsx",
  "src/app/admin/ops/page.tsx",
]) {
  semuaConfirm.push(...pemakaianConfirm(f));
}
const diLuarInventaris = semuaConfirm.filter((x) => !INVENTARIS_BEKU.has(x));
const hilangDariInventaris = [...INVENTARIS_BEKU].filter((x) => !semuaConfirm.includes(x));
cek(
  "D2 window.confirm di jalur admin = inventaris beku (5 pemakaian, 0 baru)",
  diLuarInventaris.length === 0 && hilangDariInventaris.length === 0,
  diLuarInventaris.length > 0
    ? `BARU: ${diLuarInventaris.join(", ")}`
    : hilangDariInventaris.length > 0
      ? `HILANG (mungkin sudah dikonversi — perbarui inventaris): ${hilangDariInventaris.join(", ")}`
      : "5/5 cocok",
);
cek(
  "D3 DialogKonfirmasi.tsx ada + tidak memanggil window.confirm(",
  fs.existsSync(path.join(DIR_SRC, "components/admin/DialogKonfirmasi.tsx")) &&
    pemakaianConfirm("src/components/admin/DialogKonfirmasi.tsx").length === 0,
);
for (const halaman of [
  "src/app/admin/akademi/page.tsx",
  "src/app/admin/pengetahuan/page.tsx",
  "src/app/admin/podcast/page.tsx",
]) {
  const isi = baca(halaman);
  cek(
    `D4 ${halaman} memakai DialogKonfirmasi`,
    isi.includes('from "@/components/admin/DialogKonfirmasi"') &&
      isi.includes("<DialogKonfirmasi"),
  );
}

// ---------- §E: backup mencakup semua tabel migrasi ----------

const isiBackup = baca("scripts/backup-pf.mjs");
const daftarBackup = new Set(
  [...isiBackup.matchAll(/"(pf_[a-z0-9_]+)"/g)].map((m) => m[1]),
);
const daftarMigrasi = new Set();
for (const nama of DAFTAR_MIGRASI) {
  const sql = fs.readFileSync(path.join(DIR_MIGRASI, nama), "utf8");
  for (const m of sql.matchAll(/create table if not exists public\.(pf_[a-z0-9_]+)/gi)) {
    daftarMigrasi.add(m[1]);
  }
  for (const m of sql.matchAll(/create table public\.(pf_[a-z0-9_]+)/gi)) {
    daftarMigrasi.add(m[1]);
  }
}
const hanyaMigrasi = [...daftarMigrasi].filter((t) => !daftarBackup.has(t));
const hanyaBackup = [...daftarBackup].filter((t) => !daftarMigrasi.has(t));
cek(
  "E1 TABEL_PF backup = CREATE TABLE migrasi (68/68, tanpa selisih)",
  daftarBackup.size === 68 && daftarMigrasi.size === 68 && hanyaMigrasi.length === 0 && hanyaBackup.length === 0,
  hanyaMigrasi.length > 0
    ? `tidak di-backup: ${hanyaMigrasi.join(", ")}`
    : hanyaBackup.length > 0
      ? `di-backup tanpa migrasi: ${hanyaBackup.join(", ")}`
      : "68/68",
);
for (const tabel of [
  "pf_article_comparisons",
  "pf_editorial_locks",
  "pf_item_clusters",
  "pf_item_cluster_members",
  "pf_alerts",
  "pf_notes",
]) {
  cek(`E2 backup mencakup ${tabel} (v19/v22/v24/v25)`, daftarBackup.has(tabel));
}

// ---------- §F: perbaikan temuan G/H + wiring statis ----------

const pipeline = baca("src/lib/ai/pipeline.ts");
cek("F1 pipeline memanggil periksaKualitasKlaimDraf (quality_check)", pipeline.includes("periksaKualitasKlaimDraf"));
cek("F2 pipeline memanggil sintesis5W1H (analysis)", pipeline.includes("sintesis5W1H"));
cek("F3 pipeline memanggil terbitkanOtomatis (auto-publish)", pipeline.includes("terbitkanOtomatis"));
cek("F4 pipeline memakai jalankanLangkahAgenBaru (literal + fallback)", pipeline.includes("jalankanLangkahAgenBaru"));
cek(
  "F5 urutan wiring: analysis + quality_check SEBELUM simpanArtikel, auto-publish SESUDAH langkah 9",
  pipeline.indexOf("6b. Analysis") > 0 &&
    pipeline.indexOf("6b. Analysis") < pipeline.indexOf("6c. Quality check") &&
    pipeline.indexOf("6c. Quality check") < pipeline.indexOf("adapter.simpanArtikel(draf)") &&
    pipeline.indexOf("adapter.simpanArtikel(draf)") < pipeline.indexOf("10. Auto-publish"),
);
cek(
  "F6 fallback mendeteksi penolakan CHECK (23514 / violates check constraint)",
  pipeline.includes("23514") && pipeline.includes("violates check constraint"),
);
cek(
  "F7 AgenAi bertipe harfiah 'quality_check' + 'analysis' (types.ts)",
  baca("src/lib/ai/types.ts").includes('"quality_check"') &&
    baca("src/lib/ai/types.ts").includes('"analysis"'),
);
const routeJobs = baca("src/app/api/admin/sistem/jobs/[nama]/route.ts");
cek(
  "F8 guard jobs: `if (!tujuan)` -> 400 jujur untuk job tanpa endpoint pemicu",
  routeJobs.includes("if (!tujuan)") && routeJobs.includes("status: 400"),
);
const routeIngestion = baca("src/app/api/ingestion/jalankan/route.ts");
cek("F9 route ingestion meneruskan klaster ke respons", routeIngestion.includes("klaster: hasil.klaster"));
const cutover = baca("supabase/CUTOVER.md");
cek(
  "F10 CUTOVER §2.1: backup 68 tabel (bukan 37)",
  cutover.includes("SEMUA **68 tabel"),
);
cek(
  "F11 CUTOVER §10: backup pasca-migrasi 68/68 tabel",
  cutover.includes("backup pasca-migrasi (68/68 tabel)"),
);
cek(
  "F12 CUTOVER §10: baris per versi dipertahankan (v8 tetap 37 — sejarah, bukan angka berjalan)",
  cutover.includes("§3B: v8 + verifikasi (37 tabel"),
);

// ---------- §G: regresi K2 — angka berpemisah tertelusur ----------

const { periksaKualitasKlaimDraf } = await import(
  "../src/lib/ai/quality-check.ts"
);
const { susunDrafArtikel } = await import("../src/lib/ai/writing.ts");
const ITEM_G = {
  id: "00000000-0000-0000-0000-000000000201",
  sumber_id: SUMBER_A.id,
  sumber_nama: "Antara",
  sumber_prioritas: 100,
  url: "https://contoh.test/g/1",
  judul: "Bank Indonesia Tahan Suku Bunga Acuan di Level Lima Persen",
  ringkasan:
    "Bank Indonesia menahan suku bunga acuan di level 5 persen. Rupiah berada di Rp 16.500 per dolar.",
  isi_ringkas: "",
  penulis: null,
  waktu_terbit_asli: SEKARANG_ISO,
  waktu_diambil: SEKARANG_ISO,
  status: "baru",
  disalin_dari_id: null,
  metadata: null,
};
const KLAIM_G = [
  { teks: ITEM_G.judul, jenis: "fakta" },
  { teks: "Bank Indonesia menahan suku bunga acuan di level 5 persen.", jenis: "angka" },
  { teks: "Rupiah berada di Rp 16.500 per dolar.", jenis: "angka" },
  { teks: "Inflasi tahunan tercatat 2,5 persen.", jenis: "angka" },
];
const drafG = susunDrafArtikel({
  item: ITEM_G,
  klaim: KLAIM_G,
  ringkasan: ITEM_G.ringkasan,
  keputusan: "VERIFIED",
  sumber: [{ nama: "Antara", url: "https://contoh.test/g/1" }],
});
const buktiG = KLAIM_G.map((k) => ({
  klaim_teks: k.teks,
  sumber_url: "https://contoh.test/g/1",
  kutipan: null,
}));
const qcG = periksaKualitasKlaimDraf({
  judul: drafG.judul,
  ringkasan: drafG.ringkasan,
  isi: drafG.isi,
  fakta: drafG.fakta_penting,
  sumber: [{ nama: "Antara", url: "https://contoh.test/g/1" }],
  klaim: KLAIM_G,
  evidence: buktiG,
  tanggalDiketahui: [ITEM_G.waktu_terbit_asli],
});
cek(
  "G1 QC lolos untuk draf berisi Rp 16.500 + 5 persen + 2,5 persen (angka berpemisah tertelusur)",
  qcG.lolos,
  JSON.stringify(qcG.pelanggaran),
);
const qcGBuruk = periksaKualitasKlaimDraf({
  judul: drafG.judul,
  ringkasan: drafG.ringkasan,
  isi: drafG.isi.replace(
    "Fakta utama:",
    "Fakta utama:\n- Harga emas naik 99 persen.",
  ),
  fakta: [...(drafG.fakta_penting ?? []), "Harga emas naik 99 persen."],
  sumber: [{ nama: "Antara", url: "https://contoh.test/g/1" }],
  klaim: KLAIM_G,
  evidence: buktiG,
  tanggalDiketahui: [ITEM_G.waktu_terbit_asli],
});
cek(
  "G2 QC tetap menolak angka yang benar-benar tanpa sumber (99 persen)",
  !qcGBuruk.lolos &&
    qcGBuruk.pelanggaran.some((p) => p.kode === "angka_tanpa_sumber"),
  JSON.stringify(qcGBuruk.pelanggaran.map((p) => p.kode)),
);
// G3: angka dari NAMA sumber di pembuka ("NT3 Tier Satu A"
// mengandung "3") bukan angka faktual — QC tidak boleh
// menolaknya (regresi tahapE F5 run 2).
const drafG3 = susunDrafArtikel({
  item: { ...ITEM_G, sumber_nama: "NT3 Tier Satu A" },
  klaim: KLAIM_G,
  ringkasan: ITEM_G.ringkasan,
  keputusan: "VERIFIED",
  sumber: [{ nama: "NT3 Tier Satu A", url: "https://contoh.test/g/1" }],
});
const qcG3 = periksaKualitasKlaimDraf({
  judul: drafG3.judul,
  ringkasan: drafG3.ringkasan,
  isi: drafG3.isi,
  fakta: drafG3.fakta_penting,
  sumber: [{ nama: "NT3 Tier Satu A", url: "https://contoh.test/g/1" }],
  klaim: KLAIM_G,
  evidence: buktiG,
  tanggalDiketahui: [ITEM_G.waktu_terbit_asli],
});
cek(
  "G3 QC lolos untuk draf dari sumber bernama berangka (NT3 di pembuka bukan angka faktual)",
  qcG3.lolos,
  JSON.stringify(qcG3.pelanggaran),
);

// ---------- §H: regresi PGRST108 ambilAntrean (run #27/#28) ----------
// PostgREST: .order("prioritas", { foreignTable: "pf_sources" })
// tanpa pf_sources di-embed di select -> PGRST108 "'pf_sources'
// is not an embedded resource in this request" -> HTTP 500 di
// /api/ai/jalankan (terbukti ulang via REST anon 17 Nov 2026:
// order-tanpa-embed gagal PGRST108, select-dengan-embed sah).
// Penjaga statis: select kandidat WAJIB meng-embed
// pf_sources(prioritas), dan tidak boleh ada pemakaian
// foreignTable lain di src/ yang luput dari aturan ini.
const adapterTeks = baca("src/lib/ai/supabase-adapter.ts");
cek(
  "H1 Select kandidat ambilAntrean meng-embed pf_sources(prioritas) — order by foreignTable tanpa embed = PGRST108 + HTTP 500",
  adapterTeks.includes('"id, pf_sources(prioritas)"'),
  "tanpa embed, PostgREST menolak order prioritas sumber",
);
cek(
  "H2 Select baris penuh ambilAntrean meng-embed pf_sources(nama, prioritas)",
  adapterTeks.includes("pf_sources(nama, prioritas)"),
);
function daftarTs(dir) {
  const hasil = [];
  for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
    const penuh = path.join(dir, entri.name);
    if (entri.isDirectory()) hasil.push(...daftarTs(penuh));
    else if (/\.tsx?$/.test(entri.name)) hasil.push(penuh);
  }
  return hasil;
}
const pemakaiForeignTable = [];
for (const berkas of daftarTs(DIR_SRC)) {
  const teks = fs.readFileSync(berkas, "utf8");
  if (teks.includes("foreignTable")) {
    pemakaiForeignTable.push(path.relative(DIR_REPO, berkas));
  }
}
cek(
  "H3 Satu-satunya pemakaian foreignTable di src/ ada di supabase-adapter.ts (yang sudah di-embed)",
  pemakaiForeignTable.length === 1 &&
    pemakaiForeignTable[0] === "src/lib/ai/supabase-adapter.ts",
  pemakaiForeignTable.join(", ") || "tidak ada",
);

// ---------- §I: push notifications (Tugas 1, v26) ----------
// Tabel pf_push_subscriptions milik v14 (user_id NOT NULL,
// RLS pemilik). v26 HANYA melonggarkan user_id (tamu NULL) +
// policy insert tamu — TIDAK membuat tabel baru (jumlah tabel
// tetap 68, §A3/§E tidak berubah). Route subscribe tamu TIDAK
// BOLEH percaya userId dari klien (menempel ke id orang lain =
// menerima notifikasinya); user_id dari SESI atau NULL.
// Broadcast HANYA super_admin + setVapidDetails MALAS di dalam
// handler (bukan di lingkup modul dengan string kosong).
console.log("\n--- §I push notifications (v26) ---");
{
  const sql26 = baca("supabase/migrations/20261117_pf_v26_push_subscriptions.sql");
  cek(
    "I1 v26 melonggarkan user_id pf_push_subscriptions + policy tamu (bukan membuat tabel baru)",
    sql26.includes("pf_push_subscriptions") &&
      sql26.includes("drop not null") &&
      sql26.includes("tambah tamu") &&
      sql26.includes("enable row level security") &&
      !/create table/i.test(sql26),
    "v26 harus ALTER-only (tabel milik v14)",
  );
  // Idempoten: jalankan v26 dua kali di PGlite §A (yang sudah
  // menerapkannya sekali) + user_id jadi nullable.
  let v26Ok = true;
  let v26Gagal = "";
  try {
    await db.exec(bacaMigrasi("20261117_pf_v26_push_subscriptions.sql"));
    await db.exec(bacaMigrasi("20261117_pf_v26_push_subscriptions.sql"));
  } catch (e) {
    v26Ok = false;
    v26Gagal = String(e.message).split("\n")[0];
  }
  cek("I2 v26 idempoten (putaran ke-2 + ke-3 tanpa error)", v26Ok, v26Gagal);
  if (v26Ok) {
    const nullable = await db.query(
      `select is_nullable from information_schema.columns where table_name = 'pf_push_subscriptions' and column_name = 'user_id'`,
    );
    cek(
      "I3 user_id pf_push_subscriptions nullable sesudah v26 (tamu NULL)",
      nullable.rows[0]?.is_nullable === "YES",
      String(nullable.rows[0]?.is_nullable ?? "?"),
    );
    const policies = await db.query(
      `select policyname from pg_policies where tablename = 'pf_push_subscriptions'`,
    );
    cek(
      "I4 pf_push_subscriptions punya 5 policy (4 pemilik v14 + tambah tamu)",
      policies.rows.length === 5 &&
        policies.rows.some((r) => r.policyname === "pf_push_subscriptions tambah tamu"),
      policies.rows.map((r) => r.policyname).join(", "),
    );
  }
  const routeLanggananTamu = baca("src/app/api/notifications/subscribe/route.ts");
  cek(
    "I5 route subscribe tamu memvalidasi endpoint https + p256dh/auth",
    routeLanggananTamu.includes("^https:") &&
      routeLanggananTamu.includes("p256dh") &&
      routeLanggananTamu.includes("length > 300"),
  );
  cek(
    "I6 route subscribe tamu memakai service client + upsert onConflict endpoint + rate limit KERAS",
    routeLanggananTamu.includes("cobaServiceClient()") &&
      routeLanggananTamu.includes('onConflict: "endpoint"') &&
      routeLanggananTamu.includes("buatRateLimiterKeras(30)"),
  );
  cek(
    "I7 route subscribe tamu TIDAK percaya userId klien (user_id dari sesi atau NULL)",
    !routeLanggananTamu.includes("userId"),
    "userId klien = menempel ke akun orang lain",
  );
  const routeKirim = baca("src/app/api/admin/notifikasi/kirim/route.ts");
  cek(
    "I8 route broadcast HANYA super_admin (autentikasiAdmin + ROLES.SUPER_ADMIN)",
    routeKirim.includes("autentikasiAdmin(req, ROLES.SUPER_ADMIN)"),
  );
  const idxPost = routeKirim.indexOf("export async function POST");
  const idxSet = routeKirim.indexOf("setVapidDetails(");
  cek(
    "I9 setVapidDetails MALAS di dalam handler POST (bukan lingkup modul)",
    idxPost > 0 && idxSet > idxPost,
    "setVapidDetails di luar handler = init dengan string kosong",
  );
  cek(
    "I10 broadcast 503 jujur bila VAPID belum terkonfigurasi + hitung sukses nyata (bukan jumlah baris)",
    routeKirim.includes("status: 503") &&
      routeKirim.includes("Push belum terkonfigurasi") &&
      routeKirim.includes("broadcasted: terkirim") &&
      routeKirim.includes("Promise.allSettled"),
  );
  cek(
    "I11 broadcast menghapus subscriber mati (410/404) + validasi url same-origin",
    routeKirim.includes("410") &&
      routeKirim.includes("404") &&
      routeKirim.includes('startsWith("//")'),
  );
  const sw = baca("public/sw.js");
  cek(
    "I12 sw.js: handler push ber-ikon (/icons/icon-512.png) + cache offline utuh + notificationclick",
    sw.includes('icon: "/icons/icon-512.png"') &&
      sw.includes("prata-fakta-v1") &&
      sw.includes("notificationclick") &&
      !sw.includes('"/icon.png"'),
    "ikon /icon.png tidak ada — wajib /icons/icon-512.png",
  );
  const pushLib = baca("src/lib/notifikasi/push.ts");
  cek(
    "I13 kunci publik VAPID punya fallback NEXT_PUBLIC_* (server tetap jalan dengan kunci .env.local)",
    pushLib.includes("NEXT_PUBLIC_VAPID_PUBLIC_KEY") &&
      pushLib.includes("ambilKunciPublikVapid"),
  );
  const pengalih = baca("src/app/saya/notifikasi/PengalihPush.tsx");
  const libKlien = baca("src/lib/notifikasi-push.ts");
  cek(
    "I14 PengalihPush memakai lib klien (aktifkanPush/matikanPush), bukan fetch inline ke langganan lama",
    pengalih.includes("@/lib/notifikasi-push") &&
      pengalih.includes("aktifkanPush()") &&
      pengalih.includes("matikanPush()") &&
      !pengalih.includes("api/push/langganan"),
  );
  cek(
    "I15 lib klien subscribe ke /api/notifications/subscribe (bukan /api/push/langganan)",
    libKlien.includes("/api/notifications/subscribe") &&
      !libKlien.includes("/api/push/langganan"),
  );
  // Form broadcast admin (17 Nov 2026, lanjut Tugas 1): sebelum ini
  // broadcast HANYA bisa lewat API — tidak ada UI sama sekali, jadi
  // admin tidak bisa mengirim broadcast tanpa curl.
  const formBroadcast = baca("src/components/admin/FormBroadcast.tsx");
  cek(
    "I16 form broadcast POST ke /api/admin/notifikasi/kirim + uji ke /api/push/uji, konfirmasi Radix (tanpa window.confirm)",
    formBroadcast.includes("/api/admin/notifikasi/kirim") &&
      formBroadcast.includes("/api/push/uji") &&
      formBroadcast.includes("DialogKonfirmasi") &&
      !formBroadcast.includes("window.confirm") &&
      formBroadcast.includes("broadcasted"),
  );
  const halamanNotifikasi = baca("src/app/admin/notifikasi/page.tsx");
  cek(
    "I17 halaman /admin/notifikasi guard super_admin + hitung langganan via service client + instant=false",
    halamanNotifikasi.includes("super_admin") &&
      halamanNotifikasi.includes("cobaServiceClient") &&
      halamanNotifikasi.includes("pf_push_subscriptions") &&
      halamanNotifikasi.includes("instant = false"),
  );
  const navAdmin = baca("src/components/admin/NavAdmin.tsx");
  cek(
    "I18 NavAdmin menautkan /admin/notifikasi (grup Kendali)",
    navAdmin.includes('"/admin/notifikasi"'),
  );
}

console.log(`\nRINGKASAN global-intel: ${lolos} lolos, ${gagal} gagal.`);
if (gagal > 0) process.exit(1);
