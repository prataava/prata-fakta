-- ============================================================
-- PRATA FAKTA — Migrasi v18: ekspansi P0 (ADDITIVE-ONLY)
-- Tanggal: 2026-11-17
-- Alasan: dua kolom baru untuk fitur ekspansi P0 —
--   (1) pf_article_sources.peran: kedudukan sumber dalam
--   artikel (primer = sumber utama, sekunder = pendukung);
--   (2) pf_user_preferences.pencarian_tersimpan: daftar
--   pencarian yang disimpan pengguna (JSON array).
-- Sifat: ADITIF, tidak menyentuh data dan tidak mengubah
--   RLS/policy apa pun. Kedua ALTER memakai IF NOT EXISTS,
--   aman dijalankan ulang.
-- PERINGATAN (temuan saat penulisan, 2026-11-17): kolom
--   pf_article_sources.peran TERNYATA SUDAH ADA sejak v8
--   §8 (20261116_pf_v8_expansion.sql:436-439) dengan CHECK
--   ('utama', 'koroborasi', 'konteks', 'bantahan') — BUKAN
--   ('primer', 'sekunder') seperti premis tugas P0. Karena
--   itu ALTER pertama di bawah ini adalah NO-OP: kolom sudah
--   ada, CHECK v8 yang tetap berlaku, dan nilai 'primer' /
--   'sekunder' akan DITOLAK sampai CHECK v8 diganti (itu
--   bukan perubahan aditif — butuh keputusan pemilik).
--   Perubahan kedua (pencarian_tersimpan) benar-benar baru:
--   grep v1–v17 tidak menemukan kolom itu di mana pun.
-- Verifikasi sesudah jalan (PGlite, scripts/uji-v18):
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--     where table_schema = 'public'
--       and table_name in ('pf_article_sources', 'pf_user_preferences')
--       and column_name in ('peran', 'pencarian_tersimpan');
--   -- harus 2 baris: peran text YES (CHECK v8), dan
--   -- pencarian_tersimpan jsonb NO default '[]'::jsonb
-- ============================================================

alter table public.pf_article_sources
  add column if not exists peran text
    check (peran is null or peran in ('primer', 'sekunder'));

alter table public.pf_user_preferences
  add column if not exists pencarian_tersimpan jsonb not null default '[]'::jsonb;

-- Komentar kolom (dokumentasi di skema).
comment on column public.pf_article_sources.peran is
  'Kedudukan sumber dalam artikel (v18; kolom dibuat v8 dengan
   kosakata utama/koroborasi/konteks/bantahan — lihat header).';
comment on column public.pf_user_preferences.pencarian_tersimpan is
  'Daftar pencarian tersimpan pengguna (v18). JSON array,
   default array kosong.';
