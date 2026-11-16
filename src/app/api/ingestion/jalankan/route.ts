import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserRoles, punyaRole, ROLES } from "@/lib/auth/roles";
import {
  jalankanIngestion,
  type HasilIngestion,
  type HasilPerSumber,
  type SumberIngestion,
} from "@/lib/ingestion/engine";
import { buatSupabaseAdapter } from "@/lib/ingestion/supabase-adapter";
import {
  jalankanPemeliharaanAntrean,
  UMUR_KEDALUWARSA_HARI,
} from "@/lib/ingestion/pemeliharaan";
import {
  bandingkanSecret,
  buatRateLimiterKeras,
  responRateLimit,
  responRateLimitBelumSiap,
} from "@/lib/ai/route-auth";
import { klaimJob, selesaikanJob } from "@/lib/scheduler/jobs";
import { bacaFlag } from "@/lib/scheduler/flags";
import { catatGalatRoute } from "@/lib/analytics/galat";

// POST /api/ingestion/jalankan — memicu ingestion dari sumber aktif.
// Autentikasi DUA jalur:
//  (a) header x-pf-ingestion-secret == PF_INGESTION_SECRET (pemicu jadwal);
//  (b) sesi login super_admin/editor.
// Bila PF_INGESTION_SECRET belum diatur DAN tidak ada sesi -> 503 jujur.
// Body opsional: { sumber_id?, topik_gdelt?, dipicu_oleh? }.
//
// Kontrak engine (src/lib/ingestion/engine.ts, ditulis agen lain):
//  jalankanIngestion(adapter, sumber, opsi) -> Promise<HasilIngestion>
//  ({ perSumber: HasilPerSumber[], total }). Engine sendiri yang membuat
//  baris pf_ingestion_runs, menangani error per sumber, dan mengambil
//  GDELT untuk sumber jenis 'api' (topik per sumber / opsi / "Indonesia",
//  maks 25 artikel). Adapter dibuat lewat buatSupabaseAdapter() (baca env sendiri).
//
// GDELT per topik (Gelombang B1, P2-5 / N-S6): body.topik_gdelt TIDAK
// lagi di-fetch di sini — topik diteruskan ke engine lewat
// opsi.topikGdelt, jadi GDELT hanya dipanggil SEKALI oleh engine.
// Sebelumnya route memanggil fetchGdelt lalu membuang hasilnya dan
// engine memanggil ulang (2 panggilan GDELT per run).
// Rate limiting: 10 req/menit (limiter database lintas instance,
// Tahap 13A, T3 — menggantikan Map in-memory per instance).
const batasi = buatRateLimiterKeras(10);

type DipicuOleh = "manual" | "github_actions";

const TOTAL_KOSONG = {
  ditemukan: 0,
  baru: 0,
  duplikat: 0,
  ditolak: 0,
  gagal: 0,
};

export async function POST(req: Request) {
  const hasilRateLimit = await batasi(req);
  if (!hasilRateLimit.lolos && hasilRateLimit.alasan === "rpc-gagal")
    return responRateLimitBelumSiap(hasilRateLimit.jenisGalat);
  if (!hasilRateLimit.lolos) return responRateLimit();

  // --- Autentikasi dua jalur ---
  const secretEnv = process.env.PF_INGESTION_SECRET;
  const secretHeader = req.headers.get("x-pf-ingestion-secret");
  const lewatSecret = bandingkanSecret(secretHeader, secretEnv);

  let dipicuOlehDefault: DipicuOleh = "manual";
  if (!lewatSecret) {
    const supabaseUser = await createClient();
    const {
      data: { user },
    } = await supabaseUser.auth.getUser();
    if (!user) {
      if (!secretEnv) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Layanan ingestion belum dikonfigurasi (secret belum diatur).",
          },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { ok: false, error: "Anda harus masuk terlebih dahulu." },
        { status: 401 },
      );
    }
    // Gate Fase 8 (T4): akun dibatasi (nonaktif) tidak boleh memicu
    // ingestion — jalur sesi ini sebelumnya tidak memeriksa nonaktif.
    try {
      const { data: profil } = await supabaseUser
        .from("pf_profiles")
        .select("nonaktif")
        .eq("id", user.id)
        .maybeSingle();
      if (profil && (profil as { nonaktif: boolean }).nonaktif) {
        return NextResponse.json(
          { ok: false, error: "Akun Anda dibatasi. Hubungi administrator." },
          { status: 403 },
        );
      }
    } catch {
      // Bila tabel profil belum ada, lanjut ke pemeriksaan role.
    }
    const roles = await getUserRoles(user.id);
    if (!punyaRole(roles, ROLES.EDITOR)) {
      return NextResponse.json(
        { ok: false, error: "Anda tidak punya akses untuk memicu ingestion." },
        { status: 403 },
      );
    }
  } else {
    dipicuOlehDefault = "github_actions";
  }

  // --- Body opsional ---
  let body: {
    sumber_id?: unknown;
    topik_gdelt?: unknown;
    dipicu_oleh?: unknown;
  } = {};
  try {
    const teks = await req.text();
    if (teks.trim()) body = JSON.parse(teks) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const sumberId =
    typeof body.sumber_id === "string" && body.sumber_id.trim()
      ? body.sumber_id.trim()
      : null;
  const topikGdelt =
    typeof body.topik_gdelt === "string" && body.topik_gdelt.trim()
      ? body.topik_gdelt.trim().slice(0, 200)
      : null;
  const dipicuOleh: DipicuOleh =
    body.dipicu_oleh === "github_actions" ||
    body.dipicu_oleh === "manual"
      ? body.dipicu_oleh
      : dipicuOlehDefault;

  // --- Service client (baca daftar sumber) + adapter ingestion ---
  // Keduanya butuh SUPABASE_SERVICE_ROLE_KEY; bila belum diatur -> 503.
  let service: ReturnType<typeof createServiceClient>;
  try {
    service = createServiceClient();
    // Adapter membaca env sendiri; panggil di sini agar kegagalan
    // konfigurasi terdeteksi sebelum run dimulai.
    buatSupabaseAdapter();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan ingestion belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY belum diatur).",
      },
      { status: 503 },
    );
  }

  // --- Penegakan flag (Tahap 13C): ingestion_aktif=false ->
  // 503 jujur. Dibaca sesudah autentikasi (bukan sebelum) agar
  // status flag tidak bocor ke pemanggil tak terautentikasi.
  // Tabel flag belum ada -> bawaan true (jalan seperti semula).
  if (!(await bacaFlag(service, "ingestion_aktif", true))) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Ingestion dinonaktifkan oleh admin (flag ingestion_aktif).",
      },
      { status: 503 },
    );
  }

  // --- Baca sumber aktif ---
  // Topik GDELT per sumber (P3-3) dibaca dari kolom pf_sources.topik_gdelt
  // (migrasi v13 — BELUM ADA saat Gelombang B1). Bila kolom belum ada,
  // PostgREST menolak select → ulangi tanpa kolom itu (topik per sumber
  // kosong, engine memakai opsi.topikGdelt / bawaan "Indonesia").
  let sumberRows: Array<Record<string, unknown>> | null = null;
  let errSumber: { message: string } | null = null;
  {
    const hasil = await service
      .from("pf_sources")
      .select("id,nama,jenis,url,prioritas,aktif,topik_gdelt")
      .eq("aktif", true)
      .order("prioritas", { ascending: false });
    sumberRows = hasil.data as Array<Record<string, unknown>> | null;
    errSumber = hasil.error as { message: string } | null;
    if (errSumber && /topik_gdelt/i.test(errSumber.message ?? "")) {
      const ulang = await service
        .from("pf_sources")
        .select("id,nama,jenis,url,prioritas,aktif")
        .eq("aktif", true)
        .order("prioritas", { ascending: false });
      sumberRows = ulang.data as Array<Record<string, unknown>> | null;
      errSumber = ulang.error as { message: string } | null;
    }
  }
  if (sumberId) {
    sumberRows = (sumberRows ?? []).filter((r) => r.id === sumberId);
  }
  if (errSumber) {
    return NextResponse.json(
      {
        ok: false,
        error: "Tabel sumber belum dibuat (migrasi belum dijalankan).",
      },
      { status: 503 },
    );
  }
  const semuaSumber = (sumberRows ?? []) as unknown as SumberIngestion[];
  if (sumberId && semuaSumber.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Sumber tidak ditemukan atau tidak aktif." },
      { status: 404 },
    );
  }
  // Peta topik GDELT per sumber (P3-3) dari kolom DB bila ada.
  const topikGdeltPerSumber: Record<string, string> = {};
  for (const s of semuaSumber) {
    if (typeof s.topik_gdelt === "string" && s.topik_gdelt.trim()) {
      topikGdeltPerSumber[s.id] = s.topik_gdelt.trim().slice(0, 200);
    }
  }

  // --- Lock server-side (Tahap 13C, F3 + Gelombang B1, P2-9 / N-S9):
  // dua run bersamaan tidak memproses batch yang sama. Lock TIDAK
  // tersedia (tabel/baris job tidak bisa dibuat) -> TOLAK dengan 503
  // jujur, JANGAN jalan diam-diam tanpa lock. Lock dipegang run lain
  // -> 409. klaimJob membuat baris job otomatis bila belum ada.
  const klaim = await klaimJob(service, "ingestion");
  if (!klaim.diklaim) {
    if (klaim.tersedia) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Job ingestion sedang berjalan (lock server-side). Coba lagi setelah run sebelumnya selesai.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: `Lock ingestion tidak tersedia (${klaim.alasan ?? "tanpa keterangan"}). Ingestion ditolak agar tidak jalan tanpa lock.`,
      },
      { status: 503 },
    );
  }
  const infoLock = "diklaim";

  let okRun = false;
  let galatRun: string | null = null;
  let peringatanRun: string | null = null;
  let pemeliharaan: {
    basi: Array<{ sumber_nama: string; jam_sejak_item_terakhir: number | null; pernah_produktif: boolean }>;
    kedaluarsa_ditandai: number;
    umur_kedaluarsa_hari: number;
  } | null = null;
  try {
    // --- Jalankan engine (error per sumber ditangani di dalam engine) ---
    // Topik GDELT diteruskan ke engine (P2-5): route TIDAK memanggil
    // fetchGdelt sendiri, jadi GDELT hanya dipanggil sekali per run.
    const adapter = buatSupabaseAdapter();
    const hasil: HasilIngestion = await jalankanIngestion(
      adapter,
      semuaSumber,
      {
        dipicu_oleh: dipicuOleh,
        topikGdelt: topikGdelt ?? undefined,
        topikGdeltPerSumber,
      },
    );
    const perSumber: HasilPerSumber[] = hasil.perSumber ?? [];
    const total = hasil.total ?? { ...TOTAL_KOSONG };

    // --- Pemeliharaan antrean (P1-6 + P2-8, best-effort) ---
    // Periksa sumber basi + tandai item UNCONFIRMED kedaluwarsa.
    // Gagal di sini tidak menggagalkan run ingestion.
    try {
      pemeliharaan = await jalankanPemeliharaanAntrean(
        adapter,
        semuaSumber.map((s) => ({ id: s.id, nama: s.nama })),
      );
      if (pemeliharaan.basi.length > 0) {
        peringatanRun = `Sumber basi (>48 jam tanpa item baru): ${pemeliharaan.basi
          .map((b) => b.sumber_nama)
          .join(", ")}`;
      }
    } catch {
      pemeliharaan = null;
    }

    // Ringkasan GDELT dari run engine (bukan pre-fetch): bila topik
    // diminta tapi tidak ada sumber jenis 'api' aktif, catat itu.
    let gdelt: {
      topik: string;
      ditemukan: number;
      baru: number;
      catatan?: string;
    } | null = null;
    if (topikGdelt) {
      const runGdelt = perSumber.find((h) => h.sumber_nama === "GDELT DOC API");
      if (runGdelt) {
        gdelt = {
          topik: topikGdelt,
          ditemukan: runGdelt.ditemukan,
          baru: runGdelt.baru,
        };
      } else {
        gdelt = {
          topik: topikGdelt,
          ditemukan: 0,
          baru: 0,
          catatan:
            "Tidak ada sumber jenis 'api' aktif — topik GDELT diabaikan.",
        };
      }
    }

    okRun = true;
    return NextResponse.json({
      ok: true,
      dipicu_oleh: dipicuOleh,
      lock: infoLock,
      per_sumber: perSumber,
      total,
      ...(gdelt ? { gdelt } : {}),
      sumber_basi: pemeliharaan?.basi ?? [],
      kedaluarsa: pemeliharaan
        ? {
            ditandai: pemeliharaan.kedaluarsa_ditandai,
            umur_hari: pemeliharaan.umur_kedaluarsa_hari,
          }
        : { ditandai: 0, umur_hari: UMUR_KEDALUWARSA_HARI },
    });
  } catch (err) {
    galatRun =
      err instanceof Error ? err.message : "kesalahan tidak diketahui";
    void catatGalatRoute("POST /api/ingestion/jalankan", err);
    return NextResponse.json(
      {
        ok: false,
        error: `Ingestion gagal: ${galatRun}`,
      },
      { status: 500 },
    );
  } finally {
    // F6: terakhir_jalan + status_terakhir diperbarui di AKHIR
    // setiap run cron (berhasil maupun gagal). Peringatan basi
    // (bila ada) dicatat ke error_terakhir sebagai "PERINGATAN: ..."
    // tanpa mengubah status 'berhasil' (lihat selesaikanJob).
    await selesaikanJob(service, "ingestion", okRun, galatRun, {
      peringatan: peringatanRun,
    });
  }
}
