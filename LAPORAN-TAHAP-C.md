# LAPORAN TAHAP C — Sisa Keterbatasan Pasca-Gelombang B2 (PRATA FAKTA)

Tanggal: 16 November 2026. Worktree: `~/workspace/prata-fakta-tahap-c`, branch `tahap-c`.
Status: **selesai di kode, terverifikasi lokal — BELUM LIVE** (migrasi v15 + deploy
menunggu akses pemilik, sama seperti B1/B2).

## Ringkasan

Enam unit tugas diselesaikan di kode; dua keterbatasan ditegaskan ulang tetap
belum bisa dengan bukti primer segar (16 Nov 2026). Baterai
`scripts/uji-tahapC-limitasi.mjs` menguji tiap item dengan asersi nyata PGlite
(validator/fungsi murni + perilaku DB + keberadaan/isi sumber) — lihat §7
untuk angka.

## 1. C-1 — UI pembuatan soal bertipe baru (commit `f2716a0`)

- Baru: `src/lib/akademi/soal.ts` — `validasiSoalBaru` (murni) + `buatSoalKuis`
  (server). Jenis: `pilihan_ganda` (opsi 2..10, kunci 0..n-1),
  `pilihan_ganda_kompleks` (kunci_jamaks ≥2 unik), `isian_singkat`
  (kunci_teks 1..500, tanpa opsi), `benar_salah` (opsi default
  `["Benar","Salah"]`, kunci 0/1), `esai` (MENOLAK kunci apa pun).
  Tepat satu dari `lesson_id`/`tanggal`; kuis harian hanya `pilihan_ganda`.
- Kunci jawaban tersimpan ke `pf_quiz_answers` (HANYA service role),
  BUKAN ke kolom kunci publik. Soal esai sengaja TANPA baris kunci.
  Gagal tulis kunci → compensating delete soal + log `SOAL YATIM TANPA KUNCI`.
- Baru: `POST /api/admin/akademi/soal` (staf editor/writer, rate limit admin
  30/menit, audit fail-closed `akademi.soal.buat`) + `GET` 50 soal terbaru
  tanpa kunci. Baru: halaman `/admin/akademi/soal` (form jenis dinamis +
  daftar). Tautan ditambahkan di `/admin/akademi`.

## 2. C-2 — Pencabutan sertifikat (commit `abfb63d`)

- Verifikasi dulu: kolom `dicabut`, `dicabut_pada`, `dicabut_alasan` sudah
  ada di `pf_certificates` sejak migrasi v14; halaman verifikasi publik
  `/akademi/sertifikat/[kode]` sudah menampilkan DICABUT sejak B2
  ("Sertifikat ini sudah dicabut" + Status "Dicabut — <alasan>").
- Yang ditambahkan: `cabutSertifikat` / `pulihkanSertifikat` /
  `daftarSertifikat` di `src/lib/akademi/sertifikat.ts`;
  `GET` (daftar) + `DELETE` (`{kode_verifikasi, alasan}`) di
  `src/app/api/akademi/sertifikat/route.ts` (staf saja; 404/409 sudah
  dicabut/400 alasan/503; audit fail-closed `akademi.sertifikat.cabut`
  + compensating restore bila audit gagal); komponen
  `SeksiCabutSertifikat` di `/admin/akademi` (form kode + alasan +
  konfirmasi, daftar 50 sertifikat dengan status Aktif/DICABUT).

## 3. C-3 — Skor kuis harian dihitung server (commit `cd5593f`)

- Celah yang ditutup: `/api/kuis/skor` menerima `benar`/`total` mentah
  dari klien + policy RLS v7 mengizinkan pemilik INSERT/UPDATE
  `pf_quiz_scores` lewat REST → skor 5/5 bisa dipalsukan satu POST.
- Perbaikan: `POST /api/kuis/skor` kini hanya menerima `{tanggal}`;
  benar/total klien DIABAIKAN (bukan 400 — klien lama tetap jalan,
  skor dikoreksi server). `hitungSkorDariJawabanTersimpan` menolak
  skor parsial (409) dan tanggal tanpa soal (409).
- `pf_quiz_daily_answers` baru (migrasi v15 §1): jawaban tersimpan
  per pengguna/soal/tanggal; hanya service role yang bisa tulis
  (pengguna hanya bisa baca sendiri). `POST /api/kuis/jawab` menyimpan
  jawaban pengguna login secara best-effort (anonim tidak disimpan).
- Trigger v15 `pf_quiz_scores_skor_harian_server` menghitung ulang
  benar/total dari jawaban tersimpan pada setiap INSERT/UPDATE —
  tulis REST langsung pun dikoreksi. Skor lama tetap terbaca.

## 4. C-4 — Log galat menyeluruh (commit `1073f8f`)

- Baru: `catatGalatRoute(sumber, err)` di `src/lib/analytics/galat.ts`
  — fire-and-forget, TIDAK PERNAH melempar; melewati galat "tabel
  belum ada" (PGRST205/42P01/42703/"Could not find the table"/"does
  not exist") karena itu kondisi yang sudah ditangani (empty state /
  503 jujur); galat lain → `pf_app_errors` (tampil di
  `/admin/monitoring`).
- `catatGalatBaca` (`src/lib/galat.ts`) kini juga menulis galat baca
  BUKAN-tabel-belum-ada ke `pf_app_errors` — satu edit mencakup
  SEMUA jalur baca DB di `lib/`.
- Wiring: 52 situs `{ status: 500 }` di 23 route publik/AI/ingestion
  memanggil `catatGalatRoute` sebelum return. 8 route target tanpa
  situs 500 diverifikasi memang tidak punya 500 (503/400/audit).
  Route admin dilewati (sudah `responGalatAdmin`); `kunjungan`
  dilewati (sudah memanggil `catatGalatAplikasi` langsung).
  Ingestion engine TIDAK diduplikasi ke `pf_app_errors` (kegagalan
  per-sumber sudah tercatat di `pf_ingestion_runs`).
- Dua perbaikan lint ikut dalam commit ini (pola fetch `.then()`
  agar tidak set-state-in-effect di `SeksiCabutSertifikat` dan
  halaman soal baru; `catch (err)` tak terpakai kembali ke
  `catch {}`).

## 5. C-5 — Topik `isu` menghasilkan notifikasi (commit `b1954ec`)

- Verifikasi dulu: `pf_followed_topics` sudah mengizinkan tipe
  `'isu'` sejak v6 dan `/api/topik` sudah menerima `isu`; yang
  hilang hanya kolom `isu` di `pf_articles` + pencocokan.
- Migrasi v15 §3 menambah kolom `pf_articles.isu` (text, index
  parsial, comment). `kirimNotifikasiTopik` kini mencocokkan
  `(tipe='isu' and target ilike <isu>)` dengan fallback PGRST204
  (pre-v15: notifikasi isu dilewati, kategori/negara tetap jalan).
  Jalur terbit yang sama (`terbitkanArtikel` → `kirimNotifikasiTopik`)
  otomatis mencakup isu.
- Admin: `normalisasiIsu` (opsional, kosong→null, maks 120 karakter)
  di `buatArtikel`/`perbaruiArtikel`; field "Isu artikel (opsional)"
  di `FormArtikel`; `FIELD_PATCH` + `KOLOM_ARTIKEL_ADMIN` + fallback
  PGRST204 di `getArtikelAdmin` (pre-v15 halaman edit artikel tidak
  rusak). `adalahGalatTabelBelumAda` kini mencakup PGRST204 (kolom
  belum ada = migrasi belum dijalankan → 503 jujur).

## 6. Item 6 — Verifikasi ulang bukti primer (tetap belum bisa)

### 6a. TTS server Podcast — TETAP BELUM BISA

Bukti segar, dibuka ulang 16 Nov 2026 ±13.16 WIB (06.16 UTC):

- MODEL_CARD suara `id_ID-news_tts-medium` di
  `https://huggingface.co/rhasspy/piper-voices/resolve/main/id/id_ID/news_tts/medium/MODEL_CARD`:
  Language `id_ID`, Speakers 1, Quality medium, Dataset URL
  `https://www.kaggle.com/code/mpwolke/indic-tts-malayalam-speech-corpus`
  (korpus **Malayalam**, bukan Indonesia), **License: "See URL"**,
  Training: "Finetuned from U.S. English lessac voice (medium
  quality)". Suara `lessac` memakai lisensi riset Blizzard Challenge
  2013 — bukan lisensi penggunaan produk yang jelas.
- `voices.json` repo yang sama (16.362 baris, crawled 06.17 UTC):
  pencarian `"id_ID-` hanya menemukan SATU entri:
  `id_ID-news_tts-medium` (baris 11010/11012). **Tidak ada suara
  id_ID lain.** Tree `id/` hanya berisi direktori `id_ID`.
  Jadi `id_ID-news_tts-medium` adalah satu-satunya suara id_ID
  Piper, dan lisensinya tidak jelas.
- Konteks: engine Piper aktif kini GPL-3.0 (`OHF-Voice/piper1-gpl`);
  repo lama `rhasspy/piper` (MIT) sudah diarsip Oktober 2025; tiap
  suara punya lisensi sendiri di MODEL_CARD-nya. Gate podcast
  (`src/lib/podcast.ts` / `src/lib/podcast/rss.ts`) tetap menolak
  TTS server sampai ada suara id_ID berlisensi jelas tertulis.
  **Jangan paksakan.**

### 6b. Penilaian esai otomatis — TETAP BELUM BISA

Verifikasi ulang (L-C5, pencarian 16 Nov 2026): semua jalan gratis
yang ditemukan tetap butuh salah satu dari: kunci API LLM eksternal
(mis. **RubricCheck** memakai Google Gemini API), server GPU sendiri
(mis. **ArguLens**: Qwen2.5-14B via vLLM), atau mengirim tugas siswa
ke situs pihak ketiga. Ketiganya melanggar aturan berdiri proyek
(AI hanya via Muse; tanpa provider eksternal; tanpa layanan berbayar;
tanpa server GPU; data siswa tidak keluar). Tidak ada jalan
legal/gratis dalam batasan proyek. Jalur yang tetap berlaku: penilai
esai manual (route + antrean `/admin/akademi/esai`, ada sejak B2);
`nilaiJawaban` untuk esai mengembalikan `benar: null`,
`status: "menunggu_penilaian"`.

## 7. Migrasi v15 (commit `3a94213`)

`supabase/migrations/20261116_pf_v15_tahap_c.sql` — idempoten (diterapkan
2× di baterai), rollback didokumentasikan di header berkas:

- §1 tabel baru `pf_quiz_daily_answers` (unique `(user_id, soal_id,
  tanggal)`; RLS; policy "baca sendiri" saja; GRANT SELECT ke
  authenticated + semua hak ke service_role; tanpa policy INSERT
  pengguna).
- §2 fungsi `pf_hitung_skor_harian()` + trigger
  `pf_quiz_scores_skor_harian_server` (BEFORE INSERT OR UPDATE pada
  `pf_quiz_scores`; raise exception bila tanggal tanpa soal).
- §3 kolom `pf_articles.isu` + index parsial + comment.
- §4 CHECK audit v15 (59 aksi: 57 v14 + `akademi.soal.buat`,
  `akademi.sertifikat.cabut`).
- §5 GRANT eksplisit.
- Ekspektasi sesudah v15: **62 tabel, RLS 62/62, 120 policy, CHECK
  audit v15 59 aksi** (didokumentasikan di `supabase/CUTOVER.md`
  §3.16 + `supabase/README.md` §v15; `scripts/backup-pf.mjs`
  diperbarui ke 62 tabel).

## 8. Verifikasi

- `scripts/uji-tahapC-limitasi.mjs` — **78 asersi, 0 gagal, EXIT 0**
  (dijalankan 16 Nov 2026; migrasi v1–v15 diterapkan 2× di PGlite).
  Per seksi: §A v15 (12 asersi: 62 tabel / RLS 62/62 / 120 policy /
  0 blanket grant / CHECK audit v15 59 aksi / kolom isu / trigger /
  GRANT service_role), §B C-3 (13), §C C-1 (17), §D C-2 (11),
  §E C-5 (11), §F C-4 (8), §G C-6 (6). Tiga kegagalan awal adalah
  kesalahan baterai sendiri (bukan kode produk) dan diperbaiki
  tanpa mengubah produk: `set local role` → `set role` (RLS tidak
  teruji dengan set local), bentuk return fungsi yang sebenarnya,
  dan nama kolom skema yang ditebak (`pf_profiles_staf`,
  `skor_akhir`, `dedup_key`, `actor_id/detail` — semuanya
  dikoreksi ke skema nyata).
- `npx tsc --noEmit` EXIT 0, `npm run lint` EXIT 0 (sesudah unit 4;
  diulang pada verifikasi akhir).
- `npm run build` (Turbopack) **EXIT 0, 166/166 halaman** (naik dari
  164 B2: +1 halaman `/admin/akademi/soal`, +1 route
  `/api/admin/akademi/soal`), BUILD_ID `7ElvJekCbLl9_PH6-W1_7`.
  Catatan lingkungan: build Turbopack di worktree ini awalnya gagal
  ("Could not find the Next.js package") karena `node_modules`
  berupa symlink ke main tree di luar workspace-root Turbopack;
  diatasi dengan menyalin `node_modules` nyata (589 MB, gitignored)
  ke worktree — BUKAN `npm install`. Build `--webpack` sempat
  dicoba dan gagal pada type-check route-export yang SUDAH ADA
  sejak B2 (bukan dari Tahap C); webpack bukan jalur gate proyek,
  Turbopack yang dipakai.

## 9. Risiko tersisa

- Verifikasi HTTP hidup (POST route soal/sertifikat/skor, klik UI
  admin, halaman verifikasi DICABUT di browser) belum dilakukan —
  baterai menguji validator/fungsi murni + perilaku DB, seperti
  batas kejujuran baterai B2.
- Uji login + klik browser nyata + HP/desktop + workflow live tetap
  belum dilakukan (blokir umum proyek).
- Deploy kode Tahap C + migrasi v15 ke produksi tetap menunggu akses
  pemilik (tanpa service key/CLI/psql di VM; Vercel 403 tim
  `prataava`).
- Pre-v15: PATCH artikel dengan `isu` menjawab 503 jujur; notifikasi
  isu diam-diam tidak terkirim (fallback PGRST204) — perilaku yang
  disengaja, didokumentasikan di CUTOVER §3.16.
- Trigger v15 menolak INSERT `pf_quiz_scores` untuk tanggal tanpa
  soal (raise exception) — perilaku fail-closed yang disengaja;
  route skor sudah memeriksa ini dulu (409).
- `catatGalatBaca` kini menulis ke DB (fire-and-forget) — bila
  service key tersedia, galat baca saat prerender/build juga
  tercatat; bukan banjir karena hanya di cabang galat.

## 10. Pekerjaan berikutnya

- Uji HTTP hidup + klik browser nyata sesudah deploy (butuh akses
  produksi).
- Jalankan migrasi v1–v15 di Supabase produksi + deploy Vercel
  (butuh pemilik).
- Bila suatu hari muncul suara id_ID Piper berlisensi jelas tertulis,
  evaluasi ulang gate TTS server di `src/lib/podcast.ts`.
- Bila ada jalur penilaian esai legal/gratis (mis. rubrik deterministik
  tanpa LLM), evaluasi ulang L-C5 — sampai saat itu penilai manusia
  tetap jalurnya.
