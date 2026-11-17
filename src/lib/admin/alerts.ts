// Alerting operasional Fase 15 (Worker G).
//
// Prinsip:
// - Evaluasi MURNI (evaluasiAlert): diberi snapshot data nyata,
//   mengembalikan kandidat alert — tanpa Date.now(), tanpa I/O,
//   tanpa angka karangan. Ambang + cooldown per kejadian ada di
//   ATURAN_ALERT (sumber yang sama dipakai dokumen
//   hidden_files/KEBIJAKAN-ALERTING.md — ubah keduanya bersamaan).
// - Pencatatan (rekamAlert): insert ke pf_alerts (migrasi v25)
//   dengan dedup + cooldown. Satu kejadian yang sama TIDAK
//   tercatat dua kali selagi alert lamanya masih 'aktif' (indeks
//   parsial v25) dan TIDAK tercatat lagi sebelum cooldown lewat.
//   Setiap alert yang direkam JUGA dicerminkan ke pf_app_errors
//   (sumber 'alert/<kejadian>') sebagai jejak error-monitoring —
//   cermin itu best-effort: gagal cermin tidak menggagalkan alert.
// - TIDAK ADA kanal eksternal (WhatsApp dsb.) — butuh persetujuan
//   pemilik (Rencana §Fase 15). Push VAPID ke admin BELUM bisa:
//   pf_notifications.jenis (CHECK v14) tidak punya jenis alert,
//   dan push payload-less mengambil notifikasi terbaru dari
//   /api/notifikasi (pf_notifications) — ketukan tanpa baris
//   pf_notifications tidak menampilkan apa-apa. Sampai pemilik
//   menyetujui pelonggaran CHECK (non-aditif), alert tampil
//   in-app di /admin/ops panel A (getAlertAktif) — JANGAN
//   melabeli alert sebagai jenis 'artikel'/'brief' agar lolos.
// - Audit log: TIDAK ada aksi audit 'sistem.alert' di CHECK v15
//   (59 aksi) — akuiAlert TIDAK menulis pf_audit_logs (insert
//   aksi di luar CHECK gagal 23514). Pengakuan tercatat di
//   pf_alerts sendiri (diakui_oleh/di akui_pada). Aksi audit
//   khusus alert butuh migrasi CHECK baru (persetujuan pemilik).
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AWALAN_BELUM_SIAP } from "./types";

/* ============================================================
   10 kejadian mandat + aturan (ambang, cooldown, retry)
   ============================================================ */

export type KejadianAlert =
  | "scheduler_mati"
  | "ingestion_gagal"
  | "gdelt_429"
  | "rss_mati"
  | "source_stale"
  | "db_error"
  | "antrean_macet"
  | "pipeline_gagal"
  | "brief_tak_terbentuk"
  | "publikasi_gagal";

export type TingkatAlert = "info" | "peringatan" | "kritis";

export interface AturanAlert {
  kejadian: KejadianAlert;
  label: string;
  tingkat: TingkatAlert;
  /** Menit tanpa kabar sebelum kejadian dinyatakan terjadi. */
  ambang_menit: number;
  /** Menit minimum antar pencatatan kejadian yang sama. */
  cooldown_menit: number;
  /** Kebijakan retry per kejadian (ringkas; lengkap di dokumen). */
  retry: string;
  deskripsi: string;
}

/**
 * Ambang dipilih dari jadwal nyata workflow (ingestion tiap 30
 * menit, editorial 2 jam, brief 05.00 WIB harian, terbitkan-terjadwal
 * tiap jam, data-analysis mingguan): ambang ≈ 2–3x interval
 * normal agar keterlambatan satu denyut cron tidak memicu
 * alert palsu, tapi kematian scheduler ketahuan dalam hitungan
 * jam, bukan hari.
 */
export const ATURAN_ALERT: AturanAlert[] = [
  {
    kejadian: "scheduler_mati",
    label: "Scheduler mati",
    tingkat: "kritis",
    ambang_menit: 90,
    cooldown_menit: 120,
    retry:
      "Jangan retry buta — periksa tab Actions workflow terkait; picu manual dari /admin/kendali sesudah penyebab (secret/workflow) diperbaiki; maks 1 pemicu manual per 30 menit.",
    deskripsi:
      "Job aktif yang jadwalnya dikenal tidak jalan lebih lama dari ambang sunyinya (ingestion 90 mnt, editorial 5 jam, brief 25 jam, terbitkan-terjadwal 3 jam, data-analysis 7 hari).",
  },
  {
    kejadian: "ingestion_gagal",
    label: "Ingestion gagal",
    tingkat: "kritis",
    ambang_menit: 60,
    cooldown_menit: 60,
    retry:
      "Retry per-sumber oleh engine (FU3): kegagalan sementara (408/429/5xx/timeout) dicoba ulang di dalam run; JANGAN picu ulang seluruh ingestion sebelum 30 menit.",
    deskripsi:
      "Ada run ingestion berstatus gagal yang dimulai dalam 60 menit terakhir.",
  },
  {
    kejadian: "gdelt_429",
    label: "GDELT 429 (rate limit)",
    tingkat: "peringatan",
    ambang_menit: 120,
    cooldown_menit: 120,
    retry:
      "JANGAN retry segera — 429 = backoff. Tunggu cooldown sumber (v22 cooldown_until) / minimal 60 menit; kurangi frekuensi poll GDELT.",
    deskripsi:
      "Run ingestion (sumber apa pun) gagal dengan pesan berisi 429 / rate limit dalam 120 menit terakhir.",
  },
  {
    kejadian: "rss_mati",
    label: "RSS mati",
    tingkat: "peringatan",
    ambang_menit: 120,
    cooldown_menit: 240,
    retry:
      "Retry per-sumber maks 3x dengan jeda 10 menit; bila 3x gagal berturut-turut, sumber masuk cooldown dan alert tetap aktif sampai ada run sukses.",
    deskripsi:
      "Sumber RSS aktif punya run ingestion gagal dalam 120 menit terakhir.",
  },
  {
    kejadian: "source_stale",
    label: "Sumber basi (stale)",
    tingkat: "peringatan",
    ambang_menit: 1440,
    cooldown_menit: 360,
    retry:
      "Tidak ada retry — investigasi: cek URL sumber manual; bila sumber mati permanen, nonaktifkan dari /admin/sumber.",
    deskripsi:
      "Sumber aktif tidak dicek lebih dari 24 jam, padahal ingestion jalan dalam 90 menit terakhir (bila ingestion mati total, yang berbunyi hanya scheduler_mati — bukan badai alert per sumber).",
  },
  {
    kejadian: "db_error",
    label: "DB error",
    tingkat: "kritis",
    ambang_menit: 30,
    cooldown_menit: 60,
    retry:
      "Retry query maks 2x; bila Supabase down, JANGAN retry bertubi-tubi — tunggu status Supabase, lalu picu ulang job.",
    deskripsi:
      "Ada galat aplikasi 30 menit terakhir yang menyebut database/koneksi, ATAU ≥5 galat aplikasi apa pun dalam 10 menit (ledakan).",
  },
  {
    kejadian: "antrean_macet",
    label: "Antrean macet",
    tingkat: "peringatan",
    ambang_menit: 360,
    cooldown_menit: 240,
    retry:
      "Retry pipeline per-item (limit 10, maks 5 panggilan — pelajaran run #4); jangan naikkan limit di atas 10/panggilan.",
    deskripsi:
      "Ada item mentah 'baru' lebih tua dari 6 jam dan tidak ada run pipeline AI sukses dalam 12 jam terakhir.",
  },
  {
    kejadian: "pipeline_gagal",
    label: "Pipeline gagal",
    tingkat: "kritis",
    ambang_menit: 60,
    cooldown_menit: 60,
    retry:
      "Retry per-item maks 2x; lock 15 menit (pelajaran 409 run #3) — jangan picu ulang sebelum lock basi.",
    deskripsi:
      "Ada run pipeline AI (agen editorial) berstatus gagal yang dimulai dalam 60 menit terakhir.",
  },
  {
    kejadian: "brief_tak_terbentuk",
    label: "Brief tak terbentuk",
    tingkat: "peringatan",
    ambang_menit: 360,
    cooldown_menit: 360,
    retry:
      "Retry 1x via /admin/kendali (job brief); bila tetap kosong karena 0 artikel terbit, itu BUKAN kegagalan — brief kosong adalah kondisi jujur.",
    deskripsi:
      "Sesudah 06.00 WIB belum ada brief terbit untuk tanggal hari ini (WIB), ATAU run agen daily_brief gagal dalam 24 jam terakhir.",
  },
  {
    kejadian: "publikasi_gagal",
    label: "Publikasi gagal",
    tingkat: "kritis",
    ambang_menit: 120,
    cooldown_menit: 120,
    retry:
      "Retry via /admin/kendali (terbitkan-terjadwal); artikel gagal gate ditunda 6 jam (backoff F12) — JANGAN paksa terbit.",
    deskripsi:
      "Job terbitkan-terjadwal berstatus gagal dalam 120 menit terakhir, ATAU ada galat aplikasi 120 menit terakhir yang menyebut terbit/publikasi.",
  },
];

export function aturanUntuk(kejadian: KejadianAlert): AturanAlert {
  const aturan = ATURAN_ALERT.find((a) => a.kejadian === kejadian);
  if (!aturan) throw new Error(`Aturan alert '${kejadian}' tidak dikenal.`);
  return aturan;
}

/* ============================================================
   Snapshot + evaluasi murni
   ============================================================ */

export interface SnapshotAlert {
  /** ISO — "sekarang" menurut pemanggil (evaluasi tidak membaca jam sendiri). */
  sekarang: string;
  /** Tanggal hari ini Asia/Jakarta, YYYY-MM-DD. */
  tanggal_wib: string;
  /** Menit sejak 00:00 WIB (0–1439). */
  jam_wib_menit: number;
  jobs: {
    nama: string;
    aktif: boolean;
    terakhir_jalan: string | null;
    status_terakhir: string;
    error_terakhir: string | null;
  }[];
  ingestion_runs: {
    id: string;
    sumber_id: string | null;
    sumber_nama: string | null;
    status: string;
    error: string | null;
    dimulai_pada: string | null;
  }[];
  ai_runs: {
    id: string;
    agen: string;
    status: string;
    error: string | null;
    dimulai_pada: string | null;
  }[];
  sources: {
    id: string;
    nama: string;
    jenis: string;
    aktif: boolean;
    terakhir_cek: string | null;
    status_terakhir: string | null;
    terakhir_diambil: string | null;
  }[];
  /** Item 'baru' yang waktu_diambil-nya lebih tua dari 6 jam. */
  raw_baru_lama: number;
  raw_baru_total: number;
  brief_hari_ini_terbit: boolean;
  app_errors: {
    sumber: string;
    pesan: string;
    kode: string | null;
    dibuat_pada: string | null;
  }[];
}

export interface KandidatAlert {
  kejadian: KejadianAlert;
  tingkat: TingkatAlert;
  judul: string;
  pesan: string;
  kunci_dedup: string;
  detail: Record<string, unknown>;
}

function menitSejak(iso: string | null, sekarangMs: number): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return (sekarangMs - ms) / 60000;
}

/** Ambang sunyi (menit) per job terjadwal yang punya workflow. */
const AMBANG_SUNYI_JOB: Record<string, number> = {
  ingestion: 90,
  editorial: 300,
  brief: 1500,
  "data-analysis": 10080,
  "terbitkan-terjadwal": 180,
  // digest / podcast / riset: TIDAK PUNYA workflow aktif — tidak
  // pernah jalan adalah kondisi yang diharapkan, bukan kematian
  // scheduler. Alert untuk ketiganya akan selalu palsu.
};

const AGEN_PIPELINE: string[] = [
  "research",
  "source_analysis",
  "fact_verification",
  "summarization",
  "article_writing",
  "editorial_quality",
];

/**
 * Evaluasi murni: snapshot nyata -> kandidat alert (0..n).
 * Deterministik: dua snapshot yang sama menghasilkan kandidat
 * yang sama. TIDAK membaca jam, DB, atau env.
 */
export function evaluasiAlert(s: SnapshotAlert): KandidatAlert[] {
  const sekarangMs = Date.parse(s.sekarang);
  const hasil: KandidatAlert[] = [];
  const tambah = (
    kejadian: KejadianAlert,
    judul: string,
    pesan: string,
    kunci_dedup: string,
    detail: Record<string, unknown>,
  ): void => {
    hasil.push({
      kejadian,
      tingkat: aturanUntuk(kejadian).tingkat,
      judul,
      pesan,
      kunci_dedup,
      detail,
    });
  };

  // 1. scheduler_mati — per job aktif yang jadwalnya dikenal.
  for (const job of s.jobs) {
    const ambang = AMBANG_SUNYI_JOB[job.nama];
    if (!job.aktif || ambang === undefined) continue;
    const sunyi = menitSejak(job.terakhir_jalan, sekarangMs);
    if (sunyi === null || sunyi > ambang) {
      tambah(
        "scheduler_mati",
        `Scheduler mati: ${job.nama}`,
        job.terakhir_jalan
          ? `Job '${job.nama}' terakhir jalan ${Math.floor(sunyi ?? 0)} menit lalu (ambang ${ambang} menit).`
          : `Job '${job.nama}' belum pernah jalan (ambang ${ambang} menit).`,
        `scheduler_mati:${job.nama}`,
        { job: job.nama, ambang_menit: ambang, sunyi_menit: sunyi },
      );
    }
  }

  // 2. ingestion_gagal + 3. gdelt_429 — per run gagal terbaru.
  for (const run of s.ingestion_runs) {
    if (run.status !== "gagal") continue;
    const umur = menitSejak(run.dimulai_pada, sekarangMs);
    if (umur === null || umur < 0 || umur > 120) continue;
    if (umur <= 60) {
      tambah(
        "ingestion_gagal",
        `Ingestion gagal: ${run.sumber_nama ?? "sumber tak dikenal"}`,
        run.error ?? "Run ingestion gagal tanpa pesan error.",
        `ingestion_gagal:${run.id}`,
        { run_id: run.id, sumber: run.sumber_nama },
      );
    }
    const pesan = `${run.error ?? ""}`.toLowerCase();
    if (pesan.includes("429") || pesan.includes("rate limit")) {
      tambah(
        "gdelt_429",
        `Rate limit (429): ${run.sumber_nama ?? "sumber tak dikenal"}`,
        run.error ?? "Run ingestion gagal dengan 429.",
        `gdelt_429:${run.id}`,
        { run_id: run.id, sumber: run.sumber_nama },
      );
    }
  }

  // 4. rss_mati — sumber RSS aktif dengan run gagal 2 jam terakhir.
  const runGagalPerSumber = new Map<string, number>();
  for (const run of s.ingestion_runs) {
    if (run.status !== "gagal") continue;
    const umur = menitSejak(run.dimulai_pada, sekarangMs);
    if (umur === null || umur < 0 || umur > 120) continue;
    const kunci = run.sumber_id ?? run.sumber_nama ?? "";
    if (kunci) {
      runGagalPerSumber.set(kunci, (runGagalPerSumber.get(kunci) ?? 0) + 1);
    }
  }
  for (const src of s.sources) {
    if (!src.aktif || src.jenis !== "rss") continue;
    const gagal =
      (runGagalPerSumber.get(src.id) ?? 0) +
      (runGagalPerSumber.get(src.nama) ?? 0);
    if (gagal > 0) {
      tambah(
        "rss_mati",
        `RSS mati: ${src.nama}`,
        `${gagal} run ingestion gagal untuk sumber ini dalam 120 menit terakhir.`,
        `rss_mati:${src.id}`,
        { sumber_id: src.id, sumber: src.nama, run_gagal: gagal },
      );
    }
  }

  // 5. source_stale — sumber aktif tak dicek >24 jam, SELAGI
  // ingestion hidup (bila ingestion mati, scheduler_mati saja
  // yang berbunyi — bukan badai alert per sumber).
  const ingestionHidup = s.jobs.some(
    (j) =>
      j.nama === "ingestion" &&
      j.aktif &&
      (() => {
        const sunyi = menitSejak(j.terakhir_jalan, sekarangMs);
        return sunyi !== null && sunyi <= 90;
      })(),
  );
  if (ingestionHidup) {
    for (const src of s.sources) {
      if (!src.aktif) continue;
      const cek = menitSejak(src.terakhir_cek, sekarangMs);
      if (cek === null || cek > 1440) {
        tambah(
          "source_stale",
          `Sumber basi: ${src.nama}`,
          src.terakhir_cek
            ? `Terakhir dicek ${Math.floor(cek ?? 0)} menit lalu (ambang 24 jam).`
            : "Sumber ini belum pernah dicek.",
          `source_stale:${src.id}`,
          { sumber_id: src.id, sumber: src.nama, cek_menit: cek },
        );
      }
    }
  }

  // 6. db_error — galat DB 30 mnt terakhir, atau ledakan ≥5
  // galat apa pun dalam 10 menit.
  const galatDb = s.app_errors.filter((e) => {
    const umur = menitSejak(e.dibuat_pada, sekarangMs);
    if (umur === null || umur < 0 || umur > 30) return false;
    const teks = `${e.sumber} ${e.pesan} ${e.kode ?? ""}`.toLowerCase();
    return (
      teks.includes("supabase") ||
      teks.includes("postgres") ||
      teks.includes("database") ||
      teks.includes("basis data") ||
      teks.includes("koneksi") ||
      teks.includes("connection")
    );
  });
  const ledakan = s.app_errors.filter((e) => {
    const umur = menitSejak(e.dibuat_pada, sekarangMs);
    return umur !== null && umur >= 0 && umur <= 10;
  });
  if (galatDb.length > 0 || ledakan.length >= 5) {
    tambah(
      "db_error",
      "DB error",
      galatDb.length > 0
        ? `${galatDb.length} galat terkait database dalam 30 menit terakhir: ${galatDb[0]?.pesan ?? ""}`
        : `${ledakan.length} galat aplikasi dalam 10 menit terakhir (ledakan).`,
      "db_error:db",
      { galat_db: galatDb.length, ledakan_10mnt: ledakan.length },
    );
  }

  // 7. antrean_macet — item 'baru' >6 jam + tanpa pipeline
  // sukses 12 jam terakhir.
  const pipelineSukses = s.ai_runs.some((r) => {
    if (r.status !== "berhasil" || !AGEN_PIPELINE.includes(r.agen)) {
      return false;
    }
    const umur = menitSejak(r.dimulai_pada, sekarangMs);
    return umur !== null && umur >= 0 && umur <= 720;
  });
  if (s.raw_baru_lama > 0 && !pipelineSukses) {
    tambah(
      "antrean_macet",
      "Antrean macet",
      `${s.raw_baru_lama} item mentah 'baru' lebih tua dari 6 jam dan tidak ada run pipeline AI sukses dalam 12 jam terakhir.`,
      "antrean_macet:antrean",
      { raw_baru_lama: s.raw_baru_lama, raw_baru_total: s.raw_baru_total },
    );
  }

  // 8. pipeline_gagal — run AI editorial gagal 60 mnt terakhir.
  for (const run of s.ai_runs) {
    if (run.status !== "gagal" || !AGEN_PIPELINE.includes(run.agen)) continue;
    const umur = menitSejak(run.dimulai_pada, sekarangMs);
    if (umur === null || umur < 0 || umur > 60) continue;
    tambah(
      "pipeline_gagal",
      `Pipeline gagal: agen ${run.agen}`,
      run.error ?? "Run pipeline AI gagal tanpa pesan error.",
      `pipeline_gagal:${run.id}`,
      { run_id: run.id, agen: run.agen },
    );
  }

  // 9. brief_tak_terbentuk — sesudah 06.00 WIB belum ada brief
  // terbit hari ini, atau run daily_brief gagal 24 jam terakhir.
  const briefGagal = s.ai_runs.some((r) => {
    if (r.agen !== "daily_brief" || r.status !== "gagal") return false;
    const umur = menitSejak(r.dimulai_pada, sekarangMs);
    return umur !== null && umur >= 0 && umur <= 1440;
  });
  if ((s.jam_wib_menit >= 360 && !s.brief_hari_ini_terbit) || briefGagal) {
    tambah(
      "brief_tak_terbentuk",
      "Brief tak terbentuk",
      briefGagal
        ? "Run agen daily_brief gagal dalam 24 jam terakhir."
        : `Sesudah 06.00 WIB belum ada brief terbit untuk ${s.tanggal_wib}.`,
      `brief_tak_terbentuk:${s.tanggal_wib}`,
      { tanggal: s.tanggal_wib, brief_gagal: briefGagal },
    );
  }

  // 10. publikasi_gagal — job terbitkan-terjadwal gagal 2 jam
  // terakhir, atau galat aplikasi menyebut terbit 2 jam terakhir.
  const jobTerbit = s.jobs.find((j) => j.nama === "terbitkan-terjadwal");
  const jobTerbitGagal =
    jobTerbit !== undefined &&
    jobTerbit.status_terakhir === "gagal" &&
    (() => {
      const umur = menitSejak(jobTerbit.terakhir_jalan, sekarangMs);
      return umur !== null && umur >= 0 && umur <= 120;
    })();
  const galatTerbit = s.app_errors.some((e) => {
    const umur = menitSejak(e.dibuat_pada, sekarangMs);
    if (umur === null || umur < 0 || umur > 120) return false;
    const teks = `${e.sumber} ${e.pesan}`.toLowerCase();
    return teks.includes("terbit") || teks.includes("publikasi");
  });
  if (jobTerbitGagal || galatTerbit) {
    tambah(
      "publikasi_gagal",
      "Publikasi gagal",
      jobTerbit?.error_terakhir ??
        "Ada galat aplikasi terkait penerbitan dalam 120 menit terakhir.",
      "publikasi_gagal:terbitkan-terjadwal",
      {
        job_gagal: jobTerbitGagal,
        galat_terbit: galatTerbit,
        error_job: jobTerbit?.error_terakhir ?? null,
      },
    );
  }

  return hasil;
}

/* ============================================================
   Cooldown + dedup (murni — dipakai rekamAlert + baterai)
   ============================================================ */

export interface RiwayatAlert {
  kejadian: string;
  kunci_dedup: string;
  status: string;
  dibuat_pada: string;
}

/**
 * true bila kandidat BOLEH dicatat sekarang:
 * - tidak ada alert AKTIF dengan kunci_dedup yang sama, DAN
 * - tidak ada alert dengan kunci_dedup yang sama (status apa pun)
 *   dalam cooldown_menit terakhir.
 * Cooldown berlaku PER KUNCI DEDUP (per job/sumber/run), bukan
 * per kejadian global — kalau tidak, tiga job yang mati
 * bersamaan hanya menghasilkan satu alert scheduler_mati dan
 * dua job lainnya tidak pernah tercatat.
 */
export function perluRekam(
  riwayat: RiwayatAlert[],
  kandidat: KandidatAlert,
  sekarang: string,
): boolean {
  const sekarangMs = Date.parse(sekarang);
  if (Number.isNaN(sekarangMs)) return false;
  if (
    riwayat.some(
      (r) => r.kunci_dedup === kandidat.kunci_dedup && r.status === "aktif",
    )
  ) {
    return false;
  }
  const cooldownMs = aturanUntuk(kandidat.kejadian).cooldown_menit * 60000;
  for (const r of riwayat) {
    if (r.kunci_dedup !== kandidat.kunci_dedup) continue;
    const ms = Date.parse(r.dibuat_pada);
    if (Number.isNaN(ms)) continue;
    if (sekarangMs - ms < cooldownMs) return false;
  }
  return true;
}

/* ============================================================
   Baca alert aktif (tampilan — session client, RLS staf)
   ============================================================ */

export interface AlertAktif {
  id: string;
  kejadian: string;
  tingkat: string;
  judul: string;
  pesan: string;
  detail: Record<string, unknown>;
  dibuat_pada: string;
}

export async function getAlertAktif(): Promise<{
  alerts: AlertAktif[];
  tersedia: boolean;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_alerts")
      .select("id,kejadian,tingkat,judul,pesan,detail,dibuat_pada")
      .eq("status", "aktif")
      .order("dibuat_pada", { ascending: false })
      .limit(20);
    if (error || !data) return { alerts: [], tersedia: false };
    return {
      alerts: (data as AlertAktif[]).map((a) => ({
        ...a,
        detail:
          a.detail !== null && typeof a.detail === "object"
            ? (a.detail as Record<string, unknown>)
            : {},
      })),
      tersedia: true,
    };
  } catch {
    return { alerts: [], tersedia: false };
  }
}

/* ============================================================
   Bangun snapshot dari DB (dipakai route evaluasi — klien
   service role agar pf_ai_runs + pf_app_errors yang hanya
   dibaca service/staf tetap terlihat lengkap).
   ============================================================ */

export function tanggalWib(d: Date): { tanggal: string; jam_menit: number } {
  const bagian = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const ambil = (tipe: string): string =>
    bagian.find((b) => b.type === tipe)?.value ?? "00";
  const tanggal = `${ambil("year")}-${ambil("month")}-${ambil("day")}`;
  const jam_menit =
    Number.parseInt(ambil("hour"), 10) * 60 +
    Number.parseInt(ambil("minute"), 10);
  return { tanggal, jam_menit };
}

export async function bangunSnapshotAlert(
  klien: SupabaseClient,
  sekarang: Date = new Date(),
): Promise<SnapshotAlert> {
  const { tanggal, jam_menit } = tanggalWib(sekarang);
  const enamJamLalu = new Date(sekarang.getTime() - 6 * 3600 * 1000);
  const [
    jobs,
    ingestionRuns,
    aiRuns,
    sources,
    baruLama,
    baruTotal,
    brief,
    appErrors,
  ] = await Promise.all([
    klien
      .from("pf_scheduled_jobs")
      .select("nama,aktif,terakhir_jalan,status_terakhir,error_terakhir")
      .order("nama", { ascending: true }),
    klien
      .from("pf_ingestion_runs")
      .select("id,sumber_id,sumber_nama,status,error,dimulai_pada")
      .order("dimulai_pada", { ascending: false })
      .limit(50),
    klien
      .from("pf_ai_runs")
      .select("id,agen,status,error,dimulai_pada")
      .order("dimulai_pada", { ascending: false })
      .limit(50),
    klien
      .from("pf_sources")
      .select("id,nama,jenis,aktif,terakhir_cek,status_terakhir,terakhir_diambil")
      .order("nama", { ascending: true }),
    klien
      .from("pf_raw_items")
      .select("id", { count: "exact", head: true })
      .eq("status", "baru")
      .lt("waktu_diambil", enamJamLalu.toISOString()),
    klien
      .from("pf_raw_items")
      .select("id", { count: "exact", head: true })
      .eq("status", "baru"),
    klien
      .from("pf_daily_briefs")
      .select("id")
      .eq("tanggal", tanggal)
      .eq("status", "terbit")
      .limit(1),
    klien
      .from("pf_app_errors")
      .select("sumber,pesan,kode,dibuat_pada")
      .order("dibuat_pada", { ascending: false })
      .limit(50),
  ]);
  const ambilData = <T>(r: { data: T[] | null }): T[] =>
    (r.data ?? []) as T[];
  return {
    sekarang: sekarang.toISOString(),
    tanggal_wib: tanggal,
    jam_wib_menit: jam_menit,
    jobs: ambilData<{
      nama: string;
      aktif: boolean;
      terakhir_jalan: string | null;
      status_terakhir: string;
      error_terakhir: string | null;
    }>(jobs),
    ingestion_runs: ambilData<{
      id: string;
      sumber_id: string | null;
      sumber_nama: string | null;
      status: string;
      error: string | null;
      dimulai_pada: string | null;
    }>(ingestionRuns),
    ai_runs: ambilData<{
      id: string;
      agen: string;
      status: string;
      error: string | null;
      dimulai_pada: string | null;
    }>(aiRuns),
    sources: ambilData<{
      id: string;
      nama: string;
      jenis: string;
      aktif: boolean;
      terakhir_cek: string | null;
      status_terakhir: string | null;
      terakhir_diambil: string | null;
    }>(sources),
    raw_baru_lama: baruLama.count ?? 0,
    raw_baru_total: baruTotal.count ?? 0,
    brief_hari_ini_terbit: (brief.data ?? []).length > 0,
    app_errors: ambilData<{
      sumber: string;
      pesan: string;
      kode: string | null;
      dibuat_pada: string | null;
    }>(appErrors),
  };
}

/* ============================================================
   Rekam + akui (service role — dipanggil route admin)
   ============================================================ */

export interface HasilRekamAlert {
  direkam: string[];
  dilewati_cooldown: string[];
  gagal: { kejadian: string; alasan: string }[];
}

function lemparBelumSiap(nama: string, error: unknown): never {
  const pesan =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "galat tak dikenal");
  throw new Error(
    `${AWALAN_BELUM_SIAP} Tabel ${nama} belum dibuat (migrasi v25 belum dijalankan) atau kunci service belum diatur: ${pesan}`,
  );
}

/**
 * Rekam kandidat alert yang lolos dedup + cooldown.
 * Idempoten: dipanggil 2x dengan snapshot yang sama (dan tanpa
 * perubahan riwayat di antaranya) -> panggilan kedua merekam 0.
 */
export async function rekamAlert(
  kandidat: KandidatAlert[],
  klien: SupabaseClient,
  sekarang: string = new Date().toISOString(),
): Promise<HasilRekamAlert> {
  const hasil: HasilRekamAlert = {
    direkam: [],
    dilewati_cooldown: [],
    gagal: [],
  };
  if (kandidat.length === 0) return hasil;
  const { data: riwayat, error: errRiwayat } = await klien
    .from("pf_alerts")
    .select("kejadian,kunci_dedup,status,dibuat_pada")
    .order("dibuat_pada", { ascending: false })
    .limit(200);
  if (errRiwayat) lemparBelumSiap("pf_alerts", errRiwayat);
  const daftar = (riwayat ?? []) as RiwayatAlert[];
  for (const k of kandidat) {
    if (!perluRekam(daftar, k, sekarang)) {
      hasil.dilewati_cooldown.push(k.kejadian);
      continue;
    }
    const { error } = await klien.from("pf_alerts").insert({
      kejadian: k.kejadian,
      tingkat: k.tingkat,
      judul: k.judul,
      pesan: k.pesan,
      detail: k.detail,
      kunci_dedup: k.kunci_dedup,
      status: "aktif",
    });
    if (error) {
      // Balapan dua evaluasi bersamaan: indeks unik parsial
      // menolak duplikat aktif (23505) — itu BUKAN kegagalan,
      // melainkan dedup yang bekerja.
      const pesan = error.message ?? "";
      if (
        pesan.includes("23505") ||
        pesan.includes("duplicate key") ||
        pesan.includes("pf_alerts_dedup_aktif_idx")
      ) {
        hasil.dilewati_cooldown.push(k.kejadian);
        continue;
      }
      hasil.gagal.push({ kejadian: k.kejadian, alasan: pesan });
      continue;
    }
    daftar.push({
      kejadian: k.kejadian,
      kunci_dedup: k.kunci_dedup,
      status: "aktif",
      dibuat_pada: sekarang,
    });
    hasil.direkam.push(k.kejadian);
    // Cermin ke pf_app_errors — best-effort (lihat header).
    try {
      await klien.from("pf_app_errors").insert({
        sumber: `alert/${k.kejadian}`,
        pesan: `${k.judul} — ${k.pesan}`,
        kode: k.kejadian,
        rute: "/admin/ops",
      });
    } catch (errCermin) {
      console.error(
        JSON.stringify({
          event: "alert_cermin_app_errors_gagal",
          waktu: new Date().toISOString(),
          kejadian: k.kejadian,
          pesan:
            errCermin instanceof Error
              ? errCermin.message
              : String(errCermin ?? ""),
        }),
      );
    }
  }
  return hasil;
}

/**
 * Akui satu alert aktif (status -> 'diakui'). Mencatat
 * diakui_oleh/di akui_pada di barisnya — TIDAK menulis
 * pf_audit_logs (tidak ada aksi 'sistem.alert' di CHECK v15).
 */
export async function akuiAlert(
  id: string,
  aktorId: string | null,
  klien: SupabaseClient,
): Promise<{ id: string; kejadian: string }> {
  const { data, error } = await klien
    .from("pf_alerts")
    .update({
      status: "diakui",
      diakui_oleh: aktorId,
      diakui_pada: new Date().toISOString(),
      diperbarui_pada: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "aktif")
    .select("id,kejadian")
    .maybeSingle();
  if (error) lemparBelumSiap("pf_alerts", error);
  if (!data) {
    throw new Error("Alert tidak ditemukan atau sudah tidak aktif.");
  }
  return data as { id: string; kejadian: string };
}
