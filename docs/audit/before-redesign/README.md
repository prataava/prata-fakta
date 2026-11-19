# Screenshot SEBELUM redesign (baseline) — PRATA FAKTA

**Tanggal:** 19 November 2026 · **Branch:** `redesign/world-class-ui-motion`
**Sumber render:** server lokal `next start -p 3001` dari build produksi `.next`
(BUILD_ID `6SNtvpDBI2bzN6KylkOMb`, kode sama dengan `main` a0a4c1c).

## Metode (penting)

Headless shell di sandbox ini TIDAK bisa memuat situs live
(`ERR_TUNNEL_CONNECTION_FAILED` lewat proxy — dicoba dengan dan tanpa
`--no-proxy-server`). Karena itu screenshot diambil dari server lokal, BUKAN
dari https://prata-fakta.vercel.app/ — tampilannya identik dengan build yang
sama; situs live sendiri diverifikasi HTTP 200.

Gambar artikel eksternal (CDN detik/Antara) tidak termuat di headless shell
dan tampil sebagai teks alt. Gambar-gambar itu diverifikasi via curl tetap
HTTP 200 (detik 32 KB, Antara 65 KB) — jadi itu artefak lingkungan headless,
BUKAN gambar rusak di produksi.

Perintah: `chrome-headless-shell --headless --disable-gpu --no-sandbox
--screenshot=<file> --window-size=<WxH> --virtual-time-budget=9000
--hide-scrollbars http://127.0.0.1:3001<path>`

## Daftar (14 berkas)

| Berkas | Halaman | Viewport |
|---|---|---|
| `d1280-beranda.png` | Beranda `/` | 1280×900 |
| `d1280-artikel.png` | Artikel (ASEAN antariksa) | 1280×900 |
| `d1280-cari.png` | Pencarian `/cari` | 1280×900 |
| `d1280-graf.png` | Graf Pengetahuan `/graf` | 1280×900 |
| `d1280-timeline.png` | Linimasa `/timeline` | 1280×900 |
| `d1280-observatorium.png` | Observatorium `/observatorium` | 1280×900 |
| `d1280-klaim.png` | Pelacak Klaim `/klaim` | 1280×900 |
| `d1280-perpustakaan.png` | Perpustakaan `/perpustakaan` | 1280×900 |
| `d1280-glosarium.png` | Glosarium `/glosarium` | 1280×900 |
| `d1280-admin.png` | Admin `/admin` (sebagai tamu → `/masuk`) | 1280×900 |
| `m360-beranda.png` | Beranda `/` | 360×800 |
| `m360-artikel.png` | Artikel | 360×800 |
| `m360-graf.png` | Graf Pengetahuan `/graf` | 360×800 |
| `m360-cari.png` | Pencarian `/cari` | 360×800 |

## Temuan visual utama (ringkas; rincian di `docs/design-research/AUDIT-2026-11-19.md`)

1. Hero beranda hanya teks — datar, generik.
2. Graf Pengetahuan: label terpotong di tepi kiri + pil kategori kosong + garis semrawut.
3. Artikel: byline bocor "(draf pipeline)"; FACT SCORE mengulang "Belum dinilai".
4. `/cari`: empty state kosong, tanpa saran topik.
5. Tiga kotak cari (header, hero, halaman cari).
6. Admin sebagai tamu → `/masuk` (benar; audit visual admin BLOCKED tanpa login).
