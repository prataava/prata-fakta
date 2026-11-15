// Pembuat slug artikel PRATA FAKTA.
// Lowercase, non-alfanumerik jadi '-', potong 60 karakter, buang '-'
// di ujung, lalu akhiran hash pendek (6 hex dari hashJudul) agar unik
// walau dua judul menghasilkan awalan yang sama.
import { hashJudul } from "../ingestion/dedup.ts";

const PANJANG_MAKS = 60;

export function buatSlug(teks: string): string {
  const dasar = teks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PANJANG_MAKS)
    .replace(/-+$/, "");
  const akhiran = hashJudul(teks).slice(0, 6);
  return dasar ? `${dasar}-${akhiran}` : `berita-${akhiran}`;
}
