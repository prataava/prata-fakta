// Uji end-to-end editorial Fase 5 PRATA FAKTA -> PGlite.
// BUKAN data dummy operasional: skenario memakai draf artikel +
// catatan verifikasi berbentuk hasil pipeline Fase 4 (VERIFIED /
// UNCONFIRMED), klaim + evidence, dan laporan koreksi pembaca.
// Langkah: (a) PGlite + stub auth + migrasi v1+v2+v3+v4+v5 (v5 2x);
// (b) adapter PGlite yang mengimplementasikan AdminAdapter
// (src/lib/admin/types.ts) dengan SQL langsung — aturan bisnis
// yang diuji adalah src/lib/admin/editorial.ts yang sama dipakai
// route /api/admin/*; (c) alur: gate terbit menolak UNCONFIRMED
// & tanpa verifikasi -> review setuju -> terbit -> tampil sebagai
// artikel terbit -> review tolak -> tetap draft -> ubah status
// verifikasi -> terbit -> koreksi terima -> versi baru + CORRECTED
// + tanggal koreksi -> koreksi tolak -> jadwalkan + terbitkan
// terjadwal -> batalkan -> hapus (draft boleh, terbit ditolak)
// -> peran + nonaktif pengguna -> job -> brief terbit ->
// audit log terisi semua aksi + ringkasan.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = require("@electric-sql/pglite");

import {
  GalatGateTerbit,
  aturPeranPengguna,
  batalkanPublikasi,
  buatArtikel,
  buatKategori,
  hapusArtikel,
  hapusKategori,
  jadwalkanArtikel,
  perbaruiArtikel,
  perbaruiJob,
  putuskanReview,
  setNonaktifPengguna,
  terbitkanArtikel,
  terbitkanBrief,
  terbitkanTerjadwal,
  tindaklanjutiKoreksi,
  ubahStatusVerifikasi,
} from "../src/lib/admin/editorial.ts";

const DIR_MIGRASI = new URL("../supabase/migrations/", import.meta.url).pathname;

let gagal = 0;
function cek(label, kondisi, detail = "") {
  if (kondisi) {
    console.log(`OK: ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    console.log(`GAGAL: ${label}${detail ? ` — ${detail}` : ""}`);
    gagal++;
  }
}

function baca(nama) {
  let sql = fs.readFileSync(`${DIR_MIGRASI}/${nama}`, "utf8");
  sql = sql.replace(/create extension[^;]+;/gi, "-- ekstensi dilepas (PGlite)");
  sql = sql.replace(/\bcitext\b/gi, "text");
  return sql;
}

// ---------- Adapter PGlite: AdminAdapter via SQL langsung ----------
const KOLOM_ARTIKEL =
  "id, slug, judul, subjudul, ringkasan, isi, kategori_slug, subkategori_slug, " +
  "status_verifikasi, status, penulis_nama, penulis_id, sumber_url, gambar_url, " +
  "estimasi_baca_menit, kronologi, fakta_penting, data_pendukung, mengapa_penting, " +
  "dampak, belum_diketahui, dijadwalkan_pada, diterbitkan_pada, diterbitkan_oleh, " +
  "dibuat_pada, diperbarui_pada";

function barisArtikel(r) {
  if (!r) return null;
  return { ...r };
}

const KOLOM_ARTIKEL_SET = new Set([
  "slug", "judul", "subjudul", "ringkasan", "isi", "kategori_slug",
  "subkategori_slug", "status_verifikasi", "status", "penulis_nama",
  "penulis_id", "sumber_url", "gambar_url", "estimasi_baca_menit",
  "kronologi", "fakta_penting", "data_pendukung", "mengapa_penting",
  "dampak", "belum_diketahui", "dijadwalkan_pada", "diterbitkan_pada",
  "diterbitkan_oleh",
]);

function nilaiJson(v) {
  return v === undefined ? "[]" : JSON.stringify(v ?? []);
}

class AdapterPGliteAdmin {
  constructor(db) {
    this.db = db;
  }

  async getArtikel({ id }) {
    const r = await this.db.query(
      `select ${KOLOM_ARTIKEL} from public.pf_articles where id = $1`,
      [id],
    );
    return barisArtikel(r.rows[0] ?? null);
  }

  async getArtikelBySlug({ slug }) {
    const r = await this.db.query(
      `select ${KOLOM_ARTIKEL} from public.pf_articles where slug = $1`,
      [slug],
    );
    return barisArtikel(r.rows[0] ?? null);
  }

  async listArtikel(filter) {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const dari = (page - 1) * limit;
    const syarat = [];
    const param = [];
    if (filter.status) {
      param.push(filter.status);
      syarat.push(`status = $${param.length}`);
    }
    if (filter.kategori) {
      param.push(filter.kategori);
      syarat.push(`kategori_slug = $${param.length}`);
    }
    if (filter.q) {
      const pola = `%${String(filter.q).replace(/[%_\\]/g, "\\$&")}%`;
      param.push(pola);
      syarat.push(`(judul ilike $${param.length} or ringkasan ilike $${param.length})`);
    }
    const where = syarat.length ? `where ${syarat.join(" and ")}` : "";
    const total = await this.db.query(
      `select count(*)::int as n from public.pf_articles ${where}`,
      param,
    );
    const data = await this.db.query(
      `select ${KOLOM_ARTIKEL} from public.pf_articles ${where} ` +
        `order by dibuat_pada desc limit $${param.length + 1} offset $${param.length + 2}`,
      [...param, limit, dari],
    );
    return {
      artikel: data.rows.map(barisArtikel),
      total: total.rows[0].n,
      page,
      limit,
    };
  }

  async buatArtikel(input) {
    const r = await this.db.query(
      `insert into public.pf_articles
         (slug, judul, subjudul, ringkasan, isi, kategori_slug, subkategori_slug,
          status, status_verifikasi, penulis_nama, penulis_id, sumber_url, gambar_url,
          estimasi_baca_menit, kronologi, fakta_penting, data_pendukung,
          mengapa_penting, dampak, belum_diketahui)
       values ($1,$2,$3,$4,$5,$6,$7,'draft','UNCONFIRMED',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       returning ${KOLOM_ARTIKEL}`,
      [
        input.slug, input.judul, input.subjudul ?? null, input.ringkasan,
        input.isi, input.kategori_slug, input.subkategori_slug ?? null,
        input.penulis_nama ?? null, input.penulis_id ?? null,
        input.sumber_url ?? null, input.gambar_url ?? null,
        input.estimasi_baca_menit ?? null, nilaiJson(input.kronologi),
        nilaiJson(input.fakta_penting), nilaiJson(input.data_pendukung),
        input.mengapa_penting ?? null, input.dampak ?? null,
        input.belum_diketahui ?? null,
      ],
    );
    return barisArtikel(r.rows[0]);
  }

  async perbaruiArtikel({ id, patch }) {
    const { catatan_versi: _c, ...kolom } = patch;
    void _c;
    const entri = Object.entries(kolom).filter(([k]) =>
      KOLOM_ARTIKEL_SET.has(k),
    );
    if (entri.length === 0) return this.getArtikel({ id });
    const set = entri
      .map(([k], i) => `${k} = $${i + 1}`)
      .join(", ");
    // Nilai jsonb dikirim sebagai string JSON; kolom lain apa adanya.
    const param = entri.map(([k, v]) =>
      k === "kronologi" || k === "fakta_penting" || k === "data_pendukung"
        ? JSON.stringify(v ?? [])
        : v,
    );
    const r = await this.db.query(
      `update public.pf_articles set ${set} where id = $${entri.length + 1} returning ${KOLOM_ARTIKEL}`,
      [...param, id],
    );
    return barisArtikel(r.rows[0] ?? null);
  }

  async hapusArtikel({ id }) {
    await this.db.query(`delete from public.pf_articles where id = $1`, [id]);
  }

  async getVerifikasiTerakhir({ artikel_id }) {
    const r = await this.db.query(
      `select id,artikel_id,raw_item_id,agen,keputusan,catatan,bukti,dibuat_oleh,dibuat_pada
       from public.pf_verification_records where artikel_id = $1
       order by dibuat_pada desc limit 1`,
      [artikel_id],
    );
    return r.rows[0] ?? null;
  }

  async simpanReview(input) {
    const r = await this.db.query(
      `insert into public.pf_editorial_reviews (artikel_id, reviewer_id, keputusan, catatan)
       values ($1,$2,$3,$4)
       returning id,artikel_id,reviewer_id,keputusan,catatan,dibuat_pada`,
      [input.artikel_id, input.reviewer_id, input.keputusan, input.catatan],
    );
    return r.rows[0];
  }

  async getReviewTerakhir({ artikel_id }) {
    const r = await this.db.query(
      `select id,artikel_id,reviewer_id,keputusan,catatan,dibuat_pada
       from public.pf_editorial_reviews where artikel_id = $1
       order by dibuat_pada desc limit 1`,
      [artikel_id],
    );
    return r.rows[0] ?? null;
  }

  async simpanVerification(input) {
    const r = await this.db.query(
      `insert into public.pf_verification_records
         (artikel_id, raw_item_id, agen, keputusan, catatan, bukti, dibuat_oleh)
       values ($1,$2,$3,$4,$5,$6,$7)
       returning id,artikel_id,raw_item_id,agen,keputusan,catatan,bukti,dibuat_oleh,dibuat_pada`,
      [
        input.artikel_id ?? null, input.raw_item_id ?? null, input.agen,
        input.keputusan, input.catatan ?? null,
        JSON.stringify(input.bukti ?? []), input.dibuat_oleh ?? null,
      ],
    );
    return r.rows[0];
  }

  async ubahStatusVerifikasiArtikel({ id, keputusan }) {
    const r = await this.db.query(
      `update public.pf_articles set status_verifikasi = $1 where id = $2 returning ${KOLOM_ARTIKEL}`,
      [keputusan, id],
    );
    return barisArtikel(r.rows[0] ?? null);
  }

  async simpanVersi(input) {
    const r = await this.db.query(
      `insert into public.pf_article_versions (artikel_id, versi, judul, isi, dibuat_oleh, catatan)
       values ($1,$2,$3,$4,$5,$6)
       returning id,artikel_id,versi,judul,isi,dibuat_oleh,dibuat_pada,catatan`,
      [
        input.artikel_id, input.versi, input.judul, input.isi,
        input.dibuat_oleh, input.catatan,
      ],
    );
    return r.rows[0];
  }

  async getVersiTerakhir({ artikel_id }) {
    const r = await this.db.query(
      `select id,artikel_id,versi,judul,isi,dibuat_oleh,dibuat_pada,catatan
       from public.pf_article_versions where artikel_id = $1
       order by versi desc limit 1`,
      [artikel_id],
    );
    return r.rows[0] ?? null;
  }

  async catatAudit(input) {
    await this.db.query(
      `insert into public.pf_audit_logs
         (aktor_id, aktor_email, aksi, entitas, entitas_id, sebelum, sesudah, ip)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        input.aktor_id ?? null, input.aktor_email ?? null, input.aksi,
        input.entitas, input.entitas_id ?? null,
        JSON.stringify(input.sebelum ?? null),
        JSON.stringify(input.sesudah ?? null), input.ip ?? null,
      ],
    );
  }

  async getKoreksi({ id }) {
    const r = await this.db.query(
      `select id,artikel_id,pelapor_id,nama,email,jenis,pesan,status,dibuat_pada
       from public.pf_correction_reports where id = $1`,
      [id],
    );
    return r.rows[0] ?? null;
  }

  async listKoreksi({ status } = {}) {
    const r = status
      ? await this.db.query(
          `select id,artikel_id,pelapor_id,nama,email,jenis,pesan,status,dibuat_pada
           from public.pf_correction_reports where status = $1 order by dibuat_pada desc`,
          [status],
        )
      : await this.db.query(
          `select id,artikel_id,pelapor_id,nama,email,jenis,pesan,status,dibuat_pada
           from public.pf_correction_reports order by dibuat_pada desc`,
        );
    return r.rows;
  }

  async perbaruiKoreksi({ id, status }) {
    const r = await this.db.query(
      `update public.pf_correction_reports set status = $1 where id = $2
       returning id,artikel_id,pelapor_id,nama,email,jenis,pesan,status,dibuat_pada`,
      [status, id],
    );
    return r.rows[0] ?? null;
  }

  async getPengguna({ id }) {
    const r = await this.db.query(
      `select u.id, u.email, p.nama_tampilan, p.nonaktif, p.dibuat_pada
       from auth.users u left join public.pf_profiles p on p.id = u.id
       where u.id = $1`,
      [id],
    );
    if (!r.rows[0]) return null;
    const peran = await this.db.query(
      `select r.nama from public.pf_user_roles ur
       join public.pf_roles r on r.id = ur.role_id where ur.user_id = $1`,
      [id],
    );
    return {
      id: r.rows[0].id,
      email: r.rows[0].email ?? null,
      email_tidak_tersedia: false,
      nama_tampilan: r.rows[0].nama_tampilan ?? null,
      nonaktif: r.rows[0].nonaktif ?? false,
      roles: peran.rows.map((x) => x.nama),
      dibuat_pada: r.rows[0].dibuat_pada ?? null,
    };
  }

  async listPengguna() {
    const r = await this.db.query(
      `select u.id, u.email, p.nama_tampilan, p.nonaktif, p.dibuat_pada
       from auth.users u left join public.pf_profiles p on p.id = u.id
       order by u.email`,
    );
    const hasil = [];
    for (const row of r.rows) {
      const peran = await this.db.query(
        `select r.nama from public.pf_user_roles ur
         join public.pf_roles r on r.id = ur.role_id where ur.user_id = $1`,
        [row.id],
      );
      hasil.push({
        id: row.id,
        email: row.email ?? null,
        email_tidak_tersedia: false,
        nama_tampilan: row.nama_tampilan ?? null,
        nonaktif: row.nonaktif ?? false,
        roles: peran.rows.map((x) => x.nama),
        dibuat_pada: row.dibuat_pada ?? null,
      });
    }
    return hasil;
  }

  async setPeranPengguna({ id, roles }) {
    await this.db.query(
      `delete from public.pf_user_roles where user_id = $1`,
      [id],
    );
    for (const nama of roles) {
      await this.db.query(
        `insert into public.pf_user_roles (user_id, role_id)
         select $1, id from public.pf_roles where nama = $2`,
        [id, nama],
      );
    }
  }

  async setNonaktif({ id, nonaktif }) {
    await this.db.query(
      `update public.pf_profiles set nonaktif = $1 where id = $2`,
      [nonaktif, id],
    );
  }

  async getJob({ nama }) {
    const r = await this.db.query(
      `select id,nama,jadwal_cron,deskripsi,aktif,terakhir_jalan,status_terakhir,error_terakhir,diperbarui_pada
       from public.pf_scheduled_jobs where nama = $1`,
      [nama],
    );
    return r.rows[0] ?? null;
  }

  async listJobs() {
    const r = await this.db.query(
      `select id,nama,jadwal_cron,deskripsi,aktif,terakhir_jalan,status_terakhir,error_terakhir,diperbarui_pada
       from public.pf_scheduled_jobs order by nama`,
    );
    return r.rows;
  }

  async perbaruiJob({ nama, patch }) {
    const entri = Object.entries(patch).filter(
      ([k]) =>
        ["jadwal_cron", "aktif", "terakhir_jalan", "status_terakhir", "error_terakhir"].includes(k),
    );
    if (entri.length === 0) return this.getJob({ nama });
    const set = entri.map(([k], i) => `${k} = $${i + 1}`).join(", ");
    const r = await this.db.query(
      `update public.pf_scheduled_jobs set ${set} where nama = $${entri.length + 1}
       returning id,nama,jadwal_cron,deskripsi,aktif,terakhir_jalan,status_terakhir,error_terakhir,diperbarui_pada`,
      [...entri.map(([, v]) => v), nama],
    );
    return r.rows[0] ?? null;
  }

  async listKategori() {
    const r = await this.db.query(
      `select id,slug,nama,deskripsi,induk_id,urutan,aktif,dibuat_pada
       from public.pf_categories order by urutan, nama`,
    );
    return r.rows;
  }

  async buatKategori(input) {
    const r = await this.db.query(
      `insert into public.pf_categories (slug, nama, deskripsi, induk_id, urutan, aktif)
       values ($1,$2,$3,$4,$5,$6)
       returning id,slug,nama,deskripsi,induk_id,urutan,aktif,dibuat_pada`,
      [
        input.slug, input.nama, input.deskripsi ?? null,
        input.induk_id ?? null, input.urutan ?? 0, input.aktif ?? true,
      ],
    );
    return r.rows[0];
  }

  async perbaruiKategori({ id, patch }) {
    const entri = Object.entries(patch).filter(([k]) =>
      ["nama", "deskripsi", "induk_id", "urutan", "aktif"].includes(k),
    );
    if (entri.length === 0) {
      const r = await this.db.query(
        `select id,slug,nama,deskripsi,induk_id,urutan,aktif,dibuat_pada
         from public.pf_categories where id = $1`,
        [id],
      );
      return r.rows[0] ?? null;
    }
    const set = entri.map(([k], i) => `${k} = $${i + 1}`).join(", ");
    const r = await this.db.query(
      `update public.pf_categories set ${set} where id = $${entri.length + 1}
       returning id,slug,nama,deskripsi,induk_id,urutan,aktif,dibuat_pada`,
      [...entri.map(([, v]) => v), id],
    );
    return r.rows[0] ?? null;
  }

  async hapusKategori({ id }) {
    await this.db.query(`delete from public.pf_categories where id = $1`, [id]);
  }

  async terbitkanBrief({ id }) {
    const r = await this.db.query(
      `update public.pf_daily_briefs set status = 'terbit', diterbitkan_pada = now()
       where id = $1 returning id,tanggal,isi,status,dibuat_pada,diterbitkan_pada`,
      [id],
    );
    return r.rows[0] ?? null;
  }

  async listBrief() {
    const r = await this.db.query(
      `select id,tanggal,isi,status,dibuat_pada,diterbitkan_pada
       from public.pf_daily_briefs order by tanggal desc`,
    );
    return r.rows;
  }

  async listAudit(filter) {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const dari = (page - 1) * limit;
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
    const total = await this.db.query(
      `select count(*)::int as n from public.pf_audit_logs ${where}`,
      param,
    );
    const data = await this.db.query(
      `select id,aktor_id,aktor_email,aksi,entitas,entitas_id,sebelum,sesudah,ip,dibuat_pada
       from public.pf_audit_logs ${where} order by dibuat_pada desc
       limit $${param.length + 1} offset $${param.length + 2}`,
      [...param, limit, dari],
    );
    return { log: data.rows, total: total.rows[0].n, page, limit };
  }

  async hitungRingkasan() {
    const q = async (sql) =>
      (await this.db.query(sql)).rows[0].n;
    const total = await q(`select count(*)::int as n from public.pf_articles`);
    const terbit = await q(
      `select count(*)::int as n from public.pf_articles where status = 'terbit'`,
    );
    const draft = await q(
      `select count(*)::int as n from public.pf_articles where status = 'draft'`,
    );
    const terjadwal = await q(
      `select count(*)::int as n from public.pf_articles where status = 'terjadwal'`,
    );
    const belum = await q(
      `select count(*)::int as n from public.pf_articles where status_verifikasi = 'UNCONFIRMED'`,
    );
    const dikoreksi = await q(
      `select count(*)::int as n from public.pf_articles where status_verifikasi = 'CORRECTED'`,
    );
    const kat = await this.db.query(
      `select kategori_slug, count(*)::int as jumlah from public.pf_articles
       group by kategori_slug order by jumlah desc`,
    );
    return {
      total_artikel: total,
      terbit,
      draft,
      terjadwal,
      antrean_verifikasi: draft,
      belum_terkonfirmasi: belum,
      dikoreksi,
      per_kategori: kat.rows,
    };
  }

  async hitungSumber() {
    const total = (
      await this.db.query(`select count(*)::int as n from public.pf_sources`)
    ).rows[0].n;
    const aktif = (
      await this.db.query(
        `select count(*)::int as n from public.pf_sources where aktif = true`,
      )
    ).rows[0].n;
    return { total, aktif };
  }

  async listAiRuns({ limit }) {
    const r = await this.db.query(
      `select id,agen,input_ref,input_jenis,output_ref,status,error,durasi_ms,detail,dipicu_oleh,dimulai_pada,selesai_pada
       from public.pf_ai_runs order by dimulai_pada desc limit $1`,
      [Math.min(500, Math.max(1, limit))],
    );
    return r.rows;
  }

  async runIngestionTerakhir({ limit }) {
    const r = await this.db.query(
      `select id,sumber_id,sumber_nama,dimulai_pada,selesai_pada,status,ditemukan,baru,duplikat,ditolak,gagal,error,dipicu_oleh
       from public.pf_ingestion_runs order by dimulai_pada desc limit $1`,
      [Math.min(50, Math.max(1, limit))],
    );
    return r.rows;
  }

  async runAiGagalTerakhir({ limit }) {
    const r = await this.db.query(
      `select id,agen,input_ref,input_jenis,output_ref,status,error,durasi_ms,detail,dipicu_oleh,dimulai_pada,selesai_pada
       from public.pf_ai_runs where status = 'gagal' order by dimulai_pada desc limit $1`,
      [Math.min(50, Math.max(1, limit))],
    );
    return r.rows;
  }

  async cekSupabaseSehat() {
    // Di PGlite tidak ada Supabase untuk dicek — jawab jujur tidak ok.
    return { ok: false, ms: 0 };
  }
}

// ---------- Alur utama ----------
const db = new PGlite();
const adapter = new AdapterPGliteAdmin(db);

const EDITOR = "22222222-2222-2222-2222-222222222222";
const FACT = "33333333-3333-3333-3333-333333333333";
const ADMIN = "44444444-4444-4444-4444-444444444444";
const WRITER = "55555555-5555-5555-5555-555555555555";

async function hitungAudit(aksi) {
  const r = await db.query(
    `select count(*)::int as n from public.pf_audit_logs where aksi = $1`,
    [aksi],
  );
  return r.rows[0].n;
}

async function jumlahVersi(artikelId) {
  const r = await db.query(
    `select count(*)::int as n from public.pf_article_versions where artikel_id = $1`,
    [artikelId],
  );
  return r.rows[0].n;
}

const aktorEditor = { id: EDITOR, email: "editor@prata.test", ip: "127.0.0.1" };
const aktorFact = { id: FACT, email: "fact@prata.test", ip: "127.0.0.1" };
const aktorAdmin = { id: ADMIN, email: "admin@prata.test", ip: "127.0.0.1" };

// (a) Stub auth + migrasi v1->v5 (v5 2x).
await db.exec(`create schema if not exists auth;`);
await db.exec(`create schema if not exists extensions;`);
await db.exec(`create table auth.users (id uuid primary key, email text);`);
await db.exec(
  `create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`,
);
let ok = true;
for (const [label, nama] of [
  ["v1", "20261116_pf_v1_foundation.sql"],
  ["v2", "20261116_pf_v2_articles.sql"],
  ["v3", "20261116_pf_v3_ingestion.sql"],
  ["v4", "20261116_pf_v4_ai.sql"],
  ["v5 putaran 1", "20261116_pf_v5_editorial.sql"],
  ["v5 putaran 2 (idempotensi)", "20261116_pf_v5_editorial.sql"],
]) {
  try {
    await db.exec(baca(nama));
    console.log(`OK: migrasi ${label}`);
  } catch (e) {
    console.log(`GAGAL: migrasi ${label}\n  -> ${String(e.message).split("\n")[0]}`);
    gagal++;
    ok = false;
    break;
  }
}

if (ok) {
  const tabel = await db.query(
    `select tablename from pg_tables where schemaname='public' and tablename like 'pf_%'`,
  );
  cek("26 tabel pf_*", tabel.rows.length === 26, `${tabel.rows.length} tabel`);
  const pol = await db.query(
    `select count(*)::int as n from pg_policies where schemaname='public' and tablename like 'pf_%'`,
  );
  cek("62 policy pf_*", pol.rows[0].n === 62, `${pol.rows[0].n} policy`);
  const jobs = await db.query(
    `select count(*)::int as n from public.pf_scheduled_jobs`,
  );
  cek("seed 3 job terjadwal", jobs.rows[0].n === 3, `${jobs.rows[0].n} job`);

  // (b) Seed pengguna staf + kategori + sumber.
  for (const [id, email, nama] of [
    [EDITOR, "editor@prata.test", "Editor Uji"],
    [FACT, "fact@prata.test", "Fact Checker Uji"],
    [ADMIN, "admin@prata.test", "Admin Uji"],
    [WRITER, "writer@prata.test", "Writer Uji"],
  ]) {
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
    // Trigger v1 pf_handle_new_user() sudah membuat pf_profiles +
    // peran 'user' otomatis saat insert auth.users — tinggal
    // perbarui nama tampilannya, jangan insert lagi (bentrok PK).
    await db.query(
      `update public.pf_profiles set nama_tampilan = $2 where id = $1`,
      [id, nama],
    );
  }
  const peran = async (userId, role) => {
    await db.query(
      `insert into public.pf_user_roles (user_id, role_id)
       select $1, id from public.pf_roles where nama = $2`,
      [userId, role],
    );
  };
  await peran(EDITOR, "editor");
  await peran(FACT, "fact_checker");
  await peran(ADMIN, "super_admin");
  await peran(WRITER, "writer");
  const kat = await db.query(
    `select slug from public.pf_categories where induk_id is null order by urutan limit 1`,
  );
  const KATEGORI = kat.rows[0].slug;
  const sumber = await db.query(
    `select id from public.pf_sources order by prioritas desc limit 1`,
  );
  cek("seed 4 pengguna staf + kategori + sumber", true, `kategori=${KATEGORI}, sumber=${sumber.rows[0].id}`);

  const draf = async (judul, verifikasi) => {
    const a = await buatArtikel(
      adapter,
      {
        judul,
        slug: "",
        ringkasan: `Ringkasan ${judul}.`,
        isi: `Isi artikel ${judul}. Paragraf pertama.\n\nParagraf kedua.`,
        kategori_slug: KATEGORI,
        penulis_nama: "Editor Uji",
        penulis_id: EDITOR,
        sumber_url: "https://example.com/sumber-uji",
      },
      aktorEditor,
    );
    if (verifikasi) {
      await adapter.simpanVerification({
        artikel_id: a.id,
        agen: "fact_verification",
        keputusan: verifikasi,
        catatan: "Verifikasi hasil pipeline Fase 4.",
        bukti: [{ url: "https://example.com/sumber-uji", arah: "mendukung" }],
        dibuat_oleh: null,
      });
      await adapter.ubahStatusVerifikasiArtikel({
        id: a.id,
        keputusan: verifikasi,
      });
    }
    return a;
  };

  // (c) Tiga draf: A VERIFIED (+klaim/evidence), B UNCONFIRMED, C tanpa verifikasi.
  const A = await draf("Draf Uji Terbit Fase 5", "VERIFIED");
  const klaim = await db.query(
    `insert into public.pf_claims (artikel_id, teks, jenis, status)
     values ($1, $2, 'angka', 'terverifikasi') returning id`,
    [A.id, "Pemerintah mengalokasikan Rp 700 miliar untuk program ini."],
  );
  await db.query(
    `insert into public.pf_evidence (klaim_id, sumber_url, sumber_nama, kutipan, arah)
     values ($1, 'https://example.com/sumber-uji', 'Contoh', 'alokasi Rp 700 miliar', 'mendukung')`,
    [klaim.rows[0].id],
  );
  await db.query(
    `insert into public.pf_evidence (klaim_id, sumber_url, sumber_nama, kutipan, arah)
     values ($1, 'https://example.com/sumber-lain', 'Contoh Lain', 'anggaran dipertanyakan', 'menentang')`,
    [klaim.rows[0].id],
  );
  const B = await draf("Draf Uji Belum Terkonfirmasi", "UNCONFIRMED");
  const C = await draf("Draf Uji Tanpa Verifikasi", null);
  cek("3 draf dibuat (A VERIFIED, B UNCONFIRMED, C tanpa verifikasi)", true);

  // (d) Gate terbit menolak B (UNCONFIRMED) dan C (tanpa verifikasi).
  let gateB = "";
  try {
    await terbitkanArtikel(adapter, B.id, aktorEditor);
  } catch (e) {
    gateB = e instanceof GalatGateTerbit ? e.alasan : e.message;
  }
  cek("gate terbit menolak B (UNCONFIRMED)", gateB.includes("UNCONFIRMED"), gateB);
  let gateC = "";
  try {
    await terbitkanArtikel(adapter, C.id, aktorEditor);
  } catch (e) {
    gateC = e instanceof GalatGateTerbit ? e.alasan : e.message;
  }
  cek("gate terbit menolak C (tanpa verifikasi)", gateC.includes("belum pernah diverifikasi"), gateC);
  const bMasih = await adapter.getArtikel({ id: B.id });
  const cMasih = await adapter.getArtikel({ id: C.id });
  cek("B dan C tetap draft sesudah gate menolak", bMasih.status === "draft" && cMasih.status === "draft");

  // (e) Review setuju A (fact checker) -> terbit A.
  const revA = await putuskanReview(
    adapter,
    { artikel_id: A.id, keputusan: "setuju", catatan: "Sumber cocok, klaim terkoroborasi.", reviewer_id: FACT },
    aktorFact,
  );
  cek("review A setuju tersimpan", revA.keputusan === "setuju");
  const terbitA = await terbitkanArtikel(adapter, A.id, aktorEditor);
  cek(
    "A terbit (status + diterbitkan_pada + diterbitkan_oleh)",
    terbitA.status === "terbit" &&
      !!terbitA.diterbitkan_pada &&
      terbitA.diterbitkan_oleh === EDITOR,
  );
  cek("A punya 2 versi (draf awal + Terbit)", (await jumlahVersi(A.id)) === 2);
  const terbitPublik = await db.query(
    `select count(*)::int as n from public.pf_articles where status = 'terbit'`,
  );
  cek("A tampil sebagai artikel terbit (yang dibaca beranda)", terbitPublik.rows[0].n === 1);

  // (f) Review tolak C -> tetap draft + alasan tercatat.
  await putuskanReview(
    adapter,
    { artikel_id: C.id, keputusan: "tolak", catatan: "Sumber tidak bisa diverifikasi.", reviewer_id: FACT },
    aktorFact,
  );
  const revC = await adapter.getReviewTerakhir({ artikel_id: C.id });
  const cSesudah = await adapter.getArtikel({ id: C.id });
  cek(
    "review C tolak tercatat + C tetap draft",
    revC.keputusan === "tolak" &&
      revC.catatan === "Sumber tidak bisa diverifikasi." &&
      cSesudah.status === "draft",
  );

  // (g) Fact checker ubah status B -> CROSS-CHECKED -> B bisa terbit.
  await ubahStatusVerifikasi(
    adapter,
    { artikel_id: B.id, keputusan: "CROSS-CHECKED", catatan: "Dua sumber independen cocok." },
    aktorFact,
  );
  const terbitB = await terbitkanArtikel(adapter, B.id, aktorEditor);
  cek("B terbit sesudah CROSS-CHECKED", terbitB.status === "terbit");

  // (h) Koreksi: laporan pembaca atas A -> terima.
  const lapA = await db.query(
    `insert into public.pf_correction_reports (artikel_id, nama, email, jenis, pesan)
     values ($1, 'Pembaca', 'pembaca@example.com', 'fakta_salah', 'Angka alokasi seharusnya Rp 750 miliar.')
     returning id`,
    [A.id],
  );
  const hasilKoreksi = await tindaklanjutiKoreksi(
    adapter,
    { koreksi_id: lapA.rows[0].id, aksi: "terima", catatan: "Angka diperbaiki menjadi Rp 750 miliar." },
    aktorEditor,
  );
  const aKoreksi = await adapter.getArtikel({ id: A.id });
  const verKoreksi = await adapter.getVerifikasiTerakhir({ artikel_id: A.id });
  const koreksiTanggal = await db.query(
    `select dibuat_pada from public.pf_verification_records
     where artikel_id = $1 and keputusan = 'CORRECTED' order by dibuat_pada desc limit 1`,
    [A.id],
  );
  cek(
    "koreksi A diterima: laporan diperbaiki + CORRECTED + versi baru + tanggal koreksi ada",
    hasilKoreksi.status === "diperbaiki" &&
      aKoreksi.status_verifikasi === "CORRECTED" &&
      verKoreksi.keputusan === "CORRECTED" &&
      (await jumlahVersi(A.id)) === 3 &&
      !!koreksiTanggal.rows[0]?.dibuat_pada,
    `versi A=${await jumlahVersi(A.id)}`,
  );

  // (i) Koreksi kedua atas B -> tolak.
  const lapB = await db.query(
    `insert into public.pf_correction_reports (artikel_id, nama, email, jenis, pesan)
     values ($1, 'Pembaca', 'pembaca@example.com', 'typo', 'Typo di paragraf kedua.')
     returning id`,
    [B.id],
  );
  await tindaklanjutiKoreksi(
    adapter,
    { koreksi_id: lapB.rows[0].id, aksi: "tolak", catatan: "Typo sudah benar." },
    aktorEditor,
  );
  const lapBSesudah = await adapter.getKoreksi({ id: lapB.rows[0].id });
  cek("koreksi B ditolak", lapBSesudah.status === "ditolak");

  // (j) Jadwalkan D (waktu lampau) + terbitkan terjadwal -> terbit.
  const D = await draf("Draf Uji Terjadwal", "VERIFIED");
  const lampau = new Date(Date.now() - 60_000).toISOString();
  await jadwalkanArtikel(adapter, D.id, lampau, aktorEditor);
  const dTerjadwal = await adapter.getArtikel({ id: D.id });
  cek(
    "D terjadwal",
    dTerjadwal.status === "terjadwal" && !!dTerjadwal.dijadwalkan_pada,
  );
  const hasilJadwal = await terbitkanTerjadwal(adapter, {
    id: null,
    email: "github_actions",
    ip: null,
  });
  const dSesudah = await adapter.getArtikel({ id: D.id });
  cek(
    "terbitkan-terjadwal menerbitkan D",
    hasilJadwal.diterbitkan.length === 1 &&
      hasilJadwal.dilewati.length === 0 &&
      dSesudah.status === "terbit",
    `diterbitkan=${hasilJadwal.diterbitkan.length}`,
  );

  // (k) Batalkan B -> draft; hapus: draft E boleh, terbit A ditolak.
  const batalB = await batalkanPublikasi(adapter, B.id, aktorEditor);
  cek("B dibatalkan ke draft", batalB.status === "draft");
  const E = await buatArtikel(
    adapter,
    {
      judul: "Draf Uji Hapus",
      slug: "",
      ringkasan: "Ringkasan hapus.",
      isi: "Isi hapus.",
      kategori_slug: KATEGORI,
      penulis_nama: "Editor Uji",
      penulis_id: EDITOR,
    },
    aktorEditor,
  );
  await hapusArtikel(adapter, E.id, aktorEditor);
  cek("E (draft) terhapus", (await adapter.getArtikel({ id: E.id })) === null);
  let hapusA = "";
  try {
    await hapusArtikel(adapter, A.id, aktorEditor);
  } catch (e) {
    hapusA = e.message;
  }
  cek("hapus A (terbit) ditolak dengan alasan", hapusA.includes("tidak dapat dihapus"), hapusA.slice(0, 80));

  // (l) Edit A -> versi baru + audit artikel.ubah.
  const aEdit = await perbaruiArtikel(
    adapter,
    A.id,
    { judul: "Draf Uji Terbit Fase 5 (Diperbarui)", catatan_versi: "Perbaikan judul" },
    aktorEditor,
  );
  cek(
    "edit A: judul berubah + versi 4",
    aEdit.judul === "Draf Uji Terbit Fase 5 (Diperbarui)" &&
      (await jumlahVersi(A.id)) === 4,
  );

  // (m) Review tanpa catatan ditolak; jadwalkan tanggal tidak valid ditolak.
  let revKosong = "";
  try {
    await putuskanReview(
      adapter,
      { artikel_id: C.id, keputusan: "setuju", catatan: "   ", reviewer_id: FACT },
      aktorFact,
    );
  } catch (e) {
    revKosong = e.message;
  }
  cek("review tanpa catatan ditolak", revKosong.includes("wajib diisi"));
  let jadwalBuruk = "";
  try {
    await jadwalkanArtikel(adapter, C.id, "bukan-tanggal", aktorEditor);
  } catch (e) {
    jadwalBuruk = e.message;
  }
  cek("jadwalkan tanggal tidak valid ditolak", jadwalBuruk.includes("tidak valid"));

  // (n) Pengguna: ubah peran writer -> editor; nonaktifkan writer.
  await aturPeranPengguna(adapter, { user_id: WRITER, roles: ["editor"] }, aktorAdmin);
  const writerBaru = await adapter.getPengguna({ id: WRITER });
  cek("peran writer -> editor", writerBaru.roles.includes("editor"));
  await setNonaktifPengguna(adapter, { user_id: WRITER, nonaktif: true }, aktorAdmin);
  const writerNonaktif = await adapter.getPengguna({ id: WRITER });
  cek("writer dinonaktifkan", writerNonaktif.nonaktif === true);

  // (o) Sistem: ubah jadwal ingestion + kategori baru + hapus kategori kosong.
  await perbaruiJob(
    adapter,
    { nama: "ingestion", patch: { jadwal_cron: "*/15 * * * *" } },
    aktorAdmin,
  );
  const jobIng = await adapter.getJob({ nama: "ingestion" });
  cek("jadwal ingestion -> */15", jobIng.jadwal_cron === "*/15 * * * *");
  const katBaru = await buatKategori(
    adapter,
    { slug: "uji-kategori-baru", nama: "Uji Kategori Baru" },
    aktorAdmin,
  );
  cek("kategori baru dibuat", katBaru.slug === "uji-kategori-baru");
  // buatKategori hanya mengembalikan {slug, nama} — ambil id lewat daftar.
  const katBaruRow = (await adapter.listKategori()).find(
    (k) => k.slug === "uji-kategori-baru",
  );
  cek("kategori baru ada di daftar", !!katBaruRow);
  await hapusKategori(adapter, katBaruRow.id, aktorAdmin);
  const katHilang = (await adapter.listKategori()).find((k) => k.id === katBaru.id);
  cek("kategori kosong terhapus", !katHilang);
  let hapusKatPakai = "";
  try {
    const katDipakai = (await adapter.listKategori()).find((k) => k.slug === KATEGORI);
    await hapusKategori(adapter, katDipakai.id, aktorAdmin);
  } catch (e) {
    hapusKatPakai = e.message;
  }
  cek("hapus kategori yang dipakai artikel ditolak", hapusKatPakai.includes("masih dipakai"));

  // (p) Brief: buat draf -> terbitkan.
  const brief = await db.query(
    `insert into public.pf_daily_briefs (tanggal, isi, status) values ('2026-11-16', '[]', 'draft') returning id`,
  );
  const briefTerbit = await terbitkanBrief(adapter, brief.rows[0].id, aktorEditor);
  cek("brief terbit", briefTerbit.status === "terbit" && !!briefTerbit.diterbitkan_pada);

  // (q) Ringkasan akhir (A terbit CORRECTED, B draft, C draft, D terbit).
  const ringkas = await adapter.hitungRingkasan();
  cek(
    "ringkasan: total 4, terbit 2, draft 2, belum_terkonfirmasi 1, dikoreksi 1",
    ringkas.total_artikel === 4 &&
      ringkas.terbit === 2 &&
      ringkas.draft === 2 &&
      ringkas.terjadwal === 0 &&
      ringkas.belum_terkonfirmasi === 1 &&
      ringkas.dikoreksi === 1 &&
      ringkas.antrean_verifikasi === 2,
    JSON.stringify(ringkas),
  );

  // (r) Audit log: semua aksi tercatat.
  const ekspektasiAudit = {
    "artikel.buat": 5, // A, B, C, D, E
    "artikel.terbit": 3, // A, B, D
    "artikel.batal_terbit": 1,
    "artikel.jadwalkan": 1,
    "artikel.ubah": 1,
    "artikel.hapus": 1,
    "review.setuju": 1,
    "review.tolak": 1,
    "verifikasi.ubah": 1,
    "koreksi.terima": 1,
    "koreksi.tolak": 1,
    "pengguna.role": 1,
    "pengguna.nonaktif": 1,
    "sistem.job": 1,
    "sistem.kategori": 2, // buat + hapus
    "brief.terbit": 1,
  };
  let auditTotal = 0;
  for (const [aksi, jumlah] of Object.entries(ekspektasiAudit)) {
    const n = await hitungAudit(aksi);
    auditTotal += n;
    cek(`audit ${aksi} = ${jumlah}`, n === jumlah, `dapat ${n}`);
  }
  const totalAudit = await db.query(
    `select count(*)::int as n from public.pf_audit_logs`,
  );
  cek(
    "total audit log cocok",
    totalAudit.rows[0].n === auditTotal,
    `${totalAudit.rows[0].n} baris`,
  );
  const auditFilter = await adapter.listAudit({ aksi: "artikel.terbit", page: 1, limit: 10 });
  cek(
    "listAudit filter artikel.terbit = 3",
    auditFilter.total === 3 && auditFilter.log.length === 3,
  );

  // (s) Antrean review (API): draft + terjadwal = B, C.
  const antrean = await adapter.listArtikel({ status: "draft", page: 1, limit: 100 });
  cek(
    "antrean draft = B, C",
    antrean.total === 2 &&
      antrean.artikel.some((a) => a.id === B.id) &&
      antrean.artikel.some((a) => a.id === C.id),
  );
  const klaimA = await db.query(
    `select count(*)::int as n from public.pf_claims where artikel_id = $1`,
    [A.id],
  );
  const evA = await db.query(
    `select count(*)::int as n from public.pf_evidence e join public.pf_claims c on c.id = e.klaim_id where c.artikel_id = $1`,
    [A.id],
  );
  cek("klaim + evidence A utuh (1 klaim, 2 evidence)", klaimA.rows[0].n === 1 && evA.rows[0].n === 2);
}

console.log(gagal === 0 ? "\nHASIL: SEMUA LOLOS" : `\nHASIL: ${gagal} ASERSI GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
