# KOMPONEN GERAK — Handoff Fase 3 (agen halaman berikutnya)

**Tanggal:** 19 November 2026 · **Branch:** `redesign/world-class-ui-motion`
**Dasar:** `docs/design-system/REDESIGN_DECISION_2026-11-19.md` §4 + riset Ripplix (tombol 3-keadaan, skeleton, dropdown/popover, bottom sheet).

Satu pintu masuk: `import { Reveal, MotionCard, … } from "@/components/motion"`.
Semua komponen memakai token di bawah dan menghormati reduced motion
(`MotionConfig reducedMotion="user"` di root layout — tidak perlu cek manual).

## Token

CSS (`src/app/motion.css`, diimpor layout setelah `globals.css`):

| Token | Nilai | Pakai |
|---|---|---|
| `--motion-cepat` | 120ms | micro-interaction, dropdown, overlay fade |
| `--motion-dasar` | 180ms | reveal, kartu, modal |
| `--motion-halaman` | 200ms | transisi halaman (`src/app/template.tsx`) |
| `--motion-penekanan` | 320ms | penekanan khusus |
| `--motion-stagger` | 50ms | jeda antar kartu |
| `--ease-standar` | `cubic-bezier(0.16,1,0.3,1)` | semua transisi Motion |
| `--ease-masuk` / `--ease-keluar` | `ease-out` / `ease-in` | masuk / keluar |
| `--glass-blur` | `blur(18px) saturate(1.4)` | permukaan kaca umum |
| `--glass-blur-dock` | `blur(25px) saturate(1.55)` | BottomNav (nilai lama, kini token) |
| `--glass-bg` (terang/gelap) | `rgba(255,255,255,0.82)` / `rgba(23,27,30,0.78)` | kaca nyata |
| `--glass-border` (terang/gelap) | `rgba(255,255,255,0.65)` / `rgba(255,255,255,0.22)` | tepi highlight kaca |
| `--glass-bg-padat` | `#ffffff` / `#171b1e` | fallback solid |
| `--glass-border-highlight` | `rgba(225,235,255,0.2)` / `rgba(255,255,255,0.22)` | tepi dock gelap |

JS (`src/components/motion/token.ts`): `MOTION_EASE`, `DURASI_CEPAT/DASAR/HALAMAN/PENEKANAN` (detik), `STAGGER_KARTU`. Nilai HARUS sama dengan CSS.

**Kaca hanya untuk:** BottomNav, header, Command Palette, popover/overlay.
**JANGAN glass kartu** — `.kaca/.kaca-kartu` di `globals.css` TETAP solid.
Fallback: `prefers-reduced-transparency` → solid; tanpa `backdrop-filter` → solid.

## Komponen

### `MotionProvider`
Sudah dipasang di root layout (membungkus `<main>` + BottomNav + CommandPalette).
Jangan pasang lagi. Header/Footer sengaja di luar agar tetap prerender.

### `Reveal` — masuk viewport sekali
```tsx
<Reveal delay={0.05}>
  <h2>Judul seksi</h2>
</Reveal>
```
Props: `delay` (detik), `y` (px, default 12), `className`. `once: true`, margin `-40px`.
Hanya opacity + translateY.

### `Stagger` + `StaggerItem` — kartu berurutan
```tsx
<Stagger>
  <StaggerItem><Kartu … /></StaggerItem>
  <StaggerItem><Kartu … /></StaggerItem>
</Stagger>
```
Jeda 50ms antar butir. `StaggerItem` wajib anak langsung `Stagger`.

### `MotionCard` — hover lift + tap
```tsx
<MotionCard className="kaca kaca-kartu">…isi kartu…</MotionCard>
```
Hover naik 2px, tap scale 0.98 — hanya transform. `nonaktif` mematikan interaksi.

### `Skeleton` — placeholder muat tanpa layout shift
```tsx
<Skeleton tinggi={20} lebar="60%" />
<Skeleton tinggi={120} />
```
Ukuran TETAP via props — shimmer hanya menggerakkan `::after`, layout tidak bergeser.
Jangan pakai skeleton berukuran `auto`.

### `TombolGerak` — tombol 3-keadaan (idle → memuat → sukses)
```tsx
<TombolGerak onKlik={async () => { await simpan(); }} labelSukses="Tersimpan">
  Simpan
</TombolGerak>
```
`varian="primer" | "garis"`. Gagal (`onKlik` throw) → kembali idle; pesan galat
menjadi tanggung jawab pemanggil (mis. `useToast`). Warna/font eksplisit di CSS.

### `Modal` / `Drawer` — Radix Dialog + Motion
```tsx
const [buka, setBuka] = useState(false);
<Modal terbuka={buka} onTutup={setBuka} judul="…" deskripsi="…">…</Modal>
<Drawer terbuka={buka} onTutup={setBuka} judul="…">…</Drawer>
```
Focus trap + Esc menutup = bawaan Radix. Tutup SELALU instan (tanpa exit yang menunda).
`Drawer` = bottom sheet mobile (gagang + safe-area bawah).

### `Dropdown` + `DropdownItem` — Radix DropdownMenu + Motion
```tsx
<Dropdown pemicu={<button type="button">Menu</button>}>
  <DropdownItem onPilih={() => …}>Item 1</DropdownItem>
  <DropdownItem onPilih={() => …} nonaktif>Item 2</DropdownItem>
</Dropdown>
```
`align="start" | "center" | "end"` (default `end`).

### `ToastProvider` + `useToast`
`ToastProvider` BELUM dipasang di layout (sengaja — agen halaman yang butuh toast
memasangnya sekali di layout terdekat; jangan pasang dua kali):
```tsx
const { tampilkanToast } = useToast();
tampilkanToast("Tersimpan", "sukses"); // jenis: "info" | "sukses" | "galat"
```
Hilang otomatis 4 detik, maks. 3 toast, `aria-live="polite"`.

## Transisi halaman
`src/app/template.tsx` (root): entrance opacity 200ms, content-first, keluar instan,
tanpa `AnimatePresence`, tanpa `usePathname`. Jangan tambah exit transition di sini.

> **Catatan Fase 5 (QA 19 Nov 2026, terukur):** `MotionConfig reducedMotion="user"`
> mematikan animasi **posisional** (x/y) secara instan, tetapi `motion` 14.14.0
> TIDAK mematikan fade **opacity** — trajektori ukur menunjukkan opacity
> `Reveal`/`StaggerItem` tetap 0→1 selama ~180ms penuh di bawah
> `prefers-reduced-motion: reduce`. Jadi klaim "animasi non-esensial mati
> total" hanya benar untuk transform + CSS (`motion.css` mematikan shimmer,
> spinner, transform tombol); fade opacity 180ms tetap berjalan. Bukan
> blocker (konten selalu mencapai keadaan akhir), tapi jangan janjikan
> "mati total" untuk opacity tanpa perbaikan komponen (di luar cakupan Fase 5).

## Aturan untuk agen halaman
1. Hanya `transform`/`opacity` untuk animasi berjalan — jangan animasikan layout/width/height/box-shadow besar.
2. Jangan ubah `TemaInit()` / `HASH_SKRIP_TEMA`, `src/proxy.ts`, guard admin, API route, SearchBar, NewsletterForm, PelacakKunjungan, TTS, Leaflet.
3. Jangan buat definisi token menunjuk dirinya sendiri — jalankan `node scripts/cek-token-gerak.mjs` sesudah menyentuh token.
4. `<button>` wajib `color` + `font` eksplisit (lihat `.tombol-gerak`).
5. Cek tabrakan nama fungsi & id elemen di SELURUH berkas sebelum memakai nama baru.
6. Komponen async request-time WAJIB `<Suspense>` (`cacheComponents: true`).
