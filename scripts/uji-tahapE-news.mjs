// Baterai pengujian TAHAP E — Ketahanan News Intelligence PRATA FAKTA.
// PGlite in-memory + migrasi v1–v5 nyata + RPC pf_akar_salinan (v9).
// Mencakup (tugas Tahap E):
//   A. Retry per-sumber: backoff eksponensial + Retry-After (GDELT 429);
//      feed mock gagal 2x lalu lolos.
//   B. Fallback: satu sumber gagal tidak menghentikan pengumpulan
//      (GDELT gagal <-> RSS jalan; satu RSS gagal <-> feed lain jalan).
//   C. Sumber basi: 0 item dari sumber produktif = 'sebagian' +
//      peringatan, bukan sukses penuh.
//   D. Dedup: parafrase judul nyata -> kandidat duplikat lunak;
//      0 URL ganda di DB; judul identik lintas penerbit -> disalin_dari.
//   E. Kebenaran informasi: tanggal terbit (pubDate/published/dc:date;
//      updated -> metadata; seendate GDELT bukan terbit); item tanpa
//      tanggal bukan "baru"; salinan tidak dihitung independen
//      (pf_akar_salinan); evidence independen untuk VERIFIED;
//      kutipan harus kalimat sumber (atau penanda tidak ditemukan);
//      draf orisinal (ringkasan sendiri + atribusi + URL).
//   F. Antrean: mode kejar ketertinggalan + kedaluwarsa UNCONFIRMED
//      14 hari + draf-dulu-baru-status (N-T3).
//   G. Kesehatan sumber: sukses terakhir, gagal beruntun, item terakhir.
//   H. Probe live 7 feed RSS + GDELT (informasional: HTTP status
//      dicatat; GDELT 429 = SKIP terlihat, bukan gagal).
// TIDAK menyentuh jaringan nyata kecuali bagian H (probe live).
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = require("@electric-sql/pglite");

import {
  AMBANG_DUPLIKAT_LUNAK,
  cariKandidatDuplikatLunak,
  hashJudul,
  hashUrl,
  kemiripanJudul,
} from "../src/lib/ingestion/dedup.ts";
import { fetchGdelt, parseSeendate } from "../src/lib/ingestion/gdelt.ts";
import { jalankanIngestion } from "../src/lib/ingestion/engine.ts";
import {
  hitungKesehatanSumber,
  LABEL_KESEHATAN,
  ringkasKesehatanSumber,
} from "../src/lib/ingestion/kesehatan-sumber.ts";
import {
  AMBANG_BASI_JAM,
  jalankanPemeliharaanAntrean,
  urutKejar,
} from "../src/lib/ingestion/pemeliharaan.ts";
import { parseRss } from "../src/lib/ingestion/rss.ts";
import {
  cobaUlang,
  GalatSementara,
} from "../src/lib/ingestion/retry.ts";
import { jalankanPipelineEditorial } from "../src/lib/ai/pipeline.ts";
import { cariKalimatKutipan, polaPencarianInti } from "../src/lib/ai/research.ts";
import { susunDrafArtikel } from "../src/lib/ai/writing.ts";
import { buatSlugArtikel } from "../src/lib/ai/slug.ts";
import { tentukanKeputusanVerifikasi } from "../src/lib/ai/verification.ts";

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

const SEKARANG = new Date();
const JAM = 3600 * 1000;

// ---------- Setup PGlite + migrasi v1–v5 + pf_akar_salinan (v9) ----------
const db = new PGlite();
await db.exec(`create schema if not exists auth;`);
await db.exec(`create schema if not exists extensions;`);
await db.exec(`create table auth.users (id uuid primary key, email text);`);
await db.exec(
  `create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`,
);
let setupOk = true;
for (const [label, nama] of [
  ["v1", "20261116_pf_v1_foundation.sql"],
  ["v2", "20261116_pf_v2_articles.sql"],
  ["v3", "20261116_pf_v3_ingestion.sql"],
  ["v4", "20261116_pf_v4_ai.sql"],
  ["v5", "20261116_pf_v5_editorial.sql"],
]) {
  try {
    await db.exec(bacaMigrasi(nama));
    console.log(`OK: migrasi ${label}`);
  } catch (e) {
    console.log(`GAGAL: migrasi ${label}\n  -> ${String(e.message).split("\n")[0]}`);
    gagal++;
    setupOk = false;
    break;
  }
}
// RPC pf_akar_salinan (v9 §5) — diekstrak saja fungsi CREATE-nya
// (tanpa GRANT/policy v9) agar rantai salinan dapat diuji di PGlite.
if (setupOk) {
  try {
    const v9 = fs.readFileSync(`${DIR_MIGRASI}/20261116_pf_v9_grants.sql`, "utf8");
    const cocok = v9.match(/create or replace function public\.pf_akar_salinan[\s\S]*?\$\$;/);
    if (!cocok) throw new Error("definisi pf_akar_salinan tidak ditemukan di v9");
    await db.exec(cocok[0]);
    console.log("OK: RPC pf_akar_salinan (v9)");
  } catch (e) {
    console.log(`GAGAL: RPC pf_akar_salinan\n  -> ${String(e.message).split("\n")[0]}`);
    gagal++;
    setupOk = false;
  }
}
if (!setupOk) {
  console.log(`\nRINGKASAN: ${lolos} lolos, ${gagal} gagal (setup migrasi gagal)`);
  process.exit(1);
}

// ---------- Adapter PGlite: IngestionAdapter (pola uji-ultimate-ingestion) ----------
class AdapterPGlite {
  constructor(database) {
    this.db = database;
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

// ---------- Adapter PGlite: AiAdapter ----------
// Metode yang dipakai jalankanPipelineEditorial (rekonsiliasi: false).
// Pola SQL mengikuti AdapterPGliteAi di scripts/uji-ultimate-gate.mjs.
function keIso(nilai) {
  if (!nilai) return null;
  const d = nilai instanceof Date ? nilai : new Date(nilai);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

class AdapterPGliteAi {
  constructor(database) {
    this.db = database;
    this.gagalSimpanArtikel = false; // N-T3: paksa simpanArtikel gagal
  }
  async ambilAntrean(limit, mode = "terbaru") {
    const urut =
      mode === "terlama"
        ? `order by r.waktu_diambil asc`
        : `order by coalesce(s.prioritas, 0) desc,
                 r.waktu_terbit_asli desc nulls last,
                 r.waktu_diambil desc`;
    const r = await this.db.query(
      `select r.id, r.sumber_id, coalesce(s.nama, 'Tidak diketahui') as sumber_nama,
              coalesce(s.prioritas, 0) as sumber_prioritas, r.url, r.judul,
              r.ringkasan, r.isi_ringkas, r.penulis, r.waktu_terbit_asli,
              r.waktu_diambil, r.status, r.disalin_dari_id, r.metadata
         from public.pf_raw_items r
         left join public.pf_sources s on s.id = r.sumber_id
        where r.status_verifikasi = 'UNCONFIRMED'
        ${urut}
        limit $1`,
      [limit],
    );
    return r.rows.map((b) => ({
      id: b.id,
      sumber_id: b.sumber_id ?? null,
      sumber_nama: b.sumber_nama,
      sumber_prioritas: Number(b.sumber_prioritas ?? 0),
      url: b.url,
      judul: b.judul,
      ringkasan: b.ringkasan ?? "",
      isi_ringkas: b.isi_ringkas ?? "",
      penulis: b.penulis ?? null,
      waktu_terbit_asli: keIso(b.waktu_terbit_asli),
      waktu_diambil: keIso(b.waktu_diambil) ?? new Date().toISOString(),
      status: b.status,
      disalin_dari_id: b.disalin_dari_id ?? null,
      metadata: typeof b.metadata === "string" ? JSON.parse(b.metadata) : (b.metadata ?? null),
    }));
  }
  async ambilWaktuAntreanTertua() {
    const r = await this.db.query(
      `select min(waktu_diambil) as tertua from public.pf_raw_items where status_verifikasi = 'UNCONFIRMED'`,
    );
    return keIso(r.rows[0]?.tertua);
  }
  async ambilSumber(id) {
    if (!id) return null;
    const r = await this.db.query(
      `select id, nama, jenis, url, prioritas from public.pf_sources where id = $1`,
      [id],
    );
    const b = r.rows[0];
    return b
      ? { id: b.id, nama: b.nama, jenis: b.jenis, url: b.url, prioritas: b.prioritas }
      : null;
  }
  async ambilItemSerupa(hash, kecualiId) {
    const r = await this.db.query(
      `select id, sumber_id, url, judul, ringkasan, waktu_terbit_asli, disalin_dari_id
         from public.pf_raw_items
        where hash_judul = $1 and id <> $2 order by waktu_diambil asc`,
      [hash, kecualiId],
    );
    return r.rows.map((b) => ({
      id: b.id,
      sumber_id: b.sumber_id ?? null,
      url: b.url,
      judul: b.judul,
      ringkasan: b.ringkasan ?? "",
      waktu_terbit_asli: keIso(b.waktu_terbit_asli),
      disalin_dari_id: b.disalin_dari_id ?? null,
    }));
  }
  async cariKlaimSerupa(inti, kecualiItemId, batas = 20) {
    const pola = polaPencarianInti(inti);
    const r = await this.db.query(
      `select c.id, c.raw_item_id, c.teks, c.jenis, r.sumber_id,
              r.judul as judul_item, r.url as url_item,
              r.ringkasan as ringkasan_item, r.waktu_terbit_asli,
              r.disalin_dari_id
         from public.pf_claims c
         join public.pf_raw_items r on r.id = c.raw_item_id
        where c.teks ilike $1 escape '\\' and c.raw_item_id <> $2
        order by c.dibuat_pada asc limit $3`,
      [pola, kecualiItemId, batas],
    );
    return r.rows.map((b) => ({
      id: b.id,
      raw_item_id: b.raw_item_id,
      teks: b.teks,
      jenis: b.jenis,
      sumber_id: b.sumber_id ?? null,
      judul_item: b.judul_item ?? "",
      url_item: b.url_item ?? "",
      ringkasan_item: b.ringkasan_item ?? "",
      waktu_terbit_asli: keIso(b.waktu_terbit_asli),
      disalin_dari_id: b.disalin_dari_id ?? null,
    }));
  }
  async catatRun(run) {
    const r = await this.db.query(
      `insert into public.pf_ai_runs (agen, input_ref, input_jenis, dipicu_oleh)
       values ($1, $2, $3, $4) returning id`,
      [run.agen, run.input_ref ?? null, run.input_jenis ?? "raw_item", run.dipicu_oleh ?? "manual"],
    );
    return r.rows[0].id;
  }
  async tutupRun(id, patch) {
    await this.db.query(
      `update public.pf_ai_runs set
         status = $2, error = $3, durasi_ms = $4, output_ref = $5,
         detail = $6, selesai_pada = now()
       where id = $1`,
      [id, patch.status, patch.error ?? null, patch.durasi_ms ?? null, patch.output_ref ?? null, JSON.stringify(patch.detail ?? {})],
    );
  }
  async simpanKlaim(k) {
    const r = await this.db.query(
      `insert into public.pf_claims (raw_item_id, artikel_id, teks, jenis)
       values ($1, $2, $3, $4) returning id`,
      [k.raw_item_id ?? null, k.artikel_id ?? null, k.teks, k.jenis],
    );
    return r.rows[0].id;
  }
  async cariKlaimSama(raw_item_id, teks) {
    const r = await this.db.query(
      `select id from public.pf_claims where raw_item_id = $1 and teks = $2 limit 1`,
      [raw_item_id, teks],
    );
    return r.rows[0] ? r.rows[0].id : null;
  }
  async cariBuktiSama(klaim_id, sumber_url) {
    const r = await this.db.query(
      `select id from public.pf_evidence where klaim_id = $1 and sumber_url = $2 limit 1`,
      [klaim_id, sumber_url],
    );
    return !!r.rows[0];
  }
  async simpanBukti(b) {
    const sudah = await this.cariBuktiSama(b.klaim_id, b.sumber_url);
    if (sudah) return;
    await this.db.query(
      `insert into public.pf_evidence (klaim_id, sumber_url, sumber_nama, kutipan, arah)
       values ($1, $2, $3, $4, $5)`,
      [b.klaim_id, b.sumber_url, b.sumber_nama ?? null, b.kutipan ?? null, b.arah],
    );
  }
  async simpanVerification(r) {
    const hasil = await this.db.query(
      `insert into public.pf_verification_records
         (artikel_id, raw_item_id, keputusan, catatan, bukti)
       values ($1, $2, $3, $4, $5) returning id`,
      [r.artikel_id ?? null, r.raw_item_id, r.keputusan, r.catatan ?? null, JSON.stringify(r.bukti ?? [])],
    );
    return hasil.rows[0].id;
  }
  async simpanArtikel(d) {
    if (this.gagalSimpanArtikel) {
      throw new Error("simpanArtikel dipaksa gagal (uji N-T3)");
    }
    const kata = d.isi.split(/\s+/).filter(Boolean).length;
    const r = await this.db.query(
      `insert into public.pf_articles
         (slug, judul, subjudul, ringkasan, isi, kategori_slug,
          status_verifikasi, status, penulis_nama, sumber_url,
          kronologi, fakta_penting, mengapa_penting, belum_diketahui,
          raw_item_id, estimasi_baca_menit)
       values ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10,$11,$12,$13,$14,$15)
       returning id`,
      [
        d.slug, d.judul, d.subjudul ?? null, d.ringkasan, d.isi, d.kategori_slug,
        d.status_verifikasi, d.penulis_nama, d.sumber_url,
        JSON.stringify(d.kronologi), JSON.stringify(d.fakta_penting),
        d.mengapa_penting ?? null, d.belum_diketahui ?? null,
        d.raw_item_id, Math.max(1, Math.ceil(kata / 200)),
      ],
    );
    return r.rows[0].id;
  }
  async perbaruiStatusItem(id, status_verifikasi) {
    await this.db.query(
      `update public.pf_raw_items set status_verifikasi = $2 where id = $1`,
      [id, status_verifikasi],
    );
  }
  async cariArtikelUntukItem(rawItemId) {
    const r = await this.db.query(
      `select id from public.pf_articles where raw_item_id = $1 order by dibuat_pada asc limit 1`,
      [rawItemId],
    );
    return r.rows[0] ? r.rows[0].id : null;
  }
}

const adapter = new AdapterPGlite(db);
const adapterAi = new AdapterPGliteAi(db);

// Fetch halaman sumber dimatikan: research fallback ke ringkasan.
const fetchMati = async () => {
  throw new Error("fetch dimatikan di uji");
};

async function buatSumber(nama, jenis, url, prioritas = 50) {
  const r = await db.query(
    `insert into public.pf_sources (nama, jenis, url, prioritas, aktif) values ($1,$2,$3,$4,true) returning id`,
    [nama, jenis, url, prioritas],
  );
  return { id: r.rows[0].id, nama, jenis, url, prioritas, aktif: true };
}

async function seedItem(sumberId, judul, url, jamLalu = 1, status = "baru", extra = {}) {
  const waktu = new Date(SEKARANG.getTime() - jamLalu * JAM);
  const r = await db.query(
    `insert into public.pf_raw_items
       (sumber_id, url, hash_url, judul, hash_judul, ringkasan, isi_ringkas,
        waktu_terbit_asli, waktu_diambil, status, status_verifikasi, disalin_dari_id, metadata)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'UNCONFIRMED',$11,$12) returning id`,
    [
      sumberId, url, hashUrl(url), judul, hashJudul(judul),
      extra.ringkasan ?? "", extra.isi_ringkas ?? "",
      extra.waktuTerbit ?? waktu, waktu, status,
      extra.disalinDariId ?? null,
      JSON.stringify(extra.metadata ?? {}),
    ],
  );
  return r.rows[0].id;
}

async function statusItem(id) {
  const r = await db.query(
    `select status, status_verifikasi from public.pf_raw_items where id = $1`,
    [id],
  );
  return r.rows[0];
}

async function statusRunTerakhir(sumberId) {
  const r = await db.query(
    `select status, error, ditemukan, baru from public.pf_ingestion_runs
      where sumber_id = $1 order by dimulai_pada desc limit 1`,
    [sumberId],
  );
  return r.rows[0];
}

// ================= A. Retry per-sumber =================
{
  // A1: Retry-After (2 dtk) mengalahkan backoff — jeda dicatat, bukan ditebak.
  const jeda = [];
  let panggilan = 0;
  const flaky = async () => {
    panggilan++;
    if (panggilan <= 2) {
      throw new GalatSementara("GDELT 429", { status: 429, retryAfterDetik: 2 });
    }
    return "lolos";
  };
  const hasil = await cobaUlang(flaky, {
    percobaanMaks: 3,
    jedaAwalMs: 100,
    tidur: async (ms) => { jeda.push(ms); },
  });
  cek("A1 retry: 429 + Retry-After 2 dtk dihormati (jeda 2000, 2000)", hasil.nilai === "lolos" && hasil.percobaan === 3 && jeda[0] === 2000 && jeda[1] === 2000, `jeda=${JSON.stringify(jeda)}`);
  cek("A1 retry: backoff tanpa Retry-After berlipat (100 -> 200)", await (async () => {
    const j = [];
    let p = 0;
    await cobaUlang(async () => {
      p++;
      if (p < 3) throw new GalatSementara("503", { status: 503 });
      return "ok";
    }, { percobaanMaks: 3, jedaAwalMs: 100, pengali: 2, tidur: async (ms) => { j.push(ms); } });
    return j[0] === 100 && j[1] === 200;
  })());
}

// A2: Engine — feed mock gagal 2x (500 lalu 429 + Retry-After) lalu lolos.
{
  const sumberRetry = await buatSumber("Sumber Retry", "rss", "https://contoh.test/retry.xml", 60);
  let panggilan = 0;
  const jeda = [];
  const fetchRetry = async () => {
    panggilan++;
    if (panggilan === 1) return responsMock({ ok: false, status: 500 });
    if (panggilan === 2) return responsMock({ ok: false, status: 429, retryAfter: "2" });
    return responsMock({
      teks: buatRss(
        buatItemRss("Retry Satu", "https://contoh.test/retry/1", "Mon, 16 Nov 2026 07:00:00 GMT") +
        buatItemRss("Retry Dua", "https://contoh.test/retry/2", "Mon, 16 Nov 2026 07:05:00 GMT"),
      ),
    });
  };
  const hasil = await jalankanIngestion(adapter, [sumberRetry], {
    dipicu_oleh: "manual",
    fetchFn: fetchRetry,
    lewatiAllowlistFeed: true,
    retry: { percobaanMaks: 3, jedaAwalMs: 10, tidur: async (ms) => { jeda.push(ms); } },
  });
  const per = hasil.perSumber[0];
  cek("A2 engine: feed gagal 2x lalu lolos -> baru=2, percobaan_fetch=3", per.baru === 2 && per.percobaan_fetch === 3 && per.gagal === 0, `baru=${per.baru} percobaan=${per.percobaan_fetch} jeda=${JSON.stringify(jeda)}`);
  cek("A2 engine: Retry-After 2 dtk dipakai pada percobaan ke-2", jeda[1] === 2000, `jeda=${JSON.stringify(jeda)}`);
}

// A3: GDELT 429 dua kali lalu 200 (pola flake nyata, FINAL §8).
{
  const sumberGdelt = await buatSumber("GDELT Uji", "api", "https://contoh.test/gdelt-uji", 50);
  let panggilan = 0;
  const fetchGdeltFlaky = async (url) => {
    if (!String(url).includes("gdeltproject.org")) throw new Error(`URL tak dikenal: ${url}`);
    panggilan++;
    if (panggilan <= 2) return responsMock({ ok: false, status: 429, retryAfter: "1" });
    return responsMock({
      json: {
        articles: [
          { url: "https://contoh.test/gdelt/flaky1", title: "GDELT Lolos Sesudah 429", seendate: "20261116080000", domain: "contoh.test", language: "indonesian", sourcecountry: "Indonesia" },
        ],
      },
    });
  };
  const hasil = await jalankanIngestion(adapter, [sumberGdelt], {
    dipicu_oleh: "manual",
    fetchFn: fetchGdeltFlaky,
    retry: { percobaanMaks: 3, jedaAwalMs: 10, tidur: async () => {} },
  });
  const per = hasil.perSumber[0];
  cek("A3 engine: GDELT 429 2x lalu 200 -> baru=1, percobaan_fetch=3", per.baru === 1 && per.percobaan_fetch === 3 && panggilan === 3, `baru=${per.baru} panggilan=${panggilan}`);
}

// ================= B. Fallback: satu sumber gagal tidak menghentikan yang lain =================
function fetchRouter(peta) {
  // peta: substring URL -> handler async () => responsMock
  return async (url) => {
    const kunci = Object.keys(peta).find((k) => String(url).includes(k));
    if (!kunci) throw new Error(`URL tak dikenal di mock: ${url}`);
    return peta[kunci]();
  };
}
const SATU_ITEM = (judul, url) =>
  buatRss(buatItemRss(judul, url, "Mon, 16 Nov 2026 07:00:00 GMT"));

{
  // B1: 3 RSS — tengah mati permanen (500), kiri-kanan jalan.
  const sA = await buatSumber("Fallback A", "rss", "https://contoh.test/fb-a.xml", 60);
  const sB = await buatSumber("Fallback B Mati", "rss", "https://contoh.test/fb-b.xml", 50);
  const sC = await buatSumber("Fallback C", "rss", "https://contoh.test/fb-c.xml", 40);
  const fetchFb = fetchRouter({
    "fb-a.xml": async () => responsMock({ teks: SATU_ITEM("Fallback A Satu", "https://contoh.test/fb/a1") }),
    "fb-b.xml": async () => responsMock({ ok: false, status: 500 }),
    "fb-c.xml": async () => responsMock({ teks: SATU_ITEM("Fallback C Satu", "https://contoh.test/fb/c1") }),
  });
  let melempar = null;
  let hasil = null;
  try {
    hasil = await jalankanIngestion(adapter, [sA, sB, sC], {
      dipicu_oleh: "manual",
      fetchFn: fetchFb,
      lewatiAllowlistFeed: true,
      retry: { percobaanMaks: 2, jedaAwalMs: 1, tidur: async () => {} },
    });
  } catch (e) { melempar = e; }
  cek("B1 fallback: satu RSS mati tidak melempar + sumber lain selesai", melempar === null && hasil !== null && hasil.total.baru === 2 && hasil.total.gagal === 1, `baru=${hasil?.total.baru} gagal=${hasil?.total.gagal}`);
  const runB = await statusRunTerakhir(sB.id);
  cek("B1 fallback: run sumber mati tercatat 'gagal' di pf_ingestion_runs", runB?.status === "gagal", `status=${runB?.status}`);
  const runA = await statusRunTerakhir(sA.id);
  cek("B1 fallback: run sumber sehat tercatat 'selesai'", runA?.status === "selesai", `status=${runA?.status}`);

  // B2: GDELT mati, RSS jalan — dan sebaliknya.
  const sRss = await buatSumber("Fallback RSS", "rss", "https://contoh.test/fb-rss.xml", 60);
  const sG = await buatSumber("Fallback GDELT", "api", "https://contoh.test/fb-gdelt", 50);
  const fetchGdeltMati = fetchRouter({
    "fb-rss.xml": async () => responsMock({ teks: SATU_ITEM("RSS Tetap Jalan", "https://contoh.test/fb/rss1") }),
    "gdeltproject.org": async () => responsMock({ ok: false, status: 429, retryAfter: "1" }),
  });
  const hasil2 = await jalankanIngestion(adapter, [sRss, sG], {
    dipicu_oleh: "manual",
    fetchFn: fetchGdeltMati,
    lewatiAllowlistFeed: true,
    retry: { percobaanMaks: 2, jedaAwalMs: 1, tidur: async () => {} },
  });
  const perRss = hasil2.perSumber.find((p) => p.sumber_id === sRss.id);
  const perG = hasil2.perSumber.find((p) => p.sumber_id === sG.id);
  cek("B2 fallback: GDELT 429 -> RSS tetap baru=1", perRss?.baru === 1 && perRss?.gagal === 0, `rss baru=${perRss?.baru}`);
  cek("B2 fallback: GDELT gagal tercatat, bukan menelan run", perG?.gagal === 1 && perG?.error !== null, `gdelt gagal=${perG?.gagal}`);

  const fetchRssMati = fetchRouter({
    "fb-rss.xml": async () => responsMock({ ok: false, status: 503 }),
    "gdeltproject.org": async () => responsMock({
      json: { articles: [{ url: "https://contoh.test/fb/g1", title: "GDELT Tetap Jalan", seendate: "20261116080000", domain: "contoh.test", language: "indonesian", sourcecountry: "Indonesia" }] },
    }),
  });
  const hasil3 = await jalankanIngestion(adapter, [sRss, sG], {
    dipicu_oleh: "manual",
    fetchFn: fetchRssMati,
    lewatiAllowlistFeed: true,
    retry: { percobaanMaks: 2, jedaAwalMs: 1, tidur: async () => {} },
  });
  const perG3 = hasil3.perSumber.find((p) => p.sumber_id === sG.id);
  cek("B2 fallback: RSS 503 -> GDELT tetap baru=1", perG3?.baru === 1 && perG3?.gagal === 0, `gdelt baru=${perG3?.baru}`);

  // B3: semua sumber mati -> total gagal = jumlah sumber, tanpa throw.
  const fetchSemuaMati = async () => responsMock({ ok: false, status: 500 });
  const hasil4 = await jalankanIngestion(adapter, [sA, sB, sC], {
    dipicu_oleh: "manual",
    fetchFn: fetchSemuaMati,
    lewatiAllowlistFeed: true,
    retry: { percobaanMaks: 1, tidur: async () => {} },
  });
  cek("B3 fallback: semua sumber mati -> total.gagal=3, tanpa throw", hasil4.total.gagal === 3 && hasil4.perSumber.every((p) => p.gagal === 1), `gagal=${hasil4.total.gagal}`);
}

// ================= C. Sumber basi: 0 item bukan sukses penuh =================
{
  // C1: sumber produktif (5 item 7 hari terakhir) + feed 0 item.
  const sProd = await buatSumber("Sumber Produktif", "rss", "https://contoh.test/basi-prod.xml", 40);
  for (let i = 0; i < 5; i++) {
    await seedItem(sProd.id, `Produktif Lama ${i} Judul Berita Panjang`, `https://contoh.test/basi-prod/lama${i}`, 20 + i);
  }
  const fetchKosong = async () => responsMock({ teks: buatRss("") });
  const hasil = await jalankanIngestion(adapter, [sProd], {
    dipicu_oleh: "manual",
    fetchFn: fetchKosong,
    lewatiAllowlistFeed: true,
  });
  const per = hasil.perSumber[0];
  const run = await statusRunTerakhir(sProd.id);
  cek("C1 basi: 0 item dari sumber produktif -> run 'sebagian' + peringatan_basi", run?.status === "sebagian" && typeof per.peringatan_basi === "string" && per.peringatan_basi.length > 0, `status=${run?.status} peringatan=${per.peringatan_basi ?? "-"}`);
  cek("C1 basi: peringatan tercatat di kolom error run (terlihat di dashboard)", typeof run?.error === "string" && run.error.includes("biasanya produktif"), `error=${String(run?.error ?? "").slice(0, 80)}`);

  // C2: sumber yang belum pernah produktif + feed 0 item -> 'selesai', tanpa peringatan.
  const sBaru = await buatSumber("Sumber Baru Belum Produktif", "rss", "https://contoh.test/basi-baru.xml", 40);
  const hasil2 = await jalankanIngestion(adapter, [sBaru], {
    dipicu_oleh: "manual",
    fetchFn: fetchKosong,
    lewatiAllowlistFeed: true,
  });
  const run2 = await statusRunTerakhir(sBaru.id);
  cek("C2 basi: 0 item dari sumber belum produktif -> 'selesai', tanpa peringatan basi", run2?.status === "selesai" && !hasil2.perSumber[0].peringatan_basi, `status=${run2?.status}`);

  // C3: pemeriksaan basi harian (pemeliharaan) menandai sumber > 48 jam.
  const sDiam = await buatSumber("Sumber Diam", "rss", "https://contoh.test/basi-diam.xml", 40);
  await seedItem(sDiam.id, "Diam Lama Judul Berita Panjang Sekali", "https://contoh.test/basi-diam/lama", 60);
  const pem = await jalankanPemeliharaanAntrean(adapter, [{ id: sDiam.id, nama: sDiam.nama }]);
  const basiDiam = pem.basi.find((b) => b.sumber_id === sDiam.id);
  cek("C3 basi: sumber tanpa item baru 60 jam terdeteksi basi (>48 jam)", !!basiDiam && basiDiam.pernah_produktif === true, `jam=${basiDiam?.jam_sejak_item_terakhir}`);
  const sumberRow = await db.query(`select status_terakhir from public.pf_sources where id = $1`, [sDiam.id]);
  cek("C3 basi: peringatan BASI ditulis ke pf_sources.status_terakhir (dashboard)", String(sumberRow.rows[0]?.status_terakhir ?? "").includes("BASI:"), String(sumberRow.rows[0]?.status_terakhir ?? "").slice(0, 80));
  cek("C3 basi: AMBANG_BASI_JAM = 48", AMBANG_BASI_JAM === 48);
}

// ================= D. Dedup =================
{
  // D1: parafrase judul nyata (bukan sintetis 1-kata).
  const ASLI = "Presiden Prabowo Resmikan Bendungan Baru di Jawa Barat";
  const PARAFRASE = "Prabowo Resmikan Bendungan Baru Jawa Barat";
  const BEDA = "Timnas Indonesia Menang Atas Thailand di Final Piala Asia";
  const sim = kemiripanJudul(ASLI, PARAFRASE);
  cek("D1 dedup: parafrase nyata kemiripan >= 0,8", sim >= AMBANG_DUPLIKAT_LUNAK, `kemiripan=${sim.toFixed(3)}`);
  cek("D1 dedup: topik beda kemiripan < 0,2", kemiripanJudul(ASLI, BEDA) < 0.2);
  const kandLain = cariKandidatDuplikatLunak({
    judul: PARAFRASE, sumberId: "sumber-b", waktuDiambil: SEKARANG,
    kandidat: [{ id: "id-asli", judul: ASLI, sumber_id: "sumber-a", waktu_terbit_asli: null, waktu_diambil: SEKARANG.toISOString() }],
  });
  cek("D1 dedup: parafrase lintas penerbit -> kandidat 'disalin_dari'", kandLain.kandidat && kandLain.tipe === "disalin_dari", kandLain.alasan ?? "");
  const kandSama = cariKandidatDuplikatLunak({
    judul: PARAFRASE, sumberId: "sumber-a", waktuDiambil: SEKARANG,
    kandidat: [{ id: "id-asli", judul: ASLI, sumber_id: "sumber-a", waktu_terbit_asli: null, waktu_diambil: SEKARANG.toISOString() }],
  });
  cek("D1 dedup: parafrase sumber sama -> kandidat 'duplikat'", kandSama.kandidat && kandSama.tipe === "duplikat");

  // D2: engine end-to-end — parafrase disimpan 'baru' + penanda kandidat lunak.
  const sAsli = await buatSumber("Dedup Asli", "rss", "https://contoh.test/dedup-asli.xml", 60);
  const sPara = await buatSumber("Dedup Parafrase", "rss", "https://contoh.test/dedup-para.xml", 50);
  await seedItem(sAsli.id, ASLI, "https://contoh.test/dedup/asli", 1);
  const fetchPara = async () => responsMock({
    teks: buatRss(buatItemRss(PARAFRASE, "https://contoh.test/dedup/parafrase", "Mon, 16 Nov 2026 08:00:00 GMT")),
  });
  const hasilPara = await jalankanIngestion(adapter, [sPara], {
    dipicu_oleh: "manual", fetchFn: fetchPara, lewatiAllowlistFeed: true,
  });
  cek("D2 dedup: parafrase tetap disimpan 'baru' (bukan dihapus otomatis)", hasilPara.perSumber[0].baru === 1 && (hasilPara.perSumber[0].duplikat_lunak ?? 0) === 1, `baru=${hasilPara.perSumber[0].baru} lunak=${hasilPara.perSumber[0].duplikat_lunak}`);
  const barisPara = await db.query(
    `select metadata from public.pf_raw_items where url = $1`,
    ["https://contoh.test/dedup/parafrase"],
  );
  const metaPara = typeof barisPara.rows[0]?.metadata === "string"
    ? JSON.parse(barisPara.rows[0].metadata)
    : (barisPara.rows[0]?.metadata ?? {});
  cek("D2 dedup: metadata.kandidat_duplikat_lunak tercatat untuk review", metaPara.kandidat_duplikat_lunak?.tipe === "disalin_dari" && metaPara.kandidat_duplikat_lunak?.kemiripan >= 0.8, JSON.stringify(metaPara.kandidat_duplikat_lunak ?? null));

  // D3: feed yang sama dua kali -> run ke-2 semua duplikat, 0 URL ganda.
  const sUlang = await buatSumber("Dedup Ulang", "rss", "https://contoh.test/dedup-ulang.xml", 60);
  const fetchUlang = async () => responsMock({
    teks: buatRss(
      buatItemRss("Ulang Satu Judul Berita Panjang", "https://contoh.test/dedup-ulang/1", "Mon, 16 Nov 2026 07:00:00 GMT") +
      buatItemRss("Ulang Dua Judul Berita Panjang", "https://contoh.test/dedup-ulang/2", "Mon, 16 Nov 2026 07:05:00 GMT"),
    ),
  });
  const run1 = await jalankanIngestion(adapter, [sUlang], {
    dipicu_oleh: "manual", fetchFn: fetchUlang, lewatiAllowlistFeed: true,
  });
  const run2 = await jalankanIngestion(adapter, [sUlang], {
    dipicu_oleh: "manual", fetchFn: fetchUlang, lewatiAllowlistFeed: true,
  });
  cek("D3 dedup: run ke-2 feed sama -> baru=0, duplikat=2", run1.perSumber[0].baru === 2 && run2.perSumber[0].baru === 0 && run2.perSumber[0].duplikat === 2, `run1 baru=${run1.perSumber[0].baru} run2 duplikat=${run2.perSumber[0].duplikat}`);
  const hitungUrl = await db.query(
    `select count(*)::int as n from public.pf_raw_items where hash_url = $1`,
    [hashUrl("https://contoh.test/dedup-ulang/1")],
  );
  cek("D3 dedup: 0 URL ganda di DB (1 baris per hash_url)", hitungUrl.rows[0].n === 1, `n=${hitungUrl.rows[0].n}`);
  const idxUnik = await db.query(
    `select count(*)::int as n from pg_indexes
      where tablename = 'pf_raw_items' and indexdef ilike '%unique%' and indexdef ilike '%hash_url%'`,
  );
  cek("D3 dedup: UNIQUE index hash_url ada di skema (benteng terakhir)", idxUnik.rows[0].n >= 1, `n=${idxUnik.rows[0].n}`);

  // D4: judul identik lintas penerbit -> disalin_dari (bukan sumber independen).
  const sOrig = await buatSumber("Dedup Orig", "rss", "https://contoh.test/dedup-orig.xml", 60);
  const sSalin = await buatSumber("Dedup Salin", "rss", "https://contoh.test/dedup-salin.xml", 50);
  const JUDUL_SAMA = "Pemerintah Tetapkan Libur Nasional Tambahan Akhir Tahun";
  const idOrig = await seedItem(sOrig.id, JUDUL_SAMA, "https://contoh.test/dedup/orig", 2);
  const fetchSalin = async () => responsMock({
    teks: buatRss(buatItemRss(JUDUL_SAMA, "https://contoh.test/dedup/salin", "Mon, 16 Nov 2026 08:00:00 GMT")),
  });
  const hasilSalin = await jalankanIngestion(adapter, [sSalin], {
    dipicu_oleh: "manual", fetchFn: fetchSalin, lewatiAllowlistFeed: true,
  });
  const barisSalin = await db.query(
    `select status, disalin_dari_id from public.pf_raw_items where url = $1`,
    ["https://contoh.test/dedup/salin"],
  );
  cek("D4 dedup: judul identik penerbit lain -> status 'disalin_dari'", hasilSalin.perSumber[0].duplikat === 1 && barisSalin.rows[0]?.status === "disalin_dari", `status=${barisSalin.rows[0]?.status}`);
  cek("D4 dedup: disalin_dari_id menunjuk item asli", barisSalin.rows[0]?.disalin_dari_id === idOrig, `disalin_dari_id=${barisSalin.rows[0]?.disalin_dari_id}`);
}

// ================= E. Kebenaran informasi =================
{
  // E1: tanggal terbit — hanya pubDate/published/dc:date; updated -> metadata.
  const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
    <title>Berita Atom</title><link href="https://contoh.test/atom/1"/>
    <published>2026-11-15T08:00:00Z</published><updated>2026-11-16T09:30:00Z</updated>
    <summary>Ringkasan atom.</summary></entry>
    <entry><title>Hanya Updated</title><link href="https://contoh.test/atom/2"/>
    <updated>2026-11-16T10:00:00Z</updated><summary>Tanpa tanggal terbit.</summary></entry>
    <entry><title>Tanpa Tanggal Sama Sekali</title><link href="https://contoh.test/atom/3"/>
    <summary>Tidak ada tanggal apa pun.</summary></entry></feed>`;
  const hasilAtom = parseRss(atom);
  cek("E1 tanggal: published dipakai sebagai tanggal terbit", hasilAtom[0]?.waktuTerbit?.toISOString() === "2026-11-15T08:00:00.000Z", hasilAtom[0]?.waktuTerbit?.toISOString() ?? "null");
  cek("E1 tanggal: updated -> metadata.waktu_revisi, bukan tanggal terbit", hasilAtom[0]?.metadata?.waktu_revisi === "2026-11-16T09:30:00.000Z");
  cek("E1 tanggal: hanya updated -> waktuTerbit null (tanggal tidak diketahui)", hasilAtom[1]?.waktuTerbit === null && hasilAtom[1]?.metadata?.waktu_revisi === "2026-11-16T10:00:00.000Z");
  cek("E1 tanggal: tanpa tanggal apa pun -> waktuTerbit null, bukan 'baru'", hasilAtom[2]?.waktuTerbit === null);

  // E2: GDELT seendate bukan tanggal terbit.
  cek("E2 gdelt: parseSeendate 20261116080000 -> UTC", parseSeendate("20261116080000")?.toISOString() === "2026-11-16T08:00:00.000Z");
  const fetchGdeltE2 = async () => responsMock({
    json: {
      articles: [
        { url: "https://contoh.test/gdelt/e2", title: "GDELT Tanggal", seendate: "20261116080000", domain: "contoh.test", language: "indonesian", sourcecountry: "Indonesia" },
      ],
    },
  });
  const hasilGdelt = await fetchGdelt("Indonesia", { fetchFn: fetchGdeltE2 });
  cek("E2 gdelt: waktuTerbit null + waktu_dilihat_gdelt terisi", hasilGdelt.items[0]?.waktuTerbit === null && hasilGdelt.items[0]?.metadata?.waktu_dilihat_gdelt === "2026-11-16T08:00:00.000Z");

  // E3: item tanpa tanggal TIDAK dihitung "baru" dalam 24 jam (anti DEVELOPING palsu).
  const itemTanpaTanggal = (id, sumber) => ({
    id, sumber_id: sumber, url: `https://contoh.test/tanpa/${id}`,
    judul: "Topik Ramai Tanpa Tanggal Terbit Sama Sekali",
    ringkasan: "", waktu_terbit_asli: null, disalin_dari_id: null,
  });
  const putusTanpaTanggal = tentukanKeputusanVerifikasi(
    itemTanpaTanggal("t1", "s1"),
    [itemTanpaTanggal("t2", "s1"), itemTanpaTanggal("t3", "s1")],
    new Map([["s1", 1]]),
    SEKARANG,
  );
  cek("E3 tanggal: 3 item tanpa tanggal -> item24Jam=0, tetap UNCONFIRMED", putusTanpaTanggal.item24Jam === 0 && putusTanpaTanggal.keputusan === "UNCONFIRMED", `item24Jam=${putusTanpaTanggal.item24Jam} keputusan=${putusTanpaTanggal.keputusan}`);

  // E4: salinan tidak dihitung independen (rantai disalin_dari = 1 sumber).
  const rantai = [
    { id: "r1", sumber_id: "s1", url: "https://contoh.test/rantai/1", judul: "Judul Rantai Salinan Berita", ringkasan: "", waktu_terbit_asli: "2026-11-16T07:00:00.000Z", disalin_dari_id: null },
    { id: "r2", sumber_id: "s2", url: "https://contoh.test/rantai/2", judul: "Judul Rantai Salinan Berita", ringkasan: "", waktu_terbit_asli: "2026-11-16T07:30:00.000Z", disalin_dari_id: "r1" },
    { id: "r3", sumber_id: "s3", url: "https://contoh.test/rantai/3", judul: "Judul Rantai Salinan Berita", ringkasan: "", waktu_terbit_asli: "2026-11-16T08:00:00.000Z", disalin_dari_id: "r2" },
  ];
  const putusRantai = tentukanKeputusanVerifikasi(
    rantai[0], [rantai[1], rantai[2]],
    new Map([["s1", 1], ["s2", 1], ["s3", 1]]),
    SEKARANG,
  );
  // Ketiga item terbit < 24 jam + 1 sumber independen -> DEVELOPING
  // (topik ramai, bukan VERIFIED): bila salinan dihitung 3 sumber,
  // keputusan di sini akan jadi VERIFIED — justru itu yang dicegah.
  cek("E4 salinan: rantai 3 salinan -> 1 sumber independen, DEVELOPING (bukan VERIFIED)", putusRantai.sumberIndependen === 1 && putusRantai.keputusan === "DEVELOPING", `independen=${putusRantai.sumberIndependen} keputusan=${putusRantai.keputusan}`);

  // E5: evidence independen untuk VERIFIED (2 tier-1) vs CROSS-CHECKED (2 tier-3).
  const duaTier1 = [
    { id: "v1", sumber_id: "s1", url: "https://contoh.test/v/1", judul: "Judul Terverifikasi Dua Tier Satu", ringkasan: "", waktu_terbit_asli: "2026-11-16T07:00:00.000Z", disalin_dari_id: null },
    { id: "v2", sumber_id: "s2", url: "https://contoh.test/v/2", judul: "Judul Terverifikasi Dua Tier Satu", ringkasan: "", waktu_terbit_asli: "2026-11-16T07:30:00.000Z", disalin_dari_id: null },
  ];
  const putusV = tentukanKeputusanVerifikasi(duaTier1[0], [duaTier1[1]], new Map([["s1", 1], ["s2", 1]]), SEKARANG);
  cek("E5 evidence: 2 independen tier-1 -> VERIFIED", putusV.keputusan === "VERIFIED" && putusV.sumberIndependen === 2, putusV.alasan);
  const putusC = tentukanKeputusanVerifikasi(duaTier1[0], [duaTier1[1]], new Map([["s1", 3], ["s2", 3]]), SEKARANG);
  cek("E5 evidence: 2 independen tier-3 -> CROSS-CHECKED (bukan VERIFIED)", putusC.keputusan === "CROSS-CHECKED");
  const putusU = tentukanKeputusanVerifikasi(duaTier1[0], [], new Map([["s1", 1]]), SEKARANG);
  cek("E5 evidence: 1 sumber saja -> UNCONFIRMED", putusU.keputusan === "UNCONFIRMED");

  // E6: pf_akar_salinan (RPC v9) — rantai 3 URL berakar di 1 item.
  const sAkar = await buatSumber("Akar Asli", "rss", "https://contoh.test/akar-asli.xml", 100);
  const sSalin1 = await buatSumber("Akar Salin 1", "rss", "https://contoh.test/akar-s1.xml", 90);
  const sSalin2 = await buatSumber("Akar Salin 2", "rss", "https://contoh.test/akar-s2.xml", 90);
  const idAkar = await seedItem(sAkar.id, "Judul Akar Salinan Multi Sumber", "https://contoh.test/akar/1", 3);
  const idS1 = await seedItem(sSalin1.id, "Judul Akar Salinan Multi Sumber", "https://contoh.test/akar/2", 2, "disalin_dari", { disalinDariId: idAkar });
  const idS2 = await seedItem(sSalin2.id, "Judul Akar Salinan Multi Sumber", "https://contoh.test/akar/3", 1, "disalin_dari", { disalinDariId: idS1 });
  const artikelAkar = await db.query(
    `insert into public.pf_articles
       (slug, judul, ringkasan, isi, kategori_slug, status_verifikasi, status, raw_item_id)
     values ('akar-salinan-uji', 'Judul Akar Salinan Multi Sumber', 'ringkasan', 'isi', 'indonesia', 'VERIFIED', 'terbit', $1)
     returning id`,
    [idAkar],
  );
  const akarRows = await db.query(
    `select * from public.pf_akar_salinan($1, $2)`,
    [artikelAkar.rows[0].id, ["https://contoh.test/akar/1", "https://contoh.test/akar/2", "https://contoh.test/akar/3"]],
  );
  const akarUnik = new Set(akarRows.rows.map((r) => r.akar_id));
  cek("E6 akar_salinan: 3 URL -> 3 baris, 1 akar unik", akarRows.rows.length === 3 && akarUnik.size === 1, `baris=${akarRows.rows.length} akar_unik=${akarUnik.size}`);
  cek("E6 akar_salinan: salinan bertanda disalin=true, asli false", akarRows.rows.find((r) => r.item_id === idAkar)?.disalin === false && akarRows.rows.find((r) => r.item_id === idS2)?.disalin === true);

  // E7: kutipan evidence harus kalimat sumber yang memuat inti klaim.
  const teksSumber = "Menteri Keuangan mengumumkan kebijakan baru hari ini. \"Harga naik 10 persen mulai besok,\" ujar Menteri Keuangan. Kebijakan ini berlaku mulai Januari.";
  const klaimKutipan = { teks: "\"Harga naik 10 persen mulai besok,\" ujar Menteri Keuangan.", jenis: "kutipan" };
  const kutipan = cariKalimatKutipan(teksSumber, klaimKutipan);
  cek("E7 kutipan: kalimat sumber yang memuat inti ditemukan (<= 300 karakter)", typeof kutipan === "string" && kutipan.includes("10 persen") && kutipan.length <= 300, kutipan ?? "null");
  const kutipanTidakAda = cariKalimatKutipan("Berita lain tanpa angka apa pun di dalamnya.", klaimKutipan);
  cek("E7 kutipan: tidak ada kalimat cocok -> null (pemanggil wajib menandai kutipan_tidak_ditemukan)", kutipanTidakAda === null);

  // E8: draf orisinal — ringkasan sendiri + atribusi + URL sumber.
  const draf = susunDrafArtikel({
    item: {
      id: "item-draf", judul: "Pemerintah Naikkan Gaji Guru 10 Persen",
      sumber_nama: "Antara", url: "https://contoh.test/draf/1",
      ringkasan: "Ringkasan redaksi.", isi_ringkas: "",
    },
    klaim: [{ teks: "Gaji guru naik 10 persen mulai Januari.", jenis: "angka" }],
    ringkasan: "Ringkasan redaksi: gaji guru naik.",
    keputusan: "VERIFIED",
    sumber: [
      { nama: "Antara", url: "https://contoh.test/draf/1" },
      { nama: "CNN Indonesia", url: "https://contoh.test/draf/2" },
    ],
  });
  cek("E8 draf: isi memuat atribusi + URL kedua sumber", draf.isi.includes("Antara — https://contoh.test/draf/1") && draf.isi.includes("CNN Indonesia — https://contoh.test/draf/2"), draf.isi.slice(0, 120));
  cek("E8 draf: isi memuat bagian 'Yang belum diketahui' (jujur soal batas bukti)", draf.isi.includes("Yang belum diketahui"));
  cek("E8 draf: status draf + keputusan VERIFIED diteruskan", draf.status_verifikasi === "VERIFIED" && typeof draf.slug === "string" && draf.slug.length > 0, `slug=${draf.slug}`);
  let galatDraf0 = null;
  try {
    susunDrafArtikel({
      item: { id: "x", judul: "Tanpa Klaim", sumber_nama: "Antara", url: "https://contoh.test/draf/0", ringkasan: "", isi_ringkas: "" },
      klaim: [], ringkasan: "", keputusan: "VERIFIED", sumber: [],
    });
  } catch (e) { galatDraf0 = e; }
  cek("E8 draf: 0 klaim -> draf ditolak (bukan draf kosong)", galatDraf0 instanceof Error);

  // E9: koreksi terlihat pengguna — status CORRECTED ada di CHECK + halaman kebijakan koreksi ada.
  const checkKoreksi = await db.query(
    `select count(*)::int as n from information_schema.check_constraints
      where constraint_schema = 'public'
        and check_clause ilike '%CORRECTED%'`,
  );
  cek("E9 koreksi: status CORRECTED diizinkan skema pf_raw_items", checkKoreksi.rows[0].n >= 1, `n=${checkKoreksi.rows[0].n}`);
  cek("E9 koreksi: halaman kebijakan koreksi ada (koreksi terlihat pengguna)", fs.existsSync(new URL("../src/app/kebijakan/koreksi/page.tsx", import.meta.url).pathname));
}

// ================= F. Antrean: kejar ketertinggalan + kedaluwarsa + draf-dulu =================
{
  // F1: urutKejar — tertua dulu (fungsi murni).
  const acak = [
    { waktu_diambil: new Date(SEKARANG.getTime() - 1 * JAM).toISOString() },
    { waktu_diambil: new Date(SEKARANG.getTime() - 9 * 24 * JAM).toISOString() },
    { waktu_diambil: new Date(SEKARANG.getTime() - 3 * 24 * JAM).toISOString() },
  ];
  const terurut = urutKejar(acak);
  cek("F1 kejar: urutKejar menempatkan item 9 hari dulu", new Date(terurut[0].waktu_diambil).getTime() < new Date(terurut[1].waktu_diambil).getTime() && new Date(terurut[1].waktu_diambil).getTime() < new Date(terurut[2].waktu_diambil).getTime());

  // F2: kedaluwarsa — UNCONFIRMED 15 hari ditandai, 5 hari tidak.
  const sAntre = await buatSumber("Antrean Uji", "rss", "https://contoh.test/antre.xml", 60);
  const idTua = await seedItem(sAntre.id, "Item Antrean Tua Lima Belas Hari", "https://contoh.test/antre/tua", 15 * 24);
  const idMuda = await seedItem(sAntre.id, "Item Antrean Muda Lima Hari", "https://contoh.test/antre/muda", 5 * 24);
  const pem = await jalankanPemeliharaanAntrean(adapter, []);
  cek("F2 kedaluwarsa: 1 item 15 hari ditandai", pem.kedaluarsa_ditandai === 1, `ditandai=${pem.kedaluarsa_ditandai}`);
  const stTua = await statusItem(idTua);
  const stMuda = await statusItem(idMuda);
  cek("F2 kedaluwarsa: item 15 hari -> status 'ditolak' + alasan kedaluwarsa", stTua?.status === "ditolak", `status=${stTua?.status}`);
  const alasanTua = await db.query(`select alasan from public.pf_raw_items where id = $1`, [idTua]);
  cek("F2 kedaluwarsa: alasan berawalan 'Kedaluarsa otomatis' (dapat dipulihkan)", String(alasanTua.rows[0]?.alasan ?? "").startsWith("Kedaluarsa otomatis"), String(alasanTua.rows[0]?.alasan ?? "").slice(0, 60));
  cek("F2 kedaluwarsa: item 5 hari tetap 'baru'", stMuda?.status === "baru", `status=${stMuda?.status}`);

  // F3: mode kejar — antrean tertua 8 hari -> mode 'terlama', item lama diproses.
  // Isolasi antrean: item UNCONFIRMED dari bagian A–F2 dikeluarkan
  // dari antrean (DEVELOPING) agar limit 10 benar-benar mencakup
  // kedua item kejar — tanpa ini, item segar tenggelam di bawah
  // 10 item tertua lain dan asersi "diproses" menjadi rapuh.
  await db.query(
    `update public.pf_raw_items set status_verifikasi = 'DEVELOPING'
      where status_verifikasi = 'UNCONFIRMED'`,
  );
  const sKejar = await buatSumber("Kejar Uji", "rss", "https://contoh.test/kejar.xml", 60);
  const idLama = await seedItem(sKejar.id, "Item Kejar Delapan Hari Lalu", "https://contoh.test/kejar/lama", 8 * 24, "baru", {
    ringkasan: "Rupiah melemah ke Rp 16.500 per dolar hari ini.",
  });
  const idSegar = await seedItem(sKejar.id, "Item Kejar Satu Jam Lalu", "https://contoh.test/kejar/segar", 1, "baru", {
    ringkasan: "Rupiah menguat ke Rp 16.400 per dolar hari ini.",
  });
  const hasilKejar = await jalankanPipelineEditorial(adapterAi, {
    limit: 10, rekonsiliasi: false, fetchFn: fetchMati,
  });
  cek("F3 kejar: antrean tertua 8 hari -> modeAntrean 'terlama'", hasilKejar.modeAntrean === "terlama", `mode=${hasilKejar.modeAntrean}`);
  const runLama = await db.query(
    `select count(*)::int as n from public.pf_ai_runs where input_ref = $1`,
    [idLama],
  );
  cek("F3 kejar: item 8 hari diproses (ada pf_ai_runs untuk item itu)", runLama.rows[0].n >= 1, `n=${runLama.rows[0].n}`);
  const runSegar = await db.query(
    `select count(*)::int as n from public.pf_ai_runs where input_ref = $1`,
    [idSegar],
  );
  cek("F3 kejar: item segar juga diproses dalam run yang sama", runSegar.rows[0].n >= 1, `n=${runSegar.rows[0].n}`);

  // F4: antrean segar -> mode 'terbaru'.
  await db.query(
    `update public.pf_raw_items set waktu_diambil = now() - interval '1 hour'
      where status_verifikasi = 'UNCONFIRMED'`,
  );
  const hasilSegar = await jalankanPipelineEditorial(adapterAi, {
    limit: 10, rekonsiliasi: false, fetchFn: fetchMati,
  });
  cek("F4 kejar: antrean segar (tertua 1 jam) -> modeAntrean 'terbaru'", hasilSegar.modeAntrean === "terbaru", `mode=${hasilSegar.modeAntrean}`);

  // F5: N-T3 — draf gagal dibuat -> status item TIDAK berubah; run ulang -> draf + VERIFIED.
  const sT1 = await buatSumber("NT3 Tier Satu A", "rss", "https://contoh.test/nt3-a.xml", 100);
  const sT2 = await buatSumber("NT3 Tier Satu B", "rss", "https://contoh.test/nt3-b.xml", 90);
  const JUDUL_NT3 = "Bank Indonesia Tahan Suku Bunga Acuan di Level Lima Persen";
  const RINGKAS_NT3 = "Bank Indonesia menahan suku bunga acuan di level 5 persen. Rupiah berada di Rp 16.500 per dolar.";
  const idN1 = await seedItem(sT1.id, JUDUL_NT3, "https://contoh.test/nt3/1", 1, "baru", { ringkasan: RINGKAS_NT3 });
  const idN2 = await seedItem(sT2.id, JUDUL_NT3, "https://contoh.test/nt3/2", 1, "baru", { ringkasan: RINGKAS_NT3 });
  adapterAi.gagalSimpanArtikel = true;
  const hasilGagal = await jalankanPipelineEditorial(adapterAi, {
    limit: 10, rekonsiliasi: false, fetchFn: fetchMati,
  });
  const stN1Gagal = await statusItem(idN1);
  const stN2Gagal = await statusItem(idN2);
  const drafSaatGagal = await db.query(`select count(*)::int as n from public.pf_articles where raw_item_id in ($1, $2)`, [idN1, idN2]);
  cek("F5 N-T3: simpanArtikel gagal -> kedua item tetap UNCONFIRMED", stN1Gagal?.status_verifikasi === "UNCONFIRMED" && stN2Gagal?.status_verifikasi === "UNCONFIRMED", `n1=${stN1Gagal?.status_verifikasi} n2=${stN2Gagal?.status_verifikasi} gagal_run=${hasilGagal.gagal}`);
  cek("F5 N-T3: simpanArtikel gagal -> 0 draf dibuat (tidak ada draf yatim)", drafSaatGagal.rows[0].n === 0, `n=${drafSaatGagal.rows[0].n}`);
  adapterAi.gagalSimpanArtikel = false;
  const hasilUlang = await jalankanPipelineEditorial(adapterAi, {
    limit: 10, rekonsiliasi: false, fetchFn: fetchMati,
  });
  const stN1 = await statusItem(idN1);
  const stN2 = await statusItem(idN2);
  const drafUlang = await db.query(
    `select raw_item_id, status_verifikasi from public.pf_articles where raw_item_id in ($1, $2) order by raw_item_id`,
    [idN1, idN2],
  );
  cek("F5 N-T3: run ulang -> kedua item VERIFIED (judul identik 2 tier-1)", stN1?.status_verifikasi === "VERIFIED" && stN2?.status_verifikasi === "VERIFIED", `n1=${stN1?.status_verifikasi} n2=${stN2?.status_verifikasi} draf=${hasilUlang.draf}`);
  cek("F5 N-T3: run ulang -> draf tersimpan untuk kedua item (tidak hilang diam-diam)", drafUlang.rows.length === 2, `n=${drafUlang.rows.length}`);

  // F6: regresi slug bentrok (celah Tahap E) — dua draf berjudul
  // identik WAJIB berslug berbeda; buatSlugArtikel deterministik.
  const slugF6 = await db.query(
    `select slug from public.pf_articles where raw_item_id in ($1, $2) order by raw_item_id`,
    [idN1, idN2],
  );
  cek("F6 slug: dua draf judul identik berslug berbeda (UNIQUE tidak bentrok)", slugF6.rows.length === 2 && slugF6.rows[0].slug !== slugF6.rows[1].slug, slugF6.rows.map((r) => r.slug).join(" | "));
  const slugN1 = await db.query(
    `select slug from public.pf_articles where raw_item_id = $1`,
    [idN1],
  );
  cek("F6 slug: slug draf = buatSlugArtikel(judul, id item) (deterministik)", slugN1.rows[0]?.slug === buatSlugArtikel(JUDUL_NT3, idN1), slugN1.rows[0]?.slug ?? "-");
  cek("F6 slug: judul sama + id beda -> slug beda; id sama -> slug sama", buatSlugArtikel(JUDUL_NT3, idN1) !== buatSlugArtikel(JUDUL_NT3, idN2) && buatSlugArtikel(JUDUL_NT3, idN1) === buatSlugArtikel(JUDUL_NT3, idN1));
}

// ================= G. Kesehatan sumber =================
{
  const skrg = new Date("2026-11-16T12:00:00Z");
  const iso = (jamLalu) => new Date(skrg.getTime() - jamLalu * JAM).toISOString();
  const run = (status, jamLalu) => ({ sumber_id: "s1", status, selesai_pada: iso(jamLalu), dimulai_pada: iso(jamLalu) });

  const sehat = hitungKesehatanSumber({
    sumber_id: "s1", sumber_nama: "Sehat", itemTerakhir: iso(2),
    runs: [run("selesai", 1)], sekarang: skrg,
  });
  cek("G1 kesehatan: run sukses + item 2 jam lalu -> sehat", sehat.status === "sehat" && sehat.gagal_beruntun === 0 && sehat.sukses_terakhir === iso(1), `status=${sehat.status}`);

  const peringatan = hitungKesehatanSumber({
    sumber_id: "s1", sumber_nama: "Peringatan", itemTerakhir: iso(2),
    runs: [run("gagal", 1), run("selesai", 2)], sekarang: skrg,
  });
  cek("G1 kesehatan: 1x gagal beruntun -> peringatan", peringatan.status === "peringatan" && peringatan.gagal_beruntun === 1, `status=${peringatan.status} gagal=${peringatan.gagal_beruntun}`);

  const gagal3 = hitungKesehatanSumber({
    sumber_id: "s1", sumber_nama: "Gagal", itemTerakhir: iso(70),
    runs: [run("gagal", 1), run("gagal", 2), run("gagal", 3), run("selesai", 4)], sekarang: skrg,
  });
  cek("G1 kesehatan: 3x gagal beruntun -> gagal", gagal3.status === "gagal" && gagal3.gagal_beruntun === 3, `status=${gagal3.status}`);

  const basi = hitungKesehatanSumber({
    sumber_id: "s1", sumber_nama: "Basi", itemTerakhir: iso(60),
    runs: [run("selesai", 1)], sekarang: skrg,
  });
  cek("G1 kesehatan: item terakhir 60 jam lalu -> basi", basi.status === "basi" && basi.jam_sejak_item_terakhir === 60, `status=${basi.status} jam=${basi.jam_sejak_item_terakhir}`);

  const belum = hitungKesehatanSumber({
    sumber_id: "s1", sumber_nama: "Belum", itemTerakhir: null, runs: [], sekarang: skrg,
  });
  cek("G1 kesehatan: tanpa run -> belum_pernah", belum.status === "belum_pernah" && belum.sukses_terakhir === null);

  const belumItem = hitungKesehatanSumber({
    sumber_id: "s1", sumber_nama: "BelumItem", itemTerakhir: null,
    runs: [run("selesai", 1)], sekarang: skrg,
  });
  cek("G1 kesehatan: ada run sukses tapi belum pernah ada item baru -> peringatan", belumItem.status === "peringatan");

  cek("G1 kesehatan: label Indonesia tersedia untuk semua status", ["sehat", "peringatan", "gagal", "basi", "belum_pernah"].every((s) => typeof LABEL_KESEHATAN[s] === "string"));

  // G2: integrasi — dua kueri yang sama dipakai halaman /admin/sumber,
  // dijalankan ke PGlite lalu diringkas.
  const sSehat = await buatSumber("Kesehatan Sehat", "rss", "https://contoh.test/kes-sehat.xml", 60);
  const sMati = await buatSumber("Kesehatan Mati", "rss", "https://contoh.test/kes-mati.xml", 50);
  const sDiam = await buatSumber("Kesehatan Diam", "rss", "https://contoh.test/kes-diam.xml", 40);
  await seedItem(sSehat.id, "Kesehatan Sehat Item Baru Saja", "https://contoh.test/kes/sehat1", 1);
  await seedItem(sDiam.id, "Kesehatan Diam Item Lama Sekali", "https://contoh.test/kes/diam1", 60);
  for (const [sumber, status] of [[sSehat, "selesai"], [sMati, "gagal"], [sMati, "gagal"], [sMati, "gagal"], [sDiam, "selesai"]]) {
    await db.query(
      `insert into public.pf_ingestion_runs (sumber_id, sumber_nama, dimulai_pada, selesai_pada, status, dipicu_oleh)
       values ($1, $2, now() - interval '1 hour', now() - interval '1 hour', $3, 'manual')`,
      [sumber.id, sumber.nama, status],
    );
  }
  const runsQ = await db.query(
    `select sumber_id, status, selesai_pada, dimulai_pada from public.pf_ingestion_runs
      order by dimulai_pada desc limit 200`,
  );
  const itemQ = await db.query(
    `select sumber_id, waktu_diambil from public.pf_raw_items
      where status in ('baru', 'disalin_dari')
      order by waktu_diambil desc limit 500`,
  );
  const ringkas = ringkasKesehatanSumber({
    sumber: [
      { id: sSehat.id, nama: sSehat.nama },
      { id: sMati.id, nama: sMati.nama },
      { id: sDiam.id, nama: sDiam.nama },
    ],
    runs: runsQ.rows,
    itemBaru: itemQ.rows,
    sekarang: SEKARANG,
  });
  const kSehat = ringkas.find((k) => k.sumber_id === sSehat.id);
  const kMati = ringkas.find((k) => k.sumber_id === sMati.id);
  const kDiam = ringkas.find((k) => k.sumber_id === sDiam.id);
  cek("G2 kesehatan: integrasi PGlite — sumber sehat terdeteksi sehat", kSehat?.status === "sehat", `status=${kSehat?.status}`);
  cek("G2 kesehatan: integrasi PGlite — sumber 3x gagal terdeteksi gagal", kMati?.status === "gagal" && kMati?.gagal_beruntun === 3, `status=${kMati?.status} gagal=${kMati?.gagal_beruntun}`);
  cek("G2 kesehatan: integrasi PGlite — sumber diam 60 jam terdeteksi basi", kDiam?.status === "basi", `status=${kDiam?.status}`);
}

// ================= H. Probe live: 7 feed RSS + GDELT =================
// Informasional: HTTP status tiap feed dicatat apa adanya.
// GDELT 429 = SKIP terlihat (rate limit eksternal, pola flake sejak
// Fase 3) — BUKAN gagal, BUKAN lolos diam-diam. Feed RSS non-200
// dicatat sebagai PERINGATAN probe (tidak menggagalkan baterai:
// ketersediaan live bisa berubah tiap menit; yang diuji di sini
// adalah keterbacaan + pencatatan, bukan SLA feed).
{
  const UA_INGESTION =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 PRATA-FAKTA-Ingestion/1.0";
  const FEEDS = [
    ["Antara — Terkini", "https://www.antaranews.com/rss/terkini.xml"],
    ["CNN Indonesia", "https://www.cnnindonesia.com/rss"],
    ["Liputan6 — Berita", "https://feed.liputan6.com/rss/berita"],
    ["CNBC Indonesia", "https://www.cnbcindonesia.com/rss"],
    ["Tribunnews", "https://www.tribunnews.com/rss"],
    ["Republika", "https://www.republika.co.id/rss"],
    ["BBC Indonesia", "https://feeds.bbci.co.uk/indonesia/rss.xml"],
  ];
  console.log("\n--- PROBE LIVE (H) ---");
  let probe200 = 0;
  for (const [nama, url] of FEEDS) {
    let status = "TIDAK-DAPAT-DIPROBE";
    let catatan = "";
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA_INGESTION },
        signal: AbortSignal.timeout(20000),
      });
      status = String(r.status);
      if (r.status === 200) {
        probe200++;
        const teks = await r.text();
        const jumlahItem = (teks.match(/<item[\s>]/g) ?? []).length + (teks.match(/<entry[\s>]/g) ?? []).length;
        catatan = `, ${jumlahItem} item/entry terbaca`;
      }
    } catch (e) {
      catatan = `, galat: ${e instanceof Error ? e.message : String(e)}`;
    }
    console.log(`PROBE: ${nama} -> HTTP ${status}${catatan}`);
  }
  let gdeltStatus = "TIDAK-DAPAT-DIPROBE";
  try {
    const r = await fetch(
      "https://api.gdeltproject.org/api/v2/doc/doc?query=Indonesia&mode=artlist&maxrecords=2&format=json&sort=datedesc",
      { headers: { "User-Agent": UA_INGESTION }, signal: AbortSignal.timeout(30000) },
    );
    gdeltStatus = String(r.status);
  } catch (e) {
    gdeltStatus = `galat: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (gdeltStatus === "429") {
    console.log("PROBE: GDELT DOC API -> HTTP 429 (SKIP terlihat: rate limit, bukan gagal)");
  } else {
    console.log(`PROBE: GDELT DOC API -> HTTP ${gdeltStatus}`);
  }
  console.log(`PROBE ringkasan: ${probe200}/${FEEDS.length} feed RSS HTTP 200; GDELT HTTP ${gdeltStatus}`);
}

// ================= Ringkasan =================
console.log(`\nRINGKASAN TAHAP E: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal > 0 ? 1 : 0);
