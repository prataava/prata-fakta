import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Traffic Analytics — Admin",
  description:
    "Kunjungan halaman nyata dari tabel pf_kunjungan (DB sendiri): tanpa layanan pihak ketiga, tanpa IP, tanpa pelacak.",
};

export const instant = false;

type BarisHarian = {
  tanggal: string;
  kunjungan: number;
  pengunjung_masuk: number;
};

type BarisJalur = {
  path: string;
  kunjungan: number;
};

function formatTanggal(tanggal: string): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? tanggal
    : d.toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}

export default async function AdminAnalitik() {
  let tersedia = true;
  let harian: BarisHarian[] = [];
  let jalur: BarisJalur[] = [];
  try {
    const supabase = await createClient();
    const [resHarian, resJalur] = await Promise.all([
      supabase.rpc("pf_kunjungan_harian", { hari: 30 }),
      supabase.rpc("pf_kunjungan_jalur", { hari: 30, batas: 20 }),
    ]);
    if (resHarian.error || resJalur.error) {
      tersedia = false;
    } else {
      harian = ((resHarian.data ?? []) as BarisHarian[]).map((r) => ({
        tanggal: String(r.tanggal),
        kunjungan: Number(r.kunjungan ?? 0),
        pengunjung_masuk: Number(r.pengunjung_masuk ?? 0),
      }));
      jalur = ((resJalur.data ?? []) as BarisJalur[]).map((r) => ({
        path: String(r.path),
        kunjungan: Number(r.kunjungan ?? 0),
      }));
    }
  } catch {
    tersedia = false;
  }

  if (!tersedia) {
    return (
      <section className="seksi">
        <EmptyState
          judul="Analitik belum tersedia"
          pesan="Tabel pf_kunjungan / fungsi agregasi tidak dapat dibaca — migrasi v14 belum dijalankan di Supabase, atau akun Anda belum punya izin baca staf. Halaman ini TIDAK menampilkan angka contoh: tanpa tabel, tidak ada angka kunjungan yang ditampilkan."
        />
        <p>
          Yang tersedia saat ini (angka nyata, dari tabel sendiri):
        </p>
        <ul className="artikel-daftar">
          <li>
            <a href="/admin/kinerja">/admin/kinerja</a> — artikel paling
            dibaca dari pf_reading_history (pengguna login yang membaca
            artikel).
          </li>
          <li>
            <a href="/admin/monitoring">/admin/monitoring</a> — run
            ingestion, antrean item mentah, dan galat aplikasi.
          </li>
          <li>
            <a href="/admin/api-sehat">/admin/api-sehat</a> — status
            /api/health dan run terakhir.
          </li>
        </ul>
      </section>
    );
  }

  const totalKunjungan = harian.reduce((a, r) => a + r.kunjungan, 0);
  const totalMasuk = harian.reduce((a, r) => a + r.pengunjung_masuk, 0);
  const rataHarian =
    harian.length > 0 ? totalKunjungan / harian.length : 0;

  return (
    <>
      <section className="seksi" aria-labelledby="judul-ringkasan">
        <div className="seksi-kepala">
          <h2 id="judul-ringkasan">Kunjungan 30 hari terakhir</h2>
        </div>
        <p>
          Total {totalKunjungan} kunjungan halaman ·{" "}
          {totalMasuk} kunjungan oleh pengguna login (pengunjung anonim
          tidak dihitung sebagai pengguna) · rata-rata{" "}
          {rataHarian.toFixed(1)} kunjungan/hari.
        </p>
        <p className="artikel-meta-kecil">
          Angka nyata dari tabel pf_kunjungan (DB sendiri). Yang
          disimpan hanya path + waktu + status login — tanpa alamat
          IP, tanpa user-agent, tanpa query string. Baris lebih tua
          dari 90 hari dihapus (retensi v14).
        </p>
        {totalKunjungan === 0 ? (
          <p className="artikel-meta-kecil">
            Belum ada kunjungan tercatat dalam 30 hari terakhir — tracker
            baru aktif sesudah migrasi v14, atau belum ada yang membuka
            halaman.
          </p>
        ) : null}
      </section>

      <section className="seksi" aria-labelledby="judul-jalur">
        <div className="seksi-kepala">
          <h2 id="judul-jalur">Halaman teratas (30 hari)</h2>
        </div>
        {jalur.length === 0 ? (
          <p className="artikel-meta-kecil">
            Belum ada halaman yang tercatat.
          </p>
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Halaman</th>
                  <th>Kunjungan</th>
                </tr>
              </thead>
              <tbody>
                {jalur.map((j) => (
                  <tr key={j.path}>
                    <td>{j.path}</td>
                    <td>{j.kunjungan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="seksi" aria-labelledby="judul-harian">
        <div className="seksi-kepala">
          <h2 id="judul-harian">Kunjungan harian (30 hari)</h2>
        </div>
        <div className="tabel-gulir">
          <table className="tabel-data">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Kunjungan</th>
                <th>Pengunjung login (unik)</th>
              </tr>
            </thead>
            <tbody>
              {[...harian].reverse().map((r) => (
                <tr key={r.tanggal}>
                  <td>{formatTanggal(r.tanggal)}</td>
                  <td>{r.kunjungan}</td>
                  <td>{r.pengunjung_masuk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Bacaan artikel (bukan kunjungan halaman):{" "}
          <Link href="/admin/kinerja">/admin/kinerja</Link> — dari
          pf_reading_history.
        </p>
      </section>
    </>
  );
}
