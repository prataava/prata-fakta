import type { PfKursus, ProgresKursus } from "@/lib/akademi";
import { labelTingkat } from "@/lib/explainer";
import Kartu from "@/components/Kartu";

// Kartu kursus untuk daftar /akademi. Progres (x/y pelajaran
// selesai) hanya tampil bila pengguna login — angkanya nyata dari
// pf_course_progress; bila null, tampil ajakan masuk yang jujur.
export default function KartuKursus({
  kursus,
  progres,
}: {
  kursus: PfKursus;
  progres: ProgresKursus | null;
}) {
  return (
    <Kartu
      href={`/akademi/${kursus.slug}`}
      kategori={kursus.kategori}
      judul={kursus.judul}
      teks={kursus.deskripsi ?? undefined}
      meta={`Tingkat ${labelTingkat(kursus.tingkat)} · ${kursus.jumlah_modul} modul · ${kursus.jumlah_pelajaran} pelajaran`}
      metaTambahan={
        progres
          ? progres.total > 0
            ? `Progres Anda: ${progres.selesai} dari ${progres.total} pelajaran selesai`
            : "Belum ada pelajaran di kursus ini."
          : "Masuk untuk melacak progres belajar Anda."
      }
    />
  );
}
