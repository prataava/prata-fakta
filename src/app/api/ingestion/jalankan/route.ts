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
import { fetchGdelt } from "@/lib/ingestion/gdelt";
import {
  bandingkanSecret,
  buatRateLimiter,
  responRateLimit,
} from "@/lib/ai/route-auth";
import { klaimJob, selesaikanJob } from "@/lib/scheduler/jobs";
import { bacaFlag } from "@/lib/scheduler/flags";

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
//  GDELT untuk sumber jenis 'api' (topik "Indonesia", maks 25 artikel).
//  Adapter dibuat lewat buatSupabaseAdapter() (baca env sendiri).
//
// GDELT per topik: bila body.topik_gdelt diisi, route memanggil
// fetchGdelt(topik, { maxRecords: 5 }) SATU kali sebagai pemeriksaan
// topik; hasil ingestion GDELT yang sebenarnya dicatat engine sebagai
// run sumber 'GDELT DOC API' (bila sumber itu terdaftar). Bila sumber
// itu tidak ada, hasil pemeriksaan dilewati dengan catatan di respons.
// Rate limiting: 10 req/menit (limiter database lintas instance,
// Tahap 13A, T3 — menggantikan Map in-memory per instance).
const batasi = buatRateLimiter(10);

type DipicuOleh = "manual" | "github_actions" | "cron_muse";

const TOTAL_KOSONG = {
  ditemukan: 0,
  baru: 0,
  duplikat: 0,
  ditolak: 0,
  gagal: 0,
};

export async function POST(req: Request) {
  if (!(await batasi(req))) return responRateLimit();

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
    body.dipicu_oleh === "cron_muse" ||
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
  let query = service
    .from("pf_sources")
    .select("id,nama,jenis,url,prioritas,aktif")
    .eq("aktif", true)
    .order("prioritas", { ascending: false });
  if (sumberId) query = query.eq("id", sumberId);
  const { data: sumberRows, error: errSumber } = await query;
  if (errSumber) {
    return NextResponse.json(
      {
        ok: false,
        error: "Tabel sumber belum dibuat (migrasi belum dijalankan).",
      },
      { status: 503 },
    );
  }
  const semuaSumber = (sumberRows ?? []) as SumberIngestion[];
  if (sumberId && semuaSumber.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Sumber tidak ditemukan atau tidak aktif." },
      { status: 404 },
    );
  }

  // --- Lock server-side (Tahap 13C, F3): dua run bersamaan
  // tidak memproses batch yang sama. Lock tak tersedia (baris/
  // tabel job belum ada) -> jalan tanpa lock + dicatat di respons.
  const klaim = await klaimJob(service, "ingestion");
  if (klaim.tersedia && !klaim.diklaim) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Job ingestion sedang berjalan (lock server-side). Coba lagi setelah run sebelumnya selesai.",
      },
      { status: 409 },
    );
  }
  const infoLock = klaim.diklaim
    ? "diklaim"
    : `tidak-tersedia (${klaim.alasan ?? "tanpa keterangan"})`;

  let okRun = false;
  let galatRun: string | null = null;
  try {
    // --- GDELT per topik (bila diminta): fetch SATU kali, maks 5 ---
    let gdelt: {
      topik: string;
      ditemukan: number;
      baru: number;
      ms: number;
      catatan?: string;
    } | null = null;
    if (topikGdelt) {
      const mulaiGdelt = Date.now();
      try {
        const hasilGdelt = await fetchGdelt(topikGdelt, { maxRecords: 5 });
        const adaSumberGdelt = semuaSumber.some(
          (s) => s.nama === "GDELT DOC API",
        );
        gdelt = {
          topik: topikGdelt,
          ditemukan: hasilGdelt.items.length,
          // 'baru' diisi sesudah engine berjalan (dari run sumber GDELT).
          baru: 0,
          ms: Date.now() - mulaiGdelt,
          ...(!adaSumberGdelt
            ? {
                catatan:
                  "Sumber 'GDELT DOC API' tidak terdaftar — hasil GDELT dilewati.",
              }
            : {}),
        };
      } catch (err) {
        // Gagal ambil GDELT bukan kegagalan seluruh run.
        gdelt = {
          topik: topikGdelt,
          ditemukan: 0,
          baru: 0,
          ms: Date.now() - mulaiGdelt,
          catatan: `Gagal mengambil GDELT: ${err instanceof Error ? err.message : "tidak diketahui"}`,
        };
      }
    }

    // --- Jalankan engine (error per sumber ditangani di dalam engine) ---
    const adapter = buatSupabaseAdapter();
    const hasil: HasilIngestion = await jalankanIngestion(
      adapter,
      semuaSumber,
      { dipicu_oleh: dipicuOleh },
    );
    const perSumber: HasilPerSumber[] = hasil.perSumber ?? [];
    const total = hasil.total ?? { ...TOTAL_KOSONG };

    if (gdelt && !gdelt.catatan) {
      const runGdelt = perSumber.find((h) => h.sumber_nama === "GDELT DOC API");
      gdelt.baru = runGdelt ? runGdelt.baru : 0;
    }

    okRun = true;
    return NextResponse.json({
      ok: true,
      dipicu_oleh: dipicuOleh,
      lock: infoLock,
      per_sumber: perSumber,
      total,
      ...(gdelt ? { gdelt } : {}),
    });
  } catch (err) {
    galatRun =
      err instanceof Error ? err.message : "kesalahan tidak diketahui";
    return NextResponse.json(
      {
        ok: false,
        error: `Ingestion gagal: ${galatRun}`,
      },
      { status: 500 },
    );
  } finally {
    // F6: terakhir_jalan + status_terakhir diperbarui di AKHIR
    // setiap run cron (berhasil maupun gagal).
    await selesaikanJob(service, "ingestion", okRun, galatRun);
  }
}
