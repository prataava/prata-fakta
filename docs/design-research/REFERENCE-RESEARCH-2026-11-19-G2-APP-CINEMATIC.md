# Riset Referensi Desain — Grup 2: Premium App + Sinematik

**Proyek:** PRATA FAKTA — platform berita & intelijen fakta (Next.js, live di https://prata-fakta.vercel.app/)
**Tanggal riset:** 19 November 2026
**Grup:** G2 — Premium App + Sinematik
**Situs yang diteliti:** Linear (linear.app), Raycast (raycast.com), Aether 1 (aether1.ai)
**Penulis:** riset subagen (mandiri, tanpa subagen lanjutan)
**Status:** Riset + dokumentasi saja — TIDAK ada perubahan kode.

> **Catatan metode (penting, baca dulu).** Ketiga situs dibaca langsung lewat `browser.open` pada URL persis di atas pada 19 Nov 2026 ±20.47 WIB, lalu dilengkapi pencarian web spesifik per situs dan pembacaan dua halaman pendukung (teardown Raycast di BuiltUX dan studi kasus Aether 1 di OFF+BRAND). Subagen ini **tidak punya browser live interaktif**, sehingga yang diamati adalah konten/struktur halaman yang terbaca oleh crawler teks, bukan perilaku interaktif. Semua yang tidak bisa diamati tanpa interaksi langsung (durasi animasi, easing, hover, transisi scroll, frame rate nyata) ditandai **"tidak teramati — butuh browser live"** dan tidak dikarang. Angka performa dari sumber sekunder (mis. klaim "sub-16ms" Raycast) dikutip sebagai klaim sumbernya, bukan hasil pengukuran sendiri.

## Konteks PRATA FAKTA saat ini (acuan pemetaan)

- **Sistem desain:** Swiss Editorial — Inter + Source Serif 4, aksen crimson `#b91c1c`, mode terang/gelap.
- **Navigasi:** BottomNav kaca (liquid glass) 6 item; Command Palette Ctrl+K **sudah ada**.
- **Halaman publik:** beranda, artikel, cari, graf pengetahuan (`/graf`), linimasa (`/timeline`), observatorium data (`/observatorium`), pelacak klaim (`/klaim`), perpustakaan (`/perpustakaan`), glosarium (`/glosarium`).
- **Admin:** shell admin, dashboard, Command Center (`/admin/command-center`), dan halaman admin lain.
- **Prinsip yang harus dipertahankan:** kredibilitas jurnalistik (FACT SCORE, sumber, bukti), kecepatan baca, aksesibilitas (WCAG 2.2 AA), dan mode gelap yang sudah ada. Adaptasi dari grup ini harus memperkuat — bukan mengaburkan — identitas editorial Swiss yang sudah dibangun.

---

## 1. Linear — linear.app

### 1.1 Apa yang diamati langsung

`browser.open` ke https://linear.app/ berhasil dibaca (207 baris, di-crawl <1 menit sebelum pembacaan). Yang terbaca:

- **Hero copy:** "The product development system for teams and agents" — satu kalimat, tanpa jargon berlebih.
- **Tiga pilar yang diulang dua kali (teks + figur "Fig 0.1–0.3"):** *Purpose-built* ("shaped by the practices and principles of world-class product teams"), *Powered by agents* ("workflows shared by humans and agents. From drafting PRDs to pushing PRs"), *Designed for speed* ("Reduces noise and restores momentum… ship with high velocity and focus").
- **Demo produk nyata di halaman depan, bukan mockup generik:** panel aktivitas issue ("Linear created the issue via Slack on behalf of Karri · 2min ago", "Triage Intelligence added the labels Performance and iOS", "Linear moved from Todo to In Progress · just now"), status dan label ("Reviews, Revert, Properties, In Progress, Medium"), daftar issue dengan ID dan metadata ("ENG-2076 Reduce ETA jitter", "ENG-2108 Handle GPS dropouts gracefully", "ENG-2187 Prevent duplicate ride requests on poor networks", lengkap dengan label, tanggal, dan avatar peninjau).
- **Narasi kecepatan sebagai fitur produk:** contoh issue "Faster app launch — Render UI before `vehicle_state` sync when minimum required state is present, instead of blocking on full refresh during iOS startup", plus potongan kode sebelum/sesudah (render lebih awal, sinkronisasi di latar belakang).
- **Bukti sosial:** "Powering the companies building the future" + "Linear App 1.6881… · Jun 25" (penanda rilis/changelog).
- **Struktur halaman:** hero → tiga pilar → demo alur kerja (issue, komentar tim, kode) → changelog. Tidak ada dinding teks panjang; setiap bagian satu ide.

Pencarian pendukung mengonfirmasi dua pola Linear yang relevan: **sistem shortcut mnemonik** (chord `G` lalu `I` = Inbox, `G`+`M` = My Issues, `O`+`P` = Project, `M`+`B` = Blocked; total ±72 shortcut dalam 8 kategori menurut profil Stream Deck pihak ketiga) dan **command palette gaya Linear** (pencarian fuzzy dengan debounce, seksi berkelompok — Issues, Projects, Actions — item terbaru, empty state, semantik ARIA combobox; target p95 buka-ke-ketikan-pertama <60 ms menurut satu implementasi referensi pihak ketiga).

### 1.2 (a) Apa yang membuat desainnya khas

1. **Kepadatan informasi yang tenang.** Daftar issue menampilkan ID, judul, label, status, tanggal, dan avatar dalam satu baris tanpa terasa ramai — karena tipografi kecil yang konsisten, kontras rendah untuk metadata, dan hanya satu aksen warna per baris.
2. **Produk sebagai demo, bukan janji.** Halaman depan memperlihatkan alur kerja sungguhan (issue → triage AI → PR → status berubah), sehingga pengunjung memahami produk dalam 10 detik tanpa membaca paragraf.
3. **Kecepatan sebagai bahasa desain.** Copy, contoh kode, dan struktur halaman semuanya bercerita tentang "lebih cepat" — bukan sekadar klaim, tapi ditunjukkan lewat contoh konkret (render sebelum sync penuh).
4. **Hierarki tiga lapis yang disiplin:** judul besar → satu kalimat penjelas → detail kecil (metadata). Tidak ada elemen yang bersaing memperebutkan perhatian.
5. **Mode gelap sebagai identitas, bukan opsi tambahan.** Linear dikenal dengan dark UI yang dalam; teks terang di latar gelap dengan aksen ungu/biru yang hemat.

### 1.3 (b) Interaksi yang layak diadaptasi

| Interaksi Linear | Adaptasi ke PRATA FAKTA |
|---|---|
| Daftar padat dengan metadata berlapis (ID, label, status, tanggal, avatar) | Daftar artikel/klaim di `/klaim` dan `/timeline`: satu baris = judul klaim + FACT SCORE + status verifikasi + sumber + tanggal; metadata redup, judul tegas |
| Shortcut mnemonik berurutan (`G` lalu `I`, `O` lalu `P`) | Shortcut admin: `G` lalu `D` = dashboard, `G` lalu `C` = Command Center, `G` lalu `K` = pelacak klaim; tampilkan daftar dengan tombol `?` (pola Linear: `?` membuka daftar shortcut halaman aktif) |
| Command palette berkelompok + item terbaru + empty state | Command Palette Ctrl+K yang sudah ada ditingkatkan: grup "Artikel", "Klaim", "Halaman", "Aksi Admin"; tampilkan 5 terakhir dibuka saat query kosong; empty state yang menyarankan, bukan halaman kosong |
| Optimistic UI (tampil dulu, sinkron belakangan — contoh "render before sync") | Tandai artikel/klaim sebagai dibaca atau ubah status verifikasi secara instan di UI, sinkron ke Supabase di latar belakang; tampilkan indikator sync halus bila gagal |
| Alur "issue → triage → PR → status" sebagai cerita | Linimasa verifikasi klaim di `/klaim`: klaim masuk → bukti dikumpulkan → skor dihitung → status berubah, ditampilkan sebagai alur aktivitas seperti activity feed Linear |

### 1.4 (c) Animasi yang layak diadaptasi

- **Transisi status yang halus dan kecil:** perubahan status (Todo → In Progress) cukup dengan perubahan warna label + geseran mikro, tanpa animasi besar. Cocok untuk perubahan status klaim (Belum dinilai → Kuat → Sangat kuat).
- **Skeleton/placeholder yang bermakna:** Linear merender UI sebelum data penuh tiba. Untuk PRATA FAKTA: kartu artikel menampilkan judul + garis skeleton, lalu gambar dan skor menyusul — halaman terasa instan.
- **Micro-feedback pada aksi keyboard:** kursor virtual di palette bergerak instan mengikuti panah; tidak ada animasi "melayang" yang menunda. Prinsip: animasi ≤150 ms untuk feedback, bukan hiasan.
- **Tidak teramati — butuh browser live:** durasi dan easing transisi halaman Linear, animasi hover pada kartu, dan perilaku scroll halaman depan tidak bisa diukur dari teks crawler.

### 1.5 (d) Komponen relevan

- **Issue row / list row padat** — baris dengan judul + metadata + avatar + badge status.
- **Label/badge sistematis** — label berwarna konsisten (Performance, iOS, Bug, Design, API) dengan arti yang stabil di seluruh produk → padanan: badge FACT SCORE dan badge tier sumber.
- **Activity feed** — kronologi aksi dengan aktor, aksi, dan waktu relatif ("2min ago", "just now") → padanan: riwayat verifikasi klaim dan log pipeline.
- **Command palette berkelompok** — sudah ada di PRATA FAKTA; yang diambil dari Linear adalah pengelompokan, item terbaru, dan footer shortcut.
- **Tiga pilar / feature trio** — pola "3 kartu, masing-masing satu kalimat" untuk halaman penjelasan (mis. halaman "Tentang" atau penjelasan FACT SCORE).
- **Changelog** — bagian "Changelog" di akhir halaman → padanan: halaman/log "Apa yang baru" untuk transparansi redaksi.

### 1.6 (e) Di mana dipakai di PRATA FAKTA

- **`/klaim` (prioritas utama):** ubah daftar klaim menjadi list row padat gaya Linear — skor, status, sumber, tanggal dalam satu baris; klik membuka detail; keyboard `J`/`K` untuk pindah baris (opsional, admin).
- **`/timeline`:** activity feed verifikasi — setiap entri = aktor (sistem/editor) + aksi + waktu relatif, seperti feed Linear.
- **`/admin` + Command Center:** shortcut mnemonik + palette berkelompok + footer shortcut; dashboard admin menampilkan antrean kerja sebagai "issue list" (klaim menunggu review, artikel gagal QC, job pipeline gagal).
- **Beranda:** seksi "Cara kerja" memakai pola tiga pilar Linear (satu kalimat per pilar) untuk menjelaskan FACT SCORE — tanpa mengubah identitas Swiss Editorial.
- **`/observatorium`:** tabel data padat dengan metadata redup; filter cepat ala Linear (ketik untuk filter, tanpa reload).

### 1.7 (f) Dampak performa

- **Rendah — mayoritas adaptasi adalah CSS + struktur, bukan library baru.** List row padat, badge, dan activity feed tidak menambah JavaScript berarti.
- **Command palette:** pencarian harus lokal/debounce; bila indeks artikel/klaim besar, batasi hasil per grup (mis. 5 per grup) dan gunakan substring match dulu sebelum fuzzy — target <60 ms dari buka ke ketikan pertama (angka referensi pihak ketiga, bukan janji).
- **Optimistic UI:** hemat persepsi waktu, tapi butuh penanganan gagal sync (rollback + toast) agar tidak menyesatkan editor.
- **Risiko:** daftar padat yang memuat ratusan baris sekaligus berat di DOM — pakai virtualisasi atau pagination (20–50 baris per halaman) di `/klaim` dan `/timeline`.

### 1.8 (g) Adaptasi mobile (Android 360px)

- List row padat Linear **harus dilonggarkan** di 360px: metadata pindah ke baris kedua dengan ukuran 12px, avatar disembunyikan atau diperkecil, badge skor tetap terlihat (itu informasi utama).
- Shortcut mnemonik **tidak berlaku** di layar sentuh — jangan jadikan satu-satunya jalan; semua aksi harus tetap bisa diketuk. Shortcut hanya bonus desktop.
- Command palette di mobile: tampil sebagai sheet dari bawah (bukan modal tengah), input besar, tombol tutup jelas; BottomNav 6 item tetap jadi navigasi utama.
- Activity feed: waktu relatif ("2 mnt lalu") lebih hemat tempat daripada tanggal lengkap di layar sempit.

---

## 2. Raycast — raycast.com

### 2.1 Apa yang diamati langsung

`browser.open` ke https://www.raycast.com/ **berhasil dimuat, tetapi isinya sangat tipis**: halaman yang terbaca hanya berisi judul "Raycast - Your shortcut to everything" dan daftar 18 thumbnail video YouTube ("Introducing Raycast Focus", "Mastering Quicklinks in Raycast", "Raycast Notes is Finally Out", "101 Things You Can Do With Raycast", "7 more Raycast tricks to level up your productivity", "Max Stoiber Owns His Workflow with Raycast", dst.). **Hero, copy produk, daftar fitur, dan navigasi tidak terbaca** — hampir pasti karena halaman tersebut dirender berat oleh JavaScript dan crawler teks hanya menangkap bagian video. Ini dicatat sebagai kegagalan parsial pembacaan, bukan sebagai kesimpulan tentang situsnya.

Karena itu, riset Raycast bersandar pada pencarian pendukung + pembacaan penuh teardown BuiltUX (dibuka langsung, 193 baris) dan dua panduan pengguna. Fakta-fakta di bawah ini berasal dari sumber-sumber tersebut dan diberi label sumbernya; tidak ada yang diklaim sebagai pengamatan langsung atas raycast.com.

Yang terkonfirmasi dari sumber pendukung:

- **Raycast adalah launcher keyboard-first untuk macOS** (kini beta Windows): dipanggil dengan hotkey (`⌥ Space` atau `⌘ Space`), ketik beberapa huruf, tekan Enter. Tagline yang terbaca dari halaman: "Your shortcut to everything".
- **Arsitektur kecepatan:** teardown BuiltUX menyebut anggaran frame ketat 16 ms (60 FPS), indeks in-memory lokal (tanpa request jaringan per ketikan), dan mesin fuzzy matching (varian Smith-Waterman) yang diklaim mengeksekusi puluhan ribu item dalam <2 ms. **Ini klaim sumber sekunder, bukan pengukuran kami.**
- **Dua lapis aksi (progressive disclosure):** Enter = aksi utama (paling mungkin); `⌘+K` = Action Panel, menu sekunder yang menampilkan semua operasi lain (Copy Link, Reveal in Finder, Edit Script, Configure Extension) beserta badge shortcut-nya.
- **Lapisan fitur:** Root Search; Action Panel; ekstensi (1.500+ ekstensi komunitas, per satu ulasan); Snippets (ekspansi teks, batas 65.536 karakter per satu panduan); Clipboard History (teks, gambar, tautan, bisa dicari); Window Management; Quicklinks (URL/deeplink tersimpan, bisa meminta argumen input sebelum dibuka); AI Chat/Quick AI; hotkey per perintah; alias (kata kunci pendek, mis. `et` = empty trash); Hyper Key (Caps Lock menjadi modifier gabungan).
- **Ergonomi keyboard:** panah + binding Vim (`Ctrl+J/K`), `⌘+J`; setiap aksi menampilkan badge shortcut-nya agar pengguna perlahan menghafal.
- **Aturan desain dari teardown:** jangan tampilkan empty state tanpa saran (saat query kosong, tampilkan 5 perintah paling sering / terakhir dilihat); tampilkan badge shortcut di setiap aksi; pertahankan query dan posisi kursor saat kembali dari sub-form.
- **Harga (konteks, bukan rekomendasi):** inti gratis; Pro disebut $10/bulan atau $8/bulan tahunan pada Agustus 2026 — angka ini bisa berubah, jangan jadikan acuan.

### 2.2 (a) Apa yang membuat desainnya khas

1. **Satu gestur untuk segalanya.** Seluruh produk direduksi menjadi: panggil → ketik 3 huruf → Enter. Tidak ada menu bertingkat yang harus dihafal.
2. **Kecepatan sebagai spesifikasi, bukan slogan.** Anggaran 16 ms per frame dan indeks lokal adalah keputusan arsitektur yang bisa dirasakan pengguna di setiap ketikan.
3. **Progressive disclosure dua lapis.** Antarmuka utama sangat bersih karena aksi sekunder disembunyikan di balik `⌘+K` — pengguna baru tidak kewalahan, pengguna mahir tidak melambat.
4. **Segalanya bisa dipanggil dengan keyboard, tapi tidak ada yang memaksa.** Mouse tetap berfungsi; keyboard adalah jalan pintas, bukan syarat.
5. **Ekosistem, bukan sekadar aplikasi.** Ekstensi, snippet, quicklink, dan clipboard history membuat launcher menjadi "lapisan operasi" di atas semua aplikasi lain.

### 2.3 (b) Interaksi yang layak diadaptasi

| Interaksi Raycast | Adaptasi ke PRATA FAKTA |
|---|---|
| Root Search: ketik 3 huruf → hasil instan | Command Palette Ctrl+K: fuzzy search artikel/klaim/sumber dengan ranking (cocok awalan + terakhir dibuka didahulukan) |
| Enter = aksi utama, `⌘+K` = Action Panel | Di palette dan di daftar: Enter membuka artikel/klaim; `Ctrl+K` (saat baris aktif) membuka panel aksi sekunder: Salin tautan, Salin kutipan, Buka sumber, Tandai dibaca, Bagikan |
| Empty state berisi saran (5 terakhir/terpopuler) | Palette kosong menampilkan: 5 artikel terakhir dibaca + 3 klaim trending + jalan pintas halaman |
| Alias kata kunci pendek | Alias di palette: `k:` = cari klaim, `s:` = cari sumber, `g:` = buka graf, `t:` = linimasa; alias tampil sebagai hint di bawah input |
| Quicklinks berargumen | Quicklink admin: "Cek klaim baru" → meminta kata kunci → membuka `/klaim?q=…`; "Cari sumber" → membuka `/cari?domain=…` |
| Clipboard History yang bisa dicari | Riwayat salinan di sesi admin: kutipan/sumber yang pernah disalin tampil di palette agar bisa ditempel ulang tanpa membuka ulang artikel |
| Badge shortcut di setiap aksi | Setiap item palette dan setiap tombol aksi admin menampilkan badge shortcut-nya (mis. `↵ buka`, `⌘K aksi`, `C salin`) — melatih pengguna secara pasif |
| Vim binding (`Ctrl+J/K`) | Di daftar panjang (`/klaim`, `/timeline`), `Ctrl+J`/`Ctrl+K` sebagai alternatif panah untuk pengguna keyboard berat |

### 2.4 (c) Animasi yang layak diadaptasi

- **Hampir tanpa animasi — dan itu intinya.** Raycast terasa cepat karena tidak ada animasi masuk yang menunda hasil. Adaptasi terpenting untuk PRATA FAKTA adalah *mengurangi* animasi di palette: hasil muncul dalam satu frame, tanpa fade-in bertahap per baris.
- **Satu-satunya gerakan yang bermakna:** panel aksi sekunder yang "meluncur" masuk dari sisi (slide-in) — memberi tahu pengguna bahwa mereka masuk satu lapis lebih dalam, dan Backspace/Esc kembali satu lapis. Di PRATA FAKTA: panel aksi palette meluncur dari kanan (desktop) atau naik dari bawah (mobile).
- **Kursor virtual yang mengikuti panah tanpa lag:** baris aktif berpindah instan dan selalu scroll ke tampilan (scrollIntoView) — tanpa animasi scroll yang lambat.
- **Tidak teramati — butuh browser live:** raycast.com sendiri tidak bisa diamati animasinya karena halaman tidak terbaca penuh; durasi slide Action Panel dan easing-nya tidak terukur dari sumber teks.

### 2.5 (d) Komponen relevan

- **Command bar / root search** — input + daftar hasil + footer shortcut; sudah ada di PRATA FAKTA, tinggal menaikkan ke standar Raycast.
- **Action Panel (`⌘+K`)** — panel sekunder kontekstual; komponen baru yang paling bernilai dari grup ini.
- **Footer hint bar** — bilah tipis ±36px di bawah palette: "↵ buka · ⌘K aksi · Esc tutup", teks 12–13px.
- **Grouped results dengan header kecil** — "Artikel", "Klaim", "Aksi" sebagai header grup redup.
- **Kbd badge** — elemen `<kbd>` konsisten untuk semua shortcut, di palette maupun di tombol.
- **Recent/frequent section** — seksi "Terakhir dibuka" saat query kosong.

### 2.6 (e) Di mana dipakai di PRATA FAKTA

- **Command Palette Ctrl+K (prioritas utama):** ini adaptasi Raycast yang paling langsung — jadikan palette sebagai "pusat komando" PRATA FAKTA: cari + navigasi + aksi dalam satu permukaan; tambahkan Action Panel sekunder, alias `k:`/`s:`/`g:`/`t:`, empty state berisi saran, dan footer hint bar.
- **`/cari`:** terapkan ranking fuzzy Raycast (awalan + frekuensi + terakhir dibuka) dan tampilkan badge aksi di tiap hasil ("↵ buka · ⌘K aksi").
- **`/admin` + Command Center:** palette admin dengan quicklink berargumen (cek klaim, cari sumber, buka job pipeline) dan riwayat salinan kutipan.
- **`/klaim` dan `/perpustakaan`:** Action Panel per baris (salin tautan/kutipan, buka sumber, tandai, bagikan) tanpa memenuhi baris dengan tombol.
- **Beranda (pengguna kembali):** palette kosong yang menampilkan "Lanjutkan membaca" — 5 artikel terakhir — sebagai jalan pintas personal.

### 2.7 (f) Dampak performa

- **Prinsip inti Raycast justru menghemat performa:** indeks lokal + tanpa request jaringan per ketikan. Untuk PRATA FAKTA: bangun indeks kecil di klien (judul + slug + skor, mis. 200–500 entri terbaru) saat palette pertama dibuka; pencarian jalan di memori, tanpa fetch per huruf.
- **Biaya:** indeks klien menambah ±50–200 KB JSON (tergantung jumlah entri) — muat malas (lazy) hanya saat palette dibuka pertama kali, bukan saat halaman dimuat.
- **Anggaran frame:** target <16 ms per ketikan berarti: tanpa re-render daftar penuh (gunakan key stabil + windowing bila >50 hasil), debounce ringan (bukan throttle berat — Raycast tidak menunggu jaringan, jadi debounce 0–50 ms cukup).
- **Risiko:** fuzzy matching murni di JavaScript untuk ribuan entri bisa lambat di HP murah — batasi indeks klien ke entri terbaru/populer; pencarian penuh tetap lewat server di `/cari`.

### 2.8 (g) Adaptasi mobile (Android 360px)

- **Hotkey tidak ada di mobile** — palette harus bisa dibuka lewat tombol kaca pembesar yang jelas di BottomNav/header; shortcut keyboard adalah bonus desktop, bukan syarat.
- Action Panel di mobile: sheet dari bawah, bukan panel samping; tiap aksi berupa baris besar yang mudah diketuk (tinggi ≥48px).
- Footer hint bar disembunyikan di mobile (tidak ada keyboard) dan diganti tombol aksi yang terlihat.
- Alias (`k:` dsb.) tetap berguna di mobile karena mengetik lebih lambat — alias menghemat ketikan, bukan menambahnya.
- Indeks lokal tetap bermanfaat di HP: pencarian instan tanpa menunggu jaringan seluler yang lambat.

---

## 3. Aether 1 — aether1.ai

### 3.1 Apa yang diamati langsung

`browser.open` ke https://aether1.ai/ berhasil dibaca (51 baris), tetapi **isinya sebagian placeholder**: terbaca judul "Aether 1 Earbuds", headline "Sound Without Boundaries", dan empat seksi — "Unrivalled audio quality — Experience every note as if it were born in silence", "Crafted for pure clarity — Meticulous future forward design & materials", "Intuitive Controls — Haptic feedback and intuitive controls for all environments", "Sub Alphatonic Power Core — Its energy, eternal. No charging, no constraints" — namun di tengah halaman masih ada teks **"Lorem ipsum dolor sit amet…"** dan blok "question / title / Heading" kosong. Ini menandakan situs yang dibaca crawler adalah versi Webflow yang belum final/di-maintain, atau sebagian konten gagal dirender. Dicatat jujur sebagai keterbatasan.

Karena itu, gambaran sinematik Aether 1 dilengkapi dari studi kasus pembuatnya (OFF+BRAND, dibaca langsung) dan penghargaan Webflow Conf 2025 (Best Animated Experience). Fakta dari sumber-sumber tersebut:

- **Aether 1 adalah produk fiktif** (earbud konsep) — situsnya proof-of-concept peluncuran yang memadukan AI chat, 3D WebGL, dan storytelling merek. Bukan toko sungguhan.
- **Struktur narasi: empat bab** dalam satu scroll tak berujung (Lenis smooth scroll): *Audio Design → Precision Craft → Sub Alphatonic Core → Seamless Connectivity*, masing-masing diungkap lewat jalur kamera yang sudah di-"bake", pergantian adegan GSAP, dan partikel WebGL 60 fps yang — menurut studi kasus — masih berjalan di iPhone SE 2020.
- **Arah visual:** palet gelap yang "stripped-back" (sederhana), gradien lembut, ruang negatif yang lapang; hero menggantung earbud dalam "cahaya tanpa bobot" dengan gelombang suara bullet-time; model 3D dibuat di C4D/Blender dengan ambient-occlusion dan mat-cap kustom agar refleksi seperti kaca namun tetap ringan di mobile; file `.glb` bersih hasil ekspor.
- **Interaksi:** GPGPU flow-fields, kursor fluid-sim, gelombang audio-reaktif; ada **rute fallback reduced-motion** dan ray-casting yang disederhanakan agar tetap inklusif dan mudah diakses; ada Easter egg tersembunyi dan transisi adegan yang mulus.
- **AI concierge dalam adegan:** tombol "Ask Aether" — chat AI di dalam halaman produk (terlihat pada tangkapan layar studi kasus, termasuk pesan preorder).
- **Hasil yang diklaim:** memenangkan Best Animated Experience di Webflow Conf 2025; rata-rata kunjungan 3 menit; diklaim membantu mengubah rasa penasaran menjadi pre-order (studi kasus sendiri menulis "(hypothetically)" — klaim konversi ini tidak terbukti dan tidak boleh dikutip sebagai fakta).
- **Teknologi yang disebut:** Webflow, GSAP, Lenis smooth scroll, WebGL, Midjourney + Figma untuk prototipe.

### 3.2 (a) Apa yang membuat desainnya khas

1. **Satu produk, satu cerita, empat bab.** Seluruh situs adalah narasi linear — bukan katalog fitur. Setiap bab punya satu ide dan satu visual.
2. **Ruang negatif sebagai kemewahan.** Palet gelap + gradien lembut + jarak lega membuat satu objek terasa berharga; tidak ada yang berebut perhatian dengan produk.
3. **Sinematik tanpa video berat.** Gerakan kamera 3D yang sudah di-bake + partikel WebGL memberi rasa film, tetapi dengan aset yang dioptimalkan (mat-cap, bukan ray-tracing real-time).
4. **Cerita yang bisa dimainkan.** Kursor fluid-sim dan gelombang audio-reaktif mengubah penonton pasif menjadi peserta — tanpa menghalangi cerita.
5. **Aksesibilitas sebagai jalur, bukan tempelan.** Rute reduced-motion adalah jalur alternatif yang dirancang, bukan sekadar mematikan animasi.

### 3.3 (b) Interaksi yang layak diadaptasi

| Interaksi Aether 1 | Adaptasi ke PRATA FAKTA |
|---|---|
| Scroll sinematik empat bab | **"Cerita di balik berita" / feature longform:** satu artikel investigasi besar dibuka sebagai pengalaman scroll berbab — Bab 1 Konteks, Bab 2 Bukti, Bab 3 Verifikasi, Bab 4 Dampak — masing-masing satu layar dengan visual pendukung |
| Jalur kamera yang di-bake + pergantian adegan | Transisi adegan berbasis scroll di `/timeline`: saat pengguna menggulir linimasa, latar/kartu berubah halus mengikuti era/peristiwa; implementasi ringan dengan CSS + IntersectionObserver, bukan WebGL |
| AI concierge dalam adegan ("Ask Aether") | **"Tanya tentang klaim ini"** di halaman artikel/klaim: panel tanya-jawab yang menjawab dari bukti dan sumber artikel itu saja (antrean Muse, jujur bukan LLM live — sesuai aturan PRATA), bukan chatbot bebas |
| Gelombang audio-reaktif / partikel | Visualisasi data yang "hidup" di `/observatorium`: partikel/gelombang ringan (Canvas 2D, bukan WebGL) yang merepresentasikan volume klaim atau arus berita — dimatikan total bila reduced-motion |
| Easter egg tersembunyi | Detail kecil yang menyenangkan: mis. mengetik "fakta" di beranda memunculkan kartu FACT SCORE acak; atau logo yang bereaksi halus saat diklik — satu saja, jangan berlebihan |
| Rute reduced-motion sebagai jalur alternatif | Setiap pengalaman sinematik di PRATA FAKTA wajib punya versi statis yang setara isinya (bukan versi rusak) — sesuai WCAG dan preferensi pengguna |

### 3.4 (c) Animasi yang layak diadaptasi

- **Scroll-timed reveal per bab:** judul besar muncul kata-per-kata (atau baris-per-baris) saat bab masuk viewport; teks pendukung menyusul dengan jeda 80–120 ms. Hanya untuk halaman feature/longform — **jangan** diterapkan ke daftar berita harian (menghambat membaca).
- **Parallax halus satu lapis:** gambar latar bergerak lebih lambat dari teks (translateY kecil, ±8–12%) — memberi kedalaman tanpa mabuk gerak.
- **Pergantian adegan (scene swap):** di `/timeline` dan feature longform, latar berubah (warna/gradien) saat bab berganti — memberi rasa "bab baru" tanpa reload.
- **Partikel/gelombang ambient yang sangat hemat:** satu canvas kecil di hero beranda (mis. gelombang halus di bawah headline) dengan `requestAnimationFrame` yang berhenti saat tab tidak terlihat atau saat reduced-motion.
- **Tidak teramati — butuh browser live:** durasi dan easing transisi adegan GSAP, kecepatan Lenis smooth scroll, perilaku partikel WebGL, dan respons kursor fluid-sim tidak bisa diukur dari teks; klaim "60 fps di iPhone SE 2020" adalah klaim studi kasus pembuatnya, bukan pengukuran kami.

### 3.5 (d) Komponen relevan

- **Hero sinematik satu objek** — satu visual besar + satu headline + satu kalimat; padanan PRATA FAKTA: hero "Berita Utama Hari Ini" dengan satu foto besar dan satu kalimat, bukan 6 kartu berebut.
- **Chapter indicator** — penanda bab (01 / 02 / 03 / 04) di sisi layar saat menggulir feature; padanan: indikator progres baca di artikel panjang.
- **Scene container** — wadah adegan yang berganti latar per bab; padanan: seksi feature longform dan `/timeline`.
- **AI concierge panel** — panel tanya-jawab dalam konteks; padanan: "Tanya tentang klaim ini".
- **Data-viz ambient** — gelombang/partikel sebagai visualisasi; padanan: visualisasi ringan di `/observatorium`.
- **Reduced-motion fallback route** — versi statis setara; wajib untuk semua komponen sinematik.

### 3.6 (e) Di mana dipakai di PRATA FAKTA

- **Artikel feature/investigasi (prioritas utama Aether):** satu template longform berbab — dipakai hemat, hanya untuk 1–2 artikel besar per minggu, bukan semua artikel. Di sinilah "sinematik" dibenarkan; berita harian tetap cepat dan polos.
- **Beranda:** hero satu berita utama dengan ruang negatif lega + gelombang ambient yang sangat ringan; di bawahnya daftar berita tetap memakai kepadatan Swiss Editorial.
- **`/timeline`:** pergantian adegan per era + chapter indicator (tahun sebagai bab).
- **`/observatorium`:** visualisasi ambient ringan + penanda bab per dataset.
- **`/graf`:** transisi halus saat berpindah fokus antar simpul (prinsip "jalur kamera" — kamera graf bergerak, bukan melompat).
- **Halaman artikel/klaim:** panel "Tanya tentang klaim ini" (antrean Muse, berbasis bukti artikel).

### 3.7 (f) Dampak performa

- **Risiko tertinggi di grup ini.** WebGL/GSAP/Lenis adalah beban nyata: bundle GSAP ±70 KB, Lenis ±10 KB, dan WebGL menuntut GPU. Aether 1 menanganinya dengan aset yang di-bake dan mat-cap — PRATA FAKTA harus lebih hemat lagi.
- **Aturan adaptasi:** 
  - **Tidak ada WebGL di PRATA FAKTA.** Semua efek sinematik memakai CSS transform/opacity + Canvas 2D ringan; target tetap 60 fps di HP menengah.
  - **Lenis/GSAP hanya bila perlu** — untuk satu template longform, pertimbangkan CSS `scroll-behavior` + IntersectionObserver dulu; tambah library hanya bila efeknya tidak tercapai dengan CSS.
  - **Semua aset sinematik lazy-load** di bawah lipatan; hero tidak boleh menunggu aset dekoratif.
  - **Matikan total** saat `prefers-reduced-motion`, saat baterai/kinerja rendah (bila terdeteksi), dan saat pengguna memilih "Mode hemat" — dengan konten yang tetap lengkap.
  - **Anggaran:** satu halaman feature boleh menambah ≤150 KB JS/CSS di atas baseline; bila melebihi, potong efek, bukan konten.
- **Biaya yang tidak boleh dibayar:** waktu muat berita harian tidak boleh naik demi satu halaman feature. Sinematik adalah pengecualian, bukan default.

### 3.8 (g) Adaptasi mobile (Android 360px)

- **Scroll berbab justru cocok untuk mobile** — satu bab per layar adalah pola alami ponsel; pastikan tiap bab muat tanpa scroll horizontal dan teks ≥16px.
- **Tanpa WebGL = tanpa masalah GPU HP murah.** Partikel Canvas 2D dibatasi (mis. ≤60 partikel, berhenti saat tidak terlihat).
- **Smooth scroll Lenis berisiko di Android** (konflik dengan scroll native dan pull-to-refresh) — di mobile, matikan smooth-scroll kustom dan pakai scroll native; efek reveal tetap jalan via IntersectionObserver.
- **Chapter indicator di mobile:** pindah ke bawah (dot kecil) atau disembunyikan; jangan tempel di sisi layar 360px.
- **Hero sinematik di 360px:** satu foto + headline besar + satu kalimat; gelombang ambient dimatikan di layar <480px atau saat koneksi lambat (`Save-Data` / 2G) untuk menghemat baterai dan data.
- **Panel "Tanya tentang klaim ini":** sheet dari bawah, input besar, jawaban berbasis bukti dengan tautan sumber yang bisa diketuk.

---

## 4. Matriks perbandingan

| Dimensi | Linear | Raycast | Aether 1 |
|---|---|---|---|
| **Inti desain** | Kepadatan tenang, produk sebagai demo | Satu gestur keyboard untuk segalanya | Satu cerita sinematik, empat bab |
| **Kekuatan utama** | List row padat + activity feed + kecepatan sebagai narasi | Palette dua lapis + indeks lokal + anggaran 16 ms | Scroll berbab + ruang negatif + visual 3D yang di-bake |
| **Interaksi signature** | Shortcut mnemonik (`G` lalu `I`), optimistic UI | Enter = aksi utama, `⌘+K` = Action Panel, alias | Lenis scroll, jalur kamera, AI concierge dalam adegan |
| **Animasi signature** | Transisi status mikro (≤150 ms), render-sebelum-sync | Hampir tanpa animasi; slide-in panel sekunder | Reveal per bab, parallax halus, partikel WebGL |
| **Komponen kunci** | Issue row, badge, activity feed, palette berkelompok | Command bar, Action Panel, footer hint, kbd badge | Hero satu objek, chapter indicator, scene container |
| **Biaya performa** | Rendah (CSS + struktur) | Rendah bila indeks lokal; hemat justru | **Tinggi** — WebGL/GSAP; wajib versi ringan (CSS/Canvas 2D) |
| **Cocok untuk PRATA FAKTA** | `/klaim`, `/timeline`, admin, Command Center | Command Palette, `/cari`, admin | Feature longform, hero beranda, `/timeline`, `/observatorium` |
| **Risiko bila ditiru mentah** | Kepadatan berlebihan di mobile; shortcut tanpa mouse-fallback | Palette lambat bila indeks server per ketikan | Halaman berita jadi lambat dan teatrikal; melanggar kredibilitas editorial |
| **Kualitas bukti riset ini** | Halaman terbaca penuh (207 baris) + pencarian pendukung | Halaman hanya terbaca sebagian (daftar video); bersandar pada teardown + panduan | Halaman terbaca tapi berisi placeholder lorem ipsum; bersandar pada studi kasus OFF+BRAND + Webflow Awards |
| **Aksesibilitas** | Keyboard-first, perlu `?` untuk daftar shortcut | Keyboard-first; perlu fallback sentuh | Reduced-motion route sudah dirancang; wajib ditiru |

---

## 5. Adaptasi prioritas tertinggi untuk PRATA FAKTA (3–5)

### Prioritas 1 — Command Palette gaya Raycast (dua lapis + indeks lokal)
**Dari:** Raycast (utama), Linear (pengelompokan + item terbaru).
**Apa:** Palette Ctrl+K yang sudah ada ditingkatkan menjadi pusat komando: (a) indeks klien kecil (judul/slug/skor, lazy-load saat palette pertama dibuka) agar hasil muncul dalam satu frame tanpa fetch per ketikan; (b) Enter = buka, `Ctrl+K` pada baris aktif = Action Panel sekunder (Salin tautan/kutipan, Buka sumber, Tandai dibaca, Bagikan); (c) empty state berisi 5 terakhir dibuka + klaim trending; (d) alias `k:`/`s:`/`g:`/`t:`; (e) footer hint bar "↵ buka · ⌘K aksi · Esc tutup"; (f) badge shortcut di setiap aksi.
**Dipakai di:** seluruh situs (palette global), `/cari`, `/klaim`, `/perpustakaan`, admin/Command Center.
**Biaya:** rendah–sedang (satu indeks JSON + komponen Action Panel; tanpa library baru bila memakai `cmdk`-setara yang sudah ada atau implementasi sendiri).
**Mobile 360px:** tombol pemicu jelas di BottomNav/header; Action Panel menjadi sheet bawah; footer hint disembunyikan.

### Prioritas 2 — Daftar klaim & linimasa gaya Linear (list row padat + activity feed)
**Dari:** Linear.
**Apa:** (a) `/klaim` menjadi list row padat — satu baris = judul + FACT SCORE + status + sumber + tanggal, metadata redup; (b) `/timeline` menjadi activity feed — aktor + aksi + waktu relatif ("2 mnt lalu"); (c) perubahan status klaim memakai transisi mikro (≤150 ms) dan optimistic UI dengan rollback bila sync gagal; (d) shortcut `?` menampilkan daftar shortcut halaman aktif (admin).
**Dipakai di:** `/klaim`, `/timeline`, `/observatorium` (tabel padat), dashboard admin (antrean kerja sebagai issue list).
**Biaya:** rendah (CSS + struktur + sedikit logika optimistic UI).
**Mobile 360px:** metadata ke baris kedua, avatar disembunyikan, badge skor tetap terlihat; semua aksi tetap bisa diketuk.

### Prioritas 3 — Template longform sinematik berbab (satu artikel besar, bukan semua artikel)
**Dari:** Aether 1 (utama), Linear (tiga pilar sebagai struktur bab).
**Apa:** Satu template artikel feature: 4 bab (Konteks → Bukti → Verifikasi → Dampak), reveal per bab via IntersectionObserver, parallax satu lapis yang halus, chapter indicator + progres baca, hero satu visual besar dengan ruang negatif lega. **Tanpa WebGL, tanpa GSAP/Lenis di tahap pertama** — CSS + Canvas 2D ringan saja; tambah library hanya bila efeknya terbukti tidak tercapai dengan CSS. Wajib ada rute reduced-motion yang isinya setara.
**Dipakai di:** 1–2 artikel investigasi besar per minggu; **dilarang** di daftar berita harian dan artikel biasa.
**Biaya:** sedang (satu template + anggaran ≤150 KB tambahan); risiko performa tertinggi — ukur sebelum meluaskan.
**Mobile 360px:** satu bab per layar, scroll native (tanpa smooth-scroll kustom), gelombang/partikel dimatikan di <480px atau saat `Save-Data`.

### Prioritas 4 — Panel "Tanya tentang klaim ini" (AI concierge dalam konteks)
**Dari:** Aether 1 ("Ask Aether"), Raycast (AI Chat di dalam palette).
**Apa:** Di halaman artikel/klaim, panel tanya-jawab yang menjawab **hanya dari bukti dan sumber artikel itu** — lewat antrean Muse, dengan label jujur (bukan LLM live), dan setiap jawaban menyertakan tautan ke sumber/bukti yang dikutip. Bila tidak ada bukti, jawab "tidak ada bukti di artikel ini" — jangan mengarang.
**Dipakai di:** halaman artikel, `/klaim`, dan (nantinya) di dalam Command Palette sebagai perintah AI.
**Biaya:** sedang (UI panel + integrasi antrean yang sudah ada; tanpa model baru).
**Mobile 360px:** sheet dari bawah, jawaban dengan tautan sumber yang bisa diketuk.

### Prioritas 5 — Hero beranda satu berita utama + gelombang ambient yang sangat ringan
**Dari:** Aether 1 (ruang negatif, satu objek), Linear (satu kalimat hero).
**Apa:** Hero beranda menampilkan **satu** berita utama — satu foto besar, satu headline, satu kalimat — dengan ruang negatif lega; di bawahnya daftar berita tetap memakai kepadatan Swiss Editorial. Satu aksen gerak ambient yang sangat hemat (gelombang Canvas 2D halus di bawah headline, berhenti saat tab tak terlihat / reduced-motion / layar <480px).
**Dipakai di:** beranda (publik).
**Biaya:** rendah (CSS + satu canvas kecil; tanpa library).
**Mobile 360px:** foto + headline + satu kalimat saja; gelombang dimatikan.

---

## 6. Yang sengaja TIDAK diadaptasi

- **WebGL / model 3D / Lenis smooth scroll** — biaya performa dan risiko di HP murah tidak sebanding untuk situs berita; efek sinematik dicapai dengan CSS/Canvas 2D.
- **Shortcut mnemonik sebagai satu-satunya jalan** — semua aksi wajib tetap bisa diketuk/diklik; keyboard adalah bonus desktop.
- **Gaya visual gelap total ala Linear/Aether** — PRATA FAKTA mempertahankan Swiss Editorial (terang/gelap, crimson `#b91c1c`, serif) sebagai identitas; yang diambil adalah pola interaksi dan struktur, bukan palet atau logo.
- **Klaim performa pihak ketiga sebagai janji** — angka seperti "sub-16ms" atau "60 fps di iPhone SE 2020" adalah klaim pembuatnya; PRATA FAKTA mengukur sendiri sebelum mengklaim.
- **Easter egg berlebihan** — satu detail menyenangkan maksimal; situs berita tidak boleh terasa seperti taman bermain.

## 7. Batasan & kejujuran riset

1. **Tidak ada browser live interaktif.** Semua animasi, durasi, easing, hover, dan perilaku scroll yang disebut di atas berasal dari deskripsi sumber sekunder atau dari prinsip desain yang bisa disimpulkan — bukan dari pengamatan langsung. Setiap bagian yang tidak teramati ditandai di masing-masing situs.
2. **Raycast.com hanya terbaca sebagian.** Halaman yang di-crawl hanya menampilkan daftar video YouTube; hero, fitur, dan navigasi tidak terbaca. Analisis Raycast bersandar pada teardown BuiltUX (dibaca penuh), panduan itechguides/ped.ro/appcand, dan hasil pencarian. Bila parent agent ingin verifikasi visual, perlu browser live.
3. **Aether1.ai berisi placeholder.** Teks "Lorem ipsum" dan blok "question/title/Heading" masih ada di halaman yang di-crawl. Analisis sinematik bersandar pada studi kasus OFF+BRAND (dibaca penuh) dan halaman Webflow Conf 2025 Awards. Aether 1 adalah produk fiktif — pelajarannya adalah teknik storytelling, bukan kredibilitas produk.
4. **Linear.app terbaca paling lengkap** (207 baris: hero, tiga pilar, demo issue, kode, changelog) — analisis Linear adalah yang paling berdasar pada konten asli.
5. **Tidak ada aset, logo, atau layout yang disalin.** Semua rekomendasi adalah pola interaksi/struktur yang ditulis ulang dalam bahasa PRATA FAKTA; implementasi harus memakai token desain PRATA FAKTA yang sudah ada (Inter, Source Serif 4, crimson `#b91c1c`).
6. **Angka performa dari sumber sekunder** (p95 <60 ms palette, <2 ms fuzzy, 16 ms frame budget, 60 fps) dikutip sebagai klaim sumbernya dan diberi label demikian; bukan hasil pengukuran tim ini.

## Sumber yang dibaca langsung (19 Nov 2026)

- https://linear.app/ — dibaca penuh via browser.open (207 baris, crawl <1 menit).
- https://www.raycast.com/ — dibaca via browser.open (72 baris; hanya judul + 18 video YouTube).
- https://aether1.ai/ — dibaca via browser.open (51 baris; headline + 4 seksi + placeholder lorem ipsum).
- https://builtux.com/raycast-command-bar-ux-keyboard-first-navigation-2026/ — teardown Raycast, dibaca penuh (193 baris).
- https://www.itsoffbrand.com/our-work/aether1 — studi kasus Aether 1 (OFF+BRAND), dibaca penuh (63 baris).
- Pencarian pendukung: "Linear app design system keyboard shortcuts command palette dark UI"; "Raycast command palette features keyboard shortcuts fuzzy search extensions"; "Aether 1 earbuds website aether1.ai cinematic scroll design" (hasil pencarian dipakai sebagai sumber sekunder dan dilabeli demikian di teks).
- Referensi sekunder yang dikutip: setproduct.com (anatomi command palette), agentworkspace.attrition.sh (palette gaya Linear), markodenic.tech (Cmd+K dengan `<dialog>`), marketplace.elgato.com (profil shortcut Linear), itechguides.com / ped.ro / appcand.com (panduan Raycast), webflow.com Webflow Conf 2025 Awards (Aether1 — Best Animated Experience).
