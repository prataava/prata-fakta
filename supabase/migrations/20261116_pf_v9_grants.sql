-- ============================================================
-- PRATA FAKTA — Migrasi v9: GRANT eksplisit + RPC akar salinan
-- Berkas: 20261116_pf_v9_grants.sql
-- Proyek Supabase: 'prata' (dipakai bersama PRATA & TASIK JAYA)
-- Cara menjalankan: Supabase Dashboard → SQL Editor → tempel
-- seluruh berkas → Run. (DDL tidak bisa dijalankan dari VM:
-- anon key tidak bisa DDL, service_role key & DATABASE_URL tidak
-- tersedia di workspace — lihat ARSITEKTUR.md.)
-- Berkas ini IDEMPOTEN: GRANT/REVOKE aman dijalankan ulang,
-- CREATE OR REPLACE FUNCTION menimpa definisi yang sama.
-- KETERGANTUNGAN: WAJIB jalankan migrasi v1–v8 DULU. Migrasi ini
-- memakai: seluruh 37 tabel pf_* (v1–v8), fungsi
-- public.pf_has_role(text) dan public.pf_is_super_admin() (v1),
-- tabel pf_raw_items (v3), pf_articles (v2), pf_sources (v1).
--
-- MENGAPA v9 (bukan amend v8) — temuan F4 (TINGGI) gate Fase 8
-- (LAPORAN-FASE-8.md §12.5): v1–v8 TIDAK PUNYA satu pun GRANT
-- eksplisit untuk tabel baru, kecuali v8:190 (GRANT per kolom
-- kuis tanpa `kunci`). Semua tabel lahir dengan mengandalkan
-- "grant default Supabase". Supabase mengubah default itu sejak
-- 30 Okt 2026 (supabase.com/docs/guides/api/securing-your-api,
-- "Default privileges"): tabel baru di proyek lama TIDAK LAGI
-- otomatis mendapat grant ke anon/authenticated. Bukti PGlite:
-- authenticated SELECT pf_user_preferences → 42501 sebelum
-- grant, bisa sesudah grant. Karena cutover menjalankan v1–v8
-- sebagai tabel baru, tanpa v9 SEMUA tabel berpotensi putus
-- (bukan hanya preferensi). CUTOVER.md melarang mengubah berkas
-- migrasi apa pun — karena itu perbaikan ini berbentuk migrasi
-- BARU (v9), bukan edit v8.
--
-- PRINSIP TURUNAN (dibuktikan dari pg_policies, bukan asumsi):
-- tiap (tabel, perintah) diberi GRANT ke anon + authenticated
-- BILA ada ≥ 1 policy dengan command itu pada tabel tersebut
-- (semua policy v1–v8 berlaku untuk peran PUBLIC; pembatasan
-- siapa yang benar-benar lolos ada di qual policy, bukan di
-- grant). Grant adalah gerbang tingkat tabel; RLS tetap penegak
-- baris — grant di sini TIDAK melonggarkan apa pun yang RLS
-- tolak (anon yang bukan staf tetap mendapat 0 baris / ditolak
-- RLS pada tabel staf-only; service_role tidak terpengaruh
-- karena melewati RLS). Daftar turunan per tabel ada di komentar
-- tiap kelompok di bawah; ringkasnya:
--   SELECT saja (16): pf_ai_runs, pf_audit_logs, pf_claims,
--     pf_daily_briefs, pf_data_indicators, pf_data_points,
--     pf_editorial_reviews, pf_event_timeline, pf_events,
--     pf_evidence, pf_ingestion_runs, pf_knowledge_articles,
--     pf_questions, pf_raw_items, pf_scheduled_jobs,
--     pf_verification_records.
--   SELECT+INSERT+UPDATE (2): pf_quiz_scores, pf_user_preferences.
--   SELECT+INSERT+DELETE (1): pf_followed_topics (tanpa policy
--     UPDATE — topik hanya tambah/hapus pemilik).
--   SELECT+UPDATE (1): pf_notifications (ditulis service role).
--   SELECT+UPDATE+DELETE (1): pf_correction_reports (tanpa
--     INSERT — policy insert anonim dicabut v8, T5).
--   SELECT+INSERT+UPDATE+DELETE (14): pf_article_sources,
--     pf_article_tags, pf_article_versions, pf_articles,
--     pf_bookmarks, pf_categories, pf_permissions, pf_profiles,
--     pf_reading_history, pf_role_permissions, pf_roles,
--     pf_sources, pf_tags, pf_user_roles.
--   Khusus (2): pf_newsletter_subscribers (lihat §2) dan
--     pf_quiz_questions (lihat §3).
--
-- URUTAN CUTOVER: v9 dijalankan TEPAT SESUDAH v8 (dan sesudah
-- deploy §5 CUTOVER — sama seperti v8, karena v9 tidak mengubah
-- policy apa pun, hanya MENAMBAH izin tingkat tabel; menjalankannya
-- sebelum deploy pun tidak memutus route apa pun). Bila pemilik
-- menjalankan v1–v9 dalam satu sesi SQL Editor tanpa jeda deploy,
-- ketiga route publik tetap mengembalikan error sampai deploy
-- selesai (risiko yang sama seperti v8, lihat CUTOVER.md §0).
-- SEED: TIDAK ADA seed operasional.
-- §6 (koordinator, remediasi F1): perluasan CHECK aksi audit
-- pf_audit_logs — tambah 'koreksi.ditinjau' (47 aksi total).
-- ============================================================

-- ============================================================
-- 1. GRANT tingkat tabel — selaras policy v1–v8 (§1a–§1f)
-- ============================================================
-- GRANT bersifat idempoten: dijalankan ulang = no-op.

-- 1a. SELECT saja — tabel yang hanya punya policy SELECT.
--     (Staf-only: pf_ai_runs, pf_audit_logs,
--     pf_editorial_reviews, pf_ingestion_runs, pf_raw_items,
--     pf_scheduled_jobs — anon tetap 0 baris via RLS; staf
--     login butuh grant ini.
--     Terbit-only: pf_claims, pf_daily_briefs, pf_evidence,
--     pf_knowledge_articles, pf_verification_records —
--     draf tetap tak terlihat. Publik penuh: pf_data_indicators,
--     pf_data_points, pf_event_timeline, pf_events.
--     Pemilik+staf: pf_questions — tanpa INSERT: policy insert
--     anonim dicabut v8 (T5); tulis hanya lewat service role.)
grant select on public.pf_ai_runs to anon, authenticated;
grant select on public.pf_audit_logs to anon, authenticated;
grant select on public.pf_claims to anon, authenticated;
grant select on public.pf_daily_briefs to anon, authenticated;
grant select on public.pf_data_indicators to anon, authenticated;
grant select on public.pf_data_points to anon, authenticated;
grant select on public.pf_editorial_reviews to anon, authenticated;
grant select on public.pf_event_timeline to anon, authenticated;
grant select on public.pf_events to anon, authenticated;
grant select on public.pf_evidence to anon, authenticated;
grant select on public.pf_ingestion_runs to anon, authenticated;
grant select on public.pf_knowledge_articles to anon, authenticated;
grant select on public.pf_questions to anon, authenticated;
grant select on public.pf_raw_items to anon, authenticated;
grant select on public.pf_scheduled_jobs to anon, authenticated;
grant select on public.pf_verification_records to anon, authenticated;

-- 1b. SELECT+INSERT+UPDATE — data milik pemilik (tanpa DELETE:
--     tidak ada policy DELETE; skor/preferensi tidak dihapus
--     pengguna — penghapusan hanya lewat hapus akun / service).
grant select, insert, update on public.pf_quiz_scores to anon, authenticated;
grant select, insert, update on public.pf_user_preferences to anon, authenticated;

-- 1c. SELECT+INSERT+DELETE — topik yang diikuti pemilik (tanpa
--     policy UPDATE: topik hanya tambah/hapus, bukan ubah).
grant select, insert, delete on public.pf_followed_topics to anon, authenticated;

-- 1d. SELECT+UPDATE — notifikasi pemilik (ditulis service role,
--     tanpa policy INSERT/DELETE pengguna; pemilik hanya membaca
--     dan menandai sudah dibaca).
grant select, update on public.pf_notifications to anon, authenticated;

-- 1e. SELECT+UPDATE+DELETE — laporan koreksi (tanpa INSERT:
--     policy insert anonim dicabut v8, T5; tulis hanya lewat
--     service role di POST /api/laporan dan /api/laporan-publik).
grant select, update, delete on public.pf_correction_reports to anon, authenticated;

-- 1f. SELECT+INSERT+UPDATE+DELETE — tabel dengan policy ALL
--     (pf_categories, pf_permissions, pf_role_permissions,
--     pf_roles, pf_sources, pf_user_roles) dan/atau keempat
--     policy per-perintah (pf_article_sources, pf_article_tags,
--     pf_article_versions, pf_articles, pf_bookmarks,
--     pf_profiles, pf_reading_history, pf_tags). Semua policy
--     tulis di sini mensyaratkan peran staf / pemilik — anon
--     yang bukan staf/pemilik tetap ditolak RLS; grant hanya
--     membuka gerbang tingkat tabel bagi yang lolos policy.
grant select, insert, update, delete on public.pf_article_sources to anon, authenticated;
grant select, insert, update, delete on public.pf_article_tags to anon, authenticated;
grant select, insert, update, delete on public.pf_article_versions to anon, authenticated;
grant select, insert, update, delete on public.pf_articles to anon, authenticated;
grant select, insert, update, delete on public.pf_bookmarks to anon, authenticated;
grant select, insert, update, delete on public.pf_categories to anon, authenticated;
grant select, insert, update, delete on public.pf_permissions to anon, authenticated;
grant select, insert, update, delete on public.pf_profiles to anon, authenticated;
grant select, insert, update, delete on public.pf_reading_history to anon, authenticated;
grant select, insert, update, delete on public.pf_role_permissions to anon, authenticated;
grant select, insert, update, delete on public.pf_roles to anon, authenticated;
grant select, insert, update, delete on public.pf_sources to anon, authenticated;
grant select, insert, update, delete on public.pf_tags to anon, authenticated;
grant select, insert, update, delete on public.pf_user_roles to anon, authenticated;

-- ============================================================
-- 2. PENGECUALIAN — pf_newsletter_subscribers (T5)
-- ============================================================
-- Satu-satunya policy tulis tabel ini adalah ALL super_admin
-- ("pf_newsletter kelola super_admin", qual
-- pf_is_super_admin()). Anon TIDAK PERNAH bisa menjadi
-- super_admin (auth.uid() null), jadi GRANT INSERT ke anon
-- hanyalah hak mati — dan T5 justru lahir dari penyalahgunaan
-- INSERT anonim langsung via REST. Karena itu: SELECT/UPDATE/
-- DELETE ke anon + authenticated (RLS tetap membatasi ke
-- super_admin), tetapi INSERT HANYA ke authenticated (super_admin
-- login tetap bisa menulis; anon tetap tidak punya jalurnya).
grant select, update, delete on public.pf_newsletter_subscribers to anon, authenticated;
grant insert on public.pf_newsletter_subscribers to authenticated;

-- ============================================================
-- 3. PENGECUALIAN — pf_quiz_questions (T1-sisa)
-- ============================================================
-- JANGAN PERNAH memberi GRANT SELECT tingkat tabel pada tabel
-- ini: hak tingkat tabel MENGALAHKAN pembatasan per kolom dan
-- membuka kembali kolom `kunci` (dibuktikan PGlite saat
-- validasi v8; lihat supabase/README.md §v8 "Pengecekan
-- berkala T1-sisa"). Pernyataan di bawah MENEGASKAN KEMBALI
-- v8:189-191 secara idempoten: cabut SELECT tingkat tabel,
-- lalu GRANT SELECT per kolom untuk semua kolom KECUALI kunci.
-- Pembaca kunci yang sah (POST /api/kuis/jawab dan
-- getKuisHarian) memakai service role dan tidak terpengaruh.
revoke select on public.pf_quiz_questions from anon, authenticated;
grant select (id, tanggal, pertanyaan, opsi, penjelasan, sumber_url, sumber_nama, artikel_id, dibuat_pada)
  on public.pf_quiz_questions to anon, authenticated;

-- ============================================================
-- 4. GRANT EXECUTE — fungsi SECURITY DEFINER pemanggil policy
-- ============================================================
-- Policy RLS memanggil pf_has_role(text) (di puluhan policy)
-- dan pf_is_super_admin() (di policy ALL + SELECT
-- pf_user_roles) — dan pemanggilan dari policy MEMBUTUHKAN
-- hak EXECUTE pada fungsi itu. Dibuktikan di PGlite (gate F4):
-- sesudah `revoke execute on function pf_has_role from public`,
-- anon SELECT pf_permissions GAGAL "permission denied for
-- function pf_has_role"; sesudah grant dipulihkan, kembali
-- berhasil (0 baris via RLS). Default Postgres memang PUBLIC
-- EXECUTE, dan v1–v8 tidak pernah mencabutnya — grant di sini
-- membuatnya EKSPLISIT agar tak hilang diam-diam bila default
-- berubah (pelajaran yang sama seperti F4 tingkat tabel).
-- TIDAK diberi grant: pf_handle_new_user() (trigger signup
-- auth.users — dipanggil sistem, bukan anon/authenticated)
-- dan pf_set_updated_at() (fungsi trigger BEFORE UPDATE —
-- dipicu DML, bukan dipanggil langsung). Keduanya tidak
-- dipanggil dari policy mana pun.
grant execute on function public.pf_has_role(text) to anon, authenticated;
grant execute on function public.pf_is_super_admin() to anon, authenticated;

-- ============================================================
-- 5. RPC pf_akar_salinan — resolusi rantai salinan (Area 3)
-- ============================================================
-- Kontrak dengan Multi-Source View (src/lib/data.ts
-- getPerbandinganSumber): JANGAN ubah nama/kolom/parameter
-- fungsi ini tanpa koordinasi dengan agen tampilan.
-- KOREKSI PENTING (16 Nov 2026, terbukti di PGlite): draf
-- kontrak awal memakai `with artikel_ok as (...)` TANPA kata
-- kunci RECURSIVE — Postgres menolaknya saat CREATE FUNCTION
-- ("relation rantai does not exist"), karena CTE yang merujuk
-- dirinya sendiri WAJIB dideklarasikan RECURSIVE. Satu-satunya
-- perubahan dari draf kontrak adalah penambahan kata `recursive`
-- di bawah ini; nama, parameter, kolom hasil, dan logika rantai
-- TIDAK berubah.
-- Resolusi rantai salinan untuk tampilan Multi-Source View.
-- SECURITY DEFINER karena pf_raw_items hanya boleh dibaca staf (RLS v3);
-- fungsi ini hanya mengembalikan metadata minimal yang sudah publik
-- (judul + nama sumber akar) untuk artikel TERBIT. Artikel tidak
-- terbit / tidak ada -> himpunan kosong.
create or replace function public.pf_akar_salinan(p_artikel_id uuid, p_url text[])
returns table (
  url text, item_id uuid, akar_id uuid, akar_sumber_id uuid,
  akar_nama text, disalin boolean, judul text, akar_judul text,
  waktu_terbit_asli timestamptz
)
language sql stable security definer set search_path = public as $$
  with recursive artikel_ok as (
    select 1 from public.pf_articles a
    where a.id = p_artikel_id and a.status = 'terbit'
  ),
  cocok as (
    select distinct on (u) u as url_masuk, r.id, r.disalin_dari_id
    from unnest(p_url) as u
    join public.pf_raw_items r
      on r.url = u or rtrim(r.url, '/') = rtrim(u, '/')
    where exists (select 1 from artikel_ok)
  ),
  rantai(id_awal, id_saat_ini, kedalaman, dikunjungi) as (
    select c.id, c.id, 0, array[c.id] from cocok c
    union all
    select r.id_awal, p.disalin_dari_id, r.kedalaman + 1,
           r.dikunjungi || p.disalin_dari_id
    from rantai r
    join public.pf_raw_items p on p.id = r.id_saat_ini
    where p.disalin_dari_id is not null
      and r.kedalaman < 20
      and not (p.disalin_dari_id = any(r.dikunjungi))
  ),
  akar as (
    select distinct on (id_awal) id_awal, id_saat_ini as akar_id
    from rantai order by id_awal, kedalaman desc
  )
  select c.url_masuk, c.id, a.akar_id, ra.sumber_id, s.nama,
         (c.id <> a.akar_id), ri.judul, ra.judul, ri.waktu_terbit_asli
  from cocok c
  join akar a on a.id_awal = c.id
  join public.pf_raw_items ri on ri.id = c.id
  join public.pf_raw_items ra on ra.id = a.akar_id
  left join public.pf_sources s on s.id = ra.sumber_id;
$$;
revoke execute on function public.pf_akar_salinan(uuid, text[]) from public;
grant execute on function public.pf_akar_salinan(uuid, text[]) to anon, authenticated;

-- ============================================================
-- 6. Perluasan CHECK aksi audit — 'koreksi.ditinjau' (F1)
-- ============================================================
-- Remediasi Gelombang 1 (16 Nov 2026, koordinator): aksi
-- 'koreksi.ditinjau' ditambahkan ke CHECK pf_audit_logs agar
-- penandaan status 'ditinjau' tercatat dengan aksi eksplisit,
-- bukan lagi sebagai 'koreksi.terima' + status di kolom detail
-- (solusi sementara agen Public Report — lihat
-- src/lib/admin/editorial.ts sebelum perubahan ini). Pola sama
-- seperti v8 §5a: bila constraint v9 sudah ada, lewati; bila
-- belum, buang CHECK lama yang menyebut kolom aksi, lalu tambah
-- CHECK baru bernama eksplisit dengan 47 aksi (46 dari v8 +
-- 'koreksi.ditinjau'). Aman diulang.
do $$
declare
  r record;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pf_audit_logs'::regclass
      and conname = 'pf_audit_logs_aksi_check_v9'
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
    add constraint pf_audit_logs_aksi_check_v9
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
      'negara.buat', 'negara.ubah',
      'tanya.jawab',
      'akademi.kursus', 'akademi.modul', 'akademi.progres',
      'podcast.episode', 'podcast.terbit',
      'sistem.flag', 'sistem.pengumuman',
      'kuis.buat', 'kuis.ubah',
      'preferensi.ubah', 'ekspor.data'
    ));
end $$;

-- ============================================================
-- Verifikasi sesudah menjalankan (jalankan terpisah di SQL Editor):
--   select count(*) from pg_tables
--   where schemaname = 'public' and tablename like 'pf_%';
-- Ekspektasi: 37 (v9 TIDAK menambah tabel).
--   select count(*) from pg_policies
--   where schemaname = 'public' and tablename like 'pf_%';
-- Ekspektasi: 79 (v9 TIDAK menambah/mengubah policy).
--   select count(*) from information_schema.table_privileges
--   where table_schema = 'public' and table_name like 'pf_%'
--     and grantee in ('anon','authenticated');
-- Ekspektasi: > 0 (sebelum v9: 0 — itulah F4).
--   select has_column_privilege('anon', 'public.pf_quiz_questions', 'kunci', 'SELECT'),
--          has_column_privilege('authenticated', 'public.pf_quiz_questions', 'kunci', 'SELECT');
-- Ekspektasi: false, false (T1-sisa tetap tertutup).
--   select proname from pg_proc where proname = 'pf_akar_salinan';
-- Ekspektasi: 1 baris.
--   select conname from pg_constraint
--   where conrelid = 'public.pf_audit_logs'::regclass
--     and conname = 'pf_audit_logs_aksi_check_v9';
-- Ekspektasi: 1 baris (47 aksi: 46 dari v8 + 'koreksi.ditinjau').
-- Cek negatif (sebagai anon, lewat REST atau SET ROLE anon):
--   INSERT ke pf_newsletter_subscribers / pf_correction_reports /
--   pf_questions DITOLAK (42501 — T5 tetap berlaku);
--   SELECT kunci FROM pf_quiz_questions DITOLAK (42501);
--   SELECT * FROM pf_raw_items mengembalikan 0 baris (RLS staf).
-- Cek positif (sebagai authenticated): SELECT pf_user_preferences
-- milik sendiri berhasil (bukan 42501 — F4 tertutup).
-- ============================================================
