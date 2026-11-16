import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import FormRiset from "@/components/riset/FormRiset";
import FormDokumen from "@/components/riset/FormDokumen";
import TombolAksi from "@/components/admin/TombolAksi";
import { getDokumenAdmin, getRisetAdmin } from "@/lib/riset";

export const metadata: Metadata = {
  title: "Riset — Admin",
  description:
    "Kelola laporan riset dan arsip dokumen PRATA FAKTA: tambah, ubah, terbitkan manual, dan hapus.",
};

export const instant = false;

function formatTanggal(tanggal: string | null): string {
  if (!tanggal) return "—";
  const d = new Date(`${tanggal}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

export default async function AdminRiset() {
  const [{ riset, tersedia: risetTersedia }, { dokumen, tersedia: dokumenTersedia }] =
    await Promise.all([getRisetAdmin(), getDokumenAdmin()]);
  const tersedia = risetTersedia && dokumenTersedia;

  return (
    <>
      <section className="seksi" aria-labelledby="judul-riset-baru">
        <div className="seksi-kepala">
          <h2 id="judul-riset-baru">Tambah Laporan Riset</h2>
        </div>
        <article className="kartu">
          <p style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
            Laporan baru selalu berstatus <strong>draf</strong> — tidak
            langsung terbit. Terbitkan manual lewat tombol &ldquo;Terbitkan&rdquo;
            di daftar, sesudah ditinjau.
          </p>
          <FormRiset />
        </article>
      </section>

      <section className="seksi" aria-labelledby="judul-dokumen-baru">
        <div className="seksi-kepala">
          <h2 id="judul-dokumen-baru">Tambah Dokumen Arsip</h2>
        </div>
        <article className="kartu">
          <p style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
            Dokumen hanya metadata + tautan ke sumbernya — jangan salin isi
            berhak cipta.
          </p>
          <FormDokumen />
        </article>
      </section>

      <section className="seksi" aria-labelledby="judul-daftar-riset">
        <div className="seksi-kepala">
          <h2 id="judul-daftar-riset">Daftar Laporan Riset</h2>
        </div>
        {!tersedia ? (
          <EmptyState
            judul="Daftar riset belum tersedia"
            pesan="Tabel riset tidak dapat dibaca — migrasi v10 mungkin belum dijalankan, atau kunci service Supabase belum diatur."
          />
        ) : riset.length === 0 ? (
          <EmptyState
            judul="Belum ada laporan riset"
            pesan="Belum ada laporan riset. Tambah laporan pertama lewat formulir di atas."
          />
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Judul</th>
                  <th>Slug</th>
                  <th>Status</th>
                  <th>Tanggal</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {riset.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.status === "terbit" ? (
                        <Link href={`/riset/${r.slug}`}>{r.judul}</Link>
                      ) : (
                        r.judul
                      )}
                    </td>
                    <td>{r.slug}</td>
                    <td>{r.status}</td>
                    <td>{formatTanggal(r.tanggal)}</td>
                    <td>
                      <span className="admin-aksi">
                        {r.status === "draft" ? (
                          <TombolAksi
                            url={`/api/admin/riset/${r.id}?tipe=riset`}
                            method="PATCH"
                            body={{ status: "terbit" }}
                            label="Terbitkan"
                            labelLoading="Menerbitkan…"
                            konfirmasi={`Terbitkan laporan "${r.judul}"? Pastikan sudah ditinjau.`}
                            varian="primer"
                          />
                        ) : (
                          <TombolAksi
                            url={`/api/admin/riset/${r.id}?tipe=riset`}
                            method="PATCH"
                            body={{ status: "draft" }}
                            label="Tarik ke draf"
                            labelLoading="Menarik…"
                            konfirmasi={`Tarik laporan "${r.judul}" kembali ke draf? Laporan tidak lagi tampil publik.`}
                          />
                        )}
                        <details>
                          <summary>Ubah</summary>
                          <div style={{ marginTop: 12, minWidth: 320 }}>
                            <FormRiset riset={r} />
                          </div>
                        </details>
                        <TombolAksi
                          url={`/api/admin/riset/${r.id}?tipe=riset`}
                          method="DELETE"
                          label="Hapus"
                          labelLoading="Menghapus…"
                          varian="hantu"
                          konfirmasi={`Hapus laporan "${r.judul}"? Tindakan ini tidak bisa dibatalkan.`}
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

      <section className="seksi" aria-labelledby="judul-daftar-dokumen">
        <div className="seksi-kepala">
          <h2 id="judul-daftar-dokumen">Daftar Dokumen Arsip</h2>
        </div>
        {!tersedia ? (
          <EmptyState
            judul="Daftar dokumen belum tersedia"
            pesan="Tabel dokumen tidak dapat dibaca — migrasi v10 mungkin belum dijalankan, atau kunci service Supabase belum diatur."
          />
        ) : dokumen.length === 0 ? (
          <EmptyState
            judul="Belum ada dokumen arsip"
            pesan="Belum ada dokumen arsip. Tambah dokumen pertama lewat formulir di atas."
          />
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Judul</th>
                  <th>Jenis</th>
                  <th>Penerbit</th>
                  <th>Status</th>
                  <th>Tanggal</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {dokumen.map((d) => (
                  <tr key={d.id}>
                    <td>{d.judul}</td>
                    <td>{d.jenis}</td>
                    <td>{d.penerbit ?? "—"}</td>
                    <td>{d.status}</td>
                    <td>{formatTanggal(d.tanggal)}</td>
                    <td>
                      <span className="admin-aksi">
                        <details>
                          <summary>Ubah</summary>
                          <div style={{ marginTop: 12, minWidth: 320 }}>
                            <FormDokumen dokumen={d} />
                          </div>
                        </details>
                        <TombolAksi
                          url={`/api/admin/riset/${d.id}?tipe=dokumen`}
                          method="DELETE"
                          label="Hapus"
                          labelLoading="Menghapus…"
                          varian="hantu"
                          konfirmasi={`Hapus dokumen "${d.judul}"? Tindakan ini tidak bisa dibatalkan.`}
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
