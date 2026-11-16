import type { Metadata } from "next";
import EmptyState from "@/components/EmptyState";
import FormIndikator from "@/components/data/FormIndikator";
import FormTitikData from "@/components/data/FormTitikData";
import TombolAksi from "@/components/admin/TombolAksi";
import { cobaServiceClient } from "@/lib/supabase/service";
import type { CakupanIndikator, PfIndikatorReality } from "@/lib/reality";

export const metadata: Metadata = {
  title: "Data — Admin",
  description:
    "Kelola indikator pusat data PRATA FAKTA: tambah, ubah, hapus indikator, dan tambah titik data.",
};

export const instant = false;

const KOLOM_INDIKATOR_REALITY =
  "id, nama, slug, kategori, satuan, sumber_nama, sumber_url, metodologi, tanggal_pembaruan, ringkasan_tren, cakupan, frekuensi_update, negara_kode";

/**
 * Indikator untuk halaman admin: SEMUA baris (service role).
 * Tinggal di halaman server ini (bukan lib/reality.ts) karena lib
 * itu diimpor komponen klien dan tidak boleh merujuk next/headers.
 * tersedia=false bila service key belum diatur / tabel belum ada.
 */
async function getIndikatorAdmin(): Promise<{
  indikator: (PfIndikatorReality & { jumlah_titik: number })[];
  tersedia: boolean;
}> {
  try {
    const service = cobaServiceClient();
    if (!service) return { indikator: [], tersedia: false };
    const { data, error } = await service
      .from("pf_data_indicators")
      .select(KOLOM_INDIKATOR_REALITY)
      .order("nama", { ascending: true });
    if (error || !data) return { indikator: [], tersedia: false };

    // Hitung titik per indikator dalam satu kueri.
    let hitung = new Map<string, number>();
    try {
      const { data: semuaTitik, error: errTitik } = await service
        .from("pf_data_points")
        .select("indikator_id")
        .limit(10000);
      if (!errTitik && semuaTitik) {
        for (const t of semuaTitik as { indikator_id: string }[]) {
          hitung.set(
            t.indikator_id,
            (hitung.get(t.indikator_id) ?? 0) + 1,
          );
        }
      }
    } catch {
      hitung = new Map();
    }

    const indikator = (data as unknown as Record<string, unknown>[]).map(
      (r) => ({
        id: String(r.id),
        nama: String(r.nama ?? ""),
        slug: String(r.slug ?? ""),
        kategori: String(r.kategori ?? ""),
        satuan: (r.satuan as string | null) ?? null,
        sumber_nama: (r.sumber_nama as string | null) ?? null,
        sumber_url: (r.sumber_url as string | null) ?? null,
        metodologi: (r.metodologi as string | null) ?? null,
        tanggal_pembaruan: (r.tanggal_pembaruan as string | null) ?? null,
        ringkasan_tren: (r.ringkasan_tren as string | null) ?? null,
        nilai_terakhir: null,
        tanggal_nilai_terakhir: null,
        cakupan:
          r.cakupan === "dunia" ? "dunia" : ("indonesia" as CakupanIndikator),
        frekuensi_update: (r.frekuensi_update as string | null) ?? null,
        negara_kode: (r.negara_kode as string | null) ?? null,
        jumlah_titik: hitung.get(String(r.id)) ?? 0,
      }),
    );
    return { indikator, tersedia: true };
  } catch {
    return { indikator: [], tersedia: false };
  }
}

export default async function AdminData() {
  const { indikator, tersedia } = await getIndikatorAdmin();

  return (
    <>
      <section className="seksi" aria-labelledby="judul-indikator-baru">
        <div className="seksi-kepala">
          <h2 id="judul-indikator-baru">Tambah Indikator</h2>
        </div>
        <article className="kartu">
          <FormIndikator />
        </article>
      </section>

      <section className="seksi" aria-labelledby="judul-daftar-indikator">
        <div className="seksi-kepala">
          <h2 id="judul-daftar-indikator">Daftar Indikator</h2>
        </div>
        {!tersedia ? (
          <EmptyState
            judul="Daftar indikator belum tersedia"
            pesan="Tabel indikator tidak dapat dibaca — migrasi v6/v10 mungkin belum dijalankan, atau kunci service Supabase belum diatur."
          />
        ) : indikator.length === 0 ? (
          <EmptyState
            judul="Belum ada indikator"
            pesan="Belum ada indikator terdaftar. Tambah indikator pertama lewat formulir di atas."
          />
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Slug</th>
                  <th>Kategori</th>
                  <th>Cakupan</th>
                  <th>Satuan</th>
                  <th>Sumber</th>
                  <th>Titik data</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {indikator.map((ind) => (
                  <tr key={ind.id}>
                    <td>{ind.nama}</td>
                    <td>{ind.slug}</td>
                    <td>{ind.kategori}</td>
                    <td>{ind.cakupan}</td>
                    <td>{ind.satuan ?? "—"}</td>
                    <td>{ind.sumber_nama ?? "—"}</td>
                    <td>{ind.jumlah_titik}</td>
                    <td>
                      <span className="admin-aksi">
                        <details>
                          <summary>Tambah titik</summary>
                          <div style={{ marginTop: 12, minWidth: 280 }}>
                            <FormTitikData
                              indikatorId={ind.id}
                              namaIndikator={ind.nama}
                            />
                          </div>
                        </details>
                        <details>
                          <summary>Ubah</summary>
                          <div style={{ marginTop: 12, minWidth: 320 }}>
                            <FormIndikator indikator={ind} />
                          </div>
                        </details>
                        <TombolAksi
                          url={`/api/admin/data/${ind.id}`}
                          method="DELETE"
                          label="Hapus"
                          labelLoading="Menghapus…"
                          varian="hantu"
                          konfirmasi={`Hapus indikator "${ind.nama}"? ${ind.jumlah_titik} titik datanya ikut terhapus.`}
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
