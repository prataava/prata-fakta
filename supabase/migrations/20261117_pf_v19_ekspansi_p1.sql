-- ============================================================
-- PRATA FAKTA — Migrasi v19: ekspansi P1-1 (Personal Knowledge
-- Library). Tanggal: 2026-11-17.
-- Alasan: (1) kolom folder di pf_bookmarks — bookmark bisa
--   dikelompokkan ke folder bernama bebas; (2) tabel baru
--   pf_notes — catatan pribadi pengguna pada satu artikel
--   berita ATAU satu artikel pengetahuan.
-- Sifat: ADDITIVE-ONLY, idempoten (semua objek memakai
--   IF NOT EXISTS / do-block bersyarat). Tidak menyentuh data
--   lama, tidak mengubah RLS/policy tabel lain.
--   - pf_bookmarks.folder: NULL = "Tanpa folder"; nama folder
--     teks bebas maks 50 karakter — divalidasi di API
--     (/api/bookmark), bukan CHECK, agar pesan galat ramah.
--   - pf_notes: satu pengguna boleh banyak catatan per
--     artikel (tanpa UNIQUE); CHECK tepat-satu-target pola
--     pf_bookmarks v16; RLS + 4 policy owner-scoped pola
--     pf_bookmarks v2 (auth.uid() = user_id).
--   - GRANT eksplisit untuk pf_notes (pola v9: grant per
--     tabel, bukan "all tables" — tabel baru tidak tercakup
--     grant v9 yang sudah jalan).
-- Verifikasi sesudah jalan (PGlite, skrip uji P1-1):
--   select column_name from information_schema.columns
--     where table_name = 'pf_bookmarks' and column_name = 'folder';
--   select count(*) from pg_policies
--     where tablename = 'pf_notes'; -- harus 4
-- ============================================================

-- ==================== §1. Kolom folder di pf_bookmarks ====================
alter table public.pf_bookmarks
  add column if not exists folder text;

comment on column public.pf_bookmarks.folder is
  'Folder bookmark (v19). NULL = "Tanpa folder". Nama folder teks
   bebas, maksimal 50 karakter — divalidasi di API, bukan CHECK.';

-- ==================== §2. Tabel baru pf_notes ====================
create table if not exists public.pf_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  artikel_id uuid null references public.pf_articles (id) on delete cascade,
  pengetahuan_id uuid null references public.pf_knowledge_articles (id) on delete cascade,
  isi text not null check (char_length(isi) between 1 and 2000),
  dibuat_pada timestamptz not null default now(),
  diubah_pada timestamptz not null default now()
);

comment on table public.pf_notes is
  'Catatan pribadi pengguna (v19, P1-1). Satu catatan menunjuk
   SATU target: artikel berita (artikel_id) ATAU artikel
   pengetahuan (pengetahuan_id). Satu pengguna boleh banyak
   catatan per artikel.';

-- CHECK tepat satu target (pola pf_bookmarks v16): tepat satu
-- dari artikel_id / pengetahuan_id yang terisi.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_notes'::regclass
      and conname = 'pf_notes_satu_target_check'
  ) then
    alter table public.pf_notes
      add constraint pf_notes_satu_target_check
      check ((artikel_id is null) <> (pengetahuan_id is null));
  end if;
end $$;

create index if not exists pf_notes_user_idx
  on public.pf_notes (user_id);

-- ==================== §3. RLS + 4 policy owner-scoped ====================
-- Pola persis pf_bookmarks v2: hanya pemilik yang bisa
-- baca/buat/ubah/hapus catatannya sendiri.
alter table public.pf_notes enable row level security;

drop policy if exists "pf_notes baca sendiri" on public.pf_notes;
create policy "pf_notes baca sendiri"
  on public.pf_notes for select using (auth.uid() = user_id);

drop policy if exists "pf_notes buat sendiri" on public.pf_notes;
create policy "pf_notes buat sendiri"
  on public.pf_notes for insert with check (auth.uid() = user_id);

drop policy if exists "pf_notes ubah sendiri" on public.pf_notes;
create policy "pf_notes ubah sendiri"
  on public.pf_notes for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "pf_notes hapus sendiri" on public.pf_notes;
create policy "pf_notes hapus sendiri"
  on public.pf_notes for delete using (auth.uid() = user_id);

-- ==================== §4. GRANT (pola v9) ====================
-- RLS tetap penegak baris; grant hanya membuka gerbang tabel
-- untuk peran login (anon ikut diberi seperti pf_bookmarks,
-- tapi policy auth.uid() = user_id tetap menolak anon karena
-- auth.uid() anon adalah NULL).
grant select, insert, update, delete on public.pf_notes
  to anon, authenticated;
