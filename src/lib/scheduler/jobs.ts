// Scheduler server-side — Tahap 13C (F3/F6 + locking).
// Lock + pencatatan jalan job cron di pf_scheduled_jobs.
//
// Prinsip:
// - Lock memakai kolom yang SUDAH ADA di pf_scheduled_jobs
//   (migrasi v5): status_terakhir='berjalan' + terakhir_jalan.
//   Klaim = satu UPDATE bersyarat: hanya berhasil bila baris
//   belum 'berjalan' ATAU lock-nya sudah basi (terakhir_jalan
//   lebih lama dari TIMEOUT_LOCK_MENIT). Dua run bersamaan yang
//   sama-sama UPDATE akan diserialkan Postgres: yang kedua
//   mengevaluasi ulang WHERE sesudah commit pertama dan mendapat
//   0 baris -> lock tidak didapat -> route menjawab 409 jujur,
//   bukan memproses batch yang sama dua kali.
// - Bila baris job BELUM ADA (seed v5 hanya 3 job; seed 5 job
//   ada di LAPORAN-FASE-8 §14) atau tabel belum ada, klaim
//   melaporkan tersedia=false dan route TETAP BERJALAN tanpa
//   lock (best-effort) sambil mencatatnya di respons — bukan
//   409 palsu. Lock adalah pengaman, bukan prasyarat jalan.
// - selesaikanJob() memperbarui terakhir_jalan + status_terakhir
//   di AKHIR setiap run cron (F6): dashboard tidak lagi
//   menampilkan job cron "belum pernah jalan" selamanya.
//   Dipanggil dari finally route, jadi jalan baik saat run
//   berhasil maupun gagal.
// - Timeout lock 30 menit: workflow timeout 10 menit, jadi lock
//   yang masih 'berjalan' sesudah 30 menit pasti run yang mati
//   (crash/timeout platform) dan boleh direbut run berikutnya.
import type { SupabaseClient } from "@supabase/supabase-js";

/** Lima job yang dipanggil cron GitHub Actions (LAPORAN §10.1). */
export const NAMA_JOB_CRON = [
  "ingestion",
  "editorial",
  "brief",
  "data-analysis",
  "terbitkan-terjadwal",
] as const;

export type NamaJobCron = (typeof NAMA_JOB_CRON)[number];

/** Jadwal cron workflow GitHub Actions per job (WIB = UTC + 7). */
export const JADWAL_CRON_JOB: Record<NamaJobCron, string> = {
  ingestion: "*/30 * * * *",
  editorial: "0 0,6,12,18 * * *",
  brief: "0 22 * * *",
  "data-analysis": "0 1 * * 1",
  "terbitkan-terjadwal": "0 * * * *",
};

/** Lock dianggap basi sesudah 30 menit (workflow timeout 10 mnt). */
export const TIMEOUT_LOCK_MENIT = 30;

export interface HasilKlaim {
  /** true bila lock berhasil diklaim run ini. */
  diklaim: boolean;
  /** false bila tabel/baris job tidak ada (lock tak tersedia). */
  tersedia: boolean;
  /** Alasan bila tidak diklaim / tidak tersedia (untuk respons). */
  alasan: string | null;
}

/**
 * Klaim lock job. Mengembalikan { diklaim:true } bila run ini
 * pemilik lock. TIDAK PERNAH melempar: galat DB dilaporkan
 * sebagai tersedia=false agar route bisa jalan tanpa lock.
 */
export async function klaimJob(
  klien: SupabaseClient,
  nama: string,
  timeoutMenit: number = TIMEOUT_LOCK_MENIT,
): Promise<HasilKlaim> {
  const sekarang = new Date().toISOString();
  const batasBasi = new Date(
    Date.now() - timeoutMenit * 60_000,
  ).toISOString();
  try {
    const { data, error } = await klien
      .from("pf_scheduled_jobs")
      .update({
        status_terakhir: "berjalan",
        terakhir_jalan: sekarang,
        error_terakhir: null,
      })
      .eq("nama", nama)
      .or(
        `status_terakhir.neq.berjalan,terakhir_jalan.is.null,terakhir_jalan.lt.${batasBasi}`,
      )
      .select("id")
      .maybeSingle();
    if (error) {
      return {
        diklaim: false,
        tersedia: false,
        alasan: `tabel pf_scheduled_jobs tidak dapat dibaca (${error.message})`,
      };
    }
    if (data) {
      return { diklaim: true, tersedia: true, alasan: null };
    }
    // 0 baris: bedakan "baris tidak ada" dari "lock dipegang run lain".
    const { data: baris } = await klien
      .from("pf_scheduled_jobs")
      .select("id,status_terakhir,terakhir_jalan")
      .eq("nama", nama)
      .maybeSingle();
    if (!baris) {
      return {
        diklaim: false,
        tersedia: false,
        alasan:
          "baris job belum ada di pf_scheduled_jobs (seed 5 job belum diterapkan — lihat LAPORAN-FASE-8 §14)",
      };
    }
    return {
      diklaim: false,
      tersedia: true,
      alasan: `job '${nama}' sedang berjalan (status_terakhir='berjalan')`,
    };
  } catch (err) {
    return {
      diklaim: false,
      tersedia: false,
      alasan: `klaim lock gagal: ${err instanceof Error ? err.message : "galat tak dikenal"}`,
    };
  }
}

/**
 * Tutup run job (F6): terakhir_jalan + status_terakhir +
 * error_terakhir. Best-effort: TIDAK PERNAH melempar, agar
 * pencatatan tidak membatalkan hasil run. Mengembalikan true
 * bila baris berhasil diperbarui.
 */
export async function selesaikanJob(
  klien: SupabaseClient,
  nama: string,
  ok: boolean,
  error: string | null = null,
): Promise<boolean> {
  try {
    const { data, error: errUpdate } = await klien
      .from("pf_scheduled_jobs")
      .update({
        status_terakhir: ok ? "berhasil" : "gagal",
        terakhir_jalan: new Date().toISOString(),
        error_terakhir: ok ? null : error,
      })
      .eq("nama", nama)
      .select("id")
      .maybeSingle();
    if (errUpdate) return false;
    return data !== null && data !== undefined;
  } catch {
    return false;
  }
}
