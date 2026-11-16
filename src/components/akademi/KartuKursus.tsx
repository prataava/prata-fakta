import Link from "next/link";
import type { PfKursus, ProgresKursus } from "@/lib/akademi";
import { labelTingkat } from "@/lib/explainer";

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
    <Link className="kartu kartu-artikel" href={`/akademi/${kursus.slug}`}>
      <span className="kartu-kategori">{kursus.kategori}</span>
      <span className="kartu-judul">{kursus.judul}</span>
      {kursus.deskripsi && (
        <span className="kartu-teks">{kursus.deskripsi}</span>
      )}
      <span className="kartu-meta">
        {`Tingkat ${labelTingkat(kursus.tingkat)} · ${kursus.jumlah_modul} modul · ${kursus.jumlah_pelajaran} pelajaran`}
      </span>
      <span className="kartu-meta">
        {progres
          ? progres.total > 0
            ? `Progres Anda: ${progres.selesai} dari ${progres.total} pelajaran selesai`
            : "Belum ada pelajaran di kursus ini."
          : "Masuk untuk melacak progres belajar Anda."}
      </span>
    </Link>
  );
}
