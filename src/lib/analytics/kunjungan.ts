// Pencatatan kunjungan halaman ke tabel pf_kunjungan
// (Gelombang B2-D, D1 — Traffic Analytics dari DB sendiri).
// PRIVASI (aturan tugas): yang disimpan HANYA path + waktu +
// status login (user_id bila login, null bila anonim).
// TIDAK PERNAH disimpan: alamat IP, user-agent, query string
// (bisa berisi data pribadi), isi pertanyaan/komentar, atau
// fingerprint apa pun. Retensi: 90 hari — baris lebih tua
// dihapus fungsi pf_bersihkan_data_lama() (migrasi v14).
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Normalisasi path untuk disimpan: hanya pathname (tanpa query
 * string / hash — keduanya bisa berisi data pribadi), harus
 * diawali "/", maksimal 500 karakter. null bila tidak valid.
 */
export function normalisasiPath(masuk: unknown): string | null {
  if (typeof masuk !== "string") return null;
  let path = masuk.trim();
  const potong = path.search(/[?#]/);
  if (potong >= 0) path = path.slice(0, potong);
  if (!path.startsWith("/")) return null;
  if (path.length === 0 || path.length > 500) return null;
  // Tolak karakter kontrol / path traversal yang lolos.
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  return path;
}

/**
 * Catat satu kunjungan. TIDAK PERNAH melempar (tracker di
 * klien bersifat fire-and-forget). Mengembalikan true bila
 * baris berhasil ditulis.
 */
export async function catatKunjungan(
  service: SupabaseClient,
  input: { path: string; userId: string | null },
): Promise<boolean> {
  try {
    const { error } = await service.from("pf_kunjungan").insert({
      path: input.path,
      user_id: input.userId,
      masuk: input.userId !== null,
    });
    if (error) {
      console.error("[analytics] gagal mencatat kunjungan:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[analytics] gagal mencatat kunjungan:", err);
    return false;
  }
}
