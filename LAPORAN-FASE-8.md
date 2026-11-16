# LAPORAN FASE 8 — PRATA FAKTA: AUDIT & PRODUCTION READINESS GATE

**Tanggal:** 16 November 2026 (±06.29–07.00 WIB)
**Repo:** `github.com/prataava/prata-fakta` — `~/workspace/prata-fakta`
**HEAD:** `f1e68d6` (Gelombang 1) + perubahan gate uncommitted (commit oleh agen utama)
**Status gate: TERTAHAN — lolos lokal, tertahan di produksi.**

> **Cara membaca laporan ini:** setiap klaim diberi status tegas —
> **Terverifikasi lokal** / **Terverifikasi staging** /
> **Terverifikasi production** / **Belum diuji** / **Terblokir**.
> Tidak ada satu pun klaim "Terverifikasi staging" atau
> "Terverifikasi production" dalam laporan ini: semua bukti
> berasal dari PGlite, build lokal, dan dry-run lokal. Situs
> PRATA FAKTA **BELUM LIVE**.

## 0. Ringkasan gate (untuk pemilik)

Pengalihan prioritas 16 Nov 2026 ±06.29 WIB: pembangunan 14
area **DIHENTIKAN**; prioritas Fase 8 = audit & production
readiness gate. Gelombang 2 (area 2, 4, 5, 10, 11, 12) sudah
dimulai lalu dibatalkan; working tree dikembalikan ke titik
aman `f1e68d6` (perubahan parsial Gelombang 2 di-revert penuh;
rencana tetap di `AUDIT-EXPANSION.md` §5/§7).

**Hasil gate dalam satu kalimat:** kode lolos semua pemeriksaan
lokal (build, lint, tsc, 7 baterai uji, gate keamanan PGlite,
dry-run scheduler + redaksi dengan data nyata), tetapi platform
**belum bisa naik produksi** karena dua blokir di luar kode —
migrasi v1–v8 belum dijalankan di Supabase produksi dan deploy
Vercel masih 403 akses tim — ditambah tiga sisa keamanan
(T3 rate limiting, T10 audit CRUD sumber, DNS rebinding) dan
satu temuan baru (tool `authorize_team_access` tidak ada di
konektor Vercel).

| Jalur gate | Hasil |
|---|---|
| Keamanan | T5/T8/T1-sisa TERTUTUP; T6: 3 celah nyata diperbaiki; T4: 6 jalur staf diperbaiki; T3 TERBUKA; T10: 1 celah baru |
| Cutover | `supabase/CUTOVER.md` + `DEPLOY.md` selesai; Vercel 403 diverifikasi ulang |
| Scheduler | 5 jadwal terverifikasi (WIB benar); dry-run 5 alur LOLOS; gate publikasi otomatis: **TIDAK** |
| Regression + redaksi | Semua baterai LOLOS (1 catatan: GDELT 429 eksternal); alur redaksi (a)–(j) berfungsi dengan data nyata |
| Audit mendalam Gelombang 1 | Jejak Fakta LAYAK DENGAN CATATAN; Multi-Source View **TIDAK LAYAK** (tampilan menghitung salinan sebagai independen); Public Report + My Prata + Migrasi v8 LAYAK DENGAN CATATAN; temuan tertinggi F4 (tanpa GRANT eksplisit — cutover bergantung default Supabase yang sudah berubah) |

**Keputusan Gelombang 2: TIDAK LAYAK dilanjutkan dulu
(NO-GO)** — lihat §12. Yang wajib diperbaiki dulu:
tampilan Multi-Source View (pakai rantai `disalin_dari`
seperti mesin), GRANT eksplisit untuk semua tabel `pf_*`
(F4), jalur terima laporan tanpa `artikel_id` (F2),
status `ditinjau` yang tak pernah tercapai (F1), cek
`status='terbit'` di `getJejakFakta` (F-A1-1).
Sesudah perbaikan, audit mendalam A+B diulang pada
perbaikannya.

---

## 1. Audit kondisi awal

### 1.1 Fondasi Fase 1–7 (keadaan saat gate dimulai)

| Item | Angka | Status |
|---|---|---|
| Commit Fase 7 | `cd9693f` | Terverifikasi lokal |
| Halaman (`page.tsx`) | 41 saat audit awal → **46 sesudah Gelombang 1** | Terverifikasi lokal |
| Route API (`route.ts`) | 42 saat audit awal → **46 sesudah Gelombang 1** | Terverifikasi lokal |
| Total rute (halaman + API + sitemap/robots/RSS) | **94** | Terverifikasi lokal |
| Tabel `pf_*` | 36 (Fase 7) → **37 (v8 Gelombang 1)** | Terverifikasi lokal |
| RLS | **37/37** | Terverifikasi lokal |
| Policy | **79** | Terverifikasi lokal |
| Agen AI | 10 terdaftar (9 deterministik + Data Analysis) | Terverifikasi lokal |
| Workflow GitHub Actions | **3 berkas / 5 jadwal** (koreksi atas "5 workflow" di LAPORAN-AKHIR) | Terverifikasi lokal |
| Migrasi v1–v7 di Supabase produksi | Belum dijalankan | **Terblokir** |
| Deploy Vercel | 403 akses tim `prataava` | **Terblokir** |
| Scheduler | Tidak aktif (butuh deploy + secret) | **Terblokir** |

### 1.2 Audit 14 area (ringkas — detail di `AUDIT-EXPANSION.md` §9.2)

Audit awal (Langkah 1, sebelum pengalihan) sudah menjawab
untuk tiap area: sudah ada / fitur serupa / dukungan DB /
API / hubungan Muse AI / kebutuhan migrasi / risiko /
kemungkinan tanpa merusak fitur lama. Gate menegaskan
kembali tiap jawaban terhadap kode di `f1e68d6`:

| # | Area | Status sesudah gate |
|---|---|---|
| 1 | Jejak Fakta | Selesai Gelombang 1 — terverifikasi lokal |
| 2 | Story Tracker | Belum dibangun — rencana tetap berlaku |
| 3 | Multi-Source View | Selesai Gelombang 1 — terverifikasi lokal |
| 4 | Explain the World | Belum dibangun — rencana tetap berlaku |
| 5 | Reality Check | Belum dibangun — rencana tetap berlaku |
| 6 | Ask the World | Belum dibangun — rencana tetap berlaku |
| 7 | My Prata | Selesai Gelombang 1 — terverifikasi lokal |
| 8 | PRATA Academy | Belum dibangun — rencana tetap berlaku |
| 9 | PRATA Podcast | Belum dibangun — rencana tetap berlaku |
| 10 | PRATA Research | Belum dibangun — rencana tetap berlaku |
| 11 | Country Profile | Belum dibangun — rencana tetap berlaku |
| 12 | Historical Archive | Belum dibangun — rencana tetap berlaku |
| 13 | Public Report | Selesai Gelombang 1 — terverifikasi lokal |
| 14 | Advanced Admin Control Center | Belum dibangun — rencana tetap berlaku |

**Tidak ada duplikat yang dibuat gate ini:** semua yang sudah
ada dicatat sebagai pengembangan, bukan bangun baru.
Perubahan Gelombang 2 yang dibatalkan tidak meninggalkan
jejak di tree (status bersih di `f1e68d6` sebelum gate
dimulai).

### 1.3 Koreksi penafsiran yang tetap berlaku

- Area 5 Reality Check = pusat data & statistik (BUKAN kartu
  verdict cek-fakta). — Terverifikasi lokal (audit §0)
- Area 13 Public Report = fitur laporan masyarakat —
  perluasan `pf_correction_reports` (BUKAN laporan
  transparansi agregat). — Terverifikasi lokal (audit §0)

---

## 2. Fitur yang sudah tersedia

Semua di bawah ini ada di kode dan terverifikasi lokal
(build + baterai uji + PGlite). **Bukan** bukti produksi.

### 2.1 Fase 1–7 (fondasi)

- Autentikasi email + kata sandi, peran (super_admin, admin,
  editor, fact_checker, user), guard server-side, RLS penuh.
  — Terverifikasi lokal
- Artikel: CRUD, status draft/terbit/terjadwal/diarsipkan,
  versi, koreksi → CORRECTED + versi baru + tanggal koreksi.
  — Terverifikasi lokal
- Pencarian, arsip (`/arsip`), bookmark, riwayat baca, feed
  personal (`/feed-saya`), follow topik/negara, notifikasi.
  — Terverifikasi lokal
- Ingestion RSS (7 feed lolos: Antara, CNN Indonesia,
  Liputan6, CNBC Indonesia, Tribunnews, Republika, BBC
  Indonesia) + GDELT; dedup `hash_url` UNIQUE + aturan judul
  + `disalin_dari`/`diterbitkan_ulang`. — Terverifikasi lokal
- Verifikasi dua sinyal + koroborasi klaim (Fase 4), gate
  terbit (tolak UNCONFIRMED/DISPUTED tanpa verifikasi, 409 +
  alasan), antrean review editorial, audit log.
  — Terverifikasi lokal
- Daily Brief (selalu `draft`), kuis harian + skor tersimpan
  (login saja), peta Leaflet, data + tren, timeline,
  pengetahuan, TTS browser. — Terverifikasi lokal
- Admin: 13 halaman + 21 route `/api/admin/*`, Kesehatan
  Sistem, `GET /api/ai/status` (10 agen nyata).
  — Terverifikasi lokal
- SEO: sitemap dinamis 32 URL, robots, RSS 2.0, JSON-LD,
  canonical/OG, noindex admin; header keamanan 4/4 di
  `next.config.ts`. — Terverifikasi lokal

### 2.2 Gelombang 1 Fase 8 (commit `f1e68d6`)

- Jejak Fakta, Multi-Source View, Public Report
  (`/laporkan` + lacak status + `POST /api/laporan-publik`),
  My Prata (`/saya` + pengaturan + ekspor +
  `pf_user_preferences`). — Terverifikasi lokal (uji 120/120)
  **dengan KOREKSI pasca-audit mendalam (§12):
  Multi-Source View TIDAK LAYAK untuk klaim "N sumber
  independen" — tampilan menghitung salinan sebagai
  independen; uji 120/120 tidak pernah menguji logika ini.**
- Migrasi v8: T5 (cabut 3 policy insert anonim), T8
  (`pf_roles` Opsi A, permissions/role_permissions staf-only,
  article_sources/tags hanya artikel terbit), T1-sisa (cabut
  SELECT tingkat tabel `pf_quiz_questions` + GRANT per kolom
  kecuali `kunci`), perluasan CHECK enum (audit 18→46,
  scheduled_jobs 3→8, ai_runs 10→13), D1/D2/D3.
  — Terverifikasi lokal (PGlite, gate 34/34)
- Perbaikan desain G1/G2/G3 (0 token lama tersisa).
  — Terverifikasi lokal

---

## 3. Fitur yang masih belum tersedia

| # | Area / fitur | Alasan / catatan | Status |
|---|---|---|---|
| 2 | Story Tracker (`/cerita/[slug]`, ikuti cerita, notifikasi perkembangan) | Gelombang 2 dibatalkan; butuh 4 tabel baru + `/admin/event` (prasyarat — tidak ada UI admin event sama sekali) | Belum diuji (belum dibangun) |
| 4 | Explain the World (format explainer berlapis, `/admin/pengetahuan`) | Gelombang 2 dibatalkan; butuh kolom baru + admin pengetahuan | Belum diuji (belum dibangun) |
| 5 | Reality Check (grafik interaktif, perbandingan periode) | Gelombang 2 dibatalkan; `/data` Fase 6 tetap jalan | Belum diuji (belum dibangun) |
| 6 | Ask the World (korpus luas, arsip Q&A, penjawab antrean) | Gelombang 3 tidak dimulai; korpus saat ini hanya artikel + pengetahuan | Belum diuji (belum dibangun) |
| 8 | PRATA Academy | NIHIL (grep 0); butuh 4 tabel + modul percontohan dari editor | Belum diuji (belum dibangun) |
| 9 | PRATA Podcast | NIHIL (grep 0); keputusan audio belum ada; pembuatan file audio = BELUM BISA tanpa layanan TTS server gratis; repo belum pakai Supabase Storage sama sekali | Belum diuji (belum dibangun) |
| 10 | PRATA Research (`/riset`, laporan, dataset) | Gelombang 2 dibatalkan; butuh 2 tabel baru | Belum diuji (belum dibangun) |
| 11 | Country Profile (`/negara/[kode]`) | Gelombang 2 dibatalkan; butuh 2 tabel baru; data awal hanya Indonesia dari sumber resmi | Belum diuji (belum dibangun) |
| 12 | Historical Archive (`/sejarah`, Hari ini dalam sejarah) | Gelombang 2 dibatalkan; prasyarat `/admin/event` | Belum diuji (belum dibangun) |
| 14 | Advanced Admin Control Center | Gelombang 4 tidak dimulai; fondasi `/admin` ada (lihat §2.1) | Belum diuji (belum dibangun) |
| — | Notifikasi push ke editor saat draf penting masuk antrean | `grep pf_notifications` = 0 di jalur antrean; antrean bersifat pull-based (editor membuka `/admin/review`) | Belum tersedia (celah operasional, bukan bug) |
| — | Traffic Analytics admin | Tidak ada sumber analitik; JANGAN angka palsu — tampilkan "belum tersedia" bila dibangun | Belum tersedia |
| — | CSP (Content-Security-Policy) | Utang Fase 7; header keamanan lain 4/4 ada | Belum tersedia |
| — | Tanggal kejadian (event) otomatis dari berita | Tanggal terbit tersimpan & dipakai dedup; tanggal kejadian tidak diekstrak otomatis | Sebagian (lihat §8) |

---

## 4. Temuan keamanan

Detail penuh + bukti PGlite:
`/tmp/pf-gate-security/laporan-keamanan.md` (ephemera /tmp).
Semua status di bawah = **Terverifikasi lokal** (PGlite +
uji route asli), kecuali dinyatakan lain.

### 4.1 TERTUTUP (terverifikasi ulang di gate)

**T5 — Insert anonim melewati rate limit API: TERTUTUP.**
Gate PGlite sendiri (v1–v8, v7 2×, v8 2×): **34/34 lolos** —
37 tabel, RLS 37/37, 79 policy. INSERT anon DAN authenticated
ke `pf_newsletter_subscribers` / `pf_correction_reports` /
`pf_questions` ditolak (6/6); policy INSERT tersisa di
ketiganya = 0; tidak ada lagi policy INSERT
`with_check (true)` di seluruh `pf_*`. INSERT service-role
berhasil → jalur route jalan. Keempat route (`langganan`,
`laporan`, `tanya`, `laporan-publik`) sudah INSERT via
service role; tidak ada route lain yang insert ke 3 tabel
itu via session client.

**T8 — Baca publik berlebih: TERTUTUP.** Anon:
`pf_roles`/`pf_permissions`/`pf_role_permissions` = 0 baris;
`pf_article_sources`/`pf_article_tags` = 1 baris (hanya
artikel terbit), 0 untuk draf. Uji positif Opsi A: user login
biasa tetap membaca `pf_roles` dan JOIN
`pf_user_roles→pf_roles` mengembalikan role `user`
(`getUserRoles()` jalan); `pf_permissions`/
`pf_role_permissions` tetap 0 untuk non-staf.

**T1-sisa — Kolom kunci kuis bisa dibaca via REST: TERTUTUP +
peringatan terbukti nyata.** `has_column_privilege`
anon/auth untuk `kunci` = false/false; `SELECT kunci` dan
`SELECT *` anon → 42501; kolom non-kunci tetap bisa dibaca;
service role tetap baca kunci (`/api/kuis/jawab`,
`getKuisHarian`). **Peringatan Gelombang 1 terbukti
empiris:** sesudah `GRANT SELECT` tingkat tabel ke anon,
kunci terbuka lagi (`has_column_privilege` = true, SELECT
berhasil). Tindak lanjut: cek berkala 3 query SQL + perintah
pulihkan ditambahkan ke `supabase/README.md` (kebenaran cek
`column_privileges` dibuktikan di PGlite: 0 baris sebelum
grant, 1 sesudah).

**T10 (sebagian) — Ketahanan audit logging: fail-closed
TERTUTUP.** Kegagalan tulis audit tetap menggagalkan aksi
(16 call site, tanpa try/catch — diterima Fase 7). Log tak
bisa dihapus/diubah via REST (hanya 1 policy SELECT staf;
tanpa policy insert/update/delete; adapter tanpa method
delete).

### 4.2 DIPERBAIKI di gate (dengan bukti empiris)

**T6 — Perlindungan SSRF: 3 celah nyata ditemukan +
diperbaiki.** Pra-patch dibuktikan empiris: (1) `fetchRss`/
`cek` mengikuti redirect ke `169.254.169.254` tanpa validasi
ulang (fetch default `follow`); (2) `research.ts` mem-fetch
URL artikel **tanpa cek SSRF sama sekali** (`telitiItem` ke
metadata → `fetchBerhasil=true`); (3) `ipPrivat` bolong 11
bentuk (`::ffff:127.0.0.1`, `fe81::1`/`febf::1`, `::`, bentuk
panjang `::1`, CGNAT, multicast, reserved). Patch: `ipPrivat`
diperkeras + helper baru `fetchAman` (redirect manual, tiap
hop divalidasi, maks 5); dipakai `fetchRss`, `cek sumber`,
dan `research.ts`. **Pasca-patch: uji SSRF 43/43 lolos**
(15 baseline uji-fase7 tetap sama). Sisa jujur: DNS
rebinding (TOCTOU) tidak tertutup (butuh pinning IP);
fail-open bila DNS gagal dipertahankan; **198.18/15 sengaja
tidak diblokir** — resolver egress VM menjawab SEMUA
hostname dari 198.18/15 (terbukti `lookup('detik.com')` →
198.18.194.87), memblokirnya menolak setiap host di
lingkungan ini.

**T4 — Penolakan akun nonaktif: 6 jalur staf DIPERBAIKI.**
Sebelumnya hanya admin guard + AI GET yang menolak
nonaktif. Ditambahkan cek nonaktif (403, pola sama dengan
`guard.ts`, fail-open bila tabel belum ada) ke:
`autentikasiPemicuAi` (menutup POST
`/api/ai/jalankan|brief|data-analysis`),
`terbitkan-terjadwal`, `ingestion/jalankan`, `sumber` POST,
`sumber/[id]` guard (PATCH+DELETE), `sumber/[id]/cek`.
Uji gate keamanan (71 asersi, handler route asli):
nonaktif → 403 di kedua jalur; sumber POST editor aktif →
**201**; super_admin nonaktif DELETE → 403.
**Sisa tidak dipatch:** route pengguna biasa
(bookmark/notifikasi/riwayat/topik/kuis-skor/preferensi/
ekspor/tanya-GET — hanya data milik sendiri via RLS, dampak
rendah; mempatch 7+ helper duplikatif tidak sebanding) dan
`ingestion/antrean` GET (baca saja); `akun/status` sengaja
tidak diblokir (melaporkan status nonaktif).

### 4.3 TERBUKA (sisa — tidak diklaim aman)

**T3 — Distributed rate limiting + IP trust: TERBUKA.**
Cakupan sudah benar: **61/61 handler** di 45/45 berkas route
memanggil limiter tepat 1× (dihitung per-handler). Tapi
mekanisme lemah: (1) in-memory `Map` per instance
serverless — batas tidak berlaku global di Vercel, Map tak
pernah dibersihkan; (2) IP dari entri **kiri**
`x-forwarded-for`, yang ditulis klien sendiri — penyerang
memutar header per request dan limiter tak pernah penuh
(Vercel menyediakan `x-vercel-forwarded-for` yang di-set
edge). Rekomendasi gratis: IP dari
`x-vercel-forwarded-for`/entri terakhir + store bersama via
tabel Supabase `pf_rate_limits` (tanpa layanan baru). Tidak
diimplementasikan di gate ini — butuh keputusan + uji live
Vercel. — Terverifikasi lokal (kelemahan terbukti);
perbaikan: **Belum diuji** (butuh live).

**T10 (celah baru) — CRUD sumber tidak teraudit: TERBUKA.**
CRUD sumber (tambah/ubah/hapus) + cek sumber TIDAK tercatat
di audit sama sekali — padahal sumber = daftar target fetch
server. Tidak dipatch (butuh CHECK enum baru + plumbing
adapter). Observasi terkait: CHECK v8 menambah 28 aksi, tapi
`AksiAudit` di `types.ts` masih 18 — perlu sinkronisasi tiap
gelombang.

**T6 (sisa) — DNS rebinding (TOCTOU): TERBUKA.** Butuh
pinning IP (resolve sekali, fetch ke IP itu dengan Host
header) — tidak diimplementasikan di gate ini.

**CSP belum dipasang: TERBUKA.** Utang Fase 7; 4/4 header
keamanan lain ada di `next.config.ts`.

### 4.4 Sapuan secret — BERSIH (terverifikasi lokal)

0 pola JWT/key bocor di `src/`/`scripts/`/`supabase/`/
`.github/`/`.env.example`; `.env.local` hanya URL + anon key,
ter-ignore. Tidak ada nilai secret yang ditulis di berkas
gate mana pun (nama secret saja).

---

## 5. Migrasi database yang dibutuhkan

### 5.1 Status migrasi

| Migrasi | Tabel | RLS | Policy | Status |
|---|---|---|---|---|
| v1 | 8 | 8/8 | 18 | Diperintahkan aktif (berkas) — **Terblokir** di produksi |
| v2 | 16 | 16/16 | 51 | Sama |
| v3 | 18 | 18/18 | 53 | Sama |
| v4 | 23 | 23/23 | 59 | Sama |
| v5 | 26 | 26/26 | 62 | Sama |
| v6 | 35 | 35/35 | 76 | Sama |
| v7 | 36 | 36/36 | 79 | Sama |
| **v8** | **37** | **37/37** | **79** | **Terverifikasi lokal** (PGlite, idempoten 2×); **Terblokir** di produksi |

Angka v8 diverifikasi dari berkas migrasi (bukan asumsi):
1 tabel baru (`pf_user_preferences`), 3 policy dicabut (T5)
+ 3 policy baru = total tetap 79. Seed pasca-v8: roles 5,
permissions 9, role_permissions 19, categories 34, sources 8,
scheduled_jobs 3, sisanya 0.

**Migrasi v8 TIDAK diubah selama gate** (0 baris diff) —
perbaikan keamanan gate berupa patch kode + dokumentasi,
bukan migrasi baru. Tidak ada migrasi v9 yang dibuat.

### 5.2 Migrasi yang masih dibutuhkan (bila ekspansi dilanjutkan)

- Bila area 2/4/5/6/10/11/12 dibangun: tabel/kolom baru
  sesuai `AUDIT-EXPANSION.md` §5 (4 tabel Story Tracker,
  kolom explainer, kolom `pf_questions`, 2 tabel Research,
  2 tabel Country Profile, kolom `era`/`penting` event).
  — Belum diuji (belum dibangun)
- Bila T10 diperbaiki: CHECK enum `pf_audit_logs.aksi`
  baru untuk aksi CRUD sumber + cek sumber. — Belum diuji
- Bila T3 diperbaiki via store bersama: tabel
  `pf_rate_limits`. — Belum diuji (butuh keputusan)
- Bila Podcast memakai file audio: bucket Supabase Storage
  baru (repo belum pakai Storage sama sekali). — Belum diuji

### 5.3 Prosedur cutover (deliverable gate)

**[supabase/CUTOVER.md](sandbox://workspace/prata-fakta/supabase/CUTOVER.md)**
(38.627 byte, Bahasa Indonesia, 11 bagian) — pemeriksaan
pra-migrasi, backup (`scripts/backup-pf.mjs`, kini 37 tabel),
migrasi v1–v8 berurutan via SQL Editor + kueri verifikasi
sesudah tiap berkas, validasi fungsi (`pf_has_role`,
`pf_is_super_admin`, `pf_handle_new_user` SECURITY DEFINER +
`search_path=public`, `pf_set_updated_at`), smoke test,
rollback (gagal satu berkas = ulangi berkas itu; batal total
= DROP 37 tabel `pf_*` di bawah peringatan besar + larangan
mutlak menyentuh `tasik_*`/`snbt_*`/`auth.users`).
Prosedur tidak pernah meminta kredensial lewat pesan biasa
(key hanya via Secure Vault / `.env.local`).
**Aturan urutan terpenting: v8 sesudah deploy** — karena v8
mencabut 3 policy insert anonim (T5) dan mengunci kolom
kunci kuis (T1-sisa); kode pengganti service-role sudah ada
di `f1e68d6` tapi baru berlaku sesudah deploy. Bila v8 jalan
sebelum deploy, 3 route publik mati sampai deploy selesai.

**[DEPLOY.md](sandbox://workspace/prata-fakta/DEPLOY.md)**
(2.872 byte, baru) + `LAPORAN-AKHIR.md` §11/§12 diperbarui
(v8 + CUTOVER.md + status `f1e68d6`, 94 rute).

---

## 6. Fitur yang berhasil dikembangkan

Bagian ini = pekerjaan gate Fase 8 (bukan Fase 1–7).
"Berhasil" berarti selesai + terverifikasi lokal.

### 6.1 Keamanan (patch kode, 9 berkas src + `supabase/README.md`)

- `src/lib/ingestion/ssrf.ts`: `ipPrivat` diperkeras +
  `fetchAman` (redirect manual, tiap hop divalidasi, maks 5).
  — Terverifikasi lokal (SSRF 43/43)
- `src/lib/ingestion/rss.ts`, `src/lib/ai/research.ts`,
  `src/app/api/sumber/[id]/cek/route.ts`: memakai
  `fetchAman`. — Terverifikasi lokal
- `src/lib/ai/route-auth.ts` (`autentikasiPemicuAi`),
  `src/app/api/ingestion/jalankan/route.ts`,
  `src/app/api/sumber/route.ts`,
  `src/app/api/sumber/[id]/route.ts`,
  `src/app/api/admin/artikel/terbitkan-terjadwal/route.ts`:
  cek akun nonaktif (403). — Terverifikasi lokal (71 asersi)
- `supabase/README.md`: cek berkala kolom `kunci`
  (3 query SQL + perintah pulihkan). — Terverifikasi lokal

### 6.2 Dokumentasi cutover + deploy

- `supabase/CUTOVER.md`, `DEPLOY.md`, `LAPORAN-AKHIR.md`
  §11/§12, `scripts/backup-pf.mjs` (36 → 37 tabel).
  — Terverifikasi lokal (ukuran + isi diperiksa koordinator)

### 6.3 Audit + laporan

- `AUDIT-EXPANSION.md` §9 (audit gate 8 pertanyaan per
  area + status akhir per area). — Selesai
- `LAPORAN-FASE-8.md` (dokumen ini, 11 bagian). — Selesai
- Catatan agen gate: `/tmp/pf-gate-security/`,
  `/tmp/pf-gate-scheduler/`, `/tmp/pf-gate-regression/`
  (ephemera /tmp — bukan deliverable tahan restart).

### 6.4 Perbaikan baterai uji

- `scripts/uji-fase7.mjs` (+20/−10 baris): kini menerapkan
  v1–v8 (v8 2× idempoten) + role `anon`/`authenticated` +
  ekspektasi 37 tabel / RLS 37/37 / policy 79 + cek backup
  37 — memperbaiki artefak 85/87 menjadi **87/87**.
  — Terverifikasi lokal

---

## 7. Fitur yang belum selesai

1. **10 dari 14 area ekspansi** (2, 4, 5, 6, 8, 9, 10, 11,
   12, 14) — rencana tetap di `AUDIT-EXPANSION.md` §5/§7;
   dapat dibangun ulang bila pemilik melanjutkan ekspansi.
   — Belum dibangun
2. **T3 rate limiting terdistribusi** — rekomendasi ada
   (§4.3), implementasi butuh keputusan + uji live Vercel.
   — Terblokir (butuh live)
3. **T10 audit CRUD sumber** — butuh CHECK enum baru +
   plumbing adapter; belum dipatch. — Belum selesai
4. **DNS rebinding (T6)** — butuh pinning IP.
   — Belum selesai
5. **CSP** — utang Fase 7, belum dipasang. — Belum selesai
6. **Temuan scheduler F2–F13** (lihat §10.3) — rekomendasi
   ada, belum diimplementasikan: `concurrency` group,
   gating `editorial.yml` rapuh, assert `jq` anti-sukses
   palsu, `terakhir_jalan` cron, seed job 3 → lengkap,
   `--retry`, backoff gagal-gate, dispatch `keduanya`.
   — Belum selesai
7. **Sinkronisasi `AksiAudit` di `types.ts`** (masih 18,
   CHECK v8 sudah 46). — Belum selesai
8. **Notifikasi push ke editor** (antrean pull-based saja).
   — Belum tersedia
9. **`/admin/event`, `/admin/pengetahuan`, `/admin/kuis`,
   `/admin/data`, `/admin/tanya`** — blokir operasional
   area 2/4/6/10/11/12. — Belum dibangun
10. **Uji browser nyata** (klik, login, peta, TTS,
    responsif, redirect `/saya`→`/masuk` ujungnya).
    — Belum diuji (butuh migrasi + deploy + akun produksi)

---

## 8. Hasil regression testing

Semua angka = **Terverifikasi lokal** (PGlite + `next
start` lokal). Detail:
`/tmp/pf-gate-regression/laporan-regression.md`.

### 8.1 Baterai uji (working tree penuh, sesudah patch keamanan)

| Baterai | Hasil | EXIT |
|---|---|---|
| `uji-fase5.mjs` | **53/53 lolos** | 0 |
| `uji-fase6.mjs` | **53/53 lolos** | 0 |
| `uji-fase7.mjs` | **87/87 lolos** (sebelum perbaikan artefak: 85/87) | 0 |
| `uji-fase8-gel1.mjs` | **120/120 lolos** | 0 |
| `uji-ingestion.mjs` | **10 lolos, 1 gagal** — GDELT live HTTP 429 (eksternal, 2× run; sama di HEAD bersih, bukan regresi) | 1 |
| `uji-editorial.mjs` | **10/10 lolos** | 0 |
| `uji-gate-keamanan` (skrip agen, di /tmp) | **71/71 lolos** | 0 |
| Gate PGlite keamanan | **34/34 lolos** | — |
| Uji SSRF pasca-patch | **43/43 lolos** | — |

**Artefak backup 37-vs-36 — DITANGANI, bukan
disembunyikan.** Akar: `backup-pf.mjs` diubah agen Cutover
jadi 37 tabel (v8 `pf_user_preferences`, benar pasca-v8)
sementara `uji-fase7` hanya menerapkan v1–v7 (36 tabel).
Perbaikan (tanpa revert backup): `uji-fase7.mjs` kini
menerapkan v1–v8 + ekspektasi 37/37/79 + cek backup 37.
Sesudah: **87/87, EXIT 0.**

### 8.2 Smoke test (`next start` :3100, lokal)

200: `/`, `/laporkan` (form lengkap), `/laporkan/lacak`,
`/peta`, `/data`, `/timeline`, `/kuis`, `/tanya`,
`/sitemap.xml`, `/robots.txt`, `/rss.xml`, `/api/health`
(200 `degraded`, db belum_tersedia). 404 jujur:
`/artikel/uji-tidak-ada`, `/pengetahuan/uji-tidak-ada`.
Jujur lain: `/api/sumber` GET → 503; POST `/api/langganan`
→ 503; GET `/api/ai/status` → 401; POST
`/api/laporan-publik` → 400 (validasi jalan).
**Tidak terbukti ujungnya:** `/saya` + `/saya/pengaturan`
(shell 200 PPR + rantai RSC 307 self-redirect tak
terselesaikan ke `/masuk` via curl; kode redirect ada di
`page.tsx:59` — butuh browser nyata). Jejak Fakta /
Multi-Source View / `/saya` login tidak dapat diuji tanpa
Supabase + artikel terbit + akun. — Belum diuji (butuh
browser + produksi)

### 8.3 Kesiapan redaksi — alur (a)–(j), data NYATA 16 Nov 2026

**Pernyataan eksplisit: 7 draf VERIFIED dari dry-run
otomatis Fase 4 maupun 5 draf VERIFIED dari run hari ini
TIDAK layak publikasi tanpa review Muse/editor** —
verifikasi bertumpu angka latar, bukan penilaian isi.
Alur review editor itu sendiri BERFUNGSI (bukan hanya
gate kode).

| Langkah | Hasil | Status |
|---|---|---|
| (a) Menemukan berita baru | 356 ditemukan / 355 baru / 1 duplikat / 0 gagal (7 feed RSS nyata); run 2: 356/0 baru | Terverifikasi lokal |
| (b) Mendeteksi duplikat | Run 2: 0 baru / 356 duplikat; `disalin_dari` 2 baris (UUID menunjuk item Antara asli); `diterbitkan_ulang` 1 baris (flag true) | Terverifikasi lokal |
| (c) Menyimpan sumber asli | `pf_raw_items` menyimpan sumber_id, url, judul, ringkasan, penulis, `waktu_terbit_asli`, `disalin_dari_id` | Terverifikasi lokal |
| (d) Mengidentifikasi tanggal kejadian | **SEBAGIAN:** tanggal terbit tersimpan & dipakai dedup; tanggal kejadian (event) tidak diekstrak otomatis; belum ada `/admin/event` | Sebagian |
| (e) Membandingkan sumber | 5 draf VERIFIED via koroborasi 2 sumber (inti "700 juta"/"2 triliun") — peringatan: bertumpu angka latar, bukan peristiwa utama | Terverifikasi lokal (dengan peringatan) |
| (f) Membuat draft orisinal | 5 draf, semua `status='draft'` | Terverifikasi lokal |
| (g) Menampilkan bukti | Evidence 692 + klaim 686 + verification_records 200 tersimpan; policy baca Area 1 terbukti; tampilan publik dengan artikel terbit nyata belum teruji live | Terverifikasi lokal (tampilan: Belum diuji) |
| (h) Menyimpan hasil pemeriksaan | verification_records 200 (UNCONFIRMED 195, VERIFIED 5); `pf_ai_runs` 815 | Terverifikasi lokal |
| (i) Mengirim berita penting ke editor | Antrean BERFUNGSI pull-based: draf otomatis masuk `/api/admin/antrean` + `/admin/review`; editor/fact_checker memutuskan via `POST /api/admin/artikel/[id]/review` → `pf_editorial_reviews` + audit; uji-fase5 membuktikan setuju→terbit, tolak→tetap draft. **Tidak ada notifikasi push ke editor** | Berfungsi (push: Belum tersedia) |
| (j) Memperbarui artikel | Koreksi A diterima → CORRECTED + versi baru (versi 3) + tanggal koreksi + record CORRECTED agen 'editor'; koreksi B ditolak | Terverifikasi lokal |

Brief 2026-11-16: 1 baris, status `draft`, 10 entri,
10 isu berkembang. — Terverifikasi lokal

---

## 9. Hasil build

| Perintah | Hasil | Status |
|---|---|---|
| `npx tsc --noEmit` | EXIT 0 | Terverifikasi lokal |
| `npm run lint` | EXIT 0 | Terverifikasi lokal |
| `npm run build` | EXIT 0 — **94/94 static pages**, BUILD_ID `rVaLmIi2bkpf0FCW-y_UF` (agen keamanan, dengan hanya 9 berkasnya: EXIT 0, 94 static pages, 97 app paths, BUILD_ID `Cfx9f0i1RRwasZWL_pFsA`) | Terverifikasi lokal |
| Build sesudah Gelombang 1 (sebelum gate) | EXIT 0, 94/94 | Terverifikasi lokal |

Catatan: build lokal 94 rute belum diulang sebagai satu
kesatuan sesudah SEMUA perubahan gate digabung dalam satu
commit — regression menjalankannya di working tree penuh
(BUILD_ID `rVaLmIi2bkpf0FCW-y_UF`), jadi angka di atas
adalah angka working tree penuh. Build produksi
(Vercel): **Terblokir** (403 tim).

---

## 10. Hasil production readiness

### 10.1 Scheduler — 5 jadwal terverifikasi (WIB = UTC + 7)

Detail: `/tmp/pf-gate-scheduler/laporan-scheduler.md`.
Semua status = **Terverifikasi lokal** (konfigurasi +
dry-run); **0 run live** di tab Actions.

| Jadwal | Cron YAML | WIB | Secret dipakai | Endpoint + auth | Retry | Logging | Duplikasi | Dispatch |
|---|---|---|---|---|---|---|---|---|
| Ingestion | `*/30 * * * *` | tiap 30 mnt | `PF_SITE_URL`, `PF_INGESTION_SECRET` | `POST /api/ingestion/jalankan`, `x-pf-ingestion-secret` | `curl --fail-with-body`, timeout 10 mnt, tanpa `--retry` | Log Actions + `pf_ingestion_runs` | `hash_url` UNIQUE; run 2 = 0 baru | ✅ input `sumber_id` |
| Pipeline editorial | `0 0,6,12,18 * * *` | **07, 13, 19, 01 WIB besok** — sesuai klaim §11.2 | `PF_SITE_URL`, `PF_AI_SECRET` | `POST /api/ai/jalankan`, `x-pf-ai-secret`, limit 10 (dijepit server 1–50) | sama, tanpa retry | Log Actions + `pf_ai_runs` | Antrean hanya UNCONFIRMED; klaim didedup | ✅ `tugas`/`limit` |
| Daily Brief | `0 22 * * *` | **05:00 WIB besok** | `PF_SITE_URL`, `PF_AI_SECRET` | `POST /api/ai/brief`, `x-pf-ai-secret` | sama, tanpa retry | Log Actions + `pf_daily_briefs` | Upsert per tanggal, selalu `draft` | ✅ via `tugas=brief` |
| Data Analysis | `0 1 * * 1` (Senin) | Senin **08:00 WIB** | `PF_SITE_URL`, `PF_AI_SECRET` | `POST /api/ai/data-analysis`, `x-pf-ai-secret` | sama, tanpa retry | Log Actions + `pf_ai_runs` | Hitung ulang menimpa nilai sama; <2 titik dilewati | ✅ tanpa input |
| Terbitkan-terjadwal | `0 * * * *` | tiap jam | `PF_SITE_URL`, `PF_AI_SECRET` | `POST /api/admin/artikel/terbitkan-terjadwal`, `x-pf-ai-secret` | sama, tanpa retry | Log Actions + `pf_audit_logs` | Hanya `terjadwal` + lewat waktu + gate; maks 100/jam | ✅ tapi default `keduanya` TIDAK menjalankannya (F2) |

`SUPABASE_SERVICE_ROLE_KEY` **tidak dipakai workflow mana
pun** (grep `.github/` = 0) — hanya env server-side Vercel.
Semua endpoint: auth dua jalur (secret timing-safe
`bandingkanSecret`, false bila kosong, atau sesi
editor/super_admin); secret env belum diatur + tanpa sesi →
**503 jujur**; header salah → **401**; keduanya
menggagalkan job via `--fail-with-body`. **Kredensial kosong
tidak bisa menghasilkan sukses palsu.**

**Angka dry-run (nyata, 16 Nov 2026, PGlite + feed RSS
nyata — SEMUA LOLOS):** ingestion run 1: 356 ditemukan /
354 baru / 2 duplikat / 0 ditolak / 0 gagal; run 2: 0 baru.
GDELT: 1×, 5 item, HTTP 200, ±19,8 dtk (dulu 429 — perlu
uji ulang dari runner GitHub). Pipeline editorial: diproses
200, draf 5, terverifikasi 5, unconfirmed 195, gagal 0;
klaim 688, evidence 694, verification_records 200, ai_runs
815. Daily Brief: `draft`, 10 entri, 10 isu berkembang.
Data Analysis: terakhir 5,20 (15 Nov), sebelumnya 5,10,
selisih +0,10, +1,96%, tren naik. Terbitkan-terjadwal:
5 kasus gate SEMUA LOLOS (VERIFIED lampau → terbit;
UNCONFIRMED → tetap terjadwal; tanpa verification record →
dilewati; VERIFIED masa depan → tetap terjadwal; draft →
tak disentuh; diterbitkan=1, dilewati=2, audit
`artikel.terbit`=1). **Terbukti: job HANYA menerbitkan
yang dijadwalkan + lolos gate, bukan semua draft.**
(Catatan: skrip 5 kasus `uji-terbitkan-gate.mjs` ada di
scratch agen `/tmp/pf-gate-scheduler/scripts/`, bukan di
repo — bukti `uji-fase5.mjs` ada di repo dan dapat diulang.)

### 10.2 GATE PUBLIKASI OTOMATIS — TIDAK

**Tidak aman mengaktifkan publikasi otomatis sekarang.**
Workflow tanpa saklar aktif terpisah — begitu deploy +
secret terisi, cron jalan sendiri; jadi gate-nya adalah
jangan isi secret/deploy sebelum lolos.

| Syarat | Status |
|---|---|
| (i) Migrasi v1–v8 jalan di produksi | **TERTAHAN** — hanya teruji PGlite lokal |
| (ii) Deploy Vercel + secret terisi | **TERTAHAN** — blokir 403 tim `prataava`, secret belum dibuat |
| (iii) Gate editorial + pengujian sumber dinyatakan aman | **TERTAHAN (sebagian terbukti lokal)** — gate kode terbukti, tapi koroborasi bertumpu angka latar; review Muse/editor wajib; belum ada uji produksi/browser/login staf |
| (iv) Scheduler terbukti live (≥1 run tiap jadwal di tab Actions + angka DB) | **TERTAHAN** — 0 run live |
| (v) Tak ada jalur yang menerbitkan draf mentah tanpa persetujuan manusia | **LOLOS by design** — pipeline selalu `draft`; terbitkan hanya item yang dijadwalkan editor + gate ulang |

### 10.3 Temuan scheduler (F1–F13; yang utama)

- **F3 — Tanpa `concurrency` group di workflow mana pun,
  tanpa lock server-side.** Tumpang tindih nyata pada menit
  :00; dampak dinilai rendah (semua alur idempotent), tapi
  pipeline bisa membaca batch ingestion yang sedang berjalan.
  Rekomendasi: tambah `concurrency` group per workflow.
- **F4 — Gating job `editorial.yml` memakai perbandingan
  string `github.event.schedule == '...'`** — rapuh, belum
  pernah terbukti live. Rekomendasi: periksa tab Actions pada
  00:00/22:00 UTC pertama; jangka panjang pecah jadi 3
  workflow terpisah.
- **F5 — Sukses palsu parsial:** endpoint HTTP 200 +
  `ok:true` meski `gagal > 0`; workflow tidak memeriksa isi
  respons. Rekomendasi: tambah langkah `jq` assert.
- **F6 — `pf_scheduled_jobs.terakhir_jalan` tidak
  diperbarui run cron** — dashboard akan menampilkan job cron
  "belum pernah jalan" selamanya.
- **F7** — Seed `pf_scheduled_jobs` hanya 3 job; pemicu
  manual admin tak memetakan `data-analysis`/
  `terbitkan-terjadwal`. **F8** — Tanpa retry; Daily Brief
  1×/hari, satu kegagalan = brief hari itu hilang (tambah
  `--retry 2`). **F12** — Artikel terjadwal gagal gate
  dicoba ulang tiap jam tanpa backoff (noise log).
  **F2** — Dispatch `keduanya` tidak menjalankan
  terbitkan-terjadwal.

### 10.4 Kesiapan produksi — ringkasan

| Butir | Status |
|---|---|
| Kode + build + lint + tsc | Terverifikasi lokal (EXIT 0) |
| Migrasi v1–v8 di PGlite (idempoten + RLS + policy) | Terverifikasi lokal |
| Prosedur cutover tertulis + backup 37 tabel | Selesai (dokumen) |
| Migrasi di Supabase produksi | **Terblokir** (butuh pemilik) |
| Deploy Vercel | **Terblokir** (403 tim; `authorize_team_access` tidak ada di konektor) |
| Secret (6 env Vercel + 3 secret Actions) | **Terblokir** (belum dibuat; nama saja, nilai tidak pernah lewat chat) |
| Scheduler live | **Terblokir** (0 run) |
| Smoke test produksi | **Belum diuji** (butuh migrasi + deploy) |
| Uji browser nyata / login staf | **Belum diuji** |

---

## 11. Hambatan yang membutuhkan tindakan pemilik

1. **Pilih opsi deploy Vercel (A, B, atau C)** — tanpa ini
   tidak ada deploy dan tidak ada v8. Opsi A (dianjurkan):
   putuskan + hubungkan ulang Vercel di Muse, setujui akses
   tim `prataava` di layar OAuth (±5 menit klik). Opsi B:
   import manual di dashboard Vercel (login + 6 env var +
   Deploy, ±15 menit). Opsi C (cadangan): ZIP sumber via
   Vercel Drop (tanpa `.next`). Detail + risiko di
   `CUTOVER.md` §5.2 + `DEPLOY.md`. — Terblokir
2. **Jalankan migrasi v1–v7 via SQL Editor** (atau serahkan
   `SUPABASE_SERVICE_ROLE_KEY` via Secure Vault agar Muse
   yang menjalankan) — lalu deploy, lalu v8 (urutan wajib
   §5.3). — Terblokir
3. **Isi 6 env var** di Vercel + **3 secret GitHub Actions**
   (`PF_INGESTION_SECRET`, `PF_AI_SECRET`, `PF_SITE_URL` —
   nilai sama di kedua tempat). Nama saja; nilai tidak pernah
   lewat chat. — Terblokir
4. **Jalankan backup baseline** sebelum migrasi (membuktikan
   key valid) + backup pasca-migrasi 37/37. — Terblokir
5. **Sesudah live: uji login + klik + HP/desktop** (smoke
   §6.3 `CUTOVER.md`) dan tetapkan super_admin pertama
   (butuh UUID akun dari Authentication → Users). —
   Belum diuji
6. **Keputusan T3** (rate limiting terdistribusi via
   `x-vercel-forwarded-for` + tabel `pf_rate_limits`) —
   butuh keputusan + uji live Vercel. — Belum diputuskan
7. **Keputusan audio Podcast** (rekaman manusia vs TTS
   server vs TTS browser saja) — bila pemilik memilih
   rekaman/TTS server, butuh layanan + bucket Storage baru.
   — Belum diputuskan
8. **Pertanyaan lama yang belum dijawab:** migrasi dijalankan
   pemilik sendiri atau via service-role key (butir 2 di
   atas); Vercel putuskan + hubungkan ulang atau import
   manual (butir 1); repo prata-remote masih menunggu
   penghapusan manual pemilik (Settings → Danger Zone).
   — Terblokir

---

## Lampiran — berkas gate

| Berkas | Isi | Ukuran |
|---|---|---|
| `AUDIT-EXPANSION.md` (§9) | Audit gate 8 pertanyaan per area + status akhir | diperbarui |
| `LAPORAN-FASE-8.md` (dokumen ini) | Laporan gate 11 bagian | baru |
| `supabase/CUTOVER.md` | Prosedur cutover migrasi v1–v8 + rollback | 38.627 byte |
| `DEPLOY.md` | Ringkasan deploy + opsi A/B/C | 2.872 byte |
| `LAPORAN-AKHIR.md` (§11/§12) | Diperbarui: v8 + CUTOVER.md + status `f1e68d6` | diperbarui |
| `scripts/backup-pf.mjs` | Daftar tabel 36 → 37 | diperbarui |
| `scripts/uji-fase7.mjs` | Menerapkan v1–v8 + ekspektasi 37/37/79 | diperbarui |
| `src/lib/ingestion/ssrf.ts` dkk. (9 berkas) | Patch T6 + T4 | diperbarui |
| `supabase/README.md` | Cek berkala kolom `kunci` | diperbarui |
| `/tmp/pf-gate-security/laporan-keamanan.md` | Laporan agen keamanan (155 baris) | ephemera /tmp |
| `/tmp/pf-gate-scheduler/laporan-scheduler.md` | Laporan agen scheduler (246 baris) | ephemera /tmp |
| `/tmp/pf-gate-regression/laporan-regression.md` | Laporan agen regression (320 baris) | ephemera /tmp |

*Migrasi v8 TIDAK diubah selama gate. Tidak ada data dummy.
Tidak ada statistik palsu. Tidak ada klaim produksi.*

---

## 12. Audit mendalam Gelombang 1 (16 Nov 2026 ±07.00–07.06 WIB)

Atas perintah pemilik 07.00 WIB ("bukti fitur
benar-benar bekerja, bukan sekadar berhasil dibuat"), dua
agen audit read-only menguji 4 fitur Gelombang 1 +
migrasi v8 di PGlite + `next start`. Laporan lengkap:
`/tmp/pf-audit-gel1-a/laporan-audit-gel1-a.md` (140 baris)
dan `/tmp/pf-audit-gel1-b/laporan-audit-gel1-b.md`
(366 baris) — ephemera /tmp. Semua klaim kunci di bawah
diverifikasi ulang koordinator langsung di kode
(grep + baca baris persis). Repo tidak diubah kedua agen
(`git status` bersih sesudahnya); produksi tidak disentuh.

### 12.1 Jejak Fakta — LAYAK DENGAN CATATAN

**Bukti (skrip agen 34/34 lolos; baterai Gelombang 1
diulang di HEAD `a76e028`: 120/120, EXIT 0):**
- Query persis `getJejakFakta` (`src/lib/data.ts:718-751`),
  role anon, PGlite v1–v8: artikel terbit → klaim **3**,
  evidence **3**, verification **1 (VERIFIED)**; artikel
  draf → **0/0/0** di ketiganya.
- Klaim tanpa bukti kembali 0 bukti; komponen menampilkan
  "Belum ada bukti yang tercatat" (`JejakFakta.tsx:78`) —
  ditangani, bukan dikarang.
- Join artikel→klaim→evidence→verification→raw_item =
  **3 baris**; `pf_articles.raw_item_id` ada (v3:108) dan
  join langsung kembali 1 baris (item asli Antara).
- Rantai: `page.tsx:97-98` → `getJejakFakta`
  (`data.ts:708`) → session client → `page.tsx:246` →
  `JejakFakta.tsx:43`. Tanpa hardcode; gagal query →
  `tersedia:false` → pesan error jujur.

**Temuan:**
- **F-A1-1 (sedang):** `getJejakFakta` tidak memeriksa
  `status='terbit'` di aplikasi (baris 708–755 tidak
  mengandung filter itu — diverifikasi koordinator);
  perlindungan draf sepenuhnya RLS v8 (terbukti bekerja,
  tapi tanpa defense-in-depth — beda dengan
  `getPerbandinganSumber` yang mengecek eksplisit di
  `data.ts:865`). Perbaikan: tambah `.eq("status",
  "terbit")` seperti `getPerbandinganSumber`.
- **F-A1-2 (ringan):** provenance `raw_item` tidak pernah
  ditampilkan — `grep raw_item_id|pf_raw_items` = 0 di
  `data.ts` + kedua komponen (diverifikasi koordinator).
  Klaim audit §5.1 soal provenance benar di skema tapi
  melebih-lebihkan tampilan.

**Smoke:** `/artikel/uji-jejak-fakta-a` → 404 (belum ada
artikel terbit di mana pun — produksi belum punya tabel
`pf_*`). Render live seksi = **Belum diuji**.

### 12.2 Multi-Source View — TIDAK LAYAK (klaim "N sumber independen")

**Klaim LAPORAN-FASE-8 §9.2 / AUDIT-EXPANSION.md §9.2
"tanpa kesetaraan palsu" terbukti TIDAK BENAR untuk
salinan — dikoreksi di kedua dokumen.**

**Bukti — mesin benar, tampilan salah:**
- Mesin benar: `daftarSumberIndependen`
  (`verification.ts:73`) menghitung Kasus X (1 berita
  disalin 3 media, judul identik, `disalin_dari_id`→asli)
  = **1**, Kasus Y (3 liputan independen) = **3**;
  keputusan X = UNCONFIRMED.
- Tampilan salah: `grep disalin_dari` = 0 di `data.ts` +
  kedua komponen (diverifikasi koordinator).
  `getPerbandinganSumber` menghitung independen sebagai
  jumlah `sumberId` berbeda (`data.ts:991-993` —
  diverifikasi koordinator:
  `independen = new Set(mendukung.map((d) => d.sumberId)...).size`).
  Hasil: **X = 3 independen, Y = 3 independen — tidak
  dibedakan**; sel KX1: 3×"Sama", skor tertinggi 90 di
  keduanya. Satu berita disalin 3× tampil persis seperti
  3 liputan independen.
- Baterai 120/120 tidak pernah menguji logika ini (hanya
  hitung RLS + grep statis).
- Temuan lain: **F-A3-3** sumber utama tanpa tier/skor
  (`data.ts:899-910` `tier:null`) — klaim yang hanya
  didukung Antara tier-1 tampil "tanpa skor sumber";
  **F-A3-4** bukti tak tercocokkan kolom (BBC) tak terlihat
  di sel mana pun; **F-A3-5** `beda_waktu` dipicu tanggal
  berapa pun — salinan telat 2 hari tampil "cerita
  berkembang"; **F-A3-6** dedup judul-saja: salinan
  parafrase → `baru`, lolos sebagai independen penuh
  bahkan di mesin.
- Peredam jujur (bukan pembatal): pipeline menulis
  evidence hanya dari URL akar independen
  (`pipeline.ts:458-460,505-540` — diverifikasi
  koordinator) — bug laten untuk data pipeline, baru
  muncul bila evidence/`pf_article_sources` berasal dari
  luar pipeline (entri editor, impor).

**Perbaikan wajib sebelum klaim dipakai:** tampilan
memakai rantai `disalin_dari`/akar salinan seperti mesin
(`daftarSumberIndependen`); tangani tier null, bukti tak
tercocokkan, dan `beda_waktu` (ambang bermakna, bukan
tanggal berapa pun).

### 12.3 Public Report — LAYAK DENGAN CATATAN

**Bukti HTTP smoke (`next start` :3101, URL Supabase
dummy agar nol sentuhan produksi):** POST
`/api/laporan-publik` — tanpa deskripsi → **400**; jenis
bogus → **400**; deskripsi pendek → **400**; email tak
valid → **400**; body VALID → **503** `"Layanan laporan
belum aktif (kunci layanan belum diatur)"` (jujur — tidak
diklaim tersimpan); permintaan ke-6 dan ke-7 → **429**.
GET lacak nomor salah → 400, nomor benar → 503.

**Bukti PGlite (baterai agen `uji-gel1-b.mjs`: 80/80,
EXIT 0):** INSERT anon DAN authenticated ke
`pf_correction_reports` ditolak; insert superuser
(= service role) berhasil; lookup `nomor_lacak` sebagai
anon = 0 baris; A baca laporan sendiri = 1, laporan
anonim/B = 0; staf baca semua = 4, UPDATE status =
1 baris, DELETE editor = 0, DELETE super_admin = 1.

**Rantai validasi (bukan frontend-only):**
`FormLaporanPublik.tsx:30-34` (client: hanya deskripsi
≥10) → `route.ts:62-113` (server: enum jenis, tautan
http(s) ≤500, deskripsi 10–2000, nama ≤120, email regex)
→ insert service-role `route.ts:176-196`. Keempat kasus
400 dibuktikan via curl langsung (bypass form).

**Temuan:**
- **F1 (sedang):** status `ditinjau` tak pernah tercapai
  — hanya ada di tipe (`src/lib/admin/types.ts:31`) dan
  filter (`src/app/api/admin/koreksi/route.ts:17`); tak ada
  kode yang menulisnya (diverifikasi koordinator).
- **F2 (sedang–tinggi):** laporan tanpa `artikel_id` TIDAK
  BISA diterima — `tindaklanjutiKoreksi`
  (`src/lib/admin/editorial.ts:442-443`) melempar bila
  artikel tak ditemukan (`if (!artikel) throw new
  Error("Artikel laporan koreksi tidak ditemukan.")` —
  diverifikasi koordinator); hanya bisa ditolak. Ini
  melemahkan alur "laporan masyarakat" umum (laporan
  tanpa artikel spesifik tak punya jalur terima).
- **F3 (ringan):** adapter admin tak memilih
  `nomor_lacak`/`pelapor_email`/`tautan_artikel`
  (`src/lib/admin/supabase-adapter.ts:339-383`); tipe
  `Koreksi.artikel_id` non-null vs skema nullable
  (`src/lib/admin/types.ts:213-224`).

**Keterbatasan jujur:** penyimpanan laporan VALID
ujung-ke-ujung BELUM terbukti (butuh service key + DB);
alur login/klik moderator butuh browser + akun.

### 12.4 My Prata — LAYAK DENGAN CATATAN

**Bukti PGlite (baterai agen, 80/80):** A
SELECT/UPDATE/DELETE milik B = **0 di 6/6 tabel**
(`pf_bookmarks`, `pf_reading_history`,
`pf_user_preferences`, `pf_notifications`,
`pf_quiz_scores`, `pf_followed_topics` — nama policy
persis tercatat di laporan agen, mis. `pf_bookmarks baca
sendiri`, `pf_user_preferences baca pemilik`); A SELECT
sendiri = 1; anon = 0 di 6/6 tabel; `pf_notifications`
INSERT milik sendiri ditolak (by design, tanpa policy
INSERT).

**Bukti kode:** ekspor (`src/app/api/saya/ekspor/route.ts:53-97`)
— ketujuh query `.eq("user_id", userId)` (diverifikasi
koordinator: 7×); preferensi GET `:74-79` / PATCH
`:148-153` sama. Tanpa login: `/api/saya/ekspor` dan
`/api/saya/preferensi` → **401**; `/saya`,
`/saya/pengaturan`, `/admin/koreksi` → HTTP 200 shell
tapi payload RSC berisi `REDIRECT;replace;/masuk;307;`
(guard jalan; shell tanpa data personal).

**Temuan:**
- **F4 (TINGGI — juga §12.5):** `pf_user_preferences`
  lahir tanpa GRANT eksplisit (lihat §12.5).
- **F5 (ringan):** hapus akun mandiri belum ada — hanya
  via email redaksi (`src/components/saya/FormPengaturan.tsx:196-197`
  — diverifikasi koordinator).

### 12.5 Migrasi v8 + regresi — LAYAK DENGAN CATATAN

**Bukti:** PGlite v1–v8 **2× idempoten** (run ke-2 sukses
tanpa error); hitung **37 tabel / RLS 37/37 / policy 79**;
akses anon ditolak di tempat yang harus ditolak (T5/T8/T1
— lihat §4.1); login biasa tetap baca `pf_roles` = 5
baris, `pf_has_role('user')` true. Baterai repo pada
working tree saat ini: `uji-fase7.mjs` **87/87, EXIT 0**;
`uji-fase8-gel1.mjs` **120/120, EXIT 0**; baterai agen
**80/80, EXIT 0** — total **287/287, 0 gagal** (tidak ada
gagal kode/eksternal/skrip pada run ini; GDELT 429 pada
run regression sebelumnya tidak muncul di run ini).

**Diff policy v7→v8 (diukur dari `pg_policies`):**
dicabut 6 (3 INSERT T5 + 3 SELECT Area-1 `baca staf`),
ditambah 6 (3 `baca terbit atau staf` + 3
`pf_user_preferences`); T8 diganti isi dengan nama sama
(qual `pf_roles baca` kini `auth.uid() IS NOT NULL` —
diverifikasi; login biasa tetap baca). **Tidak ada policy
v1–v7 lain yang dicabut** — regresi terhadap v1–v7
terbatas pada 6 policy di atas + perubahan isi T8.

**F4 (TINGGI) — tidak ada GRANT eksplisit untuk tabel
baru di v1–v8.** Satu-satunya pernyataan GRANT nyata di
seluruh v1–v8 adalah v8:190 (GRANT per kolom kuis tanpa
`kunci`, huruf kecil — diverifikasi koordinator);
v8:189 REVOKE tabel kuis. Komentar v8:180-188 sendiri
mengakui ketergantungan pada "(grant default Supabase)".
Supabase mengubah default sejak **30 Okt 2026**: tabel
baru di proyek lama tidak lagi otomatis mendapat grant
(sumber resmi, `supabase.com/docs/guides/api/securing-your-api`,
"Default privileges"). Bukti PGlite: `authenticated`
SELECT `pf_user_preferences` → **42501** sebelum grant,
bisa sesudah grant. Karena cutover menjalankan v1–v8
sebagai tabel baru, ini berpotensi memutus SEMUA tabel,
bukan hanya preferensi. Baterai repo tak pernah menangkap
ini — skrip uji memberi blanket grant di awal
(`grant select, insert on all tables in schema public to
anon, authenticated;`, `uji-fase8-gel1.mjs:131` —
diverifikasi koordinator) + tak pernah baca
`pf_user_preferences` sebagai `authenticated`.
**Tindak lanjut wajib sebelum cutover produksi:** tambah
GRANT eksplisit (ke v8/v9 + verifikasi PGlite TANPA
blanket grant) ATAU verifikasi setting Data API proyek
`prata` (butuh akses pemilik — tidak dapat diverifikasi
dari VM ini).

### 12.6 Keputusan Gelombang 2 — TIDAK LAYAK (NO-GO)

**Gelombang 2 TIDAK BOLEH dimulai sebelum:**
1. Tampilan Multi-Source View diperbaiki (pakai rantai
   `disalin_dari`/akar salinan seperti mesin) + audit
   mendalam A diulang pada perbaikannya (kasus X vs Y
   harus dibedakan di tampilan).
2. GRANT eksplisit ditambahkan untuk semua tabel `pf_*`
   (F4) + baterai PGlite diperbaiki (hapus blanket grant
   dari skrip uji; tambah baca `pf_user_preferences`
   sebagai `authenticated`) + verifikasi ulang 37/37/79.
3. Jalur terima laporan tanpa `artikel_id` diperbaiki
   (F2 — atau formulir dibatasi mewajibkan `artikel_id`)
   + status `ditinjau` disambungkan atau dihapus (F1).
4. Cek `status='terbit'` ditambahkan di `getJejakFakta`
   (F-A1-1, defense-in-depth).

Alasan penundaan ini substantif, bukan administratif:
Gelombang 2 (Story Tracker, Research, Country Profile)
membangun di atas pengelompokan sumber dan perbandingan
sumber yang sama — membangun di atas tampilan yang
menghitung salinan sebagai independen akan menyebarkan
kesetaraan palsu ke fitur baru. Dan F4 mengancam seluruh
cutover produksi, bukan satu fitur.

### 12.7 Commit + berkas gate (final)

| Commit | Isi |
|---|---|
| `f1e68d6` | Gelombang 1 (36 berkas, +4.746/−36): migrasi v8, Jejak Fakta, Multi-Source View, Public Report, My Prata |
| `bd86bb3` | Gate — Cutover (`CUTOVER.md`, `DEPLOY.md`, backup 37 tabel, `LAPORAN-AKHIR.md` §11/§12) |
| `98a831b` | Gate — Keamanan (patch T6 SSRF + T4 nonaktif; v8 tak diubah) |
| `a76e028` | Gate — Regression + laporan (`uji-fase7.mjs` sadar-v8, `AUDIT-EXPANSION.md` §9, `LAPORAN-FASE-8.md`) |
| `248a895` | Gate — Audit mendalam (dokumen ini §12 + koreksi `AUDIT-EXPANSION.md` §9.2/§9.4) |

Berkas gate yang berubah (vs `f1e68d6`): `DEPLOY.md`
(baru), `supabase/CUTOVER.md` (baru),
`scripts/backup-pf.mjs`, `LAPORAN-AKHIR.md`,
9 berkas src (keamanan) + `supabase/README.md`,
`scripts/uji-fase7.mjs`, `AUDIT-EXPANSION.md`,
`LAPORAN-FASE-8.md` (baru). **Migrasi v8 TIDAK diubah
selama gate** (0 baris diff) — perbaikan F4 (GRANT
eksplisit) adalah pekerjaan lanjutan, bukan bagian gate
ini. Push oleh agen utama.

### 12.8 Ringkasan status tegas (final gate)

| Klaim | Status |
|---|---|
| Jejak Fakta berfungsi (join + RLS + empty state jujur) | Terverifikasi lokal (dengan catatan F-A1-1, F-A1-2) |
| Multi-Source View mesin independen benar | Terverifikasi lokal |
| Multi-Source View tampilan "N independen" benar | **TIDAK — terbukti salah (salinan = independen)** |
| Public Report validasi + rate limit + tolak anon | Terverifikasi lokal |
| Public Report simpan ujung-ke-ujung | **Belum diuji** (503 jujur tanpa service key) |
| Public Report moderasi | Terverifikasi lokal (dengan celah F1, F2, F3) |
| My Prata isolasi per-user 6/6 tabel | Terverifikasi lokal |
| My Prata hapus akun mandiri | Belum tersedia |
| Migrasi v8 idempoten + 37/37/79 + regresi hijau | Terverifikasi lokal (dengan F4 TINGGI) |
| Migrasi v8 aman diterapkan di produksi | **Terblokir** (F4 + butuh otorisasi pemilik) |
| Build/lint/tsc + baterai | Terverifikasi lokal (EXIT 0; 287/287 run audit B) |
| Render live Jejak Fakta / Multi-Source View | **Belum diuji** (tanpa Supabase + artikel terbit) |
| Scheduler live / deploy / produksi | **Terblokir** (403 Vercel; migrasi belum jalan) |
| Gelombang 2 | **TIDAK LAYAK (NO-GO)** sampai §12.6 selesai |
