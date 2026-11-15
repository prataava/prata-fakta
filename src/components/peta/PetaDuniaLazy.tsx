// Pembungkus client untuk PetaDunia.
// next/dynamic dengan ssr:false TIDAK BOLEH dipanggil dari Server
// Component (Next 16 menolak saat build) — jadi dynamic import
// Leaflet dilakukan di berkas client ini, dan halaman server
// (/peta) hanya merender <PetaDuniaLazy>.
"use client";

import dynamic from "next/dynamic";
import type { MarkerPeta } from "./PetaDunia";

// CSS Leaflet hanya dimuat bersama peta (Fase 7) — sebelumnya
// diimpor global di layout sehingga membebani semua halaman.
import "leaflet/dist/leaflet.css";

const PetaDunia = dynamic(() => import("./PetaDunia"), {
  ssr: false,
  loading: () => <div className="kerangka" aria-label="Memuat peta…" />,
});

export default function PetaDuniaLazy({ marker }: { marker: MarkerPeta[] }) {
  return <PetaDunia marker={marker} />;
}
