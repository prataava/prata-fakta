import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import CommandPalette from "@/components/CommandPalette";
import PendaftaranSW from "@/components/pwa/PendaftaranSW";
import BannerPembaruan from "@/components/pwa/BannerPembaruan";
import PromptInstalasi from "@/components/pwa/PromptInstalasi";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const serif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
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
    siteName: "PRATA FAKTA",
    locale: "id_ID",
    type: "website",
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
};

// PWA (P3-1): warna tema bilah browser/sistem — sama dengan
// theme_color manifest dan latar midnight situs.
export const viewport: Viewport = {
  themeColor: "#080D18",
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
  const kode = `(function(){try{var t=localStorage.getItem('pf-tema');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
  return <script dangerouslySetInnerHTML={{ __html: kode }} />;
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <TemaInit />
      </head>
      <body className={`${inter.variable} ${serif.variable}`}>
        <Header />
        <main className="konten">{children}</main>
        <Footer />
        <BottomNav />
        <CommandPalette />
        <PendaftaranSW />
        <BannerPembaruan />
        <PromptInstalasi />
      </body>
    </html>
  );
}
