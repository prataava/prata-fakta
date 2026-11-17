-- ============================================================
-- PRATA FAKTA — Migrasi v25: tabel alert ops (Fase 12 + 15)
-- Berkas: 20261117_pf_v25_alerts.sql
-- Worker G (intel/global-news-24-7) — 17 Nov 2026
--
-- Tujuan: mencatat alert kegagalan operasional (10 kejadian
-- mandat Fase 15) agar kegagalan ketahuan tanpa membuka tab
-- GitHub Actions, dengan ambang + cooldown anti-spam.
--
-- KENAPA TABEL BARU (bukan pf_notifications / pf_app_errors):
-- - pf_notifications (v6, CHECK v14): kolom `jenis` hanya
--   mengizinkan ('breaking','topik','brief','artikel','koreksi',
--   'peristiwa','jawaban','podcast') — TIDAK ADA jenis alert/
--   sistem. Menambah jenis butuh DROP + CREATE CHECK = NON-ADITIF,
--   ditangguhkan menunggu persetujuan pemilik (aturan yang sama
--   dengan CHECK v8 'comparison'). Menulis alert dengan jenis
--   'artikel'/'brief' adalah pelabelan palsu — DILARANG.
--   pf_notifications juga WAJIB user_id per pengguna; alert
--   operasional adalah milik tim admin, bukan satu pengguna.
-- - pf_app_errors (v14): hanya log (sumber/pesan/kode/rute) —
--   tanpa siklus hidup alert (aktif/diakui/selesai), tanpa
--   dedup, tanpa cooldown. Alert TETAP dicerminkan ke
--   pf_app_errors (sumber 'alert/<kejadian>') sebagai jejak
--   error-monitoring; pf_alerts adalah catatan alert-nya.
--
-- SIFAT: ADDITIVE-ONLY. Satu tabel baru + indeks + RLS + GRANT.
-- Tidak mengubah tabel, kolom, CHECK, atau policy yang sudah ada.
-- Rollback aman (HANYA atas persetujuan pemilik, sesudah backup):
--   DROP TABLE public.pf_alerts CASCADE;
--
-- VERIFIKASI (SQL Editor Supabase, sesudah menjalankan):
--   select count(*) from pg_tables
--     where schemaname='public' and tablename='pf_alerts';
--     -- harapan: 1
--   select indexname from pg_indexes
--     where tablename='pf_alerts';
--     -- harapan: pf_alerts_pkey, pf_alerts_dedup_aktif_idx,
--     --   pf_alerts_kejadian_idx, pf_alerts_status_idx
--   select count(*) from pg_policies
--     where tablename='pf_alerts';
--     -- harapan: 1 ("pf_alerts baca staf")
--   insert ke pf_alerts dengan kunci_dedup sama 2x saat status
--   'aktif' -> baris kedua DITOLAK (23505); sesudah baris
--   pertama diakui, insert yang sama DITERIMA.
-- ============================================================

-- ---------- 1. Tabel pf_alerts ----------
create table if not exists public.pf_alerts (
  id uuid primary key default gen_random_uuid(),
  -- 10 kejadian mandat Fase 15 (lihat src/lib/admin/alerts.ts
  -- KEJADIAN_ALERT — daftar di kode HARUS sama persis dengan
  -- CHECK ini; kejadian baru butuh migrasi baru).
  kejadian text not null
    check (kejadian in (
      'scheduler_mati',
      'ingestion_gagal',
      'gdelt_429',
      'rss_mati',
      'source_stale',
      'db_error',
      'antrean_macet',
      'pipeline_gagal',
      'brief_tak_terbentuk',
      'publikasi_gagal'
    )),
  tingkat text not null default 'peringatan'
    check (tingkat in ('info', 'peringatan', 'kritis')),
  judul text not null,
  pesan text not null default '',
  -- Konteks mesin (id job/sumber/run, nilai ambang yang
  -- terlampaui, dsb.) — JSON, bukan kolom baru per kejadian.
  detail jsonb not null default '{}',
  -- Kunci dedup: '<kejadian>:<konteks>' (mis.
  -- 'scheduler_mati:ingestion', 'rss_mati:<uuid sumber>').
  -- Unik HANYA selagi status='aktif' (indeks parsial di bawah):
  -- kejadian yang sama boleh tercatat lagi sesudah alert lama
  -- diakui/diselesaikan DAN cooldown-nya lewat (cooldown
  -- ditegakkan di aplikasi — lihat src/lib/admin/alerts.ts).
  kunci_dedup text not null,
  -- Siklus hidup: aktif -> diakui (admin melihat) -> selesai
  -- (penyebab hilang pada evaluasi berikut / ditutup manual).
  status text not null default 'aktif'
    check (status in ('aktif', 'diakui', 'selesai')),
  diakui_oleh uuid references auth.users (id) on delete set null,
  diakui_pada timestamptz,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

comment on table public.pf_alerts is
  'Alert operasional Fase 15: satu baris per kejadian kegagalan (10 kejadian mandat). Dibaca staf di /admin/ops; ditulis service role lewat POST /api/admin/alerts/evaluasi. Dedup aktif via indeks parsial kunci_dedup; cooldown ditegakkan di aplikasi.';
comment on column public.pf_alerts.kunci_dedup is
  'Kunci dedup <kejadian>:<konteks>. Unik selagi status=aktif (indeks parsial) — alert sama tidak tercatat dua kali sebelum diakui.';
comment on column public.pf_alerts.detail is
  'Konteks mesin JSON: id job/sumber/run, nilai ambang yang terlampaui, dan data pendukung evaluasi.';

-- ---------- 2. Indeks ----------
-- Dedup alert aktif (SATU-SATUNYA penegak keunikan — parsial,
-- agar riwayat alert lama tidak menghalangi alert baru).
create unique index if not exists pf_alerts_dedup_aktif_idx
  on public.pf_alerts (kunci_dedup)
  where status = 'aktif';
create index if not exists pf_alerts_kejadian_idx
  on public.pf_alerts (kejadian, dibuat_pada desc);
create index if not exists pf_alerts_status_idx
  on public.pf_alerts (status, dibuat_pada desc);

-- ---------- 3. RLS + policies + GRANT (pola v9/v14) ----------
-- Alert bersifat INTERNAL: tulis HANYA lewat service role (API
-- backend); baca hanya peran staf. TIDAK ADA policy
-- insert/update/delete untuk peran staf.
alter table public.pf_alerts enable row level security;
drop policy if exists "pf_alerts baca staf" on public.pf_alerts;
create policy "pf_alerts baca staf"
  on public.pf_alerts for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );
-- GRANT select saja (pola v9): tulis HANYA via service role.
grant select on public.pf_alerts to anon, authenticated;
grant all on public.pf_alerts to service_role;
