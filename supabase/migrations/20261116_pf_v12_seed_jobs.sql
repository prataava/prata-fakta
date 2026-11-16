-- ============================================================
-- PRATA FAKTA — Migrasi v12: Tahap 13C (seed 5 job scheduler)
-- Berkas: 20261116_pf_v12_seed_jobs.sql
-- Proyek Supabase: 'prata' (dipakai bersama PRATA & TASIK JAYA)
-- Cara menjalankan: Supabase Dashboard → SQL Editor → tempel
-- seluruh berkas → Run. (DDL tidak bisa dijalankan dari VM:
-- anon key tidak bisa DDL, service_role key & DATABASE_URL tidak
-- tersedia di workspace — lihat ARSITEKTUR.md.)
-- Berkas ini IDEMPOTEN: do-block bersyarat untuk CHECK + INSERT
-- ... ON CONFLICT DO NOTHING — aman dijalankan ulang.
-- KETERGANTUNGAN: WAJIB jalankan migrasi v1–v11 DULU. Memakai:
-- pf_scheduled_jobs (v5) + CHECK namanya.
--
-- ISI (Tahap 13C — scheduler F6/F7):
--   §1  Perluas CHECK nama pf_scheduled_jobs: v5 hanya
--       mengizinkan 3 nama ('ingestion','editorial','brief').
--       Tanpa perluasan ini, seed 'data-analysis' +
--       'terbitkan-terjadwal' ditolak 23514 — lock server-side
--       Tahap 13C fail-open bila baris job tidak ada.
--   §2  Seed 5 job (idempoten): ingestion, editorial, brief,
--       data-analysis, terbitkan-terjadwal.
-- SEED: 5 baris pf_scheduled_jobs (2 baru, 3 sudah ada di v5).
-- JUMLAH: 0 tabel baru → total 54 tabel pf_*; policy tetap 106.
-- ============================================================

-- ============================================================
-- §1. Perluas CHECK nama pf_scheduled_jobs (F6/F7)
-- ============================================================
-- v5 membuat CHECK inline tanpa nama eksplisit (nama otomatis
-- Postgres, mis. pf_scheduled_jobs_nama_check) yang hanya
-- mengizinkan 3 nama. Do-block ini membuang CHECK lama itu
-- (yang definisinya menyebut 'ingestion', kecuali constraint
-- v12 sendiri agar idempoten) lalu menambah CHECK bernama
-- eksplisit dengan 5 nama. Aman diulang.
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.pf_scheduled_jobs'::regclass
      and contype = 'c'
      and conname <> 'pf_scheduled_jobs_nama_check_v12'
      and pg_get_constraintdef(oid) ilike '%ingestion%'
  loop
    execute 'alter table public.pf_scheduled_jobs drop constraint ' || quote_ident(r.conname);
  end loop;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_scheduled_jobs'::regclass
      and conname = 'pf_scheduled_jobs_nama_check_v12'
  ) then
    alter table public.pf_scheduled_jobs
      add constraint pf_scheduled_jobs_nama_check_v12
      check (nama in ('ingestion', 'editorial', 'brief', 'data-analysis', 'terbitkan-terjadwal'));
  end if;
end $$;

-- ============================================================
-- §2. Seed 5 job (F7 — pemicu manual + lock butuh baris ini)
-- ============================================================
insert into public.pf_scheduled_jobs (nama, jadwal_cron, deskripsi) values
  ('ingestion', '*/30 * * * *', 'Ingestion RSS + GDELT setiap 30 menit'),
  ('editorial', '0 0,6,12,18 * * *', 'Pipeline editorial AI setiap 6 jam'),
  ('brief', '0 22 * * *', 'Daily Brief harian 05.00 WIB'),
  ('data-analysis', '0 1 * * 1', 'Data Analysis mingguan Senin 08.00 WIB'),
  ('terbitkan-terjadwal', '0 * * * *', 'Terbitkan artikel terjadwal setiap jam')
on conflict (nama) do nothing;
