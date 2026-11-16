import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buatRateLimiterKeras,
  cekOrigin,
  responRateLimit,
  responRateLimitBelumSiap,
} from "@/lib/ai/route-auth";

// POST /api/langganan — pendaftaran newsletter (email saja).
// Validasi format email + dedupe lewat constraint unique di database.
// Rate limiting: 5 request/menit (limiter database lintas instance,
// Tahap 13A, T3 — menggantikan Map in-memory per instance).
// T5 (Fase 8 Gelombang 1): INSERT via service role — policy INSERT
// anonim "pf_newsletter daftar publik" DICABUT di migrasi v8, jadi
// session client tidak bisa lagi insert. 503 jujur bila service key
// belum diatur.
const batasi = buatRateLimiterKeras(5);

const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  const hasilRateLimit = await batasi(req);
  if (!hasilRateLimit.lolos && hasilRateLimit.alasan === "rpc-gagal")
    return responRateLimitBelumSiap(hasilRateLimit.jenisGalat);
  if (!hasilRateLimit.lolos) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;

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

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan newsletter belum aktif (kunci layanan belum diatur). Coba lagi nanti.",
      },
      { status: 503 },
    );
  }
  const { error } = await service
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
