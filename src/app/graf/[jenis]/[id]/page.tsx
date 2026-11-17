// Halaman entitas Knowledge Graph v2 (P2-1):
// /graf/[jenis]/[id] untuk jenis ∈ sumber / negara / cerita /
// kategori. Klaim + artikel + event TIDAK punya halaman entitas
// di sini — ketiganya sudah punya halaman sendiri (/klaim/[id],
// /artikel/[slug], /timeline); graf hanya menautkan ke sana.
// Isi: identitas entitas + tautan halaman asal + mini-graf SVG
// tetangga (pakai ulang GrafPengetahuan) + daftar tetangga
// berlabel relasi. Id tak ada / jenis tak dikenal → 404 jujur.
// Rute diblokir di server per request (DB dibaca per request,
// pola halaman dinamis /cerita + /negara — TANPA connection()).
// 404 NYATA dijamin proxy (src/proxy.ts, pola /pengetahuan +
// Gelombang 2): notFound() di halaman saja menampilkan UI 404
// yang benar tetapi dengan status HTTP 200 (Partial Prerender
// mengirim shell 200 sebelum notFound() berjalan); notFound()
// di sini tetap dipertahankan sebagai pengaman kedua.
// Tanpa generateStaticParams karena param adalah data runtime.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Network } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import GrafPengetahuan from "@/components/graf/GrafPengetahuan";
import {
  JENIS_ENTITAS_GRAF,
  LABEL_JENIS_ENTITAS,
  getEntitasGraf,
  type JenisEntitasGraf,
} from "@/lib/graf-entitas";
import { JENIS_SIMPUL, LABEL_JENIS_SIMPUL } from "@/lib/graf-meta";

export const instant = false;

type ParamsEntitas = { jenis: string; id: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<ParamsEntitas>;
}): Promise<Metadata> {
  const { jenis, id } = await params;
  if (!(JENIS_ENTITAS_GRAF as readonly string[]).includes(jenis)) {
    return {
      title: "Entitas tidak ditemukan",
      description: "Jenis entitas graf yang dicari tidak dikenal.",
    };
  }
  const entitas = await getEntitasGraf(jenis, id);
  if (!entitas) notFound();
  return {
    title: `${entitas.label} — Graf Pengetahuan`,
    description: `Entitas ${LABEL_JENIS_ENTITAS[entitas.jenis]} "${entitas.label}" di graf pengetahuan PRATA FAKTA beserta ${entitas.tetangga.length} tetangganya.`,
  };
}

export default async function HalamanEntitasGraf({
  params,
}: {
  params: Promise<ParamsEntitas>;
}) {
  const { jenis, id } = await params;
  if (!(JENIS_ENTITAS_GRAF as readonly string[]).includes(jenis)) {
    notFound();
  }
  const entitas = await getEntitasGraf(jenis, id);
  if (!entitas) notFound();

  const idPusat = entitas.graf.simpul[0]?.id ?? null;
  // Kelompokkan tetangga menurut urutan kolom graf (JENIS_SIMPUL).
  const kelompok = JENIS_SIMPUL.map((j) => ({
    jenis: j,
    daftar: entitas.tetangga.filter((t) => t.simpul.jenis === j),
  })).filter((k) => k.daftar.length > 0);

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-entitas">
        <span className="hero-label">
          <Network size={14} aria-hidden="true" /> Graf Pengetahuan ·{" "}
          {LABEL_JENIS_ENTITAS[entitas.jenis as JenisEntitasGraf]}
        </span>
        <h1 id="judul-entitas">{entitas.label}</h1>
        {entitas.sublabel && <p>{entitas.sublabel}</p>}
        {entitas.deskripsi && <p>{entitas.deskripsi}</p>}
        <p className="kartu-meta">
          {entitas.tetangga.length === 0
            ? "Belum ada tetangga yang tercatat di graf untuk entitas ini."
            : `${entitas.tetangga.length} tetangga di graf.`}
        </p>
        <p>
          <Link className="tombol" href="/graf">
            <ArrowLeft size={16} aria-hidden="true" /> Graf Pengetahuan
          </Link>{" "}
          <Link className="tombol tombol-hantu" href={entitas.hrefAsal}>
            Buka halaman asal
          </Link>{" "}
          {entitas.tautanLuar && (
            <a
              className="tombol tombol-hantu"
              href={entitas.tautanLuar}
              target="_blank"
              rel="noopener noreferrer"
            >
              Buka situs sumber <ExternalLink size={16} aria-hidden="true" />
            </a>
          )}
        </p>
      </section>

      <section className="seksi" aria-labelledby="seksi-minigraf">
        <div className="seksi-kepala">
          <h2 id="seksi-minigraf">Mini-graf</h2>
          <p>
            Entitas ini di tengah, tetangganya di sekeliling. Garis
            berlabel: arah bukti klaim (mendukung / menentang /
            netral), &ldquo;bagian dari cerita&rdquo;, &ldquo;diliput
            dalam&rdquo;, &ldquo;profil negara&rdquo;, dan
            &ldquo;kategori artikel&rdquo; — semua dari relasi yang
            sudah tercatat di sistem.
          </p>
        </div>
        {entitas.tetangga.length === 0 ? (
          <EmptyState
            judul="Entitas ini belum punya tetangga di graf."
            pesan="Entitasnya tercatat, tapi belum ada relasi yang menghubungkannya dengan artikel, klaim, peristiwa, atau cerita di sistem. Tetangga muncul otomatis begitu relasinya tercatat."
          />
        ) : (
          <GrafPengetahuan graf={entitas.graf} idEntitasAktif={idPusat} />
        )}
      </section>

      <section className="seksi" aria-labelledby="seksi-tetangga">
        <div className="seksi-kepala">
          <h2 id="seksi-tetangga">Tetangga di graf</h2>
          <p>
            Setiap tetangga tercantum beserta label relasinya — label
            itu dibaca dari data, bukan ditebak.
          </p>
        </div>
        {kelompok.length === 0 ? (
          <EmptyState
            judul="Belum ada tetangga."
            pesan="Belum ada artikel, klaim, peristiwa, atau cerita yang tertaut ke entitas ini."
          />
        ) : (
          kelompok.map(({ jenis, daftar }) => (
            <div key={jenis} style={{ marginBottom: 24 }}>
              <h3>
                {LABEL_JENIS_SIMPUL[jenis]} ({daftar.length})
              </h3>
              <ul
                style={{
                  display: "grid",
                  gap: 8,
                  listStyle: "none",
                  padding: 0,
                  margin: "8px 0 0",
                }}
              >
                {daftar.map(({ simpul, relasi, arah, detail }) => (
                  <li key={simpul.id}>
                    <Link className="kartu kartu-artikel" href={simpul.href ?? "/graf"}>
                      <span className="kartu-kategori">{relasi}</span>
                      <span className="kartu-judul">{simpul.label}</span>
                      {simpul.sublabel && (
                        <span className="kartu-meta">{simpul.sublabel}</span>
                      )}
                      {detail && <span className="kartu-teks">{detail}</span>}
                      {arah && (
                        <span className="kartu-meta">
                          Arah bukti: {arah}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <p>
        <Link className="tombol" href="/graf">
          ← Graf Pengetahuan
        </Link>{" "}
        <Link className="tombol tombol-hantu" href={entitas.hrefAsal}>
          Buka halaman asal
        </Link>
      </p>
    </div>
  );
}
