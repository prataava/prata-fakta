import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kebijakan Privasi",
  description:
    "Kebijakan privasi PRATA FAKTA: data apa yang dikumpulkan, untuk apa, dan hak Anda atas data Anda.",
};

export default function Privasi() {
  return (
    <div className="wadah">
      <article className="prosa">
        <h1>Kebijakan Privasi</h1>
        <p className="prosa-meta">Terakhir diperbarui: 16 November 2026</p>
        <h2>Data yang kami kumpulkan</h2>
        <ul>
          <li>
            <strong>Akun:</strong> alamat email dan kata sandi (disimpan dalam
            bentuk hash — tidak pernah dalam teks biasa) saat Anda mendaftar.
          </li>
          <li>
            <strong>Preferensi:</strong> kategori yang Anda ikuti dan artikel
            yang Anda simpan, untuk rekomendasi personal.
          </li>
          <li>
            <strong>Newsletter:</strong> alamat email bila Anda berlangganan
            Daily Brief.
          </li>
          <li>
            <strong>Data teknis minimal:</strong> alamat IP dan jenis perangkat
            untuk keamanan (pembatasan laju) dan perbaikan layanan.
          </li>
        </ul>
        <h2>Yang tidak kami lakukan</h2>
        <ul>
          <li>Kami tidak menjual atau menyewakan data Anda kepada pihak mana pun.</li>
          <li>Kami tidak menampilkan iklan pelacak pihak ketiga.</li>
          <li>Kami tidak merekam layar, kamera, atau mikrofon Anda.</li>
          <li>Kami tidak mengaktifkan pelacakan lintas situs.</li>
        </ul>
        <h2>Penyimpanan dan keamanan</h2>
        <p>
          Data tersimpan di database Supabase proyek PRATA dengan Row Level
          Security: pengguna hanya dapat mengakses datanya sendiri, dan akses
          admin dibatasi oleh peran (role) yang diperiksa di backend. Kata sandi
          di-hash oleh sistem autentikasi Supabase.
        </p>
        <h2>Hak Anda</h2>
        <ul>
          <li>Melihat dan memperbarui data profil Anda di halaman Profil.</li>
          <li>Berhenti berlangganan newsletter kapan saja dari tautan di email.</li>
          <li>
            Mengajukan penghapusan akun dan seluruh data Anda. Penghapusan
            mandiri melalui aplikasi tersedia setelah backend admin siap (Fase
            5); sementara ini ajukan melalui email redaksi dan permohonan
            diproses paling lambat 14 hari kerja.
          </li>
          <li>Meminta salinan (ekspor) data akun Anda.</li>
        </ul>
        <h2>Perubahan kebijakan</h2>
        <p>
          Perubahan kebijakan privasi diumumkan di halaman ini beserta tanggal
          berlakunya. Penggunaan layanan setelah perubahan dianggap sebagai
          persetujuan atas kebijakan yang baru.
        </p>
      </article>
    </div>
  );
}
