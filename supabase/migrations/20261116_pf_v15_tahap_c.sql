-- ============================================================
-- Migrasi v15 — Tahap C PRATA FAKTA: sisa keterbatasan pasca-B2
-- (16 Nov 2026). Jalankan SETELAH v14. Idempoten: aman
-- dijalankan dua kali berturut-turut (semua objek memakai
-- IF NOT EXISTS / drop-if-exists / do-block bersyarat).
--
-- Isi:
--   §1 pf_quiz_daily_answers — jawaban kuis harian tersimpan
--      (Tahap C-3): /api/kuis/jawab menyimpan jawaban pengguna
--      login; /api/kuis/skor menghitung skor server dari jawaban
--      ini, BUKAN dari angka klien. Tanpa tabel ini skor klien
--      tidak bisa diverifikasi — celah yang sama seperti L-B1
--      (Academy) sebelum B2.
--   §2 Trigger pf_hitung_skor_harian — lapis kedua penutup
--      celah skor harian (pola yang sama seperti trigger v14
--      pf_hitung_skor_progres): INSERT/UPDATE langsung ke
--      pf_quiz_scores lewat REST (policy pemilik v7) DIHITUNG
--      ULANG dari jawaban tersimpan; tulis tanpa jawaban
--      tersimpan DITOLAK (raise exception). Skor lama yang
--      sudah tersimpan TIDAK disentuh trigger (hanya
--      INSERT/UPDATE baru) — riwayat lama tetap terbaca.
--   §3 pf_articles.isu — kolom isu artikel (Tahap C-5):
--      pengikut topik tipe 'isu' (CHECK v6 sudah mengizinkan
--      tipe 'isu' di pf_followed_topics sejak awal; yang hilang
--      hanya kolom di artikel + pencocokan di penulis
--      notifikasi). Nilai diisi staf lewat PATCH artikel.
--   §4 CHECK audit v15: 57 aksi v14 + 2 aksi Tahap C
--      ('akademi.soal.buat', 'akademi.sertifikat.cabut').
--   §5 GRANT eksplisit tabel baru (pelajaran F4/B1: tanpa
--      GRANT, service role mati 42501 di produksi).
--
-- ROLLBACK (bila v15 harus dibatalkan sebelum dipakai):
--   drop trigger if exists pf_quiz_scores_skor_harian_server
--     on public.pf_quiz_scores;
--   drop function if exists public.pf_hitung_skor_harian();
--   drop table if exists public.pf_quiz_daily_answers;
--   alter table public.pf_articles drop column if exists isu;
--   (CHECK audit kembali ke v14: jalankan ulang blok §5b v14.)
--   Rollback HANYA aman bila belum ada skor harian yang
--   bergantung pada jawaban tersimpan — sesudah dipakai,
--   jangan drop tabel jawaban (riwayat skor ikut hilang).
-- ============================================================

-- ==================== §1. pf_quiz_daily_answers ====================
-- Satu baris per (pengguna, soal, tanggal). Jawaban HANYA
-- ditulis service role di /api/kuis/jawab (tidak ada policy
-- INSERT/UPDATE/DELETE pengguna — pola yang sama seperti
-- pf_quiz_user_answers v14: pengguna yang menulis langsung
-- lewat REST tidak bisa memalsukan `benar`). Pemilik hanya
-- bisa SELECT baris sendiri (riwayat jawaban sendiri).
create table if not exists public.pf_quiz_daily_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  soal_id uuid not null references public.pf_quiz_questions (id) on delete cascade,
  tanggal date not null,
  jawaban integer not null check (jawaban between 0 and 4),
  benar boolean not null,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now(),
  unique (user_id, soal_id, tanggal)
);
create index if not exists pf_quiz_daily_answers_user_tanggal_idx
  on public.pf_quiz_daily_answers (user_id, tanggal);
drop trigger if exists pf_quiz_daily_answers_set_updated_at on public.pf_quiz_daily_answers;
create trigger pf_quiz_daily_answers_set_updated_at before update on public.pf_quiz_daily_answers for each row execute function public.pf_set_updated_at();
alter table public.pf_quiz_daily_answers enable row level security;
drop policy if exists "pf_quiz_daily_answers baca sendiri" on public.pf_quiz_daily_answers;
create policy "pf_quiz_daily_answers baca sendiri"
  on public.pf_quiz_daily_answers for select using (auth.uid() = user_id);
revoke all on public.pf_quiz_daily_answers from public;
revoke all on public.pf_quiz_daily_answers from anon, authenticated;
grant select on public.pf_quiz_daily_answers to authenticated;
grant select, insert, update, delete on public.pf_quiz_daily_answers to service_role;

-- ==================== §2. Trigger skor harian server-side ====================
-- BEFORE INSERT OR UPDATE pada pf_quiz_scores: hitung ulang
-- benar/total dari jawaban tersimpan + jumlah soal tanggal itu.
-- Menolak (raise exception) bila tanggal itu tidak punya soal
-- sama sekali — skor tanpa soal adalah data sampah. Bila soal
-- ada tetapi pengguna belum menjawab satu pun, benar = 0 dan
-- total = jumlah soal (skor 0 yang jujur, bukan penolakan —
-- route /api/kuis/skor sendiri yang menolak 409 bila jawaban
-- tersimpan belum lengkap; trigger tidak boleh menggagalkan
-- upsert route yang sah).
create or replace function public.pf_hitung_skor_harian()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_total int;
  v_benar int;
begin
  select count(*) into v_total
    from public.pf_quiz_questions
    where tanggal = new.tanggal;
  if v_total = 0 then
    raise exception 'tidak ada soal kuis untuk tanggal %', new.tanggal;
  end if;
  select count(*) filter (where benar is true) into v_benar
    from public.pf_quiz_daily_answers
    where user_id = new.user_id and tanggal = new.tanggal;
  new.total := v_total;
  new.benar := v_benar;
  return new;
end;
$$;
drop trigger if exists pf_quiz_scores_skor_harian_server on public.pf_quiz_scores;
create trigger pf_quiz_scores_skor_harian_server
  before insert or update on public.pf_quiz_scores
  for each row execute function public.pf_hitung_skor_harian();

-- ==================== §3. pf_articles.isu ====================
-- Isu/topik artikel (teks bebas, maks 120 karakter — sama
-- seperti batas target topik di /api/topik). NULL = artikel
-- tidak terikat isu tertentu. Diisi staf lewat PATCH artikel;
-- penulis notifikasi mencocokkan pengikut tipe 'isu' dengan
-- ilike terhadap nilai ini (lihat lib/notifikasi/tulis.ts).
alter table public.pf_articles add column if not exists isu text;
comment on column public.pf_articles.isu is
  'Tahap C-5: isu artikel untuk notifikasi pengikut topik tipe isu (v15).';
create index if not exists pf_articles_isu_idx
  on public.pf_articles (isu) where isu is not null;

-- ==================== §4. CHECK audit v15 ====================
-- 57 aksi v14 + 2 aksi Tahap C. Pola yang sama seperti v14 §5b:
-- ganti SEMUA CHECK aksi lama (drop semua constraint CHECK yang
-- menyebut 'aksi'), lalu pasang CHECK v15. Do-block bersyarat
-- agar aman diulang.
do $$
declare
  r record;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_audit_logs'::regclass
      and conname = 'pf_audit_logs_aksi_check_v15'
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
    add constraint pf_audit_logs_aksi_check_v15
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
      'akun.hapus.minta', 'akun.hapus', 'akun.hapus.gagal', 'data.hapus'
    ));
end $$;
