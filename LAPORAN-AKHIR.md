# LAPORAN AKHIR — PRATA FAKTA Fase 7: Production

**Tanggal:** 16 November 2026
**Status keseluruhan: SELESAI DI KODE + TERVERIFIKASI LOKAL — BELUM LIVE DI PRODUKSI.**

Fase 7 adalah fase terakhir PRATA FAKTA. Semua yang bisa diselesaikan
dalam kode, audit, dan dokumentasi sudah selesai dan terverifikasi
lokal. Yang belum: migrasi database di Supabase produksi dan deploy
Vercel — keduanya blokir di luar kode (lihat §12).

> Kejujuran laporan ini: "LOLOS (lokal)" berarti terverifikasi di
> mesin ini (PGlite, build, smoke test HTTP) — BUKAN di produksi.
> "BLOKIR" berarti pengujiannya membutuhkan produksi / browser nyata
> / login nyata, dan belum bisa dilakukan.

---

## 1. Ringkasan eksekutif

| Area | Hasil Fase 7 |
|---|---|
| Keputusan arsitektur tertunda (404 slug, skor kuis) | Diputuskan + diimplementasikan + terverifikasi |
| Security audit | 10 temuan; 6 diperbaiki, 2 didokumentasikan (migrasi susulan), 1 diterima fail-closed, 1 sudah diperbaiki sebelumnya (T2) |
| Performance audit | Lazy loading + header cache diterapkan; First Load JS per rute tidak tersedia dari artefak Turbopack |
| SEO | Sitemap, robots, RSS, JSON-LD, canonical, Open Graph — semua 200 di smoke test |
| Backup & monitoring | Skrip backup 37 tabel + endpoint `/api/health` + seksi kesehatan di `/admin/sistem` |
| QA 25 butir | 21 LOLOS (lokal), 4 BLOKIR (lihat §5) |
| Verifikasi | `tsc` EXIT 0, `lint` EXIT 0, `uji-fase7` **87/87 LOLOS**, `build` EXIT 0 (87/87 halaman), smoke test lolos |

---

## 2. Yang diputuskan & diimplementasikan di Fase 7

### 2.1 Status 404 untuk slug yang tidak ada (utang Fase 6) — SELESAI

**Keputusan:** pola proxy, seperti perbaikan 404 artikel Fase 2.
`src/proxy.ts` kini punya helper `slugTidakAda(tabel, slug)` (REST
anon, fail-open; PGRST205 = tabel belum ada → 404) dan memeriksa:

- `/artikel/[slug]` → `pf_articles`
- `/pengetahuan/[slug]` → `pf_knowledge_articles`
- `/kategori/[slug]` → cek statis `cariKategori` (tanpa DB)

**Verifikasi smoke test:** `/pengetahuan/tidak-ada-slug` → **404**,
`/artikel/tidak-ada` → **404**, `/kategori/tidak-ada` → **404**
(sebelumnya `/pengetahuan/[slug]` mengembalikan HTTP 200 dengan UI
404). Komentar usang di `pengetahuan/[slug]/page.tsx` diperbarui
("KEPUTUSAN FASE 7").

### 2.2 Penyimpanan skor kuis — DIPUTUSKAN: DISIMPAN (hanya login)

**Keputusan:** skor disimpan persisten, hanya untuk pengguna login.
Alasan: riwayat hanya bermakna bila terikat akun; skor anonim tidak
bisa ditampilkan kembali atau dihapus pemiliknya.

- Migrasi v7 baru: `supabase/migrations/20261116_pf_v7_quiz_scores.sql`
  — tabel `pf_quiz_scores` (id, user_id NOT NULL FK auth.users
  cascade, tanggal, benar 0..5, total 1..10, benar ≤ total,
  unique (user_id, tanggal), trigger `diperbarui_pada`).
  RLS 3 policy (baca/tambah/ubah pemilik; tanpa policy delete/baca
  publik). **Total sesudah v7: 36 tabel, RLS 36/36, 79 policy.**
- `POST /api/kuis/skor` (rate limit 5/mnt/IP, 401 bila belum login,
  validasi tanggal hari ini/kemarin WIB + benar/total, upsert,
  503 jujur bila tabel belum ada).
- `/kuis` menampilkan riwayat 7 hari terakhir bila login; anonim
  tetap bisa bermain, skor hanya tampil di sesi.

### 2.3 SEO — SELESAI

- `src/app/sitemap.ts` (22 halaman statis + 10 kategori + artikel &
  pengetahuan terbit, limit 500; tanpa DB → hanya statis, jujur),
  `src/app/robots.ts` (disallow /admin/, /api/, /feed-saya, /profil),
  `src/app/rss.xml/route.ts` (RSS 2.0, 20 artikel terbit terbaru;
  kosong → feed valid 0 item).
- JSON-LD NewsArticle + BreadcrumbList di `/artikel/[slug]`;
  Article + BreadcrumbList di `/pengetahuan/[slug]`; canonical +
  Open Graph (type article, publishedTime, authors, images) +
  twitter card di generateMetadata artikel/pengetahuan/kategori.
- `robots: { index: false }` di layout admin + segmen baru
  `/masuk`, `/daftar`, `/profil`.
- Gambar artikel tetap `<img>` (URL eksternal arbitrer —
  `next/image` butuh remotePatterns terbuka = proxy gambar terbuka,
  ditolak dengan alasan keamanan).

### 2.4 Performa — SELESAI (sebagian; lihat batas di §5 butir 25)

- CSS Leaflet dipindah dari `layout.tsx` (global) ke
  `PetaDuniaLazy.tsx`; `PembacaSuara` + `FormLaporan` di-lazy-load
  via `next/dynamic`.
- `next.config.ts` `headers()`: security headers di semua rute
  (nosniff, X-Frame-Options DENY, Referrer-Policy
  strict-origin-when-cross-origin, Permissions-Policy kosong untuk
  kamera/mikrofon/geolocation) + Cache-Control
  `public max-age=900` untuk /sitemap.xml, /robots.txt, /rss.xml.
- CSP sengaja BELUM dipasang (butuh nonce/hash; berisiko memblokir
  skrip tema anti-kedip) — pekerjaan lanjutan.
- ISR/revalidate ditunda (risiko build); prev/next artikel tidak
  dikerjakan (di luar lingkup Fase 7).

### 2.5 Monitoring — SELESAI

- `src/lib/kesehatan.ts` (`periksaKesehatan()` → db
  ok/belum_tersedia/belum_dikonfigurasi/gagal + latensi + waktu).
- `GET /api/health` (rate limit 60/mnt/IP; tanpa data sensitif).
- Seksi "Kesehatan Sistem" di `/admin/sistem` (memakai lib yang
  sama, tanpa self-fetch).

### 2.6 Backup — SELESAI (skrip + dokumentasi)

- `scripts/backup-pf.mjs`: mengekspor 36 tabel `pf_*` ke JSON via
  REST dengan service-role key dari ENV/`.env.local` — key TIDAK
  PERNAH dicetak; paginasi 1000; `manifest.json`; exit 1 bila ada
  tabel gagal. Backup otomatis terjadwal belum ada (Supabase
  free-tier: backup PITR tidak tersedia; ekspor berkala ini adalah
  strateginya — lihat §11).

---

## 3. Security audit — 10 temuan

Audit penuh (RLS semua tabel, auth, guard admin server-side,
validasi input 39+ route, rate limiting, secret, audit logging,
XSS, SQL injection) menemukan **tidak ada kebocoran secret dan
tidak ada celah kritis pengambilalihan akun/admin**.

| ID | Temuan | Status |
|---|---|---|
| T1 | Kunci jawaban kuis bisa dibaca publik (`pf_quiz_questions` baca publik termasuk kolom `kunci`) | **DIPERBAIKI** — route baru `POST /api/kuis/jawab` (server-side, rate limit 20/mnt/IP, hanya soal hari ini/kemarin); klien menerima tipe `PfKuisSoalPublik` tanpa kunci; `KuisHarian` dirombak ke alur async (jawab → POST → tampil hasil). Kunci satu soal hanya terungkap sesudah menjawab (by design). |
| T2 | Tanpa security header | **DIPERBAIKI** — headers di `next.config.ts`, terverifikasi di smoke test (4 header hadir di `/`). |
| T3 | Rate limiter in-memory per-instance + IP dari `x-forwarded-for` bisa dipalsukan; 4 route POST tanpa limiter (bookmark, notifikasi, riwayat, topik) | **DIPERBAIKI SEBAGIAN** — limiter lokal 30/mnt/IP ditambahkan ke keempat route (2+2+1+3 pemeriksaan). Sisa (store bersama/Upstash, IP tepercaya platform) = pekerjaan lanjutan (butuh layanan eksternal). |
| T4 | Akun nonaktif tidak ditolak di route AI + route pengguna biasa | **DIPERBAIKI SEBAGIAN** — `autentikasiStaf()` kini memeriksa `pf_profiles.nonaktif` (403 bila nonaktif, fail-open bila tabel belum ada). Route pengguna biasa tidak diubah (dampak rendah). |
| T5 | Insert anonim langsung ke DB melewati rate limit API (newsletter, laporan koreksi, pertanyaan) | **DIDOKUMENTASIKAN** — tidak bisa diperbaiki tanpa ubah migrasi v1/v2/v6 → pekerjaan migrasi susulan (v8), bukan blokir Fase 7. |
| T6 | SSRF: URL sumber di-fetch server tanpa validasi host | **DIPERBAIKI** — helper baru `src/lib/ingestion/ssrf.ts` (`tolakHostPrivat` + `ipPrivat` murni yang teruji); diterapkan di `fetchRss` + route cek sumber (mengembalikan ok:false sebagai hasil pemeriksaan, bukan 500). DNS gagal → fail-open. |
| T7 | Fungsi SECURITY DEFINER tanpa SET search_path (`pf_has_role`, `pf_is_super_admin`, `pf_handle_new_user` di v1) | **DIPERBAIKI** — `ALTER FUNCTION ... SET search_path = public` ditambahkan ke migrasi v7 (tanpa mengubah v1); terverifikasi via `pg_proc.proconfig` di PGlite. |
| T8 | Baca publik berlebih (`pf_roles`/`permissions`/`role_permissions` + `pf_article_sources`/`tags` tanpa filter terbit) | **DIDOKUMENTASIKAN** — butuh ubah migrasi v1/v2 → pekerjaan migrasi susulan (v8). |
| T9 | Perbandingan secret pakai `===` (bukan timing-safe) | **DIPERBAIKI** — helper `bandingkanSecret` (node:crypto `timingSafeEqual`; false bila panjang beda/kosong) di `src/lib/ai/route-auth.ts`; diterapkan di 3 lokasi (route-auth, ingestion/jalankan, terbitkan-terjadwal). |
| T10 | Kegagalan tulis audit menggagalkan aksi admin | **DITERIMA** — fail-closed by design; dicatat + monitoring. |

Detail audit lengkap ada di laporan audit keamanan Fase 7
(`/tmp/pf-fase7-audit-keamanan.md`, arsip kerja) dan audit performa/SEO
(`/tmp/pf-fase7-audit-performa-seo.md`, arsip kerja).

---

## 4. Hasil pengujian (angka)

| Pengujian | Hasil | Tanggal |
|---|---|---|
| `npx tsc --noEmit` | **EXIT 0** | 16 Nov 2026 |
| `npm run lint` | **EXIT 0** (0 warning) | 16 Nov 2026 |
| `node scripts/uji-fase7.mjs` | **87/87 LOLOS** (migrasi v1–v7 idempoten; 36 tabel; RLS 36/36; 79 policy; skenario skor; T1/T3/T4/T6/T7/T9) | 16 Nov 2026 |
| `npm run build` | **EXIT 0 — 87/87 halaman** (rute baru: `/api/health` ƒ, `/api/kuis/skor` ƒ, `/api/kuis/jawab` ƒ, `/robots.txt` ○, `/rss.xml` ƒ, `/sitemap.xml` ƒ). BUILD_ID 2SVs5ed_imVxww-5ff6ql | 16 Nov 2026 |
| Smoke test (`next start` port 3100, log 0 baris error) | `/` 200, `/sitemap.xml` 200 (32 URL, 0 artikel — jujur), `/robots.txt` 200, `/rss.xml` 200 (XML valid, 0 item), `/api/health` 200 (`degraded`, `db: belum_tersedia` — jujur, tabel belum ada), `/kuis` 200, `/masuk` 200; **404 nyata** untuk `/pengetahuan/tidak-ada-slug`, `/artikel/tidak-ada`, `/kategori/tidak-ada`; `POST /api/kuis/jawab` bad input → **400**, jawaban 9 → **400**, UUID valid tanpa tabel → **503** jujur; 4 security header hadir | 16 Nov 2026 |

Catatan smoke test: `/admin`, `/admin/artikel`, `/feed-saya`
tanpa login mengembalikan HTTP 200 dengan payload RSC
`NEXT_REDIRECT;replace;/masuk;307` (browser mengikuti redirect) —
perilaku yang sama sejak smoke test Fase 5/6, bukan regresi; guard
berfungsi.

Angka dari fase sebelumnya (diwarisi, bukan diuji ulang di Fase 7):
Fase 6 — build 81/81 halaman, PGlite 35 tabel RLS 35/35, 76 policy,
uji E2E 53/53; Fase 5 — ~50 asersi, audit log 23 baris/16 aksi;
Fase 4 — dry-run nyata 200 item: 7 draf, 7 VERIFIED, 193
UNCONFIRMED, 0 gagal; klaim 715, evidence 723; Fase 3 — dry-run
ingestion run 1: 356 ditemukan / 353 baru / 3 duplikat / 0 gagal,
run 2: 0 baru (dedup terbukti).

---

## 5. QA penuh — checklist 25 butir (nilai jujur)

| # | Butir | Nilai | Alasan / bukti |
|---|---|---|---|
| 1 | Halaman | **LOLOS (lokal)** | Build 87/87; smoke 200 untuk `/`, `/kuis`, `/pengetahuan`, `/data`, `/peta`, `/brief`, `/masuk`; 404 nyata slug tak ada. Isi bergantung DB tampil empty state jujur (tabel belum ada). |
| 2 | Tombol | **BLOKIR** | Handler ada di kode + build lolos, tapi belum ada uji klik di browser nyata (butuh migrasi + deploy + login). |
| 3 | Tautan | **LOLOS (lokal)** | Sitemap 32 URL, canonical + OG di artikel/pengetahuan/kategori, navigasi build OK. Pemeriksaan tautan rusak menyeluruh di produksi belum dilakukan. |
| 4 | Auth | **LOLOS (lokal)** | Guard server-side; smoke: `/admin` tanpa login → redirect 307, `/api/admin/ringkasan` → 401, POST skor tanpa login → 401. Login pengguna nyata di produksi belum diuji. |
| 5 | Authorization | **LOLOS (lokal)** | RLS 36/36, 79 policy; nonaktif ditolak di guard admin + kini di route AI (T4). Uji peran nyata di produksi belum. |
| 6 | DB | **LOLOS (lokal)** | Migrasi v1–v7 idempoten di PGlite; 36 tabel; RLS 36/36; 79 policy; skenario skor lolos. Migrasi BELUM dijalankan di Supabase produksi (blokir §12). |
| 7 | API | **LOLOS (lokal)** | Validasi + 401/403/503 jujur terverifikasi di smoke (jawab 400/503, skor 401, admin 401, health 200). Uji beban di produksi belum. |
| 8 | Discovery | **LOLOS (lokal)** | `/kategori`, `/pengetahuan`, `/arsip`, `/cari`, `/feed-saya` (login) build + smoke 200. Data nyata di produksi belum. |
| 9 | RSS | **LOLOS (lokal)** | `/rss.xml` 200, XML valid, 0 item jujur. Isi dengan artikel terbit nyata butuh produksi. |
| 10 | Dedup | **LOLOS (lokal)** | Dry-run nyata Fase 3: run 1: 356 ditemukan / 353 baru / 3 duplikat / 0 gagal; run 2: 0 baru. Dedup di produksi belum. |
| 11 | Verification | **LOLOS (lokal)** | Verifikasi dua sinyal + koroborasi klaim; dry-run 200 item: 7 VERIFIED, 193 UNCONFIRMED, 0 gagal. Penilaian isi nyata wajib review editor/Muse sebelum terbit. |
| 12 | AI generation | **LOLOS (lokal, terbatas)** | Pipeline dry-run menghasilkan 7 draf orisinal; terjemahan heuristik parsial (tanpa machine translation). Generasi terjadwal nyata belum berjalan (butuh deploy + secret). |
| 13 | Approval | **LOLOS (lokal)** | Gate terbit menolak UNCONFIRMED/DISPUTED (409 + alasan); review klaim/evidence di `/admin`; audit log 23 baris/16 aksi (Fase 5). Alur approval dengan editor nyata belum diuji. |
| 14 | Auto publishing | **BLOKIR** | Kode + workflow GitHub Actions tiap jam selesai & diuji lokal, tapi belum pernah berjalan di produksi (butuh deploy + `PF_AI_SECRET`). |
| 15 | Scheduler | **BLOKIR** | 5 workflow GitHub Actions ada (ingestion */30, editorial 6 jam, brief 05.00 WIB, data-analysis Senin 01.00 UTC, terbitkan-terjadwal tiap jam) tapi TIDAK AKTIF sampai deploy + secret terisi. |
| 16 | Notifikasi | **LOLOS (lokal)** | Notifikasi in-app (tabel + route + UI) + rate limit Fase 7. Push/email BELUM dibangun (sisa Fase 6, dicatat). |
| 17 | Search | **LOLOS (lokal)** | `/cari` + SearchBar; pencarian isi artikel (Fase 2). Hasil dengan data nyata butuh produksi. |
| 18 | Filter | **LOLOS (lokal)** | `/arsip` filter tanggal + kategori + status verifikasi + kata kunci; filter admin. Sama — data nyata butuh produksi. |
| 19 | Bookmark | **LOLOS (lokal)** | Route GET/POST + UI + rate limit Fase 7. Uji login nyata butuh produksi. |
| 20 | History | **LOLOS (lokal)** | Riwayat baca (dedup 24 jam) + riwayat skor 7 hari (v7). Uji login nyata butuh produksi. |
| 21 | Admin | **LOLOS (lokal)** | `/admin` 13 halaman + 21 route API + guard server-side + audit log; smoke 307/401. Uji admin nyata butuh produksi. |
| 22 | Responsive | **BLOKIR** | Belum ada uji visual browser di lebar 320–1920px dalam Fase 7 (audit pola CSS "tanpa overflow" bukan bukti visual). |
| 23 | Security | **LOLOS (lokal)** | Audit penuh (§3); 6 temuan diperbaiki + terverifikasi (uji-fase7 87/87); 2 didokumentasikan (T5, T8); T10 diterima fail-closed. Uji penetrasi + produksi belum. |
| 24 | SEO | **LOLOS (lokal)** | Sitemap/robots/RSS 200, JSON-LD, canonical, OG, noindex admin/auth. Verifikasi crawler nyata belum. |
| 25 | Performance | **LOLOS (lokal, sebagian)** | Lazy Leaflet + komponen berat, header cache, build 87/87. First Load JS per rute TIDAK tersedia dari artefak Turbopack (angka per rute tidak bisa dilaporkan); uji Lighthouse/browser nyata belum. |

**Rekap: 21 LOLOS (lokal), 4 BLOKIR** (tombol, auto publishing,
scheduler, responsive).

---

## 6. Fitur — selesai / belum selesai / belum bisa

### 6.1 Selesai di kode + terverifikasi lokal (Fase 1–7)

Fondasi & auth (v1), platform berita (v2: artikel, bookmark, riwayat,
laporan koreksi, pencarian, filter arsip), ingestion RSS + GDELT +
dedup (v3), AI editorial deterministik + verifikasi dua sinyal +
Daily Brief (v4), sistem editorial admin + gate terbit + koreksi +
audit log + jadwal terbit (v5), fitur lanjutan (v6: peta Leaflet,
pengetahuan, kuis harian, data/indikator, timeline, tanya AI, feed
personal, notifikasi, TTS), dan seluruh Fase 7 (§2–§3, §5).

### 6.2 Belum selesai (dicatat jujur — butuh keputusan/kerja lanjutan)

- **Notifikasi push/email** — hanya in-app (sisa Fase 6).
- **Skor kuis anonim** — sengaja tidak disimpan (keputusan §2.2).
- **Pertanyaan `/tanya` berstatus menunggu** — belum ada penjawab
  otomatis; dijawab Muse/editor lewat cron/chat, tanpa SLA.
- **Terjemahan artikel** — heuristik parsial saja, tanpa machine
  translation.
- **CSP** — belum dipasang (butuh nonce/hash; berisiko blokir skrip
  tema anti-kedip).
- **Rate limit terdistribusi + IP tepercaya platform** (sisa T3).
- **Perbaikan T5 & T8** — butuh migrasi susulan v8.
- **Prev/next artikel, ISR/revalidate** — tidak dikerjakan di Fase 7.

### 6.3 Belum bisa (blokir di luar kode)

- Migrasi v1–v7 belum dijalankan di Supabase produksi.
- Deploy Vercel gagal 403 (akses tim `prataava`).
- Scheduler GitHub Actions tidak aktif sampai deploy + secret.
- Uji browser nyata (klik, login, peta, TTS, responsif) belum bisa.

---

## 7. Integrasi aktif

| Integrasi | Status |
|---|---|
| Supabase (proyek `prata`, Postgres + Auth + RLS) | Kode selesai; **migrasi produksi belum dijalankan** |
| Vercel (deploy) | **BLOKIR 403** — akses tim `prataava` hilang; perlu hubung ulang / import manual |
| GitHub Actions (5 workflow scheduler) | Kode selesai; **tidak aktif** sampai deploy + secret |
| RSS eksternal (7 feed nyata) + GDELT | Engine selesai; dry-run nyata lolos; jalan terjadwal butuh deploy |
| Leaflet + OpenStreetMap (peta) | Kode selesai; belum dilihat di browser nyata |
| Web Speech API (TTS) | Kode selesai; suara `id-ID` tergantung perangkat |
| AI | **HANYA via Muse** (cron/chat + ekspor/impor) — tanpa GPT/Gemini/DeepSeek di frontend |

---

## 8. API yang butuh kredensial (nama secret saja — tanpa nilai)

| Secret | Dipakai |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL proyek Supabase (publik) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Kunci anon Supabase (publik) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server saja — backup + operasi internal (JANGAN di frontend) |
| `PF_INGESTION_SECRET` | Header pemicu ingestion terjadwal |
| `PF_AI_SECRET` | Header pemicu pipeline AI + terbitkan-terjadwal |
| `PF_SITE_URL` | URL kanonis situs (default https://prata-fakta.vercel.app bila kosong) |

Verifikasi: `.env.example` bersih (semua nilai secret kosong);
`.env.local` ter-ignore; tidak ada service-role key / token /
password di kode atau file ter-commit (grep audit keamanan).

---

## 9. Status database / scheduler / AI

- **Database:** skema v1–v7 selesai (36 tabel `pf_*`, RLS 36/36,
  79 policy) dan terverifikasi idempoten di PGlite. **Di Supabase
  produksi: BELUM ADA SATU PUN tabel `pf_*`** (migrasi belum
  dijalankan) — semua halaman menampilkan empty state jujur / 503
  jujur sampai migrasi dijalankan.
- **Scheduler:** 5 workflow GitHub Actions di `.github/workflows/`
  (ingestion tiap 30 menit, pipeline editorial tiap 6 jam, Daily
  Brief 05.00 WIB, data-analysis Senin 01.00 UTC,
  terbitkan-terjadwal tiap jam). **TIDAK AKTIF** — butuh deploy +
  secret terisi. Vercel Cron ditolak (Hobby 1×/hari + blokir tim).
- **AI:** pipeline deterministik (research, source-analysis tier
  90/75/60, verifikasi dua sinyal + koroborasi klaim, summarization
  ekstraktif, writing draf orisinal, quality 8 cek, trends, brief)
  selesai di kode; dry-run nyata 200 item menghasilkan 7 draf
  (7 VERIFIED, 193 UNCONFIRMED, 0 gagal). **AI hanya via Muse** —
  tidak ada panggilan model eksternal dari aplikasi; draf WAJIB
  review Muse/editor sebelum terbit.

---

## 10. Bug ditemukan + diperbaiki (Fase 7)

1. **Kunci kuis bocor ke publik (T1)** — diperbaiki via API
   server-side (§3).
2. **`/pengetahuan/[slug]` tak ada → HTTP 200** (utang Fase 6) —
   diperbaiki via proxy (§2.1).
3. **Perbandingan secret `===`** (T9) — timing-safe (§3).
4. **Fungsi SECURITY DEFINER tanpa search_path** (T7) — dikunci
   di v7 (§3).
5. **SSRF di fetch URL sumber** (T6) — pelindung host privat (§3).
6. **Akun nonaktif lolos di route AI** (T4) — cek nonaktif (§3).
7. **4 route tanpa rate limit** (T3) — limiter 30/mnt/IP (§3).
8. **Regresi edit Fase 7 (ditemukan sendiri, diperbaiki sebelum
   commit):** saat menambahkan limiter ke `POST /api/topik`,
   pemeriksaan `if (!pengguna)` ikut terhapus — `tsc` menangkapnya
   (`pengguna possibly null`), pemeriksaan dipulihkan, `tsc` EXIT 0
   kembali. Pelajaran: edit yang menyentuh awal handler wajib
   diperiksa ulang baris demi baris.

---

## 11. Cara deploy — langkah demi langkah

### 11.1 Prasyarat

- Akses Supabase Dashboard proyek `prata` (SQL Editor) — atau
  service-role key untuk menjalankan migrasi.
- Akses Vercel (bila blokir 403 tim `prataava` belum pulih: import
  repo manual di dashboard Vercel sebagai proyek baru — lihat
  §11.4).
- Bundel sumber cadangan: `prata-fakta-fase7.zip` (di samping
  laporan ini / di repo induk; terverifikasi `tar -tzf`).
- **Prosedur cutover lengkap (Fase 8): `supabase/CUTOVER.md`** —
  dokumen ini adalah panduan langkah demi langkah (pemeriksaan
  sebelum migrasi, backup, migrasi v1–v8, validasi fungsi, smoke
  test, rollback). Ringkasan deploy: `DEPLOY.md` di root repo.
- **Backup dulu** (`node scripts/backup-pf.mjs`, lihat §11.6):
  sebelum migrasi, 37 tabel dilaporkan gagal (404 — tabel belum
  ada) dan itu normal; 401 berarti key salah.
- **Repo kini di commit `f1e68d6` (Fase 8 Gelombang 1), 94 rute.**
  Migrasi v8 sudah mencakup perbaikan T5/T8 (lihat §11.2) —
  tetapi v8 HANYA boleh dijalankan SESUDAH deploy (§11.4),
  karena v8 mencabut policy INSERT anonim dan kode penggantinya
  (service role) baru berlaku sesudah deploy.

### 11.2 Jalankan migrasi (berurutan, JANGAN dilewat)

Di Supabase Dashboard → SQL Editor, jalankan satu per satu
`supabase/migrations/` — **Tahap A: v1–v7 dulu, deploy (§11.4),
BARU Tahap B: v8** (alasan: lihat `supabase/CUTOVER.md` §0):

1. `20261116_pf_v1_foundation.sql`
2. `20261116_pf_v2_articles.sql`
3. `20261116_pf_v3_ingestion.sql`
4. `20261116_pf_v4_ai.sql`
5. `20261116_pf_v5_editorial.sql`
6. `20261116_pf_v6_advanced.sql`
7. `20261116_pf_v7_quiz_scores.sql`

— deploy (§11.4) —

8. `20261116_pf_v8_expansion.sql` (Fase 8 Gelombang 1: T5 cabut
   3 policy INSERT anonim, T8 batasi baca berlebih, T1-sisa kunci
   kuis per kolom, perluasan CHECK enum, tabel baru
   `pf_user_preferences` + kolom Area 3/13)

Verifikasi sesudah tiap berkas (lihat `supabase/README.md` dan
`supabase/CUTOVER.md` §3):

```sql
select count(*) from pg_tables
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi sesudah v7: 36; sesudah v8: 37

select count(*) from pg_policies
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi sesudah v7: 79; sesudah v8: 79
-- (v8: −3 policy insert anonim + 3 policy pf_user_preferences)
```

Angka ekspektasi per tahap: v1 = 8 tabel / 18 policy,
v2 = 16 / 51, v3 = 18 / 53, v4 = 23 / 59, v5 = 26 / 62,
v6 = 35 / 76, v7 = 36 / 79, v8 = 37 tabel / 79 policy
(angka v8 diverifikasi dari berkas migrasi, bukan asumsi).

Bila satu berkas gagal, JANGAN lanjut ke berkas berikutnya —
perbaiki dulu, lalu ulangi berkas itu (semua migrasi idempoten,
aman diulang).

### 11.3 Isi environment variables di Vercel

(Nama saja — isi dari pemilik; lihat `.env.example`.)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server saja)
- `PF_INGESTION_SECRET` (buat nilai acak panjang)
- `PF_AI_SECRET` (buat nilai acak panjang)
- `PF_SITE_URL` (URL produksi, mis. https://prata-fakta.vercel.app)

### 11.4 Deploy

- **Bila akses tim Vercel pulih:** hubungkan ulang / deploy dari
  repo `prata-fakta` seperti biasa.
- **Bila masih 403:** di dashboard Vercel → Add New → Project →
  Import Git Repository → pilih `prataava/prata-fakta` (atau
  unggah bundel ZIP) → framework Next.js → isi env vars §11.3 →
  Deploy. `vercel.json` TIDAK diperlukan (Next.js standar; cron
  via GitHub Actions, bukan Vercel Cron).
- Verifikasi deploy: `npm run build` harus EXIT 0 (sudah
  terverifikasi lokal); smoke test produksi: `/` 200,
  `/sitemap.xml` 200, `/robots.txt` 200, `/rss.xml` 200,
  `/api/health` 200 dengan `db: "ok"`, slug tak ada → 404,
  `/admin` tanpa login → redirect ke `/masuk`.

### 11.5 Aktifkan scheduler

Di GitHub → repo → Settings → Secrets and variables → Actions,
isi `PF_INGESTION_SECRET` dan `PF_AI_SECRET` (nilai sama dengan
§11.3). Workflow berjalan otomatis sesuai jadwal; pantau di tab
Actions. Tanpa secret ini, workflow gagal dengan 503 jujur.

### 11.6 Backup berkala

Jalankan `node scripts/backup-pf.mjs` (butuh
`SUPABASE_SERVICE_ROLE_KEY` di ENV/`.env.local`) secara berkala
dari mesin tepercaya; simpan hasil JSON + `manifest.json` di luar
repo. Skrip exit 1 bila ada tabel gagal — jangan abaikan.
**Sesudah v8, skrip mencakup 37 tabel** (36 dari v1–v7 +
`pf_user_preferences` dari v8); backup pasca-migrasi harus
`37/37 tabel, 0 gagal`, dengan seed `pf_roles` 5,
`pf_permissions` 9, `pf_role_permissions` 19,
`pf_categories` 34, `pf_sources` 8, `pf_scheduled_jobs` 3.
Prosedur backup sebelum migrasi (baseline 404 = normal, 401 =
key salah): `supabase/CUTOVER.md` §2.

---

## 12. Blokir yang tersisa + yang harus dilakukan pemilik

| # | Blokir | Yang harus dilakukan pemilik |
|---|---|---|
| 1 | Migrasi v1–v12 belum dijalankan di Supabase produksi (diperbarui Tahap 16 — dulu v1–v8) | Jalankan 12 berkas SQL berurutan via SQL Editor (§11.2 + `supabase/CUTOVER.md` §3, tahap 3A–3F; validasi 54/54/106) — atau berikan service-role key lewat Secure Vault agar Muse yang menjalankan |
| 2 | Deploy Vercel gagal 403 (akses tim `prataava` hilang) | Putuskan: hubungkan ulang Vercel di Muse, atau import repo manual di dashboard Vercel (§11.4) |
| 3 | Scheduler tidak aktif | Isi secret GitHub Actions sesudah deploy (§11.5) |
| 4 | Uji login + klik browser nyata belum dilakukan | Sesudah live: login sebagai admin/editor/pembaca, klik alur utama (kuis, peta, tanya, feed, admin), laporkan hasilnya |
| 5 | Uji responsif visual belum dilakukan | Sesudah live: buka di HP (320–430px) + desktop, periksa overflow |

**URL website: BELUM LIVE.** Alasan: blokir #1 dan #2 di atas —
tanpa migrasi dan deploy, tidak ada URL produksi yang bisa
dibuka. URL yang direncanakan: https://prata-fakta.vercel.app
(`PF_SITE_URL` default).

---

## 13. Catatan — di luar Fase 7

- **Expansion "Advanced Intelligence" (brief pengguna 16 Nov 2026
  ±06.11 WIB):** 14 area baru (Jejak Fakta, Story Tracker,
  Multi-Source View, Explain the World, Reality Check, Ask the
  World, My Prata, PRATA Academy, PRATA Podcast, PRATA Research,
  Country Profile, Historical Archive, Public Report, Advanced
  Admin Control Center). Dijadwalkan sebagai **FASE 8** — dimulai
  sesudah Fase 7 selesai, dengan audit dulu, tanpa menghapus /
  mengganti fitur yang sudah berfungsi, dan regression testing.
  **Tidak dikerjakan di Fase 7 ini.**
- Pekerjaan lanjutan yang dicatat (bukan blokir Fase 7): CSP,
  rate limit terdistribusi, migrasi susulan v8 (T5, T8),
  notifikasi push/email, penjawab otomatis `/tanya`, machine
  translation, prev/next artikel, ISR/revalidate.

---

*PRATA FAKTA Fase 7 selesai di kode + terverifikasi lokal,
16 November 2026. Commit: "PRATA FAKTA Fase 7: Production —
security audit, SEO, backup, monitoring, QA penuh".*
## 14. Tahap 13–17 — penutup Master Autonomous Execution Directive (16 Nov 2026)

Fase 8 Gelombang 2 selesai di kode (§13 LAPORAN-FASE-8), lalu
Tahap 13–17 menutup seluruh 14 area sampai DONE di kode +
terverifikasi lokal. Detail penuh: `LAPORAN-FASE-8.md` §14;
laporan akhir proyek: `FINAL-PROJECT-COMPLETION.md`.

### 14.1 Yang dikerjakan

- **Tahap 13A** — T3: rate limit lintas instance via tabel
  `pf_rate_limits` + RPC atomik `pf_rate_limit_check` (v11);
  T10: audit CRUD sumber fail-closed + audit route admin baru;
  T4: akun nonaktif konsisten (13 berkas / 20 handler).
  Baterai baru `uji-tahap13a.mjs`: **126/126**.
- **Tahap 13B** — T6: SSRF pinning + re-resolusi (GDELT yang
  tadinya `fetch` mentah kini `fetchAman`); CSP nonce +
  header lengkap; audit penuh (auth/authz/RLS/grants/secret/
  SQLi/XSS/prompt injection aman; CSRF sebagian; flag cookie
  sesi belum diuji). Baterai `uji-tahap13b.mjs`: **107/107**.
- **Tahap 13C** — scheduler: `editorial.yml` dipecah jadi 3
  workflow; concurrency group; lock server-side (409 bila
  dipegang); assert `jq` isi respons; retry 2×; `terakhir_jalan`
  diperbarui tiap run; seed 5 job; backoff gate 6 jam; flag
  ditegakkan (ingestion/pipeline/pendaftaran/pemeliharaan).
  Baterai baru `uji-tahap13c.mjs`: **119/119**. Publikasi
  otomatis TETAP MATI.
- **Migrasi v11 + v12** — v11: rate limit + audit 53 aksi;
  v12: CHECK 5 job + seed 5 job. Keadaan akhir: **54 tabel /
  RLS 54/54 / policy 106**, idempoten 2× tanpa blanket grant.
  Baterai baru `uji-tahap13-migrasi.mjs`: **15/15**.
- **Tahap 14** — integrasi 14 area: artikel ↔ cerita (fungsi
  baru `getCeritaUntukArtikel`) ↔ negara (`negara_kode` di
  kolom artikel lengkap) + bar konteks di `/artikel/[slug]`.
  Baterai baru `uji-integrasi14.mjs`: **27/27**.
- **Tahap 15** — regression penuh: **1.365/1.365 asersi**
  (19 baterai, 0 gagal; satu-satunya kegagalan = GDELT 429
  eksternal di uji-ingestion). Build EXIT 0, **147/147
  halaman**, BUILD_ID `NyTEjrq_2Hs81joEYhase`. Smoke `next
  start`: 12× 200 + 8× 404, CSP terverifikasi (nonce unik,
  hash tema = sha256 isi skrip di HTML), log 0 error.
  **Bug kritis ditemukan + diperbaiki:** build EXIT 1 akibat
  `headers()` di root layout (CSP nonce) → skrip tema kini
  pakai hash sha256, layout tidak lagi dinamis.
- **Tahap 16–17** — readiness + cutover: backup 54 tabel
  (cocok persis dengan migrasi), `CUTOVER.md` v1–v12,
  `DEPLOY.md` diperbarui (54/54/106, 77 halaman + 80 API),
  `PANDUAN.md` (pembaca, pengguna terdaftar, penulis,
  fact checker, editor, admin + troubleshooting).

### 14.2 Status keamanan sesudah Tahap 13 (tegas)

| Temuan | Status |
|---|---|
| T3 rate limit | TERTUTUP di kode; TERBUKA di produksi sampai v11 diterapkan (fail-open, tercatat di log) |
| T10 audit CRUD sumber | TERTUTUP di kode |
| T4 akun nonaktif | TERTUTUP di kode |
| T6 DNS rebinding | DIPERSEMPIT, TIDAK tertutup penuh (butuh verifikasi pinning dari egress langsung) |
| CSP | TERIMPLEMENTASI, terverifikasi live lokal (eksekusi skrip tema di browser nyata belum diuji) |
| T5/T8/T1 | TERTUTUP, regression lolos |
| CSRF | SEBAGIAN (SameSite Lax, belum diuji live) |
| Scheduler F2–F8/F12 | TERTUTUP di kode (run live Actions belum diuji) |
| Publikasi otomatis | TETAP MATI |

### 14.3 Blokir yang tersisa (memperbarui §12)

1. Migrasi v1–v12 di Supabase produksi (prosedur
   `supabase/CUTOVER.md` §3, tahap 3A–3F; validasi 54/54/106
   + seed 5 job).
2. Deploy Vercel 403 akses tim `prataava` (opsi A hubungkan
   ulang / B import manual / C ZIP sumber — `DEPLOY.md`).
3. Isi 6 env var Vercel + 3 secret GitHub Actions (nama saja;
   nilai tidak pernah lewat chat).
4. Backup baseline + pasca-migrasi 54/54.
5. Sesudah live: uji login + klik browser nyata + HP/desktop;
   tetapkan super_admin pertama; verifikasi pinning T6 dari
   egress langsung; uji CSRF live + flag cookie sesi;
   keputusan T3 edge bila diinginkan; keputusan audio Podcast
   (file MP3 server) bila diinginkan.

**URL website: MASIH BELUM LIVE** (alasan sama dengan §12:
blokir #1 dan #2). Jangan disebut live sebelum deployment
benar-benar berhasil + diuji.

---

*PRATA FAKTA Tahap 13–17 selesai di kode + terverifikasi lokal,
16 November 2026. Laporan akhir proyek: `FINAL-PROJECT-COMPLETION.md`.*

## 15. Audit Ultimate + Gelombang B1 (16 Nov 2026)

Mandat pemilik ±10.13 WIB (lead autonomous agent) +
otorisasi penuh ±12.28 WIB (termasuk langkah produksi).
Detail penuh: `AUDIT-ULTIMATE.md` (+ addendum integrasi),
`FINAL-PROJECT-COMPLETION.md` §29.

### 15.1 Tahap A — audit dari nol (commit `de3f876`, di-push)

6 agen audit paralel + verifikasi independen: **94 temuan
kode (2 KRITIS, 12 TINGGI, 33 SEDANG, 25 RENDAH)**; N-K1
(gate terbit terputus — draf VERIFIED tak pernah lolos),
N-K2 (DEVELOPING bisa tayang tanpa review); "10 agen AI"
= 10 langkah deterministik (bukan LLM); 16 keterbatasan
BISA DIBANGUN (Piper TTS, hapus akun, sertifikat internal,
MyMemory, analytics DB, notifikasi, penjawab draf,
jenis soal kuis); Vercel 403 TERBUKTI (token tanpa scope
tim `prataava`).

### 15.2 Gelombang B1 — perbaikan (commit `ebd4cf7`)

5 agen + integrasi koordinator + regression penuh.
Migrasi **v13** (§1–§10; 55 tabel / RLS 55/55 / policy 107),
termasuk §10 GRANT service_role (tanpa ini backend mati
42501 di produksi). Gate wajib review + tolak DEVELOPING;
12 route fail-closed; Origin terpusat di proxy; audit wajib
+ compensating; batas DNS 5 dtk (ingestion 696 dtk → 35 dtk).
**Pengujian: 1.805 asersi, 0 gagal; tsc 0; lint 0; build
148/148** (`NuVJviTVNDHPrL8k97_Re`). Celah skor Academy
MASIH TERBUKA — prasyarat B2. **Status: BELUM LIVE**
(migrasi produksi + deploy Vercel menunggu akses pemilik;
di VM tidak ada SUPABASE_ACCESS_TOKEN / service-role key /
Supabase CLI / psql; Vercel 403 dikonfirmasi ulang,
`authorize_team_access` tidak didukung wrapper MCP).
