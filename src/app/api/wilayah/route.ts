import { NextResponse } from "next/server";
import { buatRateLimiter, responRateLimit } from "@/lib/ai/route-auth";

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
