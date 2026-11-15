import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import EmptyState from "@/components/EmptyState";
import KartuArtikel from "@/components/artikel/KartuArtikel";
import { getArtikel, getSumber } from "@/lib/data";
import { KATEGORI_UTAMA, cariKategori } from "@/lib/categories";

export const metadata: Metadata = {
  title: "Arsip Berita",
  description:
    "Arsip berita PRATA FAKTA. Filter berdasarkan tanggal, kategori, status verifikasi, dan kata kunci.",
};

// Halaman arsip bergantung pada searchParams (?kategori, ?status, ?q) —
// rute diblokir di server per request (pola resmi cacheComponents untuk
// rute yang membaca searchParams), bukan di-prerender.
export const instant = false;

const STATUS_VERIFIKASI = [
  "VERIFIED",
  "CROSS-CHECKED",
  "DEVELOPING",
  "UNCONFIRMED",
  "DISPUTED",
  "CORRECTED",
];

type ParamsArsip = {
  kategori?: string;
  status?: string;
  q?: string;
  dari?: string;
  sampai?: string;
  sumber?: string;
};

function tautanFilter(basis: ParamsArsip, ubah: Partial<ParamsArsip>): string {
  const p = new URLSearchParams();
  const gabung = { ...basis, ...ubah };
  if (gabung.kategori) p.set("kategori", gabung.kategori);
  if (gabung.status) p.set("status", gabung.status);
  if (gabung.q) p.set("q", gabung.q);
  if (gabung.dari) p.set("dari", gabung.dari);
  if (gabung.sampai) p.set("sampai", gabung.sampai);
  if (gabung.sumber) p.set("sumber", gabung.sumber);
  const s = p.toString();
  return s ? `/arsip?${s}` : "/arsip";
}

async function HasilArsip({ filter }: { filter: ParamsArsip }) {
  const artikel = await getArtikel(filter);
  const adaFilter = Boolean(
    filter.kategori ||
      filter.status ||
      filter.q ||
      filter.dari ||
      filter.sampai ||
      filter.sumber,
  );

  if (artikel.length === 0) {
    return (
      <EmptyState
        judul="Arsip masih kosong"
        pesan={
          adaFilter
            ? "Tidak ada artikel yang cocok dengan filter ini — dan memang belum ada artikel sama sekali di arsip. Artikel pertama masuk lewat mesin berita (Fase 3) setelah lolos verifikasi editorial."
            : "Belum ada artikel yang diterbitkan. Arsip akan terisi otomatis begitu mesin berita (Fase 3) berjalan dan artikel lolos verifikasi editorial."
        }
        aksi={
          adaFilter ? (
            <Link className="tombol" href="/arsip">
              Hapus semua filter
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="grid-berita">
      {artikel.map((a) => (
        <KartuArtikel key={a.id} artikel={a} />
      ))}
    </div>
  );
}

export default async function Arsip({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ambil = (k: string) => {
    const v = sp[k];
    return typeof v === "string" ? v : undefined;
  };
  const filter: ParamsArsip = {
    kategori: ambil("kategori"),
    status: ambil("status"),
    q: ambil("q"),
    dari: ambil("dari"),
    sampai: ambil("sampai"),
    sumber: ambil("sumber"),
  };
  const kategoriAktif = filter.kategori ? cariKategori(filter.kategori) : undefined;
  const sumberList = await getSumber();
  const adaFilterAktif = Boolean(
    filter.kategori ||
      filter.status ||
      filter.q ||
      filter.dari ||
      filter.sampai ||
      filter.sumber,
  );

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-arsip">
        <span className="hero-label">Arsip</span>
        <h1 id="judul-arsip">Arsip Berita</h1>
        <p>
          Telusuri seluruh artikel yang pernah diterbitkan. Filter berdasarkan
          kategori, status verifikasi, dan kata kunci.
        </p>
      </section>

      <section aria-label="Filter arsip">
        <form
          className="cari"
          action="/arsip"
          method="get"
          style={{ margin: "8px 0 0", maxWidth: "100%" }}
        >
          {filter.kategori && <input type="hidden" name="kategori" value={filter.kategori} />}
          {filter.status && <input type="hidden" name="status" value={filter.status} />}
          <label htmlFor="arsip-q" className="sr-only" style={{ position: "absolute", left: -9999 }}>
            Kata kunci
          </label>
          <input
            id="arsip-q"
            type="search"
            name="q"
            defaultValue={filter.q ?? ""}
            placeholder="Kata kunci…"
          />
          <button className="tombol tombol-primer" type="submit">
            Filter
          </button>
          {adaFilterAktif && (
            <Link className="tombol tombol-hantu" href="/arsip">
              Hapus filter
            </Link>
          )}
        </form>

        <form
          className="arsip-filter-tanggal"
          action="/arsip"
          method="get"
          aria-label="Filter tanggal dan sumber"
        >
          {filter.kategori && <input type="hidden" name="kategori" value={filter.kategori} />}
          {filter.status && <input type="hidden" name="status" value={filter.status} />}
          {filter.q && <input type="hidden" name="q" value={filter.q} />}
          <label>
            Dari
            <input type="date" name="dari" defaultValue={filter.dari ?? ""} />
          </label>
          <label>
            Sampai
            <input type="date" name="sampai" defaultValue={filter.sampai ?? ""} />
          </label>
          <label>
            Sumber
            <select name="sumber" defaultValue={filter.sumber ?? ""}>
              <option value="">Semua sumber</option>
              {sumberList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama}
                </option>
              ))}
            </select>
          </label>
          <button className="tombol" type="submit">
            Terapkan
          </button>
        </form>

        <div className="chip-baris" role="group" aria-label="Filter kategori">
          <Link
            className={`chip${!filter.kategori ? " aktif" : ""}`}
            href={tautanFilter(filter, { kategori: undefined })}
          >
            Semua kategori
          </Link>
          {KATEGORI_UTAMA.map((k) => (
            <Link
              key={k.slug}
              className={`chip${filter.kategori === k.slug ? " aktif" : ""}`}
              href={tautanFilter(filter, { kategori: k.slug })}
            >
              {k.nama}
            </Link>
          ))}
        </div>

        <div className="chip-baris" role="group" aria-label="Filter status verifikasi">
          <Link
            className={`chip${!filter.status ? " aktif" : ""}`}
            href={tautanFilter(filter, { status: undefined })}
          >
            Semua status
          </Link>
          {STATUS_VERIFIKASI.map((s) => (
            <Link
              key={s}
              className={`chip${filter.status === s ? " aktif" : ""}`}
              href={tautanFilter(filter, { status: s })}
            >
              {s}
            </Link>
          ))}
        </div>

        {kategoriAktif && (
          <p style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
            Menampilkan arsip kategori: <strong>{kategoriAktif.nama}</strong>
          </p>
        )}
      </section>

      <section className="seksi" aria-label="Hasil arsip">
        <Suspense fallback={<div className="kerangka" aria-label="Memuat arsip…" />}>
          <HasilArsip filter={filter} />
        </Suspense>
      </section>
    </div>
  );
}
