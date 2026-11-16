// GET /api/akun/status — status akun pengguna yang sedang login:
// {ok, nonaktif, roles}. Dipakai halaman /masuk untuk mengeluarkan
// akun yang dibatasi. Tanpa peran staf (user mana pun boleh).
// Rate limit 30/menit/IP.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles } from "@/lib/auth/roles";
import {
  buatRateLimiterAdmin,
  responRateLimit,
} from "@/lib/admin/guard";

const lolosRateLimit = buatRateLimiterAdmin();

export async function GET(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Anda harus masuk terlebih dahulu." },
      { status: 401 },
    );
  }

  let nonaktif = false;
  try {
    const { data: profil } = await supabase
      .from("pf_profiles")
      .select("nonaktif")
      .eq("id", user.id)
      .maybeSingle();
    nonaktif = !!(profil as { nonaktif?: boolean } | null)?.nonaktif;
  } catch {
    // Bila tabel profil belum ada, anggap tidak dibatasi (bukan 503:
    // endpoint ini hanya membaca status akun).
    nonaktif = false;
  }
  const roles = await getUserRoles(user.id);
  return NextResponse.json({ ok: true, nonaktif, roles });
}
