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
// - Baris job yang BELUM ADA dibuat otomatis saat klaim (upsert,
//   Gelombang B1 / N-S9): seed v12 belum tentu diterapkan di
//   produksi, jadi mengandalkan seed saja membuat lock tidak pernah
//   tersedia. Upsert memakai jadwal dari JADWAL_CRON_JOB bila nama
//   job dikenal, "manual" bila tidak. Bila baris tetap tidak bisa
//   dibuat (mis. nama job melanggar CHECK migrasi v5/v12, atau
//   tabel belum ada), klaim melaporkan tersedia=false dan route
//   WAJIB menolak jalan tanpa lock (409 bila lock dipegang run lain,
//   503 bila sistem lock tidak tersedia) — TIDAK BOLEH lagi jalan
//   diam-diam tanpa lock seperti sebelumnya.
// - selesaikanJob() memperbarui terakhir_jalan + status_terakhir
//   di AKHIR setiap run cron (F6): dashboard tidak lagi
//   menampilkan job cron "belum pernah jalan" selamanya.
//   Dipanggil dari finally route, jadi jalan baik saat run
//   berhasil maupun gagal.
// - Timeout lock 15 menit (Gelombang B1 / N-S5): workflow timeout
//   10 menit, jadi lock yang masih 'berjalan' sesudah 15 menit
//   pasti run yang mati (crash/timeout platform) dan boleh direbut
//   run berikutnya; 15 menit juga LEBIH CEPAT dari interval cron
//   tersingkat (ingestion 30 menit), jadi run berikutnya tidak
//   pernah terblokir oleh lock basi run sebelumnya. Sebelumnya
//   30 menit — sama dengan interval ingestion, sehingga satu run
//   mati bisa memblokir tepat satu run berikutnya.
// - HEARTBEAT (Fase 5): timeout workflow editorial kini 30 menit
//   (bukan 10) dan satu run 50 item memakan ±7,5 menit — lock
//   15 menit BISA kedaluwarsa di tengah run yang sah dan panjang.
//   Karena itu route yang memegang lock memperbarui terakhir_jalan
//   tiap INTERVAL_HEARTBEAT_MENIT selama run hidup
//   (perbaruiHeartbeat): lock tetap segar selama worker hidup dan
//   tetap kedaluwarsa 15 menit sesudah detak terakhir bila worker
//   crash. TIMEOUT_LOCK_MENIT TETAP 15 menit — menaikkan timeout
//   khusus editorial menjadi 35 menit ditolak karena akan membuat
//   lock run yang mati memblokir run berikutnya lebih lama.
//   Heartbeat hanya memperpanjang lock yang MASIH SEGAR (belum
//   basi) — lock yang sudah basi tidak dihidupkan kembali.
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
  // Fase 5: editorial SETIAP 2 JAM — sama dengan
  // .github/workflows/editorial-pipeline.yml ("0 */2 * * *",
  // dinaikkan dari 6 jam pada 16 Nov 2026). Nilai lama di sini
  // ("0 0,6,12,18 * * *") sudah tidak sesuai workflow sejak
  // kenaikan itu dan membuat baris job yang dibuat otomatis saat
  // klaim (jadwal_cron) mencatat jadwal yang salah.
  editorial: "0 */2 * * *",
  brief: "0 22 * * *",
  "data-analysis": "0 1 * * 1",
  "terbitkan-terjadwal": "0 * * * *",
};

/** Lock dianggap basi sesudah 15 menit (workflow timeout 10 mnt, interval cron tersingkat 30 mnt). */
export const TIMEOUT_LOCK_MENIT = 15;

/** Heartbeat lock tiap 5 menit selama run hidup (Fase 5) — kurang
 *  dari sepertiga TIMEOUT_LOCK_MENIT, jadi satu detak yang
 *  terlewat (event loop lambat) tidak membuat lock basi. */
export const INTERVAL_HEARTBEAT_MENIT = 5;

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
 * sebagai tersedia=false agar route bisa menolak dengan 503 jujur
 * (bukan jalan tanpa lock).
 *
 * Bila baris job belum ada, baris dibuat otomatis dulu (upsert) —
 * lock selalu tersedia tanpa bergantung pada seed v12. Balapan
 * dua run yang sama-sama insert ditangani: konflik unik (23505)
 * diabaikan, klaim UPDATE berikutnya yang menentukan pemenang.
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
    // Upsert baris job bila belum ada (N-S9): cek dulu, lalu insert.
    // Cek + insert tidak atomik — balapan ditangani di bawah
    // (konflik unik 23505 diabaikan; klaim UPDATE yang memutuskan).
    const { data: barisAda, error: errCek } = await klien
      .from("pf_scheduled_jobs")
      .select("id")
      .eq("nama", nama)
      .maybeSingle();
    if (errCek) {
      return {
        diklaim: false,
        tersedia: false,
        alasan: `tabel pf_scheduled_jobs tidak dapat dibaca (${errCek.message})`,
      };
    }
    if (!barisAda) {
      const jadwal =
        (JADWAL_CRON_JOB as Record<string, string>)[nama] ?? "manual";
      const { error: errInsert } = await klien
        .from("pf_scheduled_jobs")
        .insert({
          nama,
          jadwal_cron: jadwal,
          deskripsi:
            "Baris job dibuat otomatis saat klaim lock (Gelombang B1 — seed v12 belum diterapkan)",
          aktif: true,
        })
        .select("id")
        .single();
      if (errInsert) {
        const kode = (errInsert as { code?: string }).code;
        const pesan = errInsert.message ?? "";
        const konflikUnik =
          kode === "23505" ||
          /duplicate key|unique constraint|already exists/i.test(pesan);
        if (!konflikUnik) {
          return {
            diklaim: false,
            tersedia: false,
            alasan: `baris job '${nama}' belum ada dan tidak dapat dibuat otomatis (${pesan})`,
          };
        }
        // Balapan insert: baris kini ada — lanjut ke klaim UPDATE.
      }
    }
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
          "baris job tidak ada di pf_scheduled_jobs dan tidak dapat dibuat otomatis",
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
 * Heartbeat lock (Fase 5): perbarui terakhir_jalan run yang MASIH
 * memegang lock, agar lock tidak kedaluwarsa di tengah run yang sah
 * tapi panjang (satu run editorial 50 item ±7,5 menit; timeout
 * workflow 30 menit > TIMEOUT_LOCK_MENIT 15 menit). Dipanggil
 * berkala oleh route selama pipeline berjalan (tiap
 * INTERVAL_HEARTBEAT_MENIT); bila worker crash, detak berhenti dan
 * lock kedaluwarsa 15 menit sesudah detak terakhir.
 *
 * Hanya memperpanjang lock yang masih segar: UPDATE bersyarat
 * status_terakhir='berjalan' DAN terakhir_jalan belum basi. Bila
 * lock sudah basi (atau sudah direbut run lain / sudah ditutup
 * selesaikanJob), heartbeat mengembalikan false dan TIDAK
 * menghidupkan lock kembali — run ini tidak boleh memperpanjang
 * lock yang bukan lagi miliknya.
 *
 * TIDAK PERNAH melempar (best-effort): kegagalan detak tidak boleh
 * membatalkan run yang sedang berjalan.
 */
export async function perbaruiHeartbeat(
  klien: SupabaseClient,
  nama: string,
  timeoutMenit: number = TIMEOUT_LOCK_MENIT,
): Promise<boolean> {
  const batasBasi = new Date(
    Date.now() - timeoutMenit * 60_000,
  ).toISOString();
  try {
    const { data, error } = await klien
      .from("pf_scheduled_jobs")
      .update({ terakhir_jalan: new Date().toISOString() })
      .eq("nama", nama)
      .eq("status_terakhir", "berjalan")
      .gte("terakhir_jalan", batasBasi)
      .select("id")
      .maybeSingle();
    if (error) return false;
    return data !== null && data !== undefined;
  } catch {
    return false;
  }
}

/**
 * Status HTTP untuk hasil klaim lock (kontrak fail-closed, dipakai
 * route /api/ai/jalankan; pola sama dengan /api/ingestion/jalankan):
 * 200 bila lock diklaim run ini, 409 bila lock dipegang run lain,
 * 503 bila sistem lock tidak tersedia / tidak terbaca. Pemisahan
 * murni ini diuji langsung (scripts/uji-lock-editorial.mjs) agar
 * keputusan fail-closed tidak hanya hidup di dalam handler route.
 */
export function statusHttpUntukKlaim(klaim: HasilKlaim): 200 | 409 | 503 {
  if (klaim.diklaim) return 200;
  return klaim.tersedia ? 409 : 503;
}

/**
 * Tutup run job (F6): terakhir_jalan + status_terakhir +
 * error_terakhir. Best-effort: TIDAK PERNAH melempar, agar
 * pencatatan tidak membatalkan hasil run. Mengembalikan true
 * bila baris berhasil diperbarui.
 *
 * Opsi `peringatan` (Gelombang B1, P1-6): bila run BERHASIL tetapi
 * ada peringatan non-gagal (mis. sumber basi), status tetap
 * 'berhasil' namun error_terakhir diisi "PERINGATAN: ..." agar
 * peringatan tampil di dashboard admin lewat kolom yang sama.
 * Bila run gagal, `error` menang atas peringatan.
 */
export async function selesaikanJob(
  klien: SupabaseClient,
  nama: string,
  ok: boolean,
  error: string | null = null,
  opsi: { peringatan?: string | null } = {},
): Promise<boolean> {
  try {
    const errorTerakhir = ok
      ? opsi.peringatan
        ? `PERINGATAN: ${opsi.peringatan}`
        : null
      : error;
    const { data, error: errUpdate } = await klien
      .from("pf_scheduled_jobs")
      .update({
        status_terakhir: ok ? "berhasil" : "gagal",
        terakhir_jalan: new Date().toISOString(),
        error_terakhir: errorTerakhir,
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
