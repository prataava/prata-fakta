-- ============================================================
-- PRATA FAKTA — Migrasi Fase 8 Gelombang 1 (Expansion, bagian 1)
-- Berkas: 20261116_pf_v8_expansion.sql
-- Proyek Supabase: 'prata' (dipakai bersama PRATA & TASIK JAYA)
-- Cara menjalankan: Supabase Dashboard → SQL Editor → tempel
-- seluruh berkas → Run. (DDL tidak bisa dijalankan dari VM:
-- anon key tidak bisa DDL, service_role key & DATABASE_URL tidak
-- tersedia di workspace — lihat ARSITEKTUR.md.)
-- Berkas ini IDEMPOTEN: aman dijalankan ulang (IF NOT EXISTS +
-- DROP POLICY IF EXISTS + blok DO yang memeriksa pg_constraint
-- sebelum menambah CHECK). Gelombang 2/3 BOLEH meng-append ke
-- berkas ini (SATU berkas v8, lihat AUDIT-EXPANSION.md §7),
-- selama selalu divalidasi ulang v1–v8 di PGlite.
-- KETERGANTUNGAN: WAJIB jalankan migrasi v1–v7 DULU. Migrasi ini
-- memakai: tabel pf_roles / pf_permissions / pf_role_permissions
-- (v1), pf_article_sources / pf_article_tags / pf_correction_reports
-- (v2), pf_claims / pf_evidence / pf_verification_records /
-- pf_ai_runs (v4), pf_audit_logs / pf_scheduled_jobs (v5),
-- pf_quiz_questions / pf_events / pf_questions / pf_articles
-- (v6), fungsi public.pf_has_role(text) dan
-- public.pf_set_updated_at() (v1).
--
-- URUTAN PENTING — T5 (lihat supabase/README.md §v8):
--   1. Patch dulu ketiga route ke service role:
--      src/app/api/langganan/route.ts,
--      src/app/api/laporan/route.ts,
--      src/app/api/tanya/route.ts
--      (INSERT via createServiceClient; service_role bypass RLS).
--   2. BARU jalankan migrasi ini (DROP POLICY insert anonim).
--   Membalik urutan memutus ketiga route: tanpa policy insert
--   anonim DAN tanpa service role, INSERT publik ditolak RLS.
-- SEED: TIDAK ADA seed operasional — tanpa preferensi palsu,
-- laporan palsu, atau klaim palsu.
-- URUTAN DI DALAM v8 (Gelombang 1):
--   T5 drop policy insert anonim → T8 ganti policy baca →
--   Area 1 policy baca terbit (claims/evidence/verification) →
--   T1-sisa REVOKE kunci kuis → perluasan CHECK enum →
--   D1/D2 CHECK → pf_user_preferences → kolom
--   pf_article_sources → perluasan pf_correction_reports.
-- ============================================================

-- ============================================================
-- 1. T5 — Cabut policy INSERT anonim (tanpa pengganti)
-- ============================================================
-- Ketiga policy ini mengizinkan INSERT langsung lewat REST
-- anon key sehingga rate limit API (5/mnt) bisa dilewati.
-- Sesudah patch route ke service role (lihat catatan URUTAN
-- di atas), policy ini TIDAK diperlukan lagi: service_role
-- melewati RLS. TANPA policy insert pengganti — INSERT hanya
-- lewat API yang di-rate-limit.
drop policy if exists "pf_newsletter daftar publik"
  on public.pf_newsletter_subscribers;
drop policy if exists "pf_correction_reports kirim publik"
  on public.pf_correction_reports;
drop policy if exists "pf_questions tambah publik"
  on public.pf_questions;

-- ============================================================
-- 2. T8 — Batasi baca publik berlebih
-- ============================================================
-- 2a. pf_roles → Opsi A: login saja (auth.uid() is not null).
--     JANGAN staf-only mentah: getUserRoles()
--     (src/lib/auth/roles.ts:32-48) memakai session client +
--     JOIN pf_user_roles → pf_roles(nama); staf-only akan
--     membuat pengguna biasa kehilangan role (guard fail-closed).
--     Anon tetap diblokir (auth.uid() null).
drop policy if exists "pf_roles baca" on public.pf_roles;
create policy "pf_roles baca" on public.pf_roles
  for select using (auth.uid() is not null);

-- 2b. pf_permissions + pf_role_permissions → staf-only (4 peran).
--     Tidak dibaca kode aplikasi mana pun, jadi aman diketatkan.
drop policy if exists "pf_permissions baca" on public.pf_permissions;
create policy "pf_permissions baca" on public.pf_permissions
  for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

drop policy if exists "pf_role_permissions baca" on public.pf_role_permissions;
create policy "pf_role_permissions baca" on public.pf_role_permissions
  for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

-- 2c. pf_article_sources + pf_article_tags → hanya bila artikel
--     terbit, ATAU staf. Pola yang sama dengan
--     pf_article_versions (v2:215-226). Policy tulis tidak diubah.
--     pf_tags TIDAK diubah: taksonomi mandiri tanpa tautan
--     artikel, baca publiknya tidak bocor.
drop policy if exists "pf_article_sources baca publik" on public.pf_article_sources;
create policy "pf_article_sources baca publik"
  on public.pf_article_sources for select using (
    exists (
      select 1 from public.pf_articles a
      where a.id = artikel_id and a.status = 'terbit'
    )
    or public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('writer')
    or public.pf_has_role('fact_checker')
  );

drop policy if exists "pf_article_tags baca publik" on public.pf_article_tags;
create policy "pf_article_tags baca publik"
  on public.pf_article_tags for select using (
    exists (
      select 1 from public.pf_articles a
      where a.id = artikel_id and a.status = 'terbit'
    )
    or public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('writer')
    or public.pf_has_role('fact_checker')
  );

-- ============================================================
-- 3. Area 1 (Jejak Fakta) — baca publik terbatas
-- ============================================================
-- Klaim, bukti, dan catatan verifikasi boleh dibaca publik
-- HANYA bila artikelnya terbit (pola EXISTS yang sama dengan
-- §2c); draf tetap staf saja. Tanpa policy ini, seksi Jejak
-- Fakta di halaman artikel tidak bisa membaca apa pun.
drop policy if exists "pf_claims baca staf" on public.pf_claims;
drop policy if exists "pf_claims baca terbit atau staf" on public.pf_claims;
create policy "pf_claims baca terbit atau staf"
  on public.pf_claims for select using (
    exists (
      select 1 from public.pf_articles a
      where a.id = artikel_id and a.status = 'terbit'
    )
    or public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

drop policy if exists "pf_evidence baca staf" on public.pf_evidence;
drop policy if exists "pf_evidence baca terbit atau staf" on public.pf_evidence;
create policy "pf_evidence baca terbit atau staf"
  on public.pf_evidence for select using (
    exists (
      select 1 from public.pf_claims k
      join public.pf_articles a on a.id = k.artikel_id
      where k.id = klaim_id and a.status = 'terbit'
    )
    or public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

drop policy if exists "pf_verification_records baca staf" on public.pf_verification_records;
drop policy if exists "pf_verification_records baca terbit atau staf" on public.pf_verification_records;
create policy "pf_verification_records baca terbit atau staf"
  on public.pf_verification_records for select using (
    exists (
      select 1 from public.pf_articles a
      where a.id = artikel_id and a.status = 'terbit'
    )
    or public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

-- ============================================================
-- 4. T1-sisa — kolom kunci kuis tidak bisa dibaca via REST
-- ============================================================
-- Fase 7 menutup kunci di lapis API, tetapi policy DB masih
-- mengizinkan baca publik SEMUA kolom termasuk `kunci` — siapa
-- pun yang memegang anon key bisa GET /rest/v1/pf_quiz_questions
-- ?select=kunci. PERHATIAN: `REVOKE SELECT (kunci)` SAJA tidak
-- cukup — anon/authenticated memegang SELECT tingkat tabel
-- (grant default Supabase), dan REVOKE per kolom TIDAK
-- mengalahkan grant tingkat tabel (hak tabel tetap memberi akses
-- ke semua kolom; dibuktikan di PGlite saat validasi v8).
-- Pola yang benar: cabut SELECT tingkat tabel, lalu GRANT
-- SELECT per kolom untuk semua kolom KECUALI kunci.
-- Pembaca kunci yang sah (POST /api/kuis/jawab dan
-- getKuisHarian di src/lib/lanjutan.ts) SUDAH dipindah ke
-- service role sebelum migrasi ini dijalankan; service_role
-- tidak terpengaruh REVOKE/GRANT ini.
revoke select on public.pf_quiz_questions from anon, authenticated;
grant select (id, tanggal, pertanyaan, opsi, penjelasan, sumber_url, sumber_nama, artikel_id, dibuat_pada)
  on public.pf_quiz_questions to anon, authenticated;

-- ============================================================
-- 5. Perluasan CHECK enum (D4)
-- ============================================================
-- Pola tiap blok: bila constraint v8 sudah ada, lewati; bila
-- belum, buang CHECK lama yang menyebut kolom itu (nama
-- constraint lama dibuat otomatis Postgres, jadi dicari lewat
-- pg_get_constraintdef — bukan ditebak), lalu tambah CHECK
-- baru bernama eksplisit. Aman diulang.

-- 5a. pf_audit_logs.aksi — 18 nilai v5 + 28 aksi Fase 8
--     yang direncanakan (daftar lengkap di supabase/README.md §v8):
--     cerita (Gel. 2), pengetahuan/event/data/riset/negara
--     (Gel. 2), tanya/akademi/podcast (Gel. 3), sistem (Gel. 4),
--     kuis, preferensi + ekspor data (Gel. 1).
do $$
declare
  r record;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_audit_logs'::regclass
      and conname = 'pf_audit_logs_aksi_check_v8'
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
    add constraint pf_audit_logs_aksi_check_v8
    check (aksi in (
      'artikel.buat', 'artikel.ubah', 'artikel.hapus', 'artikel.terbit', 'artikel.batal_terbit', 'artikel.jadwalkan',
      'review.setuju', 'review.tolak', 'review.kembalikan',
      'verifikasi.ubah', 'koreksi.terima', 'koreksi.tolak',
      'pengguna.role', 'pengguna.nonaktif', 'pengguna.aktifkan',
      'sistem.job', 'sistem.kategori', 'brief.terbit',
      'cerita.buat', 'cerita.ubah', 'cerita.hapus',
      'pengetahuan.buat', 'pengetahuan.ubah', 'pengetahuan.hapus',
      'event.buat', 'event.ubah', 'event.hapus',
      'data.indikator', 'data.titik',
      'riset.buat', 'riset.ubah', 'riset.hapus',
      'negara.buat', 'negara.ubah',
      'tanya.jawab',
      'akademi.kursus', 'akademi.modul', 'akademi.progres',
      'podcast.episode', 'podcast.terbit',
      'sistem.flag', 'sistem.pengumuman',
      'kuis.buat', 'kuis.ubah',
      'preferensi.ubah', 'ekspor.data'
    ));
end $$;

-- 5b. pf_scheduled_jobs.nama — 3 nilai v5 + 5 job Fase 8:
--     data-analysis (workflow Senin 01.00 UTC, Fase 6),
--     terbitkan-terjadwal (tiap jam, Fase 5),
--     digest (My Prata, Gel. 1), podcast (Gel. 3),
--     riset (Gel. 2). TIDAK ada seed baris job baru di v8 —
--     baris dibuat admin bila workflow-nya aktif.
do $$
declare
  r record;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_scheduled_jobs'::regclass
      and conname = 'pf_scheduled_jobs_nama_check_v8'
  ) then
    return;
  end if;
  for r in
    select conname from pg_constraint
    where conrelid = 'public.pf_scheduled_jobs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%nama%'
  loop
    execute 'alter table public.pf_scheduled_jobs drop constraint ' || quote_ident(r.conname);
  end loop;
  alter table public.pf_scheduled_jobs
    add constraint pf_scheduled_jobs_nama_check_v8
    check (nama in (
      'ingestion', 'editorial', 'brief',
      'data-analysis', 'terbitkan-terjadwal', 'digest', 'podcast', 'riset'
    ));
end $$;

-- 5c. pf_ai_runs.agen — 10 agen v4 + 3 agen yang direncanakan
--     Gelombang 2/3: story_clustering (Story Tracker),
--     podcast_script (naskah podcast), research_synthesis
--     (PRATA Research). Agen-agen ini BELUM berjalan; CHECK
--     hanya menyiapkan jalurnya.
do $$
declare
  r record;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_ai_runs'::regclass
      and conname = 'pf_ai_runs_agen_check_v8'
  ) then
    return;
  end if;
  for r in
    select conname from pg_constraint
    where conrelid = 'public.pf_ai_runs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%agen%'
  loop
    execute 'alter table public.pf_ai_runs drop constraint ' || quote_ident(r.conname);
  end loop;
  alter table public.pf_ai_runs
    add constraint pf_ai_runs_agen_check_v8
    check (agen in (
      'research', 'source_analysis', 'fact_verification', 'summarization',
      'article_writing', 'translation', 'trend_analysis', 'daily_brief',
      'data_analysis', 'editorial_quality',
      'story_clustering', 'podcast_script', 'research_synthesis'
    ));
end $$;

-- ============================================================
-- 6. D1–D2 — CHECK panjang array + rentang koordinat
-- ============================================================
-- D1: pf_quiz_questions.opsi wajib array 1..10 butir (sebelumnya
-- hanya divalidasi di aplikasi). Kunci 0..4 sudah dicek v6.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_quiz_questions'::regclass
      and conname = 'pf_quiz_questions_opsi_panjang_check_v8'
  ) then
    alter table public.pf_quiz_questions
      add constraint pf_quiz_questions_opsi_panjang_check_v8
      check (jsonb_typeof(opsi) = 'array' and jsonb_array_length(opsi) between 1 and 10);
  end if;
end $$;

-- D2: lintang -90..90, bujur -180..180 — di pf_events dan
-- pf_articles (kolom artikel ditambah v6). NULL tetap boleh
-- (koordinat belum terverifikasi); peta hanya menampilkan
-- yang non-null.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_events'::regclass
      and conname = 'pf_events_lintang_check_v8'
  ) then
    alter table public.pf_events
      add constraint pf_events_lintang_check_v8
      check (lintang is null or (lintang >= -90 and lintang <= 90));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_events'::regclass
      and conname = 'pf_events_bujur_check_v8'
  ) then
    alter table public.pf_events
      add constraint pf_events_bujur_check_v8
      check (bujur is null or (bujur >= -180 and bujur <= 180));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_articles'::regclass
      and conname = 'pf_articles_lintang_check_v8'
  ) then
    alter table public.pf_articles
      add constraint pf_articles_lintang_check_v8
      check (lintang is null or (lintang >= -90 and lintang <= 90));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_articles'::regclass
      and conname = 'pf_articles_bujur_check_v8'
  ) then
    alter table public.pf_articles
      add constraint pf_articles_bujur_check_v8
      check (bujur is null or (bujur >= -180 and bujur <= 180));
  end if;
end $$;

-- D3: validasi target pf_followed_topics dilakukan di API
-- (POST/DELETE /api/topik — validasiTarget): kategori wajib
-- slug taksonomi yang dikenal; negara/isu wajib huruf/spasi/
-- tanda hubung saja (tanpa angka/URL/simbol). FK penuh ditunda
-- ke Gelombang 2 (butuh tabel pf_countries).

-- ============================================================
-- 7. Area 7 (My Prata) — pf_user_preferences
-- ============================================================
-- Preferensi personal per pengguna (satu baris per akun):
-- digest harian, notifikasi topik, notifikasi koreksi, dan
-- tampil publik profil. Ditulis/dibaca pemiliknya sendiri
-- lewat GET/PATCH /api/saya/preferensi (session client, RLS
-- menegakkan user_id = auth.uid()). Tanpa policy baca publik.
create table if not exists public.pf_user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  digest_harian boolean not null default true,
  notifikasi_topik boolean not null default true,
  notifikasi_koreksi boolean not null default true,
  tampilkan_profil_publik boolean not null default false,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

create index if not exists pf_user_preferences_user_idx
  on public.pf_user_preferences (user_id);

drop trigger if exists pf_user_preferences_set_updated_at on public.pf_user_preferences;
create trigger pf_user_preferences_set_updated_at
  before update on public.pf_user_preferences
  for each row execute function public.pf_set_updated_at();

alter table public.pf_user_preferences enable row level security;

drop policy if exists "pf_user_preferences baca pemilik" on public.pf_user_preferences;
create policy "pf_user_preferences baca pemilik"
  on public.pf_user_preferences for select using (auth.uid() = user_id);

drop policy if exists "pf_user_preferences tambah pemilik" on public.pf_user_preferences;
create policy "pf_user_preferences tambah pemilik"
  on public.pf_user_preferences for insert with check (auth.uid() = user_id);

drop policy if exists "pf_user_preferences ubah pemilik" on public.pf_user_preferences;
create policy "pf_user_preferences ubah pemilik"
  on public.pf_user_preferences for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- TIDAK ADA policy delete pengguna dan TIDAK ADA policy baca
-- publik — preferensi hanya milik pengguna login yang membuatnya.

-- ============================================================
-- 8. Area 3 (Multi-Source View) — kolom pf_article_sources
-- ============================================================
-- peran: kedudukan sumber dalam artikel (utama = sumber awal
-- yang pertama dipakai; koroborasi = menguatkan klaim yang
-- sama; konteks = latar; bantahan = menyampaikan sudut
-- berbeda). kutipan: kutipan singkat dari sumber itu.
alter table public.pf_article_sources
  add column if not exists peran text
    check (peran is null or peran in ('utama', 'koroborasi', 'konteks', 'bantahan'));
alter table public.pf_article_sources
  add column if not exists kutipan text;

-- ============================================================
-- 9. Area 13 (Public Report) — perluasan pf_correction_reports
-- ============================================================
-- 9a. CHECK jenis: 4 nilai v2 dipertahankan + 5 jenis laporan
--     masyarakat (AUDIT-EXPANSION.md §0): kesalahan_informasi,
--     sumber_tidak_valid, gambar_tidak_sesuai, duplikat,
--     perlu_pembaruan.
do $$
declare
  r record;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_correction_reports'::regclass
      and conname = 'pf_correction_reports_jenis_check_v8'
  ) then
    return;
  end if;
  for r in
    select conname from pg_constraint
    where conrelid = 'public.pf_correction_reports'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%jenis%'
  loop
    execute 'alter table public.pf_correction_reports drop constraint ' || quote_ident(r.conname);
  end loop;
  alter table public.pf_correction_reports
    add constraint pf_correction_reports_jenis_check_v8
    check (jenis in (
      'fakta_salah', 'sumber', 'typo', 'lainnya',
      'kesalahan_informasi', 'sumber_tidak_valid', 'gambar_tidak_sesuai',
      'duplikat', 'perlu_pembaruan'
    ));
end $$;

-- 9b. artikel_id boleh NULL: laporan masyarakat tidak selalu
--     menunjuk satu artikel (mis. laporan duplikat antar-artikel
--     atau tautan yang tidak dapat dipetakan ke slug). Laporan
--     koreksi lama (POST /api/laporan) tetap wajib artikel_id —
--     itu ditegakkan di API, bukan lagi di skema.
alter table public.pf_correction_reports
  alter column artikel_id drop not null;

-- 9c. pelapor_email: email opsional pelapor laporan masyarakat
--     (untuk kabar tindak lanjut). Kolom `email` lama tetap
--     dipakai alur koreksi artikel (POST /api/laporan); alur
--     baru (POST /api/laporan-publik) menulis ke pelapor_email,
--     dan tampilan admin memakai pelapor_email ?? email.
alter table public.pf_correction_reports
  add column if not exists pelapor_email text;

-- 9d. nomor_lacak: kode lacak unik untuk pelapor (format
--     'PF-' + 8 karakter, dibuat API). Pelapor melacak status
--     lewat GET /api/laporan-publik?nomor=... — yang dibaca
--     publik HANYA status + jenis, tanpa data pelapor.
alter table public.pf_correction_reports
  add column if not exists nomor_lacak text unique;

create index if not exists pf_correction_reports_nomor_lacak_idx
  on public.pf_correction_reports (nomor_lacak);

-- 9e. tautan_artikel: tautan artikel yang dilaporkan (bila
--     pelapor menyertakannya dan tidak dapat dipetakan ke
--     artikel_id). Disimpan apa adanya; tidak diverifikasi
--     sebagai artikel PRATA FAKTA.
alter table public.pf_correction_reports
  add column if not exists tautan_artikel text;

-- ============================================================
-- Verifikasi sesudah menjalankan (jalankan terpisah di SQL Editor):
--   select 'pf_user_preferences' as tabel, count(*) from public.pf_user_preferences;
-- Ekspektasi: 0 (tanpa seed data operasional).
-- Cek RLS + policy:
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename like 'pf_%'
--   order by tablename;
--   select count(*) from pg_policies
--   where schemaname = 'public' and tablename like 'pf_%';
-- Ekspektasi: 37 tabel pf_* ber-RLS (36 dari v1–v7 + 1 dari v8),
--   total policy 79 (79 dari v1–v7 − 3 policy insert anonim T5
--   + 3 policy pf_user_preferences = 79; penggantian policy T8
--   dan Area 1 tidak mengubah jumlah).
-- Cek negatif T5 (sebagai anon, lewat REST atau SQL dengan
-- SET ROLE anon): INSERT ke pf_newsletter_subscribers /
-- pf_correction_reports / pf_questions DITOLAK (42501).
-- Cek negatif T1-sisa: SELECT kunci FROM pf_quiz_questions
-- sebagai anon/authenticated DITOLAK (42501); kolom lain tetap
-- bisa dibaca publik.
-- ============================================================
