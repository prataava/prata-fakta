import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, punyaRole, ROLES } from "@/lib/auth/roles";

// GET /api/ingestion/antrean — antrean review ingestion.
// HANYA super_admin/editor/fact_checker.
// Mengembalikan { tersedia, per_status, total, run_terakhir } dengan hitungan
// NYATA dari pf_raw_items (bukan angka palsu), mengikuti pola cariArtikel
// ({ tersedia }) yang dipakai halaman /cari.
// Bila tabel belum ada -> 200 dengan tersedia:false + pesan jujur.
// Rate limiting: 30 req/menit/IP (pola /api/langganan).
const BATAS = 30;
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

const STATUS = ["baru", "duplikat", "ditolak", "disalin_dari"] as const;

const PER_STATUS_KOSONG = {
  baru: 0,
  duplikat: 0,
  ditolak: 0,
  disalin_dari: 0,
};

export async function GET(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "tak-dikenal";
  if (!lolosRateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak percobaan. Coba lagi semenit lagi." },
      { status: 429 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Anda harus masuk terlebih dahulu." },
      { status: 401 },
    );
  }
  const roles = await getUserRoles(user.id);
  if (!punyaRole(roles, ROLES.EDITOR, ROLES.FACT_CHECKER)) {
    return NextResponse.json(
      { ok: false, error: "Anda tidak punya akses ke antrean ingestion." },
      { status: 403 },
    );
  }

  const belumTersedia = (pesan: string) =>
    NextResponse.json({
      ok: true,
      tersedia: false,
      pesan,
      per_status: { ...PER_STATUS_KOSONG },
      total: 0,
      run_terakhir: [],
    });

  // Hitungan nyata per status dari pf_raw_items.
  const perStatus: Record<string, number> = { ...PER_STATUS_KOSONG };
  for (const status of STATUS) {
    const { count, error } = await supabase
      .from("pf_raw_items")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    if (error) {
      return belumTersedia(
        "Tabel ingestion belum dibuat (migrasi belum dijalankan).",
      );
    }
    perStatus[status] = count ?? 0;
  }
  const total = Object.values(perStatus).reduce((n, v) => n + v, 0);

  // 5 run ingestion terakhir.
  const { data: runs, error: errRuns } = await supabase
    .from("pf_ingestion_runs")
    .select("id,sumber_nama,dimulai_pada,status,ditemukan,baru,duplikat,ditolak,gagal")
    .order("dimulai_pada", { ascending: false })
    .limit(5);
  if (errRuns) {
    return belumTersedia(
      "Tabel ingestion belum dibuat (migrasi belum dijalankan).",
    );
  }

  return NextResponse.json({
    ok: true,
    tersedia: true,
    per_status: perStatus,
    total,
    run_terakhir: runs ?? [],
  });
}
