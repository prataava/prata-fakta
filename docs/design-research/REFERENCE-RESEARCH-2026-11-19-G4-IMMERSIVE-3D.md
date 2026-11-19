# Riset Referensi Desain — Grup 4: Imersif & 3D (Hatom, Spline, Lusion)

- **Tanggal riset:** 19 November 2026
- **Proyek:** PRATA FAKTA — platform berita & intelijen fakta (Next.js, live https://prata-fakta.vercel.app/)
- **Sistem desain saat ini:** Swiss Editorial (Inter + Source Serif 4, aksen crimson `#b91c1c`, terang/gelap), BottomNav kaca 6 item
- **Halaman PRATA FAKTA:** beranda, artikel, cari, graf pengetahuan (`/graf`), linimasa (`/timeline`), observatorium data (`/observatorium`), pelacak klaim (`/klaim`), perpustakaan (`/perpustakaan`), glosarium (`/glosarium`), admin `/admin`
- **Sifat dokumen ini:** riset + dokumentasi saja. Bukan perubahan kode. Tidak ada aset, logo, atau layout berhak cipta yang disalin dari situs-situs di bawah ini; yang diadopsi hanya pola interaksi dan prinsip desain, dirancang ulang dengan identitas PRATA FAKTA sendiri.
- **Metode:** pembacaan langsung konten halaman via `browser.open` pada URL yang ditugaskan, dilengkapi pencarian web spesifik untuk mengonfirmasi detail teknis yang tidak muncul dalam ekstraksi teks. Tidak ada browser live interaktif yang dipakai dalam riset ini — lihat §6 Batasan.

---

## 0. Ringkasan eksekutif

Ketiga situs mewakili tiga kutub 3D web yang berbeda, dan ketiganya sepakat pada satu hal: **3D adalah panggung untuk satu momen, bukan kulit seluruh situs.**

| Kutub | Situs | Pelajaran inti untuk PRATA FAKTA |
|---|---|---|
| Narasi sinematik | Hatom (Immersive Garden) | Satu cerita = satu perjalanan kamera; scroll menggerakkan dunia, teks menempel pada adegan |
| Perkakas interaktif | Spline | 3D tanpa kode: objek punya *state*, *event*, dan *action*; embed sebagai komponen, bukan halaman |
| Penampil objek | Lusion (dua wujud: studio `lusion.co` dan produk `lusion.app`) | Inspeksi objek harus punya tombol "putar/zoom" yang jujur, pratinjau statis dulu, 3D dimuat atas permintaan |

**Keputusan arah yang direkomendasikan:** PRATA FAKTA tidak menjadi "situs 3D". Ia tetap situs berita Swiss Editorial yang cepat dibaca, dengan **tiga kantong 3D yang terisolasi dan opt-in**: (1) Liputan Khusus sinematik ala Hatom untuk peristiwa dunia besar; (2) satu adegan Spline di Observatorium sebagai visualisasi data interaktif; (3) penampil objek ala Lusion untuk artefak/bukti visual di Perpustakaan dan Pelacak Klaim. Semua kantong memakai lazy loading, fallback statis, dan tidak pernah memblokir artikel. Detail prioritas ada di §5.

---

## 1. Hatom — storytelling simbolik 3D (Immersive Garden)

**URL yang diteliti:** https://immersive-g.com/projects/hatom/ (studi kasus) dan https://www.hatom.com/ (situs live yang dirujuk studi kasus)
**Pembuat:** Immersive Garden (Prancis) untuk Hatom, protokol likuiditas kripto di MultiversX.
**Penghargaan tercatat di halaman studi kasus:** Awwwards Site of the Day, FWA Site of the Month, FWA Site of the Day, CSSDA Site of the Month, CSSDA Site of the Day. Kredit: Aura Productions.

### 1a. Apa yang membuat desainnya khas

- **Satu metafora visual memikul seluruh narasi.** Cerita dimulai dari telur yang menetas menjadi griffon (makhluk mitologi singa-elang), lalu griffon itu berkembang menjadi ekosistem planet-planet yang mewakili protokol kripto Hatom yang meluas. Tidak ada halaman "Tentang" yang panjang — evolusi perusahaan *diperlihatkan* sebagai evolusi makhluk, bukan dijelaskan dalam paragraf.
- **Lima fase, satu perjalanan.** Situs live memuat teks "Loading 5 phases" dan rekomendasi "Headphones recommended". Lima tahap transformasi griffon menjadi struktur lima babak yang rapi: pembaca selalu tahu ia berada di fase ke berapa, dan setiap fase punya satu gagasan visual.
- **Abstraksi artistik + kedalaman teknis.** Studi kasus menekankan keseimbangan ini secara eksplisit: visualnya abstrak dan puitis, tetapi tetap mengomunikasikan produk nyata (ekosistem protokol, kepemimpinan di inovasi kripto). 3D di sini bukan dekorasi; ia adalah diagram yang dihidupkan.
- **Suara sebagai lapisan narasi.** Ada *voiceover-driven discovery* dan *sound design* sebagai disiplin tersendiri dalam kredit proyek — suara memandu penemuan, bukan sekadar musik latar. Rekomendasi headphone di layar loading menandakan audio dianggap bagian dari pengalaman, bukan aksesori.
- **Navigasi mulus tanpa peta halaman.** Disebut "seamless navigation" — pengguna tidak melompat antar-halaman; ia bergerak di dalam satu dunia yang berkesinambungan.

### 1b. Interaksi yang layak diadaptasi

1. **Scroll sebagai perjalanan kamera (scrollytelling).** Scroll menggerakkan kamera melalui adegan 3D; setiap "babak" menambatkan satu klaim/fakta kunci. Ini pola paling adaptabel dari Hatom.
2. **Indikator fase (1/5, 2/5, …).** Penanda progres babak memberi orientasi di pengalaman panjang — mirip indikator progres baca artikel, tetapi per babak narasi.
3. **Penemuan berbasis voiceover (opsional, bermakna ganda).** Narasi suara yang memandu — di PRATA FAKTA ini bisa menjadi versi audio dari liputan khusus (narasi dibacakan), dengan tombol bisu yang selalu terlihat.
4. **Transisi antar-babak tanpa reload.** Dunia 3D tetap hidup sementara panel teks berganti — kontinuitas visual membuat peristiwa panjang terasa sebagai satu kesatuan.

### 1c. Animasi yang layak diadaptasi

- **Transformasi objek sebagai metafora perubahan.** Objek berubah wujud seiring scroll (telur → griffon → planet). Di PRATA FAKTA: peta konflik yang "tumbuh" simpulnya, atau garis waktu yang "meledak" dari satu titik menjadi jaringan peristiwa.
- **Kamera sinematik: dolly, orbit, dan zoom halus antar-babak.** Pergerakan kamera yang lambat dan bermakna, bukan putaran bebas.
- **Partikel/atmosfer sebagai penanda suasana.** Debu, cahaya, dan kedalaman ruang memberi bobot emosional tanpa satu kata pun.
- **Easing sinematik + jeda.** Adegan diberi waktu "bernapas" sebelum teks berikutnya muncul — ritme ini yang membedakan scrollytelling dari sekadar animasi scroll biasa.

### 1d. Komponen relevan

- Layar loading bermerek dengan penghitung fase ("Loading 5 phases") — memberi ekspektasi jujur sebelum pengalaman berat dimulai.
- Penanda fase/babak + progres scroll.
- Panel teks melayang (*overlay*) yang menempel pada adegan, bukan halaman terpisah.
- Kontrol audio (voiceover on/off, bisu) yang selalu dapat dijangkau.
- Adegan penutup yang merangkum ekosistem (peta planet) — setara "peta besar" di akhir liputan.

### 1e. Di mana dipakai di PRATA FAKTA — dan apa yang TIDAK layak

**Layak:**

- **Liputan Khusus / peristiwa dunia besar** (mis. konflik berkepanjangan, KTT, bencana, pemilu). Satu halaman scrollytelling dengan 4–6 babak: konteks → kronologi → aktor → data → apa selanjutnya. Setiap babak menambatkan fakta terverifikasi dari pipeline PRATA FAKTA (dengan skor FACT SCORE dan sumber tampil di panel, bukan disembunyikan).
- **Pembuka `/observatorium`.** Adegan singkat "dunia data" sebagai gerbang visual sebelum pengguna masuk ke grafik biasa.
- **Halaman "Tentang PRATA FAKTA" / metodologi.** Metafora evolusi klaim (klaim mentah → terverifikasi → diterbitkan) sebagai perjalanan visual — ini analog langsung dengan telur → griffon.

**TIDAK layak:**

- **Halaman artikel biasa.** Artikel harus terbuka dan terbaca dalam < 2 detik; scrollytelling 3D akan menghancurkan kecepatan baca dan SEO.
- **Beranda.** Beranda adalah daftar berita; menjadikannya dunia 3D mengorbankan fungsi utamanya (memindai berita cepat).
- **`/graf`, `/klaim`, `/cari`, `/glosarium`.** Alat kerja analitis butuh presisi dan kecepatan; narasi sinematik hanya memperlambat.
- **Meniru metafora griffon/telur itu sendiri** — itu identitas merek Hatom. PRATA FAKTA memakai metafora sendiri (mis. simpul fakta yang menyala, peta yang tumbuh).

### 1f. Dampak performa

- **Biaya tertinggi dari ketiga situs.** Adegan sinematik penuh (model 3D kustom + shader + voiceover + video) adalah paket aset terbesar: studi kasus sejenis dari Immersive Garden (proyek Orano, dikutip dalam riset pendukung) mencatat 30 model 3D seberat 3,7 MB (901 KB setelah gzip) — dan itu proyek 2018; adegan Hatom yang lebih kaya hampir pasti lebih berat.
- **Wajib lazy loading agresif:** Liputan Khusus dimuat hanya saat pengguna membuka halaman itu; adegan 3D di-*split* dari bundle utama (`next/dynamic`, `ssr: false`); tekstur/model di bawah *IntersectionObserver*.
- **Fallback statis wajib:** gambar poster + ringkasan teks lima babak harus tampil bila WebGL gagal atau pengguna memakai mode hemat data; artikel tidak boleh bergantung pada adegan untuk dipahami.
- **GPU di HP Android menengah:** adegan sinematik penuh (shader kustom, banyak cahaya) berisiko panas, baterai boros, dan frame drop. Mitigasi: kualitas adaptif (turunkan resolusi render / matikan partikel bila `deviceMemory` rendah atau frame rate jatuh), batasi durasi adegan aktif, dan *pause* render saat tab tidak terlihat (`visibilitychange`) atau adegan di luar viewport.

### 1g. Adaptasi mobile + fallback bila WebGL tidak didukung

- **Mobile:** di layar kecil, scrollytelling berubah menjadi "kartu babak" vertikal — gambar statis + teks per babak, tanpa kamera 3D. Gestur scroll vertikal tidak boleh dibajak oleh kanvas (kanvas `touch-action: pan-y`, orbit dimatikan).
- **Tanpa WebGL:** seluruh halaman tetap berfungsi sebagai artikel panjang biasa dengan gambar dan grafik 2D; penanda "versi interaktif tidak tersedia di perangkat ini" tampil jujur, bukan layar kosong.
- **`prefers-reduced-motion`:** matikan perjalanan kamera sepenuhnya; tampilkan semua babak sebagai daftar statis.
- **Audio:** voiceover tidak pernah autoplay dengan suara; mulai hanya setelah ketukan pengguna, dengan tombol bisu yang persisten.

---

## 2. Spline — scene 3D interaktif

**URL yang diteliti:** https://spline.design/
**Apa itu:** perkakas desain 3D gratis di browser (tanpa instalasi), mirip Figma tetapi untuk objek 3D, dengan ekspor langsung ke web. Halaman beranda saat ini menekankan alur baru "prompt → produksi dalam satu file" dengan agen AI (Claude, ChatGPT, Cursor, Codex, atau agen lain via MCP) dan Spline MCP, plus editor kolaboratif real-time dan publikasi ke web, iOS, dan Android. Harga tercantum: gratis (0 USD) untuk tier dasar.

### 2a. Apa yang membuat desainnya khas

- **3D yang dirancang seperti mendesain slide, bukan seperti memodelkan di Blender.** Antarmuka tiga panel ala Figma; objek, material, cahaya, dan animasi diatur secara visual. Ini menurunkan biaya pembuatan adegan 3D dari "butuh seniman 3D" menjadi "butuh desainer web".
- **Model mental tiga lapis: States – Events – Actions.** Setiap objek punya *state* (penampilan dasar + varian seperti Hover/Clicked/Active: posisi, skala, warna, material berbeda), *event* pemicu (Mouse Hover, Mouse Down/Up, Mouse Press, Follow, Scroll, Look At, Key Press, tabrakan, drag), dan *action* sebagai respons (transisi ke state, putar suara, ganti kamera, buka tautan, panggil API). Semua interaktivitas Spline adalah kombinasi ketiganya — pola yang sangat mudah ditiru dengan React Three Fiber sekalipun tanpa memakai Spline.
- **Empat jalur ekspor yang jelas:** Public URL (iframe `prod.spline.design/[id]`), Spline Viewer (komponen web `<spline-viewer>`), React (`@splinetool/react-spline`), dan native iOS/Android (Metal/Vulkan). Viewer lebih mampu daripada iframe: menangkap event mouse global (seluruh jendela, bukan hanya kanvas) dan memicu animasi berbasis scroll halaman.
- **Contoh karya di beranda menunjukkan rentang:** game Mars Rover (dua rover dikendarai di bukit pasir), simulasi air, dan branding — membuktikan satu perkakas melayani permainan, visualisasi, dan pemasaran.
- **Kolaborasi dan AI sebagai alur kerja, bukan gimmick:** agen membangun versi pertama adegan, manusia menyempurnakan di file yang sama (undo, komentar, serah-terima); setiap perubahan tercatat sebagai operasi di file live.

### 2b. Interaksi yang layak diadaptasi

1. **Hover pada objek → objek merespons (naik, membesar, berubah warna).** Pola paling murah dan paling efektif: di Observatorium, hover pada simpul/negara/penanda menampilkan detail; di Graf Pengetahuan, hover pada simpul menyorot tetangganya.
2. **Klik objek → aksi (buka detail, ganti kamera, panggil API).** Klik simpul di graf membuka panel klaim; klik negara di globe membuka artikel terkait.
3. **Scroll halaman → animasi adegan.** Scroll menggerakkan transisi state objek (mis. batang diagram 3D tumbuh saat pengguna menggulir ke bagiannya).
4. **Follow / Look At.** Objek "menatap" kursor — efek kecil yang membuat adegan terasa hidup; cocok untuk elemen hero yang ringan.
5. **Drag / orbit terbatas.** Pengguna memutar objek dengan drag, tetapi dengan batas sudut agar tidak tersesat.

### 2c. Animasi yang layak diadaptasi

- **Transisi state yang dianimasikan otomatis** (Spline menganimasikan perpindahan antar-state; tidak perlu keyframe manual untuk hover). Ini pola yang harus ditiru: semua perubahan visual di PRATA FAKTA memakai transisi, bukan lompatan.
- **Keyframe loop halus** (mis. rotasi lambat 360° pada model hero) — murah, menenangkan, dan memberi kesan "hidup".
- **Animasi berbasis scroll yang terikat progres** (bukan autoplay): objek bergerak sebanding dengan posisi scroll, sehingga pengguna mengendalikan tempo.
- **Fisika ringan secukupnya** (gravitasi/ pantulan antar-objek) — hanya untuk satu elemen mainan di Observatorium, bukan untuk konten berita.

### 2d. Komponen relevan

- **Spline Viewer (`<spline-viewer>`)** — embed satu cuplikan kode; menangkap mouse global dan scroll. Untuk Next.js, padanannya adalah paket React resmi `@splinetool/react-spline` atau `<spline-viewer>` yang dimuat dinamis.
- **Panel States/Events/Actions** sebagai pola desain — bukan komponen UI, melainkan cara berpikir: setiap elemen 3D di PRATA FAKTA harus punya daftar eksplisit "apa yang terjadi saat hover/klik/scroll".
- **Pratinjau gambar + tombol "Load 3D"** — pola ini sebenarnya dipinjam dari Lusion (§3), tetapi Spline juga mendukungnya: adegan tidak dimuat sebelum pengguna meminta.
- **Watermark paket gratis:** perlu dicatat — embed gratis Spline menampilkan logo Spline di sudut bawah secara default. Untuk situs berita bermerek PRATA FAKTA, watermark pihak ketiga di konten editorial tidak dapat diterima; bila memakai Spline, butuh paket berbayar (Solo ±$9/bulan, Super ±$25/bulan menurut panduan pihak ketiga) atau bangun adegan setara dengan React Three Fiber + Three.js (gratis, tanpa watermark, tetapi butuh kode).

### 2e. Di mana dipakai di PRATA FAKTA — dan apa yang TIDAK layak

**Layak:**

- **`/observatorium` — satu adegan interaktif hero.** Contoh konkret: globe 3D dengan penanda peristiwa (klik penanda → daftar artikel dari negara itu); atau batang/diagram 3D tren klaim yang tumbuh saat scroll. Satu adegan, bukan tiga.
- **`/graf` (Graf Pengetahuan) — simpul yang merespons hover/klik.** Pola States–Events–Actions diterapkan pada graf 2D/3D yang sudah ada: hover menyorot tetangga, klik membuka detail klaim. Ini peningkatan inkremental, bukan pembangunan ulang.
- **Elemen hero ringan di halaman Liputan Khusus** (objek kecil yang mengikuti kursor / berputar lambat).
- **Prototyping cepat.** Spline berguna sebagai alat membuat mockup adegan 3D untuk diuji ke pengguna sebelum dibangun permanen dengan kode sendiri.

**TIDAK layak:**

- **Mengganti seluruh halaman dengan adegan Spline.** Situs berita bukan galeri 3D; setiap adegan harus punya alasan editorial.
- **Fisika real-time di halaman konten.** Solver fisika simultan menurunkan frame rate di HP — hanya untuk elemen mainan terisolasi.
- **Ketergantungan pada layanan Spline (file di cloud Spline, URL `prod.spline.design`).** Bila Spline berubah kebijakan/harga/down, adegan PRATA FAKTA ikut mati. Untuk konten editorial permanen, aset 3D sebaiknya di-host sendiri (GLB di CDN PRATA FAKTA) dan dibangun dengan pustaka open-source.
- **Fitur AI/MCP Spline** — tidak relevan untuk situs berita; agen AI PRATA FAKTA adalah antrean Muse, bukan agen pembangun adegan.

### 2f. Dampak performa

- **Biaya menengah, paling terkendali dari ketiganya.** Adegan Spline tipikal (primitif + material + sedikit animasi) jauh lebih ringan daripada adegan sinematik Hatom; runtime-nya dioptimalkan untuk web dan diklaim "high-performance real-time 3D".
- **Risiko utama bukan ukuran, melainkan jumlah adegan.** Setiap `<spline-viewer>`/iframe adalah runtime WebGL terpisah. Aturan: maksimal **satu adegan aktif per halaman**, dan adegan di halaman lain tidak dimuat sama sekali.
- **Lazy loading:** muat runtime Spline hanya setelah pengguna menggulir ke dekat adegan atau mengetuk "Muat 3D"; tampilkan pratinjau gambar statis sebelumnya. Runtime dimuat via `next/dynamic` + `ssr: false` agar tidak masuk bundle awal.
- **GPU di HP Android menengah:** satu adegan ringan (sedikit poligon, tanpa fisika, tanpa post-processing berat) umumnya aman; yang berbahaya adalah fisika + bayangan real-time + banyak cahaya. Matikan bayangan dan turunkan `pixelRatio` (maks 1,5–2) di perangkat menengah; pantau frame rate dan turunkan kualitas otomatis bila di bawah ~30 fps.
- **Biaya non-teknis:** watermark paket gratis (lihat §2d) dan batas jumlah file embed publik di tier gratis.

### 2g. Adaptasi mobile + fallback bila WebGL tidak didukung

- **Mobile:** hover tidak ada di layar sentuh — ganti dengan **tap** (ketuk objek = tampilkan detail; ketuk lagi = tutup) dan **drag** untuk orbit. Panduan pihak ketiga secara eksplisit mengingatkan: nonaktifkan orbit kamera berbasis sentuhan bila mengganggu scroll vertikal halaman (isolasi event sentuh kanvas; `touch-action` yang tepat; orbit hanya aktif saat pengguna menyentuh kanvas dengan sengaja, bukan saat menggulir halaman).
- **Tanpa WebGL:** tampilkan gambar statis adegan + daftar interaktif 2D yang sama (mis. daftar negara/artikel sebagai kartu). Semua informasi yang ada di adegan 3D harus tersedia dalam bentuk daftar/tabel biasa.
- **`prefers-reduced-motion`:** matikan rotasi loop, Follow/Look At, dan animasi scroll; adegan menjadi gambar statis dengan hotspot yang bisa diklik.
- **Aksesibilitas:** setiap objek interaktif harus punya padanan keyboard (daftar tombol/fokus) dan label ARIA — pengguna keyboard tidak bisa "meng-hover objek 3D".

---

## 3. Lusion — penampil 3D berbasis browser

**URL yang diteliti:** https://lusion.app/ (sesuai penugasan) — dan, karena temuan di bawah, juga https://lusion.co/ dan https://lusion.co/projects/of_the_oak/ (studio yang sama namanya).

**Temuan identitas yang wajib dicatat:** nama "Lusion" saat ini menunjuk ke **dua produk berbeda**, dan riset ini menemukan keduanya:

1. **`lusion.app` (yang ditugaskan)** — per 19 November 2026, ini adalah **produk publishing 3D untuk merek makanan dan produk** ("3D publishing for food and product brands", tagline "Good things deserve a closer look"). Pengguna mengunggah model GLB/USDZ, membagikannya lewat satu tautan atau kode QR, dan pelanggan memutar/memperbesar model di browser tanpa aplikasi dan tanpa akun. Ini **bukan** situs studio kreatif yang terkenal itu.
2. **`lusion.co`** — studio produksi kreatif pemenang penghargaan dari Bristol, Inggris (didirikan 2017, co-founder Edan Kwan), spesialis real-time 3D, WebGL, dan pengalaman web interaktif; Awwwards Site of the Year 2023 + Developer Site of the Year 2023, Webby Award 2024; klien yang ditampilkan meliputi Porsche, Google, Apple, Sony, NVIDIA, Coca-Cola; lab eksperimental di `labs.lusion.co`.

Kedua sisi diteliti di bawah ini karena keduanya relevan — `lusion.app` untuk pola *penampil objek*, `lusion.co` untuk standar *craft* WebGL — tetapi laporan ini membedakan keduanya secara eksplisit agar tidak terjadi salah atribusi.

### 3a. Apa yang membuat desainnya khas

**`lusion.app` — penampil objek:**

- **Satu janji, satu gestur.** "Let me take a closer look" — seluruh produk dibangun di sekitar momen ketika seseorang ingin melihat lebih dekat. Tidak ada narasi, tidak ada dunia; hanya objek, putar, zoom, periksa.
- **Pratinjau dulu, 3D atas permintaan.** Halaman menampilkan gambar pratinjau model (mis. Carrot Cake) dengan teks eksplisit "Load 3D when you are ready" — 3D tidak dimuat otomatis. Setelah dimuat: "drag to rotate and scroll or pinch to zoom. With the model focused, use the arrow keys to rotate." Instruksi gestur ditulis di tempat, bukan disembunyikan.
- **Tanpa gesekan distribusi.** Satu tautan atau kode QR; tanpa aplikasi, tanpa akun tamu; di iOS membuka Quick Look, di Android yang didukung membuka Scene Viewer; USDZ yang diunggah sendirian dikonversi otomatis ke GLB.
- **Kejujuran spesifikasi.** Ukuran file model dicantumkan apa adanya (contoh: GLB Carrot Cake 10,7 MiB; batas unggah 12 MB per file; "Smaller models travel faster"). Atribusi model dicantumkan (Carrot Cake oleh Greg Zaal dan James Ray Cock via Poly Haven, CC0). Analitik "model activity by platform" dicatat untuk penerbit.
- **Bahasa editorial yang hangat dan pendek.** "Show the shape. Share the feeling." / "More than a flat image" — copywriting yang menjual inspeksi, bukan teknologi.

**`lusion.co` — studio:**

- **Situs sebagai arena pamer, bukan portofolio biasa.** Beranda digambarkan sumber pihak ketiga sebagai "flexing ground": animasi generatif, simulasi kain real-time, dan "tabung cahaya keriting" (*curly light-scattering tubes*) yang ikonik — semuanya berjalan di Three.js dengan animasi vertex yang dibuat di Houdini FX, namun tetap mulus bahkan di perangkat bawah berkat optimasi.
- **Rekam jejak teknis yang terdokumentasi.** Studi kasus "Of The Oak" (pendamping web untuk instalasi fisik bersama Royal Botanic Gardens, Kew) menjelaskan pipeline Houdini → WebGL yang mengompresi struktur pohon/cabang/simpul 3D kompleks ke format web kustom hingga **hanya 3,5 MB**, dengan WebGL instancing untuk pengiriman cepat. Ini bukti konkret bahwa 3D berat bisa dikompresi secara agresif bila pipeline-nya dirancang dari awal.
- **Frasa kunci studio:** "Bold Ideas, Brought to Life" — desain, motion, 3D, dan development digabung menjadi perjalanan digital yang dibuat khusus, bukan template.

### 3b. Interaksi yang layak diadaptasi

1. **Putar (drag) – zoom (scroll/pinch) – periksa (klik hotspot).** Tiga gestur inti penampil objek; tidak lebih. Ini pola interaksi 3D yang paling mudah dipelajari pengguna awam.
2. **Navigasi keyboard pada model yang terfokus** (tombol panah untuk memutar, seperti yang ditulis `lusion.app`). Penting untuk aksesibilitas dan untuk pengguna desktop tanpa mouse.
3. **"Load 3D when you are ready"** — tombol muat eksplisit sebagai pola interaksi itu sendiri: pengguna menyatakan niat sebelum biaya unduhan dikeluarkan.
4. **Berbagi tampilan (share the same view).** `lusion.app` memungkinkan berbagi sudut pandang yang sama ke ponsel via QR — di PRATA FAKTA, padanannya adalah tautan ke tampilan graf/artefak tertentu (deep link ke sudut kamera + simpul terpilih).
5. **QR sebagai jembatan fisik → digital** (menu, kemasan, display). Untuk PRATA FAKTA, padanannya adalah QR di materi cetak/edukasi yang membuka visualisasi terkait — prioritas rendah, tetapi polanya layak dicatat.

### 3c. Animasi yang layak diadaptasi

- **Rotasi idle yang sangat lambat** saat model tidak disentuh (memberi isyarat "ini bisa diputar"), berhenti total saat pengguna berinteraksi, kembali perlahan setelah beberapa detik diam.
- **Zoom halus dengan inersia** (bukan lompatan skala); batas zoom min/max yang jelas agar pengguna tidak "kehilangan" objek.
- **Transisi kamera antar-hotspot** (klik titik → kamera meluncur ke sudut itu) — cara elegan memandu inspeksi tanpa narasi panjang.
- **Animasi generatif ambient ala `lusion.co`** (partikel/tabun
...[truncated 15821 chars]