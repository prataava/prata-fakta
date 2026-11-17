// Util gambar berita — varian BESAR untuk kartu utama Google /
// Open Graph / JSON-LD (Discover & Top Stories minta gambar
// ≥1200px lebar). Foto sumber tersimpan kecil (Detik w=360,
// Antara cache 800x533) — naikkan lewat parameter resize CDN
// sumbernya sendiri, TANPA menebak URL baru:
//  - akcdn.detik.net.id: ?w=360&q=90 -> ?w=1200&q=80
//    (diuji 17 Nov 2026: w=1200 mengembalikan 200 image/jpeg,
//    170 KB vs 32 KB di w=360 — varian besar NYATA).
//  - img.antaranews.com/cache/800x533/ -> /cache/1200x800/
//    (diuji 17 Nov 2026: 200 image/jpeg, 97 KB vs 80 KB).
// URL lain / tanpa pola yang dikenal: dikembalikan apa adanya.
// Thumbnail kartu daftar TIDAK memakai ini (360px cukup,
// lebih ringan) — hanya hero artikel, og:image, JSON-LD,
// dan sitemap images.
export function gambarBesar(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === "akcdn.detik.net.id") {
      if (u.searchParams.has("w")) {
        u.searchParams.set("w", "1200");
        u.searchParams.set("q", "80");
        return u.toString();
      }
      return url;
    }
    if (u.hostname === "img.antaranews.com") {
      const ganti = u.pathname.replace(
        /\/cache\/\d+x\d+\//,
        "/cache/1200x800/",
      );
      if (ganti !== u.pathname) {
        u.pathname = ganti;
        return u.toString();
      }
      return url;
    }
    return url;
  } catch {
    return url;
  }
}
