// GET /api/admin/tanya — antrean pertanyaan (staf).
// Mencakup status 'menunggu' DAN 'tidak_ada_data' (keduanya
// menunggu jawaban/keputusan editor); filter ?status=menunggu |
// tidak_ada_data | terjawab | semua. Tulis/ubah lewat service
// role — tidak ada policy tulis pengguna di pf_questions.
// Rate limit 30/menit/IP.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  buatRateLimiterAdmin,
  ipDariRequest,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { createServiceClient } from "@/lib/supabase/service";

const lolosRateLimit = buatRateLimiterAdmin();

const STATUS_VALID = ["menunggu", "tidak_ada_data", "terjawab"] as const;

export async function GET(req: Request) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") ?? "semua";
  if (
    statusParam !== "semua" &&
    !(STATUS_VALID as readonly string[]).includes(statusParam)
  ) {
    return NextResponse.json(
      { ok: false, error: "Status pertanyaan tidak valid." },
      { status: 400 },
    );
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan admin belum siap (kunci service belum diatur).",
      },
      { status: 503 },
    );
  }
  try {
    let query = service
      .from("pf_questions")
      .select(
        "id, user_id, pertanyaan, jawaban, referensi, status, kategori, publik, membantu, dibuat_pada, dijawab_pada",
      )
      .order("dibuat_pada", { ascending: false })
      .limit(100);
    if (statusParam === "semua") {
      query = query.in("status", ["menunggu", "tidak_ada_data", "terjawab"]);
    } else {
      query = query.eq("status", statusParam);
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true, pertanyaan: data ?? [] });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
