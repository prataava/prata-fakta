-- ============================================================
-- PRATA FAKTA — migrasi v27 (18 Nov 2026)
-- Koreksi publik + versi artikel + log pengiriman push.
-- ============================================================
-- BELUM DITERAPKAN DI PRODUKSI — batas pemilik 18 Nov 2026:
-- tanpa migrasi produksi tanpa otorisasi eksplisit. Berkas ini
-- HANYA definisi + kueri verifikasi; penerapannya menunggu
-- persetujuan pemilik (lihat LAPORAN-HARDENING-OPERASI-V27.md).
--
-- §1 pf_article_versions.isi_sebelum — versi SEBELUM revisi.
--     (kolom isi yang ada = SESUDAH revisi; tanpa isi_sebelum,
--     isi lama hanya bisa direkonstruksi dari versi N-1.)
--     NULL untuk versi lama pra-v27 — jujur, bukan karangan.
-- §2 pf_correction_reports.diterapkan_pada / versi_artikel /
--     tanggapan_redaksi — transparansi koreksi publik
--     (Public Correction Center): kapan koreksi diterapkan,
--     pada versi artikel berapa, dan tanggapan redaksi.
-- §3 pf_push_deliveries (BARU) — log pengiriman push
--     (Notification Intelligence): satu baris per percobaan
--     kirim; dipakai riwayat broadcast + frequency cap +
--     pembersihan endpoint mati. Ditulis HANYA service role.
--
-- Idempoten: semua pernyataan memakai IF NOT EXISTS / DROP IF
-- EXISTS, jadi file ini aman dijalankan dua kali.
-- PGlite: DDL standar saja (dipakai baterai uji-global-intel §A).
-- ============================================================

-- ---------- §1: isi sebelum revisi ----------
alter table public.pf_article_versions
  add column if not exists isi_sebelum text;

comment on column public.pf_article_versions.isi_sebelum is
  'Isi artikel SEBELUM revisi ini (NULL untuk versi lama pra-v27). Bersama kolom isi (sesudah), memungkinkan bandingkan versi + rollback tanpa tabel duplikat.';

-- ---------- §2: transparansi koreksi ----------
alter table public.pf_correction_reports
  add column if not exists diterapkan_pada timestamptz,
  add column if not exists versi_artikel integer,
  add column if not exists tanggapan_redaksi text;

comment on column public.pf_correction_reports.diterapkan_pada is
  'Kapan koreksi ini diterapkan ke artikel (NULL = belum diterapkan). Tampil di Pusat Koreksi publik.';
comment on column public.pf_correction_reports.versi_artikel is
  'Nomor versi artikel (pf_article_versions.versi) sesudah koreksi diterapkan.';
comment on column public.pf_correction_reports.tanggapan_redaksi is
  'Tanggapan redaksi atas laporan ini (tampil publik bila status diperbaiki).';

create index if not exists pf_correction_reports_diterapkan_idx
  on public.pf_correction_reports (diterapkan_pada desc)
  where status = 'diperbaiki';

-- ---------- §3: log pengiriman push ----------
create table if not exists public.pf_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  judul text,
  status text not null default 'terkirim'
    check (status in ('terkirim', 'gagal', 'dihapus')),
  kode_http integer,
  dibuat_pada timestamptz not null default now()
);

comment on table public.pf_push_deliveries is
  'Log pengiriman push (v27): satu baris per percobaan kirim broadcast/uji. Dipakai riwayat broadcast di /admin/notifikasi, frequency cap, dan pembersihan endpoint mati (410/404). Ditulis HANYA service role; dibaca staf.';

create index if not exists pf_push_deliveries_endpoint_idx
  on public.pf_push_deliveries (endpoint);
create index if not exists pf_push_deliveries_dibuat_idx
  on public.pf_push_deliveries (dibuat_pada desc);

-- RLS + policies + GRANT (pola v25 pf_alerts): tulis HANYA lewat
-- service role (API backend); baca hanya peran staf. TIDAK ADA
-- policy insert/update/delete untuk peran staf.
alter table public.pf_push_deliveries enable row level security;
drop policy if exists "pf_push_deliveries baca staf" on public.pf_push_deliveries;
create policy "pf_push_deliveries baca staf"
  on public.pf_push_deliveries for select using (
    public.pf_has_role('super_admin')
    or public.pf_has_role('editor')
    or public.pf_has_role('fact_checker')
    or public.pf_has_role('writer')
  );
grant select on public.pf_push_deliveries to anon, authenticated;
grant all on public.pf_push_deliveries to service_role;

-- ============================================================
-- Kueri verifikasi (jalankan sesudah penerapan, via SQL Editor):
--   select column_name from information_schema.columns
--     where table_name = 'pf_article_versions'
--       and column_name = 'isi_sebelum';                      -- harapan: 1 baris
--   select column_name from information_schema.columns
--     where table_name = 'pf_correction_reports'
--       and column_name in ('diterapkan_pada','versi_artikel','tanggapan_redaksi'); -- harapan: 3 baris
--   select count(*) from public.pf_push_deliveries;           -- harapan: 0
--   select tablename, rowsecurity from pg_tables
--     where tablename = 'pf_push_deliveries';                 -- harapan: rowsecurity true
--   select count(*) from pg_tables
--     where schemaname = 'public' and tablename like 'pf\_%'; -- harapan: 69 (68 + 1 baru)
--   select policyname from pg_policies
--     where tablename = 'pf_push_deliveries';                 -- harapan: 1 ("pf_push_deliveries baca staf")
-- CATATAN: sesudah v27 diterapkan, tambahkan "pf_push_deliveries"
-- ke TABEL_PF di scripts/backup-pf.mjs (saat ini SENGAJA belum —
-- tabel yang migrasinya belum diterapkan akan gagal 404 dan
-- membuat backup exit 1).
-- ============================================================
