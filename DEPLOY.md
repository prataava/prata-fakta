# DEPLOY — PRATA FAKTA

**Status: BELUM LIVE.** Repo di commit Tahap 13–17 (lihat
`FINAL-PROJECT-COMPLETION.md` §23 untuk hash commit;
Gelombang 2: `5d3b17b`). **147 rute build** (77 halaman +
80 rute API), migrasi **v1–v12 (54 tabel / RLS 54/54 /
106 policy)**. Situs baru live bila cutover + deploy selesai
oleh pemilik. Semua pengujian masih **lokal** — jangan sebut
live sebelum deploy berhasil + diuji.

## Urutan singkat (detail penuh: `supabase/CUTOVER.md` §3)

1. **Backup dulu** — `node scripts/backup-pf.mjs --out ~/backup-prata-fakta`
   (butuh `SUPABASE_SERVICE_ROLE_KEY` — dari pemilik via Secure Vault,
   JANGAN lewat chat). Sebelum migrasi, 54 tabel dilaporkan gagal
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
   seed 5 job scheduler. Ekspektasi akhir: **54 tabel, 106 policy**
   (54/54 ber-RLS) + 5 baris `pf_scheduled_jobs`.
6. **Validasi fungsi + smoke test** — `GET /api/health` harus `db: "ok"`,
   slug tak ada → 404, `/admin` tanpa login → redirect ke `/masuk`,
   CSP header hadir + nonce unik per request.
7. **Scheduler** — isi 3 secret GitHub Actions (`PF_INGESTION_SECRET`,
   `PF_AI_SECRET`, `PF_SITE_URL`, nilai sama dengan env Vercel).
8. **Super_admin pertama** — daftar akun, lalu tetapkan via SQL Editor
   (lihat `supabase/CUTOVER.md` §8).
9. **Backup pasca-migrasi** — `node scripts/backup-pf.mjs` lagi;
   ekspektasi 54/54 tabel ter-backup.

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
`PF_AI_SECRET`, `PF_SITE_URL`. Lihat `.env.example`.

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
- Cara deploy + blokir: [`LAPORAN-AKHIR.md` §11–§12, §14](LAPORAN-AKHIR.md)
- Urutan migrasi + verifikasi: [`supabase/README.md`](supabase/README.md)
- Laporan akhir proyek: [`FINAL-PROJECT-COMPLETION.md`](FINAL-PROJECT-COMPLETION.md)
- Panduan pengguna: [`PANDUAN.md`](PANDUAN.md)
