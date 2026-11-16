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

/**
 * Slug draf pipeline: slug judul + pembeda 6 hex dari id item mentah.
 * Dua item berjudul IDENTIK (kasus VERIFIED paling umum: dua outlet
 * memberitakan headline yang sama) WAJIB mendapat slug berbeda —
 * pf_articles.slug UNIQUE: tanpa pembeda, insert draf kedua selalu
 * gagal bentrok slug dan item itu macet UNCONFIRMED selamanya
 * (celah Tahap E, N-T3: draf tidak pernah tersimpan, status tidak
 * pernah berubah, run berikutnya gagal dengan cara yang persis sama).
 * Deterministik: susunDrafArtikel dipanggil 2x per item + run ulang
 * memakai slug yang sama; draf yang sudah ada dipakai ulang lewat
 * cariArtikelUntukItem (bukan insert ulang), jadi pembeda tidak
 * membuat draf ganda.
 */
export function buatSlugArtikel(judul: string, rawItemId: string): string {
  const pembeda = hashJudul(rawItemId).slice(0, 6);
  return `${buatSlug(judul)}-${pembeda}`;
}
