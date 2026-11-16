// Helper galat baca (Gelombang B1, P2-14 / B-S9).
// Dipakai SEMUA fungsi baca di lib/ (data, cerita, negara,
// riset, lanjutan, podcast, explainer, sejarah): setiap catch
// penelan WAJIB mencatat galat dengan konteks fungsi, dan
// membedakan "tabel belum ada" (empty state jujur — migrasi
// belum dijalankan) dari galat lain (dilempar → 503/error).
// Kode tabel-belum-ada PostgREST: "PGRST205"; kode Postgres:
// "42P01" (undefined_table); pesan juga diperiksa karena
// beberapa jalur mengembalikan galat tanpa kode.

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
  if (galatTabelBelumAda(err)) {
    console.error(
      `[baca] ${fungsi}: tabel belum ada (migrasi belum dijalankan) — empty state.`,
      err,
    );
    return true;
  }
  console.error(`[baca] ${fungsi}: galat baca database.`, err);
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
