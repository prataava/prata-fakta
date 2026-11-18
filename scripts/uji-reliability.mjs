// Baterai Reliability Center (v27) — fungsi murni di
// src/lib/admin/reliability.ts + penjaga statis wiring halaman.
// Tanpa PGlite, tanpa DB — jalan dengan:
//   node --experimental-strip-types scripts/uji-reliability.mjs
import fs from "node:fs";
import {
  INTERVAL_JOB_MENIT,
  nilaiKesehatanJob,
  ringkasWatchdog,
} from "../src/lib/admin/reliability.ts";

const DIR_REPO = new URL("../", import.meta.url).pathname;
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
function baca(relatif) {
  return fs.readFileSync(`${DIR_REPO}${relatif}`, "utf8");
}

const SEKARANG = Date.now();
const menitLalu = (m) => new Date(SEKARANG - m * 60000).toISOString();

// K1: ingestion terakhir 10 mnt lalu -> sehat.
{
  const h = nilaiKesehatanJob(
    { nama: "ingestion", tercatat: true, aktif: true, terakhir_jalan: menitLalu(10), status_terakhir: "berhasil", error_terakhir: null },
    SEKARANG,
  );
  cek("K1 job sehat: ingestion 10 mnt lalu -> sehat", h.status === "sehat" && h.keterlambatan_menit === 10 && h.interval_menit === 30, `status=${h.status} telat=${h.keterlambatan_menit}`);
}

// K2: ingestion 90 mnt lalu (> 2x30) -> terlambat.
{
  const h = nilaiKesehatanJob(
    { nama: "ingestion", tercatat: true, aktif: true, terakhir_jalan: menitLalu(90), status_terakhir: "berhasil", error_terakhir: null },
    SEKARANG,
  );
  cek("K2 job terlambat: ingestion 90 mnt lalu (>60) -> terlambat", h.status === "terlambat" && h.keterlambatan_menit === 90, `status=${h.status}`);
}

// K3: status terakhir gagal -> gagal (apa pun keterlambatannya) + alasan memuat error.
{
  const h = nilaiKesehatanJob(
    { nama: "editorial", tercatat: true, aktif: true, terakhir_jalan: menitLalu(5), status_terakhir: "gagal", error_terakhir: "Galat 500: contoh" },
    SEKARANG,
  );
  cek("K3 job gagal: status_terakhir gagal -> gagal + alasan memuat error", h.status === "gagal" && h.alasan.includes("Galat 500: contoh"), `status=${h.status}`);
}

// K4: belum pernah jalan.
{
  const h = nilaiKesehatanJob(
    { nama: "brief", tercatat: true, aktif: true, terakhir_jalan: null, status_terakhir: "belum_pernah", error_terakhir: null },
    SEKARANG,
  );
  cek("K4 belum pernah: terakhir_jalan null -> belum_pernah", h.status === "belum_pernah", `status=${h.status}`);
}

// K5: tidak tercatat.
{
  const h = nilaiKesehatanJob(
    { nama: "backup", tercatat: false, aktif: true, terakhir_jalan: null, status_terakhir: null, error_terakhir: null },
    SEKARANG,
  );
  cek("K5 tidak tercatat: tercatat=false -> tidak_tercatat", h.status === "tidak_tercatat", `status=${h.status}`);
}

// K6: perkiraan berikut = terakhir + interval (editorial 120 mnt).
{
  const h = nilaiKesehatanJob(
    { nama: "editorial", tercatat: true, aktif: true, terakhir_jalan: menitLalu(30), status_terakhir: "berhasil", error_terakhir: null },
    SEKARANG,
  );
  const harap = new Date(SEKARANG - 30 * 60000 + 120 * 60000).toISOString();
  cek("K6 perkiraan berikut: editorial terakhir 30 mnt lalu -> +120 mnt", h.perkiraan_berikut === harap, `berikut=${h.perkiraan_berikut}`);
}

// K7: job tanpa jadwal (podcast) tidak pernah "terlambat".
{
  const h = nilaiKesehatanJob(
    { nama: "podcast", tercatat: true, aktif: true, terakhir_jalan: menitLalu(60 * 24), status_terakhir: "berhasil", error_terakhir: null },
    SEKARANG,
  );
  cek("K7 tanpa jadwal: podcast 1 hari lalu -> sehat (interval null)", h.status === "sehat" && h.interval_menit === null && h.perkiraan_berikut === null, `status=${h.status}`);
}

// K8: ambang tepat 2x -> sehat; 2x+1 -> terlambat.
{
  const pas = nilaiKesehatanJob(
    { nama: "ingestion", tercatat: true, aktif: true, terakhir_jalan: menitLalu(60), status_terakhir: "berhasil", error_terakhir: null },
    SEKARANG,
  );
  const lewat = nilaiKesehatanJob(
    { nama: "ingestion", tercatat: true, aktif: true, terakhir_jalan: menitLalu(61), status_terakhir: "berhasil", error_terakhir: null },
    SEKARANG,
  );
  cek("K8 ambang: tepat 2x interval (60 mnt) -> sehat; 61 mnt -> terlambat", pas.status === "sehat" && lewat.status === "terlambat", `60=${pas.status} 61=${lewat.status}`);
}

// K9: ringkasWatchdog menghitung + masalah hanya non-sehat.
{
  const r = ringkasWatchdog([
    { nama: "a", status: "sehat", alasan: "", keterlambatan_menit: 1, interval_menit: 30, perkiraan_berikut: null },
    { nama: "b", status: "terlambat", alasan: "telat", keterlambatan_menit: 90, interval_menit: 30, perkiraan_berikut: null },
    { nama: "c", status: "gagal", alasan: "gagal", keterlambatan_menit: 5, interval_menit: 120, perkiraan_berikut: null },
  ]);
  cek("K9 watchdog: hitungan benar + masalah hanya job non-sehat", r.sehat === 1 && r.terlambat === 1 && r.gagal === 1 && r.masalah.length === 2, `masalah=${r.masalah.length}`);
}

// K10: interval di kode cocok dengan cron workflow (anti-drift).
{
  const ingestionYml = baca(".github/workflows/ingestion.yml");
  const editorialYml = baca(".github/workflows/editorial-pipeline.yml");
  const briefYml = baca(".github/workflows/daily-brief.yml");
  const backupYml = baca(".github/workflows/backup.yml");
  cek(
    "K10 interval cocok cron: ingestion 30 + editorial 120 + brief 1440 + backup 1440",
    INTERVAL_JOB_MENIT.ingestion === 30 &&
      INTERVAL_JOB_MENIT.editorial === 120 &&
      INTERVAL_JOB_MENIT.brief === 1440 &&
      INTERVAL_JOB_MENIT.backup === 1440 &&
      ingestionYml.includes('"*/30 * * * *"') &&
      editorialYml.includes('"0 */2 * * *"') &&
      briefYml.includes('"0 22 * * *"') &&
      backupYml.includes('"0 3 * * *"'),
  );
}

// K11: label editorial di kendali.ts sudah "Setiap 2 jam" (bukan 6 jam basi).
{
  const kendali = baca("src/lib/admin/kendali.ts");
  const potong = kendali.split('nama: "editorial"')[1]?.split("},")[0] ?? "";
  cek(
    "K11 label editorial kendali.ts = 'Setiap 2 jam'",
    potong.includes("Setiap 2 jam") && !potong.includes("Setiap 6 jam"),
  );
}

// K12: halaman reliability memakai penilai + galat terbaru + terdaftar di NavAdmin.
{
  const halaman = baca("src/app/admin/reliability/page.tsx");
  const nav = baca("src/components/admin/NavAdmin.tsx");
  cek(
    "K12 halaman reliability: nilaiKesehatanJob + getGalatTerbaru + NavAdmin",
    halaman.includes("nilaiKesehatanJob") &&
      halaman.includes("getGalatTerbaru") &&
      halaman.includes("ringkasWatchdog") &&
      halaman.includes("instant = false") &&
      nav.includes('"/admin/reliability"'),
  );
  cek(
    "K12b halaman TIDAK menampilkan status_terakhir sebagai bukti sehat",
    halaman.includes("TIDAK dipakai sebagai") || halaman.includes("TIDAK dipakai"),
  );
}

console.log(`\nRINGKASAN reliability: ${lolos} lolos, ${gagal} gagal.`);
if (gagal > 0) process.exit(1);
