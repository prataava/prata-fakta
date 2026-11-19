import Link from "next/link";
import { Activity, BarChart3, Scale, Sunrise } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import TanggalHariIni from "@/components/TanggalHariIni";
import NewsletterForm from "@/components/NewsletterForm";
import KartuArtikel from "@/components/artikel/KartuArtikel";
import HeroUtama from "@/components/artikel/HeroUtama";
import MarqueeSumber from "@/components/MarqueeSumber";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";
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

// Beranda PRATA FAKTA — V3 Fase 9 (17 Nov 2026).
// Komposisi editorial: hero ringkas → berita (bila ada) → strip
// jelajah → kategori → populer → rekomendasi → newsletter.
// ATURAN KOSONG: bila belum ada artikel SAMA SEKALI, seluruh seksi
// berita disembunyikan dan diganti SATU empty state ringkas yang
// elegan (bukan 5–7 empty state raksasa). Seksi tanpa data tidak
// pernah menampilkan angka/artikel karangan. Strip "Jelajahi lebih
// jauh" berisi tautan navigasi ke fitur yang benar-benar ada
// (bukan klaim data): Daily Brief, Fakta & Mitos, Data & Statistik,
// Data Live (API publik langsung — berfungsi hari ini).

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

  return (
    <div className="wadah">
      {/* Hero foto-led (Fase 4): pernyataan merek ringkas +
          berita utama dengan gambar besarnya + marquee sumber
          tier-1. Kotak cari hero DIHAPUS (audit: 3 kotak cari
          → 2 — tersisa SearchBar header + Command Palette). */}
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
        {adaArtikel && utama && <HeroUtama artikel={utama} />}
        <MarqueeSumber namaSumber={sumberTier1} />
      </section>

      {!adaArtikel ? (
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
      ) : (
        <>
          {/* Berita Utama sudah tampil sebagai hero foto-led di
              atas — seksi ini menampilkan berita terbaru lainnya. */}
          {terbaruLain.length > 0 && (
            <section className="seksi" aria-labelledby="seksi-terbaru">
              <Reveal>
                <div className="seksi-kepala">
                  <h2 id="seksi-terbaru">Berita Terbaru</h2>
                  <Link href="/arsip">Lihat arsip</Link>
                </div>
              </Reveal>
              <Stagger className="grid-berita">
                {terbaruLain.map((a) => (
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
                <span className="kartu-meta">
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
              <h2 id="seksi-populer">Artikel Populer</h2>
            </div>
          </Reveal>
          <Stagger className="grid-berita">
            {populer.map((a) => (
              <StaggerItem key={a.id} className={gaya.butir}>
                <KartuArtikel artikel={a} />
              </StaggerItem>
            ))}
          </Stagger>
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
    </div>
  );
}
