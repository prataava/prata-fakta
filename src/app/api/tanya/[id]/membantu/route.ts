// POST /api/tanya/[id]/membantu — vote "membantu" +1 untuk satu
// pertanyaan arsip. Tanpa login boleh; satu vote per IP per
// pertanyaan per hari (peta in-memory, pola rate limiter yang
// ada — kunci ip + id + tanggal WIB). Update via service role
// (tanpa policy UPDATE pengguna di pf_questions; T5). 503 jujur
// bila service key belum diatur; 404 bila pertanyaan tidak ada
// atau belum publik+terjawab (vote hanya untuk arsip publik).
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const SUDAH_VOTE = new Map<string, true>();

function tanggalWibHariIni(): string {
  const kini = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return kini.toISOString().slice(0, 10);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || id.length > 100) {
    return NextResponse.json(
      { ok: false, error: "Pertanyaan tidak ditemukan." },
      { status: 404 },
    );
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "tak-dikenal";
  const kunci = `${ip}:${id}:${tanggalWibHariIni()}`;
  if (SUDAH_VOTE.has(kunci)) {
    return NextResponse.json(
      { ok: false, error: "Anda sudah menandai pertanyaan ini membantu hari ini." },
      { status: 429 },
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
          "Layanan tanya belum aktif (kunci layanan belum diatur). Coba lagi nanti.",
      },
      { status: 503 },
    );
  }
  const { data: soal, error: errSoal } = await service
    .from("pf_questions")
    .select("id, membantu")
    .eq("id", id)
    .eq("publik", true)
    .eq("status", "terjawab")
    .maybeSingle();
  if (errSoal) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan tanya belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi v10 dijalankan.",
      },
      { status: 503 },
    );
  }
  if (!soal) {
    return NextResponse.json(
      { ok: false, error: "Pertanyaan tidak ditemukan." },
      { status: 404 },
    );
  }
  const membantuBaru = (typeof (soal as { membantu: unknown }).membantu === "number"
    ? (soal as { membantu: number }).membantu
    : 0) + 1;
  const { error } = await service
    .from("pf_questions")
    .update({ membantu: membantuBaru })
    .eq("id", id);
  if (error) {
    return NextResponse.json(
      { ok: false, error: "Gagal menyimpan vote. Coba lagi." },
      { status: 500 },
    );
  }
  SUDAH_VOTE.set(kunci, true);
  return NextResponse.json({ ok: true, membantu: membantuBaru });
}
