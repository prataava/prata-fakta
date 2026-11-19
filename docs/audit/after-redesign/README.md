# Screenshot SESUDAH fondasi Fase 3 (redesign world-class)

**Tanggal:** 19 November 2026 · **Branch:** `redesign/world-class-ui-motion`
**Sumber render:** server lokal `next start -p 3001` dari build produksi `.next`
(BUILD_ID `xcViZCinatkaI9M6V_vg-`, fondasi Fase 3: token gerak + kaca nyata,
MotionProvider, transisi halaman 200ms, komponen motion, BottomNav lucide).
Metode sama dengan baseline `docs/audit/before-redesign/README.md`
(chrome-headless-shell, `--virtual-time-budget=9000`).

## Daftar

| Berkas | Halaman | Viewport | Yang diverifikasi |
|---|---|---|---|
| `d1280-beranda.png` | Beranda `/` | 1280×900 | Beranda utuh, tanpa error render; banner "Versi baru tersedia" (PWA, perilaku lama — build baru vs SW lama) tampil terbaca di atas token kaca baru |
| `m360-beranda.png` | Beranda `/` | 360×800 | BottomNav: 6 ikon lucide (Home, LayoutGrid, Archive, Newspaper, User, Grip), indikator kaca di Beranda, label aktif putih tebal |
| `m360-kategori.png` | Kategori `/kategori` | 360×800 | Indikator kaca BERPINDAH ke Kategori (mekanisme satu indikator + posisi terakhir dipertahankan) |

## Perbandingan vs baseline

- BottomNav: ikon SVG gambar tangan → lucide-react; IA + 6 destinasi + satu
  indikator bergerak TIDAK berubah; dock tetap kaca gelap (blur 25px, kini
  lewat token `--glass-blur-dock` + `--glass-border-highlight`).
- Token `--glass-bg`/`--glass-border` kini translusen di kedua mode
  (terang `rgba(255,255,255,0.82)`, gelap `rgba(23,27,30,0.78)`) — diverifikasi
  di chunk CSS produksi; `.kaca/.kaca-kartu` tetap solid.
- Gambar artikel eksternal tetap tidak termuat di headless shell (artefak
  lingkungan, sama seperti baseline — CDN terverifikasi 200 terpisah).

## Catatan konsol

Headless shell mencatat 1 peringatan (bukan error): satu chunk CSS di-preload
tapi "not used within a few seconds" — perilaku preload Next, sudah ada
sebelum Fase 3, tidak memengaruhi render (CSS fondasi terverifikasi termuat
di chunk yang dipakai halaman).

---

# Screenshot SESUDAH Fase 4 redesign publik

**Tanggal:** 19 November 2026 · **Branch:** `redesign/world-class-ui-motion`
**Sumber render:** server lokal `next start -p 3001` dari build produksi `.next`
(BUILD_ID `W3cgEoEqNY3D-vdRjuEwW`, Fase 4 publik di atas fondasi Fase 3 +
commit admin `e21dabc` yang sudah masuk branch).
Metode sama dengan baseline, kecuali `--virtual-time-budget=30000` untuk
screenshot yang memakai Reveal (budget 9000 kadang memotret sebelum animasi
reveal 180ms selesai — konten ADA di DOM, hanya belum selesai menganimasikan;
terbukti di `/cari` dan `/timeline` mobile).

## Daftar (18 berkas — 9 desktop 1280×900 + 9 mobile 360×800)

| Berkas | Halaman | Viewport | Yang diverifikasi |
|---|---|---|---|
| `d1280-beranda.png` | Beranda `/` | 1280×900 | Hero foto-led: gambar besar berita utama (alt tampil — CDN eksternal tidak termuat di headless, artefak lama) + meta "BERITA UTAMA · indonesia · CEK SILANG · 17 November 2026" kini terlihat di lipatan; kotak cari hero HILANG (tersisa header + palette); header kaca + sub-bar permukaan kedua |
| `d1280-artikel.png` | Artikel ASEAN antariksa | 1280×900 | FACT SCORE SATU pernyataan: "Belum dinilai — belum ada klaim terverifikasi yang bisa dinilai"; byline "Oleh Redaksi PRATA FAKTA" TANPA "(draf pipeline)"; gambar hero reveal; alat baca utuh |
| `d1280-cari.png` | Pencarian `/cari` | 1280×900 | Panel saran: "Mulai dari topik" + 10 chip kategori nyata + pintasan arsip/kategori/graf/brief (riwayat lokal kosong di headless → panel riwayat tidak tampil, benar) |
| `d1280-graf.png` | Graf Pengetahuan `/graf` | 1280×900 | Pil kosong (Klaim/Sumber/Peristiwa/Cerita/Negara 0) abu-abu redup + nonaktif vs pil berisi merah solid; label kiri tidak terpotong ("Polisi Tangkap 5 Orang Bu…"); toolbar − / + / Reset / "Mulai tur terpandu" tampil; sisi melengkung |
| `d1280-timeline.png` | Linimasa `/timeline` | 1280×900 | Hero + filter + form rentang rapi; empty state jujur "Belum ada peristiwa yang tercatat" (0 event di DB — reveal per peristiwa belum bisa diverifikasi visual) |
| `d1280-observatorium.png` | Observatorium `/observatorium` | 1280×900 | "Total artikel terbit: 14 artikel" (data nyata); kartu Hitungan tampil; tombol "Lihat semua indikator" utuh di desktop |
| `d1280-klaim.png` | Pelacak Klaim `/klaim` | 1280×900 | Filter + chip status rapi; empty state jujur "Belum ada klaim yang bisa dilacak" (0 klaim di DB — daftar Linear belum bisa diverifikasi visual) |
| `d1280-perpustakaan.png` | Perpustakaan `/perpustakaan` | 1280×900 | Tamu dialihkan ke `/masuk` (perilaku benar — halaman login tampil rapi) |
| `d1280-glosarium.png` | Glosarium `/glosarium` | 1280×900 | 43 istilah, indeks A–Z, kartu istilah tampil |
| `m360-beranda.png` | Beranda `/` | 360×800 | Header muat (logo + cari + tema + Masuk); hero + meta; 0 overflow horizontal |
| `m360-artikel.png` | Artikel | 360×800 | FACT SCORE + byline bersih di HP; 0 overflow |
| `m360-cari.png` | Pencarian `/cari` | 360×800 | Panel saran + chip kategori muat; 0 overflow |
| `m360-graf.png` | Graf Pengetahuan `/graf` | 360×800 | Pil kosong redup, toolbar muat; 0 overflow |
| `m360-timeline.png` | Linimasa `/timeline` | 360×800 | Hero + filter + form muat; 0 overflow |
| `m360-observatorium.png` | Observatorium `/observatorium` | 360×800 | Perbaikan overflow: tombol "Lihat semua indikator" kini turun ke baris sendiri dan utuh (sebelumnya terpotong di tepi) |
| `m360-klaim.png` | Pelacak Klaim `/klaim` | 360×800 | Filter menumpuk rapi; 0 overflow |
| `m360-glosarium.png` | Glosarium `/glosarium` | 360×800 | Indeks A–Z membungkus rapi; 0 overflow |
| `m360-perpustakaan.png` | Perpustakaan `/perpustakaan` | 360×800 | Form `/masuk` muat penuh; 0 overflow |

## Catatan verifikasi

- **0 overflow di 360px** pada 9 halaman yang diubah (diperiksa visual dari
  screenshot mobile di atas; satu-satunya temuan — tombol observatorium —
  sudah diperbaiki dan di-retake).
- **Gambar eksternal** tetap tidak termuat di headless shell (artefak
  lingkungan, sama seperti baseline — CDN terverifikasi 200 terpisah);
  skeleton "Memuat gambar…" pada kartu tampil sampai `onLoad`/`onError`.
- **Data kosong yang jujur:** DB saat ini berisi 14 artikel terbit tapi
  0 klaim, 0 event, 0 indikator — daftar klaim Linear dan reveal peristiwa
  linimasa terimplementasi + lolos tsc/lint/build, tapi BELUM terverifikasi
  visual (butuh data). Interaksi graf (pan/zoom/tur/keyboard) dan alias
  palette juga baru terverifikasi statis (tombol tampil) — belum diuji
  interaksi live karena headless shell tidak bisa berinteraksi.
- Marquee sumber tier-1 memakai nama sumber nyata dari `getSumber()` +
  `tierDariPrioritas` (tier 1 = prioritas ≥ 90); bila kosong, marquee
  tidak tampil.

---

# QA FASE 5 (19 November 2026) — gerbang akhir sebelum PR

**Branch:** `redesign/world-class-ui-motion` · **HEAD sesudah QA:**
`sExEWVYtmEDuXACv7xqHn` (build produksi baru, di atas 5b88912 +
perbaikan metadata Fase 5 di bawah) · **Metode:** server lokal
`next start -p 3001` + chrome-headless-shell via CDP (95 kasus
viewport×halaman + probe fokus/long/reduced-motion/dock);
`--virtual-time-budget` TIDAK dipakai — semua tunggu waktu nyata.

## Gerbang (angka nyata)

| Gerbang | Hasil |
|---|---|
| `npx tsc --noEmit` | **0 error** (diulang sesudah perbaikan Fase 5, tetap 0) |
| `npm run lint` | **0 error, 1 warning lama** (`scripts/uji-ekspansi-p0.mjs:15` `DIR_SRC` tak terpakai — sudah diketahui) |
| `node scripts/cek-token-gerak.mjs` | **13/13** (0 self-ref, 0 var() tak terdefinisi, `--glass-bg` translusen terang+gelap) |
| `npm run build` | **exit 0** (2×, BUILD_ID terakhir `sExEWVYtmEDuXACv7xqHn`) |
| `node scripts/uji-hard-gates.mjs` | **28/28** (A/B/C/D, exit 0; tanpa DB — adapter mock) |
| Rute HTTP (curl, 21 rute + 1 artikel nyata) | **semua 200**: `/`, `/arsip`, `/cari`, `/graf`, `/timeline`, `/observatorium`, `/klaim`, `/perpustakaan`, `/glosarium`, `/kategori`, `/brief`, `/jelajahi`, `/data/live`, `/masuk`, `/api/health`, `/manifest.webmanifest`, `/sw.js`, `/robots.txt`, `/sitemap.xml`, `/rss.xml`, `/podcast.xml`, `/artikel/asean-sepakati-kerja-sama-antariksa-…` |
| `/admin` sebagai tamu | HTTP **200** (bukan redirect server) — body memuat `NEXT_REDIRECT;replace;/masuk;307` + `<meta http-equiv="refresh" content="1;url=/masuk">`; di browser live URL akhir **`/masuk`** ("Masuk — PRATA FAKTA"). Temuan **pra-ada** (shell PPR statis ikut ter-stream; guard tidak berubah; perbaikan `force-dynamic` di luar mandat ini) |
| Responsif (95 kasus: 320/360/375/390/412/430/768/1280/1920 × 16 halaman) | **0 overflow horizontal** di semua kasus (nilai −15 di desktop = lebar scrollbar, bukan overflow); h1 = 1 di semua halaman kecuali artikel saat streaming belum selesai (lihat catatan) |
| Padding bawah vs BottomNav (360px, scroll instant, settled 1.5 dtk) | **LOLOS** di `/`, `/graf`, `/observatorium`, `/glosarium`: scroll mencapai maks, garis footer terakhir berakhir 60px **di atas** dock (bottom 666 vs dockTop 726, dock 64px), **0 garis footer di balik dock**. Temuan audit §4.1 terjawab: konten memang menggulir di bawah dock di tengah halaman (perilaku dock tetap yang normal), tapi di ujung bawah semua konten dapat dibaca penuh — padding bawah 110px (mobile) cukup |
| Reduced motion (emulasi CDP) | **SEBAGIAN — lihat catatan**: `MotionConfig reducedMotion="user"` terpasang + `@media (prefers-reduced-motion: reduce)` mematikan shimmer/skeleton, spinner, dan transform tombol; `matchMedia` terkonfirmasi `true`. Namun trajektori ukur: opacity `Reveal`/`StaggerItem` tetap menganimasikan 0→1 selama **~180ms** penuh di bawah reduced motion (terukur tiap 16ms) — perilaku bawaan `motion` 14.14.0 yang hanya mematikan kunci posisional (x/y), bukan opacity. Bukan blocker (fade 180ms, konten selalu mencapai keadaan akhir), tapi klaim "mati total" di `MOTION_COMPONENTS.md` **berlebihan untuk opacity** — dicatat sebagai keterbatasan |
| Cari (`/cari?q=asean`, DOM live) | **berfungsi**: 3 tautan artikel nyata muncul |
| FACT SCORE (DOM live, artikel) | **satu pernyataan**: "FACT SCORE: Belum dinilai — belum ada klaim terverifikasi yang bisa dinilai" |
| JSON-LD / SEO | `NewsArticle` ada; `article:author` kini `"Redaksi PRATA FAKTA"` (lihat perbaikan); sitemap/robots/manifest/sw.js 200 |

## Performa (terukur dari build — bukan klaim)

- Total `.next/static`: **2,4 MB, 109 berkas**; JS total **1.760.225 byte mentah**,
  CSS total **71.877 byte mentah** (11 chunk CSS).
- First-load JS mentah per rute (`route-bundle-stats.json`):
  `/` 998 kB, `/artikel/[slug]` 1.035 kB (terbesar), `/graf` 1.001 kB,
  `/cari` 993 kB, `/klaim` 992 kB, `/admin` 1.011 kB; median 119 rute
  **994 kB**, maks 1.035 kB (angka mentah, belum gzip; build Next 16
  tidak mencetak kolom First Load JS).
- **Lighthouse / LCP / INP / CLS: TIDAK TERUKUR** dari sandbox headless
  (tidak ada browser live + Chrome penuh diblokir kebijakan sandbox) —
  sengaja tidak dikarang angkanya.

## Konsol (95 kasus)

- **Tidak ada** error JS/exception di halaman mana pun.
- `POST /api/analytics/kunjungan → 503` di semua 95 kasus: artefak
  lingkungan — server lokal tanpa `SUPABASE_SERVICE_ROLE_KEY`
  (log: "SUPABASE_SERVICE_ROLE_KEY belum diatur"); bukan regresi redesign.
- `GET /api/notifikasi/jumlah → 401` (tamu belum masuk — perilaku
  normal) + sesekali 429 saat burst probe 95 navigasi (rate-limit).
- Gambar eksternal `ERR_TUNNEL_CONNECTION_FAILED` (detik/Antara):
  artefak proxy sandbox — CDN terverifikasi **200 via curl**
  (Antara + detik) secara terpisah.
- `GET /api/cari/saran → 429` sekali selama burst probe (rate-limit).

## Perbaikan Fase 5 (satu-satunya perubahan kode di QA)

**Byline "(draf pipeline)" masih bocor di metadata** (temuan baru QA,
bukan dari Fase 4): byline tampil sudah bersih, tapi `article:author`
dan JSON-LD `author.name` masih `"Redaksi PRATA FAKTA (draf pipeline)"`.
Diperbaiki di `src/app/artikel/[slug]/page.tsx` (helper
`bersihkanPenulis()` dipakai di byline + `generateMetadata` + JSON-LD;
data/DB tidak diubah; tsc 0 + build 0 sesudahnya; terverifikasi live
`article:author = "Redaksi PRATA FAKTA"`). Satu kemunculan tersisa
hanya di dalam payload RSC (nilai `penulis_nama` mentah dari DB,
tidak tampil) — di luar cakupan tampilan.

## Regresi — yang terverifikasi vs yang TIDAK bisa

- Terverifikasi: artikel dibuka + gambar asli tetap dirujuk (hotlink
  Antara/detik di HTML + curl 200); cari berfungsi; FACT SCORE +
  status verifikasi tidak berubah maknanya; guard admin (tamu → `/masuk`
  di browser live); manifest + sw.js + sitemap/robots/JSON-LD ada.
- **Tautan sumber di artikel: TIDAK bisa diverifikasi dengan data saat
  ini** — artikel contoh punya `sumber_url` Antara di DB, tapi tautan
  keluar hanya dirender di dalam bukti Jejak Fakta / Perbandingan
  Sumber, dan artikel ini punya **0 klaim → 0 bukti → 0 tautan keluar**
  di DOM (mekanisme kode utuh di `JejakFakta.tsx:141` dan
  `PerbandinganSumber.tsx:297-306`, tidak disentuh redesign).
  Perilaku pra-ada, bukan regresi; butuh artikel berklaim untuk
  verifikasi visual.
- **Belum terverifikasi visual** (0 data di DB): daftar klaim Linear
  (0 klaim) + reveal peristiwa linimasa (0 event) + indikator
  observatorium (0 indikator).
- **Belum diuji live** (BLOCKED, sudah dicatat agen sebelumnya):
  interaksi graf (pan/zoom/tur/keyboard), alias palette, suara TTS,
  tampilan visual admin (butuh login), perangkat HP fisik.

## Catatan streaming (penting untuk penguji berikut)

Konten artikel (PPR) butuh **~5–10 detik** untuk ter-stream penuh
di sandbox ini (t=5 dtk masih "Memuat…", t=10 dtk lengkap: h1 +
FACT SCORE + Jejak Fakta + Perbandingan Sumber). Screenshot/probe
dengan budget <10 dtk akan tampak kosong — itu artefak lingkungan
(DB lewat proxy lambat), bukan halaman rusak. Screenshot Fase 4
memakai `--virtual-time-budget=30000` karena alasan yang sama.

## Jumlah berkas

Direktori ini berisi **19 PNG** (bukan 18): 18 dari tabel Fase 4 +
`m360-kategori.png` dari sesi Fase 3 (indikator kaca berpindah).
Baseline `docs/audit/before-redesign/` tetap **14 PNG**.
