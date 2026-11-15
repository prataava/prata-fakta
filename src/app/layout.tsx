import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";

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
};

/** Skrip tema anti-kedip: dipasang sebelum render agar tema tersimpan
 *  (localStorage) diterapkan sebelum CSS pertama kali dilukis. */
function TemaInit() {
  const kode = `(function(){try{var t=localStorage.getItem('pf-tema');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
  return <script dangerouslySetInnerHTML={{ __html: kode }} />;
}

export default function RootLayout({
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
      </body>
    </html>
  );
}
