-- ============================================================
-- PRATA FAKTA — Migrasi v22: Global News — fondasi ingestion
--   (Fase 3 RENCANA-GLOBAL-NEWS.md butir 1, 5, 7, 8)
-- Berkas: 20261117_pf_v22_global_intel.sql
-- Tanggal: 2026-11-17
-- Alasan:
--   (1) CHECK pf_ai_runs.agen v8 MENOLAK agen 'comparison'
--       (dan semua agen pipeline Fase 9) — v20 tidak pernah
--       dibuat karena itu (lihat MEMORY.md 17 Nov 2026).
--       v22 memperluas daftar menjadi 31 nilai agar pipeline
--       ingestion → clustering → comparison → synthesis bisa
--       mencatat langkahnya di pf_ai_runs.
--   (2) Tabel pf_article_comparisons: hasil perbandingan
--       multi-sumber per artikel (fakta bersama, perbedaan
--       framing, perspektif yang dihilangkan, matriks sumber,
--       indeks netralitas) — bahan fitur Compare Perspectives
--       (AUDIT-EKSPANSI-V3: MISSING).
--   (3) Tabel pf_editorial_locks + 2 RPC: kunci terdistribusi
--       antar worker (scheduler / ingestion / editorial) agar
--       dua worker tidak mengolah sumber/klaster yang sama
--       bersamaan (Fase 5 scheduler + lock).
--   (4) pf_articles.dedup_fingerprint: kunci dedup artikel
--       (Fase 3 butir 8 — GUID RSS sebagai kunci dedup
--       tambahan; hash sha256 dari GUID/URL ternormalisasi).
--   (5) pf_sources: kolom kesehatan + polling per-sumber
--       (Fase 3 butir 1 — cooldown 429, circuit breaker,
--       conditional GET, checkpoint).
--   (6) pf_ingestion_runs.kelas_gagal: klasifikasi galat per
--       run (Fase 3 butir 5 — rate-limited / unavailable /
--       invalid-feed / permanently-failed / disabled /
--       dilewati; NULL = tidak ada kegagalan).
-- Sifat: ADDITIVE-ONLY, idempoten (IF NOT EXISTS / do-block
--   bersyarat / DROP POLICY IF EXISTS). Tidak menyentuh data
--   lama, tidak mengubah RLS/policy tabel lain. KETERGANTUNGAN:
--   WAJIB jalankan migrasi v1–v21 DULU (v8 membuat constraint
--   pf_ai_runs_agen_check_v8 yang diganti §1; v1 membuat
--   pf_has_role/pf_is_super_admin yang dipakai policy §2;
--   v2/v3 membuat pf_articles/pf_sources/pf_ingestion_runs).
--   v20 TIDAK ADA — penomoran melompat v19 → v21 → v22.
-- CATATAN KEAMANAN RPC (§3): pola repo untuk RPC SECURITY
--   DEFINER (v11 pf_rate_limit_check, v9 pf_akar_salinan)
--   adalah REVOKE EXECUTE FROM PUBLIC + GRANT EXECUTE ke
--   anon + authenticated — karena RPC itu dipanggil dari
--   route API yang menghadap publik. Lock editorial BUKAN
--   RPC publik: hanya worker server-side (service_role /
--   cron terautentikasi) yang boleh mengakuisisi lock, jadi
--   v22 SENGAJA menyimpang: REVOKE dari PUBLIC, GRANT hanya
--   ke authenticated + service_role, anon TIDAK diberi hak
--   (anon yang memanggil RPC akan ditolak 42501). Tabel
--   pf_editorial_locks sendiri: RLS aktif TANPA policy +
--   REVOKE ALL dari anon/authenticated (pola v11 §1 untuk
--   pf_rate_limits) — satu-satunya jalan masuk adalah RPC.
-- Verifikasi sesudah jalan (SQL Editor, terpisah):
--   -- (a) CHECK baru ada, CHECK lama hilang:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.pf_ai_runs'::regclass
--       and conname like 'pf_ai_runs_agen_check%';
--   -- harus 1 baris: pf_ai_runs_agen_check_v22 (31 nilai).
--   -- (b) Kolom baru ada:
--   select table_name, column_name, data_type, column_default
--     from information_schema.columns
--     where table_schema = 'public'
--       and ((table_name = 'pf_sources' and column_name in
--         ('poll_interval_minutes','etag','last_modified',
--          'failure_count','cooldown_until','health_status',
--          'last_success_at'))
--        or (table_name = 'pf_articles' and column_name =
--          'dedup_fingerprint')
--        or (table_name = 'pf_ingestion_runs' and column_name =
--          'kelas_gagal'))
--     order by table_name, column_name;
--   -- harus 9 baris (7 + 1 + 1).
--   -- (c) RLS + policy tabel baru:
--   select tablename, rowsecurity from pg_tables
--     where schemaname = 'public'
--       and tablename in ('pf_article_comparisons',
--       'pf_editorial_locks');
--   -- harus 2 baris, rowsecurity true.
--   select tablename, count(*) from pg_policies
--     where schemaname = 'public'
--       and tablename in ('pf_article_comparisons',
--       'pf_editorial_locks')
--     group by tablename;
--   -- harus 1 baris: pf_article_comparisons 2 policy;
--   -- pf_editorial_locks 0 policy (deny-all, by design).
--   -- (d) Indeks:
--   select indexname from pg_indexes
--     where schemaname = 'public'
--       and indexname in ('pf_articles_dedup_fingerprint_idx',
--       'pf_article_comparisons_article_idx',
--       'pf_article_comparisons_topic_idx',
--       'pf_editorial_locks_expires_idx');
--   -- harus 4 baris.
--   -- (e) RPC ada + SECURITY DEFINER + search_path dipatok:
--   select proname, prosecdef, proconfig
--     from pg_proc where proname in ('acquire_editorial_lock',
--     'release_editorial_lock');
--   -- harus 2 baris, prosecdef true, proconfig {search_path=public}.
-- ROLLBACK (hanya bila v22 harus dicabut; jalankan di SQL
--   Editor, urutan dibalik — SEMUA pernyataan aman diulang
--   karena memakai IF EXISTS):
--   drop function if exists public.release_editorial_lock(text, text);
--   drop function if exists public.acquire_editorial_lock(text, text, integer);
--   drop table if exists public.pf_editorial_locks;
--   drop table if exists public.pf_article_comparisons;
--   drop index if exists public.pf_articles_dedup_fingerprint_idx;
--   alter table public.pf_articles drop column if exists dedup_fingerprint;
--   alter table public.pf_sources
--     drop column if exists poll_interval_minutes,
--     drop column if exists etag,
--     drop column if exists last_modified,
--     drop column if exists failure_count,
--     drop column if exists cooldown_until,
--     drop column if exists health_status,
--     drop column if exists last_success_at;
--   alter table public.pf_ingestion_runs drop column if exists kelas_gagal;
--   -- Kembalikan CHECK lama (13 nilai v8 PERSIS — disalin dari
--   -- 20261116_pf_v8_expansion.sql §5c):
--   alter table public.pf_ai_runs drop constraint if exists pf_ai_runs_agen_check_v22;
--   alter table public.pf_ai_runs
--     add constraint pf_ai_runs_agen_check_v8
--     check (agen in (
--       'research', 'source_analysis', 'fact_verification', 'summarization',
--       'article_writing', 'translation', 'trend_analysis', 'daily_brief',
--       'data_analysis', 'editorial_quality',
--       'story_clustering', 'podcast_script', 'research_synthesis'
--     ));
--   PERINGATAN ROLLBACK: bila sesudah v22 sudah ada baris
--   pf_ai_runs dengan agen baru (mis. 'comparison'), ADD
--   CHECK v8 di atas GAGAL sampai baris itu dihapus/diubah —
--   itu disengaja (rollback tidak boleh diam-diam membuat
--   data tidak valid).
-- PENERAPAN: berkas ini HANYA ditulis + diuji di PGlite
--   (scripts/uji-migrasi-v22.mjs). Penerapan ke produksi
--   dilakukan agen utama via browser SQL Editor sesudah
--   verifikasi ulang (persetujuan pemilik 17 Nov 2026
--   11.57 WIB, jawaban "SEMUANYA").
-- ============================================================

-- ============================================================
-- §1. Perluasan CHECK pf_ai_runs.agen: 13 nilai v8 → 31 nilai
-- ============================================================
-- HANYA constraint bernama persis pf_ai_runs_agen_check_v8
-- yang dibuang (do-block memeriksa pg_constraint dulu — bila
-- constraint v8 tidak ada, mis. v22 sudah jalan, tidak ada
-- yang dibuang). Constraint baru bernama pf_ai_runs_agen_check_v22
-- mengikuti konvensi penamaan ulang v9 §6 / v11 §3.
-- 13 nilai lama (v8 §5c, disalin PERSIS):
--   research, source_analysis, fact_verification, summarization,
--   article_writing, translation, trend_analysis, daily_brief,
--   data_analysis, editorial_quality,
--   story_clustering, podcast_script, research_synthesis.
-- 16 nilai baru (tugas Fase 3 + pipeline Fase 9):
--   ingestion, normalization, clustering, comparison, synthesis,
--   geopolitical_risk, entity_graph, fact_scoring, editorial_qa,
--   archival, collector, fact_checker, writer, editor, verifier,
--   intelligence.
-- 2 nilai baru (tambahan pemilik 17 Nov 2026 11.57 WIB, modul
--   pipeline Fase 9 Worker H — quality_check + analysis):
--   quality_check, analysis.
-- DEDUP: tidak satu pun dari 18 nilai baru yang sudah ada di
--   13 nilai lama ('translation' sudah ada di 13 — dan TIDAK
--   ditulis ulang di daftar baru; 'clustering' ≠
--   'story_clustering', 'synthesis' ≠ 'research_synthesis',
--   'analysis' ≠ 'data_analysis'). Total 13 + 16 + 2 = 31.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_ai_runs'::regclass
      and conname = 'pf_ai_runs_agen_check_v22'
  ) then
    return;
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_ai_runs'::regclass
      and conname = 'pf_ai_runs_agen_check_v8'
  ) then
    alter table public.pf_ai_runs drop constraint pf_ai_runs_agen_check_v8;
  end if;
  alter table public.pf_ai_runs
    add constraint pf_ai_runs_agen_check_v22
    check (agen in (
      'research', 'source_analysis', 'fact_verification', 'summarization',
      'article_writing', 'translation', 'trend_analysis', 'daily_brief',
      'data_analysis', 'editorial_quality',
      'story_clustering', 'podcast_script', 'research_synthesis',
      'ingestion', 'normalization', 'clustering', 'comparison', 'synthesis',
      'geopolitical_risk', 'entity_graph', 'fact_scoring', 'editorial_qa',
      'archival', 'collector', 'fact_checker', 'writer', 'editor',
      'verifier', 'intelligence',
      'quality_check', 'analysis'
    ));
end $$;

-- ============================================================
-- §2. Tabel baru pf_article_comparisons
-- ============================================================
-- Satu baris = satu perbandingan multi-sumber untuk satu
-- artikel (artikel hasil sintesis dari beberapa sumber).
-- common_facts: fakta yang disepakati semua sumber.
-- framing_differences: perbedaan cara sumber membingkai topik.
-- omitted_perspectives: sudut pandang yang dihilangkan sebagian
--   sumber. source_matrix: matriks sumber × klaim (siapa
--   menyebut apa). neutrality_index: 0–100, default 85.00
--   (angka awal konservatif; rumus resmi diputuskan editor —
--   lihat AUDIT-EKSPANSI-V3 soal FACT SCORE).
create table if not exists public.pf_article_comparisons (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.pf_articles (id) on delete cascade,
  cluster_id uuid,
  topic_slug text not null,
  common_facts jsonb not null default '[]',
  framing_differences jsonb not null default '[]',
  omitted_perspectives jsonb not null default '[]',
  source_matrix jsonb not null default '[]',
  neutrality_index numeric(5,2) default 85.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pf_article_comparisons is
  'Perbandingan multi-sumber per artikel (v22, Fase 3).
   updated_at dirawat penulis (API/worker) — tanpa trigger
   karena pf_set_updated_at() v1 hanya mengenal kolom
   diperbarui_pada, bukan updated_at.';
comment on column public.pf_article_comparisons.neutrality_index is
  'Indeks netralitas 0–100 (v22). Default 85.00 — angka awal
   konservatif; rumus resmi diputuskan editor.';
comment on column public.pf_article_comparisons.cluster_id is
  'Klaster discovery Fase 7 (v22: NULL sampai klaster dibuat).';

create index if not exists pf_article_comparisons_article_idx
  on public.pf_article_comparisons (article_id);
create index if not exists pf_article_comparisons_topic_idx
  on public.pf_article_comparisons (topic_slug);

-- RLS + policy: pola persis pf_article_sources v8 §2c —
-- baca publik HANYA bila artikelnya terbit, ATAU staf.
alter table public.pf_article_comparisons enable row level security;

drop policy if exists "pf_article_comparisons baca terbit atau staf" on public.pf_article_comparisons;
create policy "pf_article_comparisons baca terbit atau staf"
  on public.pf_article_comparisons for select using (
    exists (
      select 1 from public.pf_articles a
      where a.id = article_id and a.status = 'terbit'
    )
    or public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('writer')
    or public.pf_has_role('fact_checker')
  );

-- Tulis: super_admin saja. service_role tidak butuh policy
-- (melewati RLS); worker ingestion/editorial memakai service
-- role atau akun super_admin.
drop policy if exists "pf_article_comparisons tulis super_admin" on public.pf_article_comparisons;
create policy "pf_article_comparisons tulis super_admin"
  on public.pf_article_comparisons for all
  using (public.pf_is_super_admin())
  with check (public.pf_is_super_admin());

-- GRANT eksplisit (pola v9: grant per tabel, bukan "all
-- tables" — tabel baru tidak tercakup grant v9 yang sudah
-- jalan). RLS tetap penegak baris; grant hanya membuka
-- gerbang tabel — anon yang menulis tetap ditolak policy
-- tulis super_admin.
grant select, insert, update, delete on public.pf_article_comparisons
  to anon, authenticated;

-- ============================================================
-- §3. Tabel pf_editorial_locks + RPC acquire/release
-- ============================================================
-- Kunci terdistribusi antar worker (Fase 5): satu baris per
-- kunci ('ingestion:<sumber>' / 'cluster:<id>' /
-- 'editorial:<artikel_id>' — format kunci diputuskan pemanggil,
-- bukan CHECK, agar worker baru tidak terkunci skema).
-- Lock kedaluwarsa otomatis (default 15 menit) agar worker
-- yang mati tidak mengunci selamanya; RPC acquire membersihkan
-- yang kedaluwarsa secara atomik sebelum mencoba.
create table if not exists public.pf_editorial_locks (
  lock_key text primary key,
  worker_id text not null,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  metadata jsonb not null default '{}'
);

comment on table public.pf_editorial_locks is
  'Kunci editorial antar worker (v22, Fase 5). Ditulis HANYA
   oleh RPC acquire/release_editorial_lock; akses langsung
   ditolak (tanpa policy + REVOKE ALL, pola v11 §1).';

create index if not exists pf_editorial_locks_expires_idx
  on public.pf_editorial_locks (expires_at);

alter table public.pf_editorial_locks enable row level security;

-- TANPA policy sama sekali: SELECT/INSERT/UPDATE/DELETE
-- langsung dari anon/authenticated DITOLAK. Satu-satunya jalan
-- masuk adalah RPC SECURITY DEFINER di bawah (bypass RLS
-- sebagai pemilik fungsi). GRANT eksplisit sejak awal
-- (pelajaran F4): cabut akses langsung yang mungkin ada,
-- jangan andalkan default.
revoke all on table public.pf_editorial_locks from anon, authenticated;

-- ---------- RPC acquire_editorial_lock ----------
-- Mengembalikan true bila lock berhasil diambil (baris baru
-- disisipkan), false bila kunci masih dipegang worker lain
-- (atau argumen tidak valid — fail-closed). Lock yang sudah
-- kedaluwarsa dibersihkan dulu di pernyataan yang sama
-- sehingga bisa langsung diambil alih. TTL default 600 detik
-- (10 menit); expires_at default kolom (15 menit) hanya
-- berlaku bila baris disisipkan langsung (bukan lewat RPC).
-- ON CONFLICT DO NOTHING + FOUND: INSERT yang bertabrakan
-- tidak menimpa pemilik lama, dan FOUND membedakan "baru
-- disisipkan" (true) dari "tabrakan" (false). Pemilik yang
-- sama yang memanggil ulang selagi lock masih hidup mendapat
-- false — perpanjang lock dengan release + acquire, bukan
-- acquire ulang (disengaja: memaksa worker menyatakan
-- kepemilikan ulang secara eksplisit).
create or replace function public.acquire_editorial_lock(
  p_lock_key text,
  p_worker_id text,
  p_ttl_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sekarang timestamptz := now();
  v_baru boolean := false;
begin
  if p_lock_key is null or btrim(p_lock_key) = ''
     or p_worker_id is null or btrim(p_worker_id) = ''
     or p_ttl_seconds < 1 then
    return false;
  end if;

  -- Bersihkan lock kedaluwarsa (oportunistik, di tiap
  -- panggilan) agar tabel tidak tumbuh tanpa batas.
  delete from public.pf_editorial_locks
  where expires_at <= v_sekarang;

  insert into public.pf_editorial_locks (lock_key, worker_id, locked_at, expires_at)
  values (p_lock_key, p_worker_id, v_sekarang,
          v_sekarang + (p_ttl_seconds || ' seconds')::interval)
  on conflict (lock_key) do nothing;

  v_baru := found;
  return v_baru;
end;
$$;

-- ---------- RPC release_editorial_lock ----------
-- Melepas lock HANYA bila pemanggil adalah pemiliknya
-- (worker_id cocok). Worker lain tidak bisa melepas lock
-- orang lain — salah lepas diam-diam adalah bug yang
-- menghilangkan perlindungan. Tidak ada baris / bukan pemilik
-- → tidak ada yang dihapus, tanpa galat (idempoten).
create or replace function public.release_editorial_lock(
  p_lock_key text,
  p_worker_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.pf_editorial_locks
  where lock_key = p_lock_key and worker_id = p_worker_id;
end;
$$;

-- GRANT RPC: pola repo REVOKE FROM PUBLIC (v11 §2, v9 §5),
-- tetapi GRANT hanya ke authenticated + service_role — anon
-- SENGAJA tidak diberi (lihat catatan keamanan di header).
revoke execute on function public.acquire_editorial_lock(text, text, integer) from public;
grant execute on function public.acquire_editorial_lock(text, text, integer) to authenticated, service_role;
revoke execute on function public.release_editorial_lock(text, text) from public;
grant execute on function public.release_editorial_lock(text, text) to authenticated, service_role;

-- ============================================================
-- §4. pf_articles.dedup_fingerprint + indeks unik parsial
-- ============================================================
-- Fingerprint dedup artikel (Fase 3 butir 8): hash sha256 dari
-- GUID/URL ternormalisasi item mentah asal (diisi engine
-- ingestion; NULL = belum dihitung — artikel lama / artikel
-- tulis manual). Indeks unik PARSIAL: dua artikel boleh sama-
-- sama NULL, tetapi dua fingerprint non-NULL yang sama
-- ditolak — pola yang sama dengan pf_notifications v14
-- (kunci_dedup). Bila kolom/indeks sudah ada (mis. migrasi
-- lain mendahului), ALTER/indeks adalah NO-OP.
alter table public.pf_articles
  add column if not exists dedup_fingerprint text;

comment on column public.pf_articles.dedup_fingerprint is
  'Fingerprint dedup artikel (v22, Fase 3 butir 8): hash sha256
   dari GUID/URL ternormalisasi item mentah asal. NULL = belum
   dihitung.';

create unique index if not exists pf_articles_dedup_fingerprint_idx
  on public.pf_articles (dedup_fingerprint)
  where dedup_fingerprint is not null;

-- ============================================================
-- §5. pf_sources: kolom kesehatan + polling per-sumber
-- ============================================================
-- RENCANA-GLOBAL-NEWS.md Fase 3 butir 1 (disalin PERSIS):
--   poll_interval_minutes int (default 30),
--   etag text, last_modified timestamptz,
--   failure_count int (default 0), cooldown_until timestamptz,
--   health_status text (CHECK sehat/peringatan/gagal/basi/
--   belum_pernah, default belum_pernah), last_success_at
--   timestamptz.
-- health_status 'basi' = sumber sehat tetapi tidak ada item
-- baru terlalu lama (diputuskan engine, bukan CHECK — ambang
-- waktunya milik konfigurasi, bukan skema).
alter table public.pf_sources
  add column if not exists poll_interval_minutes integer not null default 30;
alter table public.pf_sources
  add column if not exists etag text;
alter table public.pf_sources
  add column if not exists last_modified timestamptz;
alter table public.pf_sources
  add column if not exists failure_count integer not null default 0;
alter table public.pf_sources
  add column if not exists cooldown_until timestamptz;
alter table public.pf_sources
  add column if not exists health_status text not null default 'belum_pernah'
    check (health_status in ('sehat', 'peringatan', 'gagal', 'basi', 'belum_pernah'));
alter table public.pf_sources
  add column if not exists last_success_at timestamptz;

comment on column public.pf_sources.poll_interval_minutes is
  'Interval polling per-sumber dalam menit (v22, Fase 3 butir 1).
   Default 30; sumber lambat (mis. BBC) boleh dijarangkan.';
comment on column public.pf_sources.failure_count is
  'Jumlah gagal beruntun (v22). Naik tiap gagal, reset tiap
   sukses; >=3 → circuit breaker melewati sumber (Fase 3
   butir 3).';
comment on column public.pf_sources.cooldown_until is
  'Sumber dilewati engine sampai waktu ini (v22). Diisi dari
   Retry-After sesudah 429 (min. 30 menit, maks. 6 jam —
   Fase 3 butir 2).';
comment on column public.pf_sources.health_status is
  'Kesehatan sumber (v22): sehat / peringatan / gagal / basi /
   belum_pernah.';
comment on column public.pf_sources.etag is
  'ETag terakhir sumber untuk conditional GET (v22, Fase 3
   butir 7): dikirim sebagai If-None-Match; 304 = tanpa item
   baru.';
comment on column public.pf_sources.last_modified is
  'Last-Modified terakhir sumber untuk conditional GET (v22,
   Fase 3 butir 7): dikirim sebagai If-Modified-Since.';

-- ============================================================
-- §6. pf_ingestion_runs.kelas_gagal
-- ============================================================
-- Kolom `status` SUDAH ADA sejak v3 (nilai: berjalan / selesai
-- / gagal / sebagian) — v22 TIDAK mengubahnya. Kolom baru
-- kelas_gagal menyimpan klasifikasi galat (Fase 3 butir 5):
--   rate-limited / unavailable / invalid-feed /
--   permanently-failed / disabled / dilewati.
-- NULL = tidak ada kegagalan (run sukses) atau belum
-- diklasifikasi (run lama). Sengaja TANPA CHECK: kosakata
-- kelas boleh bertambah tanpa migrasi baru; engine yang
-- menegakkan kosakatanya (Fase 3 butir 5–6).
alter table public.pf_ingestion_runs
  add column if not exists kelas_gagal text;

comment on column public.pf_ingestion_runs.kelas_gagal is
  'Kelas kegagalan run (v22, Fase 3 butir 5): rate-limited /
   unavailable / invalid-feed / permanently-failed / disabled /
   dilewati. NULL = sukses / belum diklasifikasi. Tanpa CHECK —
   kosakata ditegakkan engine.';
