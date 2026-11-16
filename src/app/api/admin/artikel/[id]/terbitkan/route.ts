// POST /api/admin/artikel/[id]/terbitkan — terbitkan artikel
// (editor/super_admin). Gate verifikasi ditegakkan editorial.ts:
// gagal gate -> 409 {ok:false, error, alasan}. Rate limit 30/menit/IP.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  buatRateLimiterAdmin,
  ipDariRequest,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { buatAdminAdapter } from "@/lib/admin/supabase-adapter";
import { GalatGateTerbit, terbitkanArtikel } from "@/lib/admin/editorial";
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    const adapter = buatAdminAdapter();
    const artikel = await terbitkanArtikel(adapter, id, {
      id: auth.user.id,
      email: auth.user.email ?? null,
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true, artikel });
  } catch (err) {
    if (err instanceof GalatGateTerbit) {
      return NextResponse.json(
        { ok: false, error: err.message, alasan: err.alasan },
        { status: 409 },
      );
    }
    if (err instanceof Error && err.message === "Artikel tidak ditemukan.") {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 404 },
      );
    }
    return responGalatAdmin(err);
  }
}
