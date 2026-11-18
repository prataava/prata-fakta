-- ============================================================
-- PRATA FAKTA — Migrasi v30: policy baca staf pf_reading_history
-- Tanggal: 2026-11-19
-- Alasan: /admin/kinerja membaca pf_reading_history lewat sesi
--   pengguna (createClient), tapi RLS tabel itu sejak v2 hanya
--   mengizinkan pemilik membaca barisnya sendiri — jadi halaman
--   Kinerja selama ini hanya menampilkan riwayat baca admin yang
--   login, bukan semua pembaca. /admin/audiens (v29) tidak kena
--   karena memakai service client.
-- Perubahan: SATU policy SELECT baru "pf_reading_history baca
--   staf" — peran staf (super_admin/editor/fact_checker/writer,
--   pola yang sama dengan "pf_push_deliveries baca staf" v27)
--   boleh membaca SEMUA baris. Policy pemilik v2 TIDAK disentuh
--   (baca/buat/ubah/hapus sendiri tetap berlaku); TIDAK ADA
--   policy insert/update/delete untuk staf — staf tetap tidak
--   bisa menulis riwayat baca siapa pun.
-- Catatan privasi: halaman /admin/kinerja hanya menampilkan
--   AGREGAT (total baca, selesai, pembaca unik, artikel paling
--   dibaca) — tidak ada riwayat per-pengguna yang ditampilkan.
--   Policy ini memberi peran staf hak baca baris mentah lewat
--   API; itu konsekuensi yang disadari dari opsi perbaikan (a)
--   yang dipilih pemilik (opsi (b) service client tidak jadi
--   dipakai). Bila suatu hari agregat saja tidak cukup dan akses
--   baris mentah ingin ditutup, ganti halaman ke service client
--   lalu cabut policy ini.
-- Sifat: additive-only, idempoten (drop if exists + create).
--   TIDAK menambah tabel, TIDAK mengubah kolom, TIDAK menyentuh
--   data. Kode aplikasi TIDAK berubah — halaman yang sama langsung
--   melihat semua baris sesudah policy ini diterapkan.
-- ============================================================

drop policy if exists "pf_reading_history baca staf" on public.pf_reading_history;
create policy "pf_reading_history baca staf"
  on public.pf_reading_history for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

-- ============================================================
-- Kueri verifikasi (jalankan sesudah penerapan, via SQL Editor):
--   select policyname, cmd from pg_policies
--     where tablename = 'pf_reading_history'
--     order by policyname;                                 -- harapan: 5 baris
--       ("pf_reading_history baca sendiri" / "buat sendiri" /
--        "ubah sendiri" / "hapus sendiri" + "baca staf")
--   select tablename, rowsecurity from pg_tables
--     where tablename = 'pf_reading_history';              -- harapan: rowsecurity true
--   select count(*) from pg_tables
--     where schemaname = 'public' and tablename like 'pf\_%'; -- harapan: 69 (tetap)
-- CATATAN: tidak ada tabel/kolom baru, jadi scripts/backup-pf.mjs
--   TIDAK perlu diubah.
-- ============================================================
