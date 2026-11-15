import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import EmptyState from "@/components/EmptyState";
import KartuArtikel from "@/components/artikel/KartuArtikel";
import { createClient } from "@/lib/supabase/server";
import { getBookmarkPengguna, getBriefTerbit } from "@/lib/data";
import {
  getNotifikasi,
  getRekomendasiUntukTopik,
  getRingkasanSaya,
  getRiwayatBaca,
  getTopikDiikuti,
} from "@/lib/lanjutan";

export const metadata: Metadata = {
  title: "Saya — My Prata",
  description:
    "Dasbor personal PRATA FAKTA: statistik baca, streak kuis, bookmark, riwayat, topik diikuti, notifikasi, dan digest personal Anda.",
};

// My Prata (Area 7, Fase 8 Gelombang 1): dasbor personal.
// Wajib login, redirect /masuk bila belum login. Semua angka
// NYATA dari tabel pengguna sendiri (pf_reading_history,
// pf_quiz_scores, pf_bookmarks, pf_followed_topics,
// pf_notifications) — tanpa angka palsu.
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

function formatPersen(nilai: number | null): string {
  if (nilai === null) return "—";
  return `${Math.round(nilai * 100)}%`;
}

export default async function Saya() {
  const supabase = await createClient();
  let penggunaId: string | null = null;
  let email: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    penggunaId = data.user?.id ?? null;
    email = data.user?.email ?? null;
  } catch {
    penggunaId = null;
  }
  if (!penggunaId) redirect("/masuk");

  const [ringkasan, bookmark, riwayat, topik, notifikasi, brief] =
    await Promise.all([
      getRingkasanSaya(penggunaId),
      getBookmarkPengguna(penggunaId, 6),
      getRiwayatBaca(penggunaId, 5),
      getTopikDiikuti(penggunaId),
      getNotifikasi(penggunaId, 10, true),
      getBriefTerbit(),
    ]);
  const kategoriDiikuti = topik
    .filter((t) => t.tipe === "kategori")
    .map((t) => t.target);
  const rekomendasi = await getRekomendasiUntukTopik(kategoriDiikuti, 5);

  return (
    <div className="wadah">
      <section className="hero" aria-labelledby="judul-saya">
        <span className="hero-label">My Prata</span>
        <h1 id="judul-saya">Saya</h1>
        <p>
          Dasbor personal Anda{email ? ` (${email})` : ""}: statistik baca,
          streak kuis, artikel disimpan, dan digest dari topik yang Anda
          ikuti. Semua angka di sini dihitung dari aktivitas Anda sendiri.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
          <Link className="tombol" href="/saya/pengaturan">
            Pengaturan &amp; privasi
          </Link>
          <Link className="tombol" href="/feed-saya">
            Feed Saya
          </Link>
          <Link className="tombol" href="/profil">
            Profil
          </Link>
        </div>
      </section>

      {!ringkasan.tersedia && (
        <p className="pesan-error" role="status">
          Sebagian statistik belum dapat dibaca — migrasi database
          mungkin belum dijalankan. Angka yang tampil tetap dihitung
          dari data yang berhasil dibaca, bukan karangan.
        </p>
      )}

      <section className="seksi" aria-labelledby="seksi-statistik">
        <div className="seksi-kepala">
          <h2 id="seksi-statistik">Statistik saya</h2>
        </div>
        <div className="stat-grid">
          <div className="kartu" style={{ margin: 0 }}>
            <div className="stat-angka">{ringkasan.totalBaca}</div>
            <div className="stat-label">Artikel dibaca</div>
            <div className="stat-label">
              {ringkasan.selesaiBaca} selesai dibaca
            </div>
          </div>
          <div className="kartu" style={{ margin: 0 }}>
            <div className="stat-angka">{ringkasan.streakKuis} hari</div>
            <div className="stat-label">Streak kuis beruntun</div>
            <div className="stat-label">
              {ringkasan.totalKuisHari} hari bermain ·{" "}
              {ringkasan.totalBenar}/{ringkasan.totalSoal} benar
            </div>
          </div>
          <div className="kartu" style={{ margin: 0 }}>
            <div className="stat-angka">{formatPersen(ringkasan.rataBenar)}</div>
            <div className="stat-label">Akurasi kuis</div>
            <div className="stat-label">
              {ringkasan.rataBenar === null
                ? "Belum pernah bermain kuis"
                : "Dari semua skor kuis tersimpan"}
            </div>
          </div>
          <div className="kartu" style={{ margin: 0 }}>
            <div className="stat-angka">{ringkasan.jumlahBookmark}</div>
            <div className="stat-label">Artikel disimpan</div>
            <div className="stat-label">
              {ringkasan.jumlahTopik} topik diikuti ·{" "}
              {ringkasan.notifikasiBelumDibaca} notifikasi belum dibaca
            </div>
          </div>
        </div>
      </section>

      <section className="seksi" aria-labelledby="seksi-digest">
        <div className="seksi-kepala">
          <h2 id="seksi-digest">Digest personal</h2>
          <p>
            Daily Brief terbaru dan rekomendasi dari topik yang Anda ikuti.
          </p>
        </div>
        {brief ? (
          <div className="kartu" style={{ margin: "0 0 12px" }}>
            <span className="kartu-kategori">
              Daily Brief · {formatTanggal(brief.tanggal)}
            </span>
            <span className="kartu-judul">
              <Link href="/brief">Daily Brief hari ini</Link>
            </span>
            <span className="kartu-teks">
              {Object.keys(brief.isi.seksi).length} seksi tersedia di halaman
              Daily Brief.
            </span>
          </div>
        ) : (
          <EmptyState
            judul="Belum ada Daily Brief terbit."
            pesan="Brief harian akan muncul di sini setelah diterbitkan redaksi."
          />
        )}
        {kategoriDiikuti.length === 0 ? (
          <EmptyState
            judul="Ikuti topik dulu untuk rekomendasi personal."
            pesan="Rekomendasi hanya dibuat dari kategori yang Anda ikuti di Feed Saya — tidak ada artikel acak yang ditampilkan sebagai rekomendasi."
            aksi={
              <Link className="tombol" href="/feed-saya">
                Ikuti topik di Feed Saya
              </Link>
            }
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
          <h2 id="seksi-riwayat">Terakhir dibaca</h2>
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

      <section className="seksi" aria-labelledby="seksi-topik">
        <div className="seksi-kepala">
          <h2 id="seksi-topik">Topik yang diikuti</h2>
        </div>
        {topik.length === 0 ? (
          <EmptyState
            judul="Belum mengikuti topik apa pun."
            pesan="Ikuti kategori, negara, atau isu dari Feed Saya."
            aksi={
              <Link className="tombol" href="/feed-saya">
                Buka Feed Saya
              </Link>
            }
          />
        ) : (
          <p>
            {topik.map((t) => (
              <span key={t.id} className="chip" style={{ margin: "0 6px 6px 0" }}>
                {t.tipe}: {t.target}
              </span>
            ))}
          </p>
        )}
      </section>

      <section className="seksi" aria-labelledby="seksi-notifikasi">
        <div className="seksi-kepala">
          <h2 id="seksi-notifikasi">Notifikasi belum dibaca</h2>
        </div>
        {notifikasi.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            Tidak ada notifikasi yang belum dibaca.
          </p>
        ) : (
          <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
            {notifikasi.map((n) => (
              <li key={n.id} className="kartu" style={{ margin: 0 }}>
                <span className="kartu-kategori">{n.jenis}</span>
                <span className="kartu-judul">
                  {n.tautan ? <Link href={n.tautan}>{n.judul}</Link> : n.judul}
                </span>
                {n.isi && <span className="kartu-teks">{n.isi}</span>}
                <span className="kartu-meta">{formatTanggal(n.dibuat_pada)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
