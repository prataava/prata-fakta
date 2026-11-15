-- ============================================================
-- PRATA FAKTA — Migrasi Fase 7 (Production: Riwayat Skor Kuis)
-- Berkas: 20261116_pf_v7_quiz_scores.sql
-- Proyek Supabase: 'prata' (dipakai bersama PRATA & TASIK JAYA)
-- Cara menjalankan: Supabase Dashboard → SQL Editor → tempel
-- seluruh berkas → Run. (DDL tidak bisa dijalankan dari VM:
-- anon key tidak bisa DDL, service_role key & DATABASE_URL tidak
-- tersedia di workspace — lihat ARSITEKTUR.md.)
-- Berkas ini IDEMPOTEN: aman dijalankan ulang (IF NOT EXISTS +
-- DROP POLICY IF EXISTS + ON CONFLICT DO NOTHING).
-- KETERGANTUNGAN: WAJIB jalankan migrasi v1 DULU
-- (20261116_pf_v1_foundation.sql) LALU v2
-- (20261116_pf_v2_articles.sql) LALU v3
-- (20261116_pf_v3_ingestion.sql) LALU v4
-- (20261116_pf_v4_ai.sql) LALU v5
-- (20261116_pf_v5_editorial.sql) LALU v6
-- (20261116_pf_v6_advanced.sql). Migrasi ini memakai:
--   - tabel auth.users (FK user_id)
--   - fungsi public.pf_set_updated_at() (trigger)
-- KEPUTUSAN FASE 7 (lihat ARSITEKTUR.md §14): skor kuis
-- DISIMPAN persisten — tetapi HANYA untuk pengguna login.
-- Alasan: riwayat skor hanya bermakna bila terikat akun (dapat
-- ditampilkan kembali dan dihapus pemiliknya); skor anonim tidak
-- dapat ditampilkan kembali dan tidak dapat dihapus pemiliknya,
-- jadi tidak disimpan. Pengguna anonim tetap bisa bermain kuis;
-- skornya hanya tampil di sesi itu, dan halaman /kuis menyatakan
-- jujur "Masuk untuk menyimpan riwayat skor."
-- SEED: TIDAK ADA seed operasional — tanpa skor palsu.
-- URUTAN: pf_quiz_scores (mandiri, hanya merujuk auth.users).
-- ============================================================

-- ============================================================
-- 1. TABEL
-- ============================================================

-- ---------- 1a. pf_quiz_scores ----------
-- Satu baris per pengguna per tanggal (constraint unique
-- user_id + tanggal): bila pengguna mengulang kuis di hari yang
-- sama, skor terbaru menimpa skor sebelumnya (upsert dari API).
-- benar dibatasi 0..5 dan tidak boleh melebihi total; total
-- dibatasi 1..10 (kuis harian berisi 5 soal; batas 10 memberi
-- ruang bila format kuis berubah tanpa mengubah skema).
-- Ditulis lewat API /api/kuis/skor dengan session client (RLS
-- menegakkan user_id = auth.uid()); tidak ada tulis service
-- role yang dibutuhkan. Dibaca hanya pemiliknya sendiri.
create table if not exists public.pf_quiz_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tanggal date not null,
  benar integer not null check (benar >= 0 and benar <= 5),
  total integer not null default 5 check (total >= 1 and total <= 10),
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now(),
  constraint pf_quiz_scores_benar_tidak_melebihi_total
    check (benar <= total),
  constraint pf_quiz_scores_user_tanggal_key
    unique (user_id, tanggal)
);

-- Indeks riwayat: skor pengguna terbaru dulu (dipakai halaman
-- /kuis untuk menampilkan 7 hari terakhir).
create index if not exists pf_quiz_scores_user_tanggal_idx
  on public.pf_quiz_scores (user_id, tanggal desc);

-- ============================================================
-- 2. TRIGGER
-- ============================================================

drop trigger if exists pf_quiz_scores_set_updated_at on public.pf_quiz_scores;
create trigger pf_quiz_scores_set_updated_at
  before update on public.pf_quiz_scores
  for each row execute function public.pf_set_updated_at();

-- ============================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================

alter table public.pf_quiz_scores enable row level security;

drop policy if exists "pf_quiz_scores baca pemilik" on public.pf_quiz_scores;
create policy "pf_quiz_scores baca pemilik"
  on public.pf_quiz_scores for select using (auth.uid() = user_id);

drop policy if exists "pf_quiz_scores tambah pemilik" on public.pf_quiz_scores;
create policy "pf_quiz_scores tambah pemilik"
  on public.pf_quiz_scores for insert with check (auth.uid() = user_id);

drop policy if exists "pf_quiz_scores ubah pemilik" on public.pf_quiz_scores;
create policy "pf_quiz_scores ubah pemilik"
  on public.pf_quiz_scores for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- TIDAK ADA policy delete pengguna: skor hanya bisa dihapus
-- pemiliknya lewat penghapusan akun (cascade auth.users) atau
-- service role. TIDAK ADA policy baca publik — skor pengguna
-- lain tidak dapat dilihat siapa pun.

-- ============================================================
-- 4. PENGERASAN FUNGSI v1 (temuan T7 audit keamanan Fase 7)
-- ============================================================
-- Tiga fungsi SECURITY DEFINER dari migrasi v1 dideklarasikan
-- tanpa SET search_path — tambahkan di sini TANPA mengubah
-- berkas v1: pf_has_role(text), pf_is_super_admin(),
-- pf_handle_new_user(). Isi ketiganya memakai nama
-- berkualifikasi skema (public./auth.), jadi risiko saat ini
-- rendah; ini pengerasan standar, bukan perbaikan celah aktif.
alter function public.pf_has_role(text) set search_path = public;
alter function public.pf_is_super_admin() set search_path = public;
alter function public.pf_handle_new_user() set search_path = public;

-- ============================================================
-- 5. SEED
-- ============================================================
-- TIDAK ADA seed operasional: tanpa skor palsu. Baris pertama
-- dibuat API /api/kuis/skor sesudah pengguna login bermain kuis.

-- ============================================================
-- Verifikasi sesudah menjalankan (jalankan terpisah di SQL Editor):
--   select 'pf_quiz_scores' as tabel, count(*) from public.pf_quiz_scores;
-- Ekspektasi: 0 (tanpa seed data operasional).
-- Cek RLS + policy:
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename like 'pf_%'
--   order by tablename;
--   select count(*) from pg_policies
--   where schemaname = 'public' and tablename like 'pf_%';
-- Ekspektasi: 36 tabel pf_* ber-RLS (8 dari v1 + 8 dari v2 +
--   2 dari v3 + 5 dari v4 + 3 dari v5 + 9 dari v6 + 1 dari v7),
--   total policy 79 (76 dari v1–v6 + 3 dari v7:
--   pf_quiz_scores 3 — baca pemilik, tambah pemilik,
--   ubah pemilik).
-- ============================================================
