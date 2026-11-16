// GET /api/tanya/arsip — arsip Q&A terjawab PUBLIK.
// Hanya pertanyaan publik=true + status 'terjawab'.
// P1-15 (B-S10, L-F2, v13): dibaca via SESSION CLIENT —
// policy RLS baru "pf_questions arsip publik" (publik=true
// AND status='terjawab') menegakkan filter di DATABASE, bukan
// lagi di kode route lewat service role. Respons TIDAK PERNAH
// memuat user_id/email penanya: select hanya kolom aman.
// 503 jujur bila tabel v6/v10 belum ada.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Arsip tanya belum aktif (layanan belum tersedia). Coba lagi nanti.",
      },
      { status: 503 },
    );
  }
  // Kolom aman saja — TANPA user_id (identitas penanya tidak
  // boleh bocor lewat arsip publik).
  const { data, error } = await supabase
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
