// Uji bulk publish + auto-publish Tier-1 (Fase 11, PRATA FAKTA).
// PGlite + pemeriksaan statis + eksekusi kode nyata (tanpa server
// Next, tanpa deploy, tanpa data dummy operasional, tanpa
// memanggil produksi).
//
// Yang diuji:
//   (A) Keputusan murni seharusnyaAutoTerbit + nilaiFlagAutoPublish.
//   (B) Bulk publish semua (terbitkanMassalTerverifikasi nyata):
//       draf CROSS-CHECKED/VERIFIED + review 'setuju' terbit;
//       draf UNCONFIRMED/DEVELOPING tetap draft; draf terverifikasi
//       TANPA review 'setuju' (atau review 'tolak') dilewati +
//       tercatat alasannya (uji negatif gate).
//   (C) Bulk subset articleIds: hanya id yang diminta yang
//       diterbitkan; id tak dikenal / bukan draf terverifikasi
//       masuk dilewati.
//   (D) Auto-publish Tier-1 (terbitkanOtomatis nyata): skor 85 +
//       toggle aktif -> terbit + audit 'auto-publish' tercatat;
//       skor 84 -> tetap draft; toggle mati -> tetap draft;
//       skor null -> tetap draft; verifikasi tidak memenuhi /
//       tanpa record -> tetap draft; bukan draft -> tetap.
//   (E) Wiring statis route + panel + flag (guard super_admin,
//       rate limit, origin, 503 jujur, instruksi wiring pipeline).
//   (F) Audit log: tiap penerbitan tercatat aksi 'artikel.terbit';
//       auto-publish membawa sesudah.auto_publish=true + fact_score.
//
// Yang TIDAK diuji di sini (dilaporkan sebagai belum diuji):
// HTTP end-to-end lewat server Next (401/403 route di level HTTP,
// render browser panel /admin), dan run live GitHub Actions.
// Guard 401/403 ditegakkan autentikasiAdmin (bersama, diuji
// baterai Fase 5) — di sini diverifikasi statis bahwa route
// memanggilnya dengan ROLES.SUPER_ADMIN.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// Jalankan:
//   node --experimental-strip-types --import /tmp/pf-register.mjs scripts/uji-bulk-publish.mjs
import fs from "node:fs";
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

// Loader untuk impor .ts (alias @/ + next stub) — didaftarkan
// sebelum impor dinamis modul yang diuji (pola uji-tahap13c).
register("./uji-tahap13c-loader.mjs", import.meta.url);

const { terbitkanMassalTerverifikasi } = await import(
  "../src/lib/admin/editorial.ts"
);
const {
  AMBANG_AUTO_PUBLISH,
  KUNCI_FLAG_AUTO_PUBLISH,
  nilaiFlagAutoPublish,
  seharusnyaAutoTerbit,
  terbitkanOtomatis,
} = await import("../src/lib/admin/auto-publish.ts");

// ==================== Adapter uji (PGlite, SQL langsung) ====================
// Hanya metode yang dipakai jalur bulk + auto-publish — cerminan
// supabase-adapter.ts (listArtikel/getArtikel/getVerifikasiTerakhir/
// getReviewTerakhir/perbaruiArtikel + harapkanStatus/versi/audit).
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
      `select id, artikel_id, keputusan, catatan, dibuat_pada from public.pf_verification_records
        where artikel_id = $1 order by dibuat_pada desc limit 1`,
      [artikel_id],
    );
    return r.rows[0] ?? null;
  }
  async getReviewTerakhir({ artikel_id }) {
    const r = await this.db.query(
      `select id, artikel_id, reviewer_id, keputusan, catatan, dibuat_pada
         from public.pf_editorial_reviews where artikel_id = $1 order by dibuat_pada desc limit 1`,
      [artikel_id],
    );
    return r.rows[0] ?? null;
  }
  async perbaruiArtikel({ id, patch, harapkanStatus }) {
    const kunci = Object.keys(patch).filter((k) => KOLOM_ARTIKEL_SET.has(k));
    if (kunci.length === 0) return this.getArtikel({ id });
    const set = kunci.map((k, i) => `${k} = $${i + 2}`).join(", ");
    const nilai = kunci.map((k) => patch[k]);
    // Update bersyarat (P2-9): bila harapkanStatus diisi dan status
    // saat ini berbeda, 0 baris terpengaruh -> null.
    let sql = `update public.pf_articles set ${set} where id = $1`;
    const params = [id, ...nilai];
    if (harapkanStatus) {
      sql += ` and status = $${params.length + 1}`;
      params.push(harapkanStatus);
    }
    sql += ` returning ${KOLOM_ARTIKEL}`;
    const r = await this.db.query(sql, params);
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
  async hapusVersi({ id }) {
    await this.db.query(
      `delete from public.pf_article_versions where id = $1`,
      [id],
    );
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
}

const adapter = new AdapterUji(db);
const aktorUji = { id: null, email: "uji@prata.fakta", ip: "127.0.0.1" };

// ==================== Seed ====================
await db.query(
  `insert into public.pf_categories (slug, nama) values ('dunia', 'Dunia')
     on conflict (slug) do nothing`,
);

// Urutan waktu dibuat_pada (gate kedaluwarsa review): versi 10:00,
// verifikasi 10:02, review 10:05 — review berlaku untuk isi itu.
const T_VERSI = "2026-11-17 10:00:00+00";
const T_VERIF = "2026-11-17 10:02:00+00";
const T_REVIEW = "2026-11-17 10:05:00+00";

async function buatArtikelSeed({ slug, judul, status, statusVerifikasi }) {
  const r = await db.query(
    `insert into public.pf_articles (slug, judul, ringkasan, isi, kategori_slug, status, status_verifikasi)
       values ($1, $2, 'Ringkasan.', 'Isi artikel.', 'dunia', $3, $4)
       returning id`,
    [slug, judul, status, statusVerifikasi],
  );
  return r.rows[0].id;
}
async function tambahVersi(artikelId) {
  await db.query(
    `insert into public.pf_article_versions (artikel_id, versi, judul, isi, dibuat_oleh, catatan, dibuat_pada)
       values ($1, 1, 'Judul', 'Isi artikel.', null, 'Draf awal', $2)`,
    [artikelId, T_VERSI],
  );
}
async function tambahVerifikasi(artikelId, keputusan) {
  await db.query(
    `insert into public.pf_verification_records (artikel_id, agen, keputusan, catatan, bukti, dibuat_oleh, dibuat_pada)
       values ($1, 'fact_checker', $2, 'Verifikasi uji.', '[]'::jsonb, null, $3)`,
    [artikelId, keputusan, T_VERIF],
  );
}
async function tambahReview(artikelId, keputusan) {
  await db.query(
    `insert into public.pf_editorial_reviews (artikel_id, reviewer_id, keputusan, catatan, dibuat_pada)
       values ($1, null, $2, 'Review uji.', $3)`,
    [artikelId, keputusan, T_REVIEW],
  );
}
async function statusArtikel(id) {
  const r = await db.query(
    `select status, diterbitkan_pada from public.pf_articles where id = $1`,
    [id],
  );
  return r.rows[0];
}
async function hitungAudit(aksi, entitasId) {
  const r = await db.query(
    `select count(*) n from public.pf_audit_logs where aksi = $1 and entitas_id = $2`,
    [aksi, entitasId],
  );
  return Number(r.rows[0].n);
}

// (B) — bulk semua (seed HANYA artikel fase ini di sini: artikel
// fase (C)/(D) di-seed sesudah fase (B), agar bulk "semua" tidak
// ikut menerbitkan artikel fase lain).
const idA = await buatArtikelSeed({ slug: "a-cross", judul: "A cross", status: "draft", statusVerifikasi: "CROSS-CHECKED" });
await tambahVersi(idA);
await tambahVerifikasi(idA, "CROSS-CHECKED");
await tambahReview(idA, "setuju");
const idB = await buatArtikelSeed({ slug: "b-verified", judul: "B verified", status: "draft", statusVerifikasi: "VERIFIED" });
await tambahVersi(idB);
await tambahVerifikasi(idB, "VERIFIED");
await tambahReview(idB, "setuju");
const idC = await buatArtikelSeed({ slug: "c-unconfirmed", judul: "C unconfirmed", status: "draft", statusVerifikasi: "UNCONFIRMED" });
const idD = await buatArtikelSeed({ slug: "d-developing", judul: "D developing", status: "draft", statusVerifikasi: "DEVELOPING" });
const idE = await buatArtikelSeed({ slug: "e-tanpa-review", judul: "E tanpa review", status: "draft", statusVerifikasi: "CROSS-CHECKED" });
await tambahVersi(idE);
await tambahVerifikasi(idE, "CROSS-CHECKED");
// E sengaja TANPA review — uji negatif gate.
const idF = await buatArtikelSeed({ slug: "f-review-tolak", judul: "F review tolak", status: "draft", statusVerifikasi: "VERIFIED" });
await tambahVersi(idF);
await tambahVerifikasi(idF, "VERIFIED");
await tambahReview(idF, "tolak");

// ==================== (A) Keputusan murni ====================
console.log("\n--- (A) seharusnyaAutoTerbit + nilaiFlagAutoPublish ---");
cek("AMBANG_AUTO_PUBLISH = 85", AMBANG_AUTO_PUBLISH === 85);
cek("KUNCI_FLAG_AUTO_PUBLISH = auto_publish_tier1", KUNCI_FLAG_AUTO_PUBLISH === "auto_publish_tier1");
cek("skor 85 + toggle aktif -> true", seharusnyaAutoTerbit(85, { autoPublishTier1: true }) === true);
cek("skor 100 + toggle aktif -> true", seharusnyaAutoTerbit(100, { autoPublishTier1: true }) === true);
cek("skor 84 + toggle aktif -> false", seharusnyaAutoTerbit(84, { autoPublishTier1: true }) === false);
cek("skor 85 + toggle mati -> false", seharusnyaAutoTerbit(85, { autoPublishTier1: false }) === false);
cek("skor null + toggle aktif -> false", seharusnyaAutoTerbit(null, { autoPublishTier1: true }) === false);
cek("skor 0 + toggle aktif -> false", seharusnyaAutoTerbit(0, { autoPublishTier1: true }) === false);
cek("flag belum disetel -> bawaan aktif (true)", nilaiFlagAutoPublish([]) === true);
cek("flag true -> true", nilaiFlagAutoPublish([{ kunci: "auto_publish_tier1", nilai: true }]) === true);
cek("flag false -> false", nilaiFlagAutoPublish([{ kunci: "auto_publish_tier1", nilai: false }]) === false);
cek("flag lain saja -> bawaan aktif (true)", nilaiFlagAutoPublish([{ kunci: "ingestion_aktif", nilai: false }]) === true);

// ==================== (B) Bulk publish semua ====================
console.log("\n--- (B) terbitkanMassalTerverifikasi (semua) ---");
const hasilSemua = await terbitkanMassalTerverifikasi(adapter, aktorUji);
cek(
  "publishedCount = 2 (A + B)",
  hasilSemua.diterbitkan.length === 2,
  `dapat ${hasilSemua.diterbitkan.length}: ${hasilSemua.diterbitkan.map((a) => a.judul).join(", ")}`,
);
cek(
  "articles berisi id+judul+slug",
  hasilSemua.diterbitkan.every((a) => a.id && a.judul && a.slug),
);
cek(
  "dilewati = 2 (E tanpa review + F review tolak)",
  hasilSemua.dilewati.length === 2,
  `dapat ${hasilSemua.dilewati.length}: ${hasilSemua.dilewati.map((a) => `${a.judul} (${a.alasan})`).join(" | ")}`,
);
cek(
  "alasan E menyebut review",
  hasilSemua.dilewati.some((a) => a.id === idE && /review/i.test(a.alasan)),
  hasilSemua.dilewati.find((a) => a.id === idE)?.alasan ?? "",
);
cek(
  "alasan F menyebut review 'tolak'",
  hasilSemua.dilewati.some((a) => a.id === idF && /tolak/.test(a.alasan)),
  hasilSemua.dilewati.find((a) => a.id === idF)?.alasan ?? "",
);
cek("A terbit + diterbitkan_pada terisi", (await statusArtikel(idA)).status === "terbit" && (await statusArtikel(idA)).diterbitkan_pada !== null);
cek("B terbit + diterbitkan_pada terisi", (await statusArtikel(idB)).status === "terbit" && (await statusArtikel(idB)).diterbitkan_pada !== null);
cek("C (UNCONFIRMED) tetap draft", (await statusArtikel(idC)).status === "draft");
cek("D (DEVELOPING) tetap draft", (await statusArtikel(idD)).status === "draft");
cek("E (tanpa review) tetap draft", (await statusArtikel(idE)).status === "draft");
cek("F (review tolak) tetap draft", (await statusArtikel(idF)).status === "draft");

// ==================== (C) Bulk subset ====================
console.log("\n--- (C) terbitkanMassalTerverifikasi (subset articleIds) ---");
// Seed fase (C) di sini (sesudah fase (B)) agar bulk "semua" di
// atas tidak ikut menerbitkan G/H.
const idG = await buatArtikelSeed({ slug: "g-subset", judul: "G subset", status: "draft", statusVerifikasi: "CROSS-CHECKED" });
await tambahVersi(idG);
await tambahVerifikasi(idG, "CROSS-CHECKED");
await tambahReview(idG, "setuju");
const idH = await buatArtikelSeed({ slug: "h-bukan-subset", judul: "H bukan subset", status: "draft", statusVerifikasi: "CROSS-CHECKED" });
await tambahVersi(idH);
await tambahVerifikasi(idH, "CROSS-CHECKED");
await tambahReview(idH, "setuju");
const idTakAda = "00000000-0000-0000-0000-000000000000";
const hasilSubset = await terbitkanMassalTerverifikasi(adapter, aktorUji, {
  articleIds: [idG, idC, idTakAda, idG],
});
cek(
  "subset: publishedCount = 1 (hanya G)",
  hasilSubset.diterbitkan.length === 1 && hasilSubset.diterbitkan[0].id === idG,
  `dapat ${hasilSubset.diterbitkan.map((a) => a.judul).join(", ")}`,
);
cek(
  "subset: dilewati = 2 (C bukan draf terverifikasi + id tak dikenal; duplikat G diabaikan)",
  hasilSubset.dilewati.length === 2,
  `dapat ${hasilSubset.dilewati.map((a) => `${a.judul} (${a.alasan})`).join(" | ")}`,
);
cek("G terbit", (await statusArtikel(idG)).status === "terbit");
cek("H (di luar subset) tetap draft", (await statusArtikel(idH)).status === "draft");
const hasilKosong = await terbitkanMassalTerverifikasi(adapter, aktorUji, {
  articleIds: [],
});
cek(
  "subset kosong: publishedCount = 0, dilewati = 0",
  hasilKosong.diterbitkan.length === 0 && hasilKosong.dilewati.length === 0,
);

// ==================== (D) Auto-publish Tier-1 ====================
console.log("\n--- (D) terbitkanOtomatis ---");
// Seed fase (D) di sini (sesudah fase (B)/(C)) agar bulk di atas
// tidak ikut menyentuh artikel-artikel ini.
const idI = await buatArtikelSeed({ slug: "i-auto-85", judul: "I auto 85", status: "draft", statusVerifikasi: "CROSS-CHECKED" });
await tambahVerifikasi(idI, "CROSS-CHECKED");
const idJ = await buatArtikelSeed({ slug: "j-auto-84", judul: "J auto 84", status: "draft", statusVerifikasi: "CROSS-CHECKED" });
await tambahVerifikasi(idJ, "CROSS-CHECKED");
const idK = await buatArtikelSeed({ slug: "k-auto-mati", judul: "K auto mati", status: "draft", statusVerifikasi: "VERIFIED" });
await tambahVerifikasi(idK, "VERIFIED");
const idL = await buatArtikelSeed({ slug: "l-auto-null", judul: "L auto null", status: "draft", statusVerifikasi: "CROSS-CHECKED" });
await tambahVerifikasi(idL, "CROSS-CHECKED");
const idM = await buatArtikelSeed({ slug: "m-auto-unconfirmed", judul: "M auto unconfirmed", status: "draft", statusVerifikasi: "UNCONFIRMED" });
await tambahVerifikasi(idM, "UNCONFIRMED");
const idN = await buatArtikelSeed({ slug: "n-auto-tanpa-record", judul: "N auto tanpa record", status: "draft", statusVerifikasi: "CROSS-CHECKED" });
// N sengaja TANPA verification record.
const idO = await buatArtikelSeed({ slug: "o-sudah-terbit", judul: "O sudah terbit", status: "terbit", statusVerifikasi: "VERIFIED" });
await tambahVerifikasi(idO, "VERIFIED");
await db.query(
  `update public.pf_articles set diterbitkan_pada = '2026-11-17 09:00:00+00' where id = $1`,
  [idO],
);
const rI = await terbitkanOtomatis(
  adapter,
  { artikelId: idI, factScore: 85, pengaturan: { autoPublishTier1: true } },
  aktorUji,
);
cek("skor 85 + toggle aktif -> terbit", rI.diterbitkan === true && rI.alasan === null);
cek("I terbit + diterbitkan_pada terisi", (await statusArtikel(idI)).status === "terbit" && (await statusArtikel(idI)).diterbitkan_pada !== null);
const rJ = await terbitkanOtomatis(
  adapter,
  { artikelId: idJ, factScore: 84, pengaturan: { autoPublishTier1: true } },
  aktorUji,
);
cek("skor 84 -> tidak terbit", rJ.diterbitkan === false && /84/.test(rJ.alasan ?? ""));
cek("J tetap draft", (await statusArtikel(idJ)).status === "draft");
const rK = await terbitkanOtomatis(
  adapter,
  { artikelId: idK, factScore: 92, pengaturan: { autoPublishTier1: false } },
  aktorUji,
);
cek("toggle mati (skor 92) -> tidak terbit", rK.diterbitkan === false && /nonaktif/.test(rK.alasan ?? ""));
cek("K tetap draft", (await statusArtikel(idK)).status === "draft");
const rL = await terbitkanOtomatis(
  adapter,
  { artikelId: idL, factScore: null, pengaturan: { autoPublishTier1: true } },
  aktorUji,
);
cek("skor null -> tidak terbit", rL.diterbitkan === false && /belum dinilai/i.test(rL.alasan ?? ""));
cek("L tetap draft", (await statusArtikel(idL)).status === "draft");
const rM = await terbitkanOtomatis(
  adapter,
  { artikelId: idM, factScore: 90, pengaturan: { autoPublishTier1: true } },
  aktorUji,
);
cek("UNCONFIRMED (skor 90) -> tidak terbit", rM.diterbitkan === false);
cek("M tetap draft", (await statusArtikel(idM)).status === "draft");
const rN = await terbitkanOtomatis(
  adapter,
  { artikelId: idN, factScore: 90, pengaturan: { autoPublishTier1: true } },
  aktorUji,
);
cek("tanpa verification record (skor 90) -> tidak terbit", rN.diterbitkan === false && /verifikasi/.test(rN.alasan ?? ""));
cek("N tetap draft", (await statusArtikel(idN)).status === "draft");
const rO = await terbitkanOtomatis(
  adapter,
  { artikelId: idO, factScore: 95, pengaturan: { autoPublishTier1: true } },
  aktorUji,
);
cek("sudah terbit (skor 95) -> tidak diterbitkan ulang", rO.diterbitkan === false);
cek(
  "O tetap terbit + diterbitkan_pada tak berubah",
  (await statusArtikel(idO)).status === "terbit" &&
    new Date((await statusArtikel(idO)).diterbitkan_pada)
      .toISOString()
      .startsWith("2026-11-17T09:00"),
);

// ==================== (F) Audit log ====================
console.log("\n--- (F) Audit log pf_audit_logs ---");
cek("audit 'artikel.terbit' untuk A", (await hitungAudit("artikel.terbit", idA)) === 1);
cek("audit 'artikel.terbit' untuk B", (await hitungAudit("artikel.terbit", idB)) === 1);
cek("audit 'artikel.terbit' untuk G", (await hitungAudit("artikel.terbit", idG)) === 1);
cek("audit 'artikel.terbit' untuk I (auto)", (await hitungAudit("artikel.terbit", idI)) === 1);
cek("TIDAK ada audit terbit untuk C/D/E/F/H/J/K/L/M/N", Number((
  await db.query(
    `select count(*) n from public.pf_audit_logs where aksi = 'artikel.terbit'
       and entitas_id in ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [idC, idD, idE, idF, idH, idJ, idK, idL, idM, idN],
  )
).rows[0].n) === 0);
const auditI = (
  await db.query(
    `select sesudah from public.pf_audit_logs where aksi = 'artikel.terbit' and entitas_id = $1`,
    [idI],
  )
).rows[0].sesudah;
cek(
  "audit auto-publish I: sesudah.auto_publish = true",
  auditI?.auto_publish === true,
  JSON.stringify(auditI),
);
cek(
  "audit auto-publish I: sesudah.fact_score = 85",
  auditI?.fact_score === 85,
  JSON.stringify(auditI),
);
cek(
  "audit auto-publish I: sesudah.ambang_auto_publish = 85 + keterangan auto-publish",
  auditI?.ambang_auto_publish === 85 && auditI?.keterangan === "auto-publish",
  JSON.stringify(auditI),
);
const versiI = await db.query(
  `select catatan from public.pf_article_versions where artikel_id = $1 order by versi desc limit 1`,
  [idI],
);
cek(
  "versi 'Terbit (auto-publish)' tersimpan untuk I",
  versiI.rows[0]?.catatan === "Terbit (auto-publish)",
);

// ==================== (E) Wiring statis ====================
console.log("\n--- (E) Wiring statis (route/panel/flag) ---");
const kodeRoute = bacaRepo("src/app/api/admin/publish-verified/route.ts");
cek("route: guard super_admin (autentikasiAdmin + ROLES.SUPER_ADMIN)", kodeRoute.includes("autentikasiAdmin(req, ROLES.SUPER_ADMIN)"));
cek("route: rate limit admin", kodeRoute.includes("buatRateLimiterAdmin()"));
cek("route: cekOrigin (P0-8)", kodeRoute.includes("cekOrigin(req)"));
cek("route: memanggil terbitkanMassalTerverifikasi", kodeRoute.includes("terbitkanMassalTerverifikasi"));
cek("route: 503 jujur via responGalatAdmin", kodeRoute.includes("responGalatAdmin(err)"));
cek("route: validasi articleIds (array string, else 400)", kodeRoute.includes("articleIds") && kodeRoute.includes("responBodyTakValid()"));
cek("route: respons {ok, publishedCount, articles}", kodeRoute.includes("publishedCount: hasil.diterbitkan.length") && kodeRoute.includes("articles: hasil.diterbitkan"));
cek("route: TIDAK memanggil endpoint produksi / fetch keluar", !kodeRoute.includes("fetch(") && !kodeRoute.includes("prata-fakta.vercel.app"));
const kodeEditorial = bacaRepo("src/lib/admin/editorial.ts");
cek("editorial.ts: terbitkanMassalTerverifikasi diekspor", kodeEditorial.includes("export async function terbitkanMassalTerverifikasi"));
cek("editorial.ts: bulk memakai terbitkanArtikel (gate penuh)", kodeEditorial.includes("await terbitkanArtikel(adapter, a.id, aktor)"));
const kodeAuto = bacaRepo("src/lib/admin/auto-publish.ts");
cek("auto-publish.ts: header wiring menyebut verifikasiSatuItem", kodeAuto.includes("verifikasiSatuItem"));
cek("auto-publish.ts: header wiring menyebut langkah 9 (tautan verifikasi)", kodeAuto.includes("langkah 9"));
cek("auto-publish.ts: header melarang edit pipeline.ts", kodeAuto.includes("JANGAN edit"));
cek("auto-publish.ts: audit aksi 'artikel.terbit' + auto_publish", kodeAuto.includes('aksi: "artikel.terbit"') && kodeAuto.includes("auto_publish: true"));
const kodeKendali = bacaRepo("src/lib/admin/kendali.ts");
cek(
  "kendali.ts: flag auto_publish_tier1 di DAFTAR_FLAG, bawaan true",
  kodeKendali.includes('kunci: "auto_publish_tier1"') && kodeKendali.includes('label: "Auto-publish Tier-1 (FACT SCORE ≥85)"'),
);
const kodeAdmin = bacaRepo("src/app/admin/page.tsx");
cek("panel /admin: judul 'Terbitkan Semua Draf Terverifikasi (1-Klik)'", kodeAdmin.includes("Terbitkan Semua Draf Terverifikasi (1-Klik)"));
cek("panel /admin: TombolAksi ke /api/admin/publish-verified", kodeAdmin.includes('url="/api/admin/publish-verified"'));
cek("panel /admin: konfirmasi menyebut jumlah draf", kodeAdmin.includes("Terbitkan ${ringkasan.draft_terverifikasi} draf terverifikasi sekarang?"));
cek("panel /admin: tombol nonaktif bila 0 (disabled)", kodeAdmin.includes('className="tombol tombol-primer"') && kodeAdmin.includes("disabled"));
cek("panel /admin: toggle FormFlag auto-publish", kodeAdmin.includes("flagAutoPublish") && kodeAdmin.includes("<FormFlag"));
cek("panel /admin: non-super_admin hanya melihat teks (tanpa tombol)", kodeAdmin.includes("Bulk publish hanya untuk super_admin"));
const kodeData = bacaRepo("src/lib/admin/data.ts");
cek("data.ts: RingkasanAdmin punya draft_terverifikasi", kodeData.includes("draft_terverifikasi: number"));
const kodePeta = bacaRepo("hidden_files/PEMETAAN-STATUS-EDITORIAL.md");
cek(
  "pemetaan: 14 status mandat terpetakan",
  ["NEW", "DISCOVERED", "DUPLICATE", "REJECTED", "QUEUED", "RESEARCHING", "VERIFYING", "DRAFTED", "NEEDS_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "CORRECTED", "ARCHIVED"].every((s) => kodePeta.includes(s)),
);
cek("pemetaan: menyatakan TIDAK ADA status baru / perubahan CHECK", kodePeta.includes("TIDAK ADA status baru"));

// ==================== Ringkasan ====================
console.log(`\nRingkasan uji-bulk-publish: ${lolos} lolos, ${gagal} gagal.`);
if (gagal > 0) {
  console.log("HASIL: GAGAL — ada asersi yang tidak lolos.");
  process.exit(1);
} else {
  console.log("HASIL: SEMUA LOLOS.");
  process.exit(0);
}
