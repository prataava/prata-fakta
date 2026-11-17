import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import EmptyState from "@/components/EmptyState";
import { LABEL_SUMBER_HADIS, getHadisArbain } from "@/lib/data-live";

export const metadata: Metadata = {
  title: "Hadis Arbain Nawawi — Data Live",
  description:
    "42 hadis Arbain Nawawi dari MyQuran API — teks Arab beserta terjemahannya.",
};

// Halaman data live: dibaca per request (pola cacheComponents).
export const instant = false;

async function DaftarHadis() {
  // Baca waktu HANYA sesudah connection() — aturan cacheComponents
  // (pola halaman sholat): getHadisArbain() mengisi diambilPada
  // dengan new Date(), dan tanpa connection() build gagal di
  // prerender /data/live/hadis (temuan integrator 17 Nov 2026).
  await connection();
  const hasil = await getHadisArbain();
  if (!hasil.ok) {
    return (
      <EmptyState
        varian="tak-tersedia"
        judul="Hadis Arbain belum tersedia"
        pesan="MyQuran API sedang menjawab dengan bentuk yang tidak dikenali saat ini. Coba muat lagi beberapa saat lagi — tidak ada isi hadis yang ditampilkan dari sumber lain."
      />
    );
  }
  const { hadis, sumber, diambilPada } = hasil.data;
  const diambil = diambilPada
    ? new Date(diambilPada).toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  return (
    <div>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Sumber: {LABEL_SUMBER_HADIS[sumber]}
        {diambil ? ` · diambil ${diambil} WIB` : " · korpus statis"}
      </p>
      {sumber === "korpus" && (
        <p
          role="status"
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "12px 16px",
          }}
        >
          MyQuran API tidak dapat dijangkau saat ini — menampilkan korpus
          terverifikasi (3 hadis) sampai sumber pulih.
        </p>
      )}
      <div className="prosa">
        {hadis.map((h) => (
          <article
            key={h.nomor}
            style={{
              marginBottom: 24,
              paddingBottom: 24,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <p style={{ color: "var(--muted)", marginBottom: 4 }}>
              Hadis Arbain nomor {h.nomor} — {h.judul}
            </p>
            <p
              lang="ar"
              dir="rtl"
              style={{ fontSize: "1.3rem", lineHeight: 2, marginBottom: 8 }}
            >
              {h.arab}
            </p>
            <p>{h.terjemahan}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export default function Hadis() {
  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-hadis">
        <p className="hero-label">Data Live · MyQuran API</p>
        <h1 id="judul-hadis">
          Hadis <em>Arbain Nawawi.</em>
        </h1>
        <p className="hero-teks">
          42 hadis Arbain Nawawi — teks Arab beserta terjemahannya, langsung
          dari sumbernya. Bila sumber sedang tidak dapat dijangkau, halaman
          menampilkan korpus terverifikasi (3 hadis) dan mengatakannya dengan
          jujur.
        </p>
      </section>

      <Suspense
        fallback={
          <div>
            <div className="kerangka" role="status" aria-label="Memuat…" />
            <p role="status">Memuat hadis…</p>
          </div>
        }
      >
        <DaftarHadis />
      </Suspense>

      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Sumber:{" "}
        <a
          href="https://api.myquran.com/v2/hadits/arbain/semua"
          target="_blank"
          rel="noopener noreferrer"
        >
          api.myquran.com — Hadis Arbain Nawawi
        </a>
        .
      </p>
    </div>
  );
}
