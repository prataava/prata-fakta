// Dry-run ingestion PRATA FAKTA terhadap feed RSS NYATA -> PGlite in-memory.
// BUKAN data dummy: angka per feed berasal dari feed sungguhan.
// Langkah: (a) PGlite + stub auth + migrasi v1+v2+v3; (b) baca 7 sumber
// RSS dari pf_sources; (c) jalankan engine 2x (run ke-2 harus 0 baru);
// (d) uji sintetis dedup: disalin_dari + diterbitkan_ulang;
// (e) uji GDELT SATU topik ('Indonesia', maxRecords 5).
// Fetch: coba fetch Node langsung dulu; bila egress VM memblokirnya,
// fallback ke fetchFn berbasis curl (curl memakai proxy env).
// Keluar 0 bila semua uji lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = require("@electric-sql/pglite");

import { jalankanIngestion } from "../src/lib/ingestion/engine.ts";
import { fetchGdelt } from "../src/lib/ingestion/gdelt.ts";

const DIR_MIGRASI = new URL("../supabase/migrations/", import.meta.url).pathname;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 PRATA-FAKTA-Ingestion/1.0";

let gagal = 0;
function cek(label, kondisi, detail = "") {
  if (kondisi) {
    console.log(`OK: ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(`GAGAL: ${label}${detail ? ` — ${detail}` : ""}`);
    gagal++;
  }
}

// ---------- fetchFn berbasis curl (fallback egress VM) ----------
function buatFetchCurl(maxTimeDetik) {
  return async (url, init = {}) => {
    const args = ["-sS", "-L", "--max-time", String(maxTimeDetik), "-A", UA];
    const headers = init.headers ?? {};
    for (const [k, v] of Object.entries(headers)) args.push("-H", `${k}: ${v}`);
    args.push("-w", "\n__STATUS__:%{http_code}", url);
    const keluar = await new Promise((selesai, tolak) => {
      execFile("curl", args, { maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) tolak(new Error(`curl gagal (${url}): ${(stderr || err.message).trim()}`));
        else selesai(stdout);
      });
    });
    const cocok = keluar.match(/\n__STATUS__:(\d+)\s*$/);
    const status = cocok ? Number(cocok[1]) : 0;
    const badan = cocok ? keluar.slice(0, cocok.index) : keluar;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(),
      text: async () => badan,
      json: async () => JSON.parse(badan),
    };
  };
}

// ---------- Adapter PGlite (implementasi IngestionAdapter) ----------
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
  async simpanItem(item) {
    // ON CONFLICT DO NOTHING = pengaman ganda atas UNIQUE(hash_url).
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

// ---------- Util ----------
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

function buatRssSintetis(judul, url, pubDate) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Sintetis</title>
<item><title>${lolosXml(judul)}</title><link>${lolosXml(url)}</link><description>Item sintetis untuk uji dedup.</description><pubDate>${pubDate}</pubDate></item>
</channel></rss>`;
}

function cetakHasil(label, hasil) {
  console.log(`\n--- ${label} ---`);
  for (const h of hasil.perSumber) {
    console.log(
      `  ${h.sumber_nama}: ditemukan=${h.ditemukan} baru=${h.baru} duplikat=${h.duplikat} ditolak=${h.ditolak} gagal=${h.gagal}${h.error ? ` ERROR: ${h.error}` : ""}`,
    );
  }
  const t = hasil.total;
  console.log(
    `  TOTAL: ditemukan=${t.ditemukan} baru=${t.baru} duplikat=${t.duplikat} ditolak=${t.ditolak} gagal=${t.gagal}`,
  );
}

// ---------- Alur utama ----------
const db = new PGlite();
const adapter = new AdapterPGlite(db);

try {
  // (a) Stub auth + migrasi v1+v2+v3.
  await db.exec(`create schema if not exists auth;`);
  await db.exec(`create schema if not exists extensions;`);
  await db.exec(`create table auth.users (id uuid primary key, email text);`);
  await db.exec(
    `create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`,
  );
  for (const [label, nama] of [
    ["v1", "20261116_pf_v1_foundation.sql"],
    ["v2", "20261116_pf_v2_articles.sql"],
    ["v3", "20261116_pf_v3_ingestion.sql"],
  ]) {
    try {
      await db.exec(bacaMigrasi(nama));
      console.log(`OK: migrasi ${label} (${nama})`);
    } catch (e) {
      console.log(`GAGAL: migrasi ${label} — ${String(e.message).split("\n")[0]}`);
      gagal++;
    }
  }
  if (gagal > 0) throw new Error("Migrasi gagal, dry-run dihentikan.");

  // (b) Baca 7 sumber RSS dari pf_sources.
  const sumberRows = await db.query(
    `select id, nama, jenis, url, prioritas, aktif
       from public.pf_sources where jenis = 'rss' and aktif = true
       order by prioritas desc`,
  );
  const sumber = sumberRows.rows.map((r) => ({
    id: r.id,
    nama: r.nama,
    jenis: r.jenis,
    url: r.url,
    prioritas: r.prioritas,
    aktif: r.aktif,
  }));
  console.log(`\nSumber RSS aktif dari pf_sources: ${sumber.length}`);
  for (const s of sumber) console.log(`  - ${s.nama} (${s.url})`);
  cek("Jumlah sumber RSS = 7", sumber.length === 7, `dapat ${sumber.length}`);

  // (c) Tentukan metode fetch: coba langsung dulu (probe Antara).
  let metodeFetch = "langsung";
  let fetchFnEngine;
  let fetchFnGdelt;
  const urlProbe = sumber[0]?.url ?? "https://www.antaranews.com/rss/terkini.xml";
  try {
    const probe = await fetch(urlProbe, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    const teksProbe = await probe.text();
    if (!probe.ok || !teksProbe.includes("<item")) {
      throw new Error(`probe HTTP ${probe.status} / isi bukan RSS`);
    }
    console.log(`\nMetode fetch: LANGSUNG (fetch Node berhasil, probe ${urlProbe})`);
  } catch (e) {
    metodeFetch = "curl";
    fetchFnEngine = buatFetchCurl(15);
    fetchFnGdelt = buatFetchCurl(55);
    console.log(
      `\nMetode fetch: CURL (fetch Node langsung gagal: ${e.message}; fallback ke curl via proxy env)`,
    );
  }
  console.log(`Metode fetch yang dipakai: ${metodeFetch}`);

  // (c) Run 1 + Run 2.
  const mulai1 = Date.now();
  const hasil1 = await jalankanIngestion(adapter, sumber, {
    dipicu_oleh: "manual",
    fetchFn: fetchFnEngine,
  });
  const durasi1 = Date.now() - mulai1;
  cetakHasil(`RUN 1 (nyata, ${durasi1} ms)`, hasil1);
  cek("Run 1: ada item ditemukan", hasil1.total.ditemukan > 0, `ditemukan=${hasil1.total.ditemukan}`);
  cek("Run 1: ada item baru", hasil1.total.baru > 0, `baru=${hasil1.total.baru}`);
  cek("Run 1: tanpa sumber gagal total", hasil1.perSumber.every((h) => h.gagal === 0),
    hasil1.perSumber.filter((h) => h.gagal > 0).map((h) => `${h.sumber_nama}: ${h.error}`).join("; ") || "semua ok");

  const mulai2 = Date.now();
  const hasil2 = await jalankanIngestion(adapter, sumber, {
    dipicu_oleh: "manual",
    fetchFn: fetchFnEngine,
  });
  const durasi2 = Date.now() - mulai2;
  cetakHasil(`RUN 2 (ulang, ${durasi2} ms)`, hasil2);
  cek(
    "Run 2: baru = 0 di SEMUA feed (dedup hash_url bekerja)",
    hasil2.perSumber.every((h) => h.baru === 0),
    `baru per feed: ${hasil2.perSumber.map((h) => `${h.sumber_nama}=${h.baru}`).join(", ")}`,
  );
  cek(
    "Run 2: ditemukan sama dengan run 1 (feed stabil)",
    hasil2.total.ditemukan === hasil1.total.ditemukan,
    `run1=${hasil1.total.ditemukan} run2=${hasil2.total.ditemukan}`,
  );

  // (d) Uji sintetis dedup — ambil 2 item 'baru' berbeda dari Antara.
  const antara = sumber.find((s) => s.nama.startsWith("Antara"));
  const contoh = await db.query(
    `select id, judul, hash_judul, waktu_terbit_asli
       from public.pf_raw_items
      where status = 'baru' and sumber_id = $1 and waktu_terbit_asli is not null
      order by waktu_diambil asc limit 2`,
    [antara.id],
  );
  if (contoh.rows.length < 2) {
    console.log("GAGAL: butuh 2 item Antara untuk uji sintetis, hanya dapat " + contoh.rows.length);
    gagal++;
  } else {
    const [itemA, itemB] = contoh.rows;
    // Sumber sintetis B (penerbit lain) untuk uji disalin_dari.
    const sumberB = await db.query(
      `insert into public.pf_sources (nama, jenis, url, prioritas)
       values ('Uji Sintetis B', 'rss', 'https://contoh.test/sintetis-b.xml', 10)
       returning id`,
    );
    const idSumberB = sumberB.rows[0].id;

    const fetchSintetis = async (url) => {
      let xml;
      if (String(url).includes("sintetis-b.xml")) {
        xml = buatRssSintetis(
          itemA.judul,
          "https://contoh.test/berita-salinan-1",
          new Date().toUTCString(),
        );
      } else if (String(url).includes("antaranews.com/rss/terkini.xml")) {
        // Uji terbit ulang: judul sama, sumber SAMA (Antara), tanggal +10 hari.
        const terbitBaru = new Date(
          new Date(itemB.waktu_terbit_asli).getTime() + 10 * 24 * 60 * 60 * 1000,
        );
        xml = buatRssSintetis(
          itemB.judul,
          "https://contoh.test/berita-terbit-ulang-1",
          terbitBaru.toUTCString(),
        );
      } else {
        throw new Error(`fetch sintetis: URL tak dikenal ${url}`);
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => xml,
        json: async () => JSON.parse(xml),
      };
    };

    // Uji 1: judul sama dari sumber BERBEDA -> disalin_dari.
    const hasilSalin = await jalankanIngestion(
      adapter,
      [{ id: idSumberB, nama: "Uji Sintetis B", jenis: "rss", url: "https://contoh.test/sintetis-b.xml", prioritas: 10, aktif: true }],
      { dipicu_oleh: "manual", fetchFn: fetchSintetis },
    );
    const salinan = await db.query(
      `select id, status, disalin_dari_id, diterbitkan_ulang, alasan
         from public.pf_raw_items where hash_judul = $1 and sumber_id = $2`,
      [itemA.hash_judul, idSumberB],
    );
    const barisSalin = salinan.rows[0];
    console.log(
      `\nUji disalin_dari: run ditemukan=${hasilSalin.total.ditemukan} duplikat=${hasilSalin.total.duplikat} | baris: ${barisSalin ? JSON.stringify(barisSalin) : "TIDAK ADA"}`,
    );
    cek(
      "disalin_dari: status = 'disalin_dari'",
      barisSalin?.status === "disalin_dari",
      `status=${barisSalin?.status ?? "-"}`,
    );
    cek(
      "disalin_dari: disalin_dari_id menunjuk item Antara asli",
      barisSalin?.disalin_dari_id === itemA.id,
      `disalin_dari_id=${barisSalin?.disalin_dari_id ?? "-"} vs asli=${itemA.id}`,
    );

    // Uji 2: judul sama sumber SAMA, tanggal +10 hari -> diterbitkan_ulang.
    const hasilUlang = await jalankanIngestion(
      adapter,
      [antara],
      { dipicu_oleh: "manual", fetchFn: fetchSintetis },
    );
    const ulang = await db.query(
      `select id, status, disalin_dari_id, diterbitkan_ulang, alasan
         from public.pf_raw_items where hash_judul = $1 and url = $2`,
      [itemB.hash_judul, "https://contoh.test/berita-terbit-ulang-1"],
    );
    const barisUlang = ulang.rows[0];
    console.log(
      `Uji diterbitkan_ulang: run ditemukan=${hasilUlang.total.ditemukan} duplikat=${hasilUlang.total.duplikat} | baris: ${barisUlang ? JSON.stringify(barisUlang) : "TIDAK ADA"}`,
    );
    cek(
      "diterbitkan_ulang: baris tersimpan dengan status 'duplikat'",
      barisUlang?.status === "duplikat",
      `status=${barisUlang?.status ?? "-"}`,
    );
    cek(
      "diterbitkan_ulang: flag diterbitkan_ulang = true",
      barisUlang?.diterbitkan_ulang === true,
      `flag=${barisUlang?.diterbitkan_ulang ?? "-"}`,
    );
  }

  // (e) Uji GDELT — SATU topik saja.
  console.log(`\n--- GDELT (topik 'Indonesia', maxRecords 5) ---`);
  const mulaiGdelt = Date.now();
  try {
    const gdelt = await fetchGdelt("Indonesia", {
      maxRecords: 5,
      timeoutMs: 60000,
      fetchFn: fetchFnGdelt,
    });
    const msGdelt = Date.now() - mulaiGdelt;
    console.log(`  jumlah item: ${gdelt.items.length} | HTTP ${gdelt.httpStatus} | ${msGdelt} ms`);
    for (const it of gdelt.items.slice(0, 3)) {
      console.log(`  - ${it.judul.slice(0, 80)} (${it.url.slice(0, 70)})`);
    }
    cek("GDELT: terpanggil 1x dan mengembalikan item", gdelt.items.length > 0, `${gdelt.items.length} item`);
  } catch (e) {
    console.log(`  GAGAL: ${e.message} (${Date.now() - mulaiGdelt} ms)`);
    gagal++;
  }

  // Hitungan akhir isi tabel.
  const hitung = await db.query(
    `select status, count(*)::int as n from public.pf_raw_items group by status order by 1`,
  );
  console.log("\nHitungan akhir pf_raw_items per status:");
  for (const r of hitung.rows) console.log(`  ${r.status}: ${r.n}`);
  const rincian = await db.query(
    `select s.nama as sumber, r.status as status, count(*)::int as n
       from public.pf_raw_items r join public.pf_sources s on s.id = r.sumber_id
      where r.status <> 'baru' group by s.nama, r.status order by 1, 2`,
  );
  console.log("Rincian baris bukan-'baru' per sumber (bukti dedup judul):");
  for (const r of rincian.rows) console.log(`  ${r.sumber}: ${r.status} = ${r.n}`);
  const hitungRun = await db.query(
    `select status, count(*)::int as n from public.pf_ingestion_runs group by status order by 1`,
  );
  console.log("Hitungan pf_ingestion_runs per status:");
  for (const r of hitungRun.rows) console.log(`  ${r.status}: ${r.n}`);
  const sumberAkhir = await db.query(
    `select nama, jumlah_item, status_terakhir from public.pf_sources where jenis='rss' order by prioritas desc`,
  );
  console.log("pf_sources (rss) — jumlah_item:");
  for (const r of sumberAkhir.rows) {
    console.log(`  ${r.nama}: jumlah_item=${r.jumlah_item} | ${r.status_terakhir}`);
  }
} catch (e) {
  console.log(`\nGAGAL FATAL: ${e instanceof Error ? e.message : String(e)}`);
  gagal++;
} finally {
  await db.close();
}

console.log(gagal === 0 ? "\nHASIL: SEMUA LOLOS" : `\nHASIL: ${gagal} KEGAGALAN`);
process.exit(gagal === 0 ? 0 : 1);
