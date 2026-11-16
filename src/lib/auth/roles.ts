// Role & permission PRATA FAKTA (RBAC).
// Aturan: permission SELALU diperiksa di backend (RLS/policies + pemeriksaan
// server di Server Action/Route Handler), bukan hanya menyembunyikan tombol.
// File ini hanya berisi konstanta + helper baca role; enforcement ada di
// policies SQL (supabase/migrations) dan di guard server (Fase 5).
//
// KEPUTUSAN RBAC — Gelombang B1, P2-15 (B-S11), didokumentasikan di
// AUDIT-EXPANSION.md §10: peran KASAR (super_admin / editor /
// fact_checker / writer / user) memang CUKUP, dan lapisan permission
// halus (pf_permissions / pf_role_permissions) TIDAK DITEGAKKAN.
// Alasan: (1) konstanta PERMISSIONS tidak pernah dipakai di mana pun
// (0 pemakaian di luar berkas ini); (2) tabel pf_permissions /
// pf_role_permissions tidak pernah dibaca penegakan mana pun —
// penegakan nyata selalu peran kasar via pf_has_role() di policy
// + autentikasiAdmin(..., ROLES.X) di route; (3) menegakkan
// permission halus sekarang berarti mendesain ulang SELURUH guard
// + policy di tengah proyek (churn besar, risiko regresi) tanpa
// kebutuhan produk yang memintanya — tidak ada satu pun alur yang
// butuh beda "article.edit" vs "article.publish" DI DALAM satu
// peran (pembedaan yang ada sudah tertangkap peran: terbitkan
// hanya EDITOR, review EDITOR+FACT_CHECKER, tulis EDITOR+WRITER).
// Yang dilakukan: konstanta PERMISSIONS DIHAPUS (kode mati).
// Tabel pf_permissions / pf_role_permissions TETAP ADA di database
// (seed v1 TIDAK BOLEH diubah) — didokumentasikan sebagai
// TIDAK DIPAKAI / cadangan bila suatu saat dibutuhkan permission
// halus; seed-nya tetap utuh dan tidak dibaca siapa pun.
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  EDITOR: "editor",
  FACT_CHECKER: "fact_checker",
  WRITER: "writer",
  USER: "user",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/**
 * Baca peran pengguna dari pf_user_roles (tanpa cache).
 * Dipakai internal oleh getUserRoles (versi cache per request).
 */
async function bacaPeranPengguna(userId: string): Promise<Role[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_user_roles")
      .select("pf_roles(nama)")
      .eq("user_id", userId);
    if (error || !data) {
      if (error) {
        console.error("[baca] getUserRoles: galat membaca pf_user_roles.", error);
      }
      return [];
    }
    const roles: Role[] = [];
    for (const row of data as unknown as { pf_roles: { nama: string } | null }[]) {
      if (row.pf_roles && Object.values(ROLES).includes(row.pf_roles.nama as Role)) {
        roles.push(row.pf_roles.nama as Role);
      }
    }
    return roles;
  } catch (err) {
    console.error("[baca] getUserRoles: galat membaca pf_user_roles.", err);
    return [];
  }
}

/**
 * Role pengguna dari pf_user_roles; [] bila tabel belum ada / belum login.
 * P3-6 (B-R7): di-cache PER REQUEST (React cache) — satu request
 * yang memanggil getUserRoles berkali-kali (guard + route + halaman)
 * hanya membaca pf_user_roles SATU kali. Cache hidup selama satu
 * request server saja; request berikutnya membaca ulang (perubahan
 * peran langsung berlaku).
 * CATATAN INTEGRASI (follow-up, bukan milik gelombang ini):
 * kunciRateLimit di lib/ai/route-auth.ts + guard autentikasiAdmin
 * di lib/admin/guard.ts memanggil auth.getUser() sendiri per
 * request — cache peran di sini tidak menyentuh keduanya (kedua
 * berkas milik agen keamanan). Bila suatu saat keduanya memakai
 * getUserRoles ini, penghematan bertambah; bila tidak, perilaku
 * tetap benar.
 */
export const getUserRoles: (userId: string) => Promise<Role[]> =
  cache(bacaPeranPengguna);

export function punyaRole(roles: Role[], ...diperlukan: Role[]): boolean {
  if (roles.includes(ROLES.SUPER_ADMIN)) return true;
  return diperlukan.some((r) => roles.includes(r));
}
