// POST /api/admin/koreksi/[id] — tindak lanjuti laporan koreksi.
// Body {aksi: 'terima'|'tolak', catatan}.
// Terima: laporan 'diperbaiki' + versi baru + artikel CORRECTED +
// verification record CORRECTED agen 'editor'. Tolak: 'ditolak'.
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
import { tindaklanjutiKoreksi } from "@/lib/admin/editorial";
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

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
  const aksi = typeof body.aksi === "string" ? body.aksi : "";
  const catatan = typeof body.catatan === "string" ? body.catatan : "";
  if (aksi !== "terima" && aksi !== "tolak") {
    return NextResponse.json(
      { ok: false, error: "Aksi tidak valid (terima atau tolak)." },
      { status: 400 },
    );
  }
  if (!catatan.trim()) {
    return NextResponse.json(
      { ok: false, error: "Catatan tindak lanjut wajib diisi." },
      { status: 400 },
    );
  }

  try {
    const adapter = buatAdminAdapter();
    const hasil = await tindaklanjutiKoreksi(
      adapter,
      { koreksi_id: id, aksi, catatan },
      { id: auth.user.id, email: auth.user.email ?? null, ip: ipDariRequest(req) },
    );
    return NextResponse.json({ ok: true, ...hasil });
  } catch (err) {
    if (
      err instanceof Error &&
      err.message === "Laporan koreksi tidak ditemukan."
    ) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 404 },
      );
    }
    return responGalatAdmin(err);
  }
}
