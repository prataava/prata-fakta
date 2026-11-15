import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import KartuArtikel from "@/components/artikel/KartuArtikel";
import TopikSaya from "@/components/lanjutan/TopikSaya";
import NotifikasiSaya from "@/components/lanjutan/NotifikasiSaya";
import { createClient } from "@/lib/supabase/server";
import { getBookmarkPengguna } from "@/lib/data";
import {
  getNotifikasi,
  getRekomendasiUntukTopik,
  getRiwayatBaca,
  getTopikDiikuti,
} from "@/lib/lanjutan";

export const metadata: Metadata = {
  title: "Feed Saya",
  description:
    "Feed personal PRATA FAKTA: topik yang diikuti, rekomendasi artikel, notifikasi, artikel disimpan, dan riwayat baca.",
};

// Feed personal: wajib login, redirect /masuk bila belum login.
// Membaca data per request (pola cacheComponents).
export const instant = false;

function formatTanggal(waktu: string | null): string {
  if (!waktu) return "—";
  const d = new Date(waktu);
  if (Number.isNaN(d.getTime())) return waktu;
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export default async function FeedSaya() {
  const supabase = await createClient();
  let penggunaId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    penggunaId = data.user?.id ?? null;
  } catch {
    penggunaId = null;
  }
  if (!penggunaId) redirect("/masuk");

  const [topik, notifikasi, bookmark, riwayat] = await Promise.all([
    getTopikDiikuti(penggunaId),
    getNotifikasi(penggunaId, 20),
    getBookmarkPengguna(penggunaId, 10),
    getRiwayatBaca(penggunaId, 10),
  ]);
  const kategoriDiikuti = topik
    .filter((t) => t.tipe === "kategori")
    .map((t) => t.target);
  const rekomendasi = await getRekomendasiUntukTopik(kategoriDiikuti, 10);

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-feed">
        <span className="hero-label">Feed Saya</span>
        <h1 id="judul-feed">Feed Saya</h1>
        <p>
          Topik yang Anda ikuti, rekomendasi personal, notifikasi, artikel
          yang Anda simpan, dan riwayat baca Anda.
        </p>
      </section>

      <section className="seksi" aria-labelledby="seksi-topik">
        <div className="seksi-kepala">
          <h2 id="seksi-topik">Topik yang diikuti</h2>
          <p>Ikuti kategori berita, negara, atau isu yang Anda minati.</p>
        </div>
        <TopikSaya awal={topik} />
      </section>

      <section className="seksi" aria-labelledby="seksi-rekomendasi">
        <div className="seksi-kepala">
          <h2 id="seksi-rekomendasi">Rekomendasi untuk Anda</h2>
          <p>Artikel terbit terbaru dari kategori yang Anda ikuti.</p>
        </div>
        {kategoriDiikuti.length === 0 ? (
          <EmptyState
            judul="Ikuti topik dulu untuk rekomendasi personal."
            pesan="Rekomendasi hanya dibuat dari kategori yang Anda ikuti di atas — tidak ada artikel acak yang ditampilkan sebagai rekomendasi."
          />
        ) : rekomendasi.length === 0 ? (
          <EmptyState
            judul="Belum ada rekomendasi."
            pesan="Belum ada artikel terbit terbaru dari kategori yang Anda ikuti."
          />
        ) : (
          <div className="grid-berita">
            {rekomendasi.map((a) => (
              <KartuArtikel key={a.id} artikel={a} />
            ))}
          </div>
        )}
      </section>

      <section className="seksi" aria-labelledby="seksi-notifikasi">
        <div className="seksi-kepala">
          <h2 id="seksi-notifikasi">Notifikasi</h2>
        </div>
        <NotifikasiSaya awal={notifikasi} />
      </section>

      <section className="seksi" aria-labelledby="seksi-disimpan">
        <div className="seksi-kepala">
          <h2 id="seksi-disimpan">Artikel disimpan</h2>
        </div>
        {bookmark.length === 0 ? (
          <EmptyState
            judul="Belum ada artikel yang disimpan."
            pesan="Simpan artikel dari halaman artikel untuk membacanya lagi di sini."
            aksi={
              <Link className="tombol" href="/arsip">
                Jelajahi arsip
              </Link>
            }
          />
        ) : (
          <div className="grid-berita">
            {bookmark.map((a) => (
              <KartuArtikel key={a.id} artikel={a} />
            ))}
          </div>
        )}
      </section>

      <section className="seksi" aria-labelledby="seksi-riwayat">
        <div className="seksi-kepala">
          <h2 id="seksi-riwayat">Riwayat baca</h2>
          <p>Artikel yang terakhir Anda baca.</p>
        </div>
        {riwayat.length === 0 ? (
          <EmptyState
            judul="Belum ada riwayat baca."
            pesan="Artikel yang Anda baca akan tercatat di sini."
            aksi={
              <Link className="tombol" href="/arsip">
                Jelajahi arsip
              </Link>
            }
          />
        ) : (
          <div className="grid-berita">
            {riwayat.map((r) => (
              <div key={r.id}>
                <KartuArtikel artikel={r.artikel} />
                <p
                  style={{
                    color: "var(--muted)",
                    fontSize: "0.88rem",
                    marginTop: 4,
                  }}
                >
                  Dibaca {formatTanggal(r.dibaca_pada)}
                  {r.selesai ? " · Selesai" : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
