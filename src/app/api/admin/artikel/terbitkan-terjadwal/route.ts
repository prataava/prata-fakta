// POST /api/admin/artikel/terbitkan-terjadwal — terbitkan semua
// artikel terjadwal yang waktunya sudah tiba dan lolos gate
// verifikasi. Yang gagal gate dilewati + dicatat alasannya.
// Autentikasi dua jalur (pola autentikasiPemicuAi):
//  (a) header x-pf-ai-secret == PF_AI_SECRET (pemicu jadwal);
//  (b) sesi login editor/super_admin.
// Bila PF_AI_SECRET belum diatur DAN tanpa sesi -> 503 jujur.
// Rate limit 30/menit/IP.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, punyaRole, ROLES } from "@/lib/auth/roles";
import {
  buatRateLimiterAdmin,
  ipDariRequest,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { bandingkanSecret } from "@/lib/ai/route-auth";
import { buatAdminAdapter } from "@/lib/admin/supabase-adapter";
import { terbitkanTerjadwal } from "@/lib/admin/editorial";

const lolosRateLimit = buatRateLimiterAdmin();

export async function POST(req: Request) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();

  const secretEnv = process.env.PF_AI_SECRET;
  const secretHeader = req.headers.get("x-pf-ai-secret");
  const lewatSecret = bandingkanSecret(secretHeader, secretEnv);

  let aktor: { id: string | null; email: string | null };
  if (lewatSecret) {
    aktor = { id: null, email: "github_actions" };
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      if (!secretEnv) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Layanan penerbitan terjadwal belum dikonfigurasi (secret belum diatur).",
          },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { ok: false, error: "Anda harus masuk terlebih dahulu." },
        { status: 401 },
      );
    }
    // Gate Fase 8 (T4): akun dibatasi (nonaktif) tidak boleh
    // menerbitkan artikel terjadwal — jalur dua-jalur ini sebelumnya
    // tidak memeriksa nonaktif (hanya autentikasiAdmin yang memeriksa).
    try {
      const { data: profil } = await supabase
        .from("pf_profiles")
        .select("nonaktif")
        .eq("id", user.id)
        .maybeSingle();
      if (profil && (profil as { nonaktif: boolean }).nonaktif) {
        return NextResponse.json(
          { ok: false, error: "Akun Anda dibatasi. Hubungi administrator." },
          { status: 403 },
        );
      }
    } catch {
      // Bila tabel profil belum ada, lanjut ke pemeriksaan role.
    }
    const roles = await getUserRoles(user.id);
    if (!punyaRole(roles, ROLES.EDITOR)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Anda tidak punya akses untuk menerbitkan artikel terjadwal.",
        },
        { status: 403 },
      );
    }
    aktor = { id: user.id, email: user.email ?? null };
  }

  try {
    const adapter = buatAdminAdapter();
    const hasil = await terbitkanTerjadwal(adapter, {
      ...aktor,
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true, ...hasil });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
