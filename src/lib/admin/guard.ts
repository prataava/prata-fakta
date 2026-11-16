// Guard autentikasi + rate limit untuk route /api/admin/* (Fase 5).
// Mengikuti pola src/lib/ai/route-auth.ts: rate limiter dan helper IP
// diimpor ulang dari sana agar perilakunya identik.
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, punyaRole, ROLES, type Role } from "@/lib/auth/roles";
import {
  buatRateLimiter,
  cekOrigin,
  ipDariRequest,
  responRateLimit,
} from "@/lib/ai/route-auth";
import { adalahGalatBelumSiap } from "./types.ts";
import type { User } from "@supabase/supabase-js";

export { buatRateLimiter, cekOrigin, ipDariRequest, responRateLimit };

export interface AdminTerautentikasi {
  user: User;
  roles: Role[];
}

/** Peran staf mana pun (super_admin lolos semua lewat punyaRole). */
export const PERAN_STAF: Role[] = [
  ROLES.EDITOR,
  ROLES.FACT_CHECKER,
  ROLES.WRITER,
];

/**
 * Autentikasi admin: harus login, akun tidak dibatasi
 * (pf_profiles.nonaktif), dan punya salah satu peran yang dibutuhkan.
 * Bila rolesDibutuhkan kosong -> staf mana pun boleh.
 * Mengembalikan {user, roles} bila lolos, atau NextResponse error.
 */
export async function autentikasiAdmin(
  req: Request,
  ...rolesDibutuhkan: Role[]
): Promise<AdminTerautentikasi | NextResponse> {
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

  // Akun dibatasi (nonaktif) tidak boleh masuk area admin sama sekali.
  try {
    const { data: profil } = await supabase
      .from("pf_profiles")
      .select("nonaktif")
      .eq("id", user.id)
      .maybeSingle();
    if (profil && (profil as { nonaktif: boolean }).nonaktif) {
      return NextResponse.json(
        {
          ok: false,
          error: "Akun Anda dibatasi. Hubungi administrator.",
          nonaktif: true,
        },
        { status: 403 },
      );
    }
  } catch {
    // Bila tabel profil belum ada, jangan blokir di sini — adapter
    // akan menjawab 503 yang jujur di langkah berikutnya.
  }

  const roles = await getUserRoles(user.id);
  const dibutuhkan =
    rolesDibutuhkan.length > 0 ? rolesDibutuhkan : PERAN_STAF;
  if (!punyaRole(roles, ...dibutuhkan)) {
    return NextResponse.json(
      { ok: false, error: "Anda tidak punya akses ke area admin." },
      { status: 403 },
    );
  }
  return { user, roles };
}

/** Rate limiter bersama route admin: 30 req/menit (lintas instance,
 * Tahap 13A, T3 — lihat src/lib/ai/route-auth.ts). Mengembalikan
 * fungsi ASINKRON atas Request; pemanggil WAJIB await:
 *   if (!(await lolosRateLimit(req))) return responRateLimit(); */
export function buatRateLimiterAdmin(): (
  req: Request,
) => Promise<boolean> {
  return buatRateLimiter(30);
}

/**
 * Terjemahkan galat dari lapisan admin menjadi respons JSON:
 * galat "layanan belum siap" -> 503 jujur; galat lain -> 500
 * dengan pesan GENERIK + kode galat buram (Gelombang B1, P2-13/
 * B-S8): pesan galat mentah (termasuk teks galat Postgres — nama
 * tabel/kolom/constraint) TIDAK BOLEH sampai ke klien. Pesan
 * lengkap hanya di log server (JSON terstruktur, beserta kode)
 * agar operator bisa melacak tanpa membocorkan skema.
 */
export function responGalatAdmin(err: unknown): NextResponse {
  if (adalahGalatBelumSiap(err)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan admin belum siap: migrasi Fase 5 atau kunci service Supabase belum diatur.",
      },
      { status: 503 },
    );
  }
  const kode = `ERR-${randomBytes(4).toString("hex").toUpperCase()}`;
  console.error(
    JSON.stringify({
      event: "galat_admin",
      waktu: new Date().toISOString(),
      kode,
      pesan: err instanceof Error ? err.message : String(err ?? ""),
      stack: err instanceof Error ? (err.stack ?? null) : null,
    }),
  );
  return NextResponse.json(
    {
      ok: false,
      error: `Terjadi kesalahan di server. Kode galat: ${kode}.`,
    },
    { status: 500 },
  );
}

/** Baca body JSON secara aman; null bila body bukan JSON valid. */
export async function bacaBody(
  req: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body = (await req.json()) as unknown;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function responBodyTakValid(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Permintaan tidak valid." },
    { status: 400 },
  );
}
