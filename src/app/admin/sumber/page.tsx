import type { Metadata } from "next";
import EmptyState from "@/components/EmptyState";
import FormSumber from "@/components/admin/FormSumber";
import TombolAksi from "@/components/admin/TombolAksi";
import { getSumberAdmin } from "@/lib/admin/data";
import { formatWaktu } from "@/lib/admin/format";
import { createClient } from "@/lib/supabase/server";
import {
  LABEL_KESEHATAN,
  ringkasKesehatanSumber,
  type KesehatanSumber,
} from "@/lib/ingestion/kesehatan-sumber";

export const metadata: Metadata = {
  title: "Sumber Berita — Admin",
  description: "Kelola sumber berita PRATA FAKTA: tambah, ubah, cek, dan hapus.",
};

export const instant = false;

export default async function AdminSumber() {
  const { sumber, tersedia } = await getSumberAdmin();

  // Kesehatan sumber (Tahap E): dihitung dari pf_ingestion_runs +
  // pf_raw_items yang sudah ada (lib/ingestion/kesehatan-sumber.ts).
  // Gagal dibaca -> kolom kesehatan menampilkan "—" (fail-soft);
  // daftar sumber tetap tampil.
  let kesehatan: Map<string, KesehatanSumber> | null = null;
  if (tersedia && sumber.length > 0) {
    try {
      const supabase = await createClient();
      const [runsRes, itemRes] = await Promise.all([
        supabase
          .from("pf_ingestion_runs")
          .select("sumber_id,status,selesai_pada,dimulai_pada")
          .order("dimulai_pada", { ascending: false })
          .limit(200),
        supabase
          .from("pf_raw_items")
          .select("sumber_id,waktu_diambil")
          .in("status", ["baru", "disalin_dari"])
          .order("waktu_diambil", { ascending: false })
          .limit(500),
      ]);
      if (!runsRes.error && !itemRes.error) {
        kesehatan = new Map(
          ringkasKesehatanSumber({
            sumber: sumber.map((s) => ({ id: s.id, nama: s.nama })),
            runs: (runsRes.data ?? []) as Array<{
              sumber_id: string | null;
              status: string;
              selesai_pada: string | null;
              dimulai_pada: string;
            }>,
            itemBaru: (itemRes.data ?? []) as Array<{
              sumber_id: string | null;
              waktu_diambil: string;
            }>,
          }).map((k) => [k.sumber_id, k]),
        );
      }
    } catch {
      kesehatan = null;
    }
  }

  return (
    <>
      <section className="seksi" aria-labelledby="judul-sumber-baru">
        <div className="seksi-kepala">
          <h2 id="judul-sumber-baru">Tambah Sumber</h2>
        </div>
        <article className="kartu">
          <FormSumber />
        </article>
      </section>

      <section className="seksi" aria-labelledby="judul-daftar-sumber">
        <div className="seksi-kepala">
          <h2 id="judul-daftar-sumber">Daftar Sumber</h2>
        </div>
        {!tersedia ? (
          <EmptyState
            judul="Daftar sumber belum tersedia"
            pesan="Tabel sumber tidak dapat dibaca — migrasi Fase 1 mungkin belum dijalankan, atau akun Anda belum punya izin baca staf."
          />
        ) : sumber.length === 0 ? (
          <EmptyState
            judul="Belum ada sumber"
            pesan="Belum ada sumber berita terdaftar. Tambah sumber pertama lewat formulir di atas."
          />
        ) : (
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Jenis</th>
                  <th>URL</th>
                  <th>Prioritas</th>
                  <th>Aktif</th>
                  <th>Kesehatan</th>
                  <th>Sukses terakhir</th>
                  <th>Gagal beruntun</th>
                  <th>Item baru terakhir</th>
                  <th>Cek terakhir</th>
                  <th>Item diambil</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {sumber.map((s) => {
                  const k = kesehatan?.get(s.id) ?? null;
                  return (
                  <tr key={s.id}>
                    <td>{s.nama}</td>
                    <td>{s.jenis}</td>
                    <td>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.url}
                      </a>
                    </td>
                    <td>{s.prioritas}</td>
                    <td>{s.aktif ? "Ya" : "Tidak"}</td>
                    <td>
                      {k ? LABEL_KESEHATAN[k.status] : "—"}
                      {k?.peringatan ? ` — ${k.peringatan}` : ""}
                    </td>
                    <td>{k ? formatWaktu(k.sukses_terakhir) : "—"}</td>
                    <td>{k ? k.gagal_beruntun : "—"}</td>
                    <td>{k ? formatWaktu(k.item_terakhir) : "—"}</td>
                    <td>
                      {formatWaktu(s.terakhir_cek)}
                      {s.status_terakhir ? ` · ${s.status_terakhir}` : ""}
                    </td>
                    <td>{s.jumlah_item}</td>
                    <td>
                      <span className="admin-aksi">
                        <TombolAksi
                          url={`/api/sumber/${s.id}/cek`}
                          label="Cek"
                          labelLoading="Memeriksa…"
                        />
                        <details>
                          <summary>Ubah</summary>
                          <div style={{ marginTop: 12, minWidth: 280 }}>
                            <FormSumber sumber={s} />
                          </div>
                        </details>
                        <TombolAksi
                          url={`/api/sumber/${s.id}`}
                          method="DELETE"
                          label="Hapus"
                          labelLoading="Menghapus…"
                          varian="hantu"
                          konfirmasi={`Hapus sumber "${s.nama}"? Raw item yang sudah diambil tidak ikut terhapus.`}
                        />
                      </span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
