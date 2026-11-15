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

// Semua jenis laporan: 4 koreksi artikel lama + 5 laporan
// masyarakat (Area 13, migrasi v8).
const JENIS_KOREKSI = [
  "fakta_salah",
  "sumber",
  "typo",
  "lainnya",
  "kesalahan_informasi",
  "sumber_tidak_valid",
  "gambar_tidak_sesuai",
  "duplikat",
  "perlu_pembaruan",
] as const;

export default async function AdminKoreksi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const statusParam =
    typeof sp.status === "string" ? sp.status : undefined;
  const jenisParam =
    typeof sp.jenis === "string" &&
    (JENIS_KOREKSI as readonly string[]).includes(sp.jenis)
      ? sp.jenis
      : undefined;
  const { laporan, tersedia } = await getKoreksiAdmin(
    statusParam,
    jenisParam,
  );

  const tautanFilter = (nilai: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (nilai.status) p.set("status", nilai.status);
    if (nilai.jenis) p.set("jenis", nilai.jenis);
    const q = p.toString();
    return q ? `/admin/koreksi?${q}` : "/admin/koreksi";
  };

  return (
    <section className="seksi" aria-labelledby="judul-koreksi">
      <div className="seksi-kepala">
        <h2 id="judul-koreksi">Laporan Koreksi</h2>
        <p>
          Laporan koreksi artikel dan laporan masyarakat. Semua laporan
          wajib dimoderasi sebelum diproses — status hanya berubah lewat
          aksi di bawah.
        </p>
      </div>

      <div className="chip-baris" role="group" aria-label="Filter status laporan">
        <Link
          className={`chip${!statusParam ? " aktif" : ""}`}
          href={tautanFilter({ jenis: jenisParam })}
        >
          Semua status
        </Link>
        {STATUS_KOREKSI.map((s) => (
          <Link
            key={s}
            className={`chip${statusParam === s ? " aktif" : ""}`}
            href={tautanFilter({ status: s, jenis: jenisParam })}
          >
            {s}
          </Link>
        ))}
      </div>

      <div
        className="chip-baris"
        role="group"
        aria-label="Filter jenis laporan"
        style={{ marginTop: 8 }}
      >
        <Link
          className={`chip${!jenisParam ? " aktif" : ""}`}
          href={tautanFilter({ status: statusParam })}
        >
          Semua jenis
        </Link>
        {JENIS_KOREKSI.map((j) => (
          <Link
            key={j}
            className={`chip${jenisParam === j ? " aktif" : ""}`}
            href={tautanFilter({ status: statusParam, jenis: j })}
          >
            {LABEL_JENIS_KOREKSI[j] ?? j}
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
            statusParam || jenisParam
              ? "Tidak ada laporan dengan filter ini."
              : "Belum ada pembaca yang melaporkan kesalahan."
          }
        />
      ) : (
        laporan.map((l) => (
          <article className="kartu" key={l.id} style={{ marginBottom: 16 }}>
            <span className="kartu-kategori">
              {LABEL_JENIS_KOREKSI[l.jenis] ?? l.jenis} · {l.status}
              {l.nomor_lacak ? ` · Lacak: ${l.nomor_lacak}` : ""}
            </span>
            <span className="kartu-judul">
              {l.artikel_judul && l.artikel_id ? (
                <Link href={`/admin/artikel/${l.artikel_id}`}>{l.artikel_judul}</Link>
              ) : l.tautan_artikel ? (
                <Link href={l.tautan_artikel} target="_blank" rel="noopener noreferrer">
                  {l.tautan_artikel}
                </Link>
              ) : (
                "Tanpa artikel terkait"
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
