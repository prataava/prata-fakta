// Tipe + interface adapter lapisan admin PRATA FAKTA (Fase 5).
// Aturan: SEMUA tipe di sini adalah data JSON-able (string/number/
// boolean/null/array/objek plain) — TIDAK ADA tipe Supabase yang
// bocor ke luar adapter. Aturan bisnis TIDAK ada di sini;
// semuanya di src/lib/admin/editorial.ts.
import type { Role } from "../auth/roles.ts";

// ---------- Nilai enum (selaras dengan check constraint migrasi) ----------

export type StatusArtikel = "draft" | "terbit" | "terjadwal" | "diarsipkan";

export type StatusVerifikasi =
  | "VERIFIED"
  | "CROSS-CHECKED"
  | "DEVELOPING"
  | "UNCONFIRMED"
  | "DISPUTED"
  | "CORRECTED";

export const STATUS_VERIFIKASI_VALID: StatusVerifikasi[] = [
  "VERIFIED",
  "CROSS-CHECKED",
  "DEVELOPING",
  "UNCONFIRMED",
  "DISPUTED",
  "CORRECTED",
];

export type KeputusanReview = "setuju" | "tolak" | "kembalikan";

export type StatusKoreksi = "baru" | "ditinjau" | "diperbaiki" | "ditolak";

// HARUS sama persis dengan CHECK pf_audit_logs_aksi_check_v15
// (migrasi v15 §4, 59 aksi). Sebelum Gelombang 2 tipe ini hanya 19
// anggota sementara CHECK sudah 47 — route baru menulis audit via
// insert service-client langsung karena tipenya tak memuat aksi
// mereka. Jangan tambah aksi di sini tanpa menambahkannya dulu ke
// CHECK lewat migrasi baru (insert aksi di luar CHECK gagal 23514).
// Aksi akun.hapus.* + data.hapus (Gelombang B2-A) MASUK CHECK
// v14 (pf_audit_logs_aksi_check_v14) — sampai v14 diterapkan,
// route hapus akun / hapus data menjawab 503 jujur, bukan 500.
// Aksi akademi.soal.buat + akademi.sertifikat.cabut (Tahap C)
// MASUK CHECK v15 — sampai v15 diterapkan, route soal/cabut
// menjawab 503 jujur, bukan 500.
export type AksiAudit =
  | "artikel.buat"
  | "artikel.ubah"
  | "artikel.hapus"
  | "artikel.terbit"
  | "artikel.batal_terbit"
  | "artikel.jadwalkan"
  | "review.setuju"
  | "review.tolak"
  | "review.kembalikan"
  | "verifikasi.ubah"
  | "evidence.label"
  | "koreksi.terima"
  | "koreksi.tolak"
  | "koreksi.ditinjau"
  | "pengguna.role"
  | "pengguna.nonaktif"
  | "pengguna.aktifkan"
  | "sistem.job"
  | "sistem.kategori"
  | "brief.terbit"
  | "cerita.buat"
  | "cerita.ubah"
  | "cerita.hapus"
  | "pengetahuan.buat"
  | "pengetahuan.ubah"
  | "pengetahuan.hapus"
  | "event.buat"
  | "event.ubah"
  | "event.hapus"
  | "data.indikator"
  | "data.titik"
  | "riset.buat"
  | "riset.ubah"
  | "riset.hapus"
  | "negara.buat"
  | "negara.ubah"
  | "negara.hapus"
  | "tanya.jawab"
  | "akademi.kursus"
  | "akademi.modul"
  | "akademi.progres"
  | "akademi.soal.buat"
  | "akademi.sertifikat.cabut"
  | "podcast.episode"
  | "podcast.terbit"
  | "sistem.flag"
  | "sistem.pengumuman"
  | "kuis.buat"
  | "kuis.ubah"
  | "preferensi.ubah"
  | "ekspor.data"
  | "akun.hapus.minta"
  | "akun.hapus"
  | "akun.hapus.gagal"
  | "data.hapus"
  | "sumber.buat"
  | "sumber.ubah"
  | "sumber.hapus"
  | "sumber.cek"
  | "sumber.aktif";

export type NamaJob =
  | "ingestion"
  | "editorial"
  | "brief"
  | "data-analysis"
  | "terbitkan-terjadwal";

export const NAMA_JOB_VALID: NamaJob[] = [
  "ingestion",
  "editorial",
  "brief",
  "data-analysis",
  "terbitkan-terjadwal",
];

export type StatusJobTerakhir =
  | "berhasil"
  | "gagal"
  | "berjalan"
  | "belum_pernah";

// ---------- Entitas ----------

export interface Artikel {
  id: string;
  slug: string;
  judul: string;
  subjudul: string | null;
  ringkasan: string;
  isi: string;
  kategori_slug: string;
  subkategori_slug?: string | null;
  status_verifikasi: StatusVerifikasi;
  status: StatusArtikel;
  penulis_nama: string | null;
  penulis_id: string | null;
  // Tahap C-5 (v15): isu artikel untuk notifikasi pengikut
  // topik tipe 'isu'. Opsional — undefined bila kolom belum ada
  // (migrasi v15 belum dijalankan).
  isu?: string | null;
  sumber_url: string | null;
  gambar_url: string | null;
  estimasi_baca_menit: number | null;
  kronologi: unknown;
  fakta_penting: unknown;
  data_pendukung: unknown;
  mengapa_penting: string | null;
  dampak: string | null;
  belum_diketahui: string | null;
  dijadwalkan_pada: string | null;
  diterbitkan_pada: string | null;
  diterbitkan_oleh: string | null;
  dibuat_pada: string;
  diperbarui_pada: string;
}

export interface ArtikelInput {
  judul: string;
  slug: string;
  subjudul?: string | null;
  ringkasan: string;
  isi: string;
  kategori_slug: string;
  subkategori_slug?: string | null;
  penulis_nama?: string | null;
  penulis_id?: string | null;
  // Tahap C-5 (v15): isu artikel (maks 120 karakter, sama
  // seperti batas target topik di /api/topik).
  isu?: string | null;
  sumber_url?: string | null;
  gambar_url?: string | null;
  estimasi_baca_menit?: number | null;
  kronologi?: unknown;
  fakta_penting?: unknown;
  data_pendukung?: unknown;
  mengapa_penting?: string | null;
  dampak?: string | null;
  belum_diketahui?: string | null;
}

export interface ArtikelPatch {
  judul?: string;
  subjudul?: string | null;
  ringkasan?: string;
  isi?: string;
  kategori_slug?: string;
  subkategori_slug?: string | null;
  // Tahap C-5 (v15): isu artikel.
  isu?: string | null;
  penulis_nama?: string | null;
  sumber_url?: string | null;
  gambar_url?: string | null;
  estimasi_baca_menit?: number | null;
  kronologi?: unknown;
  fakta_penting?: unknown;
  data_pendukung?: unknown;
  mengapa_penting?: string | null;
  dampak?: string | null;
  belum_diketahui?: string | null;
  catatan_versi?: string;
  // Field internal (dipakai editorial.ts untuk perubahan status):
  status?: StatusArtikel;
  dijadwalkan_pada?: string | null;
  diterbitkan_pada?: string | null;
  diterbitkan_oleh?: string | null;
}

export interface FilterArtikel {
  status?: StatusArtikel;
  kategori?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface HasilListArtikel {
  artikel: Artikel[];
  total: number;
  page: number;
  limit: number;
}

export interface VersiArtikel {
  id: string;
  artikel_id: string;
  versi: number;
  judul: string | null;
  isi: string | null;
  /** Isi SEBELUM revisi ini (v27; null untuk versi pra-v27). */
  isi_sebelum?: string | null;
  dibuat_oleh: string | null;
  dibuat_pada: string;
  catatan: string | null;
}

export interface VersiInput {
  artikel_id: string;
  versi: number;
  judul: string | null;
  isi: string | null;
  /** Isi SEBELUM revisi (v27); null bila tidak ada/tidak diketahui. */
  isi_sebelum?: string | null;
  dibuat_oleh: string | null;
  catatan: string | null;
}

export interface Review {
  id: string;
  artikel_id: string;
  reviewer_id: string | null;
  keputusan: KeputusanReview;
  catatan: string;
  dibuat_pada: string;
}

export interface ReviewInput {
  artikel_id: string;
  reviewer_id: string | null;
  keputusan: KeputusanReview;
  catatan: string;
}

export interface CatatanVerifikasi {
  id: string;
  artikel_id: string | null;
  raw_item_id: string | null;
  agen: string;
  keputusan: StatusVerifikasi;
  catatan: string | null;
  bukti: unknown;
  dibuat_oleh: string | null;
  dibuat_pada: string;
}

export interface VerificationInput {
  artikel_id: string | null;
  raw_item_id?: string | null;
  agen: string;
  keputusan: StatusVerifikasi;
  catatan: string | null;
  bukti?: unknown;
  dibuat_oleh: string | null;
}

export interface Koreksi {
  id: string;
  /** null bila laporan masyarakat tanpa artikel (nullable sejak migrasi v8). */
  artikel_id: string | null;
  pelapor_id: string | null;
  nama: string | null;
  email: string | null;
  /** Email pelapor laporan masyarakat (kolom v8; null untuk laporan lama). */
  pelapor_email: string | null;
  jenis: string;
  pesan: string;
  status: StatusKoreksi;
  /** Kode lacak laporan masyarakat (kolom v8; null untuk laporan lama). */
  nomor_lacak: string | null;
  /** Tautan artikel yang dilaporkan (kolom v8; null bila tidak ada). */
  tautan_artikel: string | null;
  dibuat_pada: string;
}

export interface PenggunaAdmin {
  id: string;
  email: string | null;
  email_tidak_tersedia: boolean;
  nama_tampilan: string | null;
  nonaktif: boolean;
  roles: Role[];
  dibuat_pada: string | null;
}

export interface JobTerjadwal {
  id: string;
  nama: NamaJob;
  jadwal_cron: string | null;
  deskripsi: string | null;
  aktif: boolean;
  terakhir_jalan: string | null;
  status_terakhir: StatusJobTerakhir;
  error_terakhir: string | null;
  diperbarui_pada: string;
}

export interface JobPatch {
  jadwal_cron?: string | null;
  aktif?: boolean;
  terakhir_jalan?: string | null;
  status_terakhir?: StatusJobTerakhir;
  error_terakhir?: string | null;
}

export interface Kategori {
  id: string;
  slug: string;
  nama: string;
  deskripsi: string | null;
  induk_id: string | null;
  urutan: number;
  aktif: boolean;
  dibuat_pada: string;
}

export interface KategoriInput {
  slug: string;
  nama: string;
  deskripsi?: string | null;
  induk_id?: string | null;
  urutan?: number;
  aktif?: boolean;
}

export interface KategoriPatch {
  nama?: string;
  deskripsi?: string | null;
  induk_id?: string | null;
  urutan?: number;
  aktif?: boolean;
}

export interface BriefAdmin {
  id: string;
  tanggal: string;
  isi: unknown;
  status: "draft" | "terbit";
  dibuat_pada: string;
  diterbitkan_pada: string | null;
}

export interface AuditInput {
  aktor_id: string | null;
  aktor_email: string | null;
  aksi: AksiAudit;
  entitas: string;
  entitas_id: string | null;
  sebelum?: unknown;
  sesudah?: unknown;
  ip?: string | null;
}

export interface AuditLog {
  id: string;
  aktor_id: string | null;
  aktor_email: string | null;
  aksi: string;
  entitas: string;
  entitas_id: string | null;
  sebelum: unknown;
  sesudah: unknown;
  ip: string | null;
  dibuat_pada: string;
}

export interface FilterAudit {
  aksi?: string;
  entitas?: string;
  page?: number;
  limit?: number;
}

export interface HasilListAudit {
  log: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

export interface RingkasanAdmin {
  total_artikel: number;
  terbit: number;
  draft: number;
  terjadwal: number;
  antrean_verifikasi: number;
  belum_terkonfirmasi: number;
  dikoreksi: number;
  per_kategori: { kategori_slug: string; jumlah: number }[];
}

export interface RunIngestion {
  id: string;
  sumber_id: string | null;
  sumber_nama: string | null;
  dimulai_pada: string;
  selesai_pada: string | null;
  status: string;
  ditemukan: number;
  baru: number;
  duplikat: number;
  ditolak: number;
  gagal: number;
  error: string | null;
  dipicu_oleh: string;
}

export interface RunAi {
  id: string;
  agen: string;
  input_ref: string | null;
  input_jenis: string;
  output_ref: string | null;
  status: string;
  error: string | null;
  durasi_ms: number | null;
  detail: unknown;
  dipicu_oleh: string;
  dimulai_pada: string;
  selesai_pada: string | null;
}

export interface KesehatanSupabase {
  ok: boolean;
  ms: number;
}

/** Satu tautan sumber artikel (pf_article_sources). Dipakai hard
 *  gate auto-publish: independensi dihitung dari sumber_id yang
 *  berbeda (satu outlet yang menyalin berita yang sama = satu
 *  sumber), dan URL-nya diperiksa strukturnya. */
export interface SumberArtikel {
  sumber_id: string;
  url: string | null;
}

/** Satu klaim artikel (pf_claims). Klaim pipeline terikat
 *  raw_item_id, bukan artikel_id — pembaca hard gate memakai
 *  keduanya (lihat listKlaimArtikel). */
export interface KlaimArtikel {
  id: string;
  teks: string;
  jenis: string;
  status: string;
}

/** Satu evidence klaim (pf_evidence). arah 'menentang' = konflik
 *  material yang belum terselesaikan. */
export interface EvidenceArtikel {
  id: string;
  klaim_id: string;
  sumber_url: string;
  sumber_nama: string | null;
  kutipan: string | null;
  arah: string;
}

// ---------- Interface adapter ----------

/** Adapter data lapisan admin. Semua method async, SATU param objek
 *  plain, return data JSON-able. Adapter TIDAK berisi aturan bisnis
 *  (aturan ada di editorial.ts) dan TIDAK memeriksa peran
 *  (otorisasi sudah diperiksa guard route). */
export interface AdminAdapter {
  getArtikel(input: { id: string }): Promise<Artikel | null>;
  getArtikelBySlug(input: { slug: string }): Promise<Artikel | null>;
  listArtikel(filter: FilterArtikel): Promise<HasilListArtikel>;
  buatArtikel(input: ArtikelInput): Promise<Artikel>;
  perbaruiArtikel(input: {
    id: string;
    patch: ArtikelPatch;
    /** Bila diisi, update hanya berhasil bila status saat ini sama
     *  (update bersyarat — menutup race dua penerbit bersamaan;
     *  P2-9 integrasi B1). Tanpa ini, update memengaruhi 0 baris
     *  dan mengembalikan null. */
    harapkanStatus?: string;
  }): Promise<Artikel | null>;
  hapusArtikel(input: { id: string }): Promise<void>;
  /** Sisipkan kembali artikel yang terhapus dengan id ASLI
   *  (compensating T10 hapusArtikel). Riwayat versi yang ikut
   *  terhapus cascade TIDAK dipulihkan oleh metode ini. */
  pulihkanArtikel(input: { artikel: Artikel }): Promise<Artikel>;

  getVerifikasiTerakhir(input: {
    artikel_id: string;
  }): Promise<CatatanVerifikasi | null>;
  /** Tautan sumber satu artikel (hard gate auto-publish G1/G3). */
  listSumberArtikel(input: {
    artikel_id: string;
  }): Promise<SumberArtikel[]>;
  /** Klaim artikel — dicari lewat artikel_id DAN raw_item_id
   *  (klaim pipeline terikat item mentah, bukan artikel).
   *  Digabung + didedup berdasarkan id. */
  listKlaimArtikel(input: {
    artikel_id: string;
    raw_item_id?: string | null;
  }): Promise<KlaimArtikel[]>;
  /** Evidence untuk daftar klaim (hard gate G2/G4). */
  listEvidenceArtikel(input: {
    klaim_id: string[];
  }): Promise<EvidenceArtikel[]>;
  /** Tanggal terbit sumber artikel (waktu_terbit_asli pf_raw_items)
   *  — dari item mentah catatan verifikasi + dari pencocokan URL
   *  tautan sumber. Dipakai hard gate G4 (tanggal diketahui) dan
   *  G5 (kebaruan). ISO string; kosong bila tak satu pun diketahui. */
  listTanggalSumberArtikel(input: {
    artikel_id: string;
    raw_item_id?: string | null;
  }): Promise<string[]>;
  simpanReview(input: ReviewInput): Promise<Review>;
  /** Hapus satu baris review (compensating T10: hapus-balik
   *  review yang baru disimpan bila auditnya gagal). */
  hapusReview(input: { id: string }): Promise<void>;
  getReviewTerakhir(input: { artikel_id: string }): Promise<Review | null>;
  simpanVerification(input: VerificationInput): Promise<CatatanVerifikasi>;
  /** Hapus satu catatan verifikasi (compensating T10:
   *  hapus-balik catatan yang baru disimpan bila audit gagal). */
  hapusVerifikasi(input: { id: string }): Promise<void>;
  ubahStatusVerifikasiArtikel(input: {
    id: string;
    keputusan: StatusVerifikasi;
  }): Promise<Artikel | null>;

  simpanVersi(input: VersiInput): Promise<VersiArtikel>;
  getVersiTerakhir(input: {
    artikel_id: string;
  }): Promise<VersiArtikel | null>;
  /** Hapus satu baris versi (compensating T10: hapus-balik
   *  versi yang dibuat revisi yang auditnya gagal). */
  hapusVersi(input: { id: string }): Promise<void>;

  catatAudit(input: AuditInput): Promise<void>;

  getKoreksi(input: { id: string }): Promise<Koreksi | null>;
  listKoreksi(input: { status?: StatusKoreksi }): Promise<Koreksi[]>;
  perbaruiKoreksi(input: {
    id: string;
    status: StatusKoreksi;
  }): Promise<Koreksi | null>;

  getPengguna(input: { id: string }): Promise<PenggunaAdmin | null>;
  listPengguna(): Promise<PenggunaAdmin[]>;
  setPeranPengguna(input: {
    id: string;
    roles: string[];
  }): Promise<void>;
  setNonaktif(input: { id: string; nonaktif: boolean }): Promise<void>;

  getJob(input: { nama: NamaJob }): Promise<JobTerjadwal | null>;
  listJobs(): Promise<JobTerjadwal[]>;
  perbaruiJob(input: { nama: NamaJob; patch: JobPatch }): Promise<JobTerjadwal | null>;

  listKategori(): Promise<Kategori[]>;
  buatKategori(input: KategoriInput): Promise<Kategori>;
  perbaruiKategori(input: {
    id: string;
    patch: KategoriPatch;
  }): Promise<Kategori | null>;
  hapusKategori(input: { id: string }): Promise<void>;
  /** Sisipkan kembali kategori yang terhapus dengan id ASLI
   *  (compensating T10 hapusKategori). */
  pulihkanKategori(input: { kategori: Kategori }): Promise<Kategori>;

  terbitkanBrief(input: { id: string }): Promise<BriefAdmin | null>;
  /** Kembalikan brief terbit ke draft (compensating T10
   *  terbitkanBrief: status draft + diterbitkan_pada null). */
  pulihkanBrief(input: { id: string }): Promise<BriefAdmin | null>;
  listBrief(): Promise<BriefAdmin[]>;

  listAudit(filter: FilterAudit): Promise<HasilListAudit>;
  hitungRingkasan(): Promise<RingkasanAdmin>;
  hitungSumber(): Promise<{ total: number; aktif: number }>;
  listAiRuns(input: { limit: number }): Promise<RunAi[]>;
  runIngestionTerakhir(input: { limit: number }): Promise<RunIngestion[]>;
  runAiGagalTerakhir(input: { limit: number }): Promise<RunAi[]>;
  cekSupabaseSehat(): Promise<KesehatanSupabase>;
}

// ---------- Galat "layanan belum siap" (503 jujur) ----------

/** Adapter menandai galat "tabel/service key belum ada" dengan
 *  awalan ini agar route bisa menjawab 503 yang jujur, bukan 500. */
export const AWALAN_BELUM_SIAP = "LAYANAN_BELUM_SIAP:";

export function adalahGalatBelumSiap(err: unknown): boolean {
  const pesan = err instanceof Error ? err.message : String(err ?? "");
  return (
    pesan.startsWith(AWALAN_BELUM_SIAP) ||
    pesan.startsWith("TABEL_BELUM_ADA") ||
    pesan.startsWith("SERVICE_KEY_BELUM_ADA") ||
    pesan.includes("Could not find the table") ||
    pesan.includes("SUPABASE_SERVICE_ROLE_KEY belum diatur")
  );
}

/** Apakah galat Supabase ini berarti tabel/kolom belum ada
 *  (migrasi belum dijalankan)? Dipakai adapter untuk menandai. */
export function adalahGalatTabelBelumAda(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  // PGRST204 (kolom belum ada di schema cache) = migrasi yang
  // menambah kolom itu belum dijalankan — diperlakukan sama
  // seperti tabel belum ada (Tahap C-5: kolom pf_articles.isu
  // v15): 503 jujur, bukan 500.
  if (
    e.code === "PGRST205" ||
    e.code === "PGRST204" ||
    e.code === "42P01" ||
    e.code === "42703"
  ) {
    return true;
  }
  const pesan = typeof e.message === "string" ? e.message : "";
  return (
    pesan.includes("Could not find the table") ||
    pesan.includes("relation") && pesan.includes("does not exist") ||
    pesan.includes("column") && pesan.includes("does not exist")
  );
}
