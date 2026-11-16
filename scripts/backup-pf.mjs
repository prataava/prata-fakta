// Skrip backup PRATA FAKTA: mengekspor SEMUA tabel pf_* ke JSON.
// Jalankan:  SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup-pf.mjs [--out <dir>]
// (key juga boleh dibaca dari .env.local di root repo — skrip TIDAK
// PERNAH mencetak nilai key.) Keluar 0 bila semua tabel berhasil;
// keluar 1 bila ada tabel yang gagal (kegagalan dicatat di manifest).
// Keluaran: <out>/backup-YYYYMMDD-HHmmss/<tabel>.json + manifest.json
// berisi {waktu, tabel: {nama: jumlah}, gagal: [...], durasi_ms}.
// Strategi backup (lihat LAPORAN-AKHIR.md): Supabase mengelola backup
// harian proyek di sisi server; skrip ini adalah lapis kedua yang
// dimiliki redaksi — ekspor berkala yang bisa diarsipkan dan dipakai
// untuk audit isi database tanpa mengakses Dashboard.
// Keamanan: service-role key HANYA dibaca dari env/.env.local dan
// tidak pernah ditulis ke berkas keluaran.
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
  const gagal = [];
  for (const tabel of TABEL_PF) {
    try {
      const baris = await eksporTabel(url, key, tabel);
      fs.writeFileSync(
        path.join(dir, `${tabel}.json`),
        JSON.stringify(baris, null, 2),
      );
      hasil[tabel] = baris.length;
      console.log(`OK: ${tabel} — ${baris.length} baris`);
    } catch (err) {
      gagal.push(tabel);
      console.error(`GAGAL: ${tabel} — ${err.message}`);
    }
  }
  const manifest = {
    waktu: sekarang.toISOString(),
    tabel: hasil,
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

await utama();
