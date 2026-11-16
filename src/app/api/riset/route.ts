// GET /api/riset — daftar laporan riset TERBIT (publik).
// Parameter: q (kata kunci judul/ringkasan), limit (1–100, default 20).
// Draf TIDAK PERNAH dikembalikan (RLS + filter status di lib).
import { NextResponse } from "next/server";
import { getDaftarRiset } from "@/lib/riset";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(100, Math.max(1, Math.trunc(limitRaw)))
    : 20;
  try {
    const riset = await getDaftarRiset(limit, q);
    return NextResponse.json({ ok: true, riset });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Daftar riset belum tersedia." },
      { status: 503 },
    );
  }
}
