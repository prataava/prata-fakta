import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import FormVerifikasi from "@/components/admin/FormVerifikasi";
import { getArtikelAdmin } from "@/lib/admin/data";
import { formatWaktu } from "@/lib/admin/format";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";

export const metadata: Metadata = {
  title: "Pemeriksaan Fakta — Admin",
  description: "Periksa klaim dan bukti, lalu ubah status verifikasi artikel.",
};

export const instant = false;

export default async function AdminFaktaDetail({
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
      <section className="seksi" aria-labelledby="judul-fakta-artikel">
        <div className="seksi-kepala">
          <h2 id="judul-fakta-artikel">Pemeriksaan Fakta: {artikel.judul}</h2>
          <Link href="/admin/review">Kembali ke antrean</Link>
        </div>
        <p>
          Status verifikasi saat ini:{" "}
          <span className={kelasLencanaStatus(artikel.status_verifikasi)}>
            {labelStatusVerifikasi(artikel.status_verifikasi)}
          </span>
        </p>
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
          <Link className="tombol" href={`/admin/review/${artikel.id}`}>
            Review editorial
          </Link>
        </div>
      </section>

      <section className="seksi" aria-labelledby="judul-klaim-fakta">
        <div className="seksi-kepala">
          <h2 id="judul-klaim-fakta">Klaim &amp; Bukti</h2>
        </div>
        {artikel.klaim.length === 0 ? (
          <p className="artikel-meta-kecil">
            Belum ada klaim yang diekstrak untuk artikel ini — pemeriksaan
            fakta menunggu agen ekstraksi klaim (Fase 4) atau klaim manual.
          </p>
        ) : (
          artikel.klaim.map((k) => {
            const mendukung = k.evidence.filter((e) => e.arah === "mendukung");
            const menentang = k.evidence.filter((e) => e.arah === "menentang");
            const netral = k.evidence.filter((e) => e.arah === "netral");
            return (
              <article className="kartu" key={k.id} style={{ marginBottom: 16 }}>
                <span className="kartu-kategori">
                  Klaim {k.jenis} · {k.status}
                </span>
                <span className="kartu-judul">{k.teks}</span>
                {k.evidence.length === 0 ? (
                  <span className="kartu-teks">
                    Belum ada bukti untuk klaim ini.
                  </span>
                ) : (
                  <>
                    {mendukung.length > 0 && (
                      <>
                        <span className="kartu-teks">
                          <strong>Bukti mendukung ({mendukung.length}):</strong>
                        </span>
                        <ul className="artikel-daftar">
                          {mendukung.map((e) => (
                            <li key={e.id}>
                              <a
                                href={e.sumber_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {e.sumber_nama ?? e.sumber_url}
                              </a>
                              {e.kutipan ? ` — “${e.kutipan}”` : ""}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {menentang.length > 0 && (
                      <>
                        <span className="kartu-teks">
                          <strong>Bukti menentang ({menentang.length}):</strong>
                        </span>
                        <ul className="artikel-daftar">
                          {menentang.map((e) => (
                            <li key={e.id}>
                              <a
                                href={e.sumber_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {e.sumber_nama ?? e.sumber_url}
                              </a>
                              {e.kutipan ? ` — “${e.kutipan}”` : ""}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {netral.length > 0 && (
                      <>
                        <span className="kartu-teks">
                          <strong>Bukti netral ({netral.length}):</strong>
                        </span>
                        <ul className="artikel-daftar">
                          {netral.map((e) => (
                            <li key={e.id}>
                              <a
                                href={e.sumber_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {e.sumber_nama ?? e.sumber_url}
                              </a>
                              {e.kutipan ? ` — “${e.kutipan}”` : ""}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                )}
              </article>
            );
          })
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

      <section className="seksi" aria-labelledby="judul-ubah-status">
        <div className="seksi-kepala">
          <h2 id="judul-ubah-status">Ubah Status Verifikasi</h2>
        </div>
        <FormVerifikasi
          artikelId={artikel.id}
          statusSaatIni={artikel.status_verifikasi}
        />
      </section>
    </>
  );
}
