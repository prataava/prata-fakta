// Provenance pembaca (P2-5) — seksi "Jejak AI & verifikasi" di
// halaman artikel: dari data yang SUDAH diambil halaman artikel
// (getJejakFakta + getPerbandinganSumber) — tanpa query baru.
// Tampil HANYA bila ada data provenance yang jujur: klaim yang
// mendasari artikel + record verifikasi VERIFIED/CROSS-CHECKED +
// tanggal terbit (persetujuan editor). Bila tidak ada → null
// (seksi disembunyikan; JANGAN tulis "0 klaim").
// Teks jujur: draf awal disusun pipeline deterministik +
// disempurnakan Muse + disetujui editor — tanpa klaim mutlak
// "ditulis AI" atau "ditulis manusia".
// Catatan: pf_article_versions tidak membawa penanda review —
// kolomnya hanya versi/judul/isi/dibuat_oleh/dibuat_pada/catatan
// (riwayat revisi sudah ditampilkan PembacaArtikel sebagai
// "Riwayat pembaruan"). Tanggal "ditinjau editor" yang jujur di
// sini adalah tanggal terbit: artikel tidak pernah terbit
// otomatis, jadi terbit = persetujuan editor. Label
// "terverifikasi" pada klaim berasal dari record verifikasi
// artikel (VERIFIED/CROSS-CHECKED), bukan dari kolom status
// per klaim (yang default-nya 'belum_terverifikasi').
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { labelStatusVerifikasi } from "@/lib/verifikasi";

function formatTanggal(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

export default function ProvenanceAI({
  tersedia,
  jumlahKlaim,
  jumlahSumberIndependen,
  keputusan,
  diverifikasiPada,
  diterbitkanPada,
}: {
  /** false bila data klaim/sumber artikel belum dapat dibaca. */
  tersedia: boolean;
  /** Jumlah klaim pf_claims yang mendasari artikel ini. */
  jumlahKlaim: number;
  /** Jumlah sumber INDEPENDEN (akar rantai salinan berbeda). */
  jumlahSumberIndependen: number;
  /** Keputusan record verifikasi artikel terbaru yang
   *  VERIFIED/CROSS-CHECKED, atau null bila tidak ada. */
  keputusan: string | null;
  /** Tanggal record verifikasi itu dibuat. */
  diverifikasiPada: string | null;
  /** Tanggal artikel diterbitkan (= disetujui editor; artikel
   *  tidak pernah terbit otomatis). */
  diterbitkanPada: string | null;
}) {
  const tanggalTerbit = formatTanggal(diterbitkanPada);
  const tanggalVerifikasi = formatTanggal(diverifikasiPada);
  // Tanpa data provenance yang lengkap, seksi disembunyikan —
  // artikel lama tanpa record verifikasi tidak mendapat angka
  // karangan ("0 klaim" dilarang).
  if (
    !tersedia ||
    jumlahKlaim <= 0 ||
    jumlahSumberIndependen <= 0 ||
    !keputusan ||
    !tanggalTerbit
  ) {
    return null;
  }
  return (
    <section className="seksi" aria-labelledby="seksi-jejak-ai">
      <div className="seksi-kepala">
        <h2 id="seksi-jejak-ai">
          <ShieldCheck
            aria-hidden="true"
            size={20}
            style={{ verticalAlign: "-4px", marginRight: 6 }}
          />
          Jejak AI &amp; verifikasi
        </h2>
        <p>
          Dari mana artikel ini berasal — dan siapa yang
          memeriksanya sebelum terbit.
        </p>
      </div>
      <p>
        Draf awal artikel ini disusun oleh pipeline editorial
        deterministik dari{" "}
        <strong>{jumlahKlaim} klaim terverifikasi</strong> yang
        didukung <strong>{jumlahSumberIndependen} sumber independen</strong>,
        lalu disempurnakan dengan bantuan Muse dan disetujui editor
        sebelum diterbitkan pada {tanggalTerbit}.
      </p>
      <p>
        Keputusan verifikasi:{" "}
        <strong>{labelStatusVerifikasi(keputusan)}</strong>
        {tanggalVerifikasi ? ` (dicatat ${tanggalVerifikasi})` : ""}.
        Draf awal disusun mesin dari klaim yang sudah terverifikasi —
        bukan tulisan otomatis tanpa pengawasan: setiap artikel
        ditinjau editor manusia sebelum terbit.{" "}
        <Link href="/kebijakan/metodologi">Baca metode verifikasi</Link>.
      </p>
    </section>
  );
}
