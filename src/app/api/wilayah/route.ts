import { NextResponse } from "next/server";
import { buatRateLimiter, responRateLimit } from "@/lib/ai/route-auth";
import { urlWilayah, validasiWilayah } from "@/lib/wilayah";

// GET /api/wilayah?tingkat=provinsi|kabupaten|kecamatan|kelurahan&induk=<id>
// Proxy server-side ke API statis Emsifa (www.emsifa.com).
//
// KENAPA PROXY (pekerja F, cabang fitur/izin-browser): fetch klien
// langsung ke emsifa.com DIBLOKIR CSP connect-src produksi
// (hanya 'self' + Supabase) — keempat select wilayah di
// PemilihWilayah kosong di produksi sejak commit 418b578. Fetch
// server-side tidak kena CSP connect-src, jadi server yang
// mengambilnya dan klien hanya memanggil /api/wilayah ('self').
// CSP TIDAK diubah untuk ini.
//
// Data publik, tanpa auth. Data wilayah statis → fetch dengan
// cache revalidate 86400 (1 hari). Upstream gagal → 502/503
// jujur (bukan data palsu). Rate limit 30/menit (fail-open,
// pola /api/cari/saran).
const batasi = buatRateLimiter(30);

export async function GET(req: Request) {
  if (!(await batasi(req))) return responRateLimit();
  const params = new URL(req.url).searchParams;
  const hasil = validasiWilayah(params.get("tingkat"), params.get("induk"));
  if (!hasil.ok) {
    return NextResponse.json(
      { ok: false, error: hasil.error },
      { status: 400 },
    );
  }
  const url = urlWilayah(hasil.tingkat, hasil.induk);
  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: 86400 } });
  } catch (err) {
    console.error("[GET /api/wilayah] upstream tidak terjangkau:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Layanan data wilayah tidak dapat dihubungi. Coba lagi nanti.",
      },
      { status: 503 },
    );
  }
  if (!res.ok) {
    console.error(`[GET /api/wilayah] upstream HTTP ${res.status}`);
    return NextResponse.json(
      {
        ok: false,
        error: "Layanan data wilayah mengembalikan galat. Coba lagi nanti.",
      },
      { status: 502 },
    );
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    console.error("[GET /api/wilayah] upstream mengembalikan bentuk tak terduga");
    return NextResponse.json(
      {
        ok: false,
        error: "Layanan data wilayah mengembalikan data tak terduga.",
      },
      { status: 502 },
    );
  }
  // Teruskan apa adanya (array { id, name }) — klien
  // PemilihWilayah mem-parsing bentuk ini tanpa perubahan.
  return NextResponse.json(data);
}
