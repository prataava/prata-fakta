-- ============================================================
-- PRATA FAKTA — Migrasi v29: Paket fitur (kutipan tanpa bukti,
--   Compare Perspectives (b), Daily Brief pagi, audit label)
-- Berkas: 20261118_pf_v29_paket_fitur.sql
-- Tanggal: 2026-11-18
-- Alasan:
--   (1) Run pipeline Actions #32 (11.46 WIB 18 Nov 2026) gagal
--       karena 3 item ditolak quality_check "kutipan_tanpa_bukti"
--       — dan karena status item tetap UNCONFIRMED sesudah
--       gagal, ketiganya akan dicoba lagi tiap run selamanya
--       tanpa pernah lolos. Butuh status terminal agar antrean
--       tidak tersumbat item yang tidak akan pernah lolos.
--   (2) Compare Perspectives opsi (b): label sikap manual
--       redaksi (mendukung/menentang/netral) per baris evidence
--       + siapa/kapan melabel + audit log aksinya.
--   (3) Daily Brief pagi 07.00 WIB: job pg_cron keempat yang
--       memanggil /api/ai/brief (artikel terbit 24 jam + push).
-- Isi:
--   §1. CHECK status_verifikasi + 'DITOLAK' (6 -> 7 nilai) di
--       pf_raw_items DAN pf_articles (keduanya memakai daftar
--       yang sama sejak v2/v3 — tetap disamakan; yang MENULIS
--       'DITOLAK' hanya pipeline ke pf_raw_items).
--   §2. Kolom pf_raw_items.qc_gagal_berturut_turut (int, default
--       0) — hitungan gagal quality_check berturut-turut; di 3
--       pipeline menandai status 'DITOLAK'.
--   §3. Kolom pf_evidence.dilabel_manual (bool, default false)
--       + dilabel_oleh (uuid -> auth.users) + dilabel_pada
--       (timestamptz) — transparansi label manual.
--   §4. Job pg_cron keempat pf-brief-harian: 0 0 * * * UTC
--       (= 07.00 WIB) -> POST /api/ai/brief
--       {"dari_artikel_terbit": true, "kirim_push": true}
--       (secret PF_AI_SECRET dari Vault, seperti 3 job v28).
--   §5. CHECK pf_audit_logs.aksi + 'evidence.label' (56 nilai
--       v15 + 1 = 57) — aksi audit untuk perubahan label sikap.
-- Sifat: ADDITIVE-ONLY, idempoten (do-block bersyarat /
--   IF NOT EXISTS / unschedule-bila-ada). Tidak menyentuh
--   data lama, tidak mengubah RLS/policy tabel apa pun,
--   tidak menambah tabel (jumlah tabel pf_* tetap 69).
-- KETERGANTUNGAN: WAJIB jalankan migrasi v1–v28 DULU, dan
--   kode v29 HARUS SUDAH LIVE di Vercel SEBELUM berkas ini
--   dijalankan (job §4 memanggil /api/ai/brief dengan body
--   baru; route label membaca kolom §3; pipeline menulis
--   kolom §2 + status §1 — kode lama tidak mengenalnya dan
--   akan gagal berisik bila kolom belum ada, sebaliknya kode
--   baru fail-open terhadap kolom yang belum ada).
-- PRASYARAT: secret Vault 'pf_ai_secret' SUDAH ADA sejak v28
--   (tidak ada secret baru).
-- BATAS YANG JUJUR:
--   - Job §4 bersifat FIRE-AND-FORGET seperti 3 job v28
--     (pg_net tidak menunggu respons); bukti jalan/gagal
--     dibaca dari pf_ai_runs (agen daily_brief,
--     dipicu_oleh='pg_cron') + pf_scheduled_jobs.
--   - INTERAKSI DENGAN WORKFLOW daily-brief.yml (Actions):
--     workflow itu memanggil /api/ai/brief tiap hari 22:00
--     UTC (= 05:00 WIB) dengan body TANPA flag v29 (mode lama:
--     draf + antrean, status 'draft'). Job §4 jalan 00:00 UTC
--     (= 07.00 WIB) — 2 jam SESUDAHNYA, jadi lock "brief"
--     (15 menit) tidak pernah bertabrakan. Urutan yang
--     terjadi tiap pagi: 05.00 WIB draft (Actions) -> 07.00
--     WIB brief terbit (pg_cron, upsert tanggal yang sama
--     menimpa draf 05.00). Bila job §4 gagal satu pagi, draf
--     05.00 tetap ada sebagai cadangan (editor bisa
--     menerbitkan manual). Bila editor sudah menerbitkan draf
--     05.00 sebelum 07.00, run 07.00 menimpa isinya dengan
--     versi terbit yang lebih segar (upsert per tanggal —
--     bukan duplikat, tapi isi berubah). Workflow Actions
--     TIDAK mengirim push (tanpa kirim_push) — push hanya
--     dari job §4. Keputusan cutover (hapus schedule:
--     daily-brief.yml) adalah PR terpisah sesudah pg_cron
--     terverifikasi >= 48 jam — BUKAN bagian migrasi ini.
-- Verifikasi sesudah jalan (SQL Editor, terpisah):
--   -- (a) CHECK status_verifikasi 7 nilai (2 baris):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conname like '%status_verifikasi_check_v29';
--   -- (b) Kolom baru ada + default benar:
--   select column_name, column_default from information_schema.columns
--     where table_name in ('pf_raw_items', 'pf_evidence')
--       and column_name in ('qc_gagal_berturut_turut',
--         'dilabel_manual', 'dilabel_oleh', 'dilabel_pada');
--   -- harus 4 baris.
--   -- (c) Insert 'DITOLAK' diterima, nilai liar ditolak:
--   insert into public.pf_raw_items (id, url, judul,
--     status_verifikasi) values (gen_random_uuid(),
--     'https://contoh.id/uji-v29', 'Uji v29', 'DITOLAK');
--   -- sukses; lalu HAPUS baris uji itu dan verifikasi:
--   insert into public.pf_raw_items (id, url, judul,
--     status_verifikasi) values (gen_random_uuid(),
--     'https://contoh.id/uji-v29', 'Uji v29', 'NILAI_LIAR');
--   -- harus gagal CHECK.
--   -- (d) Job keempat aktif:
--   select jobname, schedule, active from cron.job
--     where jobname like 'pf-%' order by jobname;
--   -- harus 4 baris, active true.
--   -- (e) Aksi audit baru diterima:
--   select count(*) from pg_constraint
--     where conname = 'pf_audit_logs_aksi_check_v29';
--   -- harus 1.
-- ROLLBACK (hanya bila v29 harus dicabut; urutan dibalik —
--   SEMUA pernyataan aman diulang):
--   select cron.unschedule('pf-brief-harian');
--   alter table public.pf_audit_logs
--     drop constraint if exists pf_audit_logs_aksi_check_v29;
--   -- (CHECK audit lama TIDAK dipulihkan otomatis — bila
--   --  perlu, jalankan ulang § CHECK v15 dari berkas
--   --  20261116_pf_v15_tahap_c.sql; tidak ada baris audit
--   --  'evidence.label' yang boleh tersisa sebelum itu.)
--   alter table public.pf_evidence
--     drop column if exists dilabel_pada,
--     drop column if exists dilabel_oleh,
--     drop column if exists dilabel_manual;
--   alter table public.pf_raw_items
--     drop column if exists qc_gagal_berturut_turut;
--   -- Kembalikan CHECK lama (6 nilai PERSIS dari v2/v3):
--   -- hanya bila TIDAK ADA baris status_verifikasi =
--   -- 'DITOLAK' (bila ada, ubah dulu ke 'UNCONFIRMED'):
--   alter table public.pf_raw_items
--     drop constraint if exists pf_raw_items_status_verifikasi_check_v29;
--   alter table public.pf_raw_items
--     add constraint pf_raw_items_status_verifikasi_check
--     check (status_verifikasi in ('VERIFIED', 'CROSS-CHECKED',
--       'DEVELOPING', 'UNCONFIRMED', 'DISPUTED', 'CORRECTED'));
--   alter table public.pf_articles
--     drop constraint if exists pf_articles_status_verifikasi_check_v29;
--   alter table public.pf_articles
--     add constraint pf_articles_status_verifikasi_check
--     check (status_verifikasi in ('VERIFIED', 'CROSS-CHECKED',
--       'DEVELOPING', 'UNCONFIRMED', 'DISPUTED', 'CORRECTED'));
-- PENERAPAN: berkas ini HANYA ditulis + diuji di PGlite
--   (scripts/uji-migrasi-v29.mjs; §4 butuh pg_cron/pg_net/
--   Vault sehingga di PGlite hanya diverifikasi statis).
--   Penerapan ke produksi dilakukan agen utama via browser
--   SQL Editor sesudah otorisasi pemilik (batas 18 Nov 2026:
--   tanpa migrasi produksi tanpa otorisasi eksplisit).
-- ============================================================

-- ============================================================
-- §1. CHECK status_verifikasi: tambah 'DITOLAK' (6 -> 7 nilai)
-- ============================================================
-- 'DITOLAK' = item gagal quality_check 3x berturut-turut
-- (pipeline menulisnya lewat catatGagalQualityCheck).
-- Nilai terminal: ambilAntrean hanya mengambil
-- status_verifikasi='UNCONFIRMED', jadi item 'DITOLAK'
-- otomatis tidak diklaim lagi. 'DEVELOPING'/'DISPUTED'
-- TIDAK dipakai ulang — artinya beda (sedang diverifikasi /
-- disengketakan) dan mengubah artinya diam-diam dilarang.
-- Pola do-block mengikuti v28 §1: cari constraint CHECK
-- lama yang definisinya menyebut 'status_verifikasi'
-- (contype='c' WAJIB agar tidak mengambil constraint NOT
-- NULL), buang, ganti dengan constraint BERNAMA v29.
-- Idempoten: bila constraint v29 sudah ada, lewati.
do $$
declare
  v_nama_lama text;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_raw_items'::regclass
      and conname = 'pf_raw_items_status_verifikasi_check_v29'
  ) then
    return;
  end if;
  select conname into v_nama_lama from pg_constraint
    where conrelid = 'public.pf_raw_items'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status_verifikasi%'
    limit 1;
  if v_nama_lama is not null then
    execute format(
      'alter table public.pf_raw_items drop constraint %I',
      v_nama_lama
    );
  end if;
  alter table public.pf_raw_items
    add constraint pf_raw_items_status_verifikasi_check_v29
    check (status_verifikasi in ('VERIFIED', 'CROSS-CHECKED', 'DEVELOPING', 'UNCONFIRMED', 'DISPUTED', 'CORRECTED', 'DITOLAK'));
end $$;

do $$
declare
  v_nama_lama text;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_articles'::regclass
      and conname = 'pf_articles_status_verifikasi_check_v29'
  ) then
    return;
  end if;
  select conname into v_nama_lama from pg_constraint
    where conrelid = 'public.pf_articles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status_verifikasi%'
    limit 1;
  if v_nama_lama is not null then
    execute format(
      'alter table public.pf_articles drop constraint %I',
      v_nama_lama
    );
  end if;
  alter table public.pf_articles
    add constraint pf_articles_status_verifikasi_check_v29
    check (status_verifikasi in ('VERIFIED', 'CROSS-CHECKED', 'DEVELOPING', 'UNCONFIRMED', 'DISPUTED', 'CORRECTED', 'DITOLAK'));
end $$;

-- ============================================================
-- §2. Kolom pf_raw_items.qc_gagal_berturut_turut
-- ============================================================
alter table public.pf_raw_items
  add column if not exists qc_gagal_berturut_turut integer not null default 0;

-- ============================================================
-- §3. Kolom label manual pf_evidence
-- ============================================================
-- dilabel_manual: true bila arah ditulis/diperbarui lewat
-- /admin/label-sikap (bukan pipeline). dilabel_oleh/pada:
-- siapa + kapan (transparansi; dilabel_oleh merujuk
-- auth.users, on delete set null — akun yang dihapus tidak
-- menghapus jejak labelnya).
alter table public.pf_evidence
  add column if not exists dilabel_manual boolean not null default false;
alter table public.pf_evidence
  add column if not exists dilabel_oleh uuid references auth.users (id) on delete set null;
alter table public.pf_evidence
  add column if not exists dilabel_pada timestamptz;

-- ============================================================
-- §4. Job pg_cron keempat: Daily Brief pagi 07.00 WIB
-- ============================================================
-- 0 0 * * * UTC = 07.00 WIB. Memanggil /api/ai/brief dengan
-- body {"dari_artikel_terbit": true, "kirim_push": true}:
-- brief dibangun HANYA dari artikel terbit 24 jam terakhir,
-- diterbitkan langsung (semua entri sudah terbit), lalu
-- broadcast push ke semua langganan (Notification
-- Intelligence v27 berlaku — preferensi + cap + retry).
-- Bila 0 artikel terbit 24 jam terakhir: brief disimpan
-- sebagai draf, tanpa terbit, tanpa push (dicatat di detail
-- run daily_brief). Secret PF_AI_SECRET dari Vault
-- 'pf_ai_secret' (sudah ada sejak v28) — TIDAK ADA secret
-- baru. Tag $job$ (pelajaran v28 §4: JANGAN nested $$ di
-- dalam do-block $$).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'pf-brief-harian') then
    perform cron.unschedule('pf-brief-harian');
  end if;
  perform cron.schedule(
    'pf-brief-harian',
    '0 0 * * *',
    $job$select public.pf_panggil_endpoint_terjadwal('/api/ai/brief', 'x-pf-ai-secret', 'pf_ai_secret', '{"dari_artikel_terbit":true,"kirim_push":true}'::jsonb)$job$
  );
end $$;

-- ============================================================
-- §5. CHECK pf_audit_logs.aksi: tambah 'evidence.label'
-- ============================================================
-- Pola v11/v14/v15: bila constraint v29 sudah ada, lewati;
-- bila belum, buang CHECK lama yang menyebut kolom aksi,
-- lalu tambah CHECK baru bernama eksplisit dengan 57 aksi
-- (56 dari v15 + 'evidence.label' — disalin PERSIS dari
-- 20261116_pf_v15_tahap_c.sql § CHECK, ditambah 1).
-- Aman diulang.
do $$
declare
  r record;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_audit_logs'::regclass
      and conname = 'pf_audit_logs_aksi_check_v29'
  ) then
    return;
  end if;
  for r in
    select conname from pg_constraint
    where conrelid = 'public.pf_audit_logs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%aksi%'
  loop
    execute 'alter table public.pf_audit_logs drop constraint ' || quote_ident(r.conname);
  end loop;
  alter table public.pf_audit_logs
    add constraint pf_audit_logs_aksi_check_v29
    check (aksi in (
      'artikel.buat', 'artikel.ubah', 'artikel.hapus', 'artikel.terbit', 'artikel.batal_terbit', 'artikel.jadwalkan',
      'review.setuju', 'review.tolak', 'review.kembalikan',
      'verifikasi.ubah', 'koreksi.terima', 'koreksi.tolak', 'koreksi.ditinjau',
      'pengguna.role', 'pengguna.nonaktif', 'pengguna.aktifkan',
      'sistem.job', 'sistem.kategori', 'brief.terbit',
      'cerita.buat', 'cerita.ubah', 'cerita.hapus',
      'pengetahuan.buat', 'pengetahuan.ubah', 'pengetahuan.hapus',
      'event.buat', 'event.ubah', 'event.hapus',
      'data.indikator', 'data.titik',
      'riset.buat', 'riset.ubah', 'riset.hapus',
      'negara.buat', 'negara.ubah', 'negara.hapus',
      'tanya.jawab',
      'akademi.kursus', 'akademi.modul', 'akademi.progres',
      'akademi.soal.buat', 'akademi.sertifikat.cabut',
      'podcast.episode', 'podcast.terbit',
      'sistem.flag', 'sistem.pengumuman',
      'kuis.buat', 'kuis.ubah',
      'preferensi.ubah', 'ekspor.data',
      'sumber.buat', 'sumber.ubah', 'sumber.hapus', 'sumber.cek', 'sumber.aktif',
      'akun.hapus.minta', 'akun.hapus', 'akun.hapus.gagal', 'data.hapus',
      'evidence.label'
    ));
end $$;
