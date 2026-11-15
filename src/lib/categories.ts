// Taksonomi editorial PRATA FAKTA — sesuai brief bagian D.
// Ini adalah konfigurasi redaksi (bukan data operasional/dummy): daftar
// kategori dan subkategori yang dipakai navigasi dan halaman kategori.
// Tabel pf_categories di database menyimpan taksonomi yang sama agar dapat
// dikelola admin (Fase 5); bila tabel belum ada, taksonomi statis ini yang
// dipakai dan halaman tetap berfungsi dengan empty state jujur.

export type Kategori = {
  slug: string;
  nama: string;
  deskripsi: string;
  sub: { slug: string; nama: string }[];
};

export const KATEGORI_UTAMA: Kategori[] = [
  {
    slug: "indonesia",
    nama: "Indonesia",
    deskripsi:
      "Berita dari Indonesia: pemerintahan, politik, hukum, ekonomi, pendidikan, sosial, infrastruktur, daerah, bencana, dan lingkungan.",
    sub: [
      { slug: "pemerintahan", nama: "Pemerintahan" },
      { slug: "politik", nama: "Politik" },
      { slug: "hukum", nama: "Hukum" },
      { slug: "ekonomi", nama: "Ekonomi" },
      { slug: "pendidikan", nama: "Pendidikan" },
      { slug: "sosial", nama: "Sosial" },
      { slug: "infrastruktur", nama: "Infrastruktur" },
      { slug: "daerah", nama: "Daerah" },
      { slug: "bencana", nama: "Bencana" },
      { slug: "lingkungan", nama: "Lingkungan" },
    ],
  },
  {
    slug: "dunia",
    nama: "Dunia",
    deskripsi:
      "Perkembangan internasional: geopolitik, diplomasi, konflik, ekonomi global, teknologi global, dan organisasi internasional.",
    sub: [
      { slug: "geopolitik", nama: "Geopolitik" },
      { slug: "diplomasi", nama: "Diplomasi" },
      { slug: "konflik-internasional", nama: "Konflik Internasional" },
      { slug: "ekonomi-global", nama: "Ekonomi Global" },
      { slug: "teknologi-global", nama: "Teknologi Global" },
      { slug: "organisasi-internasional", nama: "Organisasi Internasional" },
      { slug: "negara-dan-kawasan", nama: "Negara dan Kawasan" },
      { slug: "peristiwa-internasional", nama: "Peristiwa Internasional" },
    ],
  },
  {
    slug: "ekonomi",
    nama: "Ekonomi",
    deskripsi:
      "Inflasi, nilai tukar, suku bunga, harga komoditas, perdagangan, investasi, pasar saham, ekonomi Indonesia dan dunia. Setiap angka disertai sumber, satuan, dan tanggal.",
    sub: [
      { slug: "inflasi", nama: "Inflasi" },
      { slug: "nilai-tukar", nama: "Nilai Tukar" },
      { slug: "suku-bunga", nama: "Suku Bunga" },
      { slug: "komoditas", nama: "Harga Komoditas" },
      { slug: "perdagangan", nama: "Perdagangan" },
      { slug: "investasi", nama: "Investasi" },
      { slug: "pasar-saham", nama: "Pasar Saham" },
    ],
  },
  {
    slug: "teknologi",
    nama: "Teknologi",
    deskripsi:
      "Kecerdasan buatan, software, hardware, keamanan siber, startup, inovasi, teknologi industri, dan perkembangan internet.",
    sub: [
      { slug: "kecerdasan-buatan", nama: "Artificial Intelligence" },
      { slug: "software", nama: "Software" },
      { slug: "hardware", nama: "Hardware" },
      { slug: "keamanan-siber", nama: "Keamanan Siber" },
      { slug: "startup", nama: "Startup" },
      { slug: "inovasi", nama: "Inovasi" },
    ],
  },
  {
    slug: "sains",
    nama: "Sains",
    deskripsi:
      "Penelitian ilmiah, kesehatan masyarakat, biologi, fisika, kimia, astronomi, dan antariksa. Hasil awal, studi observasional, dan konsensus ilmiah dibedakan.",
    sub: [
      { slug: "penelitian-ilmiah", nama: "Penelitian Ilmiah" },
      { slug: "kesehatan", nama: "Kesehatan Masyarakat" },
      { slug: "biologi", nama: "Biologi" },
      { slug: "fisika", nama: "Fisika" },
      { slug: "kimia", nama: "Kimia" },
      { slug: "astronomi", nama: "Astronomi" },
      { slug: "antariksa", nama: "Antariksa" },
    ],
  },
  {
    slug: "pendidikan",
    nama: "Pendidikan",
    deskripsi:
      "Pendidikan Indonesia, perguruan tinggi, beasiswa, seleksi masuk kampus, penelitian pendidikan, dan kebijakan pendidikan.",
    sub: [
      { slug: "pendidikan-indonesia", nama: "Pendidikan Indonesia" },
      { slug: "perguruan-tinggi", nama: "Perguruan Tinggi" },
      { slug: "beasiswa", nama: "Beasiswa" },
      { slug: "seleksi-masuk-kampus", nama: "Seleksi Masuk Kampus" },
      { slug: "kebijakan-pendidikan", nama: "Kebijakan Pendidikan" },
    ],
  },
  {
    slug: "lingkungan-energi",
    nama: "Lingkungan & Energi",
    deskripsi:
      "Perubahan iklim, bencana alam, hutan, pertambangan, energi terbarukan, energi fosil, konservasi, dan sumber daya alam.",
    sub: [
      { slug: "perubahan-iklim", nama: "Perubahan Iklim" },
      { slug: "bencana-alam", nama: "Bencana Alam" },
      { slug: "hutan", nama: "Hutan" },
      { slug: "pertambangan", nama: "Pertambangan" },
      { slug: "energi-terbarukan", nama: "Energi Terbarukan" },
      { slug: "energi-fosil", nama: "Energi Fosil" },
      { slug: "konservasi", nama: "Konservasi" },
    ],
  },
  {
    slug: "fakta-mitos",
    nama: "Fakta & Mitos",
    deskripsi:
      "Pemeriksaan klaim publik: klaim, asal, konteks, bukti pendukung dan bertentangan, sumber primer, analisis, dan kesimpulan.",
    sub: [],
  },
  {
    slug: "data-statistik",
    nama: "Data & Statistik",
    deskripsi:
      "Pusat data interaktif: grafik, tabel, perbandingan, tren tahunan, indikator nasional dan global. Mengutamakan sumber resmi.",
    sub: [
      { slug: "penduduk", nama: "Statistik Penduduk" },
      { slug: "pendidikan", nama: "Pendidikan" },
      { slug: "ekonomi", nama: "Ekonomi" },
      { slug: "energi", nama: "Energi" },
      { slug: "lingkungan", nama: "Lingkungan" },
    ],
  },
  {
    slug: "pengetahuan",
    nama: "Pengetahuan",
    deskripsi:
      "Perpustakaan pengetahuan: sejarah, geografi, negara, sains, teknologi, ekonomi, alam, tubuh manusia, dan pengetahuan umum — semuanya dengan referensi yang dapat diperiksa.",
    sub: [
      { slug: "sejarah", nama: "Sejarah" },
      { slug: "geografi", nama: "Geografi" },
      { slug: "negara", nama: "Negara" },
      { slug: "sains", nama: "Sains" },
      { slug: "teknologi", nama: "Teknologi" },
      { slug: "ekonomi", nama: "Ekonomi" },
      { slug: "alam", nama: "Alam" },
      { slug: "tubuh-manusia", nama: "Tubuh Manusia" },
    ],
  },
];

export function cariKategori(slug: string): Kategori | undefined {
  return KATEGORI_UTAMA.find((k) => k.slug === slug);
}
