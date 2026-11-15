-- ============================================================
-- PRATA FAKTA — Migrasi Fase 5 (Editorial: audit log,
-- review editorial, scheduler, kolom penerbit & nonaktif)
-- Berkas: 20261116_pf_v5_editorial.sql
-- Proyek Supabase: 'prata' (dipakai bersama PRATA & TASIK JAYA)
-- Cara menjalankan: Supabase Dashboard → SQL Editor → tempel
-- seluruh berkas → Run. (DDL tidak bisa dijalankan dari VM:
-- anon key tidak bisa DDL, service_role key & DATABASE_URL tidak
-- tersedia di workspace — lihat ARSITEKTUR.md.)
-- Berkas ini IDEMPOTEN: aman dijalankan ulang (IF NOT EXISTS +
-- DROP POLICY IF EXISTS + DROP TRIGGER IF EXISTS +
-- ON CONFLICT DO NOTHING).
-- KETERGANTUNGAN: WAJIB jalankan migrasi v1 DULU
-- (20261116_pf_v1_foundation.sql) LALU v2
-- (20261116_pf_v2_articles.sql) LALU v3
-- (20261116_pf_v3_ingestion.sql) LALU v4
-- (20261116_pf_v4_ai.sql). Migrasi ini memakai:
--   - tabel public.pf_articles (FK artikel_id, kolom
--     diterbitkan_oleh)
--   - tabel public.pf_profiles (kolom nonaktif)
--   - tabel public.pf_categories (artikel uji memakai kategori)
--   - tabel auth.users (FK aktor_id / reviewer_id /
--     diterbitkan_oleh)
--   - fungsi public.pf_has_role(text) (kebijakan RLS)
--   - fungsi public.pf_set_updated_at() (trigger
--     pf_scheduled_jobs)
-- SEED: hanya konfigurasi jadwal nyata dari workflow yang sudah
-- ada (ingestion 30 menit, pipeline editorial 6 jam, Daily Brief
-- 05.00 WIB) — BUKAN data dummy operasional (tanpa log audit
-- palsu, review palsu, atau artikel palsu).
-- URUTAN PENTING: pf_audit_logs (mandiri) →
-- pf_editorial_reviews (merujuk pf_articles) →
-- pf_scheduled_jobs (mandiri) → ALTER pf_articles →
-- ALTER pf_profiles → seed jadwal. Membalik urutan akan gagal
-- (tabel yang dirujuk belum ada).
-- ============================================================

-- ============================================================
-- 1. TABEL
-- ============================================================

-- ---------- 1a. pf_audit_logs ----------
-- Jejak audit semua aksi penting: artikel (buat/ubah/hapus/
-- terbit/batal_terbit/jadwalkan), review (setuju/tolak/
-- kembalikan), verifikasi, koreksi, pengguna (role/nonaktif),
-- sistem (job/kategori), dan penerbitan brief. Kolom sebelum /
-- sesudah menyimpan potongan keadaan sebelum dan sesudah aksi
-- (jsonb, bukan salinan penuh). Tabel ini bersifat INTERNAL
-- (super_admin / editor saja), ditulis service role lewat API
-- (bypass RLS) — tidak ada policy tulis untuk peran staf.
create table if not exists public.pf_audit_logs (
  id uuid primary key default gen_random_uuid(),
  aktor_id uuid references auth.users (id) on delete set null,
  aktor_email text,
  aksi text not null
    check (aksi in ('artikel.buat', 'artikel.ubah', 'artikel.hapus', 'artikel.terbit', 'artikel.batal_terbit', 'artikel.jadwalkan', 'review.setuju', 'review.tolak', 'review.kembalikan', 'verifikasi.ubah', 'koreksi.terima', 'koreksi.tolak', 'pengguna.role', 'pengguna.nonaktif', 'pengguna.aktifkan', 'sistem.job', 'sistem.kategori', 'brief.terbit')),
  entitas text not null,
  entitas_id text,
  sebelum jsonb not null default '{}',
  sesudah jsonb not null default '{}',
  ip text,
  dibuat_pada timestamptz not null default now()
);

-- ---------- 1b. pf_editorial_reviews ----------
-- Keputusan review editorial atas satu artikel: setuju, tolak,
-- atau kembalikan untuk revisi. Catatan wajib diisi (not null)
-- agar setiap keputusan punya alasan tertulis. Review ikut
-- terhapus bila artikelnya dihapus (cascade); bila reviewer
-- dihapus, review tetap hidup (set null).
-- Tabel ini bersifat INTERNAL (staf saja), ditulis service role
-- lewat API (bypass RLS) — tidak ada policy tulis untuk
-- peran staf.
create table if not exists public.pf_editorial_reviews (
  id uuid primary key default gen_random_uuid(),
  artikel_id uuid not null references public.pf_articles (id) on delete cascade,
  reviewer_id uuid references auth.users (id) on delete set null,
  keputusan text not null
    check (keputusan in ('setuju', 'tolak', 'kembalikan')),
  catatan text not null,
  dibuat_pada timestamptz not null default now()
);

-- ---------- 1c. pf_scheduled_jobs ----------
-- Konfigurasi jadwal job terjadwal: ingestion, pipeline
-- editorial AI, dan Daily Brief. nama unik — satu baris per
-- job. Jadwal ditulis dalam format cron. Status terakhir
-- mencatat hasil jalan terakhir ('belum_pernah' bila belum
-- pernah jalan). Tabel ini bersifat INTERNAL (staf saja),
-- ditulis service role lewat API (bypass RLS) — tidak ada
-- policy tulis untuk peran staf.
create table if not exists public.pf_scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique
    check (nama in ('ingestion', 'editorial', 'brief')),
  jadwal_cron text not null,
  deskripsi text,
  aktif boolean not null default true,
  terakhir_jalan timestamptz,
  status_terakhir text not null default 'belum_pernah'
    check (status_terakhir in ('berhasil', 'gagal', 'berjalan', 'belum_pernah')),
  error_terakhir text,
  diperbarui_pada timestamptz not null default now()
);

-- ============================================================
-- 2. ALTER TABEL LAMA
-- ============================================================

-- Siapa yang menerbitkan artikel (null bila belum terbit atau
-- diterbitkan sebelum kolom ini ada). Bila akun dihapus,
-- artikel tetap hidup (set null).
alter table public.pf_articles
  add column if not exists diterbitkan_oleh uuid references auth.users (id) on delete set null;

-- Penanda pengguna dinonaktifkan (oleh super_admin). Pengguna
-- nonaktif tetap ada di pf_profiles, hanya tidak bisa masuk /
-- beraksi; false berarti aktif.
alter table public.pf_profiles
  add column if not exists nonaktif boolean not null default false;

-- ============================================================
-- 3. INDEKS
-- ============================================================

create index if not exists pf_audit_logs_dibuat_idx on public.pf_audit_logs (dibuat_pada desc);
create index if not exists pf_audit_logs_aktor_idx on public.pf_audit_logs (aktor_id);
create index if not exists pf_audit_logs_entitas_idx on public.pf_audit_logs (entitas, entitas_id);

create index if not exists pf_editorial_reviews_artikel_idx on public.pf_editorial_reviews (artikel_id, dibuat_pada desc);

create index if not exists pf_scheduled_jobs_nama_idx on public.pf_scheduled_jobs (nama);

-- ============================================================
-- 4. RLS + POLICIES + TRIGGERS
-- ============================================================
-- Ketiga tabel baru bersifat INTERNAL: hanya service role yang
-- menulis (service_role di Supabase melewati RLS). TIDAK dibuat
-- policy insert/update/delete untuk peran staf — tulis HANYA
-- lewat service role (API backend).
--   - pf_audit_logs: baca super_admin / editor saja.
--   - pf_editorial_reviews: baca staf (super_admin / editor /
--     fact_checker / writer).
--   - pf_scheduled_jobs: baca staf (super_admin / editor /
--     fact_checker / writer).

-- ---------- pf_audit_logs ----------
alter table public.pf_audit_logs enable row level security;

drop policy if exists "pf_audit_logs baca super_admin/editor" on public.pf_audit_logs;
create policy "pf_audit_logs baca super_admin/editor"
  on public.pf_audit_logs for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
  );

-- ---------- pf_editorial_reviews ----------
alter table public.pf_editorial_reviews enable row level security;

drop policy if exists "pf_editorial_reviews baca staf" on public.pf_editorial_reviews;
create policy "pf_editorial_reviews baca staf"
  on public.pf_editorial_reviews for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

-- ---------- pf_scheduled_jobs ----------
alter table public.pf_scheduled_jobs enable row level security;

drop policy if exists "pf_scheduled_jobs baca staf" on public.pf_scheduled_jobs;
create policy "pf_scheduled_jobs baca staf"
  on public.pf_scheduled_jobs for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

-- ---------- Trigger pf_scheduled_jobs ----------
drop trigger if exists pf_scheduled_jobs_set_updated_at on public.pf_scheduled_jobs;
create trigger pf_scheduled_jobs_set_updated_at
  before update on public.pf_scheduled_jobs
  for each row execute function public.pf_set_updated_at();

-- ============================================================
-- 5. SEED
-- ============================================================

-- Seed konfigurasi jadwal job (3) — BUKAN data dummy: jadwal
-- nyata dari workflow yang sudah ada (lihat workflow ingestion
-- 30 menit di Fase 3, pipeline editorial 6 jam di Fase 4, dan
-- Daily Brief 05.00 WIB di Fase 4).
insert into public.pf_scheduled_jobs (nama, jadwal_cron, deskripsi) values
  ('ingestion', '*/30 * * * *', 'Ingestion RSS + GDELT setiap 30 menit'),
  ('editorial', '0 0,6,12,18 * * *', 'Pipeline editorial AI setiap 6 jam'),
  ('brief', '0 22 * * *', 'Daily Brief harian 05.00 WIB')
on conflict (nama) do nothing;

-- ============================================================
-- Verifikasi sesudah menjalankan (jalankan terpisah di SQL Editor):
--   select 'pf_audit_logs' as tabel, count(*) from public.pf_audit_logs
--   union all select 'pf_editorial_reviews', count(*) from public.pf_editorial_reviews
--   union all select 'pf_scheduled_jobs', count(*) from public.pf_scheduled_jobs;
-- Ekspektasi: pf_audit_logs 0, pf_editorial_reviews 0,
--   pf_scheduled_jobs 3 (seed konfigurasi jadwal).
-- Cek kolom baru:
--   select column_name from information_schema.columns
--   where table_schema = 'public'
--   and table_name = 'pf_articles'
--   and column_name = 'diterbitkan_oleh';
--   select column_name from information_schema.columns
--   where table_schema = 'public'
--   and table_name = 'pf_profiles'
--   and column_name = 'nonaktif';
-- Ekspektasi: 1 baris pf_articles + 1 baris pf_profiles.
-- Cek RLS + policy:
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename like 'pf_%'
--   order by tablename;
--   select count(*) from pg_policies
--   where schemaname = 'public' and tablename like 'pf_%';
-- Ekspektasi: 26 tabel pf_* ber-RLS (8 dari v1 + 8 dari v2 +
--   2 dari v3 + 5 dari v4 + 3 dari v5), total policy 62
--   (59 dari v1–v4 + 3 dari v5: pf_audit_logs 1,
--   pf_editorial_reviews 1, pf_scheduled_jobs 1 — ketiganya
--   select staf saja).
-- ============================================================
