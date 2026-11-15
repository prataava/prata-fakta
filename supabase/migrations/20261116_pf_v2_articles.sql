-- ============================================================
-- PRATA FAKTA — Migrasi Fase 2 (Artikel & Interaksi Pembaca)
-- Berkas: 20261116_pf_v2_articles.sql
-- Proyek Supabase: 'prata' (dipakai bersama PRATA & TASIK JAYA)
-- Cara menjalankan: Supabase Dashboard → SQL Editor → tempel
-- seluruh berkas → Run. (DDL tidak bisa dijalankan dari VM:
-- anon key tidak bisa DDL, service_role key & DATABASE_URL tidak
-- tersedia di workspace — lihat ARSITEKTUR.md.)
-- Berkas ini IDEMPOTEN: aman dijalankan ulang (IF NOT EXISTS +
-- DROP POLICY IF EXISTS + DROP TRIGGER IF EXISTS).
-- KETERGANTUNGAN: WAJIB jalankan migrasi v1 DULU
-- (20261116_pf_v1_foundation.sql). Migrasi ini memakai:
--   - tabel public.pf_categories (FK kategori_slug)
--   - tabel public.pf_sources (FK sumber_id)
--   - fungsi public.pf_has_role(text) (kebijakan RLS)
--   - fungsi public.pf_set_updated_at() (trigger pf_articles)
--   - skema auth.users (FK penulis_id / user_id / pelapor_id)
-- URUTAN PENTING: tabel dulu, lalu indeks, lalu RLS/policies,
-- terakhir trigger. Tidak ada seed data operasional di sini
-- (tanpa artikel palsu — artikel nyata masuk lewat aplikasi/API).
-- ============================================================

-- ============================================================
-- 1. TABEL
-- ============================================================

-- ---------- 1a. pf_articles ----------
-- Artikel berita + pemeriksaan fakta. Kolom jsonb:
--   kronologi: array {tanggal, peristiwa, sumber}
--   fakta_penting: array string
--   data_pendukung: array {label, nilai, satuan, sumber, tanggal}
-- Paragraf isi dipisah baris kosong.
create table if not exists public.pf_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  judul text not null,
  subjudul text,
  ringkasan text not null default '',
  isi text not null default '',
  kategori_slug text not null references public.pf_categories (slug) on delete restrict,
  subkategori_slug text,
  status_verifikasi text not null default 'UNCONFIRMED'
    check (status_verifikasi in ('VERIFIED', 'CROSS-CHECKED', 'DEVELOPING', 'UNCONFIRMED', 'DISPUTED', 'CORRECTED')),
  status text not null default 'draft'
    check (status in ('draft', 'terbit', 'terjadwal', 'diarsipkan')),
  penulis_nama text,
  penulis_id uuid references auth.users (id) on delete set null,
  sumber_url text,
  gambar_url text,
  estimasi_baca_menit integer,
  kronologi jsonb not null default '[]',
  fakta_penting jsonb not null default '[]',
  data_pendukung jsonb not null default '[]',
  mengapa_penting text,
  dampak text,
  belum_diketahui text,
  dijadwalkan_pada timestamptz,
  diterbitkan_pada timestamptz,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

-- ---------- 1b. pf_article_versions ----------
-- Riwayat revisi artikel (satu baris per versi, unik per artikel).
create table if not exists public.pf_article_versions (
  id uuid primary key default gen_random_uuid(),
  artikel_id uuid not null references public.pf_articles (id) on delete cascade,
  versi integer not null,
  judul text,
  isi text,
  dibuat_oleh uuid references auth.users (id) on delete set null,
  dibuat_pada timestamptz not null default now(),
  catatan text,
  unique (artikel_id, versi)
);

-- ---------- 1c. pf_article_sources ----------
-- Tautan artikel ke sumber terdaftar (pf_sources dari v1).
create table if not exists public.pf_article_sources (
  id uuid primary key default gen_random_uuid(),
  artikel_id uuid not null references public.pf_articles (id) on delete cascade,
  sumber_id uuid not null references public.pf_sources (id) on delete cascade,
  url text,
  catatan text,
  unique (artikel_id, sumber_id)
);

-- ---------- 1d. pf_tags ----------
create table if not exists public.pf_tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nama text not null
);

-- ---------- 1e. pf_article_tags ----------
create table if not exists public.pf_article_tags (
  artikel_id uuid not null references public.pf_articles (id) on delete cascade,
  tag_id uuid not null references public.pf_tags (id) on delete cascade,
  primary key (artikel_id, tag_id)
);

-- ---------- 1f. pf_bookmarks ----------
-- Artikel yang disimpan pengguna (satu baris per pengguna+artikel).
create table if not exists public.pf_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  artikel_id uuid not null references public.pf_articles (id) on delete cascade,
  dibuat_pada timestamptz not null default now(),
  unique (user_id, artikel_id)
);

-- ---------- 1g. pf_reading_history ----------
-- Riwayat baca pengguna (untuk "lanjutkan membaca" & rekomendasi).
create table if not exists public.pf_reading_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  artikel_id uuid not null references public.pf_articles (id) on delete cascade,
  dibaca_pada timestamptz not null default now(),
  durasi_detik integer,
  selesai boolean not null default false
);

-- ---------- 1h. pf_correction_reports ----------
-- Laporan koreksi dari pembaca (boleh anonim: pelapor_id null).
create table if not exists public.pf_correction_reports (
  id uuid primary key default gen_random_uuid(),
  artikel_id uuid not null references public.pf_articles (id) on delete cascade,
  pelapor_id uuid references auth.users (id) on delete set null,
  nama text,
  email text,
  jenis text not null check (jenis in ('fakta_salah', 'sumber', 'typo', 'lainnya')),
  pesan text not null,
  status text not null default 'baru'
    check (status in ('baru', 'ditinjau', 'diperbaiki', 'ditolak')),
  dibuat_pada timestamptz not null default now()
);

-- ============================================================
-- 2. INDEKS
-- ============================================================

create index if not exists pf_articles_slug_idx on public.pf_articles (slug);
create index if not exists pf_articles_kategori_idx on public.pf_articles (kategori_slug);
create index if not exists pf_articles_status_idx on public.pf_articles (status);
create index if not exists pf_articles_status_verifikasi_idx on public.pf_articles (status_verifikasi);
create index if not exists pf_articles_diterbitkan_idx on public.pf_articles (diterbitkan_pada desc);

create index if not exists pf_article_versions_artikel_idx on public.pf_article_versions (artikel_id);
create index if not exists pf_article_sources_artikel_idx on public.pf_article_sources (artikel_id);
create index if not exists pf_article_sources_sumber_idx on public.pf_article_sources (sumber_id);
create index if not exists pf_article_tags_tag_idx on public.pf_article_tags (tag_id);
create index if not exists pf_bookmarks_artikel_idx on public.pf_bookmarks (artikel_id);
create index if not exists pf_reading_history_user_idx on public.pf_reading_history (user_id, dibaca_pada desc);
create index if not exists pf_reading_history_artikel_idx on public.pf_reading_history (artikel_id);
create index if not exists pf_correction_reports_artikel_idx on public.pf_correction_reports (artikel_id);

-- ============================================================
-- 3. RLS + POLICIES + TRIGGERS
-- ============================================================

-- ---------- pf_articles ----------
alter table public.pf_articles enable row level security;

drop policy if exists "pf_articles baca publik" on public.pf_articles;
create policy "pf_articles baca publik"
  on public.pf_articles for select using (status = 'terbit');

drop policy if exists "pf_articles baca peran" on public.pf_articles;
create policy "pf_articles baca peran"
  on public.pf_articles for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

drop policy if exists "pf_articles buat" on public.pf_articles;
create policy "pf_articles buat"
  on public.pf_articles for insert with check (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('writer')
  );

drop policy if exists "pf_articles ubah" on public.pf_articles;
create policy "pf_articles ubah"
  on public.pf_articles for update using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or (public.pf_has_role('writer') and penulis_id = auth.uid())
  ) with check (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or (public.pf_has_role('writer') and penulis_id = auth.uid())
  );

drop policy if exists "pf_articles hapus" on public.pf_articles;
create policy "pf_articles hapus"
  on public.pf_articles for delete using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
  );

drop trigger if exists pf_articles_set_updated_at on public.pf_articles;
create trigger pf_articles_set_updated_at
  before update on public.pf_articles
  for each row execute function public.pf_set_updated_at();

-- ---------- pf_article_versions ----------
alter table public.pf_article_versions enable row level security;

drop policy if exists "pf_article_versions baca" on public.pf_article_versions;
create policy "pf_article_versions baca"
  on public.pf_article_versions for select using (
    exists (
      select 1 from public.pf_articles a
      where a.id = artikel_id and a.status = 'terbit'
    )
    or public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('writer')
    or public.pf_has_role('fact_checker')
  );

drop policy if exists "pf_article_versions buat" on public.pf_article_versions;
create policy "pf_article_versions buat"
  on public.pf_article_versions for insert with check (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('writer')
  );

drop policy if exists "pf_article_versions ubah" on public.pf_article_versions;
create policy "pf_article_versions ubah"
  on public.pf_article_versions for update using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('writer')
  ) with check (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('writer')
  );

drop policy if exists "pf_article_versions hapus" on public.pf_article_versions;
create policy "pf_article_versions hapus"
  on public.pf_article_versions for delete using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
  );

-- ---------- pf_article_sources ----------
alter table public.pf_article_sources enable row level security;

drop policy if exists "pf_article_sources baca publik" on public.pf_article_sources;
create policy "pf_article_sources baca publik"
  on public.pf_article_sources for select using (true);

drop policy if exists "pf_article_sources buat" on public.pf_article_sources;
create policy "pf_article_sources buat"
  on public.pf_article_sources for insert with check (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('writer')
  );

drop policy if exists "pf_article_sources ubah" on public.pf_article_sources;
create policy "pf_article_sources ubah"
  on public.pf_article_sources for update using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('writer')
  ) with check (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('writer')
  );

drop policy if exists "pf_article_sources hapus" on public.pf_article_sources;
create policy "pf_article_sources hapus"
  on public.pf_article_sources for delete using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('writer')
  );

-- ---------- pf_tags ----------
alter table public.pf_tags enable row level security;

drop policy if exists "pf_tags baca publik" on public.pf_tags;
create policy "pf_tags baca publik"
  on public.pf_tags for select using (true);

drop policy if exists "pf_tags buat" on public.pf_tags;
create policy "pf_tags buat"
  on public.pf_tags for insert with check (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
  );

drop policy if exists "pf_tags ubah" on public.pf_tags;
create policy "pf_tags ubah"
  on public.pf_tags for update using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
  ) with check (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
  );

drop policy if exists "pf_tags hapus" on public.pf_tags;
create policy "pf_tags hapus"
  on public.pf_tags for delete using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
  );

-- ---------- pf_article_tags ----------
alter table public.pf_article_tags enable row level security;

drop policy if exists "pf_article_tags baca publik" on public.pf_article_tags;
create policy "pf_article_tags baca publik"
  on public.pf_article_tags for select using (true);

drop policy if exists "pf_article_tags buat" on public.pf_article_tags;
create policy "pf_article_tags buat"
  on public.pf_article_tags for insert with check (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('writer')
  );

drop policy if exists "pf_article_tags ubah" on public.pf_article_tags;
create policy "pf_article_tags ubah"
  on public.pf_article_tags for update using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('writer')
  ) with check (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('writer')
  );

drop policy if exists "pf_article_tags hapus" on public.pf_article_tags;
create policy "pf_article_tags hapus"
  on public.pf_article_tags for delete using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('writer')
  );

-- ---------- pf_bookmarks ----------
alter table public.pf_bookmarks enable row level security;

drop policy if exists "pf_bookmarks baca sendiri" on public.pf_bookmarks;
create policy "pf_bookmarks baca sendiri"
  on public.pf_bookmarks for select using (auth.uid() = user_id);

drop policy if exists "pf_bookmarks buat sendiri" on public.pf_bookmarks;
create policy "pf_bookmarks buat sendiri"
  on public.pf_bookmarks for insert with check (auth.uid() = user_id);

drop policy if exists "pf_bookmarks ubah sendiri" on public.pf_bookmarks;
create policy "pf_bookmarks ubah sendiri"
  on public.pf_bookmarks for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "pf_bookmarks hapus sendiri" on public.pf_bookmarks;
create policy "pf_bookmarks hapus sendiri"
  on public.pf_bookmarks for delete using (auth.uid() = user_id);

-- ---------- pf_reading_history ----------
alter table public.pf_reading_history enable row level security;

drop policy if exists "pf_reading_history baca sendiri" on public.pf_reading_history;
create policy "pf_reading_history baca sendiri"
  on public.pf_reading_history for select using (auth.uid() = user_id);

drop policy if exists "pf_reading_history buat sendiri" on public.pf_reading_history;
create policy "pf_reading_history buat sendiri"
  on public.pf_reading_history for insert with check (auth.uid() = user_id);

drop policy if exists "pf_reading_history ubah sendiri" on public.pf_reading_history;
create policy "pf_reading_history ubah sendiri"
  on public.pf_reading_history for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "pf_reading_history hapus sendiri" on public.pf_reading_history;
create policy "pf_reading_history hapus sendiri"
  on public.pf_reading_history for delete using (auth.uid() = user_id);

-- ---------- pf_correction_reports ----------
alter table public.pf_correction_reports enable row level security;

drop policy if exists "pf_correction_reports kirim publik" on public.pf_correction_reports;
create policy "pf_correction_reports kirim publik"
  on public.pf_correction_reports for insert with check (true);

drop policy if exists "pf_correction_reports baca" on public.pf_correction_reports;
create policy "pf_correction_reports baca"
  on public.pf_correction_reports for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or pelapor_id = auth.uid()
  );

drop policy if exists "pf_correction_reports ubah" on public.pf_correction_reports;
create policy "pf_correction_reports ubah"
  on public.pf_correction_reports for update using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
  ) with check (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
  );

drop policy if exists "pf_correction_reports hapus" on public.pf_correction_reports;
create policy "pf_correction_reports hapus"
  on public.pf_correction_reports for delete using (
    public.pf_has_role('super_admin')
  );

-- ============================================================
-- Verifikasi sesudah menjalankan (jalankan terpisah di SQL Editor):
--   select 'pf_articles', count(*) from public.pf_articles
--   union all select 'pf_article_versions', count(*) from public.pf_article_versions
--   union all select 'pf_article_sources', count(*) from public.pf_article_sources
--   union all select 'pf_tags', count(*) from public.pf_tags
--   union all select 'pf_article_tags', count(*) from public.pf_article_tags
--   union all select 'pf_bookmarks', count(*) from public.pf_bookmarks
--   union all select 'pf_reading_history', count(*) from public.pf_reading_history
--   union all select 'pf_correction_reports', count(*) from public.pf_correction_reports;
-- Ekspektasi: semua 0 (tanpa seed data operasional).
-- Cek RLS + policy:
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename like 'pf_%'
--   order by tablename;
--   select count(*) from pg_policies
--   where schemaname = 'public' and tablename like 'pf_%';
-- Ekspektasi: 16 tabel pf_* ber-RLS (8 dari v1 + 8 dari v2),
--   total policy 51 (18 dari v1 + 33 dari v2).
-- ============================================================
