-- ============================================================
-- PRATA FAKTA — Migrasi v14: Gelombang B2 (evaluasi ulang
-- keterbatasan Tahap A) — 2026-11-16
--
-- Merakit DDL PERSIS dari kelima agen B2 (masing-masing sudah
-- diuji inline 2x idempoten di baterainya):
--   §1 B2-E (Ask the World + Terjemahan): kolom draf di
--        pf_questions + index antrean draf.
--   §2 B2-C (Podcast TTS Piper): 2 kolom audio di
--        pf_podcast_episodes. TTS server tetap BELUM BISA
--        (lisensi suara id_ID tidak jelas) — kolom ini untuk
--        unggahan manual + workflow bila suara berlisensi ada.
--   §3 B2-B (Academy): jenis soal, jawaban kuis tersimpan,
--        sertifikat internal, trigger skor server-side.
--   §4 B2-D (Notifikasi + Analytics): jenis notifikasi baru +
--        dedup, kolom preferensi, push, kunjungan, galat, RPC.
--   §5 B2-A (Akun & Privasi): jejak hapus akun, CHECK audit
--        v14 (57 aksi), policy + GRANT DELETE pemilik.
--
-- URUTAN CUTOVER: terapkan v14 SESUDAH deploy kode B2 —
-- select episode kini memuat audio_bytes/tts_suara dan select
-- pertanyaan memuat jawaban_draf (tanpa v14: PGRST204).
-- Sebaliknya route hapus akun/data + jawab kuis + progres
-- menjawab 503 jujur bila tabel v14 belum ada (fail-closed).
--
-- Idempoten (2x). RLS + GRANT eksplisit sejak awal (pelajaran
-- F4 + §10 v13): SETIAP tabel baru di bawah ini punya GRANT
-- service_role eksplisit; tidak ada blanket grant.
-- JANGAN ubah migrasi v1–v13.
-- ============================================================

-- ==================== §1. B2-E: draf Ask the World ====================
alter table public.pf_questions
  add column if not exists jawaban_draf text;
alter table public.pf_questions
  add column if not exists referensi_draf jsonb not null default '[]';
alter table public.pf_questions
  add column if not exists draf_dibuat_pada timestamptz;
create index if not exists pf_questions_draf_menunggu_idx
  on public.pf_questions (dibuat_pada)
  where status = 'menunggu' and jawaban_draf is null;

-- ==================== §2. B2-C: kolom audio podcast ====================
alter table public.pf_podcast_episodes
  add column if not exists audio_bytes bigint,
  add column if not exists tts_suara text;

-- ==================== §3. B2-B: Academy ====================
-- v14 (Gelombang B2-B): Academy — jawaban kuis tersimpan, jenis
-- soal, sertifikat internal + trigger skor server-side.
alter table public.pf_quiz_questions
  add column if not exists jenis text not null default 'pilihan_ganda'
  check (jenis in ('pilihan_ganda', 'pilihan_ganda_kompleks', 'isian_singkat', 'benar_salah', 'esai'));

-- CHECK opsi v8 (1..10 butir) tidak berlaku untuk soal tanpa
-- opsi (isian_singkat/esai): ganti dengan CHECK v14 yang
-- membebaskan kedua jenis itu (opsi tetap harus array).
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'pf_quiz_questions_opsi_panjang_check_v8') then
    alter table public.pf_quiz_questions drop constraint pf_quiz_questions_opsi_panjang_check_v8;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pf_quiz_questions_opsi_panjang_check_v14') then
    alter table public.pf_quiz_questions
      add constraint pf_quiz_questions_opsi_panjang_check_v14
      check (jsonb_typeof(opsi) = 'array' and (jenis in ('isian_singkat', 'esai') or jsonb_array_length(opsi) between 1 and 10));
  end if;
end $$;

alter table public.pf_quiz_answers alter column kunci drop not null;
alter table public.pf_quiz_answers add column if not exists kunci_teks text;
alter table public.pf_quiz_answers add column if not exists kunci_jamaks integer[];
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pf_quiz_answers_minimal_satu_kunci') then
    alter table public.pf_quiz_answers add constraint pf_quiz_answers_minimal_satu_kunci
      check (kunci is not null or kunci_teks is not null or kunci_jamaks is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pf_quiz_answers_kunci_jamaks_rentang') then
    alter table public.pf_quiz_answers add constraint pf_quiz_answers_kunci_jamaks_rentang
      check (kunci_jamaks is null or kunci_jamaks <@ array[0,1,2,3,4]);
  end if;
end $$;

create table if not exists public.pf_quiz_user_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id uuid not null references public.pf_course_lessons (id) on delete cascade,
  soal_id uuid not null references public.pf_quiz_questions (id) on delete cascade,
  jenis text not null check (jenis in ('pilihan_ganda', 'pilihan_ganda_kompleks', 'isian_singkat', 'benar_salah', 'esai')),
  jawaban jsonb not null,
  benar boolean,
  status_penilaian text not null default 'otomatis' check (status_penilaian in ('otomatis', 'menunggu_penilaian', 'dinilai')),
  dinilai_oleh uuid references auth.users (id) on delete set null,
  dinilai_pada timestamptz,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now(),
  unique (user_id, lesson_id, soal_id),
  constraint pf_quiz_user_answers_benar_konsisten
    check ((status_penilaian = 'menunggu_penilaian') = (benar is null))
);
create index if not exists pf_quiz_user_answers_user_lesson_idx on public.pf_quiz_user_answers (user_id, lesson_id);
drop trigger if exists pf_quiz_user_answers_set_updated_at on public.pf_quiz_user_answers;
create trigger pf_quiz_user_answers_set_updated_at before update on public.pf_quiz_user_answers for each row execute function public.pf_set_updated_at();
alter table public.pf_quiz_user_answers enable row level security;
drop policy if exists "pf_quiz_user_answers baca sendiri" on public.pf_quiz_user_answers;
create policy "pf_quiz_user_answers baca sendiri" on public.pf_quiz_user_answers for select using (auth.uid() = user_id);
revoke all on public.pf_quiz_user_answers from public;
revoke all on public.pf_quiz_user_answers from anon, authenticated;
grant select on public.pf_quiz_user_answers to authenticated;
grant select, insert, update, delete on public.pf_quiz_user_answers to service_role;

create table if not exists public.pf_certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid not null references public.pf_courses (id) on delete cascade,
  kode_verifikasi text not null unique check (kode_verifikasi ~ '^[A-Z0-9]{12}$'),
  nama_kursus text not null,
  nama_peserta text,
  kriteria jsonb not null default '{}'::jsonb,
  diterbitkan_pada timestamptz not null default now(),
  dicabut boolean not null default false,
  dicabut_pada timestamptz,
  dicabut_alasan text,
  unique (user_id, course_id)
);
create index if not exists pf_certificates_user_idx on public.pf_certificates (user_id);
alter table public.pf_certificates enable row level security;
drop policy if exists "pf_certificates baca sendiri" on public.pf_certificates;
create policy "pf_certificates baca sendiri" on public.pf_certificates for select using (auth.uid() = user_id);
revoke all on public.pf_certificates from public;
revoke all on public.pf_certificates from anon, authenticated;
grant select on public.pf_certificates to authenticated;
grant select, insert, update, delete on public.pf_certificates to service_role;

create or replace function public.pf_hitung_skor_progres()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_jenis text;
  v_jumlah_jawaban int;
  v_benar int;
begin
  select jenis into v_jenis from public.pf_course_lessons where id = new.lesson_id;
  if v_jenis is null then return new; end if;
  if v_jenis = 'kuis' then
    select count(*), count(*) filter (where benar is true)
      into v_jumlah_jawaban, v_benar
      from public.pf_quiz_user_answers
      where user_id = new.user_id and lesson_id = new.lesson_id;
    if new.selesai and v_jumlah_jawaban = 0 then
      raise exception 'pelajaran kuis belum dijawab';
    end if;
    new.skor := v_benar;
  else
    new.skor := null;
  end if;
  return new;
end;
$$;
drop trigger if exists pf_course_progress_skor_server on public.pf_course_progress;
create trigger pf_course_progress_skor_server
  before insert or update on public.pf_course_progress
  for each row execute function public.pf_hitung_skor_progres();

-- ==================== §4. B2-D: Notifikasi + Analytics ====================
-- ---------- 4a. pf_notifications: jenis baru + dedup ----------
alter table public.pf_notifications
  drop constraint if exists pf_notifications_jenis_check;
alter table public.pf_notifications
  add constraint pf_notifications_jenis_check
  check (jenis in ('breaking', 'topik', 'brief', 'artikel', 'koreksi', 'peristiwa', 'jawaban', 'podcast'));
alter table public.pf_notifications
  add column if not exists kunci_dedup text;
create unique index if not exists pf_notifications_dedup_idx
  on public.pf_notifications (user_id, kunci_dedup)
  where kunci_dedup is not null;

-- ---------- 4b. pf_user_preferences: kolom baru ----------
alter table public.pf_user_preferences
  add column if not exists notifikasi_jawaban boolean not null default true,
  add column if not exists notifikasi_podcast boolean not null default true,
  add column if not exists push_notifikasi boolean not null default false;

-- ---------- 4c. pf_push_subscriptions ----------
create table if not exists public.pf_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);
create index if not exists pf_push_subscriptions_user_idx
  on public.pf_push_subscriptions (user_id);
alter table public.pf_push_subscriptions enable row level security;
drop policy if exists "pf_push_subscriptions baca pemilik" on public.pf_push_subscriptions;
create policy "pf_push_subscriptions baca pemilik"
  on public.pf_push_subscriptions for select using (auth.uid() = user_id);
drop policy if exists "pf_push_subscriptions tambah pemilik" on public.pf_push_subscriptions;
create policy "pf_push_subscriptions tambah pemilik"
  on public.pf_push_subscriptions for insert with check (auth.uid() = user_id);
drop policy if exists "pf_push_subscriptions ubah pemilik" on public.pf_push_subscriptions;
create policy "pf_push_subscriptions ubah pemilik"
  on public.pf_push_subscriptions for update using (auth.uid() = user_id);
drop policy if exists "pf_push_subscriptions hapus pemilik" on public.pf_push_subscriptions;
create policy "pf_push_subscriptions hapus pemilik"
  on public.pf_push_subscriptions for delete using (auth.uid() = user_id);
-- GRANT tingkat tabel (pola v9): RLS tetap penegak baris.
grant select, insert, update, delete on public.pf_push_subscriptions to authenticated;
grant all on public.pf_push_subscriptions to service_role;

-- ---------- 4d. pf_kunjungan (privasi: HANYA path + user_id + masuk + waktu) ----------
create table if not exists public.pf_kunjungan (
  id uuid primary key default gen_random_uuid(),
  path text not null check (path like '/%'),
  user_id uuid references auth.users (id) on delete set null,
  masuk boolean not null default false,
  dibuat_pada timestamptz not null default now()
);
create index if not exists pf_kunjungan_waktu_idx
  on public.pf_kunjungan (dibuat_pada desc);
create index if not exists pf_kunjungan_path_waktu_idx
  on public.pf_kunjungan (path, dibuat_pada desc);
alter table public.pf_kunjungan enable row level security;
drop policy if exists "pf_kunjungan baca staf" on public.pf_kunjungan;
create policy "pf_kunjungan baca staf"
  on public.pf_kunjungan for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );
-- GRANT select saja (pola v9): tulis HANYA via service role (API),
-- tidak ada policy INSERT untuk pengguna.
grant select on public.pf_kunjungan to anon, authenticated;
grant all on public.pf_kunjungan to service_role;

-- ---------- 4e. pf_app_errors ----------
create table if not exists public.pf_app_errors (
  id uuid primary key default gen_random_uuid(),
  sumber text not null,
  pesan text not null,
  kode text,
  rute text,
  stack text,
  dibuat_pada timestamptz not null default now()
);
create index if not exists pf_app_errors_waktu_idx
  on public.pf_app_errors (dibuat_pada desc);
create index if not exists pf_app_errors_sumber_idx
  on public.pf_app_errors (sumber, dibuat_pada desc);
alter table public.pf_app_errors enable row level security;
drop policy if exists "pf_app_errors baca staf" on public.pf_app_errors;
create policy "pf_app_errors baca staf"
  on public.pf_app_errors for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );
-- GRANT select saja (pola v9): tulis HANYA via service role.
grant select on public.pf_app_errors to anon, authenticated;
grant all on public.pf_app_errors to service_role;

-- Penulis notifikasi (service role) INSERT ke pf_notifications:
-- v9 hanya memberi select+update ke anon/authenticated; service
-- role butuh INSERT eksplisit agar penulis E1 bekerja.
grant select, insert, update, delete on public.pf_notifications to service_role;

-- ---------- 4f. RPC agregasi (security invoker: RLS staf tetap berlaku) ----------
create or replace function public.pf_kunjungan_harian(hari integer default 30)
returns table (tanggal date, kunjungan bigint, pengunjung_masuk bigint)
language sql stable security invoker as $$
  select d::date as tanggal,
         count(k.id) as kunjungan,
         count(distinct k.user_id) as pengunjung_masuk
  from generate_series(current_date - (hari - 1) * interval '1 day', current_date, interval '1 day') as d
  left join public.pf_kunjungan k on k.dibuat_pada::date = d::date
  group by d order by d;
$$;
grant execute on function public.pf_kunjungan_harian(integer) to authenticated, service_role;

create or replace function public.pf_kunjungan_jalur(hari integer default 30, batas integer default 20)
returns table (path text, kunjungan bigint)
language sql stable security invoker as $$
  select k.path, count(*) as kunjungan
  from public.pf_kunjungan k
  where k.dibuat_pada >= current_date - (hari - 1) * interval '1 day'
  group by k.path order by kunjungan desc, k.path asc limit batas;
$$;
grant execute on function public.pf_kunjungan_jalur(integer, integer) to authenticated, service_role;

-- ---------- 4g. Retensi 90 hari ----------
create or replace function public.pf_bersihkan_data_lama()
returns table (kunjungan_dihapus bigint, galat_dihapus bigint)
language plpgsql security definer set search_path = public as $$
declare jml_k bigint; jml_g bigint;
begin
  delete from public.pf_kunjungan where dibuat_pada < now() - interval '90 days';
  get diagnostics jml_k = row_count;
  delete from public.pf_app_errors where dibuat_pada < now() - interval '90 days';
  get diagnostics jml_g = row_count;
  return query select jml_k, jml_g;
end;
$$;
grant execute on function public.pf_bersihkan_data_lama() to service_role;

-- ==================== §5. B2-A: Akun & Privasi ====================
-- ---------- 5a. pf_account_deletions — jejak permintaan + penghapusan akun.
-- user_id SENGAJA TANPA FK ke auth.users: baris ini HARUS bertahan
-- sesudah akun dihapus (bukti penghapusan); FK cascade akan menghapus buktinya sendiri.
create table if not exists public.pf_account_deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'menunggu'
    check (status in ('menunggu', 'dikonfirmasi', 'dihapus', 'gagal', 'dibatalkan')),
  diminta_pada timestamptz not null default now(),
  dipakai_pada timestamptz,
  dihapus_pada timestamptz,
  kedaluwarsa_pada timestamptz not null
);
create index if not exists pf_account_deletions_user_idx
  on public.pf_account_deletions (user_id);
alter table public.pf_account_deletions enable row level security;
revoke all on public.pf_account_deletions from public;
revoke all on public.pf_account_deletions from anon, authenticated;
grant select, insert, update, delete on public.pf_account_deletions to service_role;

-- ---------- 5b. CHECK audit v14: 53 aksi v11 + 4 aksi B2-A.
do $$
declare
  r record;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_audit_logs'::regclass
      and conname = 'pf_audit_logs_aksi_check_v14'
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
    add constraint pf_audit_logs_aksi_check_v14
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
      'podcast.episode', 'podcast.terbit',
      'sistem.flag', 'sistem.pengumuman',
      'kuis.buat', 'kuis.ubah',
      'preferensi.ubah', 'ekspor.data',
      'sumber.buat', 'sumber.ubah', 'sumber.hapus', 'sumber.cek', 'sumber.aktif',
      'akun.hapus.minta', 'akun.hapus', 'akun.hapus.gagal', 'data.hapus'
    ));
end $$;

-- ---------- 5c. Policy DELETE pemilik (baru di v14 — belum ada di v1–v13).
drop policy if exists "pf_quiz_scores hapus pemilik" on public.pf_quiz_scores;
create policy "pf_quiz_scores hapus pemilik"
  on public.pf_quiz_scores for delete using (auth.uid() = user_id);
drop policy if exists "pf_notifications hapus pemilik" on public.pf_notifications;
create policy "pf_notifications hapus pemilik"
  on public.pf_notifications for delete using (auth.uid() = user_id);
drop policy if exists "pf_user_preferences hapus pemilik" on public.pf_user_preferences;
create policy "pf_user_preferences hapus pemilik"
  on public.pf_user_preferences for delete using (auth.uid() = user_id);
drop policy if exists "pf_questions hapus pemilik" on public.pf_questions;
create policy "pf_questions hapus pemilik"
  on public.pf_questions for delete using (auth.uid() = user_id);

-- ---------- 5d. GRANT DELETE (v9 hanya memberi SELECT/INSERT/UPDATE
-- pada tabel-tabel ini — policy DELETE tanpa GRANT tetap
-- ditolak 42501 "permission denied"). Hanya authenticated
-- (pemilik, via policy); anon tidak diberi apa pun.
grant delete on public.pf_quiz_scores to authenticated;
grant delete on public.pf_notifications to authenticated;
grant delete on public.pf_user_preferences to authenticated;
grant delete on public.pf_questions to authenticated;
