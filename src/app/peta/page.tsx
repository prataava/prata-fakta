import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import PetaDuniaLazy from "@/components/peta/PetaDuniaLazy";
import {
  getArtikelDenganKoordinat,
  getEventDenganKoordinat,
  getSemuaEvent,
} from "@/lib/lanjutan";
import type { MarkerPeta } from "@/components/peta/PetaDunia";

export const metadata: Metadata = {
  title: "Peta Peristiwa",
  description:
    "Peta dunia peristiwa dan berita PRATA FAKTA: hanya lokasi yang koordinatnya sudah terverifikasi yang ditampilkan sebagai marker.",
};

// Halaman peta membaca data per request (pola cacheComponents untuk
// rute yang membaca data dinamis, seperti /arsip dan /brief).
export const instant = false;

function formatTanggal(tanggal: string | null): string {
  if (!tanggal) return "Tanggal belum tersedia";
  const d = new Date(tanggal);
  if (Number.isNaN(d.getTime())) return tanggal;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

export default async function Peta() {
  const [eventBerkoordinat, artikelBerkoordinat, semua] = await Promise.all([
    getEventDenganKoordinat(),
    getArtikelDenganKoordinat(),
    getSemuaEvent(),
  ]);

  const marker: MarkerPeta[] = [
    ...eventBerkoordinat.map((e) => ({
      lintang: e.lintang as number,
      bujur: e.bujur as number,
      judul: e.judul,
      tanggal: e.dimulai_pada,
      lokasi: e.lokasi_teks,
      tautan: e.sumber_url ?? "/timeline",
      labelTautan: e.sumber_url ? "Sumber" : "Lihat di Timeline",
    })),
    ...artikelBerkoordinat.map((a) => ({
      lintang: a.lintang,
      bujur: a.bujur,
      judul: a.judul,
      tanggal: a.diterbitkan_pada,
      lokasi: a.kategori_slug,
      tautan: `/artikel/${a.slug}`,
      labelTautan: "Baca artikel",
    })),
  ];

  const tanpaKoordinat = semua.events.filter(
    (e) => e.lintang === null || e.bujur === null,
  );

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-peta">
        <span className="hero-label">Peta</span>
        <h1 id="judul-peta">Peta Peristiwa</h1>
        <p>
          Peristiwa dan berita di peta dunia. Hanya lokasi yang koordinatnya
          sudah terverifikasi yang ditampilkan sebagai marker — lokasi yang
          belum terverifikasi tidak ditebak dan tidak dipasang di peta.
        </p>
      </section>

      <section className="seksi" aria-label="Peta peristiwa">
        <PetaDuniaLazy marker={marker} />
        <p style={{ color: "var(--muted)", fontSize: "0.92rem", marginTop: 8 }}>
          Peta: © kontributor OpenStreetMap. Menampilkan {marker.length}{" "}
          marker dari {semua.adaKoordinat} peristiwa berkoordinat dan{" "}
          {artikelBerkoordinat.length} artikel berkoordinat.
        </p>
        {marker.length === 0 && (
          <EmptyState
            judul="Belum ada marker di peta"
            pesan="Belum ada satu pun peristiwa atau artikel dengan koordinat terverifikasi. Peta tetap tampil di atas; marker akan muncul begitu redaksi memverifikasi lokasi peristiwa."
          />
        )}
      </section>

      {tanpaKoordinat.length > 0 && (
        <section className="seksi" aria-labelledby="seksi-tanpa-koordinat">
          <div className="seksi-kepala">
            <h2 id="seksi-tanpa-koordinat">
              Peristiwa tanpa lokasi terverifikasi
            </h2>
            <p>
              Lokasi pasti belum terverifikasi — tidak ditampilkan di peta.
            </p>
          </div>
          <div className="grid-berita">
            {tanpaKoordinat.map((e) => (
              <article className="kartu" key={e.id}>
                <span className="kartu-kategori">
                  {e.lokasi_teks ?? "Lokasi belum terverifikasi"}
                </span>
                <span className="kartu-judul">{e.judul}</span>
                {e.ringkasan && <span className="kartu-teks">{e.ringkasan}</span>}
                <span className="kartu-meta">{formatTanggal(e.dimulai_pada)}</span>
                <Link className="tombol tombol-hantu" href="/timeline">
                  Lihat di Timeline
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
