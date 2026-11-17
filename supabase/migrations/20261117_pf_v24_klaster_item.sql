-- ============================================================
-- PRATA FAKTA — Migrasi v24: klaster event item mentah (Fase 7c)
-- + kolom kelas_gagal & pelonggaran CHECK status run (Fase 3)
-- Berkas: 20261117_pf_v24_klaster_item.sql
-- Proyek Supabase: 'prata' (dipakai bersama PRATA & TASIK JAYA)
-- Cara menjalankan: Supabase Dashboard → SQL Editor → tempel
-- seluruh berkas → Run. (DDL tidak bisa dijalankan dari VM.)
-- Berkas ini IDEMPOTEN: aman dijalankan ulang (IF NOT EXISTS +
-- DROP CONSTRAINT/POLICY IF EXISTS).
-- KETERGANTUNGAN: migrasi v1–v3 (pf_sources, pf_ingestion_runs,
-- pf_raw_items, pf_has_role). TIDAK bergantung pada migrasi v22
-- (Worker A) — semua statement di sini aman bila v22 belum ada.
-- BUTUH PERSETUJUAN PEMILIK: perubahan produksi (seperti v22).
-- ============================================================
--
-- KENAPA TABEL BARU, BUKAN pf_story_events/pf_story_articles:
-- pf_story_events menghubungkan pf_stories <-> pf_events, dan
-- pf_story_articles menghubungkan pf_stories <-> pf_articles —
-- keduanya butuh entitas editorial (cerita/peristiwa/artikel)
-- yang BELUM ADA saat item mentah masuk ingestion. Klaster di
-- sini menghubungkan item MENTAH satu sama lain (1 event dengan
-- N laporan UTUH — laporan tidak pernah dihapus/digabung, klaster
-- hanya menunjuk mereka). Bila nanti sebuah klaster diangkat jadi
-- cerita editorial, pf_stories dapat merujuk klaster itu.
--
-- KENAPA CHECK STATUS DILONGGARKAN DI SINI:
-- CHECK v3 hanya mengizinkan ('berjalan','selesai','gagal',
-- 'sebagian'). Kelas baru Fase 3 ('rate-limited','dilewati',
-- 'unavailable','invalid-feed','permanently-failed','disabled')
-- tidak bisa ditulis ke kolom status tanpa ini. Tanpa migrasi
-- ini, adapter Supabase memetakan status ke nilai lama secara
-- otomatis (fail-soft) dan kelas asli tetap tersimpan di
-- kelas_gagal + respons JSON — jadi migrasi ini BUKAN prasyarat
-- jalan, hanya prasyarat agar status run tampil apa adanya.
--
-- ROLLBACK (bila perlu, jalankan terpisah):
--   drop table if exists public.pf_item_cluster_members;
--   drop table if exists public.pf_item_clusters;
--   alter table public.pf_ingestion_runs
--     drop constraint if exists pf_ingestion_runs_status_check;
--   alter table public.pf_ingestion_runs add constraint
--     pf_ingestion_runs_status_check
--     check (status in ('berjalan', 'selesai', 'gagal', 'sebagian'));
--   alter table public.pf_ingestion_runs drop column if exists kelas_gagal;
-- (Rollback TIDAK menghapus data pf_ingestion_runs/pf_raw_items.)

-- ============================================================
-- 1. pf_ingestion_runs: kolom kelas_gagal + CHECK status baru
-- ============================================================

-- kelas_gagal: kelas galat per sumber (Fase 3, butir 5). Ditambah
-- di sini SECARA DEFENSIF (add column if not exists): bila migrasi
-- v22 Worker A sudah menambahkannya, statement ini no-op.
alter table public.pf_ingestion_runs
  add column if not exists kelas_gagal text;
comment on column public.pf_ingestion_runs.kelas_gagal is
  'Kelas galat per sumber (Fase 3): selesai/sebagian/rate-limited/unavailable/invalid-feed/permanently-failed/disabled/dilewati/gagal. NULL = tidak ada kegagalan.';

-- Longgarkan CHECK status agar kelas baru bisa ditulis apa adanya.
alter table public.pf_ingestion_runs
  drop constraint if exists pf_ingestion_runs_status_check;
alter table public.pf_ingestion_runs add constraint
  pf_ingestion_runs_status_check
  check (status in (
    'berjalan', 'selesai', 'gagal', 'sebagian',
    'rate-limited', 'unavailable', 'invalid-feed',
    'permanently-failed', 'disabled', 'dilewati'
  ));

-- ============================================================
-- 2. pf_item_clusters + pf_item_cluster_members
-- ============================================================

create table if not exists public.pf_item_clusters (
  id uuid primary key default gen_random_uuid(),
  -- Kunci stabil dari judul wakil (sha256 16 hex, lihat klaster.ts:
  -- token judul terurut). Unik: satu peristiwa = satu klaster.
  kunci text not null unique,
  -- Judul wakil: judul item paling awal dalam klaster (judul ASLI
  -- dari sumber, bukan karangan).
  judul text not null,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);
comment on table public.pf_item_clusters is
  'Klaster event Fase 7c: 1 peristiwa dengan N laporan utuh (item mentah). Laporan tidak pernah dihapus/digabung karena mirip — klaster hanya menunjuk mereka.';
comment on column public.pf_item_clusters.kunci is
  'Kunci stabil dari judul wakil (token judul terurut -> sha256 16 hex).';

create table if not exists public.pf_item_cluster_members (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.pf_item_clusters (id) on delete cascade,
  raw_item_id uuid not null references public.pf_raw_items (id) on delete cascade,
  ditambahkan_pada timestamptz not null default now(),
  unique (cluster_id, raw_item_id)
);
comment on table public.pf_item_cluster_members is
  'Anggota klaster: satu baris per (klaster, laporan). Laporan tetap baris pf_raw_items sendiri.';

create index if not exists pf_item_cluster_members_cluster_idx
  on public.pf_item_cluster_members (cluster_id);
create index if not exists pf_item_cluster_members_item_idx
  on public.pf_item_cluster_members (raw_item_id);
create index if not exists pf_item_clusters_dibuat_idx
  on public.pf_item_clusters (dibuat_pada desc);

-- ============================================================
-- 3. RLS (baca staf — sama seperti pf_raw_items v3)
-- ============================================================

alter table public.pf_item_clusters enable row level security;
alter table public.pf_item_cluster_members enable row level security;

drop policy if exists "pf_item_clusters baca staf" on public.pf_item_clusters;
create policy "pf_item_clusters baca staf"
  on public.pf_item_clusters for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

drop policy if exists "pf_item_cluster_members baca staf" on public.pf_item_cluster_members;
create policy "pf_item_cluster_members baca staf"
  on public.pf_item_cluster_members for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

-- ============================================================
-- Verifikasi sesudah menjalankan (jalankan terpisah di SQL Editor):
--   select 'pf_item_clusters', count(*) from public.pf_item_clusters
--   union all select 'pf_item_cluster_members', count(*) from public.pf_item_cluster_members;
-- Ekspektasi: semua 0 (tabel baru, belum ada klaster).
--   select column_name from information_schema.columns
--     where table_schema = 'public' and table_name = 'pf_ingestion_runs'
--     and column_name = 'kelas_gagal';
-- Ekspektasi: 1 baris (kelas_gagal, text, YES).
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.pf_ingestion_runs'::regclass
--     and conname = 'pf_ingestion_runs_status_check';
-- Ekspektasi: CHECK mencakup 'rate-limited' dan 'dilewati'.
-- ============================================================
