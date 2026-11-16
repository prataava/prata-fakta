import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import { TombolIkutiCerita } from "@/components/cerita/KartuCerita";
import KronologiCerita from "@/components/cerita/KronologiCerita";
import { getCerita } from "@/lib/cerita";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cerita = await getCerita(slug);
  if (!cerita) {
    return {
      title: "Cerita tidak ditemukan",
      description: "Cerita yang dicari tidak ada atau belum diterbitkan.",
    };
  }
  return {
    title: cerita.judul,
    description:
      cerita.ringkasan ??
      `Perkembangan cerita "${cerita.judul}" di PRATA FAKTA.`,
  };
}

function formatTanggal(tanggal: string | null): string {
  if (!tanggal) return "—";
  const d = new Date(`${tanggal}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

const LABEL_PERAN: Record<string, string> = {
  terkait: "Terkait",
  pembaruan: "Pembaruan",
  latar: "Latar",
};

export default async function CeritaDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let penggunaId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    penggunaId = data.user?.id ?? null;
  } catch {
    penggunaId = null;
  }
  const cerita = await getCerita(slug, penggunaId);
  if (!cerita) notFound();

  // Pihak/lokasi terkait — HANYA dari data yang tercatat:
  // lokasi_teks event + kode negara event. Tidak ada nama pihak
  // yang dikarang; bila tidak ada lokasi di data, seksi ini
  // tidak tampil sama sekali.
  const lokasi = [...new Set(
    cerita.events
      .map((e) => e.lokasi_teks)
      .filter((l): l is string => Boolean(l && l.trim())),
  )];
  const negara = [...new Set(
    cerita.events
      .map((e) => e.negara_kode)
      .filter((k): k is string => Boolean(k)),
  )];

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-cerita-detail">
        <span className="hero-label">
          Story Tracker ·{" "}
          {cerita.status_perkembangan === "selesai"
            ? "Selesai"
            : "Masih berkembang"}
        </span>
        <h1 id="judul-cerita-detail">{cerita.judul}</h1>
        {cerita.ringkasan && <p>{cerita.ringkasan}</p>}
        <p className="kartu-meta">
          {cerita.events.length} peristiwa · {cerita.artikel.length} berita
          terkait · {cerita.jumlah_pengikut} pengikut
        </p>
        <p>
          <TombolIkutiCerita
            slug={cerita.slug}
            mengikutiAwal={cerita.mengikuti ?? false}
            masuk={penggunaId !== null}
          />{" "}
          <Link
            className="tombol tombol-hantu"
            href={`/timeline?cerita=${cerita.slug}`}
          >
            Lihat di Timeline
          </Link>
        </p>
      </section>

      <section className="seksi" aria-labelledby="seksi-kronologi">
        <div className="seksi-kepala">
          <h2 id="seksi-kronologi">Kronologi</h2>
          <p>Peristiwa dalam cerita ini, dari awal sampai kabar terbaru.</p>
        </div>
        {cerita.events.length === 0 ? (
          <EmptyState
            judul="Belum ada peristiwa dalam cerita ini."
            pesan="Redaksi belum menautkan peristiwa ke cerita ini."
          />
        ) : (
          <KronologiCerita events={cerita.events} />
        )}
      </section>

      {(lokasi.length > 0 || negara.length > 0) && (
        <section className="seksi" aria-labelledby="seksi-lokasi">
          <div className="seksi-kepala">
            <h2 id="seksi-lokasi">Lokasi yang tercatat</h2>
            <p>
              Hanya lokasi yang tercatat pada peristiwa dalam cerita
              ini — tidak ada pihak atau lokasi tambahan yang
              ditambahkan di luar data.
            </p>
          </div>
          <ul>
            {lokasi.map((l) => (
              <li key={`lok-${l}`}>{l}</li>
            ))}
            {negara.map((k) => (
              <li key={`neg-${k}`}>Kode negara: {k}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="seksi" aria-labelledby="seksi-berita">
        <div className="seksi-kepala">
          <h2 id="seksi-berita">Berita terkait</h2>
          <p>
            {cerita.artikel.length === 0
              ? "Belum ada berita yang ditautkan ke cerita ini."
              : cerita.sumber_independen !== null
                ? `${cerita.artikel.length} berita dari ${cerita.sumber_independen} sumber independen (terverifikasi lewat rantai salinan).`
                : `${cerita.artikel.length} berita terkait. Jumlah sumber independen tidak ditampilkan karena rantai salinan belum terverifikasi untuk semua berita.`}
          </p>
        </div>
        {cerita.artikel.length === 0 ? (
          <EmptyState
            judul="Belum ada berita terkait."
            pesan="Redaksi belum menautkan berita ke cerita ini."
          />
        ) : (
          <div className="grid-berita">
            {cerita.artikel.map((a) => (
              <article className="kartu" key={a.tautan_id}>
                <span className="kartu-kategori">
                  {LABEL_PERAN[a.peran] ?? a.peran}
                  {a.disalin_dari
                    ? ` · Disalin dari ${a.disalin_dari}`
                    : ""}
                  {!a.rantai_terverifikasi && a.sumber_url
                    ? " · Rantai salinan belum terverifikasi"
                    : ""}
                </span>
                <Link className="kartu-judul" href={`/artikel/${a.slug}`}>
                  {a.judul}
                </Link>
                {a.ringkasan && (
                  <span className="kartu-teks">{a.ringkasan}</span>
                )}
                <span className="kartu-meta">
                  {formatTanggal(a.diterbitkan_pada)}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="seksi">
        <p>
          <Link className="tombol" href="/cerita">
            ← Semua cerita
          </Link>
        </p>
      </section>
    </div>
  );
}
