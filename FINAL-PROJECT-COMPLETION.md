# FINAL PROJECT COMPLETION — PRATA FAKTA

**Proyek:** PRATA FAKTA — platform berita dan pengetahuan digital
("Pahami dunia. Berdasarkan fakta.")
**Repo:** `github.com/prataava/prata-fakta` · **Stack:** Next.js 16.4.6
(App Router) + TypeScript + Supabase (proyek `prata`,
`wyheuxjpusavuiqpymik`) + GitHub Actions
**Tanggal selesai di kode:** 16 November 2026
**Status akhir: SELESAI DI KODE, TERVERIFIKASI LOKAL — BELUM LIVE.**
Semua angka di dokumen ini berasal dari pengujian nyata
(nama script, perintah, exit code, jumlah test, hasil, commit
yang diuji). Pemisahan tegas dipakai di seluruh dokumen:
**Terverifikasi lokal** / **Terverifikasi staging** / **Terverifikasi
production** / **Belum diuji** / **Terblokir**.

---

## 1. Ringkasan proyek

PRATA FAKTA dibangun dalam 7 fase + Fase 8 (14 area "Advanced
Intelligence") + Tahap 13–17 (keamanan, scheduler, integrasi,
regression, readiness, cutover) selama 16 November 2026 —
satu hari kerja penuh, dari repo kosong sampai aplikasi lengkap
yang terverifikasi lokal. Aplikasi: berita terkini Indonesia
dan dunia dengan sumber jelas, pemeriksaan fakta, data,
kronologi, pengetahuan, kuis, akademi, podcast, riset, profil
negara, arsip sejarah, dan pusat kendali admin.

Aturan keras yang dijaga sepanjang proyek: **AI hanya via Muse**
(tanpa GPT/Gemini/DeepSeek); **tanpa data dummy/statistik palsu**
(empty state jujur); hak cipta (ringkasan orisinal + atribusi +
URL sumber); semua tombol wajib berfungsi; secret tidak pernah
di frontend/repo; **publikasi otomatis TETAP MATI** (draf
VERIFIED wajib review manusia sebelum terbit).

Hasil akhir: **77 halaman + 80 rute API**; migrasi v1–v12
(**54 tabel / RLS 54/54 / 106 policy**); build EXIT 0
(147/147 halaman); regression **1.365/1.365 asersi** (19 baterai);
smoke `next start` 12× 200 + 8× 404, log 0 error. Situs BELUM
LIVE karena migrasi v1–v12 belum dijalankan di produksi dan
deploy Vercel masih blokir 403 (butuh pemilik, §27).

## 2. Status seluruh 14 area

| # | Area | Status | Bukti |
|---|---|---|---|
| 1 | Jejak Fakta | **Selesai** | LAPORAN-FASE-8 §12.9/§14; baterai gel1 159/159 |
| 2 | Story Tracker | **Selesai** | Baterai cerita 66/66 |
| 3 | Multi-Source View | **Selesai** | Baterai multisource 71/71; hitung independen dari akar rantai `disalin_dari` via RPC `pf_akar_salinan` |
| 4 | Explain the World | **Selesai** | Baterai akademi 106/106 (bersama Academy) |
| 5 | Reality Check | **Selesai** | Baterai riset 71/71 (bersama Research) |
| 6 | Ask the World | **Selesai** | Baterai tanya-podcast 72/72 (bersama Podcast) |
| 7 | My Prata | **Selesai** | `/saya` + API `/api/saya/*`; batas: hapus akun mandiri (F5) belum ada |
| 8 | PRATA Academy | **Selesai** | Baterai akademi 106/106; batas: sertifikat belum dibangun |
| 9 | PRATA Podcast | **Selesai sebagian** | Baterai 72/72; **BELUM BISA: file audio MP3 server + RSS enclosure** (tanpa TTS server gratis) |
| 10 | PRATA Research | **Selesai** | Baterai riset 71/71 |
| 11 | Country Profile | **Selesai** | Baterai negara 77/77 |
| 12 | Historical Archive | **Selesai** | Baterai cerita 66/66 (bersama Story Tracker) |
| 13 | Public Report | **Selesai** | Baterai editorial 28/28; F1 ditinjau tersambung, F2 terima tanpa `artikel_id`, F3 adapter lengkap |
| 14 | Advanced Admin Control Center | **Selesai sebagian** | Baterai admin 83/83; **BELUM BISA: Traffic Analytics** (belum tersedia, tanpa angka palsu) |

**12 area berfungsi penuh, 2 berfungsi sebagian dengan batas
jujur.** Semua 14 area terverifikasi lokal; tidak satu pun
terverifikasi production (situs belum live).

## 3. Fitur selesai

- Platform berita: artikel 3 mode baca, bookmark, riwayat baca,
  progress, laporan kesalahan, pencarian isi, arsip (tanggal +
  sumber), kategori, Daily Brief.
- Ingestion RSS (7 feed nyata) + GDELT + dedup `hash_url`/judul
  (355 baru / 1 duplikat pada run Tahap 15).
- AI editorial deterministik: research, source-analysis tier
  90/75/60, verifikasi dua sinyal + koroborasi klaim,
  summarization ekstraktif, writing draf orisinal, quality 8 cek,
  trends, brief, pipeline dua fase (dry-run nyata 200 item:
  7 draf, 7 VERIFIED, 193 UNCONFIRMED, 0 gagal).
- Sistem editorial admin: gate terbit (tolak UNCONFIRMED/DISPUTED
  409 + alasan), jadwalkan + terbitkan-terjadwal, koreksi →
  CORRECTED + versi baru + lencana "Dikoreksi pada …", audit log
  53 aksi.
- Fitur lanjutan: peta Leaflet+OSM, pengetahuan, kuis harian
  (skor tersimpan, login saja), data/indikator + grafik SVG,
  timeline, tanya AI (retrieval ekstraktif + antrean menunggu),
  feed personal, notifikasi, TTS SpeechSynthesis, rutin 6 sub.
- 14 area Fase 8 (§2) + integrasi antiarea (artikel ↔ cerita ↔
  negara + bar konteks, §14.6 LAPORAN-FASE-8).
- Keamanan Tahap 13: rate limit DB (v11), audit fail-closed
  (T10), akun nonaktif konsisten (T4), SSRF pinning + re-resolusi
  (T6, dipersempit), CSP nonce + hash skrip tema.
- Scheduler Tahap 13C: 3 workflow terpisah, concurrency group,
  lock server-side, assert `jq`, retry, `terakhir_jalan` tiap run,
  seed 5 job, backoff gate 6 jam, flag ditegakkan.
- SEO, performa (lazy Leaflet/TTS/form, cache 900 dtk),
  `/api/health`, backup 54 tabel, monitoring admin.

## 4. Fitur belum selesai

| Fitur | Status | Alasan |
|---|---|---|
| File audio MP3 server + RSS enclosure Podcast | **BELUM BISA** | Tanpa layanan TTS server gratis; pemutar memakai TTS browser |
| Traffic Analytics (Admin) | **BELUM BISA** | Tanpa analitik terkonfigurasi; menampilkan "belum tersedia" |
| Sertifikat Academy | **BELUM BISA** | Sistem penilaian belum mendukung |
| Hapus akun mandiri (My Prata F5) | **Belum selesai** | Belum dibangun; hapus via admin |
| Notifikasi push/email | **Belum selesai** | Butuh layanan + secret baru + keputusan pemilik |
| Penjawab otomatis `/tanya` | **Belum selesai** | Pertanyaan menunggu di antrean; dijawab manusia/AI via chat |
| Machine translation | **Belum selesai** | Translation heuristik saja |
| Arsip Q&A publik (policy anon) | **Belum selesai** | `pf_questions` anon SELECT = 0 baris di RLS; dibaca via service role (utang policy) |
| Isian singkat / PG kompleks (kuis) | **Belum selesai** | Kuis mendukung PG satu jawaban; bentuk resmi lain belum |
| Lab 3D, Eligibility Checker, Split View (PRATA X, bukan PRATA FAKTA) | **Ditunda** | Di luar lingkup proyek ini |

## 5. Database + migrasi

- **Migrasi v1–v12**, semua idempoten, tanpa blanket grant:
  v1 foundation (8 tabel), v2 platform berita, v3 ingestion,
  v4 AI editorial, v5 admin + audit, v6 fitur lanjutan,
  v7 skor kuis, v8 Jejak Fakta/Multi-Source/Public Report/My
  Prata, v9 GRANT eksplisit (41 GRANT/37 tabel — memperbaiki F4
  TINGGI: default Supabase berubah 30 Okt 2026), v10 Gelombang 2
  (16 tabel baru + 14 kolom, GRANT sejak awal), v11 rate limit +
  audit 53 aksi, v12 CHECK 5 job + seed 5 job.
- **Keadaan akhir: 54 tabel / RLS 54/54 / 106 policy.**
  Verifikasi: `node scripts/uji-tahap13-migrasi.mjs` **15/15
  LOLOS, EXIT 0** (v1–v12 dua kali berturut-turut di PGlite);
  `node scripts/uji-fase8-gel2-migrasi.mjs` **28/28**.
- **BELUM PERNAH diterapkan di produksi** — blokir #1 (§27).
  Validasi pasca-migrasi: 54/54/106 + seed 5 job
  (`supabase/CUTOVER.md` §3, tahap 3A–3F).
- RLS: semua tabel ber-RLS; policy per tabel diverifikasi di
  PGlite. Celah RLS tautan draf ditutup di lapisan aplikasi
  (Story Tracker). Utang: policy arsip publik `pf_questions`.

## 6. API + backend

- **80 rute API** (`src/app/api/**`): ingestion, AI (status/
  antrean/jalankan/brief), admin (21 route + admin area baru),
  publik (bookmark/laporan/riwayat/kuis/sumber/cerita/negara/
  tanya/podcast/akademi/riset), kesehatan, cron.
- Auth ganda di route AI (secret + sesi); 503 jujur bila
  layanan belum tersedia; 409 jujur (lock dipegang / gate
  ditolak + alasan); 400 jujur (job tidak dikenal / tanpa
  profil negara); 401 tanpa auth; redirect 307 tanpa login.
- Rate limit: limiter DB (RPC atomik, v11) di route auth;
  fail-open bila RPC gagal (tercatat di log, terverifikasi
  smoke Tahap 15). Vote tanya masih Map in-memory.
- Server-side fetch: `fetchAman`/`fetchTerpin` (SSRF pinning +
  re-resolusi + allowlist 8 host); GDELT sebelumnya `fetch`
  mentah — ditutup Tahap 13B.
- JSON-LD di artikel/pengetahuan bawa nonce (halaman dinamis
  `instant = false`).

## 7. Muse AI integrations

- **Satu-satunya AI: Muse.** Mekanisme nyata = scheduler Muse
  (GitHub Actions cron) + pengerjaan lewat chat + ekspor/impor
  hasil. Tanpa GPT/Gemini/DeepSeek/Pollinations di frontend
  maupun backend.
- Pipeline editorial (Fase 4): 13 berkas `src/lib/ai` (research,
  source-analysis, verification, summarization, writing,
  translation heuristik, quality, trends, brief, pipeline dua
  fase). Dry-run NYATA 200 item: 7 draf, 7 VERIFIED, 193
  UNCONFIRMED, 0 gagal; klaim 715, evidence 723.
- **Kejujuran verifikasi:** penilaian 7 draf bertumpu pada angka
  latar (triase deterministik, bukan penilaian isi); draf WAJIB
  review Muse/editor sebelum terbit; translation parsial.
- Data Analysis agen ke-10 (deterministik) + workflow mingguan.
- Penjawab otomatis `/tanya` belum ada — antrean menunggu
  dijawab manusia.
- Secret AI: `PF_AI_SECRET` (perbandingan timing-safe) + secret
  ingestion `PF_INGESTION_SECRET` — nama saja, nilai tidak
  pernah lewat chat.

## 8. News discovery

- Ingestion RSS 7 feed nyata (Antara, BBC Indonesia,
  Tribunnews, dll.) + GDELT (topik jadi parameter sejak
  Country Profile). Dedup `hash_url` UNIQUE + judul.
- Run Tahap 15: **355 baru / 1 duplikat / 0 gagal RSS**;
  GDELT HTTP 429 (eksternal, pola flake sejak Fase 3 — 1×
  pada run ini, 2× gagal + 1× lolos pada run Gelombang 2).
- `pf_raw_items` hanya metadata + ringkasan (tanpa isi penuh
  media lain); `disalin_dari` + `diterbitkan_ulang` untuk
  rantai salinan; RPC `pf_akar_salinan` menghitung akar rantai.
- Multi-Source View: tampilan menghitung independen dari akar
  rantai (X=1, Y=3 untuk salinan 3×) — mesin benar sejak
  remediasi Gelombang 1 (baterai 71/71).
- Scheduler ingestion: tiap 30 menit (`*/30 * * * *`),
  workflow `ingestion.yml` (concurrency + retry + assert jq).

## 9. Verification engine

- Verifikasi dua sinyal + koroborasi klaim (Fase 4); label
  akhir: Terverifikasi / Cek Silang / Berkembang / Belum
  Terkonfirmasi / Disengketakan / Dikoreksi
  (`src/lib/verifikasi.ts`).
- Gate terbit: tolak UNCONFIRMED/DISPUTED tanpa verifikasi
  (409 + alasan); hanya VERIFIED yang bisa terbit.
- 7 draf VERIFIED dry-run **TIDAK layak terbit tanpa review**
  (isi + sumber) — keputusan gate, bukan klaim.
- Koreksi → CORRECTED + versi baru + tanggal koreksi tampil.
- Jejak Fakta: cek `status='terbit'` eksplisit; provenance
  `raw_item` belum tampil (F-A1-2, sisa jujur).
- Parafrase hanya dari judul akar (sisa jujur — bukan dari isi
  penuh).
- Baterai: editorial 28/28, gel1 159/159, multisource 71/71.

## 10. Security audit

Audit penuh Tahap 13B + status tegas sesudah Tahap 13
(detail: `LAPORAN-FASE-8.md` §14.5; `AUDIT-EXPANSION.md` §9.8):

| Temuan | Status | Bukti |
|---|---|---|
| T3 rate limit | **TERTUTUP di kode; TERBUKA di produksi sampai v11 diterapkan** | RPC + limiter DB; `uji-tahap13a.mjs` 126/126; fail-open terverifikasi di smoke (log `PGRST202`) |
| T10 audit CRUD sumber | **TERTUTUP di kode** | `catatAuditWajib` fail-closed; 13A 126/126 |
| T4 akun nonaktif | **TERTUTUP di kode** | 13 berkas / 20 handler |
| T6 DNS rebinding | **DIPERSEMPIT, TIDAK tertutup penuh** | Pinning + re-resolusi; 13B 107/107; penutupan penuh butuh verifikasi dari egress langsung — **belum diuji** |
| CSP | **TERIMPLEMENTASI, terverifikasi live lokal** | Nonce unik/request + hash tema; smoke Tahap 15 |
| T5 (isolasi data) / T8 (secret) / T1 | **TERTUTUP, regression lolos** | Fase7 87/87, gel1 159/159 |
| CSRF | **SEBAGIAN** | Tanpa cek Origin, bersandar SameSite Lax — **belum diuji live** |
| Flag cookie sesi | **BELUM DIUJI** | Belum ada pemeriksaan flag cookie sesi di browser |
| SQL injection | **Aman** | Supabase JS parameterized + RPC; audit grep sumber |
| XSS | **Aman** | CSP + React escaping; `escHtml` untuk konten dinamis |
| Prompt injection | **Aman** | AI hanya via Muse; tanpa input pengguna ke prompt mentah |
| Secret handling | **Aman** | Sapuan secret 0 temuan (13B §H); secret hanya env/server |
| File upload | **Tidak ada upload file pengguna** | Bukti bayar/foto bukan bagian proyek ini |
| Data isolation | **Aman** | RLS 54/54 + trigger anti-eskalasi role; uji isolasi Fase 1 |
| Admin permission | **Aman** | Cek role server-side di 21+ route admin |
| API abuse | **Sebagian** | Rate limit di route auth; GET publik tanpa limiter (disengaja) |

**TIDAK SATU PUN temuan dinyatakan tertutup tanpa bukti.**
Yang terbuka/belum diuji dicatat di §22.

## 11. Scheduler

- **5 job** (`pf_scheduled_jobs`, seed v12): ingestion
  (`*/30 * * * *`), editorial (`0 0,6,12,18 * * *`), brief
  (`0 22 * * *` = 05.00 WIB), data-analysis (`0 1 * * 1`),
  terbitkan-terjadwal (`0 * * * *`). Semua cron WIB benar.
- **5 workflow** GitHub Actions (YAML 5/5 valid): ingestion,
  editorial-pipeline, daily-brief, terbitkan-terjadwal,
  data-analysis. `editorial.yml` lama DIHAPUS (dipecah).
- Temuan F2/F3/F4/F5/F6/F7/F8/F12 **TERTUTUP di kode**:
  dispatch "keduanya" via 2 workflow terpisah (F2); concurrency
  group per workflow + lock server-side (409 bila dipegang, F3);
  tanpa gating string (F4); assert `jq` isi respons — HTTP 200
  bukan keberhasilan penuh bila `gagal > 0` (F5);
  `terakhir_jalan` diperbarui tiap run berhasil/gagal (F6);
  seed 5 job + `NamaJob` 3→5 (F7); retry 2× + delay 10 dtk (F8);
  backoff gate 6 jam via penanda audit (F12).
- Idempotency: dedup ingestion, pipeline hanya UNCONFIRMED,
  brief upsert per tanggal, terbitkan hanya `terjadwal` + lewat
  waktu + gate (maks 100/jam).
- **Publikasi otomatis TETAP MATI.** Alerting: log run Actions
  + `pf_scheduled_jobs` (status + error terakhir) +
  `/admin/kendali` + `/admin/monitoring`. Notifikasi
  push/email/Slack/WhatsApp **belum ada**; dead-man switch
  **belum ada**.
- Verifikasi: `uji-tahap13c.mjs` **119/119 LOLOS, EXIT 0**;
  YAML 5/5; jq sim 6/6. **Run live Actions: 0 run — belum diuji.**

## 12. Admin

- **Advanced Admin Control Center** (area #14): nav admin 19
  tautan; `/admin` overview angka nyata; 13 halaman admin
  (`/admin/artikel`, `/review`, `/fakta`, `/koreksi`,
  `/pengguna`, `/sistem`, `/audit`, `/brief`, `/sumber`,
  `/kendali`, `/data`, `/event`, `/negara`, `/pengetahuan`,
  `/cerita`, `/tanya`, `/podcast`, `/riset`, `/analitik`,
  `/monitoring`, `/kinerja`, `/api-sehat`, `/agen-ai`,
  `/akademi`, `/verifikasi`, `/klaster`, `/duplikat`,
  `/kualitas`, `/laporan-pengguna`).
- `/admin/kendali`: feature flags (4 flag + pengumuman),
  pemicu manual 5 job, ekspor audit CSV.
- Peran: pembaca/penulis/fact_checker/editor/admin/super_admin;
  cek role server-side; super_admin pertama via SQL Editor.
- **Traffic Analytics: BELUM BISA** (menampilkan "belum
  tersedia", tanpa angka palsu).
- Baterai admin: **83/83 LOLOS**.

## 13. UX

- Desain: terang + gelap (tema tersimpan `localStorage`,
  diterapkan sebelum CSS dilukis — anti-kedip; skrip tema
  diizinkan CSP lewat hash sha256).
- Navigasi: Header (Beranda, kategori, Arsip, Daily Brief,
  Peta, Data, Riset, Timeline, Cerita, Sejarah, Pengetahuan,
  Akademi, Negara, Kuis, Tanya, Podcast, Rutin, Feed Saya,
  Saya) + Footer + BottomNav (mobile).
- Integrasi Tahap 14: 48 tautan internal statis hidup; nav
  menautkan 12 area; bar konteks artikel ("Bagian dari cerita"
  + "Negara").
- Empty state jujur di semua seksi tanpa data; 503 jujur bila
  layanan belum tersedia; 404 nyata untuk slug tak ada
  (8 rute slug terverifikasi 404 di smoke Tahap 15).
- Mode baca artikel 3 mode; grafik interaktif (hover, rentang,
  YoY); pemutar podcast (TTS + kecepatan + playlist).
- **Yang belum diuji:** klik browser nyata + alur login
  lengkap + uji HP/desktop oleh pengguna (butuh live).

## 14. Responsive audit

- **Status: BELUM DIUJI (visual).** Browser tidak tersedia
  untuk subagen koordinator; tidak ada pemeriksaan visual
  320/360/390/430/768/1024/1440/1920 yang dijalankan.
- Yang terverifikasi: build lolos (tidak ada error prerender
  per halaman); CSS responsif ditulis dengan layout fluid
  (flexbox/grid, unit relatif, media query) mengikuti standar
  proyek; BottomNav untuk mobile; tidak ada `user-scalable=no`
  atau pengunci zoom (mengikuti aturan TASIK yang sama).
- **JANGAN diklaim sudah diuji** — verifikasi visual menunggu
  sesudah live, di HP + desktop nyata (lihat §28).

## 15. SEO

- Sitemap dinamis (`/sitemap.xml`, 32 URL dinamis + statis),
  `robots.txt`, RSS 2.0 (`/rss.xml`), JSON-LD (artikel +
  pengetahuan, bawa nonce CSP), canonical/OG, `metadataBase`
  `https://prata-fakta.vercel.app`, noindex halaman admin.
- Terverifikasi: `next build` 147/147 (sitemap + RSS + robots
  200 di smoke Tahap 15); `uji-fase7.mjs` 87/87 (SEO termasuk).
- **Belum diuji:** indexing nyata di mesin pencari (butuh live
  + Search Console).

## 16. Performance

- Lazy loading: Leaflet, TTS, form (Fase 7); cache 900 dtk
  untuk data statis; `next/font` (Inter + Source Serif 4,
  `display: swap`).
- Build: 147/147 halaman dalam 4,9 dtk (generate); komposisi
  ~14 statis (○) + mayoritas dinamis (ƒ, baca data per request)
  + sub-rute partial-prerender (◐).
- **Biaya CSP yang diperbaiki Tahap 14:** nonce di root layout
  sempat memaksa semua halaman dinamis + mematahkan build
  (EXIT 1); sesudah perbaikan hash, 14 halaman statis kembali
  di-prerender. Dampak TTFB halaman dinamis **belum diukur**
  (butuh live).
- **Belum diuji:** Lighthouse / Core Web Vitals nyata (butuh
  live + browser).

## 17. Backup

- Skrip `scripts/backup-pf.mjs`: backup 54 tabel via
  Supabase REST (butuh `SUPABASE_SERVICE_ROLE_KEY` dari
  pemilik via Secure Vault).
- Diperbarui Tahap 16: 37 → **54 tabel**, diverifikasi cocok
  persis dengan migrasi (54 unik, 0 selisih).
- Prosedur: backup baseline SEBELUM migrasi + backup
  pasca-migrasi 54/54 (`supabase/CUTOVER.md` §3).
- **Backup belum pernah dijalankan terhadap produksi**
  (migrasi belum jalan) — uji restore hanya di staging
  (aturan berdiri proyek).

## 18. Monitoring

- `/api/health`: `{"ok","status","db","latensi_ms","waktu",
  "versi","detail"}` — jujur `degraded` + `db:
  "belum_tersedia"` bila migrasi belum jalan (terverifikasi
  smoke Tahap 15: 200 + `degraded`).
- `/admin/monitoring`, `/admin/sistem` (status scheduler +
  job), `/admin/kinerja`, `/admin/api-sehat`, `/admin/agen-ai`.
- Audit log: 53 aksi, identitas admin + waktu, ekspor CSV.
- Scheduler: `pf_scheduled_jobs` (`status_terakhir` +
  `error_terakhir` + `terakhir_jalan` per job, diperbarui tiap
  run).
- Log server `next start`: **0 baris "error"** (smoke Tahap 15).
- **Belum ada:** notifikasi gagal job (push/email/WhatsApp),
  dead-man switch, dashboard uptime, alerting eksternal.

## 19. Regression tests

Dijalankan Tahap 15, 16 Nov 2026 ±09.00–10.00 WIB (lokal,
PGlite + Node 24; PGlite di `/tmp/pf-sqlcheck` — `/tmp` tidak
persisten, pasang ulang bila hilang: `npm i
@electric-sql/pglite` di `/tmp/pf-sqlcheck`).

| Baterai | Perintah | Hasil |
|---|---|---|
| uji-fase5 | `node scripts/uji-fase5.mjs` | LOLOS (53, catatan gate) |
| uji-fase6 | `node scripts/uji-fase6.mjs` | 53/53, EXIT 0 |
| uji-fase7 | `node scripts/uji-fase7.mjs` | 87/87, EXIT 0 |
| uji-fase8-gel1 | `node scripts/uji-fase8-gel1.mjs` | 159/159, EXIT 0 |
| uji-remediasi-multisource | `node scripts/uji-remediasi-multisource.mjs` | 71/71, EXIT 0 |
| uji-remediasi-integrasi | `node scripts/uji-remediasi-integrasi.mjs` | 17/17, EXIT 0 |
| uji-editorial | `node scripts/uji-editorial.mjs` | LOLOS (28, catatan remediasi) |
| uji-fase8-gel2-migrasi | `node scripts/uji-fase8-gel2-migrasi.mjs` | 28/28, EXIT 0 |
| uji-fase8-gel2-cerita | `node scripts/uji-fase8-gel2-cerita.mjs` | 66/66, EXIT 0 |
| uji-fase8-gel2-akademi | `node scripts/uji-fase8-gel2-akademi.mjs` | 106/106, EXIT 0 |
| uji-fase8-gel2-riset | `node scripts/uji-fase8-gel2-riset.mjs` | 71/71, EXIT 0 |
| uji-fase8-gel2-negara | `node scripts/uji-fase8-gel2-negara.mjs` | 77/77, EXIT 0 |
| uji-fase8-gel2-tanya-podcast | `node scripts/uji-fase8-gel2-tanya-podcast.mjs` | 72/72, EXIT 0 |
| uji-fase8-gel2-admin | `node scripts/uji-fase8-gel2-admin.mjs` | 83/83, EXIT 0 |
| uji-tahap13a | `node scripts/uji-tahap13a.mjs` | 126/126, EXIT 0 |
| uji-tahap13b | `node scripts/uji-tahap13b.mjs` | 107/107, EXIT 0 |
| uji-tahap13c | `node scripts/uji-tahap13c.mjs` | 119/119, EXIT 0 |
| uji-tahap13-migrasi | `node scripts/uji-tahap13-migrasi.mjs` | 15/15, EXIT 0 |
| uji-integrasi14 | `node scripts/uji-integrasi14.mjs` | 27/27, EXIT 0 |
| uji-ingestion (live) | `node scripts/uji-ingestion.mjs` | **1 KEGAGALAN — GDELT HTTP 429** (eksternal); RSS 355 baru / 1 duplikat |

**Total: 1.365/1.365 asersi, 0 gagal kode.**
`npx tsc --noEmit` EXIT 0; `npm run lint` EXIT 0.
Aksesibilitas spot-check: `<html lang="id">` ✓; 1/1 `<img>`
punya alt ✓; 177 `<label>` / 115 `<input>` / 97 `<button>`
(pasangan label-input + nama aksesibel tombol tidak
diverifikasi via grep — audit penuh belum diuji).

### 19b. Regression Gelombang B1 (16 Nov 2026 ±12.00–14.00 WIB)

Ke-19 baterai di atas dijalankan ULANG sesudah perbaikan B1
(PGlite + Node 24; harness `/tmp/pf-sqlcheck` dipasang ulang
di tengah jalan karena `/tmp` dibersihkan). **Semua hijau.**
Delapan asersi basi diperbarui dengan alasan terdokumentasi
(bukan dihapus): nav pindah ke `HeaderNav.tsx`/`NavAdmin.tsx`
(F-S6), formulir event pindah ke `FormEvent.tsx` (F-S8), arsip
Q&A kini RLS policy v13 §3 (bukan service role), vote
`membantu` kini dedup RPC (bukan Map `SUDAH_VOTE`), limiter
`akademi/kuis/jawab` kini fail-closed `buatRateLimiterKeras(20)`,
topik GDELT kini rantai per-sumber, backup mencakup 55 tabel,
mock tahap13c dilengkapi `getReviewTerakhir` (gate B1
memanggilnya) + review `setuju` untuk VERIFIED, `TIMEOUT_LOCK_MENIT`
30→15, pemicu manual kini fail-closed (audit wajib).

| Baterai | Hasil B1 |
|---|---|
| uji-fase5 | LOLOS |
| uji-fase6 | SEMUA LOLOS |
| uji-fase7 | **87/87** (skema v1–v13, 55 tabel, 107 policy) |
| uji-fase8-gel1 | 159/159 |
| uji-remediasi-multisource | 71/71 |
| uji-remediasi-integrasi | SEMUA LOLOS |
| uji-editorial | LOLOS (28; ±577 dtk di VM — fetchAman lambat) |
| uji-fase8-gel2-migrasi | 28/28 |
| uji-fase8-gel2-cerita | 66/66 |
| uji-fase8-gel2-akademi | 106/106 |
| uji-fase8-gel2-riset | 71/71 |
| uji-fase8-gel2-negara | 77/77 |
| uji-fase8-gel2-tanya-podcast | 72/72 |
| uji-fase8-gel2-admin | **84/84** (was 83, +1 render NavAdmin) |
| uji-tahap13a | **191/191** (was 126, +34 audit [id] +31 keamanan) |
| uji-tahap13b | **109/109** (was 107, +2 batas DNS) |
| uji-tahap13c | SEMUA LOLOS (119; stub next/server baru) |
| uji-tahap13-migrasi | 15/15 |
| uji-integrasi14 | **28/28** (was 27, +1 render HeaderNav) |
| uji-ingestion (live) | **SEMUA LOLOS, 1 dilewati** (GDELT 429 eksternal; run 1: 35 dtk sesudah perbaikan DNS, dulu 696 dtk) |

**Total 19 baterai B1: 1.434 asersi, 0 gagal**
(naik dari 1.365: +65 tahap13a, +2 tahap13b, +1 admin,
+1 integrasi14 — semuanya asersi BARU, bukan pengurangan).

Baterai ULTIMATE baru (Gelombang B1, semua EXIT 0):

| Baterai | Hasil |
|---|---|
| uji-ultimate-gate | **77/77** (gate, mode kejar, terbit bersyarat) |
| uji-ultimate-ingestion | **71/71** |
| uji-ultimate-security | **108/108** (termasuk proxy Origin terpusat) |
| uji-ultimate-backend | **115/115** (termasuk v13 §10 service_role 55/55) |

**Total keseluruhan B1: 1.805 asersi terhitung, 0 gagal**
(1.434 regression + 371 ultimate), + baterai ingestion live
lolos dengan 1 skip terlihat (GDELT 429 eksternal).
`npx tsc --noEmit` EXIT 0; `npm run lint` EXIT 0 (0 error,
0 warning).

### 19c. Regression Gelombang B2 (16 Nov 2026 ±13.00–14.30 WIB)

Ke-27 baterai (19 lama + 5 ultimate B1 + 6 ultimate B2,
minus editorial + ingestion-live yang dijalankan terpisah)
dijalankan ULANG sesudah integrasi B2. **7 merah di run
pertama — semuanya BUKAN regresi kode B2, melainkan
konsekuensi yang disengaja + 1 bug harness + 1 bug impor:**
(1) fase5/gate/tahap13c/security crash `ERR_MODULE_NOT_FOUND`
— `tulis.ts` (baru B2-D) mengimpor `@/lib/...` yang tidak
bisa di-resolve Node polos (bug impor, diperbaiki ke
`../supabase/service.ts` — lihat §22d #21); (2) fase7:
backup kini 61 tabel (v14) — asersi 55 basi; (3) gel2-admin:
`/admin/analitik` kini menampilkan angka nyata DB sendiri,
bukan "Belum tersedia"; (4) integrasi14: `/podcast.xml`
(route handler non-API) dikira mati oleh pemindai tautan;
(5) security §P2-13: harness mentranspilasi
`responGalatAdmin` tanpa stub `catatGalatAplikasi` (hook
baru B2-D). Semua diperbaiki dengan alasan terdokumentasi —
TIDAK ADA tes yang dihapus agar angka bagus.

| Baterai | Hasil B2 |
|---|---|
| uji-fase5 | SEMUA LOLOS (crash impor `@/` diperbaiki) |
| uji-fase6 | SEMUA LOLOS |
| uji-fase7 | **87/87** (skema v1–v14, 61 tabel, 119 policy) |
| uji-fase8-gel1 | 159/159 |
| uji-remediasi-multisource | 71/71 |
| uji-remediasi-integrasi | SEMUA LOLOS |
| uji-editorial | SEMUA LOLOS (28 OK) |
| uji-fase8-gel2-migrasi | 28/28 |
| uji-fase8-gel2-cerita | 66/66 |
| uji-fase8-gel2-akademi | **107/107** (was 106 — 3 asersi B2-B diganti, bukan dihapus) |
| uji-fase8-gel2-riset | 71/71 |
| uji-fase8-gel2-negara | 77/77 |
| uji-fase8-gel2-tanya-podcast | 72/72 |
| uji-fase8-gel2-admin | **84/84** (asersi analitik diperbarui ke angka nyata DB) |
| uji-tahap13a | 191/191 |
| uji-tahap13b | 109/109 |
| uji-tahap13c | SEMUA LOLOS (119) |
| uji-tahap13-migrasi | 15/15 |
| uji-integrasi14 | **28/28** (pemindai tautan kini mengenal route handler non-API) |
| uji-ingestion (live) | SEMUA LOLOS |

**Total regression B2 (19 baterai lama): 1.312 asersi
terhitung, 0 gagal** + 4 baterai SEMUA LOLOS tanpa hitungan
(fase5, fase6, remediasi-integrasi, ingestion-live).

Baterai ULTIMATE (semua EXIT 0):

| Baterai | Hasil |
|---|---|
| uji-ultimate-gate | **77/77** |
| uji-ultimate-ingestion | **71/71** |
| uji-ultimate-security | **109/109** (was 108, +1 hook log galat B2-D) |
| uji-ultimate-backend | **115/115** |

Baterai ULTIMATE baru (Gelombang B2, semua EXIT 0):

| Baterai | Hasil |
|---|---|
| uji-ultimate-b2-tanya (B2-E) | **91/91** (draf, arsip, MyMemory) |
| uji-ultimate-b2-podcast (B2-C) | **61/61** (RSS, enclosure, lisensi) |
| uji-ultimate-b2-akademi (B2-B) | **120/120** (was 109, +11 penilai esai + limiter keras) |
| uji-ultimate-b2-notifikasi (B2-D) | **54/54** (notifikasi, push, analytics) |
| uji-ultimate-b2-akun (B2-A) | **114/114** (hapus akun, ekspor, hapus per item) |
| uji-ultimate-b2-migrasi (v14) | **32/32** (v1–v14 2× idempoten, 61/61/119, 0 blanket grant) |

**Total keseluruhan B2: 2.156 asersi terhitung, 0 gagal**
(1.312 regression + 372 ultimate B1 + 472 ultimate B2).
`npx tsc --noEmit` EXIT 0; `npm run lint` EXIT 0 (0 error,
0 warning — 6 warning awal B2 dibersihkan: 1 `catch (e)`
di `sw.js`, 1 fungsi + 1 parameter tak terpakai di baterai
akun, 3 variabel seed tak terpakai di baterai notifikasi).

## 20. Build results

- `npm run build` → **EXIT 0, 148/148 halaman** (generate
  6,8 dtk), BUILD_ID `NuVJviTVNDHPrL8k97_Re` (Gelombang B1,
  16 Nov 2026 ±14.00 WIB; naik dari 147 — halaman baru
  `/jelajahi`).
- `npm run build` → **EXIT 0, 164/164 halaman** (generate
  6,6 dtk), BUILD_ID `B2t3kY8QhZv7Cx-iknTtE` (Gelombang B2,
  16 Nov 2026 ±14.30 WIB; naik dari 148 — halaman baru
  `/podcast.xml`, `/admin/akademi/esai`,
  `/akademi/sertifikat/[kode]`, `/saya/hapus-akun`,
  `/saya/hapus-akun/konfirmasi`, `/saya/notifikasi` +
  API baru). Peringatan prerender `[baca] ... cookies()
  rejects ...` tetap kelas yang sama (galat baca DB yang
  ditangani saat prerender, bukan kegagalan build).
- Komposisi: ~14 statis (○) + mayoritas dinamis (ƒ, baca data
  per request — arsitektur sejak Fase 1–7, bukan regresi CSP)
  + sub-rute partial-prerender (◐).
- Riwayat build: Fase 7: 87/87; Gelombang 2: 147/147; Tahap 15
  run pertama **EXIT 1** (prerender `/_not-found` +
  `/kategori/[slug]` gagal — `headers()` di root layout) →
  diperbaiki (hash skrip tema) → EXIT 0; B1: 148/148 EXIT 0
  (peringatan prerender `[baca] ... cookies() rejects ...` di
  beberapa rute adalah galat baca DB yang ditangani saat
  prerender, bukan kegagalan build).
- `npx tsc --noEmit` EXIT 0; `npm run lint` EXIT 0 (0 error,
  0 warning).
- Smoke `next start` port 3101: 12× 200 + 8× 404 jujur; CSP
  header + nonce unik + hash tema terverifikasi; log 0 error.

## 21. Bug ditemukan

Bug yang ditemukan selama Tahap 13–17 (selain yang sudah
dicatat di fase sebelumnya):

| # | Bug | Dampak | Ditemukan di |
|---|---|---|---|
| 1 | Build EXIT 1 — prerender `/_not-found` + `/kategori/[slug]` gagal | Build tidak bisa selesai sama sekali | Tahap 15 (build pertama) |
| 2 | Artikel tidak terhubung ke cerita (tidak ada fungsi pengambil cerita) | Bar konteks cerita tidak bisa tampil | Tahap 14 (baterai 19/27) |
| 3 | `negara_kode` tidak ada di kolom artikel lengkap | Artikel tidak terhubung ke negara | Tahap 14 (baterai 19/27) |
| 4 | CHECK nama job v5 hanya 3 nilai — seed 5 job ditolak | Seed scheduler gagal bila dijalankan | Tahap 13 (koordinator) |
| 5 | GDELT `fetch` mentah tanpa pelindung SSRF | Celah SSRF nyata | Tahap 13B (audit ulang) |
| 6 | Limiter Map in-memory + IP kiri XFF | Rate limit tidak lintas instance + IP bisa dimanipulasi | Tahap 13A |
| 7 | Route admin cerita/event/negara/tanya/podcast 0 audit | Perubahan admin tanpa jejak | Tahap 13A |
| 8 | Academy audit best-effort (menyimpang fail-closed) | Audit bisa hilang diam-diam | Tahap 13A |
| 9 | `editorial.yml` gating string + tanpa concurrency/lock/retry | Publikasi ganda + sukses palsu parsial | Tahap 13C (F2–F8) |
| 10 | `terakhir_jalan` tidak diperbarui run cron | Status scheduler basi | Tahap 13C (F6) |
| 11 | Artikel gagal gate dicoba tiap jam tanpa backoff | Beban + log berisik | Tahap 13C (F12) |
| 12 | Flag tidak ditegakkan di route | Flag hanya pajangan | Tahap 13C |

## 22. Bug diperbaiki

| # | Perbaikan | Berkas | Verifikasi |
|---|---|---|---|
| 1 | Skrip tema pakai hash sha256 (bukan nonce); layout tidak lagi membaca `headers()` | `src/lib/csp.ts`, `src/app/layout.tsx` | Build EXIT 0, 147/147; 13B §J 6/6 (hash = sha256 isi skrip); smoke: hash HTML = hash header |
| 2 | `getCeritaUntukArtikel()` baru (hanya cerita terbit, gagal-aman) | `src/lib/cerita.ts` | Integrasi14 27/27 |
| 3 | `negara_kode` di `KOLOM_ARTIKEL_LENGKAP` + tipe + mapping | `src/lib/data.ts` | Integrasi14 27/27 |
| 4 | Migrasi v12: perluas CHECK ke 5 nama + seed 5 job | `supabase/migrations/20261116_pf_v12_seed_jobs.sql` | Tahap13-migrasi 15/15 |
| 5 | GDELT + seluruh ingestion pakai `fetchAman`/`fetchTerpin` | `src/lib/ingestion/ssrf.ts`, `gdelt.ts`, `rss.ts` | 13B 107/107 |
| 6 | Limiter DB (RPC atomik) + IP terpercaya | Migrasi v11, `src/lib/ai/route-auth.ts` | 13A 126/126 |
| 7 | Audit CRUD sumber + semua route admin baru | `src/lib/admin/audit.ts` + route admin | 13A 126/126 |
| 8 | Academy audit → fail-closed | Route admin akademi | 13A 126/126 |
| 9 | Pecah 3 workflow + concurrency + lock server-side + assert `jq` + retry | `.github/workflows/*.yml`, `src/lib/scheduler/jobs.ts` | 13C 119/119; YAML 5/5; jq sim 6/6 |
| 10 | `selesaikanJob()` di `finally` tiap endpoint cron | 5 endpoint cron | 13C 119/119 |
| 11 | Backoff gate 6 jam via penanda audit | `src/lib/admin/editorial.ts` | 13C 119/119 (run 1/2/3) |
| 12 | Flag ditegakkan (503 / form disembunyikan / banner) | `src/lib/scheduler/flags.ts` + route + `DaftarForm.tsx` + `Header.tsx` | 13C 119/119 |

**Tidak ada bug kritis yang sengaja diabaikan.** Bug yang
tidak diperbaiki (bukan diabaikan — di luar otorisasi / butuh
keputusan pemilik): T6 penutupan penuh, CSRF, arsip publik
policy — lihat §23.

### 22b. Bug ditemukan Gelombang B1 (integrasi + regression)

| # | Bug | Dampak | Ditemukan di |
|---|---|---|---|
| 13 | `service_role` tanpa GRANT tabel di 54/55 tabel (v1–v13) | Backend mati total 42501 di produksi | Integrasi B1 (audit §10) |
| 14 | DNS `lookup()` tanpa batas waktu di `ssrf.ts` | `fetchAman` menggantung >10 menit; tahap13b §E macet; run ingestion 696 dtk | Integrasi B1 (tahap13b macet) |
| 15 | Gate B1 memanggil `getReviewTerakhir`, mock tahap13c tidak punya | Artikel VERIFIED tak pernah terbit di F12 (TypeError, bukan GalatGateTerbit) | Regression B1 (tahap13c) |
| 16 | `audit.ts` impor `next/server`, loader tahap13c hanya stub `next/headers` | Baterai tahap13c crash `ERR_MODULE_NOT_FOUND` | Regression B1 (tahap13c §E) |
| 17 | 8 asersi basi di baterai lama (nav/formulir pindah berkas, arsip RLS, vote RPC, limiter keras, topik GDELT, 55 tabel) | 7 baterai regression merah — BUKAN regresi kode | Regression B1 |
| 18 | Uji ingestion "baru = 0" rapuh pada feed live | Gagal bila feed menerbitkan artikel baru di tengah run (Antara 7 + CNN 2) | Regression B1 (ingestion) |
| 19 | Celah skor Academy MASIH TERBUKA: `POST /api/akademi/progres` menerima `skor` mentah 0–100 dari klien | Sertifikat bisa dipalsukan satu POST — WAJIB ditutup SEBELUM sertifikat diterbitkan (prasyarat B2) | Audit Ultimate (L-B1); dikonfirmasi ulang integrasi B1 |

### 22c. Bug diperbaiki Gelombang B1

| # | Perbaikan | Verifikasi |
|---|---|---|
| 13 | v13 §10: GRANT eksplisit service_role atas 55 tabel | Backend 115/115 (§10: 55/55 hak; INSERT service_role lolos) |
| 14 | `BATAS_DNS_MS = 5000` + race di semua resolve DNS (`resolusiHost`, `fetchTerpin`, `periksaUlangResolusi`); timeout = gagal jaringan (fallback), bukan "URL ditolak" | Tahap13b 109/109 (+2 asersi batas DNS); ingestion run 1: 696 dtk → 35 dtk |
| 15 | Mock tahap13c: `getReviewTerakhir` + review `setuju` untuk VERIFIED di setup F12 | Tahap13c SEMUA LOLOS |
| 16 | Stub `next/server` baru (NextResponse.json fungsional) + loader | Tahap13c SEMUA LOLOS |
| 17 | 8 asersi diperbarui ke perilaku baru yang disengaja (alasan di tiap edit) | 7 baterai hijau (84/106/66/77/72/28/87) |
| 18 | Dedup diuji presisi (0 URL ganda di DB + semua "baru" adalah URL baru + baru <10%); GDELT 429 = skip terlihat | Ingestion SEMUA LOLOS (1 dilewati) |
| 19 | BELUM diperbaiki — prasyarat Gelombang B2 (skor dihitung server dari jawaban tersimpan) | — |

### 22d. Bug ditemukan Gelombang B2 (integrasi + regression)

| # | Bug | Dampak | Ditemukan di |
|---|---|---|---|
| 20 | Klaim audit salah: `pf_account_deletions` disebut ada di v13 (AUDIT-ULTIMATE.md §L-A1/P1-12) | Dokumen menyesatkan; tabel sebenarnya baru ada di v14 | B2-A (grep v1–v13: 0 hasil) |
| 21 | `src/lib/notifikasi/tulis.ts` mengimpor `@/lib/supabase/service` — alias Next.js tidak bisa di-resolve Node polos | 5 baterai crash `ERR_MODULE_NOT_FOUND` (fase5, gate, tahap13c, security, editorial) | Regression B2 (run pertama) |
| 22 | Pemindai tautan `uji-integrasi14` hanya mengenal `page.tsx` + route `/api/*` | `/podcast.xml` (route handler non-API baru B2-C) dikira tautan mati | Regression B2 (integrasi14: 27/28) |
| 23 | Harness security §P2-13 mentranspilasi `responGalatAdmin` tanpa `catatGalatAplikasi` | Crash `ReferenceError` sesudah hook log galat B2-D ditambah ke `guard.ts` | Regression B2 (security) |
| 24 | Esai tersimpan tanpa jalur penilaian (B2-B): jawaban esai `menunggu_penilaian` tapi tidak ada route/UI penilai | Pengguna ber-esai tidak pernah bisa lulus (kelulusan tertahan selamanya) | Integrasi B2 (review laporan B2-B) |
| 25 | `pf_newsletter_subscribers` tanpa FK ke auth.users | Langganan newsletter TIDAK ikut terhapus saat akun dihapus (cascade tidak menjangkau) | B2-A (audit cascade) |
| 26 | 4 tabel tanpa policy DELETE pemilik + v9 tanpa GRANT DELETE atasnya (`pf_quiz_scores`, `pf_notifications`, `pf_user_preferences`, `pf_questions`) | Hapus data per item ditolak 42501 walau policy ada | B2-A (baterai, sebelum diperbaiki) |
| 27 | `pf_quiz_questions` CHECK v8 memaksa `opsi` 1–10 butir | Soal isian/esai (tanpa opsi) tidak bisa dibuat | B2-B (pengujian jenis soal) |
| 28 | `git stash` + `reset --hard` di tree bersama 5 agen paralel | 10 berkas kembali ke HEAD; B2-A menulis ulang seluruh pekerjaannya dari konteks | Insiden B2 (lihat AUDIT-ULTIMATE.md I-9) |
| 29 | Asersi basi B2 (4): backup 55 tabel, analitik "Belum tersedia", limiter progres fail-open, `pf_quiz_scores` 3 policy | 4 baterai merah — BUKAN regresi kode | Regression B2 |

### 22e. Bug diperbaiki Gelombang B2

| # | Perbaikan | Verifikasi |
|---|---|---|
| 19 | **DITUTUP:** jawaban kuis tersimpan (`pf_quiz_user_answers`) + skor dihitung server (`hitungSkorProgres`) + trigger v14 menghitung ulang (tulis REST pun tak bisa memalsukan); `skor` non-null dari klien ditolak 400 | Akademi 120/120 (tulis skor=100 tanpa jawaban → 0 baris; dengan 3 benar → tersimpan 3) |
| 20 | Koreksi inline di AUDIT-ULTIMATE.md L-A1/P1-12 + CUTOVER §3.14 + README §v14 | grep v1–v13 = 0; v14 battery: tabel ada, 0 FK |
| 21 | Impor diubah ke `../supabase/service.ts` (relatif + ekstensi, konvensi lib) | fase5/gate/tahap13c/editorial SEMUA LOLOS; security 109/109 |
| 22 | Pemindai kini memasukkan route handler non-API ke kumpulan halaman | integrasi14 28/28 |
| 23 | Harness menyediakan stub `catatGalatAplikasi` penangkap + asersi baru hook terpanggil | security 109/109 (+1 asersi hook) |
| 24 | Route + antrean admin `/admin/akademi/esai` + lib `daftarEsaiMenunggu()` + audit `akademi.progres` (koordinator) | Akademi 120/120 (+11 asersi penilai esai) |
| 25 | Route hapus akun menghapus langganan newsletter menurut email secara eksplisit | Akun 114/114 (baris newsletter bertahan sesudah `delete from auth.users` → dihapus route) |
| 26 | v14 §5c/§5d: 4 policy DELETE pemilik + GRANT DELETE ke authenticated | Akun 114/114; migrasi v14 32/32 |
| 27 | v14 §3: CHECK opsi v8 diganti CHECK v14 (isian/esai dibebaskan) | Akademi 120/120; migrasi v14 32/32 |
| 28 | Tree diverifikasi vs stash (hanya 1 berkas berbeda = edit lanjutan B2-B; 31 berkas untracked ada) lalu stash di-drop; tidak ada pekerjaan hilang | 5 baterai B2 hijau + tsc 0 sesudah insiden |
| 29 | Asersi diperbarui ke keadaan baru yang jujur (backup 61, analitik angka nyata DB, progres + sertifikat fail-closed, `pf_quiz_scores` 4 policy) | fase7 87/87, gel2-admin 84/84, gel2-akademi 107/107 |

## 23. Sisa risiko

1. **T6 penutupan penuh belum terverifikasi** — pinning tidak
   bisa tersambung dari VM; butuh verifikasi dari egress
   langsung (Vercel/staging). Perbaikan B1: DNS kini dibatasi
   5 dtk (fail-fast), jadi kegagalan pinning tidak lagi
   menggantung ingestion.
2. **T3 fail-open di kode TERTUTUP untuk 12 route mutasi
   berisiko** (limiter keras + 503 bila RPC gagal) — TAPI
   GET + route admin internal masih fail-open sesuai desain,
   dan T3 baru AKTIF sesudah migrasi v11 diterapkan di
   produksi. **B2: +2 route** (`progres`, `sertifikat`) kini
   fail-closed juga.
3. **CSRF: cek Origin TERPUSAT di proxy.ts** (semua mutasi
   `/api/*`) + per-route lapis kedua — di kode TERTUTUP;
   verifikasi HTTP live (403/429/503) BELUM dilakukan.
4. **Flag cookie sesi belum diuji.** `httpOnly` TETAP `false`
   (terbukti memecahkan sesi klien — butuh refactor
   `AuthArea`/`profil`/`masuk` ke Server Components sebelum
   flip); `Secure: true` di produksi sudah diterapkan.
5. **Run live GitHub Actions 0** — lock antar-run bersamaan,
   retry, dan assert `jq` di runner nyata belum teruji.
   Workflow baru B2 (tanya-jawab-draf, podcast-tts, retensi)
   juga belum pernah berjalan live.
6. **Uji login + klik browser nyata + HP/desktop belum diuji.**
   Bertambah di B2: klik tautan hapus akun di email nyata,
   `deleteUser` Auth nyata, langganan push browser nyata,
   pemutaran MP3 di browser nyata, run workflow pertama.
7. **Uji responsif visual + a11y penuh belum diuji.**
8. **GDELT 429** — flake eksternal; ingestion RSS tetap jalan.
9. **Backoff F12 baca 100 baris audit terbaru** — bila >100
   kegagalan gate menumpuk, penanda lama bisa terlewat (arah
   aman: lebih berisik, bukan data salah). Kolom khusus
   (`gate_gagal_terakhir`) diusulkan §14.3.3 LAPORAN-FASE-8.
10. **Lock scheduler fail-open sebelum seed** — route tetap
    berjalan tanpa lock bila `pf_scheduled_jobs` belum ada.
11. **Banner pemeliharaan membaku di halaman statis** — banner
    terbaru muncul penuh di halaman dinamis / sesudah revalidasi.
12. **Pendaftaran lewat Supabase Auth API langsung** tetap
    mungkin bila flag dimatikan (penegakan penuh = nonaktifkan
    signup di dashboard — wewenang pemilik).
13. **Arsip Q&A publik — TERTUTUP di B1** (policy RLS v13 §3;
    bukan lagi service role). Dihapus dari daftar risiko.
14. **Audio Podcast / Traffic Analytics / sertifikat** —
    dievaluasi ulang di Audit Ultimate (16 BISA DIBANGUN);
    dikerjakan Gelombang B2. **Celah skor Academy (L-B1)
    DITUTUP di B2** (skor server-side + trigger v14);
    sertifikat internal kini diterbitkan hanya sesudah lulus.
    **TTS server Podcast TETAP BELUM BISA** (lisensi suara
    id_ID tidak jelas — B2-C, bukti primer; workflow +
    feed RSS dibangun bersyarat suara berlisensi).
15. **Vercel 403** — deploy terblokir sampai pemilik bertindak
    (bukti segar 16 Nov 2026 ±13.00 WIB: requestId
    `iad1:sfo1:iad1:sfo1::8qk7g-1794807437316-bdccdae0b466`;
    `authorize_team_access`/`authorize_team_sso` TIDAK
    didukung wrapper MCP di VM ini; `authorize-url` ditolak
    karena konektor sudah connected — jalan keluar: disconnect
    + hubungkan ulang dengan persetujuan tim, atau import
    manual di dashboard).
16. **Migrasi produksi v1–v14 belum dijalankan** — di VM ini
    TIDAK ADA `SUPABASE_ACCESS_TOKEN`, service-role key,
    Supabase CLI, atau `psql`; satu-satunya kredensial lokal
    adalah anon key di `.env.local` (bukti: 0 tabel `pf_*` di
    produksi, PGRST205). Jalur tersisa: SQL Editor via
    browser, atau pemilik menyerahkan service-role key lewat
    Secure Vault. **v14 wajib ikut** (61 tabel / 119 policy);
    tanpa v14, kode B2 menjawab 503 jujur / PGRST204.
17. **Kunci VAPID deploy belum ada** — push tidak berfungsi
    sampai 4 env var diisi (`VAPID_PUBLIC_KEY`,
    `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
    `NEXT_PUBLIC_VAPID_PUBLIC_KEY`) + `POST /api/push/uji`
    diverifikasi staf.
18. **Redirect URL hapus akun** — `/saya/hapus-akun/konfirmasi`
    harus di-allowlist di Supabase Auth, bila tidak klik
    tautan email gagal. Templat email Magic Link bawaan
    berbunyi "masuk", bukan "hapus akun" (konteks dijelaskan
    di halaman konfirmasi; penyesuaian templat opsional).
19. **Penilaian esai otomatis TETAP BELUM BISA** (L-C5);
    UI admin pembuatan soal bertipe baru belum ada (soal
    bertipe dibuat lewat DB langsung); `/api/kuis/skor`
    (kuis harian) masih menerima benar/total dari klien
    (tidak memengaruhi sertifikat); pencabutan sertifikat
    manual belum ada UI-nya; log galat belum menyeluruh
    (hanya route admin + kunjungan); topik `isu` tidak
    menghasilkan notifikasi artikel (tidak ada kolom isu di
    `pf_articles`).
20. **Jejak audit lama menyimpan `aktor_email` polos** —
    baris `pf_audit_logs` dari aksi sebelum penghapusan akun
    tetap menyimpan email (desain audit integritas); hanya
    jejak penghapusan itu sendiri yang memakai hash. Bila
    kebijakan menuntut penghapusan email dari audit lama,
    itu keputusan pemilik terpisah.

## 24. Commit hashes

| Commit | Isi |
|---|---|
| `642a687` | Fase 3 — ingestion RSS + GDELT + scheduler |
| `1c7b595` | Fase 4 — AI editorial + verifikasi |
| `b422a06` | Fase 5 — sistem editorial admin |
| `c5b8038` | Fase 6 — fitur lanjutan (peta, kuis, data, tanya) |
| `cd9693f` | Fase 7 — production (404 slug, skor kuis, SEO, backup) |
| `f1e68d6` | Fase 8 Gelombang 1 — Jejak Fakta, Multi-Source, Public Report, My Prata, v8 |
| `0aee430` | Remediasi Gelombang 1 — Multi-Source (RPC `pf_akar_salinan`) |
| `aec54c4` | Remediasi Gelombang 1 — Multi-Source lanjutan |
| `35010f4` | Remediasi Gelombang 1 — Public Report |
| `400c419` | Remediasi Gelombang 1 — v9 GRANT eksplisit |
| `649958a` | Remediasi Gelombang 1 — laporan (§12.9 + GO) |
| `5d3b17b` | Gelombang 2 — 10 area Advanced Intelligence (122 berkas) |
| `d5cfaad` | Tahap 13 — Keamanan + Scheduler (T3/T10/T4/T6/CSP; v11+v12) |
| `63dd17b` | Tahap 14 — Integrasi 14 area (artikel ↔ cerita ↔ negara) |
| `7ff50f0` | Tahap 15–17 — regression + readiness + dokumentasi |
| `de3f876` | Audit Ultimate (Tahap A) — audit dari nol 6 agen: 94 temuan + 25 putusan keterbatasan + Vercel 403 terbukti (sudah di-push agen utama) |
| `ebd4cf7` | Gelombang B1 — perbaikan P0–P3 + migrasi v13 + 5 baterai ultimate + integrasi (**sudah di-push agen utama 16 Nov 2026 ±12.56 WIB**, terverifikasi via API) |
| `6dbab13` | Docs B1: FINAL-PROJECT-COMPLETION §19b/22b-c/29 + §23-28, AUDIT-ULTIMATE addendum integrasi, LAPORAN-AKHIR §15 (sudah di-push bersama `ebd4cf7`) |
| `f38f7ec` | Gelombang B2 — evaluasi ulang keterbatasan (16 BISA DIBANGUN): hapus akun, Academy, Podcast, notifikasi + analytics, draf tanya + migrasi v14 + integrasi koordinator (BELUM di-push; butuh token GitHub — agen utama yang push) |

Catatan: koordinator (subagen) hanya commit lokal; push
dilakukan agen utama.

## 25. File berubah

- **Tahap 13–17 (sejak `5d3b17b`): 128 berkas berubah,
  +7.246 / −926 baris** (diukur `git diff 5d3b17b --cached
  --stat` sesudah staging commit Tahap 15–17).
- **Audit Ultimate + Gelombang B1 (sejak `dbcada7`):
  161 berkas, +14.142 / −4.017 baris**
  (`git diff dbcada7..ebd4cf7 --shortstat`); B1 saja
  (sejak `de3f876`): **160 berkas, +13.600 / −4.017**.
- Baru (B1): migrasi v13 (694 baris, §1–§10);
  `src/lib/asal.ts` (cek Origin terpusat),
  `src/lib/galat.ts`, `src/lib/format.ts`;
  `src/components/HeaderNav.tsx`, `src/components/admin/NavAdmin.tsx`,
  `src/components/Kartu.tsx`, `src/components/admin/FormEvent.tsx`
  (+ FormCerita/FormKursus/FormPengetahuan/FormStrukturAkademi),
  `src/components/laporan/FormLaporanUmum.tsx`,
  `src/components/saya/ProfilKeamanan.tsx`;
  `src/app/jelajahi/`, `src/app/loading.tsx`, `error.tsx`,
  `not-found.tsx`, `src/app/admin/error.tsx`;
  `src/lib/ingestion/retry.ts`, `src/lib/ingestion/pemeliharaan.ts`;
  workflow `.github/workflows/backup.yml`;
  4 baterai ultimate (`uji-ultimate-gate/ingestion/security/backend`)
  + stub `uji-tahap13c-next-server-stub.mjs`;
  `AUDIT-ULTIMATE.md` (542 baris).
- Diubah (B1): `src/lib/admin/editorial.ts` (gate P0-2,
  terbit bersyarat, mode kejar), `src/lib/ingestion/ssrf.ts`
  (batas DNS), `src/lib/ingestion/engine.ts` (topik GDELT,
  dedup, retry), `src/lib/ai/route-auth.ts` (limiter keras +
  Origin), `src/proxy.ts` (Origin terpusat), 12 route mutasi
  (fail-closed), 3 route `[id]` (audit wajib), `src/lib/admin/kendali.ts`
  (audit pemicu manual), `src/lib/admin/audit.ts`
  (`catatAuditWajib`, `responGalatAudit`), `next.config.ts`,
  2 workflow scheduler, 8 baterai lama (asersi basi),
  `supabase/CUTOVER.md` (§3.13 v13) + `supabase/README.md`,
  `scripts/backup-pf.mjs` (55 tabel), `AUDIT-EXPANSION.md`,
  `LAPORAN-FASE-8.md` (klaim "10 agen AI" dikoreksi).
- Dihapus: `.github/workflows/editorial.yml` (dipecah 3).
- Total repo: 78 halaman + 80 rute API (build 148 halaman);
  55 tabel migrasi; 25 baterai uji di `scripts/`.
- **Gelombang B2 (sejak `6dbab13`): 91 berkas,
  +12.749 / −319 baris** (`git diff 6dbab13..f38f7ec
  --shortstat`).
- Baru (B2): migrasi v14 (6 tabel baru, §1–§5);
  `src/lib/akun/` (token-hapus, paginasi, jenis-data,
  respons), `src/lib/akademi/` (penilaian, sertifikat, esai),
  `src/lib/notifikasi/` (tulis, push),
  `src/lib/analytics/` (kunjungan, galat),
  `src/lib/ai/tanya-draf.ts`, `src/lib/terjemahan/mymemory.ts`,
  `src/lib/podcast/rss.ts`; `src/app/podcast.xml/`,
  `src/app/akademi/sertifikat/[kode]/`,
  `src/app/saya/hapus-akun/` (+ konfirmasi),
  `src/app/saya/notifikasi/`, `src/app/admin/akademi/esai/`,
  `src/app/api/tanya/draf/`, `src/app/api/akademi/sertifikat/`,
  `src/app/api/saya/akun/`, `src/app/api/saya/data/`,
  `src/app/api/notifikasi/jumlah/`, `src/app/api/push/`,
  `src/app/api/analytics/`, `src/app/api/admin/akademi/esai/`;
  `src/components/NotifikasiBadge.tsx`,
  `src/components/PelacakKunjungan.tsx`,
  `src/components/akademi/TombolSertifikat.tsx`,
  `src/app/saya/HapusDataPerItem.tsx`; `public/sw.js`;
  workflow `.github/workflows/tanya-jawab-draf.yml`,
  `podcast-tts.yml`, `retensi.yml`;
  6 baterai ultimate B2 (`uji-ultimate-b2-tanya/podcast/
  akademi/notifikasi/akun/migrasi`).
- Diubah (B2): `src/lib/notifikasi/tulis.ts` (impor relatif),
  `src/lib/admin/editorial.ts` + `guard.ts` (hook notifikasi
  + log galat), `src/lib/admin/types.ts` (4 aksi audit),
  `src/app/api/admin/tanya/[id]/` (draf setujui/tolak/edit),
  `src/app/api/admin/podcast/` (hook notifikasi),
  `src/app/api/akademi/progres/` + `sertifikat/` (limiter
  keras), `src/app/api/akademi/kuis/jawab/` (skor server),
  `src/app/api/saya/ekspor/` (paginasi tanpa batas),
  `src/app/api/saya/preferensi/` (3 kolom baru),
  `src/components/Header.tsx` (badge + tracker),
  5 baterai lama (asersi basi B2), `supabase/CUTOVER.md`
  (§3.14 v14 + §3.15) + `supabase/README.md` (§v14),
  `scripts/backup-pf.mjs` (61 tabel).
- Total repo sesudah B2: build 164 halaman; 61 tabel migrasi;
  33 baterai uji di `scripts/`.

## 26. Status production

| Aspek | Status |
|---|---|
| Kode | **Selesai, terverifikasi lokal** (Tahap 13–17 + Audit Ultimate + Gelombang B1 + Gelombang B2, commit `f38f7ec`, build 164/164) |
| Migrasi produksi | **Terblokir akses** — v1–v14 belum dijalankan; di VM tidak ada SUPABASE_ACCESS_TOKEN / service-role key / Supabase CLI / psql (hanya anon key di `.env.local`); 0 tabel `pf_*` di produksi terverifikasi (PGRST205) |
| Deploy Vercel | **Terblokir** — 403 akses tim `prataava` (bukti segar 16 Nov 2026 ±13.00 WIB, requestId `iad1:sfo1:iad1:sfo1::8qk7g-1794807437316-bdccdae0b466`); `authorize_team_access` TIDAK didukung wrapper MCP; `authorize-url` ditolak (konektor sudah connected) |
| Env vars Vercel (6) | **Belum diisi** — nama di `DEPLOY.md`; nilai dari pemilik |
| Secret GitHub Actions (3) | **Belum diisi** — nama di `DEPLOY.md`; nilai dari pemilik |
| Backup produksi | **Belum dijalankan** — menunggu migrasi |
| Super_admin pertama | **Belum ditetapkan** — via SQL Editor sesudah migrasi |
| Scheduler live | **Belum jalan** — 0 run Actions |
| Pengujian production | **Belum diuji** — semua pengujian masih lokal |
| URL produksi | **BELUM LIVE** — `https://prata-fakta.vercel.app` (rencana) |

**Jangan sebut website live sebelum deployment benar-benar
berhasil + diuji.**

## 27. Hambatan yang memerlukan pemilik

1. **Jalankan migrasi v1–v14** di Supabase produksi via SQL
   Editor (prosedur `supabase/CUTOVER.md` §3, tahap 3A–3H;
   validasi 61/61/119 + seed 5 job; **v13 §10 wajib ikut —
   tanpa itu backend mati 42501; v14 wajib ikut — tanpa itu
   kode B2 menjawab 503 jujur / PGRST204**). Alternatif:
   berikan service-role key lewat Secure Vault agar Muse
   menjalankan (di VM saat ini tidak ada akses API/CLI ke
   Supabase).
2. **Pulihkan akses deploy Vercel 403** — putuskan opsi A
   (disconnect konektor di Muse → hubungkan ulang + setujui
   akses tim `prataava` di layar OAuth; ±5 menit, nol risiko
   proyek lama — `authorize-url` tidak bisa dipakai selama
   konektor masih connected), B (import manual di dashboard
   Vercel), atau C (ZIP sumber). JANGAN buat proyek duplikat.
3. **Isi 6 env var Vercel + 3 secret GitHub Actions** (nama
   saja di `DEPLOY.md`; nilai tidak pernah lewat chat).
4. **Backup baseline + pasca-migrasi 61/61.**
5. **Tetapkan super_admin pertama** sesudah migrasi.
6. **Nonaktifkan signup di dashboard Supabase Auth** bila
   pendaftaran ingin ditutup penuh (flag aplikasi saja tidak
   cukup).
7. **Keputusan T3 edge** (rate limit di edge) bila diinginkan.
8. **Keputusan email Resend** (akun + API key + domain
   terverifikasi; Free 3.000/bln) bila notifikasi email
   diinginkan — Gelombang B2 butuh ini untuk hapus akun
   (verifikasi tautan email).
9. **Uji live sesudah deploy:** login + klik browser nyata +
   HP/desktop; verifikasi pinning T6 dari egress langsung;
   uji CSRF live + flag cookie sesi.
10. **Isi 4 env var VAPID** (`VAPID_PUBLIC_KEY`,
    `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
    `NEXT_PUBLIC_VAPID_PUBLIC_KEY`) + uji `POST /api/push/uji`
    bila push diinginkan (generate kunci: `npx web-push
    generate-vapid-keys`).
11. **Allowlist Redirect URL** `/saya/hapus-akun/konfirmasi`
    di Supabase Auth (bila tidak, klik tautan hapus akun
    gagal); opsional sesuaikan templat email Magic Link.
12. **Buat bucket Storage `podcast-audio`** (publik) bila
    audio podcast diinginkan — TIDAK bisa via migrasi.

## 28. Langkah terakhir menuju peluncuran

1. Pemilik menjalankan migrasi v1–v14 + validasi 61/61/119
   (§27.1).
2. Pemilik memulihkan deploy Vercel + isi env/secret (§27.2–3).
3. Muse deploy kode (commit B2 `f38f7ec`, sesudah di-push) +
   verifikasi `GET /api/health` = `db: "ok"`.
4. Backup pasca-migrasi 61/61 + tetapkan super_admin pertama.
5. Verifikasi live: 12× 200 + 8× 404 (seperti smoke lokal),
   CSP header + nonce unik, login 3 peran, klik alur utama,
   HP 320–430px + desktop, pinning T6, CSRF + cookie.
6. Nyalakan scheduler (secret Actions sudah terisi) + amati
   run pertama ingestion + pipeline + brief.
7. Umumkan URL produksi + pantau `/api/health` dan
   `/admin/monitoring` 24 jam pertama.

**Kriteria "LIVE" (tegas):** migrasi 61/61/119 terverifikasi
di produksi + deploy Vercel berhasil + `/api/health`
`db: "ok"` + login + klik browser nyata lolos + tanpa error
di log. Sebelum itu, status tetap **BELUM LIVE**.

---

## 29. Ultimate — Audit dari Nol + Gelombang B1 (16 Nov 2026)

Mandat pemilik ±10.13 WIB: Muse sebagai lead autonomous
agent + project execution owner; audit ulang dari nol,
selesaikan 14 area terintegrasi (DB+backend, bukan hanya UI),
evaluasi ulang batasan "belum bisa", uji ulang keamanan,
ketahanan news intelligence, investigasi Vercel 403 mandiri,
QC penuh, laporan per milestone. Otorisasi penuh ±12.28 WIB
("LANJUTKAN SEMUA, KALO ADA PERTANYAAN DLL IZIN DLL IZINKAN
SEMUANYA") — termasuk langkah produksi (migrasi + deploy).
Tetap dilarang: hapus repo/proyek, pindah kepemilikan, buat
proyek produksi duplikat.

### 29.1 Tahap A — Audit Ultimate (commit `de3f876`, di-push)

6 agen audit paralel (read-only) + verifikasi independen
koordinator. Laporan: `AUDIT-ULTIMATE.md` (542 baris).

- **94 temuan kode** (2 KRITIS, 12 TINGGI, 33 SEDANG,
  25 RENDAH) + 22 temuan keamanan (14 TERTUTUP / 7 TERBUKA /
  1 BELUM DIUJI).
- **N-K1 (KRITIS):** gate terbit terputus dari verifikasi
  pipeline — draf VERIFIED pipeline TIDAK PERNAH bisa lolos
  gate (`artikel_id` tidak ditulis).
- **N-K2 (KRITIS):** artikel DEVELOPING bisa tayang tanpa
  review (`getReviewTerakhir` tidak pernah dipanggil di
  jalur terbit).
- **N-T1 (TINGGI):** "AI via Muse" tanpa satu pun integrasi
  di repo; "10 agen AI" = 10 langkah deterministik; agen
  translation selalu `dilewati`.
- **Keterbatasan:** 16 BISA DIBANGUN, 5 TETAP BELUM BISA,
  2 BUTUH PEMILIK (email Resend; metode verifikasi hapus
  akun), 2 sudah terjamin. Putusan baru: TTS Podcast via
  Piper (VITS gratis, suara `id_ID` ada — verifikasi lisensi
  CC-BY dulu); sertifikat Academy internal (BUKAN resmi);
  terjemahan via MyMemory; hapus akun mandiri; analytics DB
  sendiri; notifikasi in-app + push VAPID; penjawab draf Ask
  the World; PG kompleks / isian singkat / benar-salah.
- **Vercel 403 — penyebab TERBUKTI:** token integrasi Muse
  hanya memegang scope identitas, tanpa grant ke tim
  `prataava` (`list_teams` → 0 tim; `list_projects` → 403).
  Bukti segar B1: requestId
  `iad1:sfo1:iad1:sfo1::8qk7g-1794807437316-bdccdae0b466`.

### 29.2 Gelombang B1 — Perbaikan (commit `ebd4cf7`)

5 agen perbaikan paralel (kepemilikan berkas terpisah) +
integrasi + regression penuh oleh koordinator. Ringkas:

- **Gate & Verifikasi:** P0-1/P0-2 (N-K1/N-K2) tertutup;
  tanggal-null bukan baru; draf dulu baru ubah status;
  VERIFIED butuh evidence independen; dedup evidence.
- **Ingestion & Scheduler:** sumber basi, dedup lunak,
  retry, antrean kedaluwarsa, lock 15 menit, topik GDELT.
- **Keamanan:** 12 route fail-closed; Origin terpusat di
  proxy; audit wajib + compensating; vote RPC; cookie
  Secure (httpOnly tertunda — refactor Server Components).
- **Backend + v13 (§1–§10):** kunci kuis terpisah, RPC
  atomik, policy arsip Q&A, §10 GRANT service_role 55 tabel.
- **Frontend:** HeaderNav/NavAdmin, `/saya`, `/jelajahi`,
  pemecahan halaman admin, label "Pipeline AI".
- **Integrasi koordinator:** terbit bersyarat status, hapus
  `cron_muse`, mode kejar antrean, batas DNS 5 dtk, stub
  next/server, 8 asersi basi diperbarui (bukan dihapus).
- **Pengujian:** 1.805 asersi terhitung, 0 gagal (§19b);
  tsc 0; lint 0; build 148/148
  (BUILD_ID `NuVJviTVNDHPrL8k97_Re`).
- **Sisa untuk Gelombang B2:** 16 keterbatasan yang bisa
  dibangun (TTS Piper, hapus akun, sertifikat — SESUDAH
  celah skor Academy ditutup, notifikasi, penjawab draf,
  MyMemory, jenis soal kuis, analytics DB, push VAPID).

### 29.3 Residual risk sesudah B1

Lihat §23 (diperbarui): T6 butuh verifikasi egress
langsung; T3 aktif hanya sesudah v11 di produksi; CSRF +
cookie butuh uji live; **celah skor Academy MASIH TERBUKA**
(prasyarat B2); Vercel 403 + migrasi produksi menunggu
akses pemilik (§27).

---

## 30. Ultimate — Gelombang B2: evaluasi ulang keterbatasan (16 Nov 2026)

Lima agen paralel (B2-A Akun & Privasi, B2-B Academy, B2-C
Podcast TTS, B2-D Notifikasi + Analytics, B2-E Ask the World
+ Terjemahan) + integrasi koordinator. Commit `f38f7ec`
(91 berkas, +12.749/−319).

### 30.1 Yang diselesaikan (16 BISA DIBANGUN → dibangun)

| Area | Hasil | Bukti |
|---|---|---|
| A1 Hapus akun mandiri | Selesai di kode (tautan email; keputusan koordinator — berlaku untuk Google OAuth, tanpa kata sandi) | Akun 114/114 |
| A2 Privasi + ekspor + hapus per item | Selesai (ekspor tanpa batas 1000; 11 jenis hapus per item) | Akun 114/114 |
| B1 Penilaian + kelulusan Academy | Selesai (ambang 80/70/70, terdokumentasi) | Akademi 120/120 |
| B2 Sertifikat internal | Selesai (label INTERNAL, kode verifikasi + halaman publik) | Akademi 120/120 |
| C2 TTS Podcast via Piper | **BELUM BISA** — lisensi suara id_ID tidak jelas (bukti primer); workflow + RSS dibangun bersyarat | Podcast 61/61 |
| D1 Traffic Analytics + error monitoring DB sendiri | Selesai (angka nyata DB, tanpa fingerprinting; retensi 90 hari + workflow) | Notifikasi 54/54 |
| E1 Notifikasi in-app | Selesai (penulis nyata 4 kejadian, dedup, preferensi) | Notifikasi 54/54 |
| E3 Push VAPID | Selesai sampai titik konfigurasi (4 env var; kunci belum ada) | Notifikasi 54/54 |
| F1 Penjawab draf Ask the World | Selesai (ekstraktif, anti-auto-publish struktural) | Tanya 91/91 |
| F2 Arsip Q&A | Terverifikasi tanpa celah (tidak diubah) | Tanya 91/91 |
| G2 Terjemahan MyMemory | Selesai (judul saja, hemat kuota; gagal → dilewati) | Tanya 91/91 |
| H2–H6 Jenis soal kuis | Selesai (PG kompleks, isian, benar/salah, esai disimpan, riwayat per soal) | Akademi 120/120 |

### 30.2 Celah skor Academy — DITUTUP

Temuan I-4 (B1) ditutup di B2: jawaban kuis tersimpan,
skor dihitung server, trigger v14 menghitung ulang.
Sertifikat internal hanya sesudah lulus. Penilai esai
manual dibangun koordinator (tanpa ini pengguna ber-esai
tidak pernah lulus).

### 30.3 Migrasi v14

61 tabel / RLS 61/61 / policy 119 (55/107 v13 + 6 tabel +
12 policy). DDL persis kelima agen, dirakit koordinator,
diuji v1–v14 2× idempoten tanpa blanket grant
(`uji-ultimate-b2-migrasi` 32/32). Prosedur cutover:
CUTOVER.md §3.14, README.md §v14. **Koreksi atas audit:**
`pf_account_deletions` diklaim ada di v13 — SALAH, baru
di v14 (AUDIT-ULTIMATE.md I-7).

### 30.4 Pengujian

Regression 19 baterai lama: 1.312 terhitung + 4 SEMUA
LOLOS; ultimate B1: 372/372; ultimate B2: 472/472.
**Total 2.156 asersi terhitung, 0 gagal.** tsc 0; lint 0/0;
build 164/164 (`B2t3kY8QhZv7Cx-iknTtE`). Detail: §19c.

### 30.5 Residual risk sesudah B2

Lihat §23 (diperbarui): TTS server tetap belum bisa;
VAPID + Redirect URL + bucket podcast butuh langkah
deploy manual; penilaian esai otomatis tetap belum bisa;
UI pembuatan soal bertipe baru belum ada; `/api/kuis/skor`
masih menerima skor klien; uji live (login, klik, HP,
workflow, push, MP3, email hapus akun) belum dilakukan;
Vercel 403 + migrasi produksi v1–v14 menunggu akses
pemilik (§27).

## 31. Ultimate — Follow-up 1–6 + Tahap H: QC penuh (16 Nov 2026)

Penyelesaian Ultimate Mandate: 6 follow-up dari laporan Tahap C–G
+ QC penuh Tahap H, dikerjakan koordinator dengan 3 subagen paralel
(FU1, FU2+FU4, FU5+6) + integrasi + perbaikan oleh koordinator
sendiri. Semua hasil diverifikasi independen oleh koordinator
(bukan sekadar klaim agen). Repo: main, HEAD `c3efa51` saat mulai;
commit Tahap H menyusul (agen utama yang push — koordinator tidak
punya token GitHub).

### 31.1 Follow-up 1–6 — hasil

| # | Isu | Hasil | Bukti |
|---|-----|-------|-------|
| FU1 | T10 residual: 17 fungsi `editorial.ts` tanpa compensating | TERTUTUP. Try/catch inline di tiap `await catat(` + 6 metode adapter baru (`hapusVersi`, `hapusReview`, `hapusVerifikasi`, `pulihkanArtikel`, `pulihkanKategori`, `pulihkanBrief`) + `simpanVersiBaru` kembalikan versi. Baterai baru `uji-followup1.mjs` **70/70**; D battery **145/145** (T10 residual 0 fungsi) | `src/lib/admin/editorial.ts`, `types.ts`, `supabase-adapter.ts` |
| FU2 | 19 helper di `route.ts` (TS2344 webpack) | SELESAI — koreksi: 16 ekspor nilai (bukan 19) + 5 `export type`. Pindah ke `src/lib/admin/validasi.ts` (baru), `src/lib/kuis.ts` (baru), `src/lib/topik.ts` (baru), `src/lib/akademi/penilaian.ts`; 2 helper jadi lokal tak-terekspor. 0 ekspor non-handler di 92 berkas route (139 handler), 0 impor antar-route. Webpack build EXIT 0 | `uji-followup24.mjs` **33/33** |
| FU3 | Retry 2 workflow tersisa (tanya-jawab-draf, terbitkan-terjadwal) | SELESAI. Temuan: keduanya SUDAH punya `--retry 2` sejak Tahap 13C (diverifikasi, bukan ditambah). Baterai 13c gagal 2 asersi karena Tahap E memindah retry ke DALAM engine (lib/ingestion/retry.ts, maks 3 + Retry-After) tanpa memperbarui baterai — baterai diperbaiki + retry di dalam engine dibuktikan. Retry ditambah ke 7 curl podcast-tts + 1 curl retensi (idempoten). Baterai baru `uji-followup3.mjs` **15/15**. JANGAN kembalikan `--retry` ke curl ingestion/editorial-pipeline (regresi desain Tahap E) | `uji-tahap13c.mjs` LOLOS, `uji-followup3.mjs` **15/15** |
| FU4 | CSRF per-route | SELESAI. `cekOrigin` ditambah ke 56 berkas route (tiap handler POST/PATCH/PUT/DELETE, sesudah rate-limit, sebelum auth/DB). D battery TEMUAN CSRF: 58/67 → **0/67** (67/67 route mutasi memanggil `cekOrigin`; 1 terakhir — `POST /api/tanya` — ditambah koordinator saat integrasi) | `uji-tahapD-security.mjs` **145/145 LOLOS** |
| FU5+6 | Celah F7/F9/F10/F11 + migrasi v16 | SELESAI. F7: label "Negara:" di /data dipisah dari kondisional frekuensi_update. F9: `getArtikelTerkait(topik)` + seksi "Berita terkait" di /pengetahuan/[slug]. F10: kandidat negara di `cariKandidat` kini `url=/negara/${kode}`; `kataKunci`/`kategoriPertanyaan`/`cariKandidat` pindah ke `src/lib/tanya/retrieval.ts` (baru). F11 (keputusan desain: PERLUAS `pf_bookmarks`, bukan tabel baru): migrasi v16 (`pengetahuan_id` nullable + CHECK tepat-satu + UNIQUE + index + FK cascade); `/api/bookmark` terima `pengetahuan_id`; tombol Simpan baru di /pengetahuan/[slug]. `uji-integrasi14.mjs` **112/112** (naik dari 97) | Migrasi `20261116_pf_v16_bookmark_pengetahuan.sql`; CUTOVER §3.17 |

### 31.2 Integrasi — 7 perbaikan baterai basi (semua sisi-tes, didokumentasi)

Pemindahan `cariKandidat` (FU5+6) + v15/v16 + situs 500 baru
mematahkan 6 baterai + 1 asersi. Semua diperbaiki koordinator
(dengan bukti, bukan dengan menghapus asersi):

1. `uji-fase6` CRASH — STOPWORDS + `kataKunci` dibaca dari
   `route.ts`, sudah pindah ke `src/lib/tanya/retrieval.ts` →
   path baterai dialihkan. SEMUA LOLOS.
2. `uji-fase8-gel2-tanya-podcast` 64/2 — ekstraksi fungsi murni +
   korpus retrieval dialihkan ke `retrieval.ts`; asersi perilaku
   route (menunggu/tidak_ada_data/kategori/publik) tetap baca
   `route.ts`. **72/72** (naik karena sub-asersi yang tadinya
   ter-skip kini jalan).
3. `uji-ultimate-backend` P2-11 — query `.in("indikator_id", ids)`
   dibaca dari `retrieval.ts`. **115/115**.
4. `uji-ultimate-b2-tanya` F1 — `cariKandidat` diekspor dari
   `retrieval.ts` + job draf mengimpor dari lib. **92/92**.
5. `uji-fase8-gel1` T1-sisa — asersi lama ("route tanpa
   `createClient()`") basi pasca-C-3: route kini memakai
   `createClient()` untuk sesi + baca jawaban harian MILIK SENDIRI
   (policy "baca sendiri", by design). Asersi baru menguji sifat
   keamanan yang sebenarnya: kunci (`pf_quiz_answers`) dibaca
   HANYA via service role (tepat satu situs `.from()`, memakai
   `await service`). **159/159**.
6. `uji-tahapC-limitasi` C-4 — total `catatGalatRoute` 52 → 53
   (situs 500 baru di POST /api/bookmark, FU5/6 — sah). **87/87**
   (naik dari 78: +7 asersi PPR §31.3 + 2 asersi objek Supabase).
7. `uji-fase7` 85/2 — (a) ekspektasi 61 tabel/61 RLS/119 policy
   basi: v15 menambah `pf_quiz_daily_answers` (62/62/120);
   baterai kini menjalankan v1–v16. (b) Skenario skor kuis
   ditulis ulang untuk dunia v15: seed 5 soal + jawaban
   tersimpan (4 benar), trigger menghitung ulang; CHECK
   benar/total kini diuji lewat definisi skema
   (`pg_constraint`) karena trigger menimpa nilai SEBELUM
   CHECK dievaluasi — penolakan insert langsung tidak lagi
   menguji CHECK (dijelaskan di komentar baterai). **91/91**.

Kesalahan koordinator sendiri (jujur): edit pertama RLS
mengubah label jadi "RLS 62/62" tetapi perbandingan tetap
`=== 61` — ketahuan lewat probe PGlite, diperbaiki, kini
detail hitungan dicetak (`${rlsAktif} aktif`).

### 31.3 Bug nyata ditemukan Tahap H — banjir log PPR (diperbaiki)

**Temuan:** smoke `next start` pertama: log 532 baris, penuh dump
stack trace `Error: During prerendering, fetch() rejects when the
prerender is complete` di /, /cerita, /brief, /negara, /podcast —
diklasifikasi keliru sebagai "galat baca database" oleh
`catatGalatBaca` (`src/lib/galat.ts`) + ditulis ke `pf_app_errors`
via `catatGalatAplikasi`. Halaman tetap 200 (React menangani),
tetapi tiap kunjungan halaman PPR membanjiri log + tabel galat.

**Akar:** artefak framework Next.js 16 PPR — shell statis selesai
lebih dulu dari fetch dinamis. Bukan galat database, bukan
regresi FU1–FU6 (jalur `galat.ts`/PPR tidak disentuh agen
follow-up). Varian kedua ketahuan dari log build: `cookies()`
rejects (route /tanya, `getJumlahPertanyaanMenunggu`).

**Perbaikan** (`src/lib/galat.ts`): fungsi baru
`galatPrerenderPPR(err)` — detektor keluarga pesan
("During prerendering," + "rejects when the prerender is
complete", API apa pun: fetch()/cookies()/headers()) — diperiksa
`catatGalatBaca` SEBELUM `galatTabelBelumAda`; bila cocok,
kembali `true` (empty state) tanpa log, tanpa tulis
`pf_app_errors`. **Jebakan yang ketahuan saat verifikasi:**
perbaikan pertama hanya menangani `Error`/string — di runtime
penolakan sampai sebagai OBJEK galat Supabase (`{ message,
details, hint, code }`), jadi dump tetap muncul; detektor
diperluas ke `message` + `details` objek, baru bersih.

**Verifikasi:** build log 0 baris "During prerendering";
smoke ulang: log **109 baris** (dari 532) — 0 dump PPR,
0 `[galat-db]`, 0 "galat baca database"; sisa hanya
PGRST205 empty-state jujur + 1 peringatan fail-open rate-limit
(PGRST202, terdokumentasi sampai v11 diterapkan) + notice
service key kuis. 9 asersi baru di `uji-tahapC-limitasi` §F
(detektor: Error/string/objek Supabase/varian cookies/negatif).

### 31.4 QC penuh — hasil

**Baterai: 35/35 hijau, 2.541 asersi terhitung + 5 baterai
SEMUA LOLOS (tanpa hitungan), 0 gagal.**

| Baterai | Hasil | Baterai | Hasil |
|---|---|---|---|
| uji-fase5 | SEMUA LOLOS | uji-tahapC-limitasi | 87/87 |
| uji-fase6 | SEMUA LOLOS | uji-tahapD-security | 145/145 |
| uji-fase7 | 91/91 | uji-tahapE-news | 76/76 |
| uji-fase8-gel1 | 159/159 | uji-integrasi14 | 112/112 |
| uji-fase8-gel2-admin | 84/84 | uji-followup1 | 70/70 |
| uji-fase8-gel2-akademi | 107/107 | uji-followup24 | 33/33 |
| uji-fase8-gel2-cerita | 66/66 | uji-followup3 | 15/15 |
| uji-fase8-gel2-migrasi | 28/28 | uji-ultimate-gate | 77/77 |
| uji-fase8-gel2-negara | 77/77 | uji-ultimate-ingestion | 71/71 |
| uji-fase8-gel2-riset | 71/71 | uji-ultimate-security | 109/109 |
| uji-fase8-gel2-tanya-podcast | 72/72 | uji-ultimate-backend | 115/115 |
| uji-editorial | SEMUA LOLOS | uji-ultimate-b2-akademi | 120/120 |
| uji-remediasi-integrasi | 17/17 | uji-ultimate-b2-akun | 114/114 |
| uji-remediasi-multisource | 71/71 | uji-ultimate-b2-migrasi | 32/32 |
| uji-tahap13-migrasi | 15/15 | uji-ultimate-b2-notifikasi | 54/54 |
| uji-tahap13a | 191/191 | uji-ultimate-b2-podcast | 61/61 |
| uji-tahap13b | 109/109 | uji-ultimate-b2-tanya | 92/92 |
| uji-tahap13c | SEMUA LOLOS | uji-ingestion | SEMUA LOLOS* |

\* `uji-ingestion`: 1 dilewati — GDELT HTTP 429 eksternal
(flake sejak Fase 3, dilewati by design, bukan gagal).
`uji-tahapE-news`: GDELT 429 juga teramati, 76/76 tetap lolos.
`uji-editorial` lambat (±337 dtk: fetch RSS live + pipeline) —
bukan gantung; dijalankan di latar.

**TypeScript / lint / build:** `npx tsc --noEmit` EXIT 0;
`npm run lint` EXIT 0; `npm run build` (Turbopack) EXIT 0 —
166/166 halaman, BUILD_ID `NM3JoG_bTU4FuDCRI5sV5`;
`npx next build --webpack` EXIT 0 — BUILD_ID
`aIgI56ULA_doTWIH7coI8` (webpack BUKAN jalur gate proyek,
dijalankan karena FU2 wajib meloloskannya).

**Smoke `next start` (port 3101, build `NM3JoG_bTU4FuDCRI5sV5`):**
12× 200 (/, /brief, /cari, /arsip, /peta, /data, /timeline,
/pengetahuan, /kuis, /tanya, /feed-saya, /rutin) + 8× 404
jujur; `/api/health` 200 `{"ok":false,"status":"degraded",
"db":"belum_tersedia"}` (jujur, pra-migrasi); CSP hadir di /
dan 404, nonce unik per request, script-src nonce +
strict-dynamic + hash tema, tanpa unsafe-inline/unsafe-eval;
log 109 baris, 0 dump PPR (§31.3). Catatan: /artikel (indeks)
404 BY DESIGN — `src/app/artikel/` hanya berisi `[slug]`,
tanpa `page.tsx`; /profil 307 (redirect login, wajar).

**Aksesibilitas + responsif (spot-check STATIS, bukan visual):**
`<html lang="id">` ✓; viewport meta
`width=device-width, initial-scale=1` hadir di HTML prerender
(default Next.js — tanpa `user-scalable=no`, pinch-zoom
diizinkan) ✓; 1/1 `<img>` punya `alt` + width/height + lazy ✓;
10 aturan `@media` di `globals.css` (640/768/1024px +
`prefers-reduced-motion`) — mekanisme responsif ADA di kode
(proyek memakai CSS kustom, bukan Tailwind — 0 prefix
`sm:/md:` adalah ekspektasi, bukan temuan). **Render visual
320–1920px BELUM DIUJI** (browser tidak tersedia untuk
subagen) — TIDAK diklaim; 122 tombol belum diperiksa satu per
satu nama aksesibelnya (status sama seperti Tahap 15).

**Infra darurat selama Tahap H:** /tmp/pf-sqlcheck (PGlite)
hilang lagi saat VM diganti — diinstal ulang
(`npm install @electric-sql/pglite` di /tmp/pf-sqlcheck);
bila baterai PGlite gagal MODULE_NOT_FOUND, periksa direktori
itu dulu.

### 31.5 Risiko tersisa (jujur, tidak ditutup)

- T10 compensating (FU1) BUKAN transaksi atomik: proses mati
  di antara mutasi-audit → baris yatim tetap mungkin; hanya
  RPC/transaksi DB yang menutupnya (tidak dibuat, sesuai
  aturan). Versi/review/verifikasi yang ikut terhapus cascade
  saat hapus-balik tidak dapat dipulihkan; notifikasi
  best-effort yang sudah terkirim tidak dapat ditarik.
- T6 pinning: DIPERSEMPIT, penutupan penuh belum terverifikasi
  dari egress langsung (Vercel/staging) — tetap butuh uji
  pasca-live.
- CSRF live + flag cookie sesi: belum diuji live (hanya statis
  + baterai D).
- Scheduler live: 0 run Actions (menunggu deploy + secret).
- TTS server Podcast: TETAP BELUM BISA (lisensi suara id_ID
  Piper tidak jelas — bukti primer MODEL_CARD).
- Responsif visual 320–1920px + klik browser nyata + login
  staf nyata: belum diuji (butuh browser/HP).
- Produksi: 0 tabel `pf_*` (PGRST205); migrasi v1–v16 +
  deploy Vercel menunggu akses pemilik (lihat §31.6).

### 31.6 Status production + pekerjaan berikutnya

**BELUM LIVE.** Blokir tidak berubah sejak B1: (1) migrasi
v1–v16 di Supabase produksi via SQL Editor (prosedur
`supabase/CUTOVER.md` §3, tahap 3A–3F; validasi 62/62/120 +
seed 5 job) — atau serahkan `SUPABASE_SERVICE_ROLE_KEY` via
Secure Vault; (2) pulihkan deploy Vercel 403 (opsi A hubungkan
ulang / B import manual / C ZIP sumber — `DEPLOY.md`);
(3) isi 6 env var Vercel + 3 secret GitHub Actions + 4 env var
VAPID + allowlist Redirect URL `/saya/hapus-akun/konfirmasi` +
buat bucket `podcast-audio` publik; (4) backup baseline +
pasca-migrasi 62/62; (5) sesudah live: uji login + klik browser
nyata + HP/desktop, tetapkan super_admin pertama, verifikasi
pinning T6 dari egress langsung, uji CSRF live + flag cookie
sesi. **JANGAN sebut live sebelum deployment berhasil + diuji.**

Commit menunggu push agen utama (koordinator tidak punya
token): B2 (`f38f7ec` + `aed1d28`), Tahap D (`9b494e8`),
Tahap F (`d362661`), Tahap E (`5edb38c`), Tahap C (`c5455a7`),
integrasi C–G (`c3efa51`), + commit Tahap H (follow-up 1–6,
integrasi, perbaikan PPR, §31 ini — hash menyusul).
92 berkas berubah (belum commit) saat §31 ditulis; token
GitHub perlu ditempel ulang di chat (dipakai transiently,
tidak disimpan).

---

*Dokumen ini ditulis 16 November 2026, sesudah Tahap 15–17,
diperbarui Gelombang B1 (commit `ebd4cf7`, §29),
Gelombang B2 (commit `f38f7ec`, §30), dan Follow-up 1–6 +
Tahap H (§31).
Semua angka dari pengujian nyata lokal (PGlite + Node 24 +
`next start`); tidak ada angka dari production karena situs
belum live. Bila satu angka di sini terbukti salah, perbaiki
angka itu — jangan hapus barisnya.*
