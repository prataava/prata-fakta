// Helper reverse-geocode (Nominatim) — dipindah dari
// src/app/api/geocode/balik/route.ts (FU2: route.ts dilarang
// mengekspor non-handler; helper yang dipakai lintas-berkas
// tinggal di lib). Diekspor untuk baterai
// scripts/uji-izin-browser.mjs §F (validasi + URL Nominatim) —
// impor dari "@/lib/geocode", bukan dari route.

export type HasilValidasiBalik =
  | { ok: true; lat: number; lon: number }
  | { ok: false; error: string };

/** Validasi murni (diekspor untuk baterai scripts/uji-izin-browser.mjs §F). */
export function validasiBalik(
  latRaw: string | null,
  lonRaw: string | null,
): HasilValidasiBalik {
  const lat =
    latRaw !== null && latRaw.trim() !== "" ? Number(latRaw) : Number.NaN;
  const lon =
    lonRaw !== null && lonRaw.trim() !== "" ? Number(lonRaw) : Number.NaN;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return {
      ok: false,
      error: "Parameter lat harus angka antara -90 dan 90.",
    };
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return {
      ok: false,
      error: "Parameter lon harus angka antara -180 dan 180.",
    };
  }
  return { ok: true, lat, lon };
}

/** URL Nominatim reverse (diekspor untuk baterai §F). */
export function urlNominatimBalik(lat: number, lon: number): string {
  return `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10`;
}
