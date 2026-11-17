import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Kebijakan Redaksi",
  description:
    "Kebijakan redaksi PRATA FAKTA: fakta di atas kecepatan, sumber jelas, pemisahan fakta dan opini, serta koreksi transparan.",
};

// Halaman dirender per request (`instant = false` + connection() di
// bawah), BUKAN prerender statis — 17 Nov 2026 (perbaikan CSP
// $RT/$RV): sebagai halaman statis murni, boundary loading.tsx root
// selesai di shell prerender sehingga skrip definisi $RV/$RC React
// ikut terpanggang TANPA nonce; CSP (script-src nonce+hash)
// memblokirnya → $RC undefined → hidrasi gagal (#419) → isi halaman
// ganda di DOM (h1=2). connection() menunda segmen halaman sampai
// request, jadi definisi $RV/$RC diterbitkan saat resume DENGAN
// nonce. JANGAN hapus connection() tanpa menguji ulang halaman ini
// di CDP (definisi $RV/$RC harus ber-nonce, h1 harus = 1).
export const instant = false;

export default async function KebijakanRedaksi() {
  await connection();
  return (
    <div className="wadah">
      <article className="prosa">
        <h1>Kebijakan Redaksi</h1>
        <p className="prosa-meta">Terakhir diperbarui: 16 November 2026</p>
        <p>
          PRATA FAKTA adalah platform berita dan pengetahuan digital. Kebijakan
          ini mengikat seluruh redaksi, penulis, pemeriksa fakta, dan sistem AI
          editorial kami.
        </p>
        <h2>1. Fakta di atas kecepatan</h2>
        <p>
          Kami mengutamakan kebenaran daripada menjadi yang pertama
          memberitakan. Artikel diterbitkan hanya setelah klaim utamanya
          diperiksa terhadap sumber primer atau sumber sekunder yang kredibel.
          Bila bukti belum cukup, artikel berstatus{" "}
          <strong>UNCONFIRMED (Belum Terkonfirmasi)</strong> — dan itu
          ditampilkan secara terbuka, bukan disembunyikan.
        </p>
        <h2>2. Tidak ada berita fiktif</h2>
        <p>
          Kami tidak membuat peristiwa, kutipan, angka, atau sumber karangan.
          Setiap artikel orisinal disusun dari informasi dan bukti yang
          diperoleh dari sumber yang tercantum. Ringkasan AI tidak boleh
          menambahkan fakta yang tidak ada di sumbernya.
        </p>
        <h2>3. Tanpa clickbait</h2>
        <p>
          Judul harus menggambarkan isi secara akurat. Kami tidak memakai judul
          yang menyesatkan, melebih-lebihkan, atau menyembunyikan konteks demi
          klik.
        </p>
        <h2>4. Sumber jelas dan dapat diperiksa</h2>
        <p>
          Setiap artikel mencantumkan sumber dan referensi beserta tautannya.
          Kami mengutamakan sumber primer dan lembaga resmi. Banyaknya media
          yang menyalin berita yang sama tidak kami anggap sebagai banyak
          sumber independen.
        </p>
        <h2>5. Pisahkan fakta, klaim, opini, analisis, dan prediksi</h2>
        <p>
          Fakta adalah hal yang terbukti. Klaim adalah pernyataan pihak tertentu
          yang kebenarannya masih diperiksa. Opini, analisis, dan prediksi
          diberi label yang jelas dan tidak disajikan sebagai fakta.
        </p>
        <h2>6. Hak cipta dan atribusi</h2>
        <p>
          Kami tidak menyalin artikel penuh media lain dan tidak mengambil foto
          berhak cipta tanpa izin. Yang kami terbitkan adalah penulisan
          orisinal — ringkasan dan analisis berdasarkan sumber — dengan
          atribusi kepada penerbit asli dan tautan ke sumbernya.
        </p>
        <h2>7. Koreksi transparan</h2>
        <p>
          Kesalahan dikoreksi secara terbuka: artikel yang dikoreksi menampilkan
          tanggal koreksi dan riwayat pembaruannya. Lihat{" "}
          <Link href="/kebijakan/koreksi">Koreksi &amp; Hak Jawab</Link>.
        </p>
        <h2>8. Larangan tuduhan tanpa verifikasi</h2>
        <p>
          Kami tidak menerbitkan tuduhan terhadap pihak mana pun sebagai fakta
          sebelum terverifikasi. Pihak yang disebut dalam tuduhan diberi
          kesempatan menjawab.
        </p>
        <h2>9. Status verifikasi</h2>
        <p>
          Setiap artikel menampilkan salah satu status: VERIFIED, CROSS-CHECKED,
          DEVELOPING, UNCONFIRMED, DISPUTED, atau CORRECTED — beserta catatan
          verifikasinya.
        </p>
      </article>
    </div>
  );
}
