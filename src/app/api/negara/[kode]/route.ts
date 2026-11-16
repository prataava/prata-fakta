// GET /api/negara/[kode] — profil lengkap satu negara (publik):
// identitas + fakta + berita terbit + event + indikator.
// 404 bila kode tak ada. Angka tanpa sumber TIDAK tampil
// sebagai angka (lihat lib/negara.ts: angkaTersedia +
// pisahkanFakta).
import { NextResponse } from "next/server";
import { getNegara, normalisasiKode } from "@/lib/negara";
import {
  buatRateLimiter,
  responRateLimit,
} from "@/lib/ai/route-auth";

const batasi = buatRateLimiter(30);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ kode: string }> },
) {
  if (!(await batasi(req))) return responRateLimit();
  const { kode } = await params;
  const profil = await getNegara(normalisasiKode(kode));
  if (!profil) {
    return NextResponse.json(
      { ok: false, error: "Negara tidak ditemukan." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, profil });
}
