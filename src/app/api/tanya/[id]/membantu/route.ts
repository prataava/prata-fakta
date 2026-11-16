// POST /api/tanya/[id]/membantu — vote "membantu" +1 untuk satu
// pertanyaan arsip. Tanpa login boleh; satu vote per IP per
// pertanyaan per hari (peta in-memory, pola rate limiter yang
// ada — kunci ip + id + tanggal WIB). Update via service role
// (tanpa policy UPDATE pengguna di pf_questions; T5). 503 jujur
// bila service key belum diatur; 404 bila pertanyaan tidak ada
// atau belum publik+terjawab (vote hanya untuk arsip publik).
// Tahap 13A (T3): IP diambil dari ipDariRequest — JANGAN pakai
// entri kiri x-forwarded-for (ditulis klien; satu header palsu =
// vote tanpa batas). SISA: dedup vote ini tetap per instance
// (Map in-memory); di dua instance berbeda, satu IP bisa tercatat
// dua kali dalam sehari — celah integritas ringan, bukan bypass
// limit; bila butuh ketat lintas instance, pindahkan kunci vote
// ke RPC pf_rate_limit_check (batas 1 / jendela 86400 dtk).
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ipDariRequest } from "@/lib/ai/route-auth";

const SUDAH_VOTE = new Map<string, true>();
const BATAS_PETA_VOTE = 10_000;

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
  const ip = ipDariRequest(req);
  const hariIni = tanggalWibHariIni();
  const kunci = `${ip}:${id}:${hariIni}`;
  // Batasi pertumbuhan peta (tanpa eviction, kunci lama menumpuk
  // selamanya): bila penuh, buang kunci hari lain — kunci hari ini
  // tidak pernah dibuang, jadi vote hari ini tetap terhitung.
  if (SUDAH_VOTE.size >= BATAS_PETA_VOTE) {
    for (const k of SUDAH_VOTE.keys()) {
      if (!k.endsWith(`:${hariIni}`)) SUDAH_VOTE.delete(k);
    }
  }
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
