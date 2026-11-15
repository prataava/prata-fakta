// Tipe bersama pipeline editorial AI PRATA FAKTA + interface AiAdapter.
// Kode di sini DETERMINISTIK (aturan tetap + ekstraksi pola), BUKAN LLM:
// draf yang dihasilkan adalah draf awal yang WAJIB disempurnakan dan
// disetujui editor manusia/Muse lewat cron/chat sebelum terbit.
// Tanpa GPT/Gemini/DeepSeek, tanpa kunci API eksternal.
import type { StatusVerifikasi } from "../verifikasi.ts";

// ---------- Nilai enum (selaras dengan check constraint migrasi v4) ----------

export type AgenAi =
  | "research"
  | "source_analysis"
  | "fact_verification"
  | "summarization"
  | "article_writing"
  | "translation"
  | "trend_analysis"
  | "daily_brief"
  | "data_analysis"
  | "editorial_quality";

export type StatusRunAi = "berjalan" | "berhasil" | "gagal" | "dilewati";

export type DipicuOleh = "manual" | "jadwal" | "github_actions" | "cron_muse";

export type InputJenisAi =
  | "raw_item"
  | "artikel"
  | "klaim"
  | "brief"
  | "sumber"
  | "lain";

export type JenisKlaim = "fakta" | "angka" | "kutipan" | "tanggal" | "lain";

export type StatusKlaim =
  | "terverifikasi"
  | "terbantah"
  | "belum_terverifikasi"
  | "tidak_dapat_diverifikasi";

export type ArahBukti = "mendukung" | "menentang" | "netral";

// Kategori utama v1 (pf_categories) — satu-satunya nilai kategori_slug
// yang boleh dipakai draf artikel.
export type KategoriSlug =
  | "indonesia"
  | "dunia"
  | "ekonomi"
  | "teknologi"
  | "sains"
  | "pendidikan"
  | "lingkungan-energi";

export const KATEGORI_UTAMA: KategoriSlug[] = [
  "indonesia",
  "dunia",
  "ekonomi",
  "teknologi",
  "sains",
  "pendidikan",
  "lingkungan-energi",
];

// Keputusan verifikasi yang BOLEH dihitung pipeline dari metadata.
// DISPUTED/CORRECTED tidak pernah dihitung otomatis (lihat verification.ts).
export type KeputusanVerifikasi =
  | "VERIFIED"
  | "CROSS-CHECKED"
  | "DEVELOPING"
  | "UNCONFIRMED";

// ---------- Baris antrean editorial ----------

export interface RawItemAntrean {
  id: string;
  sumber_id: string | null;
  sumber_nama: string;
  sumber_prioritas: number;
  url: string;
  judul: string;
  ringkasan: string;
  isi_ringkas: string;
  penulis: string | null;
  // ISO 8601 atau null (waktu_terbit_asli boleh kosong di feed).
  waktu_terbit_asli: string | null;
  waktu_diambil: string;
  status: string;
  disalin_dari_id: string | null;
  metadata: Record<string, unknown> | null;
}

export interface SumberRingkas {
  id: string;
  nama: string;
  jenis: string;
  url: string;
  prioritas: number;
}

export interface ItemSerupa {
  id: string;
  sumber_id: string | null;
  url: string;
  judul: string;
  ringkasan: string;
  waktu_terbit_asli: string | null;
  disalin_dari_id: string | null;
}

// ---------- Masukan metode adapter ----------

export interface CatatRunInput {
  agen: AgenAi;
  input_ref?: string;
  input_jenis?: InputJenisAi;
  dipicu_oleh?: DipicuOleh;
}

export interface TutupRunPatch {
  status: StatusRunAi;
  error?: string;
  durasi_ms?: number;
  output_ref?: string;
  detail?: Record<string, unknown>;
}

export interface SimpanKlaimInput {
  raw_item_id?: string;
  artikel_id?: string;
  teks: string;
  jenis: JenisKlaim;
}

export interface SimpanBuktiInput {
  klaim_id: string;
  sumber_url: string;
  sumber_nama?: string;
  kutipan?: string;
  arah: ArahBukti;
}

export interface SimpanVerificationInput {
  artikel_id?: string;
  raw_item_id: string;
  keputusan: StatusVerifikasi;
  catatan?: string;
  bukti?: unknown;
}

export interface KronologiEntri {
  tanggal: string | null;
  peristiwa: string;
  sumber: string;
}

export interface SimpanArtikelInput {
  slug: string;
  judul: string;
  subjudul?: string;
  ringkasan: string;
  isi: string;
  kategori_slug: KategoriSlug;
  status_verifikasi: StatusVerifikasi;
  sumber_url: string;
  penulis_nama: string;
  raw_item_id: string;
  fakta_penting: string[];
  kronologi: KronologiEntri[];
  mengapa_penting?: string;
  belum_diketahui?: string;
}

export interface KlaimTanpaVerifikasi {
  id: string;
  teks: string;
  raw_item_id: string | null;
  artikel_id: string | null;
}

export interface BriefTersimpan {
  id: string;
  tanggal: string;
  isi: unknown;
  status: string;
}

// Draf artikel untuk entri Daily Brief (status='draft' saja —
// TIDAK PERNAH artikel terbit tanpa persetujuan editorial).
export interface ArtikelDrafRingkas {
  judul: string;
  ringkasan: string;
  kategori_slug: string;
  status_verifikasi: string;
  sumber_url: string;
  dibuat_pada: string;
}

// Klaim kandidat untuk verifikasi silang antar-klaim: teks klaim
// beserta item asalnya (untuk hitung sumber independen + penjaga
// topik di verification.ts).
export interface KlaimSerupa {
  id: string;
  raw_item_id: string;
  teks: string;
  jenis: JenisKlaim;
  sumber_id: string | null;
  judul_item: string;
  url_item: string;
  ringkasan_item: string;
  waktu_terbit_asli: string | null;
  disalin_dari_id: string | null;
}

// ---------- Interface adapter (KONTRAK — dipakai API route oleh agen
// lain; JANGAN ubah nama metode / parameter di sini) ----------

export interface AiAdapter {
  // Item mentah berstatus UNCONFIRMED, urut prioritas sumber DESC lalu
  // waktu terbit DESC.
  ambilAntrean(limit: number): Promise<RawItemAntrean[]>;
  ambilSumber(id: string): Promise<SumberRingkas | null>;
  // Item lain dengan hash_judul yang sama (judul identik), kecuali id
  // yang diberikan — dipakai verifikasi silang.
  ambilItemSerupa(
    hashJudul: string,
    kecualiId: string,
  ): Promise<ItemSerupa[]>;
  // Klaim lain yang teksnya memuat inti klaim tertentu (pencarian
  // ILIKE longgar — pemanggil WAJIB verifikasi ulang kecocokan
  // persis di verification.ts). Dipakai verifikasi silang antar-klaim.
  cariKlaimSerupa(
    inti: string,
    kecualiItemId: string,
    batas?: number,
  ): Promise<KlaimSerupa[]>;
  // Catat awal eksekusi satu agen (status 'berjalan'); kembalikan id run.
  catatRun(run: CatatRunInput): Promise<string>;
  tutupRun(id: string, patch: TutupRunPatch): Promise<void>;
  simpanKlaim(k: SimpanKlaimInput): Promise<string>;
  // Id klaim yang teksnya sudah tersimpan untuk item ini, atau null —
  // dipakai fase riset agar run ulang tidak menduplikasi klaim item
  // yang tetap UNCONFIRMED (item seperti itu sengaja tinggal di
  // antrean: koroborasi bisa datang dari batch berikutnya).
  cariKlaimSama(raw_item_id: string, teks: string): Promise<string | null>;
  simpanBukti(b: SimpanBuktiInput): Promise<void>;
  simpanVerification(r: SimpanVerificationInput): Promise<string>;
  // Selalu menyimpan sebagai draf (status='draft'); TIDAK PERNAH
  // auto-terbit.
  simpanArtikel(d: SimpanArtikelInput): Promise<string>;
  perbaruiStatusItem(id: string, status_verifikasi: string): Promise<void>;
  ambilKlaimTanpaVerifikasi(limit: number): Promise<KlaimTanpaVerifikasi[]>;
  // Upsert per tanggal (satu brief per hari), selalu status 'draft'.
  simpanBrief(tanggal: string, isi: unknown): Promise<string>;
  ambilBriefTerbaru(): Promise<BriefTersimpan | null>;
  // Draf artikel terbaru (status='draft'), untuk entri Daily Brief.
  ambilDrafArtikel(limit: number): Promise<ArtikelDrafRingkas[]>;
}
