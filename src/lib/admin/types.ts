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
  | "koreksi.terima"
  | "koreksi.tolak"
  | "koreksi.ditinjau"
  | "pengguna.role"
  | "pengguna.nonaktif"
  | "pengguna.aktifkan"
  | "sistem.job"
  | "sistem.kategori"
  | "brief.terbit";

export type NamaJob = "ingestion" | "editorial" | "brief";

export const NAMA_JOB_VALID: NamaJob[] = ["ingestion", "editorial", "brief"];

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
  subkategori_slug: string | null;
  status_verifikasi: StatusVerifikasi;
  status: StatusArtikel;
  penulis_nama: string | null;
  penulis_id: string | null;
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
  dibuat_oleh: string | null;
  dibuat_pada: string;
  catatan: string | null;
}

export interface VersiInput {
  artikel_id: string;
  versi: number;
  judul: string | null;
  isi: string | null;
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
  }): Promise<Artikel | null>;
  hapusArtikel(input: { id: string }): Promise<void>;

  getVerifikasiTerakhir(input: {
    artikel_id: string;
  }): Promise<CatatanVerifikasi | null>;
  simpanReview(input: ReviewInput): Promise<Review>;
  getReviewTerakhir(input: { artikel_id: string }): Promise<Review | null>;
  simpanVerification(input: VerificationInput): Promise<CatatanVerifikasi>;
  ubahStatusVerifikasiArtikel(input: {
    id: string;
    keputusan: StatusVerifikasi;
  }): Promise<Artikel | null>;

  simpanVersi(input: VersiInput): Promise<VersiArtikel>;
  getVersiTerakhir(input: {
    artikel_id: string;
  }): Promise<VersiArtikel | null>;

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

  terbitkanBrief(input: { id: string }): Promise<BriefAdmin | null>;
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
  if (e.code === "PGRST205" || e.code === "42P01" || e.code === "42703") {
    return true;
  }
  const pesan = typeof e.message === "string" ? e.message : "";
  return (
    pesan.includes("Could not find the table") ||
    pesan.includes("relation") && pesan.includes("does not exist") ||
    pesan.includes("column") && pesan.includes("does not exist")
  );
}
