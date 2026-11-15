# PRATA FAKTA — Pahami dunia. Berdasarkan fakta.

Platform berita dan pengetahuan digital: berita terkini Indonesia dan dunia
dengan sumber jelas, pemeriksaan fakta, data, dan kronologi. Dibangun dengan
Next.js 16 (App Router) + TypeScript + Supabase (proyek `prata`).

## Status

**Fase 1 — Foundation: SELESAI** (16 Nov 2026). Lihat `ARSITEKTUR.md` untuk
audit, keputusan stack, dan daftar blokir.

**Fase 2 — News Platform: SELESAI (aplikasi)** (16 Nov 2026). Halaman
artikel lengkap (`/artikel/[slug]`: 3 mode baca, bookmark, riwayat baca,
progress, laporan kesalahan), pencarian isi artikel, filter arsip
(tanggal + sumber), daftar artikel per kategori, seksi beranda dari data
nyata, dan API `bookmark` / `laporan` / `riwayat`. Skema v2
(`pf_articles`, `pf_article_versions`, `pf_article_sources`, `pf_tags`,
`pf_article_tags`, `pf_bookmarks`, `pf_reading_history`,
`pf_correction_reports`) ditulis agen migrasi terpisah — **tabel v2 belum
dijalankan di produksi**, jadi halaman-halaman Fase 2 menampilkan empty
state jujur / 503 jujur sampai migrasi dijalankan.

## Menjalankan lokal

```bash
npm install
cp .env.example .env.local   # isi NEXT_PUBLIC_SUPABASE_URL + ANON_KEY
npm run dev                  # http://localhost:3000
npm run build                # build produksi (harus exit 0)
npm run lint                 # ESLint (harus exit 0)
```

## Database

Migrasi Fase 1: `supabase/migrations/20261116_pf_v1_foundation.sql`.
**Jalankan manual** lewat Supabase Dashboard → SQL Editor (DDL tidak bisa
dari VM). Cara + verifikasi: `supabase/README.md`.

## Struktur

- `src/app/` — halaman publik: beranda, kategori, arsip, pencarian,
  Daily Brief, masuk/daftar/profil, kebijakan, artikel `[slug]`,
  `api/langganan`, `api/bookmark`, `api/laporan`, `api/riwayat`
- `src/components/` — Header, Footer, BottomNav, SearchBar, AuthArea,
  ThemeToggle, EmptyState, NewsletterForm, `artikel/` (PembacaArtikel,
  FormLaporan, KartuArtikel)
- `src/lib/` — `supabase/` (client/server), `data.ts`, `categories.ts`,
  `verifikasi.ts` (label & kelas lencana status verifikasi),
  `auth/roles.ts`
- `src/proxy.ts` — refresh sesi Supabase (konvensi `proxy` Next 16.4)
- `supabase/` — migrasi + README

## Aturan penting

- **Tanpa data dummy operasional.** Seksi tanpa data menampilkan empty
  state jujur ("belum ada artikel"), bukan angka/artikel palsu.
- **AI hanya via Muse** (cron/scheduled jobs + chat). Tanpa GPT/Gemini/
  DeepSeek. Agen yang belum berjalan dicatat BELUM TERSEDIA, bukan
  pura-pura jalan.
- **Hak cipta:** artikel orisinal + atribusi + URL sumber; jangan salin
  artikel penuh media lain.
- **Secret tidak pernah di frontend** — hanya anon key publik; keamanan
  ditegakkan RLS di database.
