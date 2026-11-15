import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import { getAntreanAdmin } from "@/lib/admin/data";
import { formatTanggal, labelStatusArtikel } from "@/lib/admin/format";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";

export const metadata: Metadata = {
  title: "Antrean Review — Admin",
  description: "Artikel yang menunggu keputusan review editorial.",
};

export const instant = false;

export default async function AdminReview() {
  const { antrean, tersedia } = await getAntreanAdmin();

  return (
    <section className="seksi" aria-labelledby="judul-antrean">
      <div className="seksi-kepala">
        <h2 id="judul-antrean">Antrean Review</h2>
      </div>
      <p className="artikel-meta-kecil">
        Artikel draft, terjadwal, belum terkonfirmasi, atau disengketakan —
        menunggu keputusan Setujui / Tolak / Kembalikan.
      </p>

      {!tersedia ? (
        <EmptyState
          judul="Antrean belum tersedia"
          pesan="Tabel artikel tidak dapat dibaca — migrasi mungkin belum dijalankan, atau akun Anda belum punya izin baca staf."
        />
      ) : antrean.length === 0 ? (
        <EmptyState
          judul="Antrean kosong"
          pesan="Tidak ada artikel yang menunggu review saat ini."
        />
      ) : (
        <div className="tabel-gulir">
          <table className="tabel-data">
            <thead>
              <tr>
                <th>Judul</th>
                <th>Status</th>
                <th>Verifikasi</th>
                <th>Verifikasi terakhir</th>
                <th>Review terakhir</th>
                <th>Dibuat</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {antrean.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/admin/review/${a.id}`}>{a.judul}</Link>
                  </td>
                  <td>{labelStatusArtikel(a.status)}</td>
                  <td>
                    <span className={kelasLencanaStatus(a.status_verifikasi)}>
                      {labelStatusVerifikasi(a.status_verifikasi)}
                    </span>
                  </td>
                  <td>{a.verifikasi_terakhir ?? "—"}</td>
                  <td>
                    {a.review_terakhir
                      ? `${a.review_terakhir.keputusan} · ${formatTanggal(a.review_terakhir.dibuat_pada)}`
                      : "—"}
                  </td>
                  <td>{formatTanggal(a.dibuat_pada)}</td>
                  <td>
                    <Link href={`/admin/review/${a.id}`}>Review</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
