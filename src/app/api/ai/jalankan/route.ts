import { NextResponse } from "next/server";
import { buatSupabaseAiAdapter } from "@/lib/ai/supabase-adapter";
import { jalankanPipelineEditorial } from "@/lib/ai/pipeline";
import {
  autentikasiPemicuAi,
  buatRateLimiter,
  ipDariRequest,
  normalisasiDipicuOleh,
  responRateLimit,
} from "@/lib/ai/route-auth";

// POST /api/ai/jalankan — memicu pipeline editorial AI.
// Autentikasi DUA jalur:
//  (a) header x-pf-ai-secret == PF_AI_SECRET (pemicu jadwal);
//  (b) sesi login super_admin/editor.
// Bila PF_AI_SECRET belum diatur DAN tidak ada sesi -> 503 jujur.
// Body opsional: { limit?, hanya_item_id?, dipicu_oleh? }.
// limit dibatasi 1..50 (bawaan 10) — satu run tidak memproses
// seluruh antrean sekaligus.
// Mengembalikan hitungan NYATA pipeline (diproses, draf,
// terverifikasi, cross_checked, developing, unconfirmed, dilewati,
// gagal). Artikel yang dihasilkan SELALU status='draft' — tidak
// pernah auto-terbit.
// Rate limiting: 10 req/menit/IP (pola /api/langganan).
const lolosRateLimit = buatRateLimiter(10);

export async function POST(req: Request) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();

  const auth = await autentikasiPemicuAi(req);
  if (!auth.ok) return auth.respon;

  // --- Body opsional ---
  let body: {
    limit?: unknown;
    hanya_item_id?: unknown;
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
  const limitMentah =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? Math.floor(body.limit)
      : 10;
  const limit = Math.min(50, Math.max(1, limitMentah));
  const hanyaItemId =
    typeof body.hanya_item_id === "string" && body.hanya_item_id.trim()
      ? body.hanya_item_id.trim()
      : undefined;
  const dipicuOleh = normalisasiDipicuOleh(body.dipicu_oleh, auth.dipicuOleh);

  // --- Adapter (butuh SUPABASE_SERVICE_ROLE_KEY) ---
  let adapter: ReturnType<typeof buatSupabaseAiAdapter>;
  try {
    adapter = buatSupabaseAiAdapter();
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
    const hasil = await jalankanPipelineEditorial(adapter, {
      limit,
      hanyaItemId,
      dipicu_oleh: dipicuOleh,
    });
    return NextResponse.json({ ok: true, dipicu_oleh: dipicuOleh, ...hasil });
  } catch (err) {
    const pesan = err instanceof Error ? err.message : "kesalahan tidak diketahui";
    if (
      pesan.includes("pf_raw_items") ||
      pesan.includes("pf_claims") ||
      pesan.includes("pf_ai_runs") ||
      pesan.includes("does not exist") ||
      pesan.includes("relation")
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Tabel AI editorial belum dibuat (migrasi v4 belum dijalankan).",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: `Pipeline editorial gagal: ${pesan}` },
      { status: 500 },
    );
  }
}
