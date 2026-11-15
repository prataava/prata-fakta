import Link from "next/link";
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

// Beranda PRATA FAKTA — Fase 2.
// Semua seksi menampilkan data nyata dari pf_articles; seksi yang datanya
// belum ada menampilkan empty state JUJUR (bukan artikel atau angka palsu).
// Seksi Artikel Populer disembunyikan seluruhnya bila belum ada data baca
// nyata — tanpa empty state berisi angka.

const SOROTAN = ["indonesia", "dunia", "teknologi", "ekonomi"];

// Beranda membaca sesi pengguna (untuk Rekomendasi Personal) — rute
// diblokir di server per request (pola resmi cacheComponents).
export const instant = false;

export default async function Beranda() {
  const sorotan = KATEGORI_UTAMA.filter((k) => SOROTAN.includes(k.slug));
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
  const utama = terbaru[0];
  const terbaruLain = terbaru.slice(1);

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="hero-judul">
        <span className="hero-label">Berita · Fakta · Data</span>
        <h1 id="hero-judul">Pahami dunia. Berdasarkan fakta.</h1>
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
      </section>

      <section className="seksi" aria-labelledby="seksi-utama">
        <div className="seksi-kepala">
          <h2 id="seksi-utama">Berita Utama</h2>
          <Link href="/arsip">Lihat arsip</Link>
        </div>
        {utama ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <KartuArtikel artikel={utama} />
            </div>
            {terbaruLain.length > 0 && (
              <div className="grid-berita">
                {terbaruLain.map((a) => (
                  <KartuArtikel key={a.id} artikel={a} />
                ))}
              </div>
            )}
          </>
        ) : (
          <EmptyState
            judul="Belum ada berita utama"
            pesan="Mesin pencari berita (Fase 3) belum berjalan, jadi belum ada artikel yang diterbitkan. Artikel pertama akan tampil di sini setelah sumber RSS dan GDELT aktif dan melewati verifikasi editorial."
          />
        )}
      </section>

      <section className="seksi" aria-labelledby="seksi-terbaru">
        <div className="seksi-kepala">
          <h2 id="seksi-terbaru">Berita Terbaru</h2>
          <Link href="/arsip">Lihat arsip</Link>
        </div>
        {terbaru.length > 0 ? (
          <div className="grid-berita">
            {terbaru.map((a) => (
              <KartuArtikel key={a.id} artikel={a} />
            ))}
          </div>
        ) : (
          <EmptyState
            judul="Belum ada berita terbaru"
            pesan="Belum ada artikel yang masuk ke redaksi. Begitu mesin berita Fase 3 aktif, berita terbaru dari sumber terverifikasi akan muncul di sini."
          />
        )}
      </section>

      <section className="seksi" aria-labelledby="seksi-indonesia">
        <div className="seksi-kepala">
          <h2 id="seksi-indonesia">Indonesia</h2>
          <Link href="/kategori/indonesia">Semua berita Indonesia</Link>
        </div>
        {indonesia.length > 0 ? (
          <div className="grid-berita">
            {indonesia.map((a) => (
              <KartuArtikel key={a.id} artikel={a} />
            ))}
          </div>
        ) : (
          <EmptyState
            judul="Belum ada berita Indonesia"
            pesan="Belum ada artikel kategori Indonesia yang diterbitkan. Artikel pertama akan tampil di sini setelah lolos verifikasi editorial."
          />
        )}
      </section>

      <section className="seksi" aria-labelledby="seksi-dunia">
        <div className="seksi-kepala">
          <h2 id="seksi-dunia">Dunia</h2>
          <Link href="/kategori/dunia">Semua berita dunia</Link>
        </div>
        {dunia.length > 0 ? (
          <div className="grid-berita">
            {dunia.map((a) => (
              <KartuArtikel key={a.id} artikel={a} />
            ))}
          </div>
        ) : (
          <EmptyState
            judul="Belum ada berita dunia"
            pesan="Belum ada artikel kategori Dunia yang diterbitkan. Artikel pertama akan tampil di sini setelah lolos verifikasi editorial."
          />
        )}
      </section>

      <section className="seksi" aria-labelledby="seksi-brief">
        <div className="seksi-kepala">
          <h2 id="seksi-brief">Daily Brief</h2>
          <Link href="/brief">Buka Daily Brief</Link>
        </div>
        <EmptyState
          judul="Daily Brief pertama belum terbit"
          pesan="Ringkasan harian berita terpenting Indonesia dan dunia dibuat setiap pagi oleh agen Daily Brief (Fase 4), setelah mesin berita berjalan. Belum ada edisi yang diterbitkan."
          aksi={
            <Link className="tombol" href="/brief">
              Tentang Daily Brief
            </Link>
          }
        />
      </section>

      <section className="seksi" aria-labelledby="seksi-sorotan">
        <div className="seksi-kepala">
          <h2 id="seksi-sorotan">Sorotan Kategori</h2>
          <Link href="/kategori">Semua kategori</Link>
        </div>
        <div className="grid-berita">
          {sorotan.map((k) => (
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

      <section className="seksi" aria-labelledby="seksi-kategori">
        <div className="seksi-kepala">
          <h2 id="seksi-kategori">Jelajahi Semua Kategori</h2>
          <Link href="/kategori">Semua kategori</Link>
        </div>
        <div className="grid-kategori">
          {KATEGORI_UTAMA.map((k) => (
            <Link key={k.slug} className="kartu" href={`/kategori/${k.slug}`}>
              <span className="kartu-kategori">{k.nama}</span>
              <span className="kartu-teks">{k.deskripsi}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="seksi" aria-labelledby="seksi-fakta">
        <div className="seksi-kepala">
          <h2 id="seksi-fakta">Fakta &amp; Mitos</h2>
          <Link href="/kategori/fakta-mitos">Buka pemeriksaan fakta</Link>
        </div>
        <EmptyState
          judul="Belum ada pemeriksaan fakta"
          pesan="Pemeriksaan klaim publik dimulai bersama mesin verifikasi (Fase 4). Setiap pemeriksaan akan memuat klaim, asal, bukti pendukung dan bertentangan, sumber primer, analisis, dan kesimpulan."
        />
      </section>

      <section className="seksi" aria-labelledby="seksi-data">
        <div className="seksi-kepala">
          <h2 id="seksi-data">Data &amp; Statistik</h2>
          <Link href="/kategori/data-statistik">Buka pusat data</Link>
        </div>
        <EmptyState
          judul="Belum ada data yang diterbitkan"
          pesan="Pusat data interaktif (Fase 6) akan menyajikan indikator resmi dari BPS, Bank Indonesia, dan lembaga resmi lain — lengkap dengan sumber, satuan, dan tanggal pembaruan. Tidak ada angka yang ditampilkan sebelum sumbernya terverifikasi."
        />
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

      <section className="seksi" aria-labelledby="seksi-rekomendasi">
        <div className="seksi-kepala">
          <h2 id="seksi-rekomendasi">Rekomendasi Personal</h2>
        </div>
        {pengguna == null ? (
          <EmptyState
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

      <section className="seksi" aria-labelledby="seksi-newsletter">
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
