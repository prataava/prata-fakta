// /api/admin/sistem/jobs/[nama]
// PATCH — ubah jadwal_cron dan/atau aktif job (editor/super_admin).
// POST {aksi:'jalankan_ulang'} — picu ulang job terkait lewat endpoint
//   internalnya (editor/super_admin). Sesudah fetch, perbarui
//   pf_scheduled_jobs (terakhir_jalan, status_terakhir, error_terakhir)
//   dan kembalikan hasil downstream. Bila secret belum diatur -> 503.
// Rate limit 30/menit/IP.
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
import { buatAdminAdapter } from "@/lib/admin/supabase-adapter";
import { perbaruiJob } from "@/lib/admin/editorial";
import { ROLES } from "@/lib/auth/roles";
import {
  NAMA_JOB_VALID,
  type JobPatch,
  type NamaJob,
} from "@/lib/admin/types";

const lolosRateLimit = buatRateLimiterAdmin();

type Params = { params: Promise<{ nama: string }> };

/** Pemetaan job -> endpoint internal + secret pemicunya. */
const TUJUAN_JOB: Record<
  NamaJob,
  { path: string; envSecret: string; headerSecret: string; body: string }
> = {
  ingestion: {
    path: "/api/ingestion/jalankan",
    envSecret: "PF_INGESTION_SECRET",
    headerSecret: "x-pf-ingestion-secret",
    body: JSON.stringify({ dipicu_oleh: "manual" }),
  },
  editorial: {
    path: "/api/ai/jalankan",
    envSecret: "PF_AI_SECRET",
    headerSecret: "x-pf-ai-secret",
    body: JSON.stringify({ dipicu_oleh: "manual", limit: 10 }),
  },
  brief: {
    path: "/api/ai/brief",
    envSecret: "PF_AI_SECRET",
    headerSecret: "x-pf-ai-secret",
    body: JSON.stringify({ dipicu_oleh: "manual" }),
  },
  // Tahap 13C (F7): data-analysis + terbitkan-terjadwal kini bisa
  // dipicu ulang dari sini, sama seperti dari /admin/kendali.
  // digest/podcast/riset tetap tidak ada di sini — belum punya
  // endpoint pemicu (400 jujur di /api/admin/kendali/jalankan).
  "data-analysis": {
    path: "/api/ai/data-analysis",
    envSecret: "PF_AI_SECRET",
    headerSecret: "x-pf-ai-secret",
    body: JSON.stringify({ dipicu_oleh: "manual" }),
  },
  "terbitkan-terjadwal": {
    path: "/api/admin/artikel/terbitkan-terjadwal",
    envSecret: "PF_AI_SECRET",
    headerSecret: "x-pf-ai-secret",
    body: JSON.stringify({ dipicu_oleh: "manual" }),
  },
};

function namaValid(nama: string): nama is NamaJob {
  return (NAMA_JOB_VALID as string[]).includes(nama);
}

export async function PATCH(req: Request, { params }: Params) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const auth = await autentikasiAdmin(req, ROLES.EDITOR);
  if (auth instanceof NextResponse) return auth;
  const { nama } = await params;
  if (!namaValid(nama)) {
    return NextResponse.json(
      { ok: false, error: `Job '${nama}' tidak dikenal.` },
      { status: 404 },
    );
  }

  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const patch: JobPatch = {};
  if ("jadwal_cron" in body) {
    if (typeof body.jadwal_cron !== "string") {
      return NextResponse.json(
        { ok: false, error: "jadwal_cron harus string." },
        { status: 400 },
      );
    }
    patch.jadwal_cron = body.jadwal_cron;
  }
  if ("aktif" in body) {
    if (typeof body.aktif !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "aktif harus boolean." },
        { status: 400 },
      );
    }
    patch.aktif = body.aktif;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { ok: false, error: "Tidak ada perubahan yang diberikan." },
      { status: 400 },
    );
  }

  try {
    const adapter = buatAdminAdapter();
    const hasil = await perbaruiJob(adapter, { nama, patch }, {
      id: auth.user.id,
      email: auth.user.email ?? null,
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true, job: hasil });
  } catch (err) {
    if (err instanceof Error && err.message.includes("tidak ditemukan")) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 404 },
      );
    }
    return responGalatAdmin(err);
  }
}

export async function POST(req: Request, { params }: Params) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const auth = await autentikasiAdmin(req, ROLES.EDITOR);
  if (auth instanceof NextResponse) return auth;
  const { nama } = await params;
  if (!namaValid(nama)) {
    return NextResponse.json(
      { ok: false, error: `Job '${nama}' tidak dikenal.` },
      { status: 404 },
    );
  }

  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  if (body.aksi !== "jalankan_ulang") {
    return NextResponse.json(
      { ok: false, error: "Aksi tidak valid (jalankan_ulang)." },
      { status: 400 },
    );
  }

  const tujuan = TUJUAN_JOB[nama];
  // Penjaga integrasi Global News 24/7 (17 Nov 2026, temuan
  // Worker G): job dikenal (DAFTAR_JOB_DIKENAL, 8 nama) tapi
  // belum punya endpoint pemicu — digest/podcast/riset. Bila
  // NAMA_JOB_VALID kelak diperluas ke nama-nama itu tanpa
  // menambah TUJUAN_JOB, akses tujuan.envSecret di bawah akan
  // melempar TypeError -> 500. Tolak jujur 400 di sini (pola
  // yang sama seperti pemicuJobManual di lib/admin/kendali.ts).
  if (!tujuan) {
    return NextResponse.json(
      {
        ok: false,
        error:
          `Job '${nama}' belum bisa dipicu ulang — belum ada endpoint pemicu untuk job ini.`,
      },
      { status: 400 },
    );
  }
  const secret = process.env[tujuan.envSecret];
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error: `Layanan job '${nama}' belum dikonfigurasi (secret ${tujuan.envSecret} belum diatur).`,
      },
      { status: 503 },
    );
  }

  const asal = new URL(req.url).origin;
  let hasilDownstream: unknown = null;
  let berhasil = false;
  let pesanGalat: string | null = null;
  try {
    const respon = await fetch(`${asal}${tujuan.path}`, {
      method: "POST",
      headers: {
        [tujuan.headerSecret]: secret,
        "Content-Type": "application/json",
      },
      body: tujuan.body,
      signal: AbortSignal.timeout(120_000),
    });
    try {
      hasilDownstream = await respon.json();
    } catch {
      hasilDownstream = null;
    }
    berhasil = respon.ok;
    if (!respon.ok) {
      pesanGalat =
        (hasilDownstream as { error?: unknown } | null)?.error != null
          ? String((hasilDownstream as { error: unknown }).error)
          : `Endpoint ${tujuan.path} menjawab HTTP ${respon.status}.`;
    }
  } catch (err) {
    pesanGalat =
      err instanceof Error
        ? `Gagal menghubungi ${tujuan.path}: ${err.message}`
        : `Gagal menghubungi ${tujuan.path}.`;
  }

  try {
    const adapter = buatAdminAdapter();
    const job = await adapter.perbaruiJob({
      nama,
      patch: {
        terakhir_jalan: new Date().toISOString(),
        status_terakhir: berhasil ? "berhasil" : "gagal",
        error_terakhir: pesanGalat,
      },
    });
    return NextResponse.json({
      ok: berhasil,
      job,
      hasil: hasilDownstream,
      ...(pesanGalat ? { error: pesanGalat } : {}),
    });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
