import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Koreksi & Hak Jawab",
  description:
    "Cara melaporkan kesalahan di PRATA FAKTA dan prosedur koreksi serta hak jawab.",
};

export default function Koreksi() {
  return (
    <div className="wadah">
      <article className="prosa">
        <h1>Koreksi &amp; Hak Jawab</h1>
        <p className="prosa-meta">Terakhir diperbarui: 16 November 2026</p>
        <h2>Melaporkan kesalahan</h2>
        <p>
          Setiap artikel di PRATA FAKTA memiliki tombol “Laporkan Kesalahan”.
          Pembaca juga dapat melaporkan kesalahan dengan mengirimkan:
        </p>
        <ul>
          <li>Tautan artikel yang dimaksud.</li>
          <li>Bagian yang dianggap keliru (kutipan atau kalimatnya).</li>
          <li>Perbaikan yang benar beserta sumbernya.</li>
        </ul>
        <p>
          Laporan dibaca redaksi dan diverifikasi sebelum ditindaklanjuti.
          Laporan yang terbukti benar akan dikoreksi; laporan yang tidak
          terbukti akan dijawab dengan penjelasan.
        </p>
        <h2>Prosedur koreksi</h2>
        <ol>
          <li>Redaksi memverifikasi laporan terhadap sumber primer.</li>
          <li>Bila terbukti keliru, artikel diperbaiki dan diberi label CORRECTED.</li>
          <li>Tanggal koreksi dan isi perubahannya dicantumkan di riwayat pembaruan artikel.</li>
          <li>Koreksi faktual yang signifikan diumumkan di Daily Brief berikutnya.</li>
        </ol>
        <p>
          Kami tidak menghapus artikel yang dikoreksi secara diam-diam.
          Riwayat pembaruan adalah bagian dari artikel.
        </p>
        <h2>Hak jawab</h2>
        <p>
          Pihak yang merasa dirugikan oleh pemberitaan berhak menyampaikan hak
          jawab. Hak jawab yang memenuhi syarat — faktual, relevan, dan tidak
          mengandung fitnah — diterbitkan berdampingan dengan artikel terkait
          paling lambat 2×24 jam setelah diterima dan diverifikasi.
        </p>
      </article>
    </div>
  );
}
