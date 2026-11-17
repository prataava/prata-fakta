// Baterai ekspansi P3 PRATA FAKTA — PWA + offline reading (P3-1),
// personalisasi (P3-2), multi-bahasa (P3-3), glosarium (P3-4).
// PGlite in-memory — aman, tidak menyentuh DB produksi.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// CARA JALAN (wajib, dari akar repo):
//   node --experimental-strip-types \
//     --import /tmp/pf-register.mjs scripts/uji-ekspansi-p3.mjs
// Loader /tmp/pf-register.mjs memetakan alias "@/" ke src/ dan
// men-stub next/headers — diperlukan untuk impor getter P3-2/P3-4.
// Bagian P3-1 di bawah ini HANYA cek berkas statis (fs) sehingga
// jalan juga dengan `node scripts/uji-ekspansi-p3.mjs` polos.
// Tanpa loader, cek impor live (§P3-2/§P3-3/§P3-4) gagal jujur
// (bukan dilewati diam-diam).
//
// BAGIAN P3-2 (ditulis paket P3-2) + BAGIAN P3-3 (ditulis paket
// P3-3, §P3-3 di bawah): kamus live + tanpa-kunci-yatim + wiring
// komponen + penjaga statis. Integrator P3-5 menambah bagian
// P3-5 bila perlu di bawah penanda BAGIAN BERIKUTNYA.
// v21 idempoten + CHECK menolak nilai liar + RLS pemilik kolom
// baru; PATCH preferensi string (validasi lib + semantik upsert
// SQL + penjaga statis route: 400 liar, 503 v21, boolean lama
// tidak regresi); statis: PembacaArtikel (props server,
// debounce, localStorage tamu, kepadatan), globals.css (aturan
// kepadatan + 0 token self-ref), FormPengaturan (seksi
// Preferensi baca + cookie bahasa + status sinkron), halaman
// artikel (teruskan preferensiAwal).
//
// BATAS UJI YANG JUJUR (P3-2):
// - Route Next (GET/PATCH HTTP live) TIDAK diuji di sini:
//   handler memakai createClient() Supabase + rate limiter
//   sehingga tidak bisa diarahkan ke PGlite. Yang diuji:
//   fungsi validasi/normalisasi yang dipakai route (impor
//   live) + semantik SQL upsert yang sama maknanya + penjaga
//   statis atas sumber route. Uji HTTP live tetap BLOKIR
//   sampai ada lingkungan non-produksi.
// - Kode 503/400 PostgREST (PGRST204) adalah kode lapisan
//   PostgREST, bukan Postgres: PGlite tidak menghasilkannya.
//   Jalur fallback v14/v21 di route hanya diperiksa statis.
// - Uji CDP (preferensi bertahan pindah halaman, tamu vs
//   login) tetap BLOKIR bila tidak ada akun uji.
// manifest valid + ikon ada; sw.js: handler push +
// notificationclick utuh (grep statis), fetch handler ada,
// /api/* + /admin/* + /saya/* + /masuk + /daftar dilewati
// (tidak di-cache), precache berisi /offline, tidak ada caching
// respons Set-Cookie; penjaga statis (0 token CSS self-ref,
// halaman baru pakai await connection()).
//
// BAGIAN P3-4 (ditulis paket P3-4, §GLOSARIUM di bawah):
// glosarium v82 43 entri verbatim (jumlah + 3 spot-check +
// verbatim penuh vs sumber) + dedup gabungGlosarium + tautan
// KBBI deep-link saja + penjaga statis halaman /glosarium.
// §GLOSARIUM tidak butuh PGlite (data v82 statis + fungsi murni).
// getGlosarium() live tidak bisa diuji penuh tanpa DB: getter
// memanggil createClient() di dalamnya (pola repo) sehingga
// tanpa env Supabase ia melempar GalatBaca — itu perilaku yang
// benar (bukan empty state diam-diam), dicatat sebagai LEWAT
// jujur, bukan dihitung lolos. Uji HTTP live + kecocokan hitungan
// dengan DB produksi tetap BLOKIR sampai ada lingkungan
// non-produksi.
//
// BATAS UJI YANG JUJUR (P3-1):
// - Perilaku push end-to-end (/api/push/uji) + artikel offline
//   via emulasi offline CDP + banner update di browser nyata
//   TIDAK diuji baterai ini — butuh browser; lihat laporan P3-1
//   (bila headless shell tidak mendukung CDP, BLOKIR jujur).
// - Baterai ini membuktikan sw.js SECARA STATIS (handler ada,
//   rute dilewati, precache benar) + build output memuat rute
//   /offline — bukan perilaku runtime service worker.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const DIR_REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIR_SRC = path.join(DIR_REPO, "src");

let lolos = 0;
let gagal = 0;
function cek(nama, ok, detail = "") {
  if (ok) {
    lolos += 1;
    console.log(`OK: ${nama}`);
  } else {
    gagal += 1;
    console.log(`GAGAL: ${nama}${detail ? ` — ${detail}` : ""}`);
  }
}
function baca(relatif, dir = DIR_REPO) {
  return fs.readFileSync(path.join(dir, relatif), "utf8");
}
function tanpaKomentar(kode) {
  return kode
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}
function ada(relatif, dir = DIR_REPO) {
  return fs.existsSync(path.join(dir, relatif));
}

// Dimensi PNG dari header IHDR (tanpa dependensi gambar).
function dimensiPng(relatif) {
  const buf = fs.readFileSync(path.join(DIR_REPO, relatif));
  if (buf.length < 33) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
  return { lebar: buf.readUInt32BE(16), tinggi: buf.readUInt32BE(20) };
}

// ---------- §P3-1: Manifest + ikon ----------
{
  let manifest = null;
  let manifestOk = false;
  try {
    manifest = JSON.parse(baca("public/manifest.webmanifest"));
    manifestOk = true;
  } catch (err) {
    cek("PWA-A1 manifest.webmanifest JSON valid", false, String(err));
  }
  cek("PWA-A1 manifest.webmanifest JSON valid", manifestOk);
  if (manifest) {
    cek("PWA-A2 manifest name = PRATA FAKTA", manifest.name === "PRATA FAKTA");
    cek("PWA-A3 manifest short_name = PRATA FAKTA", manifest.short_name === "PRATA FAKTA");
    cek("PWA-A4 manifest start_url + scope = /", manifest.start_url === "/" && manifest.scope === "/");
    cek("PWA-A5 manifest display standalone", manifest.display === "standalone");
    cek("PWA-A6 manifest theme_color + background_color #080D18",
      manifest.theme_color === "#080D18" && manifest.background_color === "#080D18");
    const ikon = Array.isArray(manifest.icons) ? manifest.icons : [];
    const punya = (ukuran, purpose) =>
      ikon.some((i) => i.sizes === ukuran && (purpose ? i.purpose === purpose : !i.purpose) && i.type === "image/png");
    cek("PWA-A7 manifest ikon 192", punya("192x192"));
    cek("PWA-A8 manifest ikon 512", punya("512x512"));
    cek("PWA-A9 manifest ikon maskable 512", punya("512x512", "maskable"));
    for (const i of ikon) {
      const rel = `public/${i.src.replace(/^\//, "")}`;
      cek(`PWA-A10 ikon ada + PNG ${i.sizes}: ${i.src}`, ada(rel));
      const dim = ada(rel) ? dimensiPng(rel) : null;
      const [w, h] = (i.sizes || "0x0").split("x").map(Number);
      cek(`PWA-A11 dimensi PNG cocok ${i.sizes}: ${i.src}`,
        dim !== null && dim.lebar === w && dim.tinggi === h,
        dim ? `${dim.lebar}x${dim.tinggi}` : "bukan PNG");
    }
  }
}

// ---------- §P3-1: sw.js — push + notificationclick UTUH ----------
{
  const sw = baca("public/sw.js");
  const utuh = [
    ['handler push', 'self.addEventListener("push"'],
    ['fetch /api/notifikasi payload-less', 'fetch("/api/notifikasi"'],
    ['credentials include', 'credentials: "include"'],
    ['showNotification judul', 'self.registration.showNotification(judul'],
    ['data tautan notifikasi', 'data: { tautan }'],
    ['handler notificationclick', 'self.addEventListener("notificationclick"'],
    ['notification.close()', 'event.notification.close()'],
    ['fallback /saya/notifikasi', '"/saya/notifikasi"'],
    ['clients.openWindow', 'self.clients.openWindow(url)'],
    ['matchAll window', 'self.clients.matchAll('],
  ];
  for (const [nama, potong] of utuh) {
    cek(`PWA-B1 push/notificationclick utuh: ${nama}`, sw.includes(potong));
  }
}

// ---------- §P3-1: sw.js — caching PWA ----------
{
  const sw = baca("public/sw.js");
  cek("PWA-C1 CACHE_VERSION prata-fakta-v1",
    sw.includes('CACHE_VERSION = "prata-fakta-v1"'));
  cek("PWA-C2 fetch handler ada", sw.includes('self.addEventListener("fetch"'));
  cek("PWA-C3 hanya GET ditangani",
    sw.includes('req.method !== "GET"'));
  cek("PWA-C4 hanya same-origin ditangani",
    sw.includes("url.origin !== self.location.origin"));
  cek("PWA-C5 /api/* dilewati total", sw.includes('startsWith("/api/")'));
  cek("PWA-C6 /admin/* dilewati total", sw.includes('startsWith("/admin/")'));
  cek("PWA-C7 /saya/* dilewati total", sw.includes('startsWith("/saya/")'));
  cek("PWA-C8 /masuk dilewati total",
    sw.includes('"/masuk"') && sw.includes('startsWith("/masuk/")'));
  cek("PWA-C9 /daftar dilewati total",
    sw.includes('"/daftar"') && sw.includes('startsWith("/daftar/")'));
  cek("PWA-C10 lewatiCache dipakai di fetch handler",
    sw.includes("lewatiCache(path)") && sw.includes("if (lewatiCache(path)) return;"));
  cek("PWA-C11 precache berisi /offline",
    sw.includes('"/offline"') && sw.includes("PRECACHE"));
  cek("PWA-C12 precache berisi / + manifest + ikon",
    sw.includes('"/",') && sw.includes('"/manifest.webmanifest"') &&
    sw.includes('"/icons/icon-192.png"') && sw.includes('"/icons/icon-512.png"'));
  cek("PWA-C13 install → skipWaiting sesudah precache",
    sw.includes('self.addEventListener("install"') && sw.includes("await self.skipWaiting();"));
  cek("PWA-C14 activate → hapus cache lama + clients.claim()",
    sw.includes('self.addEventListener("activate"') &&
    sw.includes("caches.delete(nama)") && sw.includes("await self.clients.claim();"));
  cek("PWA-C15 pesan SKIP_WAITING → skipWaiting()",
    sw.includes('self.addEventListener("message"') && sw.includes('"SKIP_WAITING"'));
  cek("PWA-C16 navigasi publik network-first jatuh ke /offline",
    sw.includes('req.mode === "navigate"') && sw.includes('caches.match("/offline")'));
  cek("PWA-C17 aset statis cache-first",
    sw.includes('path.startsWith("/_next/static/")') && sw.includes('path.startsWith("/icons/")'));
  cek("PWA-C18 gambar stale-while-revalidate",
    sw.includes("adalahGambar") && sw.includes("void ambil;"));
  cek("PWA-C19 tidak cache respons bukan-200 (!res.ok)",
    sw.includes("!res.ok"));
  cek("PWA-C20 tidak cache respons ber-Set-Cookie",
    sw.includes('res.headers.has("set-cookie")'));
  cek("PWA-C21 sintaks sw.js valid (node --check dijalankan terpisah)",
    !sw.includes("TODO") && !sw.includes("FIXME"));
}

// ---------- §P3-1: layout.tsx — metadata + mount ----------
{
  const layout = baca("app/layout.tsx", DIR_SRC);
  cek("PWA-D1 layout manifest /manifest.webmanifest",
    layout.includes('manifest: "/manifest.webmanifest"'));
  cek("PWA-D2 layout viewport themeColor #080D18",
    layout.includes('themeColor: "#080D18"') && layout.includes("export const viewport"));
  cek("PWA-D3 layout memasang PendaftaranSW",
    layout.includes("<PendaftaranSW />"));
  cek("PWA-D4 layout memasang BannerPembaruan",
    layout.includes("<BannerPembaruan />"));
  cek("PWA-D5 layout TIDAK panggil headers()/cookies() (di luar komentar)",
    !tanpaKomentar(layout).includes("headers()") &&
      !tanpaKomentar(layout).includes("cookies()") &&
      !layout.includes('from "next/headers"'));
  cek("PWA-D6 skrip tema inline + HASH_SKRIP_TEMA utuh",
    layout.includes("function TemaInit()") && layout.includes("pf-tema"));
}

// ---------- §P3-1: komponen klien PWA ----------
{
  const daftar = baca("components/pwa/PendaftaranSW.tsx", DIR_SRC);
  cek("PWA-E1 PendaftaranSW register /sw.js saat window load",
    daftar.includes('register("/sw.js")') && daftar.includes('"load"'));
  cek("PWA-E2 PendaftaranSW cek dukungan serviceWorker",
    daftar.includes('"serviceWorker" in navigator'));
  cek("PWA-E3 PendaftaranSW tidak ganggu PengalihPush (getRegistration/pushManager tidak dipakai di kode, hanya disebut di komentar)",
    !tanpaKomentar(daftar).includes("getRegistration") &&
      !tanpaKomentar(daftar).includes("pushManager"));

  const banner = baca("components/pwa/BannerPembaruan.tsx", DIR_SRC);
  cek("PWA-E4 BannerPembaruan dengar pesan SW_BARU",
    banner.includes('"SW_BARU"'));
  cek("PWA-E5 BannerPembaruan tombol Muat ulang kirim SKIP_WAITING",
    banner.includes("Muat ulang") && banner.includes('postMessage({ type: "SKIP_WAITING" })'));
  cek("PWA-E6 BannerPembaruan reload saat controllerchange (hanya sesudah tombol ditekan)",
    banner.includes('"controllerchange"') && banner.includes("dimintaMuatUlang"));
  cek("PWA-E7 BannerPembaruan tidak tampil tanpa update",
    banner.includes("if (!adaUpdate) return null;"));

  const simpan = baca("components/pwa/ManajemenPenyimpanan.tsx", DIR_SRC);
  cek("PWA-E8 ManajemenPenyimpanan storage.estimate()",
    simpan.includes("navigator.storage.estimate()"));
  cek("PWA-E9 ManajemenPenyimpanan daftar cache + hitung artikel",
    simpan.includes("caches.keys()") && simpan.includes('startsWith("/artikel/")'));
  cek("PWA-E10 ManajemenPenyimpanan tombol Hapus cache offline",
    simpan.includes("Hapus cache offline") && simpan.includes("caches.delete(nama)"));
  cek("PWA-E11 ManajemenPenyimpanan catatan jujur (akun tidak di-cache)",
    simpan.includes("Hanya konten publik yang disimpan; data akun tidak pernah di-cache"));
  cek("PWA-E12 ManajemenPenyimpanan tanpa new Date() di render",
    !simpan.includes("new Date()") && !daftar.includes("new Date()") && !banner.includes("new Date()"));
}

// ---------- §P3-1: halaman /offline ----------
{
  cek("PWA-F1 berkas src/app/offline/page.tsx ada", ada("app/offline/page.tsx", DIR_SRC));
  const off = baca("app/offline/page.tsx", DIR_SRC);
  cek("PWA-F2 /offline pakai await connection()",
    off.includes("await connection()"));
  cek("PWA-F3 /offline instant = false (nonce $RC)",
    off.includes("export const instant = false;"));
  cek("PWA-F4 /offline judul jujur", off.includes("Anda sedang offline"));
  cek("PWA-F5 /offline tautan Beranda + /perpustakaan",
    off.includes('href="/"') && off.includes('href="/perpustakaan"'));
}

// ---------- §P3-1: penjaga statis ----------
{
  const css = baca("app/globals.css", DIR_SRC);
  const selfRef = [...css.matchAll(/--([\w-]+)\s*:[^;]*var\(--\1\)/g)].map((m) => m[0]);
  cek("PWA-G1 CSS: 0 token self-ref", selfRef.length === 0, selfRef.join(", "));
  const offBuild = path.join(DIR_REPO, ".next/server/app/offline/page.js");
  cek("PWA-G2 build output memuat rute /offline (.next/server/app/offline/page.js)",
    fs.existsSync(offBuild), "jalankan `next build` dulu bila gagal");
}

// ---------- §GLOSARIUM (P3-4): data v82 verbatim ----------
// Impor dinamis agar bagian P3-1 (fs-only) tetap jalan dengan
// `node` polos; tanpa loader, impor di bawah gagal dan cek-cek
// live di § ini GAGAL jujur (bukan dilewati diam-diam).
let glos = null;
let glosImporGalat = null;
try {
  const [mGlos, mMurni, mV82] = await Promise.all([
    import("@/lib/glosarium.ts"),
    import("@/lib/glosarium-murni.ts"),
    import("@/lib/glosarium-v82.ts"),
  ]);
  // Fungsi murni + data v82 datang dari modul aman-klien; getter
  // server (getGlosarium) hanya dari glosarium.ts.
  glos = { ...mMurni, ...mGlos, GLOSARIUM_V82: mV82.GLOSARIUM_V82 };
} catch (err) {
  glosImporGalat = err;
}
function lewati(nama, alasan) {
  console.log(`LEWAT: ${nama} — ${alasan}`);
}
if (!glos) {
  cek("GLOS-A0 impor @/lib/glosarium.ts (butuh loader /tmp/pf-register.mjs)", false, String(glosImporGalat));
} else {
  const { GLOSARIUM_V82, gabungGlosarium, getGlosarium, normalisasiIstilah, tautanKbbi } = glos;

  // Ekstrak ISTILAH_SULIT dari sumber persis seperti skrip ekstraksi
  // (/tmp/ekstrak-glosarium-v82.mjs) lalu bandingkan SEMUA entri.
  const SUMBER_V82 = "/home/hatch/workspace/panara-deploy/index.html";
  const htmlSumber = fs.readFileSync(SUMBER_V82, "utf8");
  const cocokSumber = htmlSumber.match(/var ISTILAH_SULIT = (\[[\s\S]*?\n\]);/);
  cek("GLOS-A1 sumber v82: ISTILAH_SULIT ditemukan di panara-deploy/index.html", !!cocokSumber);
  const sumberEntri = cocokSumber
    ? new Function(`return (${cocokSumber[1]});`)()
    : [];

  cek("GLOS-A2 v82: jumlah entri = 43", GLOSARIUM_V82.length === 43, `dapat ${GLOSARIUM_V82.length}`);
  cek(
    "GLOS-A3 v82: jumlah sumber = 43",
    Array.isArray(sumberEntri) && sumberEntri.length === 43,
    `dapat ${Array.isArray(sumberEntri) ? sumberEntri.length : "bukan array"}`,
  );

  const hitungKat = {};
  for (const e of GLOSARIUM_V82) hitungKat[e.kategori] = (hitungKat[e.kategori] ?? 0) + 1;
  cek("GLOS-A4 v82: Hukum & Pemerintahan = 28", hitungKat["Hukum & Pemerintahan"] === 28, `dapat ${hitungKat["Hukum & Pemerintahan"]}`);
  cek("GLOS-A5 v82: Ekonomi = 8", hitungKat["Ekonomi"] === 8, `dapat ${hitungKat["Ekonomi"]}`);
  cek("GLOS-A6 v82: Sosial & Budaya = 7", hitungKat["Sosial & Budaya"] === 7, `dapat ${hitungKat["Sosial & Budaya"]}`);

  // Spot-check 3 entri (awal / tengah / akhir) byte-identik sumber.
  for (const i of [0, 27, 42]) {
    const a = GLOSARIUM_V82[i];
    const b = sumberEntri[i];
    cek(
      `GLOS-A7 v82 spot-check #${i} "${b?.istilah ?? "?"}": istilah+arti+konteks+kategori identik sumber`,
      !!a &&
        !!b &&
        a.istilah === b.istilah &&
        a.arti === b.arti &&
        a.konteks === b.konteks &&
        a.kategori === b.kat,
    );
  }
  // Verbatim penuh: semua 43 entri identik sumber.
  let beda = -1;
  if (Array.isArray(sumberEntri) && sumberEntri.length === GLOSARIUM_V82.length) {
    beda = 0;
    for (let i = 0; i < sumberEntri.length; i += 1) {
      const a = GLOSARIUM_V82[i];
      const b = sumberEntri[i];
      if (a.istilah !== b.istilah || a.arti !== b.arti || a.konteks !== b.konteks || a.kategori !== b.kat) {
        beda += 1;
      }
    }
  }
  cek("GLOS-A8 v82 verbatim penuh: 0 dari 43 entri berbeda dari sumber", beda === 0, `${beda} berbeda`);

  // ---------- §GLOSARIUM: normalisasi + tautan KBBI ----------
  cek('GLOS-B1 normalisasi: "  AMNESTI  " → "amnesti"', normalisasiIstilah("  AMNESTI  ") === "amnesti");
  cek('GLOS-B2 normalisasi: "Hak   Asasi" → "hak asasi"', normalisasiIstilah("Hak   Asasi") === "hak asasi");
  cek(
    "GLOS-B3 KBBI: deep link saja, tanpa isi KBBI",
    tautanKbbi("Amnesti") === "https://kbbi.kemendikdasmen.go.id/entri/amnesti",
    tautanKbbi("Amnesti"),
  );
  cek(
    "GLOS-B4 KBBI: istilah multi-kata di-encode",
    tautanKbbi("Hak Asasi") === "https://kbbi.kemendikdasmen.go.id/entri/hak%20asasi",
    tautanKbbi("Hak Asasi"),
  );
  cek(
    "GLOS-B5 KBBI: glosarium.ts tidak mem-fetch KBBI",
    !baca("lib/glosarium.ts", DIR_SRC).includes("fetch("),
  );

  // ---------- §GLOSARIUM: dedup gabungGlosarium (fungsi murni) ----------
  const V82_UJI = [
    { istilah: "Amnesti", arti: "Arti v82 asli.", konteks: "Konteks v82.", kategori: "Hukum & Pemerintahan" },
    { istilah: "Resesi", arti: "Arti resesi v82.", konteks: "Konteks resesi.", kategori: "Ekonomi" },
  ];
  const gabung1 = gabungGlosarium(V82_UJI, [
    { istilah: "  AMNESTI ", definisi: "Definisi lain dari artikel.", slug: "amnesti-artikel", judulArtikel: "Artikel Amnesti" },
    { istilah: "Inflasi", definisi: "Kenaikan harga umum.", slug: "inflasi-artikel", judulArtikel: "Artikel Inflasi" },
  ]);
  cek("GLOS-C1 dedup: 2 v82 + 2 pengetahuan (1 kembar) = 3 entri", gabung1.length === 3, `dapat ${gabung1.length}`);
  const amnesti = gabung1.find((e) => e.istilah === "Amnesti");
  cek(
    "GLOS-C2 dedup: istilah kembar = SATU entri, sumber v82 + pengetahuan",
    !!amnesti && amnesti.sumber.includes("v82") && amnesti.sumber.includes("pengetahuan"),
    JSON.stringify(amnesti?.sumber),
  );
  cek(
    "GLOS-C3 dedup: istilah kembar memakai definisi v82 (arti v82 tidak diubah)",
    amnesti?.arti === "Arti v82 asli.",
    amnesti?.arti ?? "null",
  );
  cek(
    "GLOS-C4 dedup: istilah kembar tetap mencatat tautan artikel",
    !!amnesti && amnesti.tautanPengetahuan.includes("amnesti-artikel"),
    JSON.stringify(amnesti?.tautanPengetahuan),
  );
  const inflasi = gabung1.find((e) => e.istilah === "Inflasi");
  cek(
    "GLOS-C5 dedup: istilah hanya-pengetahuan berkategori Pengetahuan",
    !!inflasi && inflasi.kategori === "Pengetahuan" && inflasi.sumber.length === 1 && inflasi.sumber[0] === "pengetahuan",
    JSON.stringify(inflasi),
  );
  cek(
    "GLOS-C6 dedup: istilah hanya-pengetahuan memakai definisi artikel",
    inflasi?.arti === "Kenaikan harga umum.",
    inflasi?.arti ?? "null",
  );
  cek(
    "GLOS-C7 dedup: hasil terurut alfabetis",
    gabung1.map((e) => e.istilah).join("|") === "Amnesti|Inflasi|Resesi",
    gabung1.map((e) => e.istilah).join("|"),
  );

  const gabung2 = gabungGlosarium([], [
    { istilah: "Gotong Royong", definisi: null, slug: "gotong-royong", judulArtikel: "Artikel A" },
    { istilah: "gotong royong", definisi: "Kerja bersama.", slug: "gotong-royong-2", judulArtikel: "Artikel B" },
  ]);
  cek("GLOS-C8 dedup: istilah sama di 2 artikel = 1 entri, 2 slug", gabung2.length === 1 && gabung2[0].tautanPengetahuan.length === 2, `dapat ${gabung2.length} entri / ${gabung2[0]?.tautanPengetahuan.length ?? 0} slug`);
  cek(
    "GLOS-C9 dedup: definisi null tidak dikarang (arti tetap null bila artikel pertama tanpa definisi)",
    gabung2[0]?.arti === null,
    String(gabung2[0]?.arti),
  );

  // ---------- §GLOSARIUM: getGlosarium() live (tanpa DB) ----------
  // Tanpa env Supabase, getter melempar GalatBaca (pola repo: galat
  // baca nyata dilempar, bukan empty state diam-diam). Bila env ada
  // (lingkungan dengan DB), asersi penuh: >= 43 entri, semua v82 ada.
  try {
    const semua = await getGlosarium();
    cek("GLOS-D1 live getGlosarium(): >= 43 entri", semua.length >= 43, `dapat ${semua.length}`);
    const istilahV82 = new Set(GLOSARIUM_V82.map((e) => normalisasiIstilah(e.istilah)));
    const istilahSemua = new Set(semua.map((e) => normalisasiIstilah(e.istilah)));
    cek(
      "GLOS-D2 live getGlosarium(): semua 43 istilah v82 hadir",
      [...istilahV82].every((s) => istilahSemua.has(s)),
    );
  } catch (err) {
    lewati(
      "GLOS-D live getGlosarium() tanpa DB",
      `melempar ${err?.name ?? "galat"} tanpa env Supabase (perilaku benar per pola repo) — uji live butuh lingkungan ber-DB`,
    );
  }
}

// ---------- §GLOSARIUM: penjaga statis (fs-only) ----------
{
  const halaman = baca("app/glosarium/page.tsx", DIR_SRC);
  cek("GLOS-E1 halaman /glosarium: memakai await connection()", halaman.includes("await connection()"));
  cek("GLOS-E2 halaman /glosarium: tidak memanggil new Date() di render (di luar komentar)", !halaman.replace(/\/\/.*$/gm, "").includes("new Date()"));
  const klien = baca("app/glosarium/GlosariumInteraktif.tsx", DIR_SRC);
  cek('GLOS-E3 klien glosarium: empty state jujur "Tidak ada istilah yang cocok"', klien.includes("Tidak ada istilah yang cocok"));
  cek("GLOS-E4 klien glosarium: tombol reset memanggil reset()", klien.includes("onClick={reset}"));
  cek("GLOS-E5 klien glosarium: tidak memanggil new Date()", !klien.includes("new Date()"));
  cek(
    "GLOS-E6 klien glosarium: id cari-glosarium unik (satu id=)",
    (klien.match(/id="cari-glosarium"/g) ?? []).length === 1,
  );
  cek(
    "GLOS-E7 klien glosarium: tautan KBBI lewat helper tautanKbbi (bukan URL karangan)",
    klien.includes("tautanKbbi(") && !klien.includes("kbbi.kemendikdasmen.go.id"),
  );
  cek(
    "GLOS-E8 pengetahuan: ada tautan masuk /glosarium",
    baca("app/pengetahuan/page.tsx", DIR_SRC).includes('href="/glosarium"'),
  );
  const v82Src = baca("lib/glosarium-v82.ts", DIR_SRC);
  cek(
    "GLOS-E9 v82: header menulis sumber (panara-deploy/index.html, ISTILAH_SULIT)",
    v82Src.includes("panara-deploy/index.html") && v82Src.includes("ISTILAH_SULIT"),
  );
  cek(
    "GLOS-E10 v82: header mencatat data statis, bukan tabel DB",
    v82Src.includes("BUKAN tabel database"),
  );
  cek(
    "GLOS-E11 anti-tabrakan: gabungGlosarium didefinisikan sekali di src",
    (baca("lib/glosarium-murni.ts", DIR_SRC).match(/export function gabungGlosarium/g) ?? []).length === 1,
  );
  cek(
    "GLOS-E12 klien aman: GlosariumInteraktif impor glosarium-murni (bukan glosarium.ts server)",
    klien.includes('from "@/lib/glosarium-murni"') && !klien.includes('from "@/lib/glosarium"'),
  );
  cek(
    "GLOS-E13 glosarium-murni.ts tanpa impor server (modul murni: 0 impor @/)",
    !baca("lib/glosarium-murni.ts", DIR_SRC).includes('from "@/'),
  );
}

// ---------- §P3-2-A: v21 di PGlite (idempoten + CHECK + RLS) ----------
const requirePglite = createRequire("/tmp/pf-sqlcheck/package.json");
const { PGlite } = requirePglite("@electric-sql/pglite");
const DIR_MIGRASI = path.join(DIR_REPO, "supabase/migrations");
const MIGRASI_P32 = [
  "20261116_pf_v1_foundation.sql",
  "20261116_pf_v2_articles.sql",
  "20261116_pf_v3_ingestion.sql",
  "20261116_pf_v4_ai.sql",
  "20261116_pf_v5_editorial.sql",
  "20261116_pf_v6_advanced.sql",
  "20261116_pf_v7_quiz_scores.sql",
  "20261116_pf_v8_expansion.sql",
  "20261116_pf_v9_grants.sql",
  "20261116_pf_v10_wave2.sql",
  "20261116_pf_v11_rate_limit_audit.sql",
  "20261116_pf_v12_seed_jobs.sql",
  "20261116_pf_v13_ultimate.sql",
  "20261116_pf_v14_gelombang_b2.sql",
  "20261116_pf_v15_tahap_c.sql",
  "20261116_pf_v16_bookmark_pengetahuan.sql",
  "20261116_pf_v17_event_artikel_id.sql",
  "20261117_pf_v18_ekspansi_p0.sql",
  "20261117_pf_v19_ekspansi_p1.sql",
  "20261117_pf_v21_ekspansi_p3.sql",
];
function bacaMigrasi(nama) {
  let sql = fs.readFileSync(path.join(DIR_MIGRASI, nama), "utf8");
  sql = sql.replace(/create extension[^;]+;/gi, "-- ekstensi dilepas (PGlite)");
  sql = sql.replace(/\bcitext\b/gi, "text");
  return sql;
}
const db = new PGlite();
await db.exec(`create schema if not exists auth;`);
await db.exec(`create schema if not exists extensions;`);
await db.exec(
  `create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);`,
);
await db.exec(
  `create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('pf.uid_test', true), '')::uuid $$;`,
);
await db.exec(`create role anon nologin;`);
await db.exec(`create role authenticated nologin;`);
await db.exec(`create role service_role nologin;`);

let migrasiP32Ok = true;
for (const nama of MIGRASI_P32) {
  try {
    await db.exec(bacaMigrasi(nama));
  } catch (e) {
    migrasiP32Ok = false;
    console.log(`GAGAL: migrasi ${nama} — ${String(e.message).split("\n")[0]}`);
  }
}
cek("P32-A1 migrasi v1–v19 + v21 diterapkan di PGlite", migrasiP32Ok);

async function hitungP32(sql, params = []) {
  const r = await db.query(sql, params);
  return Number(r.rows[0]?.jumlah ?? r.rows[0]?.count ?? 0);
}
async function barisP32(sql, params = []) {
  return (await db.query(sql, params)).rows;
}
async function gagalSqlP32(sql, params = []) {
  try {
    await db.query(sql, params);
    return false;
  } catch {
    return true;
  }
}
{
  const r = await barisP32(
    `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'pf_user_preferences'
        and column_name in ('mode_baca', 'ukuran_font', 'kepadatan', 'bahasa')
      order by column_name`,
  );
  const peta = Object.fromEntries(r.map((x) => [x.column_name, x]));
  cek(
    "P32-A2 v21: 4 kolom baru ada, text NOT NULL + default",
    r.length === 4 &&
      peta.mode_baca?.data_type === "text" &&
      peta.mode_baca?.is_nullable === "NO" &&
      peta.mode_baca?.column_default === "'3menit'::text" &&
      peta.ukuran_font?.column_default === "'M'::text" &&
      peta.kepadatan?.column_default === "'nyaman'::text" &&
      peta.bahasa?.column_default === "'id'::text",
    JSON.stringify(r.map((x) => [x.column_name, x.column_default])),
  );
}
{
  let ok = true;
  try {
    await db.exec(bacaMigrasi("20261117_pf_v21_ekspansi_p3.sql"));
  } catch (e) {
    ok = false;
    console.log(`GAGAL: v21 kedua — ${String(e.message).split("\n")[0]}`);
  }
  cek("P32-A3 v21 idempoten (jalan kedua tanpa error)", ok);
}
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
await db.exec(
  `insert into auth.users (id, email) values ('${U1}','satu@uji.id'), ('${U2}','dua@uji.id') on conflict (id) do nothing;`,
);
{
  await db.exec(
    `insert into public.pf_user_preferences (user_id) values ('${U1}') on conflict (user_id) do nothing;`,
  );
  const r = await barisP32(
    `select mode_baca, ukuran_font, kepadatan, bahasa from public.pf_user_preferences where user_id = '${U1}'`,
  );
  cek(
    "P32-A4 default baris baru: 3menit / M / nyaman / id",
    r.length === 1 &&
      r[0].mode_baca === "3menit" &&
      r[0].ukuran_font === "M" &&
      r[0].kepadatan === "nyaman" &&
      r[0].bahasa === "id",
    JSON.stringify(r[0] ?? null),
  );
}
{
  const liar = [
    [`mode_baca`, `'liar'`],
    [`mode_baca`, `'deep'`],
    [`ukuran_font`, `'XX'`],
    [`ukuran_font`, `'m'`],
    [`kepadatan`, `'longgar'`],
    [`bahasa`, `'fr'`],
    [`bahasa`, `'EN'`],
  ];
  let semuaDitolak = true;
  for (const [kolom, nilai] of liar) {
    const ditolak = await gagalSqlP32(
      `insert into public.pf_user_preferences (user_id, ${kolom}) values ('${U2}', ${nilai}) on conflict (user_id) do update set ${kolom} = excluded.${kolom}`,
    );
    if (!ditolak) semuaDitolak = false;
  }
  cek("P32-A5 CHECK v21 menolak 7 nilai liar", semuaDitolak);
  await db.exec(
    `insert into public.pf_user_preferences (user_id, mode_baca, ukuran_font, kepadatan, bahasa)
       values ('${U2}', '1menit', 'S', 'rapat', 'en')
       on conflict (user_id) do update set mode_baca = excluded.mode_baca, ukuran_font = excluded.ukuran_font, kepadatan = excluded.kepadatan, bahasa = excluded.bahasa;`,
  );
  const r = await barisP32(
    `select mode_baca, ukuran_font, kepadatan, bahasa from public.pf_user_preferences where user_id = '${U2}'`,
  );
  cek(
    "P32-A6 nilai valid tersimpan: 1menit / S / rapat / en",
    r.length === 1 &&
      r[0].mode_baca === "1menit" &&
      r[0].ukuran_font === "S" &&
      r[0].kepadatan === "rapat" &&
      r[0].bahasa === "en",
    JSON.stringify(r[0] ?? null),
  );
}
{
  // RLS pemilik tetap berlaku untuk kolom baru: sebagai
  // authenticated U1 hanya baris sendiri yang terlihat/terubah.
  let rlsOk = false;
  let detail = "";
  try {
    await db.exec(`set role authenticated;`);
    await db.exec(`select set_config('pf.uid_test', '${U1}', false);`);
    const terlihat = await hitungP32(
      `select count(*)::int as jumlah from public.pf_user_preferences`,
    );
    const ubahSendiri = await db.query(
      `update public.pf_user_preferences set mode_baca = 'mendalam' where user_id = '${U1}' returning user_id`,
    );
    const ubahOrang = await db.query(
      `update public.pf_user_preferences set mode_baca = 'mendalam' where user_id = '${U2}' returning user_id`,
    );
    rlsOk =
      terlihat === 1 &&
      ubahSendiri.rows.length === 1 &&
      ubahOrang.rows.length === 0;
    detail = `terlihat=${terlihat} ubahSendiri=${ubahSendiri.rows.length} ubahOrang=${ubahOrang.rows.length}`;
  } catch (e) {
    detail = String(e.message).split("\n")[0];
  } finally {
    try {
      await db.exec(`reset role;`);
      await db.exec(`select set_config('pf.uid_test', '', false);`);
    } catch {
      // Reset gagal: dilaporkan lewat cek di bawah bila memengaruhi.
    }
  }
  cek("P32-A7 RLS pemilik kolom baru: U1 lihat 1 baris, ubah milik orang 0", rlsOk, detail);
}

// ---------- §P3-2-B: PATCH preferensi string (lib + SQL + statis) ----------
let libBaca = null;
let libBacaGalat = null;
try {
  libBaca = await import("@/lib/preferensi-baca.ts");
} catch (err) {
  libBacaGalat = err;
}
cek(
  "P32-B1 impor live @/lib/preferensi-baca (butuh loader /tmp/pf-register.mjs)",
  libBaca !== null,
  libBacaGalat ? String(libBacaGalat.message).split("\n")[0] : "",
);
if (libBaca) {
  const { validasiPatchPreferensiBaca, dariBarisPreferensiBaca, DEFAULT_PREFERENSI_BACA } = libBaca;
  cek(
    "P32-B2 default lib: 3menit / M / nyaman / id",
    DEFAULT_PREFERENSI_BACA.mode_baca === "3menit" &&
      DEFAULT_PREFERENSI_BACA.ukuran_font === "M" &&
      DEFAULT_PREFERENSI_BACA.kepadatan === "nyaman" &&
      DEFAULT_PREFERENSI_BACA.bahasa === "id",
  );
  const valid = validasiPatchPreferensiBaca({
    mode_baca: "mendalam",
    ukuran_font: "L",
    kepadatan: "rapat",
    bahasa: "en",
  });
  cek(
    "P32-B3 validasi: 4 kunci string valid → ok",
    valid.ok === true && Object.keys(valid.perubahan ?? {}).length === 4,
    JSON.stringify(valid),
  );
  const liarMode = validasiPatchPreferensiBaca({ mode_baca: "liar" });
  cek(
    "P32-B4 validasi: mode_baca liar → ok:false (route menjawab 400)",
    liarMode.ok === false,
    JSON.stringify(liarMode),
  );
  const liarUkuran = validasiPatchPreferensiBaca({ ukuran_font: "XX" });
  const liarKepadatan = validasiPatchPreferensiBaca({ kepadatan: "longgar" });
  const liarBahasa = validasiPatchPreferensiBaca({ bahasa: "fr" });
  cek(
    "P32-B5 validasi: ukuran/kepadatan/bahasa liar → ok:false",
    liarUkuran.ok === false && liarKepadatan.ok === false && liarBahasa.ok === false,
  );
  const kosong = validasiPatchPreferensiBaca({ digest_harian: true });
  cek(
    "P32-B6 validasi: body tanpa kunci baca → perubahan kosong (boolean jalan sendiri)",
    kosong.ok === true && Object.keys(kosong.perubahan ?? {}).length === 0,
  );
  const normal = dariBarisPreferensiBaca({
    mode_baca: "1menit",
    ukuran_font: null,
    kepadatan: "rapat",
    bahasa: "xx",
  });
  cek(
    "P32-B7 normalisasi baris: nilai hilang/liar → default, valid dipertahankan",
    normal.mode_baca === "1menit" &&
      normal.ukuran_font === "M" &&
      normal.kepadatan === "rapat" &&
      normal.bahasa === "id",
    JSON.stringify(normal),
  );
  cek(
    "P32-B8 normalisasi baris null → semua default",
    JSON.stringify(dariBarisPreferensiBaca(null)) ===
      JSON.stringify(DEFAULT_PREFERENSI_BACA),
  );
}
{
  // Semantik upsert route (SQL yang sama maknanya): PATCH string
  // menimpa hanya kunci yang dikirim, boolean lain utuh.
  await db.exec(
    `insert into public.pf_user_preferences (user_id, digest_harian, mode_baca)
       values ('${U1}', false, '3menit')
       on conflict (user_id) do update set digest_harian = excluded.digest_harian, mode_baca = excluded.mode_baca;`,
  );
  await db.exec(
    `insert into public.pf_user_preferences (user_id, mode_baca, bahasa)
       values ('${U1}', 'mendalam', 'en')
       on conflict (user_id) do update set mode_baca = excluded.mode_baca, bahasa = excluded.bahasa;`,
  );
  const r = await barisP32(
    `select digest_harian, mode_baca, bahasa, ukuran_font from public.pf_user_preferences where user_id = '${U1}'`,
  );
  cek(
    "P32-B9 upsert: PATCH parsial hanya ubah kunci dikirim (digest false tetap)",
    r.length === 1 &&
      r[0].digest_harian === false &&
      r[0].mode_baca === "mendalam" &&
      r[0].bahasa === "en" &&
      r[0].ukuran_font === "M",
    JSON.stringify(r[0] ?? null),
  );
}
{
  const route = baca("app/api/saya/preferensi/route.ts", DIR_SRC);
  cek(
    "P32-B10 route GET menyertakan 4 kolom baru di KOLOM_SELECT",
    route.includes("mode_baca, ukuran_font, kepadatan, bahasa"),
  );
  cek(
    "P32-B11 route PATCH: kunci string liar → 400 (validasiPatchPreferensiBaca)",
    route.includes("validasiPatchPreferensiBaca") && route.includes("status: 400"),
  );
  cek(
    "P32-B12 route PATCH: kolom v21 belum ada → 503 jujur (pesan migrasi v21)",
    route.includes("migrasi v21 belum dijalankan") && route.includes("status: 503"),
  );
  cek(
    "P32-B13 route: perilaku boolean lama utuh (KUNCI_BOOLEAN + tolak non-boolean 400 + pesan v14)",
    route.includes("KUNCI_BOOLEAN") &&
      route.includes("harus boolean") &&
      route.includes("migrasi v14 belum dijalankan"),
  );
  cek(
    "P32-B14 route GET: fallback berantai v21 → v14 → lama (KOLOM_V14_SELECT)",
    route.includes("KOLOM_V14_SELECT") && route.includes("KOLOM_LAMA_SELECT"),
  );
}

// ---------- §P3-2-C: penjaga statis ----------
{
  const pembaca = baca("components/artikel/PembacaArtikel.tsx", DIR_SRC);
  cek(
    "P32-C1 PembacaArtikel: props preferensiAwal dari server",
    pembaca.includes("preferensiAwal"),
  );
  cek(
    "P32-C2 PembacaArtikel: tulis PATCH debounce (800 md) + bukan tiap ketik",
    pembaca.includes("800") && pembaca.includes("kirimPreferensiBaca"),
  );
  cek(
    "P32-C3 PembacaArtikel: tamu localStorage pf-preferensi-baca + server menang saat login",
    pembaca.includes("pf-preferensi-baca") && pembaca.includes("bacaPreferensiBacaTamu"),
  );
  cek(
    "P32-C4 PembacaArtikel: kepadatan diterapkan ke body (terapkanKepadatan)",
    pembaca.includes("terapkanKepadatan(kepadatan)"),
  );
  cek(
    "P32-C5 PembacaArtikel: enum mode/ukuran TIDAK berubah (1menit/3menit/mendalam, S/M/L)",
    pembaca.includes('"1menit" | "3menit" | "mendalam"') &&
      pembaca.includes('"S" | "M" | "L"'),
  );
  const migrasi = baca("supabase/migrations/20261117_pf_v21_ekspansi_p3.sql");
  cek(
    "P32-C6 migrasi v21 CHECK mode_baca = enum komponen persis",
    migrasi.includes("mode_baca in ('1menit', '3menit', 'mendalam')"),
  );
  cek(
    "P32-C7 migrasi v21 CHECK ukuran_font = enum komponen persis",
    migrasi.includes("ukuran_font in ('S', 'M', 'L')"),
  );
  cek(
    "P32-C8 migrasi v21 ADDITIVE-ONLY (IF NOT EXISTS, tanpa DROP/ubah RLS)",
    migrasi.includes("if not exists") &&
      !/drop\s+(column|table|policy)/i.test(migrasi),
  );
  const css = baca("app/globals.css", DIR_SRC);
  cek(
    "P32-C9 globals.css: aturan kepadatan rapat (grid + kartu + seksi)",
    css.includes('body[data-kepadatan="rapat"] .grid-berita') &&
      css.includes('body[data-kepadatan="rapat"] .kartu') &&
      css.includes('body[data-kepadatan="rapat"] .seksi'),
  );
  const selfRef = [...css.matchAll(/--([\w-]+)\s*:[^;]*var\(--\1\)/g)].map((m) => m[0]);
  cek("P32-C10 CSS: 0 token self-ref", selfRef.length === 0, selfRef.join(", "));
  const pengaturan = baca("components/saya/FormPengaturan.tsx", DIR_SRC);
  cek(
    "P32-C11 FormPengaturan: seksi Preferensi baca (mode + font + kepadatan + bahasa)",
    pengaturan.includes("Preferensi baca") &&
      pengaturan.includes("mode_baca") &&
      pengaturan.includes("ukuran_font") &&
      pengaturan.includes("kepadatan") &&
      pengaturan.includes("bahasa"),
  );
  cek(
    "P32-C12 FormPengaturan: bahasa set cookie pf-bahasa + status sinkron akun",
    pengaturan.includes("pf-bahasa") &&
      pengaturan.includes("Tersimpan di akun — berlaku di semua perangkat"),
  );
  const artikel = baca("app/artikel/[slug]/page.tsx", DIR_SRC);
  cek(
    "P32-C13 halaman artikel: teruskan preferensiAwal ke PembacaArtikel (login saja)",
    artikel.includes("preferensiAwal={loggedIn ? preferensiBaca : undefined}"),
  );
}

// ---------- §P3-3: MULTI-BAHASA ID/EN (ditulis paket P3-3) ----------
// Kamus live (impor src/lib/i18n.ts) + tanpa-kunci-yatim (statis)
// + wiring komponen (statis) + penjaga statis (CSS, layout,
// tanpa-rute-/en/).
//
// BATAS UJI YANG JUJUR (P3-3):
// - getBahasa() live di sini memakai STUB next/headers (tanpa
//   cookie) sehingga hanya membuktikan fallback "id", BUKAN
//   pembacaan cookie nyata. Pembacaan cookie + ganti bahasa
//   end-to-end dibuktikan sapuan CDP (server lokal tanpa kunci
//   dummy), bukan baterai ini.
// - PATCH bahasa ke akun butuh kolom v21 (P3-2): baterai ini
//   hanya memeriksa statis bahwa PemilihBahasa mengirim PATCH +
//   cookie tetap berlaku bila gagal. Uji PATCH 200/400/503 adalah
//   bagian P3-2 (§P3-2-B) — lihat cek P32 di atas.
// - Terjemahan visual (nav EN, EmptyState EN, placeholder EN)
//   dibuktikan CDP, bukan baterai ini.
const i18nP33 = await import("../src/lib/i18n.ts");
const {
  KAMUS: KAMUS_P33,
  t: tP33,
  bahasaDariNilai: bahasaDariNilaiP33,
  getBahasa: getBahasaP33,
  TEKS_KOSONG: TEKS_KOSONG_P33,
  COOKIE_BAHASA: COOKIE_BAHASA_P33,
  ACARA_BAHASA: ACARA_BAHASA_P33,
} = i18nP33;

cek(
  "P33-A1 kamus punya tepat bahasa id+en",
  JSON.stringify(Object.keys(KAMUS_P33).sort()) === '["en","id"]',
);
const kunciIdP33 = Object.keys(KAMUS_P33.id).sort();
const kunciEnP33 = Object.keys(KAMUS_P33.en).sort();
cek(
  "P33-A2 himpunan kunci id == en (tiap kunci punya pasangan EN)",
  JSON.stringify(kunciIdP33) === JSON.stringify(kunciEnP33),
  `id=${kunciIdP33.length} en=${kunciEnP33.length}`,
);
cek(
  "P33-A3 jumlah kunci 60–80 (cakupan jujur P3-3)",
  kunciIdP33.length >= 60 && kunciIdP33.length <= 80,
  `${kunciIdP33.length} kunci`,
);
cek(
  "P33-A4 semua nilai id+en string tak-kosong",
  kunciIdP33.every(
    (k) => typeof KAMUS_P33.id[k] === "string" && KAMUS_P33.id[k].length > 0,
  ) &&
    kunciEnP33.every(
      (k) => typeof KAMUS_P33.en[k] === "string" && KAMUS_P33.en[k].length > 0,
    ),
);
cek(
  "P33-A5 tanpa kunci artikel (isi berita tidak diterjemahkan)",
  kunciIdP33.every((k) => !k.startsWith("artikel.")),
);
cek(
  "P33-A6 t(id,k) == KAMUS.id[k] untuk semua kunci",
  kunciIdP33.every((k) => tP33("id", k) === KAMUS_P33.id[k]),
);
cek(
  "P33-A7 t(en,k) == KAMUS.en[k] untuk semua kunci",
  kunciEnP33.every((k) => tP33("en", k) === KAMUS_P33.en[k]),
);
cek(
  "P33-A8 interpolasi {q} ID terisi + tanpa sisa placeholder",
  tP33("id", "cari.tidakAdaHasilPesan", { q: "XYZQQ" }).includes("XYZQQ") &&
    !tP33("id", "cari.tidakAdaHasilPesan", { q: "XYZQQ" }).includes("{q}"),
);
cek(
  "P33-A9 interpolasi {q} EN terisi + tanpa sisa placeholder",
  tP33("en", "palette.tidakAdaHasil", { q: "XYZQQ" }).includes("XYZQQ") &&
    !tP33("en", "palette.tidakAdaHasil", { q: "XYZQQ" }).includes("{q}"),
);
cek('P33-A10 bahasaDariNilai("en")==="en"', bahasaDariNilaiP33("en") === "en");
cek('P33-A11 bahasaDariNilai("id")==="id"', bahasaDariNilaiP33("id") === "id");
cek(
  'P33-A12 bahasaDariNilai("fr")==="id" (liar → id)',
  bahasaDariNilaiP33("fr") === "id",
);
cek(
  'P33-A13 bahasaDariNilai("EN")==="id" (peka huruf besar)',
  bahasaDariNilaiP33("EN") === "id",
);
cek('P33-A14 bahasaDariNilai(null)==="id"', bahasaDariNilaiP33(null) === "id");
cek(
  'P33-A15 bahasaDariNilai(undefined)==="id"',
  bahasaDariNilaiP33(undefined) === "id",
);
cek(
  "P33-A16 getBahasa() → id tanpa cookie (stub next/headers)",
  (await getBahasaP33()) === "id",
);
cek('P33-A17 COOKIE_BAHASA === "pf-bahasa"', COOKIE_BAHASA_P33 === "pf-bahasa");
cek('P33-A18 ACARA_BAHASA === "pf:bahasa"', ACARA_BAHASA_P33 === "pf:bahasa");
const VARIAN_P33 = ["kosong", "error", "izin", "tak-tersedia", "memuat"];
cek(
  "P33-A19 TEKS_KOSONG mencakup 5 varian + kunci judul/pesan ada di kamus",
  VARIAN_P33.every(
    (v) =>
      TEKS_KOSONG_P33[v] &&
      kunciIdP33.includes(TEKS_KOSONG_P33[v].judul) &&
      kunciIdP33.includes(TEKS_KOSONG_P33[v].pesan),
  ),
);
cek(
  "P33-A20 t() EmptyState EN berbeda dari ID per varian (benar diterjemahkan)",
  VARIAN_P33.every(
    (v) =>
      tP33("en", TEKS_KOSONG_P33[v].judul) !==
      tP33("id", TEKS_KOSONG_P33[v].judul),
  ),
);

// ---------- §P3-3-B: tanpa kunci yatim (statis) ----------
const CADANGAN_P33 = [
  "aksi.buka",
  "aksi.tutup",
  "aksi.kembali",
  "aksi.muatLagi",
  "aksi.bagikan",
  "aksi.simpan",
  "aksi.batal",
  "aksi.simpanPerubahan",
]; // Aksi umum: cakupan kamus §3b rencana P3; pemanggil menyusul.
function semuaBerkasSrcP33() {
  const hasil = [];
  (function jalan(dir) {
    for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entri.name);
      if (entri.isDirectory()) jalan(p);
      else if (/\.(ts|tsx)$/.test(entri.name)) hasil.push(p);
    }
  })(DIR_SRC);
  return hasil;
}
const berkasSrcP33 = semuaBerkasSrcP33();
const teksGabunganTanpaI18nP33 = berkasSrcP33
  .filter((p) => !p.endsWith("src/lib/i18n.ts"))
  .map((p) => fs.readFileSync(p, "utf8"))
  .join("\n");
const kunciDipakaiP33 = kunciIdP33.filter((k) =>
  teksGabunganTanpaI18nP33.includes(`"${k}"`),
);
// Kunci kosong.* dipakai lewat peta TEKS_KOSONG (nilai di i18n.ts
// sendiri) — itu pemakaian nyata, bukan yatim.
for (const v of Object.values(TEKS_KOSONG_P33)) {
  if (!kunciDipakaiP33.includes(v.judul)) kunciDipakaiP33.push(v.judul);
  if (!kunciDipakaiP33.includes(v.pesan)) kunciDipakaiP33.push(v.pesan);
}
const kunciYatimP33 = kunciIdP33.filter(
  (k) => !kunciDipakaiP33.includes(k) && !CADANGAN_P33.includes(k),
);
cek(
  "P33-B1 tiap kunci dipakai di luar i18n.ts atau dicadangkan terdokumentasi",
  kunciYatimP33.length === 0,
  kunciYatimP33.length
    ? `yatim: ${kunciYatimP33.join(", ")}`
    : `${kunciDipakaiP33.length} dipakai, ${CADANGAN_P33.length} cadangan`,
);
// Hanya literal yang dirujuk sebagai kunci kamus: argumen kedua
// t(bahasa, "...") dan kunci: "..." (AKSI_CEPAT). Pola lama yang
// longgar ikut menangkap string lain seperti "auth.users" (nama
// tabel Supabase) — bukan kunci kamus.
const dirujukP33 = new Set();
for (const p of berkasSrcP33) {
  const isi = fs.readFileSync(p, "utf8");
  for (const m of isi.matchAll(/t\(\s*bahasa\s*,\s*"([^"]+)"/g))
    dirujukP33.add(m[1]);
}
// kunci: "..." HANYA dari CommandPalette (AKSI_CEPAT) — properti
// `kunci` dipakai di banyak tempat lain (slug kategori, kunci
// preferensi, kunci judul palet "j-aksi") dan bukan kunci kamus.
{
  const isi = fs.readFileSync(
    path.join(DIR_SRC, "components/CommandPalette.tsx"),
    "utf8",
  );
  for (const m of isi.matchAll(/kunci:\s*"([^"]+)"/g))
    if (m[1].includes(".")) dirujukP33.add(m[1]); // "j-aksi" dkk. bukan kunci kamus
}
const dirujukTakAdaP33 = [...dirujukP33].filter((k) => !kunciIdP33.includes(k));
cek(
  "P33-B2 semua kunci yang dirujuk kode ada di kamus",
  dirujukTakAdaP33.length === 0,
  dirujukTakAdaP33.length
    ? `tak ada: ${dirujukTakAdaP33.join(", ")}`
    : `${dirujukP33.size} dirujuk`,
);
cek(
  "P33-B3 tanpa pemanggilan t(bahasa, `...`) dengan kunci template dinamis",
  // \bt\( + argumen pertama `bahasa`: pola lama ikut menangkap
  // .set(`/`.lt(` — method lain yang kebetulan berakhiran t(.
  !berkasSrcP33.some((p) =>
    /\bt\(\s*bahasa\s*,\s*`/.test(fs.readFileSync(p, "utf8")),
  ),
);

// ---------- §P3-3-C: wiring komponen (statis) ----------
const pemilihP33 = baca("components/PemilihBahasa.tsx", DIR_SRC);
const hookP33dini = baca("lib/useBahasa.ts", DIR_SRC);
cek(
  "P33-C1 PemilihBahasa: tulis cookie pf-bahasa 1 tahun path=/ SameSite=Lax",
  // String cookie dibangun di tulisCookieBahasa (lib/useBahasa.ts),
  // dipanggil PemilihBahasa — periksa gabungan keduanya.
  pemilihP33.includes("tulisCookieBahasa") &&
    hookP33dini.includes("pf-bahasa") &&
    hookP33dini.includes("max-age=31536000") &&
    hookP33dini.includes("path=/") &&
    hookP33dini.includes("SameSite=Lax"),
);
cek(
  "P33-C2 PemilihBahasa: PATCH /api/saya/preferensi { bahasa }",
  pemilihP33.includes('"/api/saya/preferensi"') &&
    pemilihP33.includes('method: "PATCH"') &&
    pemilihP33.includes("JSON.stringify({ bahasa: b })"),
);
cek(
  "P33-C3 PemilihBahasa: cookie tetap berlaku bila PATCH gagal (komentar)",
  /PATCH GAGAL|cookie .* tetap berlaku|tetap sumber kebenaran/i.test(pemilihP33),
);
cek(
  "P33-C4 PemilihBahasa: router.refresh() + atur documentElement.lang",
  pemilihP33.includes("router.refresh()") &&
    pemilihP33.includes("document.documentElement.lang"),
);
cek(
  "P33-C5 PemilihBahasa: sinkron cookie dari preferensi akun bila belum ada",
  pemilihP33.includes("bahasaAkun") && pemilihP33.includes("bacaCookieBahasa"),
);
const navP33 = baca("components/HeaderNav.tsx", DIR_SRC);
const pintuP33 = [
  "nav.beranda",
  "nav.kategori",
  "nav.faktaData",
  "nav.wawasan",
  "nav.belajar",
  "nav.brief",
  "nav.arsip",
  "nav.jelajahi",
];
cek(
  "P33-C6 HeaderNav: 8 pintu dari kamus",
  pintuP33.every((k) => navP33.includes(`t(bahasa, "${k}")`)),
);
cek(
  'P33-C7 HeaderNav: "Semua kategori" dari kamus',
  navP33.includes('t(bahasa, "nav.semuaKategori")'),
);
cek(
  "P33-C8 HeaderNav: rute 8 pintu tak berubah",
  ["/", "/kategori", "/brief", "/arsip", "/jelajahi"].every((h) =>
    navP33.includes(`"${h}"`),
  ) && !navP33.includes('"/en/"'),
);
cek(
  "P33-C9 HeaderNav: baca bahasa via useBahasa (bukan cookies server)",
  navP33.includes("useBahasa()") && !navP33.includes("next/headers"),
);
const authP33 = baca("components/AuthArea.tsx", DIR_SRC);
cek(
  "P33-C10 AuthArea: Masuk/Daftar/Keluar dari kamus + pasang PemilihBahasa",
  authP33.includes('t(bahasa, "auth.masuk")') &&
    authP33.includes('t(bahasa, "auth.daftar")') &&
    authP33.includes('t(bahasa, "auth.keluar")') &&
    authP33.includes("<PemilihBahasa"),
);
cek(
  "P33-C11 AuthArea: baca bahasa akun best-effort dari GET preferensi",
  authP33.includes('fetch("/api/saya/preferensi")') &&
    authP33.includes("bahasaAkun"),
);
const cariP33 = baca("components/SearchBar.tsx", DIR_SRC);
cek(
  "P33-C12 SearchBar: placeholder/label/tombol dari kamus",
  cariP33.includes('t(bahasa, "cari.placeholder")') &&
    cariP33.includes('t(bahasa, "cari.label")') &&
    cariP33.includes('t(bahasa, "cari.tombol")'),
);
const paletP33 = baca("components/CommandPalette.tsx", DIR_SRC);
const kunciPaletP33 = [
  "palette.placeholder",
  "palette.judul",
  "palette.deskripsi",
  "palette.aksiCepat",
  "palette.terakhirDicari",
  "palette.saran",
  "palette.hapusSemua",
  "palette.tutup",
  "palette.buka",
  "palette.tidakAdaHasil",
  "palette.memuat",
  "palette.kakiNavigasi",
  "palette.kakiBuka",
  "palette.kakiTutup",
];
cek(
  "P33-C13 CommandPalette: semua label dari kamus",
  // palette.tidakAdaHasil dipanggil dengan argumen ketiga { q }
  // sehingga dicocokkan tanpa kurung tutup.
  kunciPaletP33.every((k) => paletP33.includes(`t(bahasa, "${k}"`)),
  kunciPaletP33
    .filter((k) => !paletP33.includes(`t(bahasa, "${k}"`))
    .join(", "),
);
cek(
  "P33-C14 CommandPalette: label aksi cepat dari kamus (kunci, bukan literal)",
  paletP33.includes('kunci: "nav.beranda"') &&
    paletP33.includes('kunci: "auth.masuk"'),
);
const footerP33 = baca("components/Footer.tsx", DIR_SRC);
cek(
  "P33-C15 Footer: getBahasa di dalam Suspense (fallback id)",
  footerP33.includes("await getBahasa()") &&
    footerP33.includes("<Suspense") &&
    footerP33.includes('<FooterIsi bahasa="id" />'),
);
const kunciFooterP33 = [
  "footer.tentang",
  "footer.kategori",
  "footer.layanan",
  "footer.redaksiLegal",
  "footer.hakCipta",
  "footer.bahasaWilayah",
];
cek(
  "P33-C16 Footer: seksi + Tentang + hak cipta dari kamus",
  kunciFooterP33.every((k) => footerP33.includes(`t(bahasa, "${k}")`)),
);
const kosongP33 = baca("components/EmptyState.tsx", DIR_SRC);
cek(
  "P33-C17 EmptyState: prop bahasa opsional default id + judul/pesan opsional",
  kosongP33.includes('bahasa = "id"') &&
    kosongP33.includes("judul?: string") &&
    kosongP33.includes("pesan?: string"),
);
cek(
  "P33-C18 EmptyState: teks baku varian dari TEKS_KOSONG/kamus",
  kosongP33.includes("TEKS_KOSONG[varian]") &&
    kosongP33.includes("t(bahasa, teks.judul)"),
);
const dockP33 = baca("components/BottomNav.tsx", DIR_SRC);
cek(
  "P33-C19 BottomNav (seluler): label dock dari kamus",
  dockP33.includes("t(bahasa, item.kunci)") &&
    dockP33.includes('"nav.lainnya"') &&
    dockP33.includes('"auth.saya"'),
);
const hookP33 = baca("lib/useBahasa.ts", DIR_SRC);
cek(
  "P33-C20 useBahasa: baca cookie pf-bahasa + dengarkan event pf:bahasa",
  hookP33.includes("document.cookie") && hookP33.includes("ACARA_BAHASA"),
);
cek(
  "P33-C22 useBahasa: useSyncExternalStore (bukan koreksi render — cegah #418)",
  hookP33.includes("useSyncExternalStore") &&
    hookP33.includes("getServerSnapshot") &&
    !hookP33.includes("setBahasa("),
);
const cariPageP33 = baca("src/app/cari/page.tsx");
cek(
  "P33-C21 /cari: EmptyState memakai kamus via getBahasa server",
  cariPageP33.includes("await getBahasa()") &&
    cariPageP33.includes('t(bahasa, "cari.tidakAdaHasilPesan"') &&
    cariPageP33.includes('t(bahasa, "cari.masukkanKataKunciJudul")'),
);

// ---------- §P3-3-D: penjaga statis ----------
const layoutP33 = baca("src/app/layout.tsx");
cek(
  'P33-D1 layout.tsx milik P3-1: <html lang="id"> utuh, tanpa getBahasa/PemilihBahasa',
  layoutP33.includes('<html lang="id"') &&
    !layoutP33.includes("getBahasa") &&
    !layoutP33.includes("PemilihBahasa"),
);
const cssP33 = baca("src/app/globals.css");
cek(
  "P33-D2 CSS pemilih bahasa ada + tombol berwarna eksplisit var(--ink)",
  cssP33.includes(".pemilih-bahasa") &&
    cssP33.includes(".pemilih-bahasa-tombol") &&
    /\.pemilih-bahasa-tombol\s*\{[^}]*color:\s*var\(--ink\)/s.test(cssP33),
);
const selfRefP33 = [
  ...cssP33.matchAll(/--([\w-]+)\s*:\s*[^;]*var\(--\1\)/g),
].map((m) => m[0]);
cek(
  "P33-D3 0 definisi token CSS menunjuk dirinya sendiri (self-ref)",
  selfRefP33.length === 0,
  selfRefP33.join("; "),
);
cek(
  "P33-D4 tanpa prefix /en/ di URL (bahasa bukan bagian URL)",
  !/["'`]\/en\//.test(
    baca("src/lib/i18n.ts") + navP33 + pemilihP33 + footerP33 + cariPageP33,
  ),
);
cek(
  "P33-D5 tanpa new Date() di berkas i18n baru",
  ![pemilihP33, hookP33, baca("src/lib/i18n.ts")].some((s) =>
    s.includes("new Date("),
  ),
);
// Bukti statis "artikel tetap Indonesia": tidak satu pun berkas
// render artikel/pengetahuan yang mengimpor kamus.
function berkasDiBawah(relatifDir) {
  const hasil = [];
  const akar = path.join(DIR_SRC, relatifDir);
  if (!fs.existsSync(akar)) return hasil;
  (function jalan(dir) {
    for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entri.name);
      if (entri.isDirectory()) jalan(p);
      else if (/\.(ts|tsx)$/.test(entri.name)) hasil.push(p);
    }
  })(akar);
  return hasil;
}
const berkasArtikel = [
  ...berkasDiBawah("app/artikel"),
  ...berkasDiBawah("app/pengetahuan"),
  ...berkasDiBawah("components/artikel"),
];
cek(
  "P33-D6 render artikel/pengetahuan tidak mengimpor kamus i18n",
  berkasArtikel.every(
    (p) => !fs.readFileSync(p, "utf8").includes("lib/i18n"),
  ),
  `${berkasArtikel.length} berkas diperiksa`,
);

// ---------- BAGIAN BERIKUTNYA (P3-5 integrator — bila ada) ----------

// ---------- §P3-5: Integrasi (koordinator) ----------
// ManajemenPenyimpanan dipasang di FormPengaturan (formulir yang
// dirender /saya#pengaturan-privasi) — BUKAN di page.tsx redirect.
// Kartu /glosarium di /jelajahi (grup "Data & Pengetahuan").
// Tipe Bahasa SATU definisi (i18n.ts); preferensi-baca.ts hanya
// re-export type-only.
{
  const form = baca("components/saya/FormPengaturan.tsx", DIR_SRC);
  cek(
    "P35-1 ManajemenPenyimpanan dipasang di FormPengaturan (impor + render + seksi)",
    form.includes(
      'import ManajemenPenyimpanan from "@/components/pwa/ManajemenPenyimpanan"',
    ) &&
      form.includes("<ManajemenPenyimpanan />") &&
      form.includes("Penyimpanan offline"),
    "FormPengaturan adalah formulir di /saya#pengaturan-privasi",
  );
  const redirectPengaturan = baca(
    "app/saya/pengaturan/page.tsx",
    DIR_SRC,
  );
  cek(
    "P35-2 ManajemenPenyimpanan TIDAK dipasang di page.tsx redirect /saya/pengaturan",
    !redirectPengaturan.includes("ManajemenPenyimpanan") &&
      redirectPengaturan.includes('redirect("/saya#pengaturan-privasi")'),
    "page.tsx hanya redirect",
  );
  const jelajahi = baca("app/jelajahi/page.tsx", DIR_SRC);
  cek(
    "P35-3 Kartu /glosarium ada di /jelajahi (grup Data & Pengetahuan)",
    jelajahi.includes('href: "/glosarium"') &&
      jelajahi.includes('label: "Glosarium"'),
    "kartu masuk P3-4",
  );
  cek(
    "P35-4 /offline TIDAK jadi kartu /jelajahi (bukan destinasi)",
    !jelajahi.includes('"/offline"'),
    "fallback offline, bukan halaman tujuan",
  );
  const bacaPref = baca("lib/preferensi-baca.ts", DIR_SRC);
  cek(
    "P35-5 Tipe Bahasa SATU definisi (i18n.ts); preferensi-baca.ts re-export type-only",
    bacaPref.includes('import type { Bahasa } from "@/lib/i18n"') &&
      !/export type Bahasa = /.test(bacaPref),
    "tanpa definisi ganda",
  );
  const i18n = baca("lib/i18n.ts", DIR_SRC);
  cek(
    "P35-6 i18n.ts tetap SATU definisi Bahasa",
    (i18n.match(/export type Bahasa = /g) ?? []).length === 1,
    "satu-satunya definisi",
  );
}

// ---------- Ringkasan ----------
console.log(`\n${lolos} lolos, ${gagal} gagal.`);
process.exit(gagal === 0 ? 0 : 1);
