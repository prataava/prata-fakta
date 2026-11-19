# Riset Referensi Desain — Grup 5: Library Animasi 1

**Proyek:** PRATA FAKTA — platform berita & intelijen fakta (Next.js 16 + React 19)
**Tanggal riset:** 19 November 2026
**Kelompok:** G5 — Library Animasi 1 (Awwwards Animation, Codrops, Rive)
**Sifat dokumen:** Riset + dokumentasi ONLY. Tidak ada perubahan kode.
**Penulis:** Subagen riset (mandiri, tanpa subagen lanjutan)

## Konteks PRATA FAKTA (yang menjadi patokan adaptasi)

- Stack animasi saat ini: `motion` ^14.14.0 **terinstal tapi 0 berkas mengimpornya** (belum dipakai sama sekali).
- **Tidak ada** GSAP, Rive, Spline, atau Three.js di dependensi.
- Sistem desain: Swiss Editorial — Inter + Source Serif 4, aksen crimson `#b91c1c`, mode terang/gelap.
- Navigasi: BottomNav kaca (liquid glass) 6 item; Command Palette `Ctrl+K` sudah ada.
- Halaman: beranda, artikel, cari, graf (`/graf`), linimasa (`/timeline`), observatorium (`/observatorium`), klaim (`/klaim`), perpustakaan (`/perpustakaan`), glosarium (`/glosarium`), admin `/admin`.
- Prinsip yang tidak boleh dilanggar oleh adaptasi apa pun: keterbacaan berita di atas segalanya, artikel harus tetap bisa ditemukan mesin pencari (teks HTML asli, bukan teks di dalam canvas), dan animasi tidak boleh menunda akses ke isi.

## Metode & batasan — baca dulu

Riset ini dilakukan **hanya dengan pembacaan teks halaman** (`browser.open`) dan pencarian web (`browser.search`). Subagen ini **tidak memiliki browser live interaktif**, sehingga:

| Yang berhasil dilakukan | Hasil |
|---|---|
| Membaca teks halaman utama ketiga situs (URL persis sesuai tugas) | Berhasil — ketiganya terbaca, tetapi ketiganya hanya menampilkan teks intro/struktur, bukan daftar demo lengkap (lihat per situs) |
| Pencarian web spesifik per situs (pola animasi, state machine Rive, demo Codrops) | Berhasil — memberi bukti sekunder yang kuat dari ulasan/komparasi independen November 2026 |
| Membaca satu artikel komparasi independen (regards.design, 14 Nov 2026) yang menilai Codrops & Awwwards dari halaman mereka sendiri per 10 Nov 2026 | Berhasil — 948 baris dibaca penuh, termasuk bagian Codrops & Awwwards Elements |

| Yang **tidak teramati — butuh browser live** | Konsekuensi |
|---|---|
| Demo animasi yang diputar, efek hover saat kursor bergerak, scroll-jacking, transisi halaman antar-situs pemenang Awwwards | **Tidak ada klaim** dalam laporan ini tentang "bagaimana rasanya" sebuah demo tertentu; semua pola yang disebut berasal dari deskripsi tertulis yang terverifikasi, bukan dari pengamatan gerak |
| Daftar kartu situs pemenang di halaman kategori Awwwards (teks yang terbaca hanya intro kategori, 25 baris) | Nama-nama situs pemenang di bawah diambil dari artikel sekunder (aicssanimations, hontran.dev, schoolofmotion, colorlib — November 2026), bukan dari pengamatan langsung atas grid Awwwards |
| Editor Rive, pemutaran file `.riv`, dan ukuran runtime yang terukur di PRATA FAKTA | Angka ukuran di bawah adalah angka yang diterbitkan sumber sekunder (bukan pengukuran sendiri); wajib diukur ulang sebelum diputuskan |
| Perilaku animasi di perangkat sentuh / HP Android | Semua rekomendasi mobile di bawah adalah prinsip umum yang diturunkan dari pola yang terbaca, bukan hasil uji perangkat |

**Aturan yang dipatuhi:** tidak ada aset, logo, atau layout berhak cipta yang disalin. Semua pola di bawah dirumuskan ulang sebagai prinsip/teknik generik (mis. "reveal baris demi baris", "indikator pill yang meluncur"), bukan tiruan tampilan situs tertentu.

---

## 1. Awwwards — Kategori Animation

**URL yang dibaca:** `https://www.awwwards.com/websites/animation/`
**Yang terbaca langsung:** 25 baris teks intro kategori (di-crawl <1 menit sebelum dibaca, 19 Nov 2026 13.47 UTC). Isinya: definisi animasi sebagai ilusi gerak; pernyataan bahwa animasi kini "bukan sekadar bagian dari konten situs, melainkan fitur fundamental, esensial untuk meningkatkan interaksi"; dan penyebutan evolusi teknik sejak CSS3 — Canvas, SVG, CSS3, WebGL, serta "langkah raksasa terbaru: penyatuan animasi deklaratif dan imperatif lewat Web Animation API".
**Yang tidak terbaca:** grid kartu situs pemenang, filter teknologi, dan detail tiap entri — halaman yang dikembalikan alat baca teks hanya memuat intro. Karena itu, pola-pola di bawah didukung artikel sekunder November 2026 (aicssanimations.com, 1 Nov 2026; hontran.dev, juror Awwwards; schoolofmotion.com; colorlib.com) yang membaca situs-situs itu secara langsung.

### (a) Apa yang membuat desainnya khas

- **Bukan satu situs, melainkan kurasi + sistem penilaian.** Awwwards adalah direktori situs pemenang penghargaan (label Site of the Day, Developer Award, Honorable Mention, skor juri). Nilainya sebagai referensi bukan pada satu gaya visual, melainkan pada **seleksi**: situs yang lolos juri adalah yang gerakannya "diarahkan" (directed motion), bukan animasi demi animasi.
- **Filter berdasarkan teknologi.** Entri bisa difilter menurut teknologi (GSAP, Three.js, WebGL, Framer, Webflow), kategori, font, dan warna — ini membuat kategori Animation berfungsi sebagai **daftar bacaan teknik**: filter "GSAP" saja sudah memperlihatkan teknik di balik tiap situs (aicssanimations, Nov 2026).
- **Awwwards Elements** (bagian terpisah yang dinilai regards.design 10 Nov 2026): potongan-potongan dari situs yang disubmit studio, dalam bentuk video, dengan kategori animation, interaction, mouse interaction, scroll, transition, loading, dan menus, bisa difilter warna, gratis tanpa akun. Ini bagian Awwwards yang paling berguna sebagai referensi pola — bukan situs pemenang utuh, melainkan **satu interaksi dalam satu klip yang berulang**.
- **Prinsip yang berulang pada pemenang 2026** (dari hontran.dev & schoolofmotion, keduanya membaca situs pemenang langsung):
  - *Directed motion / koreografi:* transisi membawa makna; urutan scroll mengatur tempo cerita; mikro-interaksi memberi hadiah atas perhatian. "Motion has a director, not just a library."
  - *Kecepatan adalah bagian dari keindahan:* "The best animated websites of 2026 are also fast websites. Beauty at 60fps is the whole discipline."
  - *Restraint (menahan diri) justru menang:* By-Kin (Next.js + GSAP + Strapi, 4 penghargaan termasuk Developer Award) dipuji karena "smooth scroll yang berbobot dan transisi yang tidak pernah menarik perhatian pada dirinya sendiri, namun membuat keseluruhan terasa seperti satu permukaan kontinu." Developer Award adalah sinyal penting: diberikan untuk **kualitas rekayasa**, artinya gerakannya tahan diperiksa frame demi frame.
  - *Tipografi kinetik yang tetap bisa dibaca:* Mat Voyce (Site of the Day; nominasi GSAP Site of the Year 2025) — huruf meregang, patah, dan bergabung kembali saat scroll, "semua digerakkan timeline dan disetel agar animasi tidak pernah menghalangi pembacaan."
  - *Ritme grid:* Uncommon Studio — grid yang "pecah tepat di momen yang tepat", transisi antar-bagian terasa seperti gerakan kamera, dan disiplin performa membuat halaman yang sarat art direction tetap gesit; thumbnail proyek masuk dengan **staggered timing** (jeda berurutan) yang menciptakan ritme.

### (b) Interaksi yang layak diadaptasi ke PRATA FAKTA

1. **Navigasi layar penuh dari hover logo** (Unseen Studio): hover pada logo memicu navigasi layar penuh berisi pratinjau proyek beranimasi. → Adaptasi PRATA FAKTA: bukan meniru layar penuh, melainkan **pratinjau di Command Palette (`Ctrl+K`)**: saat mengetik, hasil menampilkan pratinjau kartu artikel (judul + skor fakta + thumbnail) yang masuk dengan stagger — memakai infrastruktur yang sudah ada.
2. **Scroll-driven storytelling** (Apple AirPods Pro, Norwegian Salvation Army): film/produk berputar mengikuti posisi scroll, bukan timer. → Adaptasi: **linimasa (`/timeline`) dan graf (`/graf`)** — node linimasa dan simpul graf muncul/bergerak mengikuti scroll; untuk `/observatorium`, angka statistik menghitung naik (count-up) saat masuk viewport. Ini satu-satunya tempat di PRATA FAKTA di mana "scroll sebagai narasi" masuk akal, karena halaman-halaman itu memang bercerita kronologis.
3. **Menu dengan highlight yang meluncur** (pola yang direkam regards.design pada situs nyata: pill abu-abu meluncur mengikuti item di bawah kursor; panel putih yang tetap terbuka sambil kolom-kolomnya meluncur keluar-masuk): → Adaptasi: **BottomNav 6 item** — indikator aktif berupa pill yang meluncur (transform `translateX`) antar item, bukan sekadar ganti warna. Murah, dan langsung terasa "premium".
4. **Drag-to-explore** (Wanted For Nothing, Site of the Day): navigasi portofolio dengan seret. → Adaptasi: **galeri/karosel thumbnail di beranda dan `/perpustakaan`** — geser horizontal dengan momentum, bukan tombol panah saja. Prioritas rendah; hanya bila karosel memang dipakai.
5. **Efek hover pita (ribbon) pada menu + efek layar saat klik** (Wanted For Nothing): → **Tidak direkomendasikan** untuk PRATA FAKTA — efek layar saat klik adalah dekorasi yang mengganggu pembaca berita; ambil prinsipnya saja (umpan balik klik yang jelas), bukan efeknya.

### (c) Animasi yang layak diadaptasi (pola konkret)

| Pola | Rumusan konkret | Catatan |
|---|---|---|
| **Reveal on scroll (fade-up)** | Kartu artikel: `opacity 0 → 1`, `translateY(24px) → 0`, durasi ±300–400 ms, easing ease-out; dipicu saat masuk viewport (IntersectionObserver / `whileInView` di Motion) | Pola paling universal di semua pemenang; aman untuk berita |
| **Stagger** | Grid kartu: tiap kartu tertunda +40–60 ms dari sebelumnya (maks. ~6 kartu pertama; sisanya tanpa delay agar tidak terasa lambat) | Uncommon Studio; memberi ritme tanpa menunda konten |
| **Line-by-line headline reveal** | Judul artikel / judul seksi dipecah per baris (bukan per karakter — per karakter cepat terasa kuno), tiap baris naik dengan clip/overflow tersembunyi | Pola yang direkam regards.design; untuk judul besar di beranda & halaman artikel saja |
| **Page transition 200 ms, content-first** | Konten lama memudar 150 ms → konten baru masuk 200 ms; tanpa layar penutup penuh | Sudah menjadi arah PRATA ENGLISH (transisi 200 ms); selaraskan di PRATA FAKTA agar konsisten antar-produk |
| **Image reveal (clip/scale)** | Thumbnail kartu: gambar masuk dengan `clip-path: inset()` atau scale 1.06 → 1 di dalam wadah `overflow: hidden` | Efek paling "editorial" untuk situs berita; murah (transform saja) |
| **Scroll-linked, bukan scroll-jacking** | Animasi terikat posisi scroll (scrub) hanya di `/timeline` & `/graf`; **jangan** smooth-scroll paksa (Lenis dkk.) di halaman artikel — pembaca berita harus mengontrol scroll-nya sendiri | Peringatan eksplisit dari aicssanimations: "Award sites optimize for wow, not for product UI. Heavy WebGL intros and scroll-jacking that win awards can hurt load time and accessibility on a real product, so borrow the idea, not the weight." |
| **Yang TIDAK diadaptasi** | Intro WebGL layar penuh, adegan 3D sebagai navigasi (Igloo Inc. mentransfer 14,4 MB dalam 8 detik pertama dan semua teksnya di dalam canvas — tidak ada teks HTML untuk mesin pencari/pembaca layar), teks di dalam canvas | Bertentangan langsung dengan kebutuhan SEO & aksesibilitas PRATA FAKTA |

### (d) Komponen relevan

- Kartu artikel (reveal + stagger + image reveal).
- BottomNav (indikator pill meluncur).
- Command Palette (pratinjau hasil dengan stagger).
- Linimasa `/timeline` (scroll-linked reveal per node).
- Graf `/graf` (simpul muncul berurutan mengikuti fokus).
- Observatorium `/observatorium` (count-up angka saat masuk viewport).
- Modal artikel / dropdown filter (transisi 150–200 ms, scale 0.98 → 1 + fade).

### (e) Di mana dipakai di PRATA FAKTA

Lihat (d). Urutan penerapan yang masuk akal: **kartu artikel & BottomNav dulu** (dampak paling terasa, biaya paling kecil), lalu Command Palette, lalu `/timeline` & `/observatorium`. Halaman artikel itu sendiri **paling sedikit animasinya**: judul + gambar utama masuk sekali, isi artikel statis — pembaca tidak boleh menunggu animasi untuk membaca.

### (f) Dampak performa

- **Aman (compositor-only):** `opacity` dan `transform` (`translate`, `scale`) — tidak memicu layout/paint ulang; inilah yang membuat situs pemenang tetap 60fps. Semua pola di (c) di atas termasuk kategori ini.
- **Berbahaya:** animasi `width/height/top/left`, `filter: blur()` pada area besar, dan WebGL/Three.js sebagai latar (bobot MB, satu konteks WebGL per halaman, tekstur sebaiknya <2048px). Igloo Inc. (14,4 MB/8 detik) adalah contoh batas yang **tidak boleh** dilewati.
- **Aturan anggaran yang disarankan untuk PRATA FAKTA:** total animasi di atas-the-fold beranda <150 KB JS tambahan (Motion sudah terinstal — tidak ada tambahan dependensi untuk pola dasar); tidak ada aset animasi yang memblokir First Contentful Paint; animasi scroll memakai IntersectionObserver, bukan listener scroll yang berjalan tiap frame.
- **Catatan Next.js 16:** `motion` v14 sudah terinstal — pola reveal/stagger/hover/transisi di atas semuanya bisa dikerjakan dengan `motion` tanpa menambah GSAP/Three.js. Menambah GSAP hanya beralasan bila nanti dibutuhkan ScrollTrigger scrub yang kompleks di `/timeline`.

### (g) Adaptasi mobile + reduced motion

- **Mobile:** hilangkan hover (tidak ada kursor); ganti dengan umpan balik sentuh (scale 0.98 saat ditekan, ±120 ms). Stagger dipersingkat (delay 30 ms, maks. 4 kartu) karena layar kecil menampilkan sedikit kartu. Nonaktifkan parallax sepenuhnya di layar sentuh. BottomNav pill tetap jalan — itu transform, murah di HP.
- **Reduced motion (`prefers-reduced-motion: reduce`):** ini **wajib**, dan ada preseden yang sudah diverifikasi: halaman Apple AirPods Pro menampilkan gambar diam dan bagian scroll "begitu saja muncul" saat reduced motion aktif (colorlib, 2026). Untuk PRATA FAKTA: semua reveal/stagger/parallax/count-up dimatikan → konten langsung tampil penuh (opacity 1, tanpa transform); transisi halaman menjadi potong langsung (0 ms) atau fade 100 ms; indikator pill BottomNav berpindah tanpa luncuran. Implementasi: satu media query global + satu flag di wrapper Motion (`useReducedMotion`), bukan per komponen satu-satu.
- **Aksesibilitas tambahan:** animasi tidak boleh memindahkan fokus keyboard; konten yang di-reveal harus sudah ada di DOM (bukan dimasukkan belakangan oleh JS) agar pembaca layar tetap menemukannya.

---

## 2. Codrops (Tympanus) — tympanus.net/codrops

**URL yang dibaca:** `https://tympanus.net/codrops/`
**Yang terbaca langsung:** 16 baris — judul "Codrops | Fueling web creativity since 2009" dan 4 bagian: **Creative Hub** ("showcase Codrops originals dan demo pilihan dari web kreatif"), **Webzibition** ("pameran pilihan 2.000+ situs menonjol"), **Case Studies** ("ide, desain, dan craft di balik pengalaman web paling inspiratif"), **Learn with Tutorials** ("tutorial langkah demi langkah").
**Yang tidak terbaca:** daftar demo individual — halaman utama hanya memuat struktur bagian. Detail pola di bawah didukung artikel komparasi regards.design (10 Nov 2026, membaca halaman Codrops sendiri) dan dokumentasi pola umum yang dirujuk forum/skill terkait.

### (a) Apa yang membuat desainnya khas

- **Bukan situs produk, melainkan laboratorium + sekolah.** Sejak 2009, Codrops menerbitkan **demo kode yang bisa dibuka langsung, berjalan pada kecepatan nyata, lengkap dengan kode di GitHub berlisensi MIT dan sering kali tutorial** — semuanya gratis tanpa akun (regards.design, skor: Take away 5/5, Free 5/5).
- **Creative Hub adalah inti yang sekarang:** demo orisinal Codrops + demo pilihan dari web kreatif — eksperimen **WebGL, GSAP, dan scroll** di antaranya — diberi tag `hover`, `scroll`, `cursor`, `menu`, dan `page transition` (regards.design). Tag-tag inilah taksonomi pola yang bisa dipakai PRATA FAKTA untuk memilih: cari tag `hover` bila butuh hover kartu, tag `menu` bila butuh navigasi, tag `page transition` bila butuh transisi.
- **Berbeda dari Awwwards:** Awwwards menunjukkan situs utuh yang sudah jadi; Codrops menunjukkan **satu efek yang terisolasi beserta kodenya**. Awwwards menjawab "seperti apa situs terbaik bergerak", Codrops menjawab "bagaimana cara membuat gerakan itu". Karena itu keduanya komplementer, bukan pengganti.
- **Keterbatasan yang dicatat regards.design:** demo, bukan situs yang sudah dikirim ke produksi ("demos rather than shipped sites"); tidak ada total contoh yang dinyatakan; tidak ada MCP/API; dan rubrik roundup gerakan desainer **berhenti pada Maret (2026)** — jadi jangan mengharapkan arsip yang terus diperbarui untuk tren terbaru.
- **Warisan tertua yang masih relevan:** tutorial efek tipografi CSS3 (sejak 2011) — efek headline besar dengan CSS3/jQuery; prinsipnya (tipografi sebagai elemen gerak) tetap hidup di demo-demo baru.

### (b) Interaksi yang layak diadaptasi ke PRATA FAKTA

1. **Hover kartu yang "menjawab"** (tag `hover`): gambar di dalam kartu membesar pelan (scale 1.04–1.06) di dalam wadah terpotong, judul bergeser naik beberapa piksel, dan garis aksen tumbuh dari tengah. → **Kartu artikel & kartu klaim (`/klaim`)** — ini adaptasi hover paling aman untuk situs berita.
2. **Menu dengan panel yang bertukar isi lewat blur ringan** (pola yang direkam pada situs nyata dan sejalan dengan tag `menu` Codrops): panel dropdown yang isinya berganti dengan blur + geser kecil saat kursor berpindah antar item. → **Dropdown filter di `/cari` dan menu admin** — tapi batasi blur hanya pada panel kecil (blur pada area besar mahal).
3. **Efek kursor kustom** (tag `cursor`): lingkaran/dot yang mengikuti kursor dengan jeda (lerp). → **Tidak direkomendasikan** untuk PRATA FAKTA: mengganggu presisi klik pada situs yang padat teks; bila tetap ingin "jejak kursor", batasi ke hero beranda desktop saja dan nonaktifkan total di sentuh & reduced motion.
4. **Page transition** (tag `page transition`): transisi antar-halaman sebagai satu gerakan terarah (konten lama keluar ke satu arah, konten baru masuk dari arah berlawanan). → **Transisi antar-halaman artikel** (artikel → artikel terkait): geser horizontal halus 200 ms + fade; memberi rasa "membalik halaman" tanpa layar penutup.
5. **Eksperimen WebGL / shader sebagai material** (tag WebGL): latar shader, medan partikel, objek 3D yang merespons pointer. → **Hanya sebagai latar hero beranda yang sangat ringan** (mis. gradasi + noise SVG, bukan WebGL sungguhan) — atau **tidak sama sekali**. Prinsip dari skill scroll-and-webgl yang dirujuk dalam riset: "If it can be done with CSS gradients and a noise SVG, do that." Untuk situs berita, gradasi + noise SVG sudah cukup memberi kedalaman.

### (c) Animasi yang layak diadaptasi (pola konkret)

| Pola | Rumusan konkret | Sumber pola |
|---|---|---|
| **Hover lift + image zoom** | Kartu: `translateY(-2px)` + bayangan melembut; gambar `scale(1.05)`, 250 ms, `cubic-bezier(0.22, 1, 0.36, 1)` | Tag `hover` Codrops; pola card hover Clerk/Stripe yang direkam regards.design |
| **Underline grow** | Tautan navigasi/teks: garis bawah tumbuh dari tengah (atau kiri) saat hover, 200 ms | Pola hover klasik Codrops; cocok untuk tautan di dalam artikel & footer |
| **Text roll / swap** | Label tombol/menu bertukar teks dengan geser vertikal (teks lama naik keluar, teks baru naik masuk) | Pola "text roll" yang dinamai di panduan regards.design; cocok untuk tombol aksi kecil (mis. "Simpan" → "Tersimpan") |
| **Split-text reveal per baris** | Judul dipecah per **baris/kata**, bukan per karakter (per karakter "memberi nuansa typewriter yang cepat ketinggalan zaman" — skill scroll-and-webgl) | Prinsip yang sama dengan Awwwards §1(c); Codrops punya banyak demo split-text |
| **Scroll-driven CSS murni** | Reveal memakai CSS scroll-driven animations (`animation-timeline: view()`, `animation-range: entry 0% entry 40%`) — **tanpa JavaScript**, berjalan di compositor, dan menghormati reduced motion dengan satu media query | Skill scroll-and-webgl; pola termurah untuk reveal kartu; cocok bila suatu saat ingin mengurangi ketergantungan pada JS |
| **Pinned scene** | Bagian yang menempel (sticky) sementara konten bergulir melewatinya | Hanya untuk `/timeline` (satu peristiwa menempel sementara detailnya bergulir) — jangan di halaman artikel |
| **Skeleton / shimmer loading** | Placeholder kartu berkedip halus (gradasi bergerak) saat data dimuat | Pola loading dari Awwwards Elements (kategori `loading`); untuk beranda & `/cari` saat fetch lambat |
| **Yang TIDAK diadaptasi** | Demo WebGL berat, shader kustom, distorsi gambar saat hover (WebGL image distortion) pada kartu artikel — biaya GPU & kompleksitas tidak sebanding untuk daftar berita | Keputusan biaya-manfaat, bukan larangan teknis |

### (d) Komponen relevan

- Kartu artikel & kartu klaim (hover lift + image zoom + underline grow).
- Tombol aksi (text roll "Simpan → Tersimpan"; tekan scale 0.97).
- Dropdown filter `/cari` & `/perpustakaan` (panel bertukar isi + blur ringan).
- Modal (masuk dengan scale 0.96 → 1 + fade 180 ms; keluar sebaliknya).
- Loading state (skeleton shimmer) & empty state (ilustrasi statis + satu gerakan loop halus, mis. denyut opacity — bukan animasi berputar yang mengganggu).
- Judul seksi beranda (split-text per baris).

### (e) Di mana dipakai di PRATA FAKTA

- **Prioritas 1:** kartu artikel beranda + `/cari` (hover lift + image zoom).
- **Prioritas 2:** dropdown & modal (transisi 180 ms).
- **Prioritas 3:** judul seksi + `/timeline` (split-text & pinned scene).
- **Jangan dipakai:** efek kursor kustom di seluruh situs; WebGL di halaman artikel/klaim.

### (f) Dampak performa

- **CSS murni adalah yang termurah:** hover lift, underline grow, dan text roll hanya memakai `transform`/`opacity` — nol JS saat berjalan, dan bisa ditulis sebagai CSS biasa tanpa menambah dependensi. Codrops sendiri membuktikan pola-pola ini bisa hidup dengan CSS + sedikit JS.
- **CSS scroll-driven animations** (bila dipakai): nol JS, berjalan di compositor — lebih murah daripada IntersectionObserver + JS untuk reveal sederhana. Kekurangan: dukungan browser lebih baru; sediakan fallback (konten langsung tampil) bila `animation-timeline` tidak didukung.
- **Biaya menengah:** GSAP + ScrollTrigger (yang dipakai banyak demo Codrops) — puluhan KB JS; hanya beralasan bila `/timeline` butuh scrub yang kompleks. Karena `motion` sudah terinstal, **mulailah dari Motion**; GSAP adalah eskalasi, bukan titik awal.
- **Biaya tinggi (hindari):** WebGL per kartu, shader per hover, dan `filter: blur()` pada panel besar. Satu konteks WebGL per halaman; tekstur <2048px bila suatu saat dipakai.
- **Lisensi — kabar baik:** kode demo Codrops di GitHub berlisensi **MIT** (regards.design). Artinya pola boleh dipelajari dan ditulis ulang; tetap **jangan menyalin aset visual** (gambar, logo, tipografi khas demo) dan tetap tulis implementasi sendiri yang sesuai sistem desain PRATA FAKTA.

### (g) Adaptasi mobile + reduced motion

- **Mobile:** semua hover diganti `:active` (tekan) — scale 0.98, tanpa lift (lift tanpa kursor terasa aneh). Underline grow tidak relevan di sentuh; pastikan target sentuh ≥44px. Pinned scene di `/timeline` diuji di lebar 360px: bila menempel membuat konten terjepit, matikan pin di <768px.
- **Reduced motion:** matikan shimmer (ganti skeleton statis), matikan text roll (ganti teks langsung), matikan split-text (judul langsung tampil). Satu media query `@media (prefers-reduced-motion: reduce)` yang mematikan semua `animation`/`transition` non-esensial adalah pola paling sederhana dan paling aman — ditambah flag `useReducedMotion` dari Motion untuk yang digerakkan JS.
- **Aksesibilitas:** pastikan hover tidak menjadi satu-satunya cara menemukan informasi (mis. skor fakta harus selalu terlihat, bukan hanya muncul saat hover).

---

## 3. Rive — rive.app

**URL yang dibaca:** `https://rive.app/`
**Yang terbaca langsung:** 32 baris — halaman utama versi terbaru memposisikan Rive sebagai "agent-native 2D and 3D engine for games, apps, and UI" dan secara eksplisit menjawab "Rive or HTML?": *"Think of Rive as a game engine, but not just for games: it pays off when there's a lot of motion and interactivity, especially if it ships on more than one platform… For many pages, plain HTML is still the right call."* Halaman itu juga menyatakan kapan Rive **tepat** (banyak yang bergerak sekaligus; harus berjalan mulus di semua platform; tidak mau menulis ulang per platform; interaktivitas state machine) dan kapan **HTML biasa lebih tepat** (kebanyakan teks/dokumen/formulir; harus ditemukan lewat pencarian seperti artikel dan dokumen; efek web sederhana yang bisa ditulis beberapa baris CSS).
**Yang tidak terbaca:** editor interaktif, galeri komunitas, dan halaman harga/dokumentasi — halaman utama hanya memuat pernyataan posisi di atas. Angka ukuran & runtime di bawah berasal dari sumber sekunder yang saling menguatkan (hackdesign.org, motioncube.agency, learnwithhasan.com, uiguides.com, carmenansio.com, digitalbydefault.ai — semuanya 2026).

### (a) Apa yang membuat desainnya khas

- **Animasi sebagai program interaktif, bukan video.** Berbeda dari Lottie (playback timeline) atau GIF/video (frame), file Rive (`.riv`) **berjalan real-time dan merespons input**: tombol merespons hover & tekan, spinner berubah mengikuti progres, ikon beranimasi berbeda saat sukses vs gagal (hackdesign.org).
- **State machine adalah inti produk.** Di dalam satu file `.riv`, desainer mendefinisikan state (idle, hover, pressed, loading, success, error), transisi antar-state, dan input yang menggerakkannya (boolean, number, trigger) — **tanpa kode** untuk logika interaksinya (uiguides.com; motioncube.agency). Di runtime, kode hanya membalik input (`Hovered`, `Clicked`) atau mengirim nilai (mis. persentase loading), dan runtime memadukan (blend) antar-state secara otomatis (learnwithhasan.com).
- **Satu file, semua platform.** Runtime resmi open-source untuk web (JS/React), iOS, Android, Flutter, React Native, Unity/Unreal — satu file `.riv` yang sama, digambar oleh runtime yang sama (rive.app; motioncube.agency). Editornya sendiri berjalan di browser (rive.app) dengan mode Design & Animate, Graph Editor, Timeline, bones/constraints, dan Revision History; beberapa orang bisa mengedit bersamaan.
- **Kejujuran posisi yang langka:** halaman utama Rive sendiri mengatakan sebagian besar halaman web sebaiknya tetap HTML biasa — Rive hanya berbaloi bila gerak & interaktivitasnya banyak dan lintas platform. Untuk PRATA FAKTA (situs berita web-only, kebanyakan teks), pernyataan ini adalah **peringatan yang harus didengar**, bukan ajakan.

### (b) Interaksi yang layak diadaptasi ke PRATA FAKTA

1. **Ikon status verifikasi beranimasi** — kandidat terkuat. Ikon "terverifikasi / perlu cek / menyesatkan" di kartu artikel & `/klaim`: satu file `.riv` berisi state idle → success (centang menggambar) / warning / error, digerakkan oleh nilai skor fakta dari kode. Ini persis kasus yang dirancang untuk state machine: satu aset, banyak state, digerakkan data.
2. **Ikon aksi interaktif**: bookmark (garis → terisi saat disimpan), lonceng notifikasi (bergetar pelan saat ada yang baru), ikon cari (kaca pembesar → X saat Command Palette terbuka), menu → X di BottomNav. Masing-masing adalah state machine kecil (default/hover/active).
3. **Loading & empty state**: spinner yang berubah mengikuti progres nyata (input number = persentase), dan ilustrasi empty state yang merespons (mis. kaca pembesar yang "mencari" saat `/cari` tanpa hasil). Ini lebih bermakna daripada spinner CSS generik karena **terikat data**.
4. **Avatar/tutor**: PRATA ENGLISH sudah memakai `@rive-app/react-canvas` untuk TutorAvatar (lazy, placeholder CSS jujur karena aset `.riv` belum ada — BLOCKED). Pengalaman itu relevan: pola integrasi yang sama (lazy load + placeholder jujur) berlaku bila PRATA FAKTA suatu saat memakai Rive.
5. **Yang TIDAK layak:** ilustrasi hero beranimasi besar, karakter/maskot, dan adegan interaktif — situs berita tidak membutuhkannya, dan biayanya (runtime + pembuatan aset) tidak sebanding.

### (c) Animasi yang layak diadaptasi (pola konkret)

| Pola | Rumusan konkret | State machine |
|---|---|---|
| **Centang verifikasi menggambar** | Ikon status: garis centang tergambar (stroke-dashoffset) saat state → success; silang/warning untuk state lain | Input: `status` (string/number dari skor fakta) → state `idle / success / warning / error` |
| **Bookmark mengisi** | Ikon bookmark: outline → fill dengan sedikit "pop" (scale 1 → 1.15 → 1) saat trigger `Clicked` | Input: trigger `toggle`, boolean `saved` |
| **Lonceng bergetar** | Lonceng miring ±10° dua kali saat ada notifikasi baru, lalu kembali idle | Input: trigger `notify` |
| **Cari ↔ tutup** | Kaca pembesar berputar/morf menjadi X saat Command Palette dibuka, kembali saat ditutup | Input: boolean `open` |
| **Spinner berbasis progres** | Busur berputar yang panjang busurnya = persentase pemuatan nyata | Input: number `progress` (0–100) |
| **Empty-state mikro** | Ilustrasi kecil (kaca pembesar / dokumen kosong) dengan gerakan loop halus 2–3 detik | State `idle` loop; berhenti total saat reduced motion |

Semua pola di atas **bisa juga dibuat dengan SVG + CSS/Motion** — Rive hanya menjadi pilihan bila (i) ada beberapa ikon sekaligus (runtime sekali bayar, aset berbagi), atau (ii) transisi antar-state cukup kompleks sehingga kode JS-nya akan berantakan.

### (d) Komponen relevan

- Ikon status verifikasi (kartu artikel, `/klaim`, halaman artikel).
- Ikon aksi: bookmark, notifikasi, cari, menu (BottomNav & header).
- Loading state (spinner progres) & empty state (`/cari` tanpa hasil, `/perpustakaan` kosong).
- (Sekunder) indikator progres baca artikel — bisa berupa busur Rive, tapi CSS jauh lebih murah; **jangan pakai Rive untuk ini**.

### (e) Di mana dipakai di PRATA FAKTA

- **Satu-satunya tempat yang beralasan kuat:** ikon status verifikasi + 2–3 ikon aksi (bookmark, notifikasi, cari) — semuanya kecil, berulang di banyak halaman, dan digerakkan oleh state aplikasi.
- **Tempat kedua (opsional):** empty state `/cari` & `/perpustakaan`.
- **Jangan dipakai:** hero, halaman artikel, `/graf` (graf sudah digambar dari data — SVG/Canvas lebih tepat), `/timeline`.

### (f) Dampak performa — penilaian jujur

| Komponen | Perkiraan ukuran (sumber sekunder, **bukan pengukuran sendiri**) |
|---|---|
| Satu file `.riv` ikon sederhana | **2–10 KB** (hackdesign.org); ikon antarmuka umumnya **1–200 KB**, "biasanya lebih kecil dari Lottie setara" (motioncube.agency) |
| Satu file `.riv` kompleks/interaktif | **10–50 KB** (uiguides.com; digitalbydefault.ai menyebut 15–50 KB vs Lottie 500 KB+) |
| Runtime web `@rive-app/canvas` | **~50 KB gzip** (carmenansio.com, April 2026) |
| Runtime Lottie (pembanding) | `lottie-web` ~60–100 KB gzip tergantung renderer; dotLottie ~40 KB gzip (carmenansio.com) |
| File Lottie setara (pembanding) | Sering **50–200 KB** JSON (hackdesign.org) |

**Analisis biaya-manfaat untuk PRATA FAKTA:**

- **Satu ikon saja = tidak berbaloi.** Runtime ~50 KB gzip untuk satu ikon yang bisa dibuat dengan SVG + CSS seberat <2 KB adalah pemborosan. Motioncube.agency menyatakan ini eksplisit: runtime adalah "one-time download that is worth it when you have several interactive assets but is overkill for a single looping animation."
- **Empat–enam ikon + spinner + empty state = mulai berbaloi**, karena satu runtime melayani semua aset, tiap aset hanya 2–10 KB, dan satu file `.riv` menggantikan beberapa klip terpisah (semua state hidup dalam satu file).
- **Biaya yang sering dilupakan:** (1) **pembuatan aset** — Rive butuh desainer yang bekerja di editor Rive; tidak bisa diekspor dari Figma/After Effects (carmenansio.com: "If your motion designer doesn't work in Rive, this option isn't available to you"); (2) **canvas, bukan DOM** — ikon Rive dirender di `<canvas>`, jadi tidak ada teks/ARIA bawaan; wajib diberi `role="img"` + `aria-label` dan alternatif statis; (3) **runtime WASM/JS** yang harus dimuat sebelum ikon pertama tampil — mitigasi: lazy-load runtime hanya saat ikon pertama masuk viewport, dan tampilkan placeholder SVG statis selama memuat (pola yang sama dengan TutorAvatar PRATA ENGLISH).
- **Keputusan yang direkomendasikan:** **TUNDA Rive sampai ada ≥4 ikon interaktif yang benar-benar dibutuhkan.** Tahap sekarang: buat ikon-ikon itu dulu sebagai **SVG + Motion** (biaya ~0 tambahan, karena Motion sudah terinstal). Bila nanti jumlah ikon interaktif bertambah dan transisi state-nya terasa rumit di kode, migrasi ke Rive adalah langkah yang sudah dipetakan — bukan pekerjaan yang dibuang.
- **Harga:** free tier mencakup file & ekspor tanpa batas; paket berbayar $14/bulan menambah fitur tim, version history, dan penyimpanan aset (uiguides.com, Mar 2026). Untuk kebutuhan PRATA FAKTA, free tier cukup; jangan berlangganan tanpa kebutuhan tim.

### (g) Adaptasi mobile + reduced motion

- **Mobile:** `.riv` adalah vektor — tajam di segala ukuran layar dan murah di HP (render real-time 60fps di HP kelas bawah menurut digitalbydefault.ai). Canvas harus diberi ukuran eksplisit & `devicePixelRatio` yang benar agar tidak blur di layar retina. Sentuh: state `hover` tidak ada di sentuh — pastikan state machine punya jalur `pressed` yang bekerja tanpa hover.
- **Reduced motion:** Rive **tidak otomatis** menghormati `prefers-reduced-motion` — runtime harus diberitahu dari kode: saat reduced motion aktif, jangan mainkan animasi; tampilkan frame statis state akhirnya (mis. centang sudah tergambar penuh) atau ganti canvas dengan SVG statis. Ini wajib diimplementasikan di wrapper, bukan diasumsikan.
- **Aksesibilitas:** semua ikon Rive wajib punya label yang bisa dibaca pembaca layar (ikon status verifikasi adalah informasi, bukan dekorasi — menyembunyikannya dari pembaca layar adalah bug).

### Penilaian khusus: apakah state machine + ikon animasi ringan layak?

**Layak, dengan syarat — skor: 7/10 untuk kasus PRATA FAKTA.**

- **Yang layak:** state machine untuk ikon status verifikasi (satu aset, state digerakkan skor fakta) dan 2–3 ikon aksi. Perkiraan ukuran aset: **2–10 KB per ikon sederhana, 10–50 KB untuk yang kompleks**; total paket ikon (5 aset) diperkirakan **~15–40 KB + runtime ~50 KB gzip**.
- **Yang belum layak sekarang:** mengadopsi Rive hari ini, karena (1) Motion sudah terinstal dan belum dipakai — semua ikon di atas bisa dibuat dulu dengan SVG + Motion tanpa dependensi baru; (2) belum ada desainer Rive / aset `.riv` (persis seperti status BLOCKED TutorAvatar di PRATA ENGLISH); (3) satu-dua ikon tidak membenarkan runtime 50 KB.
- **Jalur yang disarankan:** Fase 1 — SVG + Motion (sekarang). Fase 2 — bila ikon interaktif mencapai ≥4 dan ada yang membuat aset `.riv`, adopsi `@rive-app/react-canvas` (paket yang sama dengan PRATA ENGLISH, jadi pengetahuan & pola lazy-load bisa dipakai ulang) dengan lazy-load + placeholder statis + penghormatan reduced motion.

---

## Matriks perbandingan ketiga situs

| Dimensi | Awwwards (Animation) | Codrops | Rive |
|---|---|---|---|
| **Sifat** | Kurasi + penilaian situs pemenang | Lab demo + tutorial kode | Tool + runtime animasi vektor interaktif |
| **Yang diberikan** | Inspirasi & standar kualitas (Site of the Day, Developer Award); Awwwards Elements = klip satu interaksi | Demo live + kode MIT + tutorial; tag hover/scroll/cursor/menu/page transition | Editor browser + file `.riv` + runtime lintas platform + state machine |
| **Kekuatan utama** | Menunjukkan apa yang "menang" dan mengapa (directed motion, restraint, 60fps) | Bisa langsung dipelajari & ditulis ulang (kode tersedia) | Satu aset, banyak state, digerakkan data; file sangat kecil |
| **Kelemahan utama** | Hanya inspirasi — tidak ada kode; situs pemenang mengorbankan beban demi "wow" | Demo, bukan situs produksi; roundup berhenti Mar 2026; tanpa MCP/API | Butuh editor Rive & runtime ~50 KB gzip; canvas (bukan DOM); tidak otomatis hormat reduced motion |
| **Biaya adopsi** | Nol (hanya referensi) | Nol–rendah (CSS/JS, MIT) | Menengah (runtime + pembuatan aset + wrapper a11y) |
| **Cocok untuk PRATA FAKTA** | Standar & pola: reveal, stagger, transisi, navigasi | Pola konkret: hover kartu, transisi, loading, split-text | Ikon status/aksi ber-state (nanti, ≥4 ikon) |
| **Tidak cocok untuk** | Intro WebGL berat, scroll-jacking, teks dalam canvas | Efek kursor kustom, WebGL berat | Hero, artikel, graf, teks/SEO |
| **Aksesibilitas bawaan** | Buruk pada pemenang ekstrem (teks dalam canvas); baik pada pola yang menahan diri | Netral — tergantung implementasi ulang | Perlu wrapper (ARIA + reduced motion manual) |
| **Gratis?** | Melihat gratis; Elements gratis tanpa akun | Gratis, tanpa akun, kode MIT | Free tier cukup (file & ekspor tanpa batas) |
| **Skor kegunaan untuk PRATA FAKTA** | 9/10 (sebagai kompas) | 9/10 (sebagai buku resep) | 7/10 (sebagai alat, nanti) |

---

## Adaptasi prioritas tertinggi untuk PRATA FAKTA

### Prioritas 1 — Sistem reveal + stagger kartu artikel (Awwwards + Codrops)

**Apa:** kartu artikel beranda & `/cari`: fade-up saat masuk viewport + stagger 40–60 ms (maks. 6 kartu) + gambar zoom 1.05 di dalam wadah terpotong saat hover.
**Dengan apa:** `motion` yang sudah terinstal (0 dependensi baru). **Bukan** GSAP, **bukan** Rive.
**Di mana:** beranda, `/cari`, `/perpustakaan`, `/klaim`.
**Biaya:** transform/opacity saja — compositor-only, 60fps; tanpa tambahan bobot aset.
**Reduced motion:** semua dimatikan → konten langsung tampil.

### Prioritas 2 — Indikator pill meluncur di BottomNav + transisi halaman 200 ms (Awwwards)

**Apa:** pill aktif BottomNav meluncur antar item (`translateX`, spring ringan Motion); transisi antar-halaman 200 ms content-first (fade + geser kecil), tanpa layar penutup.
**Dengan apa:** `motion` (layout animation / `layoutId` untuk pill).
**Biaya:** satu transform; tidak ada aset baru.
**Reduced motion:** pill berpindah langsung; transisi menjadi potong langsung.

### Prioritas 3 — Hover kartu & mikro-interaksi tombol/modal/dropdown (Codrops)

**Apa:** hover lift kartu (−2px + bayangan), underline grow pada tautan, text roll pada tombol aksi kecil ("Simpan → Tersimpan"), modal scale 0.96 → 1 + fade 180 ms, dropdown bertukar isi dengan blur ringan, skeleton shimmer saat memuat.
**Dengan apa:** CSS murni (hover/underline/text roll) + Motion (modal/dropdown).
**Biaya:** hampir nol (CSS); shimmer hanya transform gradasi.
**Reduced motion:** shimmer → skeleton statis; text roll → ganti teks langsung.

### Prioritas 4 — Scroll-linked secukupnya di `/timeline` & `/observatorium` (Awwwards)

**Apa:** node linimasa muncul mengikuti scroll; angka observatorium count-up saat masuk viewport; (opsional, nanti) satu pinned scene di `/timeline`.
**Dengan apa:** Motion `whileInView` + count-up; **tanpa** smooth-scroll paksa dan **tanpa** WebGL.
**Batasan:** jangan sentuh halaman artikel — pembaca harus mengontrol scroll-nya sendiri.

### Prioritas 5 — Ikon status verifikasi & aksi sebagai SVG + Motion dulu, Rive nanti (Rive)

**Apa:** ikon centang/warning/error, bookmark, notifikasi, cari — dibuat sebagai SVG + Motion sekarang (biaya ~0, karena Motion sudah ada). Bila jumlah ikon interaktif mencapai ≥4 dan ada yang membuat aset `.riv`, migrasi ke `@rive-app/react-canvas` (paket yang sama dengan PRATA ENGLISH) dengan lazy-load, placeholder SVG statis, dan penghormatan `prefers-reduced-motion` manual.
**Perkiraan ukuran bila bermigrasi:** 2–10 KB per ikon `.riv` sederhana (total ~15–40 KB untuk 5 aset) + runtime ~50 KB gzip.
**Yang tidak dilakukan:** tidak ada adopsi Rive sekarang; tidak ada aset `.riv` yang dibuat dalam riset ini.

---

## Aturan global yang mengikat semua adaptasi

1. **Transform/opacity saja** untuk semua animasi UI; jangan animasikan `width/height/top/left`.
2. **Satu saklar reduced motion** (`prefers-reduced-motion: reduce` + `useReducedMotion`) yang mematikan semua gerakan non-esensial — preseden Apple AirPods Pro (gambar diam saat reduced motion) adalah standar minimum.
3. **Teks tetap HTML** — tidak ada teks di dalam canvas/WebGL (SEO & pembaca layar).
4. **Tidak ada animasi yang menunda isi** — artikel harus bisa dibaca sebelum animasi selesai; animasi di atas-the-fold tidak memblokir First Contentful Paint.
5. **Mobile dulu dalam pengujian:** semua pola diuji di 360px & sentuh sebelum dianggap selesai; hover selalu punya padanan `:active`.
6. **Jangan salin** aset/logo/layout dari situs referensi — yang diadaptasi adalah pola & prinsip, ditulis ulang dalam sistem desain Swiss Editorial PRATA FAKTA.

---

## Sumber yang dibaca

Diakses 19 November 2026 (waktu baca teks: 13.47 UTC):

1. `https://www.awwwards.com/websites/animation/` — teks intro kategori (25 baris; grid kartu tidak terbaca oleh alat baca teks).
2. `https://tympanus.net/codrops/` — struktur 4 bagian: Creative Hub, Webzibition, Case Studies, Learn with Tutorials (16 baris).
3. `https://rive.app/` — pernyataan posisi "Rive or HTML?" (32 baris).
4. `https://www.regards.design/blog/best-website-animation-inspiration-sites` (14 Nov 2026) — komparasi 13 tempat inspirasi animasi, dibaca penuh 948 baris; sumber penilaian Codrops (26/40) & Awwwards Elements (24/40) dan pola hover/menu/scroll yang direkam dari situs nyata.
5. `https://www.aicssanimations.com/guides/best-motion-design-inspiration-sites` (1 Nov 2026) — Awwwards sebagai daftar bacaan teknik; peringatan "borrow the idea, not the weight".
6. `https://www.hontran.dev/blog/best-award-winning-websites-2026` — penilaian juri Awwwards: directed motion, By-Kin, Mat Voyce, Uncommon Studio.
7. `https://schoolofmotion.com/blog/websites-with-great-animation-2026` — 10 situs: Epic, Unseen Studio, Uncommon Studio, Apple.
8. `https://colorlib.com/wp/animation-websites/` — 24 situs; Lusion, Apple AirPods Pro (reduced motion → gambar diam), Igloo Inc. (14,4 MB/8 detik, teks dalam canvas).
9. `https://www.hackdesign.org/toolkit/rive/` — Rive: state machine, file 2–10 KB vs Lottie 50–200 KB.
10. `https://www.motioncube.agency/services/rive-animation/` — Rive vs Lottie vs CSS; `.riv` 1–200 KB; runtime overkill untuk satu animasi loop.
11. `https://learnwithhasan.com/js-libraries/rive/` — input runtime Rive (`Hovered`, `Clicked`, `Axis_X/Y`); kapan memakai Rive vs Framer Motion.
12. `https://www.uiguides.com/guides/how-to-use-rive` (30 Mar 2026) — `.riv` 10–50 KB; paket `@rive-app/react-canvas` / `@rive-app/canvas`; free tier & $14/bulan.
13. `https://digitalbydefault.ai/blog/rive-interactive-animation-review-2026` — Rive 10–50 KB vs Lottie 500 KB+; 60fps di HP murah.
14. `https://www.carmenansio.com/articles/animated-icon-libraries/` (1 Apr 2026) — runtime Rive ~50 KB gzip; Lottie 60–100 KB gzip; dotLottie ~40 KB gzip; Rive butuh tool Rive (tidak bisa dari Figma/After Effects).

## Batasan akhir (diulang agar tidak hilang)

- **Tidak ada demo animasi yang diamati secara interaktif** dalam riset ini — tidak ada hover yang dicoba, tidak ada scroll yang digulir, tidak ada file `.riv` yang diputar. Semua pola gerak di atas berasal dari deskripsi tertulis yang terverifikasi, dan semua angka ukuran Rive berasal dari sumber sekunder (bukan pengukuran sendiri). Verifikasi live (browser interaktif + pengukuran bundle nyata) tetap diperlukan sebelum implementasi Prioritas 5, dan uji perangkat fisik tetap diperlukan sebelum klaim mobile apa pun.
- Dokumen ini adalah riset; tidak ada kode PRATA FAKTA yang diubah.
