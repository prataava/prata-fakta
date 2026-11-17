-- ============================================================
-- PRATA FAKTA — Migrasi v21: ekspansi P3 (ADDITIVE-ONLY)
-- Tanggal: 2026-11-17
-- Alasan: empat kolom preferensi baca baru di
--   pf_user_preferences untuk paket P3-2 (personalisasi
--   lanjut) — dipakai juga oleh P3-3 (kolom `bahasa`).
--   Nilai CHECK mode_baca / ukuran_font disalin PERSIS dari
--   enum komponen src/components/artikel/PembacaArtikel.tsx
--   (ModeBaca "1menit" | "3menit" | "mendalam";
--   UkuranFont "S" | "M" | "L") — jangan ubah satu sisi
--   tanpa sisi lainnya.
-- Sifat: ADITIF, tidak menyentuh data dan tidak mengubah
--   RLS/policy apa pun. Semua ALTER memakai IF NOT EXISTS,
--   aman dijalankan ulang (idempoten). TANPA ubah RLS:
--   policy pemilik v8 sudah mencakup kolom baru.
-- Verifikasi sesudah jalan (PGlite, scripts/uji-ekspansi-p3):
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--     where table_schema = 'public'
--       and table_name = 'pf_user_preferences'
--       and column_name in
--         ('mode_baca', 'ukuran_font', 'kepadatan', 'bahasa');
--   -- harus 4 baris, semua text NOT NULL dengan default
--   -- '3menit' / 'M' / 'nyaman' / 'id'.
-- ============================================================

alter table public.pf_user_preferences
  add column if not exists mode_baca text not null default '3menit'
    check (mode_baca in ('1menit', '3menit', 'mendalam'));

alter table public.pf_user_preferences
  add column if not exists ukuran_font text not null default 'M'
    check (ukuran_font in ('S', 'M', 'L'));

alter table public.pf_user_preferences
  add column if not exists kepadatan text not null default 'nyaman'
    check (kepadatan in ('nyaman', 'rapat'));

alter table public.pf_user_preferences
  add column if not exists bahasa text not null default 'id'
    check (bahasa in ('id', 'en'));

-- Komentar kolom (dokumentasi di skema).
comment on column public.pf_user_preferences.mode_baca is
  'Mode baca default pengguna (v21, P3-2): 1menit, 3menit, atau mendalam. Sama persis dengan tipe ModeBaca di PembacaArtikel.tsx.';
comment on column public.pf_user_preferences.ukuran_font is
  'Ukuran font default isi artikel (v21, P3-2): S, M, atau L. Sama persis dengan tipe UkuranFont di PembacaArtikel.tsx.';
comment on column public.pf_user_preferences.kepadatan is
  'Kepadatan daftar artikel (v21, P3-2): nyaman (default) atau rapat.';
comment on column public.pf_user_preferences.bahasa is
  'Bahasa antarmuka pengguna (v21, P3-2/P3-3): id atau en. Artikel berita tetap Bahasa Indonesia.';
