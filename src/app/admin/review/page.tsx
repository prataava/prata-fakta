import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import daftar from "@/components/admin/daftar-padat.module.css";
import { Reveal } from "@/components/motion";
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
    <Reveal>
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
        <ul className={daftar.daftar}>
          {antrean.map((a) => (
            <li key={a.id} className={daftar.baris}>
              <span className={daftar.judul}>
                <Link href={`/admin/review/${a.id}`}>{a.judul}</Link>
              </span>
              <span className={daftar.meta}>
                {labelStatusArtikel(a.status)}
              </span>
              <span className={kelasLencanaStatus(a.status_verifikasi)}>
                {labelStatusVerifikasi(a.status_verifikasi)}
              </span>
              <span className={daftar.meta}>
                Verifikasi: {a.verifikasi_terakhir ?? "—"}
              </span>
              <span className={daftar.meta}>
                {a.review_terakhir
                  ? `${a.review_terakhir.keputusan} · ${formatTanggal(a.review_terakhir.dibuat_pada)}`
                  : "Belum direview"}
              </span>
              <span className={daftar.meta}>
                {formatTanggal(a.dibuat_pada)}
              </span>
              <Link
                href={`/admin/review/${a.id}`}
                className={daftar.aksi}
              >
                Review →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
    </Reveal>
  );
}
