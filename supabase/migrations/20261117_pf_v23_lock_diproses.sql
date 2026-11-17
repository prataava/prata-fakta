-- ============================================================
-- PRATA FAKTA — migrasi v23 (Fase 5: lock editorial)
-- Penanda "sedang diproses" di pf_raw_items.
-- ============================================================
-- ambilAntrean({ klaim: true }) menandai item yang diambil satu
-- run pipeline (diproses_pada = now()) agar run kedua yang lolos
-- dari lock job — mis. lock kedaluwarsa di tengah run panjang —
-- tidak mengambil item yang sama. Penanda dibersihkan saat
-- status_verifikasi diubah (adapter.perbaruiStatusItem) dan
-- dianggap basi sesudah 30 menit
-- (BATAS_BASI_TANDA_DIPROSES_MENIT di src/lib/ai/supabase-adapter.ts):
-- worker yang crash tidak pernah mengunci item selamanya.
--
-- ADDITIVE-ONLY: satu kolom nullable + satu indeks; tanpa ubah
-- kolom/check/policy/seed yang ada. NULL = belum/tidak sedang
-- diproses. Kode adapter tahan terhadap kolom yang BELUM ada
-- (degradasi anggun ke perilaku lama), jadi migrasi ini boleh
-- diterapkan sesudah deploy kode tanpa jendela rusak.
-- ============================================================

alter table public.pf_raw_items
  add column if not exists diproses_pada timestamptz;

comment on column public.pf_raw_items.diproses_pada is
  'Fase 5 / v23: kapan item mulai diproses satu run pipeline (NULL = tidak sedang diproses; basi sesudah 30 menit).';

create index if not exists pf_raw_items_diproses_idx
  on public.pf_raw_items (diproses_pada);
