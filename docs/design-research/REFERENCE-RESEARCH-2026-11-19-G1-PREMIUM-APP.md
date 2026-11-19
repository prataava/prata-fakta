# Riset Referensi Desain — Grup 1: Premium App

**Proyek:** PRATA FAKTA — platform berita & intelijen fakta (Next.js, live https://prata-fakta.vercel.app/)
**Tanggal riset:** 19 November 2026
**Grup:** G1 — Premium App
**Situs diteliti:** Butter (butter.video), Plamo (illoca.com/plamo), Cerebrium (cerebrium.ai)
**Sifat dokumen:** Riset + dokumentasi ONLY. Bukan perubahan kode. Tidak ada aset, logo, atau layout berhak cipta yang disalin — yang diadaptasi hanyalah pola interaksi, pola animasi, dan pola komponen yang dideskripsikan ulang dengan kata-kata sendiri.

**Sistem desain PRATA FAKTA saat ini (acuan pemetaan):** Swiss Editorial — Inter + Source Serif 4, aksen crimson `#b91c1c`, mode terang/gelap, BottomNav kaca 6 item, Command Palette Ctrl+K sudah ada. Halaman publik: beranda, artikel, cari, graf pengetahuan (`/graf`), linimasa (`/timeline`), observatorium data (`/observatorium`), pelacak klaim (`/klaim`), perpustakaan (`/perpustakaan`), glosarium (`/glosarium`). Admin: dashboard, editorial workspace, command center, source intelligence, pipeline monitoring.

---

## Metode & batasan pengamatan

| Hal | Status |
|---|---|
| `https://www.butter.video/` | ✅ Terbaca penuh via `browser.open` (crawl 19 Nov 2026 13:47 UTC, 180 baris + 54 gambar terindeks). Diperkaya pencarian web spesifik + ulasan pihak ketiga (Asphaleia, must.tools, ilovecreatives). |
| `https://illoca.com/plamo` | ✅ Terbaca penuh via `browser.open` (crawl 19 Nov 2026 13:47 UTC, 159 baris). Diperkaya siaran pers peluncuran (EINPresswire via Construction Dive, AEC Magazine, 24 Agu 2026). |
| `https://cerebrium.ai/` | ✅ Terbaca penuh via `browser.open` (crawl 19 Nov 2026 13:47 UTC, 233 baris + 26 gambar terindeks). Diperkaya studi kasus teknis Codrops "Building Cerebrium" (23 Jul 2026, agensi KOKI-KIKO) yang merinci stack Three.js r183.2, GSAP, MeshLine, dan keputusan WebGPU → WebGL. |
| Interaksi live (hover, scroll, drag, klik) | ❌ **Tidak teramati — butuh browser live.** Subagen ini tidak punya browser interaktif; yang diamati adalah konten/struktur halaman yang terbaca (teks, heading, gambar, tautan, urutan seksi). |
| Animasi scroll, easing, durasi, WebGL runtime, FPS | ❌ **Tidak teramati — butuh browser live.** Semua pernyataan animasi di bawah ini ditandai sumbernya: (i) terbaca dari teks halaman, (ii) didokumentasikan di studi kasus Codrops, atau (iii) inferensi pola yang diberi label eksplisit sebagai inferensi. |
| Warna/tipe persis (hex, nama font) situs referensi | ⚠️ Sebagian teramati. Cerebrium: atmosfer ungu terdokumentasi di Codrops (custom purple HDRI). Butter: layout terang + satu tombol gelap (dilaporkan Asphaleia). Plamo: palet tidak terdokumentasi dalam teks yang terbaca — tidak diklaim. |
| Aplikasi login (editor Butter, workspace Plamo, konsol Cerebrium) | ❌ Tidak diakses — hanya halaman marketing publik yang dibaca. Pola workspace Plamo/Butter diambil dari deskripsi fitur di halaman publik, bukan dari penggunaan aplikasinya. |

**Prinsip adaptasi untuk PRATA FAKTA:** ambil *pola*, bukan *tampilan*. Crimson `#b91c1c`, Inter + Source Serif 4, dan identitas Swiss Editorial tetap dipertahankan; pola dari grup ini dipakai sebagai lapisan interaksi/animasi di atasnya, bukan pengganti identitas.

---

## 1. Butter — butter.video

**Posisi produk (dari halaman aslinya):** "Butter, the first video editor you can build on." / "It's a whole new timeline." / "Engineered for Creativity". Editor video browser-first yang tersusun dari *blocks* yang bisa dipakai ulang — motion graphics, kinetic type, 3D, shader effects — yang disesuaikan lewat dial, slider, prompt, atau kode. Alur produk: Import → Edit → Enhance → Ship (kolaborasi real-time, ekspor sampai 60fps, Image/Video/GIF/ProRes).

### (a) Apa yang membuat desainnya khas

1. **Satu objek hero 3D yang playful, bukan grid generik.** Hero memakai gantungan kunci (keychain) bermerek Butter sebagai objek 3D di atas headline sans yang sangat besar + satu tombol gelap. Laporan Asphaleia (pihak ketiga) menegaskan: "A playful 3D keychain hero leads into a block library" dan "A light layout puts one large 3D hero object above a very big sans headline and a single dark button." Keberanian menaruh satu objek aneh yang mudah diingat — bukan foto stok — adalah pembeda utamanya.
2. **"There's a block for that" — produk dijelaskan sebagai katalog, bukan sebagai daftar fitur.** Seksi blok menampilkan efek bernama (Inflate, Glow, Focus, Halftone) masing-masing dengan pratinjau visual sendiri. Pengguna memahami produk dengan *melihat* efeknya, bukan membaca paragraf.
3. **Bukti sosial sebagai marquee logo tanpa henti.** 25+ logo (Airbnb, Netflix, Canva, Sony Music, SpaceX, Disney, Mercedes-Benz, The Atlantic, DoorDash, dsb.) tampil dua kali berurutan — pola marquee/loop ganda yang terbaca dari duplikasi daftar logo di teks halaman (baris 10–104: urutan logo yang sama muncul dua kali).
4. **Tiga cara membuat (remix / describe / code) + satu klik banyak varian.** "Create in 3 ways", "Start from templates", "One click. Dozens of variations" — resize 9:16, 1:1, 4:5, 16:9 tanpa membangun ulang (terbaca di halaman perbandingan After Effects). Pesannya: satu sumber, banyak keluaran.
5. **Bahasa yang berani dan ringkas.** Headline pendek ("It's a whole new timeline", "Infinitely customizable", "The best stories are built block by block") — satu klaim per seksi, tanpa jargon.

### (b) Interaksi yang layak diadaptasi

| Pola Butter | Adaptasi PRATA FAKTA |
|---|---|
| **Blok yang bisa dipakai ulang + disimpan sebagai toolkit tim** ("Customize and save your favorite blocks so your team never starts from scratch again") | **Blok editorial yang bisa dipakai ulang** di admin editorial workspace: blok "kutipan terverifikasi", "kartu FACT SCORE", "tabel sumber", "kotak koreksi" yang bisa disimpan sebagai template tim dan disisipkan ke artikel baru dengan satu klik. |
| **Dials & sliders sebagai kontrol intuitif** (bukan hanya input angka) | **Slider ambang FACT SCORE / filter** di `/admin` dan `/observatorium`: geser ambang skor (mis. ≥85 auto-publish) dan lihat jumlah artikel yang lolos berubah langsung; slider rentang tanggal di `/timeline`. |
| **Template carousel horizontal per industri** ("Templates inspired by leading brands", carousel per kategori) | **Carousel template briefing / template artikel** di admin + **carousel "Topik hangat"** di beranda (horizontal scroll-snap, per kategori: politik, ekonomi, teknologi, kesehatan). |
| **Komentar langsung di timeline & canvas** ("Share and comment directly on timeline and canvas") | **Komentar inline pada draf artikel** di editorial workspace: reviewer menandai kalimat/klaim spesifik, bukan komentar umum di bawah halaman. |
| **Marquee logo bukti sosial** | **Marquee sumber tepercaya** di beranda/observatorium: strip logo/nama sumber tier-1 (Antara, CNN, Liputan6, dsb.) yang berjalan pelan — memberi sinyal kredibilitas tanpa memakan ruang vertikal. |
| **Satu klik banyak varian format** | **Satu artikel → banyak format**: tombol "Ekspor" di artikel menghasilkan ringkasan singkat, kartu grafis (OG image), dan versi Daily Brief — dari satu sumber yang sama. |

### (c) Animasi yang layak diadaptasi

- **Animasi loop kecil yang *menunjukkan*, bukan menjelaskan.** Laporan Asphaleia: "Small looping animations show the dials and sliders working, so the idea of adjustable blocks is seen rather than read." → Di PRATA FAKTA: animasi loop mikro di kartu FACT SCORE (jarum/angka menghitung naik ke skor akhir saat kartu masuk viewport) dan di `/klaim` (status klaim berubah "belum diverifikasi → terverifikasi" sebagai loop demonstrasi di halaman penjelasan, bukan di data nyata).
- **Hero object yang terasa hidup (inferensi — tidak teramati langsung).** Keychain 3D di hero hampir pasti berotasi/bergerak halus (parallax mouse atau idle float). Karena tidak teramati, yang diadaptasi adalah *prinsipnya*: satu elemen hero beranda yang bergerak sangat pelan (float 6 detik, rotasi ±2°) — murah (CSS transform) dan langsung memberi kesan "hidup" pada pandangan pertama. Wajib dimatikan total di `prefers-reduced-motion`.
- **Transisi antar-seksi yang bergantian (screenshot ↔ kontrol animasi).** Pola "short sections below alternate screenshots, animated controls" → di halaman `/observatorium` dan `/admin/command-center`, selingi panel angka dengan panel visual (grafik) secara ritmis agar dashboard padat tetap bisa dipindai.

### (d) Komponen relevan

- **Block Library / kartu efek bernama** (Inflate, Glow, Focus, Halftone — masing-masing kartu + pratinjau + nama) → kartu "Jenis bukti" / "Jenis klaim" di `/klaim` dan `/perpustakaan`, masing-masing dengan ikon + contoh mini.
- **Template Gallery + "Create in 3 ways"** → pemilih titik awal di "Artikel baru" (dari template / dari sumber / dari draf kosong).
- **Langkah 4 tahap (Import–Edit–Enhance–Ship)** → stepper pipeline di admin pipeline monitoring: Ingest → Verifikasi → Review → Terbit, dengan status tiap tahap terlihat sekaligus.
- **Logo marquee** → strip sumber (di atas).
- **CTA tunggal gelap yang dominan** → satu aksi primer per halaman (mis. beranda: "Baca Daily Brief"; artikel: "Bagikan / Simpan") — jangan dua tombol primer berdampingan.

### (e) Pemetaan ke PRATA FAKTA

| Lokasi PRATA FAKTA | Yang dipakai dari Butter |
|---|---|
| Beranda (hero) | Satu objek/aksen visual khas yang bergerak pelan + headline sangat besar + satu CTA gelap; marquee sumber tier-1 di bawah hero. |
| `/admin` editorial workspace | Blok editorial reusable + template artikel ("Create in 3 ways"); komentar inline pada kalimat/klaim. |
| `/admin` pipeline monitoring | Stepper 4 tahap Import–Edit–Enhance–Ship → Ingest–Verifikasi–Review–Terbit. |
| `/observatorium` | Slider ambang FACT SCORE dengan hitung-nyata langsung; seksi berselang angka ↔ grafik. |
| `/klaim` | Kartu jenis klaim bernama + pratinjau; animasi loop status verifikasi (halaman penjelasan). |
| `/perpustakaan`, `/glosarium` | Galeri template/kartu bernama dengan pratinjau visual kecil per entri. |
| Artikel (baca) | Ekspor satu-klik ke banyak format (ringkasan, kartu grafis, Daily Brief). |

### (f) Dampak performa

- **Ringan–sedang.** Halaman marketing Butter sendiri relatif ringan: teks + gambar Prismic terkompresi (`auto=format,compress&w=400`) + satu gambar hero fallback PNG. Yang mahal bukan halamannya, melainkan *produknya* (editor video real-time di browser, GPU). Pelajaran untuk PRATA FAKTA: **pisahkan biaya halaman marketing/beranda dari biaya alat berat** — beranda harus tetap ringan; alat berat (graf interaktif, observatorium) dimuat malas (lazy) dan hanya di halamannya sendiri.
- **Marquee logo:** murah bila CSS `transform: translateX` + duplikasi DOM (tanpa JS per frame); mahal bila tiap logo adalah gambar besar tanpa kompresi — pakai SVG/teks + `loading="lazy"`.
- **Animasi loop mikro (dial/slider/angka):** murah (CSS/`requestAnimationFrame` pada `transform`/`opacity` saja); jangan animasikan `width`/`top`/`left`.
- **Hero 3D:** mahal bila memakai model 3D asli (WebGL + aset MB-an). Versi murah yang setara secara persepsi: CSS float/rotate pada SVG/aksen editorial (mis. stempel "TERVERIFIKASI" atau kaca pembesar) — 0 aset 3D, efek yang sama pada pandangan pertama.

### (g) Adaptasi mobile (Android 360px)

- Hero: headline besar → skala fluid (`clamp()`), objek hero mengecil di atas headline (bukan di samping); satu CTA full-width.
- Marquee logo: tetap jalan, tapi kecepatan lebih pelan dan `pause on touch`; tinggi strip ≤ 48px.
- Carousel template: scroll-snap horizontal dengan kartu 78vw + peek kartu berikutnya; indikator titik, bukan panah.
- Dial/slider: target sentuh ≥ 44px; slider ambang FACT SCORE jadi bottom-sheet saat disentuh di mobile, bukan panel samping.
- Stepper 4 tahap: jadi vertikal (timeline ke bawah) di ≤ 480px, bukan horizontal yang terjepit.

---

## 2. Plamo — illoca.com/plamo

**Posisi produk (dari halaman aslinya):** "Plamo, the New Agentic 3D Workspace" — "Plamo brings agentic AI to 3D design, transforming sketches, images, and prompts into editable, parametric models." Produk kedua Illoca (setelah Tracing Paper), diluncurkan beta 24 Agustus 2026, didirikan oleh mantan Autodesk AI Lab, Google DeepMind, dan Tesla. Tagline penutup: "You design. Plamo models."

### (a) Apa yang membuat desainnya khas

1. **"Vibe modeling" — agen yang merencanakan dulu, baru membangun.** Fitur 01 Agentic Planning: "Interprets your intent, plans the approach, and builds from text, images, drawings, or plans." Bukan prompt → hasil sekali jadi, melainkan niat → rencana → bangun. Filosofi Human-in-the-Loop ditegaskan di FAQ: "you don't need to be a 'prompt engineer' — if you know how to redline a drawing or describe a change to a colleague, you know how to use [Plamo]" dan "your professional judgment remains unmediated."
2. **Yang penting adalah *setelah* generasi: geometri yang tetap bisa diedit.** "Rather than producing a static mesh or one-off visual, it creates editable BREP geometry backed by parametric logic, so designers can continue changing dimensions, systems, and relationships without rebuilding the model from scratch." (Construction Dive / AEC Magazine). Ini pembeda konseptual terkuat: output bukan artefak mati, melainkan sistem yang tetap hidup.
3. **Browser-native tanpa rantai plugin.** Fitur 03: "Model directly in the browser with layers, section cuts, orthographic views, and no plugin chain." Fitur 04: ekspor ke Rhino, Grasshopper, SketchUp, GLB, STEP, STL, DXF, DWG; "render, present, and share live projects directly from Plamo."
4. **Struktur halaman yang sangat disiplin: 4 fitur bernomor (01–04).** Penomoran eksplisit memberi kesan metodis/teknis — cocok untuk produk profesional. Diikuti Project Library ("Modeled in Plamo"), "Built for every discipline", harga, FAQ yang menjawab keberatan nyata (akurasi, kepemilikan IP, kredit).
5. **Kejujuran soal batasan, ditulis di depan.** FAQ menjelaskan kredit hanya dipakai saat agen bekerja ("you're never charged for navigation, sketching, or using the interface"), proyek sederhana ±500 kredit / standar ±1.500 / kompleks ±10.000, dan daftar "More features coming soon" yang mencantumkan kekurangan saat ini (termasuk "Mobile support" dan "Collaboration" yang *belum ada*). Transparansi ini justru membangun kepercayaan.
6. **Kepemilikan IP eksplisit.** "You own your designs 100%. We do not use your proprietary sketches, prompts, project models, or 3D geometry to train our models." — pola kepercayaan yang langka ditulis setegas itu.

### (b) Interaksi yang layak diadaptasi

| Pola Plamo | Adaptasi PRATA FAKTA |
|---|---|
| **Agen merencanakan dulu, lalu membangun — rencana terlihat sebelum eksekusi** | **Pipeline yang menunjukkan rencananya:** di admin pipeline monitoring, sebelum ingestion batch berjalan, tampilkan "rencana" (sumber yang akan diambil, jumlah klaim yang akan diekstrak, ambang yang dipakai) dan minta konfirmasi — bukan proses hitam yang tiba-tiba selesai/gagal. Ini langsung menjawab diagnosis lama pipeline #31 ("Galat 500: Tidak ada peristiwa yang diolah") — kegagalan yang terlihat rencananya lebih mudah didiagnosis. |
| **Output tetap bisa diedit, bukan artefak mati** (geometri parametrik) | **Artikel & klaim tetap bisa diedit pasca-terbit:** FACT SCORE, label sikap, dan status klaim bukan nilai beku — editor bisa mengubah parameter (mis. tambah sumber → skor dihitung ulang langsung) tanpa menulis ulang artikel. "Parametrik" di PRATA FAKTA = skor dan label adalah fungsi dari bukti, bukan teks mati. |
| **Layers, section cuts, orthographic views** | **Lapisan di `/graf` (graf pengetahuan):** toggle layer — entitas / klaim / sumber / hubungan — nyala-mati per lapis; "section cut" = potong graf per rentang waktu atau per topik; tampilan ortografik = tampilan daftar datar (tabel) sebagai alternatif graf. |
| **Human-in-the-Loop: redline seperti ke kolega** | **Redline editorial:** reviewer menandai klaim dengan coretan/komentar gaya redline ("perlu sumber kedua", "angka tidak cocok") — bahasa sehari-hari, bukan formulir. |
| **Kredit hanya untuk kerja agen, bukan untuk navigasi** | **Prinsip biaya transparan di admin:** aktivitas pipeline (ingest, ekstraksi, verifikasi) menampilkan "biaya" (waktu/kuota API) per langkah; navigasi dan membaca gratis — dan label ini tampil jujur di Command Center. |
| **Project Library ("Modeled in Plamo")** | **Perpustakaan karya / arsip investigasi** di `/perpustakaan`: galeri liputan mendalam dengan kartu proyek bernomor, bukan sekadar daftar tautan. |
| **Penomoran fitur 01–04** | **Penomoran langkah metodologi** di halaman "Cara kami memverifikasi" / `/klaim`: 01 Kumpulkan → 02 Periksa silang → 03 Nilai → 04 Terbitkan — memberi kesan prosedural yang meyakinkan. |

### (c) Animasi yang layak diadaptasi

- **Animasi "rencana → bangun" bertahap (inferensi dari konsep, tidak teramati langsung).** Yang bisa diadaptasi tanpa mengarang visualnya: di pipeline monitoring, tiap tahap (rencana → ambil → ekstrak → nilai → terbit) muncul berurutan dengan transisi stagger 120–200ms dan indikator progres per tahap — pengguna *melihat* proses berpikir sistem, bukan spinner generik. Ini animasi CSS murni, murah.
- **Transisi antar-tampilan (layers / section cut / ortografik) yang mulus (inferensi).** Di `/graf`, perpindahan layer dan tampilan graf ↔ tabel memakai fade + scale 150–200ms agar tidak terasa "pindah halaman". Tidak teramati di Plamo — dicatat sebagai pola yang diusulkan, bukan yang diamati.
- **Tidak ada animasi spektakuler yang diklaim.** Plamo adalah produk kerja; pelajaran terbesarnya justru *menahan diri*: animasi hanya untuk menjelaskan proses, bukan dekorasi. Ini relevan untuk PRATA FAKTA — dashboard admin tidak butuh confetti, butuh kejelasan status.

### (d) Komponen relevan

- **Panel rencana agen (Agentic Planning)** → panel "Rencana ingestion" di Command Center.
- **Panel layers + section cut + view switcher (ortografik/perspektif)** → kontrol layer `/graf` + switcher graf/tabel/linimasa.
- **Project Library** → galeri `/perpustakaan`.
- **Kartu harga bertingkat dengan kredit (Explore $29,99 / Team / Enterprise)** → TIDAK diadaptasi sebagai paywall (PRATA FAKTA gratis); yang diadaptasi adalah *pola transparansi kuota*: tampilkan kuota/anggaran pipeline yang terpakai per hari di admin.
- **FAQ yang menjawab keberatan (akurasi, IP, biaya)** → seksi "Cara kami bekerja & batasannya" di beranda/observatorium — termasuk kejujuran "apa yang belum bisa kami verifikasi".
- **Badge "Beta"** → label jujur "Beta" pada fitur baru (mis. Compare Perspectives) — ekspektasi yang dikelola lebih baik daripada fitur yang diklaim selesai.

### (e) Pemetaan ke PRATA FAKTA

| Lokasi PRATA FAKTA | Yang dipakai dari Plamo |
|---|---|
| `/admin` Command Center | Panel "Rencana ingestion" sebelum batch berjalan (niat → rencana → eksekusi → hasil); tampilkan biaya/kuota per langkah. |
| `/admin` pipeline monitoring | Tahap bertahap dengan progres per tahap (stagger); status "rencana terlihat" agar kegagalan bisa didiagnosis. |
| `/graf` | Toggle layer (entitas/klaim/sumber/hubungan); section cut per waktu/topik; switcher graf ↔ tabel ↔ linimasa. |
| `/admin` editorial workspace | Artikel/klaim parametrik: tambah sumber → FACT SCORE dihitung ulang langsung; redline reviewer gaya bahasa sehari-hari. |
| `/perpustakaan` | Project Library: galeri investigasi bernomor dengan kartu proyek. |
| `/klaim` + halaman metodologi | Langkah verifikasi bernomor 01–04; FAQ keberatan yang jujur (akurasi, batasan, apa yang belum terverifikasi). |
| Beranda | Label "Beta" jujur pada fitur baru; pernyataan kepemilikan/privasi yang tegas bila relevan. |

### (f) Dampak performa

- **Ringan untuk halaman marketing; berat untuk produknya.** Halaman plamo sendiri sangat ringan (teks + sedikit gambar; 159 baris). Produknya (3D BREP di browser) jelas berat — WebGL, geometri parametrik, komputasi agen di server. Pelajaran: **jangan bawa beban produk ke halaman publik.** Untuk PRATA FAKTA, yang berat adalah `/graf` (graf besar) dan `/observatorium` — keduanya harus lazy-load, virtualisasi node, dan batas node awal (mis. 150 node pertama, muat sisanya on-demand). Halaman beranda/artikel tetap ringan.
- **Panel rencana + progres bertahap:** murah (DOM + CSS). Tidak ada biaya WebGL.
- **Toggle layer graf:** murah bila implementasinya memfilter node yang sudah dimuat (bukan fetch ulang per layer).

### (g) Adaptasi mobile (Android 360px)

- Panel rencana ingestion: jadi kartu vertikal dengan langkah yang bisa dilipat (accordion), bukan panel 3 kolom.
- Kontrol layer `/graf`: bottom-sheet dengan toggle besar (≥44px), bukan toolbar horizontal yang meluber; tampilan default di mobile adalah **tabel/linimasa**, bukan graf 3D/2D yang padat — graf hanya bila pengguna memilihnya.
- Redline/komentar inline: jadi catatan di bawah paragraf (tap untuk membuka), bukan margin samping yang tidak ada di 360px.
- Plamo sendiri mengakui "Mobile support" masih "coming soon" — PRATA FAKTA justru harus lebih baik: semua pola di atas dirancang mobile-first sejak awal, bukan menyusul.

---

## 3. Cerebrium — cerebrium.ai

**Posisi produk (dari halaman aslinya):** "Serverless GPU Infrastructure for Real-Time AI" — "Real-time AI infrastructure that scales with you." Headline hero tiga kata bertumpuk: "Quickly / Scale / Globally." Deploy voice agents, video models, LLM dengan "sub-second cold starts and instant autoscaling". Bukti: 2.500+ kapasitas, region us-east-1, eu-west-2, eu-north-1, ap-south-1, uptime 99,999%, SOC 2 / HIPAA / GDPR / ISO.

### (a) Apa yang membuat desainnya khas

1. **"Design wasn't just supporting the story — it *was* the story."** (Codrops, agensi KOKI-KIKO). Setiap interaksi dirancang untuk *mencerminkan produk itu sendiri*: cepat, presisi, modular, bisa diskalakan. Bukan dekorasi di atas pesan — interaksinya adalah pesannya. Ini standar tertinggi di grup ini.
2. **Satu canvas WebGL, banyak environment.** "Cerebrium isn't a single isolated 3D scene. A single canvas contains multiple environments, each with its own materials, particles, lighting setup, and post-processing pipeline" + "seamless page transitions without displaying a loading screen every time users navigated." (Codrops). Satu kanvas persisten yang berganti suasana per seksi — bukan banyak kanvas yang dimuat ulang.
3. **Atmosfer ungu yang disatukan oleh satu HDRI.** "We used a custom purple HDRI from Poly Haven as the environment map. Beyond adding subtle reflections, it helped unify the overall color palette across every scene." (Codrops). Satu keputusan pencahayaan menyatukan seluruh situs.
4. **Keamanan sebagai interaksi, bukan ikon gembok.** Seksi Security memakai bola perisai nyaris tak terlihat: efek Fresnel (permukaan yang menghadap kamera tetap subtil, yang di sudut miring menyala), noise prosedural yang menganimasikan intensitas Fresnel, grid heksagonal yang diproyeksikan ke bola dan menyala lewat bloom, dan — yang paling khas — **raycaster melacak mouse dan menyalakan heksagon di dekatnya, yang lalu meredup perlahan**: "the shield briefly remembers every interaction… the force field absorbs, diffuses, and dissipates energy across its surface." (Codrops, lengkap dengan kode GLSL Fresnel).
5. **Jaringan berdenyut yang sebenarnya tidak bergerak.** "Nothing actually moves. The paths themselves are completely static meshes — the illusion of motion comes entirely from the shader. Each path is UV-unwrapped so that the Y axis runs continuously… The shader simply moves a narrow opacity mask along that UV axis, creating the appearance of a pulse traveling through the network." Tiap jalur punya offset, kecepatan, dan interval denyut yang sedikit berbeda agar terasa organik; visibilitas dibatasi jarak dari kamera. (Codrops).
6. **Bukti teknis yang konkret, bukan superlatif kosong.** Terminal asli yang menampilkan perintah `cerebrium run training_script.py::train --hardware HOPPER_100:8` dengan log epoch dan progress bar blok (`████████░░░░`), tabel perbandingan GPU/CPU/Startup Time, dan angka kapasitas/region/uptime. Studi kasus (Linkup, Resemble AI, Tavus, Distil, Lelapa, BitHuman) dengan filter kategori (Voice / LLMs / Video / Generative AI / Digital Avatars) + "Read Case Study".
7. **Kejujuran teknis yang langka.** Codrops mendokumentasikan kegagalan WebGPU: inisialisasi TSL/WebGPURenderer memakan waktu "close to twenty seconds" sebelum frame pertama, sehingga tim *mundur* ke WebGLRenderer demi waktu startup yang bisa diprediksi — "Going back to WebGL wasn't a rejection of WebGPU. It was simply a production decision." Ini pelajaran performa yang paling berharga dari grup ini.

### (b) Interaksi yang layak diadaptasi

| Pola Cerebrium | Adaptasi PRATA FAKTA |
|---|---|
| **Interaksi = produk ("design was the story")** | **Interaksi = jurnalisme verifikasi.** Setiap interaksi di PRATA FAKTA harus mencerminkan "cepat, presisi, bisa ditelusuri": klik klaim → langsung terlihat buktinya; klik skor → langsung terlihat komponen A/B/C/D-nya. Tidak ada interaksi yang murni dekoratif di halaman data. |
| **Terminal dengan perintah + log nyata** (perintah run, checklist ✓, progress bar blok, epoch loss/lr) | **"Terminal pipeline" di `/admin` Command Center / pipeline monitoring:** log ingestion dan verifikasi ditampilkan sebagai terminal mono dengan prompt `$`, checklist ✓ per langkah, dan progress bar blok — persis bahasa yang sudah dipakai operator. Ini lebih jujur dan lebih mudah dipindai daripada kartu status generik. |
| **Perisai Fresnel + heksagon yang "mengingat" sentuhan mouse** | **Perisai kepercayaan di beranda / halaman artikel:** visual "perisai verifikasi" — saat kursor menyentuh, area di sekitarnya menyala lalu meredup perlahan (efek "mengingat"). Versi murahnya: CSS/SVG radial highlight yang memudar, bukan shader. Dipakai sekali di hero atau di kartu FACT SCORE — bukan di semua halaman. |
| **Jaringan denyut statis (pulse berjalan di sepanjang jalur via shader)** | **Graf pengetahuan `/graf` yang "berdenyut":** denyut cahaya berjalan di sepanjang edge dari sumber → klaim → artikel, menandakan aliran verifikasi. Versi murah: animasi SVG `stroke-dashoffset` pada edge yang aktif (CSS murni, tanpa WebGL) — hanya untuk edge yang sedang disorot, bukan seluruh graf. |
| **Satu kanvas persisten, banyak environment** | **Satu latar visual persisten di beranda:** latar (gradien/aksen) yang berubah halus per seksi saat scroll, tanpa reload — diimplementasikan sebagai satu elemen fixed dengan transisi `opacity`/`background`, bukan banyak kanvas. |
| **Filter studi kasus per kategori** (Voice / LLMs / Video / Digital Avatars) | **Filter beranda/arsip per kategori + per status verifikasi** — pola yang sama, sudah dikenal pengguna; terapkan konsisten di beranda, `/klaim`, `/perpustakaan`. |
| **Angka konkret di depan (2.500+ kapasitas, 99,999% uptime, region)** | **Angka kepercayaan di beranda:** jumlah artikel terverifikasi, jumlah sumber, rata-rata FACT SCORE, uptime pipeline — angka nyata dari database, bukan klaim. |

### (c) Animasi yang layak diadaptasi

- **Denyut di sepanjang jalur (terdokumentasi di Codrops, bukan teramati langsung).** Prinsipnya — *mesh statis + mask opacity yang bergerak* — adalah pola animasi termurah yang memberi kesan "sistem hidup": di `/graf` (edge berdenyut) dan di `/timeline` (denyut berjalan sepanjang garis waktu dari peristiwa ke peristiwa). Implementasi PRATA FAKTA: SVG/CSS `stroke-dashoffset`, bukan shader; denyut hanya pada jalur yang relevan dengan fokus pengguna.
- **Kamera yang di-bake (terdokumentasi).** "Every camera movement was baked directly from Cinema 4D… complete control over timing, framing, easing, and synchronization." Pelajaran: gerakan kamera/scroll yang *direncanakan* (keyframe eksplisit) terasa lebih premium daripada parallax acak. Di PRATA FAKTA: transisi scroll beranda dengan keyframe yang direncanakan (hero → angka → topik), bukan parallax bebas.
- **Perisai yang "mengingat" interaksi (terdokumentasi).** Highlight yang memudar perlahan (bukan hilang instan) memberi kesan sistem merespons dan *mengingat*. Di PRATA FAKTA: hover pada kartu klaim/artikel meninggalkan highlight yang memudar 600–800ms — murah (CSS transition) dan terasa mahal.
- **Transisi halaman tanpa loading screen (terdokumentasi).** "Seamless page transitions without displaying a loading screen" — di PRATA FAKTA ini sudah sebagian ada (Next.js App Router); yang ditambah: transisi konten 200ms (konten lama fade-out, konten baru fade-in) agar navigasi antar-halaman terasa kontinu.
- **Yang TIDAK diadaptasi:** WebGL full-scene Cerebrium. Terlalu mahal untuk situs berita (lihat (f)).

### (d) Komponen relevan

- **Terminal window (prompt + log + progress bar blok + checklist ✓)** → log pipeline di admin; juga "log verifikasi" per artikel (langkah verifikasi sebagai baris terminal yang bisa dibuka di halaman artikel — transparansi proses).
- **Tabel perbandingan GPU/CPU/Startup Time** → tabel perbandingan sumber di `/klaim` (sumber × klaim × status) dan tabel metrik di observatorium.
- **Kartu studi kasus + filter kategori + "Read Case Study"** → kartu investigasi di `/perpustakaan` + filter.
- **Seksi Security dengan visual interaktif** → seksi "Kepercayaan & metodologi" di beranda dengan perisai interaktif (versi murah).
- **Strip logo pelanggan (LiveKit, Tavus, Vapi, Deepgram, Resemble, dsb.)** → strip sumber (sama seperti Butter; pola ini muncul di dua situs — sinyal kuat).
- **Blog/berita dengan tanggal + label kategori (Tutorial / Announcement / Product Update)** → pola kartu artikel PRATA FAKTA sudah sejalan; yang ditambah: label kategori yang konsisten dan filter yang sama di semua daftar.

### (e) Pemetaan ke PRATA FAKTA

| Lokasi PRATA FAKTA | Yang dipakai dari Cerebrium |
|---|---|
| Beranda (hero + kepercayaan) | Headline pendek bertumpuk (ala "Quickly / Scale / Globally" → mis. "Cepat. / Terverifikasi. / Terbuka."); angka konkret; perisai verifikasi interaktif (versi CSS/SVG murah); latar persisten yang berubah per seksi. |
| `/admin` Command Center | Terminal pipeline (prompt `$`, checklist ✓, progress bar blok) sebagai tampilan utama log; tabel metrik ala GPU/CPU/Startup. |
| `/admin` pipeline monitoring | Log verifikasi per artikel sebagai "baris terminal" yang bisa dibuka; denyut progres per tahap. |
| `/graf` | Edge berdenyut (SVG `stroke-dashoffset`) dari sumber → klaim → artikel; hanya pada jalur yang disorot. |
| `/timeline` | Denyut berjalan sepanjang garis waktu antar-peristiwa. |
| `/klaim` | Tabel sumber × klaim × status; filter kategori + status yang konsisten. |
| `/perpustakaan` | Kartu investigasi + filter kategori + "Baca investigasi" (pola studi kasus). |
| Artikel (baca) | "Log verifikasi" transparan di bawah artikel (langkah-langkah sebagai baris terminal ringkas). |
| `/observatorium` | Angka konkret (artikel terverifikasi, sumber, rata-rata skor) sebagai hero angka; tabel metrik. |

### (f) Dampak performa — bagian terpenting dari situs ini

- **Berat, dan timnya mengakuinya.** Satu kanvas Three.js r183.2 dengan banyak environment, material, partikel, lighting, post-processing (bloom via EffectComposer + custom GLSL passes), GPGPU ping-pong dengan floating-point textures, geometri yang sangat tersubdivisi demi kurva mulus, dan optimasi Draco (model dipecah dua agar kurva tidak berfaset). **WebGPU gagal di produksi karena startup ~20 detik** sebelum frame pertama (kompilasi shader TSL) — tim mundur ke WebGL demi startup yang bisa diprediksi. Ini peringatan langsung: efek WebGL full-scene adalah *biaya startup*, bukan hanya biaya runtime.
- **Keputusan untuk PRATA FAKTA: JANGAN meniru WebGL Cerebrium.** Situs berita dibaca di Android kelas menengah dengan koneksi seluler; 20 detik startup adalah kegagalan produk. Yang diadaptasi hanyalah *prinsip visualnya* (denyut, perisai yang mengingat, latar persisten) dalam implementasi CSS/SVG yang biayanya mendekati nol.
- **Yang murah dan aman:** terminal mono (teks), progress bar blok (teks/Unicode), denyut SVG (`stroke-dashoffset`), highlight yang memudar (CSS transition), latar persisten (satu elemen fixed + transisi opacity). Semua ini < 5KB JS tambahan dan 0 aset 3D.
- **Yang mahal dan harus dihindari:** Three.js + model 3D + HDRI + bloom + GPGPU. Bila suatu hari ada adegan 3D, syaratnya: lazy-load setelah interaksi pengguna, `prefers-reduced-motion` mematikan total, dan fallback statis yang identik isinya.
- **Pelajaran optimasi yang bisa dipakai:** pisah aset berat menjadi bagian-bagian kecil yang dimuat bertahap (seperti Cerebrium memecah model jadi dua); kompresi Draco untuk geometri — analoginya di PRATA FAKTA: pecah bundle `/graf` (visualisasi) dari bundle utama dan muat hanya saat halaman dibuka.

### (g) Adaptasi mobile (Android 360px)

- **Terminal pipeline:** font mono 12–13px, baris log bisa di-scroll horizontal di dalam kartu (bukan halaman yang meluber); progress bar blok tetap terbaca karena memakai karakter, bukan gambar.
- **Perisai interaktif:** di mobile tidak ada hover — ganti dengan tap (sentuh → heksagon menyala lalu meredup) dan pastikan ada versi statis yang tetap informatif tanpa interaksi.
- **Denyut graf:** di 360px, graf default adalah daftar/tabel; denyut hanya aktif bila pengguna membuka tampilan graf — hemat baterai dan CPU.
- **Latar persisten per seksi:** di mobile, nonaktifkan perubahan latar saat scroll (satu latar statis) untuk menghemat repaint; transisi konten 200ms tetap dipertahankan.
- **Angka konkret:** tampil sebagai grid 2 kolom (bukan 4 kolom) dengan angka besar + label kecil; `font-variant-numeric: tabular-nums` agar tidak bergeser saat berubah.

---

## Matriks perbandingan

| Dimensi | Butter (butter.video) | Plamo (illoca.com/plamo) | Cerebrium (cerebrium.ai) |
|---|---|---|---|
| **Produk** | Editor video browser, blok reusable | Workspace 3D agen, geometri parametrik | Infrastruktur GPU serverless untuk AI real-time |
| **Kesan pertama** | Playful + berani: satu objek 3D aneh, headline raksasa, layout terang | Metodis + jujur: 4 fitur bernomor, FAQ keberatan, label Beta | Premium teknis gelap: ungu, WebGL, terminal, angka konkret |
| **Warna/atmosfer (yang teramati)** | Terang, satu tombol gelap dominan | Tidak terdokumentasi dari teks yang terbaca | Gelap, atmosfer ungu (HDRI ungu, bloom) |
| **Struktur halaman** | Hero → marquee logo → katalog blok → 4 langkah → 3 cara membuat → template | Hero → 4 fitur bernomor → Project Library → harga → FAQ → CTA | Hero 3 kata → logo → fitur + terminal → security interaktif → studi kasus + filter → blog |
| **Pola interaksi khas** | Blok reusable, dial/slider, template carousel, komentar di timeline | Rencana agen terlihat dulu, output tetap bisa diedit, layers/section cut, redline | Terminal + log nyata, perisai Fresnel yang mengingat sentuhan, filter studi kasus |
| **Pola animasi khas** | Loop mikro dial/slider; hero object hidup (inferensi) | Progres bertahap rencana→bangun; transisi tampilan (inferensi) | Denyut shader di jalur statis; kamera di-bake; highlight yang memudar |
| **Bukti kepercayaan** | Marquee 25+ logo merek | FAQ jujur (akurasi, IP 100% milik pengguna, kredit), "coming soon" yang transparan | Angka konkret (2.500+, 99,999%, region), terminal nyata, studi kasus bernama |
| **Biaya performa halaman** | Ringan–sedang (gambar terkompresi; produknya yang berat) | Ringan (halaman); berat (produk 3D) | **Berat** — WebGL full-scene; WebGPU gagal startup ~20 dtk, mundur ke WebGL |
| **Pelajaran performa** | Pisahkan biaya halaman dari biaya alat; marquee & loop mikro murah | Jangan bawa beban produk ke halaman publik; lazy-load graf | **Jangan tiru WebGL-nya** — tiru prinsipnya (denyut, perisai) dalam CSS/SVG |
| **Mobile** | Carousel snap, CTA full-width | "Mobile support" masih coming soon — PRATA FAKTA harus lebih baik | Terminal tetap terbaca (mono kecil); graf default = tabel di 360px |
| **Yang paling layak dicuri polanya** | Blok reusable + dial/slider + marquee sumber | Rencana pipeline yang terlihat + artikel/klaim parametrik + layers graf | Terminal pipeline + denyut edge graf + angka konkret |
| **Yang harus dihindari** | Hero 3D asli (mahal) | Menunda mobile | WebGL full-scene (startup ~20 dtk) |

---

## Adaptasi prioritas tertinggi untuk PRATA FAKTA

### P1 — Terminal pipeline di Command Center (dari Cerebrium)
Tampilkan log ingestion/verifikasi sebagai terminal mono (`$` prompt, checklist ✓, progress bar blok) di `/admin` Command Center + pipeline monitoring, plus "log verifikasi" ringkas di bawah tiap artikel. **Kenapa pertama:** murah (teks + CSS), langsung menjawab diagnosis pipeline yang gagal tanpa jejak, dan memberi admin bahasa yang sudah mereka pakai. Tanpa WebGL, tanpa aset baru.

### P2 — Rencana ingestion yang terlihat sebelum eksekusi (dari Plamo)
Sebelum batch pipeline berjalan, tampilkan rencananya (sumber, jumlah klaim, ambang) dan minta konfirmasi; tiap tahap muncul bertahap dengan progres. **Kenapa kedua:** mencegah kegagalan diam-diam seperti pipeline #31, dan membuat kegagalan bisa didiagnosis dari rencananya. Murah (DOM + CSS stagger).

### P3 — Artikel & klaim parametrik: tambah sumber → FACT SCORE dihitung ulang langsung (dari Plamo)
Skor dan label bukan nilai beku — di editorial workspace, menambah/menghapus sumber menghitung ulang komponen A/B/C/D secara langsung (slider ambang dari Butter memperkuat pola ini di observatorium). **Kenapa ketiga:** ini mengubah FACT SCORE dari angka pajangan menjadi sistem yang hidup — pembeda konseptual PRATA FAKTA, sama seperti geometri parametrik adalah pembeda Plamo.

### P4 — Denyut verifikasi di graf & linimasa (dari Cerebrium, versi murah)
Edge berdenyut (SVG `stroke-dashoffset`) di `/graf` dari sumber → klaim → artikel, dan denyut sepanjang garis di `/timeline` — hanya pada jalur yang disorot, default mobile = tabel. **Kenapa keempat:** satu-satunya animasi "premium" yang biayanya mendekati nol dan langsung menjelaskan *aliran verifikasi* — interaksi yang adalah ceritanya, sesuai standar Cerebrium.

### P5 — Marquee sumber tier-1 + angka kepercayaan konkret di beranda (dari Butter + Cerebrium)
Strip sumber tepercaya yang berjalan pelan di bawah hero + grid angka nyata (artikel terverifikasi, sumber, rata-rata FACT SCORE) + headline pendek bertumpuk. **Kenapa kelima:** murah (CSS marquee + angka dari database), langsung menaikkan kesan kredibilitas pada pandangan pertama, dan menjadi fondasi visual untuk P1–P4.

**Yang sengaja TIDAK diprioritaskan:** hero 3D asli (Butter), WebGL full-scene (Cerebrium), dan workspace 3D (Plamo) — ketiganya mahal, berisiko startup lambat di Android, dan tidak menjelaskan jurnalisme verifikasi lebih baik daripada lima adaptasi di atas.

---

## Sumber

- Butter — halaman utama: https://www.butter.video/ (dibaca langsung, 19 Nov 2026 13:47 UTC)
- Butter — ulasan/desain: https://www.asphaleiasystems.com/en/work/butter-video ; https://www.must.tools/product/buttervideo ; https://www.butter.video/product ; https://www.butter.video/comparisons/after-effects
- Plamo — halaman utama: https://illoca.com/plamo (dibaca langsung, 19 Nov 2026 13:47 UTC)
- Plamo — peluncuran: https://www.constructiondive.com/press-release/20260821-illoca-brings-vibe-modeling-to-aec-plamo-the-new-agentic-3d-workspace-1/ ; https://aecmag.com/cad/illoca-brings-vibe-modelling-to-aec-with-plamo/
- Cerebrium — halaman utama: https://cerebrium.ai/ (dibaca langsung, 19 Nov 2026 13:47 UTC)
- Cerebrium — studi kasus teknis: https://tympanus.net/codrops/2026/07/23/building-cerebrium-making-serverless-infrastructure-tangible/ (KOKI-KIKO: Three.js r183.2, GSAP, MeshLine; keputusan WebGPU → WebGL; efek Fresnel; denyut shader; optimasi Draco)

*Catatan kejujuran: semua pengamatan interaksi/animasi di atas berasal dari teks halaman dan dokumentasi tertulis. Tidak ada kunjungan interaktif, hover, scroll, atau pengukuran runtime yang dilakukan. Bagian yang tidak teramati ditandai "tidak teramati — butuh browser live" di Metode & batasan, dan inferensi diberi label eksplisit di tempatnya.*
