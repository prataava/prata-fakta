import type { Metadata } from "next";
import EmptyState from "@/components/EmptyState";
import FormSumber from "@/components/admin/FormSumber";
import TombolAksi from "@/components/admin/TombolAksi";
import daftar from "@/components/admin/daftar-padat.module.css";
import { Reveal } from "@/components/motion";
import { getKinerjaSumber, getSumberAdmin } from "@/lib/admin/data";
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

  // Kinerja editorial per sumber (v27, Source Intelligence):
  // artikel terbit + koreksi diperbaiki. Gagal dibaca -> kolom
  // menampilkan "—" (fail-soft); daftar sumber tetap tampil.
  const kinerja = await getKinerjaSumber();

  return (
    <Reveal>
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
          <ul className={daftar.daftar}>
            {sumber.map((s) => {
              const k = kesehatan?.get(s.id) ?? null;
              const kj = kinerja?.get(s.id) ?? null;
              return (
                <li
                  key={s.id}
                  className={`${daftar.baris} ${daftar.barisKolom}`}
                >
                  <div className={daftar.barisAtas}>
                    <span className={daftar.judul}>{s.nama}</span>
                    <span className={daftar.meta}>{s.jenis}</span>
                    <span className={daftar.meta}>
                      {s.aktif ? "Aktif" : "Nonaktif"}
                    </span>
                    <span className={daftar.meta}>
                      Kesehatan: {k ? LABEL_KESEHATAN[k.status] : "—"}
                      {k?.peringatan ? ` — ${k.peringatan}` : ""}
                    </span>
                    <span className={daftar.meta}>
                      Prioritas {s.prioritas}
                    </span>
                  </div>
                  <div className={daftar.barisMeta}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {s.url}
                    </a>
                    <span>
                      Sukses terakhir:{" "}
                      {k ? formatWaktu(k.sukses_terakhir) : "—"}
                    </span>
                    <span>
                      Gagal beruntun: {k ? k.gagal_beruntun : "—"}
                    </span>
                    <span>
                      Item baru terakhir:{" "}
                      {k ? formatWaktu(k.item_terakhir) : "—"}
                    </span>
                    <span>
                      Cek terakhir: {formatWaktu(s.terakhir_cek)}
                      {s.status_terakhir ? ` · ${s.status_terakhir}` : ""}
                    </span>
                    <span>Item diambil: {s.jumlah_item}</span>
                    <span>
                      Artikel terbit: {kj ? kj.artikel_terbit : "—"}
                    </span>
                    <span>
                      Koreksi diperbaiki:{" "}
                      {kj ? kj.koreksi_diperbaiki : "—"}
                    </span>
                  </div>
                  <div className={daftar.barisAksi}>
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
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="artikel-meta-kecil">
          * &quot;Koreksi diperbaiki&quot; menghitung koreksi pada
          artikel yang mencantumkan sumber ini — satu artikel bisa
          punya beberapa sumber, dan koreksinya dihitung untuk
          semua sumbernya (bukan menuduh satu sumber). &quot;—&quot;
          berarti kinerja editorial belum dapat dihitung (service
          key belum diatur), bukan nol.
        </p>
      </section>
    </Reveal>
  );
}
