import { NextResponse } from "next/server";
import { buatRateLimiter, responRateLimit } from "@/lib/ai/route-auth";

// GET /api/geocode/balik?lat=..&lon=.. → hasil reverse Nominatim.
// Proxy server-side ke nominatim.openstreetmap.org/reverse.
//
// KENAPA PROXY (pekerja F, cabang fitur/izin-browser): fetch klien
// langsung ke Nominatim DIBLOKIR CSP connect-src produksi
// (hanya 'self' + Supabase), dan fetch peramban TIDAK mengizinkan
// header User-Agent kustom — padahal kebijakan OSM mewajibkan UA
// valid (maks 1 req/detik). Di server, UA "PRATA-FAKTA/1.0" boleh
// diset. CSP TIDAK diubah untuk ini.
//
// Data publik, tanpa auth. Upstream gagal → 502/503 jujur (bukan
// data palsu). Rate limit 30/menit (fail-open, pola
// /api/cari/saran) — dalam batas kebijakan Nominatim 1 req/detik.
// Server TIDAK menyimpan koordinat; koordinat hanya diteruskan ke
// Nominatim untuk mencari nama tempat.
const batasi = buatRateLimiter(30);

const UA = "PRATA-FAKTA/1.0";

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

export async function GET(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  const params = new URL(req.url).searchParams;
  const hasil = validasiBalik(params.get("lat"), params.get("lon"));
  if (!hasil.ok) {
    return NextResponse.json(
      { ok: false, error: hasil.error },
      { status: 400 },
    );
  }
  let res: Response;
  try {
    res = await fetch(urlNominatimBalik(hasil.lat, hasil.lon), {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
  } catch (err) {
    console.error("[GET /api/geocode/balik] upstream tidak terjangkau:", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan geocode tidak dapat dihubungi. Coba lagi nanti.",
      },
      { status: 503 },
    );
  }
  if (!res.ok) {
    console.error(`[GET /api/geocode/balik] upstream HTTP ${res.status}`);
    return NextResponse.json(
      {
        ok: false,
        error: "Layanan geocode mengembalikan galat. Coba lagi nanti.",
      },
      { status: 502 },
    );
  }
  const data: unknown = await res.json();
  // Teruskan apa adanya — klien membaca .address (PemilihWilayah)
  // / .display_name (SeksiIzin) tanpa perubahan.
  return NextResponse.json(data);
}
