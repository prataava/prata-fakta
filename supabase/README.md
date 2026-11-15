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
