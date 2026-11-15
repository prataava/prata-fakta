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
