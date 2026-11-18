import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import FormArtikel from "@/components/admin/FormArtikel";
import FormJadwalkan from "@/components/admin/FormJadwalkan";
import TombolAksi from "@/components/admin/TombolAksi";
import { getArtikelAdmin } from "@/lib/admin/data";
import { getKategori } from "@/lib/data";
import { formatTanggal, formatWaktu, labelStatusArtikel } from "@/lib/admin/format";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";

export const metadata: Metadata = {
  title: "Detail Artikel — Admin",
  description: "Edit artikel, terbitkan, jadwalkan, atau hapus.",
};

export const instant = false;

export default async function AdminArtikelDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [artikel, kategori] = await Promise.all([
    getArtikelAdmin(id),
    getKategori(),
  ]);

  if (!artikel) {
    return (
      <section className="seksi">
        <EmptyState
          judul="Artikel tidak ditemukan"
          pesan="Artikel dengan id ini tidak ada, sudah dihapus, atau tidak dapat dibaca dengan izin akun Anda."
          aksi={
            <Link className="tombol" href="/admin/artikel">
              Kembali ke daftar artikel
            </Link>
          }
        />
      </section>
    );
  }

  return (
    <>
      <section className="seksi" aria-labelledby="judul-detail-artikel">
        <div className="seksi-kepala">
          <h2 id="judul-detail-artikel">Edit Artikel</h2>
          <Link href="/admin/artikel">Kembali ke daftar</Link>
        </div>
        <p className="artikel-meta-kecil">
          Status: <strong>{labelStatusArtikel(artikel.status)}</strong>
          {" · "}
          <span className={kelasLencanaStatus(artikel.status_verifikasi)}>
            {labelStatusVerifikasi(artikel.status_verifikasi)}
          </span>
          {" · "}
          Dibuat {formatWaktu(artikel.dibuat_pada)}
          {" · "}
          Diperbarui {formatWaktu(artikel.diperbarui_pada)}
          {artikel.diterbitkan_pada &&
            ` · Diterbitkan ${formatWaktu(artikel.diterbitkan_pada)}`}
          {artikel.dijadwalkan_pada &&
            ` · Dijadwalkan ${formatWaktu(artikel.dijadwalkan_pada)}`}
        </p>
        <FormArtikel artikel={artikel} kategori={kategori} />
      </section>

      <section className="seksi" aria-labelledby="judul-aksi-artikel">
        <div className="seksi-kepala">
          <h2 id="judul-aksi-artikel">Aksi Penerbitan</h2>
        </div>
        <div className="admin-aksi">
          {artikel.status !== "terbit" && (
            <TombolAksi
              url={`/api/admin/artikel/${artikel.id}/terbitkan`}
              label="Terbitkan"
              labelLoading="Menerbitkan…"
              varian="primer"
              konfirmasi="Terbitkan artikel ini sekarang?"
            />
          )}
          {artikel.status === "terbit" && (
            <TombolAksi
              url={`/api/admin/artikel/${artikel.id}/batalkan`}
              label="Batalkan penerbitan"
              labelLoading="Membatalkan…"
              konfirmasi="Batalkan penerbitan artikel ini? Artikel tidak lagi tampil publik."
            />
          )}
          <TombolAksi
            url={`/api/admin/artikel/${artikel.id}`}
            method="DELETE"
            label="Hapus artikel"
            labelLoading="Menghapus…"
            varian="bahaya"
            konfirmasi="Hapus artikel ini beserta klaim, review, dan versinya? Tindakan ini tidak bisa dibatalkan."
          />
        </div>
        <div style={{ marginTop: 16 }}>
          <FormJadwalkan
            artikelId={artikel.id}
            dijadwalkanPada={artikel.dijadwalkan_pada}
          />
        </div>
      </section>

      <section className="seksi" aria-labelledby="judul-verifikasi-artikel">
        <div className="seksi-kepala">
          <h2 id="judul-verifikasi-artikel">Verifikasi Terakhir</h2>
          <Link href={`/admin/fakta/${artikel.id}`}>Kelola pemeriksaan fakta</Link>
        </div>
        {artikel.verifikasi_terakhir ? (
          <p>
            <span
              className={kelasLencanaStatus(artikel.verifikasi_terakhir.keputusan)}
            >
              {labelStatusVerifikasi(artikel.verifikasi_terakhir.keputusan)}
            </span>{" "}
            {formatWaktu(artikel.verifikasi_terakhir.dibuat_pada)}
            {artikel.verifikasi_terakhir.catatan
              ? ` — ${artikel.verifikasi_terakhir.catatan}`
              : ""}
          </p>
        ) : (
          <p className="artikel-meta-kecil">
            Belum ada catatan verifikasi untuk artikel ini.
          </p>
        )}
        {artikel.review_terakhir && (
          <p className="artikel-meta-kecil">
            Review terakhir: <strong>{artikel.review_terakhir.keputusan}</strong> ·{" "}
            {formatWaktu(artikel.review_terakhir.dibuat_pada)}
            {artikel.review_terakhir.catatan
              ? ` — ${artikel.review_terakhir.catatan}`
              : ""}
          </p>
        )}
      </section>

      <section className="seksi" aria-labelledby="judul-versi-artikel">
        <div className="seksi-kepala">
          <h2 id="judul-versi-artikel">Riwayat Versi</h2>
        </div>
        {artikel.versi.length === 0 ? (
          <p className="artikel-meta-kecil">
            Belum ada riwayat versi tercatat untuk artikel ini.
          </p>
        ) : (
          <ol className="artikel-kronologi">
            {artikel.versi.map((v) => (
              <li key={v.versi}>
                <strong>Versi {v.versi}</strong>
                {v.judul ? ` — ${v.judul}` : ""} · {formatTanggal(v.dibuat_pada)}
                {v.catatan ? ` — ${v.catatan}` : ""}
                {v.isi_sebelum
                  ? " · isi sebelum revisi tercatat"
                  : v.catatan !== "Draf awal"
                    ? " · isi sebelum belum tercatat (versi pra-v27)"
                    : ""}
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
