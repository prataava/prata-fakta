# Supabase — PRATA FAKTA

Proyek Supabase: **'prata'** (URL: `https://wyheuxjpusavuiqpymik.supabase.co`,
dipakai bersama PRATA & TASIK JAYA; organisasi sudah mentok 2 proyek
gratis, jadi TIDAK dibuat proyek baru).

## Menjalankan migrasi (Fase 1)

DDL **tidak bisa** dijalankan dari VM (anon key tidak bisa DDL; service_role
key & DATABASE_URL tidak tersedia di workspace). Jalankan manual:

1. Buka Supabase Dashboard → proyek **prata** → **SQL Editor** → **New query**.
2. Tempel seluruh isi `migrations/20261116_pf_v1_foundation.sql` → **Run**.
3. Jalankan kueri verifikasi di bawah. Migrasi ini idempoten — aman
   dijalankan ulang.

## Verifikasi (jalankan sesudah migrasi)

```sql
select 'pf_profiles' as tabel, count(*) from public.pf_profiles
union all select 'pf_roles', count(*) from public.pf_roles
union all select 'pf_permissions', count(*) from public.pf_permissions
union all select 'pf_role_permissions', count(*) from public.pf_role_permissions
union all select 'pf_categories', count(*) from public.pf_categories
union all select 'pf_sources', count(*) from public.pf_sources
union all select 'pf_newsletter_subscribers', count(*) from public.pf_newsletter_subscribers;
```

Ekspektasi: `pf_roles` 5, `pf_permissions` 9, `pf_role_permissions` 19,
`pf_categories` 34 (10 utama + 24 sub), `pf_sources` 8.

Cek RLS aktif di semua tabel:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename like 'pf_%';
```

Semua baris harus `rowsecurity = true`.

## Menjalankan migrasi (Fase 2)

**WAJIB jalankan migrasi v1 dulu** (`migrations/20261116_pf_v1_foundation.sql`).
Migrasi v2 bergantung pada v1: tabel `pf_categories` dan `pf_sources`,
fungsi `pf_has_role(text)` dan `pf_set_updated_at()`. Menjalankan v2
tanpa v1 akan gagal (FK / fungsi tidak ditemukan).

1. Buka Supabase Dashboard → proyek **prata** → **SQL Editor** → **New query**.
2. Tempel seluruh isi `migrations/20261116_pf_v2_articles.sql` → **Run**.
3. Jalankan kueri verifikasi di bawah. Migrasi ini idempoten — aman
   dijalankan ulang. Tidak ada seed data operasional (tanpa artikel palsu).

## Verifikasi (jalankan sesudah migrasi v2)

```sql
select 'pf_articles' as tabel, count(*) from public.pf_articles
union all select 'pf_article_versions', count(*) from public.pf_article_versions
union all select 'pf_article_sources', count(*) from public.pf_article_sources
union all select 'pf_tags', count(*) from public.pf_tags
union all select 'pf_article_tags', count(*) from public.pf_article_tags
union all select 'pf_bookmarks', count(*) from public.pf_bookmarks
union all select 'pf_reading_history', count(*) from public.pf_reading_history
union all select 'pf_correction_reports', count(*) from public.pf_correction_reports;
```

Ekspektasi: semua **0** (tanpa seed data operasional).

Cek RLS aktif di semua tabel + jumlah policy:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename like 'pf_%'
order by tablename;

select count(*) from pg_policies
where schemaname = 'public' and tablename like 'pf_%';
```

Ekspektasi: **16 tabel** `pf_*` ber-RLS (8 dari v1 + 8 dari v2),
total **51 policy** (18 dari v1 + 33 dari v2: `pf_articles` 5,
`pf_article_versions` 4, `pf_article_sources` 4, `pf_tags` 4,
`pf_article_tags` 4, `pf_bookmarks` 4, `pf_reading_history` 4,
`pf_correction_reports` 4).

Validasi lokal (PGlite, tanpa menyentuh produksi): skrip
`/tmp/pf-sqlcheck/cek-v2.mjs` menjalankan v1 lalu v2 (2x, idempotensi),
menghitung tabel/RLS/policy, dan menguji INSERT + constraint negatif +
trigger — hasil 16 Nov 2026: **SEMUA LOLOS** (16 tabel, 51 policy,
8 insert uji berhasil, 6 uji negatif ditolak, trigger `diperbarui_pada`
terbukti berubah).

## Menjalankan migrasi (Fase 3)

**WAJIB jalankan migrasi v1 dulu, lalu v2**
(`migrations/20261116_pf_v1_foundation.sql`,
`migrations/20261116_pf_v2_articles.sql`). Migrasi v3 bergantung pada
v1+v2: tabel `pf_sources` dan `pf_articles`, fungsi
`pf_has_role(text)`. Menjalankan v3 tanpa v1+v2 akan gagal (FK /
fungsi tidak ditemukan). Urutan di dalam v3 juga penting:
`pf_ingestion_runs` → `pf_raw_items` → ALTER `pf_sources` → ALTER
`pf_articles` (kolom `raw_item_id` mereferensikan `pf_raw_items`).

1. Buka Supabase Dashboard → proyek **prata** → **SQL Editor** → **New query**.
2. Tempel seluruh isi `migrations/20261116_pf_v3_ingestion.sql` → **Run**.
3. Jalankan kueri verifikasi di bawah. Migrasi ini idempoten — aman
   dijalankan ulang. Tidak ada seed data operasional (tanpa item mentah
   palsu). Data mentah (`pf_ingestion_runs`, `pf_raw_items`) bersifat
   internal: hanya ditulis service role dan dibaca peran staf
   (super_admin / editor / fact_checker; raw items juga writer) —
   TIDAK ADA policy baca publik untuk kedua tabel ini; yang publik
   hanya artikel terbit. `pf_raw_items` hanya menyimpan metadata +
   ringkasan sumber + URL, bukan isi penuh artikel media lain.

## Verifikasi (jalankan sesudah migrasi v3)

```sql
select 'pf_ingestion_runs' as tabel, count(*) from public.pf_ingestion_runs
union all select 'pf_raw_items', count(*) from public.pf_raw_items;
```

Ekspektasi: semua **0** (tanpa seed data operasional).

Cek kolom baru:

```sql
select column_name from information_schema.columns
where table_schema = 'public'
and table_name = 'pf_sources'
and column_name in ('terakhir_diambil', 'jumlah_item');

select column_name from information_schema.columns
where table_schema = 'public'
and table_name = 'pf_articles'
and column_name = 'raw_item_id';
```

Ekspektasi: 2 baris `pf_sources` + 1 baris `pf_articles`.

Cek RLS aktif di semua tabel + jumlah policy:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename like 'pf_%'
order by tablename;

select count(*) from pg_policies
where schemaname = 'public' and tablename like 'pf_%';
```

Ekspektasi: **18 tabel** `pf_*` ber-RLS (8 dari v1 + 8 dari v2 + 2
dari v3), total **53 policy** (51 dari v1+v2 + 2 dari v3:
`pf_ingestion_runs` 1, `pf_raw_items` 1 — keduanya select staf saja).

Validasi lokal (PGlite, tanpa menyentuh produksi): skrip
`/tmp/pf-sqlcheck/cek-v3.mjs` menjalankan v1 lalu v2 lalu v3 (v3 2x,
idempotensi), menghitung tabel/RLS/policy dan kolom baru, lalu menguji
INSERT + constraint negatif — hasil 16 Nov 2026: **SEMUA LOLOS**
(18 tabel, RLS 18/18, 53 policy, 3 kolom baru ada, 6 insert uji
berhasil — 1 run + 2 raw item termasuk relasi `disalin_dari` +
perbarui `pf_sources` + 1 artikel dengan `raw_item_id` — dan 6 uji
negatif ditolak: status run, `dipicu_oleh`, `status_verifikasi`,
status raw item, `hash_url` duplikat, FK `sumber_id` tidak ada).

## Menjalankan migrasi (Fase 4)

**WAJIB jalankan migrasi v1 dulu, lalu v2, lalu v3**
(`migrations/20261116_pf_v1_foundation.sql`,
`migrations/20261116_pf_v2_articles.sql`,
`migrations/20261116_pf_v3_ingestion.sql`). Migrasi v4 bergantung
pada v1+v2+v3: tabel `pf_articles` dan `pf_raw_items`, tabel
`auth.users`, fungsi `pf_has_role(text)`. Menjalankan v4 tanpa
v1+v2+v3 akan gagal (FK / fungsi tidak ditemukan). Urutan di dalam
v4 juga penting: `pf_ai_runs` → `pf_claims` → `pf_evidence` →
`pf_verification_records` → `pf_daily_briefs` (tiap tabel merujuk
tabel sebelumnya).

1. Buka Supabase Dashboard → proyek **prata** → **SQL Editor** → **New query**.
2. Tempel seluruh isi `migrations/20261116_pf_v4_ai.sql` → **Run**.
3. Jalankan kueri verifikasi di bawah. Migrasi ini idempoten — aman
   dijalankan ulang. Tidak ada seed data operasional (tanpa run AI
   palsu, klaim palsu, atau brief palsu). Tabel AI Editorial bersifat
   internal: hanya ditulis service role dan dibaca peran staf
   (super_admin / editor / fact_checker / writer) — TIDAK ADA policy
   tulis untuk peran staf. Pengecualian: `pf_daily_briefs`
   berstatus `terbit` boleh dibaca publik; draf tetap staf saja.

## Verifikasi (jalankan sesudah migrasi v4)

```sql
select 'pf_ai_runs' as tabel, count(*) from public.pf_ai_runs
union all select 'pf_claims', count(*) from public.pf_claims
union all select 'pf_evidence', count(*) from public.pf_evidence
union all select 'pf_verification_records', count(*) from public.pf_verification_records
union all select 'pf_daily_briefs', count(*) from public.pf_daily_briefs;
```

Ekspektasi: semua **0** (tanpa seed data operasional).

Cek RLS aktif di semua tabel + jumlah policy:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename like 'pf_%'
order by tablename;

select count(*) from pg_policies
where schemaname = 'public' and tablename like 'pf_%';
```

Ekspektasi: **23 tabel** `pf_*` ber-RLS (8 dari v1 + 8 dari v2 + 2
dari v3 + 5 dari v4), total **59 policy** (53 dari v1–v3 + 6 dari
v4: `pf_ai_runs` 1, `pf_claims` 1, `pf_evidence` 1,
`pf_verification_records` 1, `pf_daily_briefs` 2 — 1 baca publik +
1 baca staf).

Validasi lokal (PGlite, tanpa menyentuh produksi): skrip
`/tmp/pf-sqlcheck/cek-v4.mjs` menjalankan v1 lalu v2 lalu v3 lalu
v4 (v4 2x, idempotensi), menghitung tabel/RLS/policy, lalu menguji
INSERT + constraint negatif — hasil 16 Nov 2026: **SEMUA LOLOS**
(23 tabel, RLS 23/23, 59 policy, 5 insert uji berhasil — 1 ai_run
+ 1 klaim + 1 evidence termasuk relasi klaim→evidence + 1
verification record termasuk relasi raw_item→verification + 1
daily brief — dan 7 uji negatif ditolak: agen ai_run, status
ai_run, status klaim, arah evidence, keputusan verification
record, klaim tanpa artikel_id DAN raw_item_id, tanggal brief
duplikat).

## Menjalankan migrasi (Fase 5)

**WAJIB jalankan migrasi v1 dulu, lalu v2, lalu v3, lalu v4**
(`migrations/20261116_pf_v1_foundation.sql`,
`migrations/20261116_pf_v2_articles.sql`,
`migrations/20261116_pf_v3_ingestion.sql`,
`migrations/20261116_pf_v4_ai.sql`). Migrasi v5 bergantung
pada v1+v2+v3+v4: tabel `pf_articles` dan `pf_profiles`,
tabel `auth.users`, fungsi `pf_has_role(text)` dan
`pf_set_updated_at()`. Menjalankan v5 tanpa v1–v4 akan gagal
(FK / fungsi tidak ditemukan). Urutan di dalam v5 juga
penting: `pf_audit_logs` → `pf_editorial_reviews` →
`pf_scheduled_jobs` → ALTER `pf_articles` (kolom
`diterbitkan_oleh`) → ALTER `pf_profiles` (kolom `nonaktif`)
→ seed jadwal (tabel `pf_editorial_reviews` merujuk
`pf_articles`).

1. Buka Supabase Dashboard → proyek **prata** → **SQL Editor** → **New query**.
2. Tempel seluruh isi `migrations/20261116_pf_v5_editorial.sql` → **Run**.
3. Jalankan kueri verifikasi di bawah. Migrasi ini idempoten — aman
   dijalankan ulang. Seed di sini HANYA konfigurasi jadwal nyata
   dari workflow yang sudah ada (ingestion 30 menit, pipeline
   editorial 6 jam, Daily Brief 05.00 WIB) — BUKAN data dummy
   operasional (tanpa log audit palsu, review palsu, atau artikel
   palsu). Ketiga tabel baru bersifat internal: hanya ditulis
   service role dan dibaca peran staf — TIDAK ADA policy tulis
   untuk peran staf. `pf_audit_logs` hanya dibaca super_admin /
   editor; `pf_editorial_reviews` dan `pf_scheduled_jobs` dibaca
   staf (super_admin / editor / fact_checker / writer).

## Verifikasi (jalankan sesudah migrasi v5)

```sql
select 'pf_audit_logs' as tabel, count(*) from public.pf_audit_logs
union all select 'pf_editorial_reviews', count(*) from public.pf_editorial_reviews
union all select 'pf_scheduled_jobs', count(*) from public.pf_scheduled_jobs;
```

Ekspektasi: `pf_audit_logs` **0**, `pf_editorial_reviews` **0**,
`pf_scheduled_jobs` **3** (seed konfigurasi jadwal).

Cek kolom baru:

```sql
select column_name from information_schema.columns
where table_schema = 'public'
and table_name = 'pf_articles'
and column_name = 'diterbitkan_oleh';

select column_name from information_schema.columns
where table_schema = 'public'
and table_name = 'pf_profiles'
and column_name = 'nonaktif';
```

Ekspektasi: 1 baris `pf_articles` + 1 baris `pf_profiles`.

Cek RLS aktif di semua tabel + jumlah policy:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename like 'pf_%'
order by tablename;

select count(*) from pg_policies
where schemaname = 'public' and tablename like 'pf_%';
```

Ekspektasi: **26 tabel** `pf_*` ber-RLS (8 dari v1 + 8 dari v2 + 2
dari v3 + 5 dari v4 + 3 dari v5), total **62 policy** (59 dari
v1–v4 + 3 dari v5: `pf_audit_logs` 1, `pf_editorial_reviews` 1,
`pf_scheduled_jobs` 1 — ketiganya select staf saja).

Validasi lokal (PGlite, tanpa menyentuh produksi): skrip
`/tmp/pf-sqlcheck/cek-v5.mjs` menjalankan v1 lalu v2 lalu v3 lalu
v4 lalu v5 (v5 2x, idempotensi), menghitung tabel/RLS/policy,
lalu menguji INSERT + constraint negatif — hasil 16 Nov 2026:
**SEMUA LOLOS** (26 tabel, RLS 26/26, 62 policy, 3 baris seed
jobs terverifikasi, 2 kolom baru ada, insert uji berhasil — 1
audit log + 1 review editorial termasuk relasi artikel→review
+ update `diterbitkan_oleh` dan `nonaktif` — dan 7 uji negatif
ditolak: aksi audit, keputusan review, nama job,
status_terakhir job, review tanpa catatan, FK artikel_id tidak
ada, nama job duplikat).

## Menetapkan super_admin pertama

Setelah ada akun terdaftar (daftar lewat aplikasi), tetapkan lewat SQL Editor:

```sql
insert into public.pf_user_roles (user_id, role_id)
select 'UUID-AKUN-ANDA', id from public.pf_roles where nama = 'super_admin';
```

Ganti `UUID-AKUN-ANDA` dengan UUID dari Authentication → Users.

## Pola yang dipakai

Mengikuti pola TASIK JAYA (`~/workspace/tasik-jaya/supabase/migrations/`):
`CREATE TABLE IF NOT EXISTS` + `ENABLE ROW LEVEL SECURITY` + policy +
trigger + function + index, diterapkan manual via SQL Editor.

## Menjalankan migrasi (Fase 6)

**WAJIB jalankan migrasi v1 dulu, lalu v2, lalu v3, lalu v4, lalu v5**
(`migrations/20261116_pf_v1_foundation.sql`,
`migrations/20261116_pf_v2_articles.sql`,
`migrations/20261116_pf_v3_ingestion.sql`,
`migrations/20261116_pf_v4_ai.sql`,
`migrations/20261116_pf_v5_editorial.sql`). Migrasi v6 bergantung
pada v1–v5: tabel `pf_articles`, tabel `auth.users`, fungsi
`pf_has_role(text)` dan `pf_set_updated_at()`. Menjalankan v6 tanpa
v1–v5 akan gagal (FK / fungsi tidak ditemukan). Urutan di dalam v6
juga penting: `pf_knowledge_articles` → `pf_followed_topics` →
`pf_notifications` → `pf_quiz_questions` → `pf_data_indicators` →
`pf_data_points` → `pf_events` → `pf_event_timeline` →
`pf_questions` → ALTER `pf_articles` (kolom `lintang` / `bujur`).

1. Buka Supabase Dashboard → proyek **prata** → **SQL Editor** → **New query**.
2. Tempel seluruh isi `migrations/20261116_pf_v6_advanced.sql` → **Run**.
3. Jalankan kueri verifikasi di bawah. Migrasi ini idempoten — aman
   dijalankan ulang. **Tanpa seed operasional**: tanpa artikel
   pengetahuan palsu, indikator palsu, kuis palsu, atau peristiwa
   palsu — semua isi diisi lewat API / agen setelah migrasi berjalan.

Kebijakan baca: `pf_quiz_questions`, `pf_data_indicators`,
`pf_data_points`, `pf_events`, `pf_event_timeline` dibaca publik
semua baris; `pf_knowledge_articles` dibaca publik hanya yang
`status='terbit'` (draf hanya staf); `pf_followed_topics` dan
`pf_notifications` hanya pemilik; `pf_questions` dibaca pemilik +
staf, dan siapa pun (termasuk anon) boleh mengajukan pertanyaan.
Tulis lewat service role (API) — TIDAK ADA policy tulis pengguna
untuk tabel pengetahuan, kuis, data, dan peristiwa; `pf_questions`
tidak punya policy update/delete pengguna.

## Verifikasi (jalankan sesudah migrasi v6)

```sql
select 'pf_knowledge_articles' as tabel, count(*) from public.pf_knowledge_articles
union all select 'pf_followed_topics', count(*) from public.pf_followed_topics
union all select 'pf_notifications', count(*) from public.pf_notifications
union all select 'pf_quiz_questions', count(*) from public.pf_quiz_questions
union all select 'pf_data_indicators', count(*) from public.pf_data_indicators
union all select 'pf_data_points', count(*) from public.pf_data_points
union all select 'pf_events', count(*) from public.pf_events
union all select 'pf_event_timeline', count(*) from public.pf_event_timeline
union all select 'pf_questions', count(*) from public.pf_questions;
```

Ekspektasi: semua **0** (tanpa seed data operasional).

Cek kolom baru:

```sql
select column_name from information_schema.columns
where table_schema = 'public'
and table_name = 'pf_articles'
and column_name in ('lintang', 'bujur');
```

Ekspektasi: 2 baris `pf_articles` (koordinat terverifikasi saja;
NULL bila belum terverifikasi — peta hanya menampilkan yang
non-null).

Cek RLS aktif di semua tabel + jumlah policy:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename like 'pf_%'
order by tablename;

select count(*) from pg_policies
where schemaname = 'public' and tablename like 'pf_%';
```

Ekspektasi: **35 tabel** `pf_*` ber-RLS (8 dari v1 + 8 dari v2 + 2
dari v3 + 5 dari v4 + 3 dari v5 + 9 dari v6), total **76 policy**
(62 dari v1–v5 + 14 dari v6: `pf_knowledge_articles` 2,
`pf_followed_topics` 3, `pf_notifications` 2,
`pf_quiz_questions` 1, `pf_data_indicators` 1,
`pf_data_points` 1, `pf_events` 1, `pf_event_timeline` 1,
`pf_questions` 2).

Validasi lokal (PGlite, tanpa menyentuh produksi): skrip
`/tmp/pf-sqlcheck/cek-v6.mjs` menjalankan v1 lalu v2 lalu v3 lalu
v4 lalu v5 lalu v6 (v6 2x, idempotensi), menghitung tabel/RLS/policy,
lalu menguji INSERT + constraint negatif — hasil 16 Nov 2026:
**SEMUA LOLOS** (35 tabel, RLS 35/35, 76 policy, 9 tabel baru
kosong sebelum insert, 2 kolom baru ada, insert uji berhasil — 2
knowledge (terbit + harian hari ini), 1 followed_topic, 1
notifikasi, 1 quiz tanggal hari ini merujuk artikel, 1 indikator +
2 data points, 2 event (1 berkoordinat + 1 tanpa koordinat NULL)
+ 1 timeline, 2 question (anon + user), update `lintang`/`bujur`
artikel + update knowledge membuktikan trigger
`diperbarui_pada` — dan 12 uji negatif ditolak: topik knowledge,
status knowledge, kunci quiz 5, tipe followed_topic, jenis
notifikasi, kategori indikator, data_point duplikat, FK event_id
timeline tidak ada, status question, harian_tanggal duplikat,
followed_topic duplikat, FK artikel_id kuis tidak ada).

## Migrasi v7 — Skor kuis (Fase 7, 16 Nov 2026)

Berkas: `20261116_pf_v7_quiz_scores.sql`. Jalankan SETELAH v1–v6,
di SQL Editor yang sama (idempoten — aman diulang).

Isi:

- Tabel baru `pf_quiz_scores`: `id` uuid PK, `user_id` uuid
  NOT NULL FK `auth.users` ON DELETE CASCADE, `tanggal` date,
  `benar` int check 0..5, `total` int check 1..10,
  check `benar <= total`, unique `(user_id, tanggal)`,
  index `(user_id, tanggal desc)`, trigger `diperbarui_pada`
  (memakai `pf_set_updated_at()` dari v1).
- RLS aktif + 3 policy (baca pemilik, tambah pemilik, ubah
  pemilik; tanpa policy delete/baca publik — skor hanya milik
  pengguna login yang membuatnya).
- Pengerasan T7 audit keamanan Fase 7 (tanpa mengubah v1):
  `ALTER FUNCTION public.pf_has_role(text)`,
  `pf_is_super_admin()`, `pf_handle_new_user()`
  `SET search_path = public`.

Ekspektasi sesudah v7: **36 tabel** `pf_*` ber-RLS (35 dari
v1–v6 + 1 dari v7), total **79 policy** (76 dari v1–v6 + 3
dari v7: `pf_quiz_scores` 3).

Verifikasi cepat:

```sql
select count(*) from pg_tables
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 36

select count(*) from pg_policies
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 79

select proname, proconfig from pg_proc
where proname in ('pf_has_role', 'pf_is_super_admin', 'pf_handle_new_user');
-- ekspektasi: ketiganya proconfig = {search_path=public}
```

Validasi lokal (PGlite, tanpa menyentuh produksi): skrip
`scripts/uji-fase7.mjs` di repo menjalankan v1 lalu v2 lalu v3
lalu v4 lalu v5 lalu v6 lalu v7 (v7 2x, idempotensi),
menghitung tabel/RLS/policy, menguji skenario `pf_quiz_scores`
(insert, upsert, unique, 6 check/FK negatif, trigger), lalu
memeriksa perbaikan keamanan T1/T3/T4/T6/T7/T9 — hasil
16 Nov 2026: **87/87 LOLOS**.

## Migrasi v8 — Expansion Gelombang 1 (Fase 8, 16 Nov 2026)

Berkas: `20261116_pf_v8_expansion.sql`. Jalankan SETELAH v1–v7,
di SQL Editor yang sama (idempoten — aman diulang; Gelombang 2/3
boleh meng-append ke berkas yang SAMA, lalu validasi ulang
v1–v8 di PGlite).

### URUTAN PENTING — T5: patch route dulu, baru drop policy

Migrasi v8 mencabut tiga policy INSERT anonim (`pf_newsletter
daftar publik`, `pf_correction_reports kirim publik`,
`pf_questions tambah publik`) TANPA pengganti. Bila migrasi
dijalankan SEBELUM route dipatch, ketiga route publik mati
(INSERT ditolak RLS). Urutan yang benar:

1. Deploy kode yang memindahkan INSERT ketiga route ke service
   role (`src/app/api/langganan/route.ts`,
   `src/app/api/laporan/route.ts`, `src/app/api/tanya/route.ts` —
   semuanya memakai `createServiceClient()`; service_role
   melewati RLS). Juga dipindah ke service role pada kesempatan
   yang sama: baca kunci di `POST /api/kuis/jawab` dan
   `getKuisHarian` (T1-sisa).
2. Pastikan `SUPABASE_SERVICE_ROLE_KEY` sudah diatur di Vercel
   (tanpa key, ketiga route menjawab 503 jujur).
3. BARU jalankan migrasi v8 di SQL Editor.

### Isi

- **T5:** DROP POLICY IF EXISTS ketiga policy insert anonim di
  atas (tanpa policy insert pengganti).
- **T8:** `pf_roles` → baca login saja (`auth.uid() is not null`,
  Opsi A — staf-only mentah akan memutus `getUserRoles()` di
  `src/lib/auth/roles.ts:32-48`); `pf_permissions` +
  `pf_role_permissions` → staf-only (4 peran);
  `pf_article_sources` + `pf_article_tags` → hanya bila artikel
  terbit ATAU staf (pola `pf_article_versions` v2). Policy tulis
  tidak diubah. `pf_tags` tidak diubah (taksonomi mandiri).
- **Area 1:** `pf_claims` / `pf_evidence` /
  `pf_verification_records` → baca publik terbatas bila artikel
  terbit, ATAU staf.
- **T1-sisa:** cabut SELECT tingkat tabel di
  `pf_quiz_questions` dari anon/authenticated, lalu GRANT SELECT
  per kolom untuk semua kolom KECUALI `kunci` (baca kunci hanya
  lewat service role). Catatan: `REVOKE SELECT (kunci)` saja
  TIDAK cukup — grant SELECT tingkat tabel (default Supabase)
  tetap memberi akses ke semua kolom; dibuktikan di PGlite saat
  validasi v8.
- **Perluasan CHECK enum (D4):**
  - `pf_audit_logs.aksi`: 18 nilai v5 + 28 aksi Fase 8 yang
    direncanakan: `cerita.buat/ubah/hapus`,
    `pengetahuan.buat/ubah/hapus`, `event.buat/ubah/hapus`,
    `data.indikator`, `data.titik`, `riset.buat/ubah/hapus`,
    `negara.buat/ubah`, `tanya.jawab`,
    `akademi.kursus/modul/progres`, `podcast.episode/terbit`,
    `sistem.flag/pengumuman`, `kuis.buat/ubah`,
    `preferensi.ubah`, `ekspor.data`.
  - `pf_scheduled_jobs.nama`: 3 nilai v5 +
    `data-analysis`, `terbitkan-terjadwal`, `digest`, `podcast`,
    `riset`. TIDAK ada seed baris job baru di v8.
  - `pf_ai_runs.agen`: 10 agen v4 + `story_clustering`,
    `podcast_script`, `research_synthesis` (disiapkan untuk
    Gelombang 2/3; agen-agen ini belum berjalan).
- **D1–D2:** CHECK panjang array `pf_quiz_questions.opsi`
  (1..10); CHECK lintang (-90..90) dan bujur (-180..180) di
  `pf_events` dan `pf_articles`. **D3:** validasi target
  `pf_followed_topics` di API (`POST/DELETE /api/topik` —
  kategori wajib slug taksonomi; negara/isu wajib huruf/spasi/
  tanda hubung); FK penuh ditunda ke Gelombang 2 (butuh tabel
  `pf_countries`).
- **Area 7:** tabel baru `pf_user_preferences` (satu baris per
  akun: `digest_harian`, `notifikasi_topik`,
  `notifikasi_koreksi`, `tampilkan_profil_publik`; RLS 3 policy
  pemilik).
- **Area 3:** kolom baru `peran` (`utama`/`koroborasi`/`konteks`/
  `bantahan`) + `kutipan` di `pf_article_sources`.
- **Area 13:** CHECK `pf_correction_reports.jenis` diperluas
  (4 nilai lama dipertahankan + `kesalahan_informasi`,
  `sumber_tidak_valid`, `gambar_tidak_sesuai`, `duplikat`,
  `perlu_pembaruan`); `artikel_id` boleh NULL (laporan tanpa
  artikel); kolom baru `pelapor_email` (opsional),
  `nomor_lacak` (unique, untuk lacak status), `tautan_artikel`.

Ekspektasi sesudah v8: **37 tabel** `pf_*` ber-RLS (36 dari
v1–v7 + 1 dari v8), total **79 policy** (79 dari v1–v7 − 3
policy insert anonim T5 + 3 policy `pf_user_preferences` = 79;
penggantian policy T8 dan Area 1 tidak mengubah jumlah).

Verifikasi cepat:

```sql
select count(*) from pg_tables
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 37

select count(*) from pg_policies
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 79

-- Negatif T5 (sebagai anon): INSERT ke pf_newsletter_subscribers /
-- pf_correction_reports / pf_questions harus DITOLAK (42501).
-- Negatif T1-sisa (sebagai anon/authenticated): SELECT kunci FROM
-- pf_quiz_questions harus DITOLAK (42501); kolom lain tetap bisa.
```

Validasi lokal (PGlite, tanpa menyentuh produksi): skrip
`scripts/uji-fase8-gel1.mjs` di repo menjalankan v1–v7 lalu v8
(v8 2x, idempotensi), membuktikan dulu celah T5/T1/T8 memang
ada SEBELUM v8 (insert anon berhasil, kunci terbaca, pf_roles
terlihat), lalu menguji sesudah v8 (uji negatif T5/T8/T1,
Area 1, CHECK enum, D1/D2, tabel/kolom baru) dan pemeriksaan
statis (patch service role, desain G1/G2/G3, berkas Area
1/3/13/7, fungsi murni streak/validasi/nomor lacak).

### Pengecekan berkala T1-sisa (Gate keamanan Fase 8)

Perlindungan kolom `kunci` di §v8 di atas bertumpu pada GRANT
per kolom — dan GRANT itu RAPUH terhadap satu perintah:
`GRANT SELECT ON pf_quiz_questions TO anon;` (mis. diklik di
Dashboard → Table Editor → "Grant access", atau dijalankan
ulang oleh skrip setup) memberi SELECT tingkat tabel, dan hak
tingkat tabel MENGALAHKAN pembatasan per kolom — kunci
terbuka lagi tanpa perubahan policy apa pun. Terbukti di
PGlite (gate Fase 8): sesudah grant tingkat tabel,
`has_column_privilege('anon', ..., 'kunci', 'SELECT') = true`
dan `SELECT kunci` sebagai anon BERHASIL; sesudah revoke
ulang + grant per kolom, tertutup lagi.

Jalankan cek ini berkala (mis. tiap selesai utak-atik hak
akses di Dashboard, atau minimal sebulan sekali) di SQL Editor
sebagai pemilik — SEMUA baris harus `false` / `0`:

```sql
-- 1. Hak kolom kunci harus false untuk anon DAN authenticated.
select has_column_privilege('anon', 'public.pf_quiz_questions', 'kunci', 'SELECT') as anon_bisa_baca_kunci,
       has_column_privilege('authenticated', 'public.pf_quiz_questions', 'kunci', 'SELECT') as auth_bisa_baca_kunci;
-- ekspektasi: false, false

-- 2. Tidak boleh ada GRANT SELECT tingkat tabel ke anon/authenticated
--    pada pf_quiz_questions (baris di bawah = grant per kolom, aman).
select grantee, privilege_type, is_grantable
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'pf_quiz_questions'
  and column_name = 'kunci' and grantee in ('anon', 'authenticated');
-- ekspektasi: 0 baris

-- 3. Bila cek 1/2 gagal, pulihkan (lalu ulangi cek 1/2):
--    revoke select on public.pf_quiz_questions from anon, authenticated;
--    grant select (id, tanggal, pertanyaan, opsi, penjelasan,
--      sumber_url, sumber_nama, artikel_id, dibuat_pada)
--      on public.pf_quiz_questions to anon, authenticated;
--    (JANGAN grant select tingkat tabel lagi sesudahnya.)
```

## Migrasi v9 — GRANT eksplisit + RPC akar salinan (Fase 8 remediasi F4, 16 Nov 2026)

Berkas: `20261116_pf_v9_grants.sql`. Jalankan SETELAH v1–v8,
di SQL Editor yang sama (idempoten — aman diulang). Dibuat
sebagai migrasi BARU (bukan amend v8) karena CUTOVER.md
melarang mengubah berkas migrasi apa pun.

### Mengapa v9 (temuan F4, TINGGI — LAPORAN-FASE-8.md §12.5)

v1–v8 tidak punya GRANT eksplisit untuk tabel baru (kecuali
v8:190, grant per kolom kuis). Semua tabel mengandalkan
"grant default Supabase" — yang berubah sejak 30 Okt 2026:
tabel baru di proyek lama TIDAK LAGI otomatis mendapat grant
ke anon/authenticated. Bukti PGlite: authenticated SELECT
`pf_user_preferences` → 42501 sebelum grant. Karena cutover
menjalankan v1–v8 sebagai tabel baru, tanpa v9 SEMUA tabel
berpotensi putus. Baterai repo tidak menangkap ini selama
gate karena memberi blanket grant di awal
(`uji-fase8-gel1.mjs` lama baris 131) — baterai itu kini
direstrukturisasi menjadi 4 fase (Fase 3 membuktikan F4
dengan 42501, Fase 4 membuktikan v9 menutupnya).

### Isi

- **GRANT tingkat tabel (37 tabel), diturunkan dari
  `pg_policies` pasca-v8** — tiap (tabel, perintah) diberi
  GRANT ke anon + authenticated bila ada ≥ 1 policy dengan
  command itu (semua policy v1–v8 berlaku untuk peran PUBLIC;
  siapa yang benar-benar lolos diatur qual policy, bukan
  grant). Grant adalah gerbang tingkat tabel; RLS tetap
  penegak baris — grant di sini TIDAK melonggarkan apa pun
  yang RLS tolak. Ringkasnya:
  - SELECT saja (16): `pf_ai_runs`, `pf_audit_logs`,
    `pf_claims`, `pf_daily_briefs`, `pf_data_indicators`,
    `pf_data_points`, `pf_editorial_reviews`,
    `pf_event_timeline`, `pf_events`, `pf_evidence`,
    `pf_ingestion_runs`, `pf_knowledge_articles`,
    `pf_questions`, `pf_raw_items`, `pf_scheduled_jobs`,
    `pf_verification_records`.
  - SELECT+INSERT+UPDATE (2): `pf_quiz_scores`,
    `pf_user_preferences` (tanpa DELETE — tidak ada policy
    DELETE).
  - SELECT+INSERT+DELETE (1): `pf_followed_topics` (tanpa
    policy UPDATE).
  - SELECT+UPDATE (1): `pf_notifications` (ditulis service
    role).
  - SELECT+UPDATE+DELETE (1): `pf_correction_reports`
    (tanpa INSERT — policy insert anonim dicabut v8, T5).
  - SELECT+INSERT+UPDATE+DELETE (14): `pf_article_sources`,
    `pf_article_tags`, `pf_article_versions`, `pf_articles`,
    `pf_bookmarks`, `pf_categories`, `pf_permissions`,
    `pf_profiles`, `pf_reading_history`,
    `pf_role_permissions`, `pf_roles`, `pf_sources`,
    `pf_tags`, `pf_user_roles`.
  - Total pernyataan GRANT tingkat tabel: 37 (16 + 2 + 1 + 1
    + 1 + 14 + 2 baris newsletter, lihat bawah). Ditambah
    1 GRANT per kolom kuis (§3) dan 3 GRANT EXECUTE (§4–§5):
    total 41 pernyataan GRANT + 2 REVOKE + 1 CREATE OR
    REPLACE FUNCTION di v9.
- **Pengecualian `pf_newsletter_subscribers` (T5):**
  SELECT/UPDATE/DELETE ke anon + authenticated, tetapi
  INSERT HANYA ke authenticated — satu-satunya policy tulis
  tabel ini mensyaratkan super_admin, dan anon tidak pernah
  bisa menjadi super_admin; INSERT anonim adalah persis
  vektor penyalahgunaan T5.
- **Pengecualian `pf_quiz_questions` (T1-sisa):** TANPA
  GRANT SELECT tingkat tabel (hak tingkat tabel mengalahkan
  pembatasan per kolom dan membuka kembali kolom `kunci`).
  v9 menegaskan ulang v8:189-191 secara idempoten: REVOKE
  SELECT tingkat tabel + GRANT SELECT per kolom untuk semua
  kolom KECUALI `kunci`.
- **GRANT EXECUTE (2):** `pf_has_role(text)` dan
  `pf_is_super_admin()` ke anon + authenticated — keduanya
  dipanggil dari qual policy RLS, dan pemanggilan dari policy
  membutuhkan hak EXECUTE (dibuktikan PGlite: sesudah
  `revoke execute ... from public`, anon SELECT
  `pf_permissions` gagal "permission denied for function
  pf_has_role"). TIDAK diberi grant: `pf_handle_new_user()`
  (trigger signup — dipanggil sistem) dan
  `pf_set_updated_at()` (fungsi trigger — dipicu DML).
- **RPC `pf_akar_salinan(uuid, text[])` (Area 3):** resolusi
  rantai salinan `disalin_dari` untuk Multi-Source View —
  SECURITY DEFINER (pf_raw_items hanya boleh dibaca staf),
  hanya mengembalikan metadata minimal yang sudah publik
  (judul + nama sumber akar) untuk artikel TERBIT; artikel
  tidak terbit / tidak ada → himpunan kosong. EXECUTE
  dicabut dari PUBLIC lalu diberi ke anon + authenticated.
  Kontrak dengan `getPerbandinganSumber` di `src/lib/data.ts`:
  jangan ubah nama/kolom/parameter tanpa koordinasi dengan
  agen tampilan. Catatan: draf kontrak awal memakai `with`
  tanpa `recursive` — Postgres menolak CTE yang merujuk
  dirinya sendiri ("relation rantai does not exist"); v9
  memakai `with recursive` (satu-satunya perubahan dari
  draf; nama/parameter/kolom/logika tidak berubah).
- **§6 — perluasan CHECK aksi audit (F1, koordinator):**
  `pf_audit_logs_aksi_check_v9` berisi 47 aksi (46 dari v8
  + `'koreksi.ditinjau'`) agar penandaan status `ditinjau`
  tercatat dengan aksi eksplisit, bukan lagi sebagai
  `koreksi.terima` + status di kolom detail.

Ekspektasi sesudah v9: **37 tabel** `pf_*` ber-RLS (TIDAK
bertambah), total **79 policy** (TIDAK berubah), dan
`information_schema.table_privileges` untuk anon/authenticated
kini > 0 baris (sebelum v9: 0 — itulah F4).

Verifikasi cepat:

```sql
select count(*) from pg_tables
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 37

select count(*) from pg_policies
where schemaname = 'public' and tablename like 'pf_%';
-- ekspektasi: 79

select count(*) from information_schema.table_privileges
where table_schema = 'public' and table_name like 'pf_%'
  and grantee in ('anon','authenticated');
-- ekspektasi: > 0 (sebelum v9: 0)

-- Negatif T1-sisa tetap berlaku:
select has_column_privilege('anon', 'public.pf_quiz_questions', 'kunci', 'SELECT'),
       has_column_privilege('authenticated', 'public.pf_quiz_questions', 'kunci', 'SELECT');
-- ekspektasi: false, false

select proname from pg_proc where proname = 'pf_akar_salinan';
-- ekspektasi: 1 baris
```

Validasi lokal (PGlite, tanpa menyentuh produksi): skrip
`scripts/uji-fase8-gel1.mjs` di repo menjalankan v1–v7,
blanket grant sementara (Fase 1), v8 2x (Fase 2), REVOKE
blanket grant + bukti 42501 (Fase 3), lalu v9 2x (Fase 4)
dan membuktikan perbaikan (preferensi pemilik terbaca,
artikel terbit terbaca anon, T5/T8/T1 tetap berlaku, RPC
rantai 3 item benar) — hasil 16 Nov 2026: **156/156 LOLOS**,
termasuk semua asersi lama yang masih relevan.

## Migrasi v10 — Gelombang 2 (Fase 8, 16 Nov 2026)

Berkas: `20261116_pf_v10_wave2.sql`. Jalankan SETELAH v1–v9,
di SQL Editor yang sama (idempoten — aman diulang). ADITIF
(hanya `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT
EXISTS` + GRANT/policy baru) — tidak mengubah tabel atau
policy lama. GRANT eksplisit sudah di dalam berkas sejak awal
(pelajaran F4).

Isi: 16 tabel baru (`pf_stories`, `pf_story_events`,
`pf_story_articles`, `pf_story_followers`, `pf_courses`,
`pf_course_modules`, `pf_course_lessons`, `pf_course_progress`,
`pf_podcast_episodes`, `pf_podcast_history`,
`pf_podcast_playlist_items`, `pf_research_reports`,
`pf_documents`, `pf_countries`, `pf_country_facts`,
`pf_system_settings`) + 14 kolom perluasan (`knowledge`:
jenis/tingkat/estimasi_menit/seri; `indicators`: cakupan/
frekuensi/negara_kode; `questions`: publik/kategori/
membantu; `events`: era/penting/negara_kode; `articles`:
negara_kode) + RLS aktif di semua tabel baru.

Ekspektasi sesudah v10: **53 tabel** `pf_*` ber-RLS,
**106 policy**. Validasi lokal: `scripts/uji-fase8-gel2-migrasi.mjs`
28/28 (v1–v10 2× idempoten TANPA blanket grant).

## Migrasi v11 — Tahap 13A: rate limiter DB + audit T10 (16 Nov 2026)

Berkas: `20261116_pf_v11_rate_limit_audit.sql`. Jalankan
SETELAH v1–v10 (idempoten — aman diulang). ADITIF.

Isi:

- **§1 — tabel `pf_rate_limits`** (store bersama rate limiter
  lintas serverless instance, pengganti Map in-memory —
  temuan T3 TERBUKA): kolom `kunci` (PK), `hitungan`,
  `jendela_detik`, `jendela_mulai`. RLS aktif, **0 policy** —
  akses langsung ditolak; satu-satunya jalan masuk adalah
  RPC §2.
- **§2 — RPC `pf_rate_limit_check(p_kunci, p_batas,
  p_jendela_detik)`** RETURNS boolean, SECURITY DEFINER,
  `SET search_path = public`: satu pernyataan atomik
  `INSERT ... ON CONFLICT DO UPDATE` (jendela kadaluarsa
  reset ke 1), hapus oportunistik baris kadaluarsa, argumen
  tak valid → false. `REVOKE EXECUTE FROM public`,
  `GRANT EXECUTE TO anon, authenticated`.
- **§3 — perluasan CHECK audit ke 53 aksi** (47 dari v9 + 6
  baru: `sumber.buat/ubah/hapus/cek/aktif`, `negara.hapus`),
  pola do-block v9.
- **§4 — GRANT eksplisit** (pelajaran F4): REVOKE akses
  langsung tabel `pf_rate_limits` dari anon + authenticated.

Ekspektasi sesudah v11: **54 tabel** `pf_*` ber-RLS,
**106 policy** (tidak berubah), policy `pf_rate_limits` = 0.
Validasi lokal: `scripts/uji-tahap13a.mjs` 126/126 (RPC:
5 lolos/ke-6 ditolak, reset jendela, 2 panggilan paralel
batas 1 → tepat 1 lolos, SELECT/INSERT langsung ditolak
42501).

Catatan fail-open (sengaja, terdokumentasi di
`src/lib/ai/route-auth.ts`): bila RPC gagal (v11 belum
diterapkan / DB tak terjangkau), limiter MENGIZINKAN +
`console.error` — rate limit tidak boleh mematikan situs.
Kegagalan RPC ketahuan lewat log server + baterai 13A.

## Migrasi v12 — Tahap 13C: seed 5 job scheduler (16 Nov 2026)

Berkas: `20261116_pf_v12_seed_jobs.sql`. Jalankan SETELAH
v1–v11 (idempoten — aman diulang). ADITIF.

Isi:

- **§1 — perluasan CHECK nama `pf_scheduled_jobs`**: v5 hanya
  mengizinkan 3 nama (`ingestion`, `editorial`, `brief`).
  Tanpa perluasan ini, seed dua job baru ditolak 23514 dan
  job locking Tahap 13C fail-open (baris job tidak ada).
  CHECK baru `pf_scheduled_jobs_nama_check_v12` mengizinkan
  5 nama; CHECK lama dibuang lewat do-block yang mencari
  constraint berdasarkan definisinya.
- **§2 — seed 5 job** (`ON CONFLICT DO NOTHING`):
  ingestion `*/30 * * * *`, editorial `0 0,6,12,18 * * *`,
  brief `0 22 * * *`, data-analysis `0 1 * * 1`,
  terbitkan-terjadwal `0 * * * *`.

Ekspektasi sesudah v12: **54 tabel** `pf_*` ber-RLS,
**106 policy** (tidak berubah), **5 baris**
`pf_scheduled_jobs`. Validasi lokal:
`scripts/uji-tahap13-migrasi.mjs` 15/15 (v1–v12 2× idempoten
TANPA blanket grant; nama bogus ditolak CHECK; RPC v11
tetap berfungsi).
