// Uji Follow-up 2+4 PRATA FAKTA (16 Nov 2026) — statis, tanpa DB.
// FU2: 0 ekspor non-handler di semua src/app/api/**/route.ts
// (build --webpack gagal TS2344 selama helper diekspor dari
// route.ts); helper pindah ke lib (admin/validasi.ts, topik.ts,
// kuis.ts, akademi/penilaian.ts) atau jadi fungsi lokal
// (validasiPatchKursus, batasDataset).
// FU4: setiap handler mutasi (POST/PATCH/PUT/DELETE) memanggil
// cekOrigin(req) sebagai lapis kedua di samping cek terpusat
// proxy.ts — KECUALI src/app/api/tanya/route.ts dan
// src/app/api/bookmark/route.ts (milik agen lain; dicatat,
// bukan digagalkan).
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import path from "node:path";

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

function bacaRepo(rel) {
  return fs.readFileSync(path.join(DIR_REPO, rel), "utf8");
}

function semuaBerkas(dir) {
  const hasil = [];
  for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
    const penuh = path.join(dir, entri.name);
    if (entri.isDirectory()) hasil.push(...semuaBerkas(penuh));
    else if (entri.name === "route.ts") hasil.push(penuh);
  }
  return hasil;
}

const SEMUA_ROUTE = semuaBerkas(path.join(DIR_REPO, "src/app/api"));
const rel = (f) => path.relative(DIR_REPO, f);

/* ============================================================
   §FU2. Ekspor non-handler di route.ts
   ============================================================ */
console.log("\n== §FU2. Ekspor route.ts ==");
const HANDLER_DIIZINKAN = new Set([
  "GET",
  "POST",
  "PATCH",
  "PUT",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);
const eksporNilaiBuruk = [];
const eksporTipeBuruk = [];
for (const f of SEMUA_ROUTE) {
  const isi = fs.readFileSync(f, "utf8");
  for (const m of isi.matchAll(
    /export\s+(?:async\s+function|function|const|let|var|class)\s+([A-Za-z0-9_]+)/g,
  )) {
    if (!HANDLER_DIIZINKAN.has(m[1])) {
      eksporNilaiBuruk.push(`${rel(f)}: ${m[1]}`);
    }
  }
  for (const m of isi.matchAll(
    /export\s+(?:type|interface)\s+([A-Za-z0-9_]+)/g,
  )) {
    eksporTipeBuruk.push(`${rel(f)}: ${m[1]}`);
  }
}
cek(
  "FU2: 0 ekspor NILAI non-handler di semua route.ts",
  eksporNilaiBuruk.length === 0,
  eksporNilaiBuruk.length > 0
    ? eksporNilaiBuruk.join("; ")
    : `${SEMUA_ROUTE.length} berkas route dipindai`,
);
cek(
  "FU2: 0 ekspor TIPE di semua route.ts",
  eksporTipeBuruk.length === 0,
  eksporTipeBuruk.length > 0
    ? eksporTipeBuruk.join("; ")
    : "tidak ada export type/interface tersisa",
);

// Helper ada di rumah lib barunya.
const RUMAH = [
  ["src/lib/admin/validasi.ts", "validasiEventInput"],
  ["src/lib/admin/validasi.ts", "isUuid"],
  ["src/lib/admin/validasi.ts", "validasiCeritaInput"],
  ["src/lib/admin/validasi.ts", "TOPIK_VALID"],
  ["src/lib/admin/validasi.ts", "validasiInputPengetahuan"],
  ["src/lib/admin/validasi.ts", "validasiInputKursus"],
  ["src/lib/admin/validasi.ts", "validasiStruktur"],
  ["src/lib/topik.ts", "validasiTarget"],
  ["src/lib/topik.ts", "negaraAda"],
  ["src/lib/kuis.ts", "validasiJawabanKuis"],
  ["src/lib/kuis.ts", "hitungSkorDariJawabanTersimpan"],
  ["src/lib/akademi/penilaian.ts", "validasiJawabanAkademi"],
  ["src/lib/akademi/penilaian.ts", "validasiProgres"],
  ["src/lib/akademi/penilaian.ts", "hitungSkorProgres"],
];
for (const [berkas, nama] of RUMAH) {
  const isi = bacaRepo(berkas);
  cek(
    `FU2: ${nama} diekspor dari ${berkas}`,
    isi.includes(`export function ${nama}`) ||
      isi.includes(`export async function ${nama}`) ||
      isi.includes(`export const ${nama}`),
  );
}
// Helper yang hanya dipakai berkasnya sendiri: fungsi lokal,
// bukan ekspor.
cek(
  "FU2: validasiPatchKursus fungsi lokal di akademi/[id]/route.ts (bukan ekspor)",
  bacaRepo("src/app/api/admin/akademi/[id]/route.ts").includes(
    "function validasiPatchKursus(",
  ) &&
    !bacaRepo("src/app/api/admin/akademi/[id]/route.ts").includes(
      "export function validasiPatchKursus",
    ),
);
cek(
  "FU2: batasDataset fungsi lokal di riset/[slug]/dataset/route.ts (bukan ekspor)",
  bacaRepo("src/app/api/riset/[slug]/dataset/route.ts").includes(
    "function batasDataset(",
  ) &&
    !bacaRepo("src/app/api/riset/[slug]/dataset/route.ts").includes(
      "export function batasDataset",
    ),
);
// Situs impor route memakai lib, bukan route lain.
const IMPOR = [
  ["src/app/api/admin/event/route.ts", "@/lib/admin/validasi"],
  ["src/app/api/admin/event/[id]/route.ts", "@/lib/admin/validasi"],
  ["src/app/api/admin/cerita/route.ts", "@/lib/admin/validasi"],
  ["src/app/api/admin/cerita/[id]/route.ts", "@/lib/admin/validasi"],
  ["src/app/api/admin/pengetahuan/route.ts", "@/lib/admin/validasi"],
  ["src/app/api/admin/akademi/route.ts", "@/lib/admin/validasi"],
  ["src/app/api/admin/akademi/[id]/route.ts", "@/lib/admin/validasi"],
  ["src/app/api/topik/route.ts", "@/lib/topik"],
  ["src/app/api/kuis/jawab/route.ts", "@/lib/kuis"],
  ["src/app/api/kuis/skor/route.ts", "@/lib/kuis"],
  ["src/app/api/akademi/progres/route.ts", "@/lib/akademi/penilaian"],
  ["src/app/api/akademi/kuis/jawab/route.ts", "@/lib/akademi/penilaian"],
];
for (const [berkas, modul] of IMPOR) {
  cek(
    `FU2: ${berkas} mengimpor dari ${modul}`,
    bacaRepo(berkas).includes(`from "${modul}"`),
  );
}
const imporAntarRoute = [];
for (const f of SEMUA_ROUTE) {
  const isi = fs.readFileSync(f, "utf8");
  if (/(from\s+["'].*\/route["'])|(from\s+["']\.\.\/route["'])|(from\s+["']\.\.\/\.\.\/event\/route["'])/.test(isi)) {
    imporAntarRoute.push(rel(f));
  }
}
cek(
  "FU2: tidak ada impor antar-route.ts",
  imporAntarRoute.length === 0,
  imporAntarRoute.length > 0 ? imporAntarRoute.join("; ") : "",
);

/* ============================================================
   §FU4. cekOrigin di setiap handler mutasi
   ============================================================ */
console.log("\n== §FU4. cekOrigin per handler mutasi ==");
const MILIK_AGEN_LAIN = new Set([
  "src/app/api/tanya/route.ts",
  "src/app/api/bookmark/route.ts",
]);
let berkasMutasi = 0;
let berkasPakai = 0;
const sisaDiLuar = [];
const perBerkasGagal = [];
for (const f of SEMUA_ROUTE) {
  const isi = fs.readFileSync(f, "utf8");
  const polaHandler =
    /export async function (GET|POST|PATCH|PUT|DELETE)\b/g;
  const handler = [...isi.matchAll(polaHandler)];
  const mutasi = handler.filter((m) =>
    ["POST", "PATCH", "PUT", "DELETE"].includes(m[1]),
  );
  if (mutasi.length === 0) continue;
  berkasMutasi++;
  const mulai = handler.map((m) => m.index);
  let semuaPakai = true;
  for (const m of mutasi) {
    const awal = m.index;
    const berikut = mulai.find((i) => i > awal);
    const segmen = isi.slice(awal, berikut ?? isi.length);
    if (!segmen.includes("cekOrigin(req)")) semuaPakai = false;
  }
  if (semuaPakai) {
    berkasPakai++;
  } else if (!MILIK_AGEN_LAIN.has(rel(f))) {
    perBerkasGagal.push(`${rel(f)} (${mutasi.length} handler mutasi)`);
  } else {
    sisaDiLuar.push(rel(f));
  }
}
cek(
  "FU4: semua handler mutasi di berkas milik FU2/4 memanggil cekOrigin(req)",
  perBerkasGagal.length === 0,
  perBerkasGagal.length > 0
    ? perBerkasGagal.join("; ")
    : `${berkasPakai}/${berkasMutasi} berkas mutasi memanggil cekOrigin`,
);
cek(
  "FU4: sisa tanpa cekOrigin hanya berkas milik agen lain (tanya/bookmark)",
  sisaDiLuar.every((r) => MILIK_AGEN_LAIN.has(r)),
  sisaDiLuar.length > 0
    ? `sisa: ${sisaDiLuar.join("; ")}`
    : "tidak ada sisa (agen lain sudah menambahkan)",
);

console.log(`\nHASIL: ${lolos} lolos, ${gagal} gagal`);
if (gagal > 0) console.log("HASIL: ADA KEGAGALAN");
process.exitCode = gagal > 0 ? 1 : 0;
