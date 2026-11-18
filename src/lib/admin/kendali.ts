// Lapisan kendali admin (Gelombang 2, Area 14 — Advanced Admin
// Control Center). Feature flags (pf_system_settings, migrasi v10
// §6), status scheduler (pf_scheduled_jobs), pemicu job manual,
// dan ekspor CSV audit log.
//
// Prinsip:
// - Flag DITEGAKKAN di route terkait (Tahap 13C): ingestion_aktif
//   di POST /api/ingestion/jalankan, pipeline_editorial_aktif di
//   POST /api/ai/jalankan (keduanya 503 jujur bila nonaktif),
//   pendaftaran_terbuka di halaman /daftar (form tidak tampil
//   bila ditutup), mode_pemeliharaan + pengumuman_pemeliharaan
//   dibaca Header di semua halaman. Penegakan penuh pendaftaran
//   di sisi Supabase Auth (nonaktifkan signup di dashboard)
//   tetap wewenang pemilik — lihat LAPORAN-FASE-8 §14.
// - Temuan scheduler gate yang RELEVAN (LAPORAN-FASE-8 §10.3)
//   sesudah Tahap 13C: F6 TERTUTUP (terakhir_jalan diperbarui
//   run cron lewat klaim + selesai job di tiap endpoint);
//   F7 TERTUTUP SEBAGIAN untuk 5 job cron (seed 5 job di §14;
//   pemicu manual 8 job — digest/podcast/riset tetap 400 jujur).
//   FASE 12 (Worker G, 17 Nov 2026): F7 DITUTUP SECARA JUJUR —
//   ketiga job itu TIDAK PUNYA backend yang bisa dipicu (bukti
//   grep, lihat ALASAN_TANPA_PEMICU): digest tidak punya satu
//   pun generator/route/workflow di repo; podcast TTS hanya
//   jalan di workflow GitHub Actions podcast-tts.yml (dispatch
//   manual + input suara + konfirmasi lisensi — TIDAK bisa
//   dipicu 1-klik dari aplikasi tanpa token GitHub dan tanpa
//   melewati gerbang lisensi); riset tidak punya batch job —
//   laporan dibuat manual editor lewat POST /api/admin/riset.
//   Membuat endpoint "jalankan" untuk ketiganya berarti
//   memalsukan sebuah run — DILARANG. Yang DILENGKAPI sebagai
//   gantinya: kontrol antrean pause/resume/disable/enable untuk
//   KEDELAPAN job (kontrolJob, audit 'sistem.job') + reprocess
//   (= jalankan ulang) untuk 5 job yang memang bisa jalan.
//   Sisa: digest/podcast/riset belum punya endpoint pemicu;
//   kolom backoff khusus artikel masih berupa SQL usulan (§14).
// - Aksi audit yang dipakai ('sistem.flag', 'sistem.job') SUDAH
//   ada di CHECK pf_audit_logs sejak migrasi v8 (47 aksi di v9)
//   — tidak ada aksi audit baru yang butuh migrasi.
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AWALAN_BELUM_SIAP } from "./types";
import type { NamaJob } from "./types";
import { catatAuditWajib } from "./audit";
import { perbaruiJob } from "./editorial";
import { buatAdminAdapter } from "./supabase-adapter";

/* ============================================================
   Feature flags (pf_system_settings)
   ============================================================ */

export type NilaiFlag = boolean | string;

export interface DefinisiFlag {
  kunci: string;
  label: string;
  deskripsi: string;
  jenis: "boolean" | "teks";
  bawaan: NilaiFlag;
}

/** Daftar flag yang dikenal UI kendali. Kunci baru HANYA boleh
 *  ditambah di sini (whitelist) — PATCH dengan kunci di luar
 *  daftar ditolak, agar tabel tidak diisi kunci liar. */
export const DAFTAR_FLAG: DefinisiFlag[] = [
  {
    kunci: "mode_pemeliharaan",
    label: "Mode pemeliharaan",
    deskripsi:
      "Bila aktif, situs menampilkan pengumuman pemeliharaan kepada pembaca.",
    jenis: "boolean",
    bawaan: false,
  },
  {
    kunci: "pengumuman_pemeliharaan",
    label: "Pengumuman pemeliharaan",
    deskripsi:
      "Teks pengumuman yang ditampilkan saat mode pemeliharaan aktif. Kosong bila tidak ada pengumuman.",
    jenis: "teks",
    bawaan: "",
  },
  {
    kunci: "ingestion_aktif",
    label: "Ingestion aktif",
    deskripsi:
      "Bila nonaktif, POST /api/ingestion/jalankan menolak dengan 503 jujur (ditegakkan Tahap 13C). Bila flag belum disetel, ingestion berjalan (bawaan aktif).",
    jenis: "boolean",
    bawaan: true,
  },
  {
    kunci: "pipeline_editorial_aktif",
    label: "Pipeline editorial aktif",
    deskripsi:
      "Bila nonaktif, POST /api/ai/jalankan menolak dengan 503 jujur (ditegakkan Tahap 13C). Bila flag belum disetel, pipeline berjalan (bawaan aktif).",
    jenis: "boolean",
    bawaan: true,
  },
  {
    kunci: "auto_publish_tier1",
    label: "Auto-publish Tier-1 (FACT SCORE ≥85)",
    deskripsi:
      "Bila aktif, pipeline editorial otomatis menerbitkan draf Tier-1 (status verifikasi CROSS-CHECKED/VERIFIED) yang FACT SCORE-nya ≥85, tanpa menunggu review manual — disetujui pemilik 17 Nov 2026. Setiap auto-publish tercatat di audit log (aksi artikel.terbit, sesudah.auto_publish=true + fact_score). Bila nonaktif, draf Tier-1 tetap menunggu Terbitkan manual. Bila flag belum disetel, nilainya bawaan aktif.",
    jenis: "boolean",
    bawaan: true,
  },
  {
    kunci: "pendaftaran_terbuka",
    label: "Pendaftaran terbuka",
    deskripsi:
      "Bila nonaktif, halaman /daftar menampilkan pesan pendaftaran ditutup dan form tidak tampil (ditegakkan Tahap 13C). Penegakan penuh di sisi Supabase Auth (nonaktifkan signup di dashboard) tetap wewenang pemilik.",
    jenis: "boolean",
    bawaan: true,
  },
];

export interface FlagKendali extends DefinisiFlag {
  nilai: NilaiFlag;
  /** false = belum ada baris di pf_system_settings (nilai bawaan). */
  disetel: boolean;
  diperbarui_pada: string | null;
}

function cariDefinisi(kunci: string): DefinisiFlag | null {
  return DAFTAR_FLAG.find((d) => d.kunci === kunci) ?? null;
}

function lemparBelumSiap(nama: string, error: unknown): never {
  const pesan =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "galat tak dikenal");
  if (
    pesan.includes("Could not find the table") ||
    pesan.includes("does not exist") ||
    pesan.includes("SUPABASE_SERVICE_ROLE_KEY")
  ) {
    throw new Error(
      `${AWALAN_BELUM_SIAP} Tabel ${nama} belum dibuat (migrasi belum dijalankan) atau kunci service belum diatur.`,
    );
  }
  throw new Error(`${nama} gagal: ${pesan}`);
}

async function ambilFlags(
  klien: SupabaseClient,
): Promise<{ flags: FlagKendali[]; tersedia: boolean }> {
  try {
    const { data, error } = await klien
      .from("pf_system_settings")
      .select("kunci,nilai,deskripsi,diperbarui_pada");
    if (error) return { flags: [], tersedia: false };
    const peta = new Map(
      ((data ?? []) as {
        kunci: string;
        nilai: unknown;
        deskripsi: string | null;
        diperbarui_pada: string | null;
      }[]).map((r) => [r.kunci, r]),
    );
    return {
      tersedia: true,
      flags: DAFTAR_FLAG.map((d) => {
        const baris = peta.get(d.kunci);
        if (!baris) {
          return { ...d, nilai: d.bawaan, disetel: false, diperbarui_pada: null };
        }
        // Nilai tersimpan jsonb: { "nilai": ... } atau nilai mentah.
        const mentah = baris.nilai as unknown;
        const nilai =
          mentah !== null &&
          typeof mentah === "object" &&
          !Array.isArray(mentah) &&
          "nilai" in (mentah as Record<string, unknown>)
            ? (mentah as Record<string, unknown>).nilai
            : mentah;
        const cocok =
          d.jenis === "boolean"
            ? typeof nilai === "boolean"
              ? nilai
              : d.bawaan
            : typeof nilai === "string"
              ? nilai
              : d.bawaan;
        return {
          ...d,
          nilai: cocok as NilaiFlag,
          disetel: true,
          diperbarui_pada: baris.diperbarui_pada,
        };
      }),
    };
  } catch {
    return { flags: [], tersedia: false };
  }
}

/** Baca flags untuk halaman server (session client, RLS staf-only). */
export async function getFlags(): Promise<{
  flags: FlagKendali[];
  tersedia: boolean;
}> {
  const supabase = await createClient();
  return ambilFlags(supabase);
}

/** Baca flags untuk route API (service client). */
export async function getFlagsLayanan(): Promise<{
  flags: FlagKendali[];
  tersedia: boolean;
}> {
  let klien: SupabaseClient;
  try {
    klien = createServiceClient();
  } catch (err) {
    lemparBelumSiap("pf_system_settings", err);
  }
  return ambilFlags(klien!);
}

export interface AktorKendali {
  id: string | null;
  email: string | null;
  ip?: string | null;
}

/**
 * Ubah satu flag (service role). Hanya kunci di DAFTAR_FLAG dan
 * nilai sejenis yang diterima. Mencatat audit 'sistem.flag'
 * (sudah ada di CHECK v8/v9). Mengembalikan flag sesudah diubah.
 */
export async function setFlag(
  kunci: string,
  nilai: unknown,
  aktor: AktorKendali,
): Promise<FlagKendali> {
  const definisi = cariDefinisi(kunci);
  if (!definisi) {
    throw new Error(`Flag '${kunci}' tidak dikenal.`);
  }
  if (definisi.jenis === "boolean" && typeof nilai !== "boolean") {
    throw new Error(`Flag '${definisi.label}' harus bernilai boolean.`);
  }
  if (definisi.jenis === "teks" && typeof nilai !== "string") {
    throw new Error(`Flag '${definisi.label}' harus bernilai teks.`);
  }
  if (definisi.jenis === "teks" && (nilai as string).length > 2000) {
    throw new Error("Teks pengumuman maksimal 2000 karakter.");
  }

  let klien: SupabaseClient;
  try {
    klien = createServiceClient();
  } catch (err) {
    lemparBelumSiap("pf_system_settings", err);
  }

  const sebelum = await ambilFlags(klien!);
  const lama = sebelum.flags.find((f) => f.kunci === kunci);

  const { error } = await klien!
    .from("pf_system_settings")
    .upsert(
      {
        kunci,
        nilai: { nilai },
        deskripsi: definisi.deskripsi,
      },
      { onConflict: "kunci" },
    );
  if (error) lemparBelumSiap("setFlag", error);

  // Audit FAIL-CLOSED (Gelombang B1, P1-3/B-T2/S-16): gagal
  // catat -> perubahan flag DITOLAK + compensating restore nilai
  // sebelumnya (upsert nilai lama, atau hapus baris bila flag
  // sebelumnya belum pernah disetel). Galat dilempar agar route
  // menjawab 500/503 (responGalatAdmin), bukan 200 tanpa jejak.
  // Atomicity penuh (transaksi/RPC) adalah follow-up migrasi.
  try {
    await catatAuditWajib({
      aktor_id: aktor.id,
      aktor_email: aktor.email,
      aksi: "sistem.flag",
      entitas: "pf_system_settings",
      entitas_id: kunci,
      sebelum: lama ? { nilai: lama.nilai } : null,
      sesudah: { nilai: nilai as NilaiFlag },
      ip: aktor.ip ?? null,
    });
  } catch (errAudit) {
    try {
      if (lama && lama.disetel) {
        await klien!.from("pf_system_settings").upsert(
          {
            kunci,
            nilai: { nilai: lama.nilai },
            deskripsi: definisi.deskripsi,
          },
          { onConflict: "kunci" },
        );
      } else {
        await klien!.from("pf_system_settings").delete().eq("kunci", kunci);
      }
    } catch (errPulih) {
      console.error(
        JSON.stringify({
          event: "audit_compensating_restore_flag_gagal",
          waktu: new Date().toISOString(),
          kunci,
          pesan:
            errPulih instanceof Error
              ? errPulih.message
              : String(errPulih ?? ""),
        }),
      );
    }
    throw errAudit;
  }

  return {
    ...definisi,
    nilai: nilai as NilaiFlag,
    disetel: true,
    diperbarui_pada: new Date().toISOString(),
  };
}

/* ============================================================
   Status scheduler (pf_scheduled_jobs)
   ============================================================ */

export interface JobDikenal {
  nama: string;
  label: string;
  /** Jadwal workflow GitHub Actions menurut LAPORAN-FASE-8 §10. */
  jadwal_workflow: string;
  /** true bila job ini punya endpoint pemicu manual. */
  bisa_dipicu: boolean;
  /** Alasan jujur bila bisa_dipicu false (ditampilkan di UI). */
  alasan_tanpa_pemicu?: string;
}

/**
 * Alasan per job tanpa pemicu manual — hasil verifikasi grep
 * 17 Nov 2026 (Worker G), BUKAN asumsi. Dipakai UI kendali/ops
 * agar operator tahu KENAPA tombol jalankan tidak ada, dan apa
 * jalur manual yang benar untuk tiap job.
 */
export const ALASAN_TANPA_PEMICU: Record<string, string> = {
  digest:
    "Tidak ada job digest di repo: tidak ada generator, route, maupun workflow untuk digest personal (hanya disebut di deskripsi preferensi). Tidak ada yang bisa dipicu — membuat endpoint-nya berarti memalsukan sebuah run.",
  podcast:
    "Podcast TTS hanya jalan di workflow GitHub Actions podcast-tts.yml (dispatch manual, wajib input suara + konfirmasi lisensi — gerbang lisensi suara id_ID). Aplikasi tidak punya token GitHub dan tidak boleh melewati gerbang lisensi; picu dari tab Actions dengan suara yang lisensinya sudah diverifikasi.",
  riset:
    "Tidak ada batch job riset: laporan riset dibuat satu per satu oleh editor lewat POST /api/admin/riset (status awal selalu draft). Tidak ada proses terjadwal yang bisa dipicu ulang.",
};

/** 8 nama job yang diizinkan CHECK pf_scheduled_jobs (v8 §5b).
 *  Seed v5 berisi 3 baris (ingestion, editorial, brief); seed
 *  5 job (tambah data-analysis + terbitkan-terjadwal) ada di
 *  LAPORAN-FASE-8 §14 — Tahap 13C (F7 tertutup untuk job cron).
 *  digest/podcast/riset tetap tanpa endpoint pemicu. */
export const DAFTAR_JOB_DIKENAL: JobDikenal[] = [
  {
    nama: "ingestion",
    label: "Ingestion",
    jadwal_workflow: "Setiap 30 menit",
    bisa_dipicu: true,
  },
  {
    nama: "editorial",
    label: "Pipeline editorial AI",
    jadwal_workflow: "Setiap 2 jam",
    bisa_dipicu: true,
  },
  {
    nama: "brief",
    label: "Daily Brief",
    jadwal_workflow: "05.00 WIB setiap hari",
    bisa_dipicu: true,
  },
  {
    nama: "data-analysis",
    label: "Data Analysis",
    jadwal_workflow: "Senin 01.00 UTC",
    bisa_dipicu: true,
  },
  {
    nama: "terbitkan-terjadwal",
    label: "Terbitkan terjadwal",
    jadwal_workflow: "Setiap jam",
    bisa_dipicu: true,
  },
  {
    nama: "digest",
    label: "Digest personal (My Prata)",
    jadwal_workflow: "Belum ada workflow aktif",
    bisa_dipicu: false,
    alasan_tanpa_pemicu: ALASAN_TANPA_PEMICU["digest"],
  },
  {
    nama: "podcast",
    label: "Podcast",
    jadwal_workflow: "Belum ada workflow aktif",
    bisa_dipicu: false,
    alasan_tanpa_pemicu: ALASAN_TANPA_PEMICU["podcast"],
  },
  {
    nama: "riset",
    label: "Riset",
    jadwal_workflow: "Belum ada workflow aktif",
    bisa_dipicu: false,
    alasan_tanpa_pemicu: ALASAN_TANPA_PEMICU["riset"],
  },
];

export interface JobTercatat {
  id: string;
  nama: string;
  jadwal_cron: string | null;
  deskripsi: string | null;
  aktif: boolean;
  terakhir_jalan: string | null;
  status_terakhir: string;
  error_terakhir: string | null;
  diperbarui_pada: string | null;
}

export interface StatusScheduler {
  tersedia: boolean;
  jobs: (JobDikenal & {
    tercatat: boolean;
    baris: JobTercatat | null;
  })[];
}

/** Catatan F6 — diperbarui Tahap 13C. */
export const CATATAN_F6 =
  "Kolom terakhir_jalan diperbarui oleh SETIAP run — run cron GitHub Actions (klaim lock + selesai job di tiap endpoint, Tahap 13C) maupun pemicu manual dari halaman ini. Bila sebuah job tetap tampil 'belum pernah jalan', berarti run-nya belum pernah sampai ke endpoint (mis. workflow gagal sebelum curl) atau baris job-nya belum ada di tabel (seed 5 job — lihat LAPORAN-FASE-8 §14).";

async function ambilStatusScheduler(
  klien: SupabaseClient,
): Promise<StatusScheduler> {
  try {
    const { data, error } = await klien
      .from("pf_scheduled_jobs")
      .select(
        "id,nama,jadwal_cron,deskripsi,aktif,terakhir_jalan,status_terakhir,error_terakhir,diperbarui_pada",
      )
      .order("nama", { ascending: true });
    if (error) return { tersedia: false, jobs: [] };
    const peta = new Map(
      ((data ?? []) as JobTercatat[]).map((j) => [j.nama, j]),
    );
    return {
      tersedia: true,
      jobs: DAFTAR_JOB_DIKENAL.map((d) => {
        const baris = peta.get(d.nama) ?? null;
        return { ...d, tercatat: baris !== null, baris };
      }),
    };
  } catch {
    return { tersedia: false, jobs: [] };
  }
}

/** Status scheduler untuk halaman server (session client). */
export async function getStatusScheduler(): Promise<StatusScheduler> {
  const supabase = await createClient();
  return ambilStatusScheduler(supabase);
}

/* ============================================================
   Pemicu job manual — memanggil route internal yang sudah ada
   ============================================================ */

/** Pemetaan job -> route internal yang sudah ada. TIDAK ada
 *  logika ingestion/AI yang diduplikasi di sini. */
const ROUTE_JOB: Record<string, string> = {
  ingestion: "/api/ingestion/jalankan",
  editorial: "/api/ai/jalankan",
  brief: "/api/ai/brief",
  "data-analysis": "/api/ai/data-analysis",
  "terbitkan-terjadwal": "/api/admin/artikel/terbitkan-terjadwal",
};

export interface HasilPemicuJob {
  job: string;
  ok: boolean;
  hasil: unknown;
  /** false bila baris job belum ada di pf_scheduled_jobs (F7). */
  baris_job_diperbarui: boolean;
  catatan: string | null;
}

export async function pemicuJobManual(
  nama: string,
  aktor: AktorKendali,
  origin: string,
  cookie: string | null,
): Promise<HasilPemicuJob> {
  const dikenal = DAFTAR_JOB_DIKENAL.find((j) => j.nama === nama);
  if (!dikenal) {
    throw new Error(`Job '${nama}' tidak dikenal.`);
  }
  const route = ROUTE_JOB[nama];
  if (!route) {
    // F7: job dikenal CHECK tapi belum punya endpoint pemicu.
    throw new Error(
      `Job '${dikenal.label}' belum bisa dipicu manual — belum ada endpoint pemicu untuk job ini (temuan F7, LAPORAN-FASE-8 §10.3).`,
    );
  }
  if (!origin) {
    throw new Error("Origin server tidak dapat ditentukan.");
  }

  // Panggil route internal yang sama dengan workflow — cookie sesi
  // diteruskan agar otorisasi sesi (super_admin/editor) berlaku.
  let respon: Response;
  try {
    respon = await fetch(`${origin}${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({ dipicu_oleh: "manual" }),
    });
  } catch (err) {
    throw new Error(
      `Tidak dapat menghubungi ${route}: ${err instanceof Error ? err.message : "galat jaringan"}`,
    );
  }
  let hasil: unknown = null;
  try {
    hasil = await respon.json();
  } catch {
    hasil = null;
  }
  const ok =
    respon.ok &&
    (hasil === null ||
      typeof hasil !== "object" ||
      (hasil as { ok?: unknown }).ok !== false);
  const pesanGalat =
    hasil !== null &&
    typeof hasil === "object" &&
    typeof (hasil as { error?: unknown }).error === "string"
      ? ((hasil as { error: string }).error as string)
      : null;

  // Perbarui baris job (F6 — hanya untuk pemicu manual).
  // Bila baris belum ada (seed hanya 3 job), JANGAN membuat baris
  // baru dengan cron karangan — catat saja sebagai belum tercatat.
  // Audit 'sistem.job' WAJIB (fail-closed, Gelombang B1, P1-3):
  // ia dipanggil DI LUAR try status di bawah agar galatnya
  // TIDAK ditelan — gagal catat -> baris job dipulihkan ke nilai
  // sebelumnya (compensating) + galat dilempar agar route
  // menjawab 500/503. Catatan jujur: job internal yang sudah
  // terlanjur berjalan TIDAK bisa dibatalkan; yang dipulihkan
  // hanyalah pencatatan statusnya, dan kegagalan audit terlihat
  // sebagai 500 (operator tahu run itu tidak terekam).
  let barisDiperbarui = false;
  let barisLama: {
    terakhir_jalan: string | null;
    status_terakhir: string;
    error_terakhir: string | null;
  } | null = null;
  let klienStatus: SupabaseClient | null = null;
  try {
    klienStatus = createServiceClient();
    try {
      const { data: lama } = await klienStatus
        .from("pf_scheduled_jobs")
        .select("terakhir_jalan,status_terakhir,error_terakhir")
        .eq("nama", nama)
        .maybeSingle();
      barisLama = (lama as {
        terakhir_jalan: string | null;
        status_terakhir: string;
        error_terakhir: string | null;
      } | null) ?? null;
    } catch {
      // Baris lama gagal dibaca: compensating dilewati, audit
      // tetap wajib di bawah.
    }
    const { data: baris } = await klienStatus
      .from("pf_scheduled_jobs")
      .update({
        terakhir_jalan: new Date().toISOString(),
        status_terakhir: ok ? "berhasil" : "gagal",
        error_terakhir: ok ? null : (pesanGalat ?? `HTTP ${respon.status}`),
      })
      .eq("nama", nama)
      .select("id")
      .maybeSingle();
    barisDiperbarui = baris !== null && baris !== undefined;
  } catch {
    // Service key / tabel belum ada: hasil pemicu tetap dilaporkan
    // apa adanya; pencatatan status dilewati.
  }

  try {
    await catatAuditWajib({
      aktor_id: aktor.id,
      aktor_email: aktor.email,
      aksi: "sistem.job",
      entitas: "pf_scheduled_jobs",
      entitas_id: nama,
      sebelum: null,
      sesudah: {
        pemicu: "manual",
        ok,
        baris_job_diperbarui: barisDiperbarui,
        error: pesanGalat,
      },
      ip: aktor.ip ?? null,
    });
  } catch (errAudit) {
    if (klienStatus && barisLama) {
      try {
        await klienStatus
          .from("pf_scheduled_jobs")
          .update({
            terakhir_jalan: barisLama.terakhir_jalan,
            status_terakhir: barisLama.status_terakhir,
            error_terakhir: barisLama.error_terakhir,
          })
          .eq("nama", nama);
      } catch (errPulih) {
        console.error(
          JSON.stringify({
            event: "audit_compensating_restore_job_gagal",
            waktu: new Date().toISOString(),
            job: nama,
            pesan:
              errPulih instanceof Error
                ? errPulih.message
                : String(errPulih ?? ""),
          }),
        );
      }
    }
    throw errAudit;
  }

  return {
    job: nama,
    ok,
    hasil,
    baris_job_diperbarui: barisDiperbarui,
    catatan: barisDiperbarui
      ? null
      : "Baris job belum tercatat di pf_scheduled_jobs (seed 5 job belum diterapkan — lihat LAPORAN-FASE-8 §14); status terakhir tidak tersimpan di tabel.",
  };
}

/* ============================================================
   Kontrol antrean (Fase 12, Worker G) — pause / resume /
   disable / enable / reprocess, untuk KEDELAPAN job.
   ============================================================ */

export const AKSI_KONTROL_VALID = [
  "pause",
  "resume",
  "disable",
  "enable",
  "reprocess",
] as const;

export type AksiKontrol = (typeof AKSI_KONTROL_VALID)[number];

/**
 * Keadaan `aktif` sesudah aksi kontrol — fungsi MURNI (dipakai
 * baterai uji idempotensi). pause/disable -> false;
 * resume/enable -> true; reprocess tidak mengubah keadaan job
 * (null = "jalankan ulang", bukan ubah flag).
 */
export function aktifSesudahKontrol(
  aksi: AksiKontrol,
  aktifSekarang: boolean,
): boolean | null {
  void aktifSekarang;
  if (aksi === "pause" || aksi === "disable") return false;
  if (aksi === "resume" || aksi === "enable") return true;
  return null;
}

export interface HasilKontrolJob {
  job: string;
  aksi: AksiKontrol;
  ok: boolean;
  /** Keadaan aktif sesudah kontrol (null untuk reprocess). */
  aktif: boolean | null;
  /** Hasil downstream (hanya reprocess). */
  hasil: unknown;
  baris_job_diperbarui: boolean;
  catatan: string | null;
}

/**
 * Kontrol satu job (HANYA super_admin — ditegakkan route).
 *
 * - pause/disable/resume/enable: ubah flag `aktif` di
 *   pf_scheduled_jobs lewat perbaruiJob() (editorial.ts) — audit
 *   'sistem.job' fail-closed + compensating restore nilai lama
 *   bila audit gagal. IDEMPOTEN: pause atas job yang sudah
 *   nonaktif (atau resume atas job yang sudah aktif) tetap
 *   menulis nilai yang sama dan mengembalikan keadaan yang sama.
 *   Menonaktifkan job TIDAK membatalkan run yang sedang jalan;
 *   yang dihentikan hanyalah run terjadwal berikutnya.
 * - reprocess: jalankan ulang job lewat pemicuJobManual() —
 *   idempoten karena engine ingestion/pipeline dedup + lock
 *   (pemicu ulang tidak menduplikasi item). Untuk digest/
 *   podcast/riset, pemicuJobManual melempar galat jujur
 *   'belum bisa dipicu' (route memetakan ke 400) — tidak ada
 *   run palsu yang dibuat.
 */
export async function kontrolJob(
  nama: string,
  aksi: string,
  aktor: AktorKendali,
  origin: string,
  cookie: string | null,
): Promise<HasilKontrolJob> {
  const dikenal = DAFTAR_JOB_DIKENAL.find((j) => j.nama === nama);
  if (!dikenal) {
    throw new Error(`Job '${nama}' tidak dikenal.`);
  }
  if (!(AKSI_KONTROL_VALID as readonly string[]).includes(aksi)) {
    throw new Error(
      `Aksi '${aksi}' tidak dikenal (yang dikenal: ${AKSI_KONTROL_VALID.join(", ")}).`,
    );
  }
  const aksiValid = aksi as AksiKontrol;

  if (aksiValid === "reprocess") {
    const hasil = await pemicuJobManual(nama, aktor, origin, cookie);
    return {
      job: nama,
      aksi: aksiValid,
      ok: hasil.ok,
      aktif: null,
      hasil: hasil.hasil,
      baris_job_diperbarui: hasil.baris_job_diperbarui,
      catatan: hasil.catatan,
    };
  }

  const aktifBaru = aktifSesudahKontrol(aksiValid, true);
  // perbaruiJob (editorial.ts) butuh adapter + aktor editorial;
  // AktorKendali kompatibel secara struktural (id/email/ip).
  const adapter = buatAdminAdapter();
  const sesudah = await perbaruiJob(
    adapter,
    { nama: nama as NamaJob, patch: { aktif: aktifBaru ?? false } },
    { id: aktor.id, email: aktor.email, ip: aktor.ip },
  );
  return {
    job: nama,
    aksi: aksiValid,
    ok: true,
    aktif: sesudah.aktif ?? aktifBaru,
    hasil: null,
    baris_job_diperbarui: true,
    catatan:
      aktifBaru === false
        ? "Job dinonaktifkan: run terjadwal berikutnya dilewati. Run yang sedang jalan (bila ada) tidak dibatalkan."
        : null,
  };
}

/* ============================================================
   Ekspor CSV audit log (service role)
   ============================================================ */

function selCsv(nilai: unknown): string {
  if (nilai === null || nilai === undefined) return "";
  const s =
    typeof nilai === "string" ? nilai : JSON.stringify(nilai) ?? "";
  return `"${s.replace(/"/g, '""')}"`;
}

/** Kembalikan isi CSV audit log nyata (maks 1000 baris terbaru).
 *  Dipakai route GET /api/admin/kendali/ekspor-audit. */
export async function eksporAuditCsv(limit = 200): Promise<string> {
  const batas = Math.min(1000, Math.max(1, limit));
  let klien: SupabaseClient;
  try {
    klien = createServiceClient();
  } catch (err) {
    lemparBelumSiap("pf_audit_logs", err);
  }
  const { data, error } = await klien!
    .from("pf_audit_logs")
    .select("id,aktor_email,aksi,entitas,entitas_id,dibuat_pada")
    .order("dibuat_pada", { ascending: false })
    .limit(batas);
  if (error) lemparBelumSiap("eksporAuditCsv", error);
  const baris = [
    "id,aktor_email,aksi,entitas,entitas_id,dibuat_pada",
    ...((data ?? []) as {
      id: string;
      aktor_email: string | null;
      aksi: string;
      entitas: string;
      entitas_id: string | null;
      dibuat_pada: string;
    }[]).map((r) =>
      [
        selCsv(r.id),
        selCsv(r.aktor_email),
        selCsv(r.aksi),
        selCsv(r.entitas),
        selCsv(r.entitas_id),
        selCsv(r.dibuat_pada),
      ].join(","),
    ),
  ];
  return baris.join("\n") + "\n";
}
