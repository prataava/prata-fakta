// GET /api/admin/akademi/esai — daftar esai menunggu penilaian manual.
// Staf saja (editor/fact_checker/super_admin). 503 jujur bila tabel
// jawaban (v14) belum ada.
import { NextResponse } from "next/server";
import { autentikasiAdmin, buatRateLimiterAdmin } from "@/lib/admin/guard";
import { ROLES } from "@/lib/auth/roles";
import { daftarEsaiMenunggu } from "@/lib/akademi/esai";

const lolosRateLimit = buatRateLimiterAdmin();

export async function GET(req: Request) {
  if (!(await lolosRateLimit(req))) {
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak permintaan. Coba lagi." },
      { status: 429 },
    );
  }
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.FACT_CHECKER);
  if (auth instanceof NextResponse) return auth;

  const hasil = await daftarEsaiMenunggu();
  if (!hasil.ok) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Daftar esai belum tersedia (tabel jawaban belum dibuat — jalankan migrasi v14).",
      },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, esai: hasil.esai ?? [] });
}
