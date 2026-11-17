// Halaman /klaim/[id] — detail satu klaim artikel TERBIT (P1-2).
// Teks klaim + status kini + tautan artikel asal + linimasa
// pf_verification_records artikel asal (kronologis) + daftar bukti
// pf_evidence. getKlaim mengembalikan null untuk id tak ada MAUPUN
// klaim draf — keduanya 404, tanpa membocorkan mana yang draf.
// generateMetadata memeriksa dulu (pola /pengetahuan/[slug]) agar
// id tak ada menghasilkan status 404 yang benar, bukan shell 200.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import {
  getKlaim,
  LABEL_ARAH_BUKTI,
  LABEL_JENIS_KLAIM,
  LABEL_STATUS_KLAIM,
  type JenisKlaim,
  type StatusKlaim,
} from "@/lib/klaim";
import { kelasLencanaStatus, labelStatusVerifikasi } from "@/lib/verifikasi";

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const klaim = await getKlaim(id);
  if (!klaim) notFound();
  return {
    title: `Klaim: ${klaim.teks.slice(0, 80)}${klaim.teks.length > 80 ? "…" : ""}`,
    description: `Status verifikasi klaim dari artikel "${klaim.artikel.judul}" beserta bukti dan linimasa pemeriksaannya.`,
  };
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

function namaSumberDariUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default async function HalamanDetailKlaim({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const klaim = await getKlaim(id);
  if (!klaim) notFound();

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-klaim">
        <span className="hero-label">
          Pelacak Klaim · {LABEL_JENIS_KLAIM[klaim.jenis as JenisKlaim] ?? klaim.jenis}
        </span>
        <h1 id="judul-klaim">{klaim.teks}</h1>
        <p>
          <span className="lencana">
            Status klaim: {LABEL_STATUS_KLAIM[klaim.status as StatusKlaim] ?? klaim.status}
          </span>{" "}
          <span className={kelasLencanaStatus(klaim.artikel.status_verifikasi)}>
            Artikel: {labelStatusVerifikasi(klaim.artikel.status_verifikasi)}
          </span>
        </p>
        <p>
          Dicatat: {formatTanggal(klaim.dibuat_pada)}
        </p>
      </section>

      <section className="seksi" aria-labelledby="seksi-artikel-asal">
        <div className="seksi-kepala">
          <h2 id="seksi-artikel-asal">Artikel asal</h2>
          <p>Klaim ini diekstrak dari artikel terbit berikut.</p>
        </div>
        <article className="kartu">
          <span className="kartu-judul">
            <Link href={`/artikel/${klaim.artikel.slug}`}>{klaim.artikel.judul}</Link>
          </span>
          <Link className="tombol tombol-hantu" href={`/artikel/${klaim.artikel.slug}`}>
            Baca artikelnya
          </Link>
        </article>
      </section>

      <section className="seksi" aria-labelledby="seksi-bukti">
        <div className="seksi-kepala">
          <h2 id="seksi-bukti">Bukti</h2>
          <p>
            Sumber yang mendukung atau menentang klaim ini, beserta
            kutipannya. Bukti tanpa kutipan tetap dicantumkan sumbernya.
          </p>
        </div>
        {klaim.bukti.length === 0 ? (
          <EmptyState
            judul="Belum ada bukti yang tercatat"
            pesan="Klaim ini belum punya bukti pendukung atau penentang yang tercatat di sistem. Statusnya bisa berubah begitu bukti masuk dan diperiksa redaksi."
          />
        ) : (
          <ul style={{ display: "grid", gap: 12, listStyle: "none", padding: 0, margin: 0 }}>
            {klaim.bukti.map((b) => (
              <li key={b.id} className="kartu" style={{ margin: 0 }}>
                <span className="lencana">{LABEL_ARAH_BUKTI[b.arah] ?? b.arah}</span>{" "}
                {b.sumber_url ? (
                  <Link href={b.sumber_url} target="_blank" rel="noopener noreferrer">
                    {b.sumber_nama ?? namaSumberDariUrl(b.sumber_url)}
                  </Link>
                ) : (
                  (b.sumber_nama ?? "Sumber tidak bernama")
                )}
                {b.kutipan && (
                  <blockquote style={{ margin: "8px 0 0", color: "var(--ink-2)" }}>
                    &ldquo;{b.kutipan}&rdquo;
                  </blockquote>
                )}
                <span className="kartu-meta">{formatTanggal(b.dibuat_pada)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="seksi" aria-labelledby="seksi-linimasa">
        <div className="seksi-kepala">
          <h2 id="seksi-linimasa">Linimasa pemeriksaan</h2>
          <p>
            Keputusan verifikasi atas artikel asal klaim ini, dari yang
            tertua sampai yang terbaru. Satu keputusan bisa berubah
            sesudah pemeriksaan lanjutan atau koreksi.
          </p>
        </div>
        {klaim.linimasa.length === 0 ? (
          <EmptyState
            judul="Belum ada catatan pemeriksaan"
            pesan="Belum ada catatan verifikasi yang tercatat untuk artikel asal klaim ini."
          />
        ) : (
          <ol style={{ display: "grid", gap: 12, listStyle: "none", padding: 0, margin: 0 }}>
            {klaim.linimasa.map((v) => (
              <li key={v.id} className="kartu" style={{ margin: 0 }}>
                <span className={kelasLencanaStatus(v.keputusan)}>
                  {labelStatusVerifikasi(v.keputusan)}
                </span>
                {v.catatan && <span className="kartu-teks">{v.catatan}</span>}
                <span className="kartu-meta">
                  {formatTanggal(v.dibuat_pada)} · {v.agen}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p>
        <Link className="tombol tombol-hantu" href="/klaim">
          ← Semua klaim
        </Link>{" "}
        <Link className="tombol tombol-hantu" href="/graf">
          Lihat di Graf Pengetahuan
        </Link>
      </p>
    </div>
  );
}
