// Pemeriksa token Fase 3 redesign — PRATA FAKTA.
// Memastikan, sesudah sapuan token gerak/kaca:
//   1. 0 definisi token menunjuk dirinya sendiri (self-ref
//      --x: var(--x) = rusak diam-diam, pelajaran PRATA v11).
//   2. 0 var() tak terdefinisi di globals.css + motion.css.
//   3. Token gerak §4 + token kaca nyata ada di kedua mode.
// Cara pakai: node scripts/cek-token-gerak.mjs (keluar 0 bila lolos).
import { readFileSync } from "node:fs";

const BERKAS = ["src/app/globals.css", "src/app/motion.css"];

let gagal = 0;
const lolos = [];
function cek(label, kondisi, detail = "") {
  if (kondisi) {
    lolos.push(label);
    console.log(`OK: ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    gagal += 1;
    console.log(`GAGAL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const isi = new Map();
for (const b of BERKAS) {
  // Buang komentar CSS dulu: var(--token) di komentar bukan pemakaian.
  isi.set(b, readFileSync(b, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""));
}
const gabung = [...isi.values()].join("\n");

// Definisi: --nama: nilai;
const definisi = new Map(); // nama -> [{berkas, nilai}]
for (const [berkas, teks] of isi) {
  for (const m of teks.matchAll(/--([\w-]+)\s*:\s*([^;{}]+);/g)) {
    const nama = m[1];
    if (!definisi.has(nama)) definisi.set(nama, []);
    definisi.get(nama).push({ berkas, nilai: m[2].trim() });
  }
}

// 1. Self-ref: nilai definisi mengandung var(--nama-sendiri).
const selfRef = [];
for (const [nama, daftar] of definisi) {
  for (const d of daftar) {
    if (new RegExp(`var\\(\\s*--${nama}\\b`).test(d.nilai)) {
      selfRef.push(`${d.berkas}: --${nama}`);
    }
  }
}
cek("0 definisi token self-ref", selfRef.length === 0, selfRef.join(", "));

// 2. var() tak terdefinisi.
const dipakai = new Set([...gabung.matchAll(/var\(\s*--([\w-]+)/g)].map((m) => m[1]));
const takTerdefinisi = [...dipakai].filter((n) => !definisi.has(n));
cek(
  "0 var() tak terdefinisi",
  takTerdefinisi.length === 0,
  takTerdefinisi.map((n) => `--${n}`).join(", "),
);

// 3. Token gerak §4 ada.
for (const t of [
  "motion-cepat",
  "motion-dasar",
  "motion-halaman",
  "motion-penekanan",
  "motion-stagger",
  "ease-standar",
  "glass-blur",
  "glass-blur-dock",
  "glass-bg-padat",
  "glass-border-highlight",
]) {
  cek(`token --${t} ada`, definisi.has(t));
}

// 4. --glass-bg kaca NYATA (rgba) di kedua mode, bukan solid.
//    Hanya nilai kanonik di globals.css yang dicek — fallback
//    solid di @media prefers-reduced-transparency (motion.css)
//    memang sengaja solid.
const glassBg = (definisi.get("glass-bg") ?? []).filter(
  (d) => d.berkas === "src/app/globals.css",
);
cek(
  "--glass-bg translusen (rgba) di terang + gelap",
  glassBg.length >= 2 && glassBg.every((d) => d.nilai.startsWith("rgba(")),
  glassBg.map((d) => d.nilai).join(" | "),
);

console.log(`\n${lolos.length} lolos, ${gagal} gagal.`);
process.exit(gagal === 0 ? 0 : 1);
