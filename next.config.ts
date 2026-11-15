import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        // Header keamanan untuk semua rute (Fase 7).
        // CSP belum dipasang — CSP butuh pengujian nonce/hash dan
        // berisiko memblokir skrip tema anti-kedip di <head>;
        // dicatat sebagai pekerjaan lanjutan di LAPORAN-AKHIR.md.
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // Sitemap, robots, dan RSS berubah tiap ada artikel baru —
        // cache publik 15 menit, selebihnya baca segar.
        source: "/(sitemap.xml|robots.txt|rss.xml)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=900, s-maxage=900",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
