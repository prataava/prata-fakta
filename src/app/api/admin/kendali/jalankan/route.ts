// POST /api/admin/kendali/jalankan — pemicu manual job terjadwal.
// HANYA super_admin. Rate limit 30/menit/IP.
// Body: { job: "ingestion" | "editorial" | "brief" |
//   "data-analysis" | "terbitkan-terjadwal" | "digest" | "podcast"
//   | "riset" }.
// Job dipicu dengan memanggil route internal yang sama dengan
// workflow GitHub Actions (cookie sesi diteruskan) — logika
// ingestion/AI TIDAK diduplikasi di sini. digest/podcast/riset
// belum punya endpoint pemicu (temuan F7) -> 400 jujur.
// Sesudah pemicu, baris pf_scheduled_jobs diperbarui bila ada
// (F6 — hanya pemicu manual yang memperbarui terakhir_jalan)
// dan dicatat audit 'sistem.job'.
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
import { pemicuJobManual } from "@/lib/admin/kendali";

const lolosRateLimit = buatRateLimiterAdmin();

export async function POST(req: Request) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.SUPER_ADMIN);
  if (auth instanceof NextResponse) return auth;
  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const job = typeof body.job === "string" ? body.job : "";
  if (!job) return responBodyTakValid();
  try {
    const origin = new URL(req.url).origin;
    const hasil = await pemicuJobManual(
      job,
      {
        id: auth.user.id,
        email: auth.user.email ?? null,
        ip: ipDariRequest(req),
      },
      origin,
      req.headers.get("cookie"),
    );
    if (!hasil.ok) {
      return NextResponse.json(
        {
          ok: false,
          job: hasil.job,
          error:
            "Job berjalan tetapi route internal melaporkan kegagalan.",
          hasil: hasil.hasil,
          baris_job_diperbarui: hasil.baris_job_diperbarui,
          catatan: hasil.catatan,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      job: hasil.job,
      hasil: hasil.hasil,
      baris_job_diperbarui: hasil.baris_job_diperbarui,
      catatan: hasil.catatan,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("belum bisa dipicu")) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 400 },
      );
    }
    if (err instanceof Error && err.message.includes("tidak dikenal")) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 400 },
      );
    }
    return responGalatAdmin(err);
  }
}
