-- ============================================================
-- PRATA FAKTA — Migrasi Fase 4 (AI Editorial: run, klaim,
-- bukti, catatan verifikasi, brief harian)
-- Berkas: 20261116_pf_v4_ai.sql
-- Proyek Supabase: 'prata' (dipakai bersama PRATA & TASIK JAYA)
-- Cara menjalankan: Supabase Dashboard → SQL Editor → tempel
-- seluruh berkas → Run. (DDL tidak bisa dijalankan dari VM:
-- anon key tidak bisa DDL, service_role key & DATABASE_URL tidak
-- tersedia di workspace — lihat ARSITEKTUR.md.)
-- Berkas ini IDEMPOTEN: aman dijalankan ulang (IF NOT EXISTS +
-- DROP POLICY IF EXISTS).
-- KETERGANTUNGAN: WAJIB jalankan migrasi v1 DULU
-- (20261116_pf_v1_foundation.sql) LALU v2
-- (20261116_pf_v2_articles.sql) LALU v3
-- (20261116_pf_v3_ingestion.sql). Migrasi ini memakai:
--   - tabel public.pf_articles (FK artikel_id)
--   - tabel public.pf_raw_items (FK raw_item_id)
--   - tabel auth.users (FK dibuat_oleh di catatan verifikasi)
--   - fungsi public.pf_has_role(text) (kebijakan RLS)
-- TANPA SEED OPERASIONAL: tidak ada data contoh yang dimasukkan
-- (tanpa run AI palsu, klaim palsu, atau brief palsu).
-- URUTAN PENTING: pf_ai_runs (mandiri) → pf_claims (merujuk
-- pf_articles & pf_raw_items) → pf_evidence (merujuk pf_claims)
-- → pf_verification_records (merujuk pf_articles, pf_raw_items,
-- auth.users) → pf_daily_briefs (mandiri). Membalik urutan
-- akan gagal (tabel yang dirujuk belum ada).
-- ============================================================

-- ============================================================
-- 1. TABEL
-- ============================================================

-- ---------- 1a. pf_ai_runs ----------
-- Satu baris per eksekusi agen AI. input_ref menunjuk masukan
-- (id raw item / artikel / klaim, sesuai input_jenis);
-- output_ref menunjuk keluaran (id artikel / brief / klaim).
-- Log ini bersifat INTERNAL (staf saja), ditulis service role
-- lewat API (bypass RLS) — tidak ada policy tulis untuk peran
-- staf.
create table if not exists public.pf_ai_runs (
  id uuid primary key default gen_random_uuid(),
  agen text not null
    check (agen in ('research', 'source_analysis', 'fact_verification', 'summarization', 'article_writing', 'translation', 'trend_analysis', 'daily_brief', 'data_analysis', 'editorial_quality')),
  input_ref text,
  input_jenis text not null default 'raw_item'
    check (input_jenis in ('raw_item', 'artikel', 'klaim', 'brief', 'sumber', 'lain')),
  output_ref text,
  status text not null default 'berjalan'
    check (status in ('berjalan', 'berhasil', 'gagal', 'dilewati')),
  error text,
  durasi_ms integer,
  detail jsonb not null default '{}',
  dipicu_oleh text not null default 'manual'
    check (dipicu_oleh in ('manual', 'jadwal', 'github_actions', 'cron_muse')),
  dimulai_pada timestamptz not null default now(),
  selesai_pada timestamptz
);

-- ---------- 1b. pf_claims ----------
-- Klaim (pernyataan yang bisa diverifikasi) yang diekstrak dari
-- satu artikel terbit ATAU satu item mentah. Minimal satu dari
-- artikel_id / raw_item_id wajib terisi (check di bawah).
-- Klaim ikut terhapus bila artikelnya dihapus (cascade); bila
-- item mentahnya dihapus, klaim tetap hidup (set null) karena
-- klaim bisa sudah dipakai di artikel.
create table if not exists public.pf_claims (
  id uuid primary key default gen_random_uuid(),
  artikel_id uuid references public.pf_articles (id) on delete cascade,
  raw_item_id uuid references public.pf_raw_items (id) on delete set null,
  teks text not null,
  jenis text not null default 'fakta'
    check (jenis in ('fakta', 'angka', 'kutipan', 'tanggal', 'lain')),
  status text not null default 'belum_terverifikasi'
    check (status in ('terverifikasi', 'terbantah', 'belum_terverifikasi', 'tidak_dapat_diverifikasi')),
  dibuat_pada timestamptz not null default now(),
  check (artikel_id is not null or raw_item_id is not null)
);

-- ---------- 1c. pf_evidence ----------
-- Bukti pendukung / penentang untuk satu klaim: tautan sumber
-- beserta kutipan singkat dan arahnya. Bukti ikut terhapus
-- bila klaimnya dihapus (cascade).
create table if not exists public.pf_evidence (
  id uuid primary key default gen_random_uuid(),
  klaim_id uuid not null references public.pf_claims (id) on delete cascade,
  sumber_url text not null,
  sumber_nama text,
  kutipan text,
  arah text not null default 'mendukung'
    check (arah in ('mendukung', 'menentang', 'netral')),
  dibuat_pada timestamptz not null default now()
);

-- ---------- 1d. pf_verification_records ----------
-- Catatan hasil verifikasi atas satu artikel terbit ATAU satu
-- item mentah. Minimal satu dari artikel_id / raw_item_id wajib
-- terisi. keputusan mengikuti label status verifikasi yang sama
-- dengan pf_articles / pf_raw_items. bukti menyimpan daftar
-- ringkas (mis. [{url, arah, kutipan}]) — detail lengkap ada di
-- pf_claims + pf_evidence. dibuat_oleh menunjuk akun staf yang
-- mencatat; bila akun dihapus, catatan tetap hidup (set null).
create table if not exists public.pf_verification_records (
  id uuid primary key default gen_random_uuid(),
  artikel_id uuid references public.pf_articles (id) on delete cascade,
  raw_item_id uuid references public.pf_raw_items (id) on delete set null,
  agen text not null default 'fact_verification',
  keputusan text not null
    check (keputusan in ('VERIFIED', 'CROSS-CHECKED', 'DEVELOPING', 'UNCONFIRMED', 'DISPUTED', 'CORRECTED')),
  catatan text,
  bukti jsonb not null default '[]',
  dibuat_oleh uuid references auth.users (id) on delete set null,
  dibuat_pada timestamptz not null default now(),
  check (artikel_id is not null or raw_item_id is not null)
);

-- ---------- 1e. pf_daily_briefs ----------
-- Brief harian: satu baris per tanggal, isi berupa daftar
-- ringkas (mis. [{artikel_id, judul, ringkasan}]) dalam jsonb.
-- tanggal unik — tidak bisa ada dua brief untuk hari yang sama.
-- Hanya brief berstatus 'terbit' yang boleh dibaca publik;
-- draf hanya dibaca staf.
create table if not exists public.pf_daily_briefs (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null unique,
  isi jsonb not null default '[]',
  status text not null default 'draft'
    check (status in ('draft', 'terbit')),
  dibuat_pada timestamptz not null default now(),
  diterbitkan_pada timestamptz
);

-- ============================================================
-- 2. INDEKS
-- ============================================================

create index if not exists pf_ai_runs_agen_idx on public.pf_ai_runs (agen, dimulai_pada desc);
create index if not exists pf_ai_runs_input_ref_idx on public.pf_ai_runs (input_ref);

create index if not exists pf_claims_artikel_idx on public.pf_claims (artikel_id);
create index if not exists pf_claims_raw_item_idx on public.pf_claims (raw_item_id);
create index if not exists pf_claims_status_idx on public.pf_claims (status);

create index if not exists pf_evidence_klaim_idx on public.pf_evidence (klaim_id);

create index if not exists pf_verification_records_artikel_idx on public.pf_verification_records (artikel_id);
create index if not exists pf_verification_records_raw_item_idx on public.pf_verification_records (raw_item_id);

create index if not exists pf_daily_briefs_tanggal_idx on public.pf_daily_briefs (tanggal desc);

-- ============================================================
-- 3. RLS + POLICIES
-- ============================================================
-- Semua 5 tabel bersifat INTERNAL kecuali brief terbit:
-- hanya service role yang menulis (service_role di Supabase
-- melewati RLS), dan baca hanya peran staf (super_admin /
-- editor / fact_checker / writer). TIDAK dibuat policy
-- insert/update/delete untuk peran staf — tulis HANYA lewat
-- service role (API backend).
-- Pengecualian: pf_daily_briefs berstatus 'terbit' boleh dibaca
-- publik (anon + authenticated), draf tetap staf saja.

-- ---------- pf_ai_runs ----------
alter table public.pf_ai_runs enable row level security;

drop policy if exists "pf_ai_runs baca staf" on public.pf_ai_runs;
create policy "pf_ai_runs baca staf"
  on public.pf_ai_runs for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

-- ---------- pf_claims ----------
alter table public.pf_claims enable row level security;

drop policy if exists "pf_claims baca staf" on public.pf_claims;
create policy "pf_claims baca staf"
  on public.pf_claims for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

-- ---------- pf_evidence ----------
alter table public.pf_evidence enable row level security;

drop policy if exists "pf_evidence baca staf" on public.pf_evidence;
create policy "pf_evidence baca staf"
  on public.pf_evidence for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

-- ---------- pf_verification_records ----------
alter table public.pf_verification_records enable row level security;

drop policy if exists "pf_verification_records baca staf" on public.pf_verification_records;
create policy "pf_verification_records baca staf"
  on public.pf_verification_records for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

-- ---------- pf_daily_briefs ----------
alter table public.pf_daily_briefs enable row level security;

drop policy if exists "pf_daily_briefs baca publik" on public.pf_daily_briefs;
create policy "pf_daily_briefs baca publik"
  on public.pf_daily_briefs for select using (status = 'terbit');

drop policy if exists "pf_daily_briefs baca staf" on public.pf_daily_briefs;
create policy "pf_daily_briefs baca staf"
  on public.pf_daily_briefs for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

-- ============================================================
-- Verifikasi sesudah menjalankan (jalankan terpisah di SQL Editor):
--   select 'pf_ai_runs' as tabel, count(*) from public.pf_ai_runs
--   union all select 'pf_claims', count(*) from public.pf_claims
--   union all select 'pf_evidence', count(*) from public.pf_evidence
--   union all select 'pf_verification_records', count(*) from public.pf_verification_records
--   union all select 'pf_daily_briefs', count(*) from public.pf_daily_briefs;
-- Ekspektasi: semua 0 (tanpa seed data operasional).
-- Cek RLS + policy:
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename like 'pf_%'
--   order by tablename;
--   select count(*) from pg_policies
--   where schemaname = 'public' and tablename like 'pf_%';
-- Ekspektasi: 23 tabel pf_* ber-RLS (8 dari v1 + 8 dari v2 +
--   2 dari v3 + 5 dari v4), total policy 59 (53 dari v1–v3 +
--   6 dari v4: pf_ai_runs 1, pf_claims 1, pf_evidence 1,
--   pf_verification_records 1, pf_daily_briefs 2 — 1 baca publik
--   + 1 baca staf).
-- ============================================================
