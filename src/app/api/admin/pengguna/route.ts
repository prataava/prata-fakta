// GET /api/admin/pengguna — daftar pengguna + peran + status nonaktif.
// Super_admin SAJA. Rate limit 30/menit/IP.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  buatRateLimiterAdmin,
  ipDariRequest,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { buatAdminAdapter } from "@/lib/admin/supabase-adapter";
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

export async function GET(req: Request) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.SUPER_ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const adapter = buatAdminAdapter();
    const pengguna = await adapter.listPengguna();
    return NextResponse.json({ ok: true, pengguna });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
