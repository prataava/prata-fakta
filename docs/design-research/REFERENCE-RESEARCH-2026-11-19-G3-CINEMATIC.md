# Riset Referensi Desain — Grup 3: Sinematik

**Proyek:** PRATA FAKTA — platform berita & intelijen fakta (Next.js, live https://prata-fakta.vercel.app/)
**Tanggal riset:** 19 November 2026
**Grup:** G3 — Sinematik (Bruno Simon, Lando Norris, Active Theory)
**Sistem desain PRATA FAKTA saat ini:** Swiss Editorial — Inter + Source Serif 4, aksen crimson `#b91c1c`, mode terang/gelap, BottomNav kaca 6 item
**Halaman PRATA FAKTA:** beranda, artikel, cari, graf pengetahuan (`/graf`), linimasa (`/timeline`), observatorium data (`/observatorium`), pelacak klaim (`/klaim`), perpustakaan (`/perpustakaan`), glosarium (`/glosarium`), admin `/admin`
**Sifat dokumen ini:** riset + dokumentasi saja. BUKAN perubahan kode. Tidak ada aset, logo, atau layout berhak cipta yang disalin dari situs referensi — yang diadopsi hanyalah prinsip, pola interaksi, dan pola gerak.

---

## 0. Metode & batas pengamatan — baca dulu

Riset ini dilakukan **tanpa browser live interaktif**. Yang dibaca adalah:

| Situs | Cara dibaca | Hasil |
|---|---|---|
| https://bruno-simon.com/ | `browser.open` langsung | ✅ Terbaca penuh — teks halaman (170 baris, termasuk panel "Behind the scene" yang menyebut stack: Three.js, TSL, Rapier, Howler.js, font Amatic SC & Nunito) |
| https://landonorris.com/ | `browser.open` langsung | ✅ Terbaca — teks + daftar 80+ gambar (struktur halaman, seksi, galeri helm 2019–2025, toko, mitra) |
| https://activetheory.net/ | `browser.open` langsung | ❌ **Hanya halaman fallback** — seluruh isi yang terbaca: *"Your browser is not supported"* (2 baris). Ini konsisten dengan peringatan tugas: situs mengalihkan crawler/browser tanpa WebGL ke `/unsupported`. |

Untuk mengisi kekosongan itu, dilakukan pencarian web tambahan dengan kata kunci spesifik per situs (hasil pencarian dipakai sebagai sumber sekunder dan ditandai sebagai demikian di bagian sumber).

**Yang TIDAK teramati — jangan dianggap sudah diverifikasi:**

- Navigasi 3D Bruno Simon yang sebenarnya (mengemudi mobil, gerakan kamera, fisika tabrakan, siklus siang/malam, cuaca, tornado) — **tidak teramati, butuh browser live**.
- Kecepatan/kehalusan animasi scroll Lando Norris, rotasi helm 3D yang mengikuti scroll, perilaku menu kinetik, dan efek kursor — **tidak teramati, butuh browser live**.
- Pengalaman WebGL Active Theory yang sebenarnya (adegan, transisi antar proyek, choreography) — **tidak teramati sama sekali**; yang ada hanya halaman fallback + deskripsi sekunder dari pihak ketiga.
- Angka performa apa pun (FPS, ukuran bundle, LCP, waktu muat) dari ketiga situs — **tidak teramati**; semua angka performa di dokumen ini adalah perkiraan kualitatif berdasarkan arsitektur yang diketahui, bukan hasil ukur.
- Perilaku mobile nyata ketiga situs (sentuhan, frame rate di HP menengah) — **tidak teramati**; bagian mobile di bawah adalah rekomendasi adaptasi, bukan laporan pengamatan.

**Prinsip kejujuran laporan ini:** setiap klaim yang berasal dari teks halaman yang terbaca disebut "terbaca langsung"; klaim dari hasil pencarian disebut "sumber sekunder"; klaim yang tidak bisa diamati ditulis "tidak teramati — butuh browser live". Tidak ada klaim kunjungan interaktif.

---

## 1. Bruno Simon — https://bruno-simon.com/

### 1.1 Ringkasan yang terbaca langsung

Bruno Simon adalah creative developer (Prancis) yang portofolionya adalah **sebuah pulau 3D utuh yang dijelajahi dengan mengendarai mobil mainan merah**. Teks sambutan di situsnya (terbaca langsung):

> "My name is Bruno Simon, and I'm a creative developer (mostly for the web). This is my portfolio. Please drive around to learn more about me and discover the many secrets of this world. And don't break anything!"

Versi pertama situs ini rilis Oktober 2019, menarik 400.000+ pengunjung dalam beberapa bulan dan memenangkan Awwwards Site of the Month. Versi baru (folio 2025) dirilis Desember 2025 dengan target "sepuluh kali lebih baik" dari versi lama, didokumentasikan lewat devlog YouTube dan studi kasus Awwwards. Kode sumber terbuka di GitHub di bawah lisensi MIT — termasuk berkas Blender-nya.

### 1.2 (a) Apa yang membuat desainnya khas

- **Navigasi = permainan, bukan menu.** Tidak ada navigasi halaman konvensional: isi portofolio tersebar sebagai tempat di pulau — area proyek (karya dicetak di papan yang berdiri di tanah), area karier (setiap pekerjaan menjadi pita berwarna di tanah dengan lempeng batu berukir), area lab, sirkuit balap yang mengelilingi setengah pulau, bowling neon, dan "rahasia" tersembunyi. Pengunjung belajar tentang Bruno dengan *menemukan*, bukan dengan mengklik menu.
- **Diorama mainan, bukan realisme.** Kamera selalu memandang dari sudut miring yang sama (hanya bisa pan dan zoom, tidak bisa berputar); semua model low-poly dengan permukaan datar besar tanpa tekstur realistis. Hasilnya terasa seperti maket di atas meja — kohesif, ringan dibaca, dan khas. (Sumber sekunder: rickcreates.com.)
- **Antarmuka dibangun di dalam dunia 3D, bukan di atasnya.** Demi menjaga imersi, interaksi standar (klik, scroll, input keyboard, sentuhan, bahkan gamepad) dibuat ulang sebagai objek/model 3D — sedapat mungkin tanpa UI HTML tradisional. (Sumber sekunder: studi kasus Awwwards.)
- **Sistem permainan lengkap di atas portofolio:** achievements, sirkuit berwaktu dengan leaderboard harian (skor direset berkala), "whispers" — pesan publik pengunjung (maks. 30 karakter, maks. 30 pesan tersimpan, satu per pengguna), respawn, peta (tombol M), dan mode multiplayer terbatas (pengunjung lain mengemudi di dunia yang sama; server sempat tercatat offline saat dibaca — "Server currently offline. Scores can't be saved.").
- **Simulasi dunia hidup:** game loop 15 tahap yang menjalankan fisika kendaraan, siklus hari dan tahun, cuaca, angin, tornado, sistem dedaunan dan rumput (±78.400 helai rumput, masing-masing satu segitiga). (Sumber sekunder: Awwwards, jobroadmaps.)
- **Kontrol yang sangat lengkap dan terdokumentasi di halaman** (terbaca langsung): WASD/panah bergerak, SHIFT boost, CTRL/B rem, SPACE lompat, ENTER berinteraksi, M peta, L mute, T whisper, R respawn, tombol angka untuk hidrolik, klik-kiri drag untuk kamera, H klakson; di sentuhan: satu jari menggerakkan mobil, dua jari kamera/zoom, ketuk mobil untuk lompat; dukungan gamepad penuh (joystick, trigger, tombol hidrolik).
- **Transparansi teknis sebagai konten:** panel "Behind the scene" menjelaskan stack secara terbuka (Three.js, Three.js Journey, devlog, kode sumber, musik CC0 oleh Kounine, Rapier, Howler.js, font Amatic SC & Nunito) — kejujuran teknis menjadi bagian dari pengalaman.
- **Stack (terbaca langsung dari halaman + sumber sekunder):** Three.js dengan WebGPURenderer; semua shader ditulis dalam TSL (Three.js Shading Language) sehingga kode yang sama berjalan di WebGPU bila didukung dan jatuh ke WebGL bila tidak; fisika Rapier (Rust → WebAssembly; versi 2019 memakai Cannon.js); audio Howler.js; dunia dimodelkan di Blender (berkas Blender berfungsi ganda sebagai level editor — konvensi penamaan objek mengendalikan perilaku, mis. `refLandingPhysicalFixed` menjadi bodi fisika tetap); aset dikompresi lewat gltf-transform + KTX; pencahayaan memakai matcap (bukan lampu sungguhan) agar murah.

### 1.3 (b) Interaksi yang layak diadaptasi ke PRATA FAKTA

| # | Interaksi Bruno Simon | Adaptasi PRATA FAKTA |
|---|---|---|
| B-1 | Menjelajah isi dengan mengemudi / bergerak di ruang | **Peta penjelajahan `/graf`**: graf pengetahuan yang bisa di-pan/zoom dan "dikunjungi" node demi node, dengan kamera yang meluncur halus antar simpul klaim–sumber–tokoh. Bukan dunia 3D penuh — cukup canvas 2D/2.5D dengan inersia. |
| B-2 | Area tematik sebagai "tempat" (proyek, karier, lab) | **Zona di Observatorium**: tiap klaster topik menjadi "distrik" visual di `/observatorium` yang bisa dimasuki; tiap distrik menampilkan metriknya sendiri. |
| B-3 | "Rahasia" tersembunyi yang ditemukan dengan menjelajah | **Easter egg editorial**: fakta tersembunyi / kutipan arsip di `/perpustakaan` atau `/glosarium` yang muncul saat pengguna menjelajahi peta istilah — memberi alasan untuk kembali, tanpa mengganggu pencarian. |
| B-4 | Peta top-down (tombol M) sebagai orientasi | **Minimap / peta situs visual** di `/graf` dan `/timeline`: tampilan mini keseluruhan yang menunjukkan posisi pengguna di dalam linimasa/graf yang panjang. |
| B-5 | Whispers — pesan publik singkat pengunjung | **Tidak diadaptasi mentah.** Pesan publik anonim bertentangan dengan standar verifikasi PRATA FAKTA. Yang bisa diadaptasi: "jejak pembaca" terkurasi — mis. kutipan pembaca yang sudah dimoderasi di halaman liputan khusus. |
| B-6 | Achievements + leaderboard harian | **Jangan diadaptasi sebagai gamifikasi skor.** Yang layak: lencana progres membaca yang tenang (mis. "12 artikel terverifikasi dibaca minggu ini") di akun — tanpa leaderboard publik dan tanpa kompetisi. |
| B-7 | Panel "Behind the scene" yang transparan soal stack | **"Di balik verifikasi"**: di setiap artikel/liputan, panel yang menunjukkan sumber, skor FACT SCORE, dan jejak pemeriksaan — ini sudah sejalan dengan identitas PRATA FAKTA; Bruno memberi contoh cara menyajikannya sebagai konten, bukan sebagai catatan kaki kering. |
| B-8 | Kontrol keyboard lengkap + gamepad | **Navigasi keyboard penuh** untuk `/graf` dan `/timeline` (panah untuk berpindah simpul/peristiwa, Enter untuk membuka) — bermanfaat nyata untuk aksesibilitas, bukan sekadar gimmick. |

### 1.4 (c) Animasi yang layak diadaptasi

- **Kamera yang meluncur (camera glide), bukan lompatan potong (hard cut):** saat berpindah simpul di graf atau peristiwa di linimasa, kamera/pandangan bergerak halus dengan easing dan sedikit inersia. Ini satu-satunya "rasa 3D" Bruno yang paling murah dan paling aman diadaptasi.
- **Siklus siang/malam sebagai metafora waktu:** Bruno mensimulasikan waktu berjalan. Di PRATA FAKTA, gradasi terang→gelap bisa menjadi penanda visual linimasa (peristiwa lama = suasana lebih redup/dingin, peristiwa baru = lebih terang) — diterapkan sebagai pewarnaan, bukan simulasi.
- **Mikro-fisika mainan (pentalan, goyangan):** suspensi mobil yang "squash" saat mendarat adalah contoh animasi berbasis fisika yang terasa hidup. Versi PRATA FAKTA: kartu artikel yang "mendarat" dengan sedikit pegas (spring) saat difilter — cukup dengan `motion`/spring CSS, tanpa mesin fisika.
- **Yang TIDAK diadaptasi:** tornado, cuaca, rumput bergoyang 78 ribu helai, dan simulasi fisika kendaraan — biaya GPU dan kompleksitasnya tidak sebanding dengan nilai jurnalistiknya.

### 1.5 (d) Komponen relevan

- **Viewport eksplorasi + HUD minimal:** satu canvas besar + HUD tipis (judul area, kontrol, peta mini). Pola ini cocok untuk `/graf` dan `/observatorium`.
- **Panel sambutan (welcome overlay):** satu kartu perkenalan singkat + tombol mulai — pola yang bisa dipakai untuk pertama kali pengguna membuka pengalaman khusus ("Liputan Interaktif") agar mereka paham cara menggunakannya sebelum masuk.
- **Panel opsi (Options):** audio, kualitas grafis (Quality), reset, renderer — pola "pengaturan kualitas" ini WAJIB ditiru: pengguna harus bisa menurunkan/mematikan efek berat.
- **Panel pencapaian & skor:** pola kartu progres ringkas (lihat B-6 — hanya progres pribadi, bukan leaderboard).
- **Peta (Map overlay):** tampilan atas keseluruhan dunia — pola minimap untuk graf/linimasa.

### 1.6 (e) Di mana dipakai di PRATA FAKTA

- **Hero beranda — TIDAK sebagai dunia 3D.** Hero harus tetap memuat cepat dan langsung menampilkan berita utama. Yang boleh masuk hero: *rasa* Bruno — satu elemen visual yang bergerak halus (mis. garis orbit tipis / partikel debu yang sangat ringan, dimatikan bila `prefers-reduced-motion`).
- **`/graf` (graf pengetahuan) — pemakaian utama.** Inilah "pulau"-nya PRATA FAKTA: simpul klaim–sumber–tokoh sebagai tempat yang dijelajahi, kamera meluncur antar simpul, minimap, navigasi keyboard. Scope: satu halaman, opt-in, dengan fallback daftar biasa.
- **`/timeline` — pemakaian kedua.** Linimasa sebagai "jalan" yang dilalui: pengguna bergerak menyusuri peristiwa, kamera mengikuti, pewarnaan siang/malam menandai kedalaman waktu.
- **Liputan khusus / storytelling editorial — pemakaian ketiga, selektif.** Satu liputan besar per kuartal boleh memakai "peta" eksploratif ala Bruno (mis. peta lokasi peristiwa dengan titik-titik yang dibuka satu per satu). Satu liputan saja, bukan template default.
- **`/observatorium` — distrik topik** (lihat B-2).
- **YANG TIDAK BOLEH DIPAKAI di halaman baca artikel biasa (`/artikel/[slug]`):** dunia 3D apa pun, kamera bergerak, fisika, game, leaderboard, whisper, musik latar, kontrol WASD. Halaman artikel adalah ruang baca: teks, gambar, FACT SCORE, sumber, dan tombol bagikan — tanpa satu pun elemen yang menggerakkan fokus dari teks. Aturan yang sama berlaku untuk `/cari`, `/klaim`, `/glosarium`, dan seluruh `/admin`.

### 1.7 (f) Dampak performa

- **Biaya tinggi bila ditiru mentah.** Dunia Bruno adalah mesin permainan sungguhan: renderer WebGPU/WebGL + fisika Rapier (WASM) + game loop 15 tahap + puluhan ribu instance rumput + audio. Itu arsitektur yang butuh GPU diskret/flagship untuk 60 fps yang mulus.
- **Di HP Android menengah (kelas yang dipakai sebagian besar pembaca Indonesia):** ekspektasi realistis adalah frame rate jatuh, panas, dan baterai terkuras bila seluruh dunia dimuat; RAM dan unduhan aset (model GLB + tekstur KTX) juga menjadi beban di koneksi seluler. Bruno sendiri menyediakan opsi Quality dan renderer — pengakuan bahwa satu tingkat kualitas tidak cocok untuk semua perangkat.
- **Yang membuat Bruno tetap bisa jalan:** low-poly + matcap (tanpa lampu dinamis), instancing & culling (draw call ditekan), tekstur terkompresi (KTX), dan fallback WebGPU→WebGL. Pelajaran kuncinya: *gaya visual murah* (flat, low-poly, matcap) + *optimasi agresif* — bukan "3D realistis".
- **Untuk PRATA FAKTA:** anggaran performa untuk satu pengalaman khusus — hero statis tetap di bawah 100 KB JS tambahan; pengalaman graf/linimasa 3D-ringan: target < 1,5 MB aset, 30 fps minimum di HP menengah, dan **jeda render saat tab tidak terlihat / saat pengguna diam** (pause loop bila tidak ada interaksi 5 detik).

### 1.8 (g) Adaptasi mobile + fallback statis bila WebGL tidak didukung

- **Mobile:** Bruno sudah punya skema sentuhan (satu jari gerak, dua jari kamera/zoom, ketuk untuk lompat) dan itu layak ditiru polanya — tetapi untuk PRATA FAKTA, kontrol sentuh di `/graf` harus disederhanakan menjadi: seret = pan, cubit = zoom, ketuk = buka simpul. Tanpa tombol virtual mengemudi. Di layar ≤ 430px, pengalaman eksplorasi menjadi **mode "tur terpandu"**: tombol "Berikutnya" yang memindahkan kamera simpul demi simpul — tanpa perlu presisi jari.
- **Fallback bila WebGL tidak didukung (atau dimatikan pengguna):** WAJIB ada dan WAJIB setara isinya. Aturannya: (1) deteksi kemampuan sebelum memuat pustaka 3D apa pun (jangan unduh Three.js bila tidak akan dipakai); (2) fallback = **daftar + peta statis SVG** yang menampilkan simpul dan hubungan yang sama, bisa diklik, bisa dicari, dan terbaca screen reader; (3) tampilkan pesan jujur satu baris ("Mode tampilan sederhana — perangkatmu tidak mendukung tampilan 3D") tanpa nada menyalahkan; (4) jangan pernah menampilkan halaman kosong atau "browser not supported" tanpa isi — inilah pelajaran dari Active Theory di bawah.
- **`prefers-reduced-motion`:** semua gerakan kamera dimatikan — perpindahan simpul menjadi potongan instan (cut), tanpa luncuran.

---

## 2. Lando Norris — https://landonorris.com/

### 2.1 Ringkasan yang terbaca langsung

Situs resmi pembalap F1 McLaren Lando Norris, dibuat oleh studio Skotlandia OFF+BRAND, pemenang **Awwwards Site of the Year 2025** (dan Site of the Day dengan skor 8,18/10). Dibangun di atas Webflow, dengan WebGL untuk 3D dan GSAP untuk transisi (sumber sekunder: codewebbarcelona, itsrawsignal). Teks yang terbaca langsung menunjukkan struktur halaman:

- Hero: "2025 McLaren Formula 1 Driver", "Next Race", "mclaren f1 since 2019", nama besar LANDO NORRIS, "tap to lock" / "Back to scroll".
- "Message from Lando" dengan tanda tangan dan kutipan: *"Redefining limits, fighting for wins, bringing it all in all ways. Defining a legacy in Formula 1 on and off the track."*
- Seksi **OFF TRACK** (kampanye, pemotretan, materi promosi) dan hasil/stats/foto terbaru dari trek.
- **Helmets Hall of Fame** — galeri helm per musim 2019–2025 (Season, Discoball, Dark Glitter, Porcelain, Japan, GIF, Dark Mode, Race, Las Vegas, Chrome, Beachball, Basketball, Silverstone) — tiap helm punya gambar dasar + gambar hover (terbaca dari pasangan file `*-base.webp` / `*-hover.webp`).
- Seksi toko: "World Drivers' Champion" — koleksi perayaan gelar juara dunia.
- Seksi **partners & campaigns** — logo mitra (Quadrant, Mind, TUMI, Ralph Lauren, PlayStation, dan lain-lain).

### 2.2 (a) Apa yang membuat desainnya khas

- **Satu warna aksen, dipakai dengan disiplin militer.** Hanya dua warna: neon lime `#D2FF00` dan hitam pekat `#111112` (sumber sekunder). Lime bukan dekorasi — ia adalah sistem: penanda, sorotan, dan "kecepatan" itu sendiri. PRATA FAKTA punya padanan: crimson `#b91c1c` — pelajaran dari Lando adalah *satu aksen, dipakai konsisten di semua momen penting*, bukan menambah warna baru di tiap halaman.
- **Fotografi besar mendahului teks.** Kepribadian dibangun dari foto (helm, trek, paddock, gaya hidup) sebelum pembaca membaca satu paragraf biografi. Struktur narasi: gambar dulu, kata kemudian.
- **Scrollytelling sebagai biografi.** Karier diceritakan sebagai perjalanan: musim demi musim, pencapaian demi pencapaian, dengan animasi yang menekankan progresi. Bukan resume — pertunjukan (sumber sekunder: codewebbarcelona).
- **Helm sebagai objek koleksi, bukan gambar produk.** Galeri Helmets Hall of Fame memperlakukan tiap helm sebagai artefak dengan nama, tahun, dan dua keadaan visual (base/hover). Ini adalah pola "arsip benda" — sangat relevan untuk arsip visual jurnalistik.
- **Kinetic UX:** menu yang bergerak/bernapas merespons gerakan pengguna; setiap scroll memicu gerak kinetik; kursor memicu pergeseran halus; latar berdenyut dengan cahaya (sumber sekunder). Situs terasa "hidup bahkan sebelum scroll".
- **Helm 3D yang berputar mengikuti bacaan** (sumber sekunder: metabole.studio) — objek 3D tunggal yang terikat pada scroll, bukan dunia 3D bebas.
- **Dua dunia, satu merek:** ON TRACK (hasil, statistik, balapan) vs OFF TRACK (kampanye, gaya hidup, kemitraan) — pemisahan editorial yang tegas dan mudah dipahami.
- **Kejujuran komersial:** toko dan mitra diberi ruang sendiri yang jelas, tidak disamarkan menjadi konten editorial.

### 2.3 (b) Interaksi yang layak diadaptasi ke PRATA FAKTA

| # | Interaksi Lando Norris | Adaptasi PRATA FAKTA |
|---|---|---|
| L-1 | Scrollytelling bab demi bab (musim → musim) | **Template "Liputan Khusus" scrollytelling**: satu peristiwa besar diceritakan dalam 5–8 bab; tiap bab = satu layar (foto besar + satu paragraf + satu fakta kunci). Dipakai untuk liputan investigasi/eksklusif, bukan untuk artikel harian. |
| L-2 | Objek 3D tunggal yang berputar mengikuti scroll (helm) | **Objek 3D tunggal di liputan khusus**: mis. model sederhana (bukan fotorealistik) yang berputar pelan mengikuti scroll — contoh: globe untuk liputan geopolitik, atau diagram 3D struktur organisasi. Satu objek, satu halaman, dengan fallback gambar statis. |
| L-3 | Galeri artefak bernama + bertahun (helm base/hover) | **"Arsip Visual" / galeri bukti di `/perpustakaan`**: tiap dokumen/foto bukti punya kartu bernama + tahun + keadaan hover yang memperlihatkan detail (mis. zoom ke bagian dokumen). Juga pola untuk galeri foto liputan. |
| L-4 | Pemisahan ON TRACK / OFF TRACK | **Pola dua mode di beranda/observatorium**: "Fakta Terkini" vs "Konteks & Arsip" — dua arus yang dipisah secara visual, bukan dicampur dalam satu daftar. |
| L-5 | "Message from Lando" — suara orang pertama | **"Catatan Redaksi" di liputan khusus**: satu blok suara redaksi (1–2 kalimat + tanda tangan redaktur) yang memberi konteks manusiawi tanpa mencampuri fakta artikel. |
| L-6 | "Tap to lock / Back to scroll" — kontrol mode tampilan | **Mode "Fokus Baca"**: satu ketukan mengunci tampilan bebas gangguan (menyembunyikan nav/animasi), ketukan lagi kembali ke scroll normal. Cocok untuk artikel panjang. |
| L-7 | Menu kinetik yang merespons gerakan | **Diadaptasi sangat ringan**: BottomNav PRATA FAKTA boleh "bernapas" (indikator aktif meluncur, bukan melompat) — tetapi menu tidak boleh bergerak mengikuti kursor; itu mengganggu di perangkat sentuh. |
| L-8 | Toko & mitra sebagai seksi terpisah yang jelas | **Pola pemisahan komersial/editorial**: bila PRATA FAKTA kelak punya dukungan/mitra, tempatkan di seksi terpisah berlabel jelas — jangan sisipkan ke dalam aliran artikel. |

### 2.4 (c) Animasi yang layak diadaptasi

- **Transisi scroll yang "cepat, terkendali, meledak"** (karakter F1): durasi pendek (150–250 ms), easing tegas (bukan lembut mengambang), jeda antar elemen kecil dan teratur (stagger). PRATA FAKTA bisa mengadopsi *ritme* ini untuk transisi antar bab liputan khusus — cepat dan percaya diri, bukan lambat dan dramatis.
- **Teks besar yang meluncur masuk per baris (line reveal):** judul liputan khusus muncul baris demi baris saat masuk viewport. Murah (CSS/GSAP), berdampak besar, dan aman.
- **Gambar hover dua keadaan (base → hover):** pola murah yang sudah terbukti di galeri helm — gambar kedua (detail/zoom) muncul saat hover/fokus. Langsung bisa dipakai di galeri arsip tanpa WebGL sama sekali.
- **Parallax halus pada foto hero (bukan pada teks):** foto bergerak sedikit lebih lambat dari scroll — memberi kedalaman sinematik tanpa mengorbankan keterbacaan. Batasi ke ±8% pergeseran dan matikan bila `prefers-reduced-motion`.
- **Angka statistik yang menghitung naik (count-up):** statistik balapan Lando menjadi pola untuk statistik di `/observatorium` (jumlah klaim terverifikasi, sumber, dsb.) — angka menghitung naik saat masuk viewport.
- **Yang TIDAK diadaptasi:** denyut latar terus-menerus, gerakan mengikuti kursor di seluruh halaman, dan animasi yang menumpuk berlapis-lapis ("text glides, images slide, animations layer on top of one another" — sumber sekunder). Di situs berita, lapisan gerak yang menumpuk = gangguan baca.

### 2.5 (d) Komponen relevan

- **Hero sinematik satu layar:** nama besar + satu gambar/foto + satu baris status ("Next Race" → padanan PRATA FAKTA: "Fakta terbaru terverifikasi hari ini"). Pola ini adalah kandidat hero beranda baru (lihat §2.6).
- **Kartu statistik balapan:** hasil terbaru + statistik karier dalam kartu ringkas — pola untuk kartu ringkas `/observatorium` dan `/klaim`.
- **Galeri artefak (helm):** kartu gambar + nama + tahun + hover state — pola untuk `/perpustakaan`.
- **Blok kutipan bertanda tangan:** kutipan + tanda tangan visual — pola untuk "Catatan Redaksi" dan kutipan narasumber di artikel.
- **Seksi mitra berlogo:** deretan logo dalam satu baris — pola untuk halaman "Sumber & Mitra" bila diperlukan.
- **Kartu toko/koleksi:** gambar + judul + ajakan — pola untuk mempromosikan liputan khusus ("Baca liputan lengkap").

### 2.6 (e) Di mana dipakai di PRATA FAKTA

- **Hero beranda — pemakaian utama Lando.** Hero baru: foto/gambar besar satu layar + judul besar + satu baris status faktual + satu ajakan ("Baca liputan utama"). Ini adalah adaptasi paling berharga dari grup ini: sinematik tanpa 3D, hanya fotografi + tipografi + gerak halus. Tetap jaga agar headline + 3 berita teratas terlihat tanpa scroll berlebih di HP.
- **Liputan khusus — pemakaian kedua.** Template scrollytelling L-1 + objek 3D tunggal L-2 + blok catatan redaksi L-5. Satu template, dipakai untuk liputan besar saja.
- **`/perpustakaan` — galeri artefak L-3.** Kartu dokumen/foto bukti bernama + bertahun + hover detail.
- **`/observatorium` — kartu statistik + count-up** (lihat §2.4).
- **`/timeline` — ritme bab demi bab:** tiap era/peristiwa besar dibuka dengan judul besar bergaya Lando (tipografi besar, satu aksen) sebelum masuk ke detail.
- **YANG TIDAK BOLEH DIPAKAI di halaman baca artikel biasa:** scrollytelling bab demi bab, parallax pada teks, objek 3D mengikuti scroll, denyut latar, animasi kursor, dan tipografi raksasa yang mendorong teks ke bawah. Artikel harian tetap memakai template Swiss Editorial yang tenang: judul, dek, isi, FACT SCORE, sumber. Sinematik adalah mode khusus, bukan mode default.

### 2.7 (f) Dampak performa

- **Paling murah dari ketiga situs grup ini bila diadaptasi dengan benar.** Inti Lando adalah fotografi + CSS/GSAP + satu objek WebGL — bukan dunia 3D. Webflow + GSAP + WebGL satu objek adalah beban yang masuk akal.
- **Biaya sebenarnya ada di aset gambar:** halaman yang terbaca memuat 80+ gambar (banyak file `.webp` di CDN Webflow, plus pasangan base/hover per helm). Tanpa lazy-loading dan tanpa `srcset`/ukuran responsif, halaman seperti ini berat di HP. Pelajaran: galeri harus memakai lazy-load agresif, `next/image` dengan ukuran tepat, dan pasangan hover hanya dimuat saat hover/fokus (atau diganti efek CSS).
- **Di HP Android menengah:** scrollytelling GSAP + parallax + count-up umumnya masih lancar bila animasi memakai `transform`/`opacity` saja (tidak memicu layout). Yang berisiko: gambar hero besar yang tidak dioptimasi + WebGL helm yang berjalan terus — solusinya: hentikan render WebGL saat objek di luar viewport (IntersectionObserver) dan sediakan gambar statis sebagai pengganti.
- **Perkiraan biaya adaptasi PRATA FAKTA:** hero foto + line reveal + count-up ≈ hampir nol biaya tambahan (CSS + sedikit JS); satu objek 3D scroll-bound ≈ 150–400 KB pustaka (Three.js) + model, hanya dimuat di halaman liputan khusus yang memakainya.

### 2.8 (g) Adaptasi mobile + fallback statis bila WebGL tidak didukung

- **Mobile:** Lando adalah situs yang "mobile-first" dalam praktiknya (teks terbaca menyebut varian SVG khusus mobile — `ln4-lando-norris-text-mobile.svg`). Pelajaran: sediakan aset hero khusus mobile (potret, lebih ringan), tipografi besar yang mengecil proporsional, dan galeri yang menjadi carousel geser-satu-kartu di layar kecil (bukan grid 3 kolom yang menyusut).
- **Tanpa interaksi hover di sentuh:** semua efek hover (helm base→hover, kartu) WAJIB punya padanan ketuk (tap = tampilkan keadaan kedua; ketuk lagi = kembali). Jangan ada informasi yang hanya bisa diakses lewat hover.
- **Fallback bila WebGL tidak didukung:** objek 3D helm/objek liputan diganti gambar statis berkualitas tinggi (satu frame render terbaik) + keterangan yang sama. Scrollytelling tetap bekerja penuh tanpa WebGL karena intinya adalah scroll + CSS. Tidak ada halaman "not supported" — pengguna tanpa WebGL tetap membaca liputan yang sama, hanya tanpa putaran objek.
- **`prefers-reduced-motion`:** parallax, count-up (tampilkan angka akhir langsung), dan line reveal dimatikan; scrollytelling menjadi bab statis biasa.

---

## 3. Active Theory — https://activetheory.net/

### 3.1 Ringkasan yang terbaca langsung — dan batasnya

**Yang terbaca langsung dari situsnya hanya ini:**

> "Your browser is not supported"

Itu seluruh isi halaman yang dikembalikan crawler (2 baris, di-crawl 4 jam sebelum riset). Ini adalah **temuan riset yang penting, bukan kegagalan riset**: Active Theory mengalihkan pengunjung yang browsernya tidak lolos uji WebGL ke halaman `/unsupported` — dan crawler teks ini termasuk yang dialihkan.

**Apa yang diketahui dari sumber sekunder (ditandai sebagai demikian):**

- Active Theory adalah studio teknologi kreatif di Los Angeles (didirikan musim panas 2012 oleh Andy Thelander, Michael Anthony, dan Nick Mountford; juga berkantor di Amsterdam) yang membangun pengalaman web interaktif, 3D, AR, VR, dan game di browser untuk merek besar (Google Creative Lab & I/O — game *Paper Planes* 2016 dimainkan di 180+ negara, Pottermore, Nike).
- Situsnya sendiri adalah **pengalaman WebGL layar penuh** — "the site itself, as a WebGL experience" — dibangun di atas toolset 3D internal studio. HTML yang dikirim server sebelum JavaScript berjalan hanya berisi **6 kata yang terlihat** (sumber sekunder: dardo.studio, pengukuran 12 November 2026). Deskripsi halaman: *"Founded in 2012. We blend story, art & technology as an in-house team of passionate makers."*
- Menurut satu ulasan sekunder (dappasol.com, pengecekan 12 Oktober 2026), ada **lapisan teks tersembunyi untuk aksesibilitas di belakang canvas** — "the unglamorous bit most 3D sites skip" — dan adegannya digambarkan "restraint" (terkendali, membiarkan karya yang memimpin).
- Stack yang dilaporkan sumber sekunder: Three.js untuk render 3D, GSAP untuk pewaktuan animasi dan scroll-triggered storytelling, shader WebGL kustom (GLSL), dengan WebGPU sebagai penerus WebGL.
- Biaya produksi kelas ini dilaporkan berada di kisaran **enam digit dolar** untuk flagship (sumber sekunder: dappasol, mdx.so — estimasi pasar umum, bukan kutipan harga studio).

### 3.2 (a) Apa yang membuat desainnya khas

- **Situs = karya, bukan brosur karya.** Untuk studio yang menjual pengalaman interaktif, situsnya sendiri adalah bukti paling kuat — pengunjung merasakan keahliannya sebelum membaca satu kata pun. (Sumber sekunder.)
- **Pengekangan (restraint) di dalam kemewahan.** Berbeda dengan Bruno Simon yang membangun dunia seluas mungkin, adegan Active Theory dilaporkan terkendali: satu panggung WebGL layar penuh, karya yang memimpin, tanpa kekacauan. (Sumber sekunder: dappasol.)
- **Perpaduan cerita + seni + teknologi sebagai satu tim internal** — desainer dan engineer bekerja berdampingan, plus toolset 3D internal agar desainer bisa mengekspor elemen 3D tanpa banyak hand-coding. Model kerja ini relevan sebagai pelajaran organisasi, bukan hanya desain.
- **Lab eksperimental** (mis. *World Brush*, aplikasi AR untuk melukis di ruang nyata) — studio menyisihkan waktu untuk eksperimen yang kemudian menjadi produk klien. (Sumber sekunder.)
- **Lapisan teks tersembunyi untuk aksesibilitas di belakang canvas** — konten tetap ada dalam HTML untuk screen reader dan mesin pencari, walau visualnya adalah WebGL. (Sumber sekunder: dappasol.)

### 3.3 (b) Interaksi yang layak diadaptasi ke PRATA FAKTA

| # | Interaksi Active Theory | Adaptasi PRATA FAKTA |
|---|---|---|
| A-1 | Panggung WebGL layar penuh sebagai pintu masuk | **Satu "pintu masuk sinematik" opsional** — mis. halaman pembuka liputan khusus tahunan yang imersif, dengan tombol jelas "Masuk ke liputan" / "Lewati ke teks". Tidak pernah sebagai pintu masuk situs utama. |
| A-2 | Karya memimpin, UI menghilang | **Prinsip "konten dulu, chrome kemudian"**: di liputan khusus, navigasi dan UI mengecil/menghilang saat membaca, muncul kembali saat scroll ke atas. Sudah sejalan dengan mode Fokus Baca (L-6). |
| A-3 | Lapisan teks HTML di belakang canvas | **WAJIB di semua adaptasi 3D PRATA FAKTA**: setiap pengalaman WebGL harus punya padanan HTML lengkap (judul, paragraf, tautan) di dalam DOM — untuk SEO (Google Discover/Top Stories), screen reader, dan crawler. Ini adalah syarat, bukan opsi. |
| A-4 | Transisi antar proyek yang dikoreografi (GSAP timeline) | **Transisi antar bab liputan khusus** dengan timeline GSAP yang sama: satu gerakan kamera/teks yang membawa pembaca dari satu bab ke bab berikut — bukan potongan kasar. |
| A-5 | Lab eksperimental | **"Lab PRATA FAKTA"**: satu halaman `/lab` (atau seksi Observatorium) tempat eksperimen visual diuji secara terbuka dan berlabel "eksperimen" — sehingga inovasi tidak mencemari halaman berita utama. |

### 3.4 (c) Animasi yang layak diadaptasi

- **Koreografi scroll GSAP (ScrollTrigger):** pola industri standar untuk scrollytelling — pinning seksi, scrub (animasi terikat posisi scroll), dan timeline bab. Inilah teknologi yang sama dengan yang dipakai Lando; Active Theory menegaskan pola ini sebagai standar studio kelas atas. Untuk PRATA FAKTA: pakai GSAP ScrollTrigger (atau `motion` yang sudah dipakai di PRATA ENGLISH) hanya di template liputan khusus.
- **Transisi panggung (stage transitions):** perpindahan antar "adegan" dengan satu gerakan kamera + fade teks yang sinkron — diadaptasi sebagai transisi antar bab liputan khusus (lihat A-4).
- **Shader kustom sebagai aksen, bukan sebagai isi:** distorsi/glitch/air sebagai lapisan visual tipis di atas foto hero liputan khusus — efek yang murah bila dipakai pada satu elemen, mahal bila di seluruh halaman. Rekomendasi: satu shader ringan (mis. grain + vignette bergerak halus) di hero liputan khusus saja.
- **Yang TIDAK diadaptasi:** panggung WebGL layar penuh sebagai struktur situs; shader berat di seluruh halaman; pengalaman yang hanya bisa diakses lewat WebGL.

### 3.5 (d) Komponen relevan

- **Panggung layar penuh (fullscreen stage):** canvas WebGL + lapisan teks HTML di belakangnya — pola arsitektur untuk halaman pembuka liputan khusus (A-1 + A-3).
- **Kartu proyek sinematik:** satu gambar besar + judul + tahun + peran — pola untuk kartu liputan khusus di beranda.
- **Navigasi minimal yang menghilang:** nav yang memudar saat pengguna tenggelam dalam pengalaman — pola untuk mode Fokus Baca.
- **Halaman "Lab":** daftar eksperimen berlabel — pola untuk inovasi yang aman (A-5).
- **Halaman fallback `/unsupported` — sebagai ANTI-POLA:** inilah yang harus dihindari (lihat §3.6).

### 3.6 (e) Di mana dipakai di PRATA FAKTA — dan pelajaran terbesarnya

**Pelajaran terbesar dari Active Theory justru datang dari kegagalannya diamati: gerbang WebGL.**

Situs yang mengunci seluruh konten di balik gerbang WebGL akan menampilkan **halaman kosong bagi sebagian pengunjung nyata** — bukan hanya crawler: pengguna dengan GPU lama, driver bermasalah, WebGL dimatikan administrator, mode hemat daya, atau browser lama. Enam kata dalam HTML awal berarti: tanpa JavaScript + WebGL, situs ini hampir tidak ada. Untuk platform berita yang ingin muncul di Google Discover/Top Stories, ini adalah kegagalan arsitektur — mesin pencari dan crawler AI tidak mengeksekusi WebGL.

**Aturan yang diturunkan untuk PRATA FAKTA:**

1. **Tidak ada konten PRATA FAKTA yang boleh dikunci di balik gerbang WebGL.** WebGL hanya boleh menjadi *lapisan presentasi* di atas konten HTML yang lengkap.
2. **Halaman `/unsupported` tidak boleh ada di PRATA FAKTA.** Yang ada adalah *mode tampilan sederhana* yang otomatis aktif dan tetap menampilkan seluruh isi.
3. **Pemakaian yang diizinkan:**
   - **Halaman pembuka liputan khusus tahunan (A-1):** satu panggung imersif opsional, dengan tombol "Lewati" yang selalu terlihat dan konten lengkap di bawahnya.
   - **Template liputan khusus:** koreografi GSAP + satu shader aksen (§3.4).
   - **`/lab` eksperimen (A-5).**
4. **YANG TIDAK BOLEH DIPAKAI di halaman baca artikel biasa, beranda utama, `/cari`, `/klaim`, `/graf`, `/timeline`, `/observatorium`, `/perpustakaan`, `/glosarium`, dan `/admin`:** panggung WebGL layar penuh, pengalaman yang membutuhkan WebGL untuk membaca konten, dan segala bentuk pengalihan "browser not supported".

### 3.7 (f) Dampak performa

- **Biaya tertinggi dari ketiga situs bila ditiru mentah.** Panggung WebGL layar penuh + shader GLSL kustom + GSAP + aset 3D adalah beban GPU yang berkelanjutan (render loop terus berjalan), bukan sekali muat. Di HP Android menengah: panas, baterai terkuras, dan risiko frame drop tinggi — terutama bila shader memakai efek per-piksel yang berat.
- **Biaya produksi juga tertinggi:** estimasi pasar umum untuk flagship kelas ini adalah enam digit dolar (sumber sekunder) — PRATA FAKTA tidak akan meniru skala itu; yang diadopsi hanyalah *pola* (panggung + lapisan teks + koreografi), dibangun dengan pustaka yang sudah ada (`motion`, Three.js seperlunya) oleh tim yang sama.
- **Biaya SEO adalah yang paling berbahaya:** 6 kata dalam HTML awal = hampir tidak ada konten untuk mesin pencari. PRATA FAKTA yang mengandalkan Discover/Top Stories tidak boleh mengulang ini. Setiap halaman dengan WebGL wajib lolos uji "matikan JavaScript, konten tetap terbaca".
- **Anggaran performa untuk adaptasi PRATA FAKTA:** panggung liputan khusus hanya dimuat setelah interaksi/ketukan pengguna ("Masuk ke pengalaman"), bukan otomatis; render loop dijeda saat di luar viewport; shader dibatasi ke satu pass ringan; target: tidak menambah > 500 KB pada muatan awal halaman mana pun.

### 3.8 (g) Adaptasi mobile + fallback statis bila WebGL tidak didukung

- **Mobile:** panggung layar penuh WebGL adalah kasus terburuk di HP — layar kecil + GPU lemah + baterai. Aturan: di layar ≤ 768px, panggung imersif **tidak dimuat sama sekali secara default**; pengguna melihat versi foto + teks, dengan tombol opsional "Coba versi interaktif" yang memuat WebGL atas permintaan. Ini membalik logika Active Theory: mobile mendapat yang ringan dulu, yang berat hanya bila diminta.
- **Fallback bila WebGL tidak didukung — ini inti pelajarannya:** (1) deteksi WebGL sebelum memuat pustaka apa pun; (2) bila tidak didukung, tampilkan **versi lengkap berbasis HTML/foto** — bukan halaman "browser not supported"; (3) jangan pernah mengalihkan (redirect) pengguna ke halaman fallback terpisah — ganti mode di halaman yang sama agar URL, SEO, dan tautan berbagi tetap sama; (4) beri tahu dengan jujur dalam satu baris netral ("Menampilkan versi sederhana"), tanpa menyalahkan perangkat pengguna.
- **`prefers-reduced-motion` + `save-data`:** bila pengguna mengaktifkan penghemat data (`Save-Data` header / `navigator.connection.saveData`), jangan tawarkan versi interaktif sama sekali.

---

## 4. Matriks perbandingan

| Dimensi | Bruno Simon | Lando Norris | Active Theory |
|---|---|---|---|
| **Inti pengalaman** | Dunia 3D penuh yang dijelajahi (game) | Scrollytelling foto + 1 objek 3D | Panggung WebGL layar penuh |
| **Teknologi utama** | Three.js + TSL (WebGPU→WebGL), Rapier (WASM), Howler.js, Blender | Webflow + WebGL + GSAP | Three.js + GSAP + shader GLSL kustom, toolset internal |
| **Yang khas** | Navigasi = mengemudi; dunia mainan low-poly; rahasia tersembunyi | Satu aksen lime `#D2FF00` + hitam; foto besar dulu; helm sebagai artefak | Situs = karya; restraint; lapisan teks tersembunyi |
| **Keterbacaan langsung (riset ini)** | ✅ Teks lengkap terbaca | ✅ Teks + 80 gambar terbaca | ❌ Hanya "Your browser is not supported" |
| **Biaya performa** | Tinggi (game loop + fisika + 78rb instance rumput) | Rendah–sedang (foto + 1 objek 3D) | Tertinggi (panggung penuh + shader) |
| **Biaya SEO** | Rendah (konten di dalam dunia 3D, tapi ada teks HTML) | Rendah (Webflow, konten HTML nyata) | **Sangat tinggi (6 kata di HTML awal)** |
| **Mobile** | Skema sentuh lengkap, tapi berat | Aset mobile khusus; galeri jadi carousel | Panggung penuh = kasus terburuk di HP |
| **Fallback tanpa WebGL** | Ada opsi Quality/renderer; dunia tetap butuh WebGL | Sangat baik (foto + teks tetap utuh) | **Buruk — halaman `/unsupported`** |
| **Nilai terbesar untuk PRATA FAKTA** | Kamera meluncur + minimap + peta eksplorasi `/graf` | Hero foto sinematik + template scrollytelling liputan khusus | Prinsip lapisan teks HTML + peringatan gerbang WebGL |
| **Risiko terbesar bila ditiru** | Seluruh aplikasi menjadi game | Gerak berlapis mengganggu baca | Konten terkunci di balik WebGL |
| **Cocok untuk** | `/graf`, `/timeline`, 1 liputan/kuartal | Hero beranda, liputan khusus, `/perpustakaan` | 1 pembuka liputan tahunan, `/lab` |
| **Dilarang untuk** | Halaman artikel, `/cari`, `/admin` | Halaman artikel biasa | Semua halaman utama + artikel |

---

## 5. Adaptasi prioritas tertinggi untuk PRATA FAKTA (3D hanya selektif)

### Prioritas 1 — Hero beranda sinematik ala Lando (tanpa 3D)
Foto besar satu layar + judul besar + satu baris status faktual + line reveal + parallax foto yang sangat halus. **Dampak:** perubahan paling terlihat dari pandangan pertama; biaya hampir nol (CSS + foto yang sudah ada); risiko hampir nol; tidak butuh WebGL. Jaga agar 3 berita teratas tetap terlihat tanpa scroll berlebih di HP.

### Prioritas 2 — Template "Liputan Khusus" scrollytelling (Lando + Active Theory)
Satu template untuk liputan besar: 5–8 bab, tiap bab satu layar (foto besar + satu paragraf + satu fakta kunci), transisi GSAP yang cepat dan tegas, count-up statistik, blok "Catatan Redaksi", dan satu objek 3D tunggal yang berputar mengikuti scroll (dengan fallback gambar statis). Dipakai untuk liputan besar saja — bukan artikel harian. **Syarat keras:** seluruh teks liputan ada di HTML (prinsip Active Theory A-3) dan lolos uji "matikan JavaScript, konten tetap terbaca".

### Prioritas 3 — Graf pengetahuan sebagai peta yang dijelajahi (Bruno Simon)
`/graf` menjadi ruang eksplorasi: kamera meluncur antar simpul klaim–sumber–tokoh, minimap, navigasi keyboard (panah + Enter), mode tur terpandu di HP (tombol "Berikutnya"), dan fallback daftar + peta SVG statis bila WebGL tidak didukung. **Batasan:** canvas 2D/2.5D ringan dulu; 3D penuh hanya bila terbukti ringan — jangan membangun "pulau" sebelum versi ringannya terbukti dipakai pembaca.

### Prioritas 4 — Aturan fallback & lapisan teks (pelajaran Active Theory) — berlaku untuk semua adaptasi
Sebelum satu baris WebGL ditulis: (a) deteksi kemampuan sebelum memuat pustaka 3D; (b) konten lengkap selalu ada di HTML; (c) tidak ada halaman `/unsupported` dan tidak ada redirect fallback — mode sederhana di halaman yang sama; (d) `prefers-reduced-motion` mematikan semua gerak kamera/parallax; (e) pengaturan kualitas (ala Bruno: Quality, audio, reset) terlihat oleh pengguna; (f) render dijeda saat di luar viewport atau saat pengguna diam. Ini bukan fitur — ini **gerbang kelayakan**: adaptasi 1–3 tidak boleh dibangun tanpa ini.

### Prioritas 5 — Galeri artefak & arsip visual (Lando) + distrik topik (Bruno)
`/perpustakaan`: kartu dokumen/foto bukti bernama + bertahun + hover/tap dua keadaan (detail zoom). `/observatorium`: klaster topik sebagai "distrik" visual dengan kartu statistik count-up. Keduanya tanpa WebGL, murah, dan langsung memperkuat identitas PRATA FAKTA sebagai platform intelijen fakta — bukan sekadar situs berita.

---

## 6. Yang TIDAK boleh dipakai — daftar larangan

Berlaku untuk seluruh situs, terutama halaman baca artikel biasa (`/artikel/[slug]`), `/cari`, `/klaim`, `/glosarium`, dan `/admin`:

1. Dunia 3D penuh / seluruh aplikasi sebagai landing 3D.
2. Konten yang dikunci di balik gerbang WebGL; halaman "browser not supported"; redirect ke halaman fallback.
3. Musik latar otomatis, efek suara, dan autoplay apa pun.
4. Gamifikasi skor/leaderboard publik; pesan publik anonim (whispers).
5. Gerak yang mengikuti kursor di seluruh halaman; denyut latar terus-menerus; animasi berlapis yang menumpuk.
6. Navigasi yang mengharuskan WASD/gamepad; kontrol yang tidak bisa dipakai dengan keyboard biasa atau sentuhan.
7. Informasi yang hanya bisa diakses lewat hover (tanpa padanan ketuk/fokus).
8. Parallax pada teks; tipografi raksasa yang mendorong isi artikel ke bawah.
9. Shader berat, simulasi fisika, cuaca, dan partikel ribuan instance di halaman mana pun kecuali satu pengalaman khusus yang opt-in.
10. Pemuatan pustaka 3D (Three.js dkk.) di halaman yang tidak memakai 3D.

---

## 7. Batasan pengamatan (kejujuran riset)

- **Bruno Simon:** teks halaman terbaca penuh; perilaku mengemudi, gerakan kamera, fisika, siklus siang/malam, dan performa nyata **tidak teramati — butuh browser live**. Klaim soal detail dunia (78.400 helai rumput, game loop 15 tahap, matcap) berasal dari sumber sekunder (studi kasus Awwwards, rickcreates.com, jobroadmaps.com, woah.dev).
- **Lando Norris:** teks + struktur gambar terbaca; kehalusan scroll, rotasi helm 3D, menu kinetik, dan efek kursor **tidak teramati — butuh browser live**. Klaim soal Webflow/GSAP/WebGL, warna `#D2FF00`/`#111112`, dan penghargaan Awwwards berasal dari sumber sekunder (codewebbarcelona, itsrawsignal, designerly, metabole.studio).
- **Active Theory:** situs aslinya **tidak teramati sama sekali** — hanya halaman fallback *"Your browser is not supported"*. Seluruh deskripsi pengalamannya berasal dari sumber sekunder (dardo.studio, dappasol.com, subarnopaul.com, mdx.so). Bagian §3 di atas harus dibaca sebagai "apa kata pihak ketiga + apa yang diajarkan gerbangnya", bukan sebagai laporan kunjungan.
- **Tidak ada angka performa terukur** (FPS, bundle, LCP) untuk situs mana pun dalam riset ini; semua penilaian performa adalah perkiraan berdasarkan arsitektur yang diketahui.
- **Tidak ada pengamatan mobile nyata** untuk situs mana pun; rekomendasi mobile adalah adaptasi, bukan laporan.

---

## 8. Sumber

**Dibaca langsung (browser.open, 19 November 2026):**

- https://bruno-simon.com/ — teks halaman penuh (170 baris), di-crawl < 1 menit sebelum dibaca.
- https://landonorris.com/ — teks + daftar gambar (220 baris, 80+ gambar), di-crawl < 1 menit sebelum dibaca.
- https://activetheory.net/ — hanya *"Your browser is not supported"* (2 baris), di-crawl 4 jam sebelum dibaca.

**Sumber sekunder (hasil pencarian web, 19 November 2026 — dipakai hanya untuk mengisi yang tidak terbaca langsung):**

- Bruno Simon: https://rickcreates.com/r/2026-01-21-brunos-portfolio ; https://woah.dev/sightings/drive-through-a-resume/ ; https://jobroadmaps.com/portfolios/bruno-simon ; https://www.awwwards.com/brunos-portfolio-case-study.html
- Lando Norris: https://metabole.studio/en/blog/immersive-website-examples ; https://designerly.com/lando-norris/ ; https://codewebbarcelona.com/en/featured-web-design-lando-norris/ ; https://www.itsrawsignal.com/lando-norris.html ; https://www.pwr-gfx.com/post/lando-norris-new-website
- Active Theory: https://dardo.studio/en/blog/best-web-design-agency-websites/ ; https://subarnopaul.com/blog/active-theory-review-2026-pricing-services-pros-cons ; https://dappasol.com/guides/3d-website-examples/ ; https://dappasol.com/guides/best-3d-animation-website-design-companies/ ; https://mdx.so/blog/top-3d-web-design-agencies-2026

**Catatan hak cipta:** tidak ada aset, logo, gambar, atau layout dari ketiga situs yang disalin ke dokumen ini. Nama, warna aksen (`#D2FF00`, `#111112`), dan kutipan singkat dicantumkan sebagai fakta referensi untuk keperluan riset desain, bukan untuk dipakai ulang sebagai identitas PRATA FAKTA.
