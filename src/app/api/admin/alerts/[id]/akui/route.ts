// POST /api/admin/alerts/[id]/akui — akui satu alert aktif.
// Staf admin (super_admin / editor / fact_checker / writer).
// Rate limit 30/menit/IP. Tanpa body.
// Mengubah status pf_alerts 'aktif' -> 'diakui' + mencatat
// diakui_oleh/di akui_pada di barisnya. TIDAK menulis
// pf_audit_logs: tidak ada aksi 'sistem.alert' di CHECK v15 —
// aksi audit baru butuh migrasi CHECK (persetujuan pemilik).
// Alert yang sudah diakui/selesai -> 404 jujur.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  buatRateLimiterAdmin,
  cekOrigin,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { createServiceClient } from "@/lib/supabase/service";
import { ROLES } from "@/lib/auth/roles";
import { akuiAlert } from "@/lib/admin/alerts";

const lolosRateLimit = buatRateLimiterAdmin();

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  // Peran dieja eksplisit (bukan autentikasiAdmin(req) polos):
  // sama persis dengan default PERAN_STAF di guard.ts
  // (EDITOR/FACT_CHECKER/WRITER; super_admin lolos via
  // punyaRole) — dan dikenali pemeriksa F12 uji-integrasi14
  // yang menuntut peran eksplisit pada handler mutasi.
  const auth = await autentikasiAdmin(
    req,
    ROLES.EDITOR,
    ROLES.FACT_CHECKER,
    ROLES.WRITER,
  );
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "ID alert wajib diisi." },
      { status: 400 },
    );
  }
  try {
    const service = createServiceClient();
    const hasil = await akuiAlert(id, auth.user.id, service);
    return NextResponse.json({
      ok: true,
      id: hasil.id,
      kejadian: hasil.kejadian,
      pesan: "Alert diakui.",
    });
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("tidak ditemukan atau sudah tidak aktif")
    ) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 404 },
      );
    }
    return responGalatAdmin(err);
  }
}
