// POST /api/admin/artikel/[id]/review — putuskan review editorial.
// Body {keputusan: 'setuju'|'tolak'|'kembalikan', catatan}.
// Catatan wajib non-kosong; artikel harus draft/terjadwal.
// Editor/fact_checker/super_admin. Rate limit 30/menit/IP.
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
import { putuskanReview } from "@/lib/admin/editorial";
import { ROLES } from "@/lib/auth/roles";
import type { KeputusanReview } from "@/lib/admin/types";

const lolosRateLimit = buatRateLimiterAdmin();

const KEPUTUSAN_VALID: KeputusanReview[] = ["setuju", "tolak", "kembalikan"];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.FACT_CHECKER);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const keputusan =
    typeof body.keputusan === "string" ? body.keputusan : "";
  const catatan = typeof body.catatan === "string" ? body.catatan : "";
  if (!KEPUTUSAN_VALID.includes(keputusan as KeputusanReview)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Keputusan tidak valid (setuju, tolak, atau kembalikan).",
      },
      { status: 400 },
    );
  }
  if (!catatan.trim()) {
    return NextResponse.json(
      { ok: false, error: "Catatan review wajib diisi." },
      { status: 400 },
    );
  }

  try {
    const adapter = buatAdminAdapter();
    const hasil = await putuskanReview(
      adapter,
      {
        artikel_id: id,
        keputusan: keputusan as KeputusanReview,
        catatan,
        reviewer_id: auth.user.id,
      },
      { id: auth.user.id, email: auth.user.email ?? null, ip: ipDariRequest(req) },
    );
    return NextResponse.json({ ok: true, ...hasil });
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
