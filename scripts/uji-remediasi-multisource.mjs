// Uji Remediasi Multi-Source View PRATA FAKTA -> PGlite + fungsi murni.
// Langkah: (a) PGlite + stub auth + role anon/authenticated +
// migrasi v1..v8 (v7 2x, v8 2x); (b) buat RPC pf_akar_salinan
// DENGAN DEFINISI YANG SAMA PERSIS seperti kontrak v9 (DDL
// test-lokal di skrip ini — v9 asli dibuat agen lain, JANGAN
// import dari berkas migrasi); (c) seed Kasus X (1 berita disalin
// 3 media) dan Kasus Y (3 liputan independen) lalu panggil RPC
// sebagai anon: X -> 1 akar, Y -> 3 akar; artikel draf -> kosong;
// anon tidak bisa SELECT pf_raw_items langsung (RLS tetap
// menolak); anti-siklus + trailing slash; (d) uji fungsi murni
// dari src/lib/data.ts via ekstraksi + transpilasi TS (pola
// uji-fase7.mjs): normalisasiJudul, kemiripanJudul,
// hitungBobotPerbandingan — X vs Y di TAMPILAN (independen 1 vs
// 3), parafrase, beda_waktu, bukti tak tercocokkan, fallback
// bila RPC tak tersedia; (e) pemeriksaan statis: pemanggilan RPC
// di getPerbandinganSumber, tanpa service-role client, string
// wajib di komponen.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = require("@electric-sql/pglite");

const requireRepo = createRequire(new URL("../package.json", import.meta.url).pathname);
const ts = requireRepo("typescript");
function transpileKeJs(kodeTs) {
  return ts.transpileModule(kodeTs, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
}

const DIR_MIGRASI = new URL("../supabase/migrations/", import.meta.url).pathname;
const DIR_REPO = new URL("../", import.meta.url).pathname;

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

function bacaRepo(relatif) {
  return fs.readFileSync(`${DIR_REPO}/${relatif}`, "utf8");
}

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

/** Jalankan SQL sebagai role tertentu (RLS berlaku), lalu kembali. */
async function sebagai(role, sql, params = []) {
  await db.query(`set role ${role}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.query("reset role");
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
await db.exec(`create role anon nologin;`);
await db.exec(`create role authenticated nologin;`);

let ok = await jalankan("v1", baca("20261116_pf_v1_foundation.sql"));
if (ok) ok = await jalankan("v2", baca("20261116_pf_v2_articles.sql"));
if (ok) ok = await jalankan("v3", baca("20261116_pf_v3_ingestion.sql"));
if (ok) ok = await jalankan("v4", baca("20261116_pf_v4_ai.sql"));
if (ok) ok = await jalankan("v5", baca("20261116_pf_v5_editorial.sql"));
if (ok) ok = await jalankan("v6", baca("20261116_pf_v6_advanced.sql"));
if (ok) ok = await jalankan("v7 putaran 1", baca("20261116_pf_v7_quiz_scores.sql"));
if (ok) ok = await jalankan("v7 putaran 2 (idempotensi)", baca("20261116_pf_v7_quiz_scores.sql"));
if (ok) ok = await jalankan("v8 putaran 1", baca("20261116_pf_v8_expansion.sql"));
if (ok) ok = await jalankan("v8 putaran 2 (idempotensi)", baca("20261116_pf_v8_expansion.sql"));
if (!ok) {
  console.log("HASIL: MIGRASI GAGAL");
  process.exit(1);
}

// ---------- RPC pf_akar_salinan (DDL test-lokal, = kontrak v9) ----------
// Ditulis lengkap di sini (bukan import migrasi v9 — v9 milik agen
// lain). SECURITY DEFINER + SET search_path=public; GRANT EXECUTE
// ke anon, authenticated.
const SQL_RPC = `
create or replace function public.pf_akar_salinan(p_artikel_id uuid, p_url text[])
returns table (
  url text,
  item_id uuid,
  akar_id uuid,
  akar_sumber_id uuid,
  akar_nama text,
  disalin boolean,
  judul text,
  akar_judul text,
  waktu_terbit_asli timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_status text;
  v_url text;
  v_item public.pf_raw_items%rowtype;
  v_akar public.pf_raw_items%rowtype;
  v_hop integer;
  v_dikunjungi uuid[];
  v_nama text;
begin
  select a.status into v_status from public.pf_articles a where a.id = p_artikel_id;
  if v_status is null or v_status <> 'terbit' then
    return;
  end if;
  foreach v_url in array p_url loop
    select r.* into v_item
      from public.pf_raw_items r
      where r.url = v_url or rtrim(r.url, '/') = rtrim(v_url, '/')
      order by r.waktu_diambil desc
      limit 1;
    if v_item.id is null then
      continue;
    end if;
    v_akar := v_item;
    v_hop := 0;
    v_dikunjungi := array[v_item.id];
    while v_akar.disalin_dari_id is not null and v_hop < 20 loop
      select r.* into v_akar
        from public.pf_raw_items r
        where r.id = v_akar.disalin_dari_id;
      if v_akar.id is null then
        exit;
      end if;
      if v_akar.id = any(v_dikunjungi) then
        exit;
      end if;
      v_dikunjungi := v_dikunjungi || v_akar.id;
      v_hop := v_hop + 1;
    end loop;
    select s.nama into v_nama from public.pf_sources s where s.id = v_akar.sumber_id;
    url := v_url;
    item_id := v_item.id;
    akar_id := v_akar.id;
    akar_sumber_id := v_akar.sumber_id;
    akar_nama := v_nama;
    disalin := (v_item.disalin_dari_id is not null);
    judul := v_item.judul;
    akar_judul := v_akar.judul;
    waktu_terbit_asli := v_akar.waktu_terbit_asli;
    return next;
  end loop;
  return;
end;
$$;
grant execute on function public.pf_akar_salinan(uuid, text[]) to anon, authenticated;
`;
ok = await jalankan("RPC pf_akar_salinan (test-lokal, = kontrak v9)", SQL_RPC);
if (!ok) {
  console.log("HASIL: RPC GAGAL DIBUAT");
  process.exit(1);
}

cek(
  "RPC pf_akar_salinan SECURITY DEFINER",
  Number(
    (await db.query(`select count(*) n from pg_proc where proname='pf_akar_salinan' and prosecdef`))
      .rows[0].n,
  ) === 1,
);

// ---------- Seed Kasus X / Y ----------
// UUID eksplisit agar rujukan silang mudah.
const ART_X = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ART_Y = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const ART_D = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const S_ASLI = "11111111-1111-4111-8111-111111111101";
const S_SALIN1 = "11111111-1111-4111-8111-111111111102";
const S_SALIN2 = "11111111-1111-4111-8111-111111111103";
const S_MA = "11111111-1111-4111-8111-111111111104";
const S_MB = "11111111-1111-4111-8111-111111111105";
const S_MC = "11111111-1111-4111-8111-111111111106";
const I_ASLI = "22222222-2222-4222-8222-222222222201";
const I_S1 = "22222222-2222-4222-8222-222222222202";
const I_S2 = "22222222-2222-4222-8222-222222222203";
const I_SIKLUS = "22222222-2222-4222-8222-222222222204";
const I_YA = "22222222-2222-4222-8222-222222222205";
const I_YB = "22222222-2222-4222-8222-222222222206";
const I_YC = "22222222-2222-4222-8222-222222222207";
const I_D = "22222222-2222-4222-8222-222222222208";
const K_X = "33333333-3333-4333-8333-333333333301";
const K_Y = "33333333-3333-4333-8333-333333333302";

const katSlug = (
  await db.query(
    `select slug from pf_categories where induk_id is null order by slug limit 1`,
  )
).rows[0].slug;

await db.exec(`
insert into public.pf_sources (id, nama, jenis, url, prioritas) values
  ('${S_ASLI}', 'Uji Asli', 'manual', 'https://uji.local/asli', 100),
  ('${S_SALIN1}', 'Uji Salin Satu', 'manual', 'https://uji.local/salin1', 60),
  ('${S_SALIN2}', 'Uji Salin Dua', 'manual', 'https://uji.local/salin2', 50),
  ('${S_MA}', 'Uji Mandiri A', 'manual', 'https://uji.local/mandiri-a', 100),
  ('${S_MB}', 'Uji Mandiri B', 'manual', 'https://uji.local/mandiri-b', 80),
  ('${S_MC}', 'Uji Mandiri C', 'manual', 'https://uji.local/mandiri-c', 60);
insert into public.pf_articles (id, slug, judul, ringkasan, isi, kategori_slug, status, sumber_url) values
  ('${ART_X}', 'uji-multisource-x', 'Artikel Uji X', '', '', '${katSlug}', 'terbit', 'https://uji.local/artikel-x'),
  ('${ART_Y}', 'uji-multisource-y', 'Artikel Uji Y', '', '', '${katSlug}', 'terbit', 'https://uji.local/artikel-y'),
  ('${ART_D}', 'uji-multisource-draf', 'Artikel Uji Draf', '', '', '${katSlug}', 'draft', 'https://uji.local/artikel-draf');
insert into public.pf_raw_items (id, sumber_id, url, hash_url, judul, hash_judul, status, disalin_dari_id, waktu_terbit_asli) values
  ('${I_ASLI}', '${S_ASLI}', 'https://uji.local/berita/asli', 'hash-x-asli', 'Pemerintah naikkan gaji guru 2026', 'hj-x-asli', 'baru', null, '2026-11-10 08:00:00+07'),
  ('${I_S1}', '${S_SALIN1}', 'https://uji.local/berita/salin1', 'hash-x-s1', 'Pemerintah naikkan gaji guru 2026', 'hj-x-s1', 'disalin_dari', '${I_ASLI}', '2026-11-10 09:00:00+07'),
  ('${I_S2}', '${S_SALIN2}', 'https://uji.local/berita/salin2', 'hash-x-s2', 'Pemerintah naikkan gaji guru 2026', 'hj-x-s2', 'disalin_dari', '${I_ASLI}', '2026-11-10 10:00:00+07'),
  ('${I_SIKLUS}', '${S_ASLI}', 'https://uji.local/berita/siklus', 'hash-x-siklus', 'Berita siklus uji', 'hj-x-siklus', 'baru', '${I_SIKLUS}', '2026-11-10 11:00:00+07'),
  ('${I_YA}', '${S_MA}', 'https://uji.local/berita/ya', 'hash-y-a', 'Pemerintah naikkan gaji guru 2026', 'hj-y-a', 'baru', null, '2026-11-10 08:00:00+07'),
  ('${I_YB}', '${S_MB}', 'https://uji.local/berita/yb', 'hash-y-b', 'Gaji guru naik, pemerintah siapkan anggaran baru', 'hj-y-b', 'baru', null, '2026-11-10 09:00:00+07'),
  ('${I_YC}', '${S_MC}', 'https://uji.local/berita/yc', 'hash-y-c', 'Kenaikan gaji guru disambut serikat pekerja', 'hj-y-c', 'baru', null, '2026-11-10 10:00:00+07'),
  ('${I_D}', '${S_ASLI}', 'https://uji.local/berita/draf', 'hash-d', 'Berita draf uji', 'hj-d', 'baru', null, '2026-11-10 08:00:00+07');
insert into public.pf_article_sources (artikel_id, sumber_id, url, peran) values
  ('${ART_X}', '${S_ASLI}', 'https://uji.local/berita/asli', 'koroborasi'),
  ('${ART_X}', '${S_SALIN1}', 'https://uji.local/berita/salin1', 'koroborasi'),
  ('${ART_X}', '${S_SALIN2}', 'https://uji.local/berita/salin2', 'koroborasi'),
  ('${ART_Y}', '${S_MA}', 'https://uji.local/berita/ya', 'koroborasi'),
  ('${ART_Y}', '${S_MB}', 'https://uji.local/berita/yb', 'koroborasi'),
  ('${ART_Y}', '${S_MC}', 'https://uji.local/berita/yc', 'koroborasi');
insert into public.pf_claims (id, artikel_id, teks, jenis) values
  ('${K_X}', '${ART_X}', 'Gaji guru naik pada 2026', 'fakta'),
  ('${K_Y}', '${ART_Y}', 'Gaji guru naik pada 2026', 'fakta');
insert into public.pf_evidence (klaim_id, sumber_url, sumber_nama, arah, dibuat_pada) values
  ('${K_X}', 'https://uji.local/berita/asli', 'Uji Asli', 'mendukung', '2026-11-10 08:00:00+07'),
  ('${K_X}', 'https://uji.local/berita/salin1', 'Uji Salin Satu', 'mendukung', '2026-11-10 09:00:00+07'),
  ('${K_X}', 'https://uji.local/berita/salin2', 'Uji Salin Dua', 'mendukung', '2026-11-10 10:00:00+07'),
  ('${K_Y}', 'https://uji.local/berita/ya', 'Uji Mandiri A', 'mendukung', '2026-11-10 08:00:00+07'),
  ('${K_Y}', 'https://uji.local/berita/yb', 'Uji Mandiri B', 'mendukung', '2026-11-10 09:00:00+07'),
  ('${K_Y}', 'https://uji.local/berita/yc', 'Uji Mandiri C', 'mendukung', '2026-11-10 10:00:00+07');
`);

// ---------- Uji RPC sebagai anon ----------
const panggilRpc = (artikelId, urls) =>
  sebagai("anon", `select * from public.pf_akar_salinan($1, $2)`, [artikelId, urls]);

const rx = (
  await panggilRpc(ART_X, [
    "https://uji.local/berita/asli",
    "https://uji.local/berita/salin1",
    "https://uji.local/berita/salin2",
  ])
).rows;
cek("RPC X: 3 baris untuk 3 URL", rx.length === 3, `${rx.length} baris`);
cek(
  "RPC X: 1 akar berbeda (disalin 3 media = 1)",
  new Set(rx.map((r) => r.akar_id)).size === 1,
  `akar: ${[...new Set(rx.map((r) => r.akar_id))].join(",")}`,
);
cek(
  "RPC X: akar = item asli Antara-uji",
  rx.every((r) => r.akar_id === I_ASLI),
);
cek(
  "RPC X: akar_sumber_id = sumber asli",
  rx.every((r) => r.akar_sumber_id === S_ASLI),
);
cek(
  "RPC X: flag disalin [asli=false, salin1=true, salin2=true]",
  rx.find((r) => r.url === "https://uji.local/berita/asli").disalin === false &&
    rx.find((r) => r.url === "https://uji.local/berita/salin1").disalin === true &&
    rx.find((r) => r.url === "https://uji.local/berita/salin2").disalin === true,
);
cek(
  "RPC X: akar_nama = Uji Asli di semua baris",
  rx.every((r) => r.akar_nama === "Uji Asli"),
);
cek(
  "RPC X: akar_judul = judul item asli",
  rx.every((r) => r.akar_judul === "Pemerintah naikkan gaji guru 2026"),
);

const ry = (
  await panggilRpc(ART_Y, [
    "https://uji.local/berita/ya",
    "https://uji.local/berita/yb",
    "https://uji.local/berita/yc",
  ])
).rows;
cek("RPC Y: 3 baris untuk 3 URL", ry.length === 3, `${ry.length} baris`);
cek(
  "RPC Y: 3 akar berbeda (3 liputan independen)",
  new Set(ry.map((r) => r.akar_id)).size === 3,
);
cek("RPC Y: semua disalin=false", ry.every((r) => r.disalin === false));

const rSlash = (
  await panggilRpc(ART_X, ["https://uji.local/berita/asli/"])
).rows;
cek(
  "RPC: URL dengan trailing slash tetap cocok",
  rSlash.length === 1 && rSlash[0].akar_id === I_ASLI,
);

const rTakAda = (await panggilRpc(ART_X, ["https://uji.local/tidak-ada"])).rows;
cek("RPC: URL tak dikenal -> 0 baris", rTakAda.length === 0);

const rDraf = (
  await panggilRpc(ART_D, ["https://uji.local/berita/draf"])
).rows;
cek("RPC: artikel draf -> himpunan kosong", rDraf.length === 0);

const rTakAdaArtikel = (
  await panggilRpc("99999999-9999-4999-8999-999999999999", [
    "https://uji.local/berita/asli",
  ])
).rows;
cek("RPC: artikel tak ada -> himpunan kosong", rTakAdaArtikel.length === 0);

const rSiklus = (
  await panggilRpc(ART_X, ["https://uji.local/berita/siklus"])
).rows;
cek(
  "RPC: siklus disalin_dari (diri sendiri) berhenti, akar = item itu sendiri",
  rSiklus.length === 1 && rSiklus[0].akar_id === I_SIKLUS,
);

// Di Supabase nyata anon punya GRANT tabel + RLS memfilter ke 0
// baris; di PGlite anon bahkan tanpa GRANT tabel sehingga SELECT
// melempar 42501. Keduanya membuktikan hal yang sama: anon tidak
// bisa membaca pf_raw_items langsung (hanya lewat RPC definer).
let rawAnonDitolak = false;
let rawAnonBaris = -1;
try {
  rawAnonBaris = (
    await sebagai("anon", `select id from public.pf_raw_items`)
  ).rows.length;
} catch (e) {
  rawAnonDitolak = String(e.code ?? e.message).includes("42501");
}
cek(
  "RLS: anon TIDAK bisa SELECT pf_raw_items langsung (ditolak 42501 atau 0 baris)",
  rawAnonDitolak || rawAnonBaris === 0,
  rawAnonDitolak ? "permission denied 42501" : `${rawAnonBaris} baris`,
);

// ---------- Uji fungsi murni dari src/lib/data.ts ----------
const dataSrc = bacaRepo("src/lib/data.ts");
const fnNormalisasi = /export function normalisasiJudul\([\s\S]*?\n\}/.exec(dataSrc)?.[0];
const fnKemiripan = /export function kemiripanJudul\([\s\S]*?\n\}/.exec(dataSrc)?.[0];
const fnHitung = /export function hitungBobotPerbandingan\([\s\S]*?\n\}/.exec(dataSrc)?.[0];
cek("normalisasiJudul dapat diekstrak dari sumber", Boolean(fnNormalisasi));
cek("kemiripanJudul dapat diekstrak dari sumber", Boolean(fnKemiripan));
cek("hitungBobotPerbandingan dapat diekstrak dari sumber", Boolean(fnHitung));
cek(
  "hitungBobotPerbandingan terekstrak utuh (sampai return akhir)",
  Boolean(fnHitung && fnHitung.includes("return { bobot, sel, buktiTakTercocokkan: takCocok, parafrase };")),
);

let normalisasiJudul;
let kemiripanJudul;
let hitungBobotPerbandingan;
if (fnNormalisasi && fnKemiripan && fnHitung) {
  ({ normalisasiJudul, kemiripanJudul, hitungBobotPerbandingan } = new Function(
    transpileKeJs(
      `${fnNormalisasi.replace("export function", "function")}\n${fnKemiripan.replace("export function", "function")}\n${fnHitung.replace("export function", "function")}\nreturn { normalisasiJudul, kemiripanJudul, hitungBobotPerbandingan };`,
    ),
  )());
}

const ev = (o) => ({
  klaimId: o.klaimId ?? "k1",
  sumberId: o.sumberId ?? null,
  arah: o.arah ?? "mendukung",
  tanggal: o.tanggal ?? null,
  akarKunci: o.akarKunci ?? null,
  disalin: o.disalin ?? false,
  disalinDari: o.disalinDari ?? null,
  akarJudul: o.akarJudul ?? null,
  akarNama: o.akarNama ?? null,
  rantaiTerverifikasi: o.rantaiTerverifikasi ?? false,
  sumberUrl: o.sumberUrl ?? "",
  sumberNama: o.sumberNama ?? null,
  kutipan: o.kutipan ?? null,
});

if (hitungBobotPerbandingan) {
  cek(
    "normalisasiJudul: huruf kecil + buang tanda baca + rapatkan spasi",
    normalisasiJudul("Pemerintah  Naikkan, Gaji Guru! 2026") ===
      "pemerintah naikkan gaji guru 2026",
  );
  cek(
    "kemiripanJudul: judul identik = 1",
    kemiripanJudul("Gaji Guru Naik 2026", "gaji guru naik 2026") === 1,
  );
  cek(
    "kemiripanJudul: judul jelas beda = 0",
    kemiripanJudul("Pemerintah naikkan gaji guru 2026", "Timnas menang lawan Thailand di final") === 0,
  );
  cek(
    "kemiripanJudul: parafrase dekat >= 0,8",
    kemiripanJudul(
      "Pemerintah naikkan gaji guru tahun 2026",
      "Pemerintah naikkan gaji guru 2026",
    ) >= 0.8,
    `Jaccard = ${kemiripanJudul("Pemerintah naikkan gaji guru tahun 2026", "Pemerintah naikkan gaji guru 2026").toFixed(3)}`,
  );

  // --- Kasus X di TAMPILAN: 1 berita disalin 3 media ---
  const hasilX = hitungBobotPerbandingan(
    ["k1"],
    ["u", "s1", "s2"],
    [
      ev({ sumberId: "u", akarKunci: "akar-asli", akarJudul: "Pemerintah naikkan gaji guru 2026", akarNama: "Uji Asli", rantaiTerverifikasi: true, sumberUrl: "https://uji.local/berita/asli" }),
      ev({ sumberId: "s1", akarKunci: "akar-asli", disalin: true, disalinDari: "Uji Asli", akarJudul: "Pemerintah naikkan gaji guru 2026", akarNama: "Uji Asli", rantaiTerverifikasi: true, sumberUrl: "https://uji.local/berita/salin1" }),
      ev({ sumberId: "s2", akarKunci: "akar-asli", disalin: true, disalinDari: "Uji Asli", akarJudul: "Pemerintah naikkan gaji guru 2026", akarNama: "Uji Asli", rantaiTerverifikasi: true, sumberUrl: "https://uji.local/berita/salin2" }),
    ],
    { "akar-asli": 90 },
    "u",
  );
  const bX = hasilX.bobot[0];
  cek("TAMPILAN X: independen = 1 (bukan 3)", bX.independen === 1, `independen=${bX.independen}`);
  cek("TAMPILAN X: salinan = 2", bX.salinan === 2, `salinan=${bX.salinan}`);
  cek("TAMPILAN X: independenTerverifikasi = 1", bX.independenTerverifikasi === 1, `terverifikasi=${bX.independenTerverifikasi}`);
  cek("TAMPILAN X: kemungkinanParafrase = 0", bX.kemungkinanParafrase === 0);
  cek("TAMPILAN X: buktiTakTercocokkan = 0", bX.buktiTakTercocokkan === 0);
  cek(
    "TAMPILAN X: skorTertinggi = 90 dari tier AKAR (bukan tier penyalin 60/50)",
    bX.skorTertinggi === 90,
    `skorTertinggi=${bX.skorTertinggi}`,
  );
  cek(
    "TAMPILAN X: sel salinan bertanda salinan + Disalin dari Uji Asli",
    hasilX.sel.k1.s1.salinan === true &&
      hasilX.sel.k1.s1.disalinDari === "Uji Asli" &&
      hasilX.sel.k1.s2.salinan === true &&
      hasilX.sel.k1.u.salinan === false,
  );
  cek(
    "TAMPILAN X: semua sel 'sama'",
    hasilX.sel.k1.u.status === "sama" &&
      hasilX.sel.k1.s1.status === "sama" &&
      hasilX.sel.k1.s2.status === "sama",
  );

  // --- Kasus Y di TAMPILAN: 3 liputan independen ---
  const hasilY = hitungBobotPerbandingan(
    ["k1"],
    ["a", "b", "c"],
    [
      ev({ sumberId: "a", akarKunci: "akar-a", akarJudul: "Pemerintah naikkan gaji guru 2026", akarNama: "Uji Mandiri A", rantaiTerverifikasi: true, sumberUrl: "https://uji.local/berita/ya" }),
      ev({ sumberId: "b", akarKunci: "akar-b", akarJudul: "Gaji guru naik, pemerintah siapkan anggaran baru", akarNama: "Uji Mandiri B", rantaiTerverifikasi: true, sumberUrl: "https://uji.local/berita/yb" }),
      ev({ sumberId: "c", akarKunci: "akar-c", akarJudul: "Kenaikan gaji guru disambut serikat pekerja", akarNama: "Uji Mandiri C", rantaiTerverifikasi: true, sumberUrl: "https://uji.local/berita/yc" }),
    ],
    { "akar-a": 90, "akar-b": 75, "akar-c": 60 },
    "a",
  );
  const bY = hasilY.bobot[0];
  cek("TAMPILAN Y: independen = 3", bY.independen === 3, `independen=${bY.independen}`);
  cek("TAMPILAN Y: salinan = 0", bY.salinan === 0);
  cek("TAMPILAN Y: independenTerverifikasi = 3", bY.independenTerverifikasi === 3);
  cek("TAMPILAN Y: skorTertinggi = 90", bY.skorTertinggi === 90);
  cek(
    "TAMPILAN: X (1) dibedakan dari Y (3)",
    bX.independen === 1 && bY.independen === 3,
  );

  // --- Parafrase: 2 akar judul mirip tanpa rantai ---
  const hasilP = hitungBobotPerbandingan(
    ["k1"],
    ["p1", "p2"],
    [
      ev({ sumberId: "p1", akarKunci: "akar-p1", akarJudul: "Pemerintah naikkan gaji guru tahun 2026", akarNama: "Media P1", rantaiTerverifikasi: true, sumberUrl: "https://uji.local/p1" }),
      ev({ sumberId: "p2", akarKunci: "akar-p2", akarJudul: "Pemerintah naikkan gaji guru 2026", akarNama: "Media P2", rantaiTerverifikasi: true, sumberUrl: "https://uji.local/p2" }),
    ],
    { "akar-p1": 90, "akar-p2": 75 },
    "p1",
  );
  cek("PARAFRASE: independen = 1 (akar kedua tidak dihitung)", hasilP.bobot[0].independen === 1, `independen=${hasilP.bobot[0].independen}`);
  cek("PARAFRASE: kemungkinanParafrase = 1", hasilP.bobot[0].kemungkinanParafrase === 1);
  cek(
    "PARAFRASE: daftar parafrase berisi akar kedua + miripDengan",
    hasilP.parafrase.length === 1 &&
      hasilP.parafrase[0].akarKunci === "akar-p2" &&
      hasilP.parafrase[0].miripDengan === "Pemerintah naikkan gaji guru tahun 2026",
  );

  // --- Judul jelas beda: tetap 2 independen ---
  const hasilBeda = hitungBobotPerbandingan(
    ["k1"],
    ["p1", "p2"],
    [
      ev({ sumberId: "p1", akarKunci: "akar-p1", akarJudul: "Pemerintah naikkan gaji guru 2026", akarNama: "Media P1", rantaiTerverifikasi: true, sumberUrl: "https://uji.local/p1" }),
      ev({ sumberId: "p2", akarKunci: "akar-p2", akarJudul: "Timnas menang lawan Thailand di final", akarNama: "Media P2", rantaiTerverifikasi: true, sumberUrl: "https://uji.local/p2" }),
    ],
    { "akar-p1": 90, "akar-p2": 75 },
    "p1",
  );
  cek("JUDUL BEDA: independen = 2", hasilBeda.bobot[0].independen === 2);
  cek("JUDUL BEDA: kemungkinanParafrase = 0", hasilBeda.bobot[0].kemungkinanParafrase === 0);
  cek("JUDUL BEDA: daftar parafrase kosong", hasilBeda.parafrase.length === 0);

  // --- beda_waktu: salinan telat (akar sama) -> "sama" ---
  const hasilTelatSalinan = hitungBobotPerbandingan(
    ["k1"],
    ["a", "b"],
    [
      ev({ sumberId: "a", akarKunci: "akar-a", tanggal: "2026-11-10", rantaiTerverifikasi: true, sumberUrl: "https://uji.local/a" }),
      ev({ sumberId: "b", akarKunci: "akar-a", disalin: true, disalinDari: "Media A", tanggal: "2026-11-12", rantaiTerverifikasi: true, sumberUrl: "https://uji.local/b" }),
    ],
    { "akar-a": 90 },
    "a",
  );
  cek(
    'BEDA_WAKTU: salinan telat 2 hari (akar sama) -> sel "sama", BUKAN "beda_waktu"',
    hasilTelatSalinan.sel.k1.b.status === "sama",
    `status=${hasilTelatSalinan.sel.k1.b.status}`,
  );

  // --- beda_waktu: liputan independen telat (akar beda) -> "beda_waktu" ---
  const hasilTelatBaru = hitungBobotPerbandingan(
    ["k1"],
    ["a", "b"],
    [
      ev({ sumberId: "a", akarKunci: "akar-a", tanggal: "2026-11-10", rantaiTerverifikasi: true, sumberUrl: "https://uji.local/a" }),
      ev({ sumberId: "b", akarKunci: "akar-b", tanggal: "2026-11-12", rantaiTerverifikasi: true, sumberUrl: "https://uji.local/b" }),
    ],
    { "akar-a": 90, "akar-b": 75 },
    "a",
  );
  cek(
    'BEDA_WAKTU: liputan independen telat 2 hari (akar beda) -> sel "beda_waktu"',
    hasilTelatBaru.sel.k1.b.status === "beda_waktu",
    `status=${hasilTelatBaru.sel.k1.b.status}`,
  );
  cek(
    'BEDA_WAKTU: sel paling awal tetap "sama"',
    hasilTelatBaru.sel.k1.a.status === "sama",
  );

  // --- Bukti tak tercocokkan: muncul di daftar, tidak hilang ---
  const hasilTakCocok = hitungBobotPerbandingan(
    ["k1"],
    ["a"],
    [
      ev({ sumberId: "a", akarKunci: "akar-a", akarJudul: "Pemerintah naikkan gaji guru 2026", rantaiTerverifikasi: true, sumberUrl: "https://uji.local/a" }),
      ev({ sumberId: null, akarKunci: null, sumberUrl: "https://bbc.com/x", sumberNama: "BBC Indonesia", kutipan: "kutipan uji BBC" }),
    ],
    { "akar-a": 90 },
    "a",
  );
  cek(
    "TAK TERCOCOKKAN: bobot buktiTakTercocokkan = 1",
    hasilTakCocok.bobot[0].buktiTakTercocokkan === 1,
  );
  cek(
    "TAK TERCOCOKKAN: independen tetap 1 (bukti tak cocok tidak dihitung)",
    hasilTakCocok.bobot[0].independen === 1,
  );
  cek(
    "TAK TERCOCOKKAN: daftar berisi BBC + kutipan + arah",
    hasilTakCocok.buktiTakTercocokkan.length === 1 &&
      hasilTakCocok.buktiTakTercocokkan[0].sumber_nama === "BBC Indonesia" &&
      hasilTakCocok.buktiTakTercocokkan[0].sumber_url === "https://bbc.com/x" &&
      hasilTakCocok.buktiTakTercocokkan[0].kutipan === "kutipan uji BBC" &&
      hasilTakCocok.buktiTakTercocokkan[0].arah === "mendukung",
  );
  cek(
    "TAK TERCOCOKKAN: mendukung tetap menghitung semua evidence (2)",
    hasilTakCocok.bobot[0].mendukung === 2,
  );

  // --- Fallback bila RPC tak tersedia: kunci kolom, hitungan lama ---
  const hasilFallback = hitungBobotPerbandingan(
    ["k1"],
    ["u", "s1", "s2"],
    [
      ev({ sumberId: "u", akarKunci: "sumber:u", rantaiTerverifikasi: false, sumberUrl: "https://uji.local/berita/asli" }),
      ev({ sumberId: "s1", akarKunci: "sumber:s1", rantaiTerverifikasi: false, sumberUrl: "https://uji.local/berita/salin1" }),
      ev({ sumberId: "s2", akarKunci: "sumber:s2", rantaiTerverifikasi: false, sumberUrl: "https://uji.local/berita/salin2" }),
    ],
    { "sumber:u": 90, "sumber:s1": 60, "sumber:s2": 60 },
    "u",
  );
  cek(
    "FALLBACK (RPC tak ada): independen = 3 seperti hitungan lama",
    hasilFallback.bobot[0].independen === 3,
    `independen=${hasilFallback.bobot[0].independen}`,
  );
  cek(
    "FALLBACK (RPC tak ada): independenTerverifikasi = 0 (ditandai belum terverifikasi)",
    hasilFallback.bobot[0].independenTerverifikasi === 0,
  );
  cek(
    "FALLBACK (RPC tak ada): skorTertinggi tetap dari tier kolom (90)",
    hasilFallback.bobot[0].skorTertinggi === 90,
  );

  // --- Klaim tanpa bukti + sel belum_diketahui tetap berlaku ---
  const hasilKosong = hitungBobotPerbandingan(
    ["k1", "k2"],
    ["a"],
    [ev({ klaimId: "k1", sumberId: "a", akarKunci: "akar-a", rantaiTerverifikasi: true })],
    { "akar-a": 90 },
    "a",
  );
  cek(
    'Klaim tanpa bukti -> sel "tanpa_bukti", independen 0',
    hasilKosong.sel.k2.a.status === "tanpa_bukti" && hasilKosong.bobot[1].independen === 0,
  );
}

// ---------- Pemeriksaan statis ----------
const getPerbandingan = /export async function getPerbandinganSumber\([\s\S]*?\n\}/.exec(dataSrc)?.[0];
cek("getPerbandinganSumber dapat diekstrak dari sumber", Boolean(getPerbandingan));
if (getPerbandingan) {
  cek(
    "getPerbandinganSumber memanggil supabase.rpc(\"pf_akar_salinan\", { p_artikel_id, p_url })",
    getPerbandingan.includes('supabase.rpc(') &&
      getPerbandingan.includes('"pf_akar_salinan"') &&
      getPerbandingan.includes("p_artikel_id: artikelId") &&
      getPerbandingan.includes("p_url: urlUnik"),
  );
  cek(
    "getPerbandinganSumber TIDAK memakai service-role client",
    !getPerbandingan.includes("ServiceClient") && !getPerbandingan.includes("service_role"),
  );
  cek(
    "getPerbandinganSumber TIDAK query pf_raw_items langsung",
    !getPerbandingan.includes('from("pf_raw_items")'),
  );
  cek(
    "getPerbandinganSumber set rantaiTersedia=false saat RPC gagal",
    getPerbandingan.includes("rantaiTersedia = false") ||
      getPerbandingan.includes("rantaiTersedia=false"),
  );
  cek(
    "getPerbandinganSumber memakai pf_sources untuk tier (baca publik)",
    getPerbandingan.includes('from("pf_sources")'),
  );
}
cek(
  "data.ts: tipe SumberPerbandingan punya akarId/disalinDari/rantaiTerverifikasi",
  dataSrc.includes("akarId: string | null") &&
    dataSrc.includes("disalinDari: string | null") &&
    dataSrc.includes("rantaiTerverifikasi: boolean"),
);
cek(
  "data.ts: tipe BobotKlaim punya salinan/buktiTakTercocokkan/kemungkinanParafrase/independenTerverifikasi",
  dataSrc.includes("salinan: number") &&
    dataSrc.includes("buktiTakTercocokkan: number") &&
    dataSrc.includes("kemungkinanParafrase: number") &&
    dataSrc.includes("independenTerverifikasi: number"),
);
cek(
  "data.ts: return type punya rantaiTersedia + buktiTakTercocokkan + parafrase",
  dataSrc.includes("rantaiTersedia: boolean") &&
    dataSrc.includes("buktiTakTercocokkan: BuktiTakTercocokkan[]") &&
    dataSrc.includes("parafrase: AkarParafrase[]"),
);
cek(
  "data.ts: SELECT evidence tambah id + kutipan",
  dataSrc.includes('"id, klaim_id, sumber_url, sumber_nama, kutipan, arah, dibuat_pada"'),
);

const kompSrc = bacaRepo("src/components/artikel/PerbandinganSumber.tsx");
cek(
  'Komponen: badge "Disalin dari"',
  kompSrc.includes("Disalin dari {s.disalinDari}") &&
    kompSrc.includes("Disalin dari {c.disalinDari}"),
);
cek(
  'Komponen: peringatan "Rantai salinan belum terverifikasi — hitungan independen belum dapat dipastikan"',
  kompSrc.includes("Rantai salinan belum terverifikasi — hitungan independen belum dapat dipastikan"),
);
cek(
  'Komponen: bagian "Bukti yang tidak dapat dicocokkan ke sumber di atas"',
  kompSrc.includes("Bukti yang tidak dapat dicocokkan ke sumber di atas"),
);
cek(
  'Komponen: bagian "Kemungkinan salinan/parafrase — belum terverifikasi sebagai independen"',
  kompSrc.includes("Kemungkinan salinan/parafrase — belum terverifikasi"),
);
cek(
  'Komponen: "Tier tidak diketahui" eksplisit bila tier null',
  kompSrc.includes("Tier tidak diketahui"),
);
cek(
  "Komponen: penjelasan akar rantai salinan = 1 sumber",
  kompSrc.includes("akar rantai salinan = 1 sumber"),
);

// ---------- Ringkasan ----------
console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
if (gagal > 0) {
  console.log("HASIL: ADA KEGAGALAN");
  process.exit(1);
}
console.log("HASIL: SEMUA LOLOS");
