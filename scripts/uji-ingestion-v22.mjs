// Baterai ketahanan ingestion PRATA FAKTA — Fase 3 + 6 + 7 (v22/v24).
// PGlite in-memory + fetch di-mock — JANGAN sentuh produksi.
// Skenario: 429+Retry-After, 500, timeout, XML invalid, feed kosong,
// duplikat GUID/URL/judul, 304, satu sumber gagal tidak mengganggu
// sumber lain, cooldown sesudah 429 + run berikut melewati sumber
// itu, circuit breaker, poll interval, klasifikasi, klaster event,
// dan fail-soft TANPA kolom v22 (adapter lama + DB v3 saja).
// Keluar 0 bila semua uji lolos, 1 bila ada yang gagal.
//
// Jalankan:
//   node --experimental-strip-types --import /tmp/pf-register.mjs scripts/uji-ingestion-v22.mjs
import fs from "node:fs";

import { PGlite } from "./butuh-pglite.mjs";

import { jalankanIngestion } from "../src/lib/ingestion/engine.ts";
import {
  cobaUlang,
  GalatSementara,
  parseRetryAfter,
  tambahJitter,
} from "../src/lib/ingestion/retry.ts";
import { klasifikasikanItem } from "../src/lib/ingestion/klasifikasi.ts";
import { kelompokkanKlaster } from "../src/lib/ingestion/klaster.ts";
import { hitungKesehatanSumber } from "../src/lib/ingestion/kesehatan-sumber.ts";
import { fetchRss } from "../src/lib/ingestion/rss.ts";

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

// ---------- Fixture ----------

function lolosXml(teks) {
  return String(teks)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buatRss(items) {
  const isi = items
    .map(
      (it) => `<item><title>${lolosXml(it.judul)}</title><link>${lolosXml(it.url)}</link>` +
        `<description>${lolosXml(it.deskripsi ?? "Ringkasan uji.")}</description>` +
        (it.guid ? `<guid>${lolosXml(it.guid)}</guid>` : "") +
        `<pubDate>${it.pubDate ?? "Mon, 17 Nov 2026 03:00:00 GMT"}</pubDate></item>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Uji</title>\n${isi}\n</channel></rss>`;
}

const RSS_KOSONG =
  `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Kosong</title></channel></rss>`;
const XML_INVALID = `bukan xml sama sekali {{{ ]]>&&&`;

function mockRespons(status, badan = "", kepala = {}) {
  const h = new Headers();
  for (const [k, v] of Object.entries(kepala)) h.set(k, v);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: h,
    text: async () => badan,
  };
}

// Mock fetch dengan tabel routing per-skenario + penghitung panggilan.
function buatMockFetch(rute, penghitung) {
  return async (url, init = {}) => {
    const kunci = Object.keys(rute).find((k) => url.includes(k));
    penghitung.total = (penghitung.total ?? 0) + 1;
    if (kunci) penghitung[kunci] = (penghitung[kunci] ?? 0) + 1;
    const handler = kunci ? rute[kunci] : null;
    if (!handler) return mockRespons(404, "tidak ada rute mock");
    return handler(url, init);
  };
}

// ---------- Adapter PGlite ----------

function bacaMigrasi(nama) {
  let sql = fs.readFileSync(`${DIR_MIGRASI}/${nama}`, "utf8");
  sql = sql.replace(/create extension[^;]+;/gi, "-- ekstensi dilepas (PGlite)");
  sql = sql.replace(/\bcitext\b/gi, "text");
  return sql;
}

async function buatDb({ denganV22 = true, denganV24 = true } = {}) {
  const db = new PGlite();
  await db.exec(`create schema if not exists auth;`);
  await db.exec(`create schema if not exists extensions;`);
  await db.exec(`create table auth.users (id uuid primary key, email text);`);
  await db.exec(
    `create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`,
  );
  for (const nama of [
    "20261116_pf_v1_foundation.sql",
    "20261116_pf_v2_articles.sql",
    "20261116_pf_v3_ingestion.sql",
  ]) {
    await db.exec(bacaMigrasi(nama));
  }
  if (denganV24) await db.exec(bacaMigrasi("20261117_pf_v24_klaster_item.sql"));
  if (denganV22) {
    // Simulasi migrasi v22 Worker A (kolom-kolomnya — produksi
    // belum menerapkannya saat baterai ini ditulis).
    await db.exec(`
      alter table public.pf_sources add column if not exists poll_interval_minutes integer;
      alter table public.pf_sources add column if not exists etag text;
      alter table public.pf_sources add column if not exists last_modified timestamptz;
      alter table public.pf_sources add column if not exists failure_count integer not null default 0;
      alter table public.pf_sources add column if not exists cooldown_until timestamptz;
      alter table public.pf_sources add column if not exists health_status text;
      alter table public.pf_sources add column if not exists last_success_at timestamptz;
    `);
  }
  // Hapus seed sumber v1 (7 RSS + GDELT) agar tiap skenario hanya
  // menguji sumber yang ia daftarkan sendiri — tanpa ini, bacaSumber
  // ikut mengembalikan seed (URL asli, fetch mock 404) dan merusak
  // hitungan total + menabrak UNIQUE(url) saat menambah GDELT.
  await db.exec(`delete from public.pf_sources;`);
  return db;
}

async function tambahSumber(db, { nama, jenis, url, prioritas = 50 }) {
  const r = await db.query(
    `insert into public.pf_sources (nama, jenis, url, prioritas, aktif)
     values ($1, $2, $3, $4, true) returning id`,
    [nama, jenis, url, prioritas],
  );
  return r.rows[0].id;
}

// Adapter uji: denganV22=false -> metode opsional v22/v24 TIDAK ADA
// sama sekali (meniru adapter lama + DB tanpa kolom v22).
function buatAdapter(db, { denganV22 = true } = {}) {
  const dasar = {
    async cariHashUrl(hash) {
      const r = await db.query(
        `select id from public.pf_raw_items where hash_url = $1 limit 1`,
        [hash],
      );
      return r.rows[0] ? { id: r.rows[0].id } : null;
    },
    async cariHashJudul(hash) {
      const r = await db.query(
        `select id, sumber_id, waktu_terbit_asli, waktu_diambil
           from public.pf_raw_items where hash_judul = $1 order by waktu_diambil asc`,
        [hash],
      );
      return r.rows.map((b) => ({
        id: b.id,
        sumber_id: b.sumber_id ?? null,
        waktu_terbit_asli: b.waktu_terbit_asli
          ? new Date(b.waktu_terbit_asli).toISOString()
          : null,
        waktu_diambil: new Date(b.waktu_diambil).toISOString(),
      }));
    },
    async simpanItem(item) {
      const r = await db.query(
        `insert into public.pf_raw_items
           (sumber_id, run_id, url, hash_url, judul, hash_judul, ringkasan,
            isi_ringkas, penulis, waktu_terbit_asli, waktu_diambil, status,
            status_verifikasi, disalin_dari_id, diterbitkan_ulang, alasan, metadata)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         on conflict (hash_url) do nothing returning id`,
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
      return r.rows[0]?.id;
    },
    async buatRun(input) {
      const r = await db.query(
        `insert into public.pf_ingestion_runs
           (sumber_id, sumber_nama, dimulai_pada, status, dipicu_oleh)
         values ($1, $2, now(), 'berjalan', $3) returning id`,
        [input.sumber_id, input.sumber_nama, input.dipicu_oleh],
      );
      return r.rows[0].id;
    },
    async tutupRun(id, patch) {
      // Meniru adapter NAIF (tanpa fallback): tulis status + kelas
      // apa adanya. Di DB v3 saja, status 'rate-limited' melanggar
      // CHECK -> melempar -> engine menangkap (fail-soft engine).
      // Di DB v24, kelas_gagal ikut tertulis.
      const kolomKelas =
        patch.kelasGagal !== undefined ? `, kelas_gagal = $10` : ``;
      const nilai = [
        id,
        patch.selesai_pada,
        patch.status,
        patch.ditemukan,
        patch.baru,
        patch.duplikat,
        patch.ditolak,
        patch.gagal,
        patch.error,
      ];
      if (patch.kelasGagal !== undefined) nilai.push(patch.kelasGagal);
      await db.query(
        `update public.pf_ingestion_runs set
           selesai_pada = $2, status = $3, ditemukan = $4, baru = $5,
           duplikat = $6, ditolak = $7, gagal = $8, error = $9 ${kolomKelas}
         where id = $1`,
        nilai,
      );
    },
    async perbaruiSumber(id, patch) {
      const r = await db.query(
        `select jumlah_item from public.pf_sources where id = $1`,
        [id],
      );
      const sekarang = r.rows[0] ? Number(r.rows[0].jumlah_item ?? 0) : 0;
      await db.query(
        `update public.pf_sources set
           terakhir_diambil = $2, status_terakhir = $3, jumlah_item = $4
         where id = $1`,
        [id, patch.terakhir_diambil, patch.status_terakhir, sekarang + patch.tambah_item],
      );
    },
    async jumlahItemBaruSejak(sumberId, sejak) {
      const r = await db.query(
        `select count(*)::int as j from public.pf_raw_items
          where sumber_id = $1 and waktu_diambil >= $2`,
        [sumberId, sejak],
      );
      return r.rows[0]?.j ?? 0;
    },
    async daftarJudulBaruSejak(sejak, batas = 500) {
      const r = await db.query(
        `select id, judul, sumber_id, waktu_terbit_asli, waktu_diambil
           from public.pf_raw_items where waktu_diambil >= $1
          order by waktu_diambil asc limit $2`,
        [sejak, batas],
      );
      return r.rows.map((b) => ({
        id: b.id,
        judul: b.judul,
        sumber_id: b.sumber_id ?? null,
        waktu_terbit_asli: b.waktu_terbit_asli
          ? new Date(b.waktu_terbit_asli).toISOString()
          : null,
        waktu_diambil: new Date(b.waktu_diambil).toISOString(),
      }));
    },
  };
  if (!denganV22) return dasar;
  return {
    ...dasar,
    async bacaKeadaanSumber(sumberId) {
      try {
        const r = await db.query(
          `select poll_interval_minutes, cooldown_until, failure_count,
                  health_status, etag, last_modified, terakhir_cek, last_success_at
             from public.pf_sources where id = $1`,
          [sumberId],
        );
        const b = r.rows[0];
        if (!b) return null;
        const iso = (v) => (v ? new Date(v).toISOString() : null);
        return {
          poll_interval_minutes: b.poll_interval_minutes ?? null,
          cooldown_until: iso(b.cooldown_until),
          failure_count: b.failure_count ?? null,
          health_status: b.health_status ?? null,
          etag: b.etag ?? null,
          last_modified: iso(b.last_modified),
          terakhir_cek: iso(b.terakhir_cek),
          last_success_at: iso(b.last_success_at),
        };
      } catch {
        return null;
      }
    },
    async tulisKeadaanSumber(sumberId, patch) {
      const set = [];
      const nilai = [sumberId];
      const tambah = (kolom, v) => {
        nilai.push(v);
        set.push(`${kolom} = $${nilai.length}`);
      };
      if (patch.poll_interval_minutes !== undefined) {
        tambah("poll_interval_minutes", patch.poll_interval_minutes);
      }
      if (patch.cooldown_until !== undefined) {
        tambah("cooldown_until", patch.cooldown_until);
      }
      if (patch.failure_count !== undefined) {
        tambah("failure_count", patch.failure_count);
      }
      if (patch.health_status !== undefined) {
        tambah("health_status", patch.health_status);
      }
      if (patch.etag !== undefined) tambah("etag", patch.etag);
      if (patch.last_modified !== undefined) {
        tambah("last_modified", patch.last_modified);
      }
      if (patch.terakhir_cek !== undefined) {
        tambah("terakhir_cek", patch.terakhir_cek);
      }
      if (patch.last_success_at !== undefined) {
        tambah("last_success_at", patch.last_success_at);
      }
      if (set.length === 0) return;
      await db.query(
        `update public.pf_sources set ${set.join(", ")} where id = $1`,
        nilai,
      );
    },
    async cariGuid(guid) {
      try {
        const r = await db.query(
          `select id from public.pf_raw_items where metadata->>'guid' = $1 limit 1`,
          [guid],
        );
        return r.rows[0] ? { id: r.rows[0].id } : null;
      } catch {
        return null;
      }
    },
    async bacaItemUntukKlaster(itemIds) {
      const r = await db.query(
        `select id, judul, sumber_id, waktu_terbit_asli, waktu_diambil
           from public.pf_raw_items where id = any($1::uuid[])`,
        [itemIds],
      );
      return r.rows.map((b) => ({
        id: b.id,
        judul: b.judul,
        sumber_id: b.sumber_id ?? null,
        waktu_terbit_asli: b.waktu_terbit_asli
          ? new Date(b.waktu_terbit_asli).toISOString()
          : null,
        waktu_diambil: new Date(b.waktu_diambil).toISOString(),
      }));
    },
    async simpanKlaster(input) {
      const r = await db.query(
        `insert into public.pf_item_clusters (kunci, judul) values ($1, $2)
         on conflict (kunci) do update set judul = excluded.judul,
           diperbarui_pada = now() returning id`,
        [input.kunci, input.judul],
      );
      const clusterId = r.rows[0].id;
      for (const rawId of input.itemIds) {
        await db.query(
          `insert into public.pf_item_cluster_members (cluster_id, raw_item_id)
           values ($1, $2) on conflict (cluster_id, raw_item_id) do nothing`,
          [clusterId, rawId],
        );
      }
      return clusterId;
    },
  };
}

async function bacaSumber(db) {
  const r = await db.query(
    `select id, nama, jenis, url, prioritas, aktif from public.pf_sources order by prioritas desc`,
  );
  return r.rows;
}

async function hitungBaris(db, sql, params = []) {
  const r = await db.query(sql, params);
  return Number(r.rows[0]?.j ?? 0);
}

// Opsi engine untuk uji: tanpa tidur retry, tanpa stagger.
const OPSI_CEPAT = {
  lewatiAllowlistFeed: true,
  staggerMs: 0,
  retry: { percobaanMaks: 3, jedaAwalMs: 1, jedaMaksMs: 5, tidur: async () => {} },
};

// ================= S1: GDELT 429 + cooldown + run berikut dilewati =================
{
  const db = await buatDb({ denganV22: true, denganV24: true });
  const adapter = buatAdapter(db, { denganV22: true });
  const idRssA = await tambahSumber(db, { nama: "RSS A", jenis: "rss", url: "https://rss-a.contoh.test/feed.xml", prioritas: 80 });
  const idGdelt = await tambahSumber(db, { nama: "GDELT DOC API", jenis: "api", url: "https://api.gdeltproject.org/api/v2/doc/doc", prioritas: 10 });
  // Interval 0 = tiap denyut (agar run ke-2 tidak terhalang poll interval).
  await db.query(`update public.pf_sources set poll_interval_minutes = 0 where id = any($1::uuid[])`, [[idRssA, idGdelt]]);
  const hitung = {};
  const rssA = buatRss([
    { judul: "Gempa Magnitudo 6,5 Guncang Cianjur Jawa Barat", url: "https://rss-a.contoh.test/a1", guid: "rss-a-1" },
    { judul: "Presiden Umumkan Kabinet Baru Pekan Depan", url: "https://rss-a.contoh.test/a2", guid: "rss-a-2" },
  ]);
  const mock = buatMockFetch(
    {
      "rss-a.contoh.test": async () => mockRespons(200, rssA, { etag: '"rss-a-v1"' }),
      "gdeltproject.org": async () => mockRespons(429, "rate limited", { "retry-after": "1" }),
    },
    hitung,
  );
  const sumber = await bacaSumber(db);
  const hasil1 = await jalankanIngestion(adapter, sumber, { ...OPSI_CEPAT, fetchFn: mock });
  const hRss1 = hasil1.perSumber.find((h) => h.sumber_id === idRssA);
  const hGdelt1 = hasil1.perSumber.find((h) => h.sumber_id === idGdelt);
  cek("S1 run1: RSS sehat tetap sukses saat GDELT 429", hRss1?.kelas === "selesai" && hRss1?.baru === 2, `kelas=${hRss1?.kelas} baru=${hRss1?.baru}`);
  cek("S1 run1: GDELT kelas rate-limited", hGdelt1?.kelas === "rate-limited", `kelas=${hGdelt1?.kelas}`);
  cek("S1 run1: GDELT dicoba 3x (retry per-sumber)", hitung["gdeltproject.org"] === 3, `panggilan=${hitung["gdeltproject.org"]}`);
  cek("S1 run1: total.gagal=1 tapi gagal_berat=0 (job success-dengan-peringatan)", hasil1.total.gagal === 1 && hasil1.total.gagal_berat === 0, `gagal=${hasil1.total.gagal} gagal_berat=${hasil1.total.gagal_berat}`);
  cek("S1 run1: per_kelas mencatat rate-limited", hasil1.total.per_kelas["rate-limited"] === 1, JSON.stringify(hasil1.total.per_kelas));
  const keadaan = await db.query(`select failure_count, cooldown_until, health_status from public.pf_sources where id = $1`, [idGdelt]);
  const cd = keadaan.rows[0];
  const selisihCooldown = (new Date(cd.cooldown_until).getTime() - Date.now()) / 1000;
  cek("S1 run1: failure_count=1 sesudah 429", cd.failure_count === 1, `failure_count=${cd.failure_count}`);
  cek("S1 run1: cooldown terisi min 30 mnt meski Retry-After=1 dtk", selisihCooldown > 1700 && selisihCooldown <= 1805, `cooldown ~${Math.round(selisihCooldown)} dtk lagi`);
  const runGdelt = await db.query(
    `select status, kelas_gagal from public.pf_ingestion_runs where sumber_id = $1 order by dimulai_pada desc limit 1`,
    [idGdelt],
  );
  cek("S1 run1: run GDELT tersimpan status rate-limited + kelas_gagal", runGdelt.rows[0]?.status === "rate-limited" && runGdelt.rows[0]?.kelas_gagal === "rate-limited", JSON.stringify(runGdelt.rows[0]));

  // Run ke-2 (langsung): GDELT harus dilewati TANPA fetch; RSS jalan lagi (duplikat).
  const panggilanGdeltRun1 = hitung["gdeltproject.org"];
  const hasil2 = await jalankanIngestion(adapter, sumber, { ...OPSI_CEPAT, fetchFn: mock });
  const hGdelt2 = hasil2.perSumber.find((h) => h.sumber_id === idGdelt);
  const hRss2 = hasil2.perSumber.find((h) => h.sumber_id === idRssA);
  cek("S1 run2: GDELT dilewati tanpa fetch baru", hGdelt2?.kelas === "dilewati" && hitung["gdeltproject.org"] === panggilanGdeltRun1, `kelas=${hGdelt2?.kelas} panggilan_tetap=${hitung["gdeltproject.org"]}`);
  cek("S1 run2: RSS tetap jalan (2 duplikat, 0 baru)", hRss2?.kelas === "selesai" && hRss2?.duplikat === 2 && hRss2?.baru === 0, `duplikat=${hRss2?.duplikat} baru=${hRss2?.baru}`);
  cek("S1 run2: total.gagal_berat tetap 0", hasil2.total.gagal_berat === 0, `gagal_berat=${hasil2.total.gagal_berat}`);
  await db.close();
}

// ================= S2: ETag / 304 =================
{
  const db = await buatDb({ denganV22: true, denganV24: true });
  const adapter = buatAdapter(db, { denganV22: true });
  const idRss = await tambahSumber(db, { nama: "RSS ETag", jenis: "rss", url: "https://rss-etag.contoh.test/feed.xml", prioritas: 80 });
  await db.query(`update public.pf_sources set poll_interval_minutes = 0 where id = $1`, [idRss]);
  const rss = buatRss([{ judul: "Rupiah Menguat Terhadap Dolar Amerika", url: "https://rss-etag.contoh.test/e1", guid: "etag-1" }]);
  let ifNoneMatchDilihat = null;
  const mock = buatMockFetch(
    {
      "rss-etag.contoh.test": async (_url, init) => {
        ifNoneMatchDilihat = init?.headers?.["If-None-Match"] ?? null;
        if (ifNoneMatchDilihat === '"etag-v1"') return mockRespons(304, "", { etag: '"etag-v1"' });
        return mockRespons(200, rss, { etag: '"etag-v1"' });
      },
    },
    {},
  );
  const sumber = await bacaSumber(db);
  const hasil1 = await jalankanIngestion(adapter, sumber, { ...OPSI_CEPAT, fetchFn: mock });
  cek("S2 run1: 1 item baru, ETag disimpan", hasil1.perSumber[0]?.baru === 1, `baru=${hasil1.perSumber[0]?.baru}`);
  const etagDb = await db.query(`select etag from public.pf_sources where id = $1`, [idRss]);
  cek("S2 run1: kolom etag terisi", etagDb.rows[0]?.etag === '"etag-v1"', `etag=${etagDb.rows[0]?.etag}`);
  const jumlahSebelum = await hitungBaris(db, `select count(*)::int as j from public.pf_raw_items`);
  const hasil2 = await jalankanIngestion(adapter, sumber, { ...OPSI_CEPAT, fetchFn: mock });
  const jumlahSesudah = await hitungBaris(db, `select count(*)::int as j from public.pf_raw_items`);
  cek("S2 run2: If-None-Match dikirim", ifNoneMatchDilihat === '"etag-v1"', `header=${ifNoneMatchDilihat}`);
  cek("S2 run2: 304 -> tidak_berubah, kelas selesai", hasil2.perSumber[0]?.tidak_berubah === true && hasil2.perSumber[0]?.kelas === "selesai", `tidak_berubah=${hasil2.perSumber[0]?.tidak_berubah} kelas=${hasil2.perSumber[0]?.kelas}`);
  cek("S2 run2: 304 tidak menyimpan item kosong", jumlahSebelum === 1 && jumlahSesudah === 1, `sebelum=${jumlahSebelum} sesudah=${jumlahSesudah}`);
  await db.close();
}

// ================= S3: 500, timeout, XML invalid, feed kosong =================
{
  const db = await buatDb({ denganV22: true, denganV24: true });
  const adapter = buatAdapter(db, { denganV22: true });
  const ids = {};
  for (const [nama, url] of [
    ["RSS 500", "https://rss-500.contoh.test/feed.xml"],
    ["RSS Timeout", "https://rss-timeout.contoh.test/feed.xml"],
    ["RSS Invalid", "https://rss-invalid.contoh.test/feed.xml"],
    ["RSS Kosong", "https://rss-kosong.contoh.test/feed.xml"],
    ["RSS Sehat", "https://rss-sehat.contoh.test/feed.xml"],
  ]) {
    ids[nama] = await tambahSumber(db, { nama, jenis: "rss", url, prioritas: 50 });
  }
  await db.query(`update public.pf_sources set poll_interval_minutes = 0`);
  const mock = buatMockFetch(
    {
      "rss-500.contoh.test": async () => mockRespons(500, "server error"),
      "rss-timeout.contoh.test": async (_url, init) => {
        // Gantung sampai signal abort (AbortSignal.timeout dari fetchRss),
        // dengan pengaman 5 detik agar baterai tidak menggantung selamanya.
        await Promise.race([
          new Promise((_selesai, tolak) => {
            init?.signal?.addEventListener("abort", () =>
              tolak(new DOMException("The operation timed out", "TimeoutError")),
            );
          }),
          new Promise((_selesai, tolak) =>
            setTimeout(() => tolak(new Error("mock timeout tidak di-abort")), 5000),
          ),
        ]);
        return mockRespons(200, RSS_KOSONG);
      },
      "rss-invalid.contoh.test": async () => mockRespons(200, XML_INVALID),
      "rss-kosong.contoh.test": async () => mockRespons(200, RSS_KOSONG),
      "rss-sehat.contoh.test": async () =>
        mockRespons(200, buatRss([{ judul: "Timnas Indonesia Menang Atas Vietnam", url: "https://rss-sehat.contoh.test/s1", guid: "sehat-1" }])),
    },
    {},
  );
  const sumber = await bacaSumber(db);
  const hasil = await jalankanIngestion(adapter, sumber, {
    ...OPSI_CEPAT,
    fetchFn: mock,
    timeoutMs: 200,
  });
  const kelas = (nama) => hasil.perSumber.find((h) => h.sumber_nama === nama)?.kelas;
  cek("S3: 500 -> unavailable (sementara, bukan berat)", kelas("RSS 500") === "unavailable", `kelas=${kelas("RSS 500")}`);
  cek("S3: timeout -> unavailable", kelas("RSS Timeout") === "unavailable", `kelas=${kelas("RSS Timeout")}`);
  cek("S3: XML invalid -> invalid-feed (kelas tetap, v27: BUKAN berat)", kelas("RSS Invalid") === "invalid-feed", `kelas=${kelas("RSS Invalid")}`);
  cek("S3: feed kosong valid -> selesai (0 item, tanpa basi di DB baru)", kelas("RSS Kosong") === "selesai", `kelas=${kelas("RSS Kosong")}`);
  cek("S3: satu sumber gagal tidak mengganggu sumber sehat", kelas("RSS Sehat") === "selesai" && hasil.perSumber.find((h) => h.sumber_nama === "RSS Sehat")?.baru === 1, `baru sehat=${hasil.perSumber.find((h) => h.sumber_nama === "RSS Sehat")?.baru}`);
  cek("S3: gagal_berat=0 — invalid-feed pertama transient, tidak gagalkan run (v27)", hasil.total.gagal_berat === 0, `gagal_berat=${hasil.total.gagal_berat} gagal=${hasil.total.gagal}`);
  await db.close();
}

// ================= S4: duplikat GUID / URL / judul =================
{
  const db = await buatDb({ denganV22: true, denganV24: true });
  const adapter = buatAdapter(db, { denganV22: true });
  await tambahSumber(db, { nama: "RSS Dup", jenis: "rss", url: "https://rss-dup.contoh.test/feed.xml", prioritas: 80 });
  await db.query(`update public.pf_sources set poll_interval_minutes = 0`);
  let umpan = "awal";
  const mock = buatMockFetch(
    {
      "rss-dup.contoh.test": async () => {
        if (umpan === "awal") {
          return mockRespons(200, buatRss([
            { judul: "Harga Beras Naik di Pasar Tradisional", url: "https://rss-dup.contoh.test/b1", guid: "guid-1" },
          ]));
        }
        if (umpan === "guid-sama") {
          // GUID sama, URL + judul BERBEDA -> tetap duplikat (kunci GUID).
          return mockRespons(200, buatRss([
            { judul: "Judul Sama Sekali Berbeda Tentang Ekonomi", url: "https://rss-dup.contoh.test/b2-lain", guid: "guid-1" },
          ]));
        }
        if (umpan === "url-sama") {
          return mockRespons(200, buatRss([
            { judul: "Judul Lain Lagi", url: "https://rss-dup.contoh.test/b1", guid: "guid-2" },
          ]));
        }
        // judul-sama: judul identik, URL + GUID berbeda, sumber sama -> duplikat.
        return mockRespons(200, buatRss([
          { judul: "Harga Beras Naik di Pasar Tradisional", url: "https://rss-dup.contoh.test/b3", guid: "guid-3" },
        ]));
      },
    },
    {},
  );
  const sumber = await bacaSumber(db);
  const h1 = await jalankanIngestion(adapter, sumber, { ...OPSI_CEPAT, fetchFn: mock });
  cek("S4 run1: 1 baru", h1.perSumber[0]?.baru === 1, `baru=${h1.perSumber[0]?.baru}`);
  umpan = "guid-sama";
  const h2 = await jalankanIngestion(adapter, sumber, { ...OPSI_CEPAT, fetchFn: mock });
  cek("S4 run2: GUID sama (URL/judul beda) -> duplikat, 0 baru", h2.perSumber[0]?.duplikat === 1 && h2.perSumber[0]?.baru === 0, `duplikat=${h2.perSumber[0]?.duplikat} baru=${h2.perSumber[0]?.baru}`);
  umpan = "url-sama";
  const h3 = await jalankanIngestion(adapter, sumber, { ...OPSI_CEPAT, fetchFn: mock });
  cek("S4 run3: URL sama -> duplikat, 0 baru", h3.perSumber[0]?.duplikat === 1 && h3.perSumber[0]?.baru === 0, `duplikat=${h3.perSumber[0]?.duplikat}`);
  umpan = "judul-sama";
  const h4 = await jalankanIngestion(adapter, sumber, { ...OPSI_CEPAT, fetchFn: mock });
  cek("S4 run4: judul sama sumber sama -> duplikat, 0 baru", h4.perSumber[0]?.duplikat === 1 && h4.perSumber[0]?.baru === 0, `duplikat=${h4.perSumber[0]?.duplikat}`);
  const jumlah = await hitungBaris(db, `select count(*)::int as j from public.pf_raw_items`);
  cek("S4: total baris tetap 1", jumlah === 1, `baris=${jumlah}`);
  await db.close();
}

// ================= S5: circuit breaker =================
{
  const db = await buatDb({ denganV22: true, denganV24: true });
  const adapter = buatAdapter(db, { denganV22: true });
  const idMati = await tambahSumber(db, { nama: "RSS Mati", jenis: "rss", url: "https://rss-mati.contoh.test/feed.xml", prioritas: 80 });
  const idSehat = await tambahSumber(db, { nama: "RSS Sehat 2", jenis: "rss", url: "https://rss-sehat2.contoh.test/feed.xml", prioritas: 70 });
  await db.query(`update public.pf_sources set poll_interval_minutes = 0`);
  const hitung = {};
  const mock = buatMockFetch(
    {
      "rss-mati.contoh.test": async () => mockRespons(500, "down"),
      "rss-sehat2.contoh.test": async () =>
        mockRespons(200, buatRss([{ judul: "Vaksin Baru Disetujui Kemenkes", url: "https://rss-sehat2.contoh.test/v1", guid: "v1" }])),
    },
    hitung,
  );
  const sumber = await bacaSumber(db);
  for (let run = 1; run <= 3; run++) {
    const hasil = await jalankanIngestion(adapter, sumber, { ...OPSI_CEPAT, fetchFn: mock });
    const h = hasil.perSumber.find((x) => x.sumber_id === idMati);
    cek(`S5 run${run}: gagal unavailable (percobaan ${run}/3)`, h?.kelas === "unavailable", `kelas=${h?.kelas}`);
  }
  const keadaan = await db.query(`select failure_count, cooldown_until, health_status from public.pf_sources where id = $1`, [idMati]);
  cek("S5 sesudah 3 gagal: failure_count=3 + cooldown terisi + health gagal",
    keadaan.rows[0]?.failure_count === 3 && !!keadaan.rows[0]?.cooldown_until && keadaan.rows[0]?.health_status === "gagal",
    JSON.stringify(keadaan.rows[0]));
  const panggilanSebelum = hitung["rss-mati.contoh.test"];
  const hasil4 = await jalankanIngestion(adapter, sumber, { ...OPSI_CEPAT, fetchFn: mock });
  const h4 = hasil4.perSumber.find((x) => x.sumber_id === idMati);
  const hSehat4 = hasil4.perSumber.find((x) => x.sumber_id === idSehat);
  cek("S5 run4: circuit terbuka -> dilewati tanpa fetch", h4?.kelas === "dilewati" && hitung["rss-mati.contoh.test"] === panggilanSebelum, `kelas=${h4?.kelas}`);
  cek("S5 run4: sumber sehat tetap jalan (duplikat)", hSehat4?.kelas === "selesai" && hSehat4?.duplikat === 1, `duplikat=${hSehat4?.duplikat}`);
  await db.close();
}

// ================= S6: poll interval + bypass manual =================
{
  const db = await buatDb({ denganV22: true, denganV24: true });
  const adapter = buatAdapter(db, { denganV22: true });
  const idJarang = await tambahSumber(db, { nama: "RSS Jarang", jenis: "rss", url: "https://rss-jarang.contoh.test/feed.xml", prioritas: 80 });
  const idRutin = await tambahSumber(db, { nama: "RSS Rutin", jenis: "rss", url: "https://rss-rutin.contoh.test/feed.xml", prioritas: 70 });
  // RSS Jarang: interval 60 mnt, baru saja dicek -> belum jatuh tempo.
  await db.query(`update public.pf_sources set poll_interval_minutes = 60, terakhir_cek = now() where id = $1`, [idJarang]);
  await db.query(`update public.pf_sources set poll_interval_minutes = 0 where id = $1`, [idRutin]);
  const hitung = {};
  const mock = buatMockFetch(
    {
      "rss-jarang.contoh.test": async () =>
        mockRespons(200, buatRss([{ judul: "Inflasi Tahunan Turun ke 2 Persen", url: "https://rss-jarang.contoh.test/j1", guid: "j1" }])),
      "rss-rutin.contoh.test": async () =>
        mockRespons(200, buatRss([{ judul: "Startup Lokal Raih Pendanaan Seri B", url: "https://rss-rutin.contoh.test/r1", guid: "r1" }])),
    },
    hitung,
  );
  const sumber = await bacaSumber(db);
  const hasil = await jalankanIngestion(adapter, sumber, { ...OPSI_CEPAT, fetchFn: mock });
  const hJarang = hasil.perSumber.find((h) => h.sumber_id === idJarang);
  const hRutin = hasil.perSumber.find((h) => h.sumber_id === idRutin);
  cek("S6: sumber belum jatuh tempo dilewati", hJarang?.kelas === "dilewati" && (hitung["rss-jarang.contoh.test"] ?? 0) === 0, `kelas=${hJarang?.kelas}`);
  cek("S6: sumber rutin tetap jalan", hRutin?.kelas === "selesai" && hRutin?.baru === 1, `baru=${hRutin?.baru}`);
  // Pemicu manual satu sumber mengabaikan poll interval (bukan cooldown).
  const hasilManual = await jalankanIngestion(adapter, sumber, {
    ...OPSI_CEPAT,
    fetchFn: mock,
    hanyaSumberId: idJarang,
  });
  cek("S6 manual: hanyaSumberId mengabaikan poll interval", hasilManual.perSumber[0]?.kelas === "selesai" && hasilManual.perSumber[0]?.baru === 1, `kelas=${hasilManual.perSumber[0]?.kelas} baru=${hasilManual.perSumber[0]?.baru}`);
  await db.close();
}

// ================= S7: fail-soft TANPA kolom v22 =================
{
  const db = await buatDb({ denganV22: false, denganV24: false });
  const adapter = buatAdapter(db, { denganV22: false });
  await tambahSumber(db, { nama: "RSS Lama", jenis: "rss", url: "https://rss-lama.contoh.test/feed.xml", prioritas: 80 });
  await tambahSumber(db, { nama: "GDELT DOC API", jenis: "api", url: "https://api.gdeltproject.org/api/v2/doc/doc", prioritas: 10 });
  const mock = buatMockFetch(
    {
      "rss-lama.contoh.test": async () =>
        mockRespons(200, buatRss([{ judul: "Gempa Magnitudo 6,5 Guncang Cianjur Jawa Barat", url: "https://rss-lama.contoh.test/l1", guid: "l1" }])),
      "gdeltproject.org": async () => mockRespons(429, "rate limited", { "retry-after": "1" }),
    },
    {},
  );
  const sumber = await bacaSumber(db);
  let hasil = null;
  let melempar = null;
  try {
    hasil = await jalankanIngestion(adapter, sumber, { ...OPSI_CEPAT, fetchFn: mock });
  } catch (e) {
    melempar = e;
  }
  cek("S7 tanpa v22: ingestion tidak melempar", melempar === null, melempar ? String(melempar.message ?? melempar).slice(0, 120) : "");
  cek("S7 tanpa v22: RSS tetap 1 baru", hasil?.perSumber.find((h) => h.sumber_nama === "RSS Lama")?.baru === 1, `baru=${hasil?.perSumber.find((h) => h.sumber_nama === "RSS Lama")?.baru}`);
  cek("S7 tanpa v22: GDELT tetap kelas rate-limited", hasil?.perSumber.find((h) => h.sumber_nama === "GDELT DOC API")?.kelas === "rate-limited", `kelas=${hasil?.perSumber.find((h) => h.sumber_nama === "GDELT DOC API")?.kelas}`);
  cek("S7 tanpa v22: gagal_berat tetap 0", hasil?.total.gagal_berat === 0, `gagal_berat=${hasil?.total.gagal_berat}`);
  // Fallback tutupRunAman: DB v3 menolak status 'rate-limited'
  // (CHECK) -> run tercatat 'gagal' (dipetakan), BUKAN 'berjalan'.
  const runGdeltLama = await db.query(
    `select status from public.pf_ingestion_runs where sumber_nama = 'GDELT DOC API' order by dimulai_pada desc limit 1`,
  );
  cek("S7 tanpa v22: run GDELT tercatat 'gagal' (fallback CHECK-aman), bukan 'berjalan'", runGdeltLama.rows[0]?.status === "gagal", `status=${runGdeltLama.rows[0]?.status}`);
  await db.close();
}

// ================= S8: klasifikasi + klaster =================
{
  // Klasifikasi deterministik (unit, tanpa DB).
  const sampel = [
    ["Gempa Magnitudo 6,5 Guncang Cianjur Jawa Barat", "indonesia", "bencana"],
    ["KPK Tangkap Pejabat Terkait Korupsi Proyek Jalan", "indonesia", "hukum"],
    ["Presiden Umumkan Kabinet Baru Pekan Depan", "indonesia", "politik"],
    ["Rupiah Menguat Terhadap Dolar Amerika", "ekonomi", "nilai-tukar"],
    ["Vaksin Baru Disetujui Kemenkes untuk Anak", "sains", "kesehatan"],
  ];
  let benar = 0;
  for (const [judul, kat, sub] of sampel) {
    const k = klasifikasikanItem({ judul });
    const ok = k.kategori === kat && k.subkategori === sub;
    if (ok) benar++;
    cek(`S8 klasifikasi: "${judul.slice(0, 40)}..." -> ${kat}/${sub}`, ok, `dapat ${k.kategori}/${k.subkategori} label=${k.label}`);
  }
  cek("S8 klasifikasi: >=80% benar pada sampel", benar >= 4, `${benar}/5 benar`);
  const takDikenal = klasifikasikanItem({ judul: "Zxqv Wobble Fnord Plip" });
  cek("S8 klasifikasi: judul tak dikenal -> kategori null (jujur)", takDikenal.kategori === null && takDikenal.subkategori === null, `kategori=${takDikenal.kategori}`);

  // Klaster murni (unit, tanpa DB).
  const kini = new Date("2026-11-17T03:00:00Z");
  const barisKlaster = [1, 2, 3].map((n) => ({
    id: `item-${n}`,
    judul: "Gempa Magnitudo 6,5 Guncang Cianjur Jawa Barat",
    sumber_id: `sumber-${n}`,
    waktu_terbit_asli: kini.toISOString(),
    waktu_diambil: kini.toISOString(),
  }));
  const klaster = kelompokkanKlaster(barisKlaster);
  cek("S8 klaster murni: 3 laporan peristiwa sama -> 1 klaster 3 laporan",
    klaster.length === 1 && klaster[0].item_ids.length === 3 && klaster[0].sumber_ids.length === 3,
    JSON.stringify(klaster.map((k) => k.item_ids.length)));
  const bedaTopik = kelompokkanKlaster([
    { id: "a", judul: "Gempa Magnitudo 6,5 Guncang Cianjur Jawa Barat", sumber_id: "s1", waktu_terbit_asli: kini.toISOString(), waktu_diambil: kini.toISOString() },
    { id: "b", judul: "Timnas Indonesia Menang Atas Vietnam", sumber_id: "s2", waktu_terbit_asli: kini.toISOString(), waktu_diambil: kini.toISOString() },
  ]);
  cek("S8 klaster murni: topik berbeda -> 0 klaster", bedaTopik.length === 0, `klaster=${bedaTopik.length}`);
  const satuSumber = kelompokkanKlaster([
    { id: "a", judul: "Gempa Magnitudo 6,5 Guncang Cianjur Jawa Barat", sumber_id: "s1", waktu_terbit_asli: kini.toISOString(), waktu_diambil: kini.toISOString() },
    { id: "b", judul: "Gempa Magnitudo 6,5 Guncang Cianjur Jawa Barat", sumber_id: "s1", waktu_terbit_asli: kini.toISOString(), waktu_diambil: kini.toISOString() },
  ]);
  cek("S8 klaster murni: 2 laporan 1 sumber -> 0 klaster (bukan multi-sumber)", satuSumber.length === 0, `klaster=${satuSumber.length}`);

  // Klaster end-to-end lewat engine (3 sumber, judul sama, URL beda).
  const db = await buatDb({ denganV22: true, denganV24: true });
  const adapter = buatAdapter(db, { denganV22: true });
  const judulGempa = "Gempa Magnitudo 6,5 Guncang Cianjur Jawa Barat";
  for (const [nama, host] of [["Koran A", "koran-a"], ["Koran B", "koran-b"], ["Koran C", "koran-c"]]) {
    await tambahSumber(db, { nama, jenis: "rss", url: `https://${host}.contoh.test/feed.xml`, prioritas: 50 });
  }
  await db.query(`update public.pf_sources set poll_interval_minutes = 0`);
  const mock = buatMockFetch(
    {
      "koran-a.contoh.test": async () => mockRespons(200, buatRss([{ judul: judulGempa, url: "https://koran-a.contoh.test/g1", guid: "g-a" }])),
      "koran-b.contoh.test": async () => mockRespons(200, buatRss([{ judul: judulGempa, url: "https://koran-b.contoh.test/g1", guid: "g-b" }])),
      "koran-c.contoh.test": async () => mockRespons(200, buatRss([{ judul: judulGempa, url: "https://koran-c.contoh.test/g1", guid: "g-c" }])),
    },
    {},
  );
  const sumber = await bacaSumber(db);
  const hasil = await jalankanIngestion(adapter, sumber, { ...OPSI_CEPAT, fetchFn: mock });
  cek("S8 engine: 3 laporan tersimpan (1 baru + 2 disalin_dari)", hasil.total.baru === 1 && hasil.total.duplikat === 2, `baru=${hasil.total.baru} duplikat=${hasil.total.duplikat}`);
  cek("S8 engine: hasil klaster 1 klaster 3 laporan 3 sumber",
    hasil.klaster?.length === 1 && hasil.klaster[0].jumlah_item === 3 && hasil.klaster[0].jumlah_sumber === 3,
    JSON.stringify(hasil.klaster));
  const anggota = await hitungBaris(db, `select count(*)::int as j from public.pf_item_cluster_members`);
  const barisItem = await hitungBaris(db, `select count(*)::int as j from public.pf_raw_items`);
  cek("S8 engine: 3 anggota klaster tersimpan, 3 laporan UTUH tetap ada", anggota === 3 && barisItem === 3, `anggota=${anggota} laporan=${barisItem}`);
  const meta = await db.query(`select metadata from public.pf_raw_items limit 1`);
  const klas = meta.rows[0]?.metadata?.klasifikasi_otomatis;
  cek("S8 engine: metadata klasifikasi_otomatis terisi + berlabel",
    klas?.kategori === "indonesia" && klas?.subkategori === "bencana" && klas?.label === "otomatis, bisa dikoreksi editor",
    JSON.stringify(klas));
  await db.close();
}

// ================= S9: retry — jitter + cap Retry-After 300 =================
{
  cek("S9 parseRetryAfter: 600 dtk dijepit ke 300", parseRetryAfter("600") === 300, `nilai=${parseRetryAfter("600")}`);
  cek("S9 parseRetryAfter: tanggal HTTP diurai + dijepit", parseRetryAfter(new Date(Date.now() + 900 * 1000).toUTCString()) === 300, `nilai=${parseRetryAfter(new Date(Date.now() + 900 * 1000).toUTCString())}`);
  const acakNol = () => 0;
  const acakSatu = () => 1;
  cek("S9 tambahJitter: acak=0 -> -25%", tambahJitter(1000, acakNol) === 750, `nilai=${tambahJitter(1000, acakNol)}`);
  cek("S9 tambahJitter: acak=1 -> +50%", tambahJitter(1000, acakSatu) === 1500, `nilai=${tambahJitter(1000, acakSatu)}`);
  // Backoff dengan jitter: jeda harus dalam [0,75x, 1,5x] dari dasar.
  let percobaan = 0;
  const jedaDilihat = [];
  const hasilRetry = await cobaUlang(
    async () => {
      percobaan++;
      if (percobaan < 3) throw new GalatSementara("sementara", { status: 500 });
      return "ok";
    },
    { percobaanMaks: 3, jedaAwalMs: 1000, jedaMaksMs: 8000, tidur: async (ms) => { jedaDilihat.push(ms); } },
  );
  cek("S9 cobaUlang: sukses sesudah 2 gagal", hasilRetry.nilai === "ok" && hasilRetry.percobaan === 3, `percobaan=${hasilRetry.percobaan}`);
  cek("S9 cobaUlang: jeda backoff dalam rentang jitter", jedaDilihat.length === 2 && jedaDilihat[0] >= 750 && jedaDilihat[0] <= 1500 && jedaDilihat[1] >= 1500 && jedaDilihat[1] <= 3000, `jeda=${JSON.stringify(jedaDilihat)}`);
  // v27 (18 Nov 2026): Retry-After 600 dtk TIDAK LAGI tidur dijepit
  // 300 dtk di dalam run — 429 dengan Retry-After > 10 dtk gagal
  // cepat (1 percobaan, 0 tidur); penanganannya cooldown antar-run.
  // Yang tetap dijepit 300 dtk adalah NILAI parseRetryAfter (dipakai
  // cooldown), bukan tidur di dalam run.
  const jedaRetryAfter = [];
  let gagal429 = 0;
  try {
    await cobaUlang(
      async () => {
        gagal429++;
        throw new GalatSementara("rate limited", { status: 429, retryAfterDetik: 600 });
      },
      { percobaanMaks: 2, tidur: async (ms) => { jedaRetryAfter.push(ms); } },
    );
  } catch { /* diharapkan gagal */ }
  cek("S9 cobaUlang: Retry-After 600 dtk gagal cepat (1 percobaan, 0 tidur) — v27", gagal429 === 1 && jedaRetryAfter.length === 0, `percobaan=${gagal429} tidur=${JSON.stringify(jedaRetryAfter)}`);
  cek("S9 cobaUlang: parseRetryAfter tetap menjepit 600 -> 300 dtk (untuk cooldown)", parseRetryAfter("600") === 300, `nilai=${parseRetryAfter("600")}`);
}

// ================= S10: kontrak respons untuk workflow =================
{
  // Workflow ingestion.yml membaca .ok, .total.gagal_berat, dan
  // .per_sumber[].kelas — pastikan berkas workflow memakai bidang
  // itu (bukan total.gagal lama) dan concurrency/lock tak berubah.
  const yml = fs.readFileSync(new URL("../.github/workflows/ingestion.yml", import.meta.url).pathname, "utf8");
  cek("S10 workflow: assert memakai total.gagal_berat", yml.includes(".total.gagal_berat"), "");
  cek("S10 workflow: assert TIDAK lagi memakai (.total.gagal // 0) == 0 sebagai penentu gagal", !yml.includes("(.total.gagal // 0) == 0"), "");
  cek("S10 workflow: ringkasan per sumber menampilkan kelas", yml.includes(".kelas"), "");
  cek("S10 workflow: concurrency/lock tidak berubah", yml.includes("group: prata-fakta-ingestion") && yml.includes("cancel-in-progress: false"), "");
  const rss = await fetchRss("https://rss-etag.contoh.test/feed.xml", {
    fetchFn: async () => mockRespons(200, RSS_KOSONG),
    lewatiAllowlist: true,
  });
  cek("S10 fetchRss: feed kosong valid -> 0 item (bukan invalid)", rss.items.length === 0 && rss.httpStatus === 200, `items=${rss.items.length}`);
  let xmlInvalidMelempar = false;
  try {
    await fetchRss("https://rss-invalid.contoh.test/feed.xml", {
      fetchFn: async () => mockRespons(200, XML_INVALID),
      lewatiAllowlist: true,
    });
  } catch (e) {
    xmlInvalidMelempar = String(e.message ?? e).includes("Feed bukan XML");
  }
  cek("S10 fetchRss: XML invalid melempar 'Feed bukan XML'", xmlInvalidMelempar, "");
  // Kesehatan: 3 run 'unavailable' beruntun = status 'gagal' (Fase 3).
  const kSehat = hitungKesehatanSumber({
    sumber_id: "s1",
    sumber_nama: "Sumber Mati",
    runs: [1, 2, 3].map((n) => ({
      sumber_id: "s1",
      status: "unavailable",
      selesai_pada: new Date(Date.now() - n * 3600_000).toISOString(),
      dimulai_pada: new Date(Date.now() - n * 3600_000).toISOString(),
    })),
    itemTerakhir: null,
  });
  cek("S10 kesehatan: 3x unavailable -> status gagal, streak 3", kSehat.status === "gagal" && kSehat.gagal_beruntun === 3, `status=${kSehat.status} streak=${kSehat.gagal_beruntun}`);
  const kLewat = hitungKesehatanSumber({
    sumber_id: "s1",
    sumber_nama: "Sumber Cooldown",
    runs: [{
      sumber_id: "s1",
      status: "dilewati",
      selesai_pada: new Date().toISOString(),
      dimulai_pada: new Date().toISOString(),
    }],
    itemTerakhir: new Date().toISOString(),
  });
  cek("S10 kesehatan: run 'dilewati' bukan kegagalan (tidak menambah streak)", kLewat.gagal_beruntun === 0, `streak=${kLewat.gagal_beruntun}`);
}

console.log(`\nRingkasan uji-ingestion-v22: lolos=${lolos} gagal=${gagal}`);
process.exit(gagal > 0 ? 1 : 0);
