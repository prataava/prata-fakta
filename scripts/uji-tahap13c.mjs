// Uji Tahap 13C — scheduler + feature flags (PRATA FAKTA).
// PGlite + pemeriksaan statis + eksekusi kode nyata (tanpa server
// Next, tanpa deploy, tanpa data dummy operasional).
//
// Yang diuji:
//   (A) Workflow YAML: 5 jadwal §10.1 tetap terjaga sesudah
//       editorial.yml dipecah jadi 3 workflow (F4); tanpa
//       perbandingan string github.event.schedule di kode;
//       concurrency group per workflow (F3); --retry 2 (F8) —
//       KECUALI ingestion + editorial-pipeline (FU3, 16 Nov
//       2026): pengecualian Tahap E — retry hidup DI DALAM
//       engine per-sumber / per-item; memicu ulang endpoint
//       berarti mengulang seluruh job. Header kedua workflow
//       mendokumentasikannya; asersi di bawah memeriksa
//       pengecualian + retry di dalam engine, bukan curl.
//       assert isi respons jq di tiap workflow (F5); simulasi
//       logika gating LAMA (membuktikan bug F2/F4) vs BARU.
//   (B) Lock server-side + F6 di PGlite: klaim SQL yang sama
//       persis dengan klaimJob() (dua klaim bersamaan -> kedua
//       ditolak; lock basi 30 mnt bisa direbut; lepas -> klaim
//       lagi bisa); selesaikanJob memperbarui terakhir_jalan
//       tiap run (F6); baris job tak ada -> klaim 0 baris
//       (jalur fail-open, bukan 409 palsu).
//   (C) Seed SQL 5 job (§14 laporan): dieksekusi di PGlite,
//       5 baris ada dengan cron yang benar.
//   (D) Backoff F12 perilaku nyata: terbitkanTerjadwal() dari
//       src/lib/admin/editorial.ts — artikel gagal gate dicoba
//       ulang langsung -> DITUNDA 6 jam tanpa penanda baru;
//       sesudah penanda dibackdate 7 jam -> dicoba lagi.
//   (E) Pemicu manual 8 job (F7): pemicuJobManual() dari
//       src/lib/admin/kendali.ts dengan server HTTP lokal —
//       5 job bermuara ke route yang benar (ok:true); 3 job
//       tanpa route melempar 'belum bisa dipicu' (route
//       memetakan ke 400); job tak dikenal melempar.
//   (F) Feature flags: uraiNilaiFlag() murni + wiring statis
//       penegakan di route ingestion/pipeline, /daftar, Header.
// Yang TIDAK diuji di sini (dilaporkan sebagai belum diuji):
// run live GitHub Actions (0 run live), HTTP end-to-end lewat
// server Next (lock/flag di level route), dan render browser.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { register } from "node:module";

const require = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = require("@electric-sql/pglite");
const requireRepo = createRequire(
  new URL("../package.json", import.meta.url).pathname,
);
const yaml = requireRepo("js-yaml");

const DIR_MIGRASI = new URL("../supabase/migrations/", import.meta.url)
  .pathname;
const DIR_REPO = new URL("../", import.meta.url).pathname;

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

function baca(nama) {
  let sql = fs.readFileSync(`${DIR_MIGRASI}/${nama}`, "utf8");
  sql = sql.replace(/create extension[^;]+;/gi, "-- ekstensi dilepas (PGlite)");
  sql = sql.replace(/\bcitext\b/gi, "text");
  return sql;
}

function bacaRepo(relatif) {
  return fs.readFileSync(`${DIR_REPO}/${relatif}`, "utf8");
}

const db = new PGlite();

async function jalankan(label, teks) {
  try {
    await db.exec(teks);
    return true;
  } catch (e) {
    console.log(
      `GAGAL: ${label}\n  -> ${String(e.message).split("\n")[0]}`,
    );
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
console.log("OK: setup auth + role");

for (const nama of MIGRASI) {
  const ok = await jalankan(`migrasi ${nama}`, baca(nama));
  if (!ok) process.exit(1);
}
cek(
  "migrasi v1–v10 diterapkan (53 tabel pf_*)",
  Number(
    (
      await db.query(
        `select count(*) n from pg_tables where schemaname='public' and tablename like 'pf_%'`,
      )
    ).rows[0].n,
  ) === 53,
);

// ==================== (A) Workflow YAML + gating ====================
console.log("\n--- (A) Workflow YAML + gating (F2/F3/F4/F5/F8) ---");

const WORKFLOW = {
  ingestion: ".github/workflows/ingestion.yml",
  "editorial-pipeline": ".github/workflows/editorial-pipeline.yml",
  "daily-brief": ".github/workflows/daily-brief.yml",
  "terbitkan-terjadwal": ".github/workflows/terbitkan-terjadwal.yml",
  "data-analysis": ".github/workflows/data-analysis.yml",
};
const CRON_HARAP = {
  ingestion: ["*/30 * * * *"],
  "editorial-pipeline": ["0 0,6,12,18 * * *"],
  "daily-brief": ["0 22 * * *"],
  "terbitkan-terjadwal": ["0 * * * *"],
  "data-analysis": ["0 1 * * 1"],
};
const ENDPOINT_HARAP = {
  ingestion: "/api/ingestion/jalankan",
  "editorial-pipeline": "/api/ai/jalankan",
  "daily-brief": "/api/ai/brief",
  "terbitkan-terjadwal": "/api/admin/artikel/terbitkan-terjadwal",
  "data-analysis": "/api/ai/data-analysis",
};
const ASSERT_HARAP = {
  ingestion: ".total.gagal",
  "editorial-pipeline": "(.gagal // 0) == 0",
  "daily-brief": "briefId",
  "terbitkan-terjadwal": ".diterbitkan",
  "data-analysis": "(.gagal // 0) == 0",
};

cek(
  "editorial.yml lama SUDAH dihapus (tidak ada lagi 1 workflow 3 jadwal)",
  !fs.existsSync(`${DIR_REPO}.github/workflows/editorial.yml`),
);

const semuaCron = [];
const grupConcurrency = new Set();
for (const [nama, rel] of Object.entries(WORKFLOW)) {
  const teks = bacaRepo(rel);
  let y;
  try {
    y = yaml.load(teks);
  } catch (e) {
    cek(`YAML ${nama} valid`, false, String(e.message).slice(0, 120));
    continue;
  }
  cek(`YAML ${nama} valid`, true);
  const jadwal = (y.on?.schedule ?? []).map((s) => s.cron);
  cek(
    `${nama}: cron = ${CRON_HARAP[nama].join(", ")}`,
    JSON.stringify(jadwal) === JSON.stringify(CRON_HARAP[nama]),
    `dapat: ${jadwal.join(" | ")}`,
  );
  semuaCron.push(...jadwal);
  cek(
    `${nama}: workflow_dispatch ada`,
    y.on !== null &&
      typeof y.on === "object" &&
      "workflow_dispatch" in y.on,
  );
  const grup = y.concurrency?.group;
  cek(
    `${nama}: concurrency group ada + cancel-in-progress false`,
    typeof grup === "string" &&
      grup.length > 0 &&
      y.concurrency?.["cancel-in-progress"] === false,
    `group=${grup}`,
  );
  cek(`${nama}: concurrency group unik`, !grupConcurrency.has(grup));
  grupConcurrency.add(grup);
  // Kode (bukan komentar) tidak boleh memakai gating string F4.
  const barisKode = teks
    .split("\n")
    .filter((b) => !b.trim().startsWith("#"));
  cek(
    `${nama}: tanpa github.event.schedule di kode`,
    !barisKode.some((b) => b.includes("github.event.schedule")),
  );
  // FU3 (16 Nov 2026): ingestion + editorial-pipeline
  // DIKECUALIKAN dari curl --retry — keputusan Tahap E yang
  // disengaja (retry hidup DI DALAM engine; memicu ulang
  // endpoint = mengulang seluruh job). Yang diperiksa di sini:
  // pengecualian terdokumentasi di header + retry di dalam
  // engine benar-benar ada. Mengembalikan --retry ke curl
  // kedua workflow ini adalah REGRESI desain Tahap E.
  if (nama === "ingestion" || nama === "editorial-pipeline") {
    cek(
      `${nama}: pengecualian retry Tahap E terdokumentasi di header`,
      teks.includes("TIDAK ADA curl --retry") &&
        teks.includes("Retry hidup DI DALAM"),
      "header workflow",
    );
    if (nama === "ingestion") {
      const retrySrc = bacaRepo("src/lib/ingestion/retry.ts");
      cek(
        "ingestion: retry di dalam engine (maks 3 percobaan, backoff eksponensial, Retry-After)",
        /percobaanMaks \?\? 3/.test(retrySrc) &&
          /Retry-After/.test(retrySrc),
        "src/lib/ingestion/retry.ts",
      );
    } else {
      const jalankanSrc = bacaRepo("src/app/api/ai/jalankan/route.ts");
      cek(
        "editorial-pipeline: retry di dalam pipeline (per-item try/catch)",
        (jalankanSrc.match(/try \{/g) ?? []).length >= 2,
        "src/app/api/ai/jalankan/route.ts",
      );
    }
  } else {
    cek(
      `${nama}: curl --fail-with-body + --retry 2 + --retry-delay`,
      teks.includes("--fail-with-body") &&
        teks.includes("--retry 2") &&
        teks.includes("--retry-delay"),
    );
  }
  cek(
    `${nama}: assert jq atas isi respons`,
    teks.includes("jq -e") && teks.includes(ASSERT_HARAP[nama]),
    `assert: ${ASSERT_HARAP[nama]}`,
  );
  cek(
    `${nama}: curl ke ${ENDPOINT_HARAP[nama]}`,
    teks.includes(ENDPOINT_HARAP[nama]),
  );
  cek(
    `${nama}: catatan alerting ada (log Actions + tabel run)`,
    teks.includes("Alerting"),
  );
}

// 5 jadwal §10.1 tetap terjaga sesudah pemecahan.
const CRON_5 = [
  "*/30 * * * *",
  "0 0,6,12,18 * * *",
  "0 22 * * *",
  "0 * * * *",
  "0 1 * * 1",
];
cek(
  "5 jadwal §10.1 terjaga (tepat 5 cron di 5 workflow)",
  semuaCron.length === 5 &&
    CRON_5.every((c) => semuaCron.includes(c)),
  `cron: ${semuaCron.join(" | ")}`,
);

// Simulasi gating LAMA (editorial.yml sebelum Tahap 13C):
// kondisi `if:` diambil verbatim dari berkas lama.
function gatingLama(event, tugas) {
  const jadwal = event === "schedule" ? tugas : null; // tugas dipakai sbg cron di sini
  return {
    pipeline:
      jadwal === "0 0,6,12,18 * * *" ||
      (event === "workflow_dispatch" &&
        (tugas === "keduanya" || tugas === "pipeline")),
    brief:
      jadwal === "0 22 * * *" ||
      (event === "workflow_dispatch" &&
        (tugas === "keduanya" || tugas === "brief")),
    terbitkan:
      jadwal === "0 * * * *" ||
      (event === "workflow_dispatch" &&
        tugas === "terbitkan-terjadwal"),
  };
}
const lamaKeduanya = gatingLama("workflow_dispatch", "keduanya");
cek(
  "SIMULASI F2 (lama): dispatch 'keduanya' TIDAK menjalankan terbitkan-terjadwal",
  lamaKeduanya.pipeline === true &&
    lamaKeduanya.brief === true &&
    lamaKeduanya.terbitkan === false,
  `pipeline=${lamaKeduanya.pipeline} brief=${lamaKeduanya.brief} terbitkan=${lamaKeduanya.terbitkan}`,
);
const lamaJam00Pipeline = gatingLama("schedule", "0 0,6,12,18 * * *");
cek(
  "SIMULASI F4 (lama): run 00:00 UTC membawa SATU string jadwal — terbitkan-terjadwal tidak jalan padahal jadwal jamannya tiba",
  lamaJam00Pipeline.pipeline === true &&
    lamaJam00Pipeline.terbitkan === false,
  `pipeline=${lamaJam00Pipeline.pipeline} terbitkan=${lamaJam00Pipeline.terbitkan}`,
);
cek(
  "SIMULASI F4 (baru): tiap jadwal = workflow sendiri, tanpa string gating — dispatch per-workflow selalu menjalankan jobnya",
  bacaRepo(WORKFLOW["terbitkan-terjadwal"]).includes("workflow_dispatch:") &&
    bacaRepo(WORKFLOW["editorial-pipeline"]).includes("workflow_dispatch:"),
);

// ==================== (C) Seed SQL 5 job ====================
console.log("\n--- (C) Seed SQL 5 job (F7) ---");

// SQL seed yang SAMA PERSIS dengan yang ditulis di LAPORAN-FASE-8
// §14 (koordinator yang memasukkan ke migrasi lanjutan).
const SEED_5_JOB = `
insert into public.pf_scheduled_jobs (nama, jadwal_cron, deskripsi) values
  ('ingestion', '*/30 * * * *', 'Ingestion RSS + GDELT setiap 30 menit'),
  ('editorial', '0 0,6,12,18 * * *', 'Pipeline editorial AI setiap 6 jam'),
  ('brief', '0 22 * * *', 'Daily Brief harian 05.00 WIB'),
  ('data-analysis', '0 1 * * 1', 'Data Analysis mingguan Senin 08.00 WIB'),
  ('terbitkan-terjadwal', '0 * * * *', 'Terbitkan artikel terjadwal setiap jam')
on conflict (nama) do nothing;
`;
cek("seed 5 job dieksekusi", await jalankan("seed 5 job", SEED_5_JOB));
const jobsSeed = (
  await db.query(
    `select nama, jadwal_cron from public.pf_scheduled_jobs order by nama`,
  )
).rows;
cek(
  "pf_scheduled_jobs berisi 5 job sesudah seed",
  jobsSeed.length === 5,
  `job: ${jobsSeed.map((j) => j.nama).join(", ")}`,
);
const { JADWAL_CRON_JOB, TIMEOUT_LOCK_MENIT } = await import(
  "../src/lib/scheduler/jobs.ts"
);
cek(
  "cron seed = JADWAL_CRON_JOB di src/lib/scheduler/jobs.ts",
  jobsSeed.every((j) => JADWAL_CRON_JOB[j.nama] === j.jadwal_cron),
);
// P2-9 (Gelombang B1): TIMEOUT_LOCK_MENIT 30 -> 15 (jobs.ts) —
// lock basi dilepas lebih cepat; batas lama 30 menit sudah usang.
cek("TIMEOUT_LOCK_MENIT = 15", TIMEOUT_LOCK_MENIT === 15);
const laporan = bacaRepo("LAPORAN-FASE-8.md");
cek(
  "LAPORAN-FASE-8 §14 memuat seed SQL yang sama (data-analysis + terbitkan-terjadwal)",
  // Judul §14 berubah di Tahap 15-17 ("13C" -> "13–17"); isi seed
  // SQL-nya sama (baris 1794-1795).
  laporan.includes("## 14. Tahap 13–17") &&
    laporan.includes("('data-analysis', '0 1 * * 1'") &&
    laporan.includes("('terbitkan-terjadwal', '0 * * * *'"),
);

// ==================== (B) Lock server-side + F6 (SQL) ====================
console.log("\n--- (B) Lock server-side + terakhir_jalan (F3/F6, PGlite) ---");

// SQL yang sama persis dengan klaimJob()/selesaikanJob() di
// src/lib/scheduler/jobs.ts (kondisi OR identik) — diuji di sini
// karena route Next tidak bisa dijalankan tanpa server HTTP.
async function klaimSql(nama, timeoutMenit) {
  const batas = new Date(Date.now() - timeoutMenit * 60_000).toISOString();
  const r = await db.query(
    `update public.pf_scheduled_jobs
       set status_terakhir = 'berjalan', terakhir_jalan = now(), error_terakhir = null
       where nama = $1
         and (status_terakhir <> 'berjalan'
              or terakhir_jalan is null
              or terakhir_jalan < $2::timestamptz)
       returning id`,
    [nama, batas],
  );
  return r.rows.length;
}

async function selesaikanSql(nama, ok, error = null) {
  const r = await db.query(
    `update public.pf_scheduled_jobs
       set status_terakhir = $2, terakhir_jalan = now(), error_terakhir = $3
       where nama = $1 returning id`,
    [nama, ok ? "berhasil" : "gagal", error],
  );
  return r.rows.length;
}

async function bacaJob(nama) {
  const r = await db.query(
    `select nama, status_terakhir, terakhir_jalan, error_terakhir
       from public.pf_scheduled_jobs where nama = $1`,
    [nama],
  );
  return r.rows[0] ?? null;
}

const kodeJobs = bacaRepo("src/lib/scheduler/jobs.ts");
cek(
  "klaimJob() memakai kondisi OR yang sama dengan SQL uji (neq berjalan / is null / lt batas)",
  kodeJobs.includes("status_terakhir.neq.berjalan") &&
    kodeJobs.includes("terakhir_jalan.is.null") &&
    kodeJobs.includes("terakhir_jalan.lt."),
);

cek("klaim pertama 'editorial' berhasil (1 baris)", (await klaimSql("editorial", 30)) === 1);
const j1 = await bacaJob("editorial");
cek(
  "sesudah klaim: status='berjalan' + terakhir_jalan terisi",
  j1.status_terakhir === "berjalan" && j1.terakhir_jalan !== null,
);
cek(
  "klaim kedua bersamaan DITOLAK (0 baris — lock dipegang run pertama)",
  (await klaimSql("editorial", 30)) === 0,
);
cek("selesaikan run pertama (berhasil)", (await selesaikanSql("editorial", true)) === 1);
const j2 = await bacaJob("editorial");
cek(
  "F6: sesudah selesai status='berhasil' + terakhir_jalan terisi",
  j2.status_terakhir === "berhasil" && j2.terakhir_jalan !== null,
);
const ts1 = new Date(j2.terakhir_jalan).getTime();
await new Promise((r) => setTimeout(r, 15));
await selesaikanSql("editorial", true);
const j2b = await bacaJob("editorial");
cek(
  "F6: run kedua memperbarui terakhir_jalan lagi (ts2 > ts1)",
  new Date(j2b.terakhir_jalan).getTime() > ts1,
  `ts1=${ts1} ts2=${new Date(j2b.terakhir_jalan).getTime()}`,
);
cek("klaim lagi sesudah selesai berhasil (1 baris)", (await klaimSql("editorial", 30)) === 1);
// Lock basi: 31 menit lalu -> bisa direbut.
await db.query(
  `update public.pf_scheduled_jobs set status_terakhir='berjalan', terakhir_jalan = now() - interval '31 minutes' where nama='editorial'`,
);
cek(
  "lock basi (31 mnt) bisa direbut run berikut (1 baris)",
  (await klaimSql("editorial", 30)) === 1,
);
// Lock segar: baru saja -> tidak bisa direbut.
await db.query(
  `update public.pf_scheduled_jobs set status_terakhir='berjalan', terakhir_jalan = now() where nama='editorial'`,
);
cek(
  "lock segar TIDAK bisa direbut (0 baris)",
  (await klaimSql("editorial", 30)) === 0,
);
await selesaikanSql("editorial", false, "uji gagal");
const j3 = await bacaJob("editorial");
cek(
  "run gagal: status='gagal' + error_terakhir tercatat + terakhir_jalan terisi",
  j3.status_terakhir === "gagal" &&
    j3.error_terakhir === "uji gagal" &&
    j3.terakhir_jalan !== null,
);
// Baris job tak ada -> klaim 0 baris (jalur fail-open, bukan 409 palsu).
cek(
  "klaim job tanpa baris ('digest') = 0 baris (lock tak tersedia, route tetap jalan)",
  (await klaimSql("digest", 30)) === 0 &&
    (await bacaJob("digest")) === null,
);

// Wiring statis: tiap endpoint cron memanggil klaim + selesai.
const ROUTE_JOB = {
  ingestion: "src/app/api/ingestion/jalankan/route.ts",
  editorial: "src/app/api/ai/jalankan/route.ts",
  brief: "src/app/api/ai/brief/route.ts",
  "data-analysis": "src/app/api/ai/data-analysis/route.ts",
  "terbitkan-terjadwal":
    "src/app/api/admin/artikel/terbitkan-terjadwal/route.ts",
};
for (const [job, rel] of Object.entries(ROUTE_JOB)) {
  const kode = bacaRepo(rel);
  cek(
    `route ${job}: klaimJob + selesaikanJob + 409 saat lock dipegang`,
    kode.includes("klaimJob(") &&
      kode.includes("selesaikanJob(") &&
      kode.includes(`"${job}"`) &&
      kode.includes("status: 409"),
  );
}

// ==================== (D) Backoff F12 (perilaku nyata) ====================
console.log("\n--- (D) Backoff gate F12 (terbitkanTerjadwal nyata) ---");

const { terbitkanTerjadwal, BACKOFF_GATE_JAM } = await import(
  "../src/lib/admin/editorial.ts"
);
cek("BACKOFF_GATE_JAM = 6", BACKOFF_GATE_JAM === 6);

// Adapter PGlite ringkas: hanya metode yang dipakai jalur
// terbitkanTerjadwal (listArtikel/getArtikel/getVerifikasiTerakhir/
// perbaruiArtikel/versi/audit) — SQL langsung, tanpa data dummy.
const KOLOM_ARTIKEL =
  "id, slug, judul, subjudul, ringkasan, isi, kategori_slug, subkategori_slug, " +
  "status_verifikasi, status, penulis_nama, penulis_id, sumber_url, gambar_url, " +
  "estimasi_baca_menit, kronologi, fakta_penting, data_pendukung, mengapa_penting, " +
  "dampak, belum_diketahui, dijadwalkan_pada, diterbitkan_pada, diterbitkan_oleh, " +
  "dibuat_pada, diperbarui_pada";
const KOLOM_ARTIKEL_SET = new Set([
  "slug", "judul", "subjudul", "ringkasan", "isi", "kategori_slug",
  "subkategori_slug", "status_verifikasi", "status", "penulis_nama",
  "penulis_id", "sumber_url", "gambar_url", "estimasi_baca_menit",
  "kronologi", "fakta_penting", "data_pendukung", "mengapa_penting",
  "dampak", "belum_diketahui", "dijadwalkan_pada", "diterbitkan_pada",
  "diterbitkan_oleh",
]);

class AdapterUji {
  constructor(db) {
    this.db = db;
  }
  async getArtikel({ id }) {
    const r = await this.db.query(
      `select ${KOLOM_ARTIKEL} from public.pf_articles where id = $1`,
      [id],
    );
    return r.rows[0] ?? null;
  }
  async listArtikel(filter) {
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const r = await this.db.query(
      `select ${KOLOM_ARTIKEL} from public.pf_articles where status = $1 order by dibuat_pada desc limit $2`,
      [filter.status, limit],
    );
    return { artikel: r.rows, total: r.rows.length, page: 1, limit };
  }
  async getVerifikasiTerakhir({ artikel_id }) {
    const r = await this.db.query(
      `select id, artikel_id, keputusan, catatan from public.pf_verification_records
        where artikel_id = $1 order by dibuat_pada desc limit 1`,
      [artikel_id],
    );
    return r.rows[0] ?? null;
  }
  async perbaruiArtikel({ id, patch }) {
    const kunci = Object.keys(patch).filter((k) => KOLOM_ARTIKEL_SET.has(k));
    if (kunci.length === 0) return this.getArtikel({ id });
    const set = kunci.map((k, i) => `${k} = $${i + 2}`).join(", ");
    const nilai = kunci.map((k) => patch[k]);
    const r = await this.db.query(
      `update public.pf_articles set ${set} where id = $1 returning ${KOLOM_ARTIKEL}`,
      [id, ...nilai],
    );
    return r.rows[0] ?? null;
  }
  async getVersiTerakhir({ artikel_id }) {
    const r = await this.db.query(
      `select id, artikel_id, versi, judul, isi, dibuat_oleh, dibuat_pada, catatan
         from public.pf_article_versions where artikel_id = $1 order by versi desc limit 1`,
      [artikel_id],
    );
    return r.rows[0] ?? null;
  }
  // Ditambah integrasi B1: gate terbit P0-2 memanggil
  // getReviewTerakhir — mock lama tidak punya metode ini sehingga
  // gate melempar TypeError (bukan GalatGateTerbit) dan artikel
  // VERIFIED tak pernah terbit di run F12. Cerminan adapter nyata
  // (supabase-adapter.ts getReviewTerakhir).
  async getReviewTerakhir({ artikel_id }) {
    const r = await this.db.query(
      `select id, artikel_id, reviewer_id, keputusan, catatan, dibuat_pada
         from public.pf_editorial_reviews where artikel_id = $1 order by dibuat_pada desc limit 1`,
      [artikel_id],
    );
    return r.rows[0] ?? null;
  }
  async simpanVersi(input) {
    const r = await this.db.query(
      `insert into public.pf_article_versions (artikel_id, versi, judul, isi, dibuat_oleh, catatan)
         values ($1, $2, $3, $4, $5, $6) returning id, artikel_id, versi, judul, isi, dibuat_oleh, dibuat_pada, catatan`,
      [
        input.artikel_id,
        input.versi,
        input.judul,
        input.isi,
        input.dibuat_oleh,
        input.catatan ?? null,
      ],
    );
    return r.rows[0];
  }
  async catatAudit(input) {
    await this.db.query(
      `insert into public.pf_audit_logs (aktor_id, aktor_email, aksi, entitas, entitas_id, sebelum, sesudah, ip)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
      [
        input.aktor_id,
        input.aktor_email,
        input.aksi,
        input.entitas,
        input.entitas_id,
        JSON.stringify(input.sebelum ?? null),
        JSON.stringify(input.sesudah ?? null),
        input.ip ?? null,
      ],
    );
  }
  async listAudit(filter) {
    const syarat = [];
    const param = [];
    if (filter.aksi) {
      param.push(filter.aksi);
      syarat.push(`aksi = $${param.length}`);
    }
    if (filter.entitas) {
      param.push(filter.entitas);
      syarat.push(`entitas = $${param.length}`);
    }
    const where = syarat.length ? `where ${syarat.join(" and ")}` : "";
    const r = await this.db.query(
      `select id,aktor_id,aktor_email,aksi,entitas,entitas_id,sebelum,sesudah,ip,dibuat_pada
         from public.pf_audit_logs ${where} order by dibuat_pada desc limit 100`,
      param,
    );
    return { log: r.rows, total: r.rows.length, page: 1, limit: 100 };
  }
}

const adapter = new AdapterUji(db);
const aktorUji = { id: null, email: "github_actions", ip: null };
await db.query(
  `insert into public.pf_categories (slug, nama) values ('nasional', 'Nasional') on conflict (slug) do nothing`,
);
const lampau = new Date(Date.now() - 3_600_000).toISOString();
async function buatTerjadwal(judul, verifikasi) {
  const a = await db.query(
    `insert into public.pf_articles (slug, judul, ringkasan, isi, kategori_slug, status_verifikasi, status, dijadwalkan_pada)
       values ($1, $2, 'Ringkasan uji.', 'Isi uji.', 'nasional', $3, 'terjadwal', $4) returning id`,
    [`uji-f12-${judul}`, `Artikel Uji F12 ${judul}`, verifikasi, lampau],
  );
  const id = a.rows[0].id;
  await db.query(
    `insert into public.pf_verification_records (artikel_id, keputusan, catatan) values ($1, $2, 'Catatan uji.')`,
    [id, verifikasi],
  );
  // Gate B1 (P0-2) WAJIB review 'setuju' — artikel VERIFIED tanpa
  // review tetap ditolak terbit. Beri review untuk VERIFIED saja;
  // UNCONFIRMED sengaja tanpa review (harus gagal gate).
  // Review disisipkan SESUDAH verification record agar tidak
  // kedaluwarsa (verifikasi tidak lebih baru dari review).
  if (verifikasi === "VERIFIED") {
    await db.query(
      `insert into public.pf_editorial_reviews (artikel_id, keputusan, catatan, reviewer_id) values ($1, 'setuju', 'Review uji.', null)`,
      [id],
    );
  }
  return id;
}
const idU = await buatTerjadwal("UNCONFIRMED", "UNCONFIRMED");
const idV = await buatTerjadwal("VERIFIED", "VERIFIED");
async function hitungPenandaGate(artikelId) {
  const r = await db.query(
    `select count(*)::int as n from public.pf_audit_logs
      where aksi = 'sistem.job' and entitas = 'pf_articles' and entitas_id = $1
        and sesudah ->> 'gagal_gate' = 'true'`,
    [artikelId],
  );
  return r.rows[0].n;
}

// Run 1: V terbit, U gagal gate + 1 penanda, belum ada backoff.
const h1 = await terbitkanTerjadwal(adapter, aktorUji);
cek(
  "F12 run 1: VERIFIED terbit, UNCONFIRMED dilewati, ditunda_backoff kosong",
  h1.diterbitkan.length === 1 &&
    h1.diterbitkan[0].id === idV &&
    h1.dilewati.length === 1 &&
    h1.dilewati[0].id === idU &&
    h1.ditunda_backoff.length === 0,
  `terbit=${h1.diterbitkan.length} lewati=${h1.dilewati.length} tunda=${h1.ditunda_backoff.length}`,
);
cek(
  "F12 run 1: 1 penanda gate ditulis untuk artikel gagal",
  (await hitungPenandaGate(idU)) === 1,
);
cek(
  "F12 run 1: artikel VERIFIED tetap terbit di DB",
  (await adapter.getArtikel({ id: idV })).status === "terbit",
);

// Run 2 (langsung): U ditunda backoff, TANPA penanda baru.
const h2 = await terbitkanTerjadwal(adapter, aktorUji);
cek(
  "F12 run 2 (langsung): artikel gagal gate DITUNDA, tidak dicoba ulang",
  h2.diterbitkan.length === 0 &&
    h2.dilewati.length === 0 &&
    h2.ditunda_backoff.length === 1 &&
    h2.ditunda_backoff[0].id === idU,
  `tunda=${h2.ditunda_backoff.length} alasan=${h2.ditunda_backoff[0]?.alasan?.slice(0, 60) ?? "-"}`,
);
cek(
  "F12 run 2: penanda TIDAK bertambah (backoff tidak memperpanjang diri)",
  (await hitungPenandaGate(idU)) === 1,
);
cek(
  "F12 run 2: coba_lagi_pada ~6 jam dari penanda",
  Math.abs(
    new Date(h2.ditunda_backoff[0].coba_lagi_pada).getTime() - Date.now() -
      6 * 3_600_000,
  ) < 120_000,
);

// Backdate penanda 7 jam -> run 3 mencoba lagi (dan gagal lagi).
await db.query(
  `update public.pf_audit_logs set dibuat_pada = now() - interval '7 hours'
    where aksi = 'sistem.job' and entitas_id = $1`,
  [idU],
);
const h3 = await terbitkanTerjadwal(adapter, aktorUji);
cek(
  "F12 run 3 (penanda 7 jam lalu): artikel dicoba lagi — dilewati, bukan ditunda",
  h3.dilewati.length === 1 &&
    h3.dilewati[0].id === idU &&
    h3.ditunda_backoff.length === 0,
  `terbit=${h3.diterbitkan.map((a) => a.id).join(",") || "-"} lewati=${h3.dilewati.map((a) => a.id).join(",") || "-"} tunda=${h3.ditunda_backoff.map((a) => a.id).join(",") || "-"} (idU=${idU} idV=${idV})`,
);
cek(
  "F12 run 3: penanda baru ditulis (total 2)",
  (await hitungPenandaGate(idU)) === 2,
);

// ==================== (E) Pemicu manual 8 job (F7) ====================
console.log("\n--- (E) Pemicu manual 8 job (F7) ---");

// Hermetik: hapus kunci service dari env proses ini agar
// pemicuJobManual tidak pernah menyentuh Supabase nyata —
// pencatatan baris job diuji di bagian (B)/(C) lewat SQL.
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;

register("./uji-tahap13c-loader.mjs", import.meta.url);
const { pemicuJobManual, DAFTAR_JOB_DIKENAL } = await import(
  "../src/lib/admin/kendali.ts"
);

cek(
  "DAFTAR_JOB_DIKENAL berisi 8 job",
  DAFTAR_JOB_DIKENAL.length === 8,
  DAFTAR_JOB_DIKENAL.map((j) => j.nama).join(", "),
);
cek(
  "5 job cron bisa_dipicu=true; digest/podcast/riset bisa_dipicu=false",
  DAFTAR_JOB_DIKENAL.filter((j) => j.bisa_dipicu).length === 5 &&
    ["digest", "podcast", "riset"].every(
      (n) =>
        DAFTAR_JOB_DIKENAL.find((j) => j.nama === n)?.bisa_dipicu === false,
    ),
);

// Server HTTP lokal sebagai "origin" — membuktikan pemicu manual
// memanggil route internal yang benar (tanpa server Next).
const hit = [];
const server = http.createServer((req, res) => {
  let badan = "";
  req.on("data", (c) => {
    badan += c;
  });
  req.on("end", () => {
    hit.push({ method: req.method, url: req.url, badan });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, hasil: "uji" }));
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const aktorUjiKendali = { id: null, email: "uji@contoh.id", ip: null };

const ROUTE_HARAP = {
  ingestion: "/api/ingestion/jalankan",
  editorial: "/api/ai/jalankan",
  brief: "/api/ai/brief",
  "data-analysis": "/api/ai/data-analysis",
  "terbitkan-terjadwal": "/api/admin/artikel/terbitkan-terjadwal",
};
for (const [job, path] of Object.entries(ROUTE_HARAP)) {
  hit.length = 0;
  let hasil = null;
  let galat = "";
  try {
    hasil = await pemicuJobManual(job, aktorUjiKendali, origin, null);
  } catch (e) {
    galat = e instanceof Error ? e.message : String(e);
  }
  // Kontrak BARU (Gelombang B1, P1-3/T10): audit 'sistem.job'
  // fail-closed — tanpa service key, pemicu manual MELEMPAR
  // sesudah job dipanggil (job sudah terlanjur berjalan, tidak
  // bisa dibatalkan; yang gagal hanyalah pencatatannya, dan
  // kegagalan itu terlihat sebagai galat, bukan sukses diam-diam).
  // Di sini kunci service sengaja dihapus (hermetik), jadi yang
  // diuji: (a) POST ke route yang benar tetap terjadi, (b) galat
  // audit terlihat. Jalur sukses penuh (ok:true + audit tercatat)
  // butuh service client yang terjangkau — diuji di staging/live.
  cek(
    `pemicu manual '${job}': POST ${path} tetap terjadi + galat audit terlihat (fail-closed, tanpa service key)`,
    galat !== "" &&
      /service|audit|kunci/i.test(galat) &&
      hasil === null &&
      hit.length === 1 &&
      hit[0].method === "POST" &&
      hit[0].url === path,
    galat || `hit=${JSON.stringify(hit)}`,
  );
}
for (const job of ["digest", "podcast", "riset"]) {
  let galat = "";
  try {
    await pemicuJobManual(job, aktorUjiKendali, origin, null);
  } catch (e) {
    galat = e instanceof Error ? e.message : String(e);
  }
  cek(
    `pemicu manual '${job}': ditolak jujur (belum ada endpoint)`,
    galat.includes("belum bisa dipicu"),
    galat.slice(0, 100),
  );
}
{
  let galat = "";
  try {
    await pemicuJobManual("tidak-ada", aktorUjiKendali, origin, null);
  } catch (e) {
    galat = e instanceof Error ? e.message : String(e);
  }
  cek(
    "pemicu manual job tak dikenal: ditolak ('tidak dikenal')",
    galat.includes("tidak dikenal"),
    galat.slice(0, 100),
  );
}
server.close();

const kodeJalankan = bacaRepo("src/app/api/admin/kendali/jalankan/route.ts");
cek(
  "route /api/admin/kendali/jalankan memetakan 'belum bisa dipicu' -> 400",
  kodeJalankan.includes("belum bisa dipicu") &&
    kodeJalankan.includes("status: 400"),
);
const kodeJobsNama = bacaRepo(
  "src/app/api/admin/sistem/jobs/[nama]/route.ts",
);
cek(
  "route /api/admin/sistem/jobs/[nama] memetakan data-analysis + terbitkan-terjadwal",
  kodeJobsNama.includes('"/api/ai/data-analysis"') &&
    kodeJobsNama.includes('"/api/admin/artikel/terbitkan-terjadwal"'),
);
const kodeKendali = bacaRepo("src/lib/admin/kendali.ts");
cek(
  "kendali.ts ROUTE_JOB memuat 5 route internal yang benar",
  ["/api/ingestion/jalankan", "/api/ai/jalankan", "/api/ai/brief", "/api/ai/data-analysis", "/api/admin/artikel/terbitkan-terjadwal"].every(
    (p) => kodeKendali.includes(`"${p}"`),
  ),
);

// ==================== (F) Feature flags ====================
console.log("\n--- (F) Feature flags (penegakan) ---");

const { uraiNilaiFlag } = await import("../src/lib/scheduler/flags.ts");
const kasusFlag = [
  [{ nilai: true }, "boolean", false, true],
  [{ nilai: false }, "boolean", true, false],
  [true, "boolean", false, true],
  ["x", "boolean", true, true],
  [null, "boolean", true, true],
  [{ nilai: 5 }, "boolean", false, false],
  [{ nilai: "Halo" }, "teks", "", "Halo"],
  ["abc", "teks", "", "abc"],
  [123, "teks", "d", "d"],
  [null, "teks", "d", "d"],
];
for (const [mentah, jenis, bawaan, harap] of kasusFlag) {
  cek(
    `uraiNilaiFlag(${JSON.stringify(mentah)}, ${jenis}, ${JSON.stringify(bawaan)}) = ${JSON.stringify(harap)}`,
    uraiNilaiFlag(mentah, jenis, bawaan) === harap,
  );
}

const kodeIngestion = bacaRepo("src/app/api/ingestion/jalankan/route.ts");
cek(
  "flag ingestion_aktif ditegakkan di /api/ingestion/jalankan (503 bila nonaktif)",
  kodeIngestion.includes('bacaFlag(service, "ingestion_aktif", true)') &&
    kodeIngestion.includes("Ingestion dinonaktifkan oleh admin"),
);
const kodePipeline = bacaRepo("src/app/api/ai/jalankan/route.ts");
cek(
  "flag pipeline_editorial_aktif ditegakkan di /api/ai/jalankan (503 bila nonaktif)",
  kodePipeline.includes(
    'bacaFlag(klienFlag, "pipeline_editorial_aktif", true)',
  ) && kodePipeline.includes("Pipeline editorial dinonaktifkan oleh admin"),
);
const kodeDaftar = bacaRepo("src/app/daftar/page.tsx");
cek(
  "flag pendaftaran_terbuka ditegakkan di /daftar (form tidak tampil bila ditutup)",
  kodeDaftar.includes("bacaPendaftaranTerbuka") &&
    kodeDaftar.includes("Pendaftaran ditutup") &&
    kodeDaftar.includes("DaftarForm"),
);
cek(
  "form pendaftaran pindah ke DaftarForm (client) — page.tsx kini server component",
  bacaRepo("src/components/DaftarForm.tsx").includes("supabase.auth.signUp") &&
    !kodeDaftar.includes('"use client"'),
);
const kodeHeader = bacaRepo("src/components/Header.tsx");
cek(
  "flag mode_pemeliharaan dibaca Header (banner pengumuman)",
  kodeHeader.includes("bacaPemeliharaan") &&
    kodeHeader.includes("pengumuman-pemeliharaan"),
);
cek(
  "CSS .pengumuman-pemeliharaan ada",
  bacaRepo("src/app/globals.css").includes(".pengumuman-pemeliharaan"),
);
cek(
  "kendali.ts tidak lagi mengklaim flag 'BELUM disambungkan'",
  !kodeKendali.includes("BELUM disambungkan"),
);
cek(
  "CATATAN_F6 baru: terakhir_jalan diperbarui run cron",
  kodeKendali.includes("run cron GitHub Actions (klaim lock + selesai job"),
);

// ==================== Ringkasan ====================
console.log(`\nRingkasan Tahap 13C: ${lolos} lolos, ${gagal} gagal.`);
if (gagal > 0) {
  console.log("HASIL: GAGAL — ada asersi yang tidak lolos.");
  process.exit(1);
} else {
  console.log("HASIL: SEMUA LOLOS.");
  process.exit(0);
}
