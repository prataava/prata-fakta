// POST /api/admin/koreksi/[id] — tindak lanjuti laporan koreksi.
// Body {aksi: 'terima'|'tolak'|'ditinjau', catatan}.
// Terima (dengan artikel): laporan 'diperbaiki' + versi baru +
// artikel CORRECTED + verification record CORRECTED agen 'editor'.
// Terima (tanpa artikel_id): laporan umum diterima untuk ditinjau
// redaksi — status 'ditinjau', tanpa artikel yang dikoreksi.
// 'ditinjau': tandai laporan baru sedang ditinjau (status 'ditinjau').
// Tolak: 'ditolak'. Terima/tolak diizinkan dari 'baru' maupun 'ditinjau'.
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
  if (aksi !== "terima" && aksi !== "tolak" && aksi !== "ditinjau") {
    return NextResponse.json(
      { ok: false, error: "Aksi tidak valid (terima, tolak, atau ditinjau)." },
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
