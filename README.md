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

**Fase 3–6: SELESAI (kode, terverifikasi lokal)** (16 Nov 2026).
Ingestion RSS + GDELT + dedup (v3), AI editorial deterministik +
verifikasi dua sinyal + Daily Brief (v4), sistem editorial admin +
gate terbit + koreksi + audit log (v5), fitur lanjutan: peta
Leaflet, pengetahuan, kuis harian, data/indikator, timeline,
tanya AI, feed personal, notifikasi, TTS (v6). Detail per fase:
`ARSITEKTUR.md`.

**Fase 7 — Production: SELESAI (kode, terverifikasi lokal)**
(16 Nov 2026). Keputusan 404 slug (proxy → 404 nyata) +
penyimpanan skor kuis (migrasi v7: `pf_quiz_scores`; 36 tabel,
RLS 36/36, 79 policy); security audit 10 temuan (6 diperbaiki:
kunci kuis server-side via `POST /api/kuis/jawab`, security
headers, rate limit 4 route, cek nonaktif di route AI, pelindung
SSRF, `search_path` fungsi SECURITY DEFINER, perbandingan secret
timing-safe); SEO (sitemap, robots, RSS, JSON-LD, canonical, OG);
monitoring (`/api/health`, `/admin/sistem`); backup
(`scripts/backup-pf.mjs`, 36 tabel); QA 25 butir: 21 LOLOS
(lokal), 4 BLOKIR. Verifikasi: `tsc` EXIT 0, `lint` EXIT 0,
`node scripts/uji-fase7.mjs` **87/87 LOLOS**, `npm run build`
EXIT 0 (87/87 halaman). Laporan lengkap: `LAPORAN-AKHIR.md`.

**Fase 8 — Gelombang 2: SELESAI (kode, terverifikasi lokal)**
(16 Nov 2026). 10 area: Story Tracker, Explain the World,
Reality Check, Ask the World, PRATA Academy, PRATA Podcast,
PRATA Research, Country Profile, Historical Archive,
Advanced Admin Control Center. Migrasi v10 (16 tabel baru;
53 tabel, RLS 53/53, 106 policy). Verifikasi: `tsc` EXIT 0,
`lint` EXIT 0 (0 warning), `npm run build` EXIT 0 (147/147
halaman), 15 baterai (971/971 asersi lolos; uji-ingestion
flaky eksternal), smoke test `next start` 9× 200 + 7× 404,
log 0 error. Batas jujur: file audio MP3 + RSS enclosure
podcast BELUM BISA (tanpa layanan TTS server gratis);
Traffic Analytics BELUM BISA (tanpa analitik terkonfigurasi);
T3/T10 kini tertutup di kode (Tahap 13, migrasi v11);
DNS rebinding DIPERSEMPIT (pinning + re-resolusi, penutupan
penuh belum terverifikasi dari egress langsung); CSP
terimplementasi (nonce + hash skrip tema, terverifikasi live
lokal via `next start`).
Detail: `LAPORAN-FASE-8.md` §13, `AUDIT-EXPANSION.md`
§9.6–§9.7.

**Tahap 13–17: SELESAI (kode, terverifikasi lokal)**
(16 Nov 2026). Tahap 13 — keamanan + scheduler: rate limit
lintas instance via tabel Supabase + RPC atomik (v11), audit
CRUD sumber fail-closed (T10), akun nonaktif konsisten (T4),
SSRF pinning + re-resolusi (T6, dipersempit — penutupan penuh
butuh verifikasi dari egress langsung), CSP nonce + hash skrip
tema, scheduler diperbaiki (F2–F8/F12: concurrency, lock
server-side, retry, assert jq, seed 5 job, flag ditegakkan),
migrasi v11–v12 (**54 tabel, RLS 54/54, 106 policy**).
Tahap 14 — integrasi 14 area (artikel ↔ cerita ↔ negara +
bar konteks). Tahap 15 — regression penuh **1.365/1.365
asersi** (19 baterai) + build EXIT 0 (147/147, BUILD_ID
`NyTEjrq_2Hs81joEYhase`) + smoke 12× 200 + 8× 404, log 0
error. Tahap 16–17 — readiness + cutover/deploy siap untuk
persetujuan pemilik. Laporan akhir: `FINAL-PROJECT-COMPLETION.md`
(28 bagian). Detail: `LAPORAN-FASE-8.md` §14.

**BELUM LIVE:** migrasi v1–v12 belum dijalankan di Supabase
produksi dan deploy Vercel masih blokir 403 (akses tim
`prataava`). Cara deploy langkah demi langkah:
`DEPLOY.md` + `supabase/CUTOVER.md`.

## Menjalankan lokal

```bash
npm install
cp .env.example .env.local   # isi NEXT_PUBLIC_SUPABASE_URL + ANON_KEY
npm run dev                  # http://localhost:3000
npm run build                # build produksi (harus exit 0)
npm run lint                 # ESLint (harus exit 0)
node scripts/uji-fase7.mjs   # uji migrasi v1-v7 + keamanan (87 asersi)
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
