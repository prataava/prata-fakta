import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import EmptyState from "@/components/EmptyState";
import { getDaftarKitab, getHadis } from "@/lib/data-live";

export const metadata: Metadata = {
  title: "Hadis — Data Live",
  description:
    "Kitab-kitab hadis dan isi hadis per nomor dari api.hadith.gading.dev.",
};

// Halaman data live: dibaca per request (pola cacheComponents).
export const instant = false;

async function DaftarKitab() {
  const hasil = await getDaftarKitab();
  if (!hasil.ok) {
    return (
      <EmptyState
        varian="tak-tersedia"
        judul="Kitab hadis belum tersedia"
        pesan="Sumber api.hadith.gading.dev sedang tidak dapat dijangkau (diperiksa 16 November 2026 dari dua jalur — host tidak menjawab). Halaman ini akan berfungsi otomatis begitu sumber pulih; tidak ada isi hadis yang ditampilkan dari sumber lain."
      />
    );
  }
  return (
    <div className="grid-berita">
      {hasil.data.map((k) => (
        <Link key={k.slug} className="kartu" href={`/data/live/hadis?kitab=${k.slug}`}>
          <span className="kartu-kategori">
            {k.jumlahHadis > 0 ? `${k.jumlahHadis} hadis` : "Kitab hadis"}
          </span>
          <span className="kartu-judul">{k.nama}</span>
          {k.namaArab && (
            <span className="kartu-teks" lang="ar" dir="rtl">
              {k.namaArab}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

async function IsiKitab({ kitab, dari }: { kitab: string; dari: number }) {
  const sampai = dari + 19;
  const hasil = await getHadis(kitab, dari, sampai);
  if (!hasil.ok) {
    return (
      <EmptyState
        varian="tak-tersedia"
        judul="Hadis belum tersedia"
        pesan="Sumber api.hadith.gading.dev sedang tidak dapat dijangkau saat ini. Coba muat lagi beberapa saat lagi."
      />
    );
  }
  return (
    <div>
      <div className="prosa">
        {hasil.data.hadis.map((h) => (
          <article
            key={h.nomor}
            style={{
              marginBottom: 24,
              paddingBottom: 24,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <p style={{ color: "var(--muted)", marginBottom: 4 }}>
              Hadis nomor {h.nomor}
            </p>
            <p
              lang="ar"
              dir="rtl"
              style={{ fontSize: "1.3rem", lineHeight: 2, marginBottom: 8 }}
            >
              {h.arab}
            </p>
            {h.terjemahan && <p>{h.terjemahan}</p>}
          </article>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {dari > 1 && (
          <Link
            className="tombol"
            href={`/data/live/hadis?kitab=${encodeURIComponent(kitab)}&dari=${Math.max(1, dari - 20)}`}
          >
            ← 20 sebelumnya
          </Link>
        )}
        <Link
          className="tombol tombol-primer"
          href={`/data/live/hadis?kitab=${encodeURIComponent(kitab)}&dari=${dari + 20}`}
        >
          20 berikutnya →
        </Link>
        <Link className="tombol" href="/data/live/hadis">
          Daftar kitab
        </Link>
      </div>
    </div>
  );
}

export default async function Hadis({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const kitab = typeof sp.kitab === "string" ? sp.kitab : "";
  const dariMentah = typeof sp.dari === "string" ? Number(sp.dari) : NaN;
  const dari =
    Number.isInteger(dariMentah) && dariMentah >= 1 ? dariMentah : 1;

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-hadis">
        <p className="hero-label">Data Live · api.hadith.gading.dev</p>
        <h1 id="judul-hadis">
          Hadis <em>{kitab ? `— ${kitab}` : "per kitab."}</em>
        </h1>
        <p className="hero-teks">
          Kitab-kitab hadis dan isi hadis per nomor. Teks Arab beserta
          terjemahannya, langsung dari sumbernya.
        </p>
      </section>

      {kitab === "" ? (
        <Suspense
          fallback={
            <div>
              <div className="kerangka" role="status" aria-label="Memuat…" />
              <p role="status">Memuat daftar kitab…</p>
            </div>
          }
        >
          <DaftarKitab />
        </Suspense>
      ) : (
        <Suspense
          fallback={
            <div>
              <div className="kerangka" role="status" aria-label="Memuat…" />
              <p role="status">Memuat hadis…</p>
            </div>
          }
        >
          <IsiKitab kitab={kitab} dari={dari} />
        </Suspense>
      )}

      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Sumber:{" "}
        <a
          href="https://api.hadith.gading.dev/"
          target="_blank"
          rel="noopener noreferrer"
        >
          api.hadith.gading.dev
        </a>
        .
      </p>
    </div>
  );
}
