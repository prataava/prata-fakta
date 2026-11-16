import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import { getKoreksiAdmin } from "@/lib/admin/data";
import { formatWaktu } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "User Reports — Admin",
  description:
    "Laporan masyarakat dari pf_correction_reports (kesalahan informasi, sumber, gambar, duplikat, pembaruan).",
};

export const instant = false;

export default async function AdminLaporanPengguna() {
  const { laporan, tersedia } = await getKoreksiAdmin();

  if (!tersedia) {
    return (
      <section className="seksi">
        <EmptyState
          judul="Laporan pengguna belum tersedia"
          pesan="Tabel pf_correction_reports tidak dapat dibaca — migrasi Fase 2 mungkin belum dijalankan di Supabase, atau akun Anda belum punya izin baca staf."
        />
      </section>
    );
  }

  const perStatus = new Map<string, number>();
  const perJenis = new Map<string, number>();
  for (const l of laporan) {
    perStatus.set(l.status, (perStatus.get(l.status) ?? 0) + 1);
    perJenis.set(l.jenis, (perJenis.get(l.jenis) ?? 0) + 1);
  }

  return (
    <>
      <section className="seksi" aria-labelledby="judul-ringkasan">
        <div className="seksi-kepala">
          <h2 id="judul-ringkasan">Ringkasan Laporan Pengguna</h2>
          <Link href="/admin/koreksi">Moderasi di /admin/koreksi</Link>
        </div>
        <p>
          Total {laporan.length} laporan (100 terbaru). Semua laporan wajib
          dimoderasi sebelum diproses — moderasi dilakukan di{" "}
          <Link href="/admin/koreksi">/admin/koreksi</Link>, halaman ini
          hanya menampilkan.
        </p>
        {laporan.length === 0 ? (
          <p className="artikel-meta-kecil">
            Belum ada laporan pengguna masuk.
          </p>
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {[...perStatus.entries()].map(([status, jumlah]) => (
                  <tr key={status}>
                    <td>{status}</td>
                    <td>{jumlah}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {perJenis.size > 0 && (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Jenis</th>
                  <th>Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {[...perJenis.entries()].map(([jenis, jumlah]) => (
                  <tr key={jenis}>
                    <td>{jenis}</td>
                    <td>{jumlah}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {laporan.length > 0 && (
        <section className="seksi" aria-labelledby="judul-daftar">
          <div className="seksi-kepala">
            <h2 id="judul-daftar">Laporan Terbaru</h2>
          </div>
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Jenis</th>
                  <th>Pesan</th>
                  <th>Artikel</th>
                  <th>Status</th>
                  <th>Nomor lacak</th>
                  <th>Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {laporan.slice(0, 50).map((l) => (
                  <tr key={l.id}>
                    <td>{l.jenis}</td>
                    <td>{l.pesan}</td>
                    <td>{l.artikel_judul ?? l.tautan_artikel ?? "—"}</td>
                    <td>{l.status}</td>
                    <td>{l.nomor_lacak ?? "—"}</td>
                    <td>{formatWaktu(l.dibuat_pada)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
