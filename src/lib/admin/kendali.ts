// Lapisan kendali admin (Gelombang 2, Area 14 — Advanced Admin
// Control Center). Feature flags (pf_system_settings, migrasi v10
// §6), status scheduler (pf_scheduled_jobs), pemicu job manual,
// dan ekspor CSV audit log.
//
// Prinsip:
// - Flag HANYA dicatat di pf_system_settings. Penegakan otomatis
//   flag di route ingestion/pipeline BELUM disambungkan (route itu
//   milik Fase 3/4 dan tidak disentuh di sini) — halaman kendali
//   menyatakan itu secara jujur, bukan mengklaim flag sudah
//   menonaktifkan job.
// - Pemicu manual TIDAK menduplikasi logika ingestion/AI: ia
//   memanggil route internal yang sudah ada (POST
//   /api/ingestion/jalankan, /api/ai/jalankan, /api/ai/brief,
//   /api/ai/data-analysis, /api/admin/artikel/terbitkan-terjadwal)
//   dengan cookie sesi yang sama, lalu memperbarui baris
//   pf_scheduled_jobs bila ada.
// - Temuan scheduler gate yang RELEVAN dan BELUM diperbaiki
//   (LAPORAN-FASE-8 §10.3) dinyatakan di halaman, bukan
//   disembunyikan: F6 (terakhir_jalan tidak diperbarui run cron —
//   pemicu manual dari UI ini MEMPERBARUINYA, run GitHub Actions
//   tetap tidak), F7 (seed hanya 3 job; digest/podcast/riset
//   belum punya endpoint pemicu), F2 (dispatch 'keduanya' tidak
//   menjalankan terbitkan-terjadwal), F3/F4/F5/F8/F12 (di luar
//   kendali UI ini).
// - Aksi audit yang dipakai ('sistem.flag', 'sistem.job') SUDAH
//   ada di CHECK pf_audit_logs sejak migrasi v8 (47 aksi di v9)
//   — tidak ada aksi audit baru yang butuh migrasi.
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AWALAN_BELUM_SIAP } from "./types";

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
      "Penanda operasional: ingestion dari sumber RSS/GDELT diizinkan berjalan. Penegakan otomatis di route ingestion BELUM disambungkan — flag ini belum menonaktifkan ingestion.",
    jenis: "boolean",
    bawaan: true,
  },
  {
    kunci: "pipeline_editorial_aktif",
    label: "Pipeline editorial aktif",
    deskripsi:
      "Penanda operasional: pipeline editorial AI diizinkan berjalan. Penegakan otomatis di route pipeline BELUM disambungkan — flag ini belum menonaktifkan pipeline.",
    jenis: "boolean",
    bawaan: true,
  },
  {
    kunci: "pendaftaran_terbuka",
    label: "Pendaftaran terbuka",
    deskripsi:
      "Penanda operasional: pendaftaran akun baru dibuka. Penegakan otomatis di route akun BELUM disambungkan.",
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

  try {
    await klien!.from("pf_audit_logs").insert({
      aktor_id: aktor.id,
      aktor_email: aktor.email,
      aksi: "sistem.flag",
      entitas: "pf_system_settings",
      entitas_id: kunci,
      sebelum: lama ? { nilai: lama.nilai } : null,
      sesudah: { nilai: nilai as NilaiFlag },
      ip: aktor.ip ?? null,
    });
  } catch {
    // Audit gagal tidak membatalkan perubahan flag yang sudah
    // tersimpan; route tetap menjawab berhasil (audit dicatat
    // bila tabel/CHECK tersedia).
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
}

/** 8 nama job yang diizinkan CHECK pf_scheduled_jobs (v8 §5b).
 *  Seed v5 hanya berisi 3 baris (ingestion, editorial, brief) —
 *  sisanya belum tercatat sampai admin/workflow membuatnya (F7). */
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
    jadwal_workflow: "Setiap 6 jam",
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
  },
  {
    nama: "podcast",
    label: "Podcast",
    jadwal_workflow: "Belum ada workflow aktif",
    bisa_dipicu: false,
  },
  {
    nama: "riset",
    label: "Riset",
    jadwal_workflow: "Belum ada workflow aktif",
    bisa_dipicu: false,
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

/** Catatan jujur F6 — ditampilkan di halaman kendali. */
export const CATATAN_F6 =
  "Kolom terakhir_jalan HANYA diperbarui oleh pemicu manual dari halaman ini. Run cron GitHub Actions tidak memperbaruinya (temuan F6, LAPORAN-FASE-8 §10.3 — belum diperbaiki), jadi job yang hanya jalan lewat cron akan tetap tampil 'belum pernah jalan' di sini.";

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

  // Perbarui baris job (F6 — hanya untuk pemicu manual) + audit.
  // Bila baris belum ada (seed hanya 3 job), JANGAN membuat baris
  // baru dengan cron karangan — catat saja sebagai belum tercatat.
  let barisDiperbarui = false;
  try {
    const klien = createServiceClient();
    const { data: baris } = await klien
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
    try {
      await klien.from("pf_audit_logs").insert({
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
    } catch {
      // Audit gagal tidak membatalkan hasil pemicu.
    }
  } catch {
    // Service key / tabel belum ada: hasil pemicu tetap dilaporkan
    // apa adanya; pencatatan status dilewati.
  }

  return {
    job: nama,
    ok,
    hasil,
    baris_job_diperbarui: barisDiperbarui,
    catatan: barisDiperbarui
      ? null
      : "Baris job belum tercatat di pf_scheduled_jobs (seed hanya 3 job — temuan F7); status terakhir tidak tersimpan di tabel.",
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
