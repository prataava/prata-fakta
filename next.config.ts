import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        // Header keamanan untuk semua rute (Fase 7).
        // CSP TIDAK di sini: butuh nonce unik per request, jadi
        // dipasang di src/proxy.ts (Tahap 13B, lihat src/lib/csp.ts)
        // — header statis di next.config tidak bisa membawa nonce.
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
