// Agen Translation PRATA FAKTA — deteksi bahasa HEURISTIK, BUKAN
// terjemahan mesin. TIDAK ADA terjemahan mesin palsu di sini:
// bila teks sumber berbahasa Inggris, pipeline TIDAK menerjemahkannya
// sendiri — hasilnya {diperlukan: false, alasan: 'menunggu terjemahan
// Muse (cron/chat)'} dan run dicatat 'dilewati', supaya terjemahan
// dikerjakan Muse lewat cron/chat. Teks Indonesia dilewati dengan
// alasan 'tidak diperlukan'.
//
// GELOMBANG B2-E (G2): terjemahan mesin NYATA kini tersedia lewat
// MyMemory (src/lib/terjemahan/mymemory.ts) — dipakai pipeline
// langkah translation HANYA untuk judul item Inggris nyata (bukan
// ringkasan/isi, demi kuota harian anonim 5.000 karakter). Hasil
// disimpan sebagai draf terpisah di metadata item
// (metadata.terjemahan.judul_id + atribusi) — teks asli TIDAK
// PERNAH ditimpa. Gagal MyMemory → item tetap 'dilewati' dengan
// alasan jujur (lihat cobaTerjemahkanJudul di bawah).
import { terjemahkanEnKeId } from "../terjemahan/mymemory.ts";
import type { HasilTerjemahanMyMemory } from "../terjemahan/mymemory.ts";

export interface HasilTerjemahan {
  diperlukan: boolean;
  alasan: string;
  bahasa: "id" | "en" | "tidak_diketahui";
}

// Sumber berbahasa Indonesia yang dikenal (nama seed v1 + media
// Indonesia umum). BBC Indonesia berbahasa Indonesia walau induknya
// asing — sengaja masuk daftar ini.
const SUMBER_INDONESIA = [
  "antara",
  "cnn indonesia",
  "liputan6",
  "cnbc indonesia",
  "tribunnews",
  "republika",
  "bbc indonesia",
  "detik",
  "kompas",
  "tempo",
  "voi",
  "jpnn",
  "okezone",
  "sindonews",
];

// Kata Inggris umum untuk heuristik judul dominan Inggris.
const KATA_INGGRIS = new Set([
  "the", "and", "for", "with", "from", "after", "says", "said",
  "will", "would", "could", "about", "into", "over", "under",
  "more", "than", "that", "this", "when", "what", "have", "has",
  "been", "were", "was", "are", "but", "not", "its", "his", "her",
  "their", "they", "them", "then", "there", "here", "also",
  "first", "last", "news", "says", "amid", "ahead", "after",
  "before", "during", "while", "which", "whose", "should",
  "among", "between", "through", "against", "without", "within",
]);

function hitungKataInggris(judul: string): number {
  const kata = judul
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  let hitung = 0;
  for (const k of kata) {
    if (KATA_INGGRIS.has(k)) hitung += 1;
  }
  return hitung;
}

export function periksaTerjemahan(
  item: { judul: string; metadata?: Record<string, unknown> | null },
  sumber: { nama: string },
): HasilTerjemahan {
  const bahasaMeta = item.metadata?.bahasa;
  if (typeof bahasaMeta === "string" && bahasaMeta.toLowerCase() === "id") {
    return {
      diperlukan: false,
      alasan: "tidak diperlukan",
      bahasa: "id",
    };
  }
  if (typeof bahasaMeta === "string" && bahasaMeta.toLowerCase() === "en") {
    return {
      diperlukan: false,
      alasan: "menunggu terjemahan Muse (cron/chat)",
      bahasa: "en",
    };
  }

  const nama = sumber.nama.toLowerCase();
  if (SUMBER_INDONESIA.some((s) => nama.includes(s))) {
    return {
      diperlukan: false,
      alasan: "tidak diperlukan",
      bahasa: "id",
    };
  }

  if (hitungKataInggris(item.judul) >= 2) {
    return {
      diperlukan: false,
      alasan: "menunggu terjemahan Muse (cron/chat)",
      bahasa: "en",
    };
  }

  // Bahasa tidak dapat ditentukan dari heuristik: JANGAN menebak
  // terjemahan — serahkan ke Muse.
  return {
    diperlukan: false,
    alasan: "menunggu terjemahan Muse (cron/chat)",
    bahasa: "tidak_diketahui",
  };
}

/**
 * Terjemahkan JUDUL item Inggris nyata via MyMemory (B2-E, G2).
 * Hanya dipanggil pipeline bila periksaTerjemahan mengembalikan
 * bahasa 'en'. TIDAK PERNAH melempar dan TIDAK PERNAH mengarang:
 * gagal → { ok: false, ... } dan pemanggil mencatat 'dilewati'
 * dengan alasan jujur. Email MyMemory (kuota 50.000/hari) hanya
 * dari env MYMEMORY_EMAIL — tidak ada secret di repo.
 */
export async function cobaTerjemahkanJudul(
  judul: string,
): Promise<HasilTerjemahanMyMemory> {
  const email = process.env.MYMEMORY_EMAIL?.trim() || undefined;
  return terjemahkanEnKeId(judul, { email });
}
