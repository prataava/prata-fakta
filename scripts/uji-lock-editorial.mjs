// Uji lock editorial — Fase 5 PRATA FAKTA.
// PGlite in-memory + kode nyata (tanpa server Next, tanpa deploy).
//
// Yang diuji (kode produksi yang sebenarnya, bukan salinan SQL):
//   (A) klaimJob / selesaikanJob: acquire, release, lock kedaluwarsa,
//       dua worker berebut (tepat satu menang), baris job dibuat
//       otomatis saat klaim pertama.
//   (B) Heartbeat perbaruiHeartbeat: memperpanjang lock yang masih
//       segar, MENOLAK memperpanjang lock yang sudah basi atau
//       sudah ditutup; TIMEOUT_LOCK_MENIT tetap 15, detak tiap 5.
//   (C) Fail-closed: lock tak terbaca (klien melempar / mengembalikan
//       galat) -> klaimJob tersedia=false -> statusHttpUntukKlaim
//       503; lock dipegang run lain -> 409; diklaim -> 200. Plus
//       pemeriksaan statis route /api/ai/jalankan memakai keputusan
//       itu (bukan lagi fail-open "tidak-tersedia").
//   (D) ambilAntrean + penanda diproses_pada (migrasi v23):
//       klaim menandai item, run kedua tidak mengambil item yang
//       sedang diproses worker lain, penanda basi 30 menit bisa
//       diklaim ulang, perbaruiStatusItem membersihkan penanda,
//       baca read-only (bawaan) tidak menandai, dan degradasi
//       anggun bila kolom v23 belum ada (DB kedua tanpa v23).
//   (E) JADWAL_CRON_JOB editorial = "0 */2 * * *" (sama dengan
//       workflow editorial-pipeline.yml).
//   (F) Pemeriksaan /api/tanya/draf: route itu TIDAK memicu
//       pipeline editorial (hanya menulis draf pf_questions),
//       jadi tidak butuh klaim lock — dibiarkan, didokumentasikan.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// Jalankan:
//   node --experimental-strip-types --import /tmp/pf-register.mjs scripts/uji-lock-editorial.mjs
import fs from "node:fs";
import { createRequire } from "node:module";

import { PGlite } from "./butuh-pglite.mjs";
const requireRepo = createRequire(
  new URL("../package.json", import.meta.url).pathname,
);
const yaml = requireRepo("js-yaml");

import {
  INTERVAL_HEARTBEAT_MENIT,
  JADWAL_CRON_JOB,
  TIMEOUT_LOCK_MENIT,
  klaimJob,
  perbaruiHeartbeat,
  selesaikanJob,
  statusHttpUntukKlaim,
} from "../src/lib/scheduler/jobs.ts";
import {
  BATAS_BASI_TANDA_DIPROSES_MENIT,
  SupabaseAiAdapter,
} from "../src/lib/ai/supabase-adapter.ts";

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

const menitLalu = (m) => new Date(Date.now() - m * 60_000).toISOString();

// ---------- Klien Supabase PALSU minimal di atas PGlite ----------
// Hanya permukaan PostgREST yang dipakai jobs.ts + metode adapter
// yang diuji (select/insert/update + eq/neq/is/lt/gte/in/or +
// order/limit/maybeSingle/single). Bukan PostgREST sungguhan —
// cukup untuk menjalankan kode produksi yang sebenarnya melawan
// Postgres nyata (PGlite) termasuk atomisitas UPDATE bersyarat.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TS_RE = /^\d{4}-\d{2}-\d{2}T/;
function akhiranCast(nilai) {
  if (typeof nilai !== "string") return "";
  if (UUID_RE.test(nilai)) return "::uuid";
  if (TS_RE.test(nilai)) return "::timestamptz";
  return "";
}

class PembangunPalsu {
  constructor(db, tabel) {
    this.db = db;
    this.tabel = tabel;
    this.mode = "select";
    this.kolomSelect = null;
    this.patch = null;
    this.barisInsert = null;
    this.syarat = [];
    this.urutan = [];
    this.batas = null;
    this.tunggal = null;
    this.params = [];
  }
  select(kolom) {
    this.kolomSelect = kolom;
    return this;
  }
  insert(baris) {
    this.mode = "insert";
    this.barisInsert = baris;
    return this;
  }
  update(patch) {
    this.mode = "update";
    this.patch = patch;
    return this;
  }
  eq(kol, nilai) {
    this.syarat.push({ t: "eq", kol, nilai });
    return this;
  }
  neq(kol, nilai) {
    this.syarat.push({ t: "neq", kol, nilai });
    return this;
  }
  is(kol, nilai) {
    this.syarat.push({ t: "is", kol, nilai });
    return this;
  }
  lt(kol, nilai) {
    this.syarat.push({ t: "lt", kol, nilai });
    return this;
  }
  gt(kol, nilai) {
    this.syarat.push({ t: "gt", kol, nilai });
    return this;
  }
  gte(kol, nilai) {
    this.syarat.push({ t: "gte", kol, nilai });
    return this;
  }
  lte(kol, nilai) {
    this.syarat.push({ t: "lte", kol, nilai });
    return this;
  }
  in(kol, nilaiArr) {
    this.syarat.push({ t: "in", kol, nilai: nilaiArr });
    return this;
  }
  or(expr) {
    // "a.op.b,c.op.d" — nilai boleh mengandung "." (timestamp ISO).
    const daftar = expr.split(",").map((bagian) => {
      const potong = bagian.split(".");
      const kol = potong[0];
      const op = potong[1];
      const nilaiMentah = potong.slice(2).join(".");
      if (op === "is") return { t: "is", kol, nilai: nilaiMentah === "null" ? null : nilaiMentah };
      return { t: op, kol, nilai: nilaiMentah };
    });
    this.syarat.push({ t: "or", daftar });
    return this;
  }
  order(kol, opsi = {}) {
    this.urutan.push({
      kol,
      naik: opsi.ascending !== false,
      nullsFirst: opsi.nullsFirst,
      tabelAsing: opsi.foreignTable ?? null,
    });
    return this;
  }
  limit(n) {
    this.batas = n;
    return this;
  }
  maybeSingle() {
    this.tunggal = "maybe";
    return this;
  }
  single() {
    this.tunggal = "single";
    return this;
  }
  then(onF, onR) {
    return this.jalankan().then(onF, onR);
  }
  ph(nilai) {
    this.params.push(nilai);
    return `$${this.params.length}${akhiranCast(nilai)}`;
  }
  renderSyarat(s) {
    const opSql = { eq: "=", neq: "<>", lt: "<", gt: ">", gte: ">=", lte: "<=" };
    if (s.t === "or") {
      return `(${s.daftar.map((d) => this.renderSyarat(d)).join(" OR ")})`;
    }
    if (s.t === "is") {
      return s.nilai === null
        ? `t."${s.kol}" IS NULL`
        : `t."${s.kol}" IS NOT NULL`;
    }
    if (s.t === "in") {
      if (s.nilai.length === 0) return "FALSE";
      const tempat = s.nilai.map((v) => this.ph(v)).join(", ");
      return `t."${s.kol}" IN (${tempat})`;
    }
    if (s.nilai === null) {
      return s.t === "eq" ? `t."${s.kol}" IS NULL` : `t."${s.kol}" IS NOT NULL`;
    }
    return `t."${s.kol}" ${opSql[s.t]} ${this.ph(s.nilai)}`;
  }
  pecahKolom(kolomSelect) {
    // Pisah koma level atas (tahan tanda kurung embed).
    const hasil = [];
    let dalam = 0;
    let kini = "";
    for (const ch of kolomSelect) {
      if (ch === "(") dalam++;
      if (ch === ")") dalam--;
      if (ch === "," && dalam === 0) {
        hasil.push(kini.trim());
        kini = "";
      } else {
        kini += ch;
      }
    }
    if (kini.trim()) hasil.push(kini.trim());
    return hasil;
  }
  butuhJoinSumber() {
    if (this.tabel !== "pf_raw_items") return false;
    if (this.kolomSelect && this.kolomSelect.includes("pf_sources(")) return true;
    return this.urutan.some((u) => u.tabelAsing === "pf_sources");
  }
  bangunSql() {
    this.params = [];
    const t = `"public"."${this.tabel}"`;
    const joinSumber = this.butuhJoinSumber()
      ? ` LEFT JOIN "public"."pf_sources" s ON s."id" = t."sumber_id"`
      : "";
    const where =
      this.syarat.length > 0
        ? ` WHERE ${this.syarat.map((s) => this.renderSyarat(s)).join(" AND ")}`
        : "";
    const order =
      this.urutan.length > 0
        ? " ORDER BY " +
          this.urutan
            .map((u) => {
              const awal = u.tabelAsing ? "s" : "t";
              const nulls =
                u.nullsFirst === false
                  ? " NULLS LAST"
                  : u.nullsFirst === true
                    ? " NULLS FIRST"
                    : "";
              return `${awal}."${u.kol}" ${u.naik ? "ASC" : "DESC"}${nulls}`;
            })
            .join(", ")
        : "";
    const batas = this.batas !== null ? ` LIMIT ${Number(this.batas)}` : "";

    if (this.mode === "select") {
      let kolomSql;
      if (!this.kolomSelect || this.kolomSelect.trim() === "*") {
        kolomSql = "t.*";
      } else {
        kolomSql = this.pecahKolom(this.kolomSelect)
          .map((k) => {
            const embed = k.match(/^(\w+)\(([^)]+)\)$/);
            if (embed) {
              const dalam = embed[2]
                .split(",")
                .map((c) => `'${c.trim()}', s."${c.trim()}"`)
                .join(", ");
              return `CASE WHEN s."id" IS NULL THEN NULL ELSE json_build_object(${dalam}) END AS "${embed[1]}"`;
            }
            return `t."${k}"`;
          })
          .join(", ");
      }
      return {
        sql: `SELECT ${kolomSql} FROM ${t} t${joinSumber}${where}${order}${batas}`,
        params: this.params,
      };
    }
    if (this.mode === "insert") {
      const kunci = Object.keys(this.barisInsert);
      const nilai = kunci.map((k) => this.ph(this.barisInsert[k])).join(", ");
      const kembali =
        this.kolomSelect && this.kolomSelect.trim() !== "*"
          ? ` RETURNING ${this.pecahKolom(this.kolomSelect).map((k) => `"${k}"`).join(", ")}`
          : "";
      return {
        sql: `INSERT INTO ${t} (${kunci.map((k) => `"${k}"`).join(", ")}) VALUES (${nilai})${kembali}`,
        params: this.params,
      };
    }
    // update
    const set = Object.keys(this.patch)
      .map((k) => `"${k}" = ${this.ph(this.patch[k])}`)
      .join(", ");
    const kembali =
      this.kolomSelect && this.kolomSelect.trim() !== "*"
        ? ` RETURNING ${this.pecahKolom(this.kolomSelect).map((k) => `"${k}"`).join(", ")}`
        : "";
    return {
      sql: `UPDATE ${t} t SET ${set}${where}${kembali}`,
      params: this.params,
    };
  }
  async jalankan() {
    try {
      const { sql, params } = this.bangunSql();
      const hasil = await this.db.query(sql, params);
      const baris = hasil.rows ?? [];
      if (this.tunggal === "maybe") {
        if (baris.length > 1) {
          return {
            data: null,
            error: {
              message:
                "JSON object requested, multiple (or no) rows returned",
              code: "PGRST116",
            },
          };
        }
        return { data: baris[0] ?? null, error: null };
      }
      if (this.tunggal === "single") {
        if (baris.length !== 1) {
          return {
            data: null,
            error: {
              message:
                "JSON object requested, multiple (or no) rows returned",
              code: "PGRST116",
            },
          };
        }
        return { data: baris[0], error: null };
      }
      return { data: baris, error: null };
    } catch (e) {
      return {
        data: null,
        error: { message: e.message, code: e.code ?? null },
      };
    }
  }
}

class KlienPalsu {
  constructor(db) {
    this.db = db;
  }
  from(tabel) {
    return new PembangunPalsu(this.db, tabel);
  }
}

// Klien yang lock-nya tidak terbaca (melempar / mengembalikan galat).
const klienMelempar = {
  from() {
    throw new Error("koneksi database putus");
  },
};
function klienSelaluGalat(pesan) {
  const akhir = {
    maybeSingle: async () => ({ data: null, error: { message: pesan } }),
    single: async () => ({ data: null, error: { message: pesan } }),
  };
  const rantai = {
    eq: () => akhir,
    or: () => akhir,
    in: () => akhir,
    select: () => rantai,
    insert: () => rantai,
    update: () => rantai,
    order: () => rantai,
    limit: () => rantai,
  };
  return {
    from: () => ({
      select: () => rantai,
      insert: () => rantai,
      update: () => rantai,
    }),
  };
}

// ---------- Setup DB ----------
// Migrasi v1–v5 (pf_sources, pf_raw_items, pf_scheduled_jobs) +
// v23 (diproses_pada). Pola setup auth disalin dari
// scripts/uji-tahap13c.mjs.
const MIGRASI = [
  "20261116_pf_v1_foundation.sql",
  "20261116_pf_v2_articles.sql",
  "20261116_pf_v3_ingestion.sql",
  "20261116_pf_v4_ai.sql",
  "20261116_pf_v5_editorial.sql",
  "20261117_pf_v23_lock_diproses.sql",
];

async function siapkanDb(denganV23) {
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
  for (const nama of MIGRASI) {
    if (!denganV23 && nama.includes("_v23_")) continue;
    await db.exec(baca(nama));
  }
  return db;
}

const db = await siapkanDb(true);
console.log("OK: PGlite + migrasi v1-v5 + v23");

// v23 benar diterapkan: kolom ada.
{
  const { rows } = await db.query(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name='pf_raw_items'
     and column_name='diproses_pada'`,
  );
  cek("migrasi v23: kolom pf_raw_items.diproses_pada ada", rows.length === 1);
}

// ---------- Seed ----------
const SUMBER_ANTARA = "11111111-1111-1111-1111-111111111111";
const SUMBER_BLOG = "22222222-2222-2222-2222-222222222222";
await db.exec(
  `insert into public.pf_sources (id, nama, jenis, url, prioritas) values
   ('${SUMBER_ANTARA}', 'Antara', 'rss', 'https://antara.example/rss', 90),
   ('${SUMBER_BLOG}', 'Blog Kecil', 'rss', 'https://blog.example/rss', 10);`,
);
const ITEM_1 = "a0000000-0000-0000-0000-000000000001"; // Antara, terbit 08:00
const ITEM_2 = "a0000000-0000-0000-0000-000000000002"; // Antara, terbit 09:00
const ITEM_3 = "a0000000-0000-0000-0000-000000000003"; // Blog, terbit 10:00
await db.exec(
  `insert into public.pf_raw_items
     (id, sumber_id, url, hash_url, judul, hash_judul, ringkasan,
      waktu_terbit_asli, waktu_diambil, status_verifikasi)
   values
   ('${ITEM_1}', '${SUMBER_ANTARA}', 'https://antara.example/1', 'h1', 'Judul Satu', 'j1', 'Ringkasan 1',
    '2026-11-17T08:00:00Z', '2026-11-17T08:05:00Z', 'UNCONFIRMED'),
   ('${ITEM_2}', '${SUMBER_ANTARA}', 'https://antara.example/2', 'h2', 'Judul Dua', 'j2', 'Ringkasan 2',
    '2026-11-17T09:00:00Z', '2026-11-17T09:05:00Z', 'UNCONFIRMED'),
   ('${ITEM_3}', '${SUMBER_BLOG}', 'https://blog.example/3', 'h3', 'Judul Tiga', 'j3', 'Ringkasan 3',
    '2026-11-17T10:00:00Z', '2026-11-17T10:05:00Z', 'UNCONFIRMED');`,
);

const klien = new KlienPalsu(db);
const adapter = new SupabaseAiAdapter(
  "http://127.0.0.1:1",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.cGFsc3U",
);
adapter.klien = klien;

async function tandaDiproses(id) {
  const { rows } = await db.query(
    `select diproses_pada from public.pf_raw_items where id = $1`,
    [id],
  );
  return rows[0]?.diproses_pada ?? null;
}
async function statusVerifikasi(id) {
  const { rows } = await db.query(
    `select status_verifikasi from public.pf_raw_items where id = $1`,
    [id],
  );
  return rows[0]?.status_verifikasi;
}

// ---------- (A) Lock dasar ----------
{
  const k1 = await klaimJob(klien, "editorial");
  cek("A1 klaim pertama berhasil (baris job dibuat otomatis)", k1.diklaim === true && k1.tersedia === true);
  const k2 = await klaimJob(klien, "editorial");
  cek(
    "A2 klaim kedua ditolak — lock dipegang run lain",
    k2.diklaim === false && k2.tersedia === true,
    k2.alasan ?? "",
  );
  cek("A3 keputusan HTTP klaim kedua = 409", statusHttpUntukKlaim(k2) === 409);
  cek("A4 keputusan HTTP klaim pertama = 200", statusHttpUntukKlaim(k1) === 200);
  const tutup = await selesaikanJob(klien, "editorial", true);
  cek("A5 selesaikanJob menutup lock", tutup === true);
  const k3 = await klaimJob(klien, "editorial");
  cek("A6 klaim sesudah release berhasil lagi", k3.diklaim === true);
  await selesaikanJob(klien, "editorial", true);
}
{
  // Lock basi bisa direbut; lock segar tidak.
  await klaimJob(klien, "brief");
  await db.query(
    `update public.pf_scheduled_jobs set terakhir_jalan = $1 where nama = 'brief'`,
    [menitLalu(16)],
  );
  const kBasi = await klaimJob(klien, "brief");
  cek("A7 lock basi 16 menit bisa direbut", kBasi.diklaim === true);
  await db.query(
    `update public.pf_scheduled_jobs set terakhir_jalan = $1 where nama = 'brief'`,
    [menitLalu(14)],
  );
  const kSegar = await klaimJob(klien, "brief");
  cek("A8 lock segar 14 menit TIDAK bisa direbut", kSegar.diklaim === false && kSegar.tersedia === true);
  await selesaikanJob(klien, "brief", true);
}
{
  // Dua worker berebut baris job yang belum ada: tepat satu menang.
  // ('ingestion' dipakai karena barisnya belum ada di DB uji dan
  // namanya lolos CHECK v5 — 'data-analysis' baru diizinkan v12.)
  const [a, b] = await Promise.all([
    klaimJob(klien, "ingestion"),
    klaimJob(klien, "ingestion"),
  ]);
  const menang = [a, b].filter((k) => k.diklaim).length;
  const kalah409 = [a, b].filter(
    (k) => !k.diklaim && k.tersedia && statusHttpUntukKlaim(k) === 409,
  ).length;
  cek(
    "A9 dua worker berebut — tepat satu menang, satu 409",
    menang === 1 && kalah409 === 1,
    `menang=${menang} kalah409=${kalah409}`,
  );
  await selesaikanJob(klien, "ingestion", true);
}

// ---------- (B) Heartbeat ----------
cek("B0 TIMEOUT_LOCK_MENIT tetap 15 menit", TIMEOUT_LOCK_MENIT === 15);
cek(
  "B0b INTERVAL_HEARTBEAT_MENIT 5 menit (< sepertiga timeout)",
  INTERVAL_HEARTBEAT_MENIT === 5,
);
{
  await klaimJob(klien, "editorial");
  await db.query(
    `update public.pf_scheduled_jobs set terakhir_jalan = $1 where nama = 'editorial'`,
    [menitLalu(14)],
  );
  const detak = await perbaruiHeartbeat(klien, "editorial");
  const { rows } = await db.query(
    `select terakhir_jalan from public.pf_scheduled_jobs where nama = 'editorial'`,
  );
  const umurDetik =
    (Date.now() - new Date(rows[0].terakhir_jalan).getTime()) / 1000;
  cek(
    "B1 heartbeat memperpanjang lock yang masih segar (14 mnt)",
    detak === true && umurDetik < 10,
    `umur terakhir_jalan ${umurDetik.toFixed(1)} dtk`,
  );
  const kLain = await klaimJob(klien, "editorial");
  cek(
    "B2 sesudah heartbeat, klaim worker lain tetap ditolak",
    kLain.diklaim === false,
  );
  // Lock basi: heartbeat menolak memperpanjang.
  await db.query(
    `update public.pf_scheduled_jobs set terakhir_jalan = $1 where nama = 'editorial'`,
    [menitLalu(16)],
  );
  const sebelum = (
    await db.query(
      `select terakhir_jalan from public.pf_scheduled_jobs where nama = 'editorial'`,
    )
  ).rows[0].terakhir_jalan;
  const detakBasi = await perbaruiHeartbeat(klien, "editorial");
  const sesudah = (
    await db.query(
      `select terakhir_jalan from public.pf_scheduled_jobs where nama = 'editorial'`,
    )
  ).rows[0].terakhir_jalan;
  cek(
    "B3 heartbeat MENOLAK memperpanjang lock basi (16 mnt)",
    detakBasi === false &&
      new Date(sesudah).getTime() === new Date(sebelum).getTime(),
  );
  // Lock sudah ditutup: heartbeat menolak.
  await selesaikanJob(klien, "editorial", true);
  const detakTutup = await perbaruiHeartbeat(klien, "editorial");
  cek("B4 heartbeat sesudah selesaikanJob = false", detakTutup === false);
}

// ---------- (C) Fail-closed ----------
{
  const kRusak = await klaimJob(klienMelempar, "editorial");
  cek(
    "C1 klaimJob tidak melempar saat lock tak terbaca (klien melempar)",
    kRusak.diklaim === false && kRusak.tersedia === false,
    kRusak.alasan ?? "",
  );
  cek(
    "C2 keputusan HTTP lock tak terbaca = 503 (fail-closed)",
    statusHttpUntukKlaim(kRusak) === 503,
  );
  const kGalat = await klaimJob(
    klienSelaluGalat("relation \"pf_scheduled_jobs\" does not exist"),
    "editorial",
  );
  cek(
    "C3 klaimJob tidak melempar saat select mengembalikan galat",
    kGalat.diklaim === false && kGalat.tersedia === false,
  );
  cek(
    "C4 keputusan HTTP galat baca lock = 503",
    statusHttpUntukKlaim(kGalat) === 503,
  );
}
{
  // Route memakai keputusan fail-closed (pemeriksaan statis — handler
  // route sendiri tidak dijalankan di baterai ini).
  const kodeRoute = bacaRepo("src/app/api/ai/jalankan/route.ts");
  cek(
    "C5 route memakai statusHttpUntukKlaim untuk keputusan lock",
    kodeRoute.includes("statusHttpUntukKlaim(klaim)"),
  );
  cek(
    "C6 route menolak tanpa lock dengan 503 (bukan jalan diam-diam)",
    kodeRoute.includes("Pipeline ditolak agar tidak jalan tanpa lock"),
  );
  cek(
    "C7 route tidak lagi punya jalur fail-open 'tidak-tersedia'",
    !kodeRoute.includes("tidak-tersedia ("),
  );
  cek(
    "C8 route menjalankan heartbeat selama run (setInterval + perbaruiHeartbeat)",
    kodeRoute.includes("setInterval") &&
      kodeRoute.includes("perbaruiHeartbeat(klienFlag, \"editorial\")") &&
      kodeRoute.includes("clearInterval(detakHeartbeat)"),
  );
}

// ---------- (D) ambilAntrean + penanda diproses ----------
{
  // Urutan antrean: prioritas sumber DESC, lalu waktu terbit DESC.
  const batch1 = await adapter.ambilAntrean(2, "terbaru", { klaim: true });
  cek(
    "D1 ambilAntrean klaim 2 item (urutan prioritas lalu terbaru)",
    batch1.length === 2 &&
      batch1[0].id === ITEM_2 &&
      batch1[1].id === ITEM_1,
    batch1.map((b) => b.id.slice(-4)).join(","),
  );
  cek(
    "D2 kedua item terambil ditandai diproses_pada",
    (await tandaDiproses(ITEM_2)) !== null &&
      (await tandaDiproses(ITEM_1)) !== null,
  );
  cek(
    "D3 item yang tidak terambil belum ditandai",
    (await tandaDiproses(ITEM_3)) === null,
  );
  const batch2 = await adapter.ambilAntrean(10, "terbaru", { klaim: true });
  cek(
    "D4 run kedua TIDAK mengambil item yang sedang diproses worker lain",
    batch2.length === 1 && batch2[0].id === ITEM_3,
    batch2.map((b) => b.id.slice(-4)).join(","),
  );
  const batch3 = await adapter.ambilAntrean(10, "terbaru", { klaim: true });
  cek(
    "D5 antrean kosong bila semua item sedang diproses",
    batch3.length === 0,
  );
  const tandaiLagi = await adapter.tandaiItemDiproses(ITEM_3);
  cek(
    "D6 tandaiItemDiproses pada item yang sudah ditandai = false",
    tandaiLagi === false,
  );
  // Penanda basi 30 menit bisa diklaim ulang.
  await db.query(
    `update public.pf_raw_items set diproses_pada = $1 where id = $2`,
    [menitLalu(BATAS_BASI_TANDA_DIPROSES_MENIT + 1), ITEM_1],
  );
  const batch4 = await adapter.ambilAntrean(10, "terbaru", { klaim: true });
  cek(
    `D7 item berpenanda basi ${BATAS_BASI_TANDA_DIPROSES_MENIT + 1} menit terambil lagi`,
    batch4.length === 1 && batch4[0].id === ITEM_1,
  );
  // perbaruiStatusItem membersihkan penanda.
  await adapter.perbaruiStatusItem(ITEM_1, "VERIFIED");
  cek(
    "D8 perbaruiStatusItem mengubah status + membersihkan penanda",
    (await statusVerifikasi(ITEM_1)) === "VERIFIED" &&
      (await tandaDiproses(ITEM_1)) === null,
  );
  // Tandai satu item berpenanda basi (jalur hanyaItemId), lalu perbarui.
  await db.query(
    `update public.pf_raw_items set diproses_pada = $1 where id = $2`,
    [menitLalu(BATAS_BASI_TANDA_DIPROSES_MENIT + 1), ITEM_2],
  );
  const tandaiBaru = await adapter.tandaiItemDiproses(ITEM_2);
  cek(
    "D9 tandaiItemDiproses pada item berpenanda basi berhasil",
    tandaiBaru === true && (await tandaDiproses(ITEM_2)) !== null,
  );
}
{
  // Baca read-only (bawaan, tanpa klaim) tidak menandai.
  await db.query(
    `update public.pf_raw_items set diproses_pada = null where id = $1`,
    [ITEM_2],
  );
  await db.query(
    `update public.pf_raw_items set status_verifikasi = 'UNCONFIRMED' where id = $1`,
    [ITEM_2],
  );
  const bacaSaja = await adapter.ambilAntrean(10, "terbaru");
  cek(
    "D10 ambilAntrean tanpa klaim mengembalikan item tanpa menandai",
    bacaSaja.some((b) => b.id === ITEM_2) &&
      (await tandaDiproses(ITEM_2)) === null,
  );
}
{
  // Degradasi anggun bila kolom v23 belum ada (DB kedua tanpa v23).
  const db2 = await siapkanDb(false);
  await db2.exec(
    `insert into public.pf_sources (id, nama, jenis, url, prioritas) values
     ('${SUMBER_ANTARA}', 'Antara', 'rss', 'https://antara.example/rss', 90);`,
  );
  await db2.exec(
    `insert into public.pf_raw_items
       (id, sumber_id, url, hash_url, judul, hash_judul, ringkasan,
        waktu_terbit_asli, waktu_diambil, status_verifikasi)
     values
     ('${ITEM_1}', '${SUMBER_ANTARA}', 'https://antara.example/1', 'h1', 'Judul Satu', 'j1', 'Ringkasan 1',
      '2026-11-17T08:00:00Z', '2026-11-17T08:05:00Z', 'UNCONFIRMED');`,
  );
  const adapter2 = new SupabaseAiAdapter(
    "http://127.0.0.1:1",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.cGFsc3U",
  );
  adapter2.klien = new KlienPalsu(db2);
  const batchLama = await adapter2.ambilAntrean(10, "terbaru", { klaim: true });
  cek(
    "D11 pra-v23: ambilAntrean({klaim:true}) tetap mengembalikan item (fallback tanpa penanda)",
    batchLama.length === 1 && batchLama[0].id === ITEM_1,
  );
  await adapter2.perbaruiStatusItem(ITEM_1, "VERIFIED");
  const { rows } = await db2.query(
    `select status_verifikasi from public.pf_raw_items where id = $1`,
    [ITEM_1],
  );
  cek(
    "D12 pra-v23: perbaruiStatusItem tetap berhasil tanpa kolom penanda",
    rows[0]?.status_verifikasi === "VERIFIED",
  );
}

// ---------- (E) Jadwal cron editorial ----------
{
  cek(
    "E1 JADWAL_CRON_JOB editorial = setiap 2 jam",
    JADWAL_CRON_JOB.editorial === "0 */2 * * *",
    JADWAL_CRON_JOB.editorial,
  );
  const workflow = yaml.load(
    bacaRepo(".github/workflows/editorial-pipeline.yml"),
  );
  const cronWorkflow = workflow?.on?.schedule?.[0]?.cron;
  cek(
    "E2 JADWAL_CRON_JOB sama dengan cron workflow editorial-pipeline.yml",
    cronWorkflow === "0 */2 * * *" &&
      cronWorkflow === JADWAL_CRON_JOB.editorial,
    String(cronWorkflow),
  );
}

// ---------- (F) /api/tanya/draf tidak memicu pipeline ----------
{
  const kodeDraf = bacaRepo("src/app/api/tanya/draf/route.ts");
  cek(
    "F1 /api/tanya/draf tidak memanggil pipeline editorial (hanya draf pf_questions) — tidak butuh klaim lock",
    !kodeDraf.includes("jalankanPipelineEditorial") &&
      !kodeDraf.includes("klaimJob") &&
      kodeDraf.includes("pf_questions"),
  );
}

console.log(`\nRingkasan: ${lolos} lolos, ${gagal} gagal.`);
process.exit(gagal === 0 ? 0 : 1);
