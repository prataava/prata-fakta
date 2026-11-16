// GET /api/admin/kendali/ekspor-audit — unduh audit log nyata
// sebagai CSV. HANYA super_admin. Rate limit 30/menit/IP.
// Query opsional: ?limit= (1..1000, bawaan 200).
// Kolom: id,aktor_email,aksi,entitas,entitas_id,dibuat_pada.
// Nama berkas memakai tanggal hari ini (WIB) — bukan data isi.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  buatRateLimiterAdmin,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { ROLES } from "@/lib/auth/roles";
import { eksporAuditCsv } from "@/lib/admin/kendali";

const lolosRateLimit = buatRateLimiterAdmin();

export async function GET(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.SUPER_ADMIN);
  if (auth instanceof NextResponse) return auth;
  try {
    const url = new URL(req.url);
    const mentah = Number(url.searchParams.get("limit") ?? "200");
    const limit = Number.isFinite(mentah)
      ? Math.min(1000, Math.max(1, Math.floor(mentah)))
      : 200;
    const csv = await eksporAuditCsv(limit);
    const tanggal = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pf-audit-log-${tanggal}.csv"`,
      },
    });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
