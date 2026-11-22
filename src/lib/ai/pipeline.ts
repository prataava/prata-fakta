// Orkestrator pipeline editorial PRATA FAKTA — 10 LANGKAH PIPELINE
// DETERMINISTIK (aturan tetap + ekstraksi pola), BUKAN 10 agen LLM:
// draf yang dihasilkan adalah draf awal yang disempurnakan Muse
// lewat cron/chat di luar repo dan disetujui editor sebelum terbit.
// Tidak ada pemanggilan model/AI eksternal di dalam kode ini.
// Alur DUA FASE per batch (berurutan, sesuai urutan adapter):
//   Fase 1 (riset): semua item -> research -> source-analysis ->
//     simpan klaim. Klaim SEMUA item harus tersimpan dulu agar fase 2
//     bisa membandingkan klaim antar item.
//   Fase 2 (verifikasi): per item -> verification (sinyal judul
//     identik + sinyal koroborasi klaim) -> simpan evidence +
//     verification record -> (bila VERIFIED/CROSS-CHECKED:
//     summarization -> translation-check -> writing -> quality ->
//     draf artikel -> tautan verification record ke artikel) ->
//     perbarui status item (draf DULU, baru status — P1-2).
//   Langkah `comparison` (P2-5) berjalan DI ANTARA Fase 1 dan
//     Fase 2: membandingkan judul identik + inti klaim antar-item
//     dalam batch memakai ulang verification.ts, dan mencatat
//     hasilnya sebagai satu baris pf_ai_runs (detail.langkah =
//     'comparison'). Perbandingan hanya MEMBACA klaim Fase 1 —
//     keputusan verification per item TIDAK berubah.
//   CATATAN CHECK (P2-5): kolom pf_ai_runs.agen dibatasi CHECK
//     (v4, diperketat v8: pf_ai_runs_agen_check_v8) ke 13 nilai —
//     'comparison' TIDAK termasuk. Karena itu baris comparison
//     dicatat dengan agen 'fact_verification' (perbandingan adalah
//     bagian dari verifikasi itu sendiri) + detail.langkah =
//     'comparison'. Nama agen harfiah 'comparison' butuh migrasi
//     aditif yang melonggarkan CHECK — di luar mandat paket ini,
//     JANGAN diubah diam-diam (laporkan ke koordinator).
//   CATATAN CHECK v22 (integrasi Global News 24/7, 17 Nov 2026):
//     migrasi v22 MELONGGARKAN check itu menjadi 31 nilai
//     (pf_ai_runs_agen_check_v22), termasuk 'comparison',
//     'quality_check', dan 'analysis'. Langkah baru di bawah
//     (analysis + quality_check) mencatat agen HARFIAH itu lewat
//     jalankanLangkahAgenBaru; bila DB masih pra-v22, insert
//     ditolak CHECK 23514 dan helper jatuh ke pola lama (agen v8
//     + detail.langkah) — tanpa mengubah arti baris 'comparison'
//     lama, yang tetap 'fact_verifikasi' + langkah 'comparison'.
// SETIAP langkah pipeline dibungkus try/catch dan menulis pf_ai_runs
// (berhasil/gagal/dilewati + durasi_ms + error/alasan). Satu langkah
// gagal tidak menggagalkan item lain; satu item gagal tidak
// menggagalkan antrean.
// Catatan jujur: langkah-langkah di sini deterministik (aturan tetap +
// ekstraksi pola). Tidak ada LLM di dalam kode ini — draf yang
// dihasilkan adalah draf awal yang disempurnakan Muse lewat cron/chat
// dan disetujui editor sebelum terbit.
import { hashJudul } from "../ingestion/dedup.ts";
import type {
  AgenAi,
  AiAdapter,
  ArahBukti,
  DipicuOleh,
  InputJenisAi,
  RawItemAntrean,
  SimpanArtikelInput,
} from "./types.ts";
import { intiKlaim, telitiItem, cariKalimatKutipan, formatKlaimUntukMuse } from "./research.ts";
import type { KlaimTerekstrak } from "./research.ts";
import {
  analisisSumber,
  skorKredibilitas,
  tierDariPrioritas,
} from "./source-analysis.ts";
import {
  daftarSumberIndependen,
  gabungkanKeputusan,
  tentukanKeputusanDariKlaim,
  tentukanKeputusanVerifikasi,
} from "./verification.ts";
import type {
  ItemSerupaVerifikasi,
  KlaimKoroborasi,
} from "./verification.ts";
import { buatRingkasan } from "./summarization.ts";
import { periksaTerjemahan, cobaTerjemahkanJudul } from "./translation.ts";
import { susunDrafArtikel } from "./writing.ts";
import { turunkanKutipanTanpaBukti } from "./writing.ts";
import type { SumberDraf } from "./writing.ts";
import { periksaKualitasDraf } from "./quality.ts";
import type { HasilKualitas } from "./quality.ts";
// Integrasi Global News 24/7 (17 Nov 2026): quality_check +
// analysis (Fase 9, Worker H) + auto-publish Tier-1 (Fase 11,
// Worker E). Impor data.ts/kendali.ts/auto-publish di sini
// statis — tidak ada siklus (tidak satu pun modul itu mengimpor
// pipeline.ts); kegagalan baca/panggil di titik wiring selalu
// ditangkap try/catch agar tidak menggagalkan item.
import {
  periksaKualitasKlaimDraf,
  type BuktiKlaim,
} from "./quality-check.ts";
import { sintesis5W1H } from "./analysis.ts";
import { hitungFactScore } from "../fact-score.ts";
import {
  getJumlahKoreksiTerbuka,
  getPerbandinganSumber,
} from "../data.ts";
import { getFlagsLayanan } from "../admin/kendali.ts";
import {
  nilaiFlagAutoPublish,
  terbitkanOtomatis,
  type HasilAutoPublish,
} from "../admin/auto-publish.ts";
import { buatAdminAdapter } from "../admin/supabase-adapter.ts";
import { hitungTren } from "./trends.ts";
import type { TopikTren } from "./trends.ts";
import { entriBriefDariDraf, susunBrief } from "./brief.ts";
import type { EntriBrief } from "./brief.ts";

export interface OpsiPipeline {
  limit?: number;
  hanyaItemId?: string;
  dipicu_oleh?: DipicuOleh;
  fetchFn?: typeof fetch;
  // Job rekonsiliasi (P1-2) di akhir run: perbaiki item VERIFIED
  // tanpa artikel + artikel tanpa tautan verifikasi. Bawaan true;
  // isi false untuk menonaktifkannya pada satu run.
  rekonsiliasi?: boolean;
}

export interface HasilRekonsiliasi {
  didukung: boolean;
  diperiksa: number;
  draf_dibuat: number;
  tautan_diperbaiki: number;
  tersisa: number;
}

export interface HasilPipeline {
  diproses: number;
  draf: number;
  terverifikasi: number;
  cross_checked: number;
  developing: number;
  unconfirmed: number;
  dilewati: number;
  gagal: number;
  /** Item yang mencapai terminal 'DITOLAK' karena gagal
   *  quality_check 3x berturut-turut (v29) — subset dari `gagal`. */
  ditolak_qc: number;
  /** Rincian per item yang dihitung `gagal` (22 Nov 2026, akar
   *  run #43): id + judul + tahap + pesan galat, agar respons
   *  pipeline — yang dicetak utuh di log GitHub Actions —
   *  MENAMAI item yang gagal, bukan hanya agregat `gagal=N`.
   *  Dibatasi 20 entri pertama; teks dipotong agar respons
   *  tetap kecil. */
  gagal_detail?: GagalDetailItem[];
  rekonsiliasi?: HasilRekonsiliasi;
  /** Mode antrean run ini ("terbaru" bawaan, "terlama" bila mode
   *  kejar aktif — P2-8). */
  modeAntrean?: "terbaru" | "terlama";
}

export interface OpsiBrief {
  tanggal?: string;
  dipicu_oleh?: DipicuOleh;
  // Entri artikel/draf VERIFIED/CROSS-CHECKED dari pemanggil (mis.
  // API route yang membaca pf_articles). Bila kurang dari 5, dilengkapi
  // entri UNCONFIRMED dari antrean — ditandai jujur statusnya.
  entri?: EntriBrief[];
  /** v29: bila pemanggil TIDAK menyediakan entri, ambil HANYA
   *  artikel TERBIT 24 jam terakhir (tanpa pengisian dari
   *  antrean UNCONFIRMED). Bawaan false = perilaku lama (draf
   *  terbaru + antrean UNCONFIRMED, status 'draft'). */
  dariArtikelTerbit?: boolean;
  /** v29: terbitkan brief langsung (hanya bermakna bila
   *  dariArtikelTerbit=true dan ada >=1 entri — semua entri
   *  adalah artikel yang sudah terbit, jadi tidak ada klaim
   *  baru yang lolos tanpa review). Bawaan false. */
  terbitkanLangsung?: boolean;
}

export interface HasilBrief {
  tanggal: string;
  briefId: string;
  jumlahEntri: number;
  jumlahIsu: number;
  /** v29: true bila brief ini diterbitkan (bukan draf). */
  diterbitkan: boolean;
  /** v29: judul entri (maks 3 pertama) — dipakai pemanggil
   *  untuk membangun payload push Daily Brief. */
  judulEntri: string[];
}

// ---------- Util ----------

// Tanggal hari ini dalam WIB (Asia/Jakarta), format YYYY-MM-DD.
export function tanggalWibHariIni(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

interface HasilLangkah<T> {
  nilai: T;
  detail?: Record<string, unknown>;
  outputRef?: string;
  // Bila true, run ditutup 'dilewati' (bukan 'berhasil').
  dilewati?: boolean;
  alasanDilewati?: string;
}

// Jalankan satu langkah pipeline dengan pencatatan pf_ai_runs:
// catat 'berjalan' -> jalankan fn -> tutup 'berhasil'/'dilewati';
// bila fn melempar -> tutup 'gagal' lalu lempar ulang.
async function jalankanLangkah<T>(
  adapter: AiAdapter,
  agen: AgenAi,
  inputRef: string,
  inputJenis: InputJenisAi,
  dipicuOleh: DipicuOleh,
  fn: () => Promise<HasilLangkah<T>>,
): Promise<T> {
  const runId = await adapter.catatRun({
    agen,
    input_ref: inputRef,
    input_jenis: inputJenis,
    dipicu_oleh: dipicuOleh,
  });
  const mulai = Date.now();
  try {
    const hasil = await fn();
    await adapter.tutupRun(runId, {
      status: hasil.dilewati ? "dilewati" : "berhasil",
      error: hasil.dilewati ? hasil.alasanDilewati : undefined,
      durasi_ms: Date.now() - mulai,
      output_ref: hasil.outputRef,
      detail: hasil.detail,
    });
    return hasil.nilai;
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    try {
      await adapter.tutupRun(runId, {
        status: "gagal",
        error: pesan,
        durasi_ms: Date.now() - mulai,
      });
    } catch {
      // Kegagalan pencatatan run tidak boleh menelan error asli.
    }
    throw err;
  }
}

// Catat satu run 'dilewati' tanpa menjalankan langkah (mis. draf
// dilewati karena keputusan belum terverifikasi).
async function catatDilewati(
  adapter: AiAdapter,
  agen: AgenAi,
  inputRef: string,
  inputJenis: InputJenisAi,
  dipicuOleh: DipicuOleh,
  alasan: string,
): Promise<void> {
  try {
    const runId = await adapter.catatRun({
      agen,
      input_ref: inputRef,
      input_jenis: inputJenis,
      dipicu_oleh: dipicuOleh,
    });
    await adapter.tutupRun(runId, {
      status: "dilewati",
      error: alasan,
      durasi_ms: 0,
    });
  } catch {
    // Pencatatan dilewati bersifat informatif; kegagalannya tidak
    // boleh menggagalkan pemrosesan item.
  }
}

// Jalankan satu langkah dengan agen BARU (v22) + fallback pra-v22
// (integrasi Global News 24/7, 17 Nov 2026).
//   - Coba dulu agen harfiah (mis. 'quality_check' / 'analysis',
//     diizinkan CHECK pf_ai_runs_agen_check_v22, 31 nilai).
//   - Bila insert pf_ai_runs ditolak CHECK pra-v22 (kode 23514 /
//     "violates check constraint"), catat ulang dengan agen lama
//     yang diizinkan CHECK v8 + detail.langkah = nama langkah
//     (pola 'comparison': 'fact_verification' + langkah).
//   - Galat LAIN (termasuk galat dari fn itu sendiri, mis. draf
//     gagal quality check) TIDAK pernah memicu fallback — fn
//     murni di sini tidak melempar galat CHECK, jadi pencocokan
//     pesan di bawah hanya menangkap penolakan CHECK di catatRun.
//     Fallback menjalankan ulang fn (murni, idempotent); run
//     harfiah yang gagal dicatat TIDAK PERNAH dibuat (catatRun
//     melempar sebelum fn jalan), jadi tidak ada baris ganda.
async function jalankanLangkahAgenBaru<T>(
  adapter: AiAdapter,
  agenLiteral: AgenAi,
  agenFallback: AgenAi,
  langkah: string,
  inputRef: string,
  inputJenis: InputJenisAi,
  dipicuOleh: DipicuOleh,
  fn: () => Promise<HasilLangkah<T>>,
): Promise<T> {
  try {
    return await jalankanLangkah(
      adapter,
      agenLiteral,
      inputRef,
      inputJenis,
      dipicuOleh,
      fn,
    );
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    const ditolakCheck =
      /violates check constraint|23514|pf_ai_runs_agen_check/i.test(pesan);
    if (!ditolakCheck) throw err;
    return await jalankanLangkah(
      adapter,
      agenFallback,
      inputRef,
      inputJenis,
      dipicuOleh,
      async () => {
        const hasil = await fn();
        return {
          ...hasil,
          detail: { ...(hasil.detail ?? {}), langkah },
        };
      },
    );
  }
}

// ---------- Konteks item antar-fase ----------

interface KonteksItem {
  item: RawItemAntrean;
  klaimTersimpan: KlaimTerekstrak[];
  idKlaim: string[];
  tierUtama: number;
  /** Teks halaman sumber hasil fetch research ("" bila fetch
   *  gagal) — dipakai mencari kalimat kutipan evidence (v29):
   *  klaim yang diekstrak dari halaman TIDAK PERNAH bisa
   *  ditemukan kalimatnya bila pencarian hanya memakai
   *  ringkasan (akar sistematis kutipan_tanpa_bukti). */
  teksHalaman: string;
}

// ---------- Aturan arah bukti deterministik (v29, Fitur 4) ----------
// Dipakai tulisBukti saat menulis pf_evidence — BUKAN LLM:
//   kutipan verbatim ditemukan -> 'mendukung' (kalimat pendukung
//     benar-benar ada di sumber);
//   TIDAK ditemukan -> 'netral' (sumber menyebut klaim tapi sikap
//     verbatim tidak terkonfirmasi — JUJUR, bukan 'mendukung'
//     buta seperti sebelum v29);
//   'menentang' HANYA dari label manual redaksi
//     (/admin/label-sikap) — TIDAK PERNAH otomatis.
// Murni (tanpa I/O) agar bisa diuji baterai.
export function tentukanArahBukti(
  kutipan: string | null | undefined,
): ArahBukti {
  return kutipan && kutipan.trim().length > 0 ? "mendukung" : "netral";
}

/** Satu entri rincian kegagalan per item (lihat HasilPipeline). */
export interface GagalDetailItem {
  item_id: string;
  judul: string;
  tahap: string;
  error: string;
  /**
   * Hitungan gagal quality_check berturut-turut item ini (katup
   * v29 tolak-setelah-3) — hanya diisi untuk tahap
   * "quality_check". `null` = adapter menghitung tetapi counter
   * TIDAK tersedia (kolom `qc_gagal_berturut_turut` migrasi v29
   * belum diterapkan di produksi → katup fail-open); field
   * ABSEN = adapter tidak punya method pencatatan. Fail-open:
   * nilai ini tidak pernah mengubah hasil run — hanya membuat
   * status katup TERAMATI di log run berikutnya.
   */
  qc_gagal_berturut_turut?: number | null;
}

const BATAS_GAGAL_DETAIL = 20;

// ---------- Pencatatan kegagalan per item ----------
// SATU-SATUNYA tempat `hasil.gagal` bertambah: setiap item yang
// gagal SELALU dicatat di sini (id, judul, tahap, pesan galat)
// agar respons pipeline — yang dicetak utuh di log GitHub Actions
// (`echo "Respons pipeline panggilan $PANGGILAN: ..."`) —
// MENAMAI item yang gagal, bukan hanya agregat `gagal=N`
// (akar run #43: 2 item gagal di panggilan 3 tanpa satu pun
// jejak identitasnya di log). Dibatasi 20 entri pertama;
// judul dipotong 120 karakter, pesan galat 300 karakter.
function catatGagal(
  hasil: HasilPipeline,
  item: RawItemAntrean,
  tahap: string,
  error?: unknown,
  qcGagalBerturutTurut?: number | null,
): void {
  hasil.gagal += 1;
  hasil.gagal_detail ??= [];
  if (hasil.gagal_detail.length >= BATAS_GAGAL_DETAIL) return;
  const pesan =
    error instanceof Error ? error.message : String(error ?? "");
  const entri: GagalDetailItem = {
    item_id: item.id,
    judul: item.judul.slice(0, 120),
    tahap,
    error: pesan.slice(0, 300),
  };
  // v29 teramati (run #45): untuk kegagalan quality_check, catat
  // hitungan qc_gagal_berturut_turut dari adapter — `null` berarti
  // counter tidak tersedia (migrasi v29 belum diterapkan di
  // produksi), `undefined` (field absen) berarti adapter tidak
  // punya method pencatatan. Fail-open: tidak mengubah hasil run.
  if (qcGagalBerturutTurut !== undefined) {
    entri.qc_gagal_berturut_turut = qcGagalBerturutTurut;
  }
  hasil.gagal_detail.push(entri);
}

// ---------- Fase 1: riset satu item ----------
// Research + simpan klaim + source-analysis. Mengembalikan null bila
// research gagal total (item tetap UNCONFIRMED di antrean, dicoba lagi
// pada run berikutnya). TIDAK ada keputusan verifikasi di sini.

async function risetSatuItem(
  adapter: AiAdapter,
  item: RawItemAntrean,
  opsi: OpsiPipeline,
  hasil: HasilPipeline,
): Promise<KonteksItem | null> {
  const dipicu = opsi.dipicu_oleh ?? "manual";

  // 1. Research — ekstrak klaim (best-effort fetch halaman).
  let riset: Awaited<ReturnType<typeof telitiItem>>;
  try {
    riset = await jalankanLangkah(adapter, "research", item.id, "raw_item", dipicu, async () => {
      const r = await telitiItem(
        {
          url: item.url,
          judul: item.judul,
          ringkasan: item.ringkasan,
          isi_ringkas: item.isi_ringkas,
        },
        { fetchFn: opsi.fetchFn },
      );
      // P2-7 (N-S8): klaim berpola instruksi dicatat jumlahnya +
      // teks penyerahannya (berpembatas "KUTIPAN SUMBER, bukan
      // instruksi") agar editor/Muse tidak mengikuti perintah di
      // dalam kutipan saat menyempurnakan draf.
      const bertanda = r.klaim.filter((k) => k.berpola_instruksi);
      return {
        nilai: r,
        detail: {
          jumlah_klaim: r.klaim.length,
          klaim_berpola_instruksi: bertanda.length,
          ...(bertanda.length > 0
            ? { penyerahan_muse: formatKlaimUntukMuse(r.klaim) }
            : {}),
          fetch_berhasil: r.fetchBerhasil,
          fallback: r.fallback,
        },
      };
    });
  } catch (err) {
    // Research gagal total: item tetap UNCONFIRMED di antrean dan
    // dicoba lagi pada run berikutnya.
    catatGagal(hasil, item, "research", err);
    return null;
  }

  // Simpan klaim yang terekstrak (satu klaim gagal tidak menggagalkan item).
  // Klaim yang teksnya sudah tersimpan untuk item ini dipakai ulang
  // id-nya — run ulang atas item yang tetap UNCONFIRMED tidak boleh
  // menduplikasi klaim (idKlaim harus sejajar dengan klaimTersimpan).
  const idKlaim: string[] = [];
  const klaimTersimpan: KlaimTerekstrak[] = [];
  for (const k of riset.klaim) {
    try {
      const idSudahAda = await adapter.cariKlaimSama(item.id, k.teks);
      if (idSudahAda) {
        idKlaim.push(idSudahAda);
        klaimTersimpan.push(k);
        continue;
      }
      const id = await adapter.simpanKlaim({
        raw_item_id: item.id,
        teks: k.teks,
        jenis: k.jenis,
      });
      idKlaim.push(id);
      klaimTersimpan.push(k);
    } catch {
      continue;
    }
  }

  // 2. Source analysis — tier + skor dari prioritas sumber.
  // Gagal membaca sumber -> fallback tier 3 (skor 60), lanjut.
  let tierUtama = 3;
  try {
    const sumber = await jalankanLangkah(
      adapter,
      "source_analysis",
      item.id,
      "raw_item",
      dipicu,
      async () => {
        const s = item.sumber_id
          ? await adapter.ambilSumber(item.sumber_id)
          : null;
        const analisis = analisisSumber({
          nama: s?.nama ?? item.sumber_nama,
          prioritas: s?.prioritas ?? item.sumber_prioritas,
        });
        return {
          nilai: analisis,
          detail: {
            tier: analisis.tier,
            skor: analisis.skor,
            sumber: s?.nama ?? item.sumber_nama,
          },
        };
      },
    );
    tierUtama = sumber.tier;
  } catch {
    tierUtama = 3;
  }

  return {
    item,
    klaimTersimpan,
    idKlaim,
    tierUtama,
    teksHalaman: riset.teksHalaman,
  };
}
// ---------- Fase 2: verifikasi + draf satu item ----------
// Dijalankan SETELAH fase 1 selesai untuk semua item, agar
// koroborasi klaim bisa melihat klaim item lain dalam batch yang sama.

async function verifikasiSatuItem(
  adapter: AiAdapter,
  ctx: KonteksItem,
  opsi: OpsiPipeline,
  hasil: HasilPipeline,
): Promise<void> {
  const { item, klaimTersimpan, idKlaim, tierUtama, teksHalaman } = ctx;
  const dipicu = opsi.dipicu_oleh ?? "manual";

  // 3. Verification — dua sinyal (judul identik + koroborasi klaim).
  const itemUtama: ItemSerupaVerifikasi = {
    id: item.id,
    sumber_id: item.sumber_id,
    url: item.url,
    judul: item.judul,
    ringkasan: item.ringkasan,
    waktu_terbit_asli: item.waktu_terbit_asli,
    disalin_dari_id: item.disalin_dari_id,
  };
  // 3a. Kelompok judul identik.
  let serupa: Awaited<ReturnType<AiAdapter["ambilItemSerupa"]>> = [];
  try {
    serupa = await adapter.ambilItemSerupa(hashJudul(item.judul), item.id);
  } catch {
    serupa = [];
  }
  // Peta tier per sumber_id + peta item untuk penelusuran rantai
  // disalin_dari (dipakai kedua sinyal verifikasi).
  const tierPerSumber = new Map<string, number>();
  const petaItem = new Map<string, ItemSerupaVerifikasi>();
  petaItem.set(itemUtama.id, itemUtama);
  for (const s of serupa) {
    petaItem.set(s.id, {
      id: s.id,
      sumber_id: s.sumber_id,
      url: s.url,
      judul: s.judul,
      ringkasan: s.ringkasan,
      waktu_terbit_asli: s.waktu_terbit_asli,
      disalin_dari_id: s.disalin_dari_id,
    });
  }
  const sumberIds = new Set<string>();
  if (item.sumber_id) sumberIds.add(item.sumber_id);
  for (const s of serupa) if (s.sumber_id) sumberIds.add(s.sumber_id);
  for (const sid of sumberIds) {
    try {
      const s = await adapter.ambilSumber(sid);
      if (s) tierPerSumber.set(sid, tierDariPrioritas(s.prioritas));
    } catch {
      // Sumber tak terbaca -> tier default 3 di verification.ts.
    }
  }
  if (item.sumber_id && !tierPerSumber.has(item.sumber_id)) {
    // Sumber utama tak terbaca lewat ambilSumber: pakai tier dari
    // langkah source-analysis (dihitung dari prioritas antrean).
    tierPerSumber.set(item.sumber_id, tierUtama);
  }

  const verifikasiJudul = await jalankanLangkah(
    adapter,
    "fact_verification",
    item.id,
    "raw_item",
    dipicu,
    async () => {
      const v = tentukanKeputusanVerifikasi(itemUtama, serupa, tierPerSumber);
      return {
        nilai: v,
        detail: {
          keputusan: v.keputusan,
          sumber_independen: v.sumberIndependen,
          jumlah_item: v.jumlahItem,
          tier1: v.jumlahTier1,
          item_24j: v.item24Jam,
        },
      };
    },
  );

  // 3b. Koroborasi klaim — cari klaim lain yang memuat inti klaim
  // distintif item ini (angka/kutipan), dari item lain mana pun.
  const klaimDenganInti = klaimTersimpan.map((k) => ({
    teks: k.teks,
    jenis: k.jenis,
    inti: intiKlaim(k),
  }));
  const koroborasi: KlaimKoroborasi[] = [];
  for (const k of klaimDenganInti) {
    if (!k.inti) continue;
    let cocok: Awaited<ReturnType<AiAdapter["cariKlaimSerupa"]>> = [];
    try {
      cocok = await adapter.cariKlaimSerupa(k.inti, item.id, 20);
    } catch {
      continue;
    }
    for (const c of cocok) {
      koroborasi.push({
        klaimId: c.id,
        inti: k.inti,
        jenis: c.jenis,
        teksKlaim: c.teks,
        itemId: c.raw_item_id,
        sumberId: c.sumber_id,
        judul: c.judul_item,
        url: c.url_item,
        ringkasan: c.ringkasan_item,
        waktuTerbitAsli: c.waktu_terbit_asli,
        disalinDariId: c.disalin_dari_id,
      });
      if (!petaItem.has(c.raw_item_id)) {
        petaItem.set(c.raw_item_id, {
          id: c.raw_item_id,
          sumber_id: c.sumber_id,
          url: c.url_item,
          judul: c.judul_item,
          ringkasan: c.ringkasan_item,
          waktu_terbit_asli: c.waktu_terbit_asli,
          disalin_dari_id: c.disalin_dari_id,
        });
      }
      if (c.sumber_id && !tierPerSumber.has(c.sumber_id)) {
        try {
          const s = await adapter.ambilSumber(c.sumber_id);
          if (s) tierPerSumber.set(c.sumber_id, tierDariPrioritas(s.prioritas));
        } catch {
          // Sumber tak terbaca -> tier default 3.
        }
      }
    }
  }
  const verifikasiKlaim = tentukanKeputusanDariKlaim(
    itemUtama,
    klaimDenganInti,
    koroborasi,
    tierPerSumber,
    petaItem,
  );

  // Gabung kedua sinyal (yang lebih kuat menang). Tanpa klaim
  // tersimpan, keputusan tidak punya dasar: paksa UNCONFIRMED.
  const keputusanAkhir =
    klaimTersimpan.length === 0
      ? "UNCONFIRMED"
      : verifikasiKlaim.keputusan
        ? gabungkanKeputusan(
            verifikasiJudul.keputusan,
            verifikasiKlaim.keputusan,
          )
        : verifikasiJudul.keputusan;
  const alasanAkhir =
    klaimTersimpan.length === 0
      ? "Tidak ada klaim yang dapat diekstrak dari item ini — tetap UNCONFIRMED."
      : verifikasiKlaim.keputusan
        ? `Sinyal judul: ${verifikasiJudul.alasan} Sinyal klaim: ${verifikasiKlaim.alasan}`
        : verifikasiJudul.alasan;

  // Evidence — per klaim, hanya dari sumber yang benar-benar memuat
  // klaim itu:
  //   - klaim 'fakta' (judul): sumber independen kelompok judul.
  //   - klaim 'angka'/'kutipan': koroborator inti klaim itu.
  //   - klaim lain: hanya sumber item sendiri.
  // Semua klaim juga mendapat evidence dari sumber item sendiri.
  // P2-1 (N-S1): "kutipan" evidence HARUS kalimat sumber yang
  // benar-benar memuat inti klaim (cariKalimatKutipan). Bila tidak
  // ditemukan, evidence ditulis TANPA kutipan + penanda di bukti
  // verification record (kolom penanda di pf_evidence adalah
  // follow-up migrasi v13).
  // P2-2 (N-S2): hitung jumlahEvidenceIndependen (evidence dari
  // sumber independen — self-evidence tidak dihitung).
  // P2-10 (N-S12): simpanBukti menduplikasi (klaim_id, sumber_url)
  // — baris yang dilewati TIDAK dihitung sebagai evidence baru.
  const independenJudul = daftarSumberIndependen(
    [itemUtama, ...serupa],
    tierPerSumber,
  );
  const namaSumber = new Map<string | null, string>();
  namaSumber.set(item.sumber_id, item.sumber_nama);
  async function namaUntuk(sumberId: string | null): Promise<string> {
    if (namaSumber.has(sumberId)) {
      return namaSumber.get(sumberId) as string;
    }
    let nama = "Sumber tidak diketahui";
    if (sumberId) {
      try {
        const info = await adapter.ambilSumber(sumberId);
        if (info) nama = info.nama;
      } catch {
        // Pakai fallback di atas.
      }
    }
    namaSumber.set(sumberId, nama);
    return nama;
  }
  // Koroborator per inti (sudah didedup per sumber di verification.ts).
  // Disimpan RINGKASAN koroboratornya (bukan potongan "kutipan") —
  // kalimat kutipan yang jujur dicari per klaim saat menulis bukti.
  const koroboratorPerInti = new Map<
    string,
    Array<{ nama: string; url: string; ringkasan: string }>
  >();
  for (const kor of verifikasiKlaim.koroborator) {
    const daftar = koroboratorPerInti.get(kor.inti) ?? [];
    const entri = koroborasi.find(
      (k) => k.itemId === kor.itemId && k.inti === kor.inti,
    );
    daftar.push({
      nama: await namaUntuk(kor.sumberId),
      url: kor.url,
      ringkasan: entri?.ringkasan ?? "",
    });
    koroboratorPerInti.set(kor.inti, daftar);
  }

  let jumlahEvidence = 0;
  let jumlahEvidenceIndependen = 0;
  // Integrasi Global News 24/7 (17 Nov 2026): daftar evidence
  // untuk quality_check (langkah 6b) + hitungan klaim berbukti
  // untuk komponen C FACT SCORE auto-publish (langkah 10).
  // Kutipan dihitung ulang dari teks sumber SAAT INI (deterministik,
  // sama seperti saat evidence ditulis) — untuk baris evidence
  // yang sudah ada dari run sebelumnya, barisnya tidak ditulis
  // ulang tetapi kutipannya tetap diketahui dari teks kini.
  const evidenceTercatat: BuktiKlaim[] = [];
  const klaimDenganEvidence = new Set<string>();
  const kutipanTidakDitemukan: Array<{
    klaim_id: string;
    sumber_url: string;
  }> = [];
  async function tulisBukti(
    klaimId: string,
    sumberUrl: string,
    sumberNama: string,
    teksSumber: string,
    klaim: KlaimTerekstrak,
    independen: boolean,
  ): Promise<void> {
    // P2-1: kutipan = kalimat sumber yang memuat inti klaim, atau
    // null (tanpa kutipan) bila tidak ditemukan.
    const kutipan = cariKalimatKutipan(teksSumber, klaim);
    try {
      // P2-10: lewati pasangan (klaim_id, sumber_url) yang sudah
      // ada (cek dulu — simpanBukti sendiri juga mendup, tapi
      // bertipe void sehingga hitungan jujur butuh cek ini).
      // Adapter tanpa cariBuktiSama -> cek dilewati, hitung apa adanya.
      const adapterLuas = adapter as AiAdapter & {
        cariBuktiSama?: (
          klaimId: string,
          sumberUrl: string,
        ) => Promise<boolean>;
      };
      let sudahAda = false;
      try {
        sudahAda =
          typeof adapterLuas.cariBuktiSama === "function"
            ? await adapterLuas.cariBuktiSama(klaimId, sumberUrl)
            : false;
      } catch {
        sudahAda = false;
      }
      if (sudahAda) {
        // P2-10: evidence ini sudah tercatat dari run sebelumnya —
        // hitung sebagai evidence yang ADA (bukan baru), tanpa
        // menulis ulang barisnya. (Tanpa ini, run ulang akan
        // melaporkan jumlahEvidence=0 dan quality gagal palsu.)
        jumlahEvidence += 1;
        if (independen) jumlahEvidenceIndependen += 1;
        evidenceTercatat.push({
          klaim_teks: klaim.teks,
          sumber_url: sumberUrl,
          kutipan: kutipan ?? null,
        });
        klaimDenganEvidence.add(klaimId);
        return;
      }
      // ATURAN ARAH DETERMINISTIK (v29, Fitur 4 — BUKAN LLM):
      // lihat tentukanArahBukti di bawah. Label manual SELALU
      // menang: simpanBukti mendup per (klaim_id, sumber_url)
      // dan MELEWATI baris yang sudah ada, jadi baris berlabel
      // manual tidak pernah ditimpa pipeline (cabang sudahAda
      // di atas juga tidak menimpa).
      await adapter.simpanBukti({
        klaim_id: klaimId,
        sumber_url: sumberUrl,
        sumber_nama: sumberNama,
        kutipan: kutipan ?? undefined,
        arah: tentukanArahBukti(kutipan),
      });
      jumlahEvidence += 1;
      if (independen) jumlahEvidenceIndependen += 1;
      evidenceTercatat.push({
        klaim_teks: klaim.teks,
        sumber_url: sumberUrl,
        kutipan: kutipan ?? null,
      });
      klaimDenganEvidence.add(klaimId);
      if (!kutipan) {
        kutipanTidakDitemukan.push({
          klaim_id: klaimId,
          sumber_url: sumberUrl,
        });
      }
    } catch {
      // Satu evidence gagal: lanjut ke sumber berikut.
    }
  }
  for (let i = 0; i < klaimTersimpan.length; i++) {
    const klaim = klaimTersimpan[i];
    const klaimId = idKlaim[i];
    if (!klaimId) continue;
    const sudahTulis = new Set<string>();
    // (a) Sumber item sendiri — selalu.
    // v29: pencarian kalimat kutipan memakai JUGA teks halaman
    // hasil fetch (bila ada) — klaim yang diekstrak dari halaman
    // tidak pernah ditemukan kalimatnya bila hanya dicari di
    // ringkasan (akar sistematis kutipan_tanpa_bukti).
    const teksSendiri = [item.ringkasan, item.isi_ringkas, teksHalaman]
      .filter(Boolean)
      .join(" ");
    await tulisBukti(
      klaimId,
      item.url,
      item.sumber_nama,
      teksSendiri,
      klaim,
      false,
    );
    sudahTulis.add(item.url);
    // (b) Klaim 'fakta': sumber independen kelompok judul.
    if (klaim.jenis === "fakta") {
      for (const s of independenJudul) {
        if (sudahTulis.has(s.itemAkar.url)) continue;
        sudahTulis.add(s.itemAkar.url);
        await tulisBukti(
          klaimId,
          s.itemAkar.url,
          await namaUntuk(s.sumberId),
          s.itemAkar.ringkasan,
          klaim,
          true,
        );
      }
    }
    // (c) Klaim 'angka'/'kutipan': koroborator inti klaim itu.
    const inti = intiKlaim(klaim);
    if ((klaim.jenis === "angka" || klaim.jenis === "kutipan") && inti) {
      for (const kor of koroboratorPerInti.get(inti) ?? []) {
        if (sudahTulis.has(kor.url)) continue;
        sudahTulis.add(kor.url);
        await tulisBukti(klaimId, kor.url, kor.nama, kor.ringkasan, klaim, true);
      }
    }
  }

  // Bukti verification record (dipakai record item-level di bawah
  // DAN record artikel P0-1): termasuk jumlah evidence independen,
  // penanda kutipan tak ditemukan, dan klaim berpola instruksi.
  const buktiVerifikasi: Record<string, unknown> = {
    sumber_independen: Math.max(
      verifikasiJudul.sumberIndependen,
      verifikasiKlaim.sumberIndependen,
    ),
    jumlah_item: verifikasiJudul.jumlahItem,
    tier1: Math.max(
      verifikasiJudul.jumlahTier1,
      verifikasiKlaim.jumlahTier1,
    ),
    jumlah_klaim: idKlaim.length,
    jumlah_evidence: jumlahEvidence,
    jumlah_evidence_independen: jumlahEvidenceIndependen,
    kutipan_tidak_ditemukan: kutipanTidakDitemukan,
    klaim_berpola_instruksi: klaimTersimpan
      .filter((k) => k.berpola_instruksi)
      .map((k) => k.teks),
    koroborasi_klaim: {
      inti_cocok: verifikasiKlaim.intiCocok,
      sumber_independen: verifikasiKlaim.sumberIndependen,
    },
  };

  // Simpan verification record (item-level) + perbarui status item
  // — untuk item UNCONFIRMED/DEVELOPING, status diubah DI SINI
  // (tidak ada draf). Untuk VERIFIED/CROSS-CHECKED, status diubah
  // SESUDAH draf tersimpan (P1-2, lihat di bawah).
  try {
    await adapter.simpanVerification({
      raw_item_id: item.id,
      keputusan: keputusanAkhir,
      catatan:
        `${alasanAkhir} Keputusan dihitung dari judul identik ` +
        `(hash_judul), koroborasi inti klaim (angka/kutipan), dan ` +
        `rantai disalin_dari; bukan penilaian isi oleh manusia.`,
      bukti: buktiVerifikasi,
    });
  } catch {
    // Verification record gagal disimpan: status item tetap diperbarui
    // agar antrean tidak macet; kegagalan tercatat di bawah lewat hasil.
  }

  // Item UNCONFIRMED/DEVELOPING TIDAK dibuatkan draf (log dilewati).
  if (keputusanAkhir !== "VERIFIED" && keputusanAkhir !== "CROSS-CHECKED") {
    try {
      await adapter.perbaruiStatusItem(item.id, keputusanAkhir);
    } catch (err) {
      catatGagal(hasil, item, "perbarui_status", err);
      return;
    }
    if (keputusanAkhir === "DEVELOPING") hasil.developing += 1;
    else hasil.unconfirmed += 1;
    await catatDilewati(
      adapter,
      "article_writing",
      item.id,
      "raw_item",
      dipicu,
      `Draf dilewati: keputusan ${keputusanAkhir} — ${alasanAkhir}`,
    );
    hasil.dilewati += 1;
    return;
  }

  // 4. Summarization — ringkasan ekstraktif dari ringkasan sumber.
  let ringkasan: string;
  try {
    const r = await jalankanLangkah(
      adapter,
      "summarization",
      item.id,
      "raw_item",
      dipicu,
      async () => {
        const hasilRingkasan = buatRingkasan(item);
        return {
          nilai: hasilRingkasan,
          detail: {
            jumlah_karakter: hasilRingkasan.jumlahKarakter,
            perkiraan_detik_baca: hasilRingkasan.perkiraanDetikBaca,
          },
        };
      },
    );
    ringkasan = r.ringkasan;
  } catch (err) {
    catatGagal(hasil, item, "summarization", err);
    return;
  }

  // 5. Translation — heuristik bahasa + MyMemory untuk item
  // Inggris nyata (B2-E, G2). Indonesia -> 'tidak diperlukan'
  // (dilewati). Inggris -> coba terjemahkan JUDUL saja via
  // MyMemory (hemat kuota harian anonim 5.000 karakter);
  // berhasil -> terjemahan disimpan sebagai DRAF TERPISAH di
  // metadata item (metadata.terjemahan.judul_id + atribusi),
  // teks asli TIDAK PERNAH ditimpa, langkah dicatat berhasil.
  // Gagal MyMemory (jaringan/timeout/kuota/respons) -> langkah
  // 'dilewati' dengan alasan jujur; item tetap diproses
  // (terjemahan bukan prasyarat draf artikel).
  await jalankanLangkah(
    adapter,
    "translation",
    item.id,
    "raw_item",
    dipicu,
    async () => {
      const t = periksaTerjemahan(item, { nama: item.sumber_nama });
      if (t.bahasa !== "en") {
        return {
          nilai: t,
          dilewati: true,
          alasanDilewati: t.alasan,
          detail: { bahasa: t.bahasa, alasan: t.alasan },
        };
      }
      const hasil = await cobaTerjemahkanJudul(item.judul);
      if (!hasil.ok) {
        return {
          nilai: t,
          dilewati: true,
          alasanDilewati: `terjemahan MyMemory gagal (${hasil.alasan}: ${hasil.detail}) — teks asli dipertahankan`,
          detail: {
            bahasa: t.bahasa,
            alasan: t.alasan,
            mymemory: "gagal",
            mymemory_alasan: hasil.alasan,
          },
        };
      }
      try {
        await adapter.simpanMetadataItem(item.id, {
          ...(item.metadata ?? {}),
          terjemahan: {
            judul_id: hasil.terjemahan,
            sumber: hasil.sumber,
            atribusi: hasil.atribusi,
            diterjemahkan_pada: new Date().toISOString(),
          },
        });
      } catch (err) {
        return {
          nilai: t,
          dilewati: true,
          alasanDilewati: `terjemahan MyMemory berhasil tetapi gagal disimpan: ${err instanceof Error ? err.message : String(err)}`,
          detail: {
            bahasa: t.bahasa,
            alasan: t.alasan,
            mymemory: "gagal_simpan",
          },
        };
      }
      return {
        nilai: t,
        dilewati: false,
        detail: {
          bahasa: t.bahasa,
          alasan: t.alasan,
          mymemory: "berhasil",
          segmen: hasil.segmen,
          karakter: hasil.karakter,
          atribusi: hasil.atribusi,
        },
      };
    },
  );

  // 6. Writing — draf artikel dari klaim terverifikasi saja.
  // Draf dibuat DAHULU (P1-2): status item baru diubah sesudah
  // draf tersimpan (lihat langkah 8). Bila draf sudah ada dari run
  // sebelumnya (mis. status gagal diperbarui), id-nya dipakai
  // ulang — jangan buat draf duplikat (bentrok slug).
  // Sumber draf = gabungan sumber independen kedua sinyal (judul +
  // koroborasi klaim), didedup per URL.
  // Integrasi Global News 24/7 (17 Nov 2026) — urutan baru di
  // dalam langkah 6 (draf dibangun IN-MEMORY dulu, baru disimpan):
  //   6a. susunDrafArtikel (murni, tanpa DB).
  //   6b. Analysis 5W+1H (analysis.ts) — bahan editor; pencatatan
  //       run-nya best-effort (gagal catat tidak menggagalkan item).
  //   6c. Quality check ketertelusuran (quality-check.ts) —
  //       FAIL-CLOSED: draf yang gagal TIDAK disimpan, status item
  //       TIDAK diubah (tetap UNCONFIRMED, dicoba lagi run
  //       berikut), alasan tercatat di pf_ai_runs sebagai run
  //       'gagal'. Berlaku juga bila draf sudah ada dari run lama
  //       (draf pra-QC yang gagal tidak boleh lanjut ke langkah 8).
  //   6d. Simpan draf (atau pakai ulang) — baru di sini draf
  //       menyentuh DB. Langkah 7 (quality.ts) tetap berjalan
  //       sesudahnya seperti sebelumnya.
  const sumberDrafMap = new Map<string, SumberDraf>();
  for (const s of independenJudul) {
    const nama = namaSumber.get(s.sumberId) ?? "Sumber tidak diketahui";
    if (!sumberDrafMap.has(s.itemAkar.url)) {
      sumberDrafMap.set(s.itemAkar.url, { nama, url: s.itemAkar.url });
    }
  }
  for (const kor of verifikasiKlaim.koroborator) {
    if (!sumberDrafMap.has(kor.url)) {
      sumberDrafMap.set(kor.url, {
        nama: namaSumber.get(kor.sumberId) ?? "Sumber tidak diketahui",
        url: kor.url,
      });
    }
  }
  const sumberDraf: SumberDraf[] = [...sumberDrafMap.values()];

  // 6a. Draf in-memory (belum disimpan) — dipakai 6b/6c/6d + 7.
  // v29: klaim 'kutipan' tanpa kalimat kutipan evidence DITURUNKAN
  // dulu menjadi parafrasa (writing.ts turunkanKutipanTanpaBukti)
  // — draf dibangun dari daftar yang sudah diturunkan, dan daftar
  // yang SAMA dipakai quality_check (6c) agar K3/K5/K6 konsisten.
  // Klaim tersimpan di pf_claims TIDAK diubah (jenis 'kutipan'
  // tetap); yang diturunkan dicatat di detail run (6d + 6c).
  const klaimDraf = turunkanKutipanTanpaBukti(
    klaimTersimpan,
    evidenceTercatat,
  );
  let draf: SimpanArtikelInput;
  try {
    draf = susunDrafArtikel({
      item,
      klaim: klaimDraf.klaim,
      ringkasan,
      keputusan: keputusanAkhir,
      sumber: sumberDraf,
    });
  } catch (err) {
    // P1-2: draf GAGAL dibuat -> status item TIDAK diubah (tetap
    // UNCONFIRMED di antrean, dicoba lagi run berikutnya) — item
    // tidak hilang diam-diam.
    catatGagal(hasil, item, "writing", err);
    return;
  }

  // 6b. Analysis 5W+1H (analysis.ts) — sintesis HANYA dari klaim
  // terverifikasi (+ metadata yang dinyatakan eksplisit); slot
  // tanpa pendukung dibiarkan kosong secara jujur. Hasilnya
  // dicatat sebagai satu baris pf_ai_runs (agen harfiah
  // 'analysis' pasca-v22, fallback 'article_writing' + langkah
  // 'analysis' pra-v22). Best-effort: pencatatan gagal tidak
  // menggagalkan item — ringkasan tetap diteruskan ke detail
  // langkah writing (6d) bila tersedia.
  let analisisTercatat = false;
  let analisisRingkasan: string | null = null;
  try {
    const sintesis = await jalankanLangkahAgenBaru(
      adapter,
      "analysis",
      "article_writing",
      "analysis",
      item.id,
      "raw_item",
      dipicu,
      async () => {
        const hasilAnalisis = sintesis5W1H({
          klaim: klaimTersimpan,
          judul: item.judul,
          waktuTerbitAsli: item.waktu_terbit_asli,
          sumberNama: item.sumber_nama,
        });
        return {
          nilai: hasilAnalisis,
          detail: {
            ringkasan: hasilAnalisis.ringkasan,
            slot_terisi: (
              ["siapa", "apa", "kapan", "diMana", "mengapa", "bagaimana"] as const
            ).filter((slot) => hasilAnalisis[slot].teks !== null),
          },
        };
      },
    );
    analisisTercatat = true;
    analisisRingkasan = sintesis.ringkasan;
  } catch {
    // Best-effort (lihat komentar di atas): item tetap diproses.
    analisisTercatat = false;
    analisisRingkasan = null;
  }

  // 6c. Quality check ketertelusuran (quality-check.ts) — FAIL-CLOSED.
  // Draf yang gagal TIDAK disimpan (langkah 6d tidak jalan),
  // status item TIDAK diubah (tetap UNCONFIRMED), dan alasan
  // tercatat di pf_ai_runs (run 'gagal' agen quality_check /
  // editorial_quality + detail.langkah). quality.ts (langkah 7)
  // tetap dijalankan sesudahnya untuk draf yang LOLOS — modul
  // ini MENAMBAH pemeriksaan ketertelusuran, bukan menggantikannya.
  try {
    await jalankanLangkahAgenBaru(
      adapter,
      "quality_check",
      "editorial_quality",
      "quality_check",
      item.id,
      "raw_item",
      dipicu,
      async () => {
        const tanggalDiketahui = [
          item.waktu_terbit_asli,
          ...klaimTersimpan
            .filter((k) => k.jenis === "tanggal")
            .map((k) => k.teks),
        ].filter((t): t is string => typeof t === "string" && t.length > 0);
        const hasilQc = periksaKualitasKlaimDraf({
          judul: draf.judul,
          ringkasan: draf.ringkasan,
          isi: draf.isi,
          fakta: draf.fakta_penting,
          sumber: sumberDraf,
          klaim: klaimDraf.klaim,
          evidence: evidenceTercatat,
          tanggalDiketahui,
        });
        if (!hasilQc.lolos) {
          throw new Error(
            `quality_check gagal: ${hasilQc.pelanggaran.map((p) => p.kode).join(", ")}`,
          );
        }
        return {
          nilai: hasilQc,
          detail: {
            lolos: true,
            jumlah_pelanggaran: 0,
            kutipan_diturunkan_ke_parafrasa:
              klaimDraf.diturunkan.map((k) => k.teks),
          },
        };
      },
    );
  } catch (err) {
    // Fail-closed (lihat komentar di atas): draf tidak disimpan,
    // status item tetap UNCONFIRMED, dicoba lagi run berikut.
    // v29: catat kegagalan QC untuk batas ulang — item yang gagal
    // quality_check 3x berturut-turut ditandai terminal 'DITOLAK'
    // (tidak lagi diklaim antrean). Best-effort: kegagalan
    // pencatatan TIDAK PERNAH mengubah hasil run. Hitungan
    // diteruskan ke gagal_detail agar status katup TERAMATI di
    // log (run #45): `null` = counter tidak tersedia (migrasi
    // v29 belum diterapkan di produksi), field absen = adapter
    // tidak punya method pencatatan.
    let qcGagalBerturutTurut: number | null | undefined;
    try {
      const adapterLuas = adapter as AiAdapter & {
        catatGagalQualityCheck?: (
          itemId: string,
        ) => Promise<{ terminal: boolean; hitungan: number | null }>;
      };
      if (typeof adapterLuas.catatGagalQualityCheck === "function") {
        const catat = await adapterLuas.catatGagalQualityCheck(item.id);
        qcGagalBerturutTurut = catat.hitungan;
        if (catat.terminal) hasil.ditolak_qc += 1;
      }
    } catch {
      // Abaikan — batas ulang best-effort.
    }
    catatGagal(hasil, item, "quality_check", err, qcGagalBerturutTurut);
    return;
  }

  let artikelId: string;
  let drafDipakaiUlang = false;
  try {
    artikelId = await jalankanLangkah(
      adapter,
      "article_writing",
      item.id,
      "raw_item",
      dipicu,
      async () => {
        // Draf sudah dibangun in-memory di 6a (dan lolos
        // quality_check di 6c) — di sini hanya simpan/pakai ulang.
        const adapterLuas = adapter as AiAdapter & {
          cariArtikelUntukItem?: (rawItemId: string) => Promise<string | null>;
        };
        let idAda: string | null = null;
        try {
          idAda =
            typeof adapterLuas.cariArtikelUntukItem === "function"
              ? await adapterLuas.cariArtikelUntukItem(item.id)
              : null;
        } catch {
          idAda = null;
        }
        if (idAda) {
          drafDipakaiUlang = true;
          return {
            nilai: idAda,
            outputRef: idAda,
            detail: {
              slug: draf.slug,
              dipakai_ulang: true,
              jumlah_klaim: klaimTersimpan.length,
              analisis_tercatat: analisisTercatat,
              analisis_ringkasan: analisisRingkasan,
              quality_check: "lolos",
              kutipan_diturunkan_ke_parafrasa:
                klaimDraf.diturunkan.map((k) => k.teks),
            },
          };
        }
        const id = await adapter.simpanArtikel(draf);
        return {
          nilai: id,
          outputRef: id,
          detail: {
            slug: draf.slug,
            kategori_slug: draf.kategori_slug,
            jumlah_klaim: klaimTersimpan.length,
            analisis_tercatat: analisisTercatat,
            analisis_ringkasan: analisisRingkasan,
            quality_check: "lolos",
            kutipan_diturunkan_ke_parafrasa:
              klaimDraf.diturunkan.map((k) => k.teks),
          },
        };
      },
    );
    hasil.draf += 1;
  } catch (err) {
    // P1-2: draf GAGAL dibuat -> status item TIDAK diubah (tetap
    // UNCONFIRMED di antrean, dicoba lagi run berikutnya) — item
    // tidak hilang diam-diam.
    catatGagal(hasil, item, "article_writing", err);
    return;
  }

  // 7. Editorial quality — cek deterministik draf (dijalankan
  // SEBELUM tautan verifikasi ditulis, agar hasilnya ikut
  // tersimpan di bukti record artikel). Draf tetap tersimpan bila
  // gagal, tapi TIDAK ditandai siap-review (dicatat di detail run
  // + bukti record; penjadwalan menegakkannya, lihat editorial.ts).
  let kualitas: HasilKualitas | null = null;
  try {
    kualitas = await jalankanLangkah(
      adapter,
      "editorial_quality",
      artikelId,
      "artikel",
      dipicu,
      async () => {
        // Draf yang sama seperti 6a (sudah lolos quality_check);
        // dibangun ulang tidak perlu — pakai in-memory.
        const hasilKualitas = periksaKualitasDraf({
          judul: draf.judul,
          ringkasan: draf.ringkasan,
          isi: draf.isi,
          kategori_slug: draf.kategori_slug,
          sumber_url: draf.sumber_url,
          jumlahKlaimTerverifikasi: klaimTersimpan.length,
          jumlahEvidence,
          jumlahEvidenceIndependen,
          keputusan: keputusanAkhir,
        });
        return {
          nilai: hasilKualitas,
          detail: {
            lolos: hasilKualitas.lolos,
            kegagalan: hasilKualitas.kegagalan,
            siap_review: hasilKualitas.siap_review,
            jumlah_evidence_independen: jumlahEvidenceIndependen,
          },
        };
      },
    );
  } catch {
    // Kegagalan cek kualitas tidak membatalkan draf yang tersimpan;
    // kualitas=null -> siap_review tercatat null di bukti record.
    kualitas = null;
  }

  // 8. Ubah status item — HANYA sesudah draf tersimpan (P1-2).
  try {
    await adapter.perbaruiStatusItem(item.id, keputusanAkhir);
  } catch (err) {
    catatGagal(hasil, item, "perbarui_status", err);
    return;
  }
  // v29: item berhasil diproses — nol-kan hitungan gagal QC
  // berturut-turut (best-effort; kolom pra-v29 tidak ada -> diam).
  try {
    const adapterLuas = adapter as AiAdapter & {
      resetGagalQualityCheck?: (itemId: string) => Promise<void>;
    };
    if (typeof adapterLuas.resetGagalQualityCheck === "function") {
      await adapterLuas.resetGagalQualityCheck(item.id);
    }
  } catch {
    // Abaikan — reset best-effort.
  }
  if (keputusanAkhir === "VERIFIED") hasil.terverifikasi += 1;
  else hasil.cross_checked += 1;

  // 9. P0-1: tautkan verification record ke artikel. Gate terbit
  // membaca pf_verification_records per artikel_id, jadi record
  // item-level saja tidak cukup. Pendekatan yang dipilih: SALIN
  // record verifikasi dengan artikel_id terisi (bukan mengubah
  // gate agar menerima raw_item_id), karena (a) gate tetap punya
  // satu sumber kebenaran per artikel, (b) record item-level
  // tetap ada sebagai riwayat per item mentah, (c) tidak butuh
  // kolom/join baru. Kegagalan penulisan tautan TIDAK menggagalkan
  // item (draf + status sudah benar) — job rekonsiliasi di akhir
  // run menulis ulang tautan yang hilang (Tipe B).
  try {
    await adapter.simpanVerification({
      artikel_id: artikelId,
      raw_item_id: item.id,
      keputusan: keputusanAkhir,
      catatan:
        `${alasanAkhir} Keputusan dihitung dari judul identik ` +
        `(hash_judul), koroborasi inti klaim (angka/kutipan), dan ` +
        `rantai disalin_dari; bukan penilaian isi oleh manusia.`,
      bukti: {
        ...buktiVerifikasi,
        siap_review: kualitas ? kualitas.siap_review : null,
        kegagalan_kualitas: kualitas
          ? kualitas.kegagalan
          : ["pemeriksaan kualitas tidak dapat dicatat"],
        draf_dipakai_ulang: drafDipakaiUlang,
      },
    });
  } catch {
    // Tautan gagal ditulis — rekonsiliasi (Tipe B) memperbaikinya.
  }

  // 10. Auto-publish Tier-1 (Fase 11, Worker E) — SESUDAH langkah 9.
  // Gate penuh ada di terbitkanOtomatis (toggle aktif + FACT SCORE
  // >= 85 + status draft + verifikasi CROSS-CHECKED/VERIFIED +
  // verification record terakhir sejalan). Kegagalan di sini TIDAK
  // PERNAH menggagalkan item: draf tetap draft, item tetap
  // terhitung terverifikasi/cross-checked di atas.
  //
  // TEMUAN INTEGRATOR (17 Nov 2026) — jalur skor yang
  // diinstruksikan header auto-publish.ts TIDAK PERNAH
  // menghasilkan skor untuk draf pipeline:
  //   (a) getPerbandinganSumber memfilter pf_articles.status =
  //       'terbit' — draf ('draft') selalu tersedia=false;
  //   (b) klaim pipeline terikat raw_item_id, bukan artikel_id —
  //       getPerbandinganSumber membaca pf_claims by artikel_id,
  //       jadi klaim draf pipeline selalu kosong.
  // Karena itu, bila perbandingan tersedia, skor dihitung persis
  // seperti halaman publik (jalur yang diinstruksikan); bila
  // TIDAK tersedia, skor dihitung dari data verifikasi yang BARU
  // diproduksi langkah 3–9 di atas, dengan rumus FACT SCORE yang
  // SAMA (pemilik 17 Nov 2026) dan masukan yang SAMA maknanya:
  //   A: akar independen pendukung — gabungan akar judul
  //      (daftarSumberIndependen, sudah ter-resolusi rantai
  //      salinan) + akar koroborator klaim (sumberId koroborator
  //      SUDAH akar, lihat verification.ts).
  //   B: skor kredibilitas tertinggi antar akar itu (90/75/60).
  //   C: klaim dengan >= 1 evidence 'mendukung' (pipeline hanya
  //      menulis arah 'mendukung', jadi 0 menentang selalu).
  //   D: laporan koreksi terbuka — dibaca nyata via
  //      getJumlahKoreksiTerbuka (draf baru: 0; bila baca gagal,
  //      0 — draf baru tidak mungkin punya laporan).
  // TIDAK ADA angka karangan: tiap komponen berasal dari data
  // yang baru ditulis/diverifikasi run ini; sumber skor dicatat
  // di detail run ('perbandingan' | 'pipeline').
  // Konsekuensi yang JUJUR: draf 1-sumber tier-1 mendapat
  // A=13,33 + B=30 + C=20 + D=10 = 73,33 (< 85) — TIDAK
  // auto-terbit; butuh >= 2 akar independen (86,67+) — sejalan
  // dengan maksud gerbang (hanya draf terkoroborasi kuat yang
  // terbit otomatis).
  let hasilAutoPublish: HasilAutoPublish | null = null;
  let sumberSkorAutoPublish: "perbandingan" | "pipeline" | null = null;
  try {
    const perbandingan = await getPerbandinganSumber(artikelId);
    const koreksiTerbuka = (await getJumlahKoreksiTerbuka(artikelId)) ?? 0;
    let skor: number | null;
    if (perbandingan.tersedia) {
      sumberSkorAutoPublish = "perbandingan";
      skor = hitungFactScore({
        jumlahAkarPendukung: new Set(
          perbandingan.bobot.flatMap((b) => b.akarPendukung),
        ).size,
        skorKredibilitasTertinggi: perbandingan.bobot.reduce<number | null>(
          (maks, b) =>
            b.skorTertinggi !== null &&
            (maks === null || b.skorTertinggi > maks)
              ? b.skorTertinggi
              : maks,
          null,
        ),
        jumlahKlaim: perbandingan.klaim.length,
        jumlahKlaimDidukungTanpaMenentang: perbandingan.bobot.filter(
          (b) => b.mendukung >= 1 && b.menentang === 0,
        ).length,
        laporanKoreksiTerbuka: koreksiTerbuka,
      }).skor;
    } else {
      // Jalur pipeline-native (lihat TEMUAN INTEGRATOR di atas).
      sumberSkorAutoPublish = "pipeline";
      const kunciAkar = new Set<string>();
      let skorTertinggi: number | null = null;
      for (const s of independenJudul) {
        kunciAkar.add(s.sumberId ?? `item:${s.itemAkar.id}`);
        const sk = skorKredibilitas(s.tier);
        if (skorTertinggi === null || sk > skorTertinggi) skorTertinggi = sk;
      }
      for (const kor of verifikasiKlaim.koroborator) {
        kunciAkar.add(kor.sumberId ?? `item:${kor.itemId}`);
        const sk = skorKredibilitas(kor.tier);
        if (skorTertinggi === null || sk > skorTertinggi) skorTertinggi = sk;
      }
      skor = hitungFactScore({
        jumlahAkarPendukung: kunciAkar.size,
        skorKredibilitasTertinggi: skorTertinggi,
        jumlahKlaim: klaimTersimpan.length,
        jumlahKlaimDidukungTanpaMenentang: klaimDenganEvidence.size,
        laporanKoreksiTerbuka: koreksiTerbuka,
      }).skor;
    }
    const { flags } = await getFlagsLayanan();
    const aktif = nilaiFlagAutoPublish(flags);
    hasilAutoPublish = await terbitkanOtomatis(buatAdminAdapter(), {
      artikelId,
      factScore: skor,
      pengaturan: { autoPublishTier1: aktif },
    }, { id: null, email: "pipeline_editorial" });
  } catch (err) {
    // Kegagalan auto-publish (baca skor/flag, adapter admin, audit
    // fail-closed di terbitkanOtomatis) TIDAK PERNAH menggagalkan
    // item — draf tetap draft. Alasan dicatat di run di bawah.
    hasilAutoPublish = null;
    try {
      const runId = await adapter.catatRun({
        agen: "article_writing",
        input_ref: artikelId,
        input_jenis: "artikel",
        dipicu_oleh: dipicu,
      });
      await adapter.tutupRun(runId, {
        status: "gagal",
        error: `auto_publish gagal: ${err instanceof Error ? err.message : String(err)}`,
        durasi_ms: 0,
        detail: { langkah: "auto_publish", sumber_skor: sumberSkorAutoPublish },
      });
    } catch {
      // Pencatatan informatif; kegagalannya tidak menggagalkan item.
    }
  }
  if (hasilAutoPublish) {
    // Catat hasil ke pf_ai_runs agar terlihat di /admin (pola
    // 'comparison': agen v8 + detail.langkah).
    try {
      const runId = await adapter.catatRun({
        agen: "article_writing",
        input_ref: artikelId,
        input_jenis: "artikel",
        dipicu_oleh: dipicu,
      });
      await adapter.tutupRun(runId, {
        status: hasilAutoPublish.diterbitkan ? "berhasil" : "dilewati",
        error: hasilAutoPublish.diterbitkan
          ? undefined
          : (hasilAutoPublish.alasan ?? undefined),
        durasi_ms: 0,
        output_ref: hasilAutoPublish.diterbitkan ? artikelId : undefined,
        detail: {
          langkah: "auto_publish",
          diterbitkan: hasilAutoPublish.diterbitkan,
          fact_score: hasilAutoPublish.factScore,
          sumber_skor: sumberSkorAutoPublish,
          alasan: hasilAutoPublish.alasan,
        },
      });
    } catch {
      // Pencatatan informatif; kegagalannya tidak menggagalkan item.
    }
  }
}

// ---------- Rekonsiliasi (P1-2 / N-T3) ----------
// Metode adapter di bawah ini opsional (diimplementasikan
// SupabaseAiAdapter; adapter lain/uji lama boleh tidak punya).
// Bila adapter tidak menyediakannya, job melaporkan
// didukung:false dan TIDAK gagal — deteksi tetap bisa dilakukan
// lewat SQL langsung (lihat laporan gelombang).
interface AdapterRekonsiliasi {
  cariItemTerverifikasiTanpaArtikel?: (
    limit: number,
  ) => Promise<RawItemAntrean[]>;
  cariArtikelTanpaVerifikasiTerkait?: (
    limit: number,
  ) => Promise<
    Array<{ artikel_id: string; raw_item_id: string; keputusan: string }>
  >;
}

/** Job rekonsiliasi "item VERIFIED tanpa artikel" (P1-2).
 *  Dua tipe yatim yang diperbaiki:
 *  - Tipe A: item VERIFIED/CROSS-CHECKED tanpa artikel sama sekali
 *    -> jalankan ulang alur riset + verifikasi + draf untuk item itu
 *    (draf dibuat dulu, baru status — urutan P1-2 yang sama).
 *  - Tipe B: draf ada tetapi verification record ber-artikel_id
 *    belum ada (tautan P0-1 putus) -> tulis ulang record tautannya.
 *  Dibatasi `limit` per tipe per run; satu item gagal tidak
 *  menggagalkan yang lain. Dipanggil otomatis di akhir
 *  jalankanPipelineEditorial dan dipakai route /api/ai/antrean
 *  (deteksi) + /api/ai/jalankan (perbaikan). */
export async function rekonsiliasiItemTerverifikasiTanpaArtikel(
  adapter: AiAdapter,
  opsi: OpsiPipeline = {},
  hasil: HasilPipeline | null = null,
): Promise<HasilRekonsiliasi> {
  const kosong: HasilRekonsiliasi = {
    didukung: false,
    diperiksa: 0,
    draf_dibuat: 0,
    tautan_diperbaiki: 0,
    tersisa: 0,
  };
  const luas = adapter as AiAdapter & AdapterRekonsiliasi;
  const punyaA =
    typeof luas.cariItemTerverifikasiTanpaArtikel === "function";
  const punyaB =
    typeof luas.cariArtikelTanpaVerifikasiTerkait === "function";
  if (!punyaA && !punyaB) return kosong;
  const hitung: HasilPipeline =
    hasil ?? {
      diproses: 0,
      draf: 0,
      terverifikasi: 0,
      cross_checked: 0,
      developing: 0,
      unconfirmed: 0,
      dilewati: 0,
      gagal: 0,
      ditolak_qc: 0,
    };
  const drafSebelum = hitung.draf;
  const out: HasilRekonsiliasi = {
    didukung: true,
    diperiksa: 0,
    draf_dibuat: 0,
    tautan_diperbaiki: 0,
    tersisa: 0,
  };

  // Tipe A: item VERIFIED tanpa artikel -> buat drafnya.
  // DUA FASE seperti pipeline utama (riset SEMUA yatim dulu, baru
  // verifikasi): koroborasi klaim antar-yatim hanya jalan bila
  // klaim pasangannya sudah tersimpan — perbaikan satu-per-satu
  // akan membuat item pertama gagal terverifikasi ulang.
  if (punyaA) {
    let yatim: RawItemAntrean[] = [];
    try {
      yatim = await luas.cariItemTerverifikasiTanpaArtikel!(opsi.limit ?? 5);
    } catch {
      yatim = [];
    }
    out.diperiksa += yatim.length;
    const konteks: KonteksItem[] = [];
    for (const item of yatim) {
      try {
        const ctx = await risetSatuItem(adapter, item, opsi, hitung);
        if (ctx) konteks.push(ctx);
        else out.tersisa += 1;
      } catch {
        out.tersisa += 1;
      }
    }
    for (const ctx of konteks) {
      try {
        await verifikasiSatuItem(adapter, ctx, opsi, hitung);
        out.draf_dibuat = hitung.draf - drafSebelum;
      } catch {
        out.tersisa += 1;
      }
    }
  }

  // Tipe B: draf ada, tautan verifikasi hilang -> tulis ulang.
  if (punyaB) {
    let tanpaTautan: Array<{
      artikel_id: string;
      raw_item_id: string;
      keputusan: string;
    }> = [];
    try {
      tanpaTautan = await luas.cariArtikelTanpaVerifikasiTerkait!(
        opsi.limit ?? 5,
      );
    } catch {
      tanpaTautan = [];
    }
    out.diperiksa += tanpaTautan.length;
    for (const baris of tanpaTautan) {
      try {
        await adapter.simpanVerification({
          artikel_id: baris.artikel_id,
          raw_item_id: baris.raw_item_id,
          keputusan: baris.keputusan as
            | "VERIFIED"
            | "CROSS-CHECKED"
            | "DEVELOPING"
            | "UNCONFIRMED",
          catatan:
            "Tautan verifikasi ditulis ulang oleh job rekonsiliasi " +
            "(record item-level sudah ada; record artikel-level hilang).",
          bukti: { rekonsiliasi: true },
        });
        out.tautan_diperbaiki += 1;
      } catch {
        out.tersisa += 1;
      }
    }
  }

  return out;
}

// ---------- Langkah `comparison` (P2-5) ----------
// Perbandingan antar-item dalam satu batch — sinyal judul identik
// + koroborasi klaim antar-item. PURE (tanpa I/O): semua masukan
// berasal dari KonteksItem Fase 1. Memakai ULANG verification.ts:
// daftarSumberIndependen (kelompok judul identik) dan
// tentukanKeputusanDariKlaim (koroborasi inti klaim, lengkap
// dengan penjaga topik + rantai disalin_dari di dalamnya).
// TIDAK ADA logika perbandingan baru di sini, dan TIDAK ADA
// keputusan yang diubah: fungsi ini hanya menghitung apa yang
// sudah terjadi di dalam verification, agar tercatat sebagai
// langkah pipeline bernama `comparison` (lihat CATATAN CHECK di
// header berkas: baris pf_ai_runs-nya memakai agen
// 'fact_verification' + detail.langkah = 'comparison').

export interface HasilPerbandinganBatch {
  jumlahItem: number;
  /** Pasangan item yang dibandingkan (C(n,2) untuk n item). */
  pasanganDibandingkan: number;
  /** Pasangan dengan judul identik (hash judul sama). */
  pasanganJudulIdentik: number;
  /** Sumber independen di semua kelompok judul identik. */
  sumberIndependenJudul: number;
  /** Klaim distintif (punya inti angka/kutipan) yang diperiksa. */
  klaimDibandingkan: number;
  /** Inti klaim distintif yang punya koroborator valid dari
   *  item lain (unik per inti, se-batch). */
  klaimTerkoroborasi: number;
}

export function bandingkanAntarItem(
  konteks: KonteksItem[],
): HasilPerbandinganBatch {
  const kosong: HasilPerbandinganBatch = {
    jumlahItem: konteks.length,
    pasanganDibandingkan: 0,
    pasanganJudulIdentik: 0,
    sumberIndependenJudul: 0,
    klaimDibandingkan: 0,
    klaimTerkoroborasi: 0,
  };
  const n = konteks.length;
  if (n < 2) return kosong;
  kosong.pasanganDibandingkan = (n * (n - 1)) / 2;

  // Peta tier per sumber + peta item (dipakai kedua sinyal).
  const tierPerSumber = new Map<string, number>();
  const petaItem = new Map<string, ItemSerupaVerifikasi>();
  for (const ctx of konteks) {
    if (ctx.item.sumber_id && !tierPerSumber.has(ctx.item.sumber_id)) {
      tierPerSumber.set(ctx.item.sumber_id, ctx.tierUtama);
    }
    petaItem.set(ctx.item.id, {
      id: ctx.item.id,
      sumber_id: ctx.item.sumber_id,
      url: ctx.item.url,
      judul: ctx.item.judul,
      ringkasan: ctx.item.ringkasan,
      waktu_terbit_asli: ctx.item.waktu_terbit_asli,
      disalin_dari_id: ctx.item.disalin_dari_id,
    });
  }

  // Sinyal 1 — judul identik: kelompokkan per hash judul.
  const kelompokJudul = new Map<string, ItemSerupaVerifikasi[]>();
  for (const ctx of konteks) {
    const kunci = hashJudul(ctx.item.judul);
    const daftar = kelompokJudul.get(kunci) ?? [];
    daftar.push(petaItem.get(ctx.item.id) as ItemSerupaVerifikasi);
    kelompokJudul.set(kunci, daftar);
  }
  for (const kelompok of kelompokJudul.values()) {
    if (kelompok.length < 2) continue;
    kosong.pasanganJudulIdentik +=
      (kelompok.length * (kelompok.length - 1)) / 2;
    kosong.sumberIndependenJudul +=
      daftarSumberIndependen(kelompok, tierPerSumber).length;
  }

  // Sinyal 2 — koroborasi klaim: inti klaim distintif satu item
  // dicari di klaim item lain dalam batch yang sama (in-memory;
  // tanpa query baru — klaim semua item sudah ada di konteks).
  // Validasi kecocokan (containment persis, penjaga topik,
  // rantai disalin_dari) sepenuhnya di tentukanKeputusanDariKlaim.
  const intiTerkoroborasi = new Set<string>();
  for (const ctx of konteks) {
    const klaimDenganInti = ctx.klaimTersimpan.map((k) => ({
      teks: k.teks,
      jenis: k.jenis,
      inti: intiKlaim(k),
    }));
    kosong.klaimDibandingkan += klaimDenganInti.filter((k) => k.inti).length;
    const itemUtama = petaItem.get(ctx.item.id) as ItemSerupaVerifikasi;
    const koroborasi: KlaimKoroborasi[] = [];
    for (const lain of konteks) {
      if (lain.item.id === ctx.item.id) continue;
      for (const k of lain.klaimTersimpan) {
        const inti = intiKlaim(k);
        if (!inti) continue;
        koroborasi.push({
          inti,
          jenis: k.jenis,
          teksKlaim: k.teks,
          itemId: lain.item.id,
          sumberId: lain.item.sumber_id,
          judul: lain.item.judul,
          url: lain.item.url,
          ringkasan: lain.item.ringkasan,
          waktuTerbitAsli: lain.item.waktu_terbit_asli,
          disalinDariId: lain.item.disalin_dari_id,
        });
      }
    }
    const hasil = tentukanKeputusanDariKlaim(
      itemUtama,
      klaimDenganInti,
      koroborasi,
      tierPerSumber,
      petaItem,
    );
    for (const inti of hasil.intiCocok) intiTerkoroborasi.add(inti);
  }
  kosong.klaimTerkoroborasi = intiTerkoroborasi.size;
  return kosong;
}

// ---------- Titik masuk utama ----------

export async function jalankanPipelineEditorial(
  adapter: AiAdapter,
  opsi: OpsiPipeline = {},
): Promise<HasilPipeline> {
  const hasil: HasilPipeline = {
    diproses: 0,
    draf: 0,
    terverifikasi: 0,
    cross_checked: 0,
    developing: 0,
    unconfirmed: 0,
    dilewati: 0,
    gagal: 0,
    ditolak_qc: 0,
    gagal_detail: [],
  };

  // P2-8 (integrasi B1): mode kejar — bila item UNCONFIRMED
  // tertua sudah berumur > 7 hari, run ini memproses yang TERTUA
  // dulu (bukan terbaru), agar item lama tidak kelaparan selamanya
  // (kapasitas pipeline ~40/hari vs ingestion tiap 30 menit).
  // Ambang 7 hari dipilih agar antrean sempat dikuras sebelum
  // kedaluwarsa 14 hari (lib/ingestion/pemeliharaan.ts). Gagal
  // membaca umur antrean -> tetap mode terbaru (fail-open untuk
  // pemilihan urutan; bukan jalur keamanan).
  let modeAntrean: "terbaru" | "terlama" = "terbaru";
  try {
    const tertua = await adapter.ambilWaktuAntreanTertua();
    if (
      tertua &&
      Date.now() - new Date(tertua).getTime() > 7 * 24 * 3600 * 1000
    ) {
      modeAntrean = "terlama";
    }
  } catch {
    modeAntrean = "terbaru";
  }
  hasil.modeAntrean = modeAntrean;

  // Fase 5: jalur pemrosesan batch menandai item "sedang diproses"
  // (klaim:true) agar run kedua yang lolos dari lock job (mis. lock
  // kedaluwarsa di tengah run panjang) tidak mengambil item yang
  // sama. Jalur hanyaItemId mengambil read-only dulu — mengklaim
  // 500 item hanya untuk memproses satu item akan menandai antrean
  // secara sia-sia — lalu menandai SATU item yang dipilih
  // (best-effort, metode opsional adapter).
  const antrean = await adapter.ambilAntrean(
    opsi.hanyaItemId ? 500 : (opsi.limit ?? 10),
    modeAntrean,
    opsi.hanyaItemId ? { klaim: false } : { klaim: true },
  );
  let daftar = antrean;
  if (opsi.hanyaItemId) {
    const satu = antrean.find((i) => i.id === opsi.hanyaItemId);
    if (!satu) {
      // Item tidak ada di antrean (sudah diproses / id salah): dilewati.
      hasil.dilewati += 1;
      return hasil;
    }
    daftar = [satu];
    const luas = adapter as AiAdapter & {
      tandaiItemDiproses?: (id: string) => Promise<boolean>;
    };
    try {
      if (typeof luas.tandaiItemDiproses === "function") {
        await luas.tandaiItemDiproses(satu.id);
      }
    } catch {
      // Penandaan satu item best-effort (lock job tetap penjaga utama).
    }
  }

  // Fase 1: riset SEMUA item dulu — klaim harus tersimpan sebelum
  // verifikasi silang antar-klaim bisa berjalan.
  const konteks: KonteksItem[] = [];
  for (const item of daftar) {
    hasil.diproses += 1;
    try {
      const ctx = await risetSatuItem(adapter, item, opsi, hasil);
      if (ctx) konteks.push(ctx);
    } catch (err) {
      // Satu item gagal total (di luar langkah yang sudah dicatat):
      // hitung gagal, lanjut ke item berikutnya.
      catatGagal(hasil, item, "research", err);
    }
  }

  // Langkah `comparison` (P2-5) — DI ANTARA Fase 1 dan Fase 2:
  // bandingkan judul identik + inti klaim antar-item dalam batch
  // (memakai ulang verification.ts; hanya membaca klaim Fase 1).
  // Best-effort: kegagalan pencatatan langkah ini TIDAK
  // menggagalkan antrean — verifikasi per item tetap berjalan
  // dengan sinyalnya sendiri dan keputusannya tidak berubah.
  // Baris pf_ai_runs dicatat dengan agen 'fact_verification' +
  // detail.langkah = 'comparison' (lihat CATATAN CHECK di header
  // berkas: agen harfiah 'comparison' ditolak CHECK produksi).
  try {
    const dipicu = opsi.dipicu_oleh ?? "manual";
    const perbandingan = bandingkanAntarItem(konteks);
    const menemukanSesuatu =
      perbandingan.pasanganJudulIdentik > 0 ||
      perbandingan.klaimTerkoroborasi > 0;
    const detailPerbandingan: Record<string, unknown> = {
      langkah: "comparison",
      jumlah_item: perbandingan.jumlahItem,
      pasangan_dibandingkan: perbandingan.pasanganDibandingkan,
      pasangan_judul_identik: perbandingan.pasanganJudulIdentik,
      sumber_independen_judul: perbandingan.sumberIndependenJudul,
      klaim_dibandingkan: perbandingan.klaimDibandingkan,
      klaim_terkoroborasi: perbandingan.klaimTerkoroborasi,
    };
    await jalankanLangkah(
      adapter,
      "fact_verification",
      `batch-${tanggalWibHariIni()}`,
      "lain",
      dipicu,
      async () => {
        if (!menemukanSesuatu) {
          return {
            nilai: perbandingan,
            dilewati: true,
            alasanDilewati:
              konteks.length < 2
                ? `Hanya ${konteks.length} item dalam batch — tidak ada pasangan item untuk dibandingkan.`
                : "Tidak ada judul identik antar-item dan tidak ada klaim terkoroborasi dalam batch ini.",
            detail: detailPerbandingan,
          };
        }
        return { nilai: perbandingan, detail: detailPerbandingan };
      },
    );
  } catch {
    // Langkah comparison best-effort (lihat komentar di atas).
  }

  // Fase 2: verifikasi + draf per item (memakai klaim fase 1).
  for (const ctx of konteks) {
    try {
      await verifikasiSatuItem(adapter, ctx, opsi, hasil);
    } catch (err) {
      catatGagal(hasil, ctx.item, "verifikasi", err);
    }
  }

  // Job rekonsiliasi (P1-2, best-effort): item VERIFIED tanpa
  // artikel + artikel tanpa tautan verifikasi. Kegagalannya tidak
  // boleh menggagalkan run utama. Nonaktifkan per run dengan
  // opsi.rekonsiliasi === false.
  if (opsi.rekonsiliasi !== false) {
    try {
      hasil.rekonsiliasi =
        await rekonsiliasiItemTerverifikasiTanpaArtikel(adapter, opsi, hasil);
    } catch {
      // Rekonsiliasi best-effort: diam-diam dilewati bila gagal.
    }
  }
  return hasil;
}

// ---------- Daily Brief ----------

export async function jalankanBriefHarian(
  adapter: AiAdapter,
  opsi: OpsiBrief = {},
): Promise<HasilBrief> {
  const dipicu = opsi.dipicu_oleh ?? "manual";
  const tanggal = opsi.tanggal ?? tanggalWibHariIni();
  const runId = await adapter.catatRun({
    agen: "daily_brief",
    input_ref: tanggal,
    input_jenis: "brief",
    dipicu_oleh: dipicu,
  });
  const mulai = Date.now();
  try {
    const entri: EntriBrief[] = [...(opsi.entri ?? [])];
    // v29 (Fitur 3): mode artikel terbit — entri HANYA dari
    // artikel TERBIT 24 jam terakhir, TANPA pengisian dari
    // antrean UNCONFIRMED (brief pagi tidak boleh memuat klaim
    // yang belum terverifikasi). Bila 0 entri, brief tetap
    // disimpan sebagai draf (tanpa terbit, tanpa push).
    const modeTerbit = opsi.dariArtikelTerbit === true;
    if (opsi.entri === undefined && modeTerbit) {
      const terbit = await adapter.ambilArtikelTerbit24Jam(10);
      for (const d of terbit) entri.push(entriBriefDariDraf(d));
    }
    // Bila pemanggil tidak menyediakan entri, ambil dari draf artikel
    // terbaru (maks 10) — draf adalah satu-satunya entri "terverifikasi"
    // yang boleh masuk brief; artikel TIDAK PERNAH auto-terbit.
    if (opsi.entri === undefined && !modeTerbit) {
      const draf = await adapter.ambilDrafArtikel(10);
      for (const d of draf) entri.push(entriBriefDariDraf(d));
    }
    // Lengkapi dari antrean bila entri kurang dari 10 — entri ini
    // JUJUR berstatus UNCONFIRMED (tidak dinaikkan). Brief selalu
    // diisi sampai 10 entri bila antrean tersedia, campuran entri
    // terverifikasi dan UNCONFIRMED yang masing-masing berlabel
    // statusnya sendiri. Mode terbit TIDAK PERNAH dilengkapi dari
    // antrean (lihat komentar v29 di atas).
    if (!modeTerbit && entri.length < 10) {
      const antrean = await adapter.ambilAntrean(20);
      const tautanAda = new Set(entri.map((e) => e.tautan));
      for (const item of antrean) {
        if (entri.length >= 10) break;
        if (tautanAda.has(item.url)) continue;
        const nama = item.sumber_nama.toLowerCase();
        entri.push({
          judul: item.judul,
          ringkasan: item.ringkasan || item.isi_ringkas || item.judul,
          waktu: item.waktu_terbit_asli,
          label_waktu: item.waktu_terbit_asli
            ? null
            : "tanggal tidak diketahui",
          lokasi:
            typeof item.metadata?.lokasi === "string"
              ? (item.metadata.lokasi as string)
              : null,
          kategori:
            nama.includes("gdelt") || nama.includes("bbc")
              ? "dunia"
              : "indonesia",
          sumber: item.sumber_nama,
          status_verifikasi: "UNCONFIRMED",
          tautan: item.url,
        });
      }
    }

    const isu = await analisisTren(adapter, { jam: 168 });
    const isi = susunBrief({
      tanggal,
      entri,
      isuBerkembang: isu.filter((t) => t.berkembang),
    });
    // v29: auto-terbit HANYA di mode terbit dengan >=1 entri
    // (semua entri sudah terbit — tidak ada klaim baru). Bila
    // 0 entri -> tetap draf, tanpa terbit (dicatat di detail).
    const terbitkan =
      modeTerbit &&
      opsi.terbitkanLangsung === true &&
      entri.length > 0;
    const briefId = await adapter.simpanBrief(
      tanggal,
      isi,
      terbitkan ? "terbit" : "draft",
    );
    await adapter.tutupRun(runId, {
      status: "berhasil",
      durasi_ms: Date.now() - mulai,
      output_ref: briefId,
      detail: {
        jumlah_entri: entri.length,
        jumlah_isu: isi.isu_berkembang.length,
        dari_artikel_terbit: modeTerbit,
        diterbitkan: terbitkan,
        alasan_tidak_terbit:
          modeTerbit && !terbitkan
            ? entri.length === 0
              ? "tidak ada artikel terbit 24 jam terakhir"
              : "terbitkan_langsung tidak diminta"
            : null,
      },
    });
    return {
      tanggal,
      briefId,
      jumlahEntri: entri.length,
      jumlahIsu: isi.isu_berkembang.length,
      diterbitkan: terbitkan,
      judulEntri: entri.slice(0, 3).map((e) => e.judul),
    };
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    try {
      await adapter.tutupRun(runId, {
        status: "gagal",
        error: pesan,
        durasi_ms: Date.now() - mulai,
      });
    } catch {
      // Abaikan kegagalan pencatatan.
    }
    throw err;
  }
}

// ---------- Analisis tren ----------

export async function analisisTren(
  adapter: AiAdapter,
  opsi: { jam?: number } = {},
): Promise<TopikTren[]> {
  const jam = opsi.jam ?? 168;
  const runId = await adapter.catatRun({
    agen: "trend_analysis",
    input_ref: `tren-${jam}j`,
    input_jenis: "lain",
    dipicu_oleh: "manual",
  });
  const mulai = Date.now();
  try {
    const antrean = await adapter.ambilAntrean(200);
    const batas = Date.now() - jam * 60 * 60 * 1000;
    // P1-1 (N-T2): item tanpa tanggal terbit tidak masuk jendela
    // tren (umurnya tidak diketahui, bukan baru).
    const items = antrean
      .filter((i) => {
        if (!i.waktu_terbit_asli) return false;
        const ms = new Date(i.waktu_terbit_asli).getTime();
        return !Number.isNaN(ms) && ms >= batas;
      })
      .map((i) => ({
        id: i.id,
        judul: i.judul,
        sumber_id: i.sumber_id,
        waktu_terbit_asli: i.waktu_terbit_asli,
        disalin_dari_id: i.disalin_dari_id,
      }));
    const hasil = hitungTren(items);
    await adapter.tutupRun(runId, {
      status: "berhasil",
      durasi_ms: Date.now() - mulai,
      detail: {
        jumlah_item: items.length,
        jumlah_topik: hasil.length,
        berkembang: hasil.filter((t) => t.berkembang).length,
      },
    });
    return hasil;
  } catch (err) {
    const pesan = err instanceof Error ? err.message : String(err);
    try {
      await adapter.tutupRun(runId, {
        status: "gagal",
        error: pesan,
        durasi_ms: Date.now() - mulai,
      });
    } catch {
      // Abaikan kegagalan pencatatan.
    }
    throw err;
  }
}
