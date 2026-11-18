// Skrip backup PRATA FAKTA: mengekspor SEMUA tabel pf_* ke JSON.
// Jalankan:  SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-pf.mjs [--out <dir>]
// (key juga boleh dibaca dari .env.local di root repo — skrip TIDAK
// PERNAH mencetak nilai key.) Keluar 0 bila semua tabel berhasil;
// keluar 1 bila ada tabel yang gagal (kegagalan dicatat di manifest).
// Keluaran: <out>/backup-YYYYMMDD-HHmmss/<tabel>.json + manifest.json
// berisi {waktu, tabel: {nama: jumlah}, hash: {nama: sha256},
// gagal: [...], durasi_ms}.
// Mode verifikasi (v27): node scripts/backup-pf.mjs --verify <dir>
// — membaca manifest + tiap berkas tabel, memeriksa JSON bisa
// diparse, jumlah baris cocok dengan manifest, dan hash SHA-256
// cocok. Keluar 0 bila semua cocok, 1 bila ada yang tidak cocok.
// "Backup sukses hanya bila isinya terverifikasi": workflow backup
// menjalankan --verify sesudah ekspor, sebelum artefak diunggah.
// Strategi backup (lihat LAPORAN-AKHIR.md): Supabase mengelola backup
// harian proyek di sisi server; skrip ini adalah lapis kedua yang
// dimiliki redaksi — ekspor berkala yang bisa diarsipkan dan dipakai
// untuk audit isi database tanpa mengakses Dashboard.
// Keamanan: service-role key HANYA dibaca dari env/.env.local dan
// tidak pernah ditulis ke berkas keluaran.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const TABEL_PF = [
  // v1
  "pf_profiles",
  "pf_roles",
  "pf_permissions",
  "pf_role_permissions",
  "pf_user_roles",
  "pf_categories",
  "pf_sources",
  "pf_newsletter_subscribers",
  // v2
  "pf_articles",
  "pf_article_versions",
  "pf_article_sources",
  "pf_tags",
  "pf_article_tags",
  "pf_bookmarks",
  "pf_reading_history",
  "pf_correction_reports",
  // v3
  "pf_ingestion_runs",
  "pf_raw_items",
  // v4
  "pf_ai_runs",
  "pf_claims",
  "pf_evidence",
  "pf_verification_records",
  "pf_daily_briefs",
  // v5
  "pf_audit_logs",
  "pf_editorial_reviews",
  "pf_scheduled_jobs",
  // v6
  "pf_knowledge_articles",
  "pf_followed_topics",
  "pf_notifications",
  "pf_quiz_questions",
  "pf_data_indicators",
  "pf_data_points",
  "pf_events",
  "pf_event_timeline",
  "pf_questions",
  // v7
  "pf_quiz_scores",
  // v8 (Fase 8 Gelombang 1) — tabel baru: pf_user_preferences.
  "pf_user_preferences",
  // v10 (Fase 8 Gelombang 2) — 16 tabel baru. Total sesudah v10:
  // 53 tabel.
  "pf_stories",
  "pf_story_events",
  "pf_story_articles",
  "pf_story_followers",
  "pf_courses",
  "pf_course_modules",
  "pf_course_lessons",
  "pf_course_progress",
  "pf_podcast_episodes",
  "pf_podcast_history",
  "pf_podcast_playlist_items",
  "pf_research_reports",
  "pf_documents",
  "pf_countries",
  "pf_country_facts",
  "pf_system_settings",
  // v11 (Tahap 13A) — tabel baru: pf_rate_limits.
  // Total sesudah v11/v12: 54 tabel. Bila migrasi lanjutan
  // menambah tabel pf_* baru, TAMBAHKAN namanya di sini agar
  // backup tetap mencakup semuanya.
  "pf_rate_limits",
  // v13 (Gelombang B1, P0-4) — tabel baru: pf_quiz_answers
  // (kunci kuis dipindah dari kolom pf_quiz_questions.kunci).
  // Total sesudah v13: 55 tabel.
  "pf_quiz_answers",
  // v14 (Gelombang B2) — 6 tabel baru: jawaban kuis tersimpan +
  // sertifikat (B2-B), jejak hapus akun (B2-A), langganan push +
  // kunjungan + galat aplikasi (B2-D). Total sesudah v14: 61 tabel.
  "pf_quiz_user_answers",
  "pf_certificates",
  "pf_account_deletions",
  "pf_push_subscriptions",
  "pf_kunjungan",
  "pf_app_errors",
  // v15 (Tahap C) — tabel baru: pf_quiz_daily_answers
  // (jawaban kuis harian tersimpan; skor harian dihitung
  // server). Total sesudah v15: 62 tabel.
  "pf_quiz_daily_answers",
  // v18 + v21 (Ekspansi P0/P3) — TANPA tabel baru (hanya kolom
  // di pf_article_sources / pf_user_preferences). Total tetap 62.
  // v19 (Ekspansi P1-1) — tabel baru: pf_notes (catatan pribadi
  // pengguna). Total sesudah v19/v21: 63 tabel.
  "pf_notes",
  // v22 (Global News Intelligence) — 2 tabel baru:
  // pf_article_comparisons + pf_editorial_locks.
  // Total sesudah v22: 65 tabel. Angka ini DIHITUNG dari
  // CREATE TABLE di semua berkas supabase/migrations/*.sql
  // (17 Nov 2026: 63 dari v1–v21 + 2 dari v22) — bukan angka
  // asumsi. Bila migrasi lanjutan menambah tabel pf_* baru,
  // TAMBAHKAN namanya di sini agar backup tetap mencakup semuanya.
  "pf_article_comparisons",
  "pf_editorial_locks",
  // v23 (lock diproses) — TANPA tabel baru (hanya kolom/status).
  // v24 (klaster item) — 2 tabel baru: pf_item_clusters +
  // pf_item_cluster_members. v25 (alerts) — 1 tabel baru:
  // pf_alerts. Total sesudah v25: 68 tabel (dihitung ulang dari
  // CREATE TABLE di semua berkas migrasi, 17 Nov 2026).
  // v27 (18 Nov 2026) menambah 1 tabel baru pf_push_deliveries —
  // SENGAJA BELUM dimasukkan ke daftar ini sampai migrasi v27
  // diterapkan di produksi (butuh otorisasi pemilik). Bila
  // dimasukkan sebelum itu, backup gagal 404 (lihat catatan di
  // bawah). Sesudah v27 diterapkan: tambahkan pf_push_deliveries
  // di sini (total menjadi 69) + perbarui §E baterai.
  // (Nama tabel di komentar ini SENGAJA tanpa tanda kutip: §E
  // baterai menghitung semua string berpetik pf_* di berkas ini.)
  // Catatan: tabel yang migrasinya belum diterapkan di produksi
  // akan tercatat GAGAL (404) dan membuat skrip exit 1 — perilaku
  // yang sama seperti tabel lain sebelum migrasinya jalan (lihat
  // CUTOVER.md §2.3); bukan alasan mengeluarkan tabel dari daftar.
  "pf_item_clusters",
  "pf_item_cluster_members",
  "pf_alerts",
];

function bacaEnvLocal() {
  const berkas = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(berkas)) return;
  for (const baris of fs.readFileSync(berkas, "utf8").split("\n")) {
    const cocok = /^([A-Z_]+)=(.*)$/.exec(baris.trim());
    if (cocok && process.env[cocok[1]] === undefined) {
      process.env[cocok[1]] = cocok[2];
    }
  }
}

function argOut() {
  const i = process.argv.indexOf("--out");
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return process.cwd();
}

async function eksporTabel(url, key, tabel) {
  const semua = [];
  const BATAS = 1000;
  let offset = 0;
  for (;;) {
    const res = await fetch(
      `${url}/rest/v1/${tabel}?select=*&limit=${BATAS}&offset=${offset}`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
      },
    );
    if (!res.ok) {
      const isi = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${isi.slice(0, 120)}`);
    }
    const baris = await res.json();
    if (!Array.isArray(baris) || baris.length === 0) break;
    semua.push(...baris);
    if (baris.length < BATAS) break;
    offset += BATAS;
  }
  return semua;
}

function sha256Berkas(berkas) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(berkas))
    .digest("hex");
}

async function verifikasiBackup(dir) {
  // Verifikasi isi backup dari manifest-nya sendiri (tanpa DB):
  // tiap tabel di manifest harus punya berkas JSON yang bisa diparse,
  // jumlah barisnya cocok, dan hash-nya cocok. Manifest TANPA hash
  // (dibuat sebelum v27) tetap diverifikasi jumlah barisnya, dengan
  // peringatan bahwa hash tidak tersedia.
  const berkasManifest = path.join(dir, "manifest.json");
  if (!fs.existsSync(berkasManifest)) {
    console.error(`GAGAL VERIFIKASI: manifest.json tidak ada di ${dir}`);
    return 1;
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(berkasManifest, "utf8"));
  } catch (err) {
    console.error(`GAGAL VERIFIKASI: manifest.json tidak bisa diparse — ${err.message}`);
    return 1;
  }
  const namaTabel = Object.keys(manifest.tabel ?? {});
  if (namaTabel.length === 0) {
    console.error("GAGAL VERIFIKASI: manifest tidak memuat satu pun tabel.");
    return 1;
  }
  let buruk = 0;
  for (const tabel of namaTabel) {
    const berkas = path.join(dir, `${tabel}.json`);
    if (!fs.existsSync(berkas)) {
      console.error(`GAGAL VERIFIKASI: ${tabel}.json hilang.`);
      buruk++;
      continue;
    }
    let baris;
    try {
      baris = JSON.parse(fs.readFileSync(berkas, "utf8"));
    } catch (err) {
      console.error(`GAGAL VERIFIKASI: ${tabel}.json tidak bisa diparse — ${err.message}`);
      buruk++;
      continue;
    }
    if (!Array.isArray(baris)) {
      console.error(`GAGAL VERIFIKASI: ${tabel}.json bukan array JSON.`);
      buruk++;
      continue;
    }
    if (baris.length !== manifest.tabel[tabel]) {
      console.error(
        `GAGAL VERIFIKASI: ${tabel}.json berisi ${baris.length} baris, manifest mencatat ${manifest.tabel[tabel]}.`,
      );
      buruk++;
      continue;
    }
    const hashTercatat = manifest.hash?.[tabel];
    if (hashTercatat === undefined) {
      console.log(`PERINGATAN: ${tabel} — jumlah cocok (${baris.length}), tanpa hash untuk diperiksa (manifest pra-v27).`);
    } else if (sha256Berkas(berkas) !== hashTercatat) {
      console.error(`GAGAL VERIFIKASI: hash ${tabel}.json tidak cocok dengan manifest (berkas berubah sesudah ekspor?).`);
      buruk++;
      continue;
    }
    console.log(`OK: ${tabel} — ${baris.length} baris, hash cocok.`);
  }
  if ((manifest.gagal ?? []).length > 0) {
    console.error(
      `GAGAL VERIFIKASI: manifest mencatat ${manifest.gagal.length} tabel gagal diekspor: ${manifest.gagal.join(", ")}.`,
    );
    buruk++;
  }
  if (buruk > 0) {
    console.error(`VERIFIKASI GAGAL: ${buruk} masalah di ${dir}`);
    return 1;
  }
  console.log(`VERIFIKASI LOLOS: ${namaTabel.length} tabel di ${dir}`);
  return 0;
}

async function utama() {
  bacaEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "GAGAL: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diatur (env atau .env.local).",
    );
    process.exit(1);
  }
  const sekarang = new Date();
  const cap = sekarang
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15);
  const dir = path.resolve(argOut(), `backup-${cap}`);
  fs.mkdirSync(dir, { recursive: true });

  const mulai = Date.now();
  const hasil = {};
  const hash = {};
  const gagal = [];
  for (const tabel of TABEL_PF) {
    try {
      const baris = await eksporTabel(url, key, tabel);
      const berkas = path.join(dir, `${tabel}.json`);
      fs.writeFileSync(berkas, JSON.stringify(baris, null, 2));
      hasil[tabel] = baris.length;
      hash[tabel] = sha256Berkas(berkas);
      console.log(`OK: ${tabel} — ${baris.length} baris`);
    } catch (err) {
      gagal.push(tabel);
      console.error(`GAGAL: ${tabel} — ${err.message}`);
    }
  }
  const manifest = {
    waktu: sekarang.toISOString(),
    tabel: hasil,
    hash,
    gagal,
    durasi_ms: Date.now() - mulai,
  };
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  const total = Object.values(hasil).reduce((a, b) => a + b, 0);
  console.log(
    `SELESAI: ${Object.keys(hasil).length}/${TABEL_PF.length} tabel, ${total} baris, ${gagal.length} gagal → ${dir}`,
  );
  if (gagal.length > 0) process.exit(1);
}

// Mode --verify tidak butuh kredensial/DB sama sekali.
const iVerify = process.argv.indexOf("--verify");
if (iVerify !== -1) {
  const dir = process.argv[iVerify + 1];
  if (!dir) {
    console.error("GAGAL: --verify butuh <dir> (contoh: node scripts/backup-pf.mjs --verify backup/backup-20261118-100000)");
    process.exit(2);
  }
  process.exit(await verifikasiBackup(path.resolve(dir)));
}

await utama();
