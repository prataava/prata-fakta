// Helper autentikasi + rate limit untuk route /api/ai/*.
// Mengikuti pola route ingestion (dua jalur autentikasi untuk POST:
// header secret jadwal ATAU sesi login staf; GET hanya sesi staf).
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, punyaRole, ROLES } from "@/lib/auth/roles";
import type { DipicuOleh } from "./types.ts";

// Bandingkan secret dengan timing-safe equal (temuan T9 audit
// keamanan Fase 7): perbandingan `===` membocorkan panjang awalan
// yang sama lewat waktu eksekusi. Mengembalikan false bila salah
// satu kosong atau panjangnya berbeda.
export function bandingkanSecret(
  masukan: string | null | undefined,
  rahasia: string | undefined,
): boolean {
  if (!masukan || !rahasia) return false;
  const a = Buffer.from(masukan, "utf8");
  const b = Buffer.from(rahasia, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Rate limiter per-IP dalam memori (pola /api/langganan).
export function buatRateLimiter(batas: number, jendelaMs = 60_000) {
  const hitungan = new Map<string, { n: number; mulai: number }>();
  return (ip: string): boolean => {
    const sekarang = Date.now();
    const entri = hitungan.get(ip);
    if (!entri || sekarang - entri.mulai > jendelaMs) {
      hitungan.set(ip, { n: 1, mulai: sekarang });
      return true;
    }
    if (entri.n >= batas) return false;
    entri.n += 1;
    return true;
  };
}

export function ipDariRequest(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "tak-dikenal"
  );
}

export function responRateLimit() {
  return NextResponse.json(
    { ok: false, error: "Terlalu banyak percobaan. Coba lagi semenit lagi." },
    { status: 429 },
  );
}

// Autentikasi staf (GET): harus login + punya role editor/fact_checker
// (super_admin lolos lewat punyaRole). Kembalikan null bila lolos,
// atau NextResponse error bila tidak.
export async function autentikasiStaf(): Promise<NextResponse | null> {
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
  // Akun dibatasi (nonaktif) tidak boleh memakai fitur AI editorial
  // (temuan T4 audit keamanan Fase 7 — sebelumnya hanya guard admin
  // yang memeriksa nonaktif). Bila tabel profil belum ada, jangan
  // blokir di sini — route akan menjawab 503 yang jujur di bawah.
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
    // Lanjut ke pemeriksaan role.
  }
  const roles = await getUserRoles(user.id);
  if (!punyaRole(roles, ROLES.EDITOR, ROLES.FACT_CHECKER)) {
    return NextResponse.json(
      { ok: false, error: "Anda tidak punya akses ke fitur AI editorial." },
      { status: 403 },
    );
  }
  return null;
}

export type HasilAutentikasiPemicu =
  | { ok: true; dipicuOleh: DipicuOleh }
  | { ok: false; respon: NextResponse };

// Autentikasi dua jalur (POST pemicu job):
//  (a) header x-pf-ai-secret == PF_AI_SECRET (pemicu jadwal);
//  (b) sesi login super_admin/editor.
// Bila PF_AI_SECRET belum diatur DAN tidak ada sesi -> 503 jujur.
export async function autentikasiPemicuAi(
  req: Request,
): Promise<HasilAutentikasiPemicu> {
  const secretEnv = process.env.PF_AI_SECRET;
  const secretHeader = req.headers.get("x-pf-ai-secret");
  const lewatSecret = bandingkanSecret(secretHeader, secretEnv);
  if (lewatSecret) {
    return { ok: true, dipicuOleh: "github_actions" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    if (!secretEnv) {
      return {
        ok: false,
        respon: NextResponse.json(
          {
            ok: false,
            error:
              "Layanan AI editorial belum dikonfigurasi (secret belum diatur).",
          },
          { status: 503 },
        ),
      };
    }
    return {
      ok: false,
      respon: NextResponse.json(
        { ok: false, error: "Anda harus masuk terlebih dahulu." },
        { status: 401 },
      ),
    };
  }
  // Gate Fase 8 (T4): akun dibatasi (nonaktif) tidak boleh memicu job
  // AI editorial — sebelumnya hanya autentikasiStaf (GET) yang
  // memeriksa nonaktif, jalur pemicu POST ini lolos. Fail-open bila
  // tabel profil belum ada (route menjawab 503 jujur di bawah).
  try {
    const { data: profil } = await supabase
      .from("pf_profiles")
      .select("nonaktif")
      .eq("id", user.id)
      .maybeSingle();
    if (profil && (profil as { nonaktif: boolean }).nonaktif) {
      return {
        ok: false,
        respon: NextResponse.json(
          { ok: false, error: "Akun Anda dibatasi. Hubungi administrator." },
          { status: 403 },
        ),
      };
    }
  } catch {
    // Lanjut ke pemeriksaan role.
  }
  const roles = await getUserRoles(user.id);
  if (!punyaRole(roles, ROLES.EDITOR)) {
    return {
      ok: false,
      respon: NextResponse.json(
        { ok: false, error: "Anda tidak punya akses untuk memicu job AI." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, dipicuOleh: "manual" };
}

// Normalisasi nilai dipicu_oleh dari body (bila pemanggil mengisinya).
export function normalisasiDipicuOleh(
  nilai: unknown,
  bawaan: DipicuOleh,
): DipicuOleh {
  return nilai === "github_actions" ||
    nilai === "cron_muse" ||
    nilai === "manual"
    ? nilai
    : bawaan;
}
