// GET /api/admin/koreksi — daftar laporan koreksi pembaca (staf;
// filter ?status=baru|ditinjau|diperbaiki|ditolak).
// Rate limit 30/menit/IP.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  buatRateLimiterAdmin,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { buatAdminAdapter } from "@/lib/admin/supabase-adapter";
import type { StatusKoreksi } from "@/lib/admin/types";

const lolosRateLimit = buatRateLimiterAdmin();

const STATUS_VALID: StatusKoreksi[] = ["baru", "ditinjau", "diperbaiki", "ditolak"];

export async function GET(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  if (status && !STATUS_VALID.includes(status as StatusKoreksi)) {
    return NextResponse.json(
      { ok: false, error: "Status koreksi tidak valid." },
      { status: 400 },
    );
  }

  try {
    const adapter = buatAdminAdapter();
    const koreksi = await adapter.listKoreksi({
      status: status as StatusKoreksi | undefined,
    });
    return NextResponse.json({ ok: true, koreksi });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
