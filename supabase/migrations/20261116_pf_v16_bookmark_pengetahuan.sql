-- ============================================================
-- Migrasi v16 — Follow-up 5/6 (F11): bookmark pengetahuan
-- (16 Nov 2026). Jalankan SETELAH v15. Idempoten: aman
-- dijalankan dua kali berturut-turut (semua objek memakai
-- IF NOT EXISTS / do-block bersyarat).
--
-- KEPUTUSAN DESAIN (follow-up 6): pengetahuan TIDAK mendapat
-- tabel simpan baru — pf_bookmarks DIPERLUAS dengan kolom
-- pengetahuan_id (bukan tabel pf_bookmarks_pengetahuan).
-- Alasan: (1) satu mekanisme simpan untuk semua jenis konten
--    (konsisten dengan 5 jenis F11 yang sudah ada);
-- (2) RLS + 4 policy berbasis user_id yang sudah ada tetap
--    berlaku tanpa perubahan — isolasi pemilik teruji ulang
--    di baterai, tanpa permukaan kebijakan baru;
-- (3) tanpa tabel baru: jumlah tabel tetap 62, backup
--    (scripts/backup-pf.mjs) tidak berubah, tidak ada GRANT
--    baru (GRANT tabel yang sama sudah mencakup kolom baru);
-- (4) CHECK tepat-satu-target mencegah baris ambigu
--    (artikel dan pengetahuan sekaligus, atau tanpa target).
--
-- Isi:
--   §1 kolom baru pf_bookmarks.pengetahuan_id (uuid, NULL,
--      FK ke pf_knowledge_articles on delete cascade) +
--      artikel_id dibuat NULLABLE (sebelumnya NOT NULL) +
--      CHECK pf_bookmarks_satu_target_check (tepat satu dari
--      artikel_id / pengetahuan_id terisi) +
--      UNIQUE (user_id, pengetahuan_id) +
--      index pf_bookmarks_pengetahuan_idx.
--   §2 RLS/policy/GRANT TIDAK BERUBAH: 4 policy berbasis
--      auth.uid() = user_id tetap berlaku untuk kedua jenis
--      bookmark; GRANT tabel yang sama tidak berubah.
--
-- ROLLBACK (bila v16 harus dibatalkan sebelum dipakai):
--   alter table public.pf_bookmarks
--     drop column if exists pengetahuan_id;
--   (CHECK satu-target + UNIQUE + index ikut terhapus
--    bersama kolom.)
--   alter table public.pf_bookmarks
--     alter column artikel_id set not null;
--   (set not null HANYA aman bila tidak ada baris dengan
--    artikel_id null — sesudah dipakai menyimpan pengetahuan,
--    jangan rollback: baris pengetahuan ikut hilang.)
-- ============================================================

-- ==================== §1. Kolom pengetahuan_id ====================
-- Satu baris bookmark kini menunjuk SATU target: artikel berita
-- (artikel_id, perilaku lama) ATAU artikel pengetahuan
-- (pengetahuan_id, baru). FK on delete cascade: pengetahuan
-- yang dihapus ikut menghapus bookmark-nya (pola yang sama
-- seperti artikel_id).
alter table public.pf_bookmarks
  add column if not exists pengetahuan_id uuid
  references public.pf_knowledge_articles (id) on delete cascade;

-- artikel_id sebelumnya NOT NULL (v2: bookmark hanya artikel).
-- Longgarkan agar baris pengetahuan (artikel_id null) bisa
-- tersimpan; CHECK §1 di bawah tetap melarang baris tanpa
-- target sama sekali. Do-block agar aman diulang.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pf_bookmarks'
      and column_name = 'artikel_id'
      and is_nullable = 'NO'
  ) then
    alter table public.pf_bookmarks
      alter column artikel_id drop not null;
  end if;
end $$;

-- CHECK tepat satu target: (artikel_id is null) <>
-- (pengetahuan_id is null) benar hanya bila tepat satu yang
-- terisi. Baris lama (artikel terisi, pengetahuan null)
-- tetap lolos CHECK ini.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_bookmarks'::regclass
      and conname = 'pf_bookmarks_satu_target_check'
  ) then
    alter table public.pf_bookmarks
      add constraint pf_bookmarks_satu_target_check
      check ((artikel_id is null) <> (pengetahuan_id is null));
  end if;
end $$;

-- Satu pengguna menyimpan satu pengetahuan sekali saja
-- (pola yang sama seperti unique (user_id, artikel_id) v2).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_bookmarks'::regclass
      and conname = 'pf_bookmarks_user_pengetahuan_uniq'
  ) then
    alter table public.pf_bookmarks
      add constraint pf_bookmarks_user_pengetahuan_uniq
      unique (user_id, pengetahuan_id);
  end if;
end $$;

create index if not exists pf_bookmarks_pengetahuan_idx
  on public.pf_bookmarks (pengetahuan_id);

-- ==================== §2. RLS / policy / GRANT: TIDAK BERUBAH ====================
-- 4 policy pf_bookmarks (baca/buat/ubah/hapus sendiri, v2)
-- memakai auth.uid() = user_id — berlaku untuk kedua jenis
-- bookmark tanpa perubahan, karena kolom target tidak masuk
-- ke syarat policy. RLS sudah aktif sejak v2; GRANT tabel
-- yang sama (v9) sudah mencakup kolom baru. Sengaja tidak
-- ada statement GRANT/policy di migrasi ini.
