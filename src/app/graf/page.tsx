// Halaman /graf — Knowledge Graph v1 (P1-2).
// Graf dari relasi yang SUDAH ADA saja (klaim↔sumber lewat
// pf_evidence, artikel↔event lewat pf_events.artikel_id,
// artikel↔cerita lewat pf_story_articles). Tanpa ekstraksi entitas
// baru dari teks (KG v2, P2). Maks 100 simpul per tampilan — batas
// ditulis jujur di UI. Rute diblokir di server per request
// (connection() + <Suspense>, pola cacheComponents); visualisasi
// interaktifnya komponen klien terpisah (GrafPengetahuan).
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import EmptyState from "@/components/EmptyState";
import GrafPengetahuan from "@/components/graf/GrafPengetahuan";
import { getGrafPengetahuan } from "@/lib/graf";

export const metadata: Metadata = {
  title: "Graf Pengetahuan",
  description:
    "Peta relasi klaim, sumber, artikel, peristiwa, dan cerita PRATA FAKTA — dari relasi yang sudah tercatat di sistem.",
};

export const instant = false;

async function IsiGraf() {
  const graf = await getGrafPengetahuan();

  if (!graf.tersedia || graf.simpul.length === 0) {
    return (
      <EmptyState
        judul="Graf pengetahuan masih kosong"
        pesan="Belum ada artikel terbit yang tercatat, jadi belum ada simpul yang bisa digambarkan. Graf terisi otomatis begitu artikel terbit dan klaim, bukti, peristiwa, atau ceritanya tercatat di sistem."
      />
    );
  }

  return <GrafPengetahuan graf={graf} />;
}

export default async function HalamanGraf() {
  await connection();
  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-graf">
        <span className="hero-label">Pengetahuan</span>
        <h1 id="judul-graf">Graf Pengetahuan</h1>
        <p>
          Bagaimana klaim, sumber, artikel, peristiwa, dan cerita saling
          terhubung. Graf ini hanya memakai relasi yang sudah tercatat
          di sistem — klaim dibuktikan oleh sumber, artikel terkait
          dengan peristiwa, dan artikel menjadi bagian dari cerita.
          Tidak ada entitas baru yang ditebak dari teks.
        </p>
      </section>

      <section className="seksi" aria-label="Graf pengetahuan">
        <Suspense fallback={<div className="kerangka" aria-label="Memuat graf pengetahuan…" />}>
          <IsiGraf />
        </Suspense>
      </section>

      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Batas tampilan: maksimal 100 simpul. Bila simpul yang ada
        melebihi batas, graf menampilkan artikel terbit terbaru beserta
        klaim, sumber, peristiwa, dan ceritanya — sisanya tidak
        digambar, dan hal itu ditulis di atas graf.
      </p>
    </div>
  );
}
