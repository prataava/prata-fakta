import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/langganan — pendaftaran newsletter (email saja).
// Validasi format email + dedupe lewat constraint unique di database.
// Rate limiting: dibatasi 5 request/menit/IP lewat header sederhana di sini
// (Fase 7: pindahkan ke Upstash/edge bila volume naik).
const BATAS = 5;
const JENDELA_MS = 60_000;
const hitungan = new Map<string, { n: number; mulai: number }>();

function lolosRateLimit(ip: string): boolean {
  const sekarang = Date.now();
  const entri = hitungan.get(ip);
  if (!entri || sekarang - entri.mulai > JENDELA_MS) {
    hitungan.set(ip, { n: 1, mulai: sekarang });
    return true;
  }
  if (entri.n >= BATAS) return false;
  entri.n += 1;
  return true;
}

const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "tak-dikenal";
  if (!lolosRateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak percobaan. Coba lagi semenit lagi." },
      { status: 429 },
    );
  }

  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Permintaan tidak valid." }, { status: 400 });
  }

  if (!POLA_EMAIL.test(email) || email.length > 254) {
    return NextResponse.json(
      { ok: false, error: "Alamat email tidak valid." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("pf_newsletter_subscribers")
    .insert({ email });

  if (error) {
    // 23505 = unique violation → email sudah terdaftar.
    if (error.code === "23505") {
      return NextResponse.json(
        { ok: false, error: "Email ini sudah terdaftar." },
        { status: 409 },
      );
    }
    // Tabel belum dibuat (migrasi Fase 1 belum dijalankan): jujur, bukan pura-pura sukses.
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan newsletter belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi Fase 1 dijalankan.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
