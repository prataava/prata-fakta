// Helper wilayah (Emsifa) — dipindah dari
// src/app/api/wilayah/route.ts (FU2: route.ts dilarang mengekspor
// non-handler; helper yang dipakai lintas-berkas tinggal di lib).
// Diekspor untuk baterai scripts/uji-izin-browser.mjs §F (validasi
// + URL Emsifa) — impor dari "@/lib/wilayah", bukan dari route.

export const TINGKAT_WILAYAH = [
  "provinsi",
  "kabupaten",
  "kecamatan",
  "kelurahan",
] as const;
export type TingkatWilayah = (typeof TINGKAT_WILAYAH)[number];

export type HasilValidasiWilayah =
  | { ok: true; tingkat: TingkatWilayah; induk: string | null }
  | { ok: false; error: string };

/** Validasi murni (diekspor untuk baterai scripts/uji-izin-browser.mjs §F). */
export function validasiWilayah(
  tingkat: string | null,
  induk: string | null,
): HasilValidasiWilayah {
  if (
    !tingkat ||
    !(TINGKAT_WILAYAH as readonly string[]).includes(tingkat)
  ) {
    return {
      ok: false,
      error:
        "Parameter tingkat harus salah satu dari: provinsi, kabupaten, kecamatan, kelurahan.",
    };
  }
  if (tingkat === "provinsi") {
    return { ok: true, tingkat: "provinsi", induk: null };
  }
  if (!induk || !/^\d+$/.test(induk)) {
    return {
      ok: false,
      error: "Parameter induk harus berupa angka (id wilayah induk).",
    };
  }
  return { ok: true, tingkat: tingkat as TingkatWilayah, induk };
}

/** URL Emsifa untuk satu tingkat (diekspor untuk baterai §F). */
export function urlWilayah(
  tingkat: TingkatWilayah,
  induk: string | null,
): string {
  const dasar = "https://www.emsifa.com/api-wilayah-indonesia/api";
  switch (tingkat) {
    case "provinsi":
      return `${dasar}/provinces.json`;
    case "kabupaten":
      return `${dasar}/regencies/${induk}.json`;
    case "kecamatan":
      return `${dasar}/districts/${induk}.json`;
    case "kelurahan":
      return `${dasar}/villages/${induk}.json`;
  }
}
