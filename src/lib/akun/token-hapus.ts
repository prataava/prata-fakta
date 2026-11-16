// Token konfirmasi hapus akun (Gelombang B2-A, A1).
//
// KEPUTUSAN METODE VERIFIKASI (koordinator): tautan email, BUKAN
// kata sandi — alasannya: berlaku untuk semua pengguna termasuk
// yang mendaftar via Google OAuth (tanpa kata sandi), dan tidak
// ada penanganan kata sandi di alur penghapusan.
//
// Token mentah TIDAK PERNAH disimpan: yang disimpan di
// pf_account_deletions (migrasi v14) hanya sha256-nya. Token
// berlaku 24 jam, sekali pakai (status berubah menunggu ->
// dikonfirmasi saat dipakai), dan terikat ke user_id pemiliknya.
//
// Berkas ini MURNI (hanya node:crypto) agar bisa diuji langsung
// oleh baterai scripts/uji-ultimate-b2-akun.mjs tanpa server.
import { createHash, randomBytes } from "node:crypto";

/** Masa berlaku tautan konfirmasi hapus akun: 24 jam. */
export const KEDALUWARSA_HAPUS_MS = 24 * 60 * 60 * 1000;

/** Token acak 32 byte, base64url (aman diletakkan di query URL). */
export function buatTokenHapus(): string {
  return randomBytes(32).toString("base64url");
}

/** sha256 hex dari token mentah — inilah yang disimpan di DB. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * sha256 hex dari email (huruf kecil, tanpa spasi) — dipakai di
 * pf_account_deletions + jejak audit agar alamat email pengguna
 * yang dihapus TIDAK tersimpan polos di mana pun sesudah akun
 * hilang (jejak pasca-hapus hanya bisa dicocokkan lewat hash).
 */
export function hashEmail(email: string): string {
  return createHash("sha256")
    .update(email.trim().toLowerCase(), "utf8")
    .digest("hex");
}

/** true bila tautan yang diminta pada `dimintaPada` sudah lewat 24 jam. */
export function apakahTokenKedaluwarsa(
  dimintaPada: string | Date,
  sekarang: Date = new Date(),
): boolean {
  const diminta = new Date(dimintaPada).getTime();
  if (!Number.isFinite(diminta)) return true;
  return sekarang.getTime() - diminta > KEDALUWARSA_HAPUS_MS;
}
