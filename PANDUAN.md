# PANDUAN — PRATA FAKTA

Panduan penggunaan berdasarkan UI nyata aplikasi (Next.js, 77
halaman + 80 rute API). **Status: BELUM LIVE** — semua yang
ditulis di sini terverifikasi lokal; alur yang butuh login +
klik browser nyata ditandai. Bila halaman menampilkan empty
state ("belum ada artikel") atau 503, itu **jujur**: migrasi
v1–v12 belum dijalankan di Supabase produksi.

## 1. Pembaca (tanpa login)

- **Beranda** (`/`) — seksi artikel dari data nyata, Daily
  Brief, dan tautan ke semua area. Tanpa data, seksi menampilkan
  empty state, bukan artikel palsu.
- **Baca artikel** (`/artikel/[slug]`) — 3 mode baca, progress
  baca, lencana status verifikasi (Terverifikasi / Cek Silang /
  Berkembang / Belum Terkonfirmasi / Disengketakan / Dikoreksi), sumber per artikel, bar konteks
  "Bagian dari cerita" + "Negara" bila artikel bagian dari cerita
  atau terkait negara. Artikel dengan slug tak ada → **404 nyata**.
- **Cari** (`/cari`) — pencarian isi artikel.
- **Arsip** (`/arsip`) — filter tanggal + sumber.
  **Kategori** (`/kategori/[slug]`) — daftar artikel per kategori.
- **Daily Brief** (`/brief`) — ringkasan harian dari
  `pf_daily_briefs` (dibuat pipeline editorial; draf VERIFIED
  wajib review sebelum terbit — tidak ada publikasi otomatis).
- **Peta** (`/peta`) — peta Leaflet + OpenStreetMap; marker hanya
  untuk artikel berkoordinat terverifikasi.
- **Data** (`/data`) — grafik indikator (hover, rentang, YoY);
  tiap grafik mencantumkan nama, nilai, satuan, negara, periode,
  sumber, dan tanggal pengambilan.
- **Timeline** (`/timeline`) — kronologi peristiwa.
  **Cerita** (`/cerita`, `/cerita/[slug]`) — Story Tracker:
  kronologi + perkembangan satu cerita.
  **Sejarah** (`/sejarah`) — Historical Archive: "hari ini dalam
  sejarah" (tanggal peristiwa vs publikasi vs dokumentasi
  dibedakan).
- **Pengetahuan** (`/pengetahuan`, `/pengetahuan/[slug]`) —
  Explain the World: explainer berlapis dengan referensi.
- **Negara** (`/negara`, `/negara/[kode]`) — Country Profile
  (kode ISO-2); angka bersumber 3 lapis.
- **Kuis** (`/kuis`) — 5 soal harian; skor hanya tampil di sesi
  bila belum login, **tersimpan bila login**.
- **Tanya** (`/tanya`) — Ask the World: jawaban menunjukkan
  sumber; tanpa referensi, jawaban menyatakan `tidak_ada_data`
  (mengakui keterbatasan). Arsip Q&A: `/tanya/arsip`. Vote
  1/IP/hari.
- **Podcast** (`/podcast`, `/podcast/[slug]`) — pemutar TTS
  browser (SpeechSynthesis) + playlist + riwayat + kecepatan.
  **Batas jujur: tanpa file audio MP3 server** — tidak ada
  unduhan audio; RSS enclosure tidak tersedia.
- **Riset** (`/riset`, `/riset/[slug]`) — pusat dokumen/laporan
  (metadata + tautan sumber, tanpa salin isi berhak cipta).
- **Rutin** (`/rutin` + 6 sub: `/rutin/pagi`, `/rutin/hari-ini`,
  `/rutin/mingguan`, `/rutin/bulanan`, `/rutin/dunia`,
  `/rutin/angka`) — rutinitas harian.
- **Laporkan kesalahan** (`/laporkan`) — laporkan kesalahan
  artikel (tanpa login, masuk antrean ditinjau) atau laporan
  publik; lacak status di `/laporkan/lacak`.
- **Tema** — tombol tema di header (terang/gelap, tersimpan di
  `localStorage`, diterapkan sebelum CSS dilukis agar tidak
  kedip).

## 2. Pengguna terdaftar

- **Daftar** (`/daftar`) — bila flag `pendaftaran_terbuka`
  dimatikan admin, halaman menampilkan "Pendaftaran ditutup"
  tanpa form (penegakan penuh = nonaktifkan signup di dashboard
  Supabase Auth — wewenang pemilik).
- **Masuk** (`/masuk`) — sesudah login, `/saya` menampilkan
  profil + preferensi; `/saya/pengaturan` untuk pengaturan akun;
  `/profil` halaman profil publik.
- **Feed Saya** (`/feed-saya`) — feed personal (login saja):
  topik yang diikuti + cerita yang diikuti.
- **Bookmark & riwayat** — bookmark artikel dan riwayat baca
  tersimpan per akun (API `bookmark` / `riwayat`); skor kuis
  tersimpan (login saja).
- **Ikuti** — ikuti cerita (`/cerita/[slug]`) dan topik;
  notifikasi push **belum ada** — ikuti hanya memengaruhi feed.
- **Hapus akun mandiri: BELUM ADA** (My Prata F5) — hubungi
  admin untuk penghapusan akun.

## 3. Penulis

Peran penulis bekerja lewat `/admin` (butuh login + peran staf).
Alur: tulis draf → kirim review → fact checker memeriksa →
editor menerbitkan.

- **Tulis** — `/admin/artikel/baru` (draf baru; status awal
  selalu `draft`, tidak pernah langsung terbit).
- **Daftar tulisan** — `/admin/artikel` (+ detail
  `/admin/artikel/[id]`): lihat status draf/review/terbit,
  jadwalkan terbit (`jadwalkan`), batalkan (`batalkan`).
- **Sumber** — `/admin/sumber`: daftar sumber ingestion
  (tambah/aktif/nonaktif/konfigurasi — semua perubahan tercatat
  di audit log dengan identitas admin + waktu).
- **Pengetahuan** — `/admin/pengetahuan`: kelola artikel
  pengetahuan (Explain the World).
- **Akademi** — `/admin/akademi`: kelola kursus/modul/pelajaran
  (kunci kuis tidak pernah ke klien).

## 4. Fact checker

- **Antrean review** — `/admin/review` (+ detail
  `/admin/review/[id]`): klaim + evidence menunggu pemeriksaan.
- **Verifikasi** — `/admin/verifikasi`: verifikasi dua sinyal +
  koroborasi klaim; label akhir Terverifikasi / Cek Silang /
  Berkembang / Belum Terkonfirmasi / Disengketakan / Dikoreksi.
- **Fakta** — `/admin/fakta/[id]`: detail satu fakta.
- **Klaster & duplikat** — `/admin/klaster` (pengelompokan
  klaim), `/admin/duplikat` (deteksi salinan antar-penerbit;
  mesin menghitung salinan dari akar rantai `disalin_dari`,
  bukan jumlah media — lihat Multi-Source View).
- **Aturan:** draf berstatus UNCONFIRMED/DISPUTED **tidak bisa**
  diterbitkan tanpa verifikasi (gate menolak 409 + alasan);
  parafrase hanya dari judul akar (batas jujur — bukan dari isi
  penuh).

## 5. Editor

- **Terbitkan** — `/admin/artikel/[id]/terbitkan`: hanya draf
  VERIFIED yang lolos gate. **Publikasi otomatis MATI** — tidak
  ada jalur yang menerbitkan draf mentah; setiap terbit adalah
  keputusan editor.
- **Terbitkan terjadwal** — `/admin/artikel/terbitkan-terjadwal`:
  menerbitkan artikel yang dijadwalkan + lewat waktu + lolos
  gate (maks 100/jam). Artikel yang gagal gate ditunda 6 jam
  (backoff) dan dicoba lagi, bukan error.
- **Koreksi** — `/admin/koreksi`: koreksi artikel terbit →
  status CORRECTED + versi baru + tanggal koreksi tampil di
  artikel publik ("Dikoreksi pada …").
- **Daily Brief** — `/admin/brief` (+ `/admin/brief/[id]/terbitkan`):
  terbitkan brief harian sesudah review.
- **Laporan pengguna** — `/admin/laporan-pengguna`: antrean
  laporan kesalahan + laporan publik (laporan tanpa `artikel_id`
  tetap diterima → ditinjau).

## 6. Admin (super_admin)

- **Overview** — `/admin`: angka nyata dari database.
- **Kendali** — `/admin/kendali`: feature flags
  (`ingestion_aktif`, `pipeline_editorial_aktif`,
  `pendaftaran_terbuka`, `mode_pemeliharaan`,
  `pengumuman_pemeliharaan`), pemicu manual 5 job scheduler,
  ekspor audit log CSV.
- **Pengguna** — `/admin/pengguna` (+ `/admin/pengguna/[id]`):
  kelola peran (pembaca/penulis/fact_checker/editor/admin/
  super_admin). **Super_admin pertama ditetapkan via SQL
  Editor** (`supabase/CUTOVER.md` §8) — bukan dari UI.
- **Sistem** — `/admin/sistem` (status scheduler + job),
  `/admin/monitoring` (kesehatan), `/admin/kinerja`,
  `/admin/analitik` (Traffic Analytics: **belum tersedia** —
  menampilkan pesan jujur, tanpa angka palsu),
  `/admin/api-sehat` (status API), `/admin/agen-ai` (status
  agen AI — Muse saja; agen yang belum berjalan dicatat BELUM
  TERSEDIA).
- **Audit** — `/admin/audit`: log 53 aksi (siapa, kapan, apa);
  ekspor CSV dari `/admin/kendali`.
- **Area lain** — `/admin/data` (indikator), `/admin/event`
  (peristiwa), `/admin/negara` (profil negara),
  `/admin/cerita` (Story Tracker), `/admin/tanya` (Q&A),
  `/admin/podcast` (episode), `/admin/riset` (dokumen).
  Semua perubahan admin tercatat di audit log (fail-closed:
  bila audit gagal, operasi dibatalkan 500/503).

## 7. Troubleshooting

| Gejala | Arti | Yang dilakukan |
|---|---|---|
| Halaman menampilkan "belum ada artikel" / empty state | Database kosong (migrasi belum jalan / belum ada konten) | Normal sebelum cutover. Bukan bug — jangan isi data dummy. |
| `503` di `/api/ingestion/jalankan` atau `/api/ai/jalankan` | Flag `ingestion_aktif` / `pipeline_editorial_aktif` dimatikan admin, atau migrasi belum jalan | Periksa `/admin/kendali` (flag) dan `/api/health` (`db`). |
| `/api/health` → `{"ok":false,"status":"degraded","db":"belum_tersedia"}` | Migrasi v1–v12 belum dijalankan di produksi | Jalankan migrasi (`supabase/CUTOVER.md` §3). |
| Login dialihkan ke `/masuk` | Halaman butuh login (`/saya`, `/feed-saya`, `/admin`) | Masuk dulu; Header/Footer memang tanpa tautan `/masuk` — buka langsung `/masuk`. |
| "Pendaftaran ditutup" di `/daftar` | Flag `pendaftaran_terbuka` dimatikan | Minta admin mengaktifkan; atau nonaktifkan signup di dashboard Supabase. |
| Banner pemeliharaan di atas halaman | `mode_pemeliharaan` aktif | Baca `pengumuman_pemeliharaan`; halaman statis menampilkan banner saat build — muat ulang halaman dinamis untuk banner terbaru. |
| Ingestion gagal (GDELT 429) | GDELT membatasi rate dari IP ini | Tunggu + jalankan ulang; RSS tetap jalan (bukan kegagalan aplikasi). |
| `429` saat menjawab kuis / memanggil API | Rate limit (20/mnt kuis; limiter DB) | Tunggu jendela berikutnya. Bila terus 429 padahal v11 belum diterapkan, periksa log (fail-open mencatat `PGRST202`). |
| Slug tak ada → 404 | Benar (bukan bug) | Periksa ejaan slug; daftar hidup ada di sitemap (`/sitemap.xml`). |
| Tema berkedip saat muat | Skrip tema diblokir CSP (hash tidak cocok) | Jangan ubah isi skrip tema tanpa menghitung ulang hash (`src/lib/csp.ts` → `HASH_SKRIP_TEMA`); laporkan ke pengembang. |

## 8. Batas yang harus diketahui pengguna

- **Belum live:** semua alur di atas terverifikasi lokal
  (PGlite + `next start`); login + klik browser nyata +
  HP/desktop **belum diuji** dan menunggu sesudah deploy.
- **Podcast:** tanpa file audio MP3 server (TTS browser saja).
- **Sertifikat Academy:** belum ada (penilaian belum mendukung).
- **Notifikasi push/email:** belum ada — kegagalan job hanya
  terlihat di tab GitHub Actions / `/admin/kendali`.
- **Hapus akun mandiri:** belum ada — hubungi admin.
- **Arsip Q&A publik:** dibaca via service role (policy arsip
  publik belum ada — utang).
