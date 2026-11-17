// Glosarium PRATA FAKTA — getter server (butuh DB).
// Gabungkan dua sumber yang sudah ada:
//   1. Glosarium v82 PRATA (src/lib/glosarium-v82.ts, 43 istilah,
//      definisi orisinal PRATA, berkas statis — bukan DB).
//   2. Istilah kunci artikel pengetahuan (pf_knowledge_articles,
//      referensi berjudul "Istilah: <kata> — <definisi>", lewat
//      getter getArtikelPengetahuan() yang sudah ada di
//      src/lib/lanjutan.ts + ambilIstilah() di src/lib/explainer.ts).
//
// Aturan: dedup berdasarkan istilah ternormalisasi (huruf kecil,
// tanpa spasi berlebih) — lihat gabungGlosarium() di
// src/lib/glosarium-murni.ts. Istilah yang sama di dua sumber =
// SATU entri, kedua sumber tercatat, definisi v82 yang dipakai
// (arti v82 TIDAK PERNAH diubah). TIDAK ADA definisi yang dikarang
// di sini; TIDAK ADA isi KBBI yang disalin — tautanKbbi() (di
// glosarium-murni.ts) hanya deep link ke entri resmi KBBI.
//
// Berkas ini HANYA untuk server (mengimpor supabase/server lewat
// lanjutan/explainer). Komponen klien mengimpor dari
// src/lib/glosarium-murni.ts — JANGAN dari sini.
import { getArtikelPengetahuan } from "@/lib/lanjutan";
import { ambilIstilah } from "@/lib/explainer";
import { GLOSARIUM_V82 } from "@/lib/glosarium-v82";
import {
  gabungGlosarium,
  type EntriGlosarium,
  type IstilahPengetahuan,
} from "@/lib/glosarium-murni";
import { GalatBaca, catatGalatBaca } from "@/lib/galat";

export type { EntriGlosarium, IstilahPengetahuan } from "@/lib/glosarium-murni";
export {
  gabungGlosarium,
  normalisasiIstilah,
  tautanKbbi,
} from "@/lib/glosarium-murni";
export type {
  KategoriGlosarium,
  SumberGlosarium,
} from "@/lib/glosarium-murni";

/** Semua entri glosarium: v82 + istilah dari artikel pengetahuan
 *  terbit. Gagal-aman: bila DB/tabel belum ada, kembalikan v82
 *  saja (bukan galat) — halaman tetap menampilkan 43 istilah. */
export async function getGlosarium(): Promise<EntriGlosarium[]> {
  const pengetahuan: IstilahPengetahuan[] = [];
  try {
    const artikel = await getArtikelPengetahuan(undefined, 500);
    for (const a of artikel) {
      for (const t of ambilIstilah(a.referensi)) {
        pengetahuan.push({
          istilah: t.istilah,
          definisi: t.definisi,
          slug: a.slug,
          judulArtikel: a.judul,
        });
      }
    }
  } catch (err) {
    if (err instanceof GalatBaca) throw err;
    if (catatGalatBaca("getGlosarium", err)) return gabungGlosarium(GLOSARIUM_V82, []);
    throw new GalatBaca("getGlosarium", err);
  }
  return gabungGlosarium(GLOSARIUM_V82, pengetahuan);
}
