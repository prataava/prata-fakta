// Penjawab DRAF Ask the World (Gelombang B2-E, F1).
//
// Job terjadwal (POST /api/tanya/draf, dipicu workflow
// .github/workflows/tanya-jawab-draf.yml) membuat DRAF jawaban
// untuk pertanyaan berstatus 'menunggu' — dari referensi yang
// SUDAH ADA di basis pengetahuan (artikel terbit, pengetahuan
// terbit, indikator data, peristiwa, profil negara), memakai
// retrieval yang sama dengan POST /api/tanya (cariKandidat).
//
// ATURAN KERAS (tanpa kecuali):
// - Draf TIDAK PERNAH menjadi jawaban resmi sendiri: draf
//   disimpan di kolom jawaban_draf / referensi_draf yang
//   terpisah dari jawaban resmi; status TETAP 'menunggu' dan
//   publik TETAP false sampai editor menyetujui lewat
//   PATCH /api/admin/tanya/[id] (aksi_draf=setujui).
// - Draf bersifat EKSTRAKTIF: tiap kalimat draf adalah ringkasan
//   atau judul referensi yang sudah ada — TIDAK PERNAH mengarang
//   klaim baru. Bila retrieval tidak menemukan referensi yang
//   cukup, draf TIDAK dibuat (alasan 'tidak_ada_data').
// - Batas pertanyaan per pengguna + moderasi tetap berlaku:
//   job ini hanya membaca antrean 'menunggu' yang sudah lolos
//   rate limit + moderasi saat pertanyaan dibuat (POST /api/tanya).
// - Tanpa LLM eksternal: penyusunan draf deterministik dari
//   kandidat retrieval (AI hanya via Muse di luar kode).
//
// Modul ini MURNI (tanpa I/O, tanpa impor Next/Supabase) supaya
// logika draf bisa diuji langsung di baterai.

export type KandidatDraf = {
  judul: string;
  ringkasan: string | null;
  url: string | null;
  skor: number;
};

export type HasilDraf = {
  /** true bila draf dibuat (ada referensi yang cukup). */
  dibuat: boolean;
  /** Teks draf (hanya bila dibuat). */
  draf?: string;
  /** Referensi yang dipakai draf (hanya bila dibuat). */
  referensi: { judul: string; url: string | null }[];
  /** 'ada_referensi' | 'tidak_ada_data' */
  alasan: "ada_referensi" | "tidak_ada_data";
};

/** Batas draf per run job (workflow memakai 10; endpoint membatasi 1..20). */
export const BATAS_DRAF_PER_RUN = 10;
export const BATAS_DRAF_PER_RUN_MAKS = 20;

/** Panjang maksimum teks draf (sama dengan batas jawaban admin, 2000). */
export const MAKS_PANJANG_DRAF = 2000;

/** Potongan maksimum per referensi di dalam draf (agar draf tetap ringkas). */
const MAKS_POTONGAN_PER_REFERENSI = 400;

function potong(teks: string, maks: number): string {
  const bersih = teks.replace(/\s+/g, " ").trim();
  if (bersih.length <= maks) return bersih;
  return `${bersih.slice(0, maks).replace(/\s+[^ ]*$/, "")}…`;
}

/**
 * Susun draf jawaban dari kandidat retrieval (terurut skor menurun).
 * Ekstraktif: tiap butir memakai judul/ringkasan kandidat apa adanya.
 * Mengembalikan { dibuat: false, alasan: 'tidak_ada_data' } bila
 * tidak ada satu pun kandidat — pemanggil WAJIB tidak menyimpan
 * apa pun dalam kasus itu (jangan mengarang jawaban).
 */
export function susunDrafJawaban(
  kandidat: KandidatDraf[],
): HasilDraf {
  const pakai = kandidat
    .filter((k) => k.judul && k.judul.trim())
    .slice(0, 3);
  if (pakai.length === 0) {
    return { dibuat: false, referensi: [], alasan: "tidak_ada_data" };
  }
  const referensi = pakai.map((k) => ({ judul: k.judul, url: k.url }));
  const butir = pakai.map((k) => {
    const isi = k.ringkasan && k.ringkasan.trim() ? k.ringkasan : k.judul;
    return `Menurut ${k.judul}: ${potong(isi, MAKS_POTONGAN_PER_REFERENSI)}`;
  });
  let draf =
    "DRAF — menunggu review editor. " + butir.join(" ");
  if (draf.length > MAKS_PANJANG_DRAF) {
    draf = `${draf.slice(0, MAKS_PANJANG_DRAF - 1).replace(/\s+[^ ]*$/, "")}…`;
  }
  return { dibuat: true, draf, referensi, alasan: "ada_referensi" };
}
