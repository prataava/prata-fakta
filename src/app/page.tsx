import Link from "next/link";
import { Activity, BarChart3, Scale, Sunrise } from "lucide-react";
import SearchBar from "@/components/SearchBar";
import EmptyState from "@/components/EmptyState";
import TanggalHariIni from "@/components/TanggalHariIni";
import NewsletterForm from "@/components/NewsletterForm";
import KartuArtikel from "@/components/artikel/KartuArtikel";
import { KATEGORI_UTAMA } from "@/lib/categories";
import {
  getArtikelTerbaru,
  getArtikelPerKategori,
  getArtikelPopuler,
  getBookmarkPengguna,
} from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

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
  const [terbaru, indonesia, dunia, populer, pengguna] = await Promise.all([
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
  ]);
  const bookmark =
    pengguna != null ? await getBookmarkPengguna(pengguna.id, 3) : [];
  const adaArtikel = terbaru.length > 0;
  const utama = terbaru[0];
  const terbaruLain = terbaru.slice(1);

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="hero-judul">
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
        <div style={{ marginTop: 18, display: "block" }}>
          <SearchBar />
        </div>
        <div className="hero-cta">
          <Link className="tombol tombol-primer" href="/brief">
            Baca Daily Brief
          </Link>
          <Link className="tombol tombol-hantu" href="/kategori">
            Jelajahi Kategori
          </Link>
        </div>
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
          <section className="seksi" aria-labelledby="seksi-utama">
            <div className="seksi-kepala">
              <h2 id="seksi-utama">Berita Utama</h2>
              <Link href="/arsip">Lihat arsip</Link>
            </div>
            <div className="berita-fitur" style={{ marginBottom: 16 }}>
              <KartuArtikel artikel={utama} fitur />
            </div>
            {terbaruLain.length > 0 && (
              <div className="grid-berita">
                {terbaruLain.map((a) => (
                  <KartuArtikel key={a.id} artikel={a} />
                ))}
              </div>
            )}
          </section>

          <section className="seksi" aria-labelledby="seksi-terbaru">
            <div className="seksi-kepala">
              <h2 id="seksi-terbaru">Berita Terbaru</h2>
              <Link href="/arsip">Lihat arsip</Link>
            </div>
            <div className="grid-berita">
              {terbaru.map((a) => (
                <KartuArtikel key={a.id} artikel={a} />
              ))}
            </div>
          </section>

          {indonesia.length > 0 && (
            <section className="seksi" aria-labelledby="seksi-indonesia">
              <div className="seksi-kepala">
                <h2 id="seksi-indonesia">Indonesia</h2>
                <Link href="/kategori/indonesia">Semua berita Indonesia</Link>
              </div>
              <div className="grid-berita">
                {indonesia.map((a) => (
                  <KartuArtikel key={a.id} artikel={a} />
                ))}
              </div>
            </section>
          )}

          {dunia.length > 0 && (
            <section className="seksi" aria-labelledby="seksi-dunia">
              <div className="seksi-kepala">
                <h2 id="seksi-dunia">Dunia</h2>
                <Link href="/kategori/dunia">Semua berita dunia</Link>
              </div>
              <div className="grid-berita">
                {dunia.map((a) => (
                  <KartuArtikel key={a.id} artikel={a} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section className="seksi" aria-labelledby="seksi-jelajah">
        <div className="seksi-kepala">
          <h2 id="seksi-jelajah">Jelajahi lebih jauh</h2>
        </div>
        <div className="grid-strip">
          {STRIP.map(({ href, label, deskripsi, Ikon }) => (
            <Link key={href} className="kartu" href={href}>
              <span className="strip-ikon" aria-hidden="true">
                <Ikon size={20} />
              </span>
              <span className="kartu-kategori">{label}</span>
              <span className="kartu-teks">{deskripsi}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="seksi" aria-labelledby="seksi-kategori">
        <div className="seksi-kepala">
          <h2 id="seksi-kategori">Jelajahi Kategori</h2>
          <Link href="/kategori">Semua kategori</Link>
        </div>
        <div className="grid-kategori">
          {KATEGORI_UTAMA.map((k) => (
            <Link key={k.slug} className="kartu" href={`/kategori/${k.slug}`}>
              <span className="kartu-kategori">{k.nama}</span>
              <span className="kartu-judul">{k.deskripsi}</span>
              <span className="kartu-meta">
                {k.sub.slice(0, 4).map((s) => s.nama).join(" · ")}
                {k.sub.length > 4 ? " · …" : ""}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {populer.length > 0 && (
        <section className="seksi" aria-labelledby="seksi-populer">
          <div className="seksi-kepala">
            <h2 id="seksi-populer">Artikel Populer</h2>
          </div>
          <div className="grid-berita">
            {populer.map((a) => (
              <KartuArtikel key={a.id} artikel={a} />
            ))}
          </div>
        </section>
      )}

      {adaArtikel && (
        <section className="seksi" aria-labelledby="seksi-rekomendasi">
          <div className="seksi-kepala">
            <h2 id="seksi-rekomendasi">Rekomendasi Personal</h2>
          </div>
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
            <div className="grid-berita">
              {bookmark.map((a) => (
                <KartuArtikel key={a.id} artikel={a} />
              ))}
            </div>
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
        <div className="seksi-kepala">
          <h2 id="seksi-newsletter">Newsletter</h2>
        </div>
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
