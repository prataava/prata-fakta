import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buatRateLimiter,
  responRateLimit,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";

// GET /api/notifikasi/jumlah → { ok, belum_dibaca } untuk lencana
// di Header. Ringan (count exact, head) — dipakai polling lencana.
// Wajib login (401 bila tidak). 503 jujur bila tabel
// pf_notifications belum ada (migrasi v6 belum dijalankan).
const batasi = buatRateLimiter(30);

function tabelBelumAda(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    (error.message ?? "").includes("Could not find the table")
  );
}

export async function GET(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  let pengguna = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    pengguna = data.user ?? null;
  } catch {
    pengguna = null;
  }
  if (!pengguna) {
    return NextResponse.json(
      { ok: false, error: "Masuk terlebih dahulu." },
      { status: 401 },
    );
  }
  const supabase = await createClient();
  const ditolak = await tolakAkunNonaktif(supabase, pengguna.id);
  if (ditolak) return ditolak;
  const { count, error } = await supabase
    .from("pf_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", pengguna.id)
    .eq("dibaca", false);
  if (error) {
    if (tabelBelumAda(error)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Layanan notifikasi belum aktif (tabel database belum dibuat).",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Gagal menghitung notifikasi." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, belum_dibaca: count ?? 0 });
}
