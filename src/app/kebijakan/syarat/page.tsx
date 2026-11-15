import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Syarat Penggunaan",
  description:
    "Syarat penggunaan PRATA FAKTA: aturan pembaca, penggunaan konten, dan batasan tanggung jawab.",
};

export default function Syarat() {
  return (
    <div className="wadah">
      <article className="prosa">
        <h1>Syarat Penggunaan</h1>
        <p className="prosa-meta">Terakhir diperbarui: 16 November 2026</p>
        <h2>1. Layanan</h2>
        <p>
          PRATA FAKTA menyediakan berita, pemeriksaan fakta, data, dan konten
          pengetahuan. Sebagian layanan (bookmark, mengikuti topik, rekomendasi
          personal) memerlukan akun gratis.
        </p>
        <h2>2. Penggunaan konten</h2>
        <ul>
          <li>
            Artikel PRATA FAKTA boleh dibaca, dibagikan melalui tombol bagikan,
            dan dikutip sebagian dengan atribusi dan tautan ke artikel asli.
          </li>
          <li>
            Dilarang menyalin ulang artikel secara utuh, mengambil foto tanpa
            izin, atau mengklaim konten kami sebagai karya sendiri.
          </li>
          <li>
            Ringkasan otomatis atau kutipan oleh mesin pencari tetap harus
            mencantumkan sumber.
          </li>
        </ul>
        <h2>3. Akun pengguna</h2>
        <ul>
          <li>Anda bertanggung jawab menjaga kerahasiaan kata sandi Anda.</li>
          <li>Satu akun untuk satu orang; dilarang membagikan akun.</li>
          <li>
            Akun yang dipakai untuk spam, penipuan, atau pelanggaran hukum
            dapat dibatasi atau ditutup setelah peninjauan.
          </li>
        </ul>
        <h2>4. Batasan tanggung jawab</h2>
        <p>
          Kami menyusun artikel berdasarkan sumber terbaik yang tersedia pada
          saat publikasi dan menampilkan status verifikasinya. Namun informasi
          dapat berkembang; artikel berstatus DEVELOPING dapat berubah. Kami
          tidak bertanggung jawab atas keputusan yang diambil semata-mata
          berdasarkan ringkasan tanpa membaca sumber dan konteks lengkapnya.
          Data dan statistik selalu disertai sumber, satuan, dan tanggal —
          periksa ketiganya sebelum mengutip.
        </p>
        <h2>5. Perubahan layanan</h2>
        <p>
          Fitur dapat ditambah, diubah, atau dihentikan dengan pemberitahuan di
          halaman ini. Syarat ini dapat diperbarui; versi yang berlaku adalah
          yang tercantum di halaman ini beserta tanggal pembaruannya.
        </p>
      </article>
    </div>
  );
}
