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

## 20. Build results

- `npm run build` → **EXIT 0, 147/147 halaman** (generate
  4,9 dtk), BUILD_ID `NyTEjrq_2Hs81joEYhase` (Tahap 15,
  16 Nov 2026).
- Komposisi: ~14 statis (○) + mayoritas dinamis (ƒ, baca data
  per request — arsitektur sejak Fase 1–7, bukan regresi CSP)
  + sub-rute partial-prerender (◐).
- Riwayat build: Fase 7: 87/87; Gelombang 2: 147/147; Tahap 15
  run pertama **EXIT 1** (prerender `/_not-found` +
  `/kategori/[slug]` gagal — `headers()` di root layout) →
  diperbaiki (hash skrip tema) → EXIT 0.
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

## 23. Sisa risiko

1. **T6 penutupan penuh belum terverifikasi** — pinning tidak
   bisa tersambung dari VM; butuh verifikasi dari egress
   langsung (Vercel/staging).
2. **T3 fail-open sampai v11 diterapkan** — limiter DB tidak
   aktif sebelum migrasi v11; NAT/CGNAT berbagi ember.
3. **CSRF sebagian** — tanpa cek Origin; bersandar SameSite Lax.
4. **Flag cookie sesi belum diuji.**
5. **Run live GitHub Actions 0** — lock antar-run bersamaan,
   retry, dan assert `jq` di runner nyata belum teruji.
6. **Uji login + klik browser nyata + HP/desktop belum diuji.**
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
13. **Arsip Q&A publik** dibaca via service role (utang policy).
14. **Audio Podcast / Traffic Analytics / sertifikat** belum
    bisa (tanpa layanan gratis / penilaian).
15. **Vercel 403** — deploy terblokir sampai pemilik bertindak.

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
| *(Tahap 15–17)* | Tahap 15–17 — regression + readiness + dokumentasi *(hash menyusul — commit Tahap 15–17, lihat `git log`)* |

Catatan: koordinator (subagen) hanya commit lokal; push
dilakukan agen utama.

## 25. File berubah

- **Tahap 13–17 (sejak `5d3b17b`): 128 berkas berubah,
  +7.246 / −926 baris** (diukur `git diff 5d3b17b --cached
  --stat` sesudah staging commit Tahap 15–17).
- Baru: migrasi v11 + v12; `src/lib/csp.ts`;
  `src/lib/admin/audit.ts`; `src/lib/ingestion/feed-allowlist.ts`;
  `src/lib/scheduler/` (`jobs.ts`, `flags.ts`);
  `src/components/DaftarForm.tsx`; 3 workflow
  (editorial-pipeline, daily-brief, terbitkan-terjadwal);
  baterai `uji-tahap13a/b/c`, `uji-tahap13-migrasi`,
  `uji-integrasi14`; `FINAL-PROJECT-COMPLETION.md`;
  `PANDUAN.md`.
- Diubah: `src/lib/ai/route-auth.ts` (limiter DB),
  `src/lib/ingestion/ssrf.ts` (~470 baris, pinning),
  `src/proxy.ts` (CSP header), `src/app/layout.tsx` (hash tema),
  `/artikel/[slug]` + `/pengetahuan/[slug]` (nonce JSON-LD +
  bar konteks), 74 berkas sapuan limiter, 13 berkas T4,
  route admin (audit fail-closed), 5 workflow/route cron,
  `src/lib/admin/editorial.ts` (backoff), `LAPORAN-FASE-8.md`
  (§14), `LAPORAN-AKHIR.md` (§14), `AUDIT-EXPANSION.md` (§9.8),
  `README.md`, `DEPLOY.md`, `supabase/CUTOVER.md` (v1–v12),
  `supabase/README.md`, `scripts/backup-pf.mjs` (54 tabel).
- Dihapus: `.github/workflows/editorial.yml` (dipecah 3).
- Total repo: 77 halaman + 80 rute API; 54 tabel migrasi;
  20+ baterai uji di `scripts/`.

## 26. Status production

| Aspek | Status |
|---|---|
| Kode | **Selesai, terverifikasi lokal** (Tahap 13–17) |
| Migrasi produksi | **Terblokir** — v1–v12 belum dijalankan (butuh pemilik) |
| Deploy Vercel | **Terblokir** — 403 akses tim `prataava` (butuh pemilik) |
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

1. **Jalankan migrasi v1–v12** di Supabase produksi via SQL
   Editor (prosedur `supabase/CUTOVER.md` §3, tahap 3A–3F;
   validasi 54/54/106 + seed 5 job). Alternatif: berikan
   service-role key lewat Secure Vault agar Muse menjalankan.
2. **Pulihkan akses deploy Vercel 403** — putuskan opsi A
   (hubungkan ulang di Muse + setujui akses tim `prataava`),
   B (import manual di dashboard Vercel), atau C (ZIP sumber).
3. **Isi 6 env var Vercel + 3 secret GitHub Actions** (nama
   saja di `DEPLOY.md`; nilai tidak pernah lewat chat).
4. **Backup baseline + pasca-migrasi 54/54.**
5. **Tetapkan super_admin pertama** sesudah migrasi.
6. **Nonaktifkan signup di dashboard Supabase Auth** bila
   pendaftaran ingin ditutup penuh (flag aplikasi saja tidak
   cukup).
7. **Keputusan T3 edge** (rate limit di edge) bila diinginkan.
8. **Keputusan audio Podcast** (file MP3 server) bila diinginkan.
9. **Uji live sesudah deploy:** login + klik browser nyata +
   HP/desktop; verifikasi pinning T6 dari egress langsung;
   uji CSRF live + flag cookie sesi.

## 28. Langkah terakhir menuju peluncuran

1. Pemilik menjalankan migrasi v1–v12 + validasi 54/54/106
   (§27.1).
2. Pemilik memulihkan deploy Vercel + isi env/secret (§27.2–3).
3. Muse deploy kode (commit Tahap 13–17, sudah di-push) +
   verifikasi `GET /api/health` = `db: "ok"`.
4. Backup pasca-migrasi 54/54 + tetapkan super_admin pertama.
5. Verifikasi live: 12× 200 + 8× 404 (seperti smoke lokal),
   CSP header + nonce unik, login 3 peran, klik alur utama,
   HP 320–430px + desktop, pinning T6, CSRF + cookie.
6. Nyalakan scheduler (secret Actions sudah terisi) + amati
   run pertama ingestion + pipeline + brief.
7. Umumkan URL produksi + pantau `/api/health` dan
   `/admin/monitoring` 24 jam pertama.

**Kriteria "LIVE" (tegas):** migrasi 54/54/106 terverifikasi
di produksi + deploy Vercel berhasil + `/api/health`
`db: "ok"` + login + klik browser nyata lolos + tanpa error
di log. Sebelum itu, status tetap **BELUM LIVE**.

---

*Dokumen ini ditulis 16 November 2026, sesudah Tahap 15–17.
Semua angka dari pengujian nyata lokal (PGlite + Node 24 +
`next start`); tidak ada angka dari production karena situs
belum live. Bila satu angka di sini terbukti salah, perbaiki
angka itu — jangan hapus barisnya.*
