// robots.txt PRATA FAKTA.
// Publik boleh di-crawl; area non-publik dilarang: /admin/ (dashboard
// staf), /api/ (endpoint), /feed-saya dan /profil (halaman pengguna
// yang butuh login). Sitemap menunjuk ke sitemap dinamis.
import type { MetadataRoute } from "next";
import { urlSitus } from "@/lib/situs";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/feed-saya", "/profil"],
    },
    sitemap: `${urlSitus()}/sitemap.xml`,
  };
}
