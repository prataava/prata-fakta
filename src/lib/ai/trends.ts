// Agen Trend Analysis PRATA FAKTA — kata kunci dari judul + hitungan
// NYATA per kata kunci (24 jam & 7 hari terakhir). Tanpa statistik
// palsu: semua angka dihitung dari item yang benar-benar ada.
// "Isu berkembang" bila >= 5 item/24 jam ATAU >= 3 sumber independen
// dalam 24 jam pada kata kunci yang sama. Sumber independen dihitung
// dengan aturan rantai disalin_dari yang sama seperti verification.ts
// (salinan dari penerbit lain = satu sumber dengan aslinya).
import { cariAkarItem } from "./verification.ts";
import type { ItemSerupaVerifikasi } from "./verification.ts";

export interface ItemTren {
  id: string;
  judul: string;
  sumber_id: string | null;
  waktu_terbit_asli: string | null;
  disalin_dari_id: string | null;
}

export interface TopikTren {
  topik: string;
  jumlah_24j: number;
  jumlah_7h: number;
  sumber_independen: number;
  berkembang: boolean;
  item_terbaru: {
    id: string;
    judul: string;
    waktu_terbit_asli: string | null;
  };
}

// Stopword Bahasa Indonesia + Inggris (kata yang tidak bermakna
// sebagai topik).
const STOPWORD = new Set([
  // Indonesia
  "yang", "dan", "di", "ke", "dari", "untuk", "dengan", "pada",
  "adalah", "ini", "itu", "dalam", "sebagai", "oleh", "akan",
  "telah", "sudah", "juga", "tidak", "ada", "saat", "usai",
  "jadi", "atau", "jika", "karena", "tentang", "setelah",
  "sebelum", "lebih", "para", "seorang", "sebuah", "hingga",
  "antara", "atas", "bawah", "terhadap", "melalui", "tanpa",
  "bisa", "dapat", "harus", "kini", "hari", "tahun", "bulan",
  "pukul", "wib", "kata", "ujar", "sebut", "bilang", "ungkap",
  "menurut", "hingga", "masih", "kembali", "baru", "salah",
  "satu", "dua", "tiga", "empat", "lima", "kembali", "saat",
  "kini", "tersebut", "mereka", "kami", "kita", "anda",
  // Inggris
  "the", "and", "for", "with", "from", "after", "says", "said",
  "will", "would", "could", "about", "into", "over", "under",
  "more", "than", "that", "this", "when", "what", "have", "has",
  "been", "were", "was", "are", "but", "not", "its", "his", "her",
  "their", "they", "them", "then", "there", "here", "also",
  "first", "last", "news", "amid", "ahead", "before", "during",
  "while", "which", "whose", "should", "among", "between",
]);

const BATAS_TOP_24J = 5;
const BATAS_TOP_SUMBER = 3;
const JUMLAH_TOP = 10;
const SATU_HARI_MS = 24 * 60 * 60 * 1000;
const TUJUH_HARI_MS = 7 * SATU_HARI_MS;

// Kata kunci dari satu judul: lowercase, buang stopword, panjang >= 3,
// unik per judul (satu judul menghitung satu kali per kata kunci).
export function ekstrakKataKunci(judul: string): string[] {
  const kata = judul
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((k) => k.length >= 3 && !STOPWORD.has(k));
  return [...new Set(kata)];
}

function waktuMs(waktu: string | null): number | null {
  if (!waktu) return null;
  const ms = new Date(waktu).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function hitungTren(
  items: ItemTren[],
  opsi: { sekarang?: Date } = {},
): TopikTren[] {
  const sekarang = (opsi.sekarang ?? new Date()).getTime();
  const batas24 = sekarang - SATU_HARI_MS;
  const batas7 = sekarang - TUJUH_HARI_MS;

  // Peta id -> item untuk penelusuran rantai disalin_dari.
  const peta = new Map<string, ItemSerupaVerifikasi>();
  for (const item of items) {
    peta.set(item.id, {
      id: item.id,
      sumber_id: item.sumber_id,
      url: "",
      judul: item.judul,
      ringkasan: "",
      waktu_terbit_asli: item.waktu_terbit_asli,
      disalin_dari_id: item.disalin_dari_id,
    });
  }

  // Kelompokkan item per kata kunci.
  const perTopik = new Map<string, ItemTren[]>();
  for (const item of items) {
    for (const kunci of ekstrakKataKunci(item.judul)) {
      const daftar = perTopik.get(kunci) ?? [];
      daftar.push(item);
      perTopik.set(kunci, daftar);
    }
  }

  const hasil: TopikTren[] = [];
  for (const [topik, daftar] of perTopik) {
    // Tanpa tanggal terbit, item dianggap baru (baru saja diambil).
    const dalam24 = daftar.filter(
      (i) => (waktuMs(i.waktu_terbit_asli) ?? sekarang) >= batas24,
    );
    const dalam7 = daftar.filter(
      (i) => (waktuMs(i.waktu_terbit_asli) ?? sekarang) >= batas7,
    );
    if (dalam7.length === 0) continue;

    // Sumber independen dalam 24 jam: akar rantai salinan yang unik.
    const akarUnik = new Set<string>();
    for (const item of dalam24) {
      const akar = cariAkarItem(
        peta.get(item.id) as ItemSerupaVerifikasi,
        peta,
      );
      akarUnik.add(akar.sumber_id ?? `item:${akar.id}`);
    }

    const terurut = [...daftar].sort((a, b) => {
      const ta = waktuMs(a.waktu_terbit_asli) ?? 0;
      const tb = waktuMs(b.waktu_terbit_asli) ?? 0;
      return tb - ta;
    });
    const terbaru = terurut[0];

    hasil.push({
      topik,
      jumlah_24j: dalam24.length,
      jumlah_7h: dalam7.length,
      sumber_independen: akarUnik.size,
      berkembang:
        dalam24.length >= BATAS_TOP_24J ||
        akarUnik.size >= BATAS_TOP_SUMBER,
      item_terbaru: {
        id: terbaru.id,
        judul: terbaru.judul,
        waktu_terbit_asli: terbaru.waktu_terbit_asli,
      },
    });
  }

  hasil.sort(
    (a, b) =>
      b.jumlah_24j - a.jumlah_24j ||
      b.jumlah_7h - a.jumlah_7h ||
      a.topik.localeCompare(b.topik),
  );
  return hasil.slice(0, JUMLAH_TOP);
}
