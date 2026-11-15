-- ============================================================
-- PRATA FAKTA — Migrasi Fase 3 (Ingestion: run & item mentah)
-- Berkas: 20261116_pf_v3_ingestion.sql
-- Proyek Supabase: 'prata' (dipakai bersama PRATA & TASIK JAYA)
-- Cara menjalankan: Supabase Dashboard → SQL Editor → tempel
-- seluruh berkas → Run. (DDL tidak bisa dijalankan dari VM:
-- anon key tidak bisa DDL, service_role key & DATABASE_URL tidak
-- tersedia di workspace — lihat ARSITEKTUR.md.)
-- Berkas ini IDEMPOTEN: aman dijalankan ulang (IF NOT EXISTS +
-- DROP POLICY IF EXISTS + ADD COLUMN IF NOT EXISTS).
-- KETERGANTUNGAN: WAJIB jalankan migrasi v1 DULU
-- (20261116_pf_v1_foundation.sql) LALU v2
-- (20261116_pf_v2_articles.sql). Migrasi ini memakai:
--   - tabel public.pf_sources (FK sumber_id)
--   - tabel public.pf_articles (kolom baru raw_item_id)
--   - fungsi public.pf_has_role(text) (kebijakan RLS)
-- URUTAN PENTING: pf_ingestion_runs dulu, lalu pf_raw_items,
-- lalu ALTER pf_sources, terakhir ALTER pf_articles yang
-- mereferensikan pf_raw_items (FK raw_item_id). Membalik urutan
-- akan gagal (tabel yang dirujuk belum ada).
-- DATA MENTAH: pf_raw_items HANYA menyimpan metadata + ringkasan
-- dari sumber + URL — JANGAN salin isi penuh artikel media lain
-- (hak cipta). Artikel terbit (pf_articles) ditulis ulang oleh
-- staf/redaksi, bukan salinan isi sumber.
-- ============================================================

-- ============================================================
-- 1. TABEL
-- ============================================================

-- ---------- 1a. pf_ingestion_runs ----------
-- Satu baris per proses pengambilan (run) dari satu sumber.
-- sumber_nama menyimpan nama sumber saat run, untuk sumber
-- ad-hoc (mis. GDELT) yang belum terdaftar di pf_sources.
create table if not exists public.pf_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  sumber_id uuid references public.pf_sources (id) on delete set null,
  sumber_nama text,
  dimulai_pada timestamptz not null default now(),
  selesai_pada timestamptz,
  status text not null default 'berjalan'
    check (status in ('berjalan', 'selesai', 'gagal', 'sebagian')),
  ditemukan integer not null default 0,
  baru integer not null default 0,
  duplikat integer not null default 0,
  ditolak integer not null default 0,
  gagal integer not null default 0,
  error text,
  dipicu_oleh text not null default 'manual'
    check (dipicu_oleh in ('manual', 'jadwal', 'github_actions', 'cron_muse'))
);

-- ---------- 1b. pf_raw_items ----------
-- Item mentah hasil ingestion: metadata + ringkasan sumber + URL.
-- hash_url (sha256 dari URL ternormalisasi) adalah kunci dedup;
-- hash_judul (sha256 dari judul ternormalisasi) dipakai untuk
-- mendeteksi judul identik dari penerbit berbeda (relasi
-- "disalin dari" lewat disalin_dari_id).
create table if not exists public.pf_raw_items (
  id uuid primary key default gen_random_uuid(),
  sumber_id uuid references public.pf_sources (id) on delete set null,
  run_id uuid references public.pf_ingestion_runs (id) on delete set null,
  url text not null,
  hash_url text not null unique,
  judul text not null,
  hash_judul text not null,
  ringkasan text not null default '',
  isi_ringkas text not null default '',
  penulis text,
  waktu_terbit_asli timestamptz,
  waktu_diambil timestamptz not null default now(),
  status text not null default 'baru'
    check (status in ('baru', 'duplikat', 'ditolak', 'disalin_dari')),
  status_verifikasi text not null default 'UNCONFIRMED'
    check (status_verifikasi in ('VERIFIED', 'CROSS-CHECKED', 'DEVELOPING', 'UNCONFIRMED', 'DISPUTED', 'CORRECTED')),
  disalin_dari_id uuid references public.pf_raw_items (id) on delete set null,
  diterbitkan_ulang boolean not null default false,
  alasan text,
  metadata jsonb not null default '{}'
);

-- ============================================================
-- 2. INDEKS
-- ============================================================

create index if not exists pf_ingestion_runs_sumber_idx on public.pf_ingestion_runs (sumber_id);
create index if not exists pf_ingestion_runs_dimulai_idx on public.pf_ingestion_runs (dimulai_pada desc);

create index if not exists pf_raw_items_hash_judul_idx on public.pf_raw_items (hash_judul);
create index if not exists pf_raw_items_sumber_idx on public.pf_raw_items (sumber_id);
create index if not exists pf_raw_items_waktu_terbit_idx on public.pf_raw_items (waktu_terbit_asli desc);
create index if not exists pf_raw_items_status_idx on public.pf_raw_items (status);
create index if not exists pf_raw_items_disalin_dari_idx on public.pf_raw_items (disalin_dari_id);

-- ============================================================
-- 3. KOLOM BARU DI TABEL LAMA
-- ============================================================

-- ---------- 3a. pf_sources: jejak pengambilan terakhir ----------
alter table public.pf_sources
  add column if not exists terakhir_diambil timestamptz;
alter table public.pf_sources
  add column if not exists jumlah_item integer not null default 0;

-- ---------- 3b. pf_articles: tautan ke item mentah asal ----------
-- Diletakkan SETELAH pf_raw_items dibuat (FK raw_item_id).
alter table public.pf_articles
  add column if not exists raw_item_id uuid references public.pf_raw_items (id) on delete set null;

-- ============================================================
-- 4. RLS + POLICIES
-- ============================================================
-- Data mentah bersifat INTERNAL: hanya service role yang menulis
-- (service_role di Supabase melewati RLS), dan baca hanya peran
-- staf. TIDAK ADA policy baca publik untuk kedua tabel ini —
-- yang publik hanya artikel terbit (pf_articles).
-- Kolom baru pf_sources ikut tercakup policy lama v1
-- ("pf_sources tulis editor", for all: super_admin / editor)
-- sehingga TIDAK dibuat policy baru untuk pf_sources di sini.

-- ---------- pf_ingestion_runs ----------
alter table public.pf_ingestion_runs enable row level security;

drop policy if exists "pf_ingestion_runs baca staf" on public.pf_ingestion_runs;
create policy "pf_ingestion_runs baca staf"
  on public.pf_ingestion_runs for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
  );

-- ---------- pf_raw_items ----------
alter table public.pf_raw_items enable row level security;

drop policy if exists "pf_raw_items baca staf" on public.pf_raw_items;
create policy "pf_raw_items baca staf"
  on public.pf_raw_items for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

-- ============================================================
-- Verifikasi sesudah menjalankan (jalankan terpisah di SQL Editor):
--   select 'pf_ingestion_runs', count(*) from public.pf_ingestion_runs
--   union all select 'pf_raw_items', count(*) from public.pf_raw_items;
-- Ekspektasi: semua 0 (tanpa seed data operasional).
-- Cek kolom baru:
--   select column_name from information_schema.columns
--   where table_schema = 'public'
--   and table_name = 'pf_sources'
--   and column_name in ('terakhir_diambil', 'jumlah_item');
--   select column_name from information_schema.columns
--   where table_schema = 'public'
--   and table_name = 'pf_articles'
--   and column_name = 'raw_item_id';
-- Ekspektasi: 2 baris pf_sources + 1 baris pf_articles.
-- Cek RLS + policy:
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename like 'pf_%'
--   order by tablename;
--   select count(*) from pg_policies
--   where schemaname = 'public' and tablename like 'pf_%';
-- Ekspektasi: 18 tabel pf_* ber-RLS (8 dari v1 + 8 dari v2 + 2 dari v3),
--   total policy 53 (51 dari v1+v2 + 2 dari v3).
-- ============================================================
