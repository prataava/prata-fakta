import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, JetBrains_Mono, Onest } from "next/font/google";
import "./globals.css";
import "./motion.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import CommandPalette from "@/components/CommandPalette";
import { MotionProvider } from "@/components/motion/MotionProvider";
import PendaftaranSW from "@/components/pwa/PendaftaranSW";
import BannerPembaruan from "@/components/pwa/BannerPembaruan";
import PromptInstalasi from "@/components/pwa/PromptInstalasi";

// Plasma UI (25 Nov 2026): tiga font dari spek terukur
// ~/workspace/plasma-ui-design-spec.md §3 (CruxGarden/plasma-ui):
// judul serif Cormorant Garamond 500/600, body Onest 400/500,
// nilai/kode JetBrains Mono. Dimuat via next/font (self-hosted,
// tanpa request eksternal — CSP tidak perlu diubah).
const serif = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const sans = Onest({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://prata-fakta.vercel.app"),
  title: {
    default: "PRATA FAKTA — Pahami dunia. Berdasarkan fakta.",
    template: "%s — PRATA FAKTA",
  },
  description:
    "Platform berita dan pengetahuan digital: berita terkini Indonesia dan dunia dengan sumber jelas, pemeriksaan fakta, data, dan kronologi.",
  openGraph: {
    title: "PRATA FAKTA — Pahami dunia. Berdasarkan fakta.",
    description:
      "Platform berita dan pengetahuan digital: berita terkini Indonesia dan dunia dengan sumber jelas, pemeriksaan fakta, data, dan kronologi.",
    url: "https://prata-fakta.vercel.app",
    siteName: "PRATA FAKTA",
    locale: "id_ID",
    type: "website",
    images: [
      {
        url: "https://prata-fakta.vercel.app/opengraph-image",
        width: 1200,
        height: 630,
        alt: "PRATA FAKTA — Pahami dunia. Berdasarkan fakta.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PRATA FAKTA — Pahami dunia. Berdasarkan fakta.",
    description:
      "Platform berita dan pengetahuan digital: berita terkini Indonesia dan dunia dengan sumber jelas, pemeriksaan fakta, data, dan kronologi.",
    images: ["https://prata-fakta.vercel.app/opengraph-image"],
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
};

// PWA (P3-1): warna tema bilah browser/sistem — sama dengan
// theme_color manifest dan latar aurora Plasma (#050b12, spek §2).
export const viewport: Viewport = {
  themeColor: "#050b12",
};

/** Skrip tema anti-kedip: dipasang sebelum render agar tema tersimpan
 *  (localStorage) diterapkan sebelum CSS pertama kali dilukis.
 *  Diizinkan CSP lewat HASH sha256 (konstanta HASH_SKRIP_TEMA di
 *  src/lib/csp.ts) — BUKAN nonce: membaca nonce di layout ini
 *  (headers()) memaksa SEMUA halaman dinamis dan mematahkan build
 *  (prerender /_not-found + /kategori/[slug] gagal, Tahap 14).
 *  Isi skrip ini STATIS — bila diubah satu karakter saja, hitung
 *  ulang hash-nya (lihat komentar di csp.ts) dan perbarui konstanta;
 *  bila tidak, CSP memblokir skrip ini dan halaman membuka dengan
 *  tema salah (kedip). */
function TemaInit() {
  const kode = `(function(){try{var t=localStorage.getItem('pf-tema');if(!t){t='dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;
  return <script dangerouslySetInnerHTML={{ __html: kode }} />;
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <TemaInit />
        {/* Google AdSense — verifikasi situs + penayangan iklan (pub-1916865860801626) */}
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1916865860801626"
          crossOrigin="anonymous"
        />
      </head>
      <body className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
        <Header />
        {/* Fase 3: MotionProvider membungkus <main> + BottomNav +
          CommandPalette saja — Header/Footer tetap di luar agar
          server component tetap prerender; children server boleh
          dilewatkan ke client component (pola resmi Next.js). */}
        <MotionProvider>
          <main className="konten">{children}</main>
          <BottomNav />
          <CommandPalette />
        </MotionProvider>
        <Footer />
        <PendaftaranSW />
        <BannerPembaruan />
        <PromptInstalasi />
      </body>
    </html>
  );
}
