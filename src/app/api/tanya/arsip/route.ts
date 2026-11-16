// GET /api/tanya/arsip — arsip Q&A terjawab PUBLIK.
// Hanya pertanyaan publik=true + status 'terjawab'.
// Dibaca via SERVICE ROLE: policy RLS pf_questions hanya
// mengizinkan pemilik + staf, jadi session client tidak bisa
// membaca arsip publik. Service role di sini AMAN karena filter
// publik+terjawab ditegakkan di kueri dan respons tidak memuat
// identitas penanya (tanpa user_id). 503 jujur bila service key
// belum diatur atau tabel v10 belum ada.
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Arsip tanya belum aktif (kunci layanan belum diatur). Coba lagi nanti.",
      },
      { status: 503 },
    );
  }
  const { data, error } = await service
    .from("pf_questions")
    .select(
      "id, pertanyaan, jawaban, referensi, status, kategori, membantu, dibuat_pada, dijawab_pada",
    )
    .eq("publik", true)
    .eq("status", "terjawab")
    .order("dibuat_pada", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Arsip tanya belum aktif (tabel database belum dibuat). Coba lagi setelah migrasi v10 dijalankan.",
      },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, arsip: data ?? [] });
}
