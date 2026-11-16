import { NextResponse } from "next/server";
import { getDaftarCerita } from "@/lib/cerita";
import {
  buatRateLimiter,
  ipDariRequest,
  responRateLimit,
} from "@/lib/ai/route-auth";

// GET /api/cerita → daftar cerita terbit (publik).
// Rate limit 30/menit/IP (pola /api/topik).
const batasi = buatRateLimiter(30);

export async function GET(req: Request) {
  if (!batasi(ipDariRequest(req))) return responRateLimit();
  try {
    const cerita = await getDaftarCerita();
    return NextResponse.json({ ok: true, cerita });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan cerita belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi v10 dijalankan.",
      },
      { status: 503 },
    );
  }
}
