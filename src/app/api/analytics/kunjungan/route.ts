import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cobaServiceClient } from "@/lib/supabase/service";
import { buatRateLimiter, responRateLimit } from "@/lib/ai/route-auth";
import {
  catatKunjungan,
  normalisasiPath,
} from "@/lib/analytics/kunjungan";
import { catatGalatAplikasi } from "@/lib/analytics/galat";

// POST /api/analytics/kunjungan { path } → catat satu kunjungan
// halaman ke pf_kunjungan (Traffic Analytics dari DB sendiri, D1).
// Login OPSIONAL: pengunjung anonim tercatat dengan user_id null.
// PRIVASI: hanya pathname yang disimpan (tanpa query string /
// hash / IP / user-agent) — lihat lib/analytics/kunjungan.ts.
// Rate limit 120/menit/IP (fail-open seperti limiter baca lain;
// endpoint ini hanya menulis baris anonim, bukan data sensitif).
// 503 jujur bila kunci service / tabel v14 belum tersedia.
const batasi = buatRateLimiter(120);

export async function POST(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const path = normalisasiPath(
    (body as { path?: unknown } | null)?.path,
  );
  if (!path) {
    return NextResponse.json(
      { ok: false, error: "Path tidak valid (harus diawali /)." },
      { status: 400 },
    );
  }
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }
  const service = cobaServiceClient();
  if (!service) {
    return NextResponse.json(
      { ok: false, error: "Layanan analitik belum siap." },
      { status: 503 },
    );
  }
  const ok = await catatKunjungan(service, { path, userId });
  if (!ok) {
    await catatGalatAplikasi({
      sumber: "api/analytics/kunjungan",
      pesan: "Gagal mencatat kunjungan (tulis pf_kunjungan gagal).",
      rute: path,
    });
    return NextResponse.json(
      { ok: false, error: "Gagal mencatat kunjungan." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
