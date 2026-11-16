// GET /api/admin/audit — log audit admin (super_admin/editor;
// filter ?aksi=&entitas=&page=&limit=). Rate limit 30/menit/IP.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  buatRateLimiterAdmin,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { buatAdminAdapter } from "@/lib/admin/supabase-adapter";
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

export async function GET(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? "1") || 1;
  const limit = Number(url.searchParams.get("limit") ?? "20") || 20;

  try {
    const adapter = buatAdminAdapter();
    const hasil = await adapter.listAudit({
      aksi: url.searchParams.get("aksi") ?? undefined,
      entitas: url.searchParams.get("entitas") ?? undefined,
      page,
      limit,
    });
    return NextResponse.json({ ok: true, ...hasil });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
