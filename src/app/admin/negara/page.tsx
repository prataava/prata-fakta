import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import TombolAksi from "@/components/admin/TombolAksi";
import FormNegara from "@/components/negara/FormNegara";
import FormFaktaNegara from "@/components/negara/FormFaktaNegara";
import { formatAngka, getNegaraAdmin, punyaSumber } from "@/lib/negara";

export const metadata: Metadata = {
  title: "Profil Negara — Admin",
  description:
    "Kelola profil negara PRATA FAKTA: tambah, ubah, dan hapus negara beserta fakta kuncinya.",
};

export const instant = false;

export default async function AdminNegara() {
  const { negara, fakta, tersedia } = await getNegaraAdmin();

  return (
    <>
      <section className="seksi" aria-labelledby="judul-negara-baru">
        <div className="seksi-kepala">
          <h2 id="judul-negara-baru">Tambah Negara</h2>
          <p>
            Data awal hanya Indonesia dari sumber resmi (mis. BPS). Jangan
            mengarang angka: angka tanpa sumber tidak akan tampil di publik.
          </p>
        </div>
        <article className="kartu">
          <FormNegara />
        </article>
      </section>

      <section className="seksi" aria-labelledby="judul-daftar-negara">
        <div className="seksi-kepala">
          <h2 id="judul-daftar-negara">Daftar Negara</h2>
        </div>
        {!tersedia ? (
          <EmptyState
            judul="Daftar negara belum tersedia"
            pesan="Tabel negara tidak dapat dibaca — migrasi v10 mungkin belum dijalankan, atau akun Anda belum punya izin baca staf."
          />
        ) : negara.length === 0 ? (
          <EmptyState
            judul="Belum ada profil negara"
            pesan="Belum ada profil negara — tambah profil pertama (Indonesia) lewat formulir di atas."
          />
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Nama</th>
                  <th>Ibu kota</th>
                  <th>Populasi</th>
                  <th>Sumber</th>
                  <th>Fakta</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {negara.map((n) => (
                  <tr key={n.id}>
                    <td>{n.kode}</td>
                    <td>
                      <Link href={`/negara/${n.kode}`}>{n.nama}</Link>
                    </td>
                    <td>{n.ibu_kota ?? "—"}</td>
                    <td>
                      {punyaSumber(n.sumber) && n.populasi !== null
                        ? formatAngka(n.populasi)
                        : "—"}
                    </td>
                    <td>
                      {n.sumber ?? "—"}
                      {n.periode_referensi ? ` (${n.periode_referensi})` : ""}
                    </td>
                    <td>{(fakta[n.id] ?? []).length}</td>
                    <td>
                      <span className="admin-aksi">
                        <details>
                          <summary>Ubah</summary>
                          <div style={{ marginTop: 12, minWidth: 280 }}>
                            <FormNegara negara={n} />
                          </div>
                        </details>
                        <TombolAksi
                          url={`/api/admin/negara/${n.id}`}
                          method="DELETE"
                          label="Hapus"
                          labelLoading="Menghapus…"
                          varian="hantu"
                          konfirmasi={`Hapus negara "${n.nama}" beserta semua faktanya? Artikel, event, dan indikator yang merujuk negara ini akan kehilangan rujukannya.`}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {tersedia &&
        negara.map((n) => (
          <section
            className="seksi"
            aria-labelledby={`judul-fakta-${n.kode}`}
            key={n.id}
          >
            <div className="seksi-kepala">
              <h2 id={`judul-fakta-${n.kode}`}>Fakta — {n.nama}</h2>
            </div>
            {(fakta[n.id] ?? []).length === 0 ? (
              <EmptyState
                judul="Belum ada fakta kunci."
                pesan={`Belum ada fakta kunci untuk ${n.nama}. Tambah fakta pertama lewat formulir di bawah.`}
              />
            ) : (
              <div className="tabel-gulir">
                <table className="tabel-data">
                  <thead>
                    <tr>
                      <th>Kunci</th>
                      <th>Nilai</th>
                      <th>Satuan</th>
                      <th>Sumber</th>
                      <th>Periode</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fakta[n.id] ?? []).map((f) => (
                      <tr key={f.id}>
                        <td>{f.kunci}</td>
                        <td>{f.nilai}</td>
                        <td>{f.satuan ?? "—"}</td>
                        <td>{f.sumber ?? "—"}</td>
                        <td>{f.periode ?? "—"}</td>
                        <td>
                          <TombolAksi
                            url={`/api/admin/negara/${f.id}`}
                            method="DELETE"
                            label="Hapus"
                            labelLoading="Menghapus…"
                            varian="hantu"
                            konfirmasi={`Hapus fakta "${f.kunci}" untuk ${n.nama}?`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <article className="kartu" style={{ marginTop: 12 }}>
              <FormFaktaNegara countryId={n.id} namaNegara={n.nama} />
            </article>
          </section>
        ))}
    </>
  );
}
