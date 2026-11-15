import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import FormKeputusanReview from "@/components/admin/FormKeputusanReview";
import { getArtikelAdmin } from "@/lib/admin/data";
import { formatWaktu, labelStatusArtikel } from "@/lib/admin/format";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";

export const metadata: Metadata = {
  title: "Review Artikel — Admin",
  description: "Periksa artikel, klaim, dan bukti sebelum memberi keputusan review.",
};

export const instant = false;

export default async function AdminReviewDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const artikel = await getArtikelAdmin(id);

  if (!artikel) {
    return (
      <section className="seksi">
        <EmptyState
          judul="Artikel tidak ditemukan"
          pesan="Artikel dengan id ini tidak ada, sudah dihapus, atau tidak dapat dibaca dengan izin akun Anda."
          aksi={
            <Link className="tombol" href="/admin/review">
              Kembali ke antrean
            </Link>
          }
        />
      </section>
    );
  }

  return (
    <>
      <section className="seksi" aria-labelledby="judul-review-artikel">
        <div className="seksi-kepala">
          <h2 id="judul-review-artikel">Review: {artikel.judul}</h2>
          <Link href="/admin/review">Kembali ke antrean</Link>
        </div>
        <p className="artikel-meta-kecil">
          Status: <strong>{labelStatusArtikel(artikel.status)}</strong>
          {" · "}
          <span className={kelasLencanaStatus(artikel.status_verifikasi)}>
            {labelStatusVerifikasi(artikel.status_verifikasi)}
          </span>
          {" · "}
          Kategori: {artikel.kategori_slug ?? "—"}
          {artikel.penulis_nama ? ` · Penulis: ${artikel.penulis_nama}` : ""}
        </p>
        {artikel.subjudul && <p className="artikel-subjudul">{artikel.subjudul}</p>}
        {artikel.ringkasan && (
          <p className="artikel-ringkasan">{artikel.ringkasan}</p>
        )}
        {artikel.sumber_url && (
          <p>
            Sumber asli:{" "}
            <a
              href={artikel.sumber_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {artikel.sumber_url}
            </a>
          </p>
        )}
        <div className="admin-aksi">
          <Link className="tombol" href={`/admin/artikel/${artikel.id}`}>
            Edit artikel
          </Link>
          <Link className="tombol" href={`/admin/fakta/${artikel.id}`}>
            Pemeriksaan fakta
          </Link>
        </div>
      </section>

      <section className="seksi" aria-labelledby="judul-klaim-review">
        <div className="seksi-kepala">
          <h2 id="judul-klaim-review">Klaim &amp; Bukti</h2>
        </div>
        {artikel.klaim.length === 0 ? (
          <p className="artikel-meta-kecil">
            Belum ada klaim yang diekstrak untuk artikel ini.
          </p>
        ) : (
          <ul className="artikel-daftar">
            {artikel.klaim.map((k) => (
              <li key={k.id}>
                <strong>{k.teks}</strong> ({k.jenis} · {k.status})
                {k.evidence.length > 0 && (
                  <ul className="artikel-daftar">
                    {k.evidence.map((e) => (
                      <li key={e.id}>
                        [{e.arah}]{" "}
                        <a href={e.sumber_url} target="_blank" rel="noopener noreferrer">
                          {e.sumber_nama ?? e.sumber_url}
                        </a>
                        {e.kutipan ? ` — “${e.kutipan}”` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        {artikel.verifikasi_terakhir && (
          <p className="artikel-meta-kecil">
            Verifikasi terakhir:{" "}
            {labelStatusVerifikasi(artikel.verifikasi_terakhir.keputusan)} ·{" "}
            {formatWaktu(artikel.verifikasi_terakhir.dibuat_pada)}
            {artikel.verifikasi_terakhir.catatan
              ? ` — ${artikel.verifikasi_terakhir.catatan}`
              : ""}
          </p>
        )}
      </section>

      <section className="seksi" aria-labelledby="judul-riwayat-review">
        <div className="seksi-kepala">
          <h2 id="judul-riwayat-review">Riwayat Review</h2>
        </div>
        {artikel.reviews.length === 0 ? (
          <p className="artikel-meta-kecil">
            Belum ada keputusan review untuk artikel ini.
          </p>
        ) : (
          <ol className="artikel-kronologi">
            {artikel.reviews.map((r) => (
              <li key={r.id}>
                <strong>{r.keputusan}</strong> · {formatWaktu(r.dibuat_pada)}
                {r.catatan ? ` — ${r.catatan}` : ""}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="seksi" aria-labelledby="judul-keputusan">
        <div className="seksi-kepala">
          <h2 id="judul-keputusan">Keputusan Review</h2>
        </div>
        <FormKeputusanReview artikelId={artikel.id} />
      </section>
    </>
  );
}
