# KEPUTUSAN REDESIGN — PRATA FAKTA World-Class UI/Motion

**Tanggal:** 19 November 2026 · **Branch:** `redesign/world-class-ui-motion`
**Dasar:** `docs/design-research/AUDIT-2026-11-19.md` + 6 laporan riset
`REFERENCE-RESEARCH-2026-11-19-G{1..6}-*.md` (18 situs, dibaca langsung 19 Nov 2026)
**Status:** KEPUTUSAN — implementasi (Fase 3+) BUKAN bagian dokumen ini.

## 0. Prinsip penuntun (dari audit + pelajaran PRATA ENGLISH)

Paket motion PRATA ENGLISH yang halus dinilai pengguna "masi biasa aja".
Maka di PRATA FAKTA **redesign visual dulu, motion mengikuti** — masthead, hero,
kartu, BottomNav, dan shell admin harus kelihatan beda dari pandangan pertama.
Motion yang tidak mengubah tampilan pertama tidak dihitung sebagai redesign.

## 1. Matriks perbandingan (ringkas — rincian di tiap laporan G1–G6)

| Referensi | Kekhasan | Adaptasi utama ke PRATA FAKTA | Biaya |
|---|---|---|---|
| Butter | Workspace + katalog blok + marquee logo | Terminal/plan panel; marquee sumber tier-1 di beranda | Sedang |
| Plamo | Agentic planning, parametrik, human-in-the-loop | Rencana ingestion terlihat sebelum eksekusi; artikel/klaim parametrik (FACT SCORE live) | Rendah (UI) |
| Cerebrium | Terminal log, angka kepercayaan konkret | Log pipeline di Command Center; denyut verifikasi SVG di `/graf`/`/timeline` | Rendah |
| Linear | List padat, shortcut, transisi status mikro | Daftar klaim/linimasa gaya Linear; shortcut `?`; optimistic UI | Rendah |
| Raycast | Command palette, Action Panel, alias | Palette 2 lapis + alias `k:/s:/g:/t:` + empty state bersaran (palette sudah ada — poles) | Rendah |
| Aether 1 | Sinematik scroll 4 bab, kamera baked | Template longform berbab (1–2/minggu), tanpa WebGL tahap 1 | Sedang |
| Bruno Simon | Dunia 3D dijelajahi (mobil), minimap | `/graf` sebagai peta dijelajahi (kamera meluncur, tur terpandu) — tanpa WebGL dulu | Sedang |
| Lando Norris | Foto besar, line reveal, galeri helm | Hero beranda foto-led + line reveal; galeri artefak `/perpustakaan` | Rendah |
| Active Theory | WebGL layar penuh | **Pelajaran negatif utama:** jangan kunci konten di balik gerbang WebGL (hanya `/unsupported` yang teramati) | — |
| Hatom | Scrollytelling 5 fase, narasi simbolik | Satu "Liputan Khusus" 4–6 babak untuk peristiwa besar | Sedang–tinggi |
| Spline | States–Events–Actions, ekspor `<spline-viewer>` | Hover/klik state di `/graf`; penampil "Load 3D" opt-in | Sedang |
| Lusion (.app) | "Load 3D when ready", QR, GLB | Pola muat-eksplisit untuk objek 3D (bukan studio lusion.co — dibedakan di G4) | Rendah |
| Awwwards Anim. | Directed motion, restraint, tipografi kinetik | Reveal + stagger kartu; restraint sebagai standar | Rendah |
| Codrops | Demo + kode MIT, pola hover/scroll/menu | Pustaka pola internal (hover, transisi halaman, menu) | Rendah |
| Rive | State machine, ikon ringan 2–10 KB | **TUNDA** — SVG + Motion dulu; ambang ≥4 ikon interaktif | Rendah (nanti) |
| GSAP | ScrollTrigger, pin+scrub, timeline | **TIDAK instal sekarang** — IntersectionObserver + Motion cukup | — |
| Framer Effects | Hover/Press/Loop/Drag ditenagai Motion | Konfirmasi: mesinnya = `motion` (sudah terinstal) | Rendah |
| Ripplix | 1.065+ animasi SaaS nyata per komponen | Tombol 3-keadaan, skeleton, dropdown/popover, bottom sheet mobile | Rendah |

**Konsensus lintas grup:** hampir semua adaptasi prioritas dapat dibangun dengan
`motion` yang sudah ada + CSS — tanpa dependensi baru.

## 2. Stack yang dipilih (MINIMAL — audit dependensi dulu)

| Kebutuhan | Keputusan | Alasan |
|---|---|---|
| Transisi UI/layout, reveal, stagger, hover/tap, exit, layoutId | **`motion` ^14.14.0 — PAKAI** (sudah terinstal, 0 impor saat ini) | Satu sistem gerak; mesin yang sama dengan Framer Effects; ~31 KB gzip (sekunder, ukur di build sendiri); `MotionConfig reducedMotion="user"` |
| Scroll storytelling lanjutan | **GSAP + ScrollTrigger — TIDAK, untuk sekarang** | Tidak ada adegan yang butuh pin+scrub/timeline multi-langkah; IntersectionObserver + Motion cukup. Ambang evaluasi ulang: ada desain longform yang disetujui dan butuh pin+scrub atau koreografi scroll+state |
| Ikon animasi / state machine | **Rive — TUNDA** | SVG + Motion dulu; adopsi `@rive-app/react-canvas` (~50 KB gzip) bila ≥4 ikon interaktif terbukti dibutuhkan; aset 2–10 KB/ikon sederhana. Free tier cukup; jangan berlangganan |
| 3D selektif | **Spline/Three.js — TIDAK di Fase 3–5** | Hanya bila satu kasus nyata disetujui: (a) satu "Liputan Khusus" scrollytelling, (b) satu adegan Observatorium, (c) penampil "Load 3D" opt-in. Selalu lazy + fallback statis + tidak pernah memblokir baca artikel |
| Modal/dropdown | **Radix (sudah terinstal)** + Motion | Jangan tambah library overlay |
| Ikon | **`lucide-react` ^1.73.0 (sudah terinstal)** — standarisasi | Ganti SVG gambar tangan di BottomNav dkk.; satu stroke weight, satu bahasa visual |
| Styling | **Tetap CSS kustom token Swiss — TANPA Tailwind** (house rule) | `globals.css` 2.583 baris dipecah bertahap per modul, bukan rewrite |
| Chart/graf | **Yang sudah ada** (SVG/canvas internal + Leaflet untuk peta) | Jangan tambah library chart demi redesign |

**Yang TIDAK diinstal:** GSAP, Rive, Spline, Three.js, library chart baru,
library ikon baru. Setiap instalasi baru butuh bukti kebutuhan di Fase 3+.

## 3. Penyelesaian konflik dengan sistem yang ada

1. **Transisi halaman vs aturan repo.** Tidak ada larangan transisi di repo ini
   (berbeda dengan PRATA ENGLISH lama). Diizinkan bersyarat: ≤200 ms,
   content-first (konten tampil tanpa menunggu animasi), hanya opacity/transform,
   tidak menunda navigasi, riwayat browser utuh, mati total saat reduced motion.
2. **Glass selektif vs "kaca palsu" saat ini.** Token `--glass-*` sekarang solid.
   Perkenalkan token kaca NYATA (`backdrop-filter: blur`, transparansi berlapis,
   border highlight) HANYA untuk: BottomNav (sudah ada strukturnya), header,
   Command Palette, popover, overlay dashboard. JANGAN glass di semua kartu.
   Fallback solid untuk perangkat lemah / `prefers-reduced-transparency`.
3. **Skrip tema (TemaInit + HASH_SKRIP_TEMA).** JANGAN sentuh `layout.tsx`
   bagian tema dan JANGAN ubah satu karakter skrip tanpa hitung ulang hash.
   Animasi toggle tema hanya via CSS.
4. **`cacheComponents: true`.** Komponen async request-time WAJIB `<Suspense>`;
   halaman baca searchParams/waktu WAJIB `await connection()` sebelum `new Date()`.
5. **Wilayah terlarang tetap berlaku:** `src/proxy.ts`, guard admin, 94+ API route,
   service-role key server-only, SearchBar tanpa JS, NewsletterForm,
   PelacakKunjungan, TTS, Leaflet. FACT SCORE rumus TIDAK diubah. Tanpa migrasi
   baru hanya demi visual.
6. **BottomNav:** IA + 6 destinasi + SATU indikator bergerak dipertahankan.
   Yang berubah: kaca nyata, ikon lucide, label + animasi aktif yang halus.
7. **Data & editorial:** tanpa data dummy, tanpa artikel palsu, tanpa ubah
   aturan verifikasi/terbit, tanpa lemahkan RLS. Gambar artikel tetap gambar
   asli (hotlink CDN terverifikasi 200) + fallback terdesain bila gagal muat.
8. **3D tidak pernah jadi gerbang.** Pelajaran Active Theory: konten belajar/baca
   tidak boleh terkunci di balik WebGL. Setiap adegan 3D wajib punya versi
   statis/HTML yang setara.

## 4. Token gerak (untuk Fase 3)

- Durasi: `cepat 120ms`, `dasar 180ms`, `halaman 200ms`, `penekanan 320ms`
  (BottomNav spring 560ms yang sudah ada dipertahankan).
- Easing: standar `cubic-bezier(0.16, 1, 0.3, 1)`; masuk `ease-out`; keluar `ease-in`.
- Stagger kartu: 40–60 ms. Reveal gambar: zoom 1.05 + fade.
- Hanya `transform`/`opacity` untuk animasi berjalan; dilarang menganimasikan
  layout/width/height/box-shadow besar.
- Reduced motion: `MotionConfig reducedMotion="user"` + media query yang sudah
  ada — non-esensial dimatikan, bukan diperlambat.

## 5. Rencana implementasi Fase 3–5 (untuk koordinator berikutnya)

### Fase 3 — Design system (fondasi, tanpa ubah tampilan publik dulu)
1. Pecah `globals.css` per modul (token, tipografi, komponen) — tanpa ubah nilai
   token yang dipakai (hindari self-ref `var(--x)` di definisi sendiri).
2. Tambah token gerak (§4) + token kaca nyata + audit warna status/verifikasi.
3. Standarisasi ikon ke `lucide-react` (BottomNav dulu; hapus komentar usang).
4. Bangun komponen gerak reusable: `Reveal`, `MotionCard`, `Skeleton`,
   `Tombol` 3-keadaan (idle→loading→sukses), Modal/Drawer/Dropdown (Radix +
   Motion), `Toast`. Satu tempat, dipakai semua halaman.
5. Perbaiki cacat audit murah: label graf terpotong, pil kategori kosong,
   byline "(draf pipeline)", duplikasi "Belum dinilai", saran topik di `/cari`,
   hapus satu dari tiga kotak cari (sisakan header + palette).
6. Gerbang: `tsc` 0, `lint` 0, `build` exit 0, tes yang ada hijau, tanpa ubah
   rute/data/auth.

### Fase 4 — Redesign publik + admin (perubahan visual yang kelihatan)
1. **Beranda:** hero foto-led ala Lando (satu berita utama + line reveal) +
   marquee sumber tier-1 + angka kepercayaan konkret; kartu artikel reveal +
   stagger; section Kategori/Populer/Liputan Khusus yang rapi.
2. **Artikel:** progress baca, reveal gambar, FACT SCORE yang tidak mengulang,
   byline bersih, related + timeline + koreksi yang konsisten.
3. **Cari:** halaman ala Raycast (saran topik, riwayat, filter, grup hasil) +
   polish Command Palette (2 lapis, alias, empty state bersaran).
4. **Graf:** label tidak terpotong, pil kosong disembunyikan/diredupkan,
   garis rapi, mode jelajah (kamera meluncur + minimap + tur terpandu).
5. **Linimasa / Observatorium / Klaim / Perpustakaan / Glosarium:** terapkan
   sistem komponen Fase 3 secara konsisten; scroll-linked hanya di
   `/timeline` + `/observatorium`.
6. **Admin:** shell Linear (sidebar rapi, command bar, breadcrumb, quick action)
   + log pipeline gaya terminal di Command Center + daftar klaim/linimasa padat.
   Visual saja — guard, peran, RLS, API tidak disentuh.
7. **BottomNav:** kaca nyata + ikon lucide + indikator tunggal yang sudah ada.

### Fase 5 — Animasi + responsif + uji
1. Transisi halaman 200ms content-first; staggered entrance halaman kunci;
   microinteraction semua komponen Fase 3; loading/empty/error state.
2. Responsif 320/360/375/390/412/430/tablet/desktop/wide — 0 overflow,
   target sentuh nyaman, safe-area BottomNav.
3. Reduced motion + fallback + mode hemat (matikan blur/animasi dekoratif di
   HP menengah).
4. Uji: semua rute + navigasi + interaksi + a11y + performa (Lighthouse,
   LCP/INP/CLS diukur, bukan diklaim) + regresi (artikel, cari, verifikasi,
   akun, admin, notifikasi, offline, SEO). Screenshot sesudah vs baseline
   `docs/audit/before-redesign/`.
5. PR terpisah dari branch ini; TANPA deploy/migrasi/secret tanpa otorisasi.

## 6. Yang sengaja TIDAK dibuat (dicatat agar tidak diulang)

- Hero 3D / WebGL full-scene (Cerebrium/Butter) — startup berat, Android menengah.
- Workspace 3D (Plamo) — tidak relevan untuk baca berita.
- GSAP sekarang (lihat §2); Rive sekarang (lihat §2); Spline sekarang (lihat §2).
- Glass di semua kartu; animasi dekoratif tanpa fungsi; drag hiasan; loop konten.
- Teks animasi di isi artikel; shortcut sebagai satu-satunya jalan navigasi.
- Palet gelap total; sign-in wall sebelum nilai terlihat.

## 7. Batasan & kejujuran pengukuran

- Riset 18 situs dilakukan via **baca teks halaman (`browser.open`)** — bukan
  browser live interaktif. Perilaku hover/scroll/drag, durasi/easing, FPS, dan
  WebGL runtime **tidak teramati** dan ditandai begitu di tiap laporan;
  verifikasi live tetap diperlukan sebelum implementasi pola yang bergantung
  pada perilaku tersebut.
- **Active Theory:** hanya halaman fallback `/unsupported` yang terbaca.
- **Raycast, Awwwards Animation:** halaman hanya terbaca sebagian (grid/video
  tidak ter-crawl) — dilengkapi sumber sekunder yang dicatat sebagai sekunder.
- **Lusion:** `lusion.app` kini produk berbeda dari studio `lusion.co` —
  dibedakan eksplisit di G4; jangan salah atribusi.
- **Admin:** audit visual BLOCKED tanpa login (guard benar); keputusan admin
  di §5 butir 6 bersifat dari-kode, perlu verifikasi visual sesudah login.
- **Performa:** tidak ada pengukuran Lighthouse di fase ini (butuh browser
  live); angka bundle library adalah klaim sekunder, belum diukur di build
  PRATA FAKTA.
- Angka ukuran laporan: G1 40.431, G2 40.754, G3 46.311, G4 23.670,
  G5 43.469, G6 42.907 byte — total ~237 KB dokumentasi riset.
