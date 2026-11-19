import type { Metadata } from "next";
import { connection } from "next/server";
import GlosariumInteraktif from "./GlosariumInteraktif";
import { Reveal } from "@/components/motion";
import { getGlosarium } from "@/lib/glosarium";

export const metadata: Metadata = {
  title: "Glosarium",
  description:
    "Glosarium PRATA FAKTA: istilah hukum, pemerintahan, ekonomi, sosial-budaya, dan pengetahuan — definisi orisinal PRATA dengan tautan ke entri KBBI dan artikel sumber.",
};

// Halaman membaca data per request (istilah pengetahuan dari DB)
// — pola cacheComponents: new Date()/pembacaan data HANYA sesudah
// connection() (pola /pengetahuan).
export const instant = false;

export default async function Glosarium() {
  // Baca data HANYA sesudah connection() — aturan cacheComponents.
  await connection();
  const entri = await getGlosarium();

  return (
    <div className="wadah">
      <Reveal>
        <section className="hero" aria-labelledby="judul-glosarium">
          <span className="hero-label">Glosarium</span>
          <h1 id="judul-glosarium">Glosarium PRATA</h1>
          <p>
            Istilah sulit dari dunia hukum, pemerintahan, ekonomi, dan
            sosial-budaya — dijelaskan dengan definisi orisinal PRATA —
            ditambah istilah kunci dari artikel pengetahuan. Tautan KBBI
            hanya mengarah ke entri resmi KBBI; isinya tidak disalin ke
            sini.
          </p>
        </section>
      </Reveal>

      <Reveal>
        <GlosariumInteraktif entri={entri} />
      </Reveal>
    </div>
  );
}
