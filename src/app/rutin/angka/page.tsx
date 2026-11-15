import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import {
  formatAngkaRutin,
  formatTanggalSingkat,
  getIndikatorDenganNilai,
} from "@/lib/rutin";

export const metadata: Metadata = {
  title: "Indonesia in Numbers",
  description:
    "Indikator nasional Indonesia dari data resmi: nilai terakhir, tren yang dihitung agen Data Analysis, sumber, dan metodologi.",
};

// Halaman membaca data per request — rute diblokir di server per
// request (pola resmi cacheComponents, seperti /brief), bukan
// di-prerender.
export const instant = false;

export default async function RutinAngka() {
  const indikator = await getIndikatorDenganNilai();

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-angka">
        <span className="hero-label">Konten rutin · Data</span>
        <h1 id="judul-angka">Indonesia in Numbers</h1>
        <p>
          Indikator nasional dari data resmi: nilai terakhir, tren yang
          dihitung agen Data Analysis dari titik data nyata, sumber, dan
          metodologi. Tanpa angka karangan — indikator tanpa data
          ditandai apa adanya.
        </p>
      </section>

      <section className="seksi" aria-labelledby="seksi-angka">
        <div className="seksi-kepala">
          <h2 id="seksi-angka">Indikator</h2>
          <p>
            {indikator.length === 0
              ? "Belum ada indikator tercatat."
              : `${indikator.length} indikator.`}
          </p>
        </div>
        {indikator.length === 0 ? (
          <EmptyState
            judul="Belum ada indikator"
            pesan="Belum ada indikator data yang tercatat. Indikator diisi redaksi dari sumber resmi, lalu agen Data Analysis menghitung trennya setiap minggu."
            aksi={
              <Link className="tombol tombol-primer" href="/rutin">
                Kembali ke Konten Rutin
              </Link>
            }
          />
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Indikator</th>
                  <th>Kategori</th>
                  <th>Nilai terakhir</th>
                  <th>Tanggal nilai</th>
                  <th>Tren</th>
                  <th>Sumber</th>
                  <th>Metodologi</th>
                  <th>Diperbarui</th>
                </tr>
              </thead>
              <tbody>
                {indikator.map((ind) => (
                  <tr key={ind.id}>
                    <td>{ind.nama}</td>
                    <td>{ind.kategori ?? "—"}</td>
                    <td>
                      {ind.nilai_terakhir === null
                        ? "Belum ada data"
                        : `${formatAngkaRutin(ind.nilai_terakhir)}${ind.satuan ? ` ${ind.satuan}` : ""}`}
                    </td>
                    <td>
                      {ind.tanggal_nilai_terakhir
                        ? formatTanggalSingkat(ind.tanggal_nilai_terakhir)
                        : "—"}
                    </td>
                    <td>{ind.ringkasan_tren ?? "Belum dihitung"}</td>
                    <td>
                      {ind.sumber_url ? (
                        <a
                          href={ind.sumber_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {ind.sumber_nama ?? ind.sumber_url}
                        </a>
                      ) : (
                        (ind.sumber_nama ?? "—")
                      )}
                    </td>
                    <td>{ind.metodologi ?? "—"}</td>
                    <td>
                      {ind.tanggal_pembaruan
                        ? formatTanggalSingkat(ind.tanggal_pembaruan)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
