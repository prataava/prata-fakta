# CUTOVER — PRATA FAKTA: Migrasi v1–v8 + Go-Live

**Dokumen:** prosedur cutover produksi (migrasi database + deploy +
smoke test + rollback).
**Repo:** `prataava/prata-fakta`, commit `f1e68d6` (Fase 8 Gelombang 1),
94 rute (46 halaman + 46 route API + `/sitemap.xml` + `/robots.txt`).
**Status: BELUM LIVE.** Situs baru dinyatakan live bila SELURUH
langkah di dokumen ini selesai dan smoke test §6 lolos. Jangan
mengumumkan URL produksi sebelum itu.

**Aturan yang mengikat dokumen ini:**

- JANGAN ubah berkas migrasi apa pun (`supabase/migrations/*.sql`).
  Bila ada yang salah, perbaiki dengan migrasi baru, bukan dengan
  mengedit berkas lama.
- JANGAN pernah meminta atau menulis nilai secret di chat biasa.
  Secret disebut HANYA dengan nama. Nilai secret diisi pemilik
  langsung di Dashboard Vercel / GitHub / `.env.local`, atau
  diserahkan ke Muse lewat Secure Vault bila Muse yang diminta
  menjalankan langkahnya.
- Semua migrasi v1–v8 IDEMPOTEN (aman dijalankan ulang). Satu
  berkas gagal → perbaiki penyebabnya, lalu ULANGI berkas itu.
  JANGAN lanjut ke berkas berikutnya sebelum berkas saat ini lolos
  verifikasi.

---

## 0. Ringkasan urutan (baca dulu sebelum mulai)

Urutan ini TIDAK boleh dibalik. Alasannya ada di tiap tahap.

| Tahap | Apa | Di mana |
|---|---|---|
| 1 | Pemeriksaan sebelum migrasi (§1) | Supabase Dashboard + repo |
| 2 | Backup + bukti baseline (§2) | Mesin tepercaya / Muse via Secure Vault |
| 3A | Migrasi **v1–v7** berurutan + verifikasi tiap berkas (§3) | SQL Editor |
| 4 | Deploy kode ke Vercel (§5) — **WAJIB sebelum v8** | Dashboard Vercel |
| 3B | Migrasi **v8** + verifikasi (§3) | SQL Editor |
| 5 | Validasi fungsi database (§4) | SQL Editor |
| 6 | Smoke test produksi (§6) | Browser + curl |
| 7 | Aktifkan scheduler GitHub Actions (§7) | GitHub repo |
| 8 | Tetapkan super_admin pertama (§8) | SQL Editor |

**Mengapa v8 dipisah sesudah deploy:** migrasi v8 mencabut tiga
policy INSERT anonim (T5) dan mengunci kolom kunci kuis (T1-sisa).
Kode yang menggantikannya — INSERT lewat service role di
`POST /api/langganan`, `POST /api/laporan`, `POST /api/tanya` dan
baca kunci lewat service role di `POST /api/kuis/jawab` +
`getKuisHarian` — SUDAH ada di repo commit `f1e68d6`
(terverifikasi: keempat route memakai `createServiceClient` /
`cobaServiceClient`). Tetapi kode itu baru berlaku sesudah
DEPLOY. Bila v8 dijalankan sebelum deploy, ketiga route publik
mati (INSERT ditolak RLS) sampai deploy selesai. Karena deploy
Vercel saat ini masih blokir 403 (lihat §5), urutan amannya:
v1–v7 dulu → bereskan deploy → baru v8.

**Pengecualian yang dibolehkan:** bila pemilik menjalankan
v1–v8 dalam satu sesi SQL Editor tanpa jeda deploy, situs tetap
bisa live — dengan catatan ketiga route publik akan mengembalikan
error sampai deploy selesai. Itu bukan kerusakan data, hanya
jendela layanan mati. Pilihan ini dicatat sebagai risiko yang
diterima pemilik, bukan prosedur yang dianjurkan.

---

## 1. Pemeriksaan SEBELUM migrasi

Lakukan semua cek ini DAHULU. Bila satu cek gagal, berhenti dan
bereskan dulu — jangan mulai migrasi.

### 1.1 Akses Supabase Dashboard proyek `prata`

- Buka <https://supabase.com/dashboard> → proyek **prata**
  (URL proyek: `https://wyheuxjpusavuiqpymik.supabase.co`).
- Pastikan Anda bisa membuka **SQL Editor** dan **Table Editor**.
- Pastikan Anda bisa membuka **Settings → API** (untuk mengambil
  `SUPABASE_SERVICE_ROLE_KEY` bila diperlukan — key ini HANYA
  dipakai di server / mesin tepercaya, JANGAN ditempel di chat).
- Bila Anda tidak punya akses Dashboard: berhenti di sini.
  Migrasi tidak bisa dijalankan dari tempat lain (anon key tidak
  bisa DDL; tidak ada `DATABASE_URL` / password Postgres di
  workspace).

### 1.2 Cek tabel `pf_*` yang mungkin sudah ada

Jalankan di SQL Editor (New query → Run):

```sql
select count(*) as jumlah_tabel_pf
from pg_tables
where schemaname = 'public' and tablename like 'pf_%';

select tablename from pg_tables
where schemaname = 'public' and tablename like 'pf_%'
order by tablename;
```

- **Ekspektasi bila ini cutover pertama: `0` tabel.**
  Audit 16 Nov 2026 membuktikan belum ada satu pun tabel `pf_*`
  di produksi.
- **Bila hasilnya > 0:** catat nama tabelnya. Artinya sebagian
  migrasi sudah pernah dijalankan (oleh siapa, kapan — tanyakan
  / periksa riwayat SQL Editor). Migrasi idempoten, jadi
  menjalankan ulang dari v1 tetap aman — TETAPI verifikasi tiap
  tahap (§3) menjadi lebih penting: cocokkan angka ekspektasi
  per tahap dengan yang sudah ada, dan jangan menganggap
  "sudah ada = sudah benar" sebelum kueri verifikasi lolos.
- **JANGAN sentuh tabel lain.** Proyek `prata` dipakai bersama
  PRATA dan TASIK JAYA (tabel `tasik_*` 14 tabel, `snbt_*`
  8 tabel). Migrasi PRATA FAKTA hanya membuat/mengubah tabel
  ber-prefix `pf_*`. Bila kueri Anda menyentuh tabel
  `tasik_*` / `snbt_*` / `auth.users` di luar yang diperintahkan
  dokumen ini, batalkan.

### 1.3 Cek backup terakhir

- Tanyakan / periksa: kapan terakhir kali ada backup proyek
  `prata` (Supabase mengelola backup harian di sisi server;
  paket gratis TIDAK punya PITR — point-in-time recovery).
- Jalankan backup lapis-kedua §2 dan simpan hasilnya SEBELUM
  migrasi. Bila backup §2 belum pernah jalan, itu normal untuk
  cutover pertama — ikuti §2 apa adanya, jangan dilewat dengan
  alasan "belum ada data".

### 1.4 Cek environment variables yang dibutuhkan (nama saja)

Dua tempat harus diisi — keduanya HANYA nama di sini; nilainya
diisi pemilik di tempatnya masing-masing.

**A. `.env.local` di root repo** (untuk backup §2 + jalan lokal).
Berkas ini ter-ignore git (tidak pernah ter-commit). Isi yang
dibutuhkan:

| Nama | Sumber nilai |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Tempat yang sama → anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Tempat yang sama → service_role key (server saja) |
| `PF_INGESTION_SECRET` | Nilai acak panjang, dibuat pemilik |
| `PF_AI_SECRET` | Nilai acak panjang, dibuat pemilik |
| `PF_SITE_URL` | URL produksi, mis. `https://prata-fakta.vercel.app` |

Contoh kosongnya ada di `.env.example` — salin berkas itu
menjadi `.env.local`, lalu isi. **Jangan pernah** mengirim isi
`.env.local` lewat chat.

**B. Environment Variables di Vercel** (untuk deploy §5).
Nama yang sama persis seperti tabel di atas, ditambah
`PF_INGESTION_SECRET`, `PF_AI_SECRET`, `PF_SITE_URL`.
Nilai `PF_INGESTION_SECRET` dan `PF_AI_SECRET` di Vercel
HARUS SAMA dengan secret GitHub Actions (§7) — bila beda,
scheduler gagal dengan 503 jujur.

**C. Secrets GitHub Actions** (untuk scheduler §7, sesudah deploy):
`PF_INGESTION_SECRET`, `PF_AI_SECRET`, `PF_SITE_URL` — nilai
sama dengan (B).

### 1.5 Cek prasyarat kode untuk v8 (T5)

Sebelum v8, pastikan kode yang di-deploy adalah commit
`f1e68d6` atau lebih baru — yaitu kode yang SUDAH memindahkan
ketiga route ke service role. Cara cek cepat di repo:

```bash
grep -c "createServiceClient" \
  src/app/api/langganan/route.ts \
  src/app/api/laporan/route.ts \
  src/app/api/tanya/route.ts \
  src/app/api/kuis/jawab/route.ts
```

Ekspektasi: tiap berkas mengembalikan angka ≥ 1 (di commit
`f1e68d6`: masing-masing 2). Bila ada yang 0, JANGAN jalankan
v8 — kode belum siap, dan v8 akan memutus route tersebut.

---

## 2. Backup SEBELUM perubahan

### 2.1 Alat: `scripts/backup-pf.mjs`

Skrip ini mengekspor SEMUA **37 tabel `pf_*`** (sesudah v8:
36 dari v1–v7 + `pf_user_preferences` dari v8) ke JSON via REST
dengan service-role key. Skrip TIDAK PERNAH mencetak nilai key.
Paginasi 1000 baris per halaman. Keluaran:
`<out>/backup-YYYYMMDD-HHmmss/<tabel>.json` + `manifest.json`
berisi `{waktu, tabel: {nama: jumlah}, gagal: [...], durasi_ms}`.
Exit 0 bila semua tabel berhasil; exit 1 bila ada tabel gagal —
jangan abaikan exit 1.

Skrip membutuhkan `NEXT_PUBLIC_SUPABASE_URL` dan
`SUPABASE_SERVICE_ROLE_KEY` dari environment atau `.env.local`.
Bila Muse yang diminta menjalankannya, pemilik menyerahkan
`SUPABASE_SERVICE_ROLE_KEY` lewat **Secure Vault** (bukan chat
biasa). Bila pemilik menjalankan sendiri, isi `.env.local`
sesuai §1.4.

### 2.2 Perintah (jalankan dari root repo)

```bash
cd ~/workspace/prata-fakta   # atau direktori repo di mesin Anda
node scripts/backup-pf.mjs --out ~/backup-prata-fakta
```

Tanpa `--out`, hasil ditulis ke direktori kerja saat ini
(`backup-YYYYMMDD-HHmmss/`). Simpan hasil di LUAR repo
(mis. `~/backup-prata-fakta/`) agar tidak ikut ter-commit.

### 2.3 Ekspektasi output

**Sebelum migrasi apa pun (cutover pertama):** SEMUA 37 tabel
akan dilaporkan GAGAL (REST 404 — tabel belum ada) dan skrip
exit 1. **Itu NORMAL dan BUKAN blokir.** Tujuannya pada tahap
ini hanya dua: (a) membuktikan service-role key valid dan
skrip bisa mencapai proyek (bila gagal dengan 401, key salah —
perbaiki key, jangan lanjut); (b) menyimpan `manifest.json`
baseline yang mencatat "0 tabel `pf_*`". Simpan manifest itu.

Contoh output yang diharapkan pada baseline (isi angka baris
boleh 0/gagal semua, yang penting pesan errornya 404, bukan 401):

```text
GAGAL: pf_profiles — HTTP 404 ...
... (37 baris GAGAL, satu per tabel)
SELESAI: 0/37 tabel, 0 baris, 37 gagal → .../backup-20261116-.../
```

Bila errornya **401 / "Invalid API key"**: key salah atau
kedaluwarsa. Ambil ulang dari Dashboard → Settings → API.
Jangan lanjut ke migrasi sebelum backup baseline ini dicoba.

**Sesudah migrasi v1–v8 selesai (§3):** jalankan lagi perintah
yang sama. Ekspektasi:

```text
OK: pf_profiles — 0 baris
OK: pf_roles — 5 baris
OK: pf_permissions — 9 baris
OK: pf_role_permissions — 19 baris
OK: pf_categories — 34 baris
OK: pf_sources — 8 baris
...
OK: pf_scheduled_jobs — 3 baris
...
OK: pf_user_preferences — 0 baris
SELESAI: 37/37 tabel, <total> baris, 0 gagal → .../backup-.../
```

Angka seed yang harus cocok: `pf_roles` 5, `pf_permissions` 9,
`pf_role_permissions` 19, `pf_categories` 34, `pf_sources` 8,
`pf_scheduled_jobs` 3. Semua tabel lain 0 baris (tanpa seed
data operasional). Bila ada tabel gagal pada backup
pasca-migrasi, selidiki sebelum menyatakan cutover selesai.

### 2.4 Jadwal backup berkala (sesudah live)

Jalankan skrip yang sama secara berkala dari mesin tepercaya
(mis. mingguan, atau sesudah perubahan data besar). Supabase
paket gratis tidak menyediakan PITR; ekspor berkala ini adalah
strategi backup redaksi. Simpan hasil di luar repo dan jangan
pernah meng-commit berkas backup.

---

## 3. Penerapan migrasi v1–v8 BERURUTAN

**Tempat:** Supabase Dashboard → proyek `prata` → SQL Editor →
New query.
**Cara tiap berkas:** buka berkas di
`supabase/migrations/<nama-berkas>`, salin SELURUH isinya,
tempel ke SQL Editor, tekan **Run**. Tunggu sampai selesai,
lalu jalankan kueri verifikasi di bawah untuk tahap itu.
**JANGAN** menjalankan dua berkas dalam satu query. **JANGAN**
melewat satu berkas pun — tiap berkas bergantung pada
sebelumnya (FK / fungsi tidak ditemukan bila dilewat).

### 3.0 Kueri verifikasi umum (dipakai sesudah TIAP berkas)

```sql
-- Jumlah tabel pf_*
select count(*) as jumlah_tabel_pf
from pg_tables
where schemaname = 'public' and tablename like 'pf_%';

-- Jumlah tabel pf_* ber-RLS (harus SAMA dengan jumlah tabel)
select count(*) as tabel_ber_rls
from pg_tables
where schemaname = 'public' and tablename like 'pf_%'
  and rowsecurity = true;

-- Jumlah policy pf_*
select count(*) as jumlah_policy_pf
from pg_policies
where schemaname = 'public' and tablename like 'pf_%';
```

Bila `tabel_ber_rls` < `jumlah_tabel_pf`, ada tabel tanpa RLS —
BERHENTI, jangan lanjut. Bila angka tidak cocok dengan tabel
ekspektasi §3.1–§3.8, BERHENTI dan selidiki sebelum lanjut.

### 3.1 v1 — Fondasi

- Berkas: `supabase/migrations/20261116_pf_v1_foundation.sql`
- Tabel baru: `pf_profiles`, `pf_roles`, `pf_permissions`,
  `pf_role_permissions`, `pf_user_roles`, `pf_categories`,
  `pf_sources`, `pf_newsletter_subscribers` (8 tabel).
- Fungsi baru: `pf_has_role(text)`, `pf_is_super_admin()`,
  `pf_handle_new_user()`, `pf_set_updated_at()`.

Verifikasi tambahan:

```sql
select 'pf_roles' as tabel, count(*) from public.pf_roles
union all select 'pf_permissions', count(*) from public.pf_permissions
union all select 'pf_role_permissions', count(*) from public.pf_role_permissions
union all select 'pf_categories', count(*) from public.pf_categories
union all select 'pf_sources', count(*) from public.pf_sources;
```

| Pemeriksaan | Ekspektasi sesudah v1 |
|---|---|
| Jumlah tabel `pf_*` | **8** |
| Tabel ber-RLS | **8/8** |
| Jumlah policy `pf_*` | **18** |
| `pf_roles` | 5 baris |
| `pf_permissions` | 9 baris |
| `pf_role_permissions` | 19 baris |
| `pf_categories` | 34 baris (10 utama + 24 sub) |
| `pf_sources` | 8 baris |

### 3.2 v2 — Artikel & platform berita

- Berkas: `supabase/migrations/20261116_pf_v2_articles.sql`
- Bergantung pada v1 (`pf_categories`, `pf_sources`,
  `pf_has_role`, `pf_set_updated_at`).
- Tabel baru: `pf_articles`, `pf_article_versions`,
  `pf_article_sources`, `pf_tags`, `pf_article_tags`,
  `pf_bookmarks`, `pf_reading_history`,
  `pf_correction_reports` (8 tabel).

Verifikasi tambahan: semua tabel baru berisi **0 baris**
(tanpa seed data operasional).

| Pemeriksaan | Ekspektasi sesudah v2 |
|---|---|
| Jumlah tabel `pf_*` | **16** |
| Tabel ber-RLS | **16/16** |
| Jumlah policy `pf_*` | **51** (18 + 33) |

### 3.3 v3 — Ingestion RSS + GDELT

- Berkas: `supabase/migrations/20261116_pf_v3_ingestion.sql`
- Bergantung pada v1+v2 (`pf_sources`, `pf_articles`,
  `pf_has_role`).
- Tabel baru: `pf_ingestion_runs`, `pf_raw_items` (2 tabel);
  kolom baru `pf_sources.terakhir_diambil`/`jumlah_item`,
  `pf_articles.raw_item_id`.

Verifikasi tambahan:

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'pf_sources'
and column_name in ('terakhir_diambil', 'jumlah_item');
-- ekspektasi: 2 baris

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'pf_articles'
and column_name = 'raw_item_id';
-- ekspektasi: 1 baris
```

| Pemeriksaan | Ekspektasi sesudah v3 |
|---|---|
| Jumlah tabel `pf_*` | **18** |
| Tabel ber-RLS | **18/18** |
| Jumlah policy `pf_*` | **53** (51 + 2) |

### 3.4 v4 — AI Editorial

- Berkas: `supabase/migrations/20261116_pf_v4_ai.sql`
- Bergantung pada v1+v2+v3 (`pf_articles`, `pf_raw_items`,
  `auth.users`, `pf_has_role`).
- Tabel baru: `pf_ai_runs`, `pf_claims`, `pf_evidence`,
  `pf_verification_records`, `pf_daily_briefs` (5 tabel).

Verifikasi tambahan: semua tabel baru berisi **0 baris**.

| Pemeriksaan | Ekspektasi sesudah v4 |
|---|---|
| Jumlah tabel `pf_*` | **23** |
| Tabel ber-RLS | **23/23** |
| Jumlah policy `pf_*` | **59** (53 + 6) |

### 3.5 v5 — Sistem editorial / admin

- Berkas: `supabase/migrations/20261116_pf_v5_editorial.sql`
- Bergantung pada v1–v4 (`pf_articles`, `pf_profiles`,
  `auth.users`, `pf_has_role`, `pf_set_updated_at`).
- Tabel baru: `pf_audit_logs`, `pf_editorial_reviews`,
  `pf_scheduled_jobs` (3 tabel); kolom baru
  `pf_articles.diterbitkan_oleh`, `pf_profiles.nonaktif`.

Verifikasi tambahan:

```sql
select 'pf_audit_logs' as tabel, count(*) from public.pf_audit_logs
union all select 'pf_editorial_reviews', count(*) from public.pf_editorial_reviews
union all select 'pf_scheduled_jobs', count(*) from public.pf_scheduled_jobs;
-- ekspektasi: 0, 0, 3 (seed konfigurasi 3 jadwal nyata)
```

| Pemeriksaan | Ekspektasi sesudah v5 |
|---|---|
| Jumlah tabel `pf_*` | **26** |
| Tabel ber-RLS | **26/26** |
| Jumlah policy `pf_*` | **62** (59 + 3) |
| `pf_scheduled_jobs` | 3 baris (ingestion, editorial, brief) |

### 3.6 v6 — Fitur lanjutan

- Berkas: `supabase/migrations/20261116_pf_v6_advanced.sql`
- Bergantung pada v1–v5 (`pf_articles`, `auth.users`,
  `pf_has_role`, `pf_set_updated_at`).
- Tabel baru: `pf_knowledge_articles`, `pf_followed_topics`,
  `pf_notifications`, `pf_quiz_questions`,
  `pf_data_indicators`, `pf_data_points`, `pf_events`,
  `pf_event_timeline`, `pf_questions` (9 tabel); kolom baru
  `pf_articles.lintang`/`bujur`.

Verifikasi tambahan: semua tabel baru berisi **0 baris**;
kolom `lintang`/`bujur` ada di `pf_articles` (2 baris dari
`information_schema.columns`).

| Pemeriksaan | Ekspektasi sesudah v6 |
|---|---|
| Jumlah tabel `pf_*` | **35** |
| Tabel ber-RLS | **35/35** |
| Jumlah policy `pf_*` | **76** (62 + 14) |

### 3.7 v7 — Skor kuis + pengerasan T7

- Berkas: `supabase/migrations/20261116_pf_v7_quiz_scores.sql`
- Bergantung pada v1–v6.
- Tabel baru: `pf_quiz_scores` (1 tabel); pengerasan T7:
  `ALTER FUNCTION ... SET search_path = public` untuk
  `pf_has_role`, `pf_is_super_admin`, `pf_handle_new_user`.

Verifikasi tambahan:

```sql
select proname, proconfig from pg_proc
where proname in ('pf_has_role', 'pf_is_super_admin', 'pf_handle_new_user');
-- ekspektasi: ketiganya proconfig = {search_path=public}
```

| Pemeriksaan | Ekspektasi sesudah v7 |
|---|---|
| Jumlah tabel `pf_*` | **36** |
| Tabel ber-RLS | **36/36** |
| Jumlah policy `pf_*` | **79** (76 + 3) |

### 3.8 v8 — Expansion Gelombang 1 (T5/T8/T1-sisa + Area 1/3/7/13)

- Berkas: `supabase/migrations/20261116_pf_v8_expansion.sql`
- Bergantung pada v1–v7.
- **PRASYARAT MUTLAK:** jalankan HANYA SESUDAH deploy §5
  (kode service-role sudah live). Lihat §0.
- Isi: cabut 3 policy INSERT anonim (T5); batasi baca
  `pf_roles`/`pf_permissions`/`pf_role_permissions`/
  `pf_article_sources`/`pf_article_tags` (T8); baca publik
  terbatas untuk `pf_claims`/`pf_evidence`/
  `pf_verification_records` bila artikel terbit (Area 1);
  cabut SELECT tingkat tabel `pf_quiz_questions` + GRANT
  per kolom kecuali `kunci` (T1-sisa); perluasan CHECK enum
  `pf_audit_logs.aksi` (18 → 46 nilai),
  `pf_scheduled_jobs.nama` (3 → 8 nilai),
  `pf_ai_runs.agen` (10 → 13 nilai); CHECK panjang
  `pf_quiz_questions.opsi` (1..10) + rentang lintang/bujur
  (D1/D2); tabel baru `pf_user_preferences` (Area 7);
  kolom `peran`/`kutipan` di `pf_article_sources` (Area 3);
  perluasan `pf_correction_reports` (jenis 4 → 9 nilai,
  `artikel_id` boleh NULL, kolom `pelapor_email`,
  `nomor_lacak`, `tautan_artikel` — Area 13).

Verifikasi tambahan:

```sql
select 'pf_user_preferences' as tabel, count(*) from public.pf_user_preferences;
-- ekspektasi: 0 (tanpa seed data operasional)

-- CHECK enum baru terpasang (nama constraint v8 ada):
select conname from pg_constraint
where conrelid in ('public.pf_audit_logs'::regclass,
  'public.pf_scheduled_jobs'::regclass,
  'public.pf_ai_runs'::regclass,
  'public.pf_correction_reports'::regclass)
and conname like '%_check_v8';
-- ekspektasi: 4 baris
-- (pf_audit_logs_aksi_check_v8, pf_scheduled_jobs_nama_check_v8,
--  pf_ai_runs_agen_check_v8, pf_correction_reports_jenis_check_v8)

-- Kolom baru Area 3 + Area 13 ada:
select table_name, column_name from information_schema.columns
where table_schema = 'public'
and ((table_name = 'pf_article_sources'
  and column_name in ('peran', 'kutipan'))
  or (table_name = 'pf_correction_reports'
  and column_name in ('pelapor_email', 'nomor_lacak', 'tautan_artikel')));
-- ekspektasi: 5 baris
```

| Pemeriksaan | Ekspektasi sesudah v8 |
|---|---|
| Jumlah tabel `pf_*` | **37** |
| Tabel ber-RLS | **37/37** |
| Jumlah policy `pf_*` | **79** (79 − 3 policy insert anonim T5 + 3 policy `pf_user_preferences`; penggantian policy T8 dan Area 1 tidak mengubah jumlah) |
| `pf_user_preferences` | 0 baris |

Angka v8 ini diverifikasi dari berkas migrasi
(`supabase/migrations/20261116_pf_v8_expansion.sql`):
satu tabel baru, tiga policy dicabut, tiga policy baru —
total policy tetap 79. Bukan angka asumsi.

### 3.9 Bila satu berkas gagal

1. **BERHENTI.** Jangan lanjut ke berkas berikutnya.
2. Baca pesan error SQL Editor sampai habis. Penyebab paling
   umum: berkas sebelumnya belum dijalankan (FK/fungsi tidak
   ditemukan) → jalankan berkas yang kurang dulu, lalu ulangi
   berkas ini. Penyebab lain: ada tabel `pf_*` dari percobaan
   lama yang strukturnya berbeda → bandingkan dengan definisi
   di berkas migrasi sebelum memutuskan.
3. Perbaiki penyebabnya, lalu **ulangi berkas yang sama dari
   awal** (tempel ulang seluruh isi → Run). Semua migrasi
   idempoten: bagian yang sudah berhasil akan dilewat
   (`IF NOT EXISTS` / `DROP ... IF EXISTS` / blok DO pemeriksa
   constraint).
4. Jalankan ulang kueri verifikasi tahap itu. Lolos → lanjut.
   Masih gagal → ulangi langkah 2–3, atau batal total (§9)
   bila sudah jelas skema produksi tidak bisa dipulihkan
   dengan pengulangan.

---

## 4. Validasi fungsi database

Jalankan sesudah v8 (atau sesudah v7 bila v8 ditunda — tetapi
cutover penuh mensyaratkan v8). Semua kueri di SQL Editor.

### 4.1 Fungsi SECURITY DEFINER + `search_path`

```sql
select proname, prosecdef, proconfig
from pg_proc
where proname in (
  'pf_has_role', 'pf_is_super_admin',
  'pf_handle_new_user', 'pf_set_updated_at'
)
order by proname;
```

Ekspektasi:

| Fungsi | `prosecdef` (SECURITY DEFINER) | `proconfig` |
|---|---|---|
| `pf_has_role` | true | `{search_path=public}` |
| `pf_is_super_admin` | true | `{search_path=public}` |
| `pf_handle_new_user` | true | `{search_path=public}` |
| `pf_set_updated_at` | false (trigger biasa) | (boleh kosong) |

Bila ketiga fungsi pertama belum punya `search_path=public`,
berarti v7 belum dijalankan dengan benar — ulangi v7 (§3.7),
jangan lanjut.

### 4.2 Trigger `diperbarui_pada` terpasang

```sql
select event_object_table as tabel, trigger_name
from information_schema.triggers
where trigger_schema = 'public'
and event_object_table like 'pf_%'
and trigger_name like '%set_updated_at%'
order by tabel;
```

Ekspektasi: tiap tabel `pf_*` yang punya kolom
`diperbarui_pada` memiliki satu trigger ini (termasuk
`pf_quiz_scores` dari v7 dan `pf_user_preferences` dari v8).
Bila ada tabel yang kehilangan triggernya, ulangi berkas
migrasi yang membuat tabel itu (§3.9).

### 4.3 Uji negatif keamanan (T5 + T1-sisa) — sesudah v8

Uji ini membuktikan perbaikan keamanan v8 benar-benar aktif
di produksi. Jalankan lewat REST dengan anon key (bukan SQL
Editor — SQL Editor memakai peran pemilik dan melewati RLS):

```bash
# T5 — INSERT anonim harus DITOLAK (HTTP 401/403, bukan 201):
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST "https://wyheuxjpusavuiqpymik.supabase.co/rest/v1/pf_newsletter_subscribers" \
  -H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <NEXT_PUBLIC_SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email":"uji-cutover@example.com"}'
# ekspektasi: 401 (bukan 201)

# T1-sisa — kolom kunci TIDAK boleh terbaca publik:
curl -s "https://wyheuxjpusavuiqpymik.supabase.co/rest/v1/pf_quiz_questions?select=kunci&limit=1" \
  -H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <NEXT_PUBLIC_SUPABASE_ANON_KEY>"
# ekspektasi: error 401/403 (kolom tidak diizinkan),
# BUKAN daftar kunci. Kolom lain tetap bisa dibaca:
curl -s "https://wyheuxjpusavuiqpymik.supabase.co/rest/v1/pf_quiz_questions?select=id,tanggal&limit=1" \
  -H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>" \
  -H "Authorization: Bearer <NEXT_PUBLIC_SUPABASE_ANON_KEY>"
# ekspektasi: 200 (array, boleh kosong)
```

Ganti `<NEXT_PUBLIC_SUPABASE_ANON_KEY>` dengan anon key dari
Dashboard — jangan pernah menulis service-role key di perintah
curl. Bila uji T5 masih mengembalikan 201, v8 belum jalan
dengan benar — jangan nyatakan cutover selesai.

---

## 5. Deploy ke Vercel

### 5.1 Status blokir 403 (16 Nov 2026, terverifikasi ulang)

- Koneksi Vercel di Muse: **connected** (`vercel status` →
  `auth_status: connected`, akun `prataava` /
  `farhan.agustian2008@gmail.com`, paket Hobby).
- `list_teams` → **0 tim terlihat** oleh koneksi ini.
- `list_projects` → **HTTP 403**: *"Not authorized: Trying to
  access resource under scope `prataava`. You must
  re-authenticate to this scope or use a token with access to
  this scope."* (team `team_vIeiMHbcOuWT2HCMF9s9YK5P`).
- Pemulihan yang disarankan API (`authorize_team_access`)
  **TIDAK ADA** di daftar tool konektor Vercel yang tersedia
  — jadi Muse tidak bisa memperbaiki akses ini sendiri.
  `authorize-url` juga ditolak karena koneksi sudah berstatus
  connected.

Kesimpulan: deploy otomatis lewat Muse TIDAK BISA sampai
pemilik memilih salah satu opsi di §5.2. **Jangan** hapus
atau ubah proyek Vercel lama apa pun, dan **jangan**
disconnect konektor tanpa perintah pemilik.

### 5.2 Opsi deploy (pilih satu — keputusan pemilik)

**Opsi A — Putuskan + hubungkan ulang Vercel di Muse
(dianjurkan bila pemilik ingin deploy otomatis tetap jalan).**

1. Pemilik membuka Muse → koneksi Vercel → putuskan koneksi
   (disconnect) — atau, bila Muse menyediakan tautan
   otorisasi ulang tim, ikuti tautan itu.
2. Pemilik menghubungkan ulang akun Vercel yang sama
   (`prataava`) dan MENYETUJUI akses tim `prataava` saat
   layar persetujuan OAuth muncul (ini langkah yang hilang
   sebelumnya: token lama hanya punya identitas, tanpa scope
   tim).
3. Muse memverifikasi ulang: `vercel status` +
   `list_projects` harus berhasil tanpa 403.
4. Deploy dari repo `prataava/prata-fakta` seperti biasa
   (framework Next.js, tanpa `vercel.json` — tidak
   diperlukan; cron via GitHub Actions, bukan Vercel Cron).
5. Isi env vars §1.4 (B) sebelum deploy pertama.

- Risiko: bila otorisasi ulang tetap tidak memberi scope tim
  (mis. akun Vercel pemilik memakai SSO/SAML yang berubah),
  opsi A gagal dan harus pindah ke opsi B. Tidak ada risiko
  pada proyek lama: disconnect–reconnect hanya mengganti
  token Muse, bukan menghapus proyek.
- Dibutuhkan dari pemilik: keputusan + 5 menit untuk
  klik otorisasi ulang di layar Vercel.

**Opsi B — Import repo manual di dashboard Vercel sebagai
proyek baru (jalan bila opsi A gagal / pemilik tidak mau
mengutak-atik konektor).**

1. Pemilik login ke <https://vercel.com/dashboard> dengan
   akun `prataava`.
2. **Add New → Project → Import Git Repository** → pilih
   `prataava/prata-fakta` (repo GitHub yang sama; JANGAN
   buat repo baru, JANGAN hapus repo lama).
3. Framework terdeteksi otomatis: **Next.js**. Root directory:
   root repo. Build command & output: bawaan (jangan diubah).
4. Sebelum Deploy: buka **Environment Variables**, isi
   keenam nama §1.4 (B) — `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `PF_INGESTION_SECRET`,
   `PF_AI_SECRET`, `PF_SITE_URL`.
5. Klik **Deploy**. Tunggu build selesai; baca ekor build log
   bila gagal (penyebab paling umum: env var kosong / salah
   nama — perbaiki dan Redeploy, jangan ulangi ZIP yang sama
   bila build gagal karena berkas hilang).
6. Catat URL produksi (rencana: `https://prata-fakta.vercel.app`).
   Bila nama itu sudah dipakai proyek lain, Vercel akan
   memberi nama lain — catat nama sebenarnya, jangan
   mengarang URL.

- Risiko: proyek baru = deployment baru; tidak ada risiko
  pada proyek Vercel lama (TASIK JAYA, SNBT Master) karena
  tidak disentuh. Kekurangannya: deploy berikutnya tetap
  manual (git push tidak otomatis deploy sampai integrasi
  GitHub–Vercel dipasang untuk proyek baru ini) — pasang
  integrasi itu sesudah deploy pertama berhasil, atau
  deploy ulang manual tiap rilis.
- Dibutuhkan dari pemilik: login dashboard Vercel + isi
  6 env var + klik Deploy (±15 menit).

**Opsi C — Deploy dari ZIP sumber via Vercel Drop
(cadangan bila import Git bermasalah).**

1. Buat ZIP dari SUMBER (bukan dari `.next`): `src/`,
   `public/`, `package.json`, `package-lock.json`,
   `next.config.ts`, `tsconfig.json`, `scripts/`.
   JANGAN sertakan folder `.next` (Vercel Drop bisa
   kehilangan folder titik dari ZIP dan build gagal
   "Couldn't find any pages").
2. Di dashboard Vercel → Add New → Project → **Deploy**
   (unggah ZIP) → isi env vars §1.4 (B) → Deploy.
3. Verifikasi seperti opsi B langkah 6.

- Risiko: sama dengan opsi B, ditambah risiko ZIP tidak
  lengkap (periksa daftar isi ZIP sebelum unggah).
- Dipakai hanya bila opsi B gagal karena masalah integrasi
  GitHub.

### 5.3 Verifikasi build (lokal, sebelum deploy)

Di repo, sebelum deploy apa pun:

```bash
npm run build   # ekspektasi: EXIT 0
```

Build lokal terakhir yang terverifikasi: Fase 7, 87/87
halaman, BUILD_ID `2SVs5ed_imVxww-5ff6ql`. Sesudah Gelombang 1
(94 rute) build lokal WAJIB diulang dan EXIT 0 sebelum deploy
— bila build lokal gagal, perbaiki dulu, jangan deploy.

---

## 6. Smoke testing sesudah migrasi + deploy

Jalankan sesudah §3 (v1–v8), §4, dan §5 selesai. Semua URL
memakai URL produksi sebenarnya dari §5.2 (rencana:
`https://prata-fakta.vercel.app`).

### 6.1 Halaman publik (ekspektasi HTTP)

| Cek | Ekspektasi |
|---|---|
| `GET /` | **200** |
| `GET /sitemap.xml` | **200**, XML valid, berisi URL statis + kategori (artikel 0 bila belum ada artikel terbit — jujur) |
| `GET /robots.txt` | **200** |
| `GET /rss.xml` | **200**, XML valid, 0 item bila belum ada artikel terbit |
| `GET /api/health` | **200** dengan `db: "ok"` (sebelum migrasi: `degraded` + `db: belum_tersedia` — bila masih begitu sesudah migrasi, migrasi/deploy belum tersambung) |
| `GET /pengetahuan/tidak-ada-slug` | **404** nyata |
| `GET /artikel/tidak-ada` | **404** nyata |
| `GET /kategori/tidak-ada` | **404** nyata |
| `GET /kuis`, `/peta`, `/data`, `/timeline`, `/pengetahuan`, `/tanya`, `/brief`, `/masuk` | **200** (isi empty state jujur bila belum ada data) |
| `GET /admin` tanpa login | redirect ke `/masuk` (307; browser mengikuti) |
| `GET /feed-saya` tanpa login | redirect ke `/masuk` (307) |

### 6.2 API (ekspektasi HTTP)

| Cek | Ekspektasi |
|---|---|
| `GET /api/admin/ringkasan` tanpa login | **401** |
| `POST /api/kuis/skor` tanpa login | **401** |
| `POST /api/kuis/jawab` dengan jawaban tidak valid | **400** |
| `POST /api/kuis/jawab` dengan UUID valid (tanpa tabel kuis hari itu) | **503** jujur bila tabel belum ada; 200 + hasil bila sudah ada soal |
| `POST /api/langganan` (email valid) | **200** + rate limit 5/mnt tetap berlaku |
| `POST /api/laporan` (laporan koreksi valid) | **200** |
| `POST /api/tanya` (pertanyaan) | **200**, status `terjawab` bila ada referensi, `menunggu` bila tidak |
| `GET /api/ai/status` tanpa auth | **401** |
| `POST /api/ai/jalankan` tanpa secret | **503** jujur ("secret belum diatur") |
| Security headers di `/` | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` hadir |

### 6.3 Alur login (butuh akun — pemilik)

1. Daftar akun baru lewat `/daftar` (email + kata sandi).
2. Masuk lewat `/masuk` → profil tampil.
3. Tetapkan super_admin (§8), lalu masuk `/admin` → overview
   terisi angka nyata (bukan angka contoh).
4. Uji klik utama: kuis harian (jawab 1 soal → skor tampil),
   ikuti topik di `/feed-saya`, ajukan pertanyaan di `/tanya`,
   buka peta, buka `/data`.
5. Buka di HP (320–430px) + desktop: periksa overflow
   horizontal (tidak boleh ada).

Bila satu butir smoke test gagal, catat persis (URL, status
HTTP yang diterima, pesan error) — jangan menyatakan live
sebelum diperbaiki dan diuji ulang.

---

## 7. Aktifkan scheduler GitHub Actions

Sesudah deploy + smoke test lolos:

1. GitHub → repo `prataava/prata-fakta` → Settings →
   Secrets and variables → Actions → isi:
   `PF_INGESTION_SECRET`, `PF_AI_SECRET`, `PF_SITE_URL`
   (nilai SAMA dengan env Vercel §1.4).
2. Workflow yang aktif otomatis (3 berkas, 5 jadwal):
   ingestion tiap 30 menit, pipeline editorial tiap 6 jam,
   Daily Brief 05.00 WIB, data-analysis Senin 01.00 UTC,
   terbitkan-terjadwal tiap jam.
3. Pantau di tab **Actions**: run pertama tiap workflow
   harus sukses. Tanpa secret ini, workflow gagal dengan
   503 jujur — itu konfigurasi, bukan bug.
4. Vercel Cron TIDAK dipakai (Hobby 1×/hari + blokir tim).

---

## 8. Tetapkan super_admin pertama

Sesudah ada akun terdaftar (daftar lewat aplikasi §6.3),
tetapkan lewat SQL Editor:

```sql
insert into public.pf_user_roles (user_id, role_id)
select 'UUID-AKUN-ANDA', id from public.pf_roles where nama = 'super_admin';
```

Ganti `UUID-AKUN-ANDA` dengan UUID dari Authentication →
Users (Dashboard → Authentication → Users → salin User UID).
Satu akun super_admin cukup untuk awal. Peran lain
(editor / fact_checker / writer) ditetapkan dengan cara
yang sama, mengganti `super_admin` dengan nama peran itu.

---

## 9. ROLLBACK bila gagal

### 9.1 Gagal di satu berkas migrasi — TIDAK perlu rollback

Semua migrasi idempoten. Prosedur baku (§3.9): berhenti,
baca error, perbaiki penyebab, ulangi berkas yang sama.
Jangan pernah "melompat" ke berkas berikutnya untuk
menutupi kegagalan.

### 9.2 Gagal di validasi / smoke test sesudah migrasi

Bila angka verifikasi §3 tidak cocok atau smoke test §6
gagal karena data:

1. Identifikasi tahap yang salah dari angka verifikasi
   (tabel §3.1–§3.8 menunjukkan tahap terakhir yang lolos).
2. Ulangi berkas migrasi tahap itu (§3.9).
3. Bila pengulangan tidak memperbaiki: kumpulkan bukti
   (pesan error persis + hasil kueri verifikasi) dan
   hentikan cutover — jangan menebak-nebak perbaikan
   skema di produksi.

### 9.3 Batal total (DROP semua tabel `pf_*`) — OPSI TERAKHIR

> ⚠️ **PERINGATAN BESAR — BACA SEBELUM MENJALANKAN APA PUN DI
> BAGIAN INI.**
>
> Perintah di bawah ini **MENGHAPUS PERMANEN SEMUA DATA
> PRATA FAKTA** di produksi: semua artikel, draf, klaim,
> bukti, skor kuis, bookmark, riwayat baca, log audit,
> preferensi pengguna, dan semua seed (peran, kategori,
> sumber, jadwal). **Data yang terhapus TIDAK BISA
> dikembalikan** kecuali ada backup §2 yang masih utuh.
> Jalankan bagian ini HANYA bila:
>
> 1. Cutover DINYATAKAN GAGAL TOTAL oleh pemilik, dan
> 2. Backup §2 (pasca-migrasi) sudah disimpan di luar repo, dan
> 3. Pemilik menyetujui pembatalan ini secara eksplisit.
>
> Jangan pernah menjalankan DROP ini "untuk bersih-bersih"
> atau karena satu berkas gagal — untuk satu berkas gagal,
> pakai §9.1.

Bila ketiga syarat di atas terpenuhi, jalankan di SQL Editor
(urutan dibalik dari urutan pembuatan; `CASCADE` menangani
FK yang tersisa):

```sql
-- HANYA bila §9.3 disetujui pemilik. SEMUA DATA pf_* HILANG.
drop table if exists public.pf_user_preferences cascade;
drop table if exists public.pf_quiz_scores cascade;
drop table if exists public.pf_questions cascade;
drop table if exists public.pf_event_timeline cascade;
drop table if exists public.pf_events cascade;
drop table if exists public.pf_data_points cascade;
drop table if exists public.pf_data_indicators cascade;
drop table if exists public.pf_quiz_questions cascade;
drop table if exists public.pf_notifications cascade;
drop table if exists public.pf_followed_topics cascade;
drop table if exists public.pf_knowledge_articles cascade;
drop table if exists public.pf_scheduled_jobs cascade;
drop table if exists public.pf_editorial_reviews cascade;
drop table if exists public.pf_audit_logs cascade;
drop table if exists public.pf_daily_briefs cascade;
drop table if exists public.pf_verification_records cascade;
drop table if exists public.pf_evidence cascade;
drop table if exists public.pf_claims cascade;
drop table if exists public.pf_ai_runs cascade;
drop table if exists public.pf_raw_items cascade;
drop table if exists public.pf_ingestion_runs cascade;
drop table if exists public.pf_correction_reports cascade;
drop table if exists public.pf_reading_history cascade;
drop table if exists public.pf_bookmarks cascade;
drop table if exists public.pf_article_tags cascade;
drop table if exists public.pf_tags cascade;
drop table if exists public.pf_article_sources cascade;
drop table if exists public.pf_article_versions cascade;
drop table if exists public.pf_articles cascade;
drop table if exists public.pf_newsletter_subscribers cascade;
drop table if exists public.pf_sources cascade;
drop table if exists public.pf_categories cascade;
drop table if exists public.pf_user_roles cascade;
drop table if exists public.pf_role_permissions cascade;
drop table if exists public.pf_permissions cascade;
drop table if exists public.pf_roles cascade;
drop table if exists public.pf_profiles cascade;
```

Sesudah DROP, verifikasi:

```sql
select count(*) from pg_tables
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 0
```

**Yang TIDAK BOLEH di-DROP dalam keadaan apa pun:**
tabel `tasik_*`, `snbt_*`, `auth.users`, dan fungsi
`pf_*` bila masih dipakai rencana cutover ulang (fungsi
boleh dibiarkan — migrasi berikutnya memakai
`CREATE OR REPLACE`). Rollback ini hanya menyentuh tabel
`pf_*`.

### 9.4 Bila deploy gagal (bukan migrasi)

- Build gagal di Vercel: baca ekor build log, perbaiki
  penyebab (biasanya env var kosong / berkas hilang dari
  ZIP), lalu Redeploy. Jangan ulangi deploy yang sama
  tanpa perubahan.
- Deploy berhasil tapi smoke test gagal: kemungkinan besar
  env var salah atau migrasi belum jalan — periksa
  `/api/health` dulu (`db: "ok"` atau tidak) sebelum
  menyentuh kode.

---

## 10. Checklist go / no-go (tandai satu per satu)

- [ ] §1: akses Dashboard `prata` + SQL Editor OK
- [ ] §1: cek tabel `pf_*` dicatat (ekspektasi 0 di cutover pertama)
- [ ] §2: backup baseline dicoba (manifest disimpan; 401 = key salah)
- [ ] §3A: v1–v7 berurutan, tiap tahap cocok dengan tabel ekspektasi
- [ ] §5: deploy berhasil (opsi A / B / C) + env vars terisi
- [ ] §3B: v8 + verifikasi (37 tabel, 79 policy, uji negatif T5/T1 lolos)
- [ ] §4: fungsi + trigger tervalidasi
- [ ] §6: smoke test halaman + API lolos
- [ ] §6.3: login + klik utama + HP/desktop diperiksa pemilik
- [ ] §7: secret GitHub Actions terisi, workflow terpantau
- [ ] §8: super_admin pertama ditetapkan
- [ ] §2: backup pasca-migrasi (37/37 tabel) disimpan di luar repo

Bila semua kotak tercentang, situs dinyatakan **LIVE** dan URL
produksi dicatat di `LAPORAN-AKHIR.md` §12. Sebelum itu, status
tetap **BELUM LIVE** — apa pun hasil tes lokalnya.

---

## 11. Rujukan

- `supabase/README.md` — urutan migrasi + verifikasi per berkas
  (sumber angka ekspektasi §3).
- `LAPORAN-AKHIR.md` §11–§12 — cara deploy + blokir tersisa.
- `ARSITEKTUR.md` §2–§3 — audit Supabase proyek `prata` +
  audit deploy Vercel.
- `AUDIT-EXPANSION.md` §8 — blokir Fase 8.
- `scripts/backup-pf.mjs` — skrip backup (37 tabel sesudah v8).
- `DEPLOY.md` (root repo) — ringkasan deploy untuk pemilik.

*Dokumen cutover Fase 8 — 16 November 2026. Repo commit
`f1e68d6`. Tanpa data dummy; tanpa klaim live sebelum cutover
selesai oleh pemilik.*
