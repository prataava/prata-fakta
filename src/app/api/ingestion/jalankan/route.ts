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
// Rate limiting: 10 req/menit/IP (pola /api/langganan).
const BATAS = 10;
const JENDELA_MS = 60_000;
const hitungan = new Map<string, { n: number; mulai: number }>();

function lolosRateLimit(ip: string): boolean {
  const sekarang = Date.now();
  const entri = hitungan.get(ip);
  if (!entri || sekarang - entri.mulai > JENDELA_MS) {
    hitungan.set(ip, { n: 1, mulai: sekarang });
    return true;
  }
  if (entri.n >= BATAS) return false;
  entri.n += 1;
  return true;
}

type DipicuOleh = "manual" | "github_actions" | "cron_muse";

const TOTAL_KOSONG = {
  ditemukan: 0,
  baru: 0,
  duplikat: 0,
  ditolak: 0,
  gagal: 0,
};

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "tak-dikenal";
  if (!lolosRateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak percobaan. Coba lagi semenit lagi." },
      { status: 429 },
    );
  }

  // --- Autentikasi dua jalur ---
  const secretEnv = process.env.PF_INGESTION_SECRET;
  const secretHeader = req.headers.get("x-pf-ingestion-secret");
  const lewatSecret =
    !!secretEnv && !!secretHeader && secretHeader === secretEnv;

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

    return NextResponse.json({
      ok: true,
      dipicu_oleh: dipicuOleh,
      per_sumber: perSumber,
      total,
      ...(gdelt ? { gdelt } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `Ingestion gagal: ${err instanceof Error ? err.message : "kesalahan tidak diketahui"}`,
      },
      { status: 500 },
    );
  }
}
