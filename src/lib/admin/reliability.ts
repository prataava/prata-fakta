// Reliability Center (v27, 18 Nov 2026) — penilaian kesehatan job
// dari BUKTI EKSEKUSI AKTUAL, bukan dari badge hijau.
//
// MASALAH YANG DIPERBAIKI: pf_scheduled_jobs.status_terakhir
// MENYEMBUNYIKAN kegagalan parsial. Setiap panggilan /api/ai/jalankan
// (5x per run pipeline) adalah klaim lock + selesaikanJob tersendiri,
// jadi panggilan TERAKHIR yang berhasil menimpa status "gagal" dari
// panggilan sebelumnya — run #31 (44197264506) tercatat "berhasil"
// di pf_scheduled_jobs padahal workflow-nya Failure. Karena itu
// halaman Reliability TIDAK PERNAH menampilkan status_terakhir
// sebagai "sehat" begitu saja: yang dinilai adalah terakhir_jalan
// vs interval jadwal yang diharapkan + error_terakhir + bukti
// per-sumber/per-run (pf_ingestion_runs, pf_ai_runs, pf_app_errors).
//
// Fungsi di berkas ini MURNI (tanpa I/O) agar bisa diuji tanpa DB:
// masukkan baris job + "sekarang", dapatkan status + alasan.

// Interval yang DIHARAPKAN antar run sukses, dalam menit —
// diambil dari cron workflow di .github/workflows/*.yml
// (BUKAN dari label di kendali.ts; label editorial "Setiap 6 jam"
// di sana sudah basi sejak pipeline diubah ke 2 jam — diperbaiki
// v27). null = tidak ada jadwal (manual saja).
export const INTERVAL_JOB_MENIT: Readonly<Record<string, number | null>> = {
  ingestion: 30, // ingestion.yml: */30 * * * *
  editorial: 120, // editorial-pipeline.yml: 0 */2 * * *
  brief: 1440, // daily-brief.yml: 0 22 * * * (05.00 WIB)
  "data-analysis": 10080, // data-analysis.yml: 0 1 * * 1 (Senin)
  "terbitkan-terjadwal": 60, // terbitkan-terjadwal.yml: 0 * * * *
  backup: 1440, // backup.yml: 0 3 * * *
  "tanya-jawab": 1440, // tanya-jawab-draf.yml: 0 1 * * * (08.00 WIB)
  retensi: 43200, // retensi.yml: 30 3 1 * * (bulanan)
  digest: null, // belum ada workflow aktif
  podcast: null, // manual (podcast-tts.yml tanpa schedule)
  riset: null, // belum ada workflow aktif
};

// Ambang "terlambat": terakhir jalan lebih lama dari 2x interval.
// Dipilih 2x (bukan 1x) karena scheduler GitHub terbukti telat
// (run tanya-jawab 17 Nov telat ~7j42m dari jadwal) — 1x akan
// membanjiri halaman dengan peringatan palsu setiap telat kecil.
export const FAKTOR_TERLAMBAT = 2;

export type StatusKesehatanJob =
  | "sehat"
  | "terlambat"
  | "gagal"
  | "belum_pernah"
  | "tidak_tercatat";

export type BarisJobKesehatan = {
  nama: string;
  tercatat: boolean;
  aktif: boolean;
  terakhir_jalan: string | null;
  status_terakhir: string | null;
  error_terakhir: string | null;
};

export type HasilKesehatanJob = {
  nama: string;
  status: StatusKesehatanJob;
  /** Menit sejak terakhir jalan; null bila belum pernah. */
  keterlambatan_menit: number | null;
  /** Interval yang diharapkan (menit); null bila tanpa jadwal. */
  interval_menit: number | null;
  /** Perkiraan run berikut (terakhir jalan + interval); null bila tak dapat dihitung. */
  perkiraan_berikut: string | null;
  /** Alasan berbahasa manusia — SELALU menyebut bukti yang dipakai. */
  alasan: string;
};

export function nilaiKesehatanJob(
  job: BarisJobKesehatan,
  sekarangMs: number = Date.now(),
): HasilKesehatanJob {
  const interval = INTERVAL_JOB_MENIT[job.nama] ?? null;
  const dasar: Omit<HasilKesehatanJob, "status" | "alasan"> = {
    nama: job.nama,
    keterlambatan_menit: null,
    interval_menit: interval,
    perkiraan_berikut: null,
  };
  if (!job.tercatat) {
    return {
      ...dasar,
      status: "tidak_tercatat",
      alasan:
        "Tidak ada baris job ini di pf_scheduled_jobs — run-nya belum pernah sampai ke endpoint (workflow gagal sebelum curl) atau seed job belum dibuat.",
    };
  }
  if (!job.terakhir_jalan) {
    return {
      ...dasar,
      status: "belum_pernah",
      alasan:
        "Baris job ada di pf_scheduled_jobs tetapi terakhir_jalan masih kosong — belum pernah ada run yang sampai ke endpoint.",
    };
  }
  const terakhirMs = new Date(job.terakhir_jalan).getTime();
  if (Number.isNaN(terakhirMs)) {
    return {
      ...dasar,
      status: "tidak_tercatat",
      alasan: `terakhir_jalan tidak dapat dibaca sebagai tanggal ("${job.terakhir_jalan}").`,
    };
  }
  const keterlambatanMenit = Math.max(
    0,
    Math.round((sekarangMs - terakhirMs) / 60000),
  );
  const perkiraanBerikut =
    interval === null
      ? null
      : new Date(terakhirMs + interval * 60000).toISOString();
  const hasil: HasilKesehatanJob = {
    ...dasar,
    keterlambatan_menit: keterlambatanMenit,
    perkiraan_berikut: perkiraanBerikut,
    status: "sehat",
    alasan: "",
  };
  // Status terakhir "gagal" = gagal, apa pun keterlambatannya —
  // run terakhir BENAR-BENAR gagal, bukan sekadar telat.
  if (job.status_terakhir === "gagal") {
    hasil.status = "gagal";
    hasil.alasan =
      `Run terakhir tercatat GAGAL di pf_scheduled_jobs` +
      (job.error_terakhir ? ` — ${job.error_terakhir}` : " (tanpa pesan error).") +
      ` Terakhir jalan ${keterlambatanMenit} menit lalu.` +
      (interval !== null
        ? ` Interval yang diharapkan ${interval} menit.`
        : "");
    return hasil;
  }
  if (interval !== null && keterlambatanMenit > FAKTOR_TERLAMBAT * interval) {
    hasil.status = "terlambat";
    hasil.alasan =
      `Terakhir jalan ${keterlambatanMenit} menit lalu — lebih dari ${FAKTOR_TERLAMBAT}x interval yang diharapkan (${interval} menit).` +
      (job.error_terakhir
        ? ` Catatan error terakhir: ${job.error_terakhir}`
        : " Tidak ada pesan error tercatat — kemungkinan scheduler GitHub telat/tidak jalan (bukan galat aplikasi).") +
      ` Perkiraan run berikut: ${perkiraanBerikut ?? "tidak dapat dihitung"}.`;
    return hasil;
  }
  hasil.status = "sehat";
  hasil.alasan =
    `Terakhir jalan ${keterlambatanMenit} menit lalu` +
    (interval !== null
      ? ` (interval yang diharapkan ${interval} menit)` +
        ` — perkiraan run berikut ${perkiraanBerikut ?? "tidak dapat dihitung"}.`
      : " (tanpa jadwal — manual).") +
    (job.status_terakhir
      ? ` Status terakhir di DB: ${job.status_terakhir}.`
      : "");
  return hasil;
}

/** Ringkasan watchdog untuk header halaman: hitungan per status + daftar masalah. */
export function ringkasWatchdog(hasil: HasilKesehatanJob[]): {
  sehat: number;
  terlambat: number;
  gagal: number;
  belum_pernah: number;
  tidak_tercatat: number;
  masalah: string[];
} {
  const ringkas = {
    sehat: 0,
    terlambat: 0,
    gagal: 0,
    belum_pernah: 0,
    tidak_tercatat: 0,
    masalah: [] as string[],
  };
  for (const h of hasil) {
    ringkas[h.status] += 1;
    if (h.status !== "sehat") {
      ringkas.masalah.push(`${h.nama}: ${h.alasan}`);
    }
  }
  return ringkas;
}
