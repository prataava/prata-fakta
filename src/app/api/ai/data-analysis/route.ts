import { NextResponse } from "next/server";
import { buatSupabaseAiAdapter } from "@/lib/ai/supabase-adapter";
import { jalankanDataAnalysis } from "@/lib/ai/data-analysis";
import {
  autentikasiPemicuAi,
  buatRateLimiter,
  ipDariRequest,
  normalisasiDipicuOleh,
  responRateLimit,
} from "@/lib/ai/route-auth";

// POST /api/ai/data-analysis — memicu agen Data Analysis (ke-10).
// Autentikasi DUA jalur (pola /api/ai/jalankan):
//   (a) header x-pf-ai-secret == PF_AI_SECRET (pemicu jadwal);
//   (b) sesi login super_admin/editor.
// Bila PF_AI_SECRET belum diatur DAN tidak ada sesi -> 503 jujur.
// Agen DETERMINISTIK: menghitung tren dari pf_data_points nyata dan
// menulis ringkasan_tren ke pf_data_indicators; tanpa LLM, tanpa
// karangan. Indikator dengan < 2 titik data dilewati dengan alasan.
// Mengembalikan { dipicu_oleh, diproses, berhasil, dilewati, gagal }.
// Rate limiting: 30 req/menit/IP.
const lolosRateLimit = buatRateLimiter(30);

export async function POST(req: Request) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();

  const auth = await autentikasiPemicuAi(req);
  if (!auth.ok) return auth.respon;

  let body: { dipicu_oleh?: unknown } = {};
  try {
    const teks = await req.text();
    if (teks.trim()) body = JSON.parse(teks) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const dipicuOleh = normalisasiDipicuOleh(body.dipicu_oleh, auth.dipicuOleh);

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
    const hasil = await jalankanDataAnalysis(adapter, {
      dipicu_oleh: dipicuOleh,
    });
    return NextResponse.json({ ok: true, dipicu_oleh: dipicuOleh, ...hasil });
  } catch (err) {
    const pesan =
      err instanceof Error ? err.message : "kesalahan tidak diketahui";
    if (
      pesan.includes("pf_data_indicators") ||
      pesan.includes("pf_data_points") ||
      pesan.includes("pf_ai_runs") ||
      pesan.includes("SUPABASE_SERVICE_ROLE_KEY") ||
      pesan.includes("does not exist") ||
      pesan.includes("relation")
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Tabel Data Analysis belum dibuat (migrasi v6 belum dijalankan) atau service key belum diatur.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: `Data Analysis gagal: ${pesan}` },
      { status: 500 },
    );
  }
}
