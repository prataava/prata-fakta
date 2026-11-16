-- ============================================================
-- PRATA FAKTA — Migrasi v17: kolom artikel_id di pf_events
-- Tanggal: 2026-11-16
-- Alasan: kode src/lib/lanjutan.ts (KOLOM_EVENT) sudah lama
--   memilih kolom pf_events.artikel_id, tetapi kolom itu TIDAK
--   PERNAH dibuat migrasi mana pun (v6 membuat pf_events tanpa
--   artikel_id; v8 hanya check constraint lintang/bujur; v10
--   menambah era/penting/negara_kode). Akibatnya /peta selalu
--   error di produksi (PostgREST 42703 -> GalatBaca -> error
--   boundary) sejak fitur event dibangun. Disetujui pengguna
--   16 Nov 2026 ±22.55 WIB.
-- Sifat: ADITIF, tidak menyentuh data. Tabel pf_events saat ini
--   kosong (0 baris), jadi penambahan FK aman.
-- Verifikasi sesudah jalan:
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--     where table_schema = 'public' and table_name = 'pf_events'
--       and column_name = 'artikel_id';
--   -- harus 1 baris: uuid, YES
--   Lalu buka https://prata-fakta.vercel.app/peta — harus tampil
--   (empty state jujur, 0 event), bukan "Terjadi kesalahan".
-- ============================================================

alter table public.pf_events
  add column if not exists artikel_id uuid
    references public.pf_articles (id) on delete set null;

-- Komentar kolom (dokumentasi di skema).
comment on column public.pf_events.artikel_id is
  'Artikel sumber peristiwa (v17). NULL bila peristiwa tidak
   terikat ke satu artikel. Dihapus-ikuti: bila artikel dihapus,
   tautan jadi NULL, peristiwa tetap ada.';
