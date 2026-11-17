// Uji re-skin Swiss "Swiss Archival Editorial" PRATA FAKTA.
// Statis (tanpa server, tanpa data): memeriksa globals.css,
// Header.tsx, HeaderNav.tsx, CommandPalette.tsx, dan wrapper
// tabel di 5 area (/admin, /sumber, /klaim, /observatorium,
// /data/live). Keluar 0 bila semua asersi lolos, 1 bila ada
// yang gagal. Pola QC kontras mengikuti uji Aurora sebelumnya
// (muted ≥4.5:1 di kedua mode, kini untuk SEMUA token teks).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = path.join(ROOT, "src/app/globals.css");
const HEADER_NAV = path.join(ROOT, "src/components/HeaderNav.tsx");
const HEADER = path.join(ROOT, "src/components/Header.tsx");
const PALETTE = path.join(ROOT, "src/components/CommandPalette.tsx");

let gagal = 0;
let lolos = 0;
function cek(label, kondisi, detail = "") {
  if (kondisi) {
    lolos += 1;
    console.log(`OK: ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    gagal += 1;
    console.log(`GAGAL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const cssMentah = fs.readFileSync(CSS, "utf8");
// Komentar dibuang untuk analisis token/pola (agar kata di dalam
// komentar, mis. "var(--token)" pada petunjuk, tidak dihitung).
const css = cssMentah.replace(/\/\*[\s\S]*?\*\//g, "");

// Blok BottomNav DIBEKUKAN (16 Nov 2026) — pola kaca di dalamnya
// (blur 25px, rainbow, lensa) SENGAJA tidak disentuh dan tidak
// dihitung pada sapuan pola terlarang.
const awalDock = css.indexOf(".prata-glass-dock");
const akhirDock = css.indexOf("\n.prosa {", awalDock);
cek("Penanda blok BottomNav ditemukan untuk pengecualian sapuan", awalDock > 0 && akhirDock > awalDock);
const cssLuarDock = awalDock > 0 && akhirDock > awalDock
  ? css.slice(0, awalDock) + css.slice(akhirDock)
  : css;

// ---------- (a) Token: 0 self-ref + 0 var() tak terdefinisi ----------
function parseBlokToken(nama, pola) {
  const m = css.match(pola);
  cek(`Blok token ${nama} ditemukan`, Boolean(m));
  const defs = new Map();
  if (m) {
    for (const [, namaToken, nilai] of m[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      defs.set(namaToken, nilai.trim());
    }
  }
  return defs;
}
const defTerang = parseBlokToken(":root", /:root\s*\{([\s\S]*?)\n\}/);
const defGelap = parseBlokToken('[data-theme="dark"]', /\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);
const semuaDef = new Set([...defTerang.keys(), ...defGelap.keys()]);
cek("Token --warn (amber) didefinisikan di kedua mode", defTerang.has("--warn") && defGelap.has("--warn"));

for (const [blok, defs] of [[":root", defTerang], ["gelap", defGelap]]) {
  let selfRef = [];
  for (const [nama, nilai] of defs) {
    if (nilai.includes(`var(${nama})`)) selfRef.push(nama);
  }
  cek(`0 token self-ref di blok ${blok}`, selfRef.length === 0, selfRef.join(", "));
}
const dipakai = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
const takTerdefinisi = [...dipakai].filter((t) => !semuaDef.has(t));
cek("0 var() tak terdefinisi di globals.css", takTerdefinisi.length === 0, takTerdefinisi.join(", "));
cek("Token Swiss kunci hadir", ["--bg", "--surface", "--ink", "--muted", "--accent", "--danger", "--warn", "--mint", "--cyan", "--purple", "--midnight"].every((t) => semuaDef.has(t)));

// ---------- (b) Rasio kontras token teks ≥4.5:1 (terang + gelap) ----------
function lum(hex) {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function rasio(a, b) {
  const [la, lb] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
}
function hexDari(defs, nama) {
  const v = defs.get(nama) ?? "";
  const m = v.match(/#[0-9a-fA-F]{6}/);
  return m ? m[0] : null;
}
const pasangan = [
  ["ink", "surface"], ["ink-2", "surface"], ["muted", "surface"], ["muted", "bg"],
  ["ink", "bg"], ["accent", "surface"], ["danger", "surface"],
  ["mint", "surface"], ["cyan", "surface"], ["warn", "surface"],
];
for (const [blok, defs] of [[":root (terang)", defTerang], ["gelap", defGelap]]) {
  for (const [teks, latar] of pasangan) {
    // Bila token tidak ditulis ulang di blok gelap, nilainya
    // diwarisi dari :root (semantik cascade CSS yang benar).
    const a = hexDari(defs, `--${teks}`) ?? hexDari(defTerang, `--${teks}`);
    const b = hexDari(defs, `--${latar}`) ?? hexDari(defTerang, `--${latar}`);
    if (!a || !b) {
      cek(`Kontras ${teks}/${latar} ${blok} (hex terbaca)`, false, `${teks}=${a} ${latar}=${b}`);
      continue;
    }
    const r = rasio(a, b);
    cek(`Kontras ${teks}/${latar} ${blok} ≥4.5:1`, r >= 4.5, `${r.toFixed(2)}:1 (${a} di ${b})`);
  }
  // Teks di atas aksen (tombol primer / pil nav aktif).
  const aksen = hexDari(defs, "--accent");
  const aksenInk = hexDari(defs, "--accent-ink");
  if (aksen && aksenInk) {
    const r = rasio(aksenInk, aksen);
    cek(`Kontras accent-ink/aksen ${blok} ≥4.5:1`, r >= 4.5, `${r.toFixed(2)}:1`);
  } else {
    cek(`Kontras accent-ink/aksen ${blok} (hex terbaca)`, false);
  }
}

// ---------- (c) 0 pola glass/gradien terlarang di luar BottomNav ----------
const polaTerlarang = [
  ["backdrop-filter", /backdrop-filter/g],
  ["linear-gradient", /linear-gradient/g],
  ["radial-gradient", /radial-gradient/g],
  ["blur(", /blur\(/g],
  ["saturate(", /saturate\(/g],
];
for (const [nama, pola] of polaTerlarang) {
  const hit = cssLuarDock.match(pola) ?? [];
  cek(`0 pola terlarang "${nama}" di luar blok BottomNav`, hit.length === 0, `${hit.length} kemunculan`);
}
cek('0 kata "Aurora" di globals.css (sistem lama sudah diganti)', !/Aurora/.test(cssMentah));
cek("Header mengambang lama hilang (tanpa properti top: 12px)", !/(?:^|[\n;{])\s*top:\s*12px/.test(cssLuarDock));
cek("overflow-x: clip dipertahankan (bukan hidden) agar sticky hidup", /overflow-x:\s*clip/.test(css) && !/overflow-x:\s*hidden/.test(css));

// ---------- (d) 8 pintu nav + dropdown Radix tetap ada ----------
const nav = fs.readFileSync(HEADER_NAV, "utf8");
const pintu = [
  ['Beranda tautan("/", nav.beranda)', /tautan\("\/",\s*t\(bahasa,\s*"nav\.beranda"\)/],
  ["Kategori (dropdown)", /DropdownGrup label=\{t\(bahasa, "nav\.kategori"\)/],
  ["Fakta & Data (dropdown)", /DropdownGrup label=\{t\(bahasa, "nav\.faktaData"\)/],
  ["Wawasan (dropdown)", /DropdownGrup label=\{t\(bahasa, "nav\.wawasan"\)/],
  ["Belajar (dropdown)", /DropdownGrup label=\{t\(bahasa, "nav\.belajar"\)/],
  ['Daily Brief tautan("/brief")', /tautan\("\/brief",\s*t\(bahasa,\s*"nav\.brief"\)/],
  ['Arsip tautan("/arsip")', /tautan\("\/arsip",\s*t\(bahasa,\s*"nav\.arsip"\)/],
  ['Jelajahi tautan("/jelajahi")', /tautan\("\/jelajahi",\s*t\(bahasa,\s*"nav\.jelajahi"\)/],
];
for (const [label, pola] of pintu) cek(`Pintu nav ke-8 tetap ada: ${label}`, pola.test(nav));
cek("Dropdown Radix dipakai (import + 4 DropdownGrup)", /from "@radix-ui\/react-dropdown-menu"/.test(nav) && (nav.match(/<DropdownGrup/g) ?? []).length === 4, `${(nav.match(/<DropdownGrup/g) ?? []).length} grup`);
const hrefDiharapkan = new Set([
  "/kategori/fakta-mitos", "/kategori/data-statistik", "/data", "/sumber",
  "/data/live", "/peta", "/riset", "/timeline", "/pengetahuan", "/cerita",
  "/sejarah", "/negara", "/akademi", "/kuis", "/tanya", "/podcast", "/kategori",
]);
const hrefDitemukan = new Set([...nav.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]));
const hrefHilang = [...hrefDiharapkan].filter((h) => !hrefDitemukan.has(h));
cek("Semua href submenu tidak berubah", hrefHilang.length === 0, hrefHilang.join(", "));

// ---------- (e) Masthead sticky + sub-bar ----------
cek("Header sticky top: 0 berlatar solid", /\.header\s*\{[^}]*position:\s*sticky[^}]*top:\s*0[^}]*background:\s*var\(--surface\)/s.test(css));
cek("Sub-bar .header-subbar berbatas 1px", /\.header-subbar\s*\{[^}]*border-top:\s*1px solid var\(--border\)/s.test(css));
const header = fs.readFileSync(HEADER, "utf8");
cek("Header.tsx: HeaderNav di dalam .header-subbar", /<div className="header-subbar">[\s\S]*?<HeaderNav \/>/.test(header));
cek("Header.tsx: baris atas tetap (logo + cari + aksi)", /className="header-atas"/.test(header) && /className="header-cari"/.test(header) && /className="header-aksi"/.test(header));

// ---------- (f) Command Palette: tombol tutup X ≥44px ----------
cek("Palette: tombol tutup (Dialog.Close + .palette-tutup) ada", fs.readFileSync(PALETTE, "utf8").includes('className="palette-tutup"') && /Dialog\.Close asChild/.test(fs.readFileSync(PALETTE, "utf8")));
const tutup = css.match(/\.palette-tutup\s*\{[^}]*\}/s)?.[0] ?? "";
cek("Tombol tutup palette ≥44px (min-width + min-height)", /min-width:\s*44px/.test(tutup) && /min-height:\s*44px/.test(tutup), tutup.replace(/\s+/g, " ").slice(0, 120));

// ---------- (g) Tabel di 5 area: semua terbungkus .tabel-gulir ----------
const areaTabel = [
  "src/app/admin", "src/app/sumber", "src/app/klaim",
  "src/app/observatorium", "src/app/data/live",
];
function daftarBerkas(dir) {
  const hasil = [];
  for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entri.name);
    if (entri.isDirectory()) hasil.push(...daftarBerkas(p));
    else if (entri.name.endsWith(".tsx")) hasil.push(p);
  }
  return hasil;
}
for (const area of areaTabel) {
  const dir = path.join(ROOT, area);
  if (!fs.existsSync(dir)) {
    cek(`Area tabel ${area} ada`, false);
    continue;
  }
  let tabel = 0;
  let tanpaWrapper = 0;
  for (const f of daftarBerkas(dir)) {
    const isi = fs.readFileSync(f, "utf8");
    const jmlTabel = (isi.match(/<table/g) ?? []).length;
    const jmlWrapper = (isi.match(/tabel-gulir/g) ?? []).length;
    tabel += jmlTabel;
    if (jmlTabel > jmlWrapper) tanpaWrapper += jmlTabel - jmlWrapper;
  }
  cek(`Tabel ${area}: ${tabel} tabel, 0 tanpa wrapper .tabel-gulir`, tanpaWrapper === 0, `${tabel} tabel`);
}

// ---------- Ringkasan ----------
console.log(`\n${lolos} lolos, ${gagal} gagal.`);
process.exit(gagal === 0 ? 0 : 1);
