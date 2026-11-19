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
//   §A  Migrasi v1–v27 diterapkan BERURUTAN di PGlite (26 berkas,
//       v20 memang tidak ada) + v22–v27 diulang (idempoten):
//       69 tabel pf_*, RLS 69/69, CHECK v22 31 nilai (semua
//       diterima incl. quality_check + analysis; nilai liar
//       ditolak), kolom v23, tabel v24/v25/v19, tabel v27.
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
//   §D  window.confirm — NOL di jalur admin (v27, 18 Nov 2026):
//       TombolAksi.tsx SUDAH Radix di main (PR #7, merge
//       d626cbb) — tanpa window.confirm — dan 5 pemakaian
//       terakhir yang DIKETAHUI (akademi 2, TabelPengguna 1,
//       FormStrukturAkademi 2) dikonversi ke DialogKonfirmasi
//       Radix. Pemakaian window.confirm( APAPUN di jalur admin
//       = GAGAL. Komentar yang menyebut nama fungsi tanpa
//       memanggilnya tidak dihitung (pola regex butuh "(").
//       DialogKonfirmasi.tsx ada, dipakai 6 halaman/komponen
//       admin, dan tidak memanggil window.confirm( sendiri.
//   §E  Backup mencakup semua tabel migrasi: TABEL_PF di
//       scripts/backup-pf.mjs SAMA PERSIS dengan CREATE TABLE
//       di migrasi v1–v27 (69/69). pf_push_deliveries (v27)
//       masuk TABEL_PF sesudah migrasi v27 diterapkan di
//       produksi 18 Nov 2026 — tabel yang migrasinya belum
//       diterapkan akan gagal 404 dan membuat backup exit 1.
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
// - "0 window.confirm di jalur admin" DITEGAKKAN literal sejak
//   v27 (18 Nov 2026): kelima pemakaian terakhir dikonversi ke
//   DialogKonfirmasi Radix; §D gagal bila ada satu pun
//   pemanggilan window.confirm( di berkas admin yang dipindai.
//   Komentar yang menyebut nama fungsi tanpa "(" tidak dihitung.
// - Auto-publish TIDAK dieksekusi di sini (tidak ada penerbitan
//   nyata): mock artikel tidak ada di DB admin, jadi gate
//   menolak. Uji penerbitan nyata milik verifikasi live.
// - RLS diuji lewat hitungan pg_tables.rowsecurity, bukan JWT
//   Supabase asli (pola baterai lama).
// - Migrasi TIDAK diterapkan ke produksi di sini; yang diuji
//   urutan + isi berkas di PGlite.
import fs from "node:fs";
import path from "node:path";

import { PGlite } from "./butuh-pglite.mjs";

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

// ---------- §A: migrasi v1–v28 berurutan di PGlite ----------
// v28 TIDAK diterapkan di loop §A (butuh skema cron/pg_net/Vault
// asli) — §1–§3 live di uji-migrasi-v28.mjs, §4 statis di §T.

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
  "A0 urutan migrasi: 28 berkas v1–v29, v20 memang tidak ada",
  DAFTAR_MIGRASI.length === 28 &&
    JSON.stringify(VERSI_MIGRASI) ===
      JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29]),
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
// v28 + v29 dilewati di sini (alasan di komentar §A di atas:
// keduanya punya §4 job pg_cron yang butuh skema cron/pg_net/
// Vault asli — §1–§3 v28 live di uji-migrasi-v28.mjs,
// §1–§3+§5 v29 live di uji-migrasi-v29.mjs).
const MIGRASI_TANPA_V28_V29 = DAFTAR_MIGRASI.filter(
  (f) => !/_pf_v28_/.test(f) && !/_pf_v29_/.test(f),
);
for (const nama of MIGRASI_TANPA_V28_V29) {
  try {
    await db.exec(bacaMigrasi(nama));
  } catch (e) {
    migrasiOk = false;
    migrasiGagal = `${nama}: ${String(e.message).split("\n")[0]}`;
    break;
  }
}
cek("A1 migrasi v1–v27 diterapkan BERURUTAN tanpa error (v28 diuji di uji-migrasi-v28.mjs, v29 di uji-migrasi-v29.mjs)", migrasiOk, migrasiGagal);

let idempotenOk = true;
let idempotenGagal = "";
if (migrasiOk) {
  for (const nama of DAFTAR_MIGRASI.filter((f) => /_pf_v2[2-7]_/.test(f))) {
    try {
      await db.exec(bacaMigrasi(nama));
    } catch (e) {
      idempotenOk = false;
      idempotenGagal = `${nama}: ${String(e.message).split("\n")[0]}`;
      break;
    }
  }
}
cek("A2 migrasi v22–v27 idempoten (putaran ke-2 tanpa error)", idempotenOk, idempotenGagal);

if (migrasiOk) {
  const jmlTabel = await db.query(
    `select count(*) as n from pg_tables where schemaname = 'public' and tablename like 'pf_%'`,
  );
  cek("A3 jumlah tabel pf_* = 69", Number(jmlTabel.rows[0].n) === 69, `${jmlTabel.rows[0].n} tabel`);
  const jmlRls = await db.query(
    `select count(*) as n from pg_tables where schemaname = 'public' and tablename like 'pf_%' and rowsecurity`,
  );
  cek("A4 tabel ber-RLS = 69/69", Number(jmlRls.rows[0].n) === 69, `${jmlRls.rows[0].n}/69`);
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

// ---------- §D: window.confirm — NOL di jalur admin ----------
// v27 (18 Nov 2026): kelima pemakaian terakhir dikonversi ke
// DialogKonfirmasi Radix — tidak ada lagi inventaris beku;
// pemakaian window.confirm( APAPUN di berkas admin yang dipindai
// = GAGAL.

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
cek(
  "D2 window.confirm di jalur admin = 0 pemakaian",
  semuaConfirm.length === 0,
  semuaConfirm.length > 0
    ? `MASIH ADA: ${semuaConfirm.join(", ")}`
    : "0/0 — kelima call site sudah DialogKonfirmasi",
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
// v27 diterapkan di produksi 18 Nov 2026 — tidak ada lagi
// pengecualian: TABEL_PF WAJIB sama persis dengan CREATE TABLE
// migrasi (69/69). Selisih apa pun = gagal.
cek(
  "E1 TABEL_PF backup = CREATE TABLE migrasi (69/69)",
  daftarBackup.size === 69 &&
    daftarMigrasi.size === 69 &&
    hanyaBackup.length === 0 &&
    hanyaMigrasi.length === 0,
  hanyaMigrasi.length > 0
    ? `tidak di-backup: ${hanyaMigrasi.join(", ")}`
    : hanyaBackup.length > 0
      ? `di-backup tanpa migrasi: ${hanyaBackup.join(", ")}`
      : "69/69",
);
for (const tabel of [
  "pf_article_comparisons",
  "pf_editorial_locks",
  "pf_item_clusters",
  "pf_item_cluster_members",
  "pf_alerts",
  "pf_notes",
  "pf_push_deliveries",
]) {
  cek(`E2 backup mencakup ${tabel} (v19/v22/v24/v25/v27)`, daftarBackup.has(tabel));
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
  // v29: hitung sukses nyata + Promise.allSettled kini di lib
  // bersama broadcast.ts (route hanya memetakan hasilnya:
  // broadcasted: hasil.terkirim).
  const broadcastLib = baca("src/lib/notifikasi/broadcast.ts");
  cek(
    "I10 broadcast 503 jujur bila VAPID belum terkonfigurasi + hitung sukses nyata (bukan jumlah baris)",
    routeKirim.includes("status: 503") &&
      routeKirim.includes("Push belum terkonfigurasi") &&
      routeKirim.includes("broadcasted: hasil.terkirim") &&
      broadcastLib.includes("Promise.allSettled"),
  );
  cek(
    "I11 broadcast menghapus subscriber mati (410/404) + validasi url same-origin",
    broadcastLib.includes("410") &&
      broadcastLib.includes("404") &&
      broadcastLib.includes('startsWith("//")'),
  );
  const sw = baca("public/sw.js");
  cek(
    "I12 sw.js: handler push ber-ikon (/icons/icon-512.png) + cache offline utuh + notificationclick",
    sw.includes('icon: "/icons/icon-512.png"') &&
      sw.includes("prata-fakta-v2") &&
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

// ---------- §J: pipeline parsial tidak gagalkan run (v27) ----------
// Run #31 (44197264506, 18 Nov 2026): SATU panggilan gagal (ok:false)
// menghentikan SELURUH run padahal 4 dari 5 panggilan berhasil —
// loop lama `exit 1` tepat sesudah panggilan gagal. Sejak v27,
// panggilan gagal dicatat (PANGGILAN_GAGAL) + dilewati (continue);
// run hanya gagal bila tidak satu pun item diproses atau ada item
// gagal per-item (assert TOTAL_GAGAL, desain F5, dipertahankan).
console.log("\n--- §J pipeline parsial (v27, run #31) ---");
{
  const yml = baca(".github/workflows/editorial-pipeline.yml");
  cek(
    "J1 workflow menghitung PANGGILAN_GAGAL (bukan exit 1 langsung)",
    yml.includes("PANGGILAN_GAGAL=0") &&
      yml.includes("PANGGILAN_GAGAL=$((PANGGILAN_GAGAL + 1))"),
  );
  cek(
    "J2 panggilan curl gagal -> PERINGATAN + continue (loop lanjut)",
    yml.includes("if ! curl --fail-with-body") &&
      yml.includes("PERINGATAN: pipeline panggilan") &&
      yml.includes("continue"),
  );
  cek(
    "J3 panggilan ok != true -> dilewati + continue (bukan exit 1)",
    yml.includes("if ! jq -e '.ok == true'") &&
      !yml.includes("melaporkan ok != true\"; exit 1"),
  );
  cek(
    "J4 assert TOTAL_GAGAL > 0 dipertahankan (F5: item gagal per-item tetap gagalkan run)",
    yml.includes('if [ "$TOTAL_GAGAL" -gt 0 ]'),
  );
  cek(
    "J5 run gagal bila tidak satu pun item diproses + ada panggilan gagal",
    yml.includes('if [ "$TOTAL_DIPROSES" -eq 0 ] && [ "$PANGGILAN_GAGAL" -gt 0 ]'),
  );
  cek(
    "J6 ringkasan run menampilkan panggilan_gagal",
    yml.includes("panggilan_gagal=$PANGGILAN_GAGAL"),
  );
}

// ---------- §K: Editorial Quality Center (v27) ----------
// Checklist pra-terbit di /admin/kualitas: 10 draf terbaru dinilai
// dari data DB (verifikasi + review + hard gates G1–G6). Halaman
// TIDAK menerbitkan — hanya menilai; null = tidak dapat dinilai.
console.log("\n--- §K Editorial Quality Center (v27) ---");
{
  const halamanKualitas = baca("src/app/admin/kualitas/page.tsx");
  const dataAdmin = baca("src/lib/admin/data.ts");
  cek(
    "K1 /admin/kualitas memuat seksi Checklist Pra-Terbit (getChecklistPraTerbit)",
    halamanKualitas.includes("getChecklistPraTerbit") &&
      halamanKualitas.includes("Checklist Pra-Terbit") &&
      halamanKualitas.includes("Hard gates G1–G6"),
  );
  cek(
    "K2 checklist menampilkan 'tidak dapat dinilai' (bukan 'semua lolos') bila null",
    halamanKualitas.includes("Checklist tidak dapat dinilai") &&
      halamanKualitas.includes("tidak dapat dinilai"),
  );
  cek(
    "K3 getChecklistPraTerbit ada di data.ts + memakai evaluasiHardGate + review terakhir",
    dataAdmin.includes("getChecklistPraTerbit") &&
      dataAdmin.includes("evaluasiHardGate") &&
      dataAdmin.includes("getReviewTerakhir") &&
      dataAdmin.includes("auto_publish_mungkin"),
  );
  cek(
    "K4 checklist TIDAK memanggil terbitkanOtomatis/terbitkanArtikel (hanya menilai)",
    !halamanKualitas.includes("terbitkanOtomatis") &&
      !halamanKualitas.includes("terbitkanArtikel") &&
      !dataAdmin
        .split("getChecklistPraTerbit")[1]
        .split("export async function")[0]
        .includes("perbaruiArtikel"),
  );
}

// ---------- §L: Article Version Control + migrasi v27 ----------
// Tiap revisi menyimpan isi SEBELUM (isi_sebelum) + SESUDAH (isi);
// simpanVersi mundur tanpa isi_sebelum bila kolom v27 belum ada
// (42703) agar penerbitan tidak gagal di produksi pra-v27.
// Tabel baru pf_push_deliveries (log push) ber-RLS + policy staf.
console.log("\n--- §L Version Control + migrasi v27 ---");
{
  const sql27 = baca(
    "supabase/migrations/20261118_pf_v27_koreksi_versi_push.sql",
  );
  cek(
    "L1 v27: pf_article_versions.isi_sebelum + 3 kolom koreksi + tabel pf_push_deliveries (RLS + policy staf)",
    sql27.includes("isi_sebelum text") &&
      sql27.includes("diterapkan_pada timestamptz") &&
      sql27.includes("versi_artikel integer") &&
      sql27.includes("tanggapan_redaksi text") &&
      sql27.includes("create table if not exists public.pf_push_deliveries") &&
      sql27.includes("enable row level security") &&
      sql27.includes('"pf_push_deliveries baca staf"'),
  );
  // L2: idempoten — setiap ALTER/CREATE/DROP di v27 memakai
  // IF NOT EXISTS / IF EXISTS. Diuji pada teks yang dinormalisasi
  // satu baris (pernyataan ALTER v27 merentang beberapa baris).
  const sql27SatuBaris = sql27.replace(/\s+/g, " ");
  cek(
    "L2 v27 idempoten (semua pernyataan IF NOT EXISTS / IF EXISTS)",
    !/alter table public\.pf_\w+\s+add column (?!if not exists)/.test(
      sql27SatuBaris,
    ) &&
      !/create (table|index) (?!if not exists)/.test(sql27SatuBaris) &&
      !/drop policy (?!if exists)/.test(sql27SatuBaris),
  );
  const adapter = baca("src/lib/admin/supabase-adapter.ts");
  cek(
    "L3 simpanVersi menulis isi_sebelum + mundur 42703 tanpa kolom itu",
    adapter.includes("isi_sebelum: input.isi_sebelum ?? null") &&
      adapter.includes("galatKolomBelumAda(error)"),
  );
  const editorial = baca("src/lib/admin/editorial.ts");
  cek(
    "L4 ubahArtikel + terbitkanArtikel meneruskan isi lama ke simpanVersiBaru",
    editorial.includes("catatanVersi,\n    lama.isi,") &&
      editorial.includes('"Terbit", artikel.isi'),
  );
  const detailArtikel = baca("src/app/admin/artikel/[id]/page.tsx");
  cek(
    "L5 detail artikel menampilkan status isi_sebelum per versi",
    detailArtikel.includes("isi sebelum revisi tercatat") &&
      detailArtikel.includes("isi sebelum belum tercatat (versi pra-v27)"),
  );
  cek(
    "L6 v27 TIDAK menambah host login ke allowlist / tidak mengubah FACT SCORE",
    !sql27.includes("idp.nature.com") &&
      !baca("src/lib/fact-score.ts").includes("isi_sebelum"),
  );
}

// ---------- §M: Public Correction Center (v27) ----------
// Halaman publik /koreksi: daftar koreksi status 'diperbaiki'
// (artikel, jenis, tanggal, versi, tanggapan redaksi). RLS v2
// hanya mengizinkan staf + pelapor membaca tabel ini, jadi
// getter memakai service client (pola getJumlahKoreksiTerbuka)
// dan HANYA mengembalikan kolom aman — tanpa nama/email pelapor.
// null = tidak dapat dimuat, bukan "belum ada koreksi".
console.log("\n--- §M Public Correction Center (v27) ---");
{
  const halaman = baca("src/app/koreksi/page.tsx");
  const libData = baca("src/lib/data.ts");
  cek(
    "M1 /koreksi ada: instant=false + connection() + EmptyState jujur (null vs kosong)",
    halaman.includes("export const instant = false") &&
      halaman.includes("await connection()") &&
      halaman.includes("tidak dapat dimuat") &&
      halaman.includes("Belum ada koreksi yang diterbitkan"),
  );
  cek(
    "M2 getKoreksiDiterbitkan: hanya status diperbaiki + service client + fallback PGRST204 kolom v27",
    libData.includes("getKoreksiDiterbitkan") &&
      libData.includes('eq("status", "diperbaiki")') &&
      libData.includes("cobaServiceClient()") &&
      libData.includes("diterapkan_pada,versi_artikel,tanggapan_redaksi") &&
      libData.includes('code === "PGRST204"'),
  );
  cek(
    "M3 getter TIDAK mengembalikan data pelapor (tanpa pelapor_email/email/pelapor_id di select)",
    !libData
      .split("getKoreksiDiterbitkan")[1]
      .split("export async function")[0]
      .includes("pelapor"),
  );
  cek(
    "M4 /kebijakan/koreksi menautkan ke /koreksi",
    baca("src/app/kebijakan/koreksi/page.tsx").includes('href="/koreksi"'),
  );
}

// ---------- §N: Breaking News Radar (v27) ----------
// /admin/radar: 20 klaster terbaru dari pf_item_clusters dengan
// label TURUNAN dari data (bukan klaim trending): 1 laporan =
// "baru", ≥2 = "peristiwa sama", anggota >6j sesudah dibuat =
// "pembaruan". "Bertentangan" TIDAK dinilai (butuh analisis
// klaim) — halaman wajib mengatakannya, bukan mengarang label.
console.log("\n--- §N Breaking News Radar (v27) ---");
{
  const radar = baca("src/app/admin/radar/page.tsx");
  cek(
    "N1 /admin/radar ada: instant=false + baca pf_item_clusters + anggota + raw items",
    radar.includes("export const instant = false") &&
      radar.includes('from("pf_item_clusters")') &&
      radar.includes('from("pf_item_cluster_members")') &&
      radar.includes('from("pf_raw_items")'),
  );
  cek(
    "N2 label turunan: baru / peristiwa sama / pembaruan (>6j, BATAS_PEMBARUAN_MS)",
    radar.includes("BATAS_PEMBARUAN_MS") &&
      radar.includes('"baru"') &&
      radar.includes('"peristiwa sama"') &&
      radar.includes("pembaruan"),
  );
  cek(
    "N3 halaman JELAS menyatakan bertentangan tidak dinilai + bukan trending",
    radar.includes("Bertentangan") &&
      radar.includes("TIDAK dinilai di radar") &&
      radar.includes("bukan peringkat popularitas"),
  );
  cek(
    "N4 Radar terdaftar di NavAdmin (grup Monitoring, sesudah Klaster)",
    baca("src/components/admin/NavAdmin.tsx").includes(
      '{ href: "/admin/radar", label: "Radar" }',
    ),
  );
}

// ---------- §O: Source Intelligence + Global Coverage Map (v27) ----------
// /admin/sumber: +2 kolom kinerja editorial (artikel terbit +
// koreksi diperbaiki per sumber). /admin/cakupan: item 7 hari
// per sumber (count exact) + artikel terbit 30 hari per kategori.
// TIDAK ADA persentase cakupan karangan; perincian negara/bahasa
// TIDAK tersedia (pf_sources tanpa kolom itu) — halaman wajib
// mengatakannya + menautkan /peta.
console.log("\n--- §O Source Intelligence + Coverage Map (v27) ---");
{
  const dataAdmin = baca("src/lib/admin/data.ts");
  cek(
    "O1 getKinerjaSumber: artikel terbit via pf_article_sources + koreksi diperbaiki, null bila service key belum ada",
    dataAdmin.includes("getKinerjaSumber") &&
      dataAdmin.includes("pf_article_sources") &&
      dataAdmin.includes("koreksi_diperbaiki") &&
      dataAdmin.includes("cobaServiceClient()"),
  );
  const sumberPage = baca("src/app/admin/sumber/page.tsx");
  cek(
    "O2 /admin/sumber menampilkan kolom Artikel terbit + Koreksi diperbaiki + catatan multi-sumber",
    sumberPage.includes("Artikel terbit") &&
      sumberPage.includes("Koreksi diperbaiki") &&
      sumberPage.includes("bukan menuduh satu sumber"),
  );
  const cakupan = baca("src/app/admin/cakupan/page.tsx");
  cek(
    "O3 /admin/cakupan: count exact item 7 hari per sumber + artikel 30 hari per kategori",
    cakupan.includes("count") &&
      cakupan.includes("BATAS_ITEM_HARI") &&
      cakupan.includes("BATAS_ARTIKEL_HARI") &&
      cakupan.includes("artikelPerKategori"),
  );
  cek(
    "O4 /admin/cakupan JELAS menyatakan tanpa persentase karangan + tanpa perincian negara/bahasa + tautan /peta",
    cakupan.includes("TIDAK ADA persentase") &&
      cakupan.includes("tidak punya kolom negara/bahasa") &&
      cakupan.includes('href="/peta"'),
  );
  cek(
    "O5 Cakupan terdaftar di NavAdmin (grup Monitoring, sesudah Analitik)",
    baca("src/components/admin/NavAdmin.tsx").includes(
      '{ href: "/admin/cakupan", label: "Cakupan" }',
    ),
  );
}

// ---------- §P: Primary Document Library (v27) ----------
// pf_documents (v10) + /riset (publik) + /admin/riset (CRUD)
// SUDAH ADA — v27 hanya menambah "hak penggunaan"
// (metadata.hak_penggunaan: form admin + kolom /riset) dan seed
// awal 4 dokumen resmi terverifikasi (BELUM diterapkan —
// butuh otorisasi pemilik). Tanpa dummy; UU Pers + KEJ SENGAJA
// tidak di-seed (URL resmi belum terverifikasi — lihat seed).
console.log("\n--- §P Primary Document Library (v27) ---");
{
  const form = baca("src/components/riset/FormDokumen.tsx");
  cek(
    "P1 FormDokumen punya field Hak penggunaan -> metadata.hak_penggunaan",
    form.includes("Hak penggunaan") &&
      form.includes('metadata["hak_penggunaan"]'),
  );
  const risetPage = baca("src/app/riset/page.tsx");
  cek(
    "P2 /riset menampilkan kolom Hak penggunaan dari metadata",
    risetPage.includes("Hak penggunaan") &&
      risetPage.includes('metadata["hak_penggunaan"]'),
  );
  const seed = baca("hidden_files/SEED-DOKUMEN-PRIMER-V27.sql");
  cek(
    "P3 seed: 4 dokumen resmi (peraturan.go.id + 3× bps.go.id), idempoten WHERE NOT EXISTS, status terbit",
    (seed.match(/insert into public\.pf_documents/g) ?? []).length === 4 &&
      seed.includes("peraturan.go.id") &&
      (seed.match(/bps\.go\.id/g) ?? []).length >= 3 &&
      seed.includes("where not exists") &&
      seed.includes("'terbit'"),
  );
  cek(
    "P4 seed JUJUR: menyatakan BELUM diterapkan + alasan UU Pers/KEJ tidak di-seed",
    seed.includes("BELUM DITERAPKAN") &&
      seed.includes("UU 40/1999") &&
      seed.includes("Kode Etik Jurnalistik") &&
      seed.includes("404"),
  );
}

// ---------- §Q: Notification Intelligence (v27) ----------
// Broadcast v27: hormati push_notifikasi, frequency cap 5/hari
// per endpoint (dari pf_push_deliveries), retry 1× untuk
// 429/5xx, setiap percobaan dicatat best-effort ke
// pf_push_deliveries; /admin/notifikasi menampilkan riwayat.
// "Jangan kirim ke yang tidak opt-in": langganan itu sendiri
// adalah opt-in; tamu (user_id null) tidak punya preferensi.
console.log("\n--- §Q Notification Intelligence (v27) ---");
{
  const pushLib = baca("src/lib/notifikasi/push.ts");
  cek(
    "Q1 push.ts: BATAS_KIRIM_PER_HARI=5 + catatPengirimanPush (best-effort, tidak melempar) + hitungKirim24Jam (null bila riwayat tak terbaca)",
    pushLib.includes("BATAS_KIRIM_PER_HARI = 5") &&
      pushLib.includes("catatPengirimanPush") &&
      pushLib.includes("hitungKirim24Jam") &&
      pushLib.includes("pf_push_deliveries"),
  );
  const routeKirim = baca("src/app/api/admin/notifikasi/kirim/route.ts");
  cek(
    "Q2 broadcast membaca user_id + preferensi push_notifikasi (pf_user_preferences) + dilewati_preferensi",
    routeKirim.includes("user_id") &&
      routeKirim.includes("pf_user_preferences") &&
      routeKirim.includes("push_notifikasi") &&
      routeKirim.includes("dilewati_preferensi"),
  );
  // v29: logika pengiriman dipindah VERBATIM dari route admin ke
  // lib bersama src/lib/notifikasi/broadcast.ts (dipakai route
  // admin DAN Daily Brief pagi — perilaku SAMA PERSIS). Q3
  // memeriksa lib-nya + delegasi route ke sana.
  const broadcastLib = baca("src/lib/notifikasi/broadcast.ts");
  cek(
    "Q3 broadcast: frequency cap (dilewati_cap) + retry 1× 429/5xx (jeda 1 detik) + catat setiap percobaan",
    broadcastLib.includes("dilewati_cap") &&
      broadcastLib.includes("BATAS_KIRIM_PER_HARI") &&
      broadcastLib.includes("setTimeout(r, 1000)") &&
      broadcastLib.includes("catatPengirimanPush(service, catatan)") &&
      routeKirim.includes("kirimBroadcastPush(service, payload)"),
  );
  cek(
    "Q4 kirimPushKePengguna (jalur uji) ikut mencatat ke pf_push_deliveries",
    pushLib.includes('judul: "Uji push"'),
  );
  const notifPage = baca("src/app/admin/notifikasi/page.tsx");
  cek(
    "Q5 /admin/notifikasi menampilkan riwayat 20 terakhir + EmptyState jujur bila tabel v27 belum ada",
    notifPage.includes("Riwayat pengiriman") &&
      notifPage.includes("pf_push_deliveries") &&
      notifPage.includes("migrasi v27 belum diterapkan"),
  );
  cek(
    "Q6 broadcast tetap HANYA super_admin + setVapidDetails malas (§I tidak dilemahkan)",
    routeKirim.includes("autentikasiAdmin(req, ROLES.SUPER_ADMIN)") &&
      routeKirim.indexOf("setVapidDetails(") >
        routeKirim.indexOf("export async function POST"),
  );
}

// ---------- §R: PWA cache limits + mode baca (v27, P3) ----------
// sw.js v2: batas 100 entri runtime (FIFO, precache aman) +
// TTL navigasi 7 hari (basi -> /offline). Mode baca default
// disamakan ke "3menit" (F.2 #4, berbasis kode).
console.log("\n--- §R PWA cache limits + mode baca (v27) ---");
{
  const sw = baca("public/sw.js");
  cek(
    "R1 sw.js v2: BATAS_ENTRI_RUNTIME=100 + TTL_NAVIGASI_MS 7 hari + pangkasCache + apakahBasi",
    sw.includes('CACHE_VERSION = "prata-fakta-v2"') &&
      sw.includes("BATAS_ENTRI_RUNTIME = 100") &&
      sw.includes("TTL_NAVIGASI_MS = 7 * 24 * 60 * 60 * 1000") &&
      sw.includes("pangkasCache") &&
      sw.includes("apakahBasi"),
  );
  cek(
    "R2 navigasi basi TIDAK disajikan dari cache (jatuh ke /offline)",
    sw.includes("!apakahBasi(dariCache, TTL_NAVIGASI_MS)"),
  );
  cek(
    "R3 precache TIDAK pernah dihapus pangkasCache",
    sw.includes("!PRECACHE.includes("),
  );
  const pembaca = baca("src/components/artikel/PembacaArtikel.tsx");
  cek(
    "R4 mode baca default disamakan ke 3menit (bukan mendalam)",
    pembaca.includes('preferensiAwal?.mode_baca ?? "3menit"') &&
      !pembaca.includes('preferensiAwal?.mode_baca ?? "mendalam"'),
  );
  cek(
    "R5 dokumen keputusan terbuka v27 ada (8 keputusan + Compare Perspectives + RLS)",
    baca("hidden_files/KEPUTUSAN-TERBUKA-V27.md").includes(
      "Compare Perspectives",
    ) &&
      baca("hidden_files/KEPUTUSAN-TERBUKA-V27.md").includes(
        "RLS two-account verification",
      ),
  );
}

// ---------- §S: PRATA Command Center (v27) ----------
// /admin/command-center: 8 panel (System Health, News Radar,
// Editorial, Source Intelligence, Scheduler, Backup, Push,
// Analytics) — SEMUANYA memakai ulang getter/panel yang ada
// (ops, reliability, kualitas, notifikasi, radar); TIDAK ada
// query/duplikasi logika baru. Tautan di NavAdmin grup Kendali.
console.log("\n--- §S PRATA Command Center (v27) ---");
{
  const cc = baca("src/app/admin/command-center/page.tsx");
  const panel = [
    "System Health",
    "News Radar",
    "Editorial",
    "Source Intelligence",
    "Scheduler",
    "Backup",
    "Push",
    "Analytics",
  ];
  cek(
    "S1 Command Center punya 8 panel (judul seksi lengkap)",
    panel.every((p) => cc.includes(p)),
  );
  cek(
    "S2 memakai ulang getter yang ada (getRingkasanOps + getAlertAktif + getGalatTerbaru + getChecklistPraTerbit), tanpa SELECT baru ke pf_articles/pf_raw_items",
    cc.includes("getRingkasanOps()") &&
      cc.includes("getAlertAktif()") &&
      cc.includes("getGalatTerbaru()") &&
      cc.includes("getChecklistPraTerbit()") &&
      !cc.includes('from("pf_articles")') &&
      !cc.includes('from("pf_raw_items")'),
  );
  cek(
    "S3 tiap panel menautkan ke halaman detailnya (reliability/radar/kualitas/sumber/ops/notifikasi/analitik/cakupan)",
    [
      "/admin/reliability",
      "/admin/radar",
      "/admin/kualitas",
      "/admin/sumber",
      "/admin/ops",
      "/admin/notifikasi",
      "/admin/analitik",
      "/admin/cakupan",
    ].every((h) => cc.includes(h)),
  );
  cek(
    "S4 guard getAdminSession + instant=false + EmptyState jujur (— bukan 0)",
    cc.includes("getAdminSession()") &&
      cc.includes("export const instant = false") &&
      cc.includes("Butuh login staf"),
  );
  cek(
    "S5 Command Center terdaftar di NavAdmin (grup Kendali, sesudah Kendali)",
    baca("src/components/admin/NavAdmin.tsx").includes(
      '{ href: "/admin/command-center", label: "Command Center" }',
    ),
  );
}

// ---------- §T: v28 — scheduler pg_cron + atribusi + gerbang push tamu ----------
// Live SQL §1–§3 di uji-migrasi-v28.mjs; di sini penjaga statis
// agar perubahan di file migrasi/kode atribusi/gerbang tamu
// langsung ketahuan bila ada yang mengembalikannya diam-diam.
console.log("\n--- §T v28: pg_cron + atribusi + gerbang push tamu ---");
{
  const sql28 = baca("supabase/migrations/20261118_pf_v28_pg_cron_scheduler.sql");
  cek(
    "T1 v28: CHECK dipicu_oleh v28 di dua tabel + tiga job pg_cron (*/30, */24, 0 1 * * *)",
    sql28.includes("pf_ingestion_runs_dipicu_oleh_check_v28") &&
      sql28.includes("pf_ai_runs_dipicu_oleh_check_v28") &&
      sql28.includes("'pf-ingestion-30mnt'") &&
      sql28.includes("'pf-pipeline-24mnt'") &&
      sql28.includes("'pf-tanya-jawab-harian'"),
  );
  cek(
    "T2 v28: secret hanya dari Vault (nama pf_ingestion_secret/pf_ai_secret), bukan nilai harfiah",
    sql28.includes("vault.decrypted_secrets") &&
      !sql28
        .replace(/--[^\n]*/g, "")
        .includes("create_secret"),
  );
  cek(
    "T3 koreksi premis: v22 SUDAH memuat 'comparison' (31 nilai) — v28 tidak mengubah CHECK agen",
    baca("supabase/migrations/20261117_pf_v22_global_intel.sql").includes("'comparison'") &&
      !sql28.includes("pf_ai_runs_agen_check"),
  );
  cek(
    "T4 atribusi pg_cron di kode (types + route-auth + ingestion route)",
    baca("src/lib/ai/types.ts").includes('"pg_cron"') &&
      baca("src/lib/ai/route-auth.ts").includes('pemicuHeader === "pg_cron" ? "pg_cron" : "github_actions"') &&
      baca("src/app/api/ingestion/jalankan/route.ts").includes('body.dipicu_oleh === "pg_cron"'),
  );
  const halamanNotifikasi = baca("src/app/saya/notifikasi/page.tsx");
  cek(
    "T5 gerbang push tamu: TIDAK ADA redirect('/masuk') — tamu mencapai seksi push",
    !halamanNotifikasi.includes('redirect("/masuk")') &&
      !halamanNotifikasi.includes("redirect("),
  );
  cek(
    "T6 gerbang push tamu: cabang tamu merender PengalihPush + tautan /masuk, SEBELUM FormPreferensiNotifikasi",
    halamanNotifikasi.includes("if (!penggunaId)") &&
      halamanNotifikasi.includes("<PengalihPush />") &&
      halamanNotifikasi.includes('href="/masuk"') &&
      halamanNotifikasi.indexOf("<FormPreferensiNotifikasi />") >
        halamanNotifikasi.indexOf("if (!penggunaId)"),
  );
  cek(
    "T7 Compare Perspectives opsi (a): hitungSikapBukti + formatSikapBukti diekspor perbandingan-dua.ts",
    baca("src/lib/perbandingan-dua.ts").includes("export function hitungSikapBukti") &&
      baca("src/lib/perbandingan-dua.ts").includes("export function formatSikapBukti"),
  );
}

console.log(`\nRINGKASAN global-intel: ${lolos} lolos, ${gagal} gagal.`);
if (gagal > 0) process.exit(1);
