// Pembaca feature flag — Tahap 13C (penegakan flag, §10).
// Dipakai route cron (ingestion/pipeline), halaman /daftar, dan
// Header (pengumuman pemeliharaan).
//
// Prinsip:
// - Nilai tersimpan jsonb: { "nilai": ... } atau nilai mentah
//   (pola yang sama dengan src/lib/admin/kendali.ts).
// - Flag yang BELUM DISETEL memakai nilai bawaan (mode
//   pemeliharaan=false, ingestion/pipeline/pendaftaran=true).
// - Tabel belum ada / service key belum diatur -> bawaan
//   (fail-open ke perilaku sebelum flag ada), TIDAK PERNAH
//   melempar: route yang memanggil tetap bisa menjawab 503
//   jujur dari jalurnya sendiri bila layanannya belum siap.
// - bacaPemeliharaan() TIDAK PERNAH melempar (untuk Header yang
//   dirender di setiap halaman, termasuk saat prerender build).
import { cobaServiceClient } from "../supabase/service.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Urai satu nilai flag dari kolom jsonb (murni, tanpa I/O —
 * diuji langsung baterai uji-tahap13c.mjs).
 */
export function uraiNilaiFlag(
  mentah: unknown,
  jenis: "boolean" | "teks",
  bawaan: boolean | string,
): boolean | string {
  const nilai =
    mentah !== null &&
    typeof mentah === "object" &&
    !Array.isArray(mentah) &&
    "nilai" in (mentah as Record<string, unknown>)
      ? (mentah as Record<string, unknown>).nilai
      : mentah;
  if (jenis === "boolean") {
    return typeof nilai === "boolean" ? nilai : (bawaan as boolean);
  }
  return typeof nilai === "string" ? nilai : (bawaan as string);
}

/** Baca satu flag boolean (bawaan bila belum disetel / tak terbaca). */
export async function bacaFlag(
  klien: SupabaseClient,
  kunci: string,
  bawaan: boolean,
): Promise<boolean> {
  try {
    const { data, error } = await klien
      .from("pf_system_settings")
      .select("nilai")
      .eq("kunci", kunci)
      .maybeSingle();
    if (error || !data) return bawaan;
    const nilai = uraiNilaiFlag(
      (data as { nilai: unknown }).nilai,
      "boolean",
      bawaan,
    );
    return typeof nilai === "boolean" ? nilai : bawaan;
  } catch {
    return bawaan;
  }
}

/** Baca satu flag teks (bawaan bila belum disetel / tak terbaca). */
export async function bacaFlagTeks(
  klien: SupabaseClient,
  kunci: string,
  bawaan: string,
): Promise<string> {
  try {
    const { data, error } = await klien
      .from("pf_system_settings")
      .select("nilai")
      .eq("kunci", kunci)
      .maybeSingle();
    if (error || !data) return bawaan;
    const nilai = uraiNilaiFlag(
      (data as { nilai: unknown }).nilai,
      "teks",
      bawaan,
    );
    return typeof nilai === "string" ? nilai : bawaan;
  } catch {
    return bawaan;
  }
}

/**
 * Baca mode pemeliharaan + teks pengumumannya. TIDAK PERNAH
 * melempar — bila service key/tabel belum ada, kembalikan
 * { aktif:false } (situs berjalan normal seperti sebelum flag).
 */
export async function bacaPemeliharaan(): Promise<{
  aktif: boolean;
  pengumuman: string;
}> {
  try {
    const klien = cobaServiceClient();
    if (!klien) return { aktif: false, pengumuman: "" };
    const aktif = await bacaFlag(klien, "mode_pemeliharaan", false);
    if (!aktif) return { aktif: false, pengumuman: "" };
    const pengumuman = await bacaFlagTeks(
      klien,
      "pengumuman_pemeliharaan",
      "",
    );
    return { aktif: true, pengumuman };
  } catch {
    return { aktif: false, pengumuman: "" };
  }
}

/**
 * Apakah pendaftaran akun baru dibuka (flag pendaftaran_terbuka,
 * bawaan true). TIDAK PERNAH melempar.
 */
export async function bacaPendaftaranTerbuka(): Promise<boolean> {
  try {
    const klien = cobaServiceClient();
    if (!klien) return true;
    return await bacaFlag(klien, "pendaftaran_terbuka", true);
  } catch {
    return true;
  }
}
