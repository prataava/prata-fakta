# DEPLOY — PRATA FAKTA

**Status: BELUM LIVE.** Repo di commit Tahap H (lihat
`FINAL-PROJECT-COMPLETION.md` §31 untuk hash commit;
Gelombang 2: `5d3b17b`; B1: `ebd4cf7`; B2: `f38f7ec`;
Tahap C–G: `c3efa51`). **166 halaman build** (84 halaman +
92 rute API), migrasi **v1–v16 (62 tabel / RLS 62/62 /
120 policy)**. Situs baru live bila cutover + deploy selesai
oleh pemilik. Semua pengujian masih **lokal** — jangan sebut
live sebelum deploy berhasil + diuji.

## Urutan singkat (detail penuh: `supabase/CUTOVER.md` §3)

1. **Backup dulu** — `node scripts/backup-pf.mjs --out ~/backup-prata-fakta`
   (butuh `SUPABASE_SERVICE_ROLE_KEY` — dari pemilik via Secure Vault,
   JANGAN lewat chat). Sebelum migrasi, 62 tabel dilaporkan gagal
   (404, tabel belum ada) — itu normal; yang tidak normal adalah 401.
2. **Migrasi v1–v7** — Supabase Dashboard → proyek `prata` → SQL Editor,
   satu berkas per satu, berurutan, JANGAN dilewat. Verifikasi sesudah
   tiap berkas (angka ekspektasi: v1 = 8 tabel / 18 policy, v2 = 16 / 51,
   v3 = 18 / 53, v4 = 23 / 59, v5 = 26 / 62, v6 = 35 / 76,
   v7 = 36 / 79). Bila satu berkas gagal: berhenti, perbaiki, ulangi
   berkas itu (semua migrasi idempoten).
3. **Deploy kode ke Vercel** — WAJIB sebelum v8. Lihat blokir 403 di bawah.
4. **Migrasi v8–v10** — sesudah deploy (kode service-role harus sudah live).
   Ekspektasi sesudah v10: **53 tabel, 106 policy** (53/53 ber-RLS).
5. **Migrasi v11–v12** — v11: tabel `pf_rate_limits` + RPC
   `pf_rate_limit_check` + CHECK audit 53 aksi; v12: CHECK 5 job +
   seed 5 job scheduler. Ekspektasi sesudah v12: **54 tabel, 106 policy**
   (54/54 ber-RLS) + 5 baris `pf_scheduled_jobs`.
6. **Migrasi v13–v16** — v13: tabel `pf_quiz_answers` + GRANT
   service_role (55 tabel); v14: +6 tabel (61 tabel, 119 policy);
   v15: tabel `pf_quiz_daily_answers` + trigger skor harian
   server-side + kolom `pf_articles.isu` + CHECK audit 59 aksi
   (62 tabel, 120 policy); v16: perluas `pf_bookmarks` dengan
   `pengetahuan_id` (tanpa tabel/policy baru — tetap 62/120).
   Ekspektasi akhir: **62 tabel, 120 policy** (62/62 ber-RLS) +
   5 baris `pf_scheduled_jobs`. Perhatian urutan: deploy kode
   Follow-up 5/6 dulu, baru v16 (lihat `CUTOVER.md` §3.16–§3.17).
7. **Validasi fungsi + smoke test** — `GET /api/health` harus `db: "ok"`,
   slug tak ada → 404, `/admin` tanpa login → redirect ke `/masuk`,
   CSP header hadir + nonce unik per request.
8. **Scheduler + push** — isi 3 secret GitHub Actions (`PF_INGESTION_SECRET`,
   `PF_AI_SECRET`, `PF_SITE_URL`, nilai sama dengan env Vercel) + 4 env var
   VAPID (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_SUBJECT` — lihat `.env.example`).
9. **Super_admin pertama** — daftar akun, lalu tetapkan via SQL Editor
   (lihat `supabase/CUTOVER.md` §8).
10. **Backup pasca-migrasi** — `node scripts/backup-pf.mjs` lagi;
   ekspektasi 62/62 tabel ter-backup.

## Blokir deploy Vercel 403 (terverifikasi 16 Nov 2026)

Koneksi Vercel di Muse: connected (akun `prataava`), tetapi
`list_projects` → **403** pada scope tim `prataava`
(`team_vIeiMHbcOuWT2HCMF9s9YK5P`): akses tim ditolak, dan tool
`authorize_team_access` yang disarankan API **tidak tersedia** di
konektor. Muse tidak bisa memperbaiki ini sendiri.

**Opsi A (dianjurkan):** pemilik putuskan + hubungkan ulang Vercel di
Muse dan setujui akses tim `prataava` saat layar OAuth muncul, lalu
Muse deploy dari repo seperti biasa.

**Opsi B:** pemilik import manual di dashboard Vercel → Add New →
Project → Import `prataava/prata-fakta` → isi 6 env var → Deploy.
Proyek lama (TASIK JAYA, SNBT Master) tidak disentuh.

**Opsi C (cadangan):** ZIP sumber via Vercel Drop (tanpa folder `.next`).

Detail tiap opsi (langkah persis + risiko + yang dibutuhkan dari
pemilik): `supabase/CUTOVER.md` §5.

## Env vars (nama saja — nilai dari pemilik)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (server saja), `PF_INGESTION_SECRET`,
`PF_AI_SECRET`, `PF_SITE_URL`. Push (Gelombang B2) +4:
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_SUBJECT`. Lihat `.env.example`.

Langkah deploy manual tambahan (B2, belum dilakukan):
allowlist Redirect URL Supabase `/saya/hapus-akun/konfirmasi` +
buat bucket Storage publik `podcast-audio` (nama saja; nilai
tidak pernah lewat chat).

## Sesudah live — verifikasi yang wajib dilakukan pemilik

1. Login sebagai admin/editor/pembaca; klik alur utama (kuis, peta,
   tanya, feed, admin, cerita, akademi, podcast).
2. Buka di HP (320–430px) + desktop; periksa overflow.
3. Verifikasi pinning HTTPS T6 dari egress langsung (Vercel/staging)
   — penutupan penuh T6 belum teruji dari VM.
4. Uji CSRF live + flag cookie sesi.
5. Periksa `/api/health` = `db: "ok"` dan 5 job scheduler jalan
   (`pf_scheduled_jobs.terakhir_jalan` diperbarui).

## Rujukan

- Prosedur lengkap: [`supabase/CUTOVER.md`](supabase/CUTOVER.md)
- Cara deploy + blokir: [`LAPORAN-AKHIR.md` §11–§12, §14, §17](LAPORAN-AKHIR.md)
- Urutan migrasi + verifikasi: [`supabase/README.md`](supabase/README.md)
- Laporan akhir proyek: [`FINAL-PROJECT-COMPLETION.md`](FINAL-PROJECT-COMPLETION.md) (§31 = Tahap H + Follow-up 1–6)
- Panduan pengguna: [`PANDUAN.md`](PANDUAN.md)
