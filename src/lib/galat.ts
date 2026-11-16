// Helper galat baca (Gelombang B1, P2-14 / B-S9).
// Dipakai SEMUA fungsi baca di lib/ (data, cerita, negara,
// riset, lanjutan, podcast, explainer, sejarah): setiap catch
// penelan WAJIB mencatat galat dengan konteks fungsi, dan
// membedakan "tabel belum ada" (empty state jujur — migrasi
// belum dijalankan) dari galat lain (dilempar → 503/error).
// Kode tabel-belum-ada PostgREST: "PGRST205"; kode Postgres:
// "42P01" (undefined_table); pesan juga diperiksa karena
// beberapa jalur mengembalikan galat tanpa kode.
// Tahap C-4: galat baca yang BUKAN tabel-belum-ada kini juga
// ditulis ke pf_app_errors (via catatGalatAplikasi,
// fire-and-forget — pencatatan tidak boleh menggagalkan
// pembacaan) agar tampil di /admin/monitoring. Galat
// tabel-belum-ada TIDAK ditulis ke DB (kondisi pra-migrasi
// yang diketahui — mencatatnya hanya membanjiri log).
import { catatGalatAplikasi } from "@/lib/analytics/galat";

// Tahap H: penolakan fetch prerender PPR (Next.js 16) BUKAN galat
// database. Saat shell statis halaman PPR selesai lebih dulu dari
// fetch dinamisnya, React menolak fetch itu dengan pesan "During
// prerendering, fetch() rejects when the prerender is complete"
// dan menanganinya sendiri — halaman tetap 200 dengan empty state.
// Tanpa detektor ini, setiap kunjungan halaman PPR membanjiri log
// server + pf_app_errors dengan dump stack trace framework yang
// diklasifikasi keliru sebagai "galat baca database" (teramati
// smoke Tahap H: dump di /, /cerita, /brief, /negara, /podcast).
/** true bila galat adalah penolakan prerender PPR Next.js. */
export function galatPrerenderPPR(err: unknown): boolean {
  // Bentuk galat bervariasi menurut jalur: Error biasa (throw
  // langsung) ATAU objek galat Supabase/PostgREST ({ message,
  // details, hint, code }) — di runtime, penolakan fetch PPR
  // sampai sebagai objek (message + details berisi pesan PPR).
  const pesan =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : err && typeof err === "object"
          ? [
              (err as { message?: unknown }).message,
              (err as { details?: unknown }).details,
            ]
              .filter((x): x is string => typeof x === "string")
              .join(" ")
          : "";
  // Keluarga pesan yang sama: "During prerendering, fetch()/cookies()/
  // headers() rejects when the prerender is complete" — API apa pun.
  return (
    pesan.includes("During prerendering,") &&
    pesan.includes("rejects when the prerender is complete")
  );
}

/** true bila galat berarti tabel/database belum tersedia. */
export function galatTabelBelumAda(err: unknown): boolean {
  const kode =
    err && typeof err === "object"
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  if (kode === "PGRST205" || kode === "42P01") return true;
  const pesan =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  return (
    pesan.includes("Could not find the table") ||
    pesan.includes("does not exist") ||
    pesan.includes("belum dibuat")
  );
}

/**
 * Catat galat baca dengan konteks fungsi.
 * Mengembalikan true bila galat adalah "tabel belum ada"
 * (pemanggil boleh mengembalikan empty state); false bila
 * galat lain (pemanggil WAJIB melempar, bukan menelan).
 */
export function catatGalatBaca(fungsi: string, err: unknown): boolean {
  if (galatPrerenderPPR(err)) {
    // Artefak PPR: bukan galat database — jangan catat ke log
    // maupun pf_app_errors; pemanggil mengembalikan empty state.
    return true;
  }
  if (galatTabelBelumAda(err)) {
    console.error(
      `[baca] ${fungsi}: tabel belum ada (migrasi belum dijalankan) — empty state.`,
      err,
    );
    return true;
  }
  console.error(`[baca] ${fungsi}: galat baca database.`, err);
  // Tahap C-4: galat baca nyata (bukan tabel belum ada) juga
  // dicatat ke pf_app_errors agar tampil di /admin/monitoring.
  void catatGalatAplikasi({
    sumber: `baca:${fungsi}`,
    pesan:
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "Galat baca database.",
    kode:
      err && typeof err === "object"
        ? String((err as { code?: unknown }).code ?? "") || null
        : null,
    stack: err instanceof Error ? (err.stack ?? null) : null,
  });
  return false;
}

/** Galat lempar untuk jalur baca yang gagal bukan karena tabel. */
export class GalatBaca extends Error {
  readonly fungsi: string;
  constructor(fungsi: string, penyebab: unknown) {
    super(
      `Gagal membaca data (${fungsi}): ` +
        (penyebab instanceof Error ? penyebab.message : "galat database"),
    );
    this.name = "GalatBaca";
    this.fungsi = fungsi;
  }
}

/**
 * Terapkan aturan P2-14 pada galat query Supabase ({ error }):
 * tabel-belum-ada → kembalikan null (empty state OK);
 * galat lain → catat + lempar GalatBaca.
 * Dipakai di cabang `if (error)` fungsi baca lib.
 */
export function lemparBilaBukanTabelBelumAda(
  fungsi: string,
  error: unknown,
): null {
  if (catatGalatBaca(fungsi, error)) return null;
  throw new GalatBaca(fungsi, error);
}
