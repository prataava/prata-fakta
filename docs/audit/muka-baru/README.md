# AUDIT MUKA BARU — Rombak Tampilan Depan PRATA FAKTA

**Tanggal:** 20 November 2026 · **Branch:** `redesign/tampilan-depan-baru` (dari `main` 0f6f9a4)
**Alasan:** pengguna membuka hasil redesign Fase 3–5 yang sudah LIVE dan menilai
**"sama aja"** — identitas Swiss + IA yang dipertahankan membuat pandangan
pertama nyaris tidak berubah. Muka baru menargetkan perbedaan yang terlihat
dalam **1 detik pertama** membuka beranda di HP, tanpa interaksi.

**Metode screenshot:** server lokal `next start -p 3001` dari build produksi
`.next` (before: BUILD_ID `0UzvgDWyyAtj4wibORWTD` = isi main; after:
`Z7xNVccxD3Th5CoscuFTR`), chrome-headless-shell
`--virtual-time-budget=12000`. Gambar artikel eksternal (CDN detik/Antara)
**tidak termuat di headless** (artefak lingkungan, sama seperti audit
sebelumnya; gambar diverifikasi 200 via curl di fase-fase terdahulu) —
karena itu hero tampil dalam keadaan **fallback gelap**-nya di screenshot
after, yang memang salah satu dari dua wajah hero yang dirancang.

## Berkas

| Berkas | Isi |
|---|---|
| `before-beranda-390.png` / `before-beranda-1280.png` | Beranda main: hero teks saja, wordmark kecil |
| `before-artikel-390.png` / `before-artikel-1280.png` | Artikel main: judul 2,6rem maks |
| `after-beranda-390.png` / `after-beranda-1280.png` | Masthead koran + strip TERKINI + hero sinematik (fallback gelap) |
| `after-artikel-390.png` / `after-artikel-1280.png` | Judul artikel jauh lebih besar; FACT SCORE utuh |
| `after-beranda-gelap-390.png` | Mode gelap (emulasi CDP prefers-color-scheme) |
| `after-beranda-penuh-1280.png` | Beranda utuh 1280 (jendela 5600px — hero vh ikut memanjang, artefak metode) |
| `after-terbaca-390.png` / `after-terbaca-1280.png` | Daftar "Paling Banyak Dibaca" 01–05 — dipotret lewat rute uji sementara berisi 5 artikel terbaru (data populer asli kosong untuk tamu, lihat catatan), rute dihapus sesudahnya |

## Yang berubah (ringkas)

1. **Masthead koran** — strip tanggal + tagline (≥1024px), wordmark
   `clamp(2.05rem, 4.6vw, 3.3rem)` di tengah (dulu 1,55rem; di HP dulu
   menyusut ke 1rem), susunan bertumpuk <1200px dan sebaris
   cari | wordmark | aksi di ≥1200px. Semua fungsi sama.
2. **Bilah TERKINI** — strip gelap full-bleed di bawah masthead, label
   aksen, judul-judul artikel terbaru nyata berjalan (tautan), berhenti
   saat hover, mati + bisa digeser saat reduced motion.
3. **Hero sinematik** — foto berita utama layar penuh (100vw × 82svh HP /
   72vh desktop, varian 1200px via `gambarBesar`), gradasi gelap bawah
   (token `--hero-gradasi`, ujung 0.92), judul serif
   `clamp(2.3rem, 8vw, 4.2rem)` menimpa foto, chip "Berita Utama" +
   kategori + lencana status verifikasi di atas foto, ringkasan
   (maks 3 baris) + tanggal + pil "Baca berita utama" di dalam foto.
   Seluruh hero terklik via stretched link judul. Tanpa foto / foto
   gagal muat → blok gelap berani + kata kategori raksasa samar.
   *Catatan jujur:* lencana di hero adalah **status verifikasi**, bukan
   angka FACT SCORE — data ringkas beranda tidak memuat skor dan
   menghitungnya butuh kueri klaim per artikel (di luar izin mandat:
   tanpa kueri baru). FACT SCORE angka tetap tampil penuh di halaman
   artikel seperti sebelumnya.
4. **Sorotan** — 2 berita berikutnya sebagai kartu fitur besar tepat di
   bawah hero; sisa terbaru masuk grid "Berita Terbaru".
5. **Kartu majalah** — komponen kartu bersama: gambar 16:10 (dulu 16:9),
   judul kartu 1,3rem (dulu 1,15rem). Berlaku juga di kategori/arsip/cari.
6. **Paling Banyak Dibaca** — seksi populer kini daftar bernomor dengan
   angka serif raksasa 01–05 (data `getArtikelPopuler` = baris baca
   nyata; angka baca mentah tidak ditampilkan karena tidak diekspos
   data ringkas). Seksi tetap sembunyi bila data kosong.
7. **Kepala seksi** — judul `clamp(1.55rem, 3.2vw, 2rem)`, garis bawah
   3px, tanda aksen menjadi balok 28×8px.
8. **Artikel** — judul `clamp(2.15rem, 5vw, 3.35rem)`; foto utama
   sinematik 16:10 (21:9 di ≥1024px, maks 580px, crop tengah).
   Isi, progress baca, FACT SCORE tidak berubah perilakunya.

Tidak berubah: IA/rute/BottomNav (6 item, kaca dipertahankan), auth,
guard admin, API, pipeline, rumus + label FACT SCORE, kueri data
(tanpa kueri baru), SearchBar, NewsletterForm, TTS, tema, `TemaInit()`
+ `HASH_SKRIP_TEMA` (tidak disentuh), `src/proxy.ts`, cacheComponents.
Tanpa dependensi baru, tanpa Tailwind. Token baru hanya DITAMBAH
di `globals.css` `:root` (`--strip-gelap`, `--teks-di-gelap*`,
`--hero-teks*`, `--hero-gradasi`, `--chip-di-foto`).

## Gerbang (angka nyata)

| Gerbang | Hasil |
|---|---|
| `npx tsc --noEmit` | **0** error |
| `npm run lint` | **0** error, 1 warning lama (`scripts/uji-ekspansi-p0.mjs` DIR_SRC) |
| `node scripts/cek-token-gerak.mjs` | **13/13** (0 self-ref, 0 var() tak terdefinisi) |
| `npm run build` | **exit 0** (BUILD_ID `Z7xNVccxD3Th5CoscuFTR`) |
| Overflow horizontal (CDP, scrollWidth vs innerWidth) | **0 overflow** di 10 kasus: beranda 320/360/390/430/1280, artikel 390/1280, kategori 320/390, indeks kategori 390 |
| Probe HTTP server lokal | beranda 200 |

## Penilaian jujur: apakah beda dalam 1 detik?

**Ya — kali ini beda secara struktural, bukan cuma gerak.** Before: layar
pertama = teks slogan di atas kertas terang + tombol; berita utama baru
muncul sebagai kartu di bawah lipatan. After: layar pertama = masthead
koran dengan wordmark ±2× lebih besar, strip hitam TERKINI, lalu panggung
gelap layar penuh berisi judul berita utama serif raksasa di atas
foto/gradasi. Tiga lapis itu terlihat bersamaan sebelum scroll apa pun,
di HP maupun desktop, di mode terang maupun gelap.

Batasan penilaian ini:
- Di screenshot headless, hero tampil sebagai **fallback gelap** (CDN
  gambar tidak termuat di sandbox). Wajah utama hero (foto asli memenuhi
  layar) **belum terpotret** — komposisinya sama persis, hanya latarnya
  foto, bukan blok gelap; perlu verifikasi visual sesudah deploy di
  perangkat nyata.
- Banner PWA "Versi baru tersedia" menimpa sudut hero pada beberapa
  tangkapan (perilaku lama aplikasi saat build berganti, bukan bagian
  desain).
- Daftar "Paling Banyak Dibaca" terpotret dengan data pengganti
  (artikel terbaru) karena data populer asli kosong bagi tamu (RLS
  riwayat baca) — komponen + gayanya yang diverifikasi, bukan datanya.
- Lighthouse/LCP/INP/CLS tidak diukur (tidak ada browser live) —
  tidak diklaim.
