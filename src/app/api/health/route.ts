// GET /api/health — status kesehatan sistem (publik, tanpa data
// sensitif). Dipakai monitoring, halaman /admin/sistem, dan
// smoke test Fase 7. TIDAK butuh login. Rate limit ringan
// (60/menit/IP) agar tidak disalahgunakan sebagai pemindai.
// Jawaban:
//   { ok, status: "ok" | "degraded", db, latensi_ms, waktu, versi, detail }
import { NextResponse } from "next/server";
import { periksaKesehatan } from "@/lib/kesehatan";
import {
  buatRateLimiter,
  ipDariRequest,
  responRateLimit,
} from "@/lib/ai/route-auth";

const batasi = buatRateLimiter(60);

export async function GET(req: Request) {
  const ip = ipDariRequest(req);
  if (!batasi(ip)) return responRateLimit();

  const hasil = await periksaKesehatan();
  const ok = hasil.db === "ok";
  return NextResponse.json(
    {
      ok,
      status: ok ? "ok" : "degraded",
      db: hasil.db,
      latensi_ms: hasil.latensiMs,
      waktu: hasil.waktu,
      versi: "prata-fakta fase-7",
      detail: hasil.detail,
    },
    { status: 200 },
  );
}
