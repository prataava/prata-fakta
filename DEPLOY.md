# DEPLOY — PRATA FAKTA

**Status: BELUM LIVE.** Repo di commit `f1e68d6` (Fase 8 Gelombang 1),
94 rute. Situs baru live bila cutover + deploy selesai oleh pemilik.

## Urutan singkat (detail penuh: `supabase/CUTOVER.md`)

1. **Backup dulu** — `node scripts/backup-pf.mjs --out ~/backup-prata-fakta`
   (butuh `SUPABASE_SERVICE_ROLE_KEY` — dari pemilik via Secure Vault,
   JANGAN lewat chat). Sebelum migrasi, 37 tabel dilaporkan gagal
   (404, tabel belum ada) — itu normal; yang tidak normal adalah 401.
2. **Migrasi v1–v7** — Supabase Dashboard → proyek `prata` → SQL Editor,
   satu berkas per satu, berurutan, JANGAN dilewat. Verifikasi sesudah
   tiap berkas (angka ekspektasi: v1 = 8 tabel / 18 policy, v2 = 16 / 51,
   v3 = 18 / 53, v4 = 23 / 59, v5 = 26 / 62, v6 = 35 / 76,
   v7 = 36 / 79). Bila satu berkas gagal: berhenti, perbaiki, ulangi
   berkas itu (semua migrasi idempoten).
3. **Deploy kode ke Vercel** — WAJIB sebelum v8. Lihat blokir 403 di bawah.
4. **Migrasi v8** — sesudah deploy (kode service-role harus sudah live).
   Ekspektasi: **37 tabel, 79 policy** (37/37 ber-RLS).
5. **Validasi fungsi + smoke test** — `GET /api/health` harus `db: "ok"`,
   slug tak ada → 404, `/admin` tanpa login → redirect ke `/masuk`.
6. **Scheduler** — isi secret GitHub Actions (`PF_INGESTION_SECRET`,
   `PF_AI_SECRET`, `PF_SITE_URL`, nilai sama dengan env Vercel).
7. **Super_admin pertama** — daftar akun, lalu tetapkan via SQL Editor
   (lihat `supabase/CUTOVER.md` §8).

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

## Rujukan

- Prosedur lengkap: [`supabase/CUTOVER.md`](supabase/CUTOVER.md)
- Cara deploy + blokir: [`LAPORAN-AKHIR.md` §11–§12](LAPORAN-AKHIR.md)
- Urutan migrasi + verifikasi: [`supabase/README.md`](supabase/README.md)
