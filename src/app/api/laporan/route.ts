import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// POST /api/laporan — laporan kesalahan artikel (boleh anonim).
// Body: { artikel_id, jenis, pesan, nama?, email? }
// Rate limiting: 5 request/menit/IP (pola yang sama dengan /api/langganan).
// 503 jujur bila tabel pf_correction_reports belum ada.
// T5 (Fase 8 Gelombang 1): INSERT via service role — policy INSERT
// anonim "pf_correction_reports kirim publik" DICABUT di migrasi v8.
// Cek artikel + identitas pelapor tetap via session client; hanya
// INSERT yang memakai service role. 503 jujur bila service key
// belum diatur.
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

const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const JENIS_VALID = ["fakta_salah", "sumber", "typo", "lainnya"] as const;

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "tak-dikenal";
  if (!lolosRateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak percobaan. Coba lagi semenit lagi." },
      { status: 429 },
    );
  }

  let body: {
    artikel_id?: unknown;
    jenis?: unknown;
    pesan?: unknown;
    nama?: unknown;
    email?: unknown;
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
  const jenis = typeof body.jenis === "string" ? body.jenis : "";
  const pesan = typeof body.pesan === "string" ? body.pesan.trim() : "";
  const nama = typeof body.nama === "string" ? body.nama.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!POLA_UUID.test(artikelId)) {
    return NextResponse.json(
      { ok: false, error: "artikel_id tidak valid." },
      { status: 400 },
    );
  }
  if (!JENIS_VALID.includes(jenis as (typeof JENIS_VALID)[number])) {
    return NextResponse.json(
      { ok: false, error: "Jenis laporan tidak valid." },
      { status: 400 },
    );
  }
  if (!pesan || pesan.length > 2000) {
    return NextResponse.json(
      {
        ok: false,
        error: "Pesan laporan wajib diisi (maksimal 2000 karakter).",
      },
      { status: 400 },
    );
  }
  if (nama.length > 120) {
    return NextResponse.json(
      { ok: false, error: "Nama terlalu panjang (maksimal 120 karakter)." },
      { status: 400 },
    );
  }
  if (email && (!POLA_EMAIL.test(email) || email.length > 254)) {
    return NextResponse.json(
      { ok: false, error: "Alamat email tidak valid." },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  // Artikel harus ada dan sudah terbit.
  const { data: artikel, error: errArtikel } = await supabase
    .from("pf_articles")
    .select("id")
    .eq("id", artikelId)
    .eq("status", "terbit")
    .maybeSingle();
  if (errArtikel) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan laporan belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi Fase 2 dijalankan.",
      },
      { status: 503 },
    );
  }
  if (!artikel) {
    return NextResponse.json(
      { ok: false, error: "Artikel tidak ditemukan." },
      { status: 404 },
    );
  }

  // Pelapor yang login dicatat id-nya; anonim tetap boleh.
  let pelaporId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    pelaporId = data.user?.id ?? null;
  } catch {
    pelaporId = null;
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan laporan belum aktif (kunci layanan belum diatur). Coba lagi nanti.",
      },
      { status: 503 },
    );
  }
  const { error } = await service.from("pf_correction_reports").insert({
    artikel_id: artikelId,
    pelapor_id: pelaporId,
    nama: nama || null,
    email: email || null,
    jenis,
    pesan,
    status: "baru",
  });
  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan laporan belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi Fase 2 dijalankan.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
