// Konstanta murni Knowledge Graph v1 (P1-2) — TANPA import server.
// Dipisah dari lib/graf.ts karena komponen klien GrafPengetahuan
// butuh nilai JENIS_SIMPUL + LABEL_JENIS_SIMPUL, sedangkan graf.ts
// mengimpor @/lib/supabase/server (next/headers) yang TIDAK BOLEH
// masuk bundle klien. Pola yang sama dengan lib/verifikasi.ts
// (murni, dipakai server + klien).
export const JENIS_SIMPUL = [
  "artikel",
  "klaim",
  "sumber",
  "event",
  "cerita",
] as const;
export type JenisSimpul = (typeof JENIS_SIMPUL)[number];

export const LABEL_JENIS_SIMPUL: Record<JenisSimpul, string> = {
  artikel: "Artikel",
  klaim: "Klaim",
  sumber: "Sumber",
  event: "Peristiwa",
  cerita: "Cerita",
};
