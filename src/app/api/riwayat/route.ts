import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buatRateLimiter,
  cekOrigin,
  responRateLimit,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";

// Rate limit 30/menit/IP (temuan T3 audit keamanan Fase 7).
const batasi = buatRateLimiter(30);

// POST /api/riwayat — catat riwayat baca (sekali per artikel per 24 jam).
// Body: { artikel_id, durasi_detik?, selesai? }. Wajib login (401 bila tidak).
// Bila sudah ada baris user+artikel dalam 24 jam terakhir, baris itu
// DIUPDATE (durasi = terbesar, selesai = lama OR baru) dan
// { dicatat: false, diperbarui: true } dikembalikan. Bila belum ada,
// insert seperti semula (selesai dari body, default false).
// 503 jujur bila tabel belum ada.
const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
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
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(supabase, pengguna.id);
  if (ditolak) return ditolak;

  let body: {
    artikel_id?: unknown;
    durasi_detik?: unknown;
    selesai?: unknown;
  };
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
  // selesai dibaca dari body (boolean); bila bukan boolean, default false.
  // Bukan hardcode: nilai ini dipakai saat insert DAN saat update (OR).
  const selesaiBaru = body.selesai === true;

  const batas24Jam = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: sudahAda, error: errCek } = await supabase
    .from("pf_reading_history")
    .select("id, durasi_detik, selesai, dibaca_pada")
    .eq("user_id", pengguna.id)
    .eq("artikel_id", artikelId)
    .gte("dibaca_pada", batas24Jam)
    .order("dibaca_pada", { ascending: false })
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
    // P0-E: baris 24 jam terakhir sudah ada → UPDATE di tempat
    // (durasi terbesar, selesai = lama OR baru), bukan insert baru.
    // Satu baris per user+artikel per 24 jam tetap terjaga.
    const lama = sudahAda[0] as {
      id: string;
      durasi_detik: number | null;
      selesai: boolean | null;
    };
    const { error: errUpdate } = await supabase
      .from("pf_reading_history")
      .update({
        durasi_detik: Math.max(lama.durasi_detik ?? 0, durasi),
        selesai: Boolean(lama.selesai) || selesaiBaru,
      })
      .eq("id", lama.id)
      .eq("user_id", pengguna.id);
    if (errUpdate) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Layanan riwayat baca belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi Fase 2 dijalankan.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, dicatat: false, diperbarui: true });
  }

  const { error } = await supabase.from("pf_reading_history").insert({
    user_id: pengguna.id,
    artikel_id: artikelId,
    durasi_detik: durasi,
    selesai: selesaiBaru,
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

// GET /api/riwayat?artikel_id=<uuid> — status baca artikel ini untuk
// pengguna yang login (dipakai PembacaArtikel untuk lencana
// "Sudah dibaca"). 401 bila tidak login; 400 bila artikel_id tak valid;
// 503 jujur bila tabel belum ada.
export async function GET(req: Request) {
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
  const artikelId =
    new URL(req.url).searchParams.get("artikel_id") ?? "";
  if (!POLA_UUID.test(artikelId)) {
    return NextResponse.json(
      { ok: false, error: "artikel_id tidak valid." },
      { status: 400 },
    );
  }
  const batas24Jam = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("pf_reading_history")
    .select("durasi_detik, selesai")
    .eq("user_id", pengguna.id)
    .eq("artikel_id", artikelId)
    .gte("dibaca_pada", batas24Jam)
    .order("dibaca_pada", { ascending: false })
    .limit(1);
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
  const baris = data?.[0] as
    | { durasi_detik: number | null; selesai: boolean | null }
    | undefined;
  return NextResponse.json({
    ok: true,
    ada: Boolean(baris),
    selesai: Boolean(baris?.selesai),
    durasi_detik: baris?.durasi_detik ?? 0,
  });
}
