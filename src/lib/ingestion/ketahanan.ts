// Ketahanan ingestion PRATA FAKTA — Fase 3 + 6 (RENCANA-GLOBAL-NEWS.md).
// Fungsi murni + tipe untuk: cooldown per-sumber, circuit breaker,
// klasifikasi galat per sumber, dan pemetaan status run yang aman
// untuk database lama. TIDAK ADA I/O di sini — engine yang memakai
// helper ini, adapter yang menyimpan hasilnya.
//
// FAIL-SOFT TERHADAP KOLOM v22 (migrasi Worker A):
// kolom pf_sources v22 (poll_interval_minutes, cooldown_until,
// failure_count, health_status, etag, last_modified, last_success_at)
// BELUM diterapkan di produksi saat kode ini ditulis. Karena itu
// SEMUA pembacaan keadaan lewat adapter.bacaKeadaanSumber() boleh
// mengembalikan null (kolom belum ada -> engine memakai bawaan di
// bawah dan tetap jalan seperti sebelum v22), dan SEMUA penulisan
// lewat adapter.tulisKeadaanSumber() boleh gagal diam-diam.
// JANGAN PERNAH mengasumsikan kolom v22 ada di sini — nilai
// undefined/null selalu diartikan sebagai "tidak diketahui", bukan
// sebagai galat.

import { GalatSementara } from "./retry.ts";

// ---------- Klasifikasi galat per sumber ----------

/** Kelas hasil per sumber (Fase 3, butir 5 + status run lama). */
export type KelasGalat =
  | "selesai"
  | "sebagian"
  | "rate-limited"
  | "unavailable"
  | "invalid-feed"
  | "permanently-failed"
  | "disabled"
  | "dilewati"
  | "gagal";

/**
 * Kelas BERAT — satu-satunya yang menggagalkan job workflow
 * ingestion (lihat .github/workflows/ingestion.yml). Kelas lain
 * (rate-limited / dilewati / unavailable / sebagian / invalid-feed)
 * = job sukses dengan peringatan: kegagalannya tetap tercatat di
 * pf_ingestion_runs + respons JSON, hanya tidak menghentikan
 * jadwal cron. 'gagal' (galat engine — mis. semua item gagal
 * disimpan) juga berat: itu bukan gangguan sumber, itu gangguan
 * sistem kita sendiri.
 *
 * CATATAN v27 (18 Nov 2026): 'invalid-feed' DIKELUARKAN dari kelas
 * berat. Satu respons bukan-XML BISA jadi gangguan sementara sisi
 * penyedia (kasus UN News 17 Nov 2026: sempat mengirim halaman
 * bukan-XML, lalu normal lagi) — bukan bukti feed berubah format.
 * Feed yang BENAR-BENAR mati tetap dieskalasi: invalid-feed 5x
 * beruntun → 'permanently-failed' (engine.ts), dan itu BERAT.
 * Begitu pula redirect-login berulang (5x → permanently-failed).
 */
export const KELAS_BERAT: ReadonlySet<KelasGalat> = new Set([
  "permanently-failed",
  "gagal",
]);

export function apakahKelasBerat(kelas: KelasGalat | null | undefined): boolean {
  if (!kelas) return false;
  return KELAS_BERAT.has(kelas);
}

// ---------- Cooldown + circuit breaker ----------

/** Cooldown minimum sesudah 429 (30 menit — Rencana Fase 3 butir 2). */
export const COOLDOWN_MIN_DETIK = 1800;
/** Cooldown maksimum sesudah 429 (6 jam — Rencana Fase 3 butir 2). */
export const COOLDOWN_MAKS_DETIK = 21600;
/** Gagal beruntun yang membuka circuit breaker (Fase 3, butir 3). */
export const AMBANG_CIRCUIT_BREAKER = 3;
/** Gagal invalid-feed beruntun yang menaikkan kelas ke permanently-failed. */
export const AMBANG_PERMANEN = 5;
/** Interval polling bawaan bila kolom v22 belum ada (menit). */
export const POLL_INTERVAL_BAWAAN_MENIT = 30;

/**
 * Cooldown (detik) dari Retry-After terakhir: dijepit ke
 * [30 mnt, 6 jam]. Tanpa Retry-After -> 30 menit (bawaan).
 * Retry-After 120 detik TIDAK berarti "coba lagi 2 menit lagi":
 * GDELT yang me-rate-limit sekali cenderung me-rate-limit lagi,
 * jadi lantai 30 menit selalu berlaku.
 */
export function hitungCooldownDetik(
  retryAfterDetik?: number | null,
): number {
  if (
    retryAfterDetik === undefined ||
    retryAfterDetik === null ||
    !Number.isFinite(retryAfterDetik)
  ) {
    return COOLDOWN_MIN_DETIK;
  }
  return Math.min(
    COOLDOWN_MAKS_DETIK,
    Math.max(COOLDOWN_MIN_DETIK, Math.floor(retryAfterDetik)),
  );
}

/** Waktu cooldown berakhir (Date) dari Retry-After + jam sekarang. */
export function hitungCooldownSampai(
  retryAfterDetik?: number | null,
  sekarang: Date = new Date(),
): Date {
  return new Date(
    sekarang.getTime() + hitungCooldownDetik(retryAfterDetik) * 1000,
  );
}

// ---------- Keadaan per sumber (kolom v22, semua opsional) ----------

export interface KeadaanSumber {
  /** Menit antar polling (null/undefined = 30). 0 = tiap denyut cron. */
  pollIntervalMenit: number | null;
  /** Jangan ambil sumber ini sebelum waktu ini (null = tidak cooldown). */
  cooldownUntil: Date | null;
  /** Gagal beruntun (reset tiap sukses). */
  failureCount: number;
  /** Status kesehatan terakhir ('sehat'/'peringatan'/'gagal'/...). */
  healthStatus: string | null;
  /** ETag pengambilan terakhir (conditional GET). */
  etag: string | null;
  /** Last-Modified pengambilan terakhir (conditional GET). */
  lastModified: string | null;
  /** Terakhir kali sumber ini benar-benar dicek/diambil. */
  terakhirCek: Date | null;
  /** Terakhir kali sumber ini sukses. */
  lastSuccessAt: Date | null;
}

/** Bawaan bila kolom v22 belum ada / keadaan belum pernah dibaca. */
export function keadaanBawaan(): KeadaanSumber {
  return {
    pollIntervalMenit: null,
    cooldownUntil: null,
    failureCount: 0,
    healthStatus: null,
    etag: null,
    lastModified: null,
    terakhirCek: null,
    lastSuccessAt: null,
  };
}

function keTanggal(
  nilai: Date | string | null | undefined,
): Date | null {
  if (!nilai) return null;
  if (nilai instanceof Date) {
    return Number.isNaN(nilai.getTime()) ? null : nilai;
  }
  const d = new Date(nilai);
  return Number.isNaN(d.getTime()) ? null : d;
}

function keBilangan(
  nilai: number | string | null | undefined,
): number | null {
  if (nilai === null || nilai === undefined) return null;
  const n = typeof nilai === "number" ? nilai : Number(nilai);
  return Number.isFinite(n) ? n : null;
}

/**
 * Keadaan mentah apa adanya dari database / SumberIngestion
 * (kunci snake_case seperti kolom pf_sources). Semua opsional —
 * kolom v22 yang belum ada cukup TIDAK ADA di objek ini.
 */
export interface KeadaanSumberMentah {
  poll_interval_minutes?: number | string | null;
  cooldown_until?: Date | string | null;
  failure_count?: number | string | null;
  health_status?: string | null;
  etag?: string | null;
  last_modified?: Date | string | null;
  terakhir_cek?: Date | string | null;
  last_success_at?: Date | string | null;
}

/**
 * Normalisasi keadaan mentah (dari kolom DB / SumberIngestion) ke
 * KeadaanSumber. Nilai tak dikenal / tak terurai -> bawaan, bukan
 * galat — inilah inti fail-soft v22.
 */
export function normalisasiKeadaan(
  masuk: KeadaanSumberMentah | null | undefined,
): KeadaanSumber {
  const bawaan = keadaanBawaan();
  if (!masuk) return bawaan;
  return {
    pollIntervalMenit: keBilangan(masuk.poll_interval_minutes),
    cooldownUntil: keTanggal(masuk.cooldown_until),
    failureCount: keBilangan(masuk.failure_count) ?? 0,
    healthStatus:
      typeof masuk.health_status === "string" && masuk.health_status
        ? masuk.health_status
        : null,
    etag: typeof masuk.etag === "string" && masuk.etag ? masuk.etag : null,
    lastModified: keTanggal(masuk.last_modified)?.toISOString() ?? null,
    terakhirCek: keTanggal(masuk.terakhir_cek),
    lastSuccessAt: keTanggal(masuk.last_success_at),
  };
}

// ---------- Gerbang lewati (poll interval / cooldown / circuit) ----------

export type AlasanLewati = "cooldown" | "belum-jatuh-tempo" | "circuit-terbuka";

export interface KeputusanLewati {
  alasan: AlasanLewati;
  /** Kapan sumber boleh dicoba lagi (bila diketahui). */
  sampai: Date | null;
  /** Penjelasan untuk log run / respons. */
  pesan: string;
}

/**
 * Tentukan apakah sumber harus DILEWATI pada run ini (tanpa fetch).
 * Urutan: cooldown dulu (paling keras), lalu circuit breaker, lalu
 * poll interval. Mengembalikan null bila sumber BOLEH diambil.
 *
 * Circuit breaker (Fase 3, butir 3): failure_count >= 3 TANPA
 * cooldown di masa depan = sirkuit terbuka tapi belum ada jadwal
 * probe — kembalikan alasan 'circuit-terbuka' dengan
 * sampai = sekarang + 30 mnt; engine MENULIS cooldown itu saat
 * melewati (probe half-open sesudah cooldown lewat). Tanpa
 * penulisan ini sumber akan dilewati SELAMANYA.
 */
export function alasanLewati(
  keadaan: KeadaanSumber,
  sekarang: Date = new Date(),
): KeputusanLewati | null {
  const kini = sekarang.getTime();

  if (keadaan.cooldownUntil && keadaan.cooldownUntil.getTime() > kini) {
    return {
      alasan: "cooldown",
      sampai: keadaan.cooldownUntil,
      pesan:
        `Dalam cooldown sampai ${keadaan.cooldownUntil.toISOString()} ` +
        `(failure_count=${keadaan.failureCount})`,
    };
  }

  if (keadaan.failureCount >= AMBANG_CIRCUIT_BREAKER) {
    const sampai = new Date(kini + COOLDOWN_MIN_DETIK * 1000);
    return {
      alasan: "circuit-terbuka",
      sampai,
      pesan:
        `Circuit breaker terbuka (gagal ${keadaan.failureCount}x beruntun) — ` +
        `probe berikutnya sesudah ${sampai.toISOString()}`,
    };
  }

  const interval = keadaan.pollIntervalMenit ?? POLL_INTERVAL_BAWAAN_MENIT;
  if (
    interval > 0 &&
    keadaan.terakhirCek &&
    kini - keadaan.terakhirCek.getTime() < interval * 60 * 1000
  ) {
    const sampai = new Date(
      keadaan.terakhirCek.getTime() + interval * 60 * 1000,
    );
    return {
      alasan: "belum-jatuh-tempo",
      sampai,
      pesan:
        `Belum jatuh tempo (interval ${interval} mnt, terakhir cek ` +
        `${keadaan.terakhirCek.toISOString()}, berikutnya ${sampai.toISOString()})`,
    };
  }

  return null;
}

// ---------- Klasifikasi galat fetch ----------

export interface HasilKlasifikasiGalat {
  kelas: KelasGalat;
  /** Detik Retry-After bila ada (khusus 429). */
  retryAfterDetik?: number;
}

/**
 * Klasifikasikan galat fetch menjadi kelas per sumber.
 * - 429 -> rate-limited (bawa Retry-After untuk cooldown).
 * - 5xx / gangguan jaringan / timeout -> unavailable (sementara).
 * - Feed bukan XML / JSON GDELT invalid / format tak dikenal ->
 *   invalid-feed (sumber berubah format / mati, bukan gangguan).
 * - Penolakan allowlist/SSRF / jenis sumber tak didukung ->
 *   permanently-failed (butuh tindakan admin, retry tidak membantu).
 * - Galat lain yang tak dikenal -> unavailable (asumsi sementara;
 *   JANGAN menaikkan ke kelas berat dari pesan yang tak dipahami).
 */
export function klasifikasiGalatFetch(err: unknown): HasilKlasifikasiGalat {
  if (err instanceof GalatSementara) {
    if (err.status === 429) {
      return {
        kelas: "rate-limited",
        retryAfterDetik: err.retryAfterDetik,
      };
    }
    return { kelas: "unavailable" };
  }
  const pesan = err instanceof Error ? err.message : String(err);
  if (
    pesan.startsWith("Feed ditolak:") ||
    pesan.startsWith("URL ditolak:") ||
    pesan.startsWith("Jenis sumber tidak didukung:")
  ) {
    return { kelas: "permanently-failed" };
  }
  if (
    pesan.includes("Feed bukan XML") ||
    pesan.includes("bukan JSON valid") ||
    pesan.includes("tidak berisi articles[]") ||
    pesan.includes("format tak dikenal")
  ) {
    return { kelas: "invalid-feed" };
  }
  return { kelas: "unavailable" };
}

// ---------- Pemetaan status run untuk database lama ----------

/**
 * Status pf_ingestion_runs punya CHECK di v3
 * ('berjalan','selesai','gagal','sebagian'). Kelas baru
 * (rate-limited, dilewati, ...) HANYA boleh ditulis apa adanya bila
 * migrasi v24 sudah diterapkan (v24 melonggarkan CHECK itu). Bila
 * belum, petakan ke nilai CHECK-aman supaya tutupRun tidak gagal
 * dengan pelanggaran CHECK (yang akan membiarkan run menggantung
 * 'berjalan' selamanya):
 *   dilewati/disabled -> 'selesai' (bukan kegagalan; 0 item, 0 gagal)
 *   rate-limited/unavailable/invalid-feed/permanently-failed -> 'gagal'
 *   selesai/sebagian/gagal -> apa adanya.
 * Kelas ASLI tetap tersimpan di kolom kelas_gagal (bila ada) dan di
 * respons JSON — pemetaan ini hanya soal kolom status.
 */
export function petakanStatusRunAman(status: string): string {
  switch (status) {
    case "dilewati":
    case "disabled":
      return "selesai";
    case "rate-limited":
    case "unavailable":
    case "invalid-feed":
    case "permanently-failed":
      return "gagal";
    case "selesai":
    case "sebagian":
    case "gagal":
    case "berjalan":
      return status;
    default:
      return "gagal";
  }
}

// ---------- Stagger antar fetch ----------

/**
 * Jeda mulai (ms) untuk sumber ke-`indeks` agar fetch antar sumber
 * tidak berangkat pada milidetik yang sama (Fase 3, butir 4).
 * Deterministik per indeks + acak 0..200 ms, dibatasi 2000 ms.
 * Sumber pertama (indeks 0) tanpa jeda. `acak` dapat di-injeksi uji.
 */
export function hitungJedaStagger(
  indeks: number,
  acak: () => number = Math.random,
  dasarMs: number = 200,
): number {
  if (indeks <= 0) return 0;
  return Math.min(2000, indeks * dasarMs + Math.floor(acak() * 200));
}
