import type { Metadata } from "next";
import EmptyState from "@/components/EmptyState";
import FormJob from "@/components/admin/FormJob";
import FormKategori from "@/components/admin/FormKategori";
import TombolAksi from "@/components/admin/TombolAksi";
import { getSistemAdmin } from "@/lib/admin/data";
import { formatWaktu } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Sistem — Admin",
  description: "Kelola job terjadwal dan kategori PRATA FAKTA.",
};

export const instant = false;

export default async function AdminSistem() {
  const { jobs, kategori, tersedia } = await getSistemAdmin();

  if (!tersedia) {
    return (
      <section className="seksi">
        <EmptyState
          judul="Pengaturan sistem belum tersedia"
          pesan="Tabel job terjadwal dan kategori tidak dapat dibaca — migrasi Fase 1/5 mungkin belum dijalankan, atau akun Anda belum punya izin baca staf."
        />
      </section>
    );
  }

  return (
    <>
      <section className="seksi" aria-labelledby="judul-jobs">
        <div className="seksi-kepala">
          <h2 id="judul-jobs">Job Terjadwal</h2>
        </div>
        {jobs.length === 0 ? (
          <p className="artikel-meta-kecil">
            Belum ada job terjadwal — seed jadwal (ingestion, editorial,
            brief) masuk lewat migrasi Fase 5.
          </p>
        ) : (
          jobs.map((j) => (
            <article className="kartu" key={j.id} style={{ marginBottom: 16 }}>
              <span className="kartu-kategori">
                {j.nama} · {j.aktif ? "Aktif" : "Nonaktif"} · Status terakhir:{" "}
                {j.status_terakhir}
              </span>
              <span className="kartu-teks">
                {j.deskripsi ?? "Tanpa deskripsi."}
              </span>
              <span className="kartu-meta">
                Terakhir jalan: {formatWaktu(j.terakhir_jalan)}
                {j.error_terakhir ? ` · Error: ${j.error_terakhir}` : ""}
              </span>
              <FormJob job={j} />
            </article>
          ))
        )}
      </section>

      <section className="seksi" aria-labelledby="judul-kategori-sistem">
        <div className="seksi-kepala">
          <h2 id="judul-kategori-sistem">Kategori</h2>
        </div>
        <article className="kartu" style={{ marginBottom: 16 }}>
          <span className="kartu-kategori">Kategori baru</span>
          <FormKategori />
        </article>
        {kategori.length === 0 ? (
          <p className="artikel-meta-kecil">Belum ada kategori di database.</p>
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Slug</th>
                  <th>Nama</th>
                  <th>Urutan</th>
                  <th>Aktif</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {kategori.map((k) => (
                  <tr key={k.id}>
                    <td>{k.slug}</td>
                    <td>{k.nama}</td>
                    <td>{k.urutan}</td>
                    <td>{k.aktif ? "Ya" : "Tidak"}</td>
                    <td>
                      <details>
                        <summary>Ubah</summary>
                        <div style={{ marginTop: 12 }}>
                          <FormKategori kategori={k} />
                        </div>
                      </details>{" "}
                      <TombolAksi
                        url={`/api/admin/sistem/kategori/${k.id}`}
                        method="DELETE"
                        label="Hapus"
                        labelLoading="Menghapus…"
                        varian="hantu"
                        konfirmasi={`Hapus kategori "${k.nama}"? Kategori yang dipakai artikel tidak bisa dihapus.`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
