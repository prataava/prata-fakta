// Baterai pengujian Gelombang B1 — Ingestion & Scheduler PRATA FAKTA.
// PGlite in-memory + migrasi v1+v2+v3. Mencakup (tugas B1):
//  (1) dedup lunak tahap-2, (2) tanggal GDELT (seendate bukan terbit),
//  (3) retry per-sumber + Retry-After, (4) deteksi sumber basi,
//  (5) antrean GROUP BY (paralel vs sekuensial) + kejar ketertinggalan,
//  (6) lock upsert (klaimJob membuat baris job bila belum ada),
//  (7) kedaluwarsa antrean 14 hari, (8) batas body RSS 5 MB,
//  (9) tanggal terbit RSS (updated -> metadata.waktu_revisi),
//  (10) topik GDELT per sumber.
// TIDAK menyentuh jaringan nyata: semua fetch memakai mock (kecuali
// resolusi DNS allowlist yang dilewati fetchAman — host sintetis).
// Keluar 0 bila semua uji lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = require("@electric-sql/pglite");

import {
  AMBANG_DUPLIKAT_LUNAK,
  cariKandidatDuplikatLunak,
  JENDELA_DUPLIKAT_LUNAK_MS,
  kemiripanJudul,
  tokenJudul,
} from "../src/lib/ingestion/dedup.ts";
import { fetchRss, parseRss, BATAS_BODY_RSS_BYTE } from "../src/lib/ingestion/rss.ts";
import { fetchGdelt, parseSeendate } from "../src/lib/ingestion/gdelt.ts";
import { jalankanIngestion } from "../src/lib/ingestion/engine.ts";
import {
  cobaUlang,
  GalatSementara,
  parseRetryAfter,
  percobaanGalat,
} from "../src/lib/ingestion/retry.ts";
import {
  AMBANG_BASI_JAM,
  apakahBasi,
  batasKedaluarsa,
  hitungSumberBasi,
  jalankanPemeliharaanAntrean,
  periksaSumberBasi,
  UMUR_KEDALUWARSA_HARI,
  urutKejar,
} from "../src/lib/ingestion/pemeliharaan.ts";
import {
  klaimJob,
  selesaikanJob,
  TIMEOUT_LOCK_MENIT,
} from "../src/lib/scheduler/jobs.ts";

const DIR_MIGRASI = new URL("../supabase/migrations/", import.meta.url).pathname;

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

function bacaMigrasi(nama) {
  let sql = fs.readFileSync(`${DIR_MIGRASI}/${nama}`, "utf8");
  sql = sql.replace(/create extension[^;]+;/gi, "-- ekstensi dilepas (PGlite)");
  sql = sql.replace(/\bcitext\b/gi, "text");
  return sql;
}

function lolosXml(teks) {
  return String(teks)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buatRss(itemsXml) {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Sintetis</title>${itemsXml}</channel></rss>`;
}

function buatItemRss(judul, url, pubDate) {
  return `<item><title>${lolosXml(judul)}</title><link>${lolosXml(url)}</link><description>Item sintetis.</description><pubDate>${pubDate}</pubDate></item>`;
}

// ---------- Adapter PGlite (implementasi IngestionAdapter + metode B1) ----------
class AdapterPGlite {
  constructor(db) {
    this.db = db;
  }
  async cariHashUrl(hash) {
    const r = await this.db.query(
      `select id from public.pf_raw_items where hash_url = $1 limit 1`,
      [hash],
    );
    return r.rows[0] ? { id: r.rows[0].id } : null;
  }
  async cariHashJudul(hash) {
    const r = await this.db.query(
      `select id, sumber_id, waktu_terbit_asli, waktu_diambil
         from public.pf_raw_items where hash_judul = $1 order by waktu_diambil asc`,
      [hash],
    );
    return r.rows.map((baris) => ({
      id: baris.id,
      sumber_id: baris.sumber_id ?? null,
      waktu_terbit_asli: baris.waktu_terbit_asli
        ? new Date(baris.waktu_terbit_asli).toISOString()
        : null,
      waktu_diambil: new Date(baris.waktu_diambil).toISOString(),
    }));
  }
  async daftarJudulBaruSejak(sejak, batas = 500) {
    const r = await this.db.query(
      `select id, judul, sumber_id, waktu_terbit_asli, waktu_diambil
         from public.pf_raw_items where waktu_diambil >= $1
        order by waktu_diambil asc limit $2`,
      [sejak, batas],
    );
    return r.rows.map((baris) => ({
      id: baris.id,
      judul: baris.judul,
      sumber_id: baris.sumber_id ?? null,
      waktu_terbit_asli: baris.waktu_terbit_asli
        ? new Date(baris.waktu_terbit_asli).toISOString()
        : null,
      waktu_diambil: new Date(baris.waktu_diambil).toISOString(),
    }));
  }
  async jumlahItemBaruSejak(sumberId, sejak) {
    const r = await this.db.query(
      `select count(*)::int as n from public.pf_raw_items
        where sumber_id = $1 and waktu_diambil >= $2`,
      [sumberId, sejak],
    );
    return r.rows[0].n;
  }
  async waktuItemTerbaru(sumberId) {
    const r = await this.db.query(
      `select waktu_diambil from public.pf_raw_items
        where sumber_id = $1 order by waktu_diambil desc limit 1`,
      [sumberId],
    );
    if (!r.rows[0]) return null;
    const t = new Date(r.rows[0].waktu_diambil);
    return Number.isNaN(t.getTime()) ? null : t;
  }
  async tandaiItemKedaluarsa(batas, alasan) {
    const r = await this.db.query(
      `update public.pf_raw_items set status = 'ditolak', alasan = $2,
         metadata = metadata || jsonb_build_object('kedaluarsa_pada', now())
       where status_verifikasi = 'UNCONFIRMED'
         and status in ('baru', 'disalin_dari', 'duplikat')
         and waktu_diambil < $1
       returning id`,
      [batas, alasan],
    );
    return r.rows.length;
  }
  async tandaiSumberBasi(sumberId, pesan) {
    const r = await this.db.query(
      `select status_terakhir from public.pf_sources where id = $1`,
      [sumberId],
    );
    const lama = (r.rows[0]?.status_terakhir ?? "").replace(/ · BASI:[^·]*/g, "").trim();
    const baru = lama ? `${lama} · ${pesan}` : pesan;
    await this.db.query(
      `update public.pf_sources set status_terakhir = $2 where id = $1`,
      [sumberId, baru],
    );
  }
  async simpanItem(item) {
    await this.db.query(
      `insert into public.pf_raw_items
         (sumber_id, run_id, url, hash_url, judul, hash_judul, ringkasan,
          isi_ringkas, penulis, waktu_terbit_asli, waktu_diambil, status,
          status_verifikasi, disalin_dari_id, diterbitkan_ulang, alasan, metadata)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       on conflict (hash_url) do nothing`,
      [
        item.sumber_id,
        item.run_id,
        item.url,
        item.hash_url,
        item.judul,
        item.hash_judul,
        item.ringkasan,
        item.isi_ringkas,
        item.penulis,
        item.waktu_terbit_asli,
        item.waktu_diambil,
        item.status,
        item.status_verifikasi,
        item.disalin_dari_id,
        item.diterbitkan_ulang,
        item.alasan,
        JSON.stringify(item.metadata ?? {}),
      ],
    );
  }
  async buatRun(input) {
    const r = await this.db.query(
      `insert into public.pf_ingestion_runs
         (sumber_id, sumber_nama, dimulai_pada, status, dipicu_oleh)
       values ($1, $2, now(), 'berjalan', $3) returning id`,
      [input.sumber_id, input.sumber_nama, input.dipicu_oleh],
    );
    return r.rows[0].id;
  }
  async tutupRun(id, patch) {
    await this.db.query(
      `update public.pf_ingestion_runs set
         selesai_pada = $2, status = $3, ditemukan = $4, baru = $5,
         duplikat = $6, ditolak = $7, gagal = $8, error = $9
       where id = $1`,
      [
        id,
        patch.selesai_pada,
        patch.status,
        patch.ditemukan,
        patch.baru,
        patch.duplikat,
        patch.ditolak,
        patch.gagal,
        patch.error,
      ],
    );
  }
  async perbaruiSumber(id, patch) {
    const r = await this.db.query(
      `select jumlah_item from public.pf_sources where id = $1`,
      [id],
    );
    const sekarang = r.rows[0] ? Number(r.rows[0].jumlah_item ?? 0) : 0;
    await this.db.query(
      `update public.pf_sources set
         terakhir_diambil = $2, status_terakhir = $3, jumlah_item = $4
       where id = $1`,
      [id, patch.terakhir_diambil, patch.status_terakhir, sekarang + patch.tambah_item],
    );
  }
}

// ---------- Klien Supabase palsu (untuk klaimJob/selesaikanJob) ----------
// Menerjemahkan rantai builder supabase-js (.from().update/insert/
// .eq().or().select().maybeSingle()/single()) menjadi SQL PGlite.
// Hanya untuk tabel pf_scheduled_jobs.
class BuilderPalsu {
  constructor(db, tabel) {
    this.db = db;
    this.tabel = tabel;
    this.op = null;
    this.patch = null;
    this.baris = null;
    this.filterEq = [];
    this.filterOr = null;
    this.kolom = "*";
  }
  update(patch) { this.op = "update"; this.patch = patch; return this; }
  insert(baris) { this.op = "insert"; this.baris = baris; return this; }
  eq(kolom, nilai) { this.filterEq.push([kolom, nilai]); return this; }
  or(teks) { this.filterOr = teks; return this; }
  select(kolom) { this.kolom = kolom; return this; }
  async maybeSingle() { return this.jalan(false); }
  async single() { return this.jalan(true); }
  async jalan(wajib) {
    if (this.op === "insert") {
      const kunci = Object.keys(this.baris);
      const nilai = Object.values(this.baris);
      const tempat = nilai.map((_, i) => `$${i + 1}`).join(", ");
      try {
        const r = await this.db.query(
          `insert into public.${this.tabel} (${kunci.join(", ")}) values (${tempat}) returning ${this.kolom}`,
          nilai,
        );
        if (r.rows.length === 0) {
          return { data: null, error: { message: "0 baris", code: "PGRST116" } };
        }
        return { data: r.rows[0], error: null };
      } catch (err) {
        return { data: null, error: { message: err.message, code: err.code ?? null } };
      }
    }
    if (this.op === "update") {
      const kunci = Object.keys(this.patch);
      const nilai = Object.values(this.patch);
      const setelan = kunci.map((k, i) => `${k} = $${i + 1}`).join(", ");
      let idx = nilai.length;
      const syarat = [];
      const arg = [...nilai];
      for (const [k, v] of this.filterEq) {
        idx += 1;
        syarat.push(`${k} = $${idx}`);
        arg.push(v);
      }
      if (this.filterOr) {
        // Bentuk: "status_terakhir.neq.berjalan,terakhir_jalan.is.null,terakhir_jalan.lt.<ISO>"
        const bagian = this.filterOr.split(",").map((s) => {
          const [kolom, op, ...sisa] = s.split(".");
          const val = sisa.join(".");
          if (op === "neq") { idx += 1; arg.push(val); return `${kolom} <> $${idx}`; }
          if (op === "is") return `${kolom} IS NULL`;
          if (op === "lt") { idx += 1; arg.push(val); return `${kolom} < $${idx}`; }
          throw new Error(`operator .or() tak didukung di uji: ${s}`);
        });
        syarat.push(`(${bagian.join(" OR ")})`);
      }
      const r = await this.db.query(
        `update public.${this.tabel} set ${setelan} where ${syarat.join(" AND ")} returning ${this.kolom}`,
        arg,
      );
      if (r.rows.length === 0) return { data: null, error: null };
      return { data: r.rows[0], error: null };
    }
    // select biasa
    let idx = 0;
    const syarat = [];
    const arg = [];
    for (const [k, v] of this.filterEq) {
      idx += 1;
      syarat.push(`${k} = $${idx}`);
      arg.push(v);
    }
    const where = syarat.length ? `where ${syarat.join(" AND ")}` : "";
    const r = await this.db.query(
      `select ${this.kolom} from public.${this.tabel} ${where} limit 1`,
      arg,
    );
    if (r.rows.length === 0) {
      if (wajib) return { data: null, error: { message: "0 baris", code: "PGRST116" } };
      return { data: null, error: null };
    }
    return { data: r.rows[0], error: null };
  }
}

class KlienPalsu {
  constructor(db) { this.db = db; }
  from(tabel) { return new BuilderPalsu(this.db, tabel); }
}

// ---------- Mock fetch ----------
function responsMock({ ok = true, status = 200, teks = "", json = null, retryAfter = null } = {}) {
  const headers = new Headers();
  if (retryAfter !== null) headers.set("retry-after", retryAfter);
  return {
    ok,
    status,
    headers,
    text: async () => (json !== null ? JSON.stringify(json) : teks),
    json: async () => (json !== null ? json : JSON.parse(teks)),
  };
}

const db = new PGlite();
const adapter = new AdapterPGlite(db);
const klienPalsu = new KlienPalsu(db);
const SEKARANG = new Date();

try {
  // Setup stub auth (pola scripts/uji-tahap13-migrasi.mjs) + migrasi
  // v1+v2+v3 lewat db.exec (multi-statement; db.query menolaknya).
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
  await db.exec(bacaMigrasi("20261116_pf_v1_foundation.sql"));
  await db.exec(bacaMigrasi("20261116_pf_v2_articles.sql"));
  await db.exec(bacaMigrasi("20261116_pf_v3_ingestion.sql"));
  // pf_scheduled_jobs (DDL cerminan v5 + CHECK nama v12 — hanya untuk uji lock).
  await db.query(`
    create table if not exists public.pf_scheduled_jobs (
      id uuid primary key default gen_random_uuid(),
      nama text not null unique
        check (nama in ('ingestion', 'editorial', 'brief', 'data-analysis', 'terbitkan-terjadwal')),
      jadwal_cron text not null,
      deskripsi text,
      aktif boolean not null default true,
      terakhir_jalan timestamptz,
      status_terakhir text not null default 'belum_pernah'
        check (status_terakhir in ('berhasil', 'gagal', 'berjalan', 'belum_pernah')),
      error_terakhir text,
      diperbarui_pada timestamptz not null default now()
    )`);

  // ================= A. Dedup lunak (murni) =================
  const JUDUL_A = "Kementerian Keuangan siapkan anggaran pendidikan vokasi bagi pelajar di daerah terpencil";
  const JUDUL_B = "Kementerian Keuangan siapkan anggaran pendidikan vokasi bagi siswa di daerah terpencil";
  const JUDUL_C = "Timnas Indonesia menang atas Thailand di final Piala Asia";
  cek("dedup lunak: ambang 0,8 + jendela 48 jam", AMBANG_DUPLIKAT_LUNAK === 0.8 && JENDELA_DUPLIKAT_LUNAK_MS === 48 * 3600 * 1000);
  const simAB = kemiripanJudul(JUDUL_A, JUDUL_B);
  cek("dedup lunak: parafrase 1 kata ≈ 0,80", simAB >= 0.8 && simAB < 0.9, `kemiripan=${simAB.toFixed(3)}`);
  cek("dedup lunak: topik beda ≈ 0", kemiripanJudul(JUDUL_A, JUDUL_C) < 0.2);
  cek("dedup lunak: judul pendek -> 0 (anti positif palsu)", kemiripanJudul("Gempa Aceh", "Gempa Banten") === 0);
  cek("dedup lunak: token buang kata henti", !tokenJudul("Presiden dan Wakil Presiden di Jakarta").includes("dan") && tokenJudul("Presiden dan Wakil Presiden di Jakarta").includes("presiden"));
  const kandidatSatu = [{ id: "id-lama", judul: JUDUL_A, sumber_id: "sumber-lain", waktu_terbit_asli: null, waktu_diambil: SEKARANG.toISOString() }];
  const putusBeda = cariKandidatDuplikatLunak({ judul: JUDUL_B, sumberId: "sumber-baru", waktuDiambil: SEKARANG, kandidat: kandidatSatu });
  cek("dedup lunak: kandidat dari penerbit lain -> disalin_dari", putusBeda.kandidat && putusBeda.tipe === "disalin_dari" && putusBeda.miripDengan?.id === "id-lama", putusBeda.alasan ?? "");
  const putusSama = cariKandidatDuplikatLunak({ judul: JUDUL_B, sumberId: "sumber-lain", waktuDiambil: SEKARANG, kandidat: kandidatSatu });
  cek("dedup lunak: kandidat sumber sama -> duplikat", putusSama.kandidat && putusSama.tipe === "duplikat");
  const putusTua = cariKandidatDuplikatLunak({
    judul: JUDUL_B, sumberId: "sumber-baru", waktuDiambil: SEKARANG,
    kandidat: [{ ...kandidatSatu[0], waktu_diambil: new Date(SEKARANG.getTime() - 49 * 3600 * 1000).toISOString() }],
  });
  cek("dedup lunak: di luar 48 jam -> bukan kandidat", !putusTua.kandidat);
  const putusBedaTopik = cariKandidatDuplikatLunak({ judul: JUDUL_C, sumberId: "sumber-baru", waktuDiambil: SEKARANG, kandidat: kandidatSatu });
  cek("dedup lunak: judul beda topik -> bukan kandidat", !putusBedaTopik.kandidat);

  // ================= B. RSS: tanggal + batas body =================
  const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
    <title>Berita Atom</title><link href="https://contoh.test/atom/1"/>
    <published>2026-11-15T08:00:00Z</published><updated>2026-11-16T09:30:00Z</updated>
    <summary>Ringkasan atom.</summary></entry>
    <entry><title>Hanya Updated</title><link href="https://contoh.test/atom/2"/>
    <updated>2026-11-16T10:00:00Z</updated><summary>Tanpa tanggal terbit.</summary></entry></feed>`;
  const hasilAtom = parseRss(atom);
  cek("rss: published dipakai sebagai tanggal terbit", hasilAtom[0]?.waktuTerbit?.toISOString() === "2026-11-15T08:00:00.000Z", hasilAtom[0]?.waktuTerbit?.toISOString() ?? "null");
  cek("rss: updated -> metadata.waktu_revisi (bukan tanggal terbit)", hasilAtom[0]?.metadata?.waktu_revisi === "2026-11-16T09:30:00.000Z", String(hasilAtom[0]?.metadata?.waktu_revisi));
  cek("rss: hanya updated -> waktuTerbit null + waktu_revisi ada", hasilAtom[1]?.waktuTerbit === null && hasilAtom[1]?.metadata?.waktu_revisi === "2026-11-16T10:00:00.000Z");
  const rssDc = parseRss(buatRss(buatItemRss("Judul DC", "https://contoh.test/dc/1", "Mon, 16 Nov 2026 07:00:00 GMT").replace("</item>", "<dc:date>2026-11-14T07:00:00Z</dc:date></item>")));
  cek("rss: pubDate menang atas dc:date", rssDc[0]?.waktuTerbit?.toISOString() === "2026-11-16T07:00:00.000Z", rssDc[0]?.waktuTerbit?.toISOString() ?? "null");

  const fetchBesar = async () => new Response("x".repeat(6 * 1024 * 1024));
  let galatBesar = null;
  try {
    await fetchRss("https://contoh.test/besar", { fetchFn: fetchBesar, lewatiAllowlist: true });
  } catch (e) { galatBesar = e; }
  cek("rss: body stream > 5 MB ditolak", galatBesar instanceof Error && /melebihi batas/.test(galatBesar.message), galatBesar?.message ?? "tidak melempar");
  const fetchHeaderBesar = async () =>
    new Response("kecil", { headers: { "content-length": String(6 * 1024 * 1024) } });
  let galatHeader = null;
  try {
    await fetchRss("https://contoh.test/besar2", { fetchFn: fetchHeaderBesar, lewatiAllowlist: true });
  } catch (e) { galatHeader = e; }
  cek("rss: content-length > 5 MB ditolak tanpa membaca body", galatHeader instanceof Error && /melebihi batas/.test(galatHeader.message));
  cek("rss: BATAS_BODY_RSS_BYTE = 5 MB", BATAS_BODY_RSS_BYTE === 5 * 1024 * 1024);
  const fetchKecil = async () => responsMock({ teks: buatRss(buatItemRss("Kecil OK", "https://contoh.test/kecil/1", "Mon, 16 Nov 2026 07:00:00 GMT")) });
  const hasilKecil = await fetchRss("https://contoh.test/kecil", { fetchFn: fetchKecil, lewatiAllowlist: true });
  cek("rss: feed kecil tetap terparse", hasilKecil.items.length === 1 && hasilKecil.items[0].judul === "Kecil OK");

  // ================= C. GDELT: tanggal =================
  cek("gdelt: parseSeendate 20261116080000 -> UTC", parseSeendate("20261116080000")?.toISOString() === "2026-11-16T08:00:00.000Z");
  const gdeltJson = {
    articles: [
      { url: "https://contoh.test/gdelt/1", title: "Berita GDELT Satu", seendate: "20261116080000", domain: "contoh.test", language: "indonesian", sourcecountry: "Indonesia", socialimage: "" },
      { url: "https://contoh.test/gdelt/2", title: "Berita GDELT Dua", seendate: "", domain: "contoh.test", language: "indonesian", sourcecountry: "Indonesia" },
    ],
  };
  const fetchGdeltMock = async () => responsMock({ json: gdeltJson });
  const hasilGdelt = await fetchGdelt("Indonesia", { fetchFn: fetchGdeltMock });
  cek("gdelt: waktuTerbit null (seendate bukan tanggal terbit)", hasilGdelt.items.every((i) => i.waktuTerbit === null));
  cek("gdelt: seendate -> metadata.waktu_dilihat_gdelt ISO", hasilGdelt.items[0]?.metadata?.waktu_dilihat_gdelt === "2026-11-16T08:00:00.000Z", String(hasilGdelt.items[0]?.metadata?.waktu_dilihat_gdelt));
  cek("gdelt: seendate mentah dipertahankan", hasilGdelt.items[0]?.metadata?.seendate === "20261116080000");
  cek("gdelt: tanpa seendate -> waktu_dilihat_gdelt null", hasilGdelt.items[1]?.metadata?.waktu_dilihat_gdelt === null);
  const fetchGdelt429 = async () => responsMock({ ok: false, status: 429, retryAfter: "2" });
  let galat429 = null;
  try {
    await fetchGdelt("Indonesia", { fetchFn: fetchGdelt429 });
  } catch (e) { galat429 = e; }
  cek("gdelt: 429 -> GalatSementara + Retry-After 2 dtk", galat429 instanceof GalatSementara && galat429.status === 429 && galat429.retryAfterDetik === 2, galat429?.message ?? "bukan GalatSementara");

  // ================= D. Retry helper =================
  cek("retry: parseRetryAfter angka", parseRetryAfter("120") === 120);
  cek("retry: parseRetryAfter tanggal HTTP", (() => {
    const besok = new Date(Date.now() + 45_000).toUTCString();
    const n = parseRetryAfter(besok);
    return n !== null && n >= 44 && n <= 45;
  })());
  cek("retry: parseRetryAfter null -> null", parseRetryAfter(null) === null && parseRetryAfter("bukan-angka") === null);
  {
    const jeda = [];
    let panggilan = 0;
    const flaky = async () => {
      panggilan++;
      if (panggilan === 1) throw new GalatSementara("429", { status: 429, retryAfterDetik: 0 });
      if (panggilan === 2) throw new GalatSementara("500", { status: 500 });
      return "sukses";
    };
    const hasil = await cobaUlang(flaky, { percobaanMaks: 3, jedaAwalMs: 10, tidur: async (ms) => { jeda.push(ms); } });
    cek("retry: 429 (Retry-After 0) lalu 500 lalu sukses = 3 percobaan", hasil.nilai === "sukses" && hasil.percobaan === 3 && panggilan === 3, `jeda=${JSON.stringify(jeda)}`);
    // Fase 3 (jitter): jeda kedua TIDAK LAGI persis 20 ms — backoff
    // 10x2 dengan jitter ±25–50% (15–30 ms). Jeda pertama tetap 0
    // (Retry-After 0 x jitter berapa pun = 0).
    cek("retry: Retry-After mengalahkan backoff (jeda pertama 0, lalu ~10x2)", jeda[0] === 0 && jeda[1] >= 15 && jeda[1] <= 30, `jeda=${JSON.stringify(jeda)}`);
  }
  {
    let panggilan = 0;
    const fatal = async () => { panggilan++; throw new Error("400 validasi"); };
    let galat = null;
    try { await cobaUlang(fatal, { tidur: async () => {} }); } catch (e) { galat = e; }
    cek("retry: galat non-sementara langsung dilempar (1 percobaan)", panggilan === 1 && galat?.message === "400 validasi" && percobaanGalat(galat) === 1);
  }
  {
    let panggilan = 0;
    const selaluGagal = async () => { panggilan++; throw new GalatSementara("503", { status: 503 }); };
    let galat = null;
    try { await cobaUlang(selaluGagal, { percobaanMaks: 3, jedaAwalMs: 1, tidur: async () => {} }); } catch (e) { galat = e; }
    cek("retry: 503 permanen -> throw sesudah 3 percobaan", panggilan === 3 && percobaanGalat(galat) === 3);
  }

  // ================= E. Engine: integrasi PGlite =================
  async function buatSumber(nama, jenis, url, prioritas = 50) {
    const r = await db.query(
      `insert into public.pf_sources (nama, jenis, url, prioritas, aktif) values ($1,$2,$3,$4,true) returning id`,
      [nama, jenis, url, prioritas],
    );
    return { id: r.rows[0].id, nama, jenis, url, prioritas, aktif: true };
  }
  async function seedItem(sumberId, judul, url, jamLalu = 1, status = "baru") {
    const { hashJudul, hashUrl } = await import("../src/lib/ingestion/dedup.ts");
    const waktu = new Date(SEKARANG.getTime() - jamLalu * 3600 * 1000);
    const r = await db.query(
      `insert into public.pf_raw_items
         (sumber_id, url, hash_url, judul, hash_judul, ringkasan, isi_ringkas,
          waktu_terbit_asli, waktu_diambil, status, status_verifikasi, metadata)
       values ($1,$2,$3,$4,$5,'','', $6, $7, $8, 'UNCONFIRMED', '{}') returning id`,
      [sumberId, url, hashUrl(url), judul, hashJudul(judul), waktu, waktu, status],
    );
    return r.rows[0].id;
  }

  // E1. Dedup lunak end-to-end: parafrase disimpan + ditandai, kontrol tidak.
  const sumberA = await buatSumber("Sumber A", "rss", "https://contoh.test/a.xml", 60);
  const sumberB = await buatSumber("Sumber B", "rss", "https://contoh.test/b.xml", 50);
  await seedItem(sumberA.id, JUDUL_A, "https://contoh.test/a/lama", 1);
  const xmlB = buatRss(
    buatItemRss(JUDUL_B, "https://contoh.test/b/parafrase", "Mon, 16 Nov 2026 08:00:00 GMT") +
    buatItemRss(JUDUL_C, "https://contoh.test/b/kontrol", "Mon, 16 Nov 2026 08:00:00 GMT"),
  );
  const fetchB = async () => responsMock({ teks: xmlB });
  const hasilB = await jalankanIngestion(adapter, [sumberB], {
    dipicu_oleh: "manual", fetchFn: fetchB, lewatiAllowlistFeed: true,
    retry: { jedaAwalMs: 1, jedaMaksMs: 5 },
  });
  const runB = hasilB.perSumber[0];
  cek("engine dedup lunak: parafrase + kontrol = 2 baru", runB.baru === 2, `baru=${runB.baru}`);
  cek("engine dedup lunak: duplikat_lunak = 1", runB.duplikat_lunak === 1, `duplikat_lunak=${runB.duplikat_lunak}`);
  cek("engine dedup lunak: kandidat tercatat di log run", (runB.kandidat_duplikat_lunak ?? []).length === 1 && runB.kandidat_duplikat_lunak[0].tipe === "disalin_dari" && runB.kandidat_duplikat_lunak[0].kemiripan >= 0.8);
  const barisParafrase = await db.query(
    `select status, alasan, metadata from public.pf_raw_items where url = $1`,
    ["https://contoh.test/b/parafrase"],
  );
  cek("engine dedup lunak: item tetap 'baru' (tidak dihapus)", barisParafrase.rows[0]?.status === "baru");
  cek("engine dedup lunak: metadata.kandidat_duplikat_lunak terisi", barisParafrase.rows[0]?.metadata?.kandidat_duplikat_lunak?.tipe === "disalin_dari" && typeof barisParafrase.rows[0]?.metadata?.kandidat_duplikat_lunak?.kemiripan === "number");
  const barisKontrol = await db.query(
    `select alasan, metadata from public.pf_raw_items where url = $1`,
    ["https://contoh.test/b/kontrol"],
  );
  cek("engine dedup lunak: kontrol tanpa kandidat", barisKontrol.rows[0]?.alasan === null && !barisKontrol.rows[0]?.metadata?.kandidat_duplikat_lunak);

  // E2. Basi: sumber produktif + 0 item -> sebagian; sumber baru + 0 item -> selesai.
  const sumberProduktif = await buatSumber("Sumber Produktif", "rss", "https://contoh.test/produktif.xml", 40);
  await seedItem(sumberProduktif.id, "Berita lama produktif", "https://contoh.test/produktif/lama", 49);
  const sumberBaru = await buatSumber("Sumber Baru", "rss", "https://contoh.test/baru.xml", 30);
  const fetchKosong = async () => responsMock({ teks: buatRss("") });
  const hasilKosong = await jalankanIngestion(adapter, [sumberProduktif, sumberBaru], {
    dipicu_oleh: "manual", fetchFn: fetchKosong, lewatiAllowlistFeed: true,
    retry: { jedaAwalMs: 1, jedaMaksMs: 5 },
  });
  const runProduktif = hasilKosong.perSumber.find((h) => h.sumber_nama === "Sumber Produktif");
  const runBaru = hasilKosong.perSumber.find((h) => h.sumber_nama === "Sumber Baru");
  cek("engine basi: 0 item sumber produktif -> peringatan_basi", !!runProduktif?.peringatan_basi && /produktif/.test(runProduktif.peringatan_basi), runProduktif?.peringatan_basi ?? "");
  const statusRunProduktif = await db.query(
    `select status, error from public.pf_ingestion_runs where sumber_id = $1 order by dimulai_pada desc limit 1`,
    [sumberProduktif.id],
  );
  cek("engine basi: run ditandai 'sebagian' + error berisi peringatan", statusRunProduktif.rows[0]?.status === "sebagian" && /produktif/.test(statusRunProduktif.rows[0]?.error ?? ""), `status=${statusRunProduktif.rows[0]?.status}`);
  cek("engine basi: 0 item sumber tanpa riwayat -> selesai tanpa peringatan", runBaru?.peringatan_basi == null);
  const statusRunBaru = await db.query(
    `select status from public.pf_ingestion_runs where sumber_id = $1 order by dimulai_pada desc limit 1`,
    [sumberBaru.id],
  );
  cek("engine basi: run sumber baru berstatus 'selesai'", statusRunBaru.rows[0]?.status === "selesai");

  // E3. Retry RSS: 500 dua kali lalu sukses.
  const sumberRetry = await buatSumber("Sumber Retry", "rss", "https://contoh.test/retry.xml", 20);
  let hitungRetry = 0;
  const fetchRetry = async () => {
    hitungRetry++;
    if (hitungRetry <= 2) return responsMock({ ok: false, status: 500 });
    return responsMock({ teks: buatRss(buatItemRss("Berita retry sukses", "https://contoh.test/retry/1", "Mon, 16 Nov 2026 08:00:00 GMT")) });
  };
  const hasilRetry = await jalankanIngestion(adapter, [sumberRetry], {
    dipicu_oleh: "manual", fetchFn: fetchRetry, lewatiAllowlistFeed: true,
    retry: { jedaAwalMs: 1, jedaMaksMs: 5 },
  });
  cek("engine retry: 500 2x lalu sukses -> baru=1, 3 panggilan", hasilRetry.perSumber[0].baru === 1 && hitungRetry === 3 && hasilRetry.perSumber[0].percobaan_fetch === 3, `baru=${hasilRetry.perSumber[0].baru} panggilan=${hitungRetry}`);

  // E4. Retry GDELT 429 (Retry-After 0) lalu sukses. Pakai baris GDELT
  // yang sudah di-seed migrasi v1 (url unik — tidak bisa insert lagi).
  const gdeltSeed = await db.query(`select id from public.pf_sources where nama = 'GDELT DOC API' limit 1`);
  const sumberGdelt = { id: gdeltSeed.rows[0].id, nama: "GDELT DOC API", jenis: "api", url: "https://api.gdeltproject.org/api/v2/doc/doc", prioritas: 10, aktif: true };
  let hitungGdelt = 0;
  const fetchGdeltRetry = async (url) => {
    if (String(url).includes("gdeltproject")) {
      hitungGdelt++;
      if (hitungGdelt === 1) return responsMock({ ok: false, status: 429, retryAfter: "0" });
      return responsMock({ json: { articles: [{ url: "https://contoh.test/gdelt/ok", title: "Berita GDELT sesudah 429", seendate: "20261116080000", domain: "contoh.test", language: "indonesian", sourcecountry: "Indonesia" }] } });
    }
    return responsMock({ teks: buatRss("") });
  };
  const hasilGdeltRetry = await jalankanIngestion(adapter, [sumberGdelt], {
    dipicu_oleh: "manual", fetchFn: fetchGdeltRetry,
    retry: { jedaAwalMs: 1, jedaMaksMs: 5 },
  });
  cek("engine retry GDELT: 429 lalu sukses -> baru=1, 2 panggilan", hasilGdeltRetry.perSumber[0].baru === 1 && hitungGdelt === 2, `baru=${hasilGdeltRetry.perSumber[0].baru} panggilan=${hitungGdelt}`);
  const barisGdelt = await db.query(
    `select waktu_terbit_asli, metadata from public.pf_raw_items where url = $1`,
    ["https://contoh.test/gdelt/ok"],
  );
  cek("engine GDELT: item tersimpan tanpa tanggal terbit + waktu_dilihat_gdelt", barisGdelt.rows[0]?.waktu_terbit_asli === null && barisGdelt.rows[0]?.metadata?.waktu_dilihat_gdelt === "2026-11-16T08:00:00.000Z");

  // E5. Gagal permanen (500 terus) -> run 'gagal' + 'sesudah 3 percobaan'.
  const sumberMati = await buatSumber("Sumber Mati", "rss", "https://contoh.test/mati.xml", 15);
  let hitungMati = 0;
  const fetchMati = async () => { hitungMati++; return responsMock({ ok: false, status: 500 }); };
  const hasilMati = await jalankanIngestion(adapter, [sumberMati], {
    dipicu_oleh: "manual", fetchFn: fetchMati, lewatiAllowlistFeed: true,
    retry: { jedaAwalMs: 1, jedaMaksMs: 5 },
  });
  cek("engine gagal permanen: 3 percobaan lalu run gagal", hasilMati.perSumber[0].gagal === 1 && hitungMati === 3 && /sesudah 3 percobaan/.test(hasilMati.perSumber[0].error ?? ""), hasilMati.perSumber[0].error ?? "");

  // E6. Topik GDELT per sumber: dua sumber api, topik berbeda, sekali panggil tiap topik.
  // (URL dibedakan karena pf_sources.url unik; engine mengabaikan url untuk jenis api.)
  const sumberTopik1 = await buatSumber("GDELT Pendidikan", "api", "https://api.gdeltproject.org/api/v2/doc/doc?uji=1", 12);
  const sumberTopik2 = await buatSumber("GDELT Kesehatan", "api", "https://api.gdeltproject.org/api/v2/doc/doc?uji=2", 11);
  const topikDipanggil = [];
  const fetchTopik = async (url) => {
    const u = new URL(String(url));
    const topik = u.searchParams.get("query") ?? "";
    topikDipanggil.push(topik);
    return responsMock({ json: { articles: [{ url: `https://contoh.test/topik/${encodeURIComponent(topik)}`, title: `Berita topik ${topik} hari ini di Indonesia`, seendate: "20261116080000", domain: "contoh.test", language: "indonesian", sourcecountry: "Indonesia" }] } });
  };
  const hasilTopik = await jalankanIngestion(adapter, [sumberTopik1, sumberTopik2], {
    dipicu_oleh: "manual", fetchFn: fetchTopik,
    topikGdeltPerSumber: { [sumberTopik1.id]: "Pendidikan", [sumberTopik2.id]: "Kesehatan" },
    retry: { jedaAwalMs: 1, jedaMaksMs: 5 },
  });
  cek("engine topik per sumber: tiap topik dipanggil tepat 1x", topikDipanggil.filter((t) => t === "Pendidikan").length === 1 && topikDipanggil.filter((t) => t === "Kesehatan").length === 1 && !topikDipanggil.includes("Indonesia"), `dipanggil=${JSON.stringify(topikDipanggil)}`);
  cek("engine topik per sumber: kedua sumber dapat 1 item baru", hasilTopik.perSumber.every((h) => h.baru === 1), JSON.stringify(hasilTopik.perSumber.map((h) => h.baru)));
  // Topik dari kolom sumber.topik_gdelt mengalahkan peta opsi.
  const topikDipanggil2 = [];
  const fetchTopik2 = async (url) => {
    topikDipanggil2.push(new URL(String(url)).searchParams.get("query"));
    return responsMock({ json: { articles: [] } });
  };
  await jalankanIngestion(adapter, [{ ...sumberTopik1, topik_gdelt: "Teknologi" }], {
    dipicu_oleh: "manual", fetchFn: fetchTopik2,
    topikGdeltPerSumber: { [sumberTopik1.id]: "Pendidikan" },
    retry: { jedaAwalMs: 1, jedaMaksMs: 5 },
  });
  cek("engine topik per sumber: sumber.topik_gdelt mengalahkan opsi", topikDipanggil2[0] === "Teknologi", `dipanggil=${JSON.stringify(topikDipanggil2)}`);

  // E7. Dedup eksak tetap jalan (run ke-2 sumber B -> 0 baru).
  const hasilB2 = await jalankanIngestion(adapter, [sumberB], {
    dipicu_oleh: "manual", fetchFn: fetchB, lewatiAllowlistFeed: true,
    retry: { jedaAwalMs: 1, jedaMaksMs: 5 },
  });
  cek("engine regresi: run ke-2 feed sama -> 0 baru", hasilB2.perSumber[0].baru === 0 && hasilB2.perSumber[0].duplikat === 2, `baru=${hasilB2.perSumber[0].baru} duplikat=${hasilB2.perSumber[0].duplikat}`);

  // ================= F. Pemeliharaan antrean =================
  cek("pemeliharaan: AMBANG_BASI_JAM 48 + UMUR_KEDALUWARSA_HARI 14", AMBANG_BASI_JAM === 48 && UMUR_KEDALUWARSA_HARI === 14);
  cek("pemeliharaan: apakahBasi 49 jam -> true, 47 jam -> false, null -> true",
    apakahBasi(new Date(SEKARANG.getTime() - 49 * 3600 * 1000), SEKARANG) &&
    !apakahBasi(new Date(SEKARANG.getTime() - 47 * 3600 * 1000), SEKARANG) &&
    apakahBasi(null, SEKARANG));
  const basiMurni = hitungSumberBasi([
    { sumber_id: "s1", sumber_nama: "Tua", terakhir_item: new Date(SEKARANG.getTime() - 50 * 3600 * 1000) },
    { sumber_id: "s2", sumber_nama: "Segar", terakhir_item: new Date(SEKARANG.getTime() - 2 * 3600 * 1000) },
    { sumber_id: "s3", sumber_nama: "Tak Pernah", terakhir_item: null },
  ], SEKARANG);
  cek("pemeliharaan: hitungSumberBasi saring 2 dari 3", basiMurni.length === 2 && basiMurni.find((b) => b.sumber_id === "s3")?.pernah_produktif === false && basiMurni.find((b) => b.sumber_id === "s1")?.jam_sejak_item_terakhir === 50);
  cek("pemeliharaan: batasKedaluarsa 14 hari", batasKedaluarsa(SEKARANG, 14).getTime() === SEKARANG.getTime() - 14 * 24 * 3600 * 1000);

  const basiDb = await periksaSumberBasi(adapter, [
    { id: sumberProduktif.id, nama: "Sumber Produktif" },
    { id: sumberBaru.id, nama: "Sumber Baru" },
  ]);
  cek("pemeliharaan: periksaSumberBasi menemukan keduanya (produktif basi + baru belum pernah berproduksi)", basiDb.some((b) => b.sumber_nama === "Sumber Produktif" && b.pernah_produktif) && basiDb.some((b) => b.sumber_nama === "Sumber Baru" && !b.pernah_produktif), JSON.stringify(basiDb.map((b) => `${b.sumber_nama}:${b.pernah_produktif}`)));
  const statusBasi = await db.query(`select status_terakhir from public.pf_sources where id = $1`, [sumberProduktif.id]);
  cek("pemeliharaan: status_terakhir sumber basi berisi 'BASI:'", /BASI:/.test(statusBasi.rows[0]?.status_terakhir ?? ""), statusBasi.rows[0]?.status_terakhir ?? "");

  // Kedaluwarsa: item 15 hari -> ditandai; item 5 hari -> tidak.
  const idTua = await seedItem(sumberA.id, "Berita sangat lama tak terverifikasi", "https://contoh.test/a/sangat-lama", 15 * 24);
  const idMuda = await seedItem(sumberA.id, "Berita masih muda", "https://contoh.test/a/muda", 5 * 24);
  const pemeliharaan = await jalankanPemeliharaanAntrean(adapter, [{ id: sumberA.id, nama: "Sumber A" }]);
  cek("pemeliharaan: jalankanPemeliharaanAntrean menandai 1 kedaluwarsa", pemeliharaan.kedaluarsa_ditandai === 1, `ditandai=${pemeliharaan.kedaluarsa_ditandai}`);
  const barisTua = await db.query(`select status, alasan, metadata from public.pf_raw_items where id = $1`, [idTua]);
  cek("pemeliharaan: item 15 hari -> status 'ditolak' + alasan kedaluwarsa", barisTua.rows[0]?.status === "ditolak" && (barisTua.rows[0]?.alasan ?? "").startsWith("Kedaluarsa otomatis") && typeof barisTua.rows[0]?.metadata?.kedaluarsa_pada === "string");
  const barisMuda = await db.query(`select status from public.pf_raw_items where id = $1`, [idMuda]);
  cek("pemeliharaan: item 5 hari tetap 'baru'", barisMuda.rows[0]?.status === "baru");
  const urutan = urutKejar([
    { waktu_diambil: "2026-11-16T10:00:00Z" },
    { waktu_diambil: "2026-11-14T10:00:00Z" },
    { waktu_diambil: "2026-11-15T10:00:00Z" },
  ]);
  cek("pemeliharaan: urutKejar tertua dulu", urutan[0].waktu_diambil === "2026-11-14T10:00:00Z" && urutan[2].waktu_diambil === "2026-11-16T10:00:00Z");

  // ================= G. Antrean: hitungan paralel vs sekuensial =================
  async function hitungPerStatus(status) {
    const r = await db.query(`select count(*)::int as n from public.pf_raw_items where status = $1`, [status]);
    return r.rows[0].n;
  }
  const STATUS = ["baru", "duplikat", "ditolak", "disalin_dari"];
  const sekuensial = [];
  for (const s of STATUS) sekuensial.push(await hitungPerStatus(s));
  const paralel = await Promise.all(STATUS.map((s) => hitungPerStatus(s)));
  cek("antrean: Promise.all 4 hitungan = sekuensial", JSON.stringify(paralel) === JSON.stringify(sekuensial), `paralel=${JSON.stringify(paralel)}`);
  const tertuaDb = await db.query(
    `select id, waktu_diambil from public.pf_raw_items
      where status_verifikasi = 'UNCONFIRMED' and status in ('baru','disalin_dari','duplikat')
      order by waktu_diambil asc limit 10`,
  );
  const terurut = tertuaDb.rows.every((r, i, arr) => i === 0 || new Date(arr[i - 1].waktu_diambil) <= new Date(r.waktu_diambil));
  cek("antrean: tertua terurut menaik (kejar ketertinggalan)", terurut && tertuaDb.rows.length > 0, `jumlah=${tertuaDb.rows.length}`);
  const hitungKedaluarsa = await db.query(
    `select count(*)::int as n from public.pf_raw_items where status = 'ditolak' and alasan ilike 'Kedaluarsa otomatis%'`,
  );
  cek("antrean: hitungan kedaluarsa via alasan = 1", hitungKedaluarsa.rows[0].n === 1, `n=${hitungKedaluarsa.rows[0].n}`);

  // ================= H. Lock scheduler =================
  cek("lock: TIMEOUT_LOCK_MENIT = 15 (workflow 10 mnt < lock < cron 30 mnt)", TIMEOUT_LOCK_MENIT === 15);
  const klaim1 = await klaimJob(klienPalsu, "ingestion");
  cek("lock upsert: baris job belum ada -> dibuat + diklaim", klaim1.diklaim && klaim1.tersedia && klaim1.alasan === null, JSON.stringify(klaim1));
  const barisJob = await db.query(`select nama, jadwal_cron, status_terakhir from public.pf_scheduled_jobs where nama = 'ingestion'`);
  cek("lock upsert: baris job kini ada di DB (jadwal dari JADWAL_CRON_JOB)", barisJob.rows[0]?.jadwal_cron === "*/30 * * * *" && barisJob.rows[0]?.status_terakhir === "berjalan");
  const klaim2 = await klaimJob(klienPalsu, "ingestion");
  cek("lock: klaim kedua saat berjalan -> ditolak (tersedia, 409)", !klaim2.diklaim && klaim2.tersedia, JSON.stringify(klaim2));
  const selesai1 = await selesaikanJob(klienPalsu, "ingestion", true);
  cek("lock: selesaikanJob(ok) berhasil", selesai1 === true);
  const klaim3 = await klaimJob(klienPalsu, "ingestion");
  cek("lock: sesudah selesai -> bisa diklaim lagi", klaim3.diklaim);
  // Lock basi (20 menit lalu, masih 'berjalan') bisa direbut; lock segar (5 menit) tidak.
  await db.query(`update public.pf_scheduled_jobs set terakhir_jalan = now() - interval '20 minutes', status_terakhir = 'berjalan' where nama = 'ingestion'`);
  const klaimBasi = await klaimJob(klienPalsu, "ingestion");
  cek("lock: lock basi 20 menit (> 15) bisa direbut", klaimBasi.diklaim, JSON.stringify(klaimBasi));
  await db.query(`update public.pf_scheduled_jobs set terakhir_jalan = now() - interval '5 minutes', status_terakhir = 'berjalan' where nama = 'ingestion'`);
  const klaimSegar = await klaimJob(klienPalsu, "ingestion");
  cek("lock: lock segar 5 menit (< 15) tidak bisa direbut", !klaimSegar.diklaim && klaimSegar.tersedia);
  await selesaikanJob(klienPalsu, "ingestion", true, null, { peringatan: "Sumber basi: Sumber X" });
  const jobPeringatan = await db.query(`select status_terakhir, error_terakhir from public.pf_scheduled_jobs where nama = 'ingestion'`);
  cek("lock: selesaikanJob + peringatan -> status 'berhasil' + error_terakhir PERINGATAN", jobPeringatan.rows[0]?.status_terakhir === "berhasil" && (jobPeringatan.rows[0]?.error_terakhir ?? "").startsWith("PERINGATAN: Sumber basi"), jobPeringatan.rows[0]?.error_terakhir ?? "");
  const klaimAsing = await klaimJob(klienPalsu, "job-tak-dikenal");
  cek("lock: nama job tak dikenal (CHECK) -> tersedia=false, tidak jalan diam-diam", !klaimAsing.diklaim && !klaimAsing.tersedia, JSON.stringify(klaimAsing));
} catch (e) {
  console.log(`\nGAGAL FATAL: ${e instanceof Error ? e.message : String(e)}`);
  gagal++;
} finally {
  await db.close();
}

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
console.log(gagal === 0 ? "HASIL: SEMUA LOLOS" : `HASIL: ${gagal} KEGAGALAN`);
process.exit(gagal === 0 ? 0 : 1);
