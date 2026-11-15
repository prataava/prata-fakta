import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import TombolAksi from "@/components/admin/TombolAksi";
import { getBriefAdmin } from "@/lib/admin/data";
import { formatTanggal, formatWaktu } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Daily Brief — Admin",
  description: "Kelola Daily Brief: lihat draf dan terbitkan edisi.",
};

export const instant = false;

export default async function AdminBrief() {
  const { brief, tersedia } = await getBriefAdmin();

  return (
    <section className="seksi" aria-labelledby="judul-brief-admin">
      <div className="seksi-kepala">
        <h2 id="judul-brief-admin">Daily Brief</h2>
        <Link href="/brief">Lihat halaman publik</Link>
      </div>
      <p className="artikel-meta-kecil">
        Brief disusun setiap pagi oleh agen Daily Brief. Terbitkan draf di
        sini agar tampil di halaman publik.
      </p>

      {!tersedia ? (
        <EmptyState
          judul="Daftar brief belum tersedia"
          pesan="Tabel Daily Brief tidak dapat dibaca — migrasi Fase 4 mungkin belum dijalankan, atau akun Anda belum punya izin baca staf."
        />
      ) : brief.length === 0 ? (
        <EmptyState
          judul="Belum ada Daily Brief"
          pesan="Belum ada brief yang disusun — draf pertama dibuat agen Daily Brief (Fase 4) setiap pagi 05.00 WIB."
        />
      ) : (
        <div className="tabel-gulir">
          <table className="tabel-data">
            <thead>
              <tr>
                <th>Tanggal edisi</th>
                <th>Status</th>
                <th>Jumlah entri</th>
                <th>Dibuat</th>
                <th>Diterbitkan</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {brief.map((b) => (
                <tr key={b.id}>
                  <td>{formatTanggal(b.tanggal)}</td>
                  <td>{b.status}</td>
                  <td>{b.jumlah_entri}</td>
                  <td>{formatWaktu(b.dibuat_pada)}</td>
                  <td>{formatWaktu(b.diterbitkan_pada)}</td>
                  <td>
                    {b.status === "draft" ? (
                      <TombolAksi
                        url={`/api/admin/brief/${b.id}/terbitkan`}
                        label="Terbitkan"
                        labelLoading="Menerbitkan…"
                        varian="primer"
                        konfirmasi={`Terbitkan Daily Brief edisi ${formatTanggal(b.tanggal)}?`}
                      />
                    ) : (
                      <Link href="/brief">Lihat publik</Link>
                    )}
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
