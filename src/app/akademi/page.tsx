import type { Metadata } from "next";
import EmptyState from "@/components/EmptyState";
import KartuKursus from "@/components/akademi/KartuKursus";
import { getKursusTerbit, getProgresPerKursus } from "@/lib/akademi";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "PRATA Academy",
  description:
    "Kursus belajar terstruktur PRATA FAKTA: materi, artikel, dan kuis dengan pembahasan — progres belajar Anda tersimpan.",
};

// Halaman akademi membaca data per request (pola cacheComponents
// untuk rute yang membaca data dinamis).
export const instant = false;

export default async function Akademi() {
  const kursus = await getKursusTerbit();

  // Progres nyata dari pf_course_progress — hanya bila login.
  let progresPerKursus: Awaited<
    ReturnType<typeof getProgresPerKursus>
  > | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      progresPerKursus = await getProgresPerKursus(data.user.id);
    }
  } catch {
    progresPerKursus = null;
  }

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-akademi">
        <span className="hero-label">PRATA Academy</span>
        <h1 id="judul-akademi">Belajar Terstruktur</h1>
        <p>
          Kursus belajar dari redaksi PRATA FAKTA: materi yang
          dijelaskan langkah demi langkah, artikel rujukan, dan kuis
          dengan pembahasan jawaban. Progres belajar Anda tersimpan
          bila Anda masuk.
        </p>
      </section>

      {kursus.length === 0 ? (
        <section className="seksi">
          <EmptyState
            judul="Belum ada kursus terbit."
            pesan="Redaksi sedang menyusun kursus pertama PRATA Academy. Kursus akan tampil di sini begitu diterbitkan."
          />
        </section>
      ) : (
        <section className="seksi" aria-label="Daftar kursus">
          <div className="grid-berita">
            {kursus.map((k) => (
              <KartuKursus
                key={k.id}
                kursus={k}
                progres={progresPerKursus?.get(k.id) ?? null}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
