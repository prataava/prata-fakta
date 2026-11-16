// Content Security Policy PRATA FAKTA (Tahap 13B — menutup utang CSP
// Fase 7 / §13.5 LAPORAN-FASE-8; diperbaiki Tahap 14 — skrip tema
// pakai hash, bukan nonce). Pola resmi Next.js 16
// (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md):
// proxy membuat nonce unik per request, memasangnya di header CSP
// respons + header request `x-nonce` dan `Content-Security-Policy`
// (Next mengekstrak nonce dari header CSP request untuk skrip
// framework-nya sendiri — lihat get-script-nonce-from-header.js),
// dan halaman DINAMIS membaca `x-nonce` lewat headers() untuk
// skrip inline milik aplikasi (JSON-LD artikel/pengetahuan —
// kedua halaman itu sudah dinamis via `export const instant =
// false`, jadi tanpa biaya baru).
//
// SKRIP TEMA PAKAI HASH, BUKAN NONCE (Tahap 14 — perbaikan build):
// nonce di root layout memaksa SELURUH halaman dinamis DAN
// mematahkan build: prerender `/_not-found` + `/kategori/[slug]`
// gagal ("encountered uncached or runtime data during
// prerendering", build EXIT 1). Skrip tema anti-kedip isinya
// STATIS (satu string tetap di layout.tsx), jadi diizinkan lewat
// hash sha256 — layout TIDAK LAGI membaca headers(), halaman
// statis tetap di-prerender. Bila isi skrip tema berubah SATU
// KARAKTER saja, hash di bawah TIDAK LAGI cocok dan CSP memblokir
// skrip itu (halaman membuka dengan tema salah / kedip) —
// hitung ulang dengan:
//   node -e "console.log(require('node:crypto').createHash('sha256').update(KODE,'utf8').digest('base64'))"
// dan perbarui konstanta ini. Baterai uji-tahap13b §J menegaskan
// hash ini sama dengan sha256 isi skrip di layout.tsx.
//
// PENGECUALIAN YANG DIDOKUMENTASIKAN (bukan celah tersembunyi):
//   1. `style-src 'unsafe-inline'`: aplikasi memakai atribut style
//      inline React (`style={{...}}`) di puluhan tempat — nonce
//      TIDAK BISA mengotorisasi atribut style (nonce hanya berlaku
//      untuk elemen <style>). 'unsafe-inline' di style-src TIDAK
//      bisa mengeksekusi skrip; risikonya terbatas pada injeksi
//      gaya (defacement kosmetik), bukan XSS.
//   2. `img-src https:` + `media-src https:` (bukan 'self' saja):
//      gambar artikel berasal dari host penerbit mana pun dan audio
//      podcast dari URL arbitrer — membatasi ke 'self' akan
//      memecahkan gambar/audio. Gambar/audio tidak mengeksekusi
//      skrip di konteks halaman (dan `object-src 'none'` menutup
//      plugin/Flash).
//   3. `connect-src` mencakup origin Supabase dari env (browser
//      memakai @supabase/ssr langsung) + `wss:` untuk Realtime bila
//      dipakai; tanpa env, fallback ke `https:`.
//   4. DEV SAJA (`NODE_ENV !== 'production'`): `'unsafe-eval'` di
//      script-src — React dev memakai eval untuk rekonstruksi stack
//      error (alasan resmi dok Next). Produksi TIDAK punya
//      unsafe-eval. Baterai uji-tahap13b menegaskan header produksi
//      bebas unsafe-inline (script-src) dan unsafe-eval.
import { randomUUID } from "node:crypto";

/** Nonce acak per request (UUID v4 → base64, hanya [A-Za-z0-9+/=]). */
export function buatNonce(): string {
  return Buffer.from(randomUUID()).toString("base64");
}

/**
 * Hash sha256 (base64) skrip tema anti-kedip di `src/app/layout.tsx`
 * (TemaInit). HARUS sama persis dengan sha256 isi skrip itu —
 * lihat komentar berkas ini. Diuji di uji-tahap13b §J.
 */
export const HASH_SKRIP_TEMA =
  "'sha256-kbdpuUr7+zlKwp6cjPtYWBBvdrWG3dqbGKfss460j9I='";

export interface OpsiHeaderCsp {
  /** true bila bukan produksi (menambah 'unsafe-eval' untuk React dev). */
  isDev?: boolean;
  /** Origin Supabase dari env (mis. https://xyz.supabase.co). */
  supabaseOrigin?: string;
}

/**
 * Susun nilai header Content-Security-Policy untuk satu nonce.
 * Murni (deterministik per argumen) — dipakai proxy + diuji unit.
 */
export function buatHeaderCsp(nonce: string, opsi: OpsiHeaderCsp = {}): string {
  const connectSrc = opsi.supabaseOrigin
    ? `'self' ${opsi.supabaseOrigin} wss://${new URL(opsi.supabaseOrigin).hostname}`
    : `'self' https: wss:`;
  const skrip = [
    "script-src",
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // Skrip tema anti-kedip diizinkan lewat hash (isinya statis) —
    // lihat HASH_SKRIP_TEMA. Tanpa ini, skrip tema butuh nonce dan
    // root layout harus membaca headers() → build gagal (§ atas).
    HASH_SKRIP_TEMA,
    ...(opsi.isDev ? ["'unsafe-eval'"] : []),
  ].join(" ");
  return [
    "default-src 'self'",
    skrip,
    // Lihat pengecualian (1) di atas: nonce tidak mengotorisasi
    // atribut style React; 'unsafe-inline' di sini bukan jalur XSS.
    "style-src 'self' 'unsafe-inline'",
    // Pengecualian (2): gambar/audio dari host penerbit arbitrer.
    "img-src 'self' https: data: blob:",
    "media-src 'self' https: blob:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** Ambil nonce dari header request (x-nonce, dipasang proxy). */
export function bacaNonceDariHeaders(headers: {
  get(nama: string): string | null;
}): string | null {
  return headers.get("x-nonce");
}
