-- ============================================================
-- PRATA FAKTA — Migrasi v13: Ultimate Backend (Gelombang B1)
-- Berkas: 20261116_pf_v13_ultimate.sql
-- Proyek Supabase: 'prata' (dipakai bersama PRATA & TASIK JAYA)
-- Cara menjalankan: Supabase Dashboard → SQL Editor → tempel
-- seluruh berkas → Run. (DDL tidak bisa dijalankan dari VM:
-- anon key tidak bisa DDL, service_role key & DATABASE_URL tidak
-- tersedia di workspace — lihat ARSITEKTUR.md.)
-- Berkas ini IDEMPOTEN: semua CREATE memakai IF NOT EXISTS /
-- CREATE OR REPLACE, semua DROP POLICY memakai IF EXISTS,
-- migrasi data memakai ON CONFLICT DO NOTHING, DROP COLUMN
-- memakai do-block bersyarat — aman dijalankan ulang.
-- KETERGANTUNGAN: WAJIB jalankan migrasi v1–v12 DULU. Memakai:
-- pf_quiz_questions (v6) + REVOKE kunci (v8/v9),
-- pf_courses/pf_course_modules/pf_course_lessons (v10),
-- pf_questions (v6, INSERT publik dicabut v8),
-- pf_research_reports (v10), pf_data_indicators (v6),
-- pf_followed_topics (v6), pf_countries (v1),
-- pf_profiles (v1), pf_system_settings (v10),
-- pf_has_role/pf_is_super_admin (v1, search_path dipatok v7).
--
-- ISI (Audit Ultimate 16 Nov 2026, Gelombang B1):
--   §1  P0-4 (B-T3): tabel pf_quiz_answers — kunci kuis pindah
--       dari kolom pf_quiz_questions.kunci ke tabel terpisah
--       TANPA policy SELECT sama sekali (hanya service role
--       lewat kode; GRANT eksplisit sejak awal, pelajaran F4).
--   §2  P1-4 (B-T4): RPC pf_patch_kursus_atomik — PATCH kursus
--       (modul + pelajaran) dalam satu transaksi.
--   §3  P1-15 (B-S10, L-F2): policy arsip Q&A publik pada
--       pf_questions (publik=true AND status='terjawab').
--   §4  P2-16 (B-S13): pf_research_reports.indikator_id FK +
--       backfill dari slug + fungsi rekonsiliasi
--       pf_topik_yatim() (laporan saja, tidak menghapus).
--   §5  P2-30 (S-11): tegaskan kembali SET search_path = public
--       pada fungsi SECURITY DEFINER v1 (sudah dipatok v7;
--       di sini ditegaskan + diuji).
--   §6  P2-31 (B-R1, S-14): pf_profiles SELECT dibatasi —
--       pemilik atau staf (bukan lagi publik).
--   §7  P2-32 (B-R3): hapus cabang mati pf_has_role('admin')
--       dari policy pf_system_settings.
--   §8  P3-8 (B-R9): RPC pf_ai_status_agregat — agregasi
--       /api/ai/status pindah ke GROUP BY di DB.
--   §9  Integrasi B1 (follow-up agen gate + ingestion):
--       kolom pf_sources.topik_gdelt (P3-3, topik GDELT per
--       sumber) + unique index pf_evidence(klaim_id, sumber_url)
--       (P2-10, menutup race dedup evidence di kode).
--   §10 P0-INTEGRASI (temuan integrasi 16 Nov 2026): GRANT
--       eksplisit SELECT/INSERT/UPDATE/DELETE ke service_role
--       atas SEMUA 55 tabel pf_* — tanpa ini backend mati total
--       di produksi (default Supabase pasca-30 Okt 2026 tidak
--       lagi memberi grant otomatis, bahkan ke service_role).
-- JUMLAH: +1 tabel → total 55 tabel pf_*; +1 policy (arsip)
-- → total 107 policy; +3 fungsi (patch atomik, topik yatim,
-- agregat status AI); +1 kolom (topik_gdelt) + 1 index unik;
-- +55 grant service_role (§10).
-- ROLLBACK: lihat supabase/README.md §v13 + CUTOVER.md §3G.
-- ============================================================

-- ============================================================
-- §1. P0-4 (B-T3): pf_quiz_answers — kunci kuis terpisah
-- ============================================================
-- Alasan: proteksi kolom `kunci` hanya bertumpu pada REVOKE
-- kolom — satu GRANT SELECT atas pf_quiz_questions langsung
-- membocorkan semua kunci. Tabel baru ini TIDAK PUNYA policy
-- SELECT sama sekali: anon/authenticated tidak bisa membaca
-- satu baris pun lewat PostgREST/RLS; satu-satunya jalur baca
-- adalah service role di kode server (dua route kuis/jawab +
-- getKuisHarian). GRANT eksplisit sejak awal (pelajaran F4):
-- hanya service_role yang diberi hak atas tabel ini.
create table if not exists public.pf_quiz_answers (
  id uuid primary key default gen_random_uuid(),
  soal_id uuid not null references public.pf_quiz_questions (id) on delete cascade,
  kunci integer not null check (kunci between 0 and 4),
  dibuat_pada timestamptz not null default now(),
  unique (soal_id)
);

alter table public.pf_quiz_answers enable row level security;

-- Sengaja TIDAK ADA policy apa pun pada tabel ini (bahkan untuk
-- service role — service role melewati RLS). Bila suatu saat
-- ada yang menambah policy SELECT di sini, itu harus dicatat
-- sebagai perubahan keamanan dan diuji ulang.
revoke all on public.pf_quiz_answers from public;
revoke all on public.pf_quiz_answers from anon, authenticated;
grant select, insert, update, delete on public.pf_quiz_answers to service_role;

-- Migrasi data: satu baris jawaban per soal yang sudah ada.
-- ON CONFLICT DO NOTHING agar aman diulang (idempoten).
-- DIBUNGKUS do-block bersyarat: pada run kedua kolom kunci
-- sudah tidak ada (dihapus di bawah) sehingga SELECT tanpa
-- penjaga akan gagal — tanpa penjaga ini v13 TIDAK idempoten
-- (ditemukan saat penulisan baterai uji-ultimate-backend).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pf_quiz_questions'
      and column_name = 'kunci'
  ) then
    insert into public.pf_quiz_answers (soal_id, kunci)
    select id, kunci from public.pf_quiz_questions
    on conflict (soal_id) do nothing;
  end if;
end $$;

-- Hapus kolom kunci dari tabel soal — sesudah ini TIDAK ADA
-- lagi kolom kunci di pf_quiz_questions. Do-block bersyarat
-- agar aman diulang dan aman bila kolom sudah tidak ada.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pf_quiz_questions'
      and column_name = 'kunci'
  ) then
    alter table public.pf_quiz_questions drop column kunci;
  end if;
end $$;

-- ============================================================
-- §2. P1-4 (B-T4): RPC pf_patch_kursus_atomik
-- ============================================================
-- PATCH kursus (field kursus + modul + pelajaran) dalam SATU
-- transaksi: gagal di tengah = tidak ada satu pun baris yang
-- berubah (sebelumnya tulis sekuensial per baris tanpa
-- rollback). Fungsi SECURITY DEFINER + search_path dipatok;
-- HANYA service_role boleh mengeksekusi (route admin memanggil
-- lewat service client; anon/authenticated DITOLAK di gerbang
-- GRANT, bukan hanya di RLS).
--
-- Parameter:
--   p_kursus_id uuid — kursus yang diubah (wajib ada).
--   p_kursus jsonb  — field kursus yang diubah, mis.
--     {"judul": "...", "status": "terbit"}; {} bila tidak ada
--     perubahan field. Hanya kunci yang ada yang ditulis.
--   p_modul jsonb — array entri modul:
--     {id?, kunci?, judul?, deskripsi?, urutan?, hapus?}
--     Tanpa id = tambah baru; `kunci` = kunci sementara
--     pilihan klien (mis. "m1") yang bisa dirujuk pelajaran
--     baru lewat `modul_kunci` — jadi modul baru + pelajaran
--     barunya bisa dikirim dalam SATU panggilan.
--   p_pelajaran jsonb — array entri pelajaran:
--     {id?, module_id?, modul_kunci?, judul?, isi?, jenis?,
--      referensi?, artikel_id?, kuis_tanggal?, urutan?, hapus?}
--     Tanpa id = tambah baru (wajib module_id ATAU modul_kunci).
-- Kembali: {"ok": true} atau {"ok": false, "kode": "...",
-- "id"/"kunci": ...}. Kode galat dipetakan route ke 400/404/
-- 409; galat tak terduga (mis. constraint lain) tetap melempar
-- → 500.
-- ATOMIK SEJATI: fungsi memakai DUA PASS — pass 1 memvalidasi
-- SELURUH entri (kepemilikan, kunci sementara, judul wajib,
-- bentrok slug) SEBELUM satu baris pun ditulis; pass 2 baru
-- menulis. Alasannya: RETURN lebih awal di PL/pgSQL TIDAK
-- me-rollback tulis yang sudah terjadi dalam pemanggilan yang
-- sama — validasi-yang-gagal-di-tengah-pass-tulis akan
-- meninggalkan struktur setengah tertulis (cacat yang sama
-- dengan B-T4). Bila pass 2 menemukan ketidakcocokan akibat
-- perubahan bersamaan (race), ia me-RAISE exception — dan
-- exception MEMBATALKAN seluruh transaksi pemanggilan.
create or replace function public.pf_patch_kursus_atomik(
  p_kursus_id uuid,
  p_kursus jsonb,
  p_modul jsonb,
  p_pelajaran jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modul jsonb;
  v_pelajaran jsonb;
  v_baru_id uuid;
  v_target_modul uuid;
  v_peta jsonb := '{}'::jsonb;
  v_kunci text;
begin
  if not exists (select 1 from public.pf_courses where id = p_kursus_id) then
    return jsonb_build_object('ok', false, 'kode', 'kursus_tidak_ditemukan');
  end if;

  -- ============ PASS 1: validasi seluruh entri ============
  -- 1a. Modul: hapus butuh id + milik kursus; baru wajib judul.
  for v_modul in
    select * from jsonb_array_elements(coalesce(p_modul, '[]'::jsonb))
  loop
    if v_modul ->> 'id' is not null then
      if not exists (
        select 1 from public.pf_course_modules
        where id = (v_modul ->> 'id')::uuid and course_id = p_kursus_id
      ) then
        return jsonb_build_object(
          'ok', false, 'kode', 'modul_bukan_milik_kursus',
          'id', v_modul ->> 'id'
        );
      end if;
    elsif coalesce((v_modul ->> 'hapus')::boolean, false) then
      return jsonb_build_object('ok', false, 'kode', 'modul_tanpa_id');
    elsif v_modul ->> 'judul' is null or btrim(v_modul ->> 'judul') = '' then
      return jsonb_build_object('ok', false, 'kode', 'modul_tanpa_judul');
    end if;
  end loop;

  -- 1b. Pelajaran: hapus/ubah butuh milik kursus; baru wajib
  -- modul tujuan; modul_kunci wajib merujuk kunci modul BARU
  -- di p_modul yang sama; module_id wajib milik kursus ini.
  for v_pelajaran in
    select * from jsonb_array_elements(coalesce(p_pelajaran, '[]'::jsonb))
  loop
    if v_pelajaran ->> 'id' is not null then
      if not exists (
        select 1 from public.pf_course_lessons l
        join public.pf_course_modules m on m.id = l.module_id
        where l.id = (v_pelajaran ->> 'id')::uuid
          and m.course_id = p_kursus_id
      ) then
        return jsonb_build_object(
          'ok', false, 'kode', 'pelajaran_bukan_milik_kursus',
          'id', v_pelajaran ->> 'id'
        );
      end if;
    elsif coalesce((v_pelajaran ->> 'hapus')::boolean, false) then
      return jsonb_build_object('ok', false, 'kode', 'pelajaran_tanpa_id');
    end if;
    if v_pelajaran ->> 'modul_kunci' is not null then
      v_kunci := v_pelajaran ->> 'modul_kunci';
      if not exists (
        select 1 from jsonb_array_elements(coalesce(p_modul, '[]'::jsonb)) m
        where (m.value ->> 'kunci') = v_kunci
          and (m.value ->> 'id') is null
          and not coalesce((m.value ->> 'hapus')::boolean, false)
      ) then
        return jsonb_build_object(
          'ok', false, 'kode', 'modul_kunci_tidak_ditemukan',
          'kunci', v_kunci
        );
      end if;
    elsif v_pelajaran ->> 'module_id' is not null then
      if not exists (
        select 1 from public.pf_course_modules
        where id = (v_pelajaran ->> 'module_id')::uuid
          and course_id = p_kursus_id
      ) then
        return jsonb_build_object(
          'ok', false, 'kode', 'module_id_bukan_milik_kursus',
          'id', v_pelajaran ->> 'module_id'
        );
      end if;
    elsif (v_pelajaran ->> 'id') is null
      and not coalesce((v_pelajaran ->> 'hapus')::boolean, false) then
      return jsonb_build_object('ok', false, 'kode', 'pelajaran_tanpa_modul');
    end if;
    if (v_pelajaran ->> 'id') is null
      and not coalesce((v_pelajaran ->> 'hapus')::boolean, false)
      and (v_pelajaran ->> 'judul' is null or btrim(v_pelajaran ->> 'judul') = '') then
      return jsonb_build_object('ok', false, 'kode', 'pelajaran_tanpa_judul');
    end if;
  end loop;

  -- 1c. Bentrok slug (pra-periksa; exception handler di pass 2
  -- tetap menangkap race).
  if p_kursus is not null and (p_kursus ? 'slug') then
    if exists (
      select 1 from public.pf_courses
      where slug = p_kursus ->> 'slug' and id <> p_kursus_id
    ) then
      return jsonb_build_object('ok', false, 'kode', 'slug_bentrok');
    end if;
  end if;

  -- ============ PASS 2: tulis (gagal di sini = RAISE) ============
  -- 2a. Hapus pelajaran yang diminta.
  for v_pelajaran in
    select * from jsonb_array_elements(coalesce(p_pelajaran, '[]'::jsonb))
  loop
    if coalesce((v_pelajaran ->> 'hapus')::boolean, false) then
      delete from public.pf_course_lessons
      where id = (v_pelajaran ->> 'id')::uuid;
    end if;
  end loop;

  -- 2b. Hapus modul yang diminta (pelajaran di dalamnya ikut
  -- terhapus CASCADE via FK module_id ON DELETE CASCADE).
  for v_modul in
    select * from jsonb_array_elements(coalesce(p_modul, '[]'::jsonb))
  loop
    if coalesce((v_modul ->> 'hapus')::boolean, false) then
      delete from public.pf_course_modules
      where id = (v_modul ->> 'id')::uuid;
    end if;
  end loop;

  -- 2c. Ubah/tambah modul; catat kunci sementara -> id baru.
  for v_modul in
    select * from jsonb_array_elements(coalesce(p_modul, '[]'::jsonb))
  loop
    if coalesce((v_modul ->> 'hapus')::boolean, false) then
      continue;
    end if;
    if v_modul ->> 'id' is not null then
      update public.pf_course_modules set
        judul = case when v_modul ? 'judul' then v_modul ->> 'judul' else judul end,
        deskripsi = case when v_modul ? 'deskripsi' then v_modul ->> 'deskripsi' else deskripsi end,
        urutan = case when v_modul ? 'urutan' then (v_modul ->> 'urutan')::int else urutan end
      where id = (v_modul ->> 'id')::uuid;
      if not found then
        raise exception 'modul hilang saat tulis: %', v_modul ->> 'id';
      end if;
    else
      insert into public.pf_course_modules (course_id, judul, deskripsi, urutan)
      values (
        p_kursus_id,
        v_modul ->> 'judul',
        v_modul ->> 'deskripsi',
        coalesce((v_modul ->> 'urutan')::int, 0)
      )
      returning id into v_baru_id;
      if v_modul ->> 'kunci' is not null then
        v_peta := v_peta || jsonb_build_object(v_modul ->> 'kunci', v_baru_id::text);
      end if;
    end if;
  end loop;

  -- 2d. Ubah/tambah pelajaran.
  for v_pelajaran in
    select * from jsonb_array_elements(coalesce(p_pelajaran, '[]'::jsonb))
  loop
    if coalesce((v_pelajaran ->> 'hapus')::boolean, false) then
      continue;
    end if;
    v_target_modul := null;
    if v_pelajaran ->> 'modul_kunci' is not null then
      v_kunci := v_pelajaran ->> 'modul_kunci';
      if not (v_peta ? v_kunci) then
        raise exception 'modul_kunci hilang saat tulis: %', v_kunci;
      end if;
      v_target_modul := (v_peta ->> v_kunci)::uuid;
    elsif v_pelajaran ->> 'module_id' is not null then
      v_target_modul := (v_pelajaran ->> 'module_id')::uuid;
    end if;
    if v_pelajaran ->> 'id' is not null then
      update public.pf_course_lessons set
        module_id = coalesce(v_target_modul, module_id),
        judul = case when v_pelajaran ? 'judul' then v_pelajaran ->> 'judul' else judul end,
        isi = case when v_pelajaran ? 'isi' then v_pelajaran ->> 'isi' else isi end,
        jenis = case when v_pelajaran ? 'jenis' then v_pelajaran ->> 'jenis' else jenis end,
        referensi = case when v_pelajaran ? 'referensi' then (v_pelajaran -> 'referensi') else referensi end,
        artikel_id = case when v_pelajaran ? 'artikel_id' then (v_pelajaran ->> 'artikel_id')::uuid else artikel_id end,
        kuis_tanggal = case when v_pelajaran ? 'kuis_tanggal' then (v_pelajaran ->> 'kuis_tanggal')::date else kuis_tanggal end,
        urutan = case when v_pelajaran ? 'urutan' then (v_pelajaran ->> 'urutan')::int else urutan end
      where id = (v_pelajaran ->> 'id')::uuid;
      if not found then
        raise exception 'pelajaran hilang saat tulis: %', v_pelajaran ->> 'id';
      end if;
    else
      insert into public.pf_course_lessons
        (module_id, judul, isi, jenis, referensi, artikel_id, kuis_tanggal, urutan)
      values (
        v_target_modul,
        v_pelajaran ->> 'judul',
        v_pelajaran ->> 'isi',
        coalesce(v_pelajaran ->> 'jenis', 'materi'),
        coalesce((v_pelajaran -> 'referensi'), '[]'::jsonb),
        (v_pelajaran ->> 'artikel_id')::uuid,
        (v_pelajaran ->> 'kuis_tanggal')::date,
        coalesce((v_pelajaran ->> 'urutan')::int, 0)
      );
    end if;
  end loop;

  -- 2e. Field kursus (hanya kunci yang ada di p_kursus).
  -- Bentrok slug saat race: pra-periksa sudah dilakukan di
  -- pass 1c; bila race tetap terjadi, unique_violation di sini
  -- di-RAISE ulang dengan kode 23505 (bukan di-return) — raise
  -- membatalkan SELURUH transaksi pemanggilan, jadi struktur
  -- yang sudah ditulis di 2a–2d ikut batal. Route memetakan
  -- galat 23505 berisi 'slug_bentrok' ke 409.
  if p_kursus is not null and p_kursus <> '{}'::jsonb then
    begin
      update public.pf_courses set
        slug = case when p_kursus ? 'slug' then p_kursus ->> 'slug' else slug end,
        judul = case when p_kursus ? 'judul' then p_kursus ->> 'judul' else judul end,
        deskripsi = case when p_kursus ? 'deskripsi' then p_kursus ->> 'deskripsi' else deskripsi end,
        kategori = case when p_kursus ? 'kategori' then p_kursus ->> 'kategori' else kategori end,
        tingkat = case when p_kursus ? 'tingkat' then p_kursus ->> 'tingkat' else tingkat end,
        status = case when p_kursus ? 'status' then p_kursus ->> 'status' else status end,
        urutan = case when p_kursus ? 'urutan' then (p_kursus ->> 'urutan')::int else urutan end
      where id = p_kursus_id;
    exception when unique_violation then
      raise exception 'slug_bentrok: slug kursus sudah dipakai' using errcode = '23505';
    end;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.pf_patch_kursus_atomik(uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.pf_patch_kursus_atomik(uuid, jsonb, jsonb, jsonb) to service_role;

-- ============================================================
-- §3. P1-15 (B-S10, L-F2): policy arsip Q&A publik
-- ============================================================
-- Sebelumnya pf_questions hanya punya policy SELECT "pemilik
-- dan staf", jadi arsip publik (publik=true + status='terjawab')
-- hanya bisa dibaca lewat service role (filter ditegakkan di
-- kode route, bukan DB). Policy baru ini memindahkan penegakan
-- ke database; route arsip kini membaca via session client.
-- Hasil kueri TIDAK PERNAH memuat user_id/email penanya —
-- route hanya memilih kolom aman (lihat
-- src/app/api/tanya/arsip/route.ts).
drop policy if exists "pf_questions arsip publik" on public.pf_questions;
create policy "pf_questions arsip publik"
  on public.pf_questions for select using (
    publik = true and status = 'terjawab'
  );

-- ============================================================
-- §4. P2-16 (B-S13): indikator_id di laporan riset +
-- rekonsiliasi topik yatim
-- ============================================================
-- 4a. Laporan riset menautkan indikator lewat slug yang sama
-- (tanpa FK) — rename slug diam-diam memutus relasi. Kolom
-- baru ini adalah tautan FK yang benar; backfill dari slug
-- yang cocok; kode membaca indikator_id dulu, slug sebagai
-- fallback (lihat lib/riset.ts + dataset route).
alter table public.pf_research_reports
  add column if not exists indikator_id uuid
    references public.pf_data_indicators (id) on delete set null;

update public.pf_research_reports r
set indikator_id = i.id
from public.pf_data_indicators i
where i.slug = r.slug
  and r.indikator_id is null;

create index if not exists pf_research_reports_indikator_idx
  on public.pf_research_reports (indikator_id);

-- 4b. Rekonsiliasi topik yatim (LAPORAN SAJA — tidak
-- menghapus apa pun). pf_followed_topics.target adalah teks
-- bebas tanpa FK: kategori divalidasi terhadap taksonomi di
-- kode (bukan tabel) dan isu adalah teks bebas — keduanya
-- TIDAK punya referen DB, jadi tidak bisa direkonsiliasi di
-- sini. Yang bisa diperiksa: tipe 'negara' — target wajib
-- cocok dengan nama ATAU kode ISO negara di pf_countries
-- (semantik yang sama dengan validasi POST di
-- src/app/api/topik/route.ts: negaraAda). Fungsi ini
-- SECURITY DEFINER (membaca tabel pengguna) dan HANYA boleh
-- dieksekusi service_role (admin memanggil lewat server).
create or replace function public.pf_topik_yatim()
returns table (
  id uuid,
  user_id uuid,
  tipe text,
  target text
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.user_id, t.tipe, t.target
  from public.pf_followed_topics t
  where t.tipe = 'negara'
    and not exists (
      select 1 from public.pf_countries n
      where n.nama ilike t.target or n.kode ilike t.target
    );
$$;

revoke all on function public.pf_topik_yatim() from public;
grant execute on function public.pf_topik_yatim() to service_role;

-- ============================================================
-- §5. P2-30 (S-11): tegaskan search_path fungsi v1
-- ============================================================
-- Sudah dipatok di v7 (alter function ... set search_path =
-- public untuk ketiga fungsi di bawah). Ditegaskan ulang di
-- sini agar v13 mandiri bila v7 pernah dilewati, dan agar
-- baterai v13 bisa mengasersi proconfig-nya langsung.
alter function public.pf_has_role(text) set search_path = public;
alter function public.pf_is_super_admin() set search_path = public;
alter function public.pf_handle_new_user() set search_path = public;

-- ============================================================
-- §6. P2-31 (B-R1, S-14): batasi SELECT pf_profiles
-- ============================================================
-- Sebelumnya policy "baca publik" (using true) — siapa pun
-- (termasuk anonim) bisa membaca SELURUH profil, termasuk
-- kolom nonaktif. Verifikasi pemakaian (Audit Ultimate B1):
-- semua baca pf_profiles via session client di src/ memakai
-- .eq("id", user.id) (baris sendiri: cek nonaktif di
-- route-auth/guard + /api/akun/status); baca profil pengguna
-- LAIN hanya lewat service role di lib/admin/* (melewati RLS).
-- Jadi policy pemilik-atau-staf ini tidak merusak halaman
-- publik mana pun.
drop policy if exists "pf_profiles baca publik" on public.pf_profiles;
drop policy if exists "pf_profiles baca pemilik dan staf" on public.pf_profiles;
create policy "pf_profiles baca pemilik dan staf"
  on public.pf_profiles for select using (
    auth.uid() = id
    or public.pf_is_super_admin()
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );

-- ============================================================
-- §7. P2-32 (B-R3): hapus cabang mati 'admin' dari policy
-- pf_system_settings
-- ============================================================
-- Peran 'admin' TIDAK PERNAH ada di ROLES (hanya super_admin,
-- editor, fact_checker, writer, user) — cabang ini mati sejak
-- v10. Policy ditulis ulang tanpa cabang itu; perilaku tidak
-- berubah untuk peran yang benar-benar ada.
drop policy if exists "pf_system_settings baca staf" on public.pf_system_settings;
create policy "pf_system_settings baca staf"
  on public.pf_system_settings for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
  );

-- ============================================================
-- §8. P3-8 (B-R9): RPC agregasi status AI (GROUP BY di DB)
-- ============================================================
-- /api/ai/status sebelumnya membaca 500 baris pf_ai_runs lalu
-- agregasi di memori. RPC ini menghitung per agen langsung di
-- DB (GROUP BY agen) — route hanya mengambil 10 run terakhir
-- sebagai baris. SECURITY DEFINER (pf_ai_runs hanya boleh
-- dibaca staf; penegakan peran tetap di route via
-- autentikasiStaf SEBELUM RPC dipanggil). Grant execute HANYA
-- authenticated + service_role — anon DITOLAK di gerbang GRANT.
create or replace function public.pf_ai_status_agregat()
returns table (
  agen text,
  total bigint,
  berhasil bigint,
  gagal bigint,
  dilewati bigint,
  berjalan bigint,
  terakhir_pada timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.agen,
    count(*)::bigint as total,
    count(*) filter (where a.status = 'berhasil')::bigint as berhasil,
    count(*) filter (where a.status = 'gagal')::bigint as gagal,
    count(*) filter (where a.status = 'dilewati')::bigint as dilewati,
    count(*) filter (where a.status = 'berjalan')::bigint as berjalan,
    max(a.dimulai_pada) as terakhir_pada
  from public.pf_ai_runs a
  group by a.agen;
$$;

revoke all on function public.pf_ai_status_agregat() from public;
grant execute on function public.pf_ai_status_agregat() to authenticated, service_role;

-- ============================================================
-- §9. Integrasi B1: kolom topik GDELT + dedup evidence
-- ============================================================
-- §9a. P3-3 (N-R7): kolom pf_sources.topik_gdelt — topik GDELT
-- per sumber (mis. "Pendidikan", "Kesehatan"). Kode engine
-- (src/lib/ingestion/engine.ts) sudah membaca kolom ini bila
-- ada dan jatuh ke opsi/topik bawaan bila tidak ada, jadi
-- kolom ini aditif dan aman.
alter table public.pf_sources
  add column if not exists topik_gdelt text;

-- §9b. P2-10 (N-S12): unique index (klaim_id, sumber_url) pada
-- pf_evidence — menutup jendela race check-then-insert dari
-- dedup di kode (src/lib/ai/supabase-adapter.ts simpanBukti).
-- Duplikat yang sudah ada (bila ada) dihapus dulu dengan
-- mempertahankan baris tertua (id terkecil) — penghapusan ini
-- idempoten dan aman diulang.
delete from public.pf_evidence a
  using public.pf_evidence b
  where a.klaim_id = b.klaim_id
    and a.sumber_url = b.sumber_url
    and a.id > b.id;
create unique index if not exists pf_evidence_klaim_sumber_uniq
  on public.pf_evidence (klaim_id, sumber_url);

-- ============================================================
-- §10. P0-INTEGRASI (temuan integrasi Gelombang B1, 16 Nov 2026):
-- GRANT eksplisit ke service_role atas SEMUA tabel pf_*
-- ============================================================
-- ALASAN (kritis — tanpa ini seluruh backend mati di produksi):
-- Supabase MENGHENTIKAN grant otomatis untuk tabel baru di
-- `public` pada 30 Okt 2026 (changelog "Tables not exposed to
-- Data and GraphQL API automatically"; default baru untuk
-- proyek baru sejak 30 Mei 2026, diterapkan ke SEMUA proyek
-- lama pada 30 Okt 2026; dok. supabase.com/docs/guides/api/
-- securing-your-api diperbarui 22 Okt 2026). Tabel baru yang
-- dibuat sesudah tanggal itu TIDAK mendapat grant apa pun —
-- termasuk service_role — sampai ada GRANT eksplisit; tanpa
-- grant, Data API (PostgREST/supabase-js, jalur yang dipakai
-- SELURUH service client aplikasi) menjawab 42501, bahkan
-- untuk service_role (service_role hanya melewati RLS, BUKAN
-- lapisan grant).
-- Audit v1–v13 (16 Nov 2026): di SEMUA migrasi, SATU-SATUNYA
-- grant tabel ke service_role adalah pf_quiz_answers (§1 v13).
-- 54 tabel lain TIDAK PUNYA grant service_role. Migrasi pf_*
-- belum pernah dijalankan di produksi (akan dijalankan sesudah
-- 30 Okt 2026), jadi tanpa §10 ini: pipeline AI (tulis
-- pf_ai_runs/pf_claims/pf_evidence/pf_articles/
-- pf_verification_records/pf_daily_briefs), admin (tulis
-- hampir semua tabel), ingestion (pf_raw_items/
-- pf_ingestion_runs/pf_sources), scheduler, dan semua baca
-- service client akan gagal 42501 — aplikasi mati total saat
-- pertama deploy. Tabel PRATA/TASIK yang sudah ada SEBELUM
-- 30 Okt 2026 TIDAK terpengaruh (grant lama dipertahankan).
-- Cakupan: SELECT, INSERT, UPDATE, DELETE (cukup untuk semua
-- operasi service client; tanpa TRUNCATE/REFERENCES/TRIGGER —
-- aplikasi tidak memakainya). service_role adalah kunci server
-- tepercaya (bypass RLS by design); grant ini TIDAK membuka
-- akses publik — anon/authenticated tetap dibatasi grant
-- eksplisit v9/v10 + RLS/policy masing-masing. pf_quiz_answers
-- tetap hanya service_role (§1). pf_rate_limits tetap tanpa
-- grant anon/authenticated (hanya via RPC, v11). Urutan: §10
-- berjalan SESUDAH §1 (kolom kunci sudah dihapus dari
-- pf_quiz_questions), jadi grant SELECT tingkat tabel ke
-- service_role di pf_quiz_questions TIDAK membuka kunci apa
-- pun (peringatan v9 §3 hanya berlaku untuk anon/
-- authenticated).
-- IDEMPOTEN: GRANT aman diulang. Verifikasi: baterai
-- scripts/uji-ultimate-backend.mjs §10 (55/55 tabel punya
-- keempat hak untuk service_role).
grant select, insert, update, delete on
  public.pf_ai_runs,
  public.pf_article_sources,
  public.pf_article_tags,
  public.pf_article_versions,
  public.pf_articles,
  public.pf_audit_logs,
  public.pf_bookmarks,
  public.pf_categories,
  public.pf_claims,
  public.pf_correction_reports,
  public.pf_countries,
  public.pf_country_facts,
  public.pf_course_lessons,
  public.pf_course_modules,
  public.pf_course_progress,
  public.pf_courses,
  public.pf_daily_briefs,
  public.pf_data_indicators,
  public.pf_data_points,
  public.pf_documents,
  public.pf_editorial_reviews,
  public.pf_event_timeline,
  public.pf_events,
  public.pf_evidence,
  public.pf_followed_topics,
  public.pf_ingestion_runs,
  public.pf_knowledge_articles,
  public.pf_newsletter_subscribers,
  public.pf_notifications,
  public.pf_permissions,
  public.pf_podcast_episodes,
  public.pf_podcast_history,
  public.pf_podcast_playlist_items,
  public.pf_profiles,
  public.pf_questions,
  public.pf_quiz_answers,
  public.pf_quiz_questions,
  public.pf_quiz_scores,
  public.pf_rate_limits,
  public.pf_raw_items,
  public.pf_reading_history,
  public.pf_research_reports,
  public.pf_role_permissions,
  public.pf_roles,
  public.pf_scheduled_jobs,
  public.pf_sources,
  public.pf_stories,
  public.pf_story_articles,
  public.pf_story_events,
  public.pf_story_followers,
  public.pf_system_settings,
  public.pf_tags,
  public.pf_user_preferences,
  public.pf_user_roles,
  public.pf_verification_records
  to service_role;
