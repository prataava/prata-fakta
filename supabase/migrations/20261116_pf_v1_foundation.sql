-- ============================================================
-- PRATA FAKTA — Migrasi Fase 1 (Foundation)
-- Berkas: 20261116_pf_v1_foundation.sql
-- Proyek Supabase: 'prata' (dipakai bersama PRATA & TASIK JAYA)
-- Cara menjalankan: Supabase Dashboard → SQL Editor → tempel
-- seluruh berkas → Run. (DDL tidak bisa dijalankan dari VM:
-- anon key tidak bisa DDL, service_role key & DATABASE_URL tidak
-- tersedia di workspace — lihat ARSITEKTUR.md.)
-- Berkas ini IDEMPOTEN: aman dijalankan ulang (IF NOT EXISTS +
-- ON CONFLICT DO NOTHING).
-- URUTAN PENTING: tabel dulu, BARU fungsi helper (fungsi berbahasa
-- SQL divalidasi saat dibuat dan gagal bila tabelnya belum ada),
-- lalu RLS/policies/trigger, terakhir seed.
-- ============================================================

-- Ekstensi citext (untuk email case-insensitive di newsletter).
create extension if not exists citext with schema extensions;

-- ============================================================
-- 1. TABEL
-- ============================================================

-- ---------- 1a. pf_profiles ----------
create table if not exists public.pf_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nama_tampilan text,
  bio text,
  avatar_url text,
  dibuat_pada timestamptz not null default now(),
  diperbarui_pada timestamptz not null default now()
);

-- ---------- 1b. pf_roles, pf_permissions, pf_role_permissions, pf_user_roles ----------
create table if not exists public.pf_roles (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique,
  deskripsi text,
  dibuat_pada timestamptz not null default now()
);

create table if not exists public.pf_permissions (
  id uuid primary key default gen_random_uuid(),
  kode text not null unique,
  deskripsi text,
  dibuat_pada timestamptz not null default now()
);

create table if not exists public.pf_role_permissions (
  role_id uuid not null references public.pf_roles (id) on delete cascade,
  permission_id uuid not null references public.pf_permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.pf_user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references public.pf_roles (id) on delete cascade,
  dibuat_pada timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index if not exists pf_user_roles_user_idx on public.pf_user_roles (user_id);
create index if not exists pf_role_permissions_role_idx on public.pf_role_permissions (role_id);

-- ---------- 1c. pf_categories ----------
create table if not exists public.pf_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nama text not null,
  deskripsi text,
  induk_id uuid references public.pf_categories (id) on delete cascade,
  urutan integer not null default 0,
  aktif boolean not null default true,
  dibuat_pada timestamptz not null default now()
);

create index if not exists pf_categories_induk_idx on public.pf_categories (induk_id);
create index if not exists pf_categories_slug_idx on public.pf_categories (slug);

-- ---------- 1d. pf_sources ----------
create table if not exists public.pf_sources (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  jenis text not null check (jenis in ('rss', 'api', 'resmi', 'manual')),
  url text not null unique,
  aktif boolean not null default true,
  prioritas integer not null default 50,
  terakhir_cek timestamptz,
  status_terakhir text,
  dibuat_pada timestamptz not null default now()
);

create index if not exists pf_sources_aktif_idx on public.pf_sources (aktif);

-- ---------- 1e. pf_newsletter_subscribers ----------
create table if not exists public.pf_newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  aktif boolean not null default true,
  dibuat_pada timestamptz not null default now(),
  constraint pf_newsletter_email_format check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$')
);

-- ============================================================
-- 2. FUNGSI HELPER (sesudah tabel ada)
-- ============================================================

create or replace function public.pf_has_role(p_role text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.pf_user_roles ur
    join public.pf_roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.nama = p_role
  );
$$;

create or replace function public.pf_is_super_admin()
returns boolean
language sql
security definer
stable
as $$
  select public.pf_has_role('super_admin');
$$;

create or replace function public.pf_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.diperbarui_pada = now();
  return new;
end;
$$;

-- Profil + role 'user' otomatis dibuat saat pengguna mendaftar.
create or replace function public.pf_handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.pf_profiles (id, nama_tampilan)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  insert into public.pf_user_roles (user_id, role_id)
  select new.id, r.id from public.pf_roles r where r.nama = 'user'
  on conflict (user_id, role_id) do nothing;
  return new;
end;
$$;

-- ============================================================
-- 3. RLS + POLICIES + TRIGGERS
-- ============================================================

-- ---------- pf_profiles ----------
alter table public.pf_profiles enable row level security;

drop policy if exists "pf_profiles baca publik" on public.pf_profiles;
create policy "pf_profiles baca publik"
  on public.pf_profiles for select using (true);

drop policy if exists "pf_profiles buat sendiri" on public.pf_profiles;
create policy "pf_profiles buat sendiri"
  on public.pf_profiles for insert with check (auth.uid() = id);

drop policy if exists "pf_profiles ubah sendiri" on public.pf_profiles;
create policy "pf_profiles ubah sendiri"
  on public.pf_profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "pf_profiles hapus sendiri" on public.pf_profiles;
create policy "pf_profiles hapus sendiri"
  on public.pf_profiles for delete using (auth.uid() = id);

drop trigger if exists pf_profiles_set_updated_at on public.pf_profiles;
create trigger pf_profiles_set_updated_at
  before update on public.pf_profiles
  for each row execute function public.pf_set_updated_at();

drop trigger if exists pf_on_auth_user_created on auth.users;
create trigger pf_on_auth_user_created
  after insert on auth.users
  for each row execute function public.pf_handle_new_user();

-- ---------- pf_roles / pf_permissions / pf_role_permissions ----------
alter table public.pf_roles enable row level security;
alter table public.pf_permissions enable row level security;
alter table public.pf_role_permissions enable row level security;
alter table public.pf_user_roles enable row level security;

drop policy if exists "pf_roles baca" on public.pf_roles;
create policy "pf_roles baca" on public.pf_roles
  for select using (true);
drop policy if exists "pf_permissions baca" on public.pf_permissions;
create policy "pf_permissions baca" on public.pf_permissions
  for select using (true);
drop policy if exists "pf_role_permissions baca" on public.pf_role_permissions;
create policy "pf_role_permissions baca" on public.pf_role_permissions
  for select using (true);

drop policy if exists "pf_roles tulis super_admin" on public.pf_roles;
create policy "pf_roles tulis super_admin" on public.pf_roles
  for all using (public.pf_is_super_admin()) with check (public.pf_is_super_admin());
drop policy if exists "pf_permissions tulis super_admin" on public.pf_permissions;
create policy "pf_permissions tulis super_admin" on public.pf_permissions
  for all using (public.pf_is_super_admin()) with check (public.pf_is_super_admin());
drop policy if exists "pf_role_permissions tulis super_admin" on public.pf_role_permissions;
create policy "pf_role_permissions tulis super_admin" on public.pf_role_permissions
  for all using (public.pf_is_super_admin()) with check (public.pf_is_super_admin());

drop policy if exists "pf_user_roles baca sendiri" on public.pf_user_roles;
create policy "pf_user_roles baca sendiri" on public.pf_user_roles
  for select using (auth.uid() = user_id or public.pf_is_super_admin());
drop policy if exists "pf_user_roles tulis super_admin" on public.pf_user_roles;
create policy "pf_user_roles tulis super_admin" on public.pf_user_roles
  for all using (public.pf_is_super_admin()) with check (public.pf_is_super_admin());

-- ---------- pf_categories ----------
alter table public.pf_categories enable row level security;

drop policy if exists "pf_categories baca publik" on public.pf_categories;
create policy "pf_categories baca publik"
  on public.pf_categories for select using (true);

drop policy if exists "pf_categories tulis editor" on public.pf_categories;
create policy "pf_categories tulis editor"
  on public.pf_categories for all
  using (public.pf_has_role('super_admin') or public.pf_has_role('editor'))
  with check (public.pf_has_role('super_admin') or public.pf_has_role('editor'));

-- ---------- pf_sources ----------
alter table public.pf_sources enable row level security;

drop policy if exists "pf_sources baca publik" on public.pf_sources;
create policy "pf_sources baca publik"
  on public.pf_sources for select using (true);

drop policy if exists "pf_sources tulis editor" on public.pf_sources;
create policy "pf_sources tulis editor"
  on public.pf_sources for all
  using (public.pf_has_role('super_admin') or public.pf_has_role('editor'))
  with check (public.pf_has_role('super_admin') or public.pf_has_role('editor'));

-- ---------- pf_newsletter_subscribers ----------
alter table public.pf_newsletter_subscribers enable row level security;

drop policy if exists "pf_newsletter daftar publik" on public.pf_newsletter_subscribers;
create policy "pf_newsletter daftar publik"
  on public.pf_newsletter_subscribers for insert with check (true);

drop policy if exists "pf_newsletter kelola super_admin" on public.pf_newsletter_subscribers;
create policy "pf_newsletter kelola super_admin"
  on public.pf_newsletter_subscribers for all
  using (public.pf_is_super_admin())
  with check (public.pf_is_super_admin());

-- ============================================================
-- 4. SEED
-- ============================================================

-- Seed role (5) — sesuai brief bagian L.
insert into public.pf_roles (nama, deskripsi) values
  ('super_admin', 'Akses penuh terhadap seluruh sistem.'),
  ('editor', 'Mengelola artikel dan pemeriksaan editorial.'),
  ('fact_checker', 'Memeriksa sumber, klaim, dan bukti.'),
  ('writer', 'Membuat dan mengedit draft.'),
  ('user', 'Membaca, menyimpan, mengikuti topik.')
on conflict (nama) do nothing;

-- Seed permission (9).
insert into public.pf_permissions (kode, deskripsi) values
  ('article.create', 'Membuat artikel/draft.'),
  ('article.edit', 'Mengedit artikel/draft.'),
  ('article.delete', 'Menghapus artikel.'),
  ('article.publish', 'Menerbitkan dan membatalkan publikasi.'),
  ('article.review', 'Meninjau artikel dan mengembalikan revisi.'),
  ('factcheck.verify', 'Memverifikasi klaim, sumber, dan bukti.'),
  ('source.manage', 'Mengelola sumber berita.'),
  ('user.manage', 'Mengelola pengguna dan role.'),
  ('system.manage', 'Mengelola sistem, scheduler, dan API.')
on conflict (kode) do nothing;

-- Pemetaan role → permission (total 19 baris).
insert into public.pf_role_permissions (role_id, permission_id)
select r.id, p.id from public.pf_roles r, public.pf_permissions p
where (r.nama = 'super_admin')
   or (r.nama = 'editor' and p.kode in ('article.create','article.edit','article.delete','article.publish','article.review','source.manage'))
   or (r.nama = 'fact_checker' and p.kode in ('factcheck.verify','article.review'))
   or (r.nama = 'writer' and p.kode in ('article.create','article.edit'))
on conflict (role_id, permission_id) do nothing;

-- CATATAN: super_admin PERTAMA harus ditetapkan manual oleh pemilik lewat
-- SQL Editor setelah ada akun terdaftar, contoh:
--   insert into public.pf_user_roles (user_id, role_id)
--   select 'UUID-AKUN-ANDA', id from public.pf_roles where nama = 'super_admin';

-- Seed kategori utama (10) — sesuai brief bagian D.
insert into public.pf_categories (slug, nama, deskripsi, urutan) values
  ('indonesia', 'Indonesia', 'Berita dari Indonesia: pemerintahan, politik, hukum, ekonomi, pendidikan, sosial, infrastruktur, daerah, bencana, dan lingkungan.', 1),
  ('dunia', 'Dunia', 'Perkembangan internasional: geopolitik, diplomasi, konflik, ekonomi global, teknologi global, dan organisasi internasional.', 2),
  ('ekonomi', 'Ekonomi', 'Inflasi, nilai tukar, suku bunga, harga komoditas, perdagangan, investasi, pasar saham, ekonomi Indonesia dan dunia.', 3),
  ('teknologi', 'Teknologi', 'Kecerdasan buatan, software, hardware, keamanan siber, startup, inovasi, teknologi industri, dan perkembangan internet.', 4),
  ('sains', 'Sains', 'Penelitian ilmiah, kesehatan masyarakat, biologi, fisika, kimia, astronomi, dan antariksa.', 5),
  ('pendidikan', 'Pendidikan', 'Pendidikan Indonesia, perguruan tinggi, beasiswa, seleksi masuk kampus, penelitian pendidikan, dan kebijakan pendidikan.', 6),
  ('lingkungan-energi', 'Lingkungan & Energi', 'Perubahan iklim, bencana alam, hutan, pertambangan, energi terbarukan, energi fosil, konservasi, dan sumber daya alam.', 7),
  ('fakta-mitos', 'Fakta & Mitos', 'Pemeriksaan klaim publik: klaim, asal, konteks, bukti pendukung dan bertentangan, sumber primer, analisis, dan kesimpulan.', 8),
  ('data-statistik', 'Data & Statistik', 'Pusat data interaktif: grafik, tabel, perbandingan, tren tahunan, indikator nasional dan global.', 9),
  ('pengetahuan', 'Pengetahuan', 'Perpustakaan pengetahuan: sejarah, geografi, negara, sains, teknologi, ekonomi, alam, tubuh manusia, dan pengetahuan umum.', 10)
on conflict (slug) do nothing;

-- Seed subkategori (24).
insert into public.pf_categories (slug, nama, induk_id, urutan) values
  ('pemerintahan', 'Pemerintahan', (select id from public.pf_categories where slug = 'indonesia'), 1),
  ('politik', 'Politik', (select id from public.pf_categories where slug = 'indonesia'), 2),
  ('hukum', 'Hukum', (select id from public.pf_categories where slug = 'indonesia'), 3),
  ('sosial', 'Sosial', (select id from public.pf_categories where slug = 'indonesia'), 4),
  ('infrastruktur', 'Infrastruktur', (select id from public.pf_categories where slug = 'indonesia'), 5),
  ('daerah', 'Daerah', (select id from public.pf_categories where slug = 'indonesia'), 6),
  ('bencana', 'Bencana', (select id from public.pf_categories where slug = 'indonesia'), 7),
  ('geopolitik', 'Geopolitik', (select id from public.pf_categories where slug = 'dunia'), 1),
  ('diplomasi', 'Diplomasi', (select id from public.pf_categories where slug = 'dunia'), 2),
  ('konflik-internasional', 'Konflik Internasional', (select id from public.pf_categories where slug = 'dunia'), 3),
  ('ekonomi-global', 'Ekonomi Global', (select id from public.pf_categories where slug = 'dunia'), 4),
  ('organisasi-internasional', 'Organisasi Internasional', (select id from public.pf_categories where slug = 'dunia'), 5),
  ('kecerdasan-buatan', 'Artificial Intelligence', (select id from public.pf_categories where slug = 'teknologi'), 1),
  ('keamanan-siber', 'Keamanan Siber', (select id from public.pf_categories where slug = 'teknologi'), 2),
  ('startup', 'Startup', (select id from public.pf_categories where slug = 'teknologi'), 3),
  ('penelitian-ilmiah', 'Penelitian Ilmiah', (select id from public.pf_categories where slug = 'sains'), 1),
  ('kesehatan', 'Kesehatan Masyarakat', (select id from public.pf_categories where slug = 'sains'), 2),
  ('astronomi', 'Astronomi', (select id from public.pf_categories where slug = 'sains'), 3),
  ('perubahan-iklim', 'Perubahan Iklim', (select id from public.pf_categories where slug = 'lingkungan-energi'), 1),
  ('energi-terbarukan', 'Energi Terbarukan', (select id from public.pf_categories where slug = 'lingkungan-energi'), 2),
  ('konservasi', 'Konservasi', (select id from public.pf_categories where slug = 'lingkungan-energi'), 3),
  ('sejarah', 'Sejarah', (select id from public.pf_categories where slug = 'pengetahuan'), 1),
  ('geografi', 'Geografi', (select id from public.pf_categories where slug = 'pengetahuan'), 2),
  ('tubuh-manusia', 'Tubuh Manusia', (select id from public.pf_categories where slug = 'pengetahuan'), 3)
on conflict (slug) do nothing;

-- Seed sumber (8) — HANYA feed yang TERVERIFIKASI bisa dibaca pada
-- audit 16 Nov 2026 (lihat ARSITEKTUR.md §5). Yang gagal
-- (Kompas, Detik, Tempo, VOA) TIDAK di-seed.
insert into public.pf_sources (nama, jenis, url, prioritas, status_terakhir) values
  ('Antara — Terkini', 'rss', 'https://www.antaranews.com/rss/terkini.xml', 100, 'terverifikasi 2026-11-16: HTTP 200, 50 item'),
  ('CNN Indonesia', 'rss', 'https://www.cnnindonesia.com/rss', 90, 'terverifikasi 2026-11-16: HTTP 200, 100 item'),
  ('Liputan6 — Berita', 'rss', 'https://feed.liputan6.com/rss/berita', 90, 'terverifikasi 2026-11-16: HTTP 200, 50 item'),
  ('CNBC Indonesia', 'rss', 'https://www.cnbcindonesia.com/rss', 80, 'terverifikasi 2026-11-16: HTTP 200, 100 item'),
  ('Tribunnews', 'rss', 'https://www.tribunnews.com/rss', 70, 'terverifikasi 2026-11-16: HTTP 200, 20 item'),
  ('Republika', 'rss', 'https://www.republika.co.id/rss', 70, 'terverifikasi 2026-11-16: HTTP 200, 15 item'),
  ('BBC Indonesia', 'rss', 'https://feeds.bbci.co.uk/indonesia/rss.xml', 60, 'terverifikasi 2026-11-16: HTTP 200, 21 item; update lebih lambat'),
  ('GDELT DOC API', 'api', 'https://api.gdeltproject.org/api/v2/doc/doc', 50, 'terverifikasi 2026-11-16: HTTP 200, JSON valid; latensi ±20 detik')
on conflict (url) do nothing;

-- ============================================================
-- Verifikasi sesudah menjalankan (jalankan terpisah di SQL Editor):
--   select 'pf_profiles', count(*) from public.pf_profiles
--   union all select 'pf_roles', count(*) from public.pf_roles
--   union all select 'pf_permissions', count(*) from public.pf_permissions
--   union all select 'pf_role_permissions', count(*) from public.pf_role_permissions
--   union all select 'pf_categories', count(*) from public.pf_categories
--   union all select 'pf_sources', count(*) from public.pf_sources
--   union all select 'pf_newsletter_subscribers', count(*) from public.pf_newsletter_subscribers;
-- Ekspektasi: pf_roles 5, pf_permissions 9, pf_role_permissions 19,
--   pf_categories 34 (10 utama + 24 sub), pf_sources 8.
-- ============================================================
