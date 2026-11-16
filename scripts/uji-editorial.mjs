// Dry-run editorial AI PRATA FAKTA terhadap feed RSS NYATA -> PGlite.
// BUKAN data dummy: semua item berasal dari feed sungguhan.
// Langkah: (a) PGlite + stub auth + migrasi v1+v2+v3+v4;
// (b) jalankan ingestion engine pada 3 feed tier-1 (Antara, CNN
// Indonesia, Liputan6 — GDELT TIDAK dipakai: sering 429 dari VM);
// (c) jalankan pipeline editorial dua fase (riset semua item, lalu
// verifikasi: sinyal judul identik + sinyal koroborasi klaim);
// (d) brief harian + tren.
// Asersi: raw items >= 3; klaim >= 1; evidence >= 1; verification
// records >= 1; draf >= 1 BILA ada item VERIFIED/CROSS-CHECKED —
// bila semua UNCONFIRMED karena hanya 1 sumber independen per judul,
// asersi draf DILEWATI dengan catatan jujur dan tetap LOLOS
// (salinan antar-penerbit dihitung SATU sumber, sesuai aturan
// verifikasi); brief hari ini -> 1 baris pf_daily_briefs; tren ->
// cetak topik + angka nyata.
// Fetch: coba fetch Node langsung dulu; bila egress VM memblokirnya,
// fallback ke fetchFn berbasis curl (curl memakai proxy env).
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = require("@electric-sql/pglite");

import { jalankanIngestion } from "../src/lib/ingestion/engine.ts";
import { polaPencarianInti } from "../src/lib/ai/research.ts";
import { tindaklanjutiKoreksi } from "../src/lib/admin/editorial.ts";
import {
  analisisTren,
  jalankanBriefHarian,
  jalankanPipelineEditorial,
} from "../src/lib/ai/pipeline.ts";
import { entriBriefDariDraf } from "../src/lib/ai/brief.ts";

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

// ---------- Adapter PGlite: ingestion (pola uji-ingestion.mjs) ----------
class AdapterPGliteIngestion {
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
function keIso(nilai) {
  if (!nilai) return null;
  const d = nilai instanceof Date ? nilai : new Date(nilai);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function keMetadata(nilai) {
  if (!nilai) return null;
  if (typeof nilai === "string") {
    try {
      return JSON.parse(nilai);
    } catch {
      return null;
    }
  }
  return nilai;
}

class AdapterPGliteAi {
  constructor(db) {
    this.db = db;
  }
  async ambilAntrean(limit) {
    const r = await this.db.query(
      `select r.id, r.sumber_id, coalesce(s.nama, 'Tidak diketahui') as sumber_nama,
              coalesce(s.prioritas, 0) as sumber_prioritas, r.url, r.judul,
              r.ringkasan, r.isi_ringkas, r.penulis, r.waktu_terbit_asli,
              r.waktu_diambil, r.status, r.disalin_dari_id, r.metadata
         from public.pf_raw_items r
         left join public.pf_sources s on s.id = r.sumber_id
        where r.status_verifikasi = 'UNCONFIRMED'
        order by coalesce(s.prioritas, 0) desc,
                 r.waktu_terbit_asli desc nulls last,
                 r.waktu_diambil desc
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
      metadata: keMetadata(b.metadata),
    }));
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
  async ambilItemSerupa(hashJudul, kecualiId) {
    const r = await this.db.query(
      `select id, sumber_id, url, judul, ringkasan, waktu_terbit_asli, disalin_dari_id
         from public.pf_raw_items
        where hash_judul = $1 and id <> $2 order by waktu_diambil asc`,
      [hashJudul, kecualiId],
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
    // Pola token (recall longgar — presisi dijamin verification.ts).
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
      [
        run.agen,
        run.input_ref ?? null,
        run.input_jenis ?? "raw_item",
        run.dipicu_oleh ?? "manual",
      ],
    );
    return r.rows[0].id;
  }
  async tutupRun(id, patch) {
    await this.db.query(
      `update public.pf_ai_runs set
         status = $2, error = $3, durasi_ms = $4, output_ref = $5,
         detail = $6, selesai_pada = now()
       where id = $1`,
      [
        id,
        patch.status,
        patch.error ?? null,
        patch.durasi_ms ?? null,
        patch.output_ref ?? null,
        JSON.stringify(patch.detail ?? {}),
      ],
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
  async simpanBukti(b) {
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
      [
        r.artikel_id ?? null,
        r.raw_item_id,
        r.keputusan,
        r.catatan ?? null,
        JSON.stringify(r.bukti ?? []),
      ],
    );
    return hasil.rows[0].id;
  }
  async simpanArtikel(d) {
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
        d.slug,
        d.judul,
        d.subjudul ?? null,
        d.ringkasan,
        d.isi,
        d.kategori_slug,
        d.status_verifikasi,
        d.penulis_nama,
        d.sumber_url,
        JSON.stringify(d.kronologi),
        JSON.stringify(d.fakta_penting),
        d.mengapa_penting ?? null,
        d.belum_diketahui ?? null,
        d.raw_item_id,
        Math.max(1, Math.ceil(kata / 200)),
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
  async ambilKlaimTanpaVerifikasi(limit) {
    const r = await this.db.query(
      `select c.id, c.teks, c.raw_item_id, c.artikel_id
         from public.pf_claims c
        where not exists (
          select 1 from public.pf_verification_records v
           where v.raw_item_id = c.raw_item_id or v.artikel_id = c.artikel_id
        )
        order by c.dibuat_pada asc limit $1`,
      [limit],
    );
    return r.rows.map((b) => ({
      id: b.id,
      teks: b.teks,
      raw_item_id: b.raw_item_id ?? null,
      artikel_id: b.artikel_id ?? null,
    }));
  }
  async simpanBrief(tanggal, isi) {
    const r = await this.db.query(
      `insert into public.pf_daily_briefs (tanggal, isi, status)
       values ($1, $2, 'draft')
       on conflict (tanggal) do update set isi = excluded.isi, status = 'draft'
       returning id`,
      [tanggal, JSON.stringify(isi)],
    );
    return r.rows[0].id;
  }
  async ambilBriefTerbaru() {
    const r = await this.db.query(
      `select id, tanggal, isi, status from public.pf_daily_briefs
        order by tanggal desc limit 1`,
    );
    const b = r.rows[0];
    if (!b) return null;
    return {
      id: b.id,
      tanggal: b.tanggal instanceof Date
        ? b.tanggal.toISOString().slice(0, 10)
        : String(b.tanggal).slice(0, 10),
      isi: b.isi,
      status: b.status,
    };
  }
  async ambilDrafArtikel(limit) {
    const r = await this.db.query(
      `select judul, ringkasan, kategori_slug, status_verifikasi, sumber_url, dibuat_pada
         from public.pf_articles where status = 'draft'
        order by dibuat_pada asc limit $1`,
      [limit],
    );
    return r.rows.map((d) => ({
      judul: d.judul,
      ringkasan: d.ringkasan,
      kategori_slug: d.kategori_slug,
      status_verifikasi: d.status_verifikasi,
      sumber_url: d.sumber_url,
      dibuat_pada: d.dibuat_pada instanceof Date
        ? d.dibuat_pada.toISOString()
        : String(d.dibuat_pada),
    }));
  }
}

// ---------- Util ----------
function bacaMigrasi(nama) {
  let sql = fs.readFileSync(`${DIR_MIGRASI}/${nama}`, "utf8");
  sql = sql.replace(/create extension[^;]+;/gi, "-- ekstensi dilepas (PGlite)");
  sql = sql.replace(/\bcitext\b/gi, "text");
  return sql;
}

function tanggalWibHariIni() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function hitung(db, sql, params = []) {
  const r = await db.query(sql, params);
  return Number(r.rows[0]?.n ?? 0);
}

// ---------- Adapter mock: tindak lanjut koreksi (F1/F2, remediasi Gel. 1) ----------
// Mock AdminAdapter in-memory — hanya method yang dipakai
// tindaklanjutiKoreksi. Mendukung status 'ditinjau' (status itu
// disimpan apa adanya di map, seperti perbaruiKoreksi adapter asli).
class AdapterMockKoreksi {
  constructor(koreksiAwal, artikelAda = true) {
    this.koreksi = new Map(koreksiAwal.map((k) => [k.id, { ...k }]));
    this.artikelAda = artikelAda;
    this.audit = [];
    this.versiDisimpan = 0;
    this.verifikasiDisimpan = [];
  }
  async getKoreksi({ id }) {
    const k = this.koreksi.get(id);
    return k ? { ...k } : null;
  }
  async perbaruiKoreksi({ id, status }) {
    const k = this.koreksi.get(id);
    if (!k) return null;
    k.status = status;
    return { ...k };
  }
  async catatAudit(input) {
    this.audit.push({ ...input });
  }
  async getArtikel({ id }) {
    if (!this.artikelAda) return null;
    return {
      id,
      slug: "artikel-uji",
      judul: "Artikel Uji",
      subjudul: null,
      ringkasan: "Ringkasan uji.",
      isi: "Isi artikel uji.",
      kategori_slug: "nasional",
      subkategori_slug: null,
      status_verifikasi: "VERIFIED",
      status: "terbit",
      penulis_nama: null,
      penulis_id: null,
      sumber_url: null,
      gambar_url: null,
      estimasi_baca_menit: 1,
      kronologi: null,
      fakta_penting: null,
      data_pendukung: null,
      mengapa_penting: null,
      dampak: null,
      belum_diketahui: null,
      dijadwalkan_pada: null,
      diterbitkan_pada: null,
      diterbitkan_oleh: null,
      dibuat_pada: new Date().toISOString(),
      diperbarui_pada: new Date().toISOString(),
    };
  }
  async getVersiTerakhir() {
    return null;
  }
  async simpanVersi() {
    this.versiDisimpan++;
    return {
      id: "v1", artikel_id: "a1", versi: 1, judul: null, isi: null,
      dibuat_oleh: null, dibuat_pada: new Date().toISOString(), catatan: null,
    };
  }
  async simpanVerification(input) {
    this.verifikasiDisimpan.push({ ...input });
    return {
      id: "ver1", artikel_id: input.artikel_id, raw_item_id: null,
      agen: input.agen, keputusan: input.keputusan, catatan: input.catatan,
      bukti: input.bukti ?? [], dibuat_oleh: input.dibuat_oleh,
      dibuat_pada: new Date().toISOString(),
    };
  }
  async ubahStatusVerifikasiArtikel({ id }) {
    return this.getArtikel({ id });
  }
}

function buatKoreksi(id, status, artikelId) {
  return {
    id,
    artikel_id: artikelId ?? null,
    pelapor_id: null,
    nama: "Pelapor Uji",
    email: null,
    pelapor_email: "uji@contoh.id",
    jenis: "fakta_salah",
    pesan: "Ada kesalahan fakta pada laporan ini.",
    status,
    nomor_lacak: "PF-12345678",
    tautan_artikel: null,
    dibuat_pada: new Date().toISOString(),
  };
}

const AKTOR_UJI = { id: "editor-uji", email: "editor@contoh.id", ip: null };

async function cekLempar(label, fn, polaPesan) {
  try {
    await fn();
    cek(label, false, "tidak melempar (seharusnya melempar)");
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    cek(label, pesan.includes(polaPesan), `pesan: "${pesan}"`);
  }
}

// ---------- Alur utama ----------
const db = new PGlite();
const adapterIng = new AdapterPGliteIngestion(db);
const adapterAi = new AdapterPGliteAi(db);

try {
  // (a) Stub auth + migrasi v1+v2+v3+v4.
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
    ["v4", "20261116_pf_v4_ai.sql"],
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

  // (a2) Tindak lanjut koreksi — mock adapter (F1/F2, remediasi Gel. 1).
  // Berjalan SEBELUM bagian live (RSS) agar asersi ini tetap diuji
  // walau fetch feed gagal. 10 kasus:
  console.log(`\n--- TINDAK LANJUT KOREKSI (mock adapter) ---`);
  {
    // 1. F2: terima laporan TANPA artikel_id -> 'ditinjau', BUKAN throw.
    const m1 = new AdapterMockKoreksi([buatKoreksi("k1", "baru", null)]);
    const h1 = await tindaklanjutiKoreksi(m1, { koreksi_id: "k1", aksi: "terima", catatan: "Laporan umum valid." }, AKTOR_UJI);
    cek("F2 terima tanpa artikel -> 'ditinjau' (bukan throw)", h1.status === "ditinjau", `status=${h1.status}`);
    cek("F2 tanpa artikel: tidak ada versi/verifikasi artikel dibuat", m1.versiDisimpan === 0 && m1.verifikasiDisimpan.length === 0);
    cek("F2 tanpa artikel: audit memakai aksi yang diizinkan CHECK v8", m1.audit[0]?.aksi === "koreksi.terima" && m1.audit[0]?.sesudah?.status === "ditinjau", `aksi=${m1.audit[0]?.aksi}, sesudah=${JSON.stringify(m1.audit[0]?.sesudah)}`);

    // 2. Terima DENGAN artikel -> 'diperbaiki' (perilaku lama tetap).
    const m2 = new AdapterMockKoreksi([buatKoreksi("k2", "baru", "a1")]);
    const h2 = await tindaklanjutiKoreksi(m2, { koreksi_id: "k2", aksi: "terima", catatan: "Fakta memang salah." }, AKTOR_UJI);
    cek("Terima dengan artikel -> 'diperbaiki'", h2.status === "diperbaiki", `status=${h2.status}`);
    cek("Terima dengan artikel: versi baru + verification CORRECTED", m2.versiDisimpan === 1 && m2.verifikasiDisimpan[0]?.keputusan === "CORRECTED");

    // 3. F1: tandai 'ditinjau' dari 'baru' -> 'ditinjau'.
    const m3 = new AdapterMockKoreksi([buatKoreksi("k3", "baru", "a1")]);
    const h3 = await tindaklanjutiKoreksi(m3, { koreksi_id: "k3", aksi: "ditinjau", catatan: "Sedang diperiksa redaksi." }, AKTOR_UJI);
    cek("F1 tandai ditinjau dari 'baru' -> 'ditinjau'", h3.status === "ditinjau", `status=${h3.status}`);
    cek("F1 tandai ditinjau: audit 'koreksi.terima' + sesudah.status 'ditinjau'", m3.audit[0]?.aksi === "koreksi.terima" && m3.audit[0]?.sesudah?.status === "ditinjau");

    // 4. F1: tandai 'ditinjau' dari 'ditinjau' -> error.
    const m4 = new AdapterMockKoreksi([buatKoreksi("k4", "ditinjau", "a1")]);
    await cekLempar("F1 tandai ditinjau dari 'ditinjau' -> error", () => tindaklanjutiKoreksi(m4, { koreksi_id: "k4", aksi: "ditinjau", catatan: "Sekali lagi." }, AKTOR_UJI), "sudah ditinjau");

    // 5. Terima dari 'ditinjau' (dengan artikel) -> boleh -> 'diperbaiki'.
    const m5 = new AdapterMockKoreksi([buatKoreksi("k5", "ditinjau", "a1")]);
    const h5 = await tindaklanjutiKoreksi(m5, { koreksi_id: "k5", aksi: "terima", catatan: "Selesai diperiksa, diterima." }, AKTOR_UJI);
    cek("Terima dari 'ditinjau' -> 'diperbaiki' (diizinkan)", h5.status === "diperbaiki", `status=${h5.status}`);

    // 6. Tolak dari 'ditinjau' -> boleh -> 'ditolak'.
    const m6 = new AdapterMockKoreksi([buatKoreksi("k6", "ditinjau", "a1")]);
    const h6 = await tindaklanjutiKoreksi(m6, { koreksi_id: "k6", aksi: "tolak", catatan: "Tidak terbukti." }, AKTOR_UJI);
    cek("Tolak dari 'ditinjau' -> 'ditolak' (diizinkan)", h6.status === "ditolak", `status=${h6.status}`);

    // 7. Terima/tolak dari terminal -> error.
    const m7a = new AdapterMockKoreksi([buatKoreksi("k7a", "diperbaiki", "a1")]);
    await cekLempar("Terima dari 'diperbaiki' (terminal) -> error", () => tindaklanjutiKoreksi(m7a, { koreksi_id: "k7a", aksi: "terima", catatan: "Lagi." }, AKTOR_UJI), "sudah ditindaklanjuti");
    const m7b = new AdapterMockKoreksi([buatKoreksi("k7b", "ditolak", "a1")]);
    await cekLempar("Tolak dari 'ditolak' (terminal) -> error", () => tindaklanjutiKoreksi(m7b, { koreksi_id: "k7b", aksi: "tolak", catatan: "Lagi." }, AKTOR_UJI), "sudah ditindaklanjuti");

    // 8. Tolak tanpa artikel -> 'ditolak' (sudah begitu sebelum perbaikan).
    const m8 = new AdapterMockKoreksi([buatKoreksi("k8", "baru", null)]);
    const h8 = await tindaklanjutiKoreksi(m8, { koreksi_id: "k8", aksi: "tolak", catatan: "Laporan tidak berdasar." }, AKTOR_UJI);
    cek("Tolak tanpa artikel -> 'ditolak'", h8.status === "ditolak", `status=${h8.status}`);

    // 9. Pesan error lama hanya bila artikel_id ADA tapi barisnya tak ada.
    const m9 = new AdapterMockKoreksi([buatKoreksi("k9", "baru", "a-hilang")], false);
    await cekLempar("Terima, artikel_id ada tapi artikel tak ditemukan -> error", () => tindaklanjutiKoreksi(m9, { koreksi_id: "k9", aksi: "terima", catatan: "Cek." }, AKTOR_UJI), "Artikel laporan koreksi tidak ditemukan.");
  }

  // (b) 3 sumber tier-1 dari pf_sources.
  const sumberRows = await db.query(
    `select id, nama, jenis, url, prioritas, aktif
       from public.pf_sources
      where nama in ('Antara — Terkini', 'CNN Indonesia', 'Liputan6 — Berita')
        and aktif = true
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
  console.log(`\nSumber tier-1 aktif: ${sumber.length}`);
  for (const s of sumber) console.log(`  - ${s.nama} (prioritas ${s.prioritas})`);
  cek("Jumlah sumber tier-1 = 3", sumber.length === 3, `dapat ${sumber.length}`);

  // (c) Metode fetch: probe langsung dulu, fallback curl.
  let fetchFnEngine;
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
    console.log(`\nMetode fetch: LANGSUNG (fetch Node berhasil)`);
  } catch (e) {
    fetchFnEngine = buatFetchCurl(15);
    console.log(
      `\nMetode fetch: CURL (fetch Node langsung gagal: ${e.message}; fallback ke curl via proxy env)`,
    );
  }

  // (d) Ingestion 3 feed tier-1.
  const mulaiIng = Date.now();
  const hasilIng = await jalankanIngestion(adapterIng, sumber, {
    dipicu_oleh: "manual",
    fetchFn: fetchFnEngine,
  });
  console.log(`\n--- INGESTION (${Date.now() - mulaiIng} ms) ---`);
  for (const h of hasilIng.perSumber) {
    console.log(
      `  ${h.sumber_nama}: ditemukan=${h.ditemukan} baru=${h.baru} duplikat=${h.duplikat} ditolak=${h.ditolak} gagal=${h.gagal}${h.error ? ` ERROR: ${h.error}` : ""}`,
    );
  }
  const t = hasilIng.total;
  console.log(
    `  TOTAL: ditemukan=${t.ditemukan} baru=${t.baru} duplikat=${t.duplikat} ditolak=${t.ditolak} gagal=${t.gagal}`,
  );
  const jumlahRaw = await hitung(db, `select count(*)::int as n from public.pf_raw_items`);
  cek("Raw items >= 3", jumlahRaw >= 3, `raw items=${jumlahRaw}`);
  cek(
    "Ingestion: tanpa sumber gagal total",
    hasilIng.perSumber.every((h) => h.gagal === 0),
    hasilIng.perSumber.filter((h) => h.gagal > 0).map((h) => `${h.sumber_nama}: ${h.error}`).join("; ") || "semua ok",
  );

  // (e) Cari item berjudul sama di >= 2 feed (upaya draf).
  // Diutamakan kelompok yang SEMUA itemnya 'baru' (disalin_dari_id null)
  // — kelompok seperti itu punya >= 2 sumber independen. Bila tidak
  // ada, pakai kelompok multi-feed mana pun (yang salinannya dihitung
  // SATU sumber dengan aslinya, jadi kemungkinan besar UNCONFIRMED/
  // DEVELOPING — dicatat jujur, bukan dipaksa jadi draf).
  const grupMulti = await db.query(
    `select hash_judul, count(distinct sumber_id)::int as n_sumber,
            count(*)::int as n_item,
            count(*) filter (where disalin_dari_id is null)::int as n_asli
       from public.pf_raw_items
      group by hash_judul having count(distinct sumber_id) > 1
      order by n_asli desc, n_item desc limit 5`,
  );
  let idMulti = null;
  let infoMulti = "";
  if (grupMulti.rows.length > 0) {
    const g = grupMulti.rows[0];
    const contoh = await db.query(
      `select id, judul from public.pf_raw_items
        where hash_judul = $1 order by waktu_diambil asc limit 1`,
      [g.hash_judul],
    );
    idMulti = contoh.rows[0].id;
    infoMulti = `judul "${contoh.rows[0].judul.slice(0, 70)}" | ${g.n_sumber} sumber, ${g.n_item} item, ${g.n_asli} asli (bukan salinan)`;
    console.log(`\nItem multi-feed untuk uji draf: ${infoMulti}`);
  } else {
    console.log("\nItem multi-feed: TIDAK ADA judul yang muncul di >= 2 feed.");
  }

  // (f) Pipeline editorial — limit 200 (seluruh item yang terambil)
  // agar batch menjangkau semua sumber. Koroborasi klaim butuh >= 2
  // sumber independen, jadi batch satu-sumber tidak akan pernah
  // menghasilkan draf; probe terpisah menunjukkan hanya ada 1 inti
  // klaim yang terkoroborasi lintas-sumber pada data hari ini
  // ("700 juta" — angka latar populasi ASEAN), jadi draf bisa jadi
  // tetap 0 dan itu dicatat jujur (bukan kegagalan).
  console.log(`\n--- PIPELINE EDITORIAL ---`);
  let hasilPipa = { diproses: 0, draf: 0, terverifikasi: 0, cross_checked: 0, developing: 0, unconfirmed: 0, dilewati: 0, gagal: 0 };
  if (idMulti) {
    const mulaiSatu = Date.now();
    const hSatu = await jalankanPipelineEditorial(adapterAi, {
      hanyaItemId: idMulti,
      dipicu_oleh: "manual",
      fetchFn: fetchFnEngine,
    });
    console.log(
      `  hanyaItemId (multi-feed, ${Date.now() - mulaiSatu} ms): ${JSON.stringify(hSatu)}`,
    );
    for (const k of Object.keys(hasilPipa)) hasilPipa[k] += hSatu[k];
  }
  const mulaiBanyak = Date.now();
  const hBanyak = await jalankanPipelineEditorial(adapterAi, {
    limit: 200,
    dipicu_oleh: "manual",
    fetchFn: fetchFnEngine,
  });
  console.log(
    `  limit 200 (${Date.now() - mulaiBanyak} ms): ${JSON.stringify(hBanyak)}`,
  );
  for (const k of Object.keys(hasilPipa)) hasilPipa[k] += hBanyak[k];
  console.log(`  TOTAL pipeline: ${JSON.stringify(hasilPipa)}`);

  // (g) Hitungan nyata tabel AI.
  const nKlaim = await hitung(db, `select count(*)::int as n from public.pf_claims`);
  const nEvidence = await hitung(db, `select count(*)::int as n from public.pf_evidence`);
  const nVerifikasi = await hitung(db, `select count(*)::int as n from public.pf_verification_records`);
  const nArtikel = await hitung(db, `select count(*)::int as n from public.pf_articles`);
  const nRun = await hitung(db, `select count(*)::int as n from public.pf_ai_runs`);
  console.log(`\nHitungan tabel AI: klaim=${nKlaim} evidence=${nEvidence} verification_records=${nVerifikasi} artikel_draf=${nArtikel} ai_runs=${nRun}`);
  const perKeputusan = await db.query(
    `select keputusan, count(*)::int as n from public.pf_verification_records group by keputusan order by 1`,
  );
  console.log("Verification records per keputusan:");
  for (const r of perKeputusan.rows) console.log(`  ${r.keputusan}: ${r.n}`);
  const korob = await db.query(
    `select count(*)::int as n from public.pf_verification_records
      where jsonb_array_length(bukti->'koroborasi_klaim'->'inti_cocok') > 0`,
  );
  console.log(
    `Verification records dengan koroborasi klaim (inti cocok): ${korob.rows[0].n}`,
  );
  const contohKorob = await db.query(
    `select raw_item_id, keputusan,
            bukti->'koroborasi_klaim'->>'inti_cocok' as inti,
            bukti->'koroborasi_klaim'->>'sumber_independen' as n_sumber
       from public.pf_verification_records
      where jsonb_array_length(bukti->'koroborasi_klaim'->'inti_cocok') > 0
      order by dibuat_pada asc limit 3`,
  );
  for (const r of contohKorob.rows) {
    console.log(
      `  koroborasi: ${r.keputusan} | inti=${r.inti} | sumber=${r.n_sumber}`,
    );
  }
  const perRun = await db.query(
    `select agen, status, count(*)::int as n from public.pf_ai_runs group by agen, status order by 1, 2`,
  );
  console.log("pf_ai_runs per agen/status:");
  for (const r of perRun.rows) console.log(`  ${r.agen}/${r.status}: ${r.n}`);

  cek("Klaim >= 1", nKlaim >= 1, `klaim=${nKlaim}`);
  cek("Evidence >= 1", nEvidence >= 1, `evidence=${nEvidence}`);
  cek("Verification records >= 1", nVerifikasi >= 1, `verification=${nVerifikasi}`);
  cek("Pipeline memproses >= 1 item", hasilPipa.diproses >= 1, `diproses=${hasilPipa.diproses}`);
  const adaTerverifikasi = hasilPipa.terverifikasi + hasilPipa.cross_checked > 0;
  if (adaTerverifikasi) {
    cek("Draf artikel >= 1 (ada item VERIFIED/CROSS-CHECKED)", nArtikel >= 1, `draf=${nArtikel}`);
  } else {
    // Sesuai aturan tugas: bila semua UNCONFIRMED karena hanya 1 sumber
    // independen per judul, asersi draf DILEWATI dengan catatan jujur.
    console.log(
      `CATATAN JUJUR: draf DILEWATI — tidak ada item VERIFIED/CROSS-CHECKED ` +
        `(terverifikasi=${hasilPipa.terverifikasi}, cross_checked=${hasilPipa.cross_checked}, ` +
        `developing=${hasilPipa.developing}, unconfirmed=${hasilPipa.unconfirmed}). ` +
        `Judul yang sama antar-penerbit dihitung SATU sumber independen ` +
        `(aturan rantai disalin_dari), jadi bukti tidak cukup untuk draf. ` +
        `Ini BUKAN kegagalan — pipeline bekerja sesuai aturan.`,
    );
  }

  // Contoh draf (bila ada): cetak judul + kategori + status.
  if (nArtikel > 0) {
    const draf = await db.query(
      `select slug, judul, kategori_slug, status_verifikasi, length(isi) as pjg_isi
         from public.pf_articles order by dibuat_pada asc limit 3`,
    );
    console.log("Contoh draf tersimpan:");
    for (const d of draf.rows) {
      console.log(`  - [${d.kategori_slug}/${d.status_verifikasi}] ${d.judul.slice(0, 80)} (slug=${d.slug}, isi=${d.pjg_isi} karakter)`);
    }
  }

  // (h) Daily Brief — entri dari draf terverifikasi (bila ada) +
  // pelengkap UNCONFIRMED jujur dari antrean (di dalam pipeline).
  console.log(`\n--- DAILY BRIEF ---`);
  // Entri brief dari draf artikel lewat adapter (maks 10); bila tidak
  // ada draf, jalankanBriefHarian mengisi dari antrean (UNCONFIRMED,
  // berlabel jujur). Di sini entri sengaja dilewatkan eksplisit agar
  // jalur "entri disediakan pemanggil" ikut teruji; jalur "entri dari
  // draf otomatis" teruji di uji-sintetis terpisah.
  const drafBrief = await adapterAi.ambilDrafArtikel(10);
  const entriBrief = drafBrief.map((d) => entriBriefDariDraf(d));
  const tanggalBrief = tanggalWibHariIni();
  const hasilBrief = await jalankanBriefHarian(adapterAi, {
    tanggal: tanggalBrief,
    dipicu_oleh: "manual",
    entri: entriBrief,
  });
  console.log(`  brief ${JSON.stringify(hasilBrief)}`);
  const nBrief = await hitung(
    db,
    `select count(*)::int as n from public.pf_daily_briefs where tanggal = $1`,
    [tanggalBrief],
  );
  cek("Brief hari ini = 1 baris pf_daily_briefs", nBrief === 1, `tanggal=${tanggalBrief}, baris=${nBrief}`);
  const briefTersimpan = await adapterAi.ambilBriefTerbaru();
  if (briefTersimpan) {
    const isi = briefTersimpan.isi;
    const seksi = isi?.seksi ?? {};
    const jumlahPerSeksi = Object.fromEntries(
      Object.entries(seksi).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
    );
    console.log(
      `  isi brief: status=${briefTersimpan.status}, entri per seksi=${JSON.stringify(jumlahPerSeksi)}, isu_berkembang=${(isi?.isu_berkembang ?? []).length}`,
    );
  }

  // (i) Tren — angka nyata.
  console.log(`\n--- TREN (7 hari terakhir) ---`);
  const tren = await analisisTren(adapterAi, { jam: 168 });
  for (const tTop of tren.slice(0, 5)) {
    console.log(
      `  "${tTop.topik}": 24j=${tTop.jumlah_24j} 7h=${tTop.jumlah_7h} sumber_independen=${tTop.sumber_independen} berkembang=${tTop.berkembang} | terbaru: ${tTop.item_terbaru.judul.slice(0, 60)}`,
    );
  }
  cek("Tren: ada topik dengan angka nyata", tren.length > 0, `topik=${tren.length}`);
} catch (e) {
  console.log(`\nGAGAL FATAL: ${e instanceof Error ? e.message : String(e)}`);
  gagal++;
} finally {
  await db.close();
}

console.log(gagal === 0 ? "\nHASIL: SEMUA LOLOS" : `\nHASIL: ${gagal} KEGAGALAN`);
process.exit(gagal === 0 ? 0 : 1);
