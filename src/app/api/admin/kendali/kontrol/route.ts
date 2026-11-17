// POST /api/admin/kendali/kontrol — kontrol antrean job.
// HANYA super_admin. Rate limit 30/menit/IP.
// Body: { job: NamaJob, aksi: "pause" | "resume" | "disable"
//   | "enable" | "reprocess" }.
// pause/disable/resume/enable: ubah flag aktif pf_scheduled_jobs
// (audit 'sistem.job', fail-closed + compensating restore —
// lihat kontrolJob di src/lib/admin/kendali.ts). Idempoten:
// mengulang aksi yang sama mengembalikan keadaan yang sama.
// reprocess: jalankan ulang job lewat pemicuJobManual (sama
// dengan POST /api/admin/kendali/jalankan); untuk digest/
// podcast/riset menjawab 400 jujur — ketiga job itu tidak punya
// backend yang bisa dipicu (lihat ALASAN_TANPA_PEMICU).
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
import { ROLES } from "@/lib/auth/roles";
import { kontrolJob } from "@/lib/admin/kendali";

const lolosRateLimit = buatRateLimiterAdmin();

export async function POST(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const auth = await autentikasiAdmin(req, ROLES.SUPER_ADMIN);
  if (auth instanceof NextResponse) return auth;
  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const job = typeof body.job === "string" ? body.job : "";
  const aksi = typeof body.aksi === "string" ? body.aksi : "";
  if (!job || !aksi) return responBodyTakValid();
  try {
    const origin = new URL(req.url).origin;
    const hasil = await kontrolJob(
      job,
      aksi,
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
          aksi: hasil.aksi,
          error: "Job berjalan tetapi route internal melaporkan kegagalan.",
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
      aksi: hasil.aksi,
      aktif: hasil.aktif,
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
    if (err instanceof Error && err.message.includes("tidak ditemukan")) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 404 },
      );
    }
    return responGalatAdmin(err);
  }
}
