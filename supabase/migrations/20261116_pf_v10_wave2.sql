-- ============================================================
-- PRATA FAKTA — Migrasi v10: Gelombang 2 Fase 8 (10 area)
-- Berkas: 20261116_pf_v10_wave2.sql
-- Proyek Supabase: 'prata' (dipakai bersama PRATA & TASIK JAYA)
-- Cara menjalankan: Supabase Dashboard → SQL Editor → tempel
-- seluruh berkas → Run. (DDL tidak bisa dijalankan dari VM:
-- anon key tidak bisa DDL, service_role key & DATABASE_URL tidak
-- tersedia di workspace — lihat ARSITEKTUR.md.)
-- Berkas ini IDEMPOTEN: CREATE TABLE IF NOT EXISTS, ADD COLUMN
-- IF NOT EXISTS, DROP POLICY/TRIGGER IF EXISTS + CREATE —
-- aman dijalankan ulang.
-- KETERGANTUNGAN: WAJIB jalankan migrasi v1–v9 DULU. Memakai:
-- seluruh 37 tabel pf_* (v1–v9), fungsi public.pf_has_role(text)
-- dan public.pf_set_updated_at() (v1), auth.users.
--
-- ISI (rencana AUDIT-EXPANSION.md §5/§7):
--   §1  Story Tracker: pf_stories, pf_story_events,
--       pf_story_articles, pf_story_followers.
--   §2  PRATA Academy: pf_courses, pf_course_modules,
--       pf_course_lessons, pf_course_progress.
--   §3  PRATA Podcast: pf_podcast_episodes, pf_podcast_history,
--       pf_podcast_playlist_items.
--   §4  PRATA Research: pf_research_reports, pf_documents.
--   §5  Country Profile: pf_countries, pf_country_facts.
--   §6  Admin Control Center: pf_system_settings.
--   §7  Kolom perluasan: pf_knowledge_articles (explainer),
--       pf_data_indicators (cakupan/frekuensi + negara),
--       pf_questions (arsip Q&A), pf_events (era/penting +
--       negara), pf_articles (negara).
--   §8  GRANT eksplisit (pelajaran F4 — v9): tiap tabel baru
--       diberi GRANT selaras policy-nya ke anon +
--       authenticated, sejak awal. Tanpa ini tabel baru putus
--       di default Supabase pasca-30-Okt-2026.
-- SEED: TIDAK ADA seed operasional (isi oleh editor/Muse
-- sesudah cutover; data awal Country Profile hanya Indonesia
-- dari sumber resmi — diisi lewat /admin, bukan migrasi).
-- URUTAN CUTOVER: v10 dijalankan sesudah v9 (dan sesudah
-- deploy kode Gelombang 2 — sama seperti v8: kode pengganti
-- sudah ada di repo, tapi halaman baru hanya hidup sesudah
-- deploy). Bila dijalankan sebelum deploy, tidak ada route
-- yang mati (v10 hanya MENAMBAH tabel/kolom).
-- JUMLAH: 16 tabel baru → total 53 tabel pf_*; policy baru 27
-- → total 106 policy (79 dari v1–v9 + 27).
-- ============================================================

-- ============================================================
-- §1. Story Tracker (area 2)
-- ============================================================
-- Cerita = peristiwa yang diikuti perkembangannya. Satu cerita
-- merangkum beberapa event (pf_events) + artikel terkait.
-- Pengelompokan event→cerita dilakukan Muse/editor (bukan
-- otomatis deterministik) lewat /admin/event. Status
-- perkembangan: 'berkembang' (masih ada kabar baru) atau
-- 'selesai' (peristiwa berakhir). Ditulis service role lewat
-- API admin (bypass RLS) — tidak ada policy tulis pengguna.
create table if not exists public.pf_stories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  judul text not null,
  ringkasan text,
  status text not null default 'draft'
    check (status in ('draft', 'terbit')),
  status_perkembangan text not null default 'berkembang'
    check (status_perkembangan in ('berkembang', 'selesai')),
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

create table if not exists public.pf_story_events (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.pf_stories (id) on delete cascade,
  event_id uuid not null references public.pf_events (id) on delete cascade,
  urutan integer not null default 0,
  catatan text,
  dibuat_pada timestamptz not null default now(),
  unique (story_id, event_id)
);

create table if not exists public.pf_story_articles (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.pf_stories (id) on delete cascade,
  artikel_id uuid not null references public.pf_articles (id) on delete cascade,
  peran text not null default 'terkait'
    check (peran in ('terkait', 'pembaruan', 'latar')),
  dibuat_pada timestamptz not null default now(),
  unique (story_id, artikel_id)
);

-- Pengikut cerita: satu baris per (pengguna, cerita).
create table if not exists public.pf_story_followers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null references public.pf_stories (id) on delete cascade,
  dibuat_pada timestamptz not null default now(),
  unique (user_id, story_id)
);

create index if not exists pf_stories_status_idx on public.pf_stories (status);
create index if not exists pf_story_events_story_idx on public.pf_story_events (story_id);
create index if not exists pf_story_articles_story_idx on public.pf_story_articles (story_id);
create index if not exists pf_story_followers_user_idx on public.pf_story_followers (user_id);
create index if not exists pf_story_followers_story_idx on public.pf_story_followers (story_id);

drop trigger if exists pf_stories_set_updated_at on public.pf_stories;
create trigger pf_stories_set_updated_at
  before update on public.pf_stories
  for each row execute function public.pf_set_updated_at();

alter table public.pf_stories enable row level security;
alter table public.pf_story_events enable row level security;
alter table public.pf_story_articles enable row level security;
alter table public.pf_story_followers enable row level security;

drop policy if exists "pf_stories baca terbit" on public.pf_stories;
create policy "pf_stories baca terbit"
  on public.pf_stories for select using (status = 'terbit');

-- Tautan event/artikel hanya terlihat bila ceritanya terbit
-- (defense-in-depth: draf tidak bocor lewat tabel tautan).
drop policy if exists "pf_story_events baca cerita terbit" on public.pf_story_events;
create policy "pf_story_events baca cerita terbit"
  on public.pf_story_events for select using (
    exists (select 1 from public.pf_stories s where s.id = story_id and s.status = 'terbit')
  );

drop policy if exists "pf_story_articles baca cerita terbit" on public.pf_story_articles;
create policy "pf_story_articles baca cerita terbit"
  on public.pf_story_articles for select using (
    exists (select 1 from public.pf_stories s where s.id = story_id and s.status = 'terbit')
  );

drop policy if exists "pf_story_followers baca sendiri" on public.pf_story_followers;
create policy "pf_story_followers baca sendiri"
  on public.pf_story_followers for select using (auth.uid() = user_id);
drop policy if exists "pf_story_followers tambah sendiri" on public.pf_story_followers;
create policy "pf_story_followers tambah sendiri"
  on public.pf_story_followers for insert with check (auth.uid() = user_id);
drop policy if exists "pf_story_followers hapus sendiri" on public.pf_story_followers;
create policy "pf_story_followers hapus sendiri"
  on public.pf_story_followers for delete using (auth.uid() = user_id);

-- ============================================================
-- §2. PRATA Academy (area 8)
-- ============================================================
-- Kursus = materi edukasi berlapis: kursus → modul → pelajaran.
-- Pelajaran jenis 'materi' (teks), 'artikel' (merujuk artikel
-- pengetahuan/berita), atau 'kuis' (merujuk kuis harian lewat
-- kuis_tanggal). Progres per pengguna per pelajaran. Ditulis
-- service role lewat API admin — tidak ada policy tulis
-- pengguna untuk konten; progres ditulis pemiliknya sendiri.
create table if not exists public.pf_courses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  judul text not null,
  deskripsi text,
  kategori text not null default 'umum',
  tingkat text not null default 'pemula'
    check (tingkat in ('pemula', 'menengah', 'mendalam')),
  status text not null default 'draft'
    check (status in ('draft', 'terbit')),
  urutan integer not null default 0,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

create table if not exists public.pf_course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.pf_courses (id) on delete cascade,
  judul text not null,
  deskripsi text,
  urutan integer not null default 0,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

create table if not exists public.pf_course_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.pf_course_modules (id) on delete cascade,
  judul text not null,
  isi text,
  jenis text not null default 'materi'
    check (jenis in ('materi', 'artikel', 'kuis')),
  referensi jsonb not null default '[]',
  artikel_id uuid references public.pf_articles (id) on delete set null,
  kuis_tanggal date,
  urutan integer not null default 0,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

create table if not exists public.pf_course_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.pf_course_lessons (id) on delete cascade,
  selesai boolean not null default false,
  skor integer,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create index if not exists pf_courses_status_idx on public.pf_courses (status);
create index if not exists pf_course_modules_course_idx on public.pf_course_modules (course_id);
create index if not exists pf_course_lessons_module_idx on public.pf_course_lessons (module_id);
create index if not exists pf_course_progress_user_idx on public.pf_course_progress (user_id);

drop trigger if exists pf_courses_set_updated_at on public.pf_courses;
create trigger pf_courses_set_updated_at
  before update on public.pf_courses
  for each row execute function public.pf_set_updated_at();
drop trigger if exists pf_course_modules_set_updated_at on public.pf_course_modules;
create trigger pf_course_modules_set_updated_at
  before update on public.pf_course_modules
  for each row execute function public.pf_set_updated_at();
drop trigger if exists pf_course_lessons_set_updated_at on public.pf_course_lessons;
create trigger pf_course_lessons_set_updated_at
  before update on public.pf_course_lessons
  for each row execute function public.pf_set_updated_at();
drop trigger if exists pf_course_progress_set_updated_at on public.pf_course_progress;
create trigger pf_course_progress_set_updated_at
  before update on public.pf_course_progress
  for each row execute function public.pf_set_updated_at();

alter table public.pf_courses enable row level security;
alter table public.pf_course_modules enable row level security;
alter table public.pf_course_lessons enable row level security;
alter table public.pf_course_progress enable row level security;

drop policy if exists "pf_courses baca terbit" on public.pf_courses;
create policy "pf_courses baca terbit"
  on public.pf_courses for select using (status = 'terbit');

drop policy if exists "pf_course_modules baca kursus terbit" on public.pf_course_modules;
create policy "pf_course_modules baca kursus terbit"
  on public.pf_course_modules for select using (
    exists (select 1 from public.pf_courses c where c.id = course_id and c.status = 'terbit')
  );

drop policy if exists "pf_course_lessons baca kursus terbit" on public.pf_course_lessons;
create policy "pf_course_lessons baca kursus terbit"
  on public.pf_course_lessons for select using (
    exists (
      select 1 from public.pf_course_modules m
      join public.pf_courses c on c.id = m.course_id
      where m.id = module_id and c.status = 'terbit'
    )
  );

drop policy if exists "pf_course_progress baca sendiri" on public.pf_course_progress;
create policy "pf_course_progress baca sendiri"
  on public.pf_course_progress for select using (auth.uid() = user_id);
drop policy if exists "pf_course_progress tambah sendiri" on public.pf_course_progress;
create policy "pf_course_progress tambah sendiri"
  on public.pf_course_progress for insert with check (auth.uid() = user_id);
drop policy if exists "pf_course_progress ubah sendiri" on public.pf_course_progress;
create policy "pf_course_progress ubah sendiri"
  on public.pf_course_progress for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "pf_course_progress hapus sendiri" on public.pf_course_progress;
create policy "pf_course_progress hapus sendiri"
  on public.pf_course_progress for delete using (auth.uid() = user_id);

-- ============================================================
-- §3. PRATA Podcast (area 9)
-- ============================================================
-- Episode audio: naskah selalu ada (teks_naskah) sehingga
-- pemutaran via TTS browser selalu bisa jalan; audio_url
-- NULL bila belum ada file audio (BELUM BISA membuat file
-- audio server tanpa layanan TTS — lihat AUDIT-EXPANSION.md
-- §5.9; pemutar memakai <audio> bila audio_url ada, TTS bila
-- tidak). Jenis: 'brief' (Daily Brief), 'artikel' (artikel
-- pilihan), 'mingguan' (kompilasi mingguan). Hanya artikel
-- sendiri (hak penggunaan jelas). Riwayat + playlist per
-- pengguna. Ditulis service role lewat API admin.
create table if not exists public.pf_podcast_episodes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  judul text not null,
  deskripsi text,
  jenis text not null default 'artikel'
    check (jenis in ('brief', 'artikel', 'mingguan')),
  teks_naskah text not null,
  audio_url text,
  durasi_detik integer,
  tanggal date not null default current_date,
  status text not null default 'draft'
    check (status in ('draft', 'terbit')),
  artikel_id uuid references public.pf_articles (id) on delete set null,
  brief_tanggal date,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

create table if not exists public.pf_podcast_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  episode_id uuid not null references public.pf_podcast_episodes (id) on delete cascade,
  posisi_detik integer not null default 0,
  selesai boolean not null default false,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now(),
  unique (user_id, episode_id)
);

create table if not exists public.pf_podcast_playlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  episode_id uuid not null references public.pf_podcast_episodes (id) on delete cascade,
  urutan integer not null default 0,
  dibuat_pada timestamptz not null default now(),
  unique (user_id, episode_id)
);

create index if not exists pf_podcast_episodes_status_tanggal_idx on public.pf_podcast_episodes (status, tanggal desc);
create index if not exists pf_podcast_history_user_idx on public.pf_podcast_history (user_id);
create index if not exists pf_podcast_playlist_user_idx on public.pf_podcast_playlist_items (user_id);

drop trigger if exists pf_podcast_episodes_set_updated_at on public.pf_podcast_episodes;
create trigger pf_podcast_episodes_set_updated_at
  before update on public.pf_podcast_episodes
  for each row execute function public.pf_set_updated_at();
drop trigger if exists pf_podcast_history_set_updated_at on public.pf_podcast_history;
create trigger pf_podcast_history_set_updated_at
  before update on public.pf_podcast_history
  for each row execute function public.pf_set_updated_at();

alter table public.pf_podcast_episodes enable row level security;
alter table public.pf_podcast_history enable row level security;
alter table public.pf_podcast_playlist_items enable row level security;

drop policy if exists "pf_podcast_episodes baca terbit" on public.pf_podcast_episodes;
create policy "pf_podcast_episodes baca terbit"
  on public.pf_podcast_episodes for select using (status = 'terbit');

drop policy if exists "pf_podcast_history baca sendiri" on public.pf_podcast_history;
create policy "pf_podcast_history baca sendiri"
  on public.pf_podcast_history for select using (auth.uid() = user_id);
drop policy if exists "pf_podcast_history tambah sendiri" on public.pf_podcast_history;
create policy "pf_podcast_history tambah sendiri"
  on public.pf_podcast_history for insert with check (auth.uid() = user_id);
drop policy if exists "pf_podcast_history ubah sendiri" on public.pf_podcast_history;
create policy "pf_podcast_history ubah sendiri"
  on public.pf_podcast_history for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "pf_podcast_history hapus sendiri" on public.pf_podcast_history;
create policy "pf_podcast_history hapus sendiri"
  on public.pf_podcast_history for delete using (auth.uid() = user_id);

drop policy if exists "pf_podcast_playlist_items baca sendiri" on public.pf_podcast_playlist_items;
create policy "pf_podcast_playlist_items baca sendiri"
  on public.pf_podcast_playlist_items for select using (auth.uid() = user_id);
drop policy if exists "pf_podcast_playlist_items tambah sendiri" on public.pf_podcast_playlist_items;
create policy "pf_podcast_playlist_items tambah sendiri"
  on public.pf_podcast_playlist_items for insert with check (auth.uid() = user_id);
drop policy if exists "pf_podcast_playlist_items ubah sendiri" on public.pf_podcast_playlist_items;
create policy "pf_podcast_playlist_items ubah sendiri"
  on public.pf_podcast_playlist_items for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "pf_podcast_playlist_items hapus sendiri" on public.pf_podcast_playlist_items;
create policy "pf_podcast_playlist_items hapus sendiri"
  on public.pf_podcast_playlist_items for delete using (auth.uid() = user_id);

-- ============================================================
-- §4. PRATA Research (area 10)
-- ============================================================
-- Laporan riset (disusun Muse/editor, JANGAN auto-terbit) +
-- dokumen (metadata + tautan sumber SAJA — JANGAN salin isi
-- berhak cipta). Dokumen jenis: laporan, dokumen, publikasi,
-- penelitian, statistik. Ditulis service role lewat API admin.
create table if not exists public.pf_research_reports (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  judul text not null,
  ringkasan text,
  isi text,
  metodologi text,
  penerbit text,
  tanggal date,
  status text not null default 'draft'
    check (status in ('draft', 'terbit')),
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

create table if not exists public.pf_documents (
  id uuid primary key default gen_random_uuid(),
  jenis text not null
    check (jenis in ('laporan', 'dokumen', 'publikasi', 'penelitian', 'statistik')),
  judul text not null,
  penerbit text,
  tanggal date,
  url_sumber text,
  kategori text,
  metadata jsonb not null default '{}',
  status text not null default 'terbit'
    check (status in ('draft', 'terbit')),
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

create index if not exists pf_research_reports_status_idx on public.pf_research_reports (status);
create index if not exists pf_documents_jenis_tanggal_idx on public.pf_documents (jenis, tanggal desc);

drop trigger if exists pf_research_reports_set_updated_at on public.pf_research_reports;
create trigger pf_research_reports_set_updated_at
  before update on public.pf_research_reports
  for each row execute function public.pf_set_updated_at();
drop trigger if exists pf_documents_set_updated_at on public.pf_documents;
create trigger pf_documents_set_updated_at
  before update on public.pf_documents
  for each row execute function public.pf_set_updated_at();

alter table public.pf_research_reports enable row level security;
alter table public.pf_documents enable row level security;

drop policy if exists "pf_research_reports baca terbit" on public.pf_research_reports;
create policy "pf_research_reports baca terbit"
  on public.pf_research_reports for select using (status = 'terbit');

drop policy if exists "pf_documents baca terbit" on public.pf_documents;
create policy "pf_documents baca terbit"
  on public.pf_documents for select using (status = 'terbit');

-- ============================================================
-- §5. Country Profile (area 11)
-- ============================================================
-- Profil negara: satu baris per negara (kode ISO-2). Semua
-- angka WAJIB bersumber + periode referensi (kolom sumber +
-- periode_referensi di tabel negara; sumber + periode per
-- fakta di pf_country_facts). Isi awal hanya Indonesia dari
-- sumber resmi — diisi lewat /admin, BUKAN seed migrasi.
create table if not exists public.pf_countries (
  id uuid primary key default gen_random_uuid(),
  kode text unique not null,
  nama text not null,
  ibu_kota text,
  populasi bigint,
  pdb numeric,
  sistem_pemerintahan text,
  luas_km2 numeric,
  bahasa text,
  mata_uang text,
  sumber text,
  periode_referensi text,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

create table if not exists public.pf_country_facts (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.pf_countries (id) on delete cascade,
  kunci text not null,
  nilai text not null,
  satuan text,
  sumber text,
  periode text,
  dibuat_pada timestamptz not null default now(),
  unique (country_id, kunci)
);

create index if not exists pf_country_facts_country_idx on public.pf_country_facts (country_id);

drop trigger if exists pf_countries_set_updated_at on public.pf_countries;
create trigger pf_countries_set_updated_at
  before update on public.pf_countries
  for each row execute function public.pf_set_updated_at();

alter table public.pf_countries enable row level security;
alter table public.pf_country_facts enable row level security;

drop policy if exists "pf_countries baca publik" on public.pf_countries;
create policy "pf_countries baca publik"
  on public.pf_countries for select using (true);

drop policy if exists "pf_country_facts baca publik" on public.pf_country_facts;
create policy "pf_country_facts baca publik"
  on public.pf_country_facts for select using (true);

-- ============================================================
-- §6. Admin Control Center (area 14) — pengaturan sistem
-- ============================================================
-- Pengaturan sistem (feature flags, pengumuman pemeliharaan):
-- satu baris per kunci. Baca staf-only (super_admin/admin/
-- editor); tulis service role lewat API admin. Nilai jsonb
-- agar flag boolean maupun teks pengumuman muat.
create table if not exists public.pf_system_settings (
  id uuid primary key default gen_random_uuid(),
  kunci text unique not null,
  nilai jsonb not null default '{}',
  deskripsi text,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

drop trigger if exists pf_system_settings_set_updated_at on public.pf_system_settings;
create trigger pf_system_settings_set_updated_at
  before update on public.pf_system_settings
  for each row execute function public.pf_set_updated_at();

alter table public.pf_system_settings enable row level security;

drop policy if exists "pf_system_settings baca staf" on public.pf_system_settings;
create policy "pf_system_settings baca staf"
  on public.pf_system_settings for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('admin')
    or public.pf_has_role('editor')
  );

-- ============================================================
-- §7. Kolom perluasan tabel lama
-- ============================================================

-- Area 4 (Explain the World): format explainer berlapis di
-- pf_knowledge_articles — jenis (artikel biasa vs explainer),
-- tingkat kesulitan, estimasi baca, seri (pengelompokan).
alter table public.pf_knowledge_articles
  add column if not exists jenis text not null default 'artikel'
    check (jenis in ('artikel', 'explainer'));
alter table public.pf_knowledge_articles
  add column if not exists tingkat text not null default 'pemula'
    check (tingkat in ('pemula', 'menengah', 'mendalam'));
alter table public.pf_knowledge_articles
  add column if not exists estimasi_baca_menit integer;
alter table public.pf_knowledge_articles
  add column if not exists seri_slug text;

-- Area 5 (Reality Check): cakupan + frekuensi pembaruan
-- indikator, dan kode negara (FK) untuk filter Indonesia/dunia.
alter table public.pf_data_indicators
  add column if not exists cakupan text not null default 'indonesia'
    check (cakupan in ('indonesia', 'dunia'));
alter table public.pf_data_indicators
  add column if not exists frekuensi_update text;
alter table public.pf_data_indicators
  add column if not exists negara_kode text references public.pf_countries (kode) on delete set null;

-- Area 6 (Ask the World): arsip Q&A publik + kategori +
-- hitung "membantu" (vote pembaca).
alter table public.pf_questions
  add column if not exists publik boolean not null default false;
alter table public.pf_questions
  add column if not exists kategori text;
alter table public.pf_questions
  add column if not exists membantu integer not null default 0;

-- Area 12 (Historical Archive): era + penanda penting di
-- pf_events, dan kode negara (FK).
alter table public.pf_events
  add column if not exists era text;
alter table public.pf_events
  add column if not exists penting boolean not null default false;
alter table public.pf_events
  add column if not exists negara_kode text references public.pf_countries (kode) on delete set null;

-- Area 11: kode negara (FK) di artikel — berita terbaru per
-- negara dibaca dari sini.
alter table public.pf_articles
  add column if not exists negara_kode text references public.pf_countries (kode) on delete set null;

create index if not exists pf_knowledge_articles_jenis_idx on public.pf_knowledge_articles (jenis, status);
create index if not exists pf_data_indicators_cakupan_idx on public.pf_data_indicators (cakupan);
create index if not exists pf_questions_publik_idx on public.pf_questions (publik, status);
create index if not exists pf_events_era_idx on public.pf_events (era);
create index if not exists pf_articles_negara_idx on public.pf_articles (negara_kode);

-- ============================================================
-- §8. GRANT eksplisit (pelajaran F4 — v9)
-- ============================================================
-- Prinsip turunan v9: tiap (tabel, perintah) diberi GRANT ke
-- anon + authenticated BILA ada ≥ 1 policy dengan command itu
-- pada tabel tersebut. Grant adalah gerbang tingkat tabel; RLS
-- tetap penegak baris. Service role tidak terpengaruh (bypass
-- RLS). Idempoten: GRANT dijalankan ulang = no-op.
--
--   SELECT saja (12): pf_stories, pf_story_events,
--     pf_story_articles, pf_courses, pf_course_modules,
--     pf_course_lessons, pf_podcast_episodes,
--     pf_research_reports, pf_documents, pf_countries,
--     pf_country_facts, pf_system_settings.
--   SELECT+INSERT+DELETE (1): pf_story_followers (tanpa UPDATE).
--   SELECT+INSERT+UPDATE+DELETE (3): pf_course_progress,
--     pf_podcast_history, pf_podcast_playlist_items.

grant select on public.pf_stories to anon, authenticated;
grant select on public.pf_story_events to anon, authenticated;
grant select on public.pf_story_articles to anon, authenticated;
grant select on public.pf_courses to anon, authenticated;
grant select on public.pf_course_modules to anon, authenticated;
grant select on public.pf_course_lessons to anon, authenticated;
grant select on public.pf_podcast_episodes to anon, authenticated;
grant select on public.pf_research_reports to anon, authenticated;
grant select on public.pf_documents to anon, authenticated;
grant select on public.pf_countries to anon, authenticated;
grant select on public.pf_country_facts to anon, authenticated;
grant select on public.pf_system_settings to anon, authenticated;

grant select, insert, delete on public.pf_story_followers to anon, authenticated;

grant select, insert, update, delete on public.pf_course_progress to anon, authenticated;
grant select, insert, update, delete on public.pf_podcast_history to anon, authenticated;
grant select, insert, update, delete on public.pf_podcast_playlist_items to anon, authenticated;

-- ============================================================
-- Verifikasi (jalankan di SQL Editor sesudah migrasi):
--   select count(*) from pg_tables
--     where schemaname = 'public' and tablename like 'pf_%';
--   -- Ekspektasi: 53 (37 dari v1–v9 + 16 dari v10).
--   select tablename, rowsecurity from pg_tables
--     where schemaname = 'public' and tablename like 'pf_%'
--     order by tablename;
--   -- Ekspektasi: RLS true di 53/53 tabel.
--   select count(*) from pg_policies
--     where schemaname = 'public' and tablename like 'pf_%';
--   -- Ekspektasi: 106 (79 dari v1–v9 + 27 dari v10).
--   select count(*) from pg_policies
--     where schemaname = 'public' and tablename like 'pf_%'
--       and tablename in ('pf_stories','pf_story_events',
--       'pf_story_articles','pf_story_followers','pf_courses',
--       'pf_course_modules','pf_course_lessons',
--       'pf_course_progress','pf_podcast_episodes',
--       'pf_podcast_history','pf_podcast_playlist_items',
--       'pf_research_reports','pf_documents','pf_countries',
--       'pf_country_facts','pf_system_settings');
--   -- Ekspektasi: 27.
--   -- Cek negatif (sebagai authenticated, tanpa data):
--   -- SELECT pf_system_settings → 0 baris (staf-only);
--   -- SELECT pf_stories → 0 baris (belum ada yang terbit).
-- ============================================================
