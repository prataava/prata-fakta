// Getter perpustakaan personal (P1-1): folder bookmark, catatan
// pribadi, dan pencarian tersimpan milik pengguna.
// Prinsip lib/data.ts: tanpa data palsu; "tabel belum ada"
// (migrasi v19/v18 belum dijalankan) → [] jujur; galat lain →
// dilempar (GalatBaca), bukan ditelan diam-diam.
// Getter /saya yang sudah ada (getBookmarkPengguna,
// getRiwayatBaca) dipakai ulang dari lib/data.ts / lib/lanjutan.ts
// — tidak diduplikasi di sini.
import { createClient } from "@/lib/supabase/server";
import { GalatBaca, catatGalatBaca, galatKolomBelumAda } from "@/lib/galat";
import type { PencarianTersimpan } from "@/app/api/saya/pencarian-tersimpan/route";

// Tipe pencarian tersimpan dipakai ulang dari route P0 (satu definisi).
export type { PencarianTersimpan } from "@/app/api/saya/pencarian-tersimpan/route";

/** Satu catatan pribadi beserta targetnya (judul + slug tautan). */
export type PfCatatan = {
  id: string;
  user_id: string;
  artikel_id: string | null;
  pengetahuan_id: string | null;
  isi: string;
  dibuat_pada: string | null;
  diubah_pada: string | null;
  /** "artikel" (berita) atau "pengetahuan". */
  jenis_target: "artikel" | "pengetahuan" | null;
  judul_target: string | null;
  slug_target: string | null;
};

/** Satu folder bookmark beserta hitungannya. folder null =
 *  "Tanpa folder" (bookmark yang belum dimasukkan ke folder). */
export type FolderBookmark = {
  folder: string | null;
  jumlah: number;
};

/** Satu baris bookmark di dalam satu folder (untuk daftar isi folder). */
export type ItemBookmarkFolder = {
  bookmark_id: string;
  folder: string | null;
  jenis: "artikel" | "pengetahuan";
  artikel_id: string | null;
  pengetahuan_id: string | null;
  judul: string | null;
  slug: string | null;
  dibuat_pada: string | null;
};

type BarisCatatan = {
  id: string;
  user_id: string;
  artikel_id: string | null;
  pengetahuan_id: string | null;
  isi: string;
  dibuat_pada: string | null;
  diubah_pada: string | null;
  pf_articles: { slug: string; judul: string } | null;
  pf_knowledge_articles: { slug: string; judul: string } | null;
};

type BarisBookmarkFolder = {
  id: string;
  folder: string | null;
  artikel_id: string | null;
  pengetahuan_id: string | null;
  dibuat_pada: string | null;
  pf_articles: { slug: string; judul: string } | null;
  pf_knowledge_articles: { slug: string; judul: string } | null;
};

/** Agregasi folder → hitungan (dihitung di JS dari kolom folder —
 *  tanpa RPC baru; jumlah bookmark per pengguna kecil). */
async function hitungPerFolder(userId: string): Promise<FolderBookmark[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_bookmarks")
      .select("folder")
      .eq("user_id", userId);
    if (error && galatKolomBelumAda(error)) {
      // Kolom folder belum ada (migrasi v19 belum diterapkan di
      // produksi — galat 42703 tercatat 16 Nov 2026): semua
      // bookmark dihitung sebagai "Tanpa folder", bukan halaman
      // kosong.
      const total = await supabase
        .from("pf_bookmarks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (total.error) {
        if (catatGalatBaca("hitungPerFolder", total.error)) return [];
        throw new GalatBaca("hitungPerFolder", total.error);
      }
      const jumlah = total.count ?? 0;
      return jumlah > 0 ? [{ folder: null, jumlah }] : [];
    }
    if (error) {
      if (catatGalatBaca("hitungPerFolder", error)) return [];
      throw new GalatBaca("hitungPerFolder", error);
    }
    const hitung = new Map<string | null, number>();
    for (const r of (data ?? []) as { folder: string | null }[]) {
      hitung.set(r.folder, (hitung.get(r.folder) ?? 0) + 1);
    }
    // Terurut jumlah terbanyak dulu; "Tanpa folder" (null) terakhir.
    return [...hitung.entries()]
      .map(([folder, jumlah]) => ({ folder, jumlah }))
      .sort((a, b) => {
        if (a.folder === null && b.folder !== null) return 1;
        if (a.folder !== null && b.folder === null) return -1;
        return b.jumlah - a.jumlah;
      });
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("hitungPerFolder", err)) return [];
    throw new GalatBaca("hitungPerFolder", err);
  }
}

/** Daftar folder bookmark pengguna beserta hitungan tiap folder. */
export async function getFolderBookmark(
  userId: string,
): Promise<FolderBookmark[]> {
  return hitungPerFolder(userId);
}

/**
 * Jumlah bookmark per folder (nama sama dengan getFolderBookmark —
 * dua nama untuk dua pemakaian: /perpustakaan memakai
 * getFolderBookmark untuk daftar, /saya memakai getJumlahPerFolder
 * untuk ringkasan hitungan). Mengembalikan daftar {folder, jumlah}.
 */
export async function getJumlahPerFolder(
  userId: string,
): Promise<FolderBookmark[]> {
  return hitungPerFolder(userId);
}

/**
 * Isi satu folder bookmark. folder undefined = semua folder
 * (tanpa saring); folder null = hanya "Tanpa folder".
 * Hanya artikel TERBIT yang dikembalikan (draf tidak bocor).
 */
export async function getBookmarkDalamFolder(
  userId: string,
  folder: string | null | undefined,
  limit = 20,
): Promise<ItemBookmarkFolder[]> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("pf_bookmarks")
      .select(
        `id, folder, artikel_id, pengetahuan_id, dibuat_pada,
         pf_articles!left(id, slug, judul, status),
         pf_knowledge_articles!left(id, slug, judul, status)`,
      )
      .eq("user_id", userId)
      .order("dibuat_pada", { ascending: false })
      .limit(limit);
    if (folder === null) query = query.is("folder", null);
    else if (typeof folder === "string") query = query.eq("folder", folder);
    const { data, error } = await query;
    if (error) {
      if (catatGalatBaca("getBookmarkDalamFolder", error)) return [];
      throw new GalatBaca("getBookmarkDalamFolder", error);
    }
    const hasil: ItemBookmarkFolder[] = [];
    for (const r of (data ?? []) as unknown as (BarisBookmarkFolder & {
      pf_articles: { slug: string; judul: string; status: string } | null;
      pf_knowledge_articles: {
        slug: string;
        judul: string;
        status: string;
      } | null;
    })[]) {
      // Baris dengan kedua target null / keduanya draf dilewati
      // (bukan ditampilkan sebagai kartu kosong).
      const artikelTerbit =
        r.pf_articles && r.pf_articles.status === "terbit"
          ? r.pf_articles
          : null;
      const pengetahuanTerbit =
        r.pf_knowledge_articles && r.pf_knowledge_articles.status === "terbit"
          ? r.pf_knowledge_articles
          : null;
      if (!artikelTerbit && !pengetahuanTerbit) continue;
      const target = artikelTerbit ?? pengetahuanTerbit;
      hasil.push({
        bookmark_id: String(r.id),
        folder: r.folder,
        jenis: artikelTerbit ? "artikel" : "pengetahuan",
        artikel_id: r.artikel_id,
        pengetahuan_id: r.pengetahuan_id,
        judul: target?.judul ?? null,
        slug: target?.slug ?? null,
        dibuat_pada: r.dibuat_pada,
      });
    }
    return hasil;
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getBookmarkDalamFolder", err)) return [];
    throw new GalatBaca("getBookmarkDalamFolder", err);
  }
}

/**
 * Catatan pribadi pengguna, terbaru dulu. Filter opsional ke satu
 * target (tepat satu dari artikel_id / pengetahuan_id).
 */
export async function getCatatanPengguna(
  userId: string,
  filter?: { artikel_id?: string; pengetahuan_id?: string; limit?: number },
): Promise<PfCatatan[]> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("pf_notes")
      .select(
        `id, user_id, artikel_id, pengetahuan_id, isi, dibuat_pada, diubah_pada,
         pf_articles!left(slug, judul),
         pf_knowledge_articles!left(slug, judul)`,
      )
      .eq("user_id", userId)
      .order("dibuat_pada", { ascending: false })
      .limit(filter?.limit ?? 20);
    if (filter?.artikel_id) query = query.eq("artikel_id", filter.artikel_id);
    if (filter?.pengetahuan_id) {
      query = query.eq("pengetahuan_id", filter.pengetahuan_id);
    }
    const { data, error } = await query;
    if (error) {
      if (catatGalatBaca("getCatatanPengguna", error)) return [];
      throw new GalatBaca("getCatatanPengguna", error);
    }
    return ((data ?? []) as unknown as BarisCatatan[]).map((r) => {
      const jenis: PfCatatan["jenis_target"] = r.artikel_id
        ? "artikel"
        : r.pengetahuan_id
          ? "pengetahuan"
          : null;
      const target =
        jenis === "artikel" ? r.pf_articles : r.pf_knowledge_articles;
      return {
        id: String(r.id),
        user_id: String(r.user_id),
        artikel_id: r.artikel_id,
        pengetahuan_id: r.pengetahuan_id,
        isi: r.isi,
        dibuat_pada: r.dibuat_pada,
        diubah_pada: r.diubah_pada,
        jenis_target: jenis,
        judul_target: target?.judul ?? null,
        slug_target: target?.slug ?? null,
      };
    });
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getCatatanPengguna", err)) return [];
    throw new GalatBaca("getCatatanPengguna", err);
  }
}

/** Entri pencarian tersimpan yang bentuknya sah (baris lama/rusak dilewati). */
function entriPencarianValid(e: unknown): e is PencarianTersimpan {
  if (!e || typeof e !== "object") return false;
  const r = e as Record<string, unknown>;
  return (
    typeof r.q === "string" &&
    r.q.trim().length > 0 &&
    typeof r.disimpan_pada === "string" &&
    r.disimpan_pada.length > 0 &&
    (r.dari === null || typeof r.dari === "string") &&
    (r.sampai === null || typeof r.sampai === "string") &&
    (r.sumber === null || typeof r.sumber === "string") &&
    (r.status === null || typeof r.status === "string")
  );
}

/**
 * Pencarian tersimpan milik pengguna (kolom jsonb
 * pf_user_preferences.pencarian_tersimpan, migrasi v18).
 * Data dibaca langsung — bukan lewat fetch API sendiri — agar
 * halaman server tidak memanggil dirinya sendiri.
 */
export async function getPencarianTersimpan(
  userId: string,
): Promise<PencarianTersimpan[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_user_preferences")
      .select("pencarian_tersimpan")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      if (catatGalatBaca("getPencarianTersimpan", error)) return [];
      throw new GalatBaca("getPencarianTersimpan", error);
    }
    if (!data) return [];
    const mentah = (data as { pencarian_tersimpan?: unknown })
      .pencarian_tersimpan;
    if (!Array.isArray(mentah)) return [];
    return mentah.filter(entriPencarianValid);
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getPencarianTersimpan", err)) return [];
    throw new GalatBaca("getPencarianTersimpan", err);
  }
}
