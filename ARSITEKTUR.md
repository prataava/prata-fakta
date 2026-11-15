# PRATA FAKTA — Arsitektur & Audit Kebutuhan (Fase 1)

> Dokumen ini hasil audit NYATA (16 Nov 2026), bukan asumsi. Setiap klaim
> di bawah diverifikasi dengan fetch langsung, probe REST, atau riset web
> dengan sumber. Yang belum terverifikasi ditulis apa adanya.

## 1. Ringkasan keputusan stack

| Lapisan | Keputusan | Alasan |
|---|---|---|
| Framework | Next.js 16.4.6 (App Router) + TypeScript + React 19 | Standar produksi; `cacheComponents: true` (bawaan scaffold); pola auth + cache sudah dibaca dari `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md` |
| Database | Supabase Postgres proyek **'prata'** (`wyheuxjpusavuiqpymik`) | Sudah dipakai PRATA & TASIK; org mentok 2 proyek gratis → TIDAK buat proyek baru; tabel baru ber-prefix `pf_` |
| Auth | Supabase Auth (email + password) via `@supabase/ssr` | Gratis; sesi di-refresh middleware; RLS menegakkan permission |
| Hosting | Vercel (rencana: proyek baru `prata-fakta`) | TASIK (`tasik-jaya.vercel.app`) sudah live di Vercel — jalur terbukti |
| AI | **Hanya Muse** — orkestrasi lewat cron/scheduled Muse jobs + chat (pola yang sama dengan Mesin Soal PRATA yang sudah berjalan) | Perintah pengguna; JANGAN integrasikan GPT/Gemini/DeepSeek |
| Ingestion | RSS (Tier 1–2 terverifikasi) + GDELT DOC API sebagai cadangan | Lihat §E |
| Desain | Hybrid Editorial Premium, token warna sesuai brief, light + dark | Lihat §4 |

## 2. Audit Supabase proyek 'prata' (16 Nov 2026, probe REST live)

- **Project URL:** `https://wyheuxjpusavuiqpymik.supabase.co`
- **Anon key:** valid, terpakai untuk probe REST (kunci publik, sudah tertanam di frontend TASIK & SNBT).
- **Service role key / DATABASE_URL / password Postgres: TIDAK DITEMUKAN** di workspace mana pun. `psql` & Supabase CLI tidak terpasang.
- **Tabel yang sudah ada (22, terverifikasi live via `GET /rest/v1/<tabel>?limit=0` → 200):**
  - TASIK JAYA (14): `tasik_audit, tasik_cashiers, tasik_categories, tasik_nota_tokens, tasik_policies, tasik_policy_history, tasik_products, tasik_profiles, tasik_purchase_items, tasik_purchases, tasik_settings, tasik_stock_moves, tasik_suppliers, tasik_transactions`
  - SNBT MASTER (8): `snbt_comments, snbt_group_members, snbt_groups, snbt_posts, snbt_profiles, snbt_reports, snbt_scores, snbt_userdata`
- **Tabel `pf_*`: BELUM ADA** (probe 404; grep `pf_` di seluruh workspace = nol).
- **Konsekuensi:** migrasi Fase 1 (`supabase/migrations/20261116_pf_v1_foundation.sql`)
  disiapkan mengikuti pola TASIK (file SQL bernomor tanggal, `CREATE TABLE IF
  EXISTS` + RLS + policy + trigger + index) dan **harus dijalankan pemilik
  lewat Dashboard → SQL Editor**. Sintaks migrasi divalidasi dengan PostgreSQL
  lokal (lihat `supabase/README.md`); verifikasi `SELECT count(*)` di
  produksi baru bisa dilakukan sesudah migrasi dijalankan.
- **Skema Fase 1 (7 tabel):** `pf_profiles`, `pf_roles`, `pf_permissions`,
  `pf_role_permissions`, `pf_user_roles`, `pf_categories` (10 utama + 24 sub,
  seed dari taksonomi brief), `pf_sources` (8 seed terverifikasi),
  `pf_newsletter_subscribers`. RLS AKTIF di semua tabel; permission diperiksa
  backend via policies + helper `pf_has_role()` / `pf_is_super_admin()`.
  Super_admin pertama ditetapkan manual via SQL Editor (lihat README).

## 3. Audit deploy Vercel

- **Terbukti:** TASIK JAYA live di `https://tasik-jaya.vercel.app` (Vercel).
- **Risiko (dari SNBT Master):** deploy otomatis SNBT gagal 5–6× berturut-turut
  dengan Vercel 403 karena akses tim `prataava` hilang; deploy manual ditunda
  pengguna. **Mitigasi:** deploy PRATA FAKTA sebagai proyek Vercel baru atas
  nama pemilik (bukan tim), dan siapkan ZIP/manual deploy bila perlu.
- **Status Fase 1:** BELUM di-deploy (deploy dilakukan sesudah build lolos dan
  migrasi dijalankan; URL final dicatat di laporan Fase 1).

## 4. Desain — Hybrid Editorial Premium

- **Token (persis brief):** Deep Navy `#101827`, Midnight `#0A101A`,
  Editorial White `#F7F8FA`, Pure White `#FFFFFF`, Mint `#65E6C0`, Cyan
  `#64DDF0`, Muted `#8492A6`, Border `#E4E8EE`. Semua warna komponen memakai
  `var(--token)`; token tidak pernah self-ref.
- **Mode:** terang (default) + gelap (`data-theme` di `<html>`, pilihan
  tersimpan di `localStorage`, skrip anti-kedip di `<head>`). Muted di mode
  terang memakai turunan lebih gelap (`#5B6B80`) demi kontras baca; token
  `#8492A6` dipakai utuh di mode gelap.
- **Tipografi:** Source Serif 4 (judul editorial) + Inter (sans modern),
  via `next/font/google` (terverifikasi dapat dijangkau dari VM).
- **Shell:** header sticky (logo + tagline + search + auth + saklar tema),
  navigasi kategori (scroll horizontal di mobile), footer profesional
  (4 kolom + legal), mobile bottom navigation (5 item, tampil &lt;768px).
- **Responsive:** 320–1920px, tanpa horizontal overflow (`overflow-x: hidden`
  + grid fluid). Skeleton loading, empty state, error state, success state
  tersedia sebagai komponen/pola.

## 5. Audit sumber berita (16 Nov 2026 ±04.54–05.00 WIB)

Metode: `curl` langsung dari VM (UA Chrome 120), validasi XML dengan parser
Python, satu query live GDELT, riset web untuk NewsAPI (tanpa mendaftar).

### 5.1 RSS — 7 feed TERVERIFIKASI bisa dibaca

| Media | URL | HTTP | Item |
|---|---|---|---|
| Antara | `https://www.antaranews.com/rss/terkini.xml` | 200 | 50 |
| CNN Indonesia | `https://www.cnnindonesia.com/rss` | 200 | 100 |
| Liputan6 | `https://feed.liputan6.com/rss/berita` (subdomain `feed`, bukan `www`) | 200 | 50 |
| CNBC Indonesia | `https://www.cnbcindonesia.com/rss` | 200 | 100 |
| Tribunnews | `https://www.tribunnews.com/rss` | 200 | 20 |
| Republika | `https://www.republika.co.id/rss` | 200 | 15 |
| BBC Indonesia | `https://feeds.bbci.co.uk/indonesia/rss.xml` (redirect dari `bbc.com/indonesia/index.xml`) | 200 | 21 (update lebih lambat, ~1 hari) |

### 5.2 RSS — GAGAL / tidak bisa dipakai (jangan diandalkan Fase 3)

| Media | Hasil |
|---|---|
| Kompas | 404 di semua varian (`/rss/`, `/rss/nasional`, `/rss.xml`, `rss.kompas.com` bukan feed) — RSS tampaknya dimatikan |
| Detik | 404 di `www.detik.com/rss/`; `rss.detik.com` HTTP 000 (koneksi gagal total dari VM) |
| Tempo | 403 di semua varian & semua User-Agent (blokir Cloudflare) — feed mungkin ada, tapi tak bisa diambil dari server ini |
| VOA Indonesia | `/api/rss` HTTP 200 tapi isi `Invalid url`; daftar feed hanya di halaman JS-rendered — belum terverifikasi |

### 5.3 GDELT DOC API (gratis, tanpa key) — BERHASIL

- Query uji: `query=Indonesia&mode=artlist&maxrecords=5&format=json` →
  **HTTP 200, JSON valid, 5/5 artikel kembali** (contoh: Liputan6, JPNN).
- Catatan: respons lambat **±20,6 detik**; hasil query generik didominasi
  olahraga → perlu query per topik + filter domain. Dipakai sebagai lapis
  penemuan/cadangan, bukan feed utama; jangan dipanggil sinkron per halaman.

### 5.4 NewsAPI — JANGAN dipakai untuk produksi

- Free tier ("Developer"): **100 request/hari**, artikel **tertunda 24 jam**,
  **dilarang untuk staging/produksi/komersial** (FAQ resmi), CORS hanya
  localhost, tanpa full text. Tidak butuh kartu kredit, tapi tidak memenuhi
  syarat produksi. Opsi berbayar Business ±$449/bulan — di luar anggaran
  (full gratis). Kandidat gratis lain (Currents API, NewsData.io) **belum
  diuji** — perlu audit terpisah sebelum dipakai.

### 5.5 Prioritas ingestion (Fase 3)

1. **Tier 1:** Antara, CNN Indonesia, Liputan6 (segar, volume besar).
2. **Tier 2:** CNBC Indonesia, Tribunnews, Republika, BBC Indonesia.
3. **Cadangan:** GDELT (timeout ±30 detik, query per topik).
4. **Ditunda:** Kompas, Detik, Tempo (coba lagi hanya dari IP/browser lain),
   VOA (URL feed belum ditemukan), NewsAPI (dilarang produksi).

## 6. AI Editorial — status jujur (Fase 1)

- **BELUM ADA agen AI yang berjalan.** Kesepuluh agen di brief bagian G
  (Research, Source Analysis, Fact Verification, Summarization, Article
  Writing, Translation, Trend Analysis, Daily Brief, Data Analysis,
  Editorial Quality) **BELUM TERSEDIA** di Fase 1 — tidak dibuat tombol atau
  label yang pura-pura menjalankannya.
- **Pola yang akan dipakai (Fase 4):** orkestrasi lewat Muse — cron/scheduled
  job Muse (seperti Mesin Soal PRATA: validator + generator + deploy +
  verifikasi) yang membaca RSS/GDELT, menulis draft ke database, dan
  menunggu persetujuan editor. Tanpa GPT/Gemini/DeepSeek, tanpa kunci API
  eksternal.
- **Sampai Fase 4:** seluruh artikel ditulis manual oleh editor/writer lewat
  dashboard (Fase 5) dari sumber terverifikasi; status verifikasi diisi
  manusia, bukan AI.

## 7. Halaman Fase 1 — status

| Halaman | Status |
|---|---|
| Beranda `/` | **Fase 2** — Berita Utama/Terbaru, Indonesia, Dunia dari `pf_articles` nyata; Populer hanya tampil bila ada data baca nyata; Rekomendasi = bookmark pengguna bila login |
| Kategori `/kategori`, `/kategori/[slug]` | **Fase 2** — daftar artikel kategori (maks 12) via `getArtikelPerKategori`; empty state jujur bila kosong |
| Arsip `/arsip` | **Fase 2** — filter kategori/status/kata kunci + tanggal (dari–sampai) + sumber; hasil memakai `KartuArtikel` |
| Pencarian `/cari` | **Fase 2** — seksi hasil "Artikel" dari `cariArtikel` + catatan jujur bila tabel belum ada; kategori + sumber dipertahankan |
| Artikel `/artikel/[slug]` | **Fase 2** — halaman lengkap: 3 mode baca, bookmark, riwayat baca, progress, laporan kesalahan, kronologi, data pendukung, riwayat versi |
| Daily Brief `/brief` | Selesai — penjelasan + empty state jujur (edisi pertama terbit Fase 4) |
| Masuk `/masuk`, Daftar `/daftar`, Profil `/profil` | Selesai — Supabase Auth nyata; profil: ubah kata sandi via email, keluar |
| Kebijakan `/kebijakan/redaksi`, `/koreksi`, `/privasi`, `/syarat` | Selesai — isi nyata sesuai brief bagian P |
| Admin dashboard | **Fase 5** — belum dibangun |
| Peta dunia, timeline, data interaktif, kuis, Tanya Berita AI | **Fase 2/6** — belum dibangun |

### Catatan Fase 2 (16 Nov 2026)

- Lapisan data (`src/lib/data.ts`): `PfArtikelLengkap` + `getArtikelLengkap`,
  `getArtikelTerkait`, `getArtikelTerbaru`, `getArtikelPerKategori`,
  `getArtikelPopuler` (hanya hitungan baris `pf_reading_history` nyata),
  `cariArtikel` (mengembalikan `{artikel, tersedia}`), `getBookmarkPengguna`,
  `isBookmarked`, `getVersiArtikel`; `FilterArsip` diperluas dengan
  `dari`/`sampai`/`sumber`. Semua fungsi gagal-aman (catch → `[]`/`null`/
  `tersedia=false`).
- API: `POST /api/bookmark` (toggle, 401 bila belum login, 503 bila tabel
  belum ada), `POST /api/laporan` (boleh anonim, rate limit 5/menit/IP),
  `POST /api/riwayat` (sekali per artikel per 24 jam). Semua mengikuti pola
  rate limit + error jujur `api/langganan`.
- CSS: `.artikel-*`, `.progress-baca`, `.placeholder-gambar`,
  varian `.lencana` untuk keenam status verifikasi, `.mode-baca`,
  `.dialog-laporan`, `.tabel-data`, `.arsip-filter-tanggal`.
- **Blokir:** tabel v2 (`pf_articles` dkk.) belum ada di Supabase produksi
  (migrasi ditulis agen lain, belum dijalankan) — halaman Fase 2 menampilkan
  empty state jujur dan API mengembalikan 503 jujur sampai migrasi
  dijalankan. Artikel populer & rekomendasi belum pernah berisi data nyata.

## 8. Batasan & blokir Fase 1 (jujur)

1. **Migrasi DB belum dijalankan** — butuh pemilik menjalankan SQL di
   Dashboard (service_role key & DATABASE_URL tidak tersedia di VM). Akibat:
   `pf_*` belum ada; halaman yang membaca DB memakai fallback taksonomi
   statis / empty state; newsletter mengembalikan 503 jujur sampai tabel ada.
2. **Auth belum diuji terhadap akun nyata** sampai migrasi + build lolos
   (rencana uji: daftar akun tes, masuk, keluar, reset kata sandi).
3. **Belum di-deploy ke Vercel** (menunggu build lolos + keputusan pemilik).
4. **Agen AI belum ada** (lihat §6).
5. **Tempo/VOA/Kompas/Detik tidak bisa di-ingest** dari VM ini (lihat §5.2).

## 9. Rencana Fase 2 (News Platform)

Skema `pf_articles` (+`pf_article_versions`, `pf_tags`, `pf_article_sources`,
`pf_claims`, `pf_evidence`, `pf_verification_records`), halaman artikel
lengkap (3 mode baca, bookmark, riwayat, progress), pencarian isi artikel,
dan penulisan artikel manual oleh editor. Prasyarat: migrasi Fase 1 sudah
dijalankan dan terverifikasi.

**Status 16 Nov 2026:** sisi aplikasi Fase 2 selesai (lihat catatan §7);
skema v2 sedang ditulis agen migrasi dan belum dijalankan di produksi.
Penulisan artikel manual oleh editor masih menunggu dashboard admin
(Fase 5).

## 10. Fase 3 — News Engine (16 Nov 2026, selesai di kode, terverifikasi lokal)

### 10.1 Yang dibangun

- **Migrasi v3** (`supabase/migrations/20261116_pf_v3_ingestion.sql`):
  `pf_ingestion_runs` (per sumber, per run: ditemukan/baru/duplikat/ditolak/
  gagal, status, pemicu) + `pf_raw_items` (HANYA metadata + ringkasan
  sumber + URL — tanpa isi penuh artikel media lain; `hash_url` UNIQUE
  sebagai kunci dedup, `hash_judul`, `disalin_dari_id`, flag
  `diterbitkan_ulang`, `status_verifikasi` default `UNCONFIRMED`) +
  kolom `pf_sources.terakhir_diambil`/`jumlah_item` +
  `pf_articles.raw_item_id` (jejak provenance artikel ← item mentah).
  RLS aktif; baca hanya staf, tulis hanya service role (tanpa policy
  tulis untuk user terautentikasi), tanpa akses publik.
- **Engine ingestion** (`src/lib/ingestion/`): `rss.ts` (fetch + parser XML
  toleran tanpa library — RSS 2.0 & Atom, per-item try/catch),
  `dedup.ts` (normalisasi URL/judul + sha256), `gdelt.ts` (DOC API
  mode=artlist, per topik), `engine.ts` (`jalankanIngestion` — fetch
  paralel, 1 run per sumber, aturan dedup §10.3), `supabase-adapter.ts`
  (service role; error jelas bila `SUPABASE_SERVICE_ROLE_KEY` belum
  diatur). Tanpa auto-publish, tanpa auto-VERIFIED: semua item baru
  masuk sebagai `UNCONFIRMED`.
- **API** (`src/app/api/`): `GET/POST /api/sumber`, `PATCH/DELETE
  /api/sumber/[id]`, `POST /api/sumber/[id]/cek` (fetch nyata + ukur
  ms + update `terakhir_cek`/`status_terakhir`), `POST
  /api/ingestion/jalankan` (auth ganda: header `x-pf-ingestion-secret`
  atau sesi super_admin/editor), `GET /api/ingestion/antrean`
  (hitungan count nyata per status + 5 run terakhir). Semua mengikuti
  pola `langganan`: rate limit in-memory, error 503 jujur bila tabel/
  secret belum ada, pesan Bahasa Indonesia.
- **Scheduler**: `.github/workflows/ingestion.yml` (cron `*/30 * * * *`
  + `workflow_dispatch` dengan input `sumber_id` opsional; curl
  `--fail-with-body` ke `/api/ingestion/jalankan`).
- **Uji**: `scripts/uji-ingestion.mjs` (PGlite + 7 feed nyata + uji
  sintetis dedup + GDELT 1×). Skrip cek migrasi: `/tmp/pf-sqlcheck/cek-v3.mjs`.

### 10.2 Keputusan scheduler (berdasarkan bukti)

| Opsi | Penilaian | Keputusan |
|---|---|---|
| (a) GitHub Actions cron (30 menit) | **TERBUKTI jalan** di repo ini (CI APK PRATA Remote: run sukses, pola curl + secret sudah dipakai). Gratis, independen dari VM Muse, jadwal 30 menit didukung. | **DIPILIH (utama)** |
| (b) Vercel Cron | Paket Hobby Vercel hanya mengizinkan cron **1×/hari** (butuh 30 menit); deploy Vercel proyek ini juga masih blokir 403 akses tim `prataava` (lihat §3). | **DITOLAK** |
| (c) Cron Muse → endpoint | Pola ini berjalan untuk Mesin Soal PRATA (cron 02.00 WIB). Bergantung pada runtime VM; dipakai bila (a) belum aktif. | **CADANGAN** |

**Secret yang dibutuhkan (nama saja, tanpa nilai):** `PF_INGESTION_SECRET`
(samakan di GitHub secret + env Vercel + `.env.example`),
`SUPABASE_SERVICE_ROLE_KEY` (hanya server, dari Supabase Dashboard →
Settings → API), GitHub secret `PF_SITE_URL` (URL deploy tanpa trailing
slash). Scheduler **TIDAK aktif** sampai ada deploy + kedua secret
terisi — workflow saat ini hanya konfigurasi.

### 10.3 Aturan dedup (yang diimplementasikan)

1. `hash_url` sudah ada → `duplikat`, tidak disimpan.
2. `hash_judul` sama dari penerbit **berbeda** → disimpan sebagai
   `disalin_dari` + `disalin_dari_id` menunjuk item tertua. Banyak media
   menyalin berita yang sama TIDAK pernah dihitung sebagai banyak sumber
   independen.
3. `hash_judul` sama dari sumber **sama** + selisih tanggal terbit
   > 48 jam (atau selisih tanggal ambil > 7 hari bila tanggal tak ada)
   → disimpan sebagai `duplikat` + `diterbitkan_ulang = true`.
4. Judul sama, sumber sama, tanggal dekat → `duplikat`, tidak disimpan.
5. Tanpa URL/judul valid, URL bukan http(s), judul < 5 karakter →
   `ditolak`, tidak disimpan.

### 10.4 Hasil verifikasi (16 Nov 2026, dry-run lokal ke PGlite, feed nyata)

- **Migrasi** (`node /tmp/pf-sqlcheck/cek-v3.mjs`, exit 0): v1→v2→v3→v3
  lagi idempoten; **18 tabel pf_\***, **RLS 18/18**, **53 policy**
  (51 + 2 baru); insert 6/6 berhasil; uji negatif 6/6 ditolak.
- **Ingestion** (`node scripts/uji-ingestion.mjs`, fetch langsung dari VM):
  Run 1 — **356 ditemukan / 353 baru / 3 duplikat / 0 ditolak /
  0 gagal** (Antara 50/50, CNN 100/99, Liputan6 50/49, CNBC 100/100,
  Tribunnews 20/20, Republika 15/14, BBC 21/21). Run 2 — **baru = 0 di
  semua feed** (dedup terbukti). Ketiga "duplikat" run 1 adalah
  `disalin_dari` antar-penerbit (CNN, Liputan6, Republika masing-masing
  1). Uji sintetis: `disalin_dari` (id menunjuk item asli) dan
  `diterbitkan_ulang` (flag true) keduanya lolos.
- **Build/lint**: `npm run build` EXIT 0 (34/34 halaman; route Fase 3
  terdaftar), `npm run lint` EXIT 0 (0 warning setelah pembersihan),
  `npx tsc --noEmit` EXIT 0.
- **GDELT GAGAL di VM ini**: 1 panggilan topik "Indonesia" → **HTTP
  429** (±10,6 detik), sesuai hard-stop 429 tidak di-retry. Penyebab
  paling mungkin: IP egress VM bersama sudah kena batas GDELT. Perlu
  diuji ulang dari GitHub Actions (IP berbeda) sesudah deploy.

### 10.5 Blokir & catatan Fase 3 (jujur)

1. **Migrasi v1+v2+v3 BELUM dijalankan di Supabase produksi** — butuh
   pemilik lewat SQL Editor (lihat `supabase/README.md`). Sampai
   dijalankan, API Fase 3 mengembalikan 503/`tersedia:false` yang
   jujur dan ingestion produksi tidak bisa jalan.
2. **Belum di-deploy ke Vercel** (blokir 403 tim, lihat §3) → endpoint
   ingestion + workflow GitHub Actions belum bisa aktif.
3. **GDELT 429 dari VM** (lihat §10.4) — cadangan GDELT belum
   terbukti end-to-end; perlu uji dari runner GitHub Actions.
4. **Topik GDELT di engine hardcoded "Indonesia"** — `topik_gdelt`
   dari body API saat ini hanya dipakai untuk pemeriksaan sekali jalan
   di route, bukan untuk mengubah topik ingestion engine. Perlu opsi
   injeksi topik bila Fase 4 butuh topik dinamis.
5. **`tsconfig.json` +1 baris** (`allowImportingTsExtensions: true`) —
   dibutuhkan agar Node 24 bisa mengimpor engine `.ts` langsung dari
   skrip dry-run (impor `./rss.js` TIDAK dipetakan ke `rss.ts` oleh
   type-stripping); build/lint/tsc tetap bersih.
6. **Catatan kecil skrip uji**: `status_terakhir` Antara sesudah dry-run
   tertulis "ok HTTP 200, 1 item" karena uji sintetis terakhir memakai
   sumber Antara — kosmetik, hanya di PGlite uji, bukan produksi.

### 10.6 Kesiapan Fase 4 (AI Editorial)

Fondasi tersedia: antrean `pf_raw_items` berstatus `UNCONFIRMED` siap
dibaca agen Muse (Research → Summarization → Article Writing →
Editorial Quality) lewat cron/scheduled job + `pf_articles.raw_item_id`
sebagai jejak provenance. Yang masih dibutuhkan sebelum Fase 4: migrasi
dijalankan di produksi + deploy + secret terisi (lihat §10.5 butir 1–2).
Daily Brief tetap Fase 4 — tidak dibangun di Fase 3.
