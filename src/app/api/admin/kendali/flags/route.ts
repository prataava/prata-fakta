// GET / PATCH /api/admin/kendali/flags — feature flags
// (pf_system_settings, migrasi v10 §6). HANYA super_admin.
// Rate limit 30/menit/IP (pola route admin Fase 5).
// GET: daftar flag (nilai bawaan bila baris belum ada).
// PATCH: { kunci, nilai } — kunci harus ada di whitelist
// DAFTAR_FLAG, nilai harus sejenis; dicatat audit 'sistem.flag'.
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
import { ROLES } from "@/lib/auth/roles";
import { getFlagsLayanan, setFlag } from "@/lib/admin/kendali";

const lolosRateLimit = buatRateLimiterAdmin();

export async function GET(req: Request) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.SUPER_ADMIN);
  if (auth instanceof NextResponse) return auth;
  try {
    const { flags, tersedia } = await getFlagsLayanan();
    if (!tersedia) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Tabel pf_system_settings belum dapat dibaca (migrasi v10 belum dijalankan).",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, flags });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function PATCH(req: Request) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.SUPER_ADMIN);
  if (auth instanceof NextResponse) return auth;
  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const kunci = typeof body.kunci === "string" ? body.kunci : "";
  if (!kunci || !("nilai" in body)) return responBodyTakValid();
  try {
    const flag = await setFlag(kunci, body.nilai, {
      id: auth.user.id,
      email: auth.user.email ?? null,
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true, flag });
  } catch (err) {
    if (err instanceof Error && err.message.includes("tidak dikenal")) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 400 },
      );
    }
    if (err instanceof Error && err.message.includes("harus bernilai")) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 400 },
      );
    }
    if (err instanceof Error && err.message.includes("maksimal")) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 400 },
      );
    }
    return responGalatAdmin(err);
  }
}
