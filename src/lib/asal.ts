// Pemeriksaan asal (Origin/Referer) untuk CSRF — SATU sumber
// kebenaran untuk cek per-route (lib/ai/route-auth.ts: cekOrigin)
// DAN cek terpusat di proxy.ts (semua mutasi /api/*).
//
// SENGAJA tanpa import apa pun (murni URL + string) agar aman
// dipakai di proxy.ts (Edge runtime — `node:crypto` dkk. tidak
// tersedia di sana) maupun di route-auth.ts (Node runtime).
// Logika dipindahkan utuh dari route-auth.ts (Gelombang B1,
// P0-8/S-9) — perilaku tidak berubah, hanya lokasi.
/**
 * Normalisasi satu nilai origin menjadi bentuk "https://host:port"
 * (tanpa path/query). null bila bukan URL valid.
 */
export function normalisasiOrigin(nilai: string | null | undefined): string | null {
  if (!nilai) return null;
  try {
    return new URL(nilai.trim()).origin;
  } catch {
    return null;
  }
}

/**
 * true bila permintaan BOLEH lanjut (bukan lintas situs).
 * Aturan (sama persis dengan cekOrigin lama):
 *   - Origin + Referer absen -> klien non-browser (curl, workflow
 *     GitHub Actions, fetch server-ke-server, pemicu job
 *     internal) — tidak ada konteks CSRF, izinkan;
 *   - Origin ada -> harus sama dengan origin aplikasi
 *     (PF_SITE_URL, atau host request itu sendiri);
 *   - Origin absen + Referer ada -> Referer dicek sama;
 *   - Origin "null" (konteks sandbox) atau bukan URL valid ->
 *     tolak, bukan izinkan diam-diam.
 * Perbandingan memakai host sebagai cadangan bila skema berbeda
 * (dev http vs https di belakang proxy): host yang sama persis
 * tetap lolos, host berbeda tetap ditolak.
 * SameSite=Lax tetap berlaku sebagai lapis kedua.
 */
export function apakahAsalDiizinkan(
  headers: { get(nama: string): string | null },
  siteUrl: string | undefined,
): boolean {
  const origin = headers.get("origin");
  const referer = headers.get("referer");
  if (!origin && !referer) return true;
  const kandidat = origin ?? normalisasiOrigin(referer);
  if (!kandidat) return false;
  let asal: URL;
  try {
    asal = new URL(kandidat);
  } catch {
    return false;
  }
  const host = headers.get("host") ?? "";
  const proto = headers.get("x-forwarded-proto") ?? "https";
  const diizinkan = new Set<string>();
  const site = normalisasiOrigin(siteUrl);
  if (site) diizinkan.add(site);
  if (host) diizinkan.add(`${proto}://${host}`);
  if (diizinkan.has(asal.origin)) return true;
  if (host && asal.host === host) return true;
  return false;
}
