// POST /api/tanya/[id]/membantu — vote "membantu" +1 untuk satu
// pertanyaan arsip. Tanpa login boleh; satu vote per IP per
// pertanyaan per hari. Update via service role (tanpa policy
// UPDATE pengguna di pf_questions; T5). 503 jujur bila service
// key belum diatur; 404 bila pertanyaan tidak ada atau belum
// publik+terjawab (vote hanya untuk arsip publik).
// Tahap 13A (T3): IP diambil dari ipDariRequest — JANGAN pakai
// entri kiri x-forwarded-for (ditulis klien; satu header palsu =
// vote tanpa batas).
// Gelombang B1 (P1-5/B-S1/B-S2): dedup vote PINDAH ke RPC
// pf_rate_limit_check (kunci vote-membantu:<ip>:<id>, batas 1 /
// jendela 86400 dtk) — Map in-memory per instance DIHAPUS, jadi
// dedup kini berlaku lintas instance. RPC gagal -> 503 jujur
// (fail-closed), bukan vote ganda diam-diam.
// Increment memakai CAS (baca -> update bersyarat nilai lama,
// ulang maks 3x) agar dua IP berbeda yang vote bersamaan tidak
// saling menimpa (satu vote hilang). Increment atomik SEJATI
// (satu pernyataan UPDATE ... SET membantu = membantu + 1) BUTUH
// RPC baru — follow-up migrasi (lihat laporan Gelombang B1);
// CAS di sini mencegah kehilangan vote sampai RPC itu ada.
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  cekOrigin,
  cekRateLimitDbKeras,
  ipDariRequest,
  responRateLimitBelumSiap,
} from "@/lib/ai/route-auth";
import { catatGalatRoute } from "@/lib/analytics/galat";

const BATAS_VOTE_HARIAN = 1;
const JENDELA_VOTE_DETIK = 86_400;
const MAKS_ULANG_CAS = 3;

function kunciVote(ip: string, id: string): string {
  return `vote-membantu:${ip}:${id}`;
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
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;

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

  // Dedup lintas instance (fail-closed): RPC gagal -> 503 jujur.
  const ip = ipDariRequest(req);
  const batas = await cekRateLimitDbKeras(
    kunciVote(ip, id),
    BATAS_VOTE_HARIAN,
    JENDELA_VOTE_DETIK,
  );
  if (!batas.lolos) {
    if (batas.alasan === "rpc-gagal") {
      return responRateLimitBelumSiap(batas.jenisGalat);
    }
    return NextResponse.json(
      { ok: false, error: "Anda sudah menandai pertanyaan ini membantu hari ini." },
      { status: 429 },
    );
  }

  // Increment CAS: update hanya bila nilai masih sama dengan yang
  // dibaca; bila vote lain masuk di antaranya, baca ulang + coba
  // lagi (maks 3x) — tanpa ini satu vote bisa hilang diam-diam.
  let terakhir =
    typeof (soal as { membantu: unknown }).membantu === "number"
      ? (soal as { membantu: number }).membantu
      : 0;
  let membantuBaru: number | null = null;
  for (let percobaan = 0; percobaan < MAKS_ULANG_CAS; percobaan++) {
    const { data: diubah, error: errUbah } = await service
      .from("pf_questions")
      .update({ membantu: terakhir + 1 })
      .eq("id", id)
      .eq("membantu", terakhir)
      .select("membantu")
      .maybeSingle();
    if (errUbah) {
      void catatGalatRoute("POST /api/tanya/[id]/membantu", errUbah);
      return NextResponse.json(
        { ok: false, error: "Gagal menyimpan vote. Coba lagi." },
        { status: 500 },
      );
    }
    if (diubah) {
      membantuBaru = (diubah as { membantu: number }).membantu;
      break;
    }
    const { data: segar, error: errSegar } = await service
      .from("pf_questions")
      .select("membantu")
      .eq("id", id)
      .maybeSingle();
    if (errSegar || !segar) {
      void catatGalatRoute("POST /api/tanya/[id]/membantu", errSegar ?? "galat server (500)");
      return NextResponse.json(
        { ok: false, error: "Gagal menyimpan vote. Coba lagi." },
        { status: 500 },
      );
    }
    terakhir =
      typeof (segar as { membantu: unknown }).membantu === "number"
        ? (segar as { membantu: number }).membantu
        : 0;
  }
  if (membantuBaru === null) {
    void catatGalatRoute("POST /api/tanya/[id]/membantu", "galat server (500)");
    return NextResponse.json(
      { ok: false, error: "Gagal menyimpan vote. Coba lagi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, membantu: membantuBaru });
}
