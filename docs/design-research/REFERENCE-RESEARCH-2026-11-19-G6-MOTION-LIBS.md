# Riset Referensi Desain — Grup 6: Library Animasi 2
## GSAP Showcase · Framer Effects · Ripplix (SaaS)

- **Proyek:** PRATA FAKTA — platform berita & intelijen fakta (Next.js 16 + React 19)
- **Tanggal riset:** 19 November 2026
- **Riset oleh:** Subagen Grup 6 (mandat koordinator)
- **Status animasi PRATA FAKTA saat ini:** `motion` ^14.14.0 **terinstal tapi 0 berkas mengimpornya** (belum dipakai sama sekali). Tidak ada GSAP, Rive, Spline, atau Three.js. Sistem desain: Swiss Editorial (Inter + Source Serif 4, aksen crimson `#b91c1c`, terang/gelap), BottomNav kaca 6 item, Command Palette Ctrl+K sudah ada.
- **Sifat dokumen ini:** riset + dokumentasi saja. Bukan perubahan kode. Tidak ada aset, logo, atau layout berhak cipta yang disalin dari situs-situs di bawah ini — yang diadaptasi hanyalah *pola gerak* (timing, easing, pemicu, struktur), yang ditulis ulang dalam bahasa desain PRATA FAKTA sendiri.

## Metode & batasan pengamatan

Ketiga URL mandat dibuka langsung dengan `browser.open` pada 19 Nov 2026 (±13.47 UTC) dan teks aslinya dibaca:

| Situs | URL yang dibuka | Hasil |
|---|---|---|
| GSAP Showcase | https://gsap.com/showcase/ | Terbaca, tapi **sangat tipis**: halaman ini hampir seluruhnya video (showreel + klip "Site of the Week": Autopilot, Butter, Yevgeniya Grab, The Whoopsies, Nocturnal Dream, OFF+BRAND, ToyFight, Max Milkin, Olha Lazarieva, Liubomyr Ulytskyi) dan tautan galeri. Tidak ada teks deskriptif pola animasi di dalam halaman yang terbaca. |
| Framer — All New Effects | https://www.framer.com/updates/all-new-effects | Terbaca penuh. Halaman changelog ringkas (diperbarui 2026-09-15): empat Effects baru — Hover, Press, Loop, Drag — semuanya ditenagai Motion. Dilengkapi dengan halaman Framer Academy "Create and prompt animations in Framer" (dibuka juga sebagai pelengkap dari situs yang sama). |
| Ripplix — SaaS | https://www.ripplix.com/industry/saas | Terbaca penuh, tapi **hanya teks pengantar + FAQ**: koleksi 1.065+ animasi UI SaaS hasil rekaman produk nyata, tiap contoh disertai prompt AI. Daftar contoh individual (klip video) tidak termuat dalam teks halaman yang terbaca. |

Karena ketiga halaman itu video-berat / JS-berat, riset dilengkapi dengan pencarian web bertarget untuk pola-pola yang *disebut* halaman aslinya (ScrollTrigger, keempat Effects Framer, kategori animasi Ripplix). Semua klaim yang berasal dari pencarian sekunder ditandai sebagai demikian di bawah.

### Yang TIDAK teramati — butuh browser live

Perilaku berikut **tidak teramati** dalam riset ini dan **tidak boleh** diklaim sudah diverifikasi:

- Demo interaktif ScrollTrigger di GSAP Showcase (pin, scrub, horizontal scroll) — hanya terlihat sebagai klip video `.mp4` di daftar halaman; timing, easing, dan respons scroll yang sebenarnya tidak bisa diukur dari teks.
- Efek Hover / Press / Loop / Drag Framer secara langsung — yang terbaca hanya deskripsi changelog; nuansa spring, durasi, dan rasa "fisik"-nya tidak teramati.
- Klip individual Ripplix (dropdown Monday.com, slider Stripe Sessions, bottom sheet CRED, hero ClickFunnels, dsb.) — nama-nama itu berasal dari artikel sekunder tentang Ripplix, bukan dari daftar yang terbaca di halaman `/industry/saas` itu sendiri; durasi/easing tiap klip tidak teramati.
- Performa nyata (frame rate, jank di perangkat menengah, ukuran bundle hasil build) — tidak ada pengukuran yang dilakukan; angka bundle di bawah ini dikutip dari sumber sekunder dan diberi label.

---

## 1. GSAP Showcase — https://gsap.com/showcase/

### 1a. Apa yang membuat desainnya khas

GSAP Showcase bukan situs tutorial — ia adalah **galeri bukti**: deretan situs pemenang "Site of the Week" yang masing-masing direkam sebagai video, ditambah showreel tahunan. Yang khas:

- **Animasi sebagai bahasa utama, bukan hiasan.** Setiap situs yang dipamerkan (portofolio fotografer, studio, produk) memakai gerak untuk bercerita: hero yang di-zoom saat scroll, teks yang muncul kata-per-kata, panel yang bergeser horizontal.
- **Scrollytelling.** Pola dominan di karya-karya GSAP adalah narasi yang dikendalikan scroll: halaman "terkunci" (pin) sementara satu adegan diputar, lalu dilepas ke adegan berikut. Ini pola editorial/majalah — sangat dekat dengan DNA PRATA FAKTA sebagai platform berita.
- **Presisi koreografi.** GSAP dikenal karena timeline: banyak elemen bergerak dalam satu urutan yang diatur rapi (posisi relatif `<0.2`, `-=0.1`), bukan animasi lepas yang masing-masing jalan sendiri.
- **Gratis untuk komersial.** GSAP core dan ScrollTrigger gratis untuk semua pemakaian termasuk komersial (sumber sekunder: studi kasus Bay D, 2026). Plugin premium Club GSAP (SplitText, DrawSVG) tidak diperlukan — efek setaranya bisa dibuat dengan teknik gratis (text splitter manual ±15 baris, `stroke-dashoffset` untuk garis SVG).

### 1b. Interaksi yang layak diadaptasi

- **Scroll-pinned story untuk artikel investigasi / longform.** Satu bagian artikel (mis. linimasa peristiwa di `/timeline` atau pembuka artikel panjang) di-pin sementara grafik/thumbnail men-zoom, lalu dilepas ke teks. Ini satu-satunya pola GSAP yang benar-benar "tidak bisa" dibuat rapi dengan CSS/IntersectionObserver.
- **Reveal teks kata-per-kata pada headline hero beranda.** Headline utama muncul per kata (naik + fade + sedikit rotasi), terikat pada scroll atau saat masuk viewport.
- **Galeri horizontal di `/observatorium` atau `/graf`.** Scroll vertikal menggerakkan panel horizontal (beberapa panel: tipografi besar + parallax, image reveal wipe, bar chart animasi, CTA penutup). Cocok untuk membandingkan beberapa klaim/angka dalam satu sapuan scroll.
- **SVG draw-on-scroll untuk graf klaim.** Garis/diagram di `/graf` "digambar" stroke demi stroke mengikuti scroll; tiap fase (mis. Plan → Design → Build → Ship pada contoh, atau pada kita: Klaim → Bukti → Verifikasi → Skor) labelnya muncul saat strokenya selesai.
- **Before/after wipe.** Pembanding dua versi (mis. klaim sebelum vs sesudah koreksi, atau foto sebelum/sesudah verifikasi) dengan garis pembatas yang tersapu mengikuti scroll.

### 1c. Animasi yang layak diadaptasi (pola konkret)

| Pola | Rumus konkret (dari sumber sekunder yang konsisten dengan dokumentasi GSAP) | Catatan |
|---|---|---|
| Reveal grup kartu | `gsap.from('.card', { y: 40, opacity: 0, duration: 0.6, ease: 'power2.out', stagger: 0.08, scrollTrigger: { trigger: '.card-grid', start: 'top 80%' } })` | Satu ScrollTrigger di container, bukan satu per kartu. |
| Stagger grid 2D | `stagger: { each: 0.05, grid: 'auto', from: 'center' }` | GSAP mengukur kolom hasil render; stagger mengikuti jarak dari titik asal, bukan indeks DOM. Cocok untuk grid artikel beranda. |
| Timeline scrub | Satu `gsap.timeline({ scrollTrigger: { trigger, start, end, scrub: 1 } })`; durasi tween menjadi *proporsi* jarak scroll, bukan detik. Posisi relatif `<0.2` / `-=0.1` untuk overlap. | Aturan penting: `scrollTrigger` dipasang di timeline, **jangan** di tween anak — tween anak dengan ScrollTrigger sendiri akan bertarung dengan induknya. |
| Pin + scrub | `scrollTrigger: { trigger: '.wrapper', start: 'top top', end: '+=50%', pin: true, scrub: true }` | Pin dilepas tepat saat zoom mencapai skala maksimum agar konten di bawah langsung muncul. |
| Reveal dua arah | `toggleActions: 'play none none reverse'` | Main saat masuk, balik (reverse) saat scroll kembali ke atas — seksi terasa hidup di dua arah, bukan animasi sekali jalan yang membeku. |
| Hero berlapis | Background, gambar foreground, headline, subheadline, CTA masing-masing bergerak dengan kecepatan berbeda saat pengguna scroll menjauhi hero (parallax berlapis). | |
| Reduced motion | Bungkus pembuatan animasi dalam `gsap.matchMedia()` dengan kondisi `(prefers-reduced-motion: no-preference)`. | Pola resmi yang dikutip sumber sekunder; animasi tidak dibuat sama sekali bila pengguna meminta reduced motion. |

### 1d. Komponen relevan

- Hero beranda (pin + parallax berlapis + reveal kata-per-kata).
- Grid kartu artikel (stagger reveal, satu trigger per seksi).
- `/timeline` dan `/observatorium` (pin, horizontal scroll, SVG draw).
- `/graf` (SVG draw-on-scroll, bar chart animasi saat masuk viewport).
- Progress baca artikel — contoh showcase memakai progress bar yang terisi di bagian atas selama seksi ter-pin; pola yang sama bisa dipakai sebagai progress bar baca (namun untuk progress baca sederhana, `useScroll` Motion atau scroll listener CSS sudah cukup — lihat 1f).

### 1e. Di mana dipakai di PRATA FAKTA

| Lokasi | Pola | Prioritas |
|---|---|---|
| Hero beranda | Reveal headline kata-per-kata + parallax tipis | Sedang — bisa dikerjakan Motion dulu (lihat 1f) |
| Reveal kartu artikel (beranda, `/cari`, `/perpustakaan`) | Stagger grid, satu trigger per seksi | Tinggi — tapi implementasi pertama dengan Motion/IntersectionObserver |
| Artikel longform / investigasi | Scroll-pinned story (pin + scrub + zoom thumbnail) | Sedang — satu artikel flagship sebagai percobaan |
| `/timeline` | Pin + panel horizontal | Sedang |
| `/graf` | SVG draw-on-scroll + bar chart animasi | Sedang |
| Progress baca | Progress bar atas (scaleX mengikuti scroll) | Tinggi — tapi **tanpa GSAP** |

### 1f. Dampak performa — apakah GSAP layak?

**Keputusan jujur: TIDAK, belum layak menginstal GSAP sekarang.** Alasannya:

1. **Motion sudah terinstal dan belum dipakai sama sekali.** Semua kebutuhan animasi PRATA FAKTA tahap ini — reveal saat masuk viewport (`whileInView`), stagger kartu, progress bar baca (`useScroll` + `scaleX`), hover/tap spring, `AnimatePresence` untuk dropdown/modal, `layoutId` untuk indikator tab — semuanya berada di dalam kemampuan Motion. Menambah library kedua sebelum library pertama dipakai adalah pemborosan bundle dan kompleksitas.
2. **Biaya GSAP bukan nol.** GSAP core + ScrollTrigger adalah JavaScript tambahan yang harus diunduh, di-parse, dan diinisialisasi di setiap halaman yang memakainya (angka pastinya tidak diukur dalam riset ini; yang pasti: ini *tambahan* di atas Motion, bukan pengganti — karena Motion tetap dibutuhkan untuk animasi komponen React). Dua sistem animasi yang hidup berdampingan juga berarti dua mental model, dua pola reduced-motion, dan dua permukaan bug.
3. **Kapan GSAP *menjadi* layak** (ambang yang jelas, bukan "suatu hari nanti"):
   - Ada **pin + scrub** yang benar-benar dirancang (artikel longform flagship atau `/timeline` horizontal) — CSS tidak punya model untuk ini; Motion punya `useScroll` + `useTransform` yang bisa meniru scrub sederhana, tetapi pin yang presisi dan timeline multi-langkah yang diskala oleh scroll adalah wilayah ScrollTrigger.
   - Ada **timeline multi-langkah yang diskalakan oleh scroll** (mis. satu adegan observatorium dengan 4–5 langkah berurutan).
   - Ada animasi yang harus merespons **scroll + state lain secara bersamaan** (interaksi pengguna, data yang dimuat, ukuran viewport) dalam satu koreografi.
   - Sampai satu dari tiga kondisi itu ada dalam desain yang disetujui, jawabannya tetap: **cukup IntersectionObserver + Motion**.
4. **Aturan praktis dari sumber sekunder (konsisten di 3 sumber independen):** "Bila animasi adalah bagian dari urutan storytelling yang terkoordinasi, butuh bobot fisik, atau melibatkan pinning — pakai GSAP. Selain itu, CSS/Motion cukup." PRATA FAKTA hari ini berada di kategori kedua.

**Rekomendasi:** Jangan instal GSAP pada paket motion yang sedang berjalan. Catat ambang di atas sebagai kriteria masuk; evaluasi ulang hanya bila desain longform/timeline disetujui.

### 1g. Adaptasi mobile + reduced motion

- **Mobile:** pin + scrub dan horizontal scroll adalah pola desktop-berat. Di layar ≤430px (mayoritas pembaca PRATA FAKTA), pin membuat halaman terasa "macet" dan horizontal scroll vertikal membingungkan; nonaktifkan pin di mobile (`gsap.matchMedia()` dengan breakpoint) dan ganti dengan reveal vertikal biasa. Stagger grid 2D dengan `grid: 'auto'` tetap aman di mobile karena mengikuti kolom hasil render.
- **Reduced motion:** pola resmi `gsap.matchMedia('(prefers-reduced-motion: no-preference)')` — seluruh timeline scroll hanya dibuat bila pengguna tidak meminta reduced motion. Bila diminta: semua konten tampil langsung dalam keadaan akhirnya (tanpa fade/slide), pin dimatikan. Ini wajib, bukan opsional — pembaca berita mencakup pengguna dengan sensitivitas gerak/vestibular.
- **Performa scroll:** satu ScrollTrigger per seksi (bukan per kartu) menjaga jumlah scroll listener tetap kecil; `toggleActions: 'play none none reverse'` menghindari animasi yang menumpuk saat scroll cepat bolak-balik.

---

## 2. Framer — All New Effects — https://www.framer.com/updates/all-new-effects

### 2a. Apa yang membuat desainnya khas

Halaman ini adalah pengumuman pembaruan Framer (diperbarui 2026-09-15): **empat Effects baru — Hover, Press, Loop, dan Drag** — dengan tiga ciri yang penting:

1. **Efek sekali-klik, bukan kode.** Di Framer, efek-efek ini diterapkan ke sebuah layer "hanya dengan beberapa klik" lewat menu Effects yang didesain ulang (dengan penyortiran baru), dan bisa **dicampur-aduk** (mix & match). Filosofinya: interaksi yang dulu butuh komponen kustom kini menjadi properti lapisan.
2. **Semuanya ditenagai Motion.** Framer menyatakan eksplisit: "All of our animations are powered by Motion, so they're incredibly fast and customizable." Ini relevan langsung dengan PRATA FAKTA: library yang sudah terinstal (`motion` 14.14.0) adalah *mesin yang sama* dengan yang menggerakkan efek-efek Framer ini. Yang dipelajari di sini bukan library baru, melainkan **kosakata interaksi** yang sudah tersedia di tangan kita.
3. **Model mental berlapis (dari Framer Academy, situs yang sama):** efek per-layer untuk satu elemen yang butuh gerak dengan sedikit setup (appear, hover, press, drag, loop, scroll); efek teks (per karakter, kata, baris, atau elemen); efek scroll (reveal saat masuk viewport, ubah scale/posisi mengikuti scroll, atau ganti Component pada titik scroll tertentu); dan **Component Variants** untuk interaksi yang lebih besar — varian merepresentasikan tiap state (menu buka/tutup, tab terpilih, kartu mengembang), dihubungkan pemicu klik / mouse enter / mouse leave, dan Framer menganimasikan properti yang cocok antar-state.

Detail lain dari changelog: Hover dan Press juga mencakup **Fill dan Shadow**; Drag dapat memakai **Sections sebagai batas (constraints)**; Loop dapat di-**mirror** dan diberi **delay per loop**; properti Rotation dan Offset disederhanakan di semua efek; Perspective kini properti terpisah di bawah Styles dan properti 3D apa pun otomatis menambah Perspective; layer yang punya efek mendapat indikator di panel Layer.

### 2b. Interaksi yang layak diadaptasi

- **Hover (dengan Fill + Shadow):** kartu artikel yang saat hover sedikit terangkat (`y: -4`), bayangan melembut/menebal, dan aksen crimson menyapu (fill) pada garis bawah judul atau chip kategori. Ini bahasa "kartu hidup" yang paling murah dan paling terasa.
- **Press:** tombol (simpan, bagikan, salin tautan, filter) yang "menekan" saat disentuh — scale 0.96–0.97 + bayangan mengecil — memberi konfirmasi fisik bahwa ketukan diterima. Penting di perangkat sentuh, tempat tidak ada hover.
- **Loop (dengan mirror + delay):** indikator "LIVE" / "TERBARU" yang berdenyut halus; ikon pada empty state yang bergerak lembut; animasi ikon kecil (mis. ikon verifikasi yang berputar sekali lalu berhenti). Loop yang di-mirror (bolak-balik, bukan lompat kembali ke awal) terasa jauh lebih halus.
- **Drag (dengan constraints):** kartu klaim di `/klaim` yang bisa digeser/dilempar (swipe untuk "setuju/tidak" pada kartu klaim? — hanya bila ada alur yang membutuhkannya); panel bawah (bottom sheet) yang bisa ditarik; pengurutan ulang daftar bacaan di `/perpustakaan` dengan drag. **Catatan jujur:** drag adalah efek yang paling mudah menjadi gimmick — hanya dipakai bila ada tugas nyata (menyusun ulang, menutup sheet, memilah).
- **Variants (state-based):** dropdown/filter yang punya state buka/tutup, tab dengan indikator geser, kartu artikel yang mengembang menampilkan ringkasan, Command Palette (Ctrl+K) yang sudah ada — semuanya adalah pasangan state yang dianimasikan antar-state, persis model Variants Framer. Di Motion, ini diterjemahkan ke `AnimatePresence` + `layoutId`.
- **Efek teks:** headline hero yang muncul per kata/baris (Framer: "animate copy by character, word, line, or element") — tetapi dengan pengekangan editorial: efek kata-per-kata hanya untuk headline hero, bukan untuk isi artikel (keterbacaan berita tidak boleh dikorbankan).

### 2c. Animasi yang layak diadaptasi (pola konkret)

| Pola (bahasa Framer → bahasa Motion) | Rumus konkret | Durasi/easing yang wajar |
|---|---|---|
| Hover + tap spring pada tombol | `whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}` dengan spring (stiffness tinggi, damping sedang — makin rendah damping makin membal) | Spring, bukan durasi tetap; terasa fisik |
| Appear / fade-rise saat masuk viewport | `initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-10%' }}` | 0.5–0.6 dtk, `easeOut` |
| Stagger anak | Varian induk dengan `staggerChildren: 0.08` + `delayChildren` kecil; anak memakai varian yang sama | Jeda antar-anak 0.06–0.10 dtk; total seksi tidak lebih dari ~0.8 dtk |
| Tab indicator geser | `layoutId` yang sama pada indikator aktif di semua tab (shared layout animation) | Spring 0.3–0.4 dtk |
| Exit (keluar) | `AnimatePresence` membungkus elemen yang di-unmount (dropdown, modal, toast, chip filter yang dihapus) dengan prop `exit` | 0.2–0.3 dtk, `easeIn` untuk keluar |
| Scroll progress bar | `useScroll()` → `scaleX: useSpring(scrollYProgress)` pada bar di atas artikel | Spring halus (stiffness ~100, damping ~30) agar tidak bergetar |
| Drag dengan batas + snap back | `drag dragConstraints={{ left: -120, right: 120, top: -60, bottom: 60 }} dragSnapToOrigin` | Spring kembali |
| Loop mirror | Animasi yang berulang dengan `repeat: Infinity, repeatType: 'mirror', repeatDelay` | Hanya untuk indikator kecil, bukan blok konten |
| Tilt 3D mengikuti pointer | Rotasi X/Y kecil mengikuti posisi pointer dengan spring | Maks. ~6–8°, hanya di desktop (pointer: fine), nonaktifkan di sentuh |

### 2d. Komponen relevan

- Kartu artikel (hover lift + fill aksen + shadow).
- Tombol aksi (press scale + feedback sukses: ikon berubah menjadi centang — pola "button with success state").
- Dropdown & filter `/cari` (AnimatePresence: buka dengan ease-out, tutup dengan ease-in; panah/chevron berputar 180°).
- Tab (layoutId indikator geser; konten tab berganti dengan fade/slide pendek).
- Modal & Command Palette Ctrl+K (masuk dengan scale 0.96→1 + fade; keluar dengan exit animation — tanpa ini keduanya terasa "patah").
- Toast/notifikasi (masuk dari bawah, keluar otomatis, bisa di-swipe tutup di mobile).
- BottomNav (indikator aktif yang bergeser antar-item dengan layoutId; ikon aktif sedikit membesar).
- Skeleton/loading (shimmer halus, bukan spinner kasar) dan empty state (ikon loop lembut + teks).
- Progress baca (scroll progress bar di atas artikel).

### 2e. Di mana dipakai di PRATA FAKTA

| Lokasi | Pola Framer | Keterangan |
|---|---|---|
| Hero beranda | Appear per kata/baris pada headline; scroll effect tipis (scale/opacity berubah saat scroll) | Sekali, saat muat; jangan loop |
| Kartu artikel (beranda, `/cari`, `/perpustakaan`, `/klaim`) | Hover lift + shadow + fill aksen; appear stagger | Pola paling berdampak untuk biaya terendah |
| Dropdown/filter `/cari` & admin | Variants buka/tutup + AnimatePresence + chevron berputar | |
| Tab (kategori, subtes, filter admin) | layoutId indikator geser | |
| Command Palette (Ctrl+K) | Modal enter/exit + stagger item hasil | Sudah ada paletnya; tinggal diberi gerak masuk/keluar |
| BottomNav | layoutId indikator aktif | Ikon aktif membesar halus; label muncul |
| Form (admin, laporan, filter) | Press pada tombol submit; shake halus saat error validasi; centang sukses | Shake = error, pulse = notifikasi baru, spinner = loading (konvensi yang konsisten) |
| Loading/empty state | Skeleton shimmer; ikon loop lembut pada empty state | |
| Progress baca artikel | Scroll progress bar (scaleX) | |
| `/graf`, `/timeline`, `/observatorium` | Scroll effect: reveal + scale/posisi mengikuti scroll; ganti komponen pada titik scroll | Versi ringan dari pola GSAP; cukup untuk tahap ini |

### 2f. Dampak performa

- **Tidak ada instalasi baru.** Ini poin terpenting: efek-efek Framer ditenagai Motion — library yang *sudah ada* di `package.json` PRATA FAKTA. Biaya marjinalnya adalah biaya memakai sesuatu yang sudah terinstal, bukan menambah dependensi.
- **Ukuran Motion (sumber sekunder, perlu diukur ulang di build sendiri):** sekitar **~31 KB gzip** untuk `motion/react` (angka yang dikutip dua sumber sekunder independen); sebuah ADR publik (2026) mengukur baseline ~67,7 KB dengan rincian: komponen `motion` penuh + `AnimatePresence` + `MotionConfig` ≈ 47,8 KB, `LazyMotion` dengan `domAnimation` sinkron 32,5 KB, asinkron 16,4 KB di muka + 18,7 KB chunk tertunda, dan `domMax` (untuk layout + drag) 34,0 KB tertunda. **Angka-angka ini belum diverifikasi terhadap build PRATA FAKTA sendiri** — ukur dengan bundle analyzer sebelum menjadikan angka ini janji.
- **Strategi yang disarankan sumber sekunder (dan masuk akal untuk kita):** CSS dulu untuk hover/fade/loader sederhana (biaya nol, jalan walau JS belum termuat); Motion — idealnya lewat `LazyMotion` + komponen `m` — hanya untuk yang tidak bisa dilakukan CSS: exit animation elemen yang di-unmount, layout/shared-element (`layoutId`), dan gesture (drag). Aturan ini menjaga bundle awal tetap ramping: halaman artikel yang hanya butuh reveal + progress bar tidak perlu memuat fitur drag.
- **Yang dianimasikan:** hanya `transform` dan `opacity` (kompositor-only, tidak memicu layout/paint ulang). Jangan menganimasikan `width`, `height`, `top/left`, atau `box-shadow` yang besar secara langsung pada banyak elemen sekaligus — untuk shadow, animasikan opacity dari lapisan bayangan, bukan nilai shadow-nya.
- **Stagger dengan kendali:** total durasi satu seksi reveal dibatasi (~0.8 dtk); daftar panjang (hasil `/cari` dengan puluhan kartu) hanya menganimasikan ~8–12 kartu pertama yang terlihat, sisanya muncul tanpa stagger (atau stagger hanya saat pertama masuk viewport, `once: true`).

### 2g. Adaptasi mobile + reduced motion

- **Mobile (sentuh):** tidak ada hover di layar sentuh — semua umpan balik hover wajib punya padanan press/tap. Efek tilt pointer dan drag bebas hanya untuk `pointer: fine`. Bottom sheet dan toast harus bisa ditutup dengan swipe (gesture Motion), bukan hanya tombol X kecil. Durasi dipersingkat sedikit di mobile (perangkat menengah lebih lambat; animasi yang sama terasa lebih lama).
- **Reduced motion:** Motion menyediakan `MotionConfig reducedMotion="user"` — mematikan animasi transform dan layout bila pengguna memintanya (sumber sekunder: ADR Motion 14.13.0). **Catatan penting:** menurut sumber yang sama, `reducedMotion` *mati secara default* — harus diaktifkan eksplisit di root aplikasi. Di PRATA FAKTA ini berarti membungkus aplikasi dengan `<MotionConfig reducedMotion="user">` sejak awal, dan memastikan fallback-nya adalah konten yang langsung tampil dalam keadaan akhir (tanpa opacity 0 yang tertinggal bila JS gagal — selalu ada fallback CSS/no-JS agar konten tidak "hilang").
- **Loop yang aman:** animasi loop tanpa henti melanggar WCAG 2.1 kriteria 2.2.2 (Pause, Stop, Hide) bila berlangsung >5 detik tanpa kontrol pengguna. Loop di PRATA FAKTA dibatasi untuk indikator kecil (denyut LIVE, spinner) dan harus berhenti/diam dalam mode reduced motion.

---

## 3. Ripplix — SaaS — https://www.ripplix.com/industry/saas

### 3a. Apa yang membuat desainnya khas

Ripplix bukan alat animasi — ia adalah **perpustakaan inspirasi**: 1.065+ animasi UI SaaS yang dikurasi, masing-masing **direkam dari produk nyata yang sudah rilis** (bukan demo buatan), lengkap dengan prompt AI siap salin ke Cursor/Lovable/v0 (±80–90% akurat menurut klaim situsnya; 100 prompt gratis, MCP tersedia). Tiga hal yang membuatnya berbeda dari galeri biasa:

1. **Bukti dari produksi, bukan prototipe.** Seperti dinyatakan di FAQ halaman itu sendiri: "these come from real shipped SaaS products, so the motion reflects real choices about timing, easing and feedback" — yang dipelajari adalah keputusan timing/easing yang *benar-benar lolos* ke pengguna, bukan yang terlihat bagus di Dribbble.
2. **Diorganisasi per komponen & per merek.** Contoh dikategorikan per jenis animasi (dropdown, carousel, scroll reveal, slider, popup, button, select, dsb.) dan per merek (artikel sekunder menyebut Stripe, Canva, CRED, Microsoft Copilot, Monday.com, Productboard, Headspace, ClickFunnels, Duolingo, DoorDash). Seseorang yang membangun satu komponen tinggal membuka kategorinya dan membandingkan bagaimana 5–10 produk menyelesaikan masalah gerak yang sama.
3. **Bahasa prompt sebagai antarmuka.** Setiap contoh membawa prompt AI — Ripplix memperlakukan animasi sebagai sesuatu yang bisa dideskripsikan (timing, easing, pemicu) dan direproduksi, bukan sekadar ditiru secara visual. Untuk PRATA FAKTA, pelajaran yang bisa diambil adalah: **dokumentasikan tiap pola gerak dengan spesifikasi tertulis** (durasi, easing, pemicu, keadaan awal/akhir) agar bisa direproduksi konsisten di semua halaman — persis seperti yang dilakukan dokumen ini.

Kategori yang disebut di halaman/koleksi terkait (teks halaman + artikel sekunder yang konsisten): hover, card, button, dropdown, popup/popover, select, scroll reveal, slider, loader/loading, onboarding, success state, bottom sheet, dan tab transition. Koleksi mobile-app-nya (1.112+ contoh) menekankan onboarding, success state, bottom sheet, dan transisi tab dari aplikasi seperti Duolingo, CRED, Headspace, DoorDash.

### 3b. Interaksi yang layak diadaptasi

Ripplix tidak mengajarkan satu interaksi — ia mengajarkan **standar rasa** untuk interaksi yang sudah ada di PRATA FAKTA. Yang paling relevan:

- **Dropdown (contoh: Monday.com).** Buka dengan ease-out 200–300 ms, jatuh dari atas (arah masuk mengikuti logika asal: panel turun dari pemicunya), tutup dengan ease-in yang sedikit lebih cepat; chevron berputar; item yang dipilih mendapat highlight yang *mengikuti* (bukan melompat). Dipakai di: filter `/cari`, filter admin, pemilih urutan (terbaru/terpopuler).
- **Popover/tooltip.** Masuk dengan overshoot lembut (`cubic-bezier(0.175, 0.885, 0.32, 1.275)` — dikutip dari panduan pola animasi produksi), keluar cepat. Dipakai di: penjelasan FACT SCORE, definisi istilah di `/glosarium`, info sumber di kartu artikel.
- **Progress (contoh: pola onboarding & alur bertahap).** Progress bukan sekadar bar yang terisi — ia memberi tahu "di mana saya" dalam sebuah alur: langkah onboarding selesai, formulir tersimpan, artikel terbaca sejauh X%. Dipakai di: progress baca artikel, indikator kelengkapan verifikasi klaim di `/klaim`, progres pengiriman laporan/koreksi.
- **Loading.** Dua keluarga: (1) *skeleton/shimmer* untuk konten yang akan datang (daftar artikel, isi artikel) — terasa lebih cepat daripada spinner; (2) *spinner/loop 0,8–1,5 dtk linear atau ease-in-out* untuk aksi yang menunggu jawaban (pencarian, pengiriman form). Ritme yang dapat diprediksi = tenang. Dipakai di: `/cari`, pemuatan artikel, pengiriman form admin.
- **Date picker.** Pola kalender yang membuka dengan fade+scale kecil, bulan bergeser horizontal saat navigasi, tanggal yang dipilih mendapat fill aksen dengan transisi. Dipakai di: filter tanggal `/cari` dan `/timeline` (bila filter tanggal ditambahkan), pemilih rentang di `/observatorium`.
- **Button & success state.** Tombol yang melewati tiga keadaan dengan jelas: normal → loading (spinner kecil di dalam tombol, teks tetap) → sukses (centang pop 0,4 dtk, `cubic-bezier(0.34, 1.56, 0.64, 1)`) → kembali normal. Dipakai di: simpan artikel, kirim koreksi/laporan, salin tautan, aksi admin (terbitkan/tolak).
- **Bottom sheet (contoh: CRED).** Panel yang naik dari bawah di mobile dengan spring, bisa ditarik-tutup, latar meredup. Dipakai di: filter mobile `/cari`, detail cepat artikel (peek), menu aksi BottomNav di mobile.
- **Transisi tab & halaman.** Tab yang indikatornya bergeser mengikuti pilihan; pergantian halaman yang halus (konten lama fade-out singkat, konten baru fade-rise). Dipakai di: tab kategori beranda, tab admin, navigasi BottomNav.
- **Microinteraction umpan balik.** Tombol yang "menekan" (100–150 ms), toggle yang "menetap", field yang mengonfirmasi isian dengan centang kecil, ikon hati/menu yang berubah bentuk (morphing icon: menu → panah kembali). Dipakai di: simpan/bookmark, toggle tema terang/gelap, field form admin.

### 3c. Animasi yang layak diadaptasi (pola konkret)

| Komponen | Durasi | Easing | Catatan (dari panduan pola produksi yang konsisten dengan contoh Ripplix) |
|---|---|---|---|
| Umpan balik klik tombol | 100–150 ms | ease-out | Cepat — terasa seperti respons fisik |
| Dropdown / tooltip | 200–300 ms | ease-out saat buka, ease-in saat tutup | Masuk dari arah logis (dropdown jatuh dari atas; panel samping dari samping) |
| Modal / dialog | 300–400 ms | spring / cubic-bezier pegas | Masuk dengan sedikit bounce menambah karakter |
| Popover / menu | 250–350 ms | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` (overshoot & settle) | |
| Sukses (centang pop) | 0,4 dtk | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Setelah aksi berhasil |
| Loader / spinner | Loop 0,8–1,5 dtk | linear atau ease-in-out | Ritme dapat diprediksi = tenang |
| Page loader | ~1,5 dtk loop | — | Hanya bila benar-benar menunggu; skeleton lebih baik |
| Transisi halaman / seksi | 200–500 ms | ease-out untuk yang datang, ease-in untuk yang pergi | |
| Dekoratif (bukan fungsional) | s.d. 2 dtk | — | Jangan menganimasikan elemen yang tidak diinteraksi >5 detik tanpa tujuan |

Prinsip pemandu (dikutip dari panduan pola produksi, selaras dengan filosofi Ripplix): **setiap animasi harus melayani satu fungsi — umpan balik, orientasi, atau kesenangan (delight).** Shake = error; Pulse = notifikasi baru; Spinner = loading. Bila sebuah animasi tidak menjelaskan apa yang terjadi, ia adalah dekorasi yang mengganggu pembaca.

### 3d. Komponen relevan

Dropdown, popover, tooltip, date picker, progress bar (baca & alur), loading skeleton & spinner, tombol tiga-keadaan (normal/loading/sukses), bottom sheet, tab dengan indikator geser, toggle, morphing icon, toast/success state, transisi halaman, empty state dengan ikon bergerak lembut.

### 3e. Di mana dipakai di PRATA FAKTA

| Lokasi | Pola Ripplix | Prioritas |
|---|---|---|
| Filter `/cari` (desktop + mobile) | Dropdown + bottom sheet (mobile) + date picker | Tinggi |
| Progress baca artikel | Progress bar + indikator "X% dibaca" | Tinggi |
| Tombol simpan/bagikan/salin | Tombol tiga-keadaan (loading → sukses centang) | Tinggi |
| FACT SCORE & sumber | Popover/tooltip penjelasan skor | Sedang |
| Form admin & laporan/koreksi | Loading → sukses; shake saat error; skeleton saat memuat data | Tinggi |
| BottomNav (mobile) | Transisi tab + indikator geser; sheet aksi | Sedang |
| Empty state (`/cari` kosong, bookmark kosong) | Ikon loop lembut + teks jelas + aksi | Sedang |
| `/timeline` & `/observatorium` | Date picker + transisi antar-rentang | Sedang |
| Onboarding pengguna baru (bila ada) | Pola langkah bertahap + progress + success state | Rendah (belum ada alurnya) |

### 3f. Dampak performa

- **Ripplix sendiri bukan library — biayanya nol.** Tidak ada yang diinstal dari Ripplix. Nilainya adalah referensi: pola-pola di atas diimplementasikan dengan **CSS transitions + Motion yang sudah terinstal**. Ini justru kabar terbaik dari grup riset ini: seluruh pola SaaS yang relevan bisa dibangun tanpa dependensi baru.
- **Biaya sebenarnya adalah biaya implementasi yang ceroboh:** menganimasikan properti pemicu-layout (width/height/top/left), stagger tanpa batas pada daftar panjang, atau loop tanpa henti. Semua itu dihindari dengan aturan di 2f/3g.
- **Perbandingan biaya antar-pendekatan (ringkas):** CSS murni ≈ 0 KB (untuk hover, fade, dropdown sederhana, skeleton shimmer); Motion (sudah terinstal) ≈ ~31 KB gzip menurut sumber sekunder, dengan opsi `LazyMotion` untuk menunda muat fitur lanjutan; GSAP + ScrollTrigger = tambahan di atas Motion, hanya dibenarkan bila ambang di 1f terpenuhi.
- **Pengukuran yang masih harus dilakukan** (di luar riset ini): bundle analyzer pada build PRATA FAKTA sendiri; profiling di perangkat Android menengah (target pembaca utama) untuk memastikan reveal + stagger tidak menjatuhkan frame saat scroll cepat.

### 3g. Adaptasi mobile + reduced motion

- **Mobile:** bottom sheet menggantikan dropdown/modal besar; target sentuh ≥44px; semua umpan balik hover punya padanan press; swipe-to-dismiss untuk toast & sheet; date picker memakai tampilan native-ish yang mudah disentuh (bukan kalender desktop yang diperkecil).
- **Reduced motion:** semua pola di atas runtuh dengan anggun ke "langsung tampil" bila `prefers-reduced-motion: reduce` — dropdown langsung terbuka tanpa slide, progress bar langsung menunjukkan nilai akhir, skeleton diganti teks "Memuat…" statis, loop dimatikan. Aturan WCAG 2.2.2: animasi yang berjalan >5 detik tanpa interaksi harus bisa dijeda/dihentikan/disembunyikan — spinner dan denyut LIVE termasuk yang harus diam dalam mode ini.
- **Keterbacaan dulu:** Ripplix sendiri menekankan bahwa animasi yang baik "memberi tahu apa yang baru saja terjadi tanpa perlu kata-kata" — di situs berita, itu berarti animasi tidak boleh menunda akses ke informasi (headline, skor, isi artikel) lebih dari sepersekian detik.

---

## 4. Matriks perbandingan ketiga situs

| Dimensi | GSAP Showcase | Framer — All New Effects | Ripplix — SaaS |
|---|---|---|---|
| **Jenis situs** | Galeri karya (showcase + showreel video) | Pengumuman produk + Academy (tutorial) | Perpustakaan inspirasi (rekaman produk nyata + prompt AI) |
| **Yang dipamerkan** | Situs pemenang dengan animasi sinematik | 4 Effects baru: Hover, Press, Loop, Drag (ditenagai Motion) | 1.065+ animasi SaaS per komponen/merek |
| **Kekuatan utama** | Scrollytelling: pin, scrub, timeline presisi | Kosakata interaksi siap pakai; model Variants berbasis state | Standar rasa produksi: timing/easing yang terbukti di produk rilis |
| **Pola kunci** | Timeline, stagger (termasuk grid 2D), ScrollTrigger, pin + scrub, SVG draw, horizontal scroll | Hover/press spring, appear, loop mirror, drag + constraints, layoutId, AnimatePresence | Dropdown, popover, date picker, progress, loading/skeleton, tombol 3-keadaan, bottom sheet, microinteraction |
| **Relevansi ke PRATA FAKTA** | Sedang — kuat untuk longform/`/timeline`, berlebihan untuk kebutuhan harian | **Tinggi** — mesinnya (Motion) sudah terinstal; polanya langsung dipakai | **Tinggi** — standar mutu untuk semua komponen yang sudah ada |
| **Biaya adopsi** | Library baru (tambahan di atas Motion); hanya bila ambang 1f terpenuhi | Nol dependensi baru; biaya = memakai Motion yang sudah ada | Nol (bukan library); biaya = disiplin implementasi |
| **Risiko utama** | Over-engineering; pin/scrub buruk di mobile; dua sistem animasi | Stagger/loop berlebihan; `reducedMotion` mati secara default bila tidak diaktifkan | Meniru gimmick tanpa fungsi; animasi yang menunda informasi |
| **Mobile** | Pin & horizontal scroll dimatikan di mobile | Hover → press; drag hanya bila ada tugas nyata | Bottom sheet ganti modal; target sentuh ≥44px |
| **Reduced motion** | `gsap.matchMedia('(prefers-reduced-motion: no-preference)')` | `MotionConfig reducedMotion="user"` (wajib diaktifkan eksplisit) | Semua pola runtuh ke "langsung tampil"; loop dimatikan |
| **Keteramatan riset ini** | Teks halaman sangat tipis (video); pola didukung pencarian sekunder | Terbaca penuh (changelog + Academy) | Teks pengantar + FAQ terbaca; klip individual tidak teramati |

---

## 5. Adaptasi prioritas tertinggi untuk PRATA FAKTA (3–5)

### P1 — Sistem gerak dasar dengan Motion yang sudah terinstal (Framer + Ripplix)
**Apa:** Aktifkan `motion` (yang hari ini 0 impor) sebagai *satu-satunya* sistem animasi, dengan token gerak tertulis: durasi 100–150 ms (umpan balik), 200–300 ms (dropdown/tooltip), 300–400 ms (modal), ease-out untuk datang / ease-in untuk pergi, spring untuk hover/tap. Bungkus aplikasi dengan `<MotionConfig reducedMotion="user">` sejak hari pertama. Terapkan ke: reveal kartu artikel (stagger 0,06–0,10 dtk, `once: true`), hover lift kartu + press tombol, `AnimatePresence` untuk dropdown/filter/modal/Command Palette, `layoutId` untuk indikator tab & BottomNav, dan progress baca (`useScroll` + `scaleX`).
**Mengapa pertama:** biaya nol dependensi baru, dampak terlihat di semua halaman, dan menutup utang "library terinstal tapi tak dipakai". Ini fondasi yang membuat P2–P4 bisa dibangun konsisten.

### P2 — Tombol tiga-keadaan + umpan balik form (Ripplix)
**Apa:** Setiap tombol aksi (simpan, bagikan, salin tautan, kirim koreksi/laporan, aksi admin) melewati normal → loading (spinner di dalam tombol) → sukses (centang pop 0,4 dtk) → normal; error memakai shake halus + pesan yang jelas. Skeleton shimmer untuk daftar artikel & isi artikel saat memuat; spinner hanya untuk aksi yang menunggu jawaban.
**Mengapa:** Ini pola yang paling sering disentuh pembaca dan paling sering terasa "murah" bila absen. Tanpa ini, situs terasa belum selesai walau hero-nya bagus.

### P3 — Dropdown, filter & date picker yang bernyawa (Ripplix + Framer Variants)
**Apa:** Filter `/cari` dan admin: buka ease-out 200–300 ms dari arah pemicu, chevron berputar, highlight mengikuti pilihan; di mobile berubah menjadi bottom sheet yang bisa ditarik-tutup. Tambahkan date picker (kalender fade+scale kecil, bulan bergeser horizontal) untuk filter tanggal `/cari` dan `/timeline`. Popover penjelasan FACT SCORE dan definisi `/glosarium` memakai overshoot lembut.
**Mengapa:** Filter adalah alat kerja utama pembaca dan admin; gerak yang benar membuatnya terasa dapat diandalkan, bukan sekadar daftar yang muncul.

### P4 — Hero beranda + reveal editorial yang terkendali (Framer teks + GSAP pola, tanpa GSAP)
**Apa:** Headline hero muncul per kata/baris saat muat (satu kali, tanpa loop), kartu artikel reveal stagger per seksi, dan efek scroll ringan (scale/opacity mengikuti scroll) — semuanya dengan Motion/`useScroll`, bukan GSAP. Pin/scrub dan horizontal scroll **ditunda** sampai ada desain longform atau `/timeline` yang disetujui (ambang di 1f).
**Mengapa:** Memberi "kesan pertama yang beda" yang diminta mandat redesign — tanpa membayar harga GSAP sebelum ada kebutuhan yang membenarkannya.

### P5 — Aturan reduced-motion & mobile sebagai gerbang (bukan tambahan)
**Apa:** Sebelum P1–P4 dinyatakan selesai: (a) `MotionConfig reducedMotion="user"` aktif dan diverifikasi (semua animasi diam, konten langsung tampil utuh); (b) semua hover punya padanan press di sentuh; (c) tidak ada animasi yang menganimasikan properti pemicu-layout; (d) stagger dibatasi (~8–12 item pertama, total seksi ≤0,8 dtk); (e) tidak ada loop >5 detik tanpa kontrol. Uji di perangkat Android menengah dan viewport 320–430px.
**Mengapa:** Pembaca berita memakai perangkat menengah dan sebagian memakai reduced motion. Gerbang ini yang membedakan "situs yang bergerak" dari "situs yang bergerak dengan benar".

---

## 6. Yang sengaja TIDAK direkomendasikan

- **Menginstal GSAP sekarang.** Alasan lengkap di 1f. Evaluasi ulang hanya bila ambang (pin+scrub longform, timeline scroll multi-langkah, atau koreografi scroll+state) terpenuhi dalam desain yang disetujui.
- **Drag bebas sebagai hiasan.** Drag (Framer) hanya bila ada tugas nyata (menyusun ulang, menutup sheet). Kartu yang bisa digeser tanpa akibat adalah gimmick yang membingungkan pembaca.
- **Loop pada blok konten.** Loop hanya untuk indikator kecil (denyut LIVE, spinner). Headline, kartu, dan gambar tidak di-loop.
- **Menyalin klip Ripplix atau situs Showcase secara visual.** Yang diadaptasi adalah pola gerak dan spesifikasinya, bukan tampilan, merek, atau aset produk lain.
- **Teks animasi di isi artikel.** Efek per-kata/per-karakter hanya untuk headline hero. Isi berita harus bisa dibaca seketika, tanpa menunggu animasi.

---

## Sumber

**Dibaca langsung (browser.open, 19 Nov 2026):**
- https://gsap.com/showcase/ — teks halaman tipis, dominan video (showreel 2025 + klip Site of the Week: Autopilot, Butter, Yevgeniya Grab, The Whoopsies, Nocturnal Dream, OFF+BRAND, ToyFight, Max Milkin, Olha Lazarieva, Liubomyr Ulytskyi).
- https://www.framer.com/updates/all-new-effects — changelog "All New Effects" (diperbarui 2026-09-15): Hover, Press, Loop, Drag; ditenagai Motion.
- https://www.framer.com/academy/lessons/framer-animations-overview — "Create and prompt animations in Framer" (Framer Academy, 2026-08-13): layer effects, text effects, scroll effects, Component Variants.
- https://www.ripplix.com/industry/saas — "1000+ SaaS UI Animations & Examples": 1.065+ animasi SaaS dari produk nyata, tiap contoh disertai prompt AI; FAQ tentang asal rekaman dan cara membangun ulang dengan CSS/Tailwind/Framer Motion.

**Pencarian pendukung (untuk pola yang disebut tetapi tidak terperinci di halaman aslinya):**
- GSAP ScrollTrigger: webdevpuneet.com (scroll-pinned story), gsapvault.com (panduan 2026: stagger, scrub, timeline), supik.digital (pola pin/horizontal/stagger; kriteria kapan GSAP layak), baydllc.com (5 teknik: pinned+progress, SVG draw, text split, horizontal gallery, before/after wipe; GSAP + ScrollTrigger gratis komersial).
- Framer/Motion: nexus-ui.com (10 pola Framer Motion: hover spring, layoutId tab, AnimatePresence, drag constraints, scroll progress); artofstyleframe.com (Motion ~31 KB gzip; CSS dulu untuk hover/fade sederhana); stack.visual-thinking.pt ADR-0043 (angka LazyMotion/domAnimation/domMax; `MotionConfig reducedMotion="user"`); loooop.dev (Motion 14.6.0; kapan memakai vs menghindari Motion).
- Ripplix: regards.design (perbandingan pustaka inspirasi animasi; Ripplix = rekaman terbanyak lintas situs/aplikasi); gettoplists.com & dev.to (kategori Ripplix: dropdown Monday.com, slider Stripe Sessions, bottom sheet CRED, hero ClickFunnels; merek: Stripe, Canva, CRED, Microsoft Copilot); stacklesson.com (tabel durasi/easing pola produksi: tombol 100–150 ms, dropdown 200–300 ms, modal 300–400 ms, loader loop 0,8–1,5 dtk; WCAG 2.2.2).

**Catatan kejujuran:** angka bundle Motion/LazyMotion di atas berasal dari sumber sekunder dan belum diukur pada build PRATA FAKTA sendiri — ukur dengan bundle analyzer sebelum dijadikan janji. Semua perilaku interaktif yang ditandai "tidak teramati" di bagian Metode tetap tidak teramati sampai ada verifikasi browser live.
