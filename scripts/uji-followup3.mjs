// Uji Follow-up 3 — retry workflow (PRATA FAKTA, Tahap H).
//
// Latar: tugas FU3 menyebut "retry 2 workflow tersisa
// (tanya-jawab-draf, terbitkan-terjadwal)" — keduanya SUDAH
// punya --retry 2 sejak Tahap 13C (diverifikasi di sini, bukan
// diasumsikan). Temuan nyata FU3 ada dua: (1) baterai
// uji-tahap13c GAGAL 2 asersi karena Tahap E sengaja menghapus
// curl --retry dari ingestion + editorial-pipeline (retry pindah
// DI DALAM engine) tanpa memperbarui baterai — baterai itu
// diperbaiki di FU3 (pengecualian terdokumentasi + retry di
// dalam engine); (2) curl langsung ke Supabase di podcast-tts
// (6x) + retensi (1x) belum punya retry — ditambahkan FU3
// (idempoten: GET / upsert / PATCH nilai-sama / RPC cleanup).
//
// Baterai ini menyapu SEMUA workflow agar keadaan ini terjaga:
// tiap curl harus punya --retry 2, KECUALI dua workflow yang
// pengecualiannya terdokumentasi di header (ingestion,
// editorial-pipeline — mengembalikan --retry ke curl keduanya
// adalah REGRESI desain Tahap E).
//
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";

const DIR_REPO = new URL("../", import.meta.url).pathname;
const DIR_WF = `${DIR_REPO}.github/workflows/`;

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

// Workflow yang DIKECUALIKAN dari curl --retry (Tahap E, disengaja).
const DIKECUALIKAN = new Set(["ingestion.yml", "editorial-pipeline.yml"]);

const berkas = fs
  .readdirSync(DIR_WF)
  .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
  .sort();

for (const nama of berkas) {
  const teks = fs.readFileSync(`${DIR_WF}${nama}`, "utf8");
  // Baris kode (bukan komentar) yang memanggil curl.
  const barisCurl = teks
    .split("\n")
    .filter((b) => !b.trim().startsWith("#") && /(^|[\s$(])curl\s/.test(b));
  if (DIKECUALIKAN.has(nama)) {
    cek(
      `${nama}: pengecualian retry terdokumentasi di header`,
      teks.includes("TIDAK ADA curl --retry") &&
        teks.includes("Retry hidup DI DALAM"),
      "header workflow",
    );
    cek(
      `${nama}: konsisten — curl di dalamnya memang tanpa --retry`,
      barisCurl.length > 0 &&
        barisCurl.every((b) => !b.includes("--retry")),
      `${barisCurl.length} curl tanpa retry (disengaja)`,
    );
    continue;
  }
  if (barisCurl.length === 0) {
    cek(`${nama}: tanpa curl — tidak butuh retry`, true, "mis. backup.yml");
    continue;
  }
  const tanpaRetry = barisCurl.filter(
    (b) => !b.includes("--retry 2") || !b.includes("--retry-delay"),
  );
  cek(
    `${nama}: semua curl memakai --retry 2 --retry-delay`,
    tanpaRetry.length === 0,
    `${barisCurl.length} curl, ${tanpaRetry.length} tanpa retry`,
  );
}

// Literal tugas FU3: kedua workflow yang disebut SUDAH punya retry.
for (const nama of ["tanya-jawab-draf.yml", "terbitkan-terjadwal.yml"]) {
  const teks = fs.readFileSync(`${DIR_WF}${nama}`, "utf8");
  cek(
    `FU3 literal: ${nama} memakai --retry 2 --retry-delay 10`,
    teks.includes("--retry 2") && teks.includes("--retry-delay 10"),
    "sudah ada sejak Tahap 13C — diverifikasi, bukan ditambah",
  );
}

// In-engine retry untuk dua workflow yang dikecualikan (penjaga
// pengecualian: bila engine dihapus, pengecualian tidak sah lagi).
{
  const retrySrc = fs.readFileSync(
    `${DIR_REPO}src/lib/ingestion/retry.ts`,
    "utf8",
  );
  cek(
    "ingestion: retry di dalam engine (maks 3 percobaan + Retry-After)",
    /percobaanMaks \?\? 3/.test(retrySrc) && /Retry-After/.test(retrySrc),
    "src/lib/ingestion/retry.ts",
  );
  const jalankanSrc = fs.readFileSync(
    `${DIR_REPO}src/app/api/ai/jalankan/route.ts`,
    "utf8",
  );
  cek(
    "editorial-pipeline: retry di dalam pipeline (per-item try/catch)",
    (jalankanSrc.match(/try \{/g) ?? []).length >= 2,
    "src/app/api/ai/jalankan/route.ts",
  );
}

console.log(`\n== RINGKASAN FOLLOW-UP 3 ==\nLolos: ${lolos}\nGagal: ${gagal}`);
if (gagal > 0) {
  console.log("HASIL: GAGAL");
  process.exit(1);
}
console.log("HASIL: LOLOS");
process.exit(0);
