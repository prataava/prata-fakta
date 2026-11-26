import Link from "next/link";
import { Activity, BarChart3, Scale, Sunrise } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import TanggalHariIni from "@/components/TanggalHariIni";
import NewsletterForm from "@/components/NewsletterForm";
import KartuArtikel from "@/components/artikel/KartuArtikel";
import DaftarTerbaca from "@/components/artikel/DaftarTerbaca";
import HeroUtama from "@/components/artikel/HeroUtama";
import BilahTerkini from "@/components/BilahTerkini";
import MarqueeSumber from "@/components/MarqueeSumber";
import { AreaPulse, Reveal, Stagger, StaggerItem } from "@/components/motion";
import { KATEGORI_UTAMA } from "@/lib/categories";
import { tierDariPrioritas } from "@/lib/ai/source-analysis";
import {
  getArtikelTerbaru,
  getArtikelPerKategori,
  getArtikelPopuler,
  getBookmarkPengguna,
  getSumber,
} from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import gaya from "./beranda.module.css";

// Beranda PRATA FAKTA — MUKA BARU (20 Nov 2026).
// Komposisi layar pertama dirombak total dari Fase 4 (pengguna
// menilai redesign sebelumnya "sama aja"): bilah TERKINI gelap
// tepat di bawah masthead → hero SINEMATIK layar penuh (foto
// berita utama + judul serif raksasa menimpa foto) → marquee
// sumber tier-1 → Sorotan (2 kartu fitur besar) → Berita
// Terbaru → Indonesia → Dunia → strip jelajah → kategori →
// Paling Banyak Dibaca (daftar bernomor dari data baca nyata)
// → rekomendasi → newsletter. Pernyataan merek lama pindah ke
// masthead (tanggal + tagline di Header); blok teks hero lama
// hanya tampil bila BELUM ada artikel sama sekali.
// ATURAN KOSONG tetap: seksi tanpa data tidak tampil; tidak
// ada angka/artikel karangan di mana pun.

// Beranda membaca sesi pengguna (untuk Rekomendasi Personal) — rute
// diblokir di server per request (pola resmi cacheComponents).
export const instant = false;

const STRIP = [
  {
    href: "/brief",
    label: "Daily Brief",
    deskripsi: "Ringkasan harian berita terpenting.",
    Ikon: Sunrise,
  },
  {
    href: "/kategori/fakta-mitos",
    label: "Fakta & Mitos",
    deskripsi: "Periksa klaim publik dengan bukti.",
    Ikon: Scale,
  },
  {
    href: "/kategori/data-statistik",
    label: "Data & Statistik",
    deskripsi: "Grafik dan tren indikator resmi.",
    Ikon: BarChart3,
  },
  {
    href: "/data/live",
    label: "Data Live",
    deskripsi: "Gempa, cuaca, kurs, dan sholat — data langsung.",
    Ikon: Activity,
  },
];

export default async function Beranda() {
  const [terbaru, indonesia, dunia, populer, pengguna, sumber] = await Promise.all([
    getArtikelTerbaru(6),
    getArtikelPerKategori("indonesia", 3),
    getArtikelPerKategori("dunia", 3),
    getArtikelPopuler(5),
    (async () => {
      try {
        const supabase = await createClient();
        const { data } = await supabase.auth.getUser();
        return data.user ?? null;
      } catch {
        return null;
      }
    })(),
    getSumber(),
  ]);
  // Marquee: nama sumber tier-1 NYATA dari data (prioritas >= 90),
  // deduplikasi nama; kosong = marquee tidak tampil (jujur).
  const sumberTier1 = [...new Set(
    sumber
      .filter((s) => tierDariPrioritas(s.prioritas) === 1)
      .map((s) => s.nama),
  )];
  const bookmark =
    pengguna != null ? await getBookmarkPengguna(pengguna.id, 3) : [];
  const adaArtikel = terbaru.length > 0;
  const utama = terbaru[0];
  const terbaruLain = terbaru.slice(1);
  // Sorotan: 2 berita berikutnya sebagai kartu fitur BESAR tepat
  // di bawah hero; sisanya masuk grid Berita Terbaru.
  const sorotan = terbaruLain.slice(0, 2);
  const terbaruSisa = terbaruLain.slice(2);

  // Plasma (25 Nov 2026): AreaPulse membungkus .wadah — klik di
  // area kosong beranda memicu gelombang cincin (pulse); klik
  // tautan/tombol/input tidak memicu apa-apa.
  return (
    <AreaPulse className="wadah">
      {adaArtikel && utama ? (
        <>
          {/* Layar pertama muka baru: strip TERKINI + hero
              sinematik layar penuh + marquee sumber tier-1. */}
          <BilahTerkini items={terbaru} />
          <HeroUtama artikel={utama} />
          <MarqueeSumber namaSumber={sumberTier1} />
        </>
      ) : (
        <>
          {/* Belum ada artikel: pernyataan merek ringkas +
              SATU empty state (aturan kosong lama). */}
          <section className={`hero ${gaya.heroRingkas}`} aria-labelledby="hero-judul">
            <span className="hero-label">Berita · Fakta · Data</span>
            <h1 id="hero-judul">
              Pahami dunia. Berdasarkan <em>fakta</em>.
            </h1>
            <p>
              Berita terkini Indonesia dan dunia dengan sumber yang jelas,
              pemeriksaan fakta yang ketat, serta data dan kronologi yang dapat
              diperiksa. Tanpa clickbait, tanpa kabar karangan.
            </p>
            <p style={{ fontSize: "0.9rem" }}>
              <TanggalHariIni awalan="Hari ini: " />
            </p>
            <div className="hero-cta">
              <Link className="tombol tombol-primer" href="/brief">
                Baca Daily Brief
              </Link>
              <Link className="tombol tombol-hantu" href="/kategori">
                Jelajahi Kategori
              </Link>
            </div>
          </section>
          <section className="seksi" aria-label="Belum ada artikel">
            <EmptyState
              judul="Belum ada artikel yang diterbitkan"
              pesan="Redaksi sedang menyiapkan artikel pertama. Setiap artikel melewati pemeriksaan sumber dan verifikasi editorial sebelum tampil di sini — tidak ada berita yang diterbitkan tanpa bukti."
              aksi={
                <span
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    justifyContent: "center",
                    marginTop: 14,
                  }}
                >
                  <Link className="tombol tombol-primer" href="/kategori">
                    Jelajahi Kategori
                  </Link>
                  <Link className="tombol tombol-hantu" href="/data/live">
                    Lihat Data Live
                  </Link>
                  {pengguna == null && (
                    <Link className="tombol tombol-hantu" href="/daftar">
                      Buat akun gratis
                    </Link>
                  )}
                </span>
              }
            />
          </section>
        </>
      )}

      {adaArtikel && (
        <>
          {sorotan.length > 0 && (
            <section className="seksi" aria-labelledby="seksi-sorotan">
              <Reveal>
                <div className="seksi-kepala">
                  <h2 id="seksi-sorotan">Sorotan</h2>
                  <Link href="/arsip">Lihat arsip</Link>
                </div>
              </Reveal>
              <div className={gaya.sorotan}>
                {sorotan.map((a) => (
                  <Reveal key={a.id}>
                    <KartuArtikel artikel={a} fitur />
                  </Reveal>
                ))}
              </div>
            </section>
          )}

          {terbaruSisa.length > 0 && (
            <section className="seksi" aria-labelledby="seksi-terbaru">
              <Reveal>
                <div className="seksi-kepala">
                  <h2 id="seksi-terbaru">Berita Terbaru</h2>
                  <Link href="/arsip">Lihat arsip</Link>
                </div>
              </Reveal>
              <Stagger className="grid-berita">
                {terbaruSisa.map((a) => (
                  <StaggerItem key={a.id} className={gaya.butir}>
                    <KartuArtikel artikel={a} />
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
          )}

          {indonesia.length > 0 && (
            <section className="seksi" aria-labelledby="seksi-indonesia">
              <Reveal>
                <div className="seksi-kepala">
                  <h2 id="seksi-indonesia">Indonesia</h2>
                  <Link href="/kategori/indonesia">Semua berita Indonesia</Link>
                </div>
              </Reveal>
              <Stagger className="grid-berita">
                {indonesia.map((a) => (
                  <StaggerItem key={a.id} className={gaya.butir}>
                    <KartuArtikel artikel={a} />
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
          )}

          {dunia.length > 0 && (
            <section className="seksi" aria-labelledby="seksi-dunia">
              <Reveal>
                <div className="seksi-kepala">
                  <h2 id="seksi-dunia">Dunia</h2>
                  <Link href="/kategori/dunia">Semua berita dunia</Link>
                </div>
              </Reveal>
              <Stagger className="grid-berita">
                {dunia.map((a) => (
                  <StaggerItem key={a.id} className={gaya.butir}>
                    <KartuArtikel artikel={a} />
                  </StaggerItem>
                ))}
              </Stagger>
            </section>
          )}
        </>
      )}

      <section className="seksi" aria-labelledby="seksi-jelajah">
        <Reveal>
          <div className="seksi-kepala">
            <h2 id="seksi-jelajah">Jelajahi lebih jauh</h2>
          </div>
        </Reveal>
        <Stagger className="grid-strip">
          {STRIP.map(({ href, label, deskripsi, Ikon }) => (
            <StaggerItem key={href} className={gaya.butir}>
              <Link className="kartu" href={href}>
                <span className="strip-ikon" aria-hidden="true">
                  <Ikon size={20} />
                </span>
                <span className="kartu-kategori">{label}</span>
                <span className="kartu-teks">{deskripsi}</span>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <section className="seksi" aria-labelledby="seksi-kategori">
        <Reveal>
          <div className="seksi-kepala">
            <h2 id="seksi-kategori">Jelajahi Kategori</h2>
            <Link href="/kategori">Semua kategori</Link>
          </div>
        </Reveal>
        <Stagger className="grid-kategori">
          {KATEGORI_UTAMA.map((k) => (
            <StaggerItem key={k.slug} className={gaya.butir}>
              <Link className="kartu" href={`/kategori/${k.slug}`}>
                <span className="kartu-kategori">{k.nama}</span>
                <span className="kartu-judul">{k.deskripsi}</span>
                {/* Sub-kategori dipotong di 4 + "…" (P5): daftar lengkap
                  tersedia lewat tooltip agar tidak ada info tersembunyi. */}
                <span
                  className="kartu-meta"
                  title={k.sub.map((s) => s.nama).join(" · ")}
                >
                  {k.sub.slice(0, 4).map((s) => s.nama).join(" · ")}
                  {k.sub.length > 4 ? " · …" : ""}
                </span>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {populer.length > 0 && (
        <section className="seksi" aria-labelledby="seksi-populer">
          <Reveal>
            <div className="seksi-kepala">
              <h2 id="seksi-populer">Paling Banyak Dibaca</h2>
            </div>
          </Reveal>
          <DaftarTerbaca items={populer} />
        </section>
      )}

      {adaArtikel && (
        <section className="seksi" aria-labelledby="seksi-rekomendasi">
          <Reveal>
            <div className="seksi-kepala">
              <h2 id="seksi-rekomendasi">Rekomendasi Personal</h2>
            </div>
          </Reveal>
          {pengguna == null ? (
            <EmptyState
              varian="izin"
              judul="Masuk untuk rekomendasi personal"
              pesan="Rekomendasi disusun dari kategori yang Anda ikuti dan riwayat baca Anda. Buat akun gratis, pilih minat Anda, dan rekomendasi akan muncul di sini."
              aksi={
                <Link className="tombol tombol-primer" href="/daftar">
                  Buat akun gratis
                </Link>
              }
            />
          ) : bookmark.length > 0 ? (
            <Stagger className="grid-berita">
              {bookmark.map((a) => (
                <StaggerItem key={a.id} className={gaya.butir}>
                  <KartuArtikel artikel={a} />
                </StaggerItem>
              ))}
            </Stagger>
          ) : (
            <EmptyState
              judul="Belum ada bookmark"
              pesan="Anda belum menyimpan artikel apa pun. Buka sebuah artikel dan tekan tombol Bookmark — artikel yang Anda simpan akan muncul di sini."
              aksi={
                <Link className="tombol" href="/arsip">
                  Jelajahi arsip
                </Link>
              }
            />
          )}
        </section>
      )}

      <section className="seksi seksi-newsletter" aria-labelledby="seksi-newsletter">
        <Reveal>
          <div className="seksi-kepala">
            <h2 id="seksi-newsletter">Newsletter</h2>
          </div>
        </Reveal>
        <div className="kartu">
          <span className="kartu-kategori">Ringkasan pagi · Gratis</span>
          <span className="kartu-judul">
            Daily Brief langsung ke email Anda setiap pagi
          </span>
          <span className="kartu-teks">
            Satu email setiap pagi berisi berita terpenting. Tanpa spam,
            berhenti berlangganan kapan saja dari tautan di email.
          </span>
          <NewsletterForm />
        </div>
      </section>
    </AreaPulse>
  );
}
