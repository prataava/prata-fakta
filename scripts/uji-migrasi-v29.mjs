// Uji migrasi v29 PRATA FAKTA (paket fitur: batas ulang QC +
//   label sikap manual + job Daily Brief + audit label).
// PGlite in-memory — aman, tidak menyentuh DB produksi.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// CARA JALAN (wajib, dari akar repo):
//   node --experimental-strip-types scripts/jalankan-baterai.mjs scripts/uji-migrasi-v29.mjs
//
// YANG DIUJI:
//   §A  Statis: berkas v29 memuat §1 CHECK status_verifikasi +
//       'DITOLAK' (2 tabel) + §2 kolom counter + §3 kolom label
//       + §4 job pf-brief-harian (0 0 UTC, body terbit+push,
//       tag $job$) + §5 CHECK audit + 'evidence.label'; TIDAK
//       ADA nilai secret harfiah.
//   §B  Live PGlite: v1–v8 + v22 + v28 tanpa §4 diterapkan,
//       lalu v29 tanpa §4: CHECK meluas ke 'DITOLAK' (insert
//       diterima, liar ditolak), kolom default benar, simulasi
//       hitungan 3x -> flip 'DITOLAK', item 'DITOLAK' tidak
//       diklaim antrean UNCONFIRMED, kolom label bisa ditulis,
//       aksi audit 'evidence.label' diterima, idempoten.
//   §C  Statis: kode memakai migrasi (pipeline + adapter +
//       route brief/label + halaman audiens/label-sikap +
//       broadcast + workflow).
//
// BATAS UJI YANG JUJUR:
// - §4 (cron.schedule) TIDAK bisa jalan di PGlite (tidak ada
//   skema cron / pg_net / Vault) — hanya diverifikasi statis
//   di §A; verifikasi live-nya adalah kueri di header migrasi
//   yang dijalankan pemilik di SQL Editor sesudah penerapan.
// - Simulasi hitungan di §B menjalankan SQL yang SAMA dengan
//   yang dipakai adapter (select counter -> update +1 ->
//   flip bersyarat di 3), bukan memanggil metode TS-nya
//   (metode TS diuji mock di scripts/uji-v29.mjs).
import fs from "node:fs";
import path from "node:path";

import { PGlite } from "./butuh-pglite.mjs";

const DIR_REPO = new URL("../", import.meta.url).pathname;
const DIR_MIGRASI = path.join(DIR_REPO, "supabase/migrations");
const V28 = "20261118_pf_v28_pg_cron_scheduler.sql";
const V29 = "20261118_pf_v29_paket_fitur.sql";

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
function baca(rel) {
  return fs.readFileSync(path.join(DIR_REPO, rel), "utf8");
}
function bacaMigrasi(nama) {
  let sql = fs.readFileSync(path.join(DIR_MIGRASI, nama), "utf8");
  sql = sql.replace(/create extension[^;]+;/gi, "-- ekstensi dilepas (PGlite)");
  sql = sql.replace(/\bcitext\b/gi, "text");
  return sql;
}

// ---------- §A: statis berkas v29 ----------
console.log("--- §A statis migrasi v29 ---");
{
  const sql = baca(`supabase/migrations/${V29}`);
  const sqlTanpaKomentar = sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  cek(
    "A1 §1: dua CHECK status_verifikasi v29 (raw_items + articles) memuat 'DITOLAK'",
    sql.includes("pf_raw_items_status_verifikasi_check_v29") &&
      sql.includes("pf_articles_status_verifikasi_check_v29") &&
      (sql.match(/'DITOLAK'/g) ?? []).length >= 2,
  );
  cek(
    "A2 §1: daftar 7 nilai lengkap (6 lama + DITOLAK), tanpa nilai lain",
    sql.includes(
      "'VERIFIED', 'CROSS-CHECKED', 'DEVELOPING', 'UNCONFIRMED', 'DISPUTED', 'CORRECTED', 'DITOLAK'",
    ),
  );
  cek(
    "A3 §2: kolom qc_gagal_berturut_turut integer not null default 0",
    sql.includes(
      "add column if not exists qc_gagal_berturut_turut integer not null default 0",
    ),
  );
  cek(
    "A4 §3: tiga kolom label manual pf_evidence",
    sql.includes("add column if not exists dilabel_manual boolean not null default false") &&
      sql.includes("add column if not exists dilabel_oleh uuid references auth.users (id) on delete set null") &&
      sql.includes("add column if not exists dilabel_pada timestamptz"),
  );
  cek(
    "A5 §4: job pf-brief-harian 0 0 * * * UTC ke /api/ai/brief",
    sql.includes("'pf-brief-harian'") &&
      sql.includes("'0 0 * * *'") &&
      sql.includes("'/api/ai/brief', 'x-pf-ai-secret', 'pf_ai_secret'"),
  );
  cek(
    "A6 §4: body job {dari_artikel_terbit:true, kirim_push:true}",
    sql.includes('{"dari_artikel_terbit":true,"kirim_push":true}'),
  );
  cek(
    "A7 §4: perintah job memakai tag $job$ (bukan nested $$) + unschedule-bila-ada",
    !sql.includes("$$select") &&
      (sql.match(/\$job\$select/g) ?? []).length === 1 &&
      sql.includes("perform cron.unschedule('pf-brief-harian')"),
  );
  cek(
    "A8 §5: CHECK audit v29 + aksi 'evidence.label' (disalin dari v15 + 1)",
    sql.includes("pf_audit_logs_aksi_check_v29") &&
      sql.includes("'evidence.label'") &&
      sql.includes("'akademi.sertifikat.cabut'"),
  );
  cek(
    "A9 TIDAK ADA nilai secret harfiah: create_secret hanya di komentar (0 di SQL eksekusi)",
    !sqlTanpaKomentar.includes("create_secret"),
    "bila gagal: nilai secret tertulis di SQL eksekusi",
  );
  cek(
    "A10 header mendokumentasikan ketergantungan (kode v29 live dulu) + rollback + batas fire-and-forget",
    sql.includes("KETERGANTUNGAN") &&
      sql.includes("FIRE-AND-FORGET") &&
      sql.includes("ROLLBACK"),
  );
}

// ---------- §B: live PGlite ----------
console.log("--- §B live PGlite: CHECK + kolom + batas ulang ---");
{
  const MIGRASI_V1_V8 = [
    "20261116_pf_v1_foundation.sql",
    "20261116_pf_v2_articles.sql",
    "20261116_pf_v3_ingestion.sql",
    "20261116_pf_v4_ai.sql",
    "20261116_pf_v5_editorial.sql",
    "20261116_pf_v6_advanced.sql",
    "20261116_pf_v7_quiz_scores.sql",
    "20261116_pf_v8_expansion.sql",
  ];
  const db = new PGlite();
  await db.exec(`create schema if not exists auth;`);
  await db.exec(`create schema if not exists extensions;`);
  await db.exec(`create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);`);
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('pf.uid_test', true), '')::uuid $$;`);
  await db.exec(`create role anon nologin;`);
  await db.exec(`create role authenticated nologin;`);
  await db.exec(`create role service_role nologin;`);
  let dasarOk = true;
  for (const nama of [...MIGRASI_V1_V8, "20261117_pf_v22_global_intel.sql"]) {
    try {
      await db.exec(bacaMigrasi(nama));
    } catch (e) {
      dasarOk = false;
      console.log(`GAGAL: migrasi ${nama} — ${String(e.message).split("\n")[0]}`);
      break;
    }
  }
  cek("B1 migrasi v1–v8 + v22 diterapkan di PGlite", dasarOk);

  // v28 tanpa §4 (butuh skema cron/pg_net/Vault asli) — urutan
  // produksi: v28 dulu, baru v29.
  const sql28TanpaS4 = bacaMigrasi(V28).split("-- §4.")[0];
  let v28Ok = false;
  try {
    await db.exec(sql28TanpaS4);
    v28Ok = true;
  } catch (e) {
    console.log(`GAGAL: v28 tanpa §4 — ${String(e.message).split("\n")[0]}`);
  }
  cek("B2 v28 §1–§3 diterapkan di PGlite (tanpa §4)", v28Ok);

  // v29 tanpa §4: §1–§3 + §5 (bagian sesudah penanda §5).
  const sql29Penuh = bacaMigrasi(V29);
  const sql29TanpaS4 =
    sql29Penuh.split("-- §4.")[0] + "-- §5." + sql29Penuh.split("-- §5.")[1];
  let v29Ok = false;
  let v29Galat = "";
  try {
    await db.exec(sql29TanpaS4);
    v29Ok = true;
  } catch (e) {
    v29Galat = String(e.message).split("\n")[0];
  }
  cek("B3 v29 §1–§3 + §5 diterapkan di PGlite (tanpa §4)", v29Ok, v29Galat);

  if (v29Ok) {
    const cons = await db.query(
      `select conrelid::regclass::text as tabel, conname from pg_constraint where conname like '%status_verifikasi_check_v29' order by tabel`,
    );
    cek(
      "B4 tepat 2 constraint v29 (satu per tabel)",
      cons.rows.length === 2 &&
        cons.rows.some((r) => r.tabel === "pf_raw_items") &&
        cons.rows.some((r) => r.tabel === "pf_articles"),
      cons.rows.map((r) => `${r.tabel}.${r.conname}`).join(", "),
    );
    const consLama = await db.query(
      `select count(*)::int as n from pg_constraint where contype = 'c' and pg_get_constraintdef(oid) ilike '%status_verifikasi%' and conname not like '%_v29'`,
    );
    cek("B5 CHECK status_verifikasi lama sudah diganti (0 tersisa)", consLama.rows[0].n === 0);

    // Insert 'DITOLAK' diterima di kedua tabel; nilai liar ditolak.
    let ditolakOk = false;
    let liarDitolak = false;
    try {
      await db.query(
        `insert into public.pf_raw_items (url, hash_url, judul, hash_judul, status_verifikasi) values ('https://contoh.id/uji-v29', 'hash-url-v29', 'Uji v29', 'hash-judul-v29', 'DITOLAK')`,
      );
      ditolakOk = true;
    } catch (e) {
      console.log(`GAGAL: insert DITOLAK raw_items — ${String(e.message).split("\n")[0]}`);
    }
    try {
      await db.query(
        `insert into public.pf_raw_items (url, hash_url, judul, hash_judul, status_verifikasi) values ('https://contoh.id/uji-v29-liar', 'hash-url-v29-liar', 'Uji v29 liar', 'hash-judul-v29-liar', 'NILAI_LIAR')`,
      );
    } catch {
      liarDitolak = true;
    }
    cek("B6 insert status 'DITOLAK' diterima (pf_raw_items)", ditolakOk);
    cek("B7 nilai liar status_verifikasi tetap ditolak CHECK", liarDitolak);
    // Bersihkan baris uji DITOLAK (bukan data produksi — PGlite).
    await db.query(`delete from public.pf_raw_items where hash_url = 'hash-url-v29'`);

    // Kolom counter: default 0 + simulasi hitungan adapter
    // (select -> +1 -> flip bersyarat di 3).
    const itemId = "11111111-1111-1111-1111-111111111111";
    await db.query(
      `insert into public.pf_raw_items (id, url, hash_url, judul, hash_judul) values ('${itemId}', 'https://contoh.id/qc-3x', 'hash-url-qc-3x', 'Uji QC 3x', 'hash-judul-qc-3x')`,
    );
    const def = await db.query(
      `select qc_gagal_berturut_turut from public.pf_raw_items where id = '${itemId}'`,
    );
    cek("B8 kolom counter default 0", def.rows[0].qc_gagal_berturut_turut === 0);
    // Simulasi 3 kegagalan berturut-turut (SQL yang sama dengan
    // yang dipakai SupabaseAiAdapter.catatGagalQualityCheck).
    let flipTerjadi = false;
    for (let i = 1; i <= 3; i++) {
      const bacaHitung = await db.query(
        `select qc_gagal_berturut_turut from public.pf_raw_items where id = '${itemId}'`,
      );
      const hitungan = bacaHitung.rows[0].qc_gagal_berturut_turut + 1;
      if (hitungan >= 3) {
        const flip = await db.query(
          `update public.pf_raw_items set qc_gagal_berturut_turut = ${hitungan}, status_verifikasi = 'DITOLAK' where id = '${itemId}' and status_verifikasi = 'UNCONFIRMED' returning id`,
        );
        flipTerjadi = flip.rows.length === 1;
      } else {
        await db.query(
          `update public.pf_raw_items set qc_gagal_berturut_turut = ${hitungan} where id = '${itemId}'`,
        );
      }
    }
    const akhir = await db.query(
      `select qc_gagal_berturut_turut, status_verifikasi from public.pf_raw_items where id = '${itemId}'`,
    );
    cek(
      "B9 hitungan 3x -> status 'DITOLAK' (counter 3)",
      flipTerjadi &&
        akhir.rows[0].qc_gagal_berturut_turut === 3 &&
        akhir.rows[0].status_verifikasi === "DITOLAK",
      JSON.stringify(akhir.rows[0]),
    );

    // Item 'DITOLAK' tidak diklaim antrean UNCONFIRMED.
    const antrean = await db.query(
      `select id from public.pf_raw_items where status_verifikasi = 'UNCONFIRMED'`,
    );
    cek(
      "B10 item 'DITOLAK' tidak masuk antrean UNCONFIRMED",
      !antrean.rows.some((r) => r.id === itemId),
    );
    // Reset (simulasi resetGagalQualityCheck sesudah sukses):
    // item kembali UNCONFIRMED + counter 0 -> masuk antrean lagi.
    await db.query(
      `update public.pf_raw_items set status_verifikasi = 'UNCONFIRMED', qc_gagal_berturut_turut = 0 where id = '${itemId}'`,
    );
    const antrean2 = await db.query(
      `select id from public.pf_raw_items where status_verifikasi = 'UNCONFIRMED'`,
    );
    cek(
      "B11 sesudah reset, item UNCONFIRMED masuk antrean lagi",
      antrean2.rows.some((r) => r.id === itemId),
    );

    // Kolom label manual: tulis + baca kembali.
    const klaimId = "22222222-2222-2222-2222-222222222222";
    await db.query(
      `insert into public.pf_claims (id, raw_item_id, teks, jenis) values ('${klaimId}', '${itemId}', 'Klaim uji label', 'fakta')`,
    );
    const evId = "33333333-3333-3333-3333-333333333333";
    await db.query(
      `insert into public.pf_evidence (id, klaim_id, sumber_url, arah) values ('${evId}', '${klaimId}', 'https://contoh.id/sumber', 'mendukung')`,
    );
    const labelAwal = await db.query(
      `select dilabel_manual, dilabel_oleh, dilabel_pada from public.pf_evidence where id = '${evId}'`,
    );
    cek(
      "B12 kolom label default (manual=false, oleh/pada null)",
      labelAwal.rows[0].dilabel_manual === false &&
        labelAwal.rows[0].dilabel_oleh === null &&
        labelAwal.rows[0].dilabel_pada === null,
    );
    await db.query(
      `update public.pf_evidence set arah = 'menentang', dilabel_manual = true, dilabel_pada = now() where id = '${evId}'`,
    );
    const labelAkhir = await db.query(
      `select arah, dilabel_manual, dilabel_pada from public.pf_evidence where id = '${evId}'`,
    );
    cek(
      "B13 label manual tersimpan (arah menentang + manual=true + tanggal)",
      labelAkhir.rows[0].arah === "menentang" &&
        labelAkhir.rows[0].dilabel_manual === true &&
        labelAkhir.rows[0].dilabel_pada !== null,
    );

    // CHECK audit v29: 'evidence.label' diterima, liar ditolak.
    let auditOk = false;
    let auditLiarDitolak = false;
    try {
      await db.query(
        `insert into public.pf_audit_logs (aksi, entitas) values ('evidence.label', 'evidence')`,
      );
      auditOk = true;
    } catch (e) {
      console.log(`GAGAL: insert audit evidence.label — ${String(e.message).split("\n")[0]}`);
    }
    try {
      await db.query(
        `insert into public.pf_audit_logs (aksi, entitas) values ('aksi.liar', 'evidence')`,
      );
    } catch {
      auditLiarDitolak = true;
    }
    cek("B14 aksi audit 'evidence.label' diterima", auditOk);
    cek("B15 aksi audit liar tetap ditolak CHECK", auditLiarDitolak);

    // Idempoten: jalankan lagi §1–§3 + §5.
    let ulangOk = false;
    try {
      await db.exec(sql29TanpaS4);
      ulangOk = true;
    } catch (e) {
      console.log(`GAGAL: v29 ulangan — ${String(e.message).split("\n")[0]}`);
    }
    cek("B16 migrasi v29 idempoten (jalan kedua sukses)", ulangOk);
  }
}

// ---------- §C: statis kode memakai migrasi ----------
console.log("--- §C statis kode v29 ---");
{
  const pipeline = baca("src/lib/ai/pipeline.ts");
  cek(
    "C1 pipeline: batas ulang QC (catat + reset) + ditolak_qc di HasilPipeline",
    pipeline.includes("catatGagalQualityCheck") &&
      pipeline.includes("resetGagalQualityCheck") &&
      pipeline.includes("ditolak_qc"),
  );
  const adapter = baca("src/lib/ai/supabase-adapter.ts");
  cek(
    "C2 adapter: catatGagalQualityCheck + resetGagalQualityCheck + ambilArtikelTerbit24Jam",
    adapter.includes("async catatGagalQualityCheck(") &&
      adapter.includes("async resetGagalQualityCheck(") &&
      adapter.includes("async ambilArtikelTerbit24Jam("),
  );
  const routeBrief = baca("src/app/api/ai/brief/route.ts");
  cek(
    "C3 route brief: flag dari_artikel_terbit + kirim_push, push hanya bila diterbitkan",
    routeBrief.includes("dari_artikel_terbit") &&
      routeBrief.includes("kirim_push") &&
      routeBrief.includes("hasil.diterbitkan"),
  );
  const broadcast = baca("src/lib/notifikasi/broadcast.ts");
  const routeKirim = baca("src/app/api/admin/notifikasi/kirim/route.ts");
  cek(
    "C4 broadcast bersama dipakai route admin DAN route brief",
    broadcast.includes("export async function kirimBroadcastPush") &&
      routeKirim.includes("kirimBroadcastPush(service, payload)") &&
      routeBrief.includes("kirimBroadcastPush(service, payload)"),
  );
  const routeLabel = baca("src/app/api/admin/evidence/[id]/label/route.ts");
  cek(
    "C5 route label: guard EDITOR + validasi 3 arah + audit evidence.label",
    routeLabel.includes("autentikasiAdmin(req, ROLES.EDITOR)") &&
      routeLabel.includes('"mendukung", "menentang", "netral"') &&
      routeLabel.includes('aksi: "evidence.label"'),
  );
  const nav = baca("src/components/admin/NavAdmin.tsx");
  cek(
    "C6 NavAdmin: tautan /admin/audiens + /admin/label-sikap",
    nav.includes('href: "/admin/audiens"') &&
      nav.includes('href: "/admin/label-sikap"'),
  );
  const audiens = baca("src/app/admin/audiens/page.tsx");
  cek(
    "C7 halaman audiens: agregat saja — select TANPA user_id (hanya artikel/durasi/selesai + pencarian_tersimpan)",
    audiens.includes("agregatKategori") &&
      audiens.includes('.select("artikel_id,dibaca_pada,durasi_detik,selesai")') &&
      audiens.includes('.select("pencarian_tersimpan")') &&
      !audiens.includes('select("artikel_id,user_id'),
  );
  const workflow = baca(".github/workflows/editorial-pipeline.yml");
  cek(
    "C8 workflow pipeline menampilkan ditolak_qc di log total",
    workflow.includes("ditolak_qc"),
  );
  const migrasi = baca(`supabase/migrations/${V29}`);
  cek(
    "C9 migrasi mendokumentasikan interaksi daily-brief.yml (05.00 WIB draft -> 07.00 WIB terbit, lock tidak bertabrakan)",
    migrasi.includes("daily-brief.yml") &&
      migrasi.includes("05:00 WIB") &&
      migrasi.includes("07.00 WIB"),
  );
}

console.log(`\nSELESAI: ${lolos} lolos, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
