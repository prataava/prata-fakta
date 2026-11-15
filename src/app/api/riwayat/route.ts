import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buatRateLimiter,
  ipDariRequest,
  responRateLimit,
} from "@/lib/ai/route-auth";

// Rate limit 30/menit/IP (temuan T3 audit keamanan Fase 7).
const batasi = buatRateLimiter(30);

// POST /api/riwayat — catat riwayat baca (sekali per artikel per 24 jam).
// Body: { artikel_id, durasi_detik? }. Wajib login (401 bila tidak).
// Bila sudah ada baris user+artikel dalam 24 jam terakhir, insert dilewati
// dan { dicatat: false } dikembalikan. 503 jujur bila tabel belum ada.
const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  if (!batasi(ipDariRequest(req))) return responRateLimit();
  const supabase = await createClient();
  let pengguna = null;
  try {
    const { data } = await supabase.auth.getUser();
    pengguna = data.user ?? null;
  } catch {
    pengguna = null;
  }
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu." },
      { status: 401 },
    );
  }

  let body: { artikel_id?: unknown; durasi_detik?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Permintaan tidak valid." },
      { status: 400 },
    );
  }

  const artikelId =
    typeof body.artikel_id === "string" ? body.artikel_id : "";
  if (!POLA_UUID.test(artikelId)) {
    return NextResponse.json(
      { ok: false, error: "artikel_id tidak valid." },
      { status: 400 },
    );
  }
  const durasi =
    typeof body.durasi_detik === "number" &&
    Number.isFinite(body.durasi_detik) &&
    body.durasi_detik >= 0
      ? Math.floor(body.durasi_detik)
      : 0;

  const batas24Jam = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: sudahAda, error: errCek } = await supabase
    .from("pf_reading_history")
    .select("dibaca_pada")
    .eq("user_id", pengguna.id)
    .eq("artikel_id", artikelId)
    .gte("dibaca_pada", batas24Jam)
    .limit(1);
  if (errCek) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan riwayat baca belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi Fase 2 dijalankan.",
      },
      { status: 503 },
    );
  }
  if (sudahAda && sudahAda.length > 0) {
    return NextResponse.json({ ok: true, dicatat: false });
  }

  const { error } = await supabase.from("pf_reading_history").insert({
    user_id: pengguna.id,
    artikel_id: artikelId,
    durasi_detik: durasi,
    selesai: false,
  });
  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan riwayat baca belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi Fase 2 dijalankan.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, dicatat: true });
}
