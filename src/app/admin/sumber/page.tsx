import type { Metadata } from "next";
import EmptyState from "@/components/EmptyState";
import FormSumber from "@/components/admin/FormSumber";
import TombolAksi from "@/components/admin/TombolAksi";
import { getSumberAdmin } from "@/lib/admin/data";
import { formatWaktu } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Sumber Berita — Admin",
  description: "Kelola sumber berita PRATA FAKTA: tambah, ubah, cek, dan hapus.",
};

export const instant = false;

export default async function AdminSumber() {
  const { sumber, tersedia } = await getSumberAdmin();

  return (
    <>
      <section className="seksi" aria-labelledby="judul-sumber-baru">
        <div className="seksi-kepala">
          <h2 id="judul-sumber-baru">Tambah Sumber</h2>
        </div>
        <article className="kartu">
          <FormSumber />
        </article>
      </section>

      <section className="seksi" aria-labelledby="judul-daftar-sumber">
        <div className="seksi-kepala">
          <h2 id="judul-daftar-sumber">Daftar Sumber</h2>
        </div>
        {!tersedia ? (
          <EmptyState
            judul="Daftar sumber belum tersedia"
            pesan="Tabel sumber tidak dapat dibaca — migrasi Fase 1 mungkin belum dijalankan, atau akun Anda belum punya izin baca staf."
          />
        ) : sumber.length === 0 ? (
          <EmptyState
            judul="Belum ada sumber"
            pesan="Belum ada sumber berita terdaftar. Tambah sumber pertama lewat formulir di atas."
          />
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Jenis</th>
                  <th>URL</th>
                  <th>Prioritas</th>
                  <th>Aktif</th>
                  <th>Cek terakhir</th>
                  <th>Item diambil</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {sumber.map((s) => (
                  <tr key={s.id}>
                    <td>{s.nama}</td>
                    <td>{s.jenis}</td>
                    <td>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.url}
                      </a>
                    </td>
                    <td>{s.prioritas}</td>
                    <td>{s.aktif ? "Ya" : "Tidak"}</td>
                    <td>
                      {formatWaktu(s.terakhir_cek)}
                      {s.status_terakhir ? ` · ${s.status_terakhir}` : ""}
                    </td>
                    <td>{s.jumlah_item}</td>
                    <td>
                      <span className="admin-aksi">
                        <TombolAksi
                          url={`/api/sumber/${s.id}/cek`}
                          label="Cek"
                          labelLoading="Memeriksa…"
                        />
                        <details>
                          <summary>Ubah</summary>
                          <div style={{ marginTop: 12, minWidth: 280 }}>
                            <FormSumber sumber={s} />
                          </div>
                        </details>
                        <TombolAksi
                          url={`/api/sumber/${s.id}`}
                          method="DELETE"
                          label="Hapus"
                          labelLoading="Menghapus…"
                          varian="hantu"
                          konfirmasi={`Hapus sumber "${s.nama}"? Raw item yang sudah diambil tidak ikut terhapus.`}
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
    </>
  );
}
