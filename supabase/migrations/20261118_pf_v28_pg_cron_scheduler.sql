-- ============================================================
-- PRATA FAKTA — Migrasi v28: Scheduler pg_cron + atribusi
--   pemicu 'pg_cron'
-- Berkas: 20261118_pf_v28_pg_cron_scheduler.sql
-- Tanggal: 2026-11-18
-- Alasan:
--   GitHub Actions sebagai satu-satunya scheduler TERBUKTI
--   tidak andal (SCHEDULER-DIAGNOSIS-V27.md §1: cron ingestion
--   */30 hanya 6 run sejak dibuat; pipeline terjadwal terakhir
--   12.18 WIB 17 Nov; tanya-jawab telat 7j42m). Opsi yang dipilih
--   pemilik (delegasi penuh 18 Nov 2026, "semuanya full kamu
--   eksekusi all"): pg_cron (+ pg_net) sebagai orchestrator
--   utama — Vercel Cron butuh paket Pro berbayar dan standar
--   pemilik adalah full gratis.
--   Verifikasi ketersediaan (18 Nov 2026, dari dokumentasi
--   resmi Supabase "Scheduling Edge Functions" + panduan
--   debugging pg_cron): platform Supabase yang di-host
--   mendukung ekstensi pg_cron + pg_net, dan secret panggilan
--   disimpan di Supabase Vault (pola resmi). Sumber sekunder
--   yang konsisten: pg_cron tersedia di paket gratis (tanpa
--   kartu); batas yang didokumentasikan: maks 32 job bersamaan
--   (disarankan <= 8), tiap job < 10 menit; proyek gratis yang
--   DIJEDA sesudah 7 hari tanpa aktivitas TIDAK menjalankan
--   job apa pun (lihat BATAS di bawah).
-- Isi:
--   §1. CHECK dipicu_oleh DILUASKAN: 'pg_cron' ditambahkan ke
--       pf_ingestion_runs + pf_ai_runs (nilai lama tetap).
--       TANPA ini, panggilan pg_cron akan DITOLAK database
--       (CHECK v3/v4 hanya mengizinkan manual/jadwal/
--       github_actions/cron_muse) — dan atribusi 'pg_cron' di
--       kode (route-auth.ts, ingestion route) tidak ada
--       gunanya. Relaksasi murni (tambah 1 nilai) — aman
--       mundur (lihat ROLLBACK).
--   §2. Ekstensi pg_cron + pg_net + supabase_vault.
--   §3. Fungsi pemanggil HTTP terjadwal
--       pf_panggil_endpoint_terjadwal (SECURITY DEFINER,
--       search_path dipatok, REVOKE dari PUBLIC): membaca
--       secret dari Vault lalu memanggil endpoint Vercel
--       lewat net.http_post. Secret TIDAK PERNAH tertulis di
--       cron.job (yang bisa dibaca) — hanya nama Vault-nya.
--   §4. Tiga job pg_cron (zona waktu UTC, bawaan pg_cron):
--       pf-ingestion-30mnt  */30 * * * *  -> POST
--         /api/ingestion/jalankan (secret PF_INGESTION_SECRET)
--       pf-pipeline-24mnt   */24 * * * *  -> POST
--         /api/ai/jalankan {limit:10} (secret PF_AI_SECRET)
--         = 5 panggilan per 2 jam, throughput SAMA dengan
--         workflow Actions (5 x 10 item) tapi diratakan —
--         lock 15 menit tidak pernah bertabrakan dengan jeda
--         24 menit, dan satu panggilan gagal tidak
--         menggagalkan yang lain (pola v27).
--       pf-tanya-jawab-harian  0 1 * * *   -> POST
--         /api/tanya/draf {limit:10} (secret PF_AI_SECRET)
--       Ketiganya mengirim header x-pf-pemicu: pg_cron agar
--       route mencatat dipicu_oleh='pg_cron' (bukan
--       'github_actions') — lihat route-auth.ts.
-- Sifat: ADDITIVE-ONLY, idempoten (do-block bersyarat /
--   IF NOT EXISTS / unschedule-bila-ada). Tidak menyentuh
--   data lama, tidak mengubah RLS/policy tabel apa pun,
--   tidak menambah tabel (jumlah tabel pf_* tetap 69).
-- KETERGANTUNGAN: WAJIB jalankan migrasi v1–v27 DULU
--   (v3/v4 membuat CHECK dipicu_oleh yang diluaskan §1).
-- PRASYARAT PENERAPAN (dilakukan PEMILIK di SQL Editor,
--   SEBELUM menjalankan berkas ini — nilai TIDAK ADA di
--   berkas ini dan TIDAK BOLEH ditulis di chat/berkas):
--   1. Ambil nilai PF_INGESTION_SECRET + PF_AI_SECRET dari
--      Vercel (Project Settings -> Environment Variables)
--      atau GitHub (Settings -> Secrets and variables ->
--      Actions) — keduanya SUDAH sama di kedua tempat sejak
--      17 Nov 2026 (PF_AI_SECRET dirotasi 18.00 WIB).
--   2. Buat secret Vault (sekali saja; idempoten — bila nama
--      sudah ada, hapus dulu lewat Dashboard -> Database ->
--      Vault, atau lewati bila yakin isinya masih benar):
--        select vault.create_secret('<NILAI PF_INGESTION_SECRET>', 'pf_ingestion_secret');
--        select vault.create_secret('<NILAI PF_AI_SECRET>', 'pf_ai_secret');
--      GANTI <...> dengan nilai asli. Bila secret Vault belum
--      dibuat, job akan gagal dengan pengecualian jelas
--      ("secret vault ... belum dibuat") — gagal berisik,
--      bukan diam-diam tanpa pemicu.
--   3. Bila `create extension` di §2 gagal karena skema
--      (Supabase kadang mengharuskan lewat Dashboard):
--      aktifkan pg_cron + pg_net + supabase_vault lewat
--      Dashboard -> Database -> Extensions, lalu jalankan
--      ulang berkas ini (§2 menjadi no-op).
-- BATAS YANG JUJUR (jangan diklaim lebih):
--   - pg_net bersifat FIRE-AND-FORGET: net.http_post hanya
--     mengantrekan permintaan dan mengembalikan request_id —
--     TIDAK menunggu respons, TIDAK retry. Bukti jalan/
--     gagalnya panggilan TETAP dibaca dari pf_scheduled_jobs
--     / pf_ingestion_runs / pf_ai_runs / pf_app_errors
--     (Reliability Center) — bukan dari cron.job.
--   - Proyek gratis yang DIJEDA (7 hari tanpa aktivitas)
--     TIDAK menjalankan job. Proyek 'prata' selama ini
--     dijaga tetap aktif oleh cron keepalive Muse tiap 72
--     jam + lalu lintas situs; bila keepalive itu mati,
--     pg_cron ikut mati — sama seperti Actions yang juga
--     butuh proyek aktif. Ini batas paket gratis, bukan
--     cacat migrasi.
--   - Secret yang didekripsi sempat tertulis di
--     net.http_request_queue sampai permintaan terkirim
--     (peringatan resmi Supabase) — hanya peran database
--     yang bisa membacanya; tidak terekspos ke publik.
--   - Selama masa transisi, GitHub Actions TETAP jalan
--     (fallback + pemicu manual). Dua pemicu yang memanggil
--     endpoint yang sama akan berebut lock yang SAMA
--     (klaimJob, 15 menit) — yang kalah mendapat 409 dan
--     itemnya tetap di antrean untuk pemicu berikut; TIDAK
--     ada duplikasi pemrosesan. RENCANA CUTOVER (butuh
--     otorisasi terpisah, JANGAN dilakukan bersamaan dengan
--     penerapan ini): sesudah pg_cron terverifikasi jalan
--     >= 48 jam (lihat verifikasi di bawah), hapus pemicu
--     `schedule:` dari ingestion.yml, editorial-pipeline.yml,
--     dan tanya-jawab-draf.yml (biarkan workflow_dispatch
--     untuk pemicu manual) — SATU orchestrator utama.
-- KOREKSI PREMIS (18 Nov 2026): dokumen KEPUTUSAN-TERBUKA-V27
--   §1 merekomendasikan migrasi v28 untuk menambahkan agen
--   'comparison' ke CHECK pf_ai_runs.agen — premis itu SALAH:
--   'comparison' SUDAH termasuk dalam 31 nilai CHECK v22
--   (20261117_pf_v22_global_intel.sql §1, diverifikasi dari
--   berkas migrasi + baterai uji-global-intel A7 yang
--   meng-insert 'comparison' dan diterima + komentar
--   src/lib/ai/pipeline.ts:20-38). Karena itu v28 TIDAK
--   memuat perubahan CHECK agen apa pun, dan pencatatan
--   comparison tetap fact_verification + detail.langkah
--   (tidak diubah). Bila suatu saat pencatatan harfiah
--   'comparison' diinginkan, CHECK-nya sudah mengizinkan
--   sejak v22 — tidak butuh migrasi baru.
-- KOREKSI §4 (18 Nov 2026, agen utama SEBELUM penerapan):
--   perintah job di §4 semula memakai $$...$$ DI DALAM do-block
--   $$...$$ — tag dollar yang sama menutup do-block lebih awal
--   ("syntax error at or near select", terbukti di PGlite).
--   Diperbaiki ke $job$...$job$ (dijaga baterai A11).
-- Verifikasi sesudah jalan (SQL Editor, terpisah):
--   -- (a) CHECK diluaskan (2 baris, masing-masing 5 nilai):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid in ('public.pf_ingestion_runs'::regclass,
--                        'public.pf_ai_runs'::regclass)
--       and conname like '%dipicu_oleh_check_v28';
--   -- (b) Fungsi ada + SECURITY DEFINER + search_path dipatok:
--   select proname, prosecdef, proconfig from pg_proc
--     where proname = 'pf_panggil_endpoint_terjadwal';
--   -- harus 1 baris, prosecdef true.
--   -- (c) Tiga job aktif:
--   select jobname, schedule, active from cron.job
--     where jobname like 'pf-%' order by jobname;
--   -- harus 3 baris, active true.
--   -- (d) Insert atribusi baru diterima, nilai liar ditolak:
--   insert into public.pf_ai_runs (agen, dipicu_oleh)
--     values ('fact_verification', 'pg_cron');
--   insert into public.pf_ingestion_runs (dipicu_oleh)
--     values ('pg_cron');
--   -- keduanya sukses; lalu HAPUS baris uji itu (bukan data
--   -- produksi) dan verifikasi nilai liar tetap ditolak:
--   insert into public.pf_ai_runs (agen, dipicu_oleh)
--     values ('fact_verification', 'nilai_liar');
--   -- harus gagal CHECK.
--   -- (e) Sesudah jadwal pertama lewat (>= 30 menit):
--   select * from cron.job_run_details
--     order by start_time desc limit 5;
--   select nama, status_terakhir, terakhir_jalan
--     from public.pf_scheduled_jobs
--     where nama in ('ingestion', 'editorial');
--   -- job_run_details membuktikan jadwal jalan; bukti
--   -- pemrosesan dibaca dari pf_ingestion_runs / pf_ai_runs
--   -- (dipicu_oleh = 'pg_cron').
-- ROLLBACK (hanya bila v28 harus dicabut; jalankan di SQL
--   Editor, urutan dibalik — SEMUA pernyataan aman diulang):
--   select cron.unschedule('pf-ingestion-30mnt');
--   select cron.unschedule('pf-pipeline-24mnt');
--   select cron.unschedule('pf-tanya-jawab-harian');
--   drop function if exists public.pf_panggil_endpoint_terjadwal(text, text, text, jsonb);
--   -- Kembalikan CHECK lama (4 nilai PERSIS — disalin dari
--   -- v3/v4): hanya bila TIDAK ADA baris dipicu_oleh =
--   -- 'pg_cron' (bila ada, hapus/ubah dulu — rollback tidak
--   -- boleh diam-diam membuat data tidak valid):
--   alter table public.pf_ingestion_runs drop constraint if exists pf_ingestion_runs_dipicu_oleh_check_v28;
--   alter table public.pf_ingestion_runs
--     add constraint pf_ingestion_runs_dipicu_oleh_check
--     check (dipicu_oleh in ('manual', 'jadwal', 'github_actions', 'cron_muse'));
--   alter table public.pf_ai_runs drop constraint if exists pf_ai_runs_dipicu_oleh_check_v28;
--   alter table public.pf_ai_runs
--     add constraint pf_ai_runs_dipicu_oleh_check
--     check (dipicu_oleh in ('manual', 'jadwal', 'github_actions', 'cron_muse'));
--   -- Ekstensi TIDAK di-drop (dipakai fitur lain / aman dibiarkan).
-- PENERAPAN: berkas ini HANYA ditulis + diuji di PGlite
--   (scripts/uji-migrasi-v28.mjs; §2–§4 butuh pg_cron/pg_net/
--   Vault sehingga di PGlite hanya diverifikasi statis +
--   §1 live). Penerapan ke produksi dilakukan agen utama
--   via browser SQL Editor sesudah otorisasi pemilik
--   (batas 18 Nov 2026: tanpa migrasi produksi tanpa
--   otorisasi eksplisit).
-- ============================================================

-- ============================================================
-- §1. CHECK dipicu_oleh: tambah 'pg_cron' (4 nilai -> 5 nilai)
-- ============================================================
-- CHECK lama berbentuk inline di CREATE TABLE (v3/v4) sehingga
-- namanya otomatis <tabel>_dipicu_oleh_check; do-block di bawah
-- TIDAK mengandalkan nama itu — ia mencari constraint yang
-- definisinya menyebut 'dipicu_oleh' lewat pg_constraint, lalu
-- membuangnya dan mengganti dengan constraint BERNAMA v28.
-- contype='c' WAJIB: tanpa itu, lookup bisa mengambil constraint
-- NOT NULL (definisinya juga menyebut 'dipicu_oleh') dan CHECK
-- lama tertinggal — 'pg_cron' tetap ditolak.
-- Idempoten: bila constraint v28 sudah ada, tidak ada yang
-- dilakukan (bila migrasi dijalankan ulang).
do $$
declare
  v_nama_lama text;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_ingestion_runs'::regclass
      and conname = 'pf_ingestion_runs_dipicu_oleh_check_v28'
  ) then
    return;
  end if;
  select conname into v_nama_lama from pg_constraint
    where conrelid = 'public.pf_ingestion_runs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%dipicu_oleh%'
    limit 1;
  if v_nama_lama is not null then
    execute format(
      'alter table public.pf_ingestion_runs drop constraint %I',
      v_nama_lama
    );
  end if;
  alter table public.pf_ingestion_runs
    add constraint pf_ingestion_runs_dipicu_oleh_check_v28
    check (dipicu_oleh in ('manual', 'jadwal', 'github_actions', 'cron_muse', 'pg_cron'));
end $$;

do $$
declare
  v_nama_lama text;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_ai_runs'::regclass
      and conname = 'pf_ai_runs_dipicu_oleh_check_v28'
  ) then
    return;
  end if;
  select conname into v_nama_lama from pg_constraint
    where conrelid = 'public.pf_ai_runs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%dipicu_oleh%'
    limit 1;
  if v_nama_lama is not null then
    execute format(
      'alter table public.pf_ai_runs drop constraint %I',
      v_nama_lama
    );
  end if;
  alter table public.pf_ai_runs
    add constraint pf_ai_runs_dipicu_oleh_check_v28
    check (dipicu_oleh in ('manual', 'jadwal', 'github_actions', 'cron_muse', 'pg_cron'));
end $$;

-- ============================================================
-- §2. Ekstensi pg_cron + pg_net + supabase_vault
-- ============================================================
-- No-op bila Dashboard sudah mengaktifkannya. Bila gagal
-- karena skema, aktifkan lewat Dashboard -> Database ->
-- Extensions lalu jalankan ulang berkas ini.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- ============================================================
-- §3. Fungsi pemanggil HTTP terjadwal (SECURITY DEFINER)
-- ============================================================
-- Membaca secret dari Vault (bukan dari cron.job) lalu POST
-- ke endpoint Vercel. Gagal BERISIK bila secret Vault belum
-- dibuat (pengecualian jelas) — job tidak jalan diam-diam
-- tanpa autentikasi. REVOKE dari PUBLIC: hanya peran yang
-- menjadwalkan job (postgres) yang boleh memanggilnya;
-- SECURITY DEFINER + search_path dipatok mengikuti pola repo
-- (v22 §3, RPC editorial lock).
create or replace function public.pf_panggil_endpoint_terjadwal(
  p_jalur text,
  p_header_secret text,
  p_nama_secret_vault text,
  p_body jsonb
) returns bigint
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = p_nama_secret_vault;
  if v_secret is null or v_secret = '' then
    raise exception 'secret vault % belum dibuat (lihat header migrasi v28 § PRASYARAT)', p_nama_secret_vault;
  end if;
  select net.http_post(
    url := 'https://prata-fakta.vercel.app' || p_jalur,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      p_header_secret, v_secret,
      'x-pf-pemicu', 'pg_cron'
    ),
    body := p_body
  ) into v_request_id;
  return v_request_id;
end;
$$;

revoke execute on function public.pf_panggil_endpoint_terjadwal(text, text, text, jsonb) from public;

-- ============================================================
-- §4. Tiga job pg_cron (UTC) — idempoten: unschedule dulu
--      bila nama sudah ada (mis. migrasi dijalankan ulang
--      sesudah jadwal diubah), lalu schedule ulang.
-- ============================================================
do $$
begin
  if exists (select 1 from cron.job where jobname = 'pf-ingestion-30mnt') then
    perform cron.unschedule('pf-ingestion-30mnt');
  end if;
  perform cron.schedule(
    'pf-ingestion-30mnt',
    '*/30 * * * *',
    $job$select public.pf_panggil_endpoint_terjadwal('/api/ingestion/jalankan', 'x-pf-ingestion-secret', 'pf_ingestion_secret', '{"dipicu_oleh":"pg_cron"}'::jsonb)$job$
  );
end $$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'pf-pipeline-24mnt') then
    perform cron.unschedule('pf-pipeline-24mnt');
  end if;
  perform cron.schedule(
    'pf-pipeline-24mnt',
    '*/24 * * * *',
    $job$select public.pf_panggil_endpoint_terjadwal('/api/ai/jalankan', 'x-pf-ai-secret', 'pf_ai_secret', '{"dipicu_oleh":"pg_cron","limit":10}'::jsonb)$job$
  );
end $$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'pf-tanya-jawab-harian') then
    perform cron.unschedule('pf-tanya-jawab-harian');
  end if;
  perform cron.schedule(
    'pf-tanya-jawab-harian',
    '0 1 * * *',
    $job$select public.pf_panggil_endpoint_terjadwal('/api/tanya/draf', 'x-pf-ai-secret', 'pf_ai_secret', '{"limit":10}'::jsonb)$job$
  );
end $$;
