// POST /api/admin/artikel/[id]/jadwalkan — jadwalkan artikel
// (status='terjadwal', dijadwalkan_pada). Body {dijadwalkan_pada}.
// Editor/super_admin. Rate limit 30/menit/IP.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  bacaBody,
  buatRateLimiterAdmin,
  ipDariRequest,
  responBodyTakValid,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { buatAdminAdapter } from "@/lib/admin/supabase-adapter";
import { jadwalkanArtikel } from "@/lib/admin/editorial";
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

  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const dijadwalkanPada =
    typeof body.dijadwalkan_pada === "string" ? body.dijadwalkan_pada : "";
  if (!dijadwalkanPada) {
    return NextResponse.json(
      { ok: false, error: "dijadwalkan_pada wajib diisi." },
      { status: 400 },
    );
  }

  try {
    const adapter = buatAdminAdapter();
    const artikel = await jadwalkanArtikel(adapter, id, dijadwalkanPada, {
      id: auth.user.id,
      email: auth.user.email ?? null,
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true, artikel });
  } catch (err) {
    if (err instanceof Error && err.message === "Artikel tidak ditemukan.") {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 404 },
      );
    }
    return responGalatAdmin(err);
  }
}
