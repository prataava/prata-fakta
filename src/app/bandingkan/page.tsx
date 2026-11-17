import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import EmptyState from "@/components/EmptyState";
import PerbandinganBersebelahan from "@/components/artikel/PerbandinganBersebelahan";
import {
  getArtikel,
  getArtikelLengkap,
  getArtikelTerkait,
  getArtikelTerbaru,
  getKategori,
  getPerbandinganDuaArtikel,
  type PerbandinganDuaArtikel,
} from "@/lib/data";

export const metadata: Metadata = {
  title: "Bandingkan Liputan",
  description:
    "Bandingkan dua liputan berdampingan: klaim yang sama di keduanya, klaim yang hanya ada di satu artikel, dan sumber tiap artikel.",
};

// Halaman membaca searchParams (?a, ?b, ?topik) — tunggu request
// nyata (connection(), aturan cacheComponents, pola /cari).
export const instant = false;

function tautanBanding(
  a: string | undefined,
  b: string | undefined,
  topik: string | undefined,
): string {
  const p = new URLSearchParams();
  if (a) p.set("a", a);
  if (b) p.set("b", b);
  if (topik) p.set("topik", topik);
  const s = p.toString();
  return s ? `/bandingkan?${s}` : "/bandingkan";
}

export default async function Bandingkan({
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
  const dimintaA = (ambil("a") ?? "").trim() || undefined;
  const dimintaB = (ambil("b") ?? "").trim() || undefined;
  const topik = (ambil("topik") ?? "").trim() || undefined;

  const [kategoriList, kandidat] = await Promise.all([
    getKategori(),
    topik ? getArtikel({ kategori: topik }) : getArtikelTerbaru(12),
  ]);

  // Saran awal: artikel terbaru pertama + artikel terkait.
  // Bila pemilih sudah menyebut slug, slug itu yang dipakai.
  const slugA = dimintaA ?? kandidat[0]?.slug;
  let slugB = dimintaB;
  if (slugA && slugB && slugA === slugB) slugB = undefined;
  if (!slugB && slugA) {
    const lengkapA = await getArtikelLengkap(slugA);
    const terkait = lengkapA ? await getArtikelTerkait(lengkapA, 4) : [];
    slugB =
      terkait.find((t) => t.slug !== slugA)?.slug ??
      kandidat.find((k) => k.slug !== slugA)?.slug;
  }
  if (!slugB) slugB = kandidat.find((k) => k.slug !== slugA)?.slug;

  let perbandingan: PerbandinganDuaArtikel | null = null;
  if (slugA && slugB) {
    perbandingan = await getPerbandinganDuaArtikel(slugA, slugB);
  }

  // Opsi pemilih = kandidat + artikel yang sedang dipilih (bila
  // tidak ada di daftar kandidat, mis. artikel lama di luar 12
  // terbaru) agar pilihan eksplisit tidak hilang dari <select>.
  const opsi = [...kandidat];
  const tambahOpsi = (slug: string | undefined, judul: string | undefined) => {
    if (!slug || opsi.some((o) => o.slug === slug)) return;
    opsi.push({
      id: `dipilih-${slug}`,
      slug,
      judul: judul ?? slug,
      ringkasan: null,
      kategori_slug: null,
      status_verifikasi: "",
      diterbitkan_pada: null,
    });
  };
  tambahOpsi(dimintaA, perbandingan?.artikelA?.judul);
  tambahOpsi(dimintaB, perbandingan?.artikelB?.judul);
  tambahOpsi(slugA, perbandingan?.artikelA?.judul);
  tambahOpsi(slugB, perbandingan?.artikelB?.judul);

  const slugTakDitemukan =
    Boolean(dimintaA || dimintaB) &&
    slugA !== undefined &&
    slugB !== undefined &&
    perbandingan !== null &&
    !perbandingan.tersedia;

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-banding">
        <span className="hero-label">Perbandingan</span>
        <h1 id="judul-banding">Bandingkan Liputan</h1>
        <p>
          Pilih dua artikel terbit dan lihat berdampingan: klaim yang
          sama di keduanya, klaim yang hanya ada di satu artikel, dan
          sumber tiap artikel. Tanpa klaim bersama, halaman tetap
          menampilkan ringkasan keduanya — dan mengatakannya dengan
          jujur.
        </p>
      </section>

      <section aria-label="Pilih artikel untuk dibandingkan">
        <form
          className="arsip-filter-tanggal"
          action="/bandingkan"
          method="get"
          aria-label="Pemilih artikel"
        >
          <label>
            Topik
            <select name="topik" defaultValue={topik ?? ""}>
              <option value="">Semua topik</option>
              {kategoriList.map((k) => (
                <option key={k.slug} value={k.slug}>
                  {k.nama}
                </option>
              ))}
            </select>
          </label>
          <label>
            Artikel A
            <select name="a" defaultValue={slugA ?? ""}>
              <option value="">— Pilih artikel —</option>
              {opsi.map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.judul}
                </option>
              ))}
            </select>
          </label>
          <label>
            Artikel B
            <select name="b" defaultValue={slugB ?? ""}>
              <option value="">— Pilih artikel —</option>
              {opsi.map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.judul}
                </option>
              ))}
            </select>
          </label>
          <button className="tombol tombol-primer" type="submit">
            Bandingkan
          </button>
        </form>
        <p style={{ color: "var(--muted)", fontSize: "0.88rem" }}>
          Saran awal: artikel terbaru
          {kandidat[0] ? (
            <>
              {" "}
              (
              <Link
                href={tautanBanding(
                  kandidat[0].slug,
                  kandidat.find((k) => k.slug !== kandidat[0]?.slug)?.slug,
                  topik,
                )}
              >
                {kandidat[0].judul}
              </Link>
              )
            </>
          ) : (
            " — belum ada artikel terbit."
          )}{" "}
          dipasangkan dengan artikel terkait pada topik yang sama bila
          ada. Filter topik memakai kategori yang sudah ada.
        </p>
      </section>

      {kandidat.length === 0 && !slugA ? (
        <EmptyState
          judul="Belum ada artikel untuk dibandingkan"
          pesan={
            topik
              ? "Tidak ada artikel terbit pada topik ini. Coba topik lain atau hapus filter topik."
              : "Belum ada satu pun artikel yang diterbitkan. Perbandingan akan tersedia begitu ada dua artikel terbit."
          }
          aksi={
            topik ? (
              <Link className="tombol" href="/bandingkan">
                Hapus filter topik
              </Link>
            ) : undefined
          }
        />
      ) : slugTakDitemukan ? (
        <EmptyState
          varian="tak-tersedia"
          judul="Artikel tidak dapat dibandingkan"
          pesan="Salah satu slug yang diminta tidak ditemukan atau artikelnya masih berstatus draf (hanya artikel terbit yang bisa dibandingkan), atau data klaim belum dapat dibaca. Pilih dua artikel lain dari pemilih di atas."
        />
      ) : perbandingan ? (
        <PerbandinganBersebelahan perbandingan={perbandingan} />
      ) : (
        <EmptyState
          judul="Pilih dua artikel"
          pesan="Pilih artikel A dan artikel B dari pemilih di atas, lalu tekan Bandingkan. Bila hanya satu artikel terbit yang tersedia, perbandingan belum bisa ditampilkan."
        />
      )}
    </div>
  );
}
