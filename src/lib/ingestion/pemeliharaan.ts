// Pemeliharaan antrean ingestion (Gelombang B1).
// - Deteksi sumber basi (P1-6 / N-T4): sumber tanpa item baru > 48 jam.
// - Kedaluwarsa antrean (P2-8 / N-S11): item UNCONFIRMED yang terlalu
//   tua ditandai agar antrean tidak tumbuh tanpa batas.
// - Kejar ketertinggalan (P2-8): item tertua di antrean didahulukan.
//
// Semua keputusan di sini fungsi murni / adapter-injeksi agar dapat
// diuji dengan PGlite tanpa Supabase produksi.

import type { IngestionAdapter } from "./engine.ts";

/** Ambang basi: sumber tanpa item baru selama ini dianggap basi. */
export const AMBANG_BASI_JAM = 48;

/**
 * Umur kedaluwarsa antrean (P2-8): item UNCONFIRMED lebih tua dari ini
 * ditandai 'ditolak' dengan alasan kedaluwarsa. Dipilih 14 hari:
 * berita lebih tua dari 2 minggu praktis tidak lagi layak diverifikasi
 * sebagai berita baru (sumber aslinya pun sudah bergeser), sementara
 * kapasitas pipeline (~40 item/hari) tidak akan pernah menghabiskan
 * antrean yang menumpuk berbulan-bulan. Item kedaluwarsa TIDAK dihapus
 * — status + alasannya tetap dapat dibaca/dipulihkan admin.
 */
export const UMUR_KEDALUWARSA_HARI = 14;

/** Awalan alasan item kedaluwarsa (dipakai antrean untuk menghitungnya). */
export const AWALAN_ALASAN_KEDALUWARSA = "Kedaluarsa otomatis";

export function alasanKedaluarsa(umurHari: number = UMUR_KEDALUWARSA_HARI): string {
  return (
    `${AWALAN_ALASAN_KEDALUWARSA}: UNCONFIRMED lebih dari ${umurHari} hari ` +
    `tanpa verifikasi (Gelombang B1) — bukan dihapus, dapat dipulihkan admin`
  );
}

export interface AktivitasSumber {
  sumber_id: string;
  sumber_nama: string;
  /** Waktu item terbaru sumber ini; null bila belum pernah ada item. */
  terakhir_item: Date | null;
}

export interface SumberBasi extends AktivitasSumber {
  pernah_produktif: boolean;
  /** Jam sejak item terakhir; null bila belum pernah ada item. */
  jam_sejak_item_terakhir: number | null;
}

/**
 * Apakah satu sumber basi pada saat `sekarang` (fungsi murni).
 * null (belum pernah ada item) dihitung basi — sumber yang
 * didaftarkan tapi tidak pernah menghasilkan apa pun selama 48 jam
 * pertama juga layak tampil di dashboard, dengan pernah_produktif=false.
 */
export function apakahBasi(
  terakhirItem: Date | null,
  sekarang: Date,
  ambangJam: number = AMBANG_BASI_JAM,
): boolean {
  if (!terakhirItem) return true;
  return (
    sekarang.getTime() - terakhirItem.getTime() > ambangJam * 60 * 60 * 1000
  );
}

/** Saring daftar aktivitas menjadi sumber-sumber yang basi (murni). */
export function hitungSumberBasi(
  aktivitas: AktivitasSumber[],
  sekarang: Date = new Date(),
  ambangJam: number = AMBANG_BASI_JAM,
): SumberBasi[] {
  const hasil: SumberBasi[] = [];
  for (const a of aktivitas) {
    if (!apakahBasi(a.terakhir_item, sekarang, ambangJam)) continue;
    hasil.push({
      ...a,
      pernah_produktif: a.terakhir_item !== null,
      jam_sejak_item_terakhir:
        a.terakhir_item === null
          ? null
          : Math.floor(
              (sekarang.getTime() - a.terakhir_item.getTime()) / 3_600_000,
            ),
    });
  }
  return hasil;
}

export function pesanSumberBasi(basi: SumberBasi): string {
  if (!basi.pernah_produktif) {
    return `BASI: sumber "${basi.sumber_nama}" belum pernah menghasilkan item`;
  }
  return (
    `BASI: sumber "${basi.sumber_nama}" tanpa item baru ` +
    `${basi.jam_sejak_item_terakhir ?? "?"} jam (> ${AMBANG_BASI_JAM} jam)`
  );
}

/**
 * Pemeriksaan basi harian (P1-6): untuk tiap sumber aktif, baca waktu
 * item terbarunya lalu tentukan yang basi. Sumber basi juga ditulis
 * ke pf_sources.status_terakhir (best-effort, satu per satu) agar
 * tampil di dashboard admin. Mengembalikan daftar sumber basi.
 */
export async function periksaSumberBasi(
  adapter: Pick<IngestionAdapter, "waktuItemTerbaru" | "tandaiSumberBasi">,
  sumber: Array<{ id: string; nama: string }>,
  opsi: { sekarang?: Date; ambangJam?: number } = {},
): Promise<SumberBasi[]> {
  const sekarang = opsi.sekarang ?? new Date();
  const ambangJam = opsi.ambangJam ?? AMBANG_BASI_JAM;
  if (!adapter.waktuItemTerbaru) return [];
  const aktivitas: AktivitasSumber[] = [];
  for (const s of sumber) {
    try {
      aktivitas.push({
        sumber_id: s.id,
        sumber_nama: s.nama,
        terakhir_item: await adapter.waktuItemTerbaru(s.id),
      });
    } catch {
      // Satu sumber gagal dibaca: lewati, jangan gagalkan pemeriksaan.
      continue;
    }
  }
  const basi = hitungSumberBasi(aktivitas, sekarang, ambangJam);
  if (adapter.tandaiSumberBasi) {
    for (const b of basi) {
      try {
        await adapter.tandaiSumberBasi(b.sumber_id, pesanSumberBasi(b));
      } catch {
        // Best-effort: kegagalan tulis tidak mengubah daftar basi.
      }
    }
  }
  return basi;
}

/** Batas waktu kedaluwarsa dari `sekarang` (fungsi murni). */
export function batasKedaluarsa(
  sekarang: Date = new Date(),
  umurHari: number = UMUR_KEDALUWARSA_HARI,
): Date {
  return new Date(sekarang.getTime() - umurHari * 24 * 60 * 60 * 1000);
}

export interface HasilPemeliharaanAntrean {
  basi: SumberBasi[];
  kedaluarsa_ditandai: number;
  umur_kedaluarsa_hari: number;
}

/**
 * Satu panggilan pemeliharaan antrean untuk route ingestion (P1-6 +
 * P2-8): periksa sumber basi, lalu tandai item UNCONFIRMED kedaluwarsa.
 * TIDAK PERNAH melempar — kegagalan satu langkah dilaporkan sebagai
 * 0 / daftar kosong agar run ingestion tetap berhasil.
 */
export async function jalankanPemeliharaanAntrean(
  adapter: IngestionAdapter,
  sumber: Array<{ id: string; nama: string }>,
  opsi: {
    sekarang?: Date;
    ambangJam?: number;
    umurHari?: number;
  } = {},
): Promise<HasilPemeliharaanAntrean> {
  const umurHari = opsi.umurHari ?? UMUR_KEDALUWARSA_HARI;
  let basi: SumberBasi[] = [];
  try {
    basi = await periksaSumberBasi(adapter, sumber, opsi);
  } catch {
    basi = [];
  }
  let kedaluarsa_ditandai = 0;
  if (adapter.tandaiItemKedaluarsa) {
    try {
      kedaluarsa_ditandai = await adapter.tandaiItemKedaluarsa(
        batasKedaluarsa(opsi.sekarang ?? new Date(), umurHari),
        alasanKedaluarsa(umurHari),
      );
    } catch {
      kedaluarsa_ditandai = 0;
    }
  }
  return { basi, kedaluarsa_ditandai, umur_kedaluarsa_hari: umurHari };
}

// ---------- Kejar ketertinggalan (P2-8 / N-S11) ----------

/**
 * Urutan "kejar ketertinggalan": item tertua dulu (waktu_diambil
 * menaik). Dipakai antrean ingestion untuk menampilkan item yang
 * paling lama menunggu — tanpa itu, antrean yang diurutkan terbaru
 * dulu membuat item lama kelaparan selamanya (kapasitas pipeline
 * ~40/hari vs ingestion tiap 30 menit).
 *
 * CATATAN BATAS: pengurutan ini hanya mengubah TAMPILAN antrean
 * ingestion (/api/ingestion/antrean → `tertua`). Pemilihan item oleh
 * PIPELINE editorial (src/lib/ai/supabase-adapter.ts ambilAntrean —
 * di luar kepemilikan Gelombang B1) masih terbaru-dulu; agar mode
 * kejar benar-benar memproses item tertua, agen pipeline perlu
 * menambahkan mode kejar di sana (mis. tiap run ke-N memakai
 * order waktu_diambil ASC). Lihat laporan Gelombang B1.
 */
export function urutKejar<T extends { waktu_diambil: string | Date }>(
  item: T[],
): T[] {
  return [...item].sort(
    (a, b) =>
      new Date(a.waktu_diambil).getTime() -
      new Date(b.waktu_diambil).getTime(),
  );
}
