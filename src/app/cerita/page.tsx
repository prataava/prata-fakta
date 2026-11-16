import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import KartuCerita from "@/components/cerita/KartuCerita";
import { getCeritaDiikuti, getDaftarCerita } from "@/lib/cerita";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Cerita yang Diikuti",
  description:
    "Story Tracker PRATA FAKTA: peristiwa yang diikuti perkembangannya — kronologi, berita terkait, dan tombol ikuti.",
};

// Halaman cerita membaca data per request (pola cacheComponents
// untuk rute yang membaca data dinamis).
export const instant = false;

export default async function Cerita() {
  let penggunaId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    penggunaId = data.user?.id ?? null;
  } catch {
    penggunaId = null;
  }
  const [daftar, diikuti] = await Promise.all([
    getDaftarCerita(),
    penggunaId ? getCeritaDiikuti(penggunaId) : Promise.resolve([]),
  ]);
  const idDiikuti = new Set(diikuti.map((c) => c.id));

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-cerita">
        <span className="hero-label">Story Tracker</span>
        <h1 id="judul-cerita">Cerita yang Diikuti</h1>
        <p>
          Peristiwa yang diikuti perkembangannya: kronologi dari awal
          sampai kabar terbaru, beserta berita terkait. Ikuti cerita
          agar tidak ketinggalan perkembangannya.
        </p>
      </section>

      {penggunaId && diikuti.length > 0 && (
        <section className="seksi" aria-labelledby="seksi-diikuti">
          <div className="seksi-kepala">
            <h2 id="seksi-diikuti">Cerita yang Anda ikuti</h2>
            <p>
              <Link href="/timeline?diikuti=ya">
                Lihat kronologi cerita yang Anda ikuti di Timeline →
              </Link>
            </p>
          </div>
          <div className="grid-berita">
            {diikuti.map((c) => (
              <KartuCerita
                key={c.id}
                cerita={c}
                mengikuti
                masuk
                tampilkanIkuti
              />
            ))}
          </div>
        </section>
      )}

      {daftar.length === 0 ? (
        <section className="seksi">
          <EmptyState
            judul="Belum ada cerita yang diterbitkan."
            pesan="Story Tracker akan terisi begitu redaksi mengelompokkan peristiwa menjadi cerita dan menerbitkannya."
          />
        </section>
      ) : (
        <section className="seksi" aria-label="Daftar cerita">
          <div className="seksi-kepala">
            <h2>Semua cerita</h2>
            <p>
              Jelajahi semua cerita yang sudah diterbitkan dan ikuti yang
              menarik bagi Anda — ceritanya akan muncul di bagian atas
              halaman ini.
            </p>
          </div>
          <div className="grid-berita">
            {daftar.map((c) => (
              <KartuCerita
                key={c.id}
                cerita={c}
                mengikuti={idDiikuti.has(c.id)}
                masuk={penggunaId !== null}
                tampilkanIkuti
              />
            ))}
          </div>
        </section>
      )}

      {!penggunaId && (
        <section className="seksi">
          <p>
            <Link className="tombol" href="/masuk">
              Masuk untuk mengikuti cerita
            </Link>
          </p>
        </section>
      )}
    </div>
  );
}
