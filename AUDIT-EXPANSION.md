# AUDIT EXPANSION — PRATA FAKTA Fase 8: Advanced Intelligence

**Tanggal:** 16 November 2026
**Status:** Audit selesai (read-only). Gelombang 1 selesai &
terverifikasi (commit `f1e68d6`, uji 120/120, build 94/94).
Gelombang 2 DIMULAI lalu DIBATALKAN atas perintah pemilik
16 Nov 2026 ±06.29 WIB — prioritas dialihkan ke Audit &
Production Readiness Gate (lihat §9). Pembangunan 14 area
DITUNDA sampai gate lolos.
**Metode:** Dua auditor paralel (A: aplikasi/API/AI; B: database/desain) +
sintesis koordinator dari `ARSITEKTUR.md` (948 baris),
`LAPORAN-AKHIR.md` Fase 7, `supabase/README.md`, dan
`/tmp/pf-fase7-audit-keamanan.md`. Repo TIDAK diubah selama audit.
Catatan lengkap auditor: `/tmp/pf-fase8-audit-a.md` (58 KB),
`/tmp/pf-fase8-audit-b.md` (43 KB).

> Kejujuran audit ini: "ada" berarti ditemukan di kode/migrasi dan
> dibaca langsung, bukan diasumsikan. "Belum di produksi" berarti
> migrasi v1–v7 belum dijalankan di Supabase produksi dan deploy
> Vercel masih blokir 403 — semua pernyataan RLS berarti
> "diperintahkan aktif oleh berkas migrasi", bukan "terbukti di
> produksi".

## 0. Koreksi penafsiran auditor (penting — dibaca dulu)

Dua auditor menafsirkan dua area tidak sesuai brief pengguna
16 Nov 2026 ±06.11 WIB. Yang benar (sesuai brief):

- **Area 5 Reality Check = pusat data & statistik Indonesia +
  dunia** (grafik interaktif, perbandingan periode, satuan, tanggal
  data, metodologi, tautan sumber). BUKAN sistem kartu verdict
  cek-fakta (BENAR/MENYESATKAN/SALAH) — verdict cek-fakta adalah
  bagian dari sistem verifikasi Fase 4/5 yang sudah ada.
  Implikasi: area 5 = pengembangan `/data` Fase 6, tanpa tabel
  baru (kecuali perluasan indikator bila diperlukan).
- **Area 13 Public Report = fitur laporan masyarakat**
  (pengguna melaporkan: kesalahan informasi, sumber tidak valid,
  gambar tidak sesuai, berita duplikat, artikel perlu diperbarui;
  semua laporan wajib dimoderasi). BUKAN laporan transparansi
  agregat publik. Implikasi: area 13 = perluasan
  `pf_correction_reports` (jenis baru) + formulir publik +
  moderasi di `/admin/koreksi` yang sudah ada.

## 1. Ringkasan eksekutif

| # | Area | Status awal | Upaya | Gelombang |
|---|---|---|---|---|
| 1 | Jejak Fakta | Mesin ada, tampilan publik tidak | Kecil | 1 |
| 2 | Story Tracker | Sebagian (event/timeline ada) | Sedang | 2 |
| 3 | Multi-Source View | Mesin ada, tampilan tidak | Kecil | 1 |
| 4 | Explain the World | Sebagian (pengetahuan ada) | Sedang | 2 |
| 5 | Reality Check | Sebagian (/data ada) | Sedang | 2 |
| 6 | Ask the World | Sebagian (/tanya ada) | Sedang | 3 |
| 7 | My Prata | Fondasi lengkap, tanpa dasbor terpadu | Kecil | 1 |
| 8 | PRATA Academy | NIHIL (grep 0) | Besar | 3 |
| 9 | PRATA Podcast | NIHIL (grep 0); butuh keputusan audio | Besar | 3 |
| 10 | PRATA Research | Pemasok angka ada, produk riset tidak | Sedang | 2 |
| 11 | Country Profile | Sebagian kecil | Sedang–besar | 2 |
| 12 | Historical Archive | Sebagian | Sedang | 2 |
| 13 | Public Report | Tersebar (laporan koreksi ada) | Kecil | 1 |
| 14 | Admin Control Center | Fondasi terkuat | Besar (bertahap) | 4 |

**Urutan gelombang (dampak/stabilitas/kebutuhan/kesiapan):**
Gelombang 1 = migrasi v8 (T5/T8 + tabel baru) + perbaikan desain
G1/G2 + area 1, 3, 13, 7. Gelombang 2 = area 2, 4, 5, 10, 11, 12.
Gelombang 3 = area 6, 8, 9. Gelombang 4 = area 14 + regression
penuh + verifikasi akhir.

## 2. Inventaris terverifikasi

- **Halaman:** 41 `page.tsx` (13 `/admin` + 28 publik) — build
  Fase 7 melaporkan 87 rute total (halaman + API + sitemap/robots/
  RSS). Jumlah route API hasil hitung koordinator: **42**
  (`find src/app/api -name route.ts`); auditor A menulis 39,
  auditor B 43 — angka koordinator (42) yang dipakai.
- **Database:** **36 tabel `pf_*`, RLS 36/36, 79 policy**
  (dihitung ulang auditor B dari berkas: v1 8/18, v2 8/33, v3 2/2,
  v4 5/6, v5 3/3, v6 9/14, v7 1/3; total 79 ✓). Fungsi:
  `pf_has_role`, `pf_is_super_admin`, `pf_handle_new_user`
  (SECURITY DEFINER, `search_path=public` sejak v7 — T7),
  `pf_set_updated_at()`.
- **API:** 42 route (21 `/api/admin/*`, 5 `/api/ai/*`, 2 ingestion,
  sisanya pengguna/publik). Semua route POST terverifikasi punya
  rate limiter (temuan awal "tanpa limiter" dikoreksi auditor A:
  yang ada adalah duplikasi helper limiter + in-memory
  per-instance + IP dari `x-forwarded-for` — sisa T3).
- **AI:** 10 agen terdaftar; 9 berjalan deterministik (Research,
  Source Analysis, Fact Verification, Summarization, Article
  Writing, Translation parsial, Trend Analysis, Daily Brief,
  Editorial Quality), Data Analysis jalan sejak Fase 6.
  Mekanisme jujur: pipeline deterministik + orkestrasi Muse
  (cron/chat); tanpa panggilan model eksternal.
- **Workflow:** 3 berkas GitHub Actions mencakup 5 jadwal
  (ingestion */30, editorial 6 jam, brief 05.00 WIB,
  data-analysis Senin 01.00 UTC, terbitkan-terjadwal tiap jam) —
  koreksi atas laporan Fase 7 yang menulis "5 workflow".
  Semuanya TIDAK AKTIF (butuh deploy + secret).
- **Storage:** Supabase Storage TIDAK dipakai repo ini sama
  sekali (tidak ada bucket) — Podcast butuh bucket baru bila
  memakai file audio.

## 3. Keamanan — T5 & T8 (wajib masuk migrasi v8)

### 3.1 T5 — Insert anonim melewati rate limit API

Policy persis (ditemukan auditor B):
- `v1:253-255` — `"pf_newsletter daftar publik"`,
  `for insert with check (true)` (`pf_newsletter_subscribers`).
- `v2:398-400` — `"pf_correction_reports kirim publik"`,
  `with check (true)`.
- `v6:361-364` — `"pf_questions tambah publik"`,
  `with check (user_id = auth.uid() or user_id is null)`.

**Ketergantungan kritis:** ketiga route
(`src/app/api/langganan/route.ts:51-54`,
`src/app/api/laporan/route.ts:132`,
`src/app/api/tanya/route.ts:192-194`) memakai **session
client**, BUKAN service role. Mencabut policy tanpa patch kode
akan memutus ketiga route. Helper service role sudah ada
(`src/lib/supabase/service.ts`, `createServiceClient()`).

**Rencana v8:** (1) patch ketiga route ke service role +
deploy; (2) `DROP POLICY IF EXISTS` ketiga policy insert
anonim, TANPA policy insert pengganti (service_role bypass
RLS); (3) verifikasi negatif (INSERT anon via REST → ditolak;
POST via route → 200 + rate limit 5/mnt tetap berlaku).
Opsi ditolak: CAPTCHA di trigger (tidak ada layanan
terverifikasi), rate limit via trigger (IP tidak tepercaya di
PostgREST), `auth.uid() is not null` (hanya pindah masalah ke
akun gratis). **Area 5/13 dan ajuan anonim baru wajib
dirancang sesudah/memakai v8; jangan tambah insert anonim baru.**

### 3.2 T8 — Baca publik berlebih

Policy persis:
- `v1:197-199` `"pf_roles baca"` `using (true)`;
  `v1:200-202` `"pf_permissions baca"`;
  `v1:203-205` `"pf_role_permissions baca"`.
- `v2:257-259` `"pf_article_sources baca publik"` `using (true)`;
  `v2:323-325` `"pf_article_tags baca publik"` `using (true)`.

Presisi (auditor B): yang bocor adalah **pf_article_tags**
(relasi artikel↔tag dari artikel DRAF); `pf_tags` sendiri
adalah taksonomi mandiri tanpa tautan artikel — baca publiknya
tidak bocor, dipertahankan. (LAPORAN-AKHIR §3 menulis
"pf_tags", audit keamanan menulis "pf_article_tags" — yang
benar versi audit.)

**Ketergantungan kritis:** `src/lib/auth/roles.ts:32-48` —
`getUserRoles()` memakai session client + JOIN
`pf_user_roles → pf_roles(nama)`. Membatasi `pf_roles` ke
staf-only secara naif akan MEMUTUS `getUserRoles()` untuk
pengguna biasa (return `[]` → guard fail-closed).
`pf_permissions`/`pf_role_permissions` tidak dibaca kode
aplikasi mana pun → aman staf-only. Pembaca sah T8-d/e:
`src/lib/data.ts:324,328` (halaman artikel terbit).

**Rencana v8:** `pf_roles` → Opsi A (direkomendasikan):
`using (auth.uid() is not null)` — anon diblokir,
`getUserRoles()` tetap jalan; Opsi B (ketat): staf-only +
`getUserRoles()` pindah ke fungsi SECURITY DEFINER atau
service client. `pf_permissions`/`pf_role_permissions` →
staf-only (4 peran). `pf_article_sources`/`pf_article_tags` →
filter `EXISTS (select 1 from pf_articles a where a.id =
artikel_id and a.status = 'terbit') OR staf` — pola yang
sudah dipakai `pf_article_versions` (v2:215-226). Policy
tulis tidak diubah.

### 3.3 T1-sisa — kolom kunci kuis masih bisa dibaca via REST

Fase 7 menutup kunci kuis di lapis API (`POST /api/kuis/jawab`,
server-side), tetapi policy DB `pf_quiz_questions` masih
mengizinkan baca publik SEMUA kolom termasuk `kunci` — siapa
pun yang memegang anon key (publik, tertanam di frontend)
bisa `GET /rest/v1/pf_quiz_questions?select=kunci`.
**Rencana v8:** `REVOKE SELECT (kunci) ON pf_quiz_questions
FROM anon, authenticated;` + pastikan `/api/kuis/jawab`
membaca kunci via service role (bila saat ini memakai session
client, patch dulu seperti T5). Uji negatif di PGlite.

### 3.4 Perluasan CHECK enum (D4) — wajib di v8

Tiga CHECK enum akan memblokir expansion bila tidak diperluas:
`pf_audit_logs.aksi` (18 nilai — tambah aksi Fase 8),
`pf_scheduled_jobs.nama` (hanya ingestion/editorial/brief —
tambah data-analysis/podcast/terbitkan-terjadwal/digest),
`pf_ai_runs.agen` (10 nilai — tambah agen baru bila ada).
Dilakukan dengan `ALTER TABLE ... DROP CONSTRAINT` +
`ADD CONSTRAINT` (idempoten, aman diulang).

### 3.5 Temuan DB lain (D1–D3, masuk v8 bila aman)

- D1 — `pf_quiz_questions.opsi` jsonb tanpa CHECK panjang
  array (validasi hanya di aplikasi).
- D2 — `lintang`/`bujur` di `pf_events`/`pf_articles` tanpa
  CHECK rentang (-90..90/-180..180); peta hanya memfilter NULL.
- D3 — `pf_followed_topics.target` teks bebas tanpa FK (typo
  tidak tertolak). Perbaikan penuh butuh validasi target
  terhadap `pf_categories`/`pf_countries` — dilakukan bertahap
  (validasi di API dulu, FK bila memungkinkan).

## 4. Desain — Hybrid Editorial Premium (temuan auditor B)

Token brief lengkap & benar; **self-ref 0**; **var() tak
terdefinisi di globals.css 0**; tipografi Source Serif 4 +
Inter konsisten; skrip anti-kedip tema (`layout.tsx:36-39`,
localStorage `pf-tema`); footer selalu gelap di kedua mode
(pilihan editorial, bukan bug); `prefers-reduced-motion` ada;
pola empty state/skeleton/error konsisten (`EmptyState`
bersama + `role="status"`, `.kerangka` di 6 tempat,
`.pesan-error`/`.pesan-sukses` di 10 berkas); 13 halaman admin
+ komponen bersama lengkap (Header/Footer/BottomNav/SearchBar/
NewsletterForm/ThemeToggle/KartuArtikel/PembacaArtikel/
PembacaSuara/PetaDunia/KuisHarian/dll.).

**Inkonsistensi (wajib diperbaiki Gelombang 1):**
- **G1 (terpenting) — token tak terdefinisi + fallback hex
  hardcoded, tidak adaptif mode gelap:**
  `src/app/data/page.tsx:81,83` memakai
  `var(--aksen, #b91c1c)` — `--aksen` tidak ada (yang benar
  `--accent`); fallback `#b91c1c` bukan warna palet.
  `src/components/artikel/PembacaSuara.module.css:7,34,35`
  memakai `var(--garis, #e5e7eb/#d1d5db)` dan
  `var(--latar-kartu, #fff)` — yang benar `--border`/
  `--surface`; di mode gelap panel TTS tetap terang.
  `src/components/peta/PetaDunia.module.css:6` sama
  (`--garis`), baris 7 `background: #eef2f5` hardcoded mentah.
  Perbaikan: ganti ke `var(--accent)`/`var(--border)`/
  `--surface`/`--surface-2`, hapus fallback hex, uji kedua mode.
- **G2 — marker peta hardcoded:** `PetaDunia.tsx:65` —
  `#b91c1c`, `#fff`, `rgba(0,0,0,.45)` dalam string divIcon
  Leaflet; bukan token, tidak adaptif gelap. Pakai
  `var(--danger)`/`var(--accent)` atau kelas CSS.
- **G3 — token mati:** `--muted-token: #8492a6` dan
  `--navy: #101827` didefinisikan tapi tidak pernah dipakai
  di `src/` mana pun. Hapus atau pakai.
- **G4 — lencana:** semua 6 status verifikasi tercakup; tapi
  tidak ada varian lencana untuk status artikel
  (draft/terjadwal/diarsipkan) — pola visual tidak seragam.
- **G5 — kecil:** `.kerangka` hanya div kosong tinggi tetap
  tanpa varian kartu/teks; tidak ada komponen LoadingState
  bersama untuk admin.

## 5. Per-area — sudah ada / kurang / rencana

### 5.1 Jejak Fakta — fondasi kuat
- **Ada:** provenance `pf_articles.raw_item_id` →
  `pf_raw_items` + `disalin_dari_id`
  (`lib/ingestion/dedup.ts`, `engine.ts`); rantai
  `pf_claims`→`pf_evidence`→`pf_verification_records` (v4,
  `lib/ai/verification.ts`); riwayat versi
  (`pf_article_versions` + `getVersiArtikel`, `data.ts:600`);
  kronologi + lencana "Dikoreksi pada …" di
  `PembacaArtikel.tsx`; audit log 18 aksi +
  `/admin/fakta/[id]`.
- **Kurang:** jejak klaim→bukti tidak tampil publik
  (RLS staf-only).
- **Rencana:** seksi/route jejak di artikel (`getJejakFakta`
  di `lib/data.ts`) + policy baca publik terbatas di v8
  (pola `pf_article_versions`: hanya bila artikel `terbit`);
  komponen `JejakFakta.tsx`. Tanpa tabel baru.

### 5.2 Story Tracker — sebagian
- **Ada:** `pf_events` + `pf_event_timeline` + `/timeline`;
  follow topik (`pf_followed_topics`, `POST /api/topik`);
  tren isu berkembang (`pipeline.ts:905`).
- **Kurang:** tidak ada entitas Story, halaman
  `/cerita/[slug]`, tombol ikuti cerita, atau notifikasi
  perkembangan cerita.
- **Rencana:** tabel baru `pf_stories` + `pf_story_events` +
  `pf_story_articles` + `pf_story_followers` (v8);
  `GET /api/cerita*`, `POST /api/cerita/[slug]/ikuti`;
  filter cerita di `/timeline`; pengelompokan event→cerita
  oleh Muse/editor (bukan otomatis deterministik).
  **Prasyarat:** `/admin/event` + `GET/POST /api/admin/event*`
  — saat ini tidak ada UI admin untuk membuat event sama
  sekali (blokir operasional area 2/12).

### 5.3 Multi-Source View — mesin ada, tampilan tidak
- **Ada:** `pf_article_sources` + seksi "Sumber & Referensi";
  tier sumber + skor kredibilitas 90/75/60
  (`lib/ai/source-analysis.ts`); koroborasi dua sinyal
  (`verification.ts`, salinan = 1 sumber); 7 feed RSS + GDELT.
- **Kurang:** tidak ada perbandingan berdampingan (matriks
  klaim × sumber), tidak ada penanda "N sumber independen"
  publik.
- **Rencana:** komponen `PerbandinganSumber.tsx` +
  `getPerbandinganSumber` di `lib/data.ts`; kolom
  `peran`+`kutipan` di `pf_article_sources` (v8); tampilkan
  bobot bukti eksplisit (tier + jumlah independen) — JANGAN
  menciptakan kesetaraan palsu antara bukti kuat dan klaim
  tanpa bukti. Tanpa tabel baru (view SQL opsional).

### 5.4 Explain the World — sebagian
- **Ada:** `/pengetahuan` + `/pengetahuan/[slug]`
  (`pf_knowledge_articles`, 9 topik, Fakta Hari Ini, JSON-LD,
  404 nyata via `proxy.ts`); `/rutin/dunia`; `/tanya` memakai
  pengetahuan sebagai korpus.
- **Kurang:** tanpa format explainer (lapis ringkas→mendalam,
  "Mengapa penting", istilah kunci, tingkat kesulitan) dan
  **tanpa halaman admin pengetahuan**.
- **Rencana:** kolom `jenis`/`tingkat`/`estimasi_baca_menit`/
  `seri_slug` di `pf_knowledge_articles` (v8);
  `/admin/pengetahuan` + `GET/POST/PATCH
  /api/admin/pengetahuan`; draf explainer via `writing.ts` +
  review Muse/editor.

### 5.5 Reality Check — sebagian (/data ada) [dikoreksi §0]
- **Ada:** `/data` (indikator + grafik garis SVG + tabel poin,
  `pf_data_indicators`/`pf_data_points`, metodologi, sumber,
  tanggal pembaruan); agen Data Analysis ke-10; tren
  (`trends.ts`); kategori `fakta-mitos` (bukan area ini).
- **Kurang:** grafik belum interaktif penuh (SVG statis),
  tanpa perbandingan periode (antar-tahun) di UI, tanpa
  pusat data yang dikurasi per tema Indonesia/dunia.
- **Rencana:** kembangkan `/data` — grafik interaktif
  (hover nilai + pilih rentang), perbandingan periode
  (YoY/pemilihan tahun), kartu tema Indonesia vs Dunia,
  tautan sumber resmi per indikator; kolom
  `cakupan`/`frekuensi_update` di indikator (v8, bila
  diperlukan). Tanpa tabel baru tahap pertama. Verdict
  cek-fakta TIDAK termasuk area ini.

### 5.6 Ask the World — sebagian, korpus sempit
- **Ada:** `/tanya` + `POST /api/tanya` (retrieval ekstraktif
  artikel+pengetahuan terbit, `kataKunci` token ≥4 huruf,
  skor judul 3/isi 1, maks 3 referensi; cocok → `terjawab`,
  tidak → `menunggu` di `pf_questions`; anonim; 5/mnt).
- **Kurang:** korpus hanya artikel/pengetahuan sendiri;
  tanpa arsip terjawab publik; tanpa penjawab antrean.
- **Rencana:** perluas korpus ke `pf_data_indicators/points`
  + `pf_events` + `pf_countries` (Gelombang 2); kolom
  `publik`/`kategori`/`membantu` di `pf_questions` (v8);
  `GET /api/tanya/arsip` + halaman arsip Q&A terjawab;
  penjawab antrean via cron Muse (isi `jawaban` +
  notifikasi penanya, tanpa SLA — mekanisme jujur Fase 4).
  Setiap klaim jawaban WAJIB menunjukkan sumbernya; tanpa
  referensi → akui keterbatasan.

### 5.7 My Prata — fondasi lengkap, tanpa dasbor terpadu
- **Ada:** `/profil`, `/feed-saya` (topik, rekomendasi,
  notifikasi, bookmark, riwayat), `pf_bookmarks` +
  `POST /api/bookmark`, `pf_reading_history` +
  `POST /api/riwayat`, `pf_quiz_scores` (v7) +
  `POST /api/kuis/skor`, `pf_notifications`, tema
  localStorage.
- **Kurang:** tanpa satu halaman "Saya" (statistik baca,
  streak kuis, lencana), tanpa preferensi tersimpan di
  server, tanpa ekspor data/hapus akun.
- **Rencana:** `src/app/saya/page.tsx` + `getRingkasanSaya`
  (agregasi tabel yang ada — statistik baca NYATA dari
  riwayat, streak dari `pf_quiz_scores.tanggal`, digest
  personal dari brief + topik diikuti); tabel
  `pf_user_preferences` (v8); `GET/PATCH
  /api/saya/preferensi`, `GET /api/saya/ekspor`;
  pengaturan privasi (tampil di `/saya/pengaturan`).

### 5.8 PRATA Academy — NIHIL
- **Ada:** tidak ada (grep `akademi|kursus|sertifikat` = 0).
  Yang bisa dipakai ulang hanya bahan mentah
  (`/pengetahuan`, `/kuis`, `/rutin`, auth/peran).
- **Kurang:** semuanya.
- **Rencana (dari nol, upaya besar):** `pf_courses` +
  `pf_course_modules` + `pf_course_lessons` +
  `pf_course_progress` (v8; kunci JANGAN baca publik —
  pola T1); `src/app/akademi/**` (materi, artikel
  pembelajaran, quiz + pembahasan jawaban, progress,
  kategori, referensi); `POST /api/akademi/progres`,
  `POST /api/akademi/kuis/jawab` (server-side, pola
  `/api/kuis/jawab`); `/admin/akademi`; 1 modul percontohan
  diisi editor (tanpa seed dummy); sertifikat/diskusi
  ditunda ke Fase 9.

### 5.9 PRATA Podcast — NIHIL, butuh keputusan audio
- **Ada:** tidak ada (grep `podcast|episode` = 0). Yang ada
  hanya TTS browser (`PembacaSuara.tsx`, SpeechSynthesis —
  bukan podcast) dan naskah `/brief` + pola
  `src/app/rss.xml/route.ts`.
- **Kurang:** semuanya; dan repo belum memakai Supabase
  Storage sama sekali (tidak ada bucket).
- **Rencana:** sumber audio harus diputuskan dulu —
  rekaman manusia vs TTS server-side vs TTS browser saja.
  Yang BENAR-BENAR tersedia gratis: TTS browser
  (SpeechSynthesis) untuk pemutaran + playlist + riwayat +
  kecepatan. Pembuatan file audio (MP3) butuh layanan TTS
  server — bila tidak ada yang gratis/tanpa key, JANGAN
  klaim "podcast" berbasis file. Implementasi jujur:
  `pf_podcast_episodes` + `pf_podcast_subscriptions` (v8) +
  `src/app/podcast/**` + pemutar `<audio>` native BILA ada
  `audio_url`, bila tidak ada maka pemutaran via TTS atas
  teks episode (Daily Brief + artikel pilihan + episode
  mingguan dari kompilasi brief); kecepatan pemutaran,
  riwayat audio, playlist. RSS podcast enclosure (butuh
  file audio) = BELUM BISA bila tanpa file — laporkan
  jujur, jangan buat feed enclosure palsu. Hanya artikel
  sendiri (hak penggunaan jelas).

### 5.10 PRATA Research — pemasok angka ada, produk riset tidak
- **Ada:** agen Data Analysis ke-10
  (`lib/ai/data-analysis.ts`, `POST /api/ai/data-analysis`,
  workflow Senin 01.00 UTC); `/data` (indikator + grafik SVG
  + tabel poin, `pf_data_indicators/points`); tren
  (`trends.ts`).
- **Kurang:** tanpa halaman `/riset`, laporan riset,
  metodologi per laporan, dataset unduhan, sitasi.
- **Rencana:** `pf_research_reports` + `pf_documents`
  (jenis: laporan/dokumen/publikasi/penelitian/statistik;
  judul, penerbit, tanggal, url_sumber, metadata jsonb)
  (v8); `src/app/riset/**` (daftar + detail + pencarian
  dokumen); `GET /api/riset*`, `GET /api/riset/[slug]/dataset`
  (CSV dari `pf_data_points` nyata); `/admin/riset`;
  laporan disusun Muse/editor, JANGAN auto-terbit.
  Dokumen: metadata + tautan saja — JANGAN salin isi
  berhak cipta.

### 5.11 Country Profile — sebagian kecil
- **Ada:** follow negara (`pf_followed_topics` tipe
  `negara`, `POST /api/topik`); topik pengetahuan "negara";
  `/peta` (Leaflet, marker berkoordinat terverifikasi);
  `/rutin/dunia`.
- **Kurang:** tanpa tabel/halaman negara
  (`/negara/[kode]`), tanpa fakta kunci/indikator/berita/
  timeline per negara; "negara" hanya string bebas (tanpa
  validasi).
- **Rencana:** `pf_countries` (kode ISO-2 unique, nama,
  ibu kota, populasi, PDB, sistem pemerintahan, dll. —
  semua dengan sumber + periode referensi) +
  `pf_country_facts` (v8, isi mulai Indonesia saja, dari
  sumber resmi, tanpa angka karangan); kolom `negara_kode`
  FK di artikel/event/indikator; `GET /api/negara*`;
  validasi target topik negara terhadap tabel; perbaiki
  utang GDELT topik hardcoded "Indonesia" (`gdelt.ts`).

### 5.12 Historical Archive — sebagian
- **Ada:** `/arsip` (filter kategori/status/kata kunci/
  tanggal/sumber); `/timeline`; kronologi + versi artikel;
  `/rutin/bulanan`.
- **Kurang:** tanpa produk sejarah (`/sejarah`, "Hari ini
  dalam sejarah", navigasi tahun/dekade); tanpa kategori
  sejarah di taksonomi.
- **Rencana:** kolom `era`+`penting` di `pf_events` (v8) +
  `src/app/sejarah/**` + `getHariIniDalamSejarah()`;
  **prasyarat: `/admin/event` + `GET/POST /api/admin/event*`**
  (lihat §5.2 — tidak ada UI admin event saat ini).

### 5.13 Public Report — tersebar, tanpa formulir laporan [dikoreksi §0]
- **Ada:** `pf_correction_reports` (pelapor nullable/anon,
  jenis 4 nilai, status 4) + `POST /api/laporan` (rate
  limit 5/mnt) + `/admin/koreksi` (moderasi) + lencana
  koreksi publik.
- **Kurang:** jenis laporan belum mencakup brief (hanya
  4 nilai — kesalahan informasi, sumber, gambar, duplikat,
  perlu pembaruan belum semuanya ada); tanpa halaman
  formulir laporan publik yang jelas; tanpa status
  antrean yang bisa dilacak pelapor.
- **Rencana:** perluas CHECK `pf_correction_reports.jenis`
  (v8) ke: kesalahan_informasi, sumber_tidak_valid,
  gambar_tidak_sesuai, duplikat, perlu_pembaruan (+
  pertahankan yang lama); kolom `pelapor_email` (opsional,
  untuk kabar tindak lanjut) + `nomor_lacak` (untuk
  lacak status); halaman `/laporkan` (formulir publik,
  tulis via service role sesudah T5 — JANGAN insert anon
  langsung); moderasi di `/admin/koreksi` yang sudah ada
  (tambah filter jenis + status); SEMUA laporan wajib
  dimoderasi sebelum diproses (status tidak berubah
  tanpa aksi moderator).

### 5.14 Advanced Admin Control Center — fondasi terkuat
- **Ada:** `/admin` 13 halaman + guard server-side +
  **21 route `/api/admin/*`** (ringkasan, antrean, artikel
  CRUD + terbitkan/batalkan/jadwalkan/review/fakta,
  terbitkan-terjadwal, audit, brief, koreksi, pengguna
  super_admin saja, sistem jobs+kategori, sumber);
  `editorial.ts` (622 baris: gate terbit 409, review,
  koreksi, peran/nonaktif); `pf_scheduled_jobs` (3 seed)
  + Kesehatan Sistem; `GET /api/ai/status` (10 agen nyata)
  + pemicu AI/ingestion.
- **Kurang:** tanpa feature flags, tanpa admin konten Fase 6
  (`/admin/pengetahuan|event|kuis|data|tanya`), tanpa
  kontrol rate limit/CSP dari UI, tanpa pemicu manual job
  dari UI, tanpa audit login/logout, tanpa pengumuman
  pemeliharaan.
- **Rencana:** migrasi v8 (tabel `pf_system_settings`
  + `pf_error_logs` + perluasan CHECK enum §3.4);
  halaman admin konten Fase 6 (prioritaskan
  `/admin/tanya|event|pengetahuan`); `/admin/kendali`
  (flags, pemicu job server-side, status scheduler,
  ekspor audit CSV) + `GET/PATCH /api/admin/kendali/flags`,
  `POST /api/admin/kendali/jalankan`; Live News Monitoring
  (ingestion_runs terbaru nyata); News Clustering (dari
  dedup/`disalin_dari`); Verification Dashboard (agregat
  verification_records nyata); AI Agent Logs (dari
  `pf_ai_runs` nyata); Duplicate Detection (daftar
  `disalin_dari`/duplikat nyata); Article Quality Control
  (hasil quality check Fase 4); Correction Management
  (sudah ada — sambungkan); User Reports (dari
  `pf_correction_reports`); Traffic Analytics — HANYA bila
  analitik tersedia, bila tidak tampilkan "belum tersedia"
  jujur, JANGAN angka palsu; Content Performance (dari
  data baca nyata `pf_reading_history`).

## 6. Temuan lintas area

1. **Duplikasi (perbaiki bila menyentuh berkas terkait):**
   `getArtikelPengetahuan` ganda (`lanjutan.ts:516` vs
   `rutin.ts:137`); `tanggalWibHariIni()` ganda (`rutin.ts:12`
   vs `pipeline.ts:90`); dua implementasi ringkasan admin
   (API vs `getRingkasanAdmin`, `data.ts:137` — utang
   ARSITEKTUR §12.4.5); definisi antrean review tidak
   seragam (ARSITEKTUR §12.4.4); rate limiter diduplikasi
   per berkas (Map in-memory + `lolosRateLimit` ditulis
   ulang di `langganan`, `kuis/jawab`, `tanya`, dll. di
   samping helper `buatRateLimiter`).
2. **Dead code:** `getSemuaTimeline` (`lanjutan.ts:364`)
   diekspor tapi nol pemakai (halaman `/timeline` memakai
   `getSemuaEvent` + `getTimelineEvent`). Tidak ada dead
   route (42 route API, 41 halaman semua terpakai).
3. **Tidak ada admin konten Fase 6** (event, pengetahuan,
   kuis, indikator, antrean `/tanya` tanpa UI jawab) —
   blokir operasional untuk area 2/4/6/10/11/12.
4. **Tabrakan nama yang harus dihindari:** `/api/laporan`
   sudah ada (laporan koreksi) → endpoint laporan publik
   baru HARUS bernama `/api/laporan-publik`; `analisisTren`
   vs `hitungTren` (dua nama untuk hal berdekatan).
5. **Koreksi laporan Fase 7:** yang disebut "5 workflow"
   sebenarnya 3 berkas (`ingestion.yml`, `editorial.yml`,
   `data-analysis.yml`) mencakup 5 jadwal; semuanya tetap
   TIDAK AKTIF.

## 7. Rencana gelombang pembangunan

**Gelombang 1 — Fondasi + kemenangan cepat:**
migrasi v8 bagian 1 (T5, T8, T1-sisa, perluasan CHECK enum,
D1–D3) + tabel baru area 1/3/7/13 + kolom perluasan terkait;
perbaikan desain G1/G2 (G3–G5 bila menyentuh berkas yang
sama); patch 3 route T5 ke service role; bangun area 1
(Jejak Fakta), 3 (Multi-Source View), 13 (Public Report),
7 (My Prata); regression baterai Fase 5/6/7 yang relevan;
commit lokal Gelombang 1.

**Gelombang 2 — Konten & pengetahuan:** area 2 (Story
Tracker + `/admin/event` sebagai prasyarat), 4 (Explain the
World + `/admin/pengetahuan`), 5 (Reality Check — kembangkan
`/data`), 10 (PRATA Research), 11 (Country Profile), 12
(Historical Archive); tambah tabel/kolom ke v8 bila perlu
(append ke SATU berkas v8 yang sama, validasi ulang PGlite
v1–v8); regression; commit lokal Gelombang 2.

**Gelombang 3 — Pengguna & AI:** area 6 (Ask the World —
perluas korpus + arsip Q&A + antrean terjawab), 8 (PRATA
Academy), 9 (PRATA Podcast — implementasi jujur TTS +
playlist + riwayat; file audio = BELUM BISA bila tanpa
layanan TTS server gratis); regression; commit lokal
Gelombang 3.

**Gelombang 4 — Kendali + regression penuh:** area 14
(Advanced Admin Control Center); regression penuh (baterai
Fase 5/6/7 + baterai Fase 8); verifikasi akhir (build/lint/
tsc/PGlite/smoke); commit lokal Gelombang 4; laporan akhir
Fase 8.

**Aturan gelombang:** jangan ubah migrasi v1–v7; SATU berkas
v8 (`supabase/migrations/20261116_pf_v8_expansion.sql`,
idempoten, RLS aktif, tanpa seed operasional) — boleh
di-append antar gelombang selama selalu divalidasi ulang;
tulis berkas hanya via muse.write/muse.edit; verifikasi
ukuran sesudah tulis; regression sesudah tiap area.

## 8. Blokir yang tetap (di luar kode Fase 8)

1. Migrasi v1–v8 belum dijalankan di Supabase produksi
   (butuh pemilik via SQL Editor) — prosedur lengkap ada di
   `supabase/CUTOVER.md` (gate Fase 8). Semua halaman baru
   menampilkan empty state jujur / 503 jujur sampai migrasi
   dijalankan. Urutan wajib: backup → v1–v7 → deploy →
   v8 (v8 sesudah deploy karena mencabut policy insert
   anonim T5).
2. Deploy Vercel masih blokir 403 akses tim `prataava` —
   workflow + endpoint baru belum bisa aktif. Diverifikasi
   ulang 16 Nov 2026: `list_projects` 403; temuan baru —
   `authorize_team_access` (pemulihan yang disarankan API)
   TIDAK ADA di tool konektor Vercel; hanya pemilik yang
   bisa memperbaiki (opsi A/B/C di `CUTOVER.md` §5.2 +
   `DEPLOY.md`).
3. Uji browser nyata (klik, login, peta, TTS, responsif)
   belum bisa — butuh migrasi + deploy + akun produksi.
4. Keputusan audio Podcast (rekaman vs TTS server vs TTS
   browser) — bila pemilik memilih rekaman/TTS server,
   butuh layanan + bucket Storage baru (di luar Fase 8
   bila berbayar).

---

*Audit Fase 8 selesai — 16 November 2026. Dokumen ini adalah
deliverable Langkah 1; pembangunan (Langkah 2) mengikuti
rencana gelombang §7.*

## 9. Audit Gate Fase 8 (16 Nov 2026 ±06.29–07.00 WIB)

Pengalihan prioritas pemilik 16 Nov 2026 ±06.29 WIB:
HENTIKAN pembangunan 14 area; prioritas = Audit &
Production Readiness Gate. Gelombang 2 (area 2, 4, 5, 10,
11, 12) sudah dimulai koordinatornya lalu ditutup; working
tree dikembalikan ke titik aman `f1e68d6` (`git checkout
-- .` + hapus 11 direktori untracked Gelombang 2 — rencana
tetap di §5/§7, dapat dibangun ulang). Gate dikerjakan 4
agen paralel (Keamanan, Cutover, Scheduler, Regression +
Kesiapan Redaksi) + sintesis koordinator. Detail penuh:
`LAPORAN-FASE-8.md`; catatan agen di
`/tmp/pf-gate-security/laporan-keamanan.md`,
`/tmp/pf-gate-scheduler/laporan-scheduler.md`,
`/tmp/pf-gate-regression/laporan-regression.md` (/tmp =
ephemera, hilang saat restart runtime).

### 9.1 Ringkasan hasil gate

| Jalur gate | Hasil |
|---|---|
| Keamanan (T3/T4/T5/T6/T8/T10/T1-sisa) | T5/T8/T1-sisa TERTUTUP (PGlite 34/34); T6: 3 celah nyata ditemukan + diperbaiki (SSRF 43/43); T4: 6 jalur staf diperbaiki; T3 TERBUKA; T10: 1 celah kelengkapan baru (CRUD sumber tak teraudit) |
| Cutover | `supabase/CUTOVER.md` (38.627 byte) + `DEPLOY.md` + `LAPORAN-AKHIR.md` §11/§12 + `backup-pf.mjs` 37 tabel; Vercel 403 diverifikasi ulang + temuan baru `authorize_team_access` tidak ada di konektor |
| Scheduler | 3 berkas / 5 jadwal terverifikasi (WIB benar); dry-run 5 alur LOLOS (ingestion 356/354, editorial 200/5 draf, brief draft 10 entri, analisis data, terbitkan-terjadwal gate terbukti); gate publikasi otomatis: TIDAK; temuan F2–F13 |
| Regression + redaksi | tsc/lint/build EXIT 0 (94/94, BUILD_ID `rVaLmIi2bkpf0FCW-y_UF`); uji-fase5 53/53, fase6 53/53, fase7 87/87, fase8-gel1 120/120, editorial 10/10, ingestion 10/11 (GDELT 429 eksternal); alur redaksi (a)–(j) berfungsi dengan data nyata; 5 draf VERIFIED TIDAK layak terbit tanpa review |

### 9.2 Audit gate per area (8 pertanyaan)

**1. Jejak Fakta — DIBANGUN Gelombang 1, terverifikasi lokal.**
Sudah ada: ya (seksi/route jejak + policy baca publik
terbatas, v8). Serupa: rantai klaim→bukti Fase 4/5 sudah
ada. DB: didukung (v8 policy, tanpa tabel baru). API: ada.
Muse AI: tidak langsung (tampilan atas data verifikasi
Fase 4). Migrasi: sudah di v8. Risiko: rendah (baca
publik terbatas artikel terbit; T8 terverifikasi).
Tanpa rusak: ya — regression 120/120 + 87/87. Belum
diuji: tampilan publik dengan artikel terbit nyata
(butuh Supabase + akun).

**2. Story Tracker — BELUM dibangun (Gelombang 2 dibatalkan).**
Sudah ada: tidak. Serupa: `/timeline` (kronologi umum,
bukan per-cerita). DB: sebagian — butuh `pf_stories` +
`pf_story_events` + `pf_story_articles` +
`pf_story_followers` (baru). API: belum ada
(`GET/POST /api/cerita*`). Muse AI: pengelompokan
event→cerita oleh Muse/editor (bukan otomatis
deterministik). Migrasi: ya, tabel baru (rencana
v8-append dibatalkan — harus dibuat ulang). Risiko:
sedang — prasyarat `/admin/event` tidak ada (blokir
operasional); T5: jangan tambah insert anon. Tanpa
rusak: ya, bila dibangun di atas `pf_events` tanpa
mengubahnya.

**3. Multi-Source View — DIBANGUN Gelombang 1,
terverifikasi lokal.** Sudah ada: ya (komponen
perbandingan + kolom `peran`/`kutipan`, v8). Serupa:
seksi Sumber & Referensi + tier 90/75/60. DB: didukung
(v8 kolom). API: ada (`lib/data.ts`). Muse AI: tidak
langsung (data tier/koroborasi Fase 4). Migrasi: sudah
di v8. Risiko: rendah; bobot bukti eksplisit (tanpa
kesetaraan palsu). Tanpa rusak: ya — regression lolos.
Belum diuji: tampilan dengan artikel terbit nyata.

**4. Explain the World — BELUM dibangun.** Sudah ada:
tidak. Serupa: `/pengetahuan` + `[slug]` (artikel
pengetahuan umum, bukan format explainer berlapis).
DB: sebagian — butuh kolom `jenis`/`tingkat`/
`estimasi_baca_menit`/`seri_slug`. API: belum ada admin
pengetahuan (`GET/POST/PATCH /api/admin/pengetahuan`).
Muse AI: draf explainer via `writing.ts` + review
Muse/editor. Migrasi: ya, kolom baru. Risiko:
rendah–sedang; tanpa admin UI, konten hanya bisa lewat
DB langsung. Tanpa rusak: ya (kolom baru, halaman lama
tak berubah).

**5. Reality Check — BELUM dibangun (pengembangan /data).**
Sudah ada: tidak. Serupa: `/data` Fase 6 (grafik SVG
statis). DB: didukung tahap pertama (tanpa tabel baru;
kolom `cakupan`/`frekuensi_update` opsional). API: ada
(`/api/ai/data-analysis` + data). Muse AI: agen Data
Analysis ke-10 (deterministik). Migrasi: tidak tahap
pertama. Risiko: rendah; JANGAN angka palsu — indikator
1 titik dilewati (terbukti dry-run). Tanpa rusak: ya.

**6. Ask the World — BELUM dibangun.** Sudah ada: tidak.
Serupa: `/tanya` Fase 6 (korpus artikel+pengetahuan
saja). DB: sebagian — butuh kolom `publik`/`kategori`/
`membantu` di `pf_questions`. API: sebagian — perlu
`GET /api/tanya/arsip` + penjawab antrean. Muse AI:
retrieval + penjawab antrean via cron Muse (tanpa SLA).
Migrasi: ya, kolom baru. Risiko: sedang — jawaban tanpa
referensi harus akui keterbatasan (mekanisme jujur); T5:
insert `pf_questions` sudah service-role (terverifikasi
gate). Tanpa rusak: ya.

**7. My Prata — DIBANGUN Gelombang 1, terverifikasi
lokal.** Sudah ada: ya (`/saya` + pengaturan + ekspor +
`pf_user_preferences`, v8). Serupa: `/feed-saya` +
`/profil`. DB: didukung (v8 tabel baru). API: ada
(`GET/PATCH /api/saya/preferensi`,
`GET /api/saya/ekspor`). Muse AI: tidak (digest dari
brief + topik). Migrasi: sudah di v8. Risiko: rendah;
ekspor/hapus akun = data milik sendiri via RLS. Tanpa
rusak: ya — regression lolos. Belum diuji: redirect
`/saya`→`/masuk` ujungnya tanpa browser (smoke: shell
200 PPR + RSC 307 tak terselesaikan via curl).

**8. PRATA Academy — BELUM dibangun (NIHIL, grep 0).**
Sudah ada: tidak. Serupa: tidak ada (hanya bahan mentah
`/pengetahuan`, `/kuis`, `/rutin`, auth/peran). DB:
tidak — butuh `pf_courses` + modules + lessons +
progress (baru). API: belum ada. Muse AI: materi/quiz
via Muse + review. Migrasi: ya, 4 tabel baru. Risiko:
sedang — kunci jawaban JANGAN baca publik (pola T1;
gate membuktikan empiris: GRANT tabel membuka kunci
lagi). Tanpa rusak: ya (tabel baru, tak sentuh yang
lama). Upaya besar; sertifikat/diskusi ditunda.

**9. PRATA Podcast — BELUM dibangun (NIHIL).** Sudah
ada: tidak. Serupa: tidak ada (hanya TTS browser
`PembacaSuara` + naskah `/brief` + pola `rss.xml`).
DB: tidak — butuh `pf_podcast_episodes` +
`pf_podcast_subscriptions`. API: belum ada. Muse AI:
naskah brief/episode mingguan dari kompilasi brief
(Muse). Migrasi: ya, 2 tabel baru (+ bucket Storage
bila file audio — repo belum pakai Storage sama
sekali). Risiko: sedang — hak penggunaan (hanya artikel
sendiri); pembuatan file audio = BELUM BISA tanpa
layanan TTS server gratis (keputusan audio belum ada).
Tanpa rusak: ya (fitur baru terpisah; pemutaran TTS
browser sudah ada dan tak berubah).

**10. PRATA Research — BELUM dibangun.** Sudah ada:
tidak. Serupa: `/data` (pemasok angka, bukan produk
riset). DB: tidak — butuh `pf_research_reports` +
`pf_documents`. API: belum ada. Muse AI: laporan
disusun Muse/editor, JANGAN auto-terbit. Migrasi: ya,
2 tabel baru. Risiko: rendah–sedang — dokumen metadata
+ tautan saja, JANGAN salin isi berhak cipta. Tanpa
rusak: ya.

**11. Country Profile — BELUM dibangun.** Sudah ada:
tidak. Serupa: `/peta` (marker berkoordinat). DB:
tidak — butuh `pf_countries` + `pf_country_facts`.
API: belum ada. Muse AI: tidak langsung (data dari
sumber resmi). Migrasi: ya, 2 tabel + kolom
`negara_kode` FK. Risiko: sedang — data awal hanya
Indonesia dari sumber resmi; tanpa angka karangan;
validasi target topik negara (D3). Tanpa rusak: ya.
Utang: topik GDELT hardcoded "Indonesia".

**12. Historical Archive — BELUM dibangun.** Sudah ada:
tidak. Serupa: `/arsip` (filter umum, bukan produk
sejarah). DB: sebagian — butuh kolom `era`+`penting` di
`pf_events`. API: belum ada (`/sejarah`). Muse AI:
tidak langsung. Migrasi: ya, kolom baru. Risiko:
rendah. Tanpa rusak: ya. Prasyarat: `/admin/event`
(blokir operasional, sama seperti area 2).

**13. Public Report — DIBANGUN Gelombang 1,
terverifikasi lokal.** Sudah ada: ya (`/laporkan` +
lacak status + `POST /api/laporan-publik` + perluasan
CHECK jenis + `nomor_lacak`). Serupa:
`pf_correction_reports` + `/admin/koreksi`. DB:
didukung (v8 CHECK + kolom). API: ada. Muse AI: tidak
(moderasi manusia). Migrasi: sudah di v8. Risiko:
rendah — T5 terverifikasi (insert via service role,
anon ditolak); semua laporan wajib dimoderasi. Tanpa
rusak: ya — smoke: `/laporkan` 200 (form lengkap),
`/laporkan/lacak` 200, `POST /api/laporan-publik` → 400
(validasi jalan).

**14. Advanced Admin Control Center — BELUM dibangun
(fondasi terkuat).** Sudah ada: tidak. Serupa: `/admin`
13 halaman + 21 route `/api/admin/*` (bukan control
center terpadu). DB: sebagian — butuh
`pf_system_settings` + `pf_error_logs` + perluasan
CHECK enum (sudah di v8 sebagian: audit 46 aksi, jobs
8 nama, `ai_runs` 13 agen). API: sebagian — perlu
`/api/admin/kendali/*` + admin konten Fase 6. Muse AI:
AI Agent Logs dari `pf_ai_runs` nyata. Migrasi: ya
(tabel baru + CHECK). Risiko: sedang — temuan gate: F6
(`terakhir_jalan` cron tak diperbarui), F7 (seed 3 job,
pemicu manual tak memetakan data-analysis/
terbitkan-terjadwal), F12 (retry tiap jam tanpa
backoff), T10 (CRUD sumber tak masuk audit log — celah
baru), T3 (rate limit in-memory — kontrol dari UI belum
ada), CSP belum dipasang. Tanpa rusak: ya bila dibangun
sebagai halaman/route baru + agregat atas tabel yang
ada; Traffic Analytics HANYA bila tersedia (tampilkan
"belum tersedia" bila tidak).

### 9.3 Status akhir per area sesudah gate

| # | Area | Status gate |
|---|---|---|
| 1 | Jejak Fakta | Selesai Gelombang 1 — terverifikasi lokal |
| 2 | Story Tracker | Belum dibangun — rencana §5.2 tetap berlaku |
| 3 | Multi-Source View | Selesai Gelombang 1 — terverifikasi lokal |
| 4 | Explain the World | Belum dibangun — rencana §5.4 tetap berlaku |
| 5 | Reality Check | Belum dibangun — rencana §5.5 tetap berlaku |
| 6 | Ask the World | Belum dibangun — rencana §5.6 tetap berlaku |
| 7 | My Prata | Selesai Gelombang 1 — terverifikasi lokal |
| 8 | PRATA Academy | Belum dibangun — rencana §5.8 tetap berlaku |
| 9 | PRATA Podcast | Belum dibangun — rencana §5.9 tetap berlaku |
| 10 | PRATA Research | Belum dibangun — rencana §5.10 tetap berlaku |
| 11 | Country Profile | Belum dibangun — rencana §5.11 tetap berlaku |
| 12 | Historical Archive | Belum dibangun — rencana §5.12 tetap berlaku |
| 13 | Public Report | Selesai Gelombang 1 — terverifikasi lokal |
| 14 | Admin Control Center | Belum dibangun — rencana §5.14 tetap berlaku |

**Tidak ada duplikat yang dibuat gate ini:** semua yang
sudah ada dicatat sebagai pengembangan (§9.2), bukan
bangun baru. Migrasi v8 TIDAK diubah selama gate
(0 baris diff) — perbaikan keamanan gate berupa patch
kode + dokumentasi, bukan migrasi baru.
