// Gambar Open Graph prata-fakta — dihasilkan dinamis sebagai PNG 1200×630
// (next/og + Satori), tanpa file biner di repo. Tema Plasma: aurora
// #050b12 / #0f5e46 / #b04bd6, judul serif Cormorant Garamond di situs
// (di sini memakai tumpukan serif generik — Satori tidak memuat font web).
import { ImageResponse } from "next/og";

export const alt = "PRATA FAKTA — Pahami dunia. Berdasarkan fakta.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px 80px",
          backgroundColor: "#050b12",
          color: "#eef4f6",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Aurora Plasma: gumpalan temaram (tanpa blur — Satori tidak mendukung filter). */}
        <div
          style={{
            position: "absolute",
            width: 560,
            height: 560,
            borderRadius: "50%",
            backgroundColor: "#0f5e46",
            opacity: 0.55,
            top: -180,
            left: -120,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 520,
            height: 520,
            borderRadius: "50%",
            backgroundColor: "#b04bd6",
            opacity: 0.45,
            bottom: -200,
            right: -100,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 300,
            height: 300,
            borderRadius: "50%",
            backgroundColor: "#5fd4ff",
            opacity: 0.25,
            top: 40,
            right: 180,
          }}
        />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 30,
              letterSpacing: 8,
              color: "#5fd4ff",
              fontWeight: 700,
            }}
          >
            PRATA FAKTA
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              lineHeight: 1.15,
              fontFamily: "Georgia, serif",
              marginTop: 16,
            }}
          >
            Pahami dunia.
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              lineHeight: 1.15,
              fontFamily: "Georgia, serif",
            }}
          >
            Berdasarkan fakta.
          </div>
          <div style={{ fontSize: 26, color: "#8fa3ad", marginTop: 24 }}>
            Berita terkini Indonesia dan dunia dengan sumber jelas,
            pemeriksaan fakta, data, dan kronologi.
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 40 }}>
            <div
              style={{ width: 64, height: 6, backgroundColor: "#b04bd6", borderRadius: 3 }}
            />
            <div style={{ fontSize: 24, color: "#8fa3ad", marginLeft: 16 }}>
              prata-fakta.vercel.app
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
