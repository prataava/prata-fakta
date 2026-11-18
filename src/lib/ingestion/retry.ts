// Retry per-sumber dengan backoff eksponensial (Gelombang B1, P2-3 / N-S5).
// Dipakai mesin ingestion untuk membungkus SATU pengambilan feed/GDELT:
// satu sumber yang gagal sementara (429/5xx/gangguan jaringan) dicoba
// ulang sendiri — tanpa mengulang seluruh job dan tanpa memaksa sumber
// lain menunggu. Retry-After dari server dihormati (khusus GDELT 429).
//
// PENGECUALIAN 429 (v27, 18 Nov 2026): 429 dengan Retry-After BESAR
// (> batasTidur429Detik, bawaan 10 dtk) TIDAK diulang tidur di dalam
// run. "Coba lagi sesudah Retry-After" diwujudkan sebagai COOLDOWN
// antar-run (ketahanan.ts: 30 mnt–6 jam), bukan tidur sampai 300
// detik × 2 di dalam satu panggilan route — tidur itu berisiko
// mendorong route melewati batas waktu serverless dan menggagalkan
// SEMUA sumber. Retry-After kecil (≤10 dtk) tetap dihormati dengan
// tidur di dalam run; 5xx/gangguan jaringan tetap diulang 3x dengan
// backoff + jitter.

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
 * Penanda pesan untuk redirect sementara ke host login/SSO penyedia
 * (mis. Nature yang sesekali me-redirect feed-nya ke idp.nature.com).
 * Dipakai ssrf.ts (pelempar) + engine.ts (eskalasi sesudah 5x
 * beruntun) agar tidak bergantung pada string harfiah di dua tempat.
 * BUKAN penolakan allowlist permanen: feed-nya sah, yang sementara
 * adalah pengalihannya ke halaman masuk.
 */
export const PESAN_REDIRECT_LOGIN = "Redirect sementara ke host login";

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
 *
 * CAP TUNGGAL (Fase 3, butir 4): 300 detik dipakai DI MANA-MANA —
 * di sini DAN di cobaUlang (Retry-After tidak pernah menunda satu
 * percobaan lebih dari 300 dtk). Cooldown antar-run (bukan jeda
 * retry) diatur terpisah di ketahanan.ts (min 30 mnt, maks 6 jam).
 */
export const BATAS_RETRY_AFTER_DETIK = 300;
export function parseRetryAfter(
  nilai: string | null | undefined,
  sekarangMs: number = Date.now(),
): number | null {
  if (nilai === null || nilai === undefined) return null;
  const teks = nilai.trim();
  if (!teks) return null;
  const detik = Number(teks);
  if (Number.isFinite(detik)) {
    return Math.min(
      BATAS_RETRY_AFTER_DETIK,
      Math.max(0, Math.floor(detik)),
    );
  }
  const tanggal = Date.parse(teks);
  if (Number.isNaN(tanggal)) return null;
  return Math.min(
    BATAS_RETRY_AFTER_DETIK,
    Math.max(0, Math.floor((tanggal - sekarangMs) / 1000)),
  );
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
  /** Batas Retry-After (detik) yang masih diulang tidur di dalam run
   *  (v27, bawaan 10): 429 dengan Retry-After lebih besar langsung
   *  dilempar tanpa tidur — penanganannya adalah cooldown antar-run,
   *  bukan tidur sampai 300 detik di dalam satu panggilan route. */
  batasTidur429Detik?: number;
  /** Fungsi tidur (dapat di-injeksi uji agar tidak menunggu nyata). */
  tidur?: (ms: number) => Promise<void>;
  /** Sumber acak untuk jitter (dapat di-injeksi uji agar deterministik). */
  acak?: () => number;
}

const tidurBawaan = (ms: number) =>
  new Promise<void>((selesai) => setTimeout(selesai, ms));

/**
 * Jitter untuk jeda backoff (Fase 3, butir 4): kalikan jeda dasar
 * dengan faktor acak merata −25%..+50% (0,75..1,50). Tujuannya agar
 * banyak sumber yang gagal bersamaan tidak mencoba ulang pada
 * detik yang sama (thundering herd ke GDELT/feed yang sama).
 * Fungsi murni — `acak` dapat di-injeksi uji agar deterministik.
 */
export function tambahJitter(
  jedaMs: number,
  acak: () => number = Math.random,
): number {
  const faktor = 0.75 + acak() * 0.75;
  return Math.max(0, Math.round(jedaMs * faktor));
}

/**
 * Jalankan fn dengan retry bila gagal sementara. Mengembalikan nilai +
 * jumlah percobaan yang dipakai. Melempar galat terakhir bila semua
 * percobaan gagal, atau langsung bila galat tidak bisa diulang.
 * Retry-After (bila ada di galat) mengalahkan backoff — tetapi tetap
 * dibatasi BATAS_RETRY_AFTER_DETIK (300 dtk, sama dengan
 * parseRetryAfter) agar run tidak menggantung. Backoff eksponensial
 * diberi jitter ±25–50% (tambahJitter).
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
      // 429 dengan Retry-After besar (v27): gagal cepat tanpa tidur —
      // penanganannya adalah cooldown antar-run (ketahanan.ts),
      // bukan tidur sampai 300 detik di dalam satu panggilan route.
      if (
        err instanceof GalatSementara &&
        err.status === 429 &&
        err.retryAfterDetik !== undefined &&
        err.retryAfterDetik > (opsi.batasTidur429Detik ?? 10)
      ) {
        throw err;
      }
      // Retry-After didahulukan (khusus 429); bila tidak ada, backoff
      // eksponensial + jitter. Kedua jalur dibatasi cap yang sama.
      const retryAfter =
        err instanceof GalatSementara ? err.retryAfterDetik : undefined;
      const jedaDasar =
        retryAfter !== undefined
          ? Math.min(BATAS_RETRY_AFTER_DETIK * 1000, retryAfter * 1000)
          : Math.min(
              jedaMaksMs,
              Math.round(jedaAwalMs * Math.pow(pengali, percobaan - 1)),
            );
      const jeda = tambahJitter(jedaDasar, opsi.acak);
      jedaMs.push(jeda);
      await tidur(jeda);
    }
  }
  // Tidak terjangkau (loop selalu return/throw), demi TypeScript.
  throw galatTerakhir;
}
