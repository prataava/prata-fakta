// Retry per-sumber dengan backoff eksponensial (Gelombang B1, P2-3 / N-S5).
// Dipakai mesin ingestion untuk membungkus SATU pengambilan feed/GDELT:
// satu sumber yang gagal sementara (429/5xx/gangguan jaringan) dicoba
// ulang sendiri — tanpa mengulang seluruh job dan tanpa memaksa sumber
// lain menunggu. Retry-After dari server dihormati (khusus GDELT 429).

// Galat sementara: boleh dicoba ulang. Galat lain (validasi, allowlist,
// SSRF, HTTP 4xx selain 429) TIDAK boleh dicoba ulang — melempar Error
// biasa berarti "jangan ulangi".
export class GalatSementara extends Error {
  readonly status?: number;
  /** Detik dari header Retry-After (bila server mengirimnya). */
  readonly retryAfterDetik?: number;

  constructor(
    pesan: string,
    opsi: { status?: number; retryAfterDetik?: number } = {},
  ) {
    super(pesan);
    this.name = "GalatSementara";
    this.status = opsi.status;
    this.retryAfterDetik = opsi.retryAfterDetik;
  }
}

/** Apakah galat ini boleh dicoba ulang (429 / 5xx / gangguan jaringan). */
export function bisaDiulang(err: unknown): boolean {
  if (!(err instanceof GalatSementara)) return false;
  if (err.status === undefined) return true; // gangguan jaringan / timeout
  return err.status === 429 || err.status >= 500;
}

/**
 * Jumlah percobaan yang sudah dipakai saat sebuah galat dilempar
 * cobaUlang (1 bila galat tidak berasal dari sana). Dipakai pemanggil
 * untuk mencatat "gagal sesudah N percobaan" di log run.
 */
export function percobaanGalat(err: unknown): number | null {
  if (err instanceof Error) {
    const n = (err as unknown as { percobaan?: unknown }).percobaan;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Urai header Retry-After menjadi detik. Menerima angka detik ("120")
 * atau tanggal HTTP ("Wed, 21 Oct 2015 07:28:00 GMT"). Mengembalikan
 * null bila tidak ada / tidak dapat diurai / sudah lewat. Hasil
 * dibatasi 0..300 detik agar satu Retry-After nakal tidak menggantung
 * run ingestion (interval cron 30 menit).
 */
export function parseRetryAfter(
  nilai: string | null | undefined,
  sekarangMs: number = Date.now(),
): number | null {
  if (nilai === null || nilai === undefined) return null;
  const teks = nilai.trim();
  if (!teks) return null;
  const detik = Number(teks);
  if (Number.isFinite(detik)) {
    return Math.min(300, Math.max(0, Math.floor(detik)));
  }
  const tanggal = Date.parse(teks);
  if (Number.isNaN(tanggal)) return null;
  return Math.min(300, Math.max(0, Math.floor((tanggal - sekarangMs) / 1000)));
}

/** Ambil Retry-After dari sebuah Response (header "retry-after"). */
export function ambilRetryAfterDariRespons(
  respons: Response,
): number | null {
  try {
    return parseRetryAfter(respons.headers?.get("retry-after") ?? null);
  } catch {
    return null;
  }
}

/**
 * Bangun GalatSementara dari respons HTTP gagal (429/5xx). Dipakai
 * fetchRss/fetchGdelt agar mesin retry bisa membaca status +
 * Retry-After tanpa mengurai pesan galat.
 */
export function buatGalatHttp(
  status: number,
  respons: Response,
  pesan: string,
): GalatSementara {
  return new GalatSementara(pesan, {
    status,
    retryAfterDetik: ambilRetryAfterDariRespons(respons) ?? undefined,
  });
}

export interface OpsiCobaUlang {
  /** Jumlah percobaan total (termasuk yang pertama). Bawaan 3. */
  percobaanMaks?: number;
  /** Jeda sebelum percobaan ke-2 (ms); digandakan tiap percobaan. Bawaan 1000. */
  jedaAwalMs?: number;
  /** Batas atas jeda backoff (ms). Bawaan 8000. */
  jedaMaksMs?: number;
  /** Pengali backoff. Bawaan 2. */
  pengali?: number;
  /** Fungsi tidur (dapat di-injeksi uji agar tidak menunggu nyata). */
  tidur?: (ms: number) => Promise<void>;
}

const tidurBawaan = (ms: number) =>
  new Promise<void>((selesai) => setTimeout(selesai, ms));

/**
 * Jalankan fn dengan retry bila gagal sementara. Mengembalikan nilai +
 * jumlah percobaan yang dipakai. Melempar galat terakhir bila semua
 * percobaan gagal, atau langsung bila galat tidak bisa diulang.
 * Retry-After (bila ada di galat) mengalahkan backoff — tetapi tetap
 * dibatasi 60 detik agar run tidak menggantung.
 */
export async function cobaUlang<T>(
  fn: () => Promise<T>,
  opsi: OpsiCobaUlang = {},
): Promise<{ nilai: T; percobaan: number; jedaMs: number[] }> {
  const percobaanMaks = Math.max(1, opsi.percobaanMaks ?? 3);
  const jedaAwalMs = opsi.jedaAwalMs ?? 1000;
  const jedaMaksMs = opsi.jedaMaksMs ?? 8000;
  const pengali = opsi.pengali ?? 2;
  const tidur = opsi.tidur ?? tidurBawaan;
  const jedaMs: number[] = [];

  let galatTerakhir: unknown = null;
  for (let percobaan = 1; percobaan <= percobaanMaks; percobaan++) {
    try {
      const nilai = await fn();
      return { nilai, percobaan, jedaMs };
    } catch (err) {
      galatTerakhir = err;
      // Catat jumlah percobaan pada galat agar pemanggil bisa
      // melaporkan "gagal sesudah N percobaan" (lihat percobaanGalat).
      if (err instanceof Error) {
        (err as unknown as { percobaan?: number }).percobaan = percobaan;
      }
      if (percobaan >= percobaanMaks || !bisaDiulang(err)) {
        throw err;
      }
      // Retry-After didahulukan (khusus 429); bila tidak ada, backoff.
      const retryAfter =
        err instanceof GalatSementara ? err.retryAfterDetik : undefined;
      const jeda =
        retryAfter !== undefined
          ? Math.min(60_000, retryAfter * 1000)
          : Math.min(
              jedaMaksMs,
              Math.round(jedaAwalMs * Math.pow(pengali, percobaan - 1)),
            );
      jedaMs.push(jeda);
      await tidur(jeda);
    }
  }
  // Tidak terjangkau (loop selalu return/throw), demi TypeScript.
  throw galatTerakhir;
}
