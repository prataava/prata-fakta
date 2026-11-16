# CUTOVER — PRATA FAKTA: Migrasi v1–v16 + Go-Live

**Dokumen:** prosedur cutover produksi (migrasi database + deploy +
smoke test + rollback).
**Repo:** `prataava/prata-fakta`, commit `5d3b17b` (Gelombang 2) +
Tahap 13–17 (`dbcada7`) + Ultimate B1 (`ebd4cf7`) + B2 (`f38f7ec`) +
Tahap C–G (`c3efa51`) + Follow-up 1–6 & Tahap H (commit Tahap H
menyusul — lihat `FINAL-PROJECT-COMPLETION.md` §31),
166 halaman build lokal (Turbopack EXIT 0, BUILD_ID `NM3JoG_bTU4FuDCRI5sV5`).
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
- Semua migrasi v1–v12 IDEMPOTEN (aman dijalankan ulang). Satu
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
| 3C | Migrasi **v9** (GRANT eksplisit + RPC) + verifikasi (§3) | SQL Editor |
| 3D | Migrasi **v10** (Gelombang 2, 16 tabel baru + GRANT) + verifikasi (§3) | SQL Editor |
| 3E | Migrasi **v11** (Tahap 13A: rate limiter DB + audit T10) + verifikasi (§3) | SQL Editor |
| 3F | Migrasi **v12** (Tahap 13C: seed 5 job scheduler) + verifikasi (§3) | SQL Editor |
| 3G | Migrasi **v13** (Gelombang B1: kunci kuis terpisah, RPC PATCH kursus atomik, policy arsip/profil) + verifikasi (§3) | SQL Editor |
| 3H | Migrasi **v14** (Gelombang B2: draf tanya, audio podcast, Academy, notifikasi + analytics, akun) + verifikasi (§3) | SQL Editor |
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
v1–v9 dalam satu sesi SQL Editor tanpa jeda deploy, situs tetap
bisa live — dengan catatan ketiga route publik akan mengembalikan
error sampai deploy selesai. Itu bukan kerusakan data, hanya
jendela layanan mati. Pilihan ini dicatat sebagai risiko yang
diterima pemilik, bukan prosedur yang dianjurkan.

**v9 tepat sesudah v8 (F4 — GRANT eksplisit):** v1–v8 tidak
punya GRANT eksplisit untuk tabel baru, dan default Supabase
sejak 30 Okt 2026 tidak lagi memberi grant otomatis ke
anon/authenticated — tanpa v9, SEMUA tabel berpotensi putus
(bukti PGlite: authenticated SELECT `pf_user_preferences` →
42501 sebelum grant). Migrasi v9
(`20261116_pf_v9_grants.sql`) memberi GRANT eksplisit untuk
ke-37 tabel `pf_*` selaras policy RLS tiap tabel, menegaskan
ulang GRANT per kolom kuis, memberi EXECUTE
`pf_has_role`/`pf_is_super_admin`, dan membuat RPC
`pf_akar_salinan`. v9 HANYA MENAMBAH izin tingkat tabel (tidak
mengubah satu policy pun), jadi aman dijalankan kapan pun
sesudah v8 — tidak ada prasyarat deploy tambahan seperti v8.
**Pengecualian yang dicatat:** v9 TIDAK memberi GRANT SELECT
tingkat tabel pada `pf_quiz_questions` (hak tingkat tabel akan
membuka kembali kolom `kunci` — T1-sisa); tabel itu hanya
mendapat GRANT SELECT per kolom tanpa `kunci`, sama seperti
v8. v9 juga TIDAK memberi GRANT INSERT ke anon pada
`pf_newsletter_subscribers`, `pf_correction_reports`, dan
`pf_questions` (T5 tetap berlaku).

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

**Sesudah migrasi v1–v9 selesai (§3):** jalankan lagi perintah
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

**Otomatis (sesudah v13):** workflow
`.github/workflows/backup.yml` menjalankan skrip ini SETIAP
HARI 03.00 UTC + manual dispatch, artefak retensi 7 hari.
Secret yang dibutuhkan: `PF_SUPABASE_URL` +
`PF_SERVICE_ROLE_KEY` (repo Settings → Secrets and variables
→ Actions). Uji restore berkala: PROSEDUR di
`supabase/README.md` §v13 — BUKAN klaim sudah diuji.

---

## 3. Penerapan migrasi v1–v10 BERURUTAN

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

### 3.9 v9 — GRANT eksplisit + RPC akar salinan (remediasi F4)

- Berkas: `supabase/migrations/20261116_pf_v9_grants.sql`
- Bergantung pada v1–v8. **Jalankan TEPAT SESUDAH v8**
  (tidak ada prasyarat deploy tambahan — v9 hanya menambah
  izin, tidak mengubah policy; lihat §0).
- Isi: GRANT eksplisit ke anon + authenticated untuk ke-37
  tabel `pf_*`, selaras dengan command tiap policy RLS
  (SELECT saja 16 tabel; SELECT+INSERT+UPDATE 2 tabel;
  SELECT+INSERT+DELETE 1; SELECT+UPDATE 1;
  SELECT+UPDATE+DELETE 1; SELECT+INSERT+UPDATE+DELETE 14;
  `pf_newsletter_subscribers` khusus: INSERT hanya ke
  authenticated); penegasan ulang REVOKE SELECT tingkat tabel
  + GRANT per kolom `pf_quiz_questions` tanpa `kunci`
  (T1-sisa — JANGAN pernah grant SELECT tingkat tabel pada
  tabel ini); GRANT EXECUTE `pf_has_role` /
  `pf_is_super_admin` (dipanggil dari qual policy); RPC
  `pf_akar_salinan(uuid, text[])` untuk Multi-Source View
  (SECURITY DEFINER, EXECUTE ke anon + authenticated).

Verifikasi tambahan:

```sql
select count(*) from information_schema.table_privileges
where table_schema = 'public' and table_name like 'pf_%'
  and grantee in ('anon','authenticated');
-- ekspektasi: > 0 (sebelum v9: 0 — itulah F4)

select has_column_privilege('anon', 'public.pf_quiz_questions', 'kunci', 'SELECT'),
       has_column_privilege('authenticated', 'public.pf_quiz_questions', 'kunci', 'SELECT');
-- ekspektasi: false, false (T1-sisa tetap tertutup)

select proname from pg_proc where proname = 'pf_akar_salinan';
-- ekspektasi: 1 baris
```

| Pemeriksaan | Ekspektasi sesudah v9 |
|---|---|
| Jumlah tabel `pf_*` | **37** (tidak bertambah) |
| Tabel ber-RLS | **37/37** |
| Jumlah policy `pf_*` | **79** (tidak berubah) |
| GRANT tabel anon/authenticated | **> 0** (sebelum v9: 0) |
| `pf_akar_salinan` | ada (1 fungsi) |

### 3.10 v10 — Gelombang 2 (16 tabel baru + perluasan kolom)

- Berkas: `supabase/migrations/20261116_pf_v10_wave2.sql`
- Bergantung pada v1–v9. **Jalankan TEPAT SESUDAH v9.**
  v10 ADITIF (hanya `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN
  IF NOT EXISTS` + GRANT/policy baru) — tidak mengubah tabel
  atau policy lama. GRANT eksplisit sudah di dalam berkas
  sejak awal (pelajaran F4 — jangan ulangi tanpa grant).
- Tabel baru (16): `pf_stories`, `pf_story_events`,
  `pf_story_articles`, `pf_story_followers`, `pf_courses`,
  `pf_course_modules`, `pf_course_lessons`, `pf_course_progress`,
  `pf_podcast_episodes`, `pf_podcast_history`,
  `pf_podcast_playlist_items`, `pf_research_reports`,
  `pf_documents`, `pf_countries`, `pf_country_facts`,
  `pf_system_settings`.
- Perluasan kolom (14): `pf_knowledge_articles` (jenis, tingkat,
  estimasi_menit, seri); `pf_data_indicators` (cakupan,
  frekuensi, negara_kode); `pf_questions` (publik, kategori,
  membantu); `pf_events` (era, penting, negara_kode);
  `pf_articles` (negara_kode).
- Tervalidasi lokal (PGlite, `scripts/uji-fase8-gel2-migrasi.mjs`
  28/28): v1–v10 dijalankan 2× idempoten TANPA blanket grant.

Verifikasi tambahan:

```sql
select count(*) from pg_tables
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 53

select count(*) from pg_policies
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 106

select count(*) from information_schema.table_privileges
where table_schema = 'public' and table_name like 'pf_%'
  and grantee in ('anon','authenticated');
-- ekspektasi: > 0 dan bertambah dibanding sesudah v9
```

| Pemeriksaan | Ekspektasi sesudah v10 |
|---|---|
| Jumlah tabel `pf_*` | **53** (37 + 16 baru) |
| Tabel ber-RLS | **53/53** |
| Jumlah policy `pf_*` | **106** (79 + 27 baru) |
| GRANT tabel anon/authenticated | **> 0** (bertambah) |
| Baris di 16 tabel baru | **0** (tanpa seed operasional) |

### 3.11 v11 — Tahap 13A (rate limiter DB + audit T10)

- Berkas: `supabase/migrations/20261116_pf_v11_rate_limit_audit.sql`
- Bergantung pada v1–v10. **Jalankan TEPAT SESUDAH v10.**
  v11 ADITIF (hanya `CREATE TABLE IF NOT EXISTS` + `CREATE OR
  REPLACE FUNCTION` + perluasan CHECK audit) — tidak mengubah
  tabel atau policy lama.
- Isi: tabel baru `pf_rate_limits` (1 tabel; store bersama rate
  limiter lintas instance — tanpa policy, akses langsung ditolak
  RLS, hanya lewat RPC); RPC `pf_rate_limit_check` (SECURITY
  DEFINER, increment atomik, GRANT EXECUTE ke anon +
  authenticated); perluasan CHECK `pf_audit_logs` ke **53 aksi**
  (47 dari v9 + 6 baru: `sumber.buat/ubah/hapus/cek/aktif`,
  `negara.hapus`).
- Tervalidasi lokal (PGlite, `scripts/uji-tahap13a.mjs`
  126/126): v1–v11 dijalankan 2× idempoten TANPA blanket grant.

Verifikasi tambahan:

```sql
select count(*) from pg_tables
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 54

select count(*) from pg_policies
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 106

-- RPC limiter: 2 panggilan dalam batas 2 lolos, ke-3 ditolak.
select pf_rate_limit_check('cutover:uji', 2, 60);
select pf_rate_limit_check('cutover:uji', 2, 60);
select pf_rate_limit_check('cutover:uji', 2, 60);
-- ekspektasi: true, true, false (baris uji 'cutover:uji' boleh
-- dibiarkan — kedaluwarsa sendiri; hapus manual bila mau bersih).
```

| Pemeriksaan | Ekspektasi sesudah v11 |
|---|---|
| Jumlah tabel `pf_*` | **54** (53 + 1 baru) |
| Tabel ber-RLS | **54/54** |
| Jumlah policy `pf_*` | **106** (tidak berubah) |
| Policy `pf_rate_limits` | **0** (akses hanya lewat RPC) |
| Aksi audit di CHECK | **53** |

### 3.12 v12 — Tahap 13C (seed 5 job scheduler)

- Berkas: `supabase/migrations/20261116_pf_v12_seed_jobs.sql`
- Bergantung pada v1–v11. **Jalankan TEPAT SESUDAH v11.**
  v12 ADITIF (hanya perluasan CHECK + INSERT seed) — tidak
  mengubah tabel atau policy lama.
- Isi: perluasan CHECK nama `pf_scheduled_jobs` dari 3 nama
  (v5: ingestion/editorial/brief) ke **5 nama** (tambah
  `data-analysis`, `terbitkan-terjadwal`) — tanpa ini, seed dua
  job baru ditolak 23514 dan job locking Tahap 13C fail-open;
  seed 5 job idempoten (`ON CONFLICT DO NOTHING`).
- Tervalidasi lokal (PGlite, `scripts/uji-tahap13-migrasi.mjs`
  15/15): v1–v12 dijalankan 2× idempoten TANPA blanket grant.

Verifikasi tambahan:

```sql
select nama, jadwal_cron from public.pf_scheduled_jobs order by nama;
-- ekspektasi: 5 baris — brief '0 22 * * *', data-analysis
-- '0 1 * * 1', editorial '0 0,6,12,18 * * *', ingestion
-- '*/30 * * * *', terbitkan-terjadwal '0 * * * *'.

select count(*) from pg_tables
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 54 (tidak berubah dari v11)

select count(*) from pg_policies
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 106 (tidak berubah dari v11)
```

| Pemeriksaan | Ekspektasi sesudah v12 |
|---|---|
| Jumlah tabel `pf_*` | **54** |
| Tabel ber-RLS | **54/54** |
| Jumlah policy `pf_*` | **106** |
| Baris `pf_scheduled_jobs` | **5** |

### 3.13 v13 — Gelombang B1 (Audit Ultimate backend & database)

- Berkas: `supabase/migrations/20261116_pf_v13_ultimate.sql`
- Bergantung pada v1–v12. **Jalankan TEPAT SESUDAH v12.**
  v13 sebagian besar ADITIF, kecuali §1 yang MENGHAPUS kolom
  `kunci` dari `pf_quiz_questions` (sesudah datanya dipindah
  ke `pf_quiz_answers` — baca rollback di
  `supabase/README.md` §v13 sebelum menjalankan).
- **PRASYARAT DEPLOY (seperti jendela v8):** kode yang membaca
  kunci dari tabel baru (`getKuisHarian`, kedua route
  `kuis/jawab` + `akademi/kuis/jawab`) WAJIB sudah deploy
  sebelum/saat v13 dijalankan — bila tidak, kuis mati sampai
  deploy selesai. Kebalikannya juga berlaku: kode baru yang
  sudah deploy TETAP jalan terhadap skema lama (route membaca
  `pf_quiz_answers` yang belum ada → `KuisBelumTersediaError`
  + empty state jujur), jadi urutan aman bila ragu: deploy
  kode dulu, baru v13.
- Isi: §1 tabel baru `pf_quiz_answers` (0 policy, GRANT hanya
  service_role) + migrasi data kunci + drop kolom `kunci`;
  §2 RPC `pf_patch_kursus_atomik` (atomik, hanya service_role);
  §3 policy arsip Q&A publik (`publik = true AND status =
  'terjawab'`); §4 kolom `pf_research_reports.indikator_id`
  + backfill + fungsi `pf_topik_yatim()`; §5 tegaskan
  `search_path = public` pada `pf_has_role` /
  `pf_is_super_admin`; §6 policy `pf_profiles` (pemilik atau
  staf); §7 policy `pf_system_settings` tanpa peran `admin`;
  §8 RPC `pf_ai_status_agregat()`; §9 kolom
  `pf_sources.topik_gdelt` + unique index
  `pf_evidence(klaim_id, sumber_url)` (dedup evidence);
  §10 GRANT `SELECT, INSERT, UPDATE, DELETE` ke service_role
  atas SEMUA 55 tabel (wajib — tanpa ini backend mati 42501
  di produksi pasca-default Supabase 30 Okt 2026).
- Tervalidasi lokal (PGlite,
  `scripts/uji-ultimate-backend.mjs`): v1–v13 dijalankan 2×
  idempoten TANPA blanket grant; seed disisipkan sesudah
  v1–v12 dan sebelum v13 agar migrasi kunci + backfill teruji.

Verifikasi tambahan:

```sql
select count(*) from pg_tables
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 55 (tambah pf_quiz_answers)

select count(*) from pg_policies
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 107 (+1 arsip Q&A; pf_quiz_answers = 0 policy)

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'pf_quiz_questions'
  and column_name = 'kunci';
-- ekspektasi: 0 baris (kolom kunci SUDAH TIDAK ADA)

select count(*) from public.pf_quiz_answers;
-- ekspektasi: sama dengan jumlah baris pf_quiz_questions
-- (satu jawaban per soal yang punya kunci)

select proname, prosecdef, proconfig from pg_proc
where proname in ('pf_patch_kursus_atomik', 'pf_topik_yatim', 'pf_ai_status_agregat')
order by proname;
-- ekspektasi: 3 baris; prosecdef = true (SECURITY DEFINER);
-- proconfig memuat search_path=public
```

| Pemeriksaan | Ekspektasi sesudah v13 |
|---|---|
| Jumlah tabel `pf_*` | **55** |
| Tabel ber-RLS | **55/55** |
| Jumlah policy `pf_*` | **107** |
| Kolom `pf_quiz_questions.kunci` | **tidak ada** |
| Baris `pf_quiz_answers` | **= jumlah soal** |

### 3.14 v14 — Gelombang B2 (evaluasi ulang keterbatasan)

- Berkas: `supabase/migrations/20261116_pf_v14_gelombang_b2.sql`
- Bergantung pada v1–v13. **Jalankan TEPAT SESUDAH v13.**
  v14 ADITIF, kecuali dua penggantian CHECK (§4a CHECK jenis
  notifikasi diganti dengan 8 jenis; §5b CHECK audit diganti
  dengan 57 aksi) dan §3 yang mengganti CHECK opsi soal v8
  dengan CHECK v14 — semuanya idempoten (do-block pemeriksa
  constraint) dan teruji 2× di PGlite.
- **PRASYARAT DEPLOY (jendela seperti v8/v13):** kode B2 yang
  membaca kolom baru WAJIB sudah deploy sebelum/saat v14
  dijalankan — select episode kini memuat `audio_bytes` /
  `tts_suara` dan select pertanyaan memuat `jawaban_draf` /
  `referensi_draf` (tanpa v14: PGRST204). Sebaliknya route
  hapus akun/data + jawab kuis + progres menjawab 503 jujur
  bila tabel v14 belum ada (fail-closed), jadi urutan aman
  bila ragu: deploy kode dulu, baru v14.
- Isi: §1 kolom draf Ask the World di `pf_questions`
  (`jawaban_draf`, `referensi_draf`, `draf_dibuat_pada`) +
  index antrean draf; §2 kolom audio podcast
  (`pf_podcast_episodes.audio_bytes`, `tts_suara` — TTS
  server tetap BELUM BISA, lisensi suara id_ID tidak jelas);
  §3 Academy — kolom `pf_quiz_questions.jenis` + CHECK opsi
  v14, kolom kunci baru `pf_quiz_answers` (`kunci_teks`,
  `kunci_jamaks`) + `kunci` boleh null, tabel baru
  `pf_quiz_user_answers` (jawaban tersimpan, 1 policy baca
  sendiri) + `pf_certificates` (1 policy baca sendiri) +
  trigger skor server-side
  `pf_course_progress_skor_server` + fungsi
  `pf_hitung_skor_progres()`; §4 notifikasi + analytics —
  CHECK jenis notifikasi 8 jenis + `kunci_dedup` + unique
  index dedup, 3 kolom preferensi, tabel baru
  `pf_push_subscriptions` (4 policy pemilik),
  `pf_kunjungan` + `pf_app_errors` (policy baca staf), GRANT
  service_role atas `pf_notifications`, RPC
  `pf_kunjungan_harian` / `pf_kunjungan_jalur` /
  `pf_bersihkan_data_lama()` (retensi 90 hari); §5 akun —
  tabel baru `pf_account_deletions` (0 policy, GRANT hanya
  service_role; TANPA FK ke auth.users agar jejak bertahan
  pasca-hapus), CHECK audit v14 (57 aksi: 53 v11 + 4 aksi
  hapus akun/data), 4 policy DELETE pemilik + GRANT DELETE.
  **KOREKSI ATAS AUDIT:** `pf_account_deletions` diklaim ada
  di v13 oleh AUDIT-ULTIMATE.md — klaim itu SALAH (grep
  v1–v13: 0 hasil); tabel ini baru ada di v14.
- Tervalidasi lokal (PGlite,
  `scripts/uji-ultimate-b2-migrasi.mjs`): v1–v14 dijalankan
  2× idempoten TANPA blanket grant; 61 tabel, RLS 61/61,
  119 policy, 0 grant ke PUBLIC, GRANT service_role
  SELECT/INSERT/UPDATE/DELETE atas 6 tabel baru.

Verifikasi tambahan:

```sql
select count(*) from pg_tables
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 61 (55 v13 + 6 baru)

select count(*) from pg_policies
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 119 (107 v13 + 12 baru)

select count(*) from pg_tables
where schemaname = 'public' and tablename like 'pf_%'
  and rowsecurity;
-- ekspektasi: 61 (RLS 61/61)

select pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.pf_audit_logs'::regclass
  and conname = 'pf_audit_logs_aksi_check_v14';
-- ekspektasi: 1 baris; memuat 'akun.hapus', 'data.hapus'

select count(*) from public.pf_account_deletions;
-- ekspektasi: 0 (tabel baru, kosong)
```

| Pemeriksaan | Ekspektasi sesudah v14 |
|---|---|
| Jumlah tabel `pf_*` | **61** |
| Tabel ber-RLS | **61/61** |
| Jumlah policy `pf_*` | **119** |
| CHECK audit | **v14 (57 aksi)** |
| Tabel baru | **6 (jawaban kuis, sertifikat, jejak hapus akun, push, kunjungan, galat)** |

### 3.16 v15 — Tahap C (sisa keterbatasan pasca-B2)

- Berkas: `supabase/migrations/20261116_pf_v15_tahap_c.sql`
- Bergantung pada v1–v14. **Jalankan TEPAT SESUDAH v14.**
  v15 ADITIF, kecuali CHECK audit (§4 mengganti CHECK v14
  dengan CHECK v15 — 57 + 2 aksi) — idempoten (do-block
  pemeriksa constraint) dan teruji 2× di PGlite.
- **PRASYARAT DEPLOY (jendela seperti v14):** kode Tahap C
  yang memakai tabel/kolom baru WAJIB sudah deploy
  sebelum/saat v15 dijalankan — `/api/kuis/jawab` menulis
  `pf_quiz_daily_answers` dan `/api/kuis/skor` membaca
  jawaban tersimpan itu (tanpa v15: 503 jujur "tabel belum
  tersedia"); penulis notifikasi membaca kolom `isu` dengan
  fallback PGRST204 (tanpa v15: notifikasi isu diam-diam
  tidak terkirim, notifikasi kategori/negara tetap jalan).
  Sebaliknya route skor menjawab 503 jujur bila tabel v15
  belum ada (fail-closed), jadi urutan aman bila ragu:
  deploy kode dulu, baru v15.
- Isi: §1 tabel baru `pf_quiz_daily_answers` (jawaban kuis
  harian tersimpan; 1 policy baca sendiri; tulis HANYA
  service role — tanpa policy INSERT pengguna); §2 trigger
  skor harian server-side `pf_quiz_scores_skor_harian_server`
  + fungsi `pf_hitung_skor_harian()` (hitung ulang
  benar/total dari jawaban tersimpan + jumlah soal tanggal
  itu; tolak bila tanggal tanpa soal); §3 kolom baru
  `pf_articles.isu` + index parsial (NULL tidak diindeks);
  §4 CHECK audit v15 (59 aksi: 57 v14 +
  `akademi.soal.buat`, `akademi.sertifikat.cabut`); §5 GRANT
  eksplisit tabel baru (SELECT pemilik + semua hak
  service_role; 0 grant ke PUBLIC/anon).
- Tervalidasi lokal (PGlite,
  `scripts/uji-tahapC-limitasi.mjs`): v1–v15 dijalankan 2×
  idempoten TANPA blanket grant; 62 tabel, RLS 62/62,
  120 policy, 0 grant ke PUBLIC, GRANT service_role
  SELECT/INSERT/UPDATE/DELETE atas 1 tabel baru.

Verifikasi tambahan:

```sql
select count(*) from pg_tables
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 62 (61 v14 + 1 baru)

select count(*) from pg_policies
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 120 (119 v14 + 1 baru)

select count(*) from pg_tables
where schemaname = 'public' and tablename like 'pf_%'
  and rowsecurity;
-- ekspektasi: 62 (RLS 62/62)

select pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.pf_audit_logs'::regclass
  and conname = 'pf_audit_logs_aksi_check_v15';
-- ekspektasi: 1 baris; memuat 'akademi.soal.buat',
-- 'akademi.sertifikat.cabut'

select count(*) from public.pf_quiz_daily_answers;
-- ekspektasi: 0 (tabel baru, kosong)

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'pf_articles'
  and column_name = 'isu';
-- ekspektasi: 1 baris
```

| Pemeriksaan | Ekspektasi sesudah v15 |
|---|---|
| Jumlah tabel `pf_*` | **62** |
| Tabel ber-RLS | **62/62** |
| Jumlah policy `pf_*` | **120** |
| CHECK audit | **v15 (59 aksi)** |
| Tabel baru | **1 (jawaban kuis harian tersimpan)** |
| Kolom baru | **`pf_articles.isu`** |

### 3.17 v16 — Follow-up 5/6: bookmark pengetahuan (F11)

- Berkas: `supabase/migrations/20261116_pf_v16_bookmark_pengetahuan.sql`
- Bergantung pada v1–v15. **Jalankan TEPAT SESUDAH v15.**
  v16 ADITIF, kecuali `pf_bookmarks.artikel_id` yang
  dilonggarkan dari NOT NULL menjadi NULLABLE (CHECK
  satu-target menjaga tiap baris tetap punya tepat satu
  target) — idempoten (do-block pemeriksa constraint/kolom)
  dan teruji 2× di PGlite.
- **PRASYARAT DEPLOY (jendela seperti v15):** kode follow-up
  5/6 yang memakai kolom baru WAJIB sudah deploy
  sebelum/saat v16 dijalankan — `/api/bookmark` menerima
  `pengetahuan_id` dan halaman `/pengetahuan/[slug]`
  membaca `pf_bookmarks.pengetahuan_id` (tanpa v16: route
  menjawab 503 jujur "migrasi v16 belum dijalankan";
  halaman menampilkan tombol Simpan dengan status awal
  "belum disimpan"). Sebaliknya route menjawab 503 jujur
  bila kolom v16 belum ada (fail-closed), jadi urutan aman
  bila ragu: deploy kode dulu, baru v16.
- Isi: §1 kolom baru `pf_bookmarks.pengetahuan_id` (FK ke
  `pf_knowledge_articles` on delete cascade) + `artikel_id`
  NULLABLE + CHECK `pf_bookmarks_satu_target_check` (tepat
  satu dari `artikel_id` / `pengetahuan_id` terisi) +
  UNIQUE `(user_id, pengetahuan_id)` + index
  `pf_bookmarks_pengetahuan_idx`; §2 RLS/policy/GRANT
  TIDAK BERUBAH (4 policy berbasis `user_id` tetap
  berlaku; 0 grant baru).
- Tervalidasi lokal (PGlite,
  `scripts/uji-integrasi14.mjs`): v1–v16 dijalankan 2×
  idempoten TANPA blanket grant; 62 tabel, RLS 62/62,
  0 grant ke PUBLIC; CHECK menolak dua target/tanpa
  target, UNIQUE menolak bookmark pengetahuan ganda.

Verifikasi tambahan:

```sql
select count(*) from pg_tables
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 62 (v16 tanpa tabel baru)

select count(*) from pg_policies
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 120 (v16 tanpa policy baru)

select column_name, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'pf_bookmarks'
  and column_name in ('artikel_id', 'pengetahuan_id');
-- ekspektasi: 2 baris; artikel_id YES, pengetahuan_id YES

select pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.pf_bookmarks'::regclass
  and conname = 'pf_bookmarks_satu_target_check';
-- ekspektasi: 1 baris; memuat '(artikel_id IS NULL) <> (pengetahuan_id IS NULL)'

select count(*) from public.pf_bookmarks
where pengetahuan_id is not null;
-- ekspektasi: 0 (kolom baru, kosong)
```

| Pemeriksaan | Ekspektasi sesudah v16 |
|---|---|
| Jumlah tabel `pf_*` | **62** |
| Tabel ber-RLS | **62/62** |
| Jumlah policy `pf_*` | **120** |
| CHECK audit | **v15 (59 aksi)** |
| Tabel baru | **0** |
| Kolom baru | **`pf_bookmarks.pengetahuan_id`** |

### 3.15 Bila satu berkas gagal

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

Jalankan sesudah v9 (atau sesudah v7 bila v8/v9 ditunda — tetapi
cutover penuh mensyaratkan v9). Semua kueri di SQL Editor.

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
migrasi yang membuat tabel itu (§3.10).

### 4.3 Uji negatif keamanan (T5 + T1-sisa) — sesudah v8/v9

Uji ini membuktikan perbaikan keamanan v8 benar-benar aktif
di produksi — dan tetap aktif sesudah v9 (v9 tidak mengubah
policy apa pun). Jalankan lewat REST dengan anon key (bukan SQL
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

Jalankan sesudah §3 (v1–v9), §4, dan §5 selesai. Semua URL
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

Semua migrasi idempoten. Prosedur baku (§3.14): berhenti,
baca error, perbaiki penyebab, ulangi berkas yang sama.
Jangan pernah "melompat" ke berkas berikutnya untuk
menutupi kegagalan.

### 9.2 Gagal di validasi / smoke test sesudah migrasi

Bila angka verifikasi §3 tidak cocok atau smoke test §6
gagal karena data:

1. Identifikasi tahap yang salah dari angka verifikasi
   (tabel §3.1–§3.8 menunjukkan tahap terakhir yang lolos).
2. Ulangi berkas migrasi tahap itu (§3.14).
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
- [ ] §3C: v9 + verifikasi (37 tabel, 79 policy, GRANT tabel > 0, kunci kuis false/false, `pf_akar_salinan` ada)
- [ ] §3D: v10 + verifikasi (53 tabel, 53/53 RLS, 106 policy, 16 tabel baru 0 baris)
- [ ] §3E: v11 + verifikasi (54 tabel, 54/54 RLS, 106 policy, RPC limiter true/true/false, CHECK audit 53 aksi)
- [ ] §3F: v12 + verifikasi (54 tabel, 106 policy, seed 5 job dengan cron benar)
- [ ] §3G: v13 + verifikasi (55 tabel, 55/55 RLS, 107 policy, kolom kunci hilang, `pf_quiz_answers` = jumlah soal, 3 fungsi SECURITY DEFINER + search_path)
- [ ] §3H: v14 + verifikasi (61 tabel, 61/61 RLS, 119 policy, CHECK audit v14 57 aksi, 6 tabel baru)
- [ ] §4: fungsi + trigger tervalidasi
- [ ] §6: smoke test halaman + API lolos
- [ ] §6.3: login + klik utama + HP/desktop diperiksa pemilik
- [ ] §7: secret GitHub Actions terisi, workflow terpantau
- [ ] §8: super_admin pertama ditetapkan
- [ ] §2: backup pasca-migrasi (61/61 tabel) disimpan di luar repo

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
- `scripts/backup-pf.mjs` — skrip backup (61 tabel sesudah v14;
  dijalankan harian otomatis oleh `.github/workflows/backup.yml`).
- `DEPLOY.md` (root repo) — ringkasan deploy untuk pemilik.

*Dokumen cutover Fase 8 — 16 November 2026. Repo commit
`f1e68d6`. Tanpa data dummy; tanpa klaim live sebelum cutover
selesai oleh pemilik.*
