import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import { getAuditAdmin, ringkasJson } from "@/lib/admin/data";
import { formatWaktu } from "@/lib/admin/format";

export const metadata: Metadata = {
  title: "Audit Log — Admin",
  description: "Jejak audit semua aksi penting di PRATA FAKTA.",
};

export const instant = false;

const AKSI = [
  "artikel.buat",
  "artikel.ubah",
  "artikel.hapus",
  "artikel.terbit",
  "artikel.batal_terbit",
  "artikel.jadwalkan",
  "review.setuju",
  "review.tolak",
  "review.kembalikan",
  "verifikasi.ubah",
  "koreksi.terima",
  "koreksi.tolak",
  "pengguna.role",
  "pengguna.nonaktif",
  "pengguna.aktifkan",
  "sistem.job",
  "sistem.kategori",
  "brief.terbit",
] as const;

const ENTITAS = ["artikel", "review", "verifikasi", "koreksi", "pengguna", "sistem", "brief"] as const;

function tautanFilter(
  basis: { aksi?: string; entitas?: string },
  ubah: Partial<{ aksi?: string; entitas?: string; page?: number }>,
): string {
  const p = new URLSearchParams();
  const gabung = { ...basis, ...ubah };
  if (gabung.aksi) p.set("aksi", gabung.aksi);
  if (gabung.entitas) p.set("entitas", gabung.entitas);
  if (gabung.page) p.set("page", String(gabung.page));
  const s = p.toString();
  return s ? `/admin/audit?${s}` : "/admin/audit";
}

export default async function AdminAudit({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ambil = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : undefined;
  };
  const filter = {
    aksi: ambil("aksi"),
    entitas: ambil("entitas"),
    page: ambil("page") ? Number(ambil("page")) : 1,
  };
  const { log, total, page, tersedia } = await getAuditAdmin(filter);
  const totalHalaman = Math.max(1, Math.ceil(total / 20));

  return (
    <section className="seksi" aria-labelledby="judul-audit">
      <div className="seksi-kepala">
        <h2 id="judul-audit">Audit Log</h2>
      </div>
      <p className="artikel-meta-kecil">
        Jejak semua aksi penting: artikel, review, verifikasi, koreksi,
        pengguna, sistem, dan brief. Hanya super_admin dan editor yang bisa
        membaca log ini.
      </p>

      <form className="arsip-filter-tanggal" action="/admin/audit" method="get" aria-label="Filter audit">
        <label>
          Aksi
          <select name="aksi" defaultValue={filter.aksi ?? ""}>
            <option value="">Semua aksi</option>
            {AKSI.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label>
          Entitas
          <select name="entitas" defaultValue={filter.entitas ?? ""}>
            <option value="">Semua entitas</option>
            {ENTITAS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <button className="tombol tombol-primer" type="submit">
          Filter
        </button>
        {(filter.aksi || filter.entitas) && (
          <Link className="tombol tombol-hantu" href="/admin/audit">
            Hapus filter
          </Link>
        )}
      </form>

      {!tersedia ? (
        <EmptyState
          judul="Audit log belum tersedia"
          pesan="Tabel audit tidak dapat dibaca — migrasi Fase 5 mungkin belum dijalankan, atau akun Anda bukan super_admin/editor."
        />
      ) : log.length === 0 ? (
        <EmptyState
          judul="Belum ada log audit"
          pesan={
            filter.aksi || filter.entitas
              ? "Tidak ada log yang cocok dengan filter ini."
              : "Belum ada aksi penting yang tercatat."
          }
        />
      ) : (
        <>
          <p className="artikel-meta-kecil">
            Menampilkan {log.length} dari {total} log · Halaman {page} dari{" "}
            {totalHalaman}
          </p>
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Aktor</th>
                  <th>Aksi</th>
                  <th>Entitas</th>
                  <th>Sebelum</th>
                  <th>Sesudah</th>
                </tr>
              </thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id}>
                    <td>{formatWaktu(l.dibuat_pada)}</td>
                    <td>{l.aktor_email ?? "—"}</td>
                    <td>{l.aksi}</td>
                    <td>
                      {l.entitas}
                      {l.entitas_id ? ` · ${l.entitas_id}` : ""}
                    </td>
                    <td>{ringkasJson(l.sebelum)}</td>
                    <td>{ringkasJson(l.sesudah)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-aksi" style={{ marginTop: 16 }}>
            {page > 1 && (
              <Link
                className="tombol"
                href={tautanFilter(filter, { page: page - 1 })}
              >
                Halaman sebelumnya
              </Link>
            )}
            {page < totalHalaman && (
              <Link
                className="tombol"
                href={tautanFilter(filter, { page: page + 1 })}
              >
                Halaman berikutnya
              </Link>
            )}
          </div>
        </>
      )}
    </section>
  );
}
