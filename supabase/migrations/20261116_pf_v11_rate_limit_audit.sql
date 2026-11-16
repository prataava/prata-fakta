-- ============================================================
-- PRATA FAKTA — Migrasi v11: Tahap 13A (T3 + T10)
-- Berkas: 20261116_pf_v11_rate_limit_audit.sql
-- Proyek Supabase: 'prata' (dipakai bersama PRATA & TASIK JAYA)
-- Cara menjalankan: Supabase Dashboard → SQL Editor → tempel
-- seluruh berkas → Run. (DDL tidak bisa dijalankan dari VM:
-- anon key tidak bisa DDL, service_role key & DATABASE_URL tidak
-- tersedia di workspace — lihat ARSITEKTUR.md.)
-- Berkas ini IDEMPOTEN: CREATE TABLE IF NOT EXISTS, CREATE OR
-- REPLACE FUNCTION, do-block bersyarat untuk CHECK — aman
-- dijalankan ulang.
-- KETERGANTUNGAN: WAJIB jalankan migrasi v1–v10 DULU. Memakai:
-- pf_audit_logs + CHECK-nya (v5/v8/v9).
--
-- ISI (Tahap 13A — keamanan T3 + T10):
--   §1  Tabel pf_rate_limits: store bersama rate limiter
--       (pengganti Map in-memory per instance di
--       src/lib/ai/route-auth.ts, temuan T3 TERBUKA).
--   §2  RPC SECURITY DEFINER pf_rate_limit_check: increment
--       atomik satu pernyataan (INSERT ... ON CONFLICT DO
--       UPDATE), jendela waktu tetap, hapus baris kadaluarsa.
--   §3  Perluasan CHECK pf_audit_logs (v11): 6 aksi baru —
--       sumber.buat/sumber.ubah/sumber.hapus/sumber.cek/
--       sumber.aktif (CRUD + pemeriksaan sumber, temuan T10
--       TERBUKA) dan negara.hapus (DELETE negara/fakta di
--       /api/admin/negara/[id] sebelumnya tak punya aksi).
--       Total 53 aksi (47 dari v9 + 6).
--   §4  GRANT eksplisit (pelajaran F4 — v9): REVOKE akses
--       langsung tabel pf_rate_limits dari anon +
--       authenticated (TIDAK ADA policy: akses hanya lewat
--       RPC); GRANT EXECUTE RPC ke anon + authenticated.
-- SEED: TIDAK ADA.
-- JUMLAH: 1 tabel baru → total 54 tabel pf_*; policy tetap
-- 106 (v11 TIDAK menambah/mengubah policy).
-- ============================================================

-- ============================================================
-- §1. Tabel pf_rate_limits (T3)
-- ============================================================
-- Satu baris per kunci limit ("ip:<alamat>" atau "user:<uuid>")
-- per jendela waktu. Hitungan di-increment atomik oleh RPC §2;
-- tidak ada kode aplikasi yang menulis tabel ini langsung.
-- Kunci TIDAK memakai user id mentah saja agar tidak tertukar
-- dengan kunci IP; awalan "ip:"/"user:" ditulis pemanggil
-- (src/lib/ai/route-auth.ts: kunciRateLimit).
create table if not exists public.pf_rate_limits (
  kunci text primary key,
  hitungan integer not null default 1 check (hitungan >= 1),
  jendela_detik integer not null check (jendela_detik > 0),
  jendela_mulai timestamptz not null default now()
);
comment on table public.pf_rate_limits is
  'Store bersama rate limiter lintas instance serverless (Tahap 13A, T3). Ditulis HANYA oleh RPC pf_rate_limit_check; akses langsung ditolak (tanpa policy).';
create index if not exists pf_rate_limits_jendela_idx
  on public.pf_rate_limits (jendela_mulai);

alter table public.pf_rate_limits enable row level security;

-- TANPA policy sama sekali: SELECT/INSERT/UPDATE/DELETE langsung
-- dari anon/authenticated DITOLAK RLS. Satu-satunya jalan masuk
-- adalah RPC SECURITY DEFINER §2 (bypass RLS sebagai pemilik
-- fungsi). GRANT eksplisit sejak awal (pelajaran F4): cabut
-- akses langsung yang mungkin ada, jangan andalkan default.
revoke all on table public.pf_rate_limits from anon, authenticated;

-- ============================================================
-- §2. RPC pf_rate_limit_check (T3)
-- ============================================================
-- Mengembalikan true bila panggilan ini MASIH dalam batas
-- (hitungan sesudah increment <= p_batas), false bila melewati.
-- Jendela waktu TETAP (fixed window): bila jendela lama sudah
-- lewat, hitungan kembali ke 1 dan jendela mulai dari sekarang.
-- ATOMIK: satu pernyataan INSERT ... ON CONFLICT DO UPDATE —
-- dua panggilan bersamaan diserialkan oleh kunci baris, jadi
-- tidak ada dua panggilan yang lolos bersamaan melewati batas
-- (diuji di scripts/uji-tahap13a.mjs: 2 panggilan paralel pada
-- batas 1 → tepat 1 lolos).
-- Argumen tidak valid (kunci kosong, batas/jendela < 1) → false
-- (fail-closed di dalam RPC: tolak, jangan izinkan).
-- search_path dipatok ke public (pelajaran T6: cegah hijack
-- lewat search_path).
create or replace function public.pf_rate_limit_check(
  p_kunci text,
  p_batas integer,
  p_jendela_detik integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sekarang timestamptz := now();
  v_hitungan integer;
begin
  if p_kunci is null or btrim(p_kunci) = '' or p_batas < 1 or p_jendela_detik < 1 then
    return false;
  end if;

  -- Bersihkan baris kadaluarsa (oportunistik, di tiap panggilan)
  -- agar tabel tidak tumbuh tanpa batas. Baris yang jendelanya
  -- sudah lewat tidak pernah dipakai lagi.
  delete from public.pf_rate_limits
  where jendela_mulai + make_interval(secs => jendela_detik) < v_sekarang;

  insert into public.pf_rate_limits (kunci, hitungan, jendela_detik, jendela_mulai)
  values (p_kunci, 1, p_jendela_detik, v_sekarang)
  on conflict (kunci) do update set
    hitungan = case
      when pf_rate_limits.jendela_mulai + make_interval(secs => pf_rate_limits.jendela_detik) <= v_sekarang
      then 1
      else pf_rate_limits.hitungan + 1
    end,
    jendela_detik = excluded.jendela_detik,
    jendela_mulai = case
      when pf_rate_limits.jendela_mulai + make_interval(secs => pf_rate_limits.jendela_detik) <= v_sekarang
      then v_sekarang
      else pf_rate_limits.jendela_mulai
    end
  returning hitungan into v_hitungan;

  return v_hitungan <= p_batas;
end;
$$;

revoke execute on function public.pf_rate_limit_check(text, integer, integer) from public;
grant execute on function public.pf_rate_limit_check(text, integer, integer) to anon, authenticated;

-- ============================================================
-- §3. Perluasan CHECK aksi audit (T10)
-- ============================================================
-- Pola sama seperti v9 §6: bila constraint v11 sudah ada,
-- lewati; bila belum, buang CHECK lama yang menyebut kolom aksi
-- (termasuk pf_audit_logs_aksi_check_v9), lalu tambah CHECK baru
-- bernama eksplisit dengan 53 aksi (47 dari v9 + 6 baru).
-- Aksi baru:
--   sumber.buat / sumber.ubah / sumber.hapus — CRUD sumber
--     (POST/PATCH/DELETE /api/sumber, sebelumnya 0 audit);
--   sumber.aktif — aktif/nonaktif sumber (PATCH {aktif},
--     dipisah dari sumber.ubah agar perubahan status mudah
--     dilacak di /admin/audit);
--   sumber.cek — pemeriksaan koneksi sumber
--     (POST /api/sumber/[id]/cek, menulis terakhir_cek);
--   negara.hapus — hapus negara/fakta
--     (DELETE /api/admin/negara/[id]; sebelumnya tak punya
--     aksi — negara.buat/negara.ubah saja yang ada).
-- Aman diulang.
do $$
declare
  r record;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_audit_logs'::regclass
      and conname = 'pf_audit_logs_aksi_check_v11'
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
    add constraint pf_audit_logs_aksi_check_v11
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
      'sumber.buat', 'sumber.ubah', 'sumber.hapus', 'sumber.cek', 'sumber.aktif'
    ));
end $$;

-- ============================================================
-- Verifikasi sesudah menjalankan (jalankan terpisah di SQL Editor):
--   select count(*) from pg_tables
--   where schemaname = 'public' and tablename like 'pf_%';
-- Ekspektasi: 54 (53 dari v1–v10 + 1 pf_rate_limits).
--   select count(*) from pg_tables
--   where schemaname = 'public' and tablename like 'pf_%' and rowsecurity;
-- Ekspektasi: 54.
--   select count(*) from pg_policies
--   where schemaname = 'public' and tablename like 'pf_%';
-- Ekspektasi: 106 (v11 TIDAK menambah/mengubah policy).
--   select count(*) from pg_policies
--   where schemaname = 'public' and tablename = 'pf_rate_limits';
-- Ekspektasi: 0 (akses langsung ditolak; hanya RPC).
--   select has_table_privilege('anon', 'public.pf_rate_limits', 'SELECT'),
--          has_table_privilege('authenticated', 'public.pf_rate_limits', 'SELECT');
-- Ekspektasi: false, false (REVOKE eksplisit §1).
--   select proname from pg_proc where proname = 'pf_rate_limit_check';
-- Ekspektasi: 1 baris.
--   select conname from pg_constraint
--   where conrelid = 'public.pf_audit_logs'::regclass
--     and conname = 'pf_audit_logs_aksi_check_v11';
-- Ekspektasi: 1 baris (53 aksi).
-- Cek negatif (sebagai anon, lewat REST atau SET ROLE anon):
--   SELECT * FROM pf_rate_limits DITOLAK (42501 — tanpa policy);
--   INSERT ke pf_rate_limits DITOLAK (42501).
-- Cek positif (sebagai anon atau authenticated):
--   select pf_rate_limit_check('uji:1', 1, 60); → true (panggilan 1);
--   select pf_rate_limit_check('uji:1', 1, 60); → false (melewati batas).
-- ============================================================
