import { NextResponse } from "next/server";
import { buatRateLimiter, responRateLimit } from "@/lib/ai/route-auth";
import { urlNominatimBalik, validasiBalik } from "@/lib/geocode";

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
