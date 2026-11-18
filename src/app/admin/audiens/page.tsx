import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import { cobaServiceClient } from "@/lib/supabase/service";
import {
  agregatDurasi,
  agregatHarian,
  agregatKategori,
  agregatPencarian,
  saringJendela,
  type BarisBacaAudiens,
} from "@/lib/audiens";

export const metadata: Metadata = {
  title: "Audience Intelligence — Admin",
  description:
    "Kategori paling dibaca, tren baca harian, durasi baca, dan istilah pencarian teratas — agregat saja, tanpa data per-pengguna.",
};

export const instant = false;

const HARI_JENDELA = 30;
const BATAS_BARIS = 5000;

export default async function AdminAudiens() {
  let tersedia = true;
  let totalBaca = 0;
  let totalSelesai = 0;
  let kategori: { kategori: string; dibaca: number }[] = [];
  let harian: { tanggal: string; dibaca: number }[] = [];
  let durasi: {
    rata_rata_detik: number | null;
    dengan_durasi: number;
    per_artikel: {
      artikel_id: string;
      rata_rata_detik: number;
      dibaca: number;
    }[];
  } = { rata_rata_detik: null, dengan_durasi: 0, per_artikel: [] };
  let pencarian: { istilah: string; pengguna: number }[] = [];
  const judulPerArtikel = new Map<string, { judul: string; slug: string | null }>();

  const service = cobaServiceClient();
  if (!service) {
    tersedia = false;
  } else {
    try {
      // CATATAN PRIVASI: kolom user_id TIDAK PERNAH dipilih di
      // halaman ini (RLS pf_reading_history owner-only pun tidak
      // jadi soal karena service client dipakai untuk AGREGAT
      // saja). "Pembaca unik" sengaja tidak ditampilkan di sini
      // — angka itu ada di /admin/kinerja.
      const { data, error } = await service
        .from("pf_reading_history")
        .select("artikel_id,dibaca_pada,durasi_detik,selesai")
        .order("dibaca_pada", { ascending: false })
        .limit(BATAS_BARIS);
      if (error) {
        tersedia = false;
      } else {
        const baris = (data ?? []) as BarisBacaAudiens[];
        totalBaca = baris.length;
        totalSelesai = baris.filter((b) => b.selesai).length;
        const jendela = saringJendela(baris, HARI_JENDELA);
        const ids = [...new Set(jendela.map((b) => b.artikel_id))].slice(
          0,
          200,
        );
        const kategoriPerArtikel = new Map<string, string | null>();
        if (ids.length > 0) {
          const { data: artikel } = await service
            .from("pf_articles")
            .select("id,judul,slug,kategori_slug")
            .in("id", ids);
          for (const a of (artikel ?? []) as {
            id: string;
            judul: string;
            slug: string | null;
            kategori_slug: string | null;
          }[]) {
            kategoriPerArtikel.set(a.id, a.kategori_slug);
            judulPerArtikel.set(a.id, { judul: a.judul, slug: a.slug });
          }
        }
        kategori = agregatKategori(jendela, kategoriPerArtikel);
        harian = agregatHarian(jendela, HARI_JENDELA);
        // Durasi juga berjendela 30 hari (konsisten dengan
        // kategori + tren di atas) — bukan seluruh riwayat.
        durasi = agregatDurasi(jendela);
        // Istilah pencarian: hanya kolom pencarian_tersimpan
        // (satu baris = satu pengguna) — tanpa user_id.
        const { data: prefs } = await service
          .from("pf_user_preferences")
          .select("pencarian_tersimpan")
          .limit(1000);
        pencarian = agregatPencarian((prefs ?? []) as unknown[]);
      }
    } catch {
      tersedia = false;
    }
  }

  if (!tersedia) {
    return (
      <section className="seksi">
        <EmptyState
          judul="Audience Intelligence belum tersedia"
          pesan="Riwayat baca tidak dapat dibaca — layanan admin (SUPABASE_SERVICE_ROLE_KEY) belum siap atau tabel pf_reading_history belum dibuat."
        />
      </section>
    );
  }

  return (
    <>
      <section className="seksi" aria-labelledby="judul-ringkasan">
        <div className="seksi-kepala">
          <h2 id="judul-ringkasan">Ringkasan Audiens</h2>
        </div>
        <p>
          Total {totalBaca} pembacaan tercatat (5.000 baris terbaru) ·{" "}
          {totalSelesai} ditandai selesai ·{" "}
          {durasi.rata_rata_detik !== null
            ? `durasi baca rata-rata ${durasi.rata_rata_detik} detik (${durasi.dengan_durasi} pembacaan berdurasi)`
            : "belum ada durasi baca tercatat"}
          .
        </p>
        <p className="artikel-meta-kecil">
          Angka dihitung dari pf_reading_history nyata (30 hari
          terakhir untuk kategori dan tren) dan pencarian tersimpan
          pf_user_preferences — agregat saja, tanpa data
          per-pengguna. Artikel paling dibaca per artikel ada di{" "}
          <Link href="/admin/kinerja">Kinerja</Link>, kunjungan
          halaman di <Link href="/admin/analitik">Analitik</Link>.
        </p>
        <p className="artikel-meta-kecil">
          Catatan jujur: kolom &ldquo;selesai&rdquo; dihitung apa
          adanya dari pf_reading_history — arti persisnya masih
          keputusan terbuka (lihat dokumen keputusan v27 §7), jadi
          angka &ldquo;ditandai selesai&rdquo; di atas bukan klaim
          penyelesaian baca yang terverifikasi.
        </p>
        {totalBaca === 0 && (
          <p className="artikel-meta-kecil">
            Belum ada riwayat baca tercatat.
          </p>
        )}
      </section>

      {kategori.length > 0 && (
        <section className="seksi" aria-labelledby="judul-kategori">
          <div className="seksi-kepala">
            <h2 id="judul-kategori">
              Kategori Paling Dibaca (30 hari)
            </h2>
          </div>
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Kategori</th>
                  <th>Dibaca</th>
                </tr>
              </thead>
              <tbody>
                {kategori.map((k) => (
                  <tr key={k.kategori}>
                    <td>{k.kategori}</td>
                    <td>{k.dibaca}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {harian.length > 0 && (
        <section className="seksi" aria-labelledby="judul-tren">
          <div className="seksi-kepala">
            <h2 id="judul-tren">Tren Baca Harian (30 hari)</h2>
          </div>
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Dibaca</th>
                </tr>
              </thead>
              <tbody>
                {harian.map((h) => (
                  <tr key={h.tanggal}>
                    <td>{h.tanggal}</td>
                    <td>{h.dibaca}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {durasi.per_artikel.length > 0 && (
        <section className="seksi" aria-labelledby="judul-durasi">
          <div className="seksi-kepala">
            <h2 id="judul-durasi">
              Durasi Baca Rata-rata per Artikel
            </h2>
          </div>
          <p className="artikel-meta-kecil">
            Hanya artikel dengan minimal 3 pembacaan berdurasi yang
            ditampilkan, agar satu pembacaan panjang tidak
            mendominasi.
          </p>
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Artikel</th>
                  <th>Rata-rata (detik)</th>
                  <th>Pembacaan</th>
                </tr>
              </thead>
              <tbody>
                {durasi.per_artikel.map((a) => {
                  const info = judulPerArtikel.get(a.artikel_id);
                  return (
                    <tr key={a.artikel_id}>
                      <td>
                        {info?.slug ? (
                          <Link href={`/artikel/${info.slug}`}>
                            {info.judul}
                          </Link>
                        ) : (
                          (info?.judul ?? "Artikel tidak terbaca")
                        )}
                      </td>
                      <td>{a.rata_rata_detik}</td>
                      <td>{a.dibaca}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {pencarian.length > 0 && (
        <section className="seksi" aria-labelledby="judul-pencarian">
          <div className="seksi-kepala">
            <h2 id="judul-pencarian">Istilah Pencarian Teratas</h2>
          </div>
          <p className="artikel-meta-kecil">
            Dari pencarian tersimpan pengguna (maks 10 per pengguna) —
            angka adalah jumlah pengguna yang menyimpan istilah itu.
          </p>
          <div className="tabel-gulir">
            <table className="tabel-data">
              <thead>
                <tr>
                  <th>Istilah</th>
                  <th>Pengguna</th>
                </tr>
              </thead>
              <tbody>
                {pencarian.map((p) => (
                  <tr key={p.istilah}>
                    <td>{p.istilah}</td>
                    <td>{p.pengguna}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
