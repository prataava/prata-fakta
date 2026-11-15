// GET /api/admin/brief — daftar brief harian (staf; 60 terbaru).
// Rate limit 30/menit/IP.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  buatRateLimiterAdmin,
  ipDariRequest,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { buatAdminAdapter } from "@/lib/admin/supabase-adapter";

const lolosRateLimit = buatRateLimiterAdmin();

export async function GET(req: Request) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const adapter = buatAdminAdapter();
    const brief = await adapter.listBrief();
    return NextResponse.json({ ok: true, brief });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
