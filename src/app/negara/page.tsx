import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import KartuNegara from "@/components/negara/KartuNegara";
import { getDaftarNegara, getNegaraDenganBerita } from "@/lib/negara";

export const metadata: Metadata = {
  title: "Profil Negara",
  description:
    "Profil negara PRATA FAKTA: identitas, angka bersumber, fakta kunci, berita terbaru, dan data historis per negara.",
};

export const instant = false;

export default async function DaftarNegara() {
  const daftar = await getDaftarNegara();
  const denganBerita = await getNegaraDenganBerita();

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-negara">
        <span className="hero-label">Profil Negara</span>
        <h1 id="judul-negara">Profil Negara</h1>
        <p>
          Identitas, angka bersumber, fakta kunci, berita terbaru, dan data
          historis per negara — semua angka disertai sumber dan periode
          referensinya.
        </p>
      </section>

      {daftar.length === 0 ? (
        <section className="seksi">
          <EmptyState
            judul="Belum ada profil negara."
            pesan="Belum ada profil negara — profil pertama (Indonesia) diisi editor lewat /admin."
            aksi={
              <Link className="tombol" href="/admin/negara">
                Buka Admin Negara
              </Link>
            }
          />
        </section>
      ) : (
        <section className="seksi" aria-label="Daftar negara">
          <div className="grid-berita">
            {daftar.map((n) => (
              <KartuNegara key={n.id} negara={n} />
            ))}
          </div>
          <p className="kartu-meta">
            {denganBerita.length === 0
              ? "Belum ada negara yang punya berita terbit."
              : `${denganBerita.length} ${denganBerita.length === 1 ? "negara" : "negara"} sudah punya berita terbit: ${denganBerita.map((n) => n.nama).join(", ")}.`}
          </p>
        </section>
      )}
    </div>
  );
}
