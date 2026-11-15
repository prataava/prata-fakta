// GET /api/admin/sistem — job terjadwal + kategori (staf).
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
    const [jobs, kategori] = await Promise.all([
      adapter.listJobs(),
      adapter.listKategori(),
    ]);
    return NextResponse.json({ ok: true, jobs, kategori });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
