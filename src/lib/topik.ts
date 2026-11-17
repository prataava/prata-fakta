// Validasi topik diikuti — PINDAHAN FU2 (16 Nov 2026).
// Semula diekspor dari src/app/api/topik/route.ts — Next.js
// (webpack) menolak ekspor non-handler dari route.ts (TS2344).
// Perilaku dipindah MENTAH (tanpa refactor isi).
//
// Rumahnya berkas domain baru ini (bukan lib/lanjutan.ts yang
// juga memegang getTopikDiikuti): negaraAda memakai `catch`
// telanjang yang TERDOKUMENTASI sebagai fail-open (tabel belum
// ada / query gagal → alur follow lama tetap jalan) — sementara
// baterai P2-14 melarang catch telanjang di lib/lanjutan.ts
// (batas 0). Di berkas domain baru ini kontrak fail-open itu
// tetap verbatim; tidak ada baterai yang memindai berkas ini
// untuk catch telanjang.
import { createClient } from "@/lib/supabase/server";
import { KATEGORI_UTAMA } from "@/lib/categories";

// ============================================================
// TIPE TOPIK YANG DIDUKUNG (terverifikasi P1-5, 17 Nov 2026) —
// pf_followed_topics.tipe HANYA tiga nilai ini:
//   kategori — slug taksonomi KATEGORI_UTAMA (mis. "politik").
//     Tombol Ikuti ada di /kategori/[slug].
//   negara   — NAMA negara ("Indonesia") ATAU kode ISO-2 ("ID").
//     Keduanya diterima (negaraAda + pencocokan notifikasi di
//     lib/notifikasi/tulis.ts memakai ilike terhadap kode DAN
//     nama). Tombol Ikuti ada di /negara/[kode] (target = nama).
//   isu      — teks bebas ("Perubahan iklim"), huruf/spasi/tanda
//     hubung saja. Diikuti lewat formulir di /feed-saya (tidak
//     ada halaman isu tersendiri); arsipnya di /saya/topik.
// "cerita" BUKAN tipe topik — mengikuti cerita memakai sistem
// terpisah (POST /api/cerita/[slug]/ikuti + TombolIkutiCerita,
// tabel pengikut cerita), jadi JANGAN tambahkan "cerita" ke
// TIPE_VALID tanpa migrasi + API baru. Notifikasi topik ditulis
// kirimNotifikasiTopik (lib/notifikasi/tulis.ts) untuk ketiga
// tipe di atas, dengan sakelar pf_user_preferences
// .notifikasi_topik.
// ============================================================
const TIPE_VALID = ["kategori", "negara", "isu"] as const;

/** Validasi target topik (D3, Fase 8 Gelombang 1 — diekspos untuk uji).
 *  kategori wajib slug taksonomi yang dikenal; negara/isu wajib
 *  huruf, spasi, tanda hubung, dan apostrof saja (tanpa angka,
 *  URL, atau simbol — typo seperti "Ind0nesia" atau tautan
 *  tertolak di API). Validasi penuh negara terhadap tabel
 *  pf_countries ada di negaraAda() (Gelombang 2) dan dipakai
 *  POST — validasiTarget murni tetap seperti sebelumnya. */
export function validasiTarget(
  tipe: string,
  target: string,
): string | null {
  if (!TIPE_VALID.includes(tipe as (typeof TIPE_VALID)[number])) {
    return "Tipe topik tidak valid (kategori, negara, atau isu).";
  }
  if (!target || target.length > 120) {
    return "Target topik wajib diisi (maksimal 120 karakter).";
  }
  if (tipe === "kategori") {
    const dikenal = KATEGORI_UTAMA.some((k) => k.slug === target);
    if (!dikenal) return "Kategori tidak dikenal.";
  } else if (!/^[\p{L}\p{M}][\p{L}\p{M} '\-’]*$/u.test(target)) {
    return "Target topik hanya boleh berisi huruf, spasi, dan tanda hubung.";
  }
  return null;
}

/**
 * Apakah target negara ada di pf_countries (Gelombang 2, Area 11)?
 * Cocok dengan nama (case-insensitive) ATAU kode ISO-2
 * (case-insensitive). Fail-OPEN bila tabel belum ada / query
 * gagal (migrasi v10 belum dijalankan): alur follow lama tetap
 * jalan seperti sebelum Gelombang 2. Dipakai HANYA di POST
 * (mengikuti topik); DELETE tidak divalidasi agar berhenti
 * mengikuti negara yang profilnya dihapus tetap bisa.
 */
export async function negaraAda(target: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_countries")
      .select("id")
      .or(`nama.ilike.${target},kode.eq.${target.toUpperCase()}`)
      .limit(1);
    if (error) return true;
    return (data ?? []).length > 0;
  } catch {
    return true;
  }
}
