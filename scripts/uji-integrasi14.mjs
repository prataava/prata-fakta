// Uji integrasi Tahap 14 PRATA FAKTA — tautan silang 14 area.
// Memindai seluruh src/ untuk href/redirect/push internal, lalu
// memeriksa tiap target ada sebagai page.tsx / route.ts (segmen
// [slug]/[kode]/[id] dianggap wildcard). Juga memeriksa:
//   - nav publik (Header) menautkan 14 area;
//   - sitemap.ts menyebut slug dinamis baru;
//   - tidak ada tautan ke rute yang dihapus.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import fs from "node:fs";
import path from "node:path";

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

function jalanSemua(dir, ekst, keluar = []) {
  for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
    const penuh = path.join(dir, entri.name);
    if (entri.isDirectory()) {
      if (entri.name === "node_modules") continue;
      jalanSemua(penuh, ekst, keluar);
    } else if (ekst.some((e) => entri.name.endsWith(e))) {
      keluar.push(penuh);
    }
  }
  return keluar;
}

// ---------- Kumpulkan rute yang ada ----------
const halaman = new Set();
const api = new Set();
for (const f of jalanSemua(path.join(DIR_SRC, "app"), [".tsx", ".ts"])) {
  const rel = f.slice(path.join(DIR_SRC, "app").length);
  if (rel.endsWith("/page.tsx")) {
    let rute = rel.slice(0, -"/page.tsx".length) || "/";
    rute = rute.replace(/\[slug\]|\[kode\]|\[id\]/g, "*");
    halaman.add(rute);
  }
  if (rel.endsWith("/route.ts")) {
    // Route handler di luar /api (mis. /podcast.xml, /rss.xml)
    // adalah rute halaman, bukan API — masukkan ke kumpulan
    // yang sesuai agar tautan ke sana tidak dikira mati.
    let rute = rel.slice(0, -"/route.ts".length);
    rute = rute.replace(/\[slug\]|\[kode\]|\[id\]/g, "*");
    if (rute.startsWith("/api/")) api.add(rute);
    else halaman.add(rute);
  }
}
console.log(`Rute halaman: ${halaman.size}, rute API: ${api.size}`);

function ruteAda(target) {
  const bersih = target.split("?")[0].split("#")[0];
  if (bersih === "/") return halaman.has("/");
  const segmen = bersih.split("/").filter(Boolean);
  const cocok = (kumpulan) => {
    for (const r of kumpulan) {
      const rs = r.split("/").filter(Boolean);
      if (rs.length !== segmen.length) continue;
      let ok = true;
      for (let i = 0; i < rs.length; i++) {
        if (rs[i] === "*") continue;
        if (rs[i] !== segmen[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
    return false;
  };
  if (bersih.startsWith("/api/")) return cocok(api);
  return cocok(halaman);
}

// ---------- Pindai tautan internal ----------
const pola = [
  /href=\{?["'`](\/[^"'`{}?#]*)["'`]\}?/g,
  /href="(\/[^"]*)"/g,
  /redirect\(\s*["'`](\/[^"'`]*)/g,
  /(?:router\.push|push)\(\s*["'`](\/[^"'`]*)/g,
  /replace\(\s*["'`](\/[^"'`]*)/g,
];
const tautan = new Map(); // target -> [berkas]
for (const f of jalanSemua(DIR_SRC, [".tsx", ".ts"])) {
  const isi = fs.readFileSync(f, "utf8");
  for (const re of pola) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(isi)) !== null) {
      const target = m[1].split("?")[0].split("#")[0];
      if (!target || target.startsWith("/api/") === false) {
        // tetap catat semua, termasuk /api
      }
      if (!tautan.has(target)) tautan.set(target, []);
      if (!tautan.get(target).includes(f)) tautan.get(target).push(f);
    }
  }
}
// Buang target dinamis (mengandung ${ atau * atau : — tidak bisa dicek statis).
const statis = [...tautan.keys()].filter(
  (t) => t && !t.includes("${") && !t.includes("*") && !t.includes(":"),
);
console.log(`Tautan internal statis ditemukan: ${statis.length}`);
const mati = [];
for (const t of statis) {
  if (!ruteAda(t)) mati.push(t);
}
cek("tidak ada tautan internal mati", mati.length === 0, mati.length ? `mati: ${mati.slice(0, 10).join(", ")}` : `${statis.length} tautan OK`);
if (mati.length > 0) {
  for (const t of mati.slice(0, 20)) {
    console.log(`  MATI ${t} <- ${tautan.get(t).map((f) => f.replace(DIR_SRC, "")).join(", ")}`);
  }
}

// ---------- Nav publik menautkan 14 area ----------
// Jejak Fakta + Multi-Source View bukan entri nav sendiri — keduanya
// adalah seksi di dalam halaman artikel; yang diperiksa adalah
// halaman artikel merender kedua komponen itu. Admin sengaja tidak
// ada di nav publik (masuk staf lewat /masuk; /saya redirect ke
// /masuk bila belum login — diperiksa di bawah).
// Nav publik tinggal di HeaderNav.tsx (F-S6, Gelombang B1): Header
// hanya me-render <HeaderNav />. Periksa sumber kebenaran nav di
// sana, plus Header benar-benar memakainya.
const header = fs.readFileSync(path.join(DIR_SRC, "components/HeaderNav.tsx"), "utf8");
cek(
  "Header me-render <HeaderNav />",
  fs.readFileSync(path.join(DIR_SRC, "components/Header.tsx"), "utf8").includes("<HeaderNav />"),
);
const tautanArea = {
  "Story Tracker (cerita)": "/cerita",
  "Explain the World (pengetahuan)": "/pengetahuan",
  "Reality Check (data)": "/data",
  "Ask the World (tanya)": "/tanya",
  "My PRATA (saya)": "/saya",
  "Academy (akademi)": "/akademi",
  "Podcast (podcast)": "/podcast",
  "Research (riset)": "/riset",
  "Country Profile (negara)": "/negara",
  "Historical Archive (sejarah)": "/sejarah",
  "Public Report (laporkan)": "/laporkan",
};
for (const [nama, href] of Object.entries(tautanArea)) {
  cek(`nav Header menautkan ${nama}`, header.includes(href), href);
}
const halamanArtikel = fs.readFileSync(
  path.join(DIR_SRC, "app/artikel/[slug]/page.tsx"),
  "utf8",
);
cek(
  "halaman artikel merender Jejak Fakta (Area 1)",
  halamanArtikel.includes("<JejakFakta"),
  "JejakFakta",
);
cek(
  "halaman artikel merender Multi-Source View (Area 3)",
  halamanArtikel.includes("<PerbandinganSumber"),
  "PerbandinganSumber",
);
const halamanSaya = fs.readFileSync(path.join(DIR_SRC, "app/saya/page.tsx"), "utf8");
cek(
  "login staf/pengguna terjangkau: /saya redirect ke /masuk bila belum login",
  halamanSaya.includes('redirect("/masuk")'),
  "/saya -> /masuk",
);

// ---------- Sitemap menyebut slug dinamis baru ----------
const sitemap = fs.readFileSync(path.join(DIR_SRC, "app/sitemap.ts"), "utf8");
for (const tabel of ["pf_stories", "pf_courses", "pf_research_reports", "pf_podcast_episodes", "pf_countries"]) {
  cek(`sitemap menyebut ${tabel}`, sitemap.includes(tabel), tabel);
}

// ---------- Alur data silang: artikel -> cerita/negara, negara -> berita ----------
// Arah cerita->artikel dan negara->artikel ada di lib/cerita.ts +
// lib/negara.ts; arah artikel->cerita/negara ditutup Tahap 14 oleh
// getCeritaUntukArtikel + kolom negara_kode di artikel lengkap.
const libData = fs.readFileSync(path.join(DIR_SRC, "lib/data.ts"), "utf8");
cek(
  "artikel lengkap memuat negara_kode (artikel->negara)",
  libData.includes("negara_kode"),
  "KOLOM_ARTIKEL_LENGKAP",
);
const libCerita = fs.readFileSync(path.join(DIR_SRC, "lib/cerita.ts"), "utf8");
cek(
  "lib/cerita.ts punya getCeritaUntukArtikel (artikel->cerita)",
  libCerita.includes("getCeritaUntukArtikel") && libCerita.includes("pf_story_articles"),
  "getCeritaUntukArtikel",
);
const libNegara = fs.readFileSync(path.join(DIR_SRC, "lib/negara.ts"), "utf8");
cek("lib/negara.ts membaca artikel terbaru per negara", libNegara.includes("pf_articles"));
const libRiset = fs.readFileSync(path.join(DIR_SRC, "lib/riset.ts"), "utf8");
cek("lib/riset.ts menautkan dataset indikator (riset<->data)", libRiset.includes("pf_data_indicators") || libRiset.includes("indikator"));
cek("lib/cerita.ts memakai RPC pf_akar_salinan (anti kesetaraan palsu)", libCerita.includes("pf_akar_salinan"));
cek(
  "halaman artikel menautkan /cerita/ (konteks cerita)",
  halamanArtikel.includes("/cerita/"),
  "/cerita/${cerita.slug}",
);
cek(
  "halaman artikel menautkan /negara/ (konteks negara)",
  halamanArtikel.includes("/negara/"),
  "/negara/${negara.negara.kode}",
);

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
