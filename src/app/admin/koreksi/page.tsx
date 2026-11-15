import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import FormKoreksi from "@/components/admin/FormKoreksi";
import { getKoreksiAdmin, LABEL_JENIS_KOREKSI } from "@/lib/admin/data";
import { formatWaktu } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Laporan Koreksi — Admin",
  description: "Tindak lanjuti laporan koreksi dari pembaca.",
};

export const instant = false;

const STATUS_KOREKSI = ["baru", "ditinjau", "diperbaiki", "ditolak"] as const;

export default async function AdminKoreksi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const statusParam =
    typeof sp.status === "string" ? sp.status : undefined;
  const { laporan, tersedia } = await getKoreksiAdmin(statusParam);

  return (
    <section className="seksi" aria-labelledby="judul-koreksi">
      <div className="seksi-kepala">
        <h2 id="judul-koreksi">Laporan Koreksi</h2>
      </div>

      <div className="chip-baris" role="group" aria-label="Filter status laporan">
        <Link
          className={`chip${!statusParam ? " aktif" : ""}`}
          href="/admin/koreksi"
        >
          Semua status
        </Link>
        {STATUS_KOREKSI.map((s) => (
          <Link
            key={s}
            className={`chip${statusParam === s ? " aktif" : ""}`}
            href={`/admin/koreksi?status=${s}`}
          >
            {s}
          </Link>
        ))}
      </div>

      {!tersedia ? (
        <EmptyState
          judul="Laporan koreksi belum tersedia"
          pesan="Tabel laporan koreksi tidak dapat dibaca — migrasi Fase 2 mungkin belum dijalankan, atau akun Anda belum punya izin baca staf."
        />
      ) : laporan.length === 0 ? (
        <EmptyState
          judul="Belum ada laporan koreksi"
          pesan={
            statusParam
              ? "Tidak ada laporan dengan status ini."
              : "Belum ada pembaca yang melaporkan kesalahan."
          }
        />
      ) : (
        laporan.map((l) => (
          <article className="kartu" key={l.id} style={{ marginBottom: 16 }}>
            <span className="kartu-kategori">
              {LABEL_JENIS_KOREKSI[l.jenis] ?? l.jenis} · {l.status}
            </span>
            <span className="kartu-judul">
              {l.artikel_judul ? (
                <Link href={`/admin/artikel/${l.artikel_id}`}>{l.artikel_judul}</Link>
              ) : (
                "Artikel tidak ditemukan"
              )}
            </span>
            <span className="kartu-teks">{l.pesan}</span>
            <span className="kartu-meta">
              {l.nama ?? "Anonim"}
              {l.email ? ` · ${l.email}` : ""} · {formatWaktu(l.dibuat_pada)}
            </span>
            {(l.status === "baru" || l.status === "ditinjau") && (
              <FormKoreksi laporanId={l.id} />
            )}
          </article>
        ))
      )}
    </section>
  );
}
