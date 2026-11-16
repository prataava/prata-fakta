// Allowlist host feed ingestion PRATA FAKTA (Tahap 13B, sisa T6).
//
// ATURAN: ingestion feed RSS dan GDELT HANYA boleh mengambil dari host
// yang dikenal di daftar ini. Alasannya pertahanan berlapis atas SSRF:
//   1. `tolakHostPrivat` (ssrf.ts) menolak alamat privat — tetapi
//      bergantung pada hasil DNS saat ini dan bisa diakali rebinding;
//   2. allowlist ini menolak host APAPUN di luar daftar, bahkan bila
//      host itu publik dan DNS-nya "bersih" — permukaan serang
//      ingestion menyusut dari "seluruh internet" menjadi 8 host.
//
// Daftar ini = 7 sumber RSS seed migrasi v1
// (supabase/migrations/20261116_pf_v1_foundation.sql:348-355) +
// host API GDELT (src/lib/ingestion/gdelt.ts). Perbandingan host
// PERSIS (exact match, huruf kecil) — subdomain TIDAK otomatis
// diizinkan: `evil.antaranews.com` atau `antaranews.com.evil.test`
// tetap ditolak.
//
// MENAMBAH SUMBER BARU: tambahkan host-nya DI SINI (dan di seed
// migrasi bila sumber itu permanen) — sumber yang ditambahkan admin
// lewat /api/sumber TETAP DITOLAK ingestion sampai host-nya masuk
// daftar ini. Itu sengaja (fail-closed): menambah sumber baru adalah
// keputusan keamanan, bukan sekadar baris database. Bila suatu feed
// me-redirect ke host di luar daftar (mis. feedburner / CDN baru),
// ingestion gagal dengan pesan jelas — tambahkan host redirect itu
// ke daftar SESUDAH memverifikasi pemiliknya, jangan longgarkan
// pemeriksaannya.
//
// CATATAN: allowlist ini HANYA untuk ingestion (fetchRss/fetchGdelt).
// Jalur fetch URL arbitrer (cek sumber admin, Research mengambil teks
// halaman artikel) TIDAK memakai allowlist — URL-nya memang arbitrer
// (tautan artikel dari feed mana pun) — tetapi tetap memakai
// fetchAman: cek privat per hop + pinning IP + re-resolusi pasca-fetch.
export const HOST_FEED_DIIZINKAN: ReadonlySet<string> = new Set([
  "www.antaranews.com",
  "www.cnnindonesia.com",
  "feed.liputan6.com",
  "www.cnbcindonesia.com",
  "www.tribunnews.com",
  "www.republika.co.id",
  "feeds.bbci.co.uk",
  "api.gdeltproject.org",
]);

/** True bila host URL (huruf kecil, tanpa port) ada di allowlist feed. */
export function hostFeedDiizinkan(url: string): boolean {
  try {
    return HOST_FEED_DIIZINKAN.has(
      new URL(url).hostname.toLowerCase(),
    );
  } catch {
    return false;
  }
}

/**
 * Kembalikan pesan penolakan bila URL bukan host feed yang diizinkan
 * (atau bukan http(s)); null bila boleh. Dipakai sebagai `periksaHost`
 * untuk fetchAman pada jalur ingestion.
 */
export function tolakHostFeed(url: string): string | null {
  let terurai: URL;
  try {
    terurai = new URL(url);
  } catch {
    return "URL tidak valid.";
  }
  if (terurai.protocol !== "http:" && terurai.protocol !== "https:") {
    return "Hanya http(s) yang diizinkan.";
  }
  if (!hostFeedDiizinkan(url)) {
    return `Host ${terurai.hostname} tidak ada di allowlist feed ingestion.`;
  }
  return null;
}

import { tolakHostPrivat } from "./ssrf.ts";

/**
 * Pemeriksa gabungan untuk jalur ingestion: host HARUS ada di
 * allowlist DAN lolos cek privat. Dipakai sebagai `periksaHost`
 * fetchAman agar mengganti tolakHostPrivat dengan allowlist saja
 * tidak membuka celah (host allowlist yang DNS-nya diracuni ke
 * alamat privat tetap ditolak).
 */
export async function tolakHostFeedAman(url: string): Promise<string | null> {
  return tolakHostFeed(url) ?? (await tolakHostPrivat(url));
}
