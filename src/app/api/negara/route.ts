// GET /api/negara — daftar profil negara (publik).
// Rate limit 30/menit/IP (pola /api/topik). [] bila tabel
// pf_countries belum ada (migrasi v10 belum dijalankan) —
// pemanggil menampilkan empty state jujur.
import { NextResponse } from "next/server";
import { getDaftarNegara } from "@/lib/negara";
import {
  buatRateLimiter,
  responRateLimit,
} from "@/lib/ai/route-auth";

const batasi = buatRateLimiter(30);

export async function GET(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  const negara = await getDaftarNegara();
  return NextResponse.json({ ok: true, negara });
}
