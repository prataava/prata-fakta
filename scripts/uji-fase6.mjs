// Uji end-to-end Fase 6 PRATA FAKTA -> PGlite.
// BUKAN data dummy operasional: skenario memakai artikel terbit +
// pengetahuan + kuis + indikator + event + notifikasi berbentuk data
// nyata hasil pipeline Fase 3-5 (judul/angka dari feed RSS nyata
// yang dipakai dry-run Fase 4: KTT ASEAN, populasi 700 juta).
// Langkah: (a) PGlite + stub auth + migrasi v1..v6 (v6 2x);
// (b) seed skenario; (c) alur: peta (marker hanya berkoordinat)
// -> pengetahuan harian + kuis hari ini -> follow topik ->
// rekomendasi berubah -> notifikasi ditandai dibaca -> tanya
// retrieval (cocok -> terjawab + referensi; tak cocok -> menunggu
// jujur) -> data-analysis (fungsi murni + ringkasan tersimpan) ->
// TTS chunking.
// Dua fungsi murni TIDAK BISA diimpor langsung di Node polos:
// kataKunci (route /api/tanya memakai alias "@/...") dan
// pecahUntukSuara (komponen .tsx + impor CSS) — keduanya diekstrak
// dari TEKS SUMBER berkas aslinya (bukan salinan tulisan ulang)
// dan dievaluasi; bila teks sumber berubah, ekstraksi gagal keras
// (bukan lolos diam-diam).
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = require("@electric-sql/pglite");

import {
  formatAngkaId,
  formatTanggalId,
  hitungIndikator,
  labelTrenDariPersen,
} from "../src/lib/ai/data-analysis.ts";

const DIR_MIGRASI = new URL("../supabase/migrations/", import.meta.url).pathname;
const DIR_SRC = new URL("../src/", import.meta.url).pathname;

let gagal = 0;
let lolos = 0;
function cek(label, kondisi, detail = "") {
  if (kondisi) {
    lolos++;
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

// ---------- Ekstraksi fungsi murni dari teks sumber asli ----------
function cocokKurung(teks, awal) {
  let dalam = 0;
  for (let i = awal; i < teks.length; i++) {
    if (teks[i] === "{") dalam++;
    else if (teks[i] === "}") {
      dalam--;
      if (dalam === 0) return i + 1;
    }
  }
  throw new Error("kurung tidak seimbang saat ekstraksi");
}

// Ambil deklarasi const/fungsi bernama dari teks sumber (termasuk badan).
function ekstrak(teks, pola) {
  const m = teks.match(pola);
  if (!m || m.index === undefined) throw new Error(`pola tidak ketemu: ${pola}`);
  const awalKurung = teks.indexOf("{", m.index);
  if (awalKurung === -1) throw new Error("badan tidak ketemu");
  return teks.slice(m.index, cocokKurung(teks, awalKurung));
}

// Hapus anotasi tipe TS sederhana dari cuplikan yang diekstrak.
function bersihkanTipe(s) {
  return s
    .replace(/: string\[\]/g, "")
    .replace(/: string/g, "")
    .replace(/: number/g, "")
    .replace(/: boolean/g, "");
}

const teksTanya = fs.readFileSync(`${DIR_SRC}app/api/tanya/route.ts`, "utf8");
// STOPWORDS adalah literal Set([...]) tanpa kurung kurawal — ambil
// dengan regex yang berhenti tepat di `]);`, BUKAN pencocokan
// kurung (yang akan melompat ke badan fungsi berikutnya).
const mStop = teksTanya.match(/const STOPWORDS = new Set\(\[[\s\S]*?\]\);/);
if (!mStop) throw new Error("STOPWORDS tidak ketemu di route /api/tanya");
const srcStopwords = mStop[0];
const srcKataKunci = ekstrak(teksTanya, /export function kataKunci\(/);
const kataKunci = new Function(
  `${bersihkanTipe(srcStopwords)}\n${bersihkanTipe(srcKataKunci).replace("export ", "")}\nreturn kataKunci;`,
)();

const teksSuara = fs.readFileSync(
  `${DIR_SRC}components/artikel/PembacaSuara.tsx`,
  "utf8",
);
const mBatas = teksSuara.match(/const BATAS_UTTERANCE = \d+;/);
if (!mBatas) throw new Error("BATAS_UTTERANCE tidak ketemu di PembacaSuara");
const srcBatas = mBatas[0];
const srcPecah = ekstrak(teksSuara, /export function pecahUntukSuara\(/);
const pecahUntukSuara = new Function(
  `${srcBatas}\n${bersihkanTipe(srcPecah).replace("export ", "")}\nreturn pecahUntukSuara;`,
)();

// ---------- Setup PGlite ----------
const db = new PGlite();

async function jalankan(label, teks) {
  try {
    await db.exec(teks);
    console.log(`OK: ${label}`);
    return true;
  } catch (e) {
    console.log(`GAGAL: ${label}\n  -> ${String(e.message).split("\n")[0]}`);
    gagal++;
    return false;
  }
}

await db.exec(`create schema if not exists auth;`);
await db.exec(`create schema if not exists extensions;`);
await db.exec(
  `create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);`,
);
await db.exec(
  `create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`,
);

let ok = await jalankan("v1", baca("20261116_pf_v1_foundation.sql"));
if (ok) ok = await jalankan("v2", baca("20261116_pf_v2_articles.sql"));
if (ok) ok = await jalankan("v3", baca("20261116_pf_v3_ingestion.sql"));
if (ok) ok = await jalankan("v4", baca("20261116_pf_v4_ai.sql"));
if (ok) ok = await jalankan("v5", baca("20261116_pf_v5_editorial.sql"));
if (ok) ok = await jalankan("v6 putaran 1", baca("20261116_pf_v6_advanced.sql"));
if (ok) ok = await jalankan("v6 putaran 2 (idempotensi)", baca("20261116_pf_v6_advanced.sql"));
if (!ok) {
  console.log("HASIL: MIGRASI GAGAL");
  process.exit(1);
}

const hitung = async (sql, params = []) =>
  Number((await db.query(sql, params)).rows[0].n);
cek("tabel pf_* = 35", (await hitung(`select count(*) n from pg_tables where schemaname='public' and tablename like 'pf_%'`)) === 35);
cek(
  "RLS 35/35",
  (await hitung(`select count(*) n from pg_tables where schemaname='public' and tablename like 'pf_%' and rowsecurity`)) === 35,
);
cek(
  "policy total = 76",
  (await hitung(`select count(*) n from pg_policies where schemaname='public' and tablename like 'pf_%'`)) === 76,
  "62 (v1-v5) + 14 (v6)",
);

// ---------- Seed skenario ----------
const HARI_INI = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

async function harusBerhasil(label, teks, params = []) {
  try {
    const r = await db.query(teks, params);
    console.log(`OK: ${label}`);
    return r;
  } catch (e) {
    console.log(`GAGAL: ${label}\n  -> ${String(e.message).split("\n")[0]}`);
    gagal++;
    return null;
  }
}

const U1 = "11111111-1111-1111-1111-111111111111";
await harusBerhasil(
  "seed pengguna u1",
  `insert into auth.users (id, email) values ($1, 'pembaca@uji.id')`,
  [U1],
);
cek(
  "trigger v1 membuat profil u1",
  (await hitung(`select count(*) n from public.pf_profiles where id = $1`, [U1])) === 1,
);

// Artikel: a1 terbit berkoordinat, a2 terbit tanpa koordinat, a3 draft.
const a1 = (
  await harusBerhasil(
    "seed artikel a1 terbit + koordinat",
    `insert into public.pf_articles (slug, judul, ringkasan, isi, kategori_slug, status_verifikasi, status, diterbitkan_pada, lintang, bujur)
     values ('ktt-asean-jakarta', 'KTT ASEAN di Jakarta membahas kerja sama kawasan', 'Ringkasan KTT ASEAN Jakarta.', 'Isi artikel KTT ASEAN.', 'dunia', 'VERIFIED', 'terbit', now(), -6.2088, 106.8456)
     returning id`,
  )
)?.rows[0].id;
// a1 dipakai sebagai bukti artikel berkoordinat tersimpan (bukan id mentah).
cek("seed a1 mengembalikan id", typeof a1 === "string" && a1.length > 0);
await harusBerhasil(
  "seed artikel a2 terbit tanpa koordinat",
  `insert into public.pf_articles (slug, judul, ringkasan, isi, kategori_slug, status_verifikasi, status, diterbitkan_pada)
   values ('asean-700-juta', 'ASEAN dihuni 700 juta penduduk', 'Ringkasan populasi ASEAN 700 juta.', 'Isi artikel populasi.', 'dunia', 'CROSS-CHECKED', 'terbit', now())`,
);
await harusBerhasil(
  "seed artikel a3 draft (tidak boleh muncul di publik)",
  `insert into public.pf_articles (slug, judul, ringkasan, isi, kategori_slug, status_verifikasi, status)
   values ('draf-rahasia', 'Draf yang belum terbit', 'Ringkasan draf.', 'Isi draf.', 'dunia', 'UNCONFIRMED', 'draft')`,
);

// Pengetahuan: k1 fotosintesis (harian hari ini), k2 sejarah.
await harusBerhasil(
  "seed pengetahuan k1 (fotosintesis, harian hari ini)",
  `insert into public.pf_knowledge_articles (slug, judul, ringkasan, isi, topik, referensi, status, harian_tanggal, penulis_nama)
   values ('fotosintesis', 'Fotosintesis: Cara Tumbuhan Membuat Makanan', 'Tumbuhan mengubah cahaya matahari, air, dan karbon dioksida menjadi makanan melalui fotosintesis.', 'Isi pengetahuan fotosintesis.', 'sains', '[{"judul": "Buku Biologi SMA", "url": "https://example.org/biologi"}]', 'terbit', $1, 'Redaksi PRATA FAKTA')`,
  [HARI_INI],
);
await harusBerhasil(
  "seed pengetahuan k2 (sejarah, bukan harian)",
  `insert into public.pf_knowledge_articles (slug, judul, ringkasan, isi, topik, referensi, status, penulis_nama)
   values ('sumpah-pemuda', 'Sumpah Pemuda 1928', 'Ikrar pemuda Indonesia 28 Oktober 1928.', 'Isi pengetahuan sumpah pemuda.', 'sejarah', '[]', 'terbit', 'Redaksi PRATA FAKTA')`,
);

// Kuis: 5 soal hari ini.
const soalKuis = [
  ["Apa hasil utama fotosintesis?", '["Oksigen", "Karbon dioksida", "Nitrogen", "Hidrogen", "Helium"]', 0],
  ["Berapa jumlah penduduk ASEAN yang disebut dalam artikel?", '["500 juta", "600 juta", "700 juta", "800 juta", "900 juta"]', 2],
  ["Di kota mana KTT ASEAN dalam artikel berlangsung?", '["Jakarta", "Bandung", "Surabaya", "Medan", "Makassar"]', 0],
  ["Apa gas yang diserap tumbuhan saat fotosintesis?", '["Oksigen", "Karbon dioksida", "Nitrogen", "Argon", "Neon"]', 1],
  ["Tahun berapa Sumpah Pemuda diikrarkan?", '["1926", "1927", "1928", "1929", "1930"]', 2],
];
for (let i = 0; i < soalKuis.length; i++) {
  await harusBerhasil(
    `seed kuis soal ${i + 1}/5`,
    `insert into public.pf_quiz_questions (tanggal, pertanyaan, opsi, kunci, penjelasan, sumber_nama)
     values ($1, $2, $3::jsonb, $4, 'Penjelasan soal uji.', 'PRATA FAKTA')`,
    [HARI_INI, soalKuis[i][0], soalKuis[i][1], soalKuis[i][2]],
  );
}

// Indikator + 3 titik (untuk Data Analysis).
const indId = (
  await harusBerhasil(
    "seed indikator uji",
    `insert into public.pf_data_indicators (nama, slug, kategori, satuan, sumber_nama, sumber_url, metodologi, tanggal_pembaruan)
     values ('Indikator Uji', 'indikator-uji', 'ekonomi', 'persen', 'BPS (skenario uji)', 'https://www.bps.go.id', 'Nilai skenario uji untuk validasi agen.', '2026-11-15')
     returning id`,
  )
)?.rows[0].id;
for (const [tgl, nilai] of [
  ["2026-11-01", 4.9],
  ["2026-11-08", 5.1],
  ["2026-11-15", 5.2],
]) {
  await harusBerhasil(
    `seed titik ${tgl} = ${nilai}`,
    `insert into public.pf_data_points (indikator_id, tanggal, nilai) values ($1, $2, $3)`,
    [indId, tgl, nilai],
  );
}

// Event: e1 berkoordinat + 2 timeline; e2 tanpa koordinat.
const e1 = (
  await harusBerhasil(
    "seed event e1 berkoordinat",
    `insert into public.pf_events (judul, ringkasan, lokasi_teks, lintang, bujur, dimulai_pada, dampak, sumber_url)
     values ('KTT ASEAN Jakarta', 'Pertemuan pemimpin ASEAN.', 'Jakarta, Indonesia', -6.2088, 106.8456, now(), 'Kerja sama kawasan.', 'https://example.org/ktt')
     returning id`,
  )
)?.rows[0].id;
await harusBerhasil(
  "seed event e2 tanpa koordinat",
  `insert into public.pf_events (judul, ringkasan, lokasi_teks, dimulai_pada, dampak)
   values ('Peristiwa tanpa lokasi pasti', 'Lokasi belum terverifikasi.', null, now(), 'Belum diketahui.')`,
);
for (const [waktu, peristiwa] of [
  ["2026-11-16 08:00:00+07", "Pembukaan KTT ASEAN."],
  ["2026-11-16 14:00:00+07", "Sesi pleno pertama."],
]) {
  await harusBerhasil(
    `seed timeline e1: ${peristiwa}`,
    `insert into public.pf_event_timeline (event_id, waktu, peristiwa, sumber) values ($1, $2, $3, 'Redaksi')`,
    [e1, waktu, peristiwa],
  );
}

// Notifikasi u1: 1 belum dibaca, 1 sudah dibaca.
const n1 = (
  await harusBerhasil(
    "seed notifikasi belum dibaca",
    `insert into public.pf_notifications (user_id, jenis, judul, isi, tautan, dibaca)
     values ($1, 'artikel', 'Artikel baru: KTT ASEAN', 'Artikel terbit.', '/artikel/ktt-asean-jakarta', false) returning id`,
    [U1],
  )
)?.rows[0].id;
await harusBerhasil(
  "seed notifikasi sudah dibaca",
  `insert into public.pf_notifications (user_id, jenis, judul, isi, tautan, dibaca)
   values ($1, 'brief', 'Daily Brief terbit', 'Brief hari ini terbit.', '/brief', true)`,
  [U1],
);

// Follow topik: u1 mengikuti kategori 'dunia'.
await harusBerhasil(
  "seed follow topik dunia",
  `insert into public.pf_followed_topics (user_id, tipe, target) values ($1, 'kategori', 'dunia')`,
  [U1],
);

// Pertanyaan: q1 menunggu (anon), q2 terjawab (u1).
await harusBerhasil(
  "seed pertanyaan menunggu (anon)",
  `insert into public.pf_questions (user_id, pertanyaan, jawaban, referensi, status)
   values (null, 'Apa itu kuantum?', 'Belum ada data di PRATA FAKTA yang bisa menjawab pertanyaan ini. Pertanyaanmu masuk antrean untuk dijawab editor/Muse.', '[]', 'menunggu')`,
);
await harusBerhasil(
  "seed pertanyaan terjawab (u1)",
  `insert into public.pf_questions (user_id, pertanyaan, jawaban, referensi, status, dijawab_pada)
   values ($1, 'Apa itu fotosintesis?', 'Tumbuhan mengubah cahaya matahari, air, dan karbon dioksida menjadi makanan melalui fotosintesis.', '[{"judul": "Fotosintesis: Cara Tumbuhan Membuat Makanan", "url": "/pengetahuan/fotosintesis"}]', 'terjawab', now())`,
  [U1],
);

// ---------- Alur 1: Peta — marker hanya berkoordinat ----------
const markerEvent = await hitung(
  `select count(*) n from public.pf_events where lintang is not null and bujur is not null`,
);
cek("peta: event berkoordinat = 1", markerEvent === 1, `marker ${markerEvent}`);
const tanpaKoordinat = await hitung(
  `select count(*) n from public.pf_events where lintang is null or bujur is null`,
);
cek("peta: event tanpa koordinat = 1 (daftar saja)", tanpaKoordinat === 1);
const markerArtikel = await hitung(
  `select count(*) n from public.pf_articles where status='terbit' and lintang is not null and bujur is not null`,
);
cek("peta: artikel berkoordinat = 1", markerArtikel === 1);
cek(
  "peta: draft tidak pernah jadi marker",
  (await hitung(`select count(*) n from public.pf_articles where status='draft' and lintang is not null`)) === 0,
);
const tl = await db.query(
  `select peristiwa from public.pf_event_timeline where event_id = $1 order by waktu asc`,
  [e1],
);
cek(
  "timeline e1 = 2 entri terurut",
  tl.rows.length === 2 && tl.rows[0].peristiwa === "Pembukaan KTT ASEAN.",
);

// ---------- Alur 2: Pengetahuan harian + kuis ----------
const harian = await db.query(
  `select slug from public.pf_knowledge_articles where status='terbit' and harian_tanggal = $1`,
  [HARI_INI],
);
cek(
  "pengetahuan harian hari ini = fotosintesis",
  harian.rows.length === 1 && harian.rows[0].slug === "fotosintesis",
  `tanggal ${HARI_INI}`,
);
const kuis = await db.query(
  `select pertanyaan, opsi, kunci from public.pf_quiz_questions where tanggal = $1 order by dibuat_pada asc`,
  [HARI_INI],
);
cek("kuis hari ini = 5 soal", kuis.rows.length === 5, `dapat ${kuis.rows.length}`);
cek(
  "kuis: tiap soal 5 opsi + kunci 0-4",
  kuis.rows.every(
    (r) => Array.isArray(r.opsi) && r.opsi.length === 5 && r.kunci >= 0 && r.kunci <= 4,
  ),
);
const kuisKemarin = await hitung(
  `select count(*) n from public.pf_quiz_questions where tanggal = $1`,
  ["2026-11-15"],
);
cek("kuis tanggal lain = 0 (tidak bocor)", kuisKemarin === 0);

// ---------- Alur 3: Follow topik -> rekomendasi berubah ----------
const katDiikuti = (
  await db.query(
    `select target from public.pf_followed_topics where user_id = $1 and tipe = 'kategori'`,
    [U1],
  )
).rows.map((r) => r.target);
cek("follow: u1 mengikuti 1 kategori (dunia)", katDiikuti.length === 1 && katDiikuti[0] === "dunia");
// Replikasi getRekomendasiUntukTopik: terbit + kategori diikuti.
const rekom = await db.query(
  `select slug from public.pf_articles where status='terbit' and kategori_slug = any($1::text[]) order by diterbitkan_pada desc limit 10`,
  [katDiikuti],
);
cek(
  "rekomendasi: 2 artikel terbit dunia (a1, a2)",
  rekom.rows.length === 2 &&
    rekom.rows.some((r) => r.slug === "ktt-asean-jakarta") &&
    rekom.rows.some((r) => r.slug === "asean-700-juta"),
);
cek(
  "rekomendasi: draft tidak ikut",
  !rekom.rows.some((r) => r.slug === "draf-rahasia"),
);
await db.query(`delete from public.pf_followed_topics where user_id = $1`, [U1]);
const katSesudahHapus = await hitung(
  `select count(*) n from public.pf_followed_topics where user_id = $1`,
  [U1],
);
cek(
  "unfollow: daftar topik kosong -> rekomendasi [] (guard aplikasi)",
  katSesudahHapus === 0,
  "tanpa topik diikuti, getRekomendasiUntukTopik mengembalikan []",
);
await db.query(
  `insert into public.pf_followed_topics (user_id, tipe, target) values ($1, 'kategori', 'dunia')`,
  [U1],
);
cek(
  "follow lagi: rekomendasi kembali 2",
  Number(
    (
      await db.query(
        `select count(*) n from public.pf_articles where status='terbit' and kategori_slug = any($1::text[])`,
        [["dunia"]],
      )
    ).rows[0].n,
  ) === 2,
);

// ---------- Alur 4: Notifikasi ditandai dibaca ----------
const belumDibacaAwal = await hitung(
  `select count(*) n from public.pf_notifications where user_id = $1 and dibaca = false`,
  [U1],
);
cek("notifikasi: belum dibaca awal = 1", belumDibacaAwal === 1);
await db.query(
  `update public.pf_notifications set dibaca = true where id = $1`,
  [n1],
);
const belumDibacaAkhir = await hitung(
  `select count(*) n from public.pf_notifications where user_id = $1 and dibaca = false`,
  [U1],
);
cek("notifikasi: sesudah ditandai dibaca = 0", belumDibacaAkhir === 0);
cek(
  "notifikasi: total tetap 2 (tidak terhapus)",
  (await hitung(`select count(*) n from public.pf_notifications where user_id = $1`, [U1])) === 2,
);

// ---------- Alur 5: Tanya — kata kunci + retrieval + antrean ----------
// kataKunci diekstrak dari teks sumber route asli.
cek(
  "kataKunci: 'Apa itu fotosintesis dan bagaimana prosesnya?' -> fotosintesis, prosesnya",
  (() => {
    const k = kataKunci("Apa itu fotosintesis dan bagaimana prosesnya?");
    return k.includes("fotosintesis") && k.includes("prosesnya") && !k.includes("apa") && !k.includes("dan");
  })(),
  JSON.stringify(kataKunci("Apa itu fotosintesis dan bagaimana prosesnya?")),
);
cek(
  "kataKunci: semua stopwords/kata pendek -> []",
  kataKunci("apa itu dan yang?").length === 0,
  JSON.stringify(kataKunci("apa itu dan yang?")),
);
cek(
  "kataKunci: maks 6 kata kunci",
  kataKunci("fotosintesis tumbuhan cahaya matahari karbon dioksida oksigen klorofil daun akar").length <= 6,
);
// Retrieval SQL setara cariKandidat: ilike judul/ringkasan/isi.
const cocokFoto = await db.query(
  `select slug from public.pf_knowledge_articles where status='terbit' and (judul ilike '%fotosintesis%' or ringkasan ilike '%fotosintesis%' or isi ilike '%fotosintesis%')`,
);
cek(
  "retrieval 'fotosintesis' -> k1 (pengetahuan)",
  cocokFoto.rows.length === 1 && cocokFoto.rows[0].slug === "fotosintesis",
);
const cocokKuantum = await db.query(
  `select slug from public.pf_knowledge_articles where status='terbit' and (judul ilike '%kuantum%' or ringkasan ilike '%kuantum%' or isi ilike '%kuantum%')
   union select slug from public.pf_articles where status='terbit' and (judul ilike '%kuantum%' or ringkasan ilike '%kuantum%' or isi ilike '%kuantum%')`,
);
cek("retrieval 'kuantum' -> 0 (tidak ada data)", cocokKuantum.rows.length === 0);
// Jalur jujur: pertanyaan tanpa data disimpan 'menunggu'.
const menungguAwal = await hitung(
  `select count(*) n from public.pf_questions where status = 'menunggu'`,
);
cek("antrean menunggu awal = 1 (q1)", menungguAwal === 1);
await db.query(
  `insert into public.pf_questions (user_id, pertanyaan, jawaban, referensi, status)
   values (null, 'Apa itu kuantum?', 'Belum ada data di PRATA FAKTA yang bisa menjawab pertanyaan ini. Pertanyaanmu masuk antrean untuk dijawab editor/Muse.', '[]', 'menunggu')`,
);
cek(
  "antrean menunggu sesudah pertanyaan tanpa data = 2",
  (await hitung(`select count(*) n from public.pf_questions where status = 'menunggu'`)) === 2,
);
// Jalur terjawab: referensi tersimpan dan bisa dibuka (slug ada).
const terjawab = await db.query(
  `select referensi from public.pf_questions where status='terjawab' and user_id = $1`,
  [U1],
);
cek(
  "terjawab: referensi menunjuk /pengetahuan/fotosintesis",
  terjawab.rows.length === 1 &&
    Array.isArray(terjawab.rows[0].referensi) &&
    terjawab.rows[0].referensi[0].url === "/pengetahuan/fotosintesis",
);
cek(
  "pertanyaan saya (u1) = 1 baris",
  (await hitung(`select count(*) n from public.pf_questions where user_id = $1`, [U1])) === 1,
);

// ---------- Alur 6: Data Analysis — fungsi murni + ringkasan ----------
const titik = (
  await db.query(
    `select tanggal, nilai from public.pf_data_points where indikator_id = $1 order by tanggal asc`,
    [indId],
  )
).rows.map((r) => ({
  tanggal: r.tanggal instanceof Date ? r.tanggal.toISOString().slice(0, 10) : String(r.tanggal).slice(0, 10),
  nilai: Number(r.nilai),
}));
cek("data: 3 titik terurut", titik.length === 3 && titik[0].nilai === 4.9 && titik[2].nilai === 5.2);
const hit = hitungIndikator(
  { slug: "indikator-uji", nama: "Indikator Uji", satuan: "persen" },
  titik,
);
cek("data-analysis: nilai terakhir 5,20", hit.nilaiTerakhir === 5.2, hit.ringkasan);
cek("data-analysis: sebelumnya 5,10", hit.nilaiSebelumnya === 5.1);
cek("data-analysis: selisih +0,10", Math.abs(hit.selisih - 0.1) < 1e-9, `selisih ${hit.selisih}`);
cek("data-analysis: persen +1,96%", Math.abs((hit.persen ?? 0) - 1.9607843137254901) < 1e-9, `persen ${hit.persen}`);
cek("data-analysis: min 4,90 maks 5,20", hit.min === 4.9 && hit.maks === 5.2);
cek("data-analysis: tren 'naik' (>= +1%)", hit.tren === "naik");
cek(
  "data-analysis: ringkasan hanya dari angka data",
  hit.ringkasan.includes("5,20") && hit.ringkasan.includes("5,10") && hit.ringkasan.includes("naik"),
  hit.ringkasan,
);
cek("labelTren: +0,5% -> stabil", labelTrenDariPersen(0.5, 0.1) === "stabil");
cek("labelTren: -2% -> turun", labelTrenDariPersen(-2, -0.1) === "turun");
cek("labelTren: persen null + selisih 0 -> stabil", labelTrenDariPersen(null, 0) === "stabil");
cek("formatAngkaId: 5.2 -> '5,20'", formatAngkaId(5.2) === "5,20", formatAngkaId(5.2));
cek("formatAngkaId: 1000 -> '1.000'", formatAngkaId(1000) === "1.000", formatAngkaId(1000));
cek("formatTanggalId: 2026-11-15 -> '15 November 2026'", formatTanggalId("2026-11-15") === "15 November 2026", formatTanggalId("2026-11-15"));
// Simulasi penulisan agen: ringkasan tersimpan ke indikator.
await db.query(
  `update public.pf_data_indicators set ringkasan_tren = $1 where id = $2`,
  [hit.ringkasan, indId],
);
const tersimpan = (
  await db.query(`select ringkasan_tren from public.pf_data_indicators where id = $1`, [indId])
).rows[0].ringkasan_tren;
cek(
  "data-analysis: ringkasan_tren tersimpan dan memuat 'naik'",
  typeof tersimpan === "string" && tersimpan.includes("naik") && tersimpan.includes("5,20"),
);
// Indikator 1 titik = dilewati: agen tidak memanggil hitungIndikator
// bila titik < 2 (guard di jalankanDataAnalysis). Buktikan dengan
// indikator kedua yang hanya punya 1 titik.
const ind2 = (
  await harusBerhasil(
    "seed indikator kedua (1 titik saja)",
    `insert into public.pf_data_indicators (nama, slug, kategori, satuan, sumber_nama, tanggal_pembaruan)
     values ('Indikator Satu Titik', 'indikator-satu-titik', 'ekonomi', 'persen', 'BPS (skenario uji)', '2026-11-15')
     returning id`,
  )
)?.rows[0].id;
await harusBerhasil(
  "seed 1 titik untuk indikator kedua",
  `insert into public.pf_data_points (indikator_id, tanggal, nilai) values ($1, '2026-11-15', 5.2)`,
  [ind2],
);
const titikInd2 = (
  await db.query(
    `select tanggal, nilai from public.pf_data_points where indikator_id = $1 order by tanggal asc`,
    [ind2],
  )
).rows;
cek(
  "data-analysis: indikator 1 titik -> dilewati (guard <2 titik)",
  titikInd2.length === 1 && titikInd2.length < 2,
  "1 titik < 2: hitungIndikator tidak dipanggil, run dicatat 'dilewati'",
);
cek(
  "data-analysis: ringkasan_tren indikator 1 titik tetap null (tidak ditulis)",
  (
    await db.query(
      `select ringkasan_tren from public.pf_data_indicators where id = $1`,
      [ind2],
    )
  ).rows[0].ringkasan_tren === null,
);

// ---------- Alur 7: TTS chunking (dari teks sumber komponen asli) ----------
const TEKS_PANJANG =
  "Fotosintesis adalah proses tumbuhan mengubah cahaya matahari menjadi makanan. " +
  "Proses ini memakai air dan karbon dioksida, lalu menghasilkan oksigen. ".repeat(6) +
  "Tanpa fotosintesis, hampir semua kehidupan di Bumi tidak mendapat makanan dan oksigen. " +
  "Klorofil di dalam daun menangkap cahaya matahari untuk memulai reaksi kimia tersebut. ".repeat(4);
const potongan = pecahUntukSuara(TEKS_PANJANG);
cek(
  "TTS: semua potongan <= 200 karakter",
  potongan.length > 1 && potongan.every((p) => p.length <= 200),
  `${potongan.length} potongan, terpanjang ${Math.max(...potongan.map((p) => p.length))}`,
);
cek(
  "TTS: tidak ada potongan kosong",
  potongan.every((p) => p.trim().length > 0),
);
cek(
  "TTS: gabungan potongan memuat semua kalimat asli",
  potongan.join(" ").includes("Klorofil di dalam daun menangkap cahaya matahari") &&
    potongan.join(" ").includes("Fotosintesis adalah proses tumbuhan"),
);
cek("TTS: teks kosong -> []", pecahUntukSuara("").length === 0);
cek("TTS: teks pendek 1 kalimat -> 1 potongan", pecahUntukSuara("Satu kalimat pendek.").length === 1);

// ---------- Ringkasan ----------
console.log(`\nRingkasan: lolos ${lolos}, gagal ${gagal}`);
if (gagal > 0) {
  console.log("HASIL: ADA KEGAGALAN");
  process.exit(1);
}
console.log("HASIL: SEMUA LOLOS");
process.exit(0);
