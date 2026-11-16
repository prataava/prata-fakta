// Lapisan akses data Explain the World (Area 4, Fase 8 Gel. 2).
// Prinsip sama seperti src/lib/data.ts / src/lib/lanjutan.ts:
// gagal-aman (try/catch → [] / null), Bahasa Indonesia, tanpa data
// palsu. Kolom explainer (jenis/tingkat/estimasi_baca_menit/
// seri_slug) berasal dari migrasi v10 §7 — bila kolom belum ada
// (v10 belum dijalankan di produksi), query gagal dan fungsi
// mengembalikan [] / null; pemanggil menampilkan empty state jujur.
//
// Format explainer berlapis (AUDIT-EXPANSION.md §5.4):
// ringkas → mendalam, "Mengapa penting", istilah kunci, tingkat
// kesulitan + estimasi baca, linimasa, referensi, tautan seri.
// Semua seksi turunan (mengapa penting / linimasa / istilah)
// HANYA tampil bila ada di data — tidak ada yang dikarang:
//  - "Mengapa penting": paragraf isi yang diawali "Mengapa penting"
//    (konvensi editorial; lihat ambilMengapaPenting).
//  - Linimasa: paragraf isi yang diawali tahun/tanggal
//    ("2024 — ...", "12 Jan 2024: ..."; lihat ambilKronologi).
//  - Istilah kunci: entri referensi berjudul "Istilah: <kata> —
//    <definisi>" (konvensi editorial; lihat ambilIstilah).
// Bila konvensi tidak dipakai editor, seksi itu tidak tampil.
import { createClient } from "@/lib/supabase/server";
import type { PfArtikelPengetahuan, PfReferensi } from "@/lib/lanjutan";

export type JenisPengetahuan = "artikel" | "explainer";
export type TingkatPengetahuan = "pemula" | "menengah" | "mendalam";

export type ExplainerArtikel = PfArtikelPengetahuan & {
  jenis: JenisPengetahuan;
  tingkat: TingkatPengetahuan;
  estimasi_baca_menit: number | null;
  seri_slug: string | null;
};

export type IstilahKunci = {
  istilah: string;
  definisi: string | null;
};

export type ButirKronologi = {
  tanggal: string;
  peristiwa: string;
};

export type IsiBerlapis = {
  /** Paragraf pertama isi (setelah seksi turunan disisihkan). */
  ringkas: string[];
  /** Sisa paragraf isi. */
  mendalam: string[];
  /** Paragraf "Mengapa penting" bila ada di isi; null bila tidak. */
  mengapaPenting: string | null;
  /** Paragraf berawalan tahun/tanggal bila ada di isi. */
  kronologi: ButirKronologi[];
};

const KOLOM_EXPLAINER =
  "id, slug, judul, ringkasan, isi, topik, referensi, status, harian_tanggal, penulis_nama, jenis, tingkat, estimasi_baca_menit, seri_slug";

function keReferensi(v: unknown): PfReferensi[] {
  if (!Array.isArray(v)) return [];
  const hasil: PfReferensi[] = [];
  for (const r of v as unknown[]) {
    if (typeof r === "string") {
      hasil.push({ judul: r, url: null });
    } else if (r && typeof r === "object") {
      const o = r as Record<string, unknown>;
      const judul =
        typeof o.judul === "string"
          ? o.judul
          : typeof o.nama === "string"
            ? o.nama
            : null;
      const url = typeof o.url === "string" ? o.url : null;
      if (judul || url) hasil.push({ judul, url });
    }
  }
  return hasil;
}

function barisExplainer(r: Record<string, unknown>): ExplainerArtikel {
  const jenis =
    r.jenis === "explainer" ? "explainer" : "artikel";
  const tingkatRaw = typeof r.tingkat === "string" ? r.tingkat : "pemula";
  const tingkat: TingkatPengetahuan =
    tingkatRaw === "menengah" || tingkatRaw === "mendalam"
      ? tingkatRaw
      : "pemula";
  return {
    id: String(r.id),
    slug: String(r.slug),
    judul: String(r.judul ?? ""),
    ringkasan: (r.ringkasan as string | null) ?? null,
    isi: (r.isi as string | null) ?? null,
    topik: String(r.topik ?? "umum"),
    referensi: keReferensi(r.referensi),
    status: String(r.status ?? ""),
    harian_tanggal: (r.harian_tanggal as string | null) ?? null,
    penulis_nama: (r.penulis_nama as string | null) ?? null,
    jenis,
    tingkat,
    estimasi_baca_menit:
      typeof r.estimasi_baca_menit === "number"
        ? r.estimasi_baca_menit
        : null,
    seri_slug:
      typeof r.seri_slug === "string" && r.seri_slug
        ? r.seri_slug
        : null,
  };
}

/** Satu artikel pengetahuan lengkap berdasarkan slug (hanya terbit).
 *  Dipakai halaman /pengetahuan/[slug] untuk artikel biasa maupun
 *  explainer. null bila slug tidak ada / draf / tabel belum ada. */
export async function getExplainer(
  slug: string,
): Promise<ExplainerArtikel | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_knowledge_articles")
      .select(KOLOM_EXPLAINER)
      .eq("slug", slug)
      .eq("status", "terbit")
      .maybeSingle();
    if (error || !data) return null;
    return barisExplainer(data as unknown as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Daftar explainer terbit; filter topik opsional. */
export async function getDaftarExplainer(
  topik?: string,
  limit = 24,
): Promise<ExplainerArtikel[]> {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("pf_knowledge_articles")
      .select(KOLOM_EXPLAINER)
      .eq("status", "terbit")
      .eq("jenis", "explainer")
      .order("harian_tanggal", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (topik) query = query.eq("topik", topik);
    const { data, error } = await query;
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map(
      barisExplainer,
    );
  } catch {
    return [];
  }
}

/** Semua artikel terbit dalam satu seri (berdasarkan seri_slug),
 *  termasuk artikel biasa yang diberi seri yang sama. [] bila
 *  seri_slug kosong / belum ada anggota seri yang terbit. */
export async function getSeri(
  seriSlug: string | null | undefined,
): Promise<ExplainerArtikel[]> {
  if (!seriSlug) return [];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pf_knowledge_articles")
      .select(KOLOM_EXPLAINER)
      .eq("status", "terbit")
      .eq("seri_slug", seriSlug)
      .order("harian_tanggal", { ascending: false, nullsFirst: false })
      .order("judul", { ascending: true });
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map(
      barisExplainer,
    );
  } catch {
    return [];
  }
}

/* ============================================================
   Fungsi murni — format explainer berlapis.
   Diekspor agar bisa diuji tanpa database (pola
   hitungBobotPerbandingan di src/lib/data.ts). TIDAK ada yang
   mengarang: seksi yang tidak ada di data menghasilkan null / [].
   ============================================================ */

/** Pecah isi menjadi paragraf (pemisah baris kosong), buang yang
 *  kosong. [] bila isi null/kosong. */
export function paragrafIsi(isi: string | null): string[] {
  if (!isi) return [];
  return isi
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

const POLA_MENGAPA_PENTING = /^mengapa penting\s*[:—–-]?\s*/i;

/** Paragraf "Mengapa penting" bila ada: paragraf yang diawali
 *  frasa itu (judul seksi + isi sesudahnya). null bila tidak ada
 *  paragraf semacam itu — seksi tidak ditampilkan. */
export function ambilMengapaPenting(paragraf: string[]): string | null {
  for (const p of paragraf) {
    if (POLA_MENGAPA_PENTING.test(p)) {
      const isi = p.replace(POLA_MENGAPA_PENTING, "").trim();
      return isi ? isi : null;
    }
  }
  return null;
}

const POLA_KRONOLOGI =
  /^(?:(\d{4}(?:-\d{2}(?:-\d{2})?)?)|(\d{1,2}\s+[A-Za-zÀ-ÿ]+\s+\d{4}))\s*[—–\-:.]\s+([\s\S]+)$/;

/** Paragraf linimasa bila ada: paragraf yang diawali tahun atau
 *  tanggal ("2024 — ...", "2024-03-02: ...",
 *  "12 Januari 2024 — ..."). [] bila tidak ada — seksi linimasa
 *  tidak ditampilkan. */
export function ambilKronologi(paragraf: string[]): ButirKronologi[] {
  const hasil: ButirKronologi[] = [];
  for (const p of paragraf) {
    const cocok = POLA_KRONOLOGI.exec(p.trim());
    if (!cocok) continue;
    const tanggal = (cocok[1] ?? cocok[2] ?? "").trim();
    const peristiwa = (cocok[3] ?? "").trim();
    if (tanggal && peristiwa) hasil.push({ tanggal, peristiwa });
  }
  return hasil;
}

const POLA_ISTILAH = /^istilah:\s*(.+)$/i;

/**
 * Istilah kunci dari referensi — HANYA entri yang judulnya
 * diawali "Istilah: " (konvensi editorial, didokumentasikan di
 * /admin/pengetahuan): "Istilah: Inflasi — kenaikan harga umum".
 * Definisi = teks sesudah pemisah "—" pertama; null bila tidak
 * ada pemisah. Referensi biasa (dengan URL) TIDAK pernah dianggap
 * istilah. [] bila tidak ada — seksi tidak ditampilkan.
 */
export function ambilIstilah(referensi: PfReferensi[]): IstilahKunci[] {
  const hasil: IstilahKunci[] = [];
  for (const r of referensi) {
    if (!r.judul) continue;
    const cocok = POLA_ISTILAH.exec(r.judul.trim());
    if (!cocok) continue;
    const sisa = (cocok[1] ?? "").trim();
    if (!sisa) continue;
    const pisah = sisa.split(/\s+[—–-]\s+/);
    if (pisah.length >= 2) {
      hasil.push({
        istilah: (pisah[0] ?? "").trim(),
        definisi: pisah.slice(1).join(" — ").trim() || null,
      });
    } else {
      hasil.push({ istilah: sisa, definisi: null });
    }
  }
  return hasil;
}

/** Bagi isi menjadi lapis ringkas → mendalam. Paragraf seksi
 *  "Mengapa penting" dan paragraf linimasa disisihkan (ditampilkan
 *  di seksinya sendiri, bukan digandakan di sini). Ringkas =
 *  paragraf pertama yang tersisa; mendalam = sisanya. Bila isi
 *  hanya satu paragraf, mendalam kosong. */
export function bagiIsiBerlapis(isi: string | null): IsiBerlapis {
  const semua = paragrafIsi(isi);
  const mengapaPenting = ambilMengapaPenting(semua);
  const kronologi = ambilKronologi(semua);
  const setKronologi = new Set(kronologi.map((k) => k.peristiwa));
  const sisa = semua.filter((p) => {
    if (POLA_MENGAPA_PENTING.test(p)) return false;
    const cocok = POLA_KRONOLOGI.exec(p.trim());
    if (cocok && setKronologi.has((cocok[3] ?? "").trim())) return false;
    return true;
  });
  return {
    ringkas: sisa.slice(0, 1),
    mendalam: sisa.slice(1),
    mengapaPenting,
    kronologi,
  };
}

/** Label tampil tingkat kesulitan. */
export function labelTingkat(tingkat: string): string {
  if (tingkat === "menengah") return "Menengah";
  if (tingkat === "mendalam") return "Mendalam";
  return "Pemula";
}
