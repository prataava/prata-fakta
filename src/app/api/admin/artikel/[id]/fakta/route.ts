// /api/admin/artikel/[id]/fakta
// GET — verifikasi terakhir artikel (staf).
// POST — ubah status verifikasi (fact_checker/editor/super_admin).
// Body {keputusan: VERIFIED|CROSS-CHECKED|DEVELOPING|UNCONFIRMED|
// DISPUTED|CORRECTED, catatan}. Mencatat verification record
// agen='fact_checker' + update pf_articles.status_verifikasi + audit.
// Rate limit 30/menit/IP.
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
import { ubahStatusVerifikasi } from "@/lib/admin/editorial";
import { ROLES } from "@/lib/auth/roles";
import { STATUS_VERIFIKASI_VALID, type StatusVerifikasi } from "@/lib/admin/types";

const lolosRateLimit = buatRateLimiterAdmin();

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    const adapter = buatAdminAdapter();
    const artikel = await adapter.getArtikel({ id });
    if (!artikel) {
      return NextResponse.json(
        { ok: false, error: "Artikel tidak ditemukan." },
        { status: 404 },
      );
    }
    const verifikasi_terakhir = await adapter.getVerifikasiTerakhir({
      artikel_id: id,
    });
    return NextResponse.json({ ok: true, verifikasi_terakhir });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function POST(req: Request, { params }: Params) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.FACT_CHECKER, ROLES.EDITOR);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const keputusan =
    typeof body.keputusan === "string" ? body.keputusan : "";
  const catatan = typeof body.catatan === "string" ? body.catatan : "";
  if (!STATUS_VERIFIKASI_VALID.includes(keputusan as StatusVerifikasi)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Keputusan tidak valid (VERIFIED, CROSS-CHECKED, DEVELOPING, UNCONFIRMED, DISPUTED, atau CORRECTED).",
      },
      { status: 400 },
    );
  }
  if (!catatan.trim()) {
    return NextResponse.json(
      { ok: false, error: "Catatan verifikasi wajib diisi." },
      { status: 400 },
    );
  }

  try {
    const adapter = buatAdminAdapter();
    const artikel = await ubahStatusVerifikasi(
      adapter,
      {
        artikel_id: id,
        keputusan: keputusan as StatusVerifikasi,
        catatan,
      },
      { id: auth.user.id, email: auth.user.email ?? null, ip: ipDariRequest(req) },
    );
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
