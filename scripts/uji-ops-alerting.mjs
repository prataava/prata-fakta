// Uji Ops Center + Alerting (Fase 12 + 15, Worker G).
// PGlite + mock (tanpa server Next, tanpa deploy, tanpa data
// dummy operasional).
//
// Yang diuji:
//   (A) Migrasi v25 di PGlite: tabel + indeks + policy + CHECK;
//       dedup aktif (indeks parsial menolak duplikat aktif,
//       mengizinkan sesudah diakui); additive-only (tidak
//       menyentuh tabel lain).
//   (B) Evaluasi murni 10 kejadian: snapshot "sakit" -> 12 alert
//       mencakup 10 kejadian mandat (scheduler_mati 3 job);
//       snapshot "sehat" -> 0 alert palsu; digest/podcast/riset
//       yang belum pernah jalan TIDAK memicu scheduler_mati.
//   (C) Rekam + cooldown + dedup (rekamAlert dengan klien palsu):
//       12 kandidat -> 12 tercatat + 12 cermin pf_app_errors;
//       dipanggil 2x -> panggilan kedua 0 baru; alert aktif
//       memblokir pencatatan ulang; sesudah diakui + cooldown
//       lewat -> boleh tercatat lagi; sebelum cooldown lewat
//       tetap diblokir.
//   (D) Kontrol idempotensi: aktifSesudahKontrol murni (2x =
//       hasil sama); SQL UPDATE pause/disable 2x di PGlite =
//       keadaan sama, 1 baris; ack alert 2x -> update kedua 0
//       baris; reprocess: 5 job runnable memanggil route yang
//       benar (server HTTP lokal, pola uji-tahap13c E), 3 job
//       tanpa backend ditolak 'belum bisa dipicu' SEBELUM fetch
//       apa pun; job/aksi tak dikenal ditolak.
//   (E) Penjaga non-admin (uji statis): ketiga route baru
//       memanggil autentikasiAdmin + rate limiter + cekOrigin
//       SEBELUM logika; kontrol + evaluasi memakai
//       ROLES.SUPER_ADMIN; guard.ts mengembalikan 401 tanpa
//       login dan 403 tanpa peran (semantik yang dibaca dari
//       kode guard — bukan dari server live).
//   (F) Halaman: /admin/ops memuat 5 panel + tanpa Date.now() /
//       skrip inline di render; NavAdmin menautkan /admin/ops;
//       /admin/kendali menampilkan alasan jujur per job tanpa
//       pemicu + tombol kontrol.
// Yang TIDAK diuji di sini (dilaporkan sebagai belum diuji):
// run live GitHub Actions, HTTP end-to-end lewat server Next,
// render browser, dan push VAPID (belum terverifikasi di
// produksi — lihat KEBIJAKAN-ALERTING.md).
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { register } from "node:module";

const require = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = require("@electric-sql/pglite");

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

function bacaRepo(relatif) {
  return fs.readFileSync(`${DIR_REPO}/${relatif}`, "utf8");
}

const db = new PGlite();

// ==================== (A) Migrasi v25 ====================
console.log("\n--- (A) Migrasi v25 pf_alerts ---");

await db.exec(`create schema if not exists auth;`);
await db.exec(
  `create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);`,
);
await db.exec(`create role anon nologin;`);
await db.exec(`create role authenticated nologin;`);
await db.exec(`create role service_role nologin;`);
await db.exec(
  `create or replace function public.pf_has_role(p_role text) returns boolean language sql stable as $$ select true $$;`,
);

const sqlV25 = fs.readFileSync(
  `${DIR_MIGRASI}/20261117_pf_v25_alerts.sql`,
  "utf8",
);
{
  let okV25 = true;
  try {
    await db.exec(sqlV25);
  } catch (e) {
    okV25 = false;
    console.log(`GAGAL: migrasi v25\n  -> ${String(e.message).split("\n")[0]}`);
    gagal++;
  }
  cek("migrasi v25 diterapkan tanpa galat", okV25);
}
cek(
  "tabel pf_alerts ada (1)",
  Number(
    (
      await db.query(
        `select count(*) n from pg_tables where schemaname='public' and tablename='pf_alerts'`,
      )
    ).rows[0].n,
  ) === 1,
);
cek(
  "indeks pf_alerts lengkap (pkey + dedup aktif + kejadian + status)",
  (
    await db.query(
      `select indexname from pg_indexes where tablename='pf_alerts' order by 1`,
    )
  ).rows
    .map((r) => r.indexname)
    .join(",") ===
    "pf_alerts_dedup_aktif_idx,pf_alerts_kejadian_idx,pf_alerts_pkey,pf_alerts_status_idx",
);
cek(
  "1 policy baca staf di pf_alerts",
  Number(
    (
      await db.query(
        `select count(*) n from pg_policies where tablename='pf_alerts'`,
      )
    ).rows[0].n,
  ) === 1,
);
cek(
  "v25 additive-only: tidak ada ALTER/DROP pada tabel lain",
  (() => {
    // Komentar (-- ...) dilepas dulu: catatan rollback di header
    // menyebut DROP TABLE sebagai dokumentasi, bukan pernyataan.
    const tanpaKomentar = sqlV25
      .split("\n")
      .filter((b) => !b.trimStart().startsWith("--"))
      .join("\n");
    return (
      !/alter table public\.pf_(?!alerts)/i.test(tanpaKomentar) &&
      !/drop table/i.test(tanpaKomentar) &&
      (tanpaKomentar.match(/create table if not exists public\.pf_alerts/g) ?? [])
        .length === 1
    );
  })(),
);
// CHECK: 10 kejadian diterima, ke-11 ditolak.
{
  const sepuluh = [
    "scheduler_mati",
    "ingestion_gagal",
    "gdelt_429",
    "rss_mati",
    "source_stale",
    "db_error",
    "antrean_macet",
    "pipeline_gagal",
    "brief_tak_terbentuk",
    "publikasi_gagal",
  ];
  let diterima = 0;
  for (const k of sepuluh) {
    try {
      await db.query(
        `insert into pf_alerts (kejadian, judul, kunci_dedup) values ($1, 'uji', $2)`,
        [k, `uji:${k}`],
      );
      diterima++;
    } catch {
      // biarkan diterima menghitung yang gagal
    }
  }
  cek("CHECK menerima 10 kejadian mandat", diterima === 10);
  let ditolak = false;
  try {
    await db.query(
      `insert into pf_alerts (kejadian, judul, kunci_dedup) values ('kejadian_karangan', 'uji', 'uji:karangan')`,
    );
  } catch {
    ditolak = true;
  }
  cek("CHECK menolak kejadian di luar 10 mandat", ditolak);
  // Bersihkan 10 baris uji agar tidak mengganggu uji dedup.
  await db.query(`delete from pf_alerts`);
}
// Dedup aktif: duplikat kunci_dedup saat aktif ditolak; sesudah
// diakui, kunci yang sama diterima.
{
  await db.query(
    `insert into pf_alerts (kejadian, judul, kunci_dedup) values ('db_error', 'uji', 'db_error:db')`,
  );
  let duplikatDitolak = false;
  try {
    await db.query(
      `insert into pf_alerts (kejadian, judul, kunci_dedup) values ('db_error', 'uji 2', 'db_error:db')`,
    );
  } catch (e) {
    duplikatDitolak = String(e.message).includes("pf_alerts_dedup_aktif_idx");
  }
  cek(
    "indeks parsial menolak duplikat alert AKTIF (kunci sama)",
    duplikatDitolak,
  );
  await db.query(
    `update pf_alerts set status='diakui' where kunci_dedup='db_error:db'`,
  );
  let diterimaLagi = true;
  try {
    await db.query(
      `insert into pf_alerts (kejadian, judul, kunci_dedup) values ('db_error', 'uji 3', 'db_error:db')`,
    );
  } catch {
    diterimaLagi = false;
  }
  cek(
    "kunci sama diterima lagi sesudah alert lama diakui",
    diterimaLagi,
  );
  await db.query(`delete from pf_alerts`);
}
// Ack idempoten di level SQL: update kedua 0 baris.
{
  await db.query(
    `insert into pf_alerts (id, kejadian, judul, kunci_dedup) values ('11111111-1111-1111-1111-111111111111', 'db_error', 'uji', 'db_error:ack')`,
  );
  const pertama = await db.query(
    `update pf_alerts set status='diakui' where id='11111111-1111-1111-1111-111111111111' and status='aktif'`,
  );
  const kedua = await db.query(
    `update pf_alerts set status='diakui' where id='11111111-1111-1111-1111-111111111111' and status='aktif'`,
  );
  cek(
    "akui alert idempoten: update pertama 1 baris, kedua 0 baris",
    pertama.affectedRows === 1 && kedua.affectedRows === 0,
  );
  await db.query(`delete from pf_alerts`);
}

// ==================== Impor kode nyata ====================
register("./uji-tahap13c-loader.mjs", import.meta.url);
const {
  evaluasiAlert,
  perluRekam,
  rekamAlert,
  ATURAN_ALERT,
} = await import("../src/lib/admin/alerts.ts");
const {
  aktifSesudahKontrol,
  kontrolJob,
  pemicuJobManual,
  DAFTAR_JOB_DIKENAL,
  AKSI_KONTROL_VALID,
} = await import("../src/lib/admin/kendali.ts");

// ==================== (B) Evaluasi 10 kejadian ====================
console.log("\n--- (B) Evaluasi 10 kejadian mandat ---");

cek(
  "ATURAN_ALERT memuat tepat 10 kejadian",
  ATURAN_ALERT.length === 10,
  ATURAN_ALERT.map((a) => a.kejadian).join(", "),
);

/** Snapshot "sakit": semua 10 kejadian harus menyala. */
function snapshotSakit() {
  const sekarang = "2026-11-17T10:00:00.000Z"; // 17.00 WIB
  const mntLalu = (m) =>
    new Date(Date.parse(sekarang) - m * 60000).toISOString();
  return {
    sekarang,
    tanggal_wib: "2026-11-17",
    jam_wib_menit: 1020,
    jobs: [
      { nama: "ingestion", aktif: true, terakhir_jalan: mntLalu(30), status_terakhir: "berhasil", error_terakhir: null },
      { nama: "editorial", aktif: true, terakhir_jalan: mntLalu(360), status_terakhir: "berhasil", error_terakhir: null },
      { nama: "brief", aktif: true, terakhir_jalan: mntLalu(1560), status_terakhir: "berhasil", error_terakhir: null },
      { nama: "data-analysis", aktif: true, terakhir_jalan: mntLalu(8 * 1440), status_terakhir: "berhasil", error_terakhir: null },
      { nama: "terbitkan-terjadwal", aktif: true, terakhir_jalan: mntLalu(30), status_terakhir: "gagal", error_terakhir: "Gate verifikasi gagal untuk 2 artikel." },
      { nama: "digest", aktif: true, terakhir_jalan: null, status_terakhir: "belum_pernah", error_terakhir: null },
      { nama: "podcast", aktif: true, terakhir_jalan: null, status_terakhir: "belum_pernah", error_terakhir: null },
      { nama: "riset", aktif: true, terakhir_jalan: null, status_terakhir: "belum_pernah", error_terakhir: null },
    ],
    ingestion_runs: [
      {
        id: "22222222-2222-2222-2222-222222222222",
        sumber_id: "33333333-3333-3333-3333-333333333333",
        sumber_nama: "GDELT",
        status: "gagal",
        error: "GDELT 429 Too Many Requests — rate limit",
        dimulai_pada: mntLalu(10),
      },
    ],
    ai_runs: [
      { id: "44444444-4444-4444-4444-444444444444", agen: "fact_verification", status: "gagal", error: "Timeout pipeline.", dimulai_pada: mntLalu(10) },
      { id: "55555555-5555-5555-5555-555555555555", agen: "article_writing", status: "berhasil", error: null, dimulai_pada: mntLalu(20 * 60) },
    ],
    sources: [
      {
        id: "33333333-3333-3333-3333-333333333333",
        nama: "GDELT",
        jenis: "rss",
        aktif: true,
        terakhir_cek: mntLalu(10),
        status_terakhir: "gagal",
        terakhir_diambil: mntLalu(120),
      },
      {
        id: "66666666-6666-6666-6666-666666666666",
        nama: "Antara",
        jenis: "rss",
        aktif: true,
        terakhir_cek: mntLalu(1500),
        status_terakhir: "berhasil",
        terakhir_diambil: mntLalu(1500),
      },
    ],
    raw_baru_lama: 3,
    raw_baru_total: 5,
    brief_hari_ini_terbit: false,
    app_errors: [
      { sumber: "supabase", pesan: "Supabase connection failed.", kode: null, dibuat_pada: mntLalu(5) },
    ],
  };
}

const sakit = evaluasiAlert(snapshotSakit());
const kejadianSakit = [...new Set(sakit.map((k) => k.kejadian))].sort();
cek(
  "snapshot sakit: 10 kejadian mandat menyala",
  kejadianSakit.length === 10 &&
    [
      "antrean_macet",
      "brief_tak_terbentuk",
      "db_error",
      "gdelt_429",
      "ingestion_gagal",
      "pipeline_gagal",
      "publikasi_gagal",
      "rss_mati",
      "scheduler_mati",
      "source_stale",
    ].every((k, i) => kejadianSakit[i] === k),
  `kejadian: ${kejadianSakit.join(", ")} (total kandidat ${sakit.length})`,
);
cek(
  "snapshot sakit: scheduler_mati 3 job (editorial, brief, data-analysis) — bukan 1 alert gabungan",
  sakit.filter((k) => k.kejadian === "scheduler_mati").length === 3,
);
cek(
  "snapshot sakit: total kandidat 12 (3 scheduler + 9 lainnya)",
  sakit.length === 12,
  `total ${sakit.length}`,
);

/** Snapshot "sehat": 0 alert palsu. */
function snapshotSehat() {
  const sekarang = "2026-11-17T10:00:00.000Z";
  const mntLalu = (m) =>
    new Date(Date.parse(sekarang) - m * 60000).toISOString();
  return {
    sekarang,
    tanggal_wib: "2026-11-17",
    jam_wib_menit: 1020,
    jobs: [
      { nama: "ingestion", aktif: true, terakhir_jalan: mntLalu(20), status_terakhir: "berhasil", error_terakhir: null },
      { nama: "editorial", aktif: true, terakhir_jalan: mntLalu(60), status_terakhir: "berhasil", error_terakhir: null },
      { nama: "brief", aktif: true, terakhir_jalan: mntLalu(600), status_terakhir: "berhasil", error_terakhir: null },
      { nama: "data-analysis", aktif: true, terakhir_jalan: mntLalu(1440), status_terakhir: "berhasil", error_terakhir: null },
      { nama: "terbitkan-terjadwal", aktif: true, terakhir_jalan: mntLalu(40), status_terakhir: "berhasil", error_terakhir: null },
      // Ketiga job tanpa workflow: belum pernah jalan = normal.
      { nama: "digest", aktif: true, terakhir_jalan: null, status_terakhir: "belum_pernah", error_terakhir: null },
      { nama: "podcast", aktif: true, terakhir_jalan: null, status_terakhir: "belum_pernah", error_terakhir: null },
      { nama: "riset", aktif: true, terakhir_jalan: null, status_terakhir: "belum_pernah", error_terakhir: null },
    ],
    ingestion_runs: [
      { id: "77777777-7777-7777-7777-777777777777", sumber_id: null, sumber_nama: "Antara", status: "selesai", error: null, dimulai_pada: mntLalu(20) },
    ],
    ai_runs: [
      { id: "88888888-8888-8888-8888-888888888888", agen: "article_writing", status: "berhasil", error: null, dimulai_pada: mntLalu(60) },
    ],
    sources: [
      { id: "66666666-6666-6666-6666-666666666666", nama: "Antara", jenis: "rss", aktif: true, terakhir_cek: mntLalu(20), status_terakhir: "berhasil", terakhir_diambil: mntLalu(20) },
    ],
    raw_baru_lama: 0,
    raw_baru_total: 2,
    brief_hari_ini_terbit: true,
    app_errors: [],
  };
}

const sehat = evaluasiAlert(snapshotSehat());
cek("snapshot sehat: 0 alert palsu", sehat.length === 0, `dapat ${sehat.length}`);
cek(
  "snapshot sehat: digest/podcast/riset tak pernah jalan TIDAK memicu scheduler_mati",
  !sehat.some(
    (k) =>
      k.kejadian === "scheduler_mati" &&
      ["digest", "podcast", "riset"].some((j) =>
        String(k.kunci_dedup).includes(j),
      ),
  ),
);
// Brief sebelum 06.00 WIB tanpa brief terbit = belum waktunya.
{
  const pagi = snapshotSehat();
  pagi.jam_wib_menit = 300; // 05.00 WIB
  pagi.brief_hari_ini_terbit = false;
  cek(
    "brief belum terbit sebelum 06.00 WIB bukan alert",
    evaluasiAlert(pagi).length === 0,
  );
}

// ==================== (C) Rekam + cooldown + dedup ====================
console.log("\n--- (C) Rekam + cooldown + dedup ---");

// Klien palsu (subset Supabase JS yang dipakai rekamAlert).
// dibuat_pada baris yang disisipkan memakai "sekarang" uji
// (T0) — meniru default now() DB pada saat evaluasi; memakai
// jam dinding asli akan mengacaukan uji cooldown.
function buatKlienPalsu(sekarangIso) {
  const tabel = { pf_alerts: [], pf_app_errors: [] };
  let n = 0;
  const klien = {
    _tabel: tabel,
    from(nama) {
      const baris = tabel[nama];
      const pembangun = {
        _mode: null,
        _baris: null,
        select() {
          this._mode = "select";
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        eq() {
          return this;
        },
        insert(r) {
          this._mode = "insert";
          this._baris = r;
          return this;
        },
        then(resolve) {
          if (this._mode === "insert") {
            const simpan = {
              id: `palsu-${++n}`,
              ...this._baris,
              dibuat_pada: this._baris.dibuat_pada ?? sekarangIso,
            };
            baris.push(simpan);
            resolve({ data: [simpan], error: null });
          } else {
            resolve({ data: [...baris], error: null });
          }
        },
      };
      return pembangun;
    },
  };
  return klien;
}

const T0 = "2026-11-17T10:00:00.000Z";
const klienPalsu = buatKlienPalsu(T0);
const rekam1 = await rekamAlert(sakit, klienPalsu, T0);
cek(
  "rekam 12 kandidat sakit: 12 tercatat, 0 dilewati, 0 gagal",
  rekam1.direkam.length === 12 &&
    rekam1.dilewati_cooldown.length === 0 &&
    rekam1.gagal.length === 0,
  `direkam=${rekam1.direkam.length} dilewati=${rekam1.dilewati_cooldown.length} gagal=${rekam1.gagal.length}`,
);
cek(
  "cermin pf_app_errors: 12 baris (satu per alert)",
  klienPalsu._tabel.pf_app_errors.length === 12 &&
    klienPalsu._tabel.pf_app_errors.every((r) =>
      String(r.sumber).startsWith("alert/"),
    ),
);
const rekam2 = await rekamAlert(sakit, klienPalsu, T0);
cek(
  "rekam 2x (tanpa perubahan data): panggilan kedua 0 baru, 12 dilewati",
  rekam2.direkam.length === 0 && rekam2.dilewati_cooldown.length === 12,
  `direkam=${rekam2.direkam.length} dilewati=${rekam2.dilewati_cooldown.length}`,
);
// Cooldown murni (perluRekam): aktif memblokir; sesudah diakui +
// cooldown lewat -> boleh; sebelum cooldown lewat -> tetap blokir.
{
  const kandidatDb = sakit.find((k) => k.kejadian === "db_error");
  const riwayatAktif = [
    { kejadian: "db_error", kunci_dedup: "db_error:db", status: "aktif", dibuat_pada: T0 },
  ];
  cek(
    "perluRekam: alert AKTIF dengan dedup sama memblokir",
    perluRekam(riwayatAktif, kandidatDb, T0) === false,
  );
  const riwayatDiakuiBaru = [
    { kejadian: "db_error", kunci_dedup: "db_error:db", status: "diakui", dibuat_pada: T0 },
  ];
  cek(
    "perluRekam: sesudah diakui tapi cooldown (60 mnt) belum lewat -> tetap blokir",
    perluRekam(riwayatDiakuiBaru, kandidatDb, "2026-11-17T10:30:00.000Z") === false,
  );
  cek(
    "perluRekam: sesudah diakui + cooldown lewat (61 mnt) -> boleh",
    perluRekam(riwayatDiakuiBaru, kandidatDb, "2026-11-17T11:01:00.000Z") === true,
  );
}

// ==================== (D) Kontrol idempotensi ====================
console.log("\n--- (D) Kontrol antrean idempoten ---");

cek(
  "DAFTAR_JOB_DIKENAL berisi 8 job; 5 bisa dipicu, 3 tidak",
  DAFTAR_JOB_DIKENAL.length === 8 &&
    DAFTAR_JOB_DIKENAL.filter((j) => j.bisa_dipicu).length === 5 &&
    ["digest", "podcast", "riset"].every(
      (n) =>
        DAFTAR_JOB_DIKENAL.find((j) => j.nama === n)?.bisa_dipicu === false &&
        typeof DAFTAR_JOB_DIKENAL.find((j) => j.nama === n)
          ?.alasan_tanpa_pemicu === "string",
    ),
);
cek(
  "AKSI_KONTROL_VALID: pause/resume/disable/enable/reprocess",
  AKSI_KONTROL_VALID.join(",") ===
    "pause,resume,disable,enable,reprocess",
);
for (const [aksi, harap] of [
  ["pause", false],
  ["disable", false],
  ["resume", true],
  ["enable", true],
  ["reprocess", null],
]) {
  const sekali = aktifSesudahKontrol(aksi, true);
  const duaKali = aktifSesudahKontrol(
    aksi,
    sekali === null ? true : sekali,
  );
  cek(
    `aktifSesudahKontrol('${aksi}') idempoten (2x = ${JSON.stringify(harap)})`,
    sekali === harap && duaKali === harap,
  );
}
// SQL UPDATE pause/disable 2x di PGlite = keadaan sama, 1 baris.
{
  await db.exec(
    `create table if not exists pf_scheduled_jobs (id uuid primary key default gen_random_uuid(), nama text unique, aktif boolean not null default true, terakhir_jalan timestamptz, status_terakhir text, error_terakhir text);`,
  );
  await db.query(
    `insert into pf_scheduled_jobs (nama, aktif) values ('ingestion', true) on conflict (nama) do nothing`,
  );
  await db.query(
    `update pf_scheduled_jobs set aktif = false where nama = 'ingestion'`,
  );
  await db.query(
    `update pf_scheduled_jobs set aktif = false where nama = 'ingestion'`,
  );
  const sesudahPause = await db.query(
    `select aktif from pf_scheduled_jobs where nama='ingestion'`,
  );
  await db.query(
    `update pf_scheduled_jobs set aktif = true where nama = 'ingestion'`,
  );
  await db.query(
    `update pf_scheduled_jobs set aktif = true where nama = 'ingestion'`,
  );
  const sesudahResume = await db.query(
    `select aktif, count(*) n from pf_scheduled_jobs where nama='ingestion' group by aktif`,
  );
  cek(
    "UPDATE pause 2x: tetap nonaktif",
    sesudahPause.rows[0].aktif === false,
  );
  cek(
    "UPDATE resume 2x: tetap aktif, tetap 1 baris",
    sesudahResume.rows[0].aktif === true &&
      Number(sesudahResume.rows[0].n) === 1,
  );
}
// Reprocess: hermetik (hapus kunci service — pola uji-tahap13c E).
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
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
const aktorUji = { id: null, email: "uji@contoh.id", ip: null };
{
  // Reprocess job runnable: POST ke route benar + galat audit
  // terlihat (fail-closed tanpa service key — kontrak B1).
  hit.length = 0;
  let galat = "";
  try {
    await kontrolJob("ingestion", "reprocess", aktorUji, origin, null);
  } catch (e) {
    galat = e instanceof Error ? e.message : String(e);
  }
  cek(
    "kontrol reprocess 'ingestion': POST /api/ingestion/jalankan tetap terjadi + galat audit terlihat",
    hit.length === 1 &&
      hit[0].method === "POST" &&
      hit[0].url === "/api/ingestion/jalankan" &&
      /service|audit|kunci/i.test(galat),
    galat.slice(0, 100),
  );
}
for (const job of ["digest", "podcast", "riset"]) {
  hit.length = 0;
  let galat = "";
  try {
    await kontrolJob(job, "reprocess", aktorUji, origin, null);
  } catch (e) {
    galat = e instanceof Error ? e.message : String(e);
  }
  cek(
    `kontrol reprocess '${job}': ditolak 'belum bisa dipicu' SEBELUM fetch (0 HTTP hit)`,
    galat.includes("belum bisa dipicu") && hit.length === 0,
    galat.slice(0, 100),
  );
}
{
  let galat = "";
  try {
    await kontrolJob("tidak-ada", "pause", aktorUji, origin, null);
  } catch (e) {
    galat = e instanceof Error ? e.message : String(e);
  }
  cek(
    "kontrol job tak dikenal: ditolak ('tidak dikenal')",
    galat.includes("tidak dikenal"),
  );
}
{
  let galat = "";
  try {
    await kontrolJob("ingestion", "aksi-karangan", aktorUji, origin, null);
  } catch (e) {
    galat = e instanceof Error ? e.message : String(e);
  }
  cek(
    "kontrol aksi tak dikenal: ditolak ('tidak dikenal')",
    galat.includes("tidak dikenal"),
  );
}
{
  // pemicuJobManual langsung (jalur /api/admin/kendali/jalankan):
  // 3 job tanpa backend tetap ditolak jujur.
  let galat = "";
  try {
    await pemicuJobManual("podcast", aktorUji, origin, null);
  } catch (e) {
    galat = e instanceof Error ? e.message : String(e);
  }
  cek(
    "pemicuJobManual 'podcast': ditolak 'belum bisa dipicu'",
    galat.includes("belum bisa dipicu"),
  );
}
server.close();

// ==================== (E) Penjaga non-admin (statis) ====================
console.log("\n--- (E) Penjaga non-admin (uji statis) ---");

const kodeKontrol = bacaRepo("src/app/api/admin/kendali/kontrol/route.ts");
cek(
  "route kontrol: autentikasiAdmin SUPER_ADMIN + rate limiter + cekOrigin sebelum logika",
  kodeKontrol.includes("autentikasiAdmin(req, ROLES.SUPER_ADMIN)") &&
    kodeKontrol.includes("buatRateLimiterAdmin()") &&
    kodeKontrol.includes("cekOrigin(req)") &&
    kodeKontrol.indexOf("autentikasiAdmin(req, ROLES.SUPER_ADMIN)") <
      kodeKontrol.indexOf("kontrolJob("),
);
cek(
  "route kontrol: 'belum bisa dipicu' -> 400, 'tidak dikenal' -> 400, 'tidak ditemukan' -> 404",
  kodeKontrol.includes("belum bisa dipicu") &&
    kodeKontrol.includes("tidak dikenal") &&
    kodeKontrol.includes("tidak ditemukan") &&
    kodeKontrol.includes("status: 400") &&
    kodeKontrol.includes("status: 404"),
);
const kodeEvaluasi = bacaRepo("src/app/api/admin/alerts/evaluasi/route.ts");
cek(
  "route evaluasi alert: autentikasiAdmin SUPER_ADMIN + rate limiter + cekOrigin",
  kodeEvaluasi.includes("autentikasiAdmin(req, ROLES.SUPER_ADMIN)") &&
    kodeEvaluasi.includes("buatRateLimiterAdmin()") &&
    kodeEvaluasi.includes("cekOrigin(req)"),
);
const kodeAkui = bacaRepo("src/app/api/admin/alerts/[id]/akui/route.ts");
cek(
  "route akui alert: autentikasiAdmin (staf) + rate limiter + cekOrigin",
  kodeAkui.includes("autentikasiAdmin(req)") &&
    kodeAkui.includes("buatRateLimiterAdmin()") &&
    kodeAkui.includes("cekOrigin(req)"),
);
const kodeJalankan = bacaRepo("src/app/api/admin/kendali/jalankan/route.ts");
cek(
  "route jalankan: tetap SUPER_ADMIN + 'belum bisa dipicu' -> 400",
  kodeJalankan.includes("autentikasiAdmin(req, ROLES.SUPER_ADMIN)") &&
    kodeJalankan.includes("belum bisa dipicu"),
);
const kodeGuard = bacaRepo("src/lib/admin/guard.ts");
cek(
  "guard autentikasiAdmin: 401 tanpa login, 403 tanpa peran / akun dibatasi",
  kodeGuard.includes('status: 401') &&
    kodeGuard.includes('status: 403') &&
    kodeGuard.includes("Anda tidak punya akses ke area admin"),
);

// ==================== (F) Halaman ====================
console.log("\n--- (F) Halaman ---");

const kodeOps = bacaRepo("src/app/admin/ops/page.tsx");
cek(
  "halaman /admin/ops memuat 5 panel (A–E)",
  ["A. Status Live Sistem", "B. Kesehatan Sumber", "C. News Inbox", "D. Performa", "E. Kontrol Antrean"].every(
    (h) => kodeOps.includes(h),
  ),
);
cek(
  "halaman /admin/ops: tanpa Date.now()/new Date() di render + tanpa skrip inline",
  !kodeOps.includes("Date.now()") &&
    !kodeOps.includes("new Date(") &&
    !kodeOps.includes("<script"),
);
cek(
  "halaman /admin/ops: tersedia=false jujur per seksi (bukan angka 0)",
  kodeOps.includes("belum tersedia") &&
    kodeOps.includes("EmptyState"),
);
cek(
  "halaman /admin/ops: panel B jujur soal kolom v22 yang belum tersedia",
  kodeOps.includes("BELUM tersedia") && kodeOps.includes("kolom v22"),
);
const kodeNav = bacaRepo("src/components/admin/NavAdmin.tsx");
cek(
  "NavAdmin menautkan /admin/ops (label Ops Center)",
  kodeNav.includes('href: "/admin/ops"') &&
    kodeNav.includes('"Ops Center"'),
);
const kodeKendaliPage = bacaRepo("src/app/admin/kendali/page.tsx");
cek(
  "halaman /admin/kendali: alasan jujur per job tanpa pemicu + tombol kontrol",
  kodeKendaliPage.includes("alasan_tanpa_pemicu") &&
    kodeKendaliPage.includes("/api/admin/kendali/kontrol") &&
    kodeKendaliPage.includes('aksi: "pause"') &&
    kodeKendaliPage.includes('aksi: "disable"'),
);
cek(
  "halaman /admin/kendali: tombol destruktif (disable) memakai konfirmasi + varian bahaya",
  kodeKendaliPage.includes('varian="bahaya"') &&
    kodeKendaliPage.includes("NONAKTIFKAN job"),
);
const kodeData = bacaRepo("src/lib/admin/data.ts");
cek(
  "data.ts: getRingkasanOps tersedia (jobs/sumber/inbox/kinerja + flag tersedia per seksi)",
  kodeData.includes("export async function getRingkasanOps") &&
    kodeData.includes("jobs_tersedia") &&
    kodeData.includes("sumber_v22_tersedia") &&
    kodeData.includes("inbox_tersedia"),
);

// ==================== Ringkasan ====================
console.log(`\nRingkasan: ${lolos} lolos, ${gagal} gagal.`);
process.exit(gagal === 0 ? 0 : 1);
