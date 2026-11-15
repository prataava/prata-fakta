-- ============================================================
-- PRATA FAKTA — Migrasi Fase 6 (Advanced: Perpustakaan
-- Pengetahuan & Daily Knowledge, Ikuti Topik, Notifikasi,
-- Kuis Harian, Data & Statistik, Peta Peristiwa, Tanya Muse)
-- Berkas: 20261116_pf_v6_advanced.sql
-- Proyek Supabase: 'prata' (dipakai bersama PRATA & TASIK JAYA)
-- Cara menjalankan: Supabase Dashboard → SQL Editor → tempel
-- seluruh berkas → Run. (DDL tidak bisa dijalankan dari VM:
-- anon key tidak bisa DDL, service_role key & DATABASE_URL tidak
-- tersedia di workspace — lihat ARSITEKTUR.md.)
-- Berkas ini IDEMPOTEN: aman dijalankan ulang (IF NOT EXISTS +
-- DROP POLICY IF EXISTS + DROP TRIGGER IF EXISTS +
-- ON CONFLICT DO NOTHING).
-- KETERGANTUNGAN: WAJIB jalankan migrasi v1 DULU
-- (20261116_pf_v1_foundation.sql) LALU v2
-- (20261116_pf_v2_articles.sql) LALU v3
-- (20261116_pf_v3_ingestion.sql) LALU v4
-- (20261116_pf_v4_ai.sql) LALU v5
-- (20261116_pf_v5_editorial.sql). Migrasi ini memakai:
--   - tabel public.pf_articles (FK artikel_id di kuis,
--     kolom lintang / bujur)
--   - tabel auth.users (FK user_id)
--   - fungsi public.pf_has_role(text) (kebijakan RLS)
--   - fungsi public.pf_set_updated_at() (trigger
--     pf_knowledge_articles, pf_data_indicators, pf_events)
-- SEED: TIDAK ADA seed operasional — tanpa indikator palsu,
-- kuis palsu, peristiwa palsu, atau artikel pengetahuan palsu.
-- Semua isi diisi lewat API / agen (service role) setelah
-- migrasi berjalan.
-- URUTAN PENTING: pf_knowledge_articles (mandiri) →
-- pf_followed_topics (merujuk auth.users) →
-- pf_notifications (merujuk auth.users) →
-- pf_quiz_questions (merujuk pf_articles) →
-- pf_data_indicators (mandiri) → pf_data_points (merujuk
-- pf_data_indicators) → pf_events (mandiri) →
-- pf_event_timeline (merujuk pf_events) →
-- pf_questions (merujuk auth.users) → ALTER pf_articles
-- (kolom lintang / bujur). Membalik urutan akan gagal
-- (tabel yang dirujuk belum ada).
-- ============================================================

-- ============================================================
-- 1. TABEL
-- ============================================================

-- ---------- 1a. pf_knowledge_articles ----------
-- Perpustakaan Pengetahuan: artikel pengetahuan abadi (bukan
-- berita harian) — sejarah, geografi, negara, sains,
-- teknologi, ekonomi, alam, tubuh, umum. Satu artikel per
-- tanggal boleh ditandai sebagai Daily Knowledge lewat
-- harian_tanggal (unique, nullable — NULL berarti bukan
-- artikel harian). referensi menyimpan array objek
-- {judul, url}. Ditulis service role lewat API (bypass RLS)
-- — tidak ada policy tulis untuk peran staf.
create table if not exists public.pf_knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  judul text not null,
  ringkasan text,
  isi text,
  topik text not null
    check (topik in ('sejarah', 'geografi', 'negara', 'sains', 'teknologi', 'ekonomi', 'alam', 'tubuh', 'umum')),
  referensi jsonb not null default '[]',
  status text not null default 'draft'
    check (status in ('draft', 'terbit')),
  harian_tanggal date unique,
  penulis_nama text,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

-- ---------- 1b. pf_followed_topics ----------
-- Topik yang diikuti pengguna: kategori, negara, atau isu.
-- Satu baris per (pengguna, tipe, target) — mengikuti topik
-- yang sama dua kali ditolak unique constraint.
create table if not exists public.pf_followed_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tipe text not null
    check (tipe in ('kategori', 'negara', 'isu')),
  target text not null,
  dibuat_pada timestamptz not null default now(),
  unique (user_id, tipe, target)
);

-- ---------- 1c. pf_notifications ----------
-- Notifikasi untuk pengguna: breaking, topik yang diikuti,
-- brief, artikel, koreksi, peristiwa. Ditulis service role
-- lewat API (bypass RLS) — tidak ada policy insert untuk
-- pengguna. Pengguna hanya membaca dan menandai dibaca.
create table if not exists public.pf_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  jenis text not null
    check (jenis in ('breaking', 'topik', 'brief', 'artikel', 'koreksi', 'peristiwa')),
  judul text not null,
  isi text,
  tautan text,
  dibaca boolean not null default false,
  dibuat_pada timestamptz not null default now()
);

-- ---------- 1d. pf_quiz_questions ----------
-- Kuis Harian: 5 soal per hari (satu baris = satu soal),
-- masing-masing 5 opsi (array 5 string — panjang array
-- divalidasi di aplikasi, bukan CHECK rumit di database)
-- dengan kunci 0–4 dan penjelasan + sumber. artikel_id
-- opsional: soal boleh merujuk artikel terkait; bila
-- artikel dihapus, soal tetap hidup (set null). Ditulis
-- service role lewat API (bypass RLS) — tidak ada policy
-- tulis untuk pengguna.
create table if not exists public.pf_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null,
  pertanyaan text not null,
  opsi jsonb not null,
  kunci integer not null
    check (kunci between 0 and 4),
  penjelasan text,
  sumber_url text,
  sumber_nama text,
  artikel_id uuid references public.pf_articles (id) on delete set null,
  dibuat_pada timestamptz not null default now()
);

-- ---------- 1e. pf_data_indicators ----------
-- Indikator data & statistik (ditulis agen Data Analysis):
-- mis. populasi, PDB, angka melek huruf. ringkasan_tren
-- ditulis agen dari deret data_points. Ditulis service role
-- lewat API (bypass RLS) — tidak ada policy tulis untuk
-- pengguna.
create table if not exists public.pf_data_indicators (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  slug text unique not null,
  kategori text not null
    check (kategori in ('nasional', 'global', 'penduduk', 'pendidikan', 'ekonomi', 'energi', 'lingkungan')),
  satuan text,
  sumber_nama text not null,
  sumber_url text,
  metodologi text,
  tanggal_pembaruan date,
  ringkasan_tren text,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

-- ---------- 1f. pf_data_points ----------
-- Titik data per indikator: satu nilai per (indikator,
-- tanggal). Ikut terhapus bila indikatornya dihapus
-- (cascade).
create table if not exists public.pf_data_points (
  id uuid primary key default gen_random_uuid(),
  indikator_id uuid not null references public.pf_data_indicators (id) on delete cascade,
  tanggal date not null,
  nilai numeric not null,
  unique (indikator_id, tanggal)
);

-- ---------- 1g. pf_events ----------
-- Peristiwa di peta: judul, ringkasan, lokasi teks, dan
-- koordinat terverifikasi. lintang / bujur NULL bila
-- koordinat belum / tidak terverifikasi — peta HANYA
-- menampilkan peristiwa yang koordinatnya non-null.
-- Ditulis service role lewat API (bypass RLS) — tidak ada
-- policy tulis untuk pengguna.
create table if not exists public.pf_events (
  id uuid primary key default gen_random_uuid(),
  judul text not null,
  ringkasan text,
  lokasi_teks text,
  lintang numeric(9,6),
  bujur numeric(9,6),
  dimulai_pada timestamptz not null,
  berakhir_pada timestamptz,
  dampak text,
  sumber_url text,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

-- ---------- 1h. pf_event_timeline ----------
-- Linimasa satu peristiwa: urutan kejadian beserta sumber
-- dan catatan perubahan (bila kabar berkembang / dikoreksi).
-- Ikut terhapus bila peristiwanya dihapus (cascade).
create table if not exists public.pf_event_timeline (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.pf_events (id) on delete cascade,
  waktu timestamptz not null,
  peristiwa text not null,
  sumber text,
  perubahan text,
  dibuat_pada timestamptz not null default now()
);

-- ---------- 1i. pf_questions ----------
-- Tanya Muse: pertanyaan pengguna (boleh anonim — user_id
-- NULL) yang dijawab agen dengan referensi. status
-- 'menunggu' sampai dijawab ('terjawab') atau dinyatakan
-- tidak ada datanya ('tidak_ada_data'). Ditulis lewat API
-- (insert publik, di-rate-limit di API) — tidak ada policy
-- update / delete untuk pengguna.
create table if not exists public.pf_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  pertanyaan text not null,
  jawaban text,
  referensi jsonb not null default '[]',
  status text not null default 'menunggu'
    check (status in ('menunggu', 'terjawab', 'tidak_ada_data')),
  dibuat_pada timestamptz not null default now(),
  dijawab_pada timestamptz
);

-- ============================================================
-- 2. ALTER TABEL LAMA
-- ============================================================

-- Koordinat terverifikasi pada artikel (nullable — hanya
-- diisi bila koordinat sudah terverifikasi; peta HANYA
-- menampilkan artikel yang koordinatnya non-null).
alter table public.pf_articles
  add column if not exists lintang numeric(9,6);
alter table public.pf_articles
  add column if not exists bujur numeric(9,6);

-- ============================================================
-- 3. INDEKS
-- ============================================================

create index if not exists pf_knowledge_articles_status_topik_idx on public.pf_knowledge_articles (status, topik);
create index if not exists pf_knowledge_articles_harian_idx on public.pf_knowledge_articles (harian_tanggal);

create index if not exists pf_followed_topics_user_idx on public.pf_followed_topics (user_id);

create index if not exists pf_notifications_user_idx on public.pf_notifications (user_id);
create index if not exists pf_notifications_user_baca_idx on public.pf_notifications (user_id, dibaca, dibuat_pada desc);

create index if not exists pf_quiz_questions_tanggal_idx on public.pf_quiz_questions (tanggal);
create index if not exists pf_quiz_questions_artikel_idx on public.pf_quiz_questions (artikel_id);

create index if not exists pf_data_indicators_kategori_idx on public.pf_data_indicators (kategori);

create index if not exists pf_data_points_indikator_idx on public.pf_data_points (indikator_id);
create index if not exists pf_data_points_indikator_tanggal_idx on public.pf_data_points (indikator_id, tanggal);

create index if not exists pf_events_dimulai_idx on public.pf_events (dimulai_pada desc);

create index if not exists pf_event_timeline_event_idx on public.pf_event_timeline (event_id);
create index if not exists pf_event_timeline_event_waktu_idx on public.pf_event_timeline (event_id, waktu);

create index if not exists pf_questions_user_idx on public.pf_questions (user_id);
create index if not exists pf_questions_status_dibuat_idx on public.pf_questions (status, dibuat_pada desc);

-- ============================================================
-- 4. RLS + POLICIES + TRIGGERS
-- ============================================================
-- Tabel publik (baca semua orang, tulis service role saja):
--   - pf_quiz_questions, pf_data_indicators, pf_data_points,
--     pf_events, pf_event_timeline: baca publik semua baris.
--   - pf_knowledge_articles: baca publik hanya yang
--     status='terbit'; staf membaca semua (termasuk draft).
-- Tabel milik pengguna:
--   - pf_followed_topics: select/insert/delete hanya pemilik.
--   - pf_notifications: select + update (tandai dibaca) hanya
--     pemilik; insert hanya service role (tanpa policy insert).
--   - pf_questions: select pemilik + staf; insert untuk
--     authenticated DAN anon (user_id = auth.uid() atau NULL);
--     tanpa policy update/delete pengguna.

-- ---------- pf_knowledge_articles ----------
alter table public.pf_knowledge_articles enable row level security;

drop policy if exists "pf_knowledge_articles baca publik terbit" on public.pf_knowledge_articles;
create policy "pf_knowledge_articles baca publik terbit"
  on public.pf_knowledge_articles for select using (status = 'terbit');

drop policy if exists "pf_knowledge_articles baca staf" on public.pf_knowledge_articles;
create policy "pf_knowledge_articles baca staf"
  on public.pf_knowledge_articles for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

-- ---------- pf_followed_topics ----------
alter table public.pf_followed_topics enable row level security;

drop policy if exists "pf_followed_topics baca pemilik" on public.pf_followed_topics;
create policy "pf_followed_topics baca pemilik"
  on public.pf_followed_topics for select using (auth.uid() = user_id);

drop policy if exists "pf_followed_topics tambah pemilik" on public.pf_followed_topics;
create policy "pf_followed_topics tambah pemilik"
  on public.pf_followed_topics for insert with check (auth.uid() = user_id);

drop policy if exists "pf_followed_topics hapus pemilik" on public.pf_followed_topics;
create policy "pf_followed_topics hapus pemilik"
  on public.pf_followed_topics for delete using (auth.uid() = user_id);

-- ---------- pf_notifications ----------
alter table public.pf_notifications enable row level security;

drop policy if exists "pf_notifications baca pemilik" on public.pf_notifications;
create policy "pf_notifications baca pemilik"
  on public.pf_notifications for select using (auth.uid() = user_id);

drop policy if exists "pf_notifications ubah pemilik" on public.pf_notifications;
create policy "pf_notifications ubah pemilik"
  on public.pf_notifications for update using (auth.uid() = user_id);

-- ---------- pf_quiz_questions ----------
alter table public.pf_quiz_questions enable row level security;

drop policy if exists "pf_quiz_questions baca publik" on public.pf_quiz_questions;
create policy "pf_quiz_questions baca publik"
  on public.pf_quiz_questions for select using (true);

-- ---------- pf_data_indicators ----------
alter table public.pf_data_indicators enable row level security;

drop policy if exists "pf_data_indicators baca publik" on public.pf_data_indicators;
create policy "pf_data_indicators baca publik"
  on public.pf_data_indicators for select using (true);

-- ---------- pf_data_points ----------
alter table public.pf_data_points enable row level security;

drop policy if exists "pf_data_points baca publik" on public.pf_data_points;
create policy "pf_data_points baca publik"
  on public.pf_data_points for select using (true);

-- ---------- pf_events ----------
alter table public.pf_events enable row level security;

drop policy if exists "pf_events baca publik" on public.pf_events;
create policy "pf_events baca publik"
  on public.pf_events for select using (true);

-- ---------- pf_event_timeline ----------
alter table public.pf_event_timeline enable row level security;

drop policy if exists "pf_event_timeline baca publik" on public.pf_event_timeline;
create policy "pf_event_timeline baca publik"
  on public.pf_event_timeline for select using (true);

-- ---------- pf_questions ----------
alter table public.pf_questions enable row level security;

drop policy if exists "pf_questions baca pemilik dan staf" on public.pf_questions;
create policy "pf_questions baca pemilik dan staf"
  on public.pf_questions for select using (
    auth.uid() = user_id
    or public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

drop policy if exists "pf_questions tambah publik" on public.pf_questions;
create policy "pf_questions tambah publik"
  on public.pf_questions for insert with check (
    user_id = auth.uid() or user_id is null
  );

-- ---------- Triggers ----------
drop trigger if exists pf_knowledge_articles_set_updated_at on public.pf_knowledge_articles;
create trigger pf_knowledge_articles_set_updated_at
  before update on public.pf_knowledge_articles
  for each row execute function public.pf_set_updated_at();

drop trigger if exists pf_data_indicators_set_updated_at on public.pf_data_indicators;
create trigger pf_data_indicators_set_updated_at
  before update on public.pf_data_indicators
  for each row execute function public.pf_set_updated_at();

drop trigger if exists pf_events_set_updated_at on public.pf_events;
create trigger pf_events_set_updated_at
  before update on public.pf_events
  for each row execute function public.pf_set_updated_at();

-- ============================================================
-- 5. SEED
-- ============================================================
-- TIDAK ADA seed operasional: tanpa artikel pengetahuan palsu,
-- indikator palsu, kuis palsu, atau peristiwa palsu. Semua isi
-- diisi lewat API / agen setelah migrasi berjalan.

-- ============================================================
-- Verifikasi sesudah menjalankan (jalankan terpisah di SQL Editor):
--   select 'pf_knowledge_articles' as tabel, count(*) from public.pf_knowledge_articles
--   union all select 'pf_followed_topics', count(*) from public.pf_followed_topics
--   union all select 'pf_notifications', count(*) from public.pf_notifications
--   union all select 'pf_quiz_questions', count(*) from public.pf_quiz_questions
--   union all select 'pf_data_indicators', count(*) from public.pf_data_indicators
--   union all select 'pf_data_points', count(*) from public.pf_data_points
--   union all select 'pf_events', count(*) from public.pf_events
--   union all select 'pf_event_timeline', count(*) from public.pf_event_timeline
--   union all select 'pf_questions', count(*) from public.pf_questions;
-- Ekspektasi: semua 0 (tanpa seed data operasional).
-- Cek kolom baru:
--   select column_name from information_schema.columns
--   where table_schema = 'public'
--   and table_name = 'pf_articles'
--   and column_name in ('lintang', 'bujur');
-- Ekspektasi: 2 baris pf_articles.
-- Cek RLS + policy:
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename like 'pf_%'
--   order by tablename;
--   select count(*) from pg_policies
--   where schemaname = 'public' and tablename like 'pf_%';
-- Ekspektasi: 35 tabel pf_* ber-RLS (8 dari v1 + 8 dari v2 +
--   2 dari v3 + 5 dari v4 + 3 dari v5 + 9 dari v6), total policy
--   76 (62 dari v1–v5 + 14 dari v6: pf_knowledge_articles 2,
--   pf_followed_topics 3, pf_notifications 2,
--   pf_quiz_questions 1, pf_data_indicators 1,
--   pf_data_points 1, pf_events 1, pf_event_timeline 1,
--   pf_questions 2).
-- ============================================================
