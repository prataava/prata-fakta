// Daftar jenis data pengguna untuk ekspor + hapus per item
// (Gelombang B2-A, A2). SATU sumber kebenaran dipakai route
// /api/saya/ekspor, /api/saya/data, dan UI /saya — jenis baru
// ditambah di sini, bukan di tiga tempat.
//
// CATATAN KEBIJAKAN DELETE (hasil audit migrasi v1–v13):
// policy DELETE pemilik SUDAH ADA untuk bookmark, riwayat,
// topik, pengikut-cerita, progres-kursus, riwayat-podcast, dan
// daftar-podcast. BELUM ADA untuk skor kuis, notifikasi,
// preferensi, dan pertanyaan — keempatnya butuh policy DELETE
// pemilik di migrasi v14 (lihat laporan B2-A). Sampai v14
// diterapkan, route /api/saya/data menghapus lewat service
// role DENGAN filter kepemilikan .eq("user_id", userId) di kode
// + verifikasi jumlah baris terhapus, jadi tidak ada hapus
// lintas pengguna; policy v14 adalah pertahanan berlapis.
export type JenisData =
  | "bookmark"
  | "riwayat"
  | "skor"
  | "topik"
  | "notifikasi"
  | "pertanyaan"
  | "progres-kursus"
  | "riwayat-podcast"
  | "daftar-podcast"
  | "pengikut-cerita"
  | "preferensi";

export type InfoJenisData = {
  tabel: string;
  label: string;
  /** Keterangan yang tampil di UI hapus data. */
  keterangan: string;
};

export const JENIS_DATA: Record<JenisData, InfoJenisData> = {
  bookmark: {
    tabel: "pf_bookmarks",
    label: "Artikel disimpan (bookmark)",
    keterangan: "Artikel yang Anda simpan untuk dibaca lagi.",
  },
  riwayat: {
    tabel: "pf_reading_history",
    label: "Riwayat baca",
    keterangan: "Catatan artikel yang Anda baca, durasi, dan status selesai.",
  },
  skor: {
    tabel: "pf_quiz_scores",
    label: "Skor kuis",
    keterangan: "Skor kuis harian Anda per tanggal.",
  },
  topik: {
    tabel: "pf_followed_topics",
    label: "Topik diikuti",
    keterangan: "Kategori, negara, dan isu yang Anda ikuti.",
  },
  notifikasi: {
    tabel: "pf_notifications",
    label: "Notifikasi",
    keterangan: "Semua notifikasi yang pernah dikirim ke akun Anda.",
  },
  pertanyaan: {
    tabel: "pf_questions",
    label: "Pertanyaan saya (Ask the World)",
    keterangan:
      "Pertanyaan yang Anda ajukan. Pertanyaan yang sudah terjawab dan tampil di arsip publik TIDAK ikut terhapus saat hapus akun (dianonimkan) — di sini Anda menghapus pertanyaan Anda sendiri sepenuhnya.",
  },
  "progres-kursus": {
    tabel: "pf_course_progress",
    label: "Progres kursus Academy",
    keterangan: "Pelajaran yang Anda selesaikan dan skor per pelajaran.",
  },
  "riwayat-podcast": {
    tabel: "pf_podcast_history",
    label: "Riwayat podcast",
    keterangan: "Episode yang Anda dengarkan dan posisi terakhir.",
  },
  "daftar-podcast": {
    tabel: "pf_podcast_playlist_items",
    label: "Daftar putar podcast",
    keterangan: "Episode yang Anda simpan di daftar putar.",
  },
  "pengikut-cerita": {
    tabel: "pf_story_followers",
    label: "Cerita diikuti",
    keterangan: "Story Tracker yang Anda ikuti.",
  },
  preferensi: {
    tabel: "pf_user_preferences",
    label: "Preferensi",
    keterangan:
      "Pengaturan notifikasi dan digest. Menghapusnya mengembalikan semua preferensi ke nilai bawaan.",
  },
};

export const DAFTAR_JENIS_DATA: JenisData[] = Object.keys(
  JENIS_DATA,
) as JenisData[];

export function apakahJenisData(nilai: unknown): nilai is JenisData {
  return (
    typeof nilai === "string" && (DAFTAR_JENIS_DATA as string[]).includes(nilai)
  );
}
