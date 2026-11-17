// Halaman /klaim — Pelacak Klaim publik (P1-2).
// Daftar klaim artikel TERBIT saja (getter getDaftarKlaim menutup
// klaim draf di lapis aplikasi; RLS v8 menutupnya di lapis DB).
// Filter status + jenis + cari teks lewat searchParams (form GET),
// paginasi 20/halaman. Rute diblokir di server per request
// (connection() + <Suspense>, pola cacheComponents /sumber).
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import EmptyState from "@/components/EmptyState";
import {
  getDaftarKlaim,
  JENIS_KLAIM,
  LABEL_JENIS_KLAIM,
  LABEL_STATUS_KLAIM,
  PER_HALAMAN_KLAIM,
  STATUS_KLAIM,
  type JenisKlaim,
  type StatusKlaim,
} from "@/lib/klaim";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";

export const metadata: Metadata = {
  title: "Pelacak Klaim",
  description:
    "Lacak status verifikasi setiap klaim dalam artikel terbit PRATA FAKTA: bukti, sumber, dan linimasa pemeriksaannya.",
};

export const instant = false;

type FilterKlaim = {
  status?: StatusKlaim;
  jenis?: JenisKlaim;
  q?: string;
  halaman?: number;
};

function tautanHalaman(basis: FilterKlaim, halaman: number): string {
  const p = new URLSearchParams();
  if (basis.status) p.set("status", basis.status);
  if (basis.jenis) p.set("jenis", basis.jenis);
  if (basis.q) p.set("q", basis.q);
  p.set("halaman", String(halaman));
  return `/klaim?${p.toString()}`;
}

function formatTanggal(iso: string | null): string {
  if (!iso) return "Tanggal belum tersedia";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

async function DaftarKlaim({ filter }: { filter: FilterKlaim }) {
  const hasil = await getDaftarKlaim(filter);
  const adaFilterAktif = Boolean(filter.status || filter.jenis || filter.q);

  if (hasil.total === 0) {
    return (
      <EmptyState
        judul={
          adaFilterAktif
            ? "Tidak ada klaim yang cocok dengan filter ini"
            : "Belum ada klaim yang bisa dilacak"
        }
        pesan={
          adaFilterAktif
            ? "Coba longgarkan filter status, jenis, atau kata kunci di atas — atau lihat semua klaim tanpa filter."
            : "Belum ada klaim dari artikel terbit yang tercatat di sistem. Klaim pertama masuk begitu artikel lolos verifikasi editorial dan klaimnya diekstrak."
        }
        aksi={
          adaFilterAktif ? (
            <Link className="tombol" href="/klaim">
              Hapus semua filter
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      <p className="kartu-meta" role="status">
        Menampilkan {hasil.klaim.length} dari {hasil.total} klaim
        {hasil.totalHalaman > 1
          ? ` — halaman ${hasil.halaman} dari ${hasil.totalHalaman}`
          : ""}
        . Hanya klaim dari artikel terbit yang tampil di sini.
      </p>
      <div className="grid-berita">
        {hasil.klaim.map((k) => (
          <article key={k.id} className="kartu">
            <span className="kartu-kategori">
              Klaim · {LABEL_JENIS_KLAIM[k.jenis as JenisKlaim] ?? k.jenis}
            </span>
            <span className="kartu-judul">
              <Link href={`/klaim/${k.id}`}>{k.teks}</Link>
            </span>
            <span className="kartu-meta">
              Status klaim: {LABEL_STATUS_KLAIM[k.status as StatusKlaim] ?? k.status}
            </span>
            <span className="kartu-meta">
              Artikel asal:{" "}
              <Link href={`/artikel/${k.artikel.slug}`}>{k.artikel.judul}</Link>{" "}
              <span className={kelasLencanaStatus(k.artikel.status_verifikasi)}>
                {labelStatusVerifikasi(k.artikel.status_verifikasi)}
              </span>
            </span>
            <span className="kartu-meta">
              Dicatat: {formatTanggal(k.dibuat_pada)}
            </span>
            <Link className="tombol tombol-hantu" href={`/klaim/${k.id}`}>
              Lacak klaim ini
            </Link>
          </article>
        ))}
      </div>
      {hasil.totalHalaman > 1 && (
        <nav
          aria-label="Paginasi klaim"
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 24,
            flexWrap: "wrap",
          }}
        >
          {hasil.halaman > 1 ? (
            <Link
              className="tombol tombol-hantu"
              href={tautanHalaman(filter, hasil.halaman - 1)}
            >
              ← Sebelumnya
            </Link>
          ) : (
            <span className="tombol tombol-hantu" aria-disabled="true">
              ← Sebelumnya
            </span>
          )}
          <span className="kartu-meta" aria-current="page">
            Halaman {hasil.halaman} dari {hasil.totalHalaman}
          </span>
          {hasil.halaman < hasil.totalHalaman ? (
            <Link
              className="tombol tombol-hantu"
              href={tautanHalaman(filter, hasil.halaman + 1)}
            >
              Berikutnya →
            </Link>
          ) : (
            <span className="tombol tombol-hantu" aria-disabled="true">
              Berikutnya →
            </span>
          )}
        </nav>
      )}
    </>
  );
}

export default async function HalamanKlaim({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const sp = await searchParams;
  const ambil = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : undefined;
  };
  const statusMentah = ambil("status");
  const jenisMentah = ambil("jenis");
  const qMentah = ambil("q");
  const halamanMentah = ambil("halaman");
  const filter: FilterKlaim = {
    status: (STATUS_KLAIM as readonly string[]).includes(statusMentah ?? "")
      ? (statusMentah as StatusKlaim)
      : undefined,
    jenis: (JENIS_KLAIM as readonly string[]).includes(jenisMentah ?? "")
      ? (jenisMentah as JenisKlaim)
      : undefined,
    q: qMentah && qMentah.trim() ? qMentah.trim() : undefined,
    halaman: halamanMentah ? Number(halamanMentah) : 1,
  };
  const adaFilterAktif = Boolean(filter.status || filter.jenis || filter.q);

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-klaim">
        <span className="hero-label">Verifikasi</span>
        <h1 id="judul-klaim">Pelacak Klaim</h1>
        <p>
          Setiap pernyataan yang bisa diperiksa dalam artikel terbit
          kami lacak statusnya di sini: dari mana klaim itu berasal,
          bukti apa yang mendukung atau menentangnya, dan bagaimana
          hasil pemeriksaan redaksi berkembang dari waktu ke waktu.
          Klaim dari artikel yang belum terbit tidak tampil di sini.
        </p>
      </section>

      <section aria-label="Filter klaim">
        <form
          className="arsip-filter-tanggal"
          action="/klaim"
          method="get"
          aria-label="Filter status, jenis, dan kata kunci klaim"
        >
          <label>
            Status
            <select name="status" defaultValue={filter.status ?? ""}>
              <option value="">Semua status</option>
              {STATUS_KLAIM.map((s) => (
                <option key={s} value={s}>
                  {LABEL_STATUS_KLAIM[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Jenis
            <select name="jenis" defaultValue={filter.jenis ?? ""}>
              <option value="">Semua jenis</option>
              {JENIS_KLAIM.map((j) => (
                <option key={j} value={j}>
                  {LABEL_JENIS_KLAIM[j]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cari teks klaim
            <input
              type="search"
              name="q"
              defaultValue={filter.q ?? ""}
              placeholder="Kata kunci dalam teks klaim"
            />
          </label>
          <button className="tombol tombol-primer" type="submit">
            Terapkan
          </button>
          {adaFilterAktif && (
            <Link className="tombol tombol-hantu" href="/klaim">
              Hapus filter
            </Link>
          )}
        </form>

        <div className="chip-baris" role="group" aria-label="Filter status cepat">
          <Link
            className={`chip${!filter.status ? " aktif" : ""}`}
            href={
              filter.jenis || filter.q
                ? `/klaim?${new URLSearchParams({
                    ...(filter.jenis ? { jenis: filter.jenis } : {}),
                    ...(filter.q ? { q: filter.q } : {}),
                  }).toString()}`
                : "/klaim"
            }
          >
            Semua status
          </Link>
          {STATUS_KLAIM.map((s) => (
            <Link
              key={s}
              className={`chip${filter.status === s ? " aktif" : ""}`}
              href={`/klaim?${new URLSearchParams({
                status: s,
                ...(filter.jenis ? { jenis: filter.jenis } : {}),
                ...(filter.q ? { q: filter.q } : {}),
              }).toString()}`}
            >
              {LABEL_STATUS_KLAIM[s]}
            </Link>
          ))}
        </div>
      </section>

      <section className="seksi" aria-label="Daftar klaim">
        <Suspense fallback={<div className="kerangka" aria-label="Memuat daftar klaim…" />}>
          <DaftarKlaim filter={filter} />
        </Suspense>
      </section>

      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        {PER_HALAMAN_KLAIM} klaim per halaman. Status klaim bisa berubah
        sesudah pemeriksaan lanjutan — buka halaman tiap klaim untuk
        melihat linimasa pemeriksaannya.
      </p>
    </div>
  );
}
