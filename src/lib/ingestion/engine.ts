// Mesin ingestion PRATA FAKTA — kode deterministik, BUKAN AI.
// Mengambil feed RSS (dan GDELT sebagai cadangan), mendedup, lalu
// menyimpan item mentah ke pf_raw_items. TIDAK ADA auto-publish dan
// TIDAK ADA auto-VERIFIED di sini: semua item baru berstatus
// status_verifikasi 'UNCONFIRMED' dan menunggu kurasi manusia/editor.
// Hak cipta: hanya metadata + ringkasan sumber + URL yang disimpan.
//
// MATRIKS FALLBACK (Tahap E) — satu kegagalan tidak boleh
// menghentikan pengumpulan:
//   - Satu feed RSS gagal (429/5xx/jaringan, sesudah retry
//     per-sumber maks 3x) -> feed RSS lain + GDELT tetap jalan
//     (Promise.allSettled di jalankanIngestion; tiap sumber
//     mencatat run 'gagal' sendiri, total.gagal bertambah 1).
//   - GDELT gagal -> semua feed RSS tetap jalan, dan sebaliknya.
//   - Satu item gagal disimpan (mis. DB error) -> item lain dalam
//     feed yang sama tetap diproses; run ditutup 'sebagian'.
//   - Run tidak bisa dibuat -> sumber itu dilaporkan gagal
//     (gagal=1, tanpa run); sumber lain tidak terpengaruh.
//   - Retry HANYA di level sumber (cobaUlang di retry.ts: backoff
//     eksponensial, hormati Retry-After). Workflow pemicu (GitHub
//     Actions) TIDAK BOLEH me-retry seluruh job (curl --retry
//     dihapus Tahap E): memicu ulang endpoint berarti mengambil
//     ulang SEMUA feed; kegagalan sebagian sudah terlihat lewat
//     assert respons + status run 'sebagian'/'gagal'.
//   - 0 item dari sumber yang biasanya produktif (ada item baru
//     7 hari terakhir) -> run 'sebagian' + peringatan_basi, BUKAN
//     sukses penuh; sumber basi > 48 jam tanpa item baru ditandai
//     di pf_sources.status_terakhir (pemeliharaan.ts).
//
// TAMBAHAN Fase 3 + 6 + 7 (ketahanan ingestion, lihat ketahanan.ts):
//   - Cooldown per-sumber: sesudah 429, cooldown_until diisi dari
//     Retry-After (min 30 mnt, maks 6 jam); sumber dalam cooldown
//     dilewati (run 'dilewati', bukan 'gagal').
//   - Circuit breaker: >= 3 gagal beruntun -> sumber dilewati
//     sampai cooldown lewat; pulih otomatis sesudah 1 sukses.
//   - Poll interval: sumber yang belum jatuh tempo dilewati.
//   - Conditional GET: ETag/Last-Modified disimpan per sumber;
//     304 -> 0 item baru tanpa simpan kosong, tanpa peringatan basi.
//   - Checkpoint: terakhir_cek + failure_count ditulis SEBELUM
//     memproses item (crash tidak mengulang dari nol tanpa jejak).
//   - Dedup GUID: GUID RSS kunci dedup tambahan (selain URL/judul).
//   - Klasifikasi galat per sumber (kelas di HasilPerSumber.kelas
//     + total.gagal_berat + total.per_kelas): hanya kelas berat
//     (invalid-feed / permanently-failed / gagal engine) yang
//     menggagalkan job workflow; rate-limited/dilewati = sukses
//     dengan peringatan.
//   - SEMUA perilaku v22 fail-soft: tanpa kolom v22 di DB, engine
//     jalan seperti sebelum v22 (tanpa cooldown/ETag/poll interval)
//     dan tidak crash — lihat bacaKeadaan/tulisKeadaan di bawah.

import { fetchRss } from "./rss.ts";
import type { ItemMentah } from "./rss.ts";
import { fetchGdelt } from "./gdelt.ts";
import {
  cariKandidatDuplikatLunak,
  hashJudul,
  hashUrl,
  JENDELA_DUPLIKAT_LUNAK_MS,
  tentukanStatusDuplikat,
} from "./dedup.ts";
import { cobaUlang, percobaanGalat, PESAN_REDIRECT_LOGIN, type OpsiCobaUlang } from "./retry.ts";
import {
  alasanLewati,
  AMBANG_CIRCUIT_BREAKER,
  AMBANG_PERMANEN,
  apakahKelasBerat,
  hitungCooldownSampai,
  hitungJedaStagger,
  klasifikasiGalatFetch,
  normalisasiKeadaan,
  petakanStatusRunAman,
  type KeadaanSumber,
  type KeadaanSumberMentah,
  type KelasGalat,
} from "./ketahanan.ts";
import { klasifikasikanItem } from "./klasifikasi.ts";
import {
  kelompokkanKlaster,
  type BarisItemKlaster,
} from "./klaster.ts";

// ---------- Adapter database (injeksi dependensi) ----------
// Engine tidak tahu Supabase/PGlite — semua akses DB lewat adapter ini.

export interface ItemSimpan {
  sumber_id: string;
  run_id: string | null;
  url: string;
  hash_url: string;
  judul: string;
  hash_judul: string;
  ringkasan: string;
  isi_ringkas: string;
  penulis: string | null;
  waktu_terbit_asli: Date | null;
  waktu_diambil: Date;
  status: "baru" | "duplikat" | "ditolak" | "disalin_dari";
  status_verifikasi: string;
  disalin_dari_id: string | null;
  diterbitkan_ulang: boolean;
  alasan: string | null;
  metadata: Record<string, unknown> | null;
}

export interface PatchTutupRun {
  selesai_pada: Date;
  status: string;
  ditemukan: number;
  baru: number;
  duplikat: number;
  ditolak: number;
  gagal: number;
  error: string | null;
  // Kelas galat per sumber (Fase 3, butir 5): disimpan ke
  // pf_ingestion_runs.kelas_gagal BILA kolomnya ada (migrasi v22/v24).
  // Adapter Supabase menanganinya fail-soft (coba tanpa kolom bila
  // kolom belum ada). null = tidak ada kegagalan (run selesai).
  kelasGagal?: string | null;
}

export interface IngestionAdapter {
  cariHashUrl(hashUrl: string): Promise<{ id: string } | null>;
  cariHashJudul(hashJudul: string): Promise<
    Array<{
      id: string;
      sumber_id: string | null;
      waktu_terbit_asli: string | null;
      waktu_diambil: string;
    }>
  >;
  /**
   * Simpan item, kembalikan id baris bila tersedia (untuk klaster
   * Fase 7). Adapter lama yang mengembalikan void tetap memenuhi
   * antarmuka ini (Promise<void> dapat dipakai sebagai
   * Promise<string | void>); klaster dilewati bila id tak tersedia.
   */
  simpanItem(item: ItemSimpan): Promise<string | void>;
  buatRun(input: {
    sumber_id: string | null;
    sumber_nama: string;
    dipicu_oleh: string;
  }): Promise<string>;
  tutupRun(id: string, patch: PatchTutupRun): Promise<void>;
  perbaruiSumber(
    id: string,
    patch: {
      terakhir_diambil: Date;
      status_terakhir: string;
      tambah_item: number;
    },
  ): Promise<void>;
  // --- Metode opsional Gelombang B1 (adapter lama tetap jalan:
  // engine memeriksa keberadaannya sebelum memakai). ---
  /** Judul item 48 jam terakhir (untuk dedup lunak tahap-2). */
  daftarJudulBaruSejak?(sejak: Date, batas?: number): Promise<
    Array<{
      id: string;
      judul: string;
      sumber_id: string | null;
      waktu_terbit_asli: string | null;
      waktu_diambil: string;
    }>
  >;
  /** Jumlah item sumber ini sejak tanggal tertentu (deteksi basi). */
  jumlahItemBaruSejak?(sumberId: string, sejak: Date): Promise<number>;
  /** Waktu item terbaru sumber ini (pemeriksaan basi harian). */
  waktuItemTerbaru?(sumberId: string): Promise<Date | null>;
  /** Tandai item UNCONFIRMED kedaluwarsa (lihat pemeliharaan.ts). */
  tandaiItemKedaluarsa?(batas: Date, alasan: string): Promise<number>;
  /** Tulis peringatan basi ke status_terakhir sumber (dashboard admin). */
  tandaiSumberBasi?(sumberId: string, pesan: string): Promise<void>;
  // --- Metode opsional Fase 3 + 6 (ketahanan ingestion) ---
  // SEMUA fail-soft terhadap kolom v22: bila adapter tidak
  // menyediakannya ATAU kolomnya belum ada di DB, engine memakai
  // bawaan (tanpa cooldown/poll interval/ETag) dan tetap jalan.
  /** Baca keadaan v22 sumber (poll interval, cooldown, failure_count, ETag...). */
  bacaKeadaanSumber?(sumberId: string): Promise<KeadaanSumberMentah | null>;
  /** Tulis sebagian keadaan v22 sumber (hanya kunci yang terisi yang ditulis). */
  tulisKeadaanSumber?(
    sumberId: string,
    patch: KeadaanSumberMentah,
  ): Promise<void>;
  /** Cari item berdasarkan GUID RSS (dedup GUID, Fase 3 butir 8). */
  cariGuid?(guid: string): Promise<{ id: string } | null>;
  /** Baca baris minimal item tersimpan (untuk klaster Fase 7). */
  bacaItemUntukKlaster?(itemIds: string[]): Promise<BarisItemKlaster[]>;
  /** Simpan satu klaster + anggotanya (tabel v24, best-effort). */
  simpanKlaster?(input: {
    kunci: string;
    judul: string;
    itemIds: string[];
  }): Promise<string | void>;
}

// ---------- Tipe input / output engine ----------

export interface SumberIngestion {
  id: string;
  nama: string;
  jenis: string;
  url: string;
  prioritas: number;
  aktif: boolean;
  // Topik GDELT khusus sumber ini (kolom pf_sources.topik_gdelt,
  // migrasi v13 — bila belum ada, diisi dari opsi/topik bawaan).
  // Hanya dipakai bila jenis === "api".
  topik_gdelt?: string | null;
  // Keadaan v22 (kolom pf_sources, migrasi Worker A — SEMUA
  // opsional; bila tidak diisi, engine membaca lewat adapter
  // bacaKeadaanSumber, dan bila itu pun tak ada, memakai bawaan).
  poll_interval_minutes?: number | null;
  cooldown_until?: Date | string | null;
  failure_count?: number | null;
  health_status?: string | null;
  etag?: string | null;
  last_modified?: Date | string | null;
  terakhir_cek?: Date | string | null;
  last_success_at?: Date | string | null;
}

export interface HasilPerSumber {
  sumber_id: string;
  sumber_nama: string;
  ditemukan: number;
  baru: number;
  duplikat: number;
  ditolak: number;
  gagal: number;
  error: string | null;
  // Peringatan basi (P1-6): 0 item dari sumber yang biasanya produktif.
  peringatan_basi?: string | null;
  // Kandidat duplikat lunak tahap-2 (P1-7): item tetap disimpan,
  // hanya ditandai untuk review — daftar dibatasi 10 entri pertama.
  kandidat_duplikat_lunak?: Array<{
    judul: string;
    judul_mirip: string;
    kemiripan: number;
    tipe: "duplikat" | "disalin_dari";
    item_id_mirip: string;
  }>;
  duplikat_lunak?: number;
  // Jumlah percobaan fetch yang dipakai (1 bila tanpa retry, P2-3).
  percobaan_fetch?: number;
  // Kelas hasil per sumber (Fase 3, butir 5). Selalu terisi untuk
  // hasil dari prosesSatuSumber; undefined hanya untuk hasil
  // darurat allSettled (engine menandainya 'gagal' di sana).
  kelas?: KelasGalat;
  // Alasan sumber dilewati (hanya bila kelas === 'dilewati').
  alasan_lewati?: string | null;
  // True bila server menjawab 304 (feed tidak berubah, 0 item baru).
  tidak_berubah?: boolean;
  // Id item yang TERSIMPAN pada run ini (baru/disalin/diterbitkan
  // ulang) — INTERNAL untuk klaster Fase 7; jalankanIngestion
  // menghapusnya sebelum mengembalikan hasil (tidak bocor ke API).
  itemIdsTersimpan?: string[];
}

export interface HasilIngestion {
  perSumber: HasilPerSumber[];
  total: {
    ditemukan: number;
    baru: number;
    duplikat: number;
    ditolak: number;
    gagal: number;
    // Jumlah sumber dengan kelas BERAT (invalid-feed /
    // permanently-failed / gagal engine) — SATU-SATUNYA angka yang
    // menggagalkan job workflow (lihat ingestion.yml). total.gagal
    // lama tetap dipertahankan untuk kompatibilitas.
    gagal_berat: number;
    // Hitungan per kelas (hanya kelas yang muncul), agar ringkasan
    // run menampilkan kelas + jumlahnya tanpa menyembunyikan apa pun.
    per_kelas: Record<string, number>;
  };
  // Klaster event yang berhasil disimpan pada run ini (Fase 7c).
  // Route /api/ingestion/jalankan saat ini belum meneruskan bidang
  // ini ke respons — klaster terlihat di tabel v24 / admin.
  klaster?: Array<{
    kunci: string;
    judul: string;
    jumlah_item: number;
    jumlah_sumber: number;
  }>;
}

export interface OpsiIngestion {
  dipicu_oleh?: string;
  fetchFn?: typeof fetch;
  hanyaSumberId?: string;
  // Timeout per feed RSS (ms). GDELT memakai timeout sendiri (30 dtk).
  timeoutMs?: number;
  // Topik GDELT untuk sumber jenis "api" (Gelombang 2: dulu
  // hardcoded "Indonesia" di bawah — utang audit §5.11).
  // Default tetap "Indonesia" agar perilaku lama tidak berubah.
  topikGdelt?: string;
  // Topik GDELT per sumber (P3-3): kunci = id ATAU nama sumber.
  // Mengalahkan topikGdelt; sumber.topik_gdelt (dari DB) mengalahkan
  // keduanya. Bila tidak ada satu pun, topik bawaan "Indonesia".
  topikGdeltPerSumber?: Record<string, string>;
  // Opsi retry per-sumber (P2-3): percobaanMaks bawaan 3, jeda awal
  // 1000 ms (backoff x2). Uji mengisi jedaAwalMs kecil agar cepat.
  retry?: OpsiCobaUlang;
  // Lewati allowlist host feed — HANYA untuk uji dengan fetch mock
  // (sumber sintetis contoh.test di scripts/uji-ingestion.mjs).
  // JANGAN PERNAH diisi di jalur produksi.
  lewatiAllowlistFeed?: boolean;
  // Jeda stagger antar fetch sumber (ms per indeks, bawaan 200).
  // 0 = semua sumber berangkat bersamaan (dipakai uji agar cepat).
  staggerMs?: number;
}

const PANJANG_JUDUL_MINIMAL = 5;

// Jendela "biasanya produktif" (P1-6): sumber dianggap produktif bila
// ada item baru dalam 7 hari terakhir.
const JENDELA_PRODUKTIF_MS = 7 * 24 * 60 * 60 * 1000;

// ---------- Keadaan per sumber (Fase 3 + 6, fail-soft v22) ----------

// Baca keadaan v22 satu sumber: gabungkan kolom dari objek sumber
// (bila route mengisinya) dengan bacaan adapter (DB). Nilai DB
// menang bila terdefinisi; bila adapter tak ada / gagal / kolom
// belum ada, pakai bawaan — TIDAK PERNAH melempar.
async function bacaKeadaan(
  adapter: IngestionAdapter,
  sumber: SumberIngestion,
): Promise<KeadaanSumber> {
  const mentah: KeadaanSumberMentah = {
    poll_interval_minutes: sumber.poll_interval_minutes ?? null,
    cooldown_until: sumber.cooldown_until ?? null,
    failure_count: sumber.failure_count ?? null,
    health_status: sumber.health_status ?? null,
    etag: sumber.etag ?? null,
    last_modified: sumber.last_modified ?? null,
    terakhir_cek: sumber.terakhir_cek ?? null,
    last_success_at: sumber.last_success_at ?? null,
  };
  if (adapter.bacaKeadaanSumber) {
    try {
      const dariDb = await adapter.bacaKeadaanSumber(sumber.id);
      if (dariDb) {
        const kunci: Array<keyof KeadaanSumberMentah> = [
          "poll_interval_minutes",
          "cooldown_until",
          "failure_count",
          "health_status",
          "etag",
          "last_modified",
          "terakhir_cek",
          "last_success_at",
        ];
        for (const k of kunci) {
          if (dariDb[k] !== undefined) mentah[k] = dariDb[k] as never;
        }
      }
    } catch {
      // Bacaan keadaan gagal: lanjut dengan bawaan/objek sumber.
    }
  }
  return normalisasiKeadaan(mentah);
}

// Tulis sebagian keadaan v22 (best-effort, TIDAK PERNAH melempar).
// Dipakai untuk checkpoint + pembaruan failure_count/cooldown/ETag.
async function tulisKeadaan(
  adapter: IngestionAdapter,
  sumberId: string,
  patch: KeadaanSumberMentah,
): Promise<void> {
  if (!adapter.tulisKeadaanSumber) return;
  try {
    await adapter.tulisKeadaanSumber(sumberId, patch);
  } catch {
    // Penulisan keadaan gagal (mis. kolom v22 belum ada): ingestion
    // tetap jalan — cooldown/ETag berikutnya dibaca ulang dari DB.
  }
}

// Tutup run dengan fallback CHECK-aman (Fase 3, butir 5):
// percobaan 1 menulis status kelas apa adanya (butuh migrasi v24);
// bila adapter/DB menolaknya (mis. CHECK v3 di DB lama, atau
// kolom kelas_gagal belum ada), ulangi sekali dengan status yang
// dipetakan ke nilai CHECK-aman v3 + tanpa kelas_gagal. Bila itu
// pun gagal, run dibiarkan 'berjalan' seperti perilaku lama —
// pencatatan TIDAK PERNAH menggagalkan ingestion.
async function tutupRunAman(
  adapter: IngestionAdapter,
  runId: string,
  patch: PatchTutupRun,
): Promise<void> {
  try {
    await adapter.tutupRun(runId, patch);
    return;
  } catch {
    try {
      const tanpaKelas: PatchTutupRun = { ...patch };
      delete tanpaKelas.kelasGagal;
      await adapter.tutupRun(runId, {
        ...tanpaKelas,
        status: petakanStatusRunAman(patch.status),
      });
    } catch {
      // Abaikan — sama seperti perilaku lama.
    }
  }
}

// ---------- Validasi item ----------

function urlValid(url: string): boolean {
  try {
    const terurai = new URL(url);
    return terurai.protocol === "http:" || terurai.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------- Proses satu sumber ----------

async function prosesSatuSumber(
  adapter: IngestionAdapter,
  sumber: SumberIngestion,
  opsi: OpsiIngestion,
): Promise<HasilPerSumber> {
  const dipicuOleh = opsi.dipicu_oleh ?? "manual";
  const timeoutMs = opsi.timeoutMs ?? 10000;
  const hasil: HasilPerSumber = {
    sumber_id: sumber.id,
    sumber_nama: sumber.nama,
    ditemukan: 0,
    baru: 0,
    duplikat: 0,
    ditolak: 0,
    gagal: 0,
    error: null,
  };
  const sekarang = new Date();

  // 0a. Sumber nonaktif tidak diproses (jalankanIngestion sudah
  // menyaring, tapi pemanggil langsung bisa lolos): tanpa run.
  if (!sumber.aktif) {
    hasil.kelas = "disabled";
    hasil.error = "Sumber nonaktif — dilewati tanpa fetch.";
    return hasil;
  }

  // 0b. Baca keadaan v22 (fail-soft: tanpa kolom v22 -> bawaan).
  const keadaan = await bacaKeadaan(adapter, sumber);

  // 0c. Gerbang lewati (Fase 3 + 6): cooldown / circuit breaker /
  // poll interval. Sumber dilewati dicatat run 'dilewati' (bukan
  // 'gagal') agar terlihat di pf_ingestion_runs tanpa menggagalkan
  // job. Pengecualian: pemicu manual satu sumber (hanyaSumberId)
  // boleh mengabaikan POLL INTERVAL saja — cooldown/circuit tetap
  // berlaku (perlindungan rate-limit tidak boleh di-bypass).
  const keputusanLewati = alasanLewati(keadaan, sekarang);
  const lewatiDiterapkan =
    keputusanLewati &&
    !(
      opsi.hanyaSumberId === sumber.id &&
      keputusanLewati.alasan === "belum-jatuh-tempo"
    )
      ? keputusanLewati
      : null;
  if (lewatiDiterapkan) {
    hasil.kelas = "dilewati";
    hasil.alasan_lewati = lewatiDiterapkan.pesan;
    hasil.error = `Dilewati: ${lewatiDiterapkan.pesan}`;
    // Circuit terbuka tanpa cooldown di masa depan: tulis cooldown
    // probe (30 mnt) agar sumber tidak dilewati selamanya — probe
    // half-open sesudah cooldown lewat (lihat ketahanan.ts).
    if (
      lewatiDiterapkan.alasan === "circuit-terbuka" &&
      lewatiDiterapkan.sampai
    ) {
      await tulisKeadaan(adapter, sumber.id, {
        cooldown_until: lewatiDiterapkan.sampai,
      });
    }
    try {
      const runLewati = await adapter.buatRun({
        sumber_id: sumber.id,
        sumber_nama: sumber.nama,
        dipicu_oleh: dipicuOleh,
      });
      await tutupRunAman(adapter, runLewati, {
        selesai_pada: new Date(),
        status: "dilewati",
        ditemukan: 0,
        baru: 0,
        duplikat: 0,
        ditolak: 0,
        gagal: 0,
        error: hasil.error,
        kelasGagal: "dilewati",
      });
    } catch {
      // Run 'dilewati' gagal dicatat: lewati tetap berlaku, hasil
      // dilaporkan ke pemanggil tanpa run.
    }
    return hasil;
  }

  let runId: string | null = null;
  try {
    runId = await adapter.buatRun({
      sumber_id: sumber.id,
      sumber_nama: sumber.nama,
      dipicu_oleh: dipicuOleh,
    });
  } catch (err) {
    // Run tidak bisa dibuat: catat sebagai gagal, tanpa run.
    const pesan = err instanceof Error ? err.message : String(err);
    hasil.error = `Gagal membuat baris run: ${pesan}`;
    hasil.gagal = 1;
    hasil.kelas = "unavailable";
    return hasil;
  }

  // 1. Ambil feed — DENGAN retry per-sumber (P2-3 / N-S5): satu sumber
  // yang gagal sementara (GDELT 429, 5xx, gangguan jaringan) dicoba
  // ulang sendiri (maks 3x, backoff eksponensial, hormati Retry-After)
  // tanpa mengulang seluruh job. Bila fetch gagal total -> run 'gagal',
  // lanjut sumber lain.
  let items: ItemMentah[] = [];
  let httpStatus = 0;
  // ETag / Last-Modified hasil fetch ini (bila server mengirimnya);
  // bila tidak, pertahankan nilai lama agar conditional GET berikut
  // tetap memakai yang terakhir diketahui.
  let etagBaru: string | null = keadaan.etag;
  let lastModifiedBaru: string | null = keadaan.lastModified;
  let tidakBerubah = false;
  try {
    const ambilSekali = async (): Promise<{
      items: ItemMentah[];
      httpStatus: number;
      etag?: string | null;
      lastModified?: string | null;
      tidakBerubah?: boolean;
    }> => {
      if (sumber.jenis === "api") {
        // Satu-satunya sumber API saat ini: GDELT DOC API.
        // Topik per sumber (P3-3): kolom DB sumber.topik_gdelt dulu,
        // lalu peta opsi.topikGdeltPerSumber (id/nama), lalu opsi
        // topikGdelt, terakhir bawaan "Indonesia".
        const topik =
          (sumber.topik_gdelt ?? "").trim() ||
          opsi.topikGdeltPerSumber?.[sumber.id]?.trim() ||
          opsi.topikGdeltPerSumber?.[sumber.nama]?.trim() ||
          opsi.topikGdelt?.trim() ||
          "Indonesia";
        const gdelt = await fetchGdelt(topik, {
          maxRecords: 25,
          timeoutMs: 30000,
          fetchFn: opsi.fetchFn,
          etag: keadaan.etag,
          lastModified: keadaan.lastModified,
        });
        return {
          items: gdelt.items,
          httpStatus: gdelt.httpStatus,
          etag: gdelt.etag,
          lastModified: gdelt.lastModified,
          tidakBerubah: gdelt.tidakBerubah,
        };
      } else if (sumber.jenis === "rss") {
        const rss = await fetchRss(sumber.url, {
          timeoutMs,
          fetchFn: opsi.fetchFn,
          lewatiAllowlist: opsi.lewatiAllowlistFeed,
          etag: keadaan.etag,
          lastModified: keadaan.lastModified,
        });
        return {
          items: rss.items,
          httpStatus: rss.httpStatus,
          etag: rss.etag,
          lastModified: rss.lastModified,
          tidakBerubah: rss.tidakBerubah,
        };
      }
      throw new Error(`Jenis sumber tidak didukung: ${sumber.jenis}`);
    };
    const { nilai, percobaan } = await cobaUlang(ambilSekali, {
      percobaanMaks: 3,
      jedaAwalMs: 1000,
      // v27: 429 dengan Retry-After besar (>10 dtk) tidak diulang
      // tidur di dalam run (cobaUlang melempar cepat) — Retry-After
      // diwujudkan sebagai cooldown antar-run (30 mnt–6 jam);
      // tidur sampai 300 dtk × 2 berisiko mendorong route melewati
      // batas waktu serverless dan menggagalkan semua sumber.
      ...(opsi.retry ?? {}),
    });
    items = nilai.items;
    httpStatus = nilai.httpStatus;
    tidakBerubah = nilai.tidakBerubah === true;
    if (nilai.etag) etagBaru = nilai.etag;
    if (nilai.lastModified) lastModifiedBaru = nilai.lastModified;
    hasil.percobaan_fetch = percobaan;
    hasil.tidak_berubah = tidakBerubah;
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    const percobaan = percobaanGalat(err);
    const pesanAkhir =
      percobaan !== null && percobaan > 1
        ? `${pesan} (gagal sesudah ${percobaan} percobaan)`
        : pesan;
    hasil.error = pesanAkhir;
    hasil.gagal = 1;
    hasil.percobaan_fetch = percobaan ?? 1;

    // Klasifikasi galat (Fase 3, butir 5) + failure_count + cooldown:
    // - rate-limited -> cooldown dari Retry-After (min 30 mnt, maks 6 jam).
    // - gagal beruntun >= 3 (kelas apa pun) -> cooldown 30 mnt
    //   (circuit breaker terbuka).
    // - invalid-feed 5x beruntun -> permanently-failed.
    // - redirect-login 5x beruntun -> permanently-failed (v27:
    //   feed yang dialihkan PERMANEN ke halaman masuk = paywall/
    //   mati, bukan gangguan sementara).
    const { kelas, retryAfterDetik } = klasifikasiGalatFetch(err);
    const failureCountBaru = keadaan.failureCount + 1;
    let kelasAkhir: KelasGalat = kelas;
    if (kelas === "invalid-feed" && failureCountBaru >= AMBANG_PERMANEN) {
      kelasAkhir = "permanently-failed";
    }
    if (
      kelasAkhir === "unavailable" &&
      pesanAkhir.includes(PESAN_REDIRECT_LOGIN) &&
      failureCountBaru >= AMBANG_PERMANEN
    ) {
      kelasAkhir = "permanently-failed";
    }
    let cooldownSampai: Date | null = null;
    if (kelasAkhir === "rate-limited") {
      cooldownSampai = hitungCooldownSampai(retryAfterDetik, new Date());
    } else if (failureCountBaru >= AMBANG_CIRCUIT_BREAKER) {
      cooldownSampai = hitungCooldownSampai(undefined, new Date());
    }
    hasil.kelas = kelasAkhir;
    await tulisKeadaan(adapter, sumber.id, {
      terakhir_cek: new Date(),
      failure_count: failureCountBaru,
      cooldown_until: cooldownSampai,
      health_status:
        failureCountBaru >= AMBANG_CIRCUIT_BREAKER ? "gagal" : "peringatan",
    });
    try {
      await tutupRunAman(adapter, runId, {
        selesai_pada: new Date(),
        status: kelasAkhir,
        ditemukan: 0,
        baru: 0,
        duplikat: 0,
        ditolak: 0,
        gagal: 1,
        error: pesanAkhir,
        kelasGagal: kelasAkhir,
      });
      await adapter.perbaruiSumber(sumber.id, {
        terakhir_diambil: new Date(),
        status_terakhir: `gagal: ${pesan}`,
        tambah_item: 0,
      });
    } catch {
      // Kegagalan pencatatan tidak boleh menggagalkan sumber berikut.
    }
    return hasil;
  }

  hasil.ditemukan = items.length;
  const waktuDiambil = new Date();

  // CHECKPOINT (Fase 3, butir 7): tulis terakhir_cek + failure_count
  // (nilai saat ini) + ETag SEBELUM memproses item — bila proses
  // crash di tengah item, jejak pengambilan tetap ada dan run
  // berikut tidak mengulang dari nol tanpa jejak.
  await tulisKeadaan(adapter, sumber.id, {
    terakhir_cek: waktuDiambil,
    failure_count: keadaan.failureCount,
    etag: etagBaru,
    last_modified: lastModifiedBaru,
  });

  // 304 Not Modified: feed tidak berubah — 0 item baru adalah HASIL
  // YANG DIHARAPKAN, bukan basi. Lewati pemeriksaan basi + loop item.
  if (tidakBerubah) {
    hasil.kelas = "selesai";
    try {
      await tutupRunAman(adapter, runId, {
        selesai_pada: new Date(),
        status: "selesai",
        ditemukan: 0,
        baru: 0,
        duplikat: 0,
        ditolak: 0,
        gagal: 0,
        error: null,
        kelasGagal: null,
      });
      await adapter.perbaruiSumber(sumber.id, {
        terakhir_diambil: new Date(),
        status_terakhir: `ok HTTP 304 (tidak berubah), ETag dipertahankan`,
        tambah_item: 0,
      });
    } catch {
      // Pencatatan run gagal: hasil hitungan tetap dilaporkan.
    }
    await tulisKeadaan(adapter, sumber.id, {
      failure_count: 0,
      cooldown_until: null,
      health_status: "sehat",
      last_success_at: new Date(),
      etag: etagBaru,
      last_modified: lastModifiedBaru,
    });
    return hasil;
  }

  // Deteksi sumber basi (P1-6 / N-T4): feed 0 item dari sumber yang
  // biasanya produktif = anomali (feed berubah format / sumber mati),
  // bukan sukses penuh. "Biasanya produktif" = ada item baru dalam
  // 7 hari terakhir. Run ditandai 'sebagian' + peringatan di bawah.
  if (items.length === 0 && adapter.jumlahItemBaruSejak) {
    try {
      const tujuhHariLalu = new Date(
        waktuDiambil.getTime() - JENDELA_PRODUKTIF_MS,
      );
      const jumlahBaru = await adapter.jumlahItemBaruSejak(
        sumber.id,
        tujuhHariLalu,
      );
      if (jumlahBaru > 0) {
        hasil.peringatan_basi =
          `0 item — sumber biasanya produktif (${jumlahBaru} item baru ` +
          `7 hari terakhir); kemungkinan feed berubah format atau sumber mati`;
      }
    } catch {
      // Gagal memeriksa riwayat: jangan mengubah status run.
    }
  }

  // Kandidat dedup lunak tahap-2 (P1-7): muat SEKALI per run (bukan
  // per item) — judul 48 jam terakhir. Gagal memuat = dedup lunak
  // dilewati, dedup hash tetap jalan.
  let kandidatJudul: Array<{
    id: string;
    judul: string;
    sumber_id: string | null;
    waktu_terbit_asli: string | null;
    waktu_diambil: string;
  }> = [];
  if (adapter.daftarJudulBaruSejak) {
    try {
      kandidatJudul = await adapter.daftarJudulBaruSejak(
        new Date(waktuDiambil.getTime() - JENDELA_DUPLIKAT_LUNAK_MS),
        500,
      );
    } catch {
      kandidatJudul = [];
    }
  }

  // Jumlah baris yang benar-benar tersimpan untuk sumber ini
  // (baru + disalin_dari + diterbitkan_ulang) — dipakai untuk
  // pf_sources.jumlah_item, agar tidak hanya menghitung 'baru'.
  let disimpan = 0;

  // 2. Proses tiap item secara berurutan (dedup butuh urutan deterministik).
  for (const item of items) {
    try {
      const judul = (item.judul ?? "").trim();
      const url = (item.url ?? "").trim();

      // Aturan validasi: tanpa url/judul valid, url bukan http(s), atau
      // judul < 5 karakter -> ditolak (jangan insert).
      if (!url || !judul || judul.length < PANJANG_JUDUL_MINIMAL || !urlValid(url)) {
        hasil.ditolak += 1;
        continue;
      }

      const hash_url = hashUrl(url);
      const hash_judul = hashJudul(judul);

      // Klasifikasi ringan deterministik (Fase 7b): dihitung SEKALI
      // per item, dipakai di semua jalur simpan di bawah. Disimpan
      // ke metadata sebagai klasifikasi_otomatis ("otomatis, bisa
      // dikoreksi editor") — BUKAN kategori editorial artikel.
      const klasifikasi = klasifikasikanItem({
        judul,
        ringkasan: item.ringkasan ?? "",
        kategoriFeed: item.kategoriFeed,
        metadata: item.metadata,
      });

      // Aturan dedup 0 (Fase 3, butir 8): GUID RSS sebagai kunci
      // dedup tambahan — GUID sama = item sama meski URL/judul
      // berubah (mis. URL diberi parameter baru). Bila adapter
      // tidak menyediakan cariGuid (adapter lama), aturan ini
      // dilewati diam-diam; dedup URL/judul tetap jalan.
      if (item.guid && adapter.cariGuid) {
        try {
          const sudahAdaGuid = await adapter.cariGuid(item.guid);
          if (sudahAdaGuid) {
            hasil.duplikat += 1;
            continue;
          }
        } catch {
          // GUID gagal dibaca: lanjut ke dedup URL/judul.
        }
      }

      // Aturan dedup 1: hash_url sudah ada -> duplikat (jangan insert).
      const sudahAdaUrl = await adapter.cariHashUrl(hash_url);
      if (sudahAdaUrl) {
        hasil.duplikat += 1;
        continue;
      }

      // Aturan dedup 2-4: cocok berdasarkan hash_judul.
      const cocok = await adapter.cariHashJudul(hash_judul);
      const keputusan = tentukanStatusDuplikat({
        sumberId: sumber.id,
        cocok,
        waktuTerbit: item.waktuTerbit,
        waktuDiambil,
      });

      if (keputusan.status === "duplikat") {
        // Judul sama sumber sama + tanggal dekat -> duplikat, jangan insert.
        // Judul sama sumber sama + tanggal jauh -> INSERT sebagai duplikat
        // dengan diterbitkan_ulang = true (jejak penerbitan ulang).
        if (keputusan.diterbitkanUlang) {
          const idTersimpan = await adapter.simpanItem({
            sumber_id: sumber.id,
            run_id: runId,
            url,
            hash_url,
            judul,
            hash_judul,
            ringkasan: item.ringkasan ?? "",
            isi_ringkas: item.isiRingkas ?? "",
            penulis: item.penulis,
            waktu_terbit_asli: item.waktuTerbit,
            waktu_diambil: waktuDiambil,
            status: "duplikat",
            status_verifikasi: "UNCONFIRMED",
            disalin_dari_id: null,
            diterbitkan_ulang: true,
            alasan: keputusan.alasan,
            metadata: {
              ...(item.metadata ?? {}),
              guid: item.guid,
              gambar_url: item.gambarUrl,
              kategori_feed: item.kategoriFeed,
              klasifikasi_otomatis: klasifikasi,
            },
          });
          if (typeof idTersimpan === "string" && idTersimpan) {
            (hasil.itemIdsTersimpan ??= []).push(idTersimpan);
          }
          disimpan += 1;
        }
        hasil.duplikat += 1;
        continue;
      }

      if (keputusan.status === "disalin_dari") {
        // Judul identik dari penerbit lain -> simpan sebagai salinan,
        // BUKAN sebagai sumber independen.
        const idTersimpan = await adapter.simpanItem({
          sumber_id: sumber.id,
          run_id: runId,
          url,
          hash_url,
          judul,
          hash_judul,
          ringkasan: item.ringkasan ?? "",
          isi_ringkas: item.isiRingkas ?? "",
          penulis: item.penulis,
          waktu_terbit_asli: item.waktuTerbit,
          waktu_diambil: waktuDiambil,
          status: "disalin_dari",
          status_verifikasi: "UNCONFIRMED",
          disalin_dari_id: keputusan.disalinDariId,
          diterbitkan_ulang: false,
          alasan: keputusan.alasan,
          metadata: {
            ...(item.metadata ?? {}),
            guid: item.guid,
            gambar_url: item.gambarUrl,
            kategori_feed: item.kategoriFeed,
            klasifikasi_otomatis: klasifikasi,
          },
        });
        if (typeof idTersimpan === "string" && idTersimpan) {
          (hasil.itemIdsTersimpan ??= []).push(idTersimpan);
        }
        disimpan += 1;
        hasil.duplikat += 1;
        continue;
      }

      // Aturan 5: selain itu -> item baru. Sebelum disimpan, jalankan
      // dedup lunak tahap-2 (P1-7): bila judulnya mirip (>= 0,8) dengan
      // item 48 jam terakhir, item TETAP disimpan sebagai 'baru' —
      // hanya ditandai kandidat di metadata + alasan + log run, untuk
      // review manusia. Tidak ada penghapusan otomatis di sini.
      let lunak: ReturnType<typeof cariKandidatDuplikatLunak> | null = null;
      if (kandidatJudul.length > 0) {
        lunak = cariKandidatDuplikatLunak({
          judul,
          sumberId: sumber.id,
          waktuDiambil,
          kandidat: kandidatJudul,
        });
      }
      const metadataBaru: Record<string, unknown> = {
        ...(item.metadata ?? {}),
        guid: item.guid,
        gambar_url: item.gambarUrl,
        kategori_feed: item.kategoriFeed,
        klasifikasi_otomatis: klasifikasi,
      };
      let alasanBaru: string | null = null;
      if (lunak && lunak.kandidat && lunak.miripDengan && lunak.tipe) {
        metadataBaru.kandidat_duplikat_lunak = {
          item_id: lunak.miripDengan.id,
          judul_mirip: lunak.miripDengan.judul,
          kemiripan: Math.round(lunak.miripDengan.kemiripan * 1000) / 1000,
          tipe: lunak.tipe,
        };
        alasanBaru = lunak.alasan;
        hasil.duplikat_lunak = (hasil.duplikat_lunak ?? 0) + 1;
        if ((hasil.kandidat_duplikat_lunak ?? []).length < 10) {
          (hasil.kandidat_duplikat_lunak ??= []).push({
            judul,
            judul_mirip: lunak.miripDengan.judul,
            kemiripan: Math.round(lunak.miripDengan.kemiripan * 1000) / 1000,
            tipe: lunak.tipe,
            item_id_mirip: lunak.miripDengan.id,
          });
        }
      }
      const idTersimpanBaru = await adapter.simpanItem({
        sumber_id: sumber.id,
        run_id: runId,
        url,
        hash_url,
        judul,
        hash_judul,
        ringkasan: item.ringkasan ?? "",
        isi_ringkas: item.isiRingkas ?? "",
        penulis: item.penulis,
        waktu_terbit_asli: item.waktuTerbit,
        waktu_diambil: waktuDiambil,
        status: "baru",
        status_verifikasi: "UNCONFIRMED",
        disalin_dari_id: null,
        diterbitkan_ulang: false,
        alasan: alasanBaru,
        metadata: metadataBaru,
      });
      if (typeof idTersimpanBaru === "string" && idTersimpanBaru) {
        (hasil.itemIdsTersimpan ??= []).push(idTersimpanBaru);
      }
      disimpan += 1;
      hasil.baru += 1;
    } catch (err) {
      // Satu item gagal (mis. DB error) tidak boleh menghentikan feed.
      hasil.gagal += 1;
      if (!hasil.error) {
        hasil.error =
          err instanceof Error ? err.message : String(err);
      }
    }
  }

  // 3. Tutup run dengan hitungan nyata + perbarui pf_sources.
  // 'sebagian' bila ada kegagalan item ATAU peringatan basi (P1-6:
  // 0 item dari sumber yang biasanya produktif bukan sukses penuh).
  // 'gagal' bila tidak ada satu pun item tersimpan (galat engine —
  // kelas berat, lihat ketahanan.ts). Kelas hasil disimpan ke
  // kelas_gagal (bila kolom ada) dan ke respons JSON.
  const statusRun =
    hasil.gagal > 0 && hasil.baru + hasil.duplikat === 0
      ? "gagal"
      : hasil.gagal > 0 || hasil.peringatan_basi
        ? "sebagian"
        : "selesai";
  hasil.kelas = statusRun as KelasGalat;
  // Peringatan basi dicatat ke kolom error run agar terlihat di
  // pf_ingestion_runs / dashboard (bukan hanya di respons JSON).
  const errorRun = hasil.error ?? hasil.peringatan_basi ?? null;
  const statusSumber =
    statusRun === "selesai"
      ? `ok HTTP ${httpStatus}, ${items.length} item`
      : hasil.peringatan_basi && hasil.gagal === 0
        ? `basi: HTTP ${httpStatus} — ${hasil.peringatan_basi}`
        : `sebagian: HTTP ${httpStatus}, ${items.length} item, ${hasil.gagal} gagal`;
  try {
    await tutupRunAman(adapter, runId, {
      selesai_pada: new Date(),
      status: statusRun,
      ditemukan: hasil.ditemukan,
      baru: hasil.baru,
      duplikat: hasil.duplikat,
      ditolak: hasil.ditolak,
      gagal: hasil.gagal,
      error: errorRun,
      kelasGagal: statusRun === "selesai" ? null : statusRun,
    });
  } catch {
    // Pencatatan run gagal: hasil hitungan tetap dilaporkan ke pemanggil.
  }
  try {
    await adapter.perbaruiSumber(sumber.id, {
      terakhir_diambil: new Date(),
      status_terakhir: statusSumber,
      tambah_item: disimpan,
    });
  } catch {
    // Sama: kegagalan update sumber tidak mengubah hitungan.
  }
  // Keadaan akhir sukses: failure_count reset, cooldown dihapus,
  // last_success_at diisi (Fase 6). health_status 'peringatan' bila
  // ada peringatan basi, 'sehat' bila tidak.
  await tulisKeadaan(adapter, sumber.id, {
    failure_count: 0,
    cooldown_until: null,
    health_status: hasil.peringatan_basi ? "peringatan" : "sehat",
    last_success_at: new Date(),
    etag: etagBaru,
    last_modified: lastModifiedBaru,
  });

  return hasil;
}

// ---------- Titik masuk utama ----------

// Jalankan ingestion untuk semua sumber aktif. Feed diambil SECARA
// PARALEL (Promise.allSettled) agar total run cepat; satu sumber mati
// tidak menggagalkan sumber lain. Tiap sumber berangkat dengan jeda
// stagger kecil (Fase 3, butir 4) agar tidak menghantam server yang
// sama pada milidetik yang sama.
export async function jalankanIngestion(
  adapter: IngestionAdapter,
  sumber: SumberIngestion[],
  opsi: OpsiIngestion = {},
): Promise<HasilIngestion> {
  const daftar = sumber
    .filter((s) => s.aktif)
    .filter((s) => !opsi.hanyaSumberId || s.id === opsi.hanyaSumberId)
    .sort((a, b) => b.prioritas - a.prioritas);

  const staggerMs = opsi.staggerMs ?? 200;
  const hasilSettled = await Promise.allSettled(
    daftar.map((s, i) =>
      (async () => {
        const jeda = hitungJedaStagger(i, Math.random, staggerMs);
        if (jeda > 0) {
          await new Promise<void>((selesai) => setTimeout(selesai, jeda));
        }
        return prosesSatuSumber(adapter, s, opsi);
      })(),
    ),
  );

  const perSumber: HasilPerSumber[] = [];
  for (let i = 0; i < hasilSettled.length; i++) {
    const settled = hasilSettled[i];
    if (settled.status === "fulfilled") {
      perSumber.push(settled.value);
    } else {
      // Seharusnya tidak terjadi (prosesSatuSumber menangkap error
      // internal), tapi jangan sampai satu sumber menelan seluruh run.
      const s = daftar[i];
      perSumber.push({
        sumber_id: s.id,
        sumber_nama: s.nama,
        ditemukan: 0,
        baru: 0,
        duplikat: 0,
        ditolak: 0,
        gagal: 1,
        kelas: "gagal",
        error:
          settled.reason instanceof Error
            ? settled.reason.message
            : String(settled.reason),
      });
    }
  }

  // Klaster event (Fase 7c, best-effort): kelompokkan item yang
  // TERSIMPAN pada run ini; simpan klaster multi-sumber ke tabel
  // v24 bila adapter mendukungnya. Kegagalan klaster TIDAK PERNAH
  // menggagalkan ingestion — klaster hanya pengelompokan, bukan
  // syarat keberhasilan run.
  const klasterTersimpan: NonNullable<HasilIngestion["klaster"]> = [];
  const semuaIdTersimpan = perSumber.flatMap(
    (h) => h.itemIdsTersimpan ?? [],
  );
  for (const h of perSumber) delete h.itemIdsTersimpan;
  if (
    semuaIdTersimpan.length >= 2 &&
    adapter.bacaItemUntukKlaster &&
    adapter.simpanKlaster
  ) {
    try {
      const baris = await adapter.bacaItemUntukKlaster(semuaIdTersimpan);
      for (const k of kelompokkanKlaster(baris)) {
        try {
          await adapter.simpanKlaster({
            kunci: k.kunci,
            judul: k.judul,
            itemIds: k.item_ids,
          });
          klasterTersimpan.push({
            kunci: k.kunci,
            judul: k.judul,
            jumlah_item: k.item_ids.length,
            jumlah_sumber: k.sumber_ids.length,
          });
        } catch {
          // Satu klaster gagal disimpan: lanjut ke klaster berikut.
        }
      }
    } catch {
      // Klaster gagal total (mis. tabel v24 belum ada): abaikan.
    }
  }

  const total = perSumber.reduce(
    (ak, h) => ({
      ditemukan: ak.ditemukan + h.ditemukan,
      baru: ak.baru + h.baru,
      duplikat: ak.duplikat + h.duplikat,
      ditolak: ak.ditolak + h.ditolak,
      gagal: ak.gagal + h.gagal,
      gagal_berat: ak.gagal_berat,
      per_kelas: ak.per_kelas,
    }),
    {
      ditemukan: 0,
      baru: 0,
      duplikat: 0,
      ditolak: 0,
      gagal: 0,
      gagal_berat: 0,
      per_kelas: {} as Record<string, number>,
    },
  );
  // Hitungan kelas dihitung terpisah (bukan di reduce di atas) agar
  // jelas: gagal_berat = sumber kelas berat, ATAU hasil darurat
  // tanpa kelas yang tetap mencatat gagal (galat engine).
  for (const h of perSumber) {
    if (h.kelas) {
      total.per_kelas[h.kelas] = (total.per_kelas[h.kelas] ?? 0) + 1;
    }
    if (apakahKelasBerat(h.kelas) || (!h.kelas && h.gagal > 0)) {
      total.gagal_berat += 1;
    }
  }

  return { perSumber, total, klaster: klasterTersimpan };
}
