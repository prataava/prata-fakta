// PATCH /api/admin/pengguna/[id] — ubah peran dan/atau status nonaktif
// pengguna. Body {roles?: string[], nonaktif?: boolean} — keduanya
// boleh sendiri-sendiri. Super_admin SAJA. Setiap perubahan diaudit
// dengan sebelum/sesudah. Rate limit 30/menit/IP.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  bacaBody,
  buatRateLimiterAdmin,
  cekOrigin,
  ipDariRequest,
  responBodyTakValid,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { buatAdminAdapter } from "@/lib/admin/supabase-adapter";
import { aturPeranPengguna, setNonaktifPengguna } from "@/lib/admin/editorial";
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const auth = await autentikasiAdmin(req, ROLES.SUPER_ADMIN);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const punyaRoles = "roles" in body;
  const punyaNonaktif = "nonaktif" in body;
  if (!punyaRoles && !punyaNonaktif) {
    return NextResponse.json(
      { ok: false, error: "Berikan roles dan/atau nonaktif." },
      { status: 400 },
    );
  }
  let roles: string[] | undefined;
  if (punyaRoles) {
    if (
      !Array.isArray(body.roles) ||
      body.roles.some((r) => typeof r !== "string")
    ) {
      return NextResponse.json(
        { ok: false, error: "roles harus array string." },
        { status: 400 },
      );
    }
    roles = body.roles as string[];
  }
  let nonaktif: boolean | undefined;
  if (punyaNonaktif) {
    if (typeof body.nonaktif !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "nonaktif harus boolean." },
        { status: 400 },
      );
    }
    nonaktif = body.nonaktif;
  }

  try {
    const adapter = buatAdminAdapter();
    const aktor = {
      id: auth.user.id,
      email: auth.user.email ?? null,
      ip: ipDariRequest(req),
    };
    const hasil: { roles?: string[]; nonaktif?: boolean } = {};
    if (roles !== undefined) {
      hasil.roles = (
        await aturPeranPengguna(adapter, { user_id: id, roles }, aktor)
      ).roles;
    }
    if (nonaktif !== undefined) {
      hasil.nonaktif = (
        await setNonaktifPengguna(adapter, { user_id: id, nonaktif }, aktor)
      ).nonaktif;
    }
    const pengguna = await adapter.getPengguna({ id });
    return NextResponse.json({ ok: true, ...hasil, pengguna });
  } catch (err) {
    if (err instanceof Error && err.message === "Pengguna tidak ditemukan.") {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 404 },
      );
    }
    return responGalatAdmin(err);
  }
}
