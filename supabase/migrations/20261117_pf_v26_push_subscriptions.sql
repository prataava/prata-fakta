-- ============================================================
-- PRATA FAKTA — Migrasi v26: langganan push untuk tamu
-- Berkas: 20261117_pf_v26_push_subscriptions.sql
-- 17 Nov 2026 — Tugas 1 Push Notifications (VAPID + broadcast)
--
-- Tujuan: membuka langganan push VAPID untuk TAMU (tanpa login)
-- agar broadcast admin (POST /api/admin/notifikasi/kirim)
-- sampai ke semua perangkat, bukan hanya pengguna masuk.
--
-- Tabel pf_push_subscriptions SUDAH dibuat migrasi v14
-- (Gelombang B2-D): id, user_id NOT NULL, endpoint UNIQUE,
-- p256dh, auth, dibuat_pada, diperbarui_pada + RLS pemilik
-- (baca/tambah/ubah/hapus pemilik) + grant authenticated.
-- Migrasi ini HANYA:
--   1. melonggarkan user_id menjadi NULL (tamu: user_id NULL);
--   2. menambah policy insert anon HANYA untuk baris tamu
--      (user_id IS NULL) + grant insert ke anon.
-- TIDAK mengubah kolom lain (dibuat_pada/diperbarui_pada tetap
-- nama kolomnya — JANGAN tambah created_at/updated_at duplikat),
-- TIDAK mengubah policy pemilik v14, TIDAK membuat tabel baru.
--
-- SIFAT: ADDITIVE-ONLY + IDEMPOTEN (DROP NOT NULL kedua kali =
-- no-op; drop policy if exists + create policy). Jumlah tabel
-- tetap 68 — backup-pf + §E baterai global-intel tidak berubah.
-- Prasyarat: v14 sudah diterapkan (tabel ada). Bila tabel belum
-- ada, ALTER gagal keras — itu benar: v14 adalah pemilik tabel,
-- jangan diam-diam membuat tabel di sini.
-- Rollback aman (HANYA atas persetujuan pemilik, sesudah backup):
--   alter table public.pf_push_subscriptions
--     alter column user_id set not null;
--   drop policy if exists "pf_push_subscriptions tambah tamu"
--     on public.pf_push_subscriptions;
--   (rollback GAGAL bila sudah ada baris tamu — hapus dulu
--    baris user_id IS NULL sebelum mengembalikan NOT NULL.)
--
-- VERIFIKASI (SQL Editor Supabase, sesudah menjalankan):
--   select is_nullable from information_schema.columns
--     where table_name = 'pf_push_subscriptions'
--       and column_name = 'user_id';
--     -- harapan: YES
--   select policyname from pg_policies
--     where tablename = 'pf_push_subscriptions';
--     -- harapan: 5 (4 pemilik v14 + "tambah tamu")
--   select count(*) from pg_tables
--     where schemaname = 'public' and tablename like 'pf_%';
--     -- harapan: 68 (tidak berubah)
-- ============================================================

-- ---------- 1. Longgarkan user_id (tamu: NULL) ----------
alter table public.pf_push_subscriptions
  alter column user_id drop not null;

-- ---------- 2. RLS + policy tamu + GRANT (pola v9/v14/v25) ----------
-- RLS sudah aktif sejak v14; pernyataan ini no-op bila sudah
-- aktif, dan menjaga migrasi tetap benar bila dijalankan
-- berurutan dari awal.
alter table public.pf_push_subscriptions enable row level security;

-- Tamu (anon) HANYA boleh insert baris miliknya sendiri, yaitu
-- baris tanpa pemilik (user_id IS NULL). Baris ber-pemilik tetap
-- hanya bisa ditulis pemiliknya (policy v14) atau service role
-- (bypass RLS). Endpoint tamu ditulis lewat service client dari
-- POST /api/notifications/subscribe yang di-rate-limit keras;
-- policy ini adalah lapis kedua, bukan jalur utama.
drop policy if exists "pf_push_subscriptions tambah tamu"
  on public.pf_push_subscriptions;
create policy "pf_push_subscriptions tambah tamu"
  on public.pf_push_subscriptions for insert
  with check (user_id is null);

-- GRANT insert saja untuk anon (pola v9): baca/ubah/hapus tetap
-- hanya pemilik (authenticated, policy v14) + service role.
grant insert on public.pf_push_subscriptions to anon;

comment on column public.pf_push_subscriptions.user_id is
  'Pemilik langganan; NULL = tamu (tanpa login, hanya menerima broadcast admin, bukan notifikasi per-pengguna).';
