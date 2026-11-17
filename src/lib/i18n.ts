// Kamus multi-bahasa minimal ID/EN (P3-3, 17 Nov 2026).
//
// CAKUPAN JUJUR (~66 kunci): chrome/navigasi (8 pintu nav + auth),
// cari + palet perintah, aksi umum, 5 varian EmptyState, footer,
// label pengalih bahasa. TIDAK termasuk: isi artikel, judul kategori
// (nama resmi), nama sumber, teks metodologi/kebijakan — semua itu
// tetap Bahasa Indonesia apa pun bahasanya. TIDAK ada terjemahan
// mesin: setiap string EN ditulis manusia di berkas ini.
//
// JAMINAN KELENGKAPAN (bukan janji): KAMUS_EN diketik
// `Record<KunciBahasa, string>` — bila satu kunci tidak punya EN,
// `tsc` GAGAL. Baterai scripts/uji-ekspansi-p3.mjs memeriksa ulang
// secara runtime (himpunan kunci id vs en identik + semua nilai
// tak-kosong). Fallback di t() — kunci tak ada di EN → teks ID —
// adalah jaring pengaman runtime saja; secara statis ia tidak
// pernah terjangkau selama tsc hijau.
//
// BAHASA BUKAN BAGIAN URL: tidak ada prefix /en/, tidak ada
// duplikasi rute/SEO ganda (keputusan sadar §3b rencana P3).
// Bahasa hidup di cookie `pf-bahasa` (+ kolom preferensi akun
// `bahasa`, milik P3-2) dan diterapkan di klien.
//
// CATATAN ARSITEKTUR — kenapa getBahasa() memakai dynamic import:
// berkas ini diimpor komponen KLIEN (HeaderNav, SearchBar,
// CommandPalette, PemilihBahasa) untuk t()/KAMUS. Impor statis
// `next/headers` di sini akan mematahkan bundle klien (next/headers
// hanya untuk Server Components). Karena itu getBahasa() memuat
// next/headers secara dinamis di dalam fungsi — hanya pernah
// dipanggil dari komponen server (Footer, /cari). JANGAN ubah
// menjadi impor statis tanpa memisahkan getBahasa() ke berkas
// server-only tersendiri.
//
// `lang` HTML: server-rendered tetap "id" (layout.tsx milik P3-1,
// tidak boleh disentuh; cookies() di root layout dilarang aturan
// rumah). PemilihBahasa mengatur document.documentElement.lang
// saat mount — batas jujur, bukan bug.

export type Bahasa = "id" | "en";

/** Nama cookie bahasa (klien + server memakai nama yang sama). */
export const COOKIE_BAHASA = "pf-bahasa";

/** Nama event window untuk sinkronisasi bahasa antar komponen
 *  klien dalam satu halaman (PemilihBahasa → HeaderNav, SearchBar,
 *  CommandPalette, BottomNav, AuthArea). */
export const ACARA_BAHASA = "pf:bahasa";

/** Nilai apa pun selain "id"/"en" → "id" (jujur, bukan menebak). */
export function bahasaDariNilai(nilai: unknown): Bahasa {
  return nilai === "en" ? "en" : "id";
}

const KAMUS_ID = {
  // 8 pintu nav (+ label turunan nav)
  "nav.beranda": "Beranda",
  "nav.kategori": "Kategori",
  "nav.faktaData": "Fakta & Data",
  "nav.wawasan": "Wawasan",
  "nav.belajar": "Belajar",
  "nav.brief": "Daily Brief",
  "nav.arsip": "Arsip",
  "nav.jelajahi": "Jelajahi",
  "nav.semuaKategori": "Semua kategori",
  "nav.lainnya": "Lainnya",
  "nav.submenu": "Buka submenu",
  // Auth
  "auth.masuk": "Masuk",
  "auth.daftar": "Daftar",
  "auth.saya": "Saya",
  "auth.keluar": "Keluar",
  // Cari (halaman /cari + SearchBar)
  "cari.placeholder": "Cari berita, topik, atau sumber…",
  "cari.tombol": "Cari",
  "cari.label": "Cari berita, topik, atau sumber",
  "cari.tidakAdaHasilJudul": "Tidak ada hasil",
  "cari.tidakAdaHasilPesan":
    "Tidak ada artikel, kategori, sumber, atau negara yang cocok dengan “{q}”.",
  "cari.masukkanKataKunciJudul": "Masukkan kata kunci",
  "cari.masukkanKataKunciPesan":
    "Ketik kata kunci di atas — misalnya nama kategori seperti “Ekonomi”, nama negara seperti “Indonesia”, atau nama sumber seperti “Antara”.",
  "cari.jelajahiArsip": "Jelajahi arsip",
  // Palet perintah (CommandPalette)
  "palette.placeholder": "Cari berita, topik, atau perintah…",
  "palette.judul": "Palet perintah",
  "palette.deskripsi":
    "Cari berita, topik, atau sumber, atau lompat ke halaman PRATA FAKTA.",
  "palette.aksiCepat": "Perintah cepat",
  "palette.terakhirDicari": "Terakhir dicari",
  "palette.saran": "Saran",
  "palette.hapusSemua": "Hapus semua",
  "palette.tutup": "Tutup palet perintah",
  "palette.buka": "Buka palet perintah (Ctrl+K)",
  "palette.tidakAdaHasil": "Tidak ada hasil untuk “{q}”. Tekan Enter untuk mencari.",
  "palette.memuat": "Memuat saran…",
  "palette.kakiNavigasi": "navigasi",
  "palette.kakiBuka": "buka",
  "palette.kakiTutup": "tutup",
  // Aksi umum
  "aksi.buka": "Buka",
  "aksi.tutup": "Tutup",
  "aksi.kembali": "Kembali",
  "aksi.muatLagi": "Muat lagi",
  "aksi.bagikan": "Bagikan",
  "aksi.simpan": "Simpan",
  "aksi.batal": "Batal",
  "aksi.simpanPerubahan": "Simpan perubahan",
  // EmptyState — judul + pesan per varian
  "kosong.kosongJudul": "Belum ada data",
  "kosong.kosongPesan": "Belum ada konten di sini.",
  "kosong.errorJudul": "Terjadi kesalahan",
  "kosong.errorPesan": "Maaf, konten gagal dimuat. Coba lagi nanti.",
  "kosong.izinJudul": "Perlu masuk",
  "kosong.izinPesan": "Masuk untuk melihat konten ini.",
  "kosong.takTersediaJudul": "Tidak tersedia",
  "kosong.takTersediaPesan": "Halaman atau fitur ini belum tersedia.",
  "kosong.memuatJudul": "Memuat…",
  "kosong.memuatPesan": "Mohon tunggu sebentar.",
  // Footer (judul seksi + Tentang singkat + tautan generik;
  // nama kategori, nama dokumen kebijakan, dan nama sumber
  // adalah nama resmi — tetap Indonesia)
  "footer.tentang":
    "Pahami dunia. Berdasarkan fakta. Platform berita dan pengetahuan digital: berita terkini Indonesia dan dunia dengan sumber jelas, pemeriksaan fakta, data, dan kronologi.",
  "footer.kategori": "Kategori",
  "footer.layanan": "Layanan",
  "footer.redaksiLegal": "Redaksi & Legal",
  "footer.hakCipta":
    "Seluruh artikel orisinal ditulis berdasarkan sumber yang tercantum.",
  "footer.bahasaWilayah": "Bahasa Indonesia · Indonesia & Dunia",
  "footer.arsipBerita": "Arsip Berita",
  "footer.pencarian": "Pencarian",
  "footer.laporkan": "Laporkan Kesalahan",
  // Pengalih bahasa
  "bahasa.label": "Bahasa",
  "bahasa.indonesia": "Indonesia",
  "bahasa.inggris": "Inggris",
} as const;

export type KunciBahasa = keyof typeof KAMUS_ID;

// WAJIB lengkap: tipe ini membuat tsc gagal bila satu kunci
// tidak punya pasangan EN. Jangan longgarkan ke Partial.
const KAMUS_EN: Record<KunciBahasa, string> = {
  "nav.beranda": "Home",
  "nav.kategori": "Categories",
  "nav.faktaData": "Facts & Data",
  "nav.wawasan": "Insights",
  "nav.belajar": "Learn",
  "nav.brief": "Daily Brief",
  "nav.arsip": "Archive",
  "nav.jelajahi": "Explore",
  "nav.semuaKategori": "All categories",
  "nav.lainnya": "More",
  "nav.submenu": "Open submenu",
  "auth.masuk": "Sign in",
  "auth.daftar": "Sign up",
  "auth.saya": "Account",
  "auth.keluar": "Sign out",
  "cari.placeholder": "Search news, topics, or sources…",
  "cari.tombol": "Search",
  "cari.label": "Search news, topics, or sources",
  "cari.tidakAdaHasilJudul": "No results",
  "cari.tidakAdaHasilPesan":
    "No articles, categories, sources, or countries match “{q}”.",
  "cari.masukkanKataKunciJudul": "Enter a keyword",
  "cari.masukkanKataKunciPesan":
    "Type a keyword above — for example a category name like “Economy”, a country name like “Indonesia”, or a source name like “Antara”.",
  "cari.jelajahiArsip": "Browse the archive",
  "palette.placeholder": "Search news, topics, or commands…",
  "palette.judul": "Command palette",
  "palette.deskripsi":
    "Search news, topics, or sources, or jump to a PRATA FAKTA page.",
  "palette.aksiCepat": "Quick actions",
  "palette.terakhirDicari": "Recent searches",
  "palette.saran": "Suggestions",
  "palette.hapusSemua": "Clear all",
  "palette.tutup": "Close command palette",
  "palette.buka": "Open command palette (Ctrl+K)",
  "palette.tidakAdaHasil": "No results for “{q}”. Press Enter to search.",
  "palette.memuat": "Loading suggestions…",
  "palette.kakiNavigasi": "navigate",
  "palette.kakiBuka": "open",
  "palette.kakiTutup": "close",
  "aksi.buka": "Open",
  "aksi.tutup": "Close",
  "aksi.kembali": "Back",
  "aksi.muatLagi": "Load more",
  "aksi.bagikan": "Share",
  "aksi.simpan": "Save",
  "aksi.batal": "Cancel",
  "aksi.simpanPerubahan": "Save changes",
  "kosong.kosongJudul": "No data yet",
  "kosong.kosongPesan": "There is no content here yet.",
  "kosong.errorJudul": "Something went wrong",
  "kosong.errorPesan": "Sorry, the content failed to load. Please try again later.",
  "kosong.izinJudul": "Sign in required",
  "kosong.izinPesan": "Sign in to view this content.",
  "kosong.takTersediaJudul": "Not available",
  "kosong.takTersediaPesan": "This page or feature is not available yet.",
  "kosong.memuatJudul": "Loading…",
  "kosong.memuatPesan": "Please wait a moment.",
  "footer.tentang":
    "Understand the world. Based on facts. A digital news and knowledge platform: the latest news from Indonesia and the world with clear sources, fact-checking, data, and chronology.",
  "footer.kategori": "Categories",
  "footer.layanan": "Services",
  "footer.redaksiLegal": "Editorial & Legal",
  "footer.hakCipta":
    "All original articles are written based on the sources cited.",
  "footer.bahasaWilayah": "Content in Indonesian · Indonesia & the World",
  "footer.arsipBerita": "News archive",
  "footer.pencarian": "Search",
  "footer.laporkan": "Report an error",
  "bahasa.label": "Language",
  "bahasa.indonesia": "Indonesian",
  "bahasa.inggris": "English",
};

export const KAMUS: Record<Bahasa, Record<KunciBahasa, string>> = {
  id: KAMUS_ID,
  en: KAMUS_EN,
};

/**
 * Terjemahan satu kunci. `nilai` mengisi placeholder {nama}
 * (mis. {q}). Fallback jujur: bila teks EN tak ada saat runtime,
 * kembalikan teks ID — jangan karang string Inggris. Secara statis
 * fallback ini tidak terjangkau (KAMUS_EN bertipe Record lengkap).
 */
export function t(
  bahasa: Bahasa,
  kunci: KunciBahasa,
  nilai?: Record<string, string>,
): string {
  let teks = KAMUS[bahasa][kunci] ?? KAMUS.id[kunci];
  if (nilai) {
    for (const [nama, isi] of Object.entries(nilai)) {
      teks = teks.replaceAll(`{${nama}}`, isi);
    }
  }
  return teks;
}

/** Varian EmptyState — dipakai TEKS_KOSONG di bawah. */
export type VarianKosong =
  | "kosong"
  | "error"
  | "izin"
  | "tak-tersedia"
  | "memuat";

/** Teks baku EmptyState per varian (judul + pesan) — pemakaian
 *  eksplisit per kunci agar baterai bisa memeriksa statis bahwa
 *  tidak ada kunci yatim (tanpa konstruksi string dinamis). */
export const TEKS_KOSONG: Record<
  VarianKosong,
  { judul: KunciBahasa; pesan: KunciBahasa }
> = {
  kosong: { judul: "kosong.kosongJudul", pesan: "kosong.kosongPesan" },
  error: { judul: "kosong.errorJudul", pesan: "kosong.errorPesan" },
  izin: { judul: "kosong.izinJudul", pesan: "kosong.izinPesan" },
  "tak-tersedia": {
    judul: "kosong.takTersediaJudul",
    pesan: "kosong.takTersediaPesan",
  },
  memuat: { judul: "kosong.memuatJudul", pesan: "kosong.memuatPesan" },
};

/**
 * Penentu bahasa (SERVER ONLY — jangan panggil dari komponen
 * klien; komponen klien memakai useBahasa() dari lib/useBahasa).
 * Baca cookie pf-bahasa via next/headers; nilai selain id/en → id.
 * Gagal baca apa pun (mis. di luar request) → id, bukan lempar.
 */
export async function getBahasa(): Promise<Bahasa> {
  try {
    // Impor dinamis — lihat catatan arsitektur di atas berkas.
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    return bahasaDariNilai(cookieStore.get(COOKIE_BAHASA)?.value);
  } catch {
    return "id";
  }
}
