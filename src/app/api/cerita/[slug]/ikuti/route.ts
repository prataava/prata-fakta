import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  berhentiIkutiCerita,
  getCerita,
  ikutiCerita,
  slugCeritaValid,
  validasiAksiIkuti,
} from "@/lib/cerita";
import {
  buatRateLimiter,
  cekOrigin,
  responRateLimit,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";
import { catatGalatRoute } from "@/lib/analytics/galat";

// POST /api/cerita/[slug]/ikuti { aksi: "ikuti" | "berhenti" }
// → ikuti / berhenti mengikuti cerita. Wajib login (401 bila
// anonim); 404 bila cerita tak ada / masih draf. Tulis via
// session client — RLS pf_story_followers menegakkan
// user_id = auth.uid(). Rate limit 30/menit/IP.
const batasi = buatRateLimiter(30);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await batasi(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const { slug } = await params;
  if (!slugCeritaValid(slug)) {
    return NextResponse.json(
      { ok: false, error: "Slug cerita tidak valid." },
      { status: 400 },
    );
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu untuk mengikuti cerita." },
      { status: 401 },
    );
  }
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(supabase, user.id);
  if (ditolak) return ditolak;

  let body: { aksi?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }
  const aksi =
    typeof body.aksi === "string" && body.aksi ? body.aksi : "ikuti";
  const galat = validasiAksiIkuti(aksi);
  if (galat) {
    return NextResponse.json({ ok: false, error: galat }, { status: 400 });
  }

  const cerita = await getCerita(slug);
  if (!cerita) {
    return NextResponse.json(
      { ok: false, error: "Cerita tidak ditemukan atau belum diterbitkan." },
      { status: 404 },
    );
  }

  if (aksi === "berhenti") {
    const hasil = await berhentiIkutiCerita(user.id, cerita.id);
    if (!hasil.ok) {
      void catatGalatRoute("POST /api/cerita/[slug]/ikuti", hasil.error ?? "galat server (500)");
      return NextResponse.json(
        { ok: false, error: hasil.error ?? "Gagal berhenti mengikuti cerita." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, mengikuti: false });
  }
  const hasil = await ikutiCerita(user.id, cerita.id);
  if (!hasil.ok) {
    void catatGalatRoute("POST /api/cerita/[slug]/ikuti", "galat server (500)");
    return NextResponse.json(
      { ok: false, error: hasil.error ?? "Gagal mengikuti cerita." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, mengikuti: true });
}
