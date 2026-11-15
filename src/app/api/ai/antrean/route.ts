import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buatSupabaseAiAdapter } from "@/lib/ai/supabase-adapter";
import {
  autentikasiStaf,
  buatRateLimiter,
  ipDariRequest,
  responRateLimit,
} from "@/lib/ai/route-auth";

// GET /api/ai/antrean — antrean review editorial AI.
// HANYA super_admin/editor/fact_checker.
// Mengembalikan { tersedia, total_unconfirmed, item,
// klaim_tanpa_verifikasi } dengan data NYATA: total item mentah
// berstatus UNCONFIRMED (hitungan persis, bukan potongan), 20 item
// teratas (urut prioritas sumber lalu terbaru), dan 20 klaim yang
// belum punya verification record. Total klaim tanpa verifikasi
// TIDAK dihitung persis (anti-join tidak didukung PostgREST; adapter
// memindai klaim tertua) — jadi hanya jumlah yang ditampilkan yang
// dilaporkan, bukan total yang pura-pura persis.
// Bila tabel belum ada -> 200 dengan tersedia:false + pesan jujur.
// Rate limiting: 30 req/menit/IP (pola /api/langganan).
const lolosRateLimit = buatRateLimiter(30);

export async function GET(req: Request) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();

  const galatAuth = await autentikasiStaf();
  if (galatAuth) return galatAuth;

  const belumTersedia = (pesan: string) =>
    NextResponse.json({
      ok: true,
      tersedia: false,
      pesan,
      total_unconfirmed: 0,
      item: [],
      klaim_ditampilkan: 0,
      klaim_tanpa_verifikasi: [],
    });

  // Adapter + service client butuh SUPABASE_SERVICE_ROLE_KEY; bila
  // belum diatur -> 503 jujur.
  let adapter: ReturnType<typeof buatSupabaseAiAdapter>;
  let service: ReturnType<typeof createServiceClient>;
  try {
    adapter = buatSupabaseAiAdapter();
    service = createServiceClient();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan AI editorial belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY belum diatur).",
      },
      { status: 503 },
    );
  }

  try {
    const { count, error: errCount } = await service
      .from("pf_raw_items")
      .select("id", { count: "exact", head: true })
      .eq("status_verifikasi", "UNCONFIRMED");
    if (errCount) {
      return belumTersedia(
        "Tabel AI editorial belum dibuat (migrasi v4 belum dijalankan).",
      );
    }
    const item = await adapter.ambilAntrean(20);
    const klaim = await adapter.ambilKlaimTanpaVerifikasi(20);
    return NextResponse.json({
      ok: true,
      tersedia: true,
      total_unconfirmed: count ?? 0,
      item,
      klaim_ditampilkan: klaim.length,
      klaim_tanpa_verifikasi: klaim,
    });
  } catch (err) {
    const pesan = err instanceof Error ? err.message : "kesalahan tidak diketahui";
    if (
      pesan.includes("pf_raw_items") ||
      pesan.includes("pf_claims") ||
      pesan.includes("does not exist") ||
      pesan.includes("relation")
    ) {
      return belumTersedia(
        "Tabel AI editorial belum dibuat (migrasi v4 belum dijalankan).",
      );
    }
    return NextResponse.json(
      { ok: false, error: `Gagal membaca antrean AI: ${pesan}` },
      { status: 500 },
    );
  }
}
