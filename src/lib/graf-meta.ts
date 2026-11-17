// Konstanta murni Knowledge Graph v1 (P1-2) — TANPA import server.
// Dipisah dari lib/graf.ts karena komponen klien GrafPengetahuan
// butuh nilai JENIS_SIMPUL + LABEL_JENIS_SIMPUL, sedangkan graf.ts
// mengimpor @/lib/supabase/server (next/headers) yang TIDAK BOLEH
// masuk bundle klien. Pola yang sama dengan lib/verifikasi.ts
// (murni, dipakai server + klien).
//
// v2 (P2-1): tambah simpul "negara" + "kategori" — keduanya dari
// kolom yang SUDAH ADA di pf_articles (negara_kode FK v10,
// kategori_slug), bukan entitas hasil ekstraksi teks.
export const JENIS_SIMPUL = [
  "artikel",
  "klaim",
  "sumber",
  "event",
  "cerita",
  "negara",
  "kategori",
] as const;
export type JenisSimpul = (typeof JENIS_SIMPUL)[number];

export const LABEL_JENIS_SIMPUL: Record<JenisSimpul, string> = {
  artikel: "Artikel",
  klaim: "Klaim",
  sumber: "Sumber",
  event: "Peristiwa",
  cerita: "Cerita",
  negara: "Negara",
  kategori: "Kategori",
};

/**
 * Tautan halaman entitas graf untuk satu simpul, atau null bila
 * simpul itu SUDAH punya halaman sendiri (artikel/klaim/event —
 * jangan duplikasi, tautkan saja). Bentuk id simpul:
 * "<jenis>:<kunci>" (kunci sumber = URL ternormalisasi, kunci
 * negara = kode ISO-2, kunci cerita = slug/UUID, kunci kategori
 * = slug). Fungsi murni agar bisa dipakai komponen klien.
 */
export function hrefEntitasGraf(simpul: {
  id: string;
  jenis: JenisSimpul;
}): string | null {
  const pisah = simpul.id.indexOf(":");
  if (pisah < 0) return null;
  const kunci = simpul.id.slice(pisah + 1);
  if (!kunci) return null;
  switch (simpul.jenis) {
    case "sumber":
    case "negara":
    case "cerita":
    case "kategori":
      return `/graf/${simpul.jenis}/${encodeURIComponent(kunci)}`;
    default:
      return null;
  }
}
