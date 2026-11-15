// Role & permission PRATA FAKTA (RBAC).
// Aturan: permission SELALU diperiksa di backend (RLS/policies + pemeriksaan
// server di Server Action/Route Handler), bukan hanya menyembunyikan tombol.
// File ini hanya berisi konstanta + helper baca role; enforcement ada di
// policies SQL (supabase/migrations) dan di guard server (Fase 5).
import { createClient } from "@/lib/supabase/server";

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  EDITOR: "editor",
  FACT_CHECKER: "fact_checker",
  WRITER: "writer",
  USER: "user",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const PERMISSIONS = {
  ARTICLE_CREATE: "article.create",
  ARTICLE_EDIT: "article.edit",
  ARTICLE_DELETE: "article.delete",
  ARTICLE_PUBLISH: "article.publish",
  ARTICLE_REVIEW: "article.review",
  FACTCHECK_VERIFY: "factcheck.verify",
  SOURCE_MANAGE: "source.manage",
  USER_MANAGE: "user.manage",
  SYSTEM_MANAGE: "system.manage",
} as const;

/** Role pengguna dari pf_user_roles; [] bila tabel belum ada / belum login. */
export async function getUserRoles(userId: string): Promise<Role[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_user_roles")
      .select("pf_roles(nama)")
      .eq("user_id", userId);
    if (error || !data) return [];
    const roles: Role[] = [];
    for (const row of data as unknown as { pf_roles: { nama: string } | null }[]) {
      if (row.pf_roles && Object.values(ROLES).includes(row.pf_roles.nama as Role)) {
        roles.push(row.pf_roles.nama as Role);
      }
    }
    return roles;
  } catch {
    return [];
  }
}

export function punyaRole(roles: Role[], ...diperlukan: Role[]): boolean {
  if (roles.includes(ROLES.SUPER_ADMIN)) return true;
  return diperlukan.some((r) => roles.includes(r));
}
