// Kesehatan sumber ingestion PRATA FAKTA (Tahap E).
// Dihitung dari data yang SUDAH ADA — pf_ingestion_runs +
// pf_raw_items — tanpa tabel/migrasi baru (v16 TIDAK diperlukan:
// semua sinyal kesehatan sudah tercatat di kedua tabel itu).
//
// Sinyal per sumber:
//   - sukses_terakhir: selesai_pada run 'selesai'/'sebagian' terbaru
//     (run 'berjalan' diabaikan — belum selesai).
//   - gagal_beruntun: run 'gagal' beruntun dari yang terbaru.
//     Batas jendela = jumlah run yang dibaca pemanggil (disarankan
//     10 per sumber); bila jendela habis padahal masih 'gagal',
//     angkanya dilaporkan apa adanya (bukan ditebak lebih besar).
//   - item_terakhir: waktu_diambil item BARU terakhir (status
//     'baru'/'disalin_dari' — item yang benar-benar masuk sebagai
//     konten baru; 'duplikat'/'ditolak' bukan item baru).
//   - basi: item baru terakhir > 48 jam (AMBANG_BASI_JAM,
//     sama dengan pemeliharaan.ts) padahal sumber pernah produktif.
//
// Status turunan (satu sumber satu status, prioritas berurutan):
//   belum_pernah — tidak ada satu pun run tercatat.
//   gagal        — gagal_beruntun >= 3 (sumber mati berulang).
//   basi         — pernah produktif tapi tanpa item baru > 48 jam.
//   peringatan   — gagal 1-2x beruntun, ATAU ada run tapi belum
//                  pernah menghasilkan item baru.
//   sehat        — run terakhir sukses dan item baru masih mengalir.
//
// Modul ini fungsi murni + pengelompokan baris mentah saja: TIDAK
// memanggil Supabase. Pemanggil (halaman admin / route) membaca
// dua kueri di bawah ini lalu memanggil ringkasKesehatanSumber:
//   pf_ingestion_runs: select sumber_id,status,selesai_pada,
//     dimulai_pada order dimulai_pada desc limit 200
//   pf_raw_items: select sumber_id,waktu_diambil
//     where status in ('baru','disalin_dari')
//     order waktu_diambil desc limit 500
// Bila salah satu kueri gagal, pemanggil menampilkan "—" (fail-soft)
// — kesehatan yang tidak bisa dihitung TIDAK BOLEH menutup halaman.

import { AMBANG_BASI_JAM } from "./pemeliharaan.ts";

export type StatusKesehatanSumber =
  | "sehat"
  | "peringatan"
  | "gagal"
  | "basi"
  | "belum_pernah";

/** Satu baris run mentah (kolom yang dibaca dari pf_ingestion_runs). */
export interface BarisRunKesehatan {
  sumber_id: string | null;
  status: string;
  selesai_pada: string | null;
  dimulai_pada: string;
}

/** Satu baris item baru mentah (kolom yang dibaca dari pf_raw_items). */
export interface BarisItemBaruKesehatan {
  sumber_id: string | null;
  waktu_diambil: string;
}

export interface KesehatanSumber {
  sumber_id: string;
  sumber_nama: string;
  status: StatusKesehatanSumber;
  /** ISO selesai_pada run sukses terbaru; null bila belum pernah sukses. */
  sukses_terakhir: string | null;
  /** Run 'gagal' beruntun dari yang terbaru (0 bila run terakhir sukses). */
  gagal_beruntun: number;
  /** Jumlah run (selesai) yang diperiksa untuk sumber ini. */
  jendela_run: number;
  /** ISO waktu_diambil item baru terakhir; null bila belum pernah ada. */
  item_terakhir: string | null;
  /** Jam sejak item baru terakhir; null bila belum pernah ada item. */
  jam_sejak_item_terakhir: number | null;
  /** Penjelasan singkat status (null bila sehat). */
  peringatan: string | null;
}

/** Ambang gagal beruntun untuk status 'gagal' (3x = sumber mati). */
export const AMBANG_GAGAL_BERUNTUN = 3;

function keTanggal(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Hitung kesehatan satu sumber dari run-runnya (terbaru dulu;
 * bila tidak terurut, diurutkan di sini) + waktu item baru terakhir.
 * Fungsi murni.
 */
export function hitungKesehatanSumber(input: {
  sumber_id: string;
  sumber_nama: string;
  runs: BarisRunKesehatan[];
  /** ISO waktu_diambil item baru terakhir, atau null. */
  itemTerakhir: string | null;
  sekarang?: Date;
  ambangBasiJam?: number;
  ambangGagalBeruntun?: number;
}): KesehatanSumber {
  const sekarang = input.sekarang ?? new Date();
  const ambangBasiJam = input.ambangBasiJam ?? AMBANG_BASI_JAM;
  const ambangGagal = input.ambangGagalBeruntun ?? AMBANG_GAGAL_BERUNTUN;

  // Run 'berjalan' belum selesai: abaikan untuk streak + sukses.
  const selesai = [...input.runs]
    .filter((r) => r.status !== "berjalan")
    .sort((a, b) => {
      const tb = keTanggal(b.dimulai_pada)?.getTime() ?? 0;
      const ta = keTanggal(a.dimulai_pada)?.getTime() ?? 0;
      return tb - ta;
    });

  let gagalBeruntun = 0;
  for (const r of selesai) {
    if (r.status === "gagal") gagalBeruntun += 1;
    else break;
  }

  const sukses = selesai.find(
    (r) => r.status === "selesai" || r.status === "sebagian",
  );
  const suksesTerakhir =
    (sukses?.selesai_pada ?? sukses?.dimulai_pada ?? null) || null;

  const itemTerakhir = keTanggal(input.itemTerakhir);
  const jamSejakItem =
    itemTerakhir === null
      ? null
      : Math.floor((sekarang.getTime() - itemTerakhir.getTime()) / 3_600_000);

  const itemTerakhirIso = itemTerakhir ? itemTerakhir.toISOString() : null;

  let status: StatusKesehatanSumber;
  let peringatan: string | null = null;
  if (selesai.length === 0) {
    status = "belum_pernah";
    peringatan = "Belum pernah ada run ingestion tercatat.";
  } else if (gagalBeruntun >= ambangGagal) {
    status = "gagal";
    peringatan =
      `Gagal ${gagalBeruntun}x beruntun` +
      (jamSejakItem !== null && jamSejakItem > ambangBasiJam
        ? `; tanpa item baru ${jamSejakItem} jam`
        : "") +
      ".";
  } else if (
    itemTerakhir !== null &&
    jamSejakItem !== null &&
    jamSejakItem > ambangBasiJam
  ) {
    status = "basi";
    peringatan =
      `Tanpa item baru ${jamSejakItem} jam (> ${ambangBasiJam} jam) ` +
      `padahal sumber pernah produktif.`;
  } else if (itemTerakhir === null) {
    status = "peringatan";
    peringatan = "Ada run tercatat, tetapi belum pernah menghasilkan item baru.";
  } else if (gagalBeruntun >= 1) {
    status = "peringatan";
    peringatan = `Gagal ${gagalBeruntun}x beruntun (run terakhir gagal).`;
  } else {
    status = "sehat";
  }

  return {
    sumber_id: input.sumber_id,
    sumber_nama: input.sumber_nama,
    status,
    sukses_terakhir: suksesTerakhir,
    gagal_beruntun: gagalBeruntun,
    jendela_run: selesai.length,
    item_terakhir: itemTerakhirIso,
    jam_sejak_item_terakhir: jamSejakItem,
    peringatan,
  };
}

/**
 * Ringkas kesehatan SEMUA sumber dari dua daftar baris mentah
 * (hasil dua kueri yang didokumentasikan di kepala berkas).
 * Baris run yang sumber_id-nya null (run ad-hoc) diabaikan;
 * sumber tanpa baris sama sekali tetap muncul ('belum_pernah').
 */
export function ringkasKesehatanSumber(input: {
  sumber: Array<{ id: string; nama: string }>;
  runs: BarisRunKesehatan[];
  itemBaru: BarisItemBaruKesehatan[];
  sekarang?: Date;
  ambangBasiJam?: number;
  ambangGagalBeruntun?: number;
}): KesehatanSumber[] {
  const runPerSumber = new Map<string, BarisRunKesehatan[]>();
  for (const r of input.runs) {
    if (!r.sumber_id) continue;
    const daftar = runPerSumber.get(r.sumber_id) ?? [];
    daftar.push(r);
    runPerSumber.set(r.sumber_id, daftar);
  }
  const itemPerSumber = new Map<string, string>();
  for (const b of input.itemBaru) {
    if (!b.sumber_id) continue;
    const lama = itemPerSumber.get(b.sumber_id);
    if (!lama || b.waktu_diambil > lama) {
      itemPerSumber.set(b.sumber_id, b.waktu_diambil);
    }
  }
  return input.sumber.map((s) =>
    hitungKesehatanSumber({
      sumber_id: s.id,
      sumber_nama: s.nama,
      runs: runPerSumber.get(s.id) ?? [],
      itemTerakhir: itemPerSumber.get(s.id) ?? null,
      sekarang: input.sekarang,
      ambangBasiJam: input.ambangBasiJam,
      ambangGagalBeruntun: input.ambangGagalBeruntun,
    }),
  );
}

/** Label Indonesia untuk status kesehatan (tampilan admin). */
export const LABEL_KESEHATAN: Record<StatusKesehatanSumber, string> = {
  sehat: "Sehat",
  peringatan: "Peringatan",
  gagal: "Gagal",
  basi: "Basi",
  belum_pernah: "Belum pernah jalan",
};
