import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, punyaRole, ROLES } from "@/lib/auth/roles";
import {
  buatRateLimiter,
  responRateLimit,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";
import {
  AWALAN_ALASAN_KEDALUWARSA,
  hitungSumberBasi,
} from "@/lib/ingestion/pemeliharaan";

// GET /api/ingestion/antrean — antrean review ingestion.
// HANYA super_admin/editor/fact_checker.
// Mengembalikan { tersedia, per_status, total, run_terakhir, tertua,
// sumber_basi, kedaluarsa } dengan hitungan NYATA dari pf_raw_items
// (bukan angka palsu), mengikuti pola cariArtikel ({ tersedia }) yang
// dipakai halaman /cari.
// - tertua: 10 item UNCONFIRMED tertua (mode kejar ketertinggalan, P2-8).
// - sumber_basi: sumber tanpa item baru > 48 jam (P1-6).
// - kedaluarsa: item UNCONFIRMED yang ditandai kedaluwarsa otomatis (P2-8).
// Bila tabel belum ada -> 200 dengan tersedia:false + pesan jujur.
// Rate limiting: 30 req/menit (limiter database lintas instance,
// Tahap 13A, T3 — menggantikan Map in-memory per instance).
const batasi = buatRateLimiter(30);

const STATUS = ["baru", "duplikat", "ditolak", "disalin_dari"] as const;

const PER_STATUS_KOSONG = {
  baru: 0,
  duplikat: 0,
  ditolak: 0,
  disalin_dari: 0,
};

export async function GET(req: Request) {
  if (!(await batasi(req))) return responRateLimit();

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
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(supabase, user.id);
  if (ditolak) return ditolak;
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
      tertua: [],
      sumber_basi: [],
      kedaluarsa: 0,
    });

  // Hitungan nyata per status dari pf_raw_items — PARALEL (B-S4):
  // 5 query hitung sekuensial diganti satu Promise.all (4 hitungan
  // status + hitungan kedaluarsa + 5 run terakhir + 10 item tertua
  // + waktu item terbaru per sumber). Tanpa RPC agregat baru karena
  // itu butuh migrasi (milik agen backend); paralelisme ini
  // menghilangkan waktu tunggu sekuensial tanpa mengubah skema.
  const hitungStatus = (status: string) =>
    supabase
      .from("pf_raw_items")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
  const janjiHitung = STATUS.map((s) => hitungStatus(s));
  const janjiKedaluarsa = supabase
    .from("pf_raw_items")
    .select("id", { count: "exact", head: true })
    .eq("status", "ditolak")
    .ilike("alasan", `${AWALAN_ALASAN_KEDALUWARSA}%`);
  const janjiRuns = supabase
    .from("pf_ingestion_runs")
    .select("id,sumber_nama,dimulai_pada,status,ditemukan,baru,duplikat,ditolak,gagal")
    .order("dimulai_pada", { ascending: false })
    .limit(5);
  // Kejar ketertinggalan (P2-8): 10 item UNCONFIRMED tertua — yang
  // paling lama menunggu di antrean, agar tidak kelaparan selamanya
  // di balik item-item terbaru.
  const janjiTertua = supabase
    .from("pf_raw_items")
    .select("id,judul,url,sumber_id,waktu_diambil,waktu_terbit_asli")
    .eq("status_verifikasi", "UNCONFIRMED")
    .in("status", ["baru", "disalin_dari", "duplikat"])
    .order("waktu_diambil", { ascending: true })
    .limit(10);
  const janjiSumber = supabase
    .from("pf_sources")
    .select("id,nama")
    .eq("aktif", true);

  const [hasilHitung, hasilKedaluarsa, hasilRuns, hasilTertua, hasilSumber] =
    await Promise.all([
      Promise.all(janjiHitung),
      janjiKedaluarsa,
      janjiRuns,
      janjiTertua,
      janjiSumber,
    ]);
  for (const h of hasilHitung) {
    if (h.error) {
      return belumTersedia(
        "Tabel ingestion belum dibuat (migrasi belum dijalankan).",
      );
    }
  }
  const perStatus: Record<string, number> = { ...PER_STATUS_KOSONG };
  STATUS.forEach((s, i) => {
    perStatus[s] = hasilHitung[i].count ?? 0;
  });
  const total = Object.values(perStatus).reduce((n, v) => n + v, 0);
  if (hasilRuns.error) {
    return belumTersedia(
      "Tabel ingestion belum dibuat (migrasi belum dijalankan).",
    );
  }
  const runs = hasilRuns.data ?? [];

  // Sumber basi (P1-6): waktu item terbaru per sumber dibaca paralel
  // (satu query kecil per sumber aktif — jumlah sumber kecil, ~7).
  // Gagal membaca = daftar kosong, bukan gagalnya seluruh respons.
  let sumberBasi: Array<{
    sumber_id: string;
    sumber_nama: string;
    pernah_produktif: boolean;
    jam_sejak_item_terakhir: number | null;
  }> = [];
  const daftarSumber = (hasilSumber.data ?? []) as Array<{
    id: string;
    nama: string;
  }>;
  if (!hasilSumber.error && daftarSumber.length > 0) {
    try {
      const aktivitas = await Promise.all(
        daftarSumber.map(async (s) => {
          const { data } = await supabase
            .from("pf_raw_items")
            .select("waktu_diambil")
            .eq("sumber_id", s.id)
            .order("waktu_diambil", { ascending: false })
            .limit(1)
            .maybeSingle();
          const mentah = (data as { waktu_diambil?: string } | null)
            ?.waktu_diambil;
          const tanggal = mentah ? new Date(mentah) : null;
          return {
            sumber_id: s.id,
            sumber_nama: s.nama,
            terakhir_item:
              tanggal && !Number.isNaN(tanggal.getTime()) ? tanggal : null,
          };
        }),
      );
      sumberBasi = hitungSumberBasi(aktivitas, new Date());
    } catch {
      sumberBasi = [];
    }
  }

  return NextResponse.json({
    ok: true,
    tersedia: true,
    per_status: perStatus,
    total,
    run_terakhir: runs,
    // Item UNCONFIRMED tertua (mode kejar ketertinggalan, P2-8).
    tertua: hasilTertua.error ? [] : (hasilTertua.data ?? []),
    // Sumber tanpa item baru > 48 jam (P1-6).
    sumber_basi: sumberBasi,
    // Item yang ditandai kedaluwarsa otomatis (P2-8, 14 hari).
    kedaluarsa: hasilKedaluarsa.error ? 0 : (hasilKedaluarsa.count ?? 0),
  });
}
