import type { Metadata } from "next";
import FormArtikel from "@/components/admin/FormArtikel";
import { getKategori } from "@/lib/data";

export const metadata: Metadata = {
  title: "Artikel Baru — Admin",
  description: "Buat artikel baru PRATA FAKTA.",
};

export const instant = false;

export default async function AdminArtikelBaru() {
  const kategori = await getKategori();
  return (
    <section className="seksi" aria-labelledby="judul-artikel-baru">
      <div className="seksi-kepala">
        <h2 id="judul-artikel-baru">Artikel Baru</h2>
      </div>
      <p className="artikel-meta-kecil">
        Artikel baru tersimpan sebagai draft. Terbitkan dari halaman detail
        artikel sesudah lolos review dan verifikasi.
      </p>
      <FormArtikel kategori={kategori} />
    </section>
  );
}
