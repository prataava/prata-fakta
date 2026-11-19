import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import daftar from "@/components/admin/daftar-padat.module.css";
import { Reveal } from "@/components/motion";
import { getDaftarArtikelAdmin } from "@/lib/admin/data";
import { getKategori } from "@/lib/data";
import { formatTanggal, labelStatusArtikel } from "@/lib/admin/format";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";

export const metadata: Metadata = {
  title: "Artikel — Admin",
  description: "Daftar semua artikel PRATA FAKTA untuk dikelola redaksi.",
};

export const instant = false;

const STATUS = ["draft", "terbit", "terjadwal", "diarsipkan"] as const;

function tautanFilter(
  basis: { status?: string; kategori?: string; q?: string },
  ubah: Partial<{ status?: string; kategori?: string; q?: string; page?: number }>,
): string {
  const p = new URLSearchParams();
  const gabung = { ...basis, ...ubah };
  if (gabung.status) p.set("status", gabung.status);
  if (gabung.kategori) p.set("kategori", gabung.kategori);
  if (gabung.q) p.set("q", gabung.q);
  if (gabung.page) p.set("page", String(gabung.page));
  const s = p.toString();
  return s ? `/admin/artikel?${s}` : "/admin/artikel";
}

export default async function AdminArtikel({
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
    status: ambil("status"),
    kategori: ambil("kategori"),
    q: ambil("q"),
    page: ambil("page") ? Number(ambil("page")) : 1,
  };
  const [{ artikel, total, page, tersedia }, kategori] = await Promise.all([
    getDaftarArtikelAdmin(filter),
    getKategori(),
  ]);
  const kategoriUtama = kategori.filter((k) => !k.induk_id);
  const totalHalaman = Math.max(1, Math.ceil(total / 20));

  return (
    <Reveal>
    <section className="seksi" aria-labelledby="judul-artikel-admin">
      <div className="seksi-kepala">
        <h2 id="judul-artikel-admin">Artikel</h2>
        <Link href="/admin/artikel/baru">Artikel baru</Link>
      </div>

      <form className="arsip-filter-tanggal" action="/admin/artikel" method="get" aria-label="Filter artikel">
        <label>
          Status
          <select name="status" defaultValue={filter.status ?? ""}>
            <option value="">Semua status</option>
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {labelStatusArtikel(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kategori
          <select name="kategori" defaultValue={filter.kategori ?? ""}>
            <option value="">Semua kategori</option>
            {kategoriUtama.map((k) => (
              <option key={k.slug} value={k.slug}>
                {k.nama}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kata kunci
          <input
            type="search"
            name="q"
            defaultValue={filter.q ?? ""}
            placeholder="Judul atau ringkasan…"
          />
        </label>
        <button className="tombol tombol-primer" type="submit">
          Filter
        </button>
        {(filter.status || filter.kategori || filter.q) && (
          <Link className="tombol tombol-hantu" href="/admin/artikel">
            Hapus filter
          </Link>
        )}
      </form>

      {!tersedia ? (
        <EmptyState
          judul="Daftar artikel belum tersedia"
          pesan="Tabel artikel tidak dapat dibaca — migrasi Fase 2 mungkin belum dijalankan, atau akun Anda belum punya izin baca staf."
        />
      ) : artikel.length === 0 ? (
        <EmptyState
          judul="Belum ada artikel"
          pesan={
            filter.status || filter.kategori || filter.q
              ? "Tidak ada artikel yang cocok dengan filter ini."
              : "Belum ada artikel sama sekali. Buat artikel pertama lewat tombol “Artikel baru”."
          }
          aksi={
            <Link className="tombol tombol-primer" href="/admin/artikel/baru">
              Buat artikel baru
            </Link>
          }
        />
      ) : (
        <>
          <p className="artikel-meta-kecil">
            Menampilkan {artikel.length} dari {total} artikel · Halaman {page} dari{" "}
            {totalHalaman}
          </p>
          <ul className={daftar.daftar}>
            {artikel.map((a) => (
              <li key={a.id} className={daftar.baris}>
                <span className={daftar.judul}>
                  <Link href={`/admin/artikel/${a.id}`}>{a.judul}</Link>
                </span>
                <span className={daftar.meta}>
                  {a.kategori_slug ?? "—"}
                </span>
                <span className={daftar.meta}>
                  {labelStatusArtikel(a.status)}
                </span>
                <span className={kelasLencanaStatus(a.status_verifikasi)}>
                  {labelStatusVerifikasi(a.status_verifikasi)}
                </span>
                <span className={daftar.meta}>
                  {formatTanggal(a.dibuat_pada)}
                </span>
                <Link
                  href={`/admin/artikel/${a.id}`}
                  className={daftar.aksi}
                >
                  Edit
                </Link>
                {a.status === "terbit" && (
                  <Link
                    href={`/artikel/${a.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={daftar.aksi}
                  >
                    Lihat publik
                  </Link>
                )}
              </li>
            ))}
          </ul>
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
    </Reveal>
  );
}
