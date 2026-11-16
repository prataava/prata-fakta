// Log galat aplikasi ke tabel pf_app_errors (Gelombang B2-D, D1).
// BUKAN console saja: galat yang dicatat di sini tampil di
// /admin/monitoring ("Galat Aplikasi") sehingga staf melihat galat
// nyata produksi tanpa membuka log Vercel. Fungsi ini TIDAK PERNAH
// melempar — pencatatan galat tidak boleh menggagalkan operasi utama.
// Bila kunci service belum diatur atau tabel v14 belum ada, galat
// hanya dicatat ke console (fallback jujur, bukan diam-diam hilang).
// Yang disimpan: sumber (nama fungsi/route), pesan, kode galat
// buram (ERR-XXXX), rute, dan stack TERPOTONG 2000 karakter.
// TIDAK PERNAH disimpan: isi pribadi pengguna, token, atau kunci.
import { cobaServiceClient } from "@/lib/supabase/service";

export type GalatAplikasi = {
  sumber: string;
  pesan: string;
  kode?: string | null;
  rute?: string | null;
  stack?: string | null;
};

/**
 * Catat galat route (Tahap C-4): satu panggilan untuk cabang 500
 * route publik/AI/ingestion. TIDAK PERNAH melempar; fire-and-
 * forget (`void catatGalatRoute(...)`).
 * - Galat "tabel belum ada" (PGRST205/42P01/42703) DILEWATI —
 *   itu kondisi yang sudah ditangani route (empty state / 503
 *   jujur), bukan galat aplikasi; mencatatnya hanya membanjiri
 *   pf_app_errors dengan kondisi pra-migrasi yang diketahui.
 *   (Duplikasi kecil dari galatTabelBelumAda di lib/galat.ts —
 *   sengaja tidak diimpor dari sana agar tidak ada siklus impor
 *   lib/galat.ts ↔ lib/analytics/galat.ts.)
 * - Galat lain dicatat ke pf_app_errors via catatGalatAplikasi
 *   (tampil di /admin/monitoring).
 */
export async function catatGalatRoute(
  sumber: string,
  err: unknown,
): Promise<void> {
  try {
    const kode =
      err && typeof err === "object"
        ? String((err as { code?: unknown }).code ?? "")
        : "";
    if (kode === "PGRST205" || kode === "42P01" || kode === "42703") {
      return;
    }
    const pesanMentah =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "Galat server (500).";
    if (
      pesanMentah.includes("Could not find the table") ||
      pesanMentah.includes("does not exist")
    ) {
      return;
    }
    await catatGalatAplikasi({
      sumber,
      pesan: pesanMentah,
      kode: kode || null,
      stack: err instanceof Error ? (err.stack ?? null) : null,
    });
  } catch {
    // Pencatatan galat tidak boleh menggagalkan respons route.
  }
}


/** Potong teks ke panjang maksimum (hindari baris raksasa di DB). */
function potong(teks: string, maks: number): string {
  return teks.length > maks ? `${teks.slice(0, maks)}…` : teks;
}

export async function catatGalatAplikasi(
  galat: GalatAplikasi,
): Promise<boolean> {
  const service = cobaServiceClient();
  const pesan = potong(galat.pesan.trim() || "Galat tanpa pesan.", 1000);
  const sumber = potong(galat.sumber.trim() || "tidak-diketahui", 120);
  if (!service) {
    console.error(`[galat-db] ${sumber}: ${pesan}`);
    return false;
  }
  try {
    const { error } = await service.from("pf_app_errors").insert({
      sumber,
      pesan,
      kode: galat.kode ? potong(galat.kode, 40) : null,
      rute: galat.rute ? potong(galat.rute, 500) : null,
      stack: galat.stack ? potong(galat.stack, 2000) : null,
    });
    if (error) {
      // Tabel v14 belum ada (PGRST205/42P01) atau galat tulis lain:
      // jangan lempar — catat ke console agar tidak hilang diam-diam.
      console.error(`[galat-db] ${sumber}: ${pesan}`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[galat-db] ${sumber}: ${pesan}`, err);
    return false;
  }
}
