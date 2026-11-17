// Logika MURNI perbandingan dua artikel (P1-3) — tanpa impor apa
// pun, agar bisa diuji PGlite tanpa DB live (pola
// src/lib/fact-score.ts / src/lib/ai/verification.ts).
// Dipakai getPerbandinganDuaArtikel (src/lib/data.ts).
//
// PENTING — cara klaim dicocokkan: pf_claims.artikel_id hanya
// menunjuk SATU artikel (migrasi v4); tidak ada satu pun baris
// klaim yang "tertaut ke kedua artikel". Klaim bersama di sini
// = dua klaim dari dua artikel berbeda yang TEKSNYA SAMA setelah
// normalisasi (huruf kecil, tanda baca dilepas, spasi diringkas).
// Bila teksnya berbeda, klaim itu masuk hanya-A / hanya-B —
// kesamaan TIDAK PERNAH dikarang dari kemiripan judul/topik.

export type KlaimPerbandingan = {
  id: string;
  teks: string;
  jenis: string;
  status: string;
};

export type SumberArtikelPerbandingan = {
  nama: string;
  url: string | null;
};

export type ArtikelPerbandinganRingkas = {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  kategori_slug: string | null;
  status_verifikasi: string;
  diterbitkan_pada: string | null;
};

export type KlaimBersama = {
  /** Teks klaim (dari sisi A; sisi B teksnya sama setelah normalisasi). */
  teks: string;
  klaimA: KlaimPerbandingan;
  klaimB: KlaimPerbandingan;
};

export type PerbandinganDuaArtikel = {
  /** false = satu/dua slug tak ada, draf, atau data klaim gagal dibaca. */
  tersedia: boolean;
  artikelA: ArtikelPerbandinganRingkas | null;
  artikelB: ArtikelPerbandinganRingkas | null;
  /** Klaim dengan teks yang sama di kedua artikel. */
  bersama: KlaimBersama[];
  /** Klaim yang hanya ada di artikel A. */
  hanyaA: KlaimPerbandingan[];
  /** Klaim yang hanya ada di artikel B. */
  hanyaB: KlaimPerbandingan[];
  sumberA: SumberArtikelPerbandingan[];
  sumberB: SumberArtikelPerbandingan[];
};

/** Normalisasi teks klaim untuk pencocokan: huruf kecil, tanda
 *  baca dilepas, spasi diringkas. Dua klaim "sama" = hasil
 *  normalisasi yang sama persis. */
export function normalisasiTeksKlaim(teks: string): string {
  return teks
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type HasilCocokKlaim = {
  bersama: KlaimBersama[];
  hanyaA: KlaimPerbandingan[];
  hanyaB: KlaimPerbandingan[];
};

/** Cocokkan klaim dua artikel berdasarkan teks ternormalisasi.
 *  Bila satu teks muncul >1 kali di satu artikel, pasangan
 *  pertama yang menang; sisanya masuk hanya-A / hanya-B (tidak
 *  dihitung ganda sebagai "bersama"). Klaim berteks kosong
 *  sesudah normalisasi tidak pernah dicocokkan. */
export function cocokkanKlaimDuaArtikel(
  klaimA: KlaimPerbandingan[],
  klaimB: KlaimPerbandingan[],
): HasilCocokKlaim {
  const indeksB = new Map<string, KlaimPerbandingan[]>();
  for (const k of klaimB) {
    const kunci = normalisasiTeksKlaim(k.teks);
    if (!kunci) continue;
    const daftar = indeksB.get(kunci) ?? [];
    daftar.push(k);
    indeksB.set(kunci, daftar);
  }
  const terpakaiB = new Set<string>();
  const bersama: KlaimBersama[] = [];
  const hanyaA: KlaimPerbandingan[] = [];
  for (const k of klaimA) {
    const kunci = normalisasiTeksKlaim(k.teks);
    const calon = kunci ? (indeksB.get(kunci) ?? []) : [];
    const pasangan = calon.find((c) => !terpakaiB.has(c.id));
    if (pasangan) {
      terpakaiB.add(pasangan.id);
      bersama.push({ teks: k.teks, klaimA: k, klaimB: pasangan });
    } else {
      hanyaA.push(k);
    }
  }
  const hanyaB = klaimB.filter((k) => !terpakaiB.has(k.id));
  return { bersama, hanyaA, hanyaB };
}

/** Rakit struktur perbandingan dari baris yang sudah diambil.
 *  Salah satu artikel null → tersedia=false + daftar kosong
 *  (bukan null). Kedua artikel ada → tersedia=true meski
 *  bersama=[] (tidak ada klaim bersama adalah hasil yang jujur,
 *  bukan galat). */
export function rakitPerbandinganDuaArtikel(
  artikelA: ArtikelPerbandinganRingkas | null,
  artikelB: ArtikelPerbandinganRingkas | null,
  klaimA: KlaimPerbandingan[],
  klaimB: KlaimPerbandingan[],
  sumberA: SumberArtikelPerbandingan[],
  sumberB: SumberArtikelPerbandingan[],
): PerbandinganDuaArtikel {
  const kosong: PerbandinganDuaArtikel = {
    tersedia: false,
    artikelA,
    artikelB,
    bersama: [],
    hanyaA: [],
    hanyaB: [],
    sumberA,
    sumberB,
  };
  if (!artikelA || !artikelB) return kosong;
  const { bersama, hanyaA, hanyaB } = cocokkanKlaimDuaArtikel(klaimA, klaimB);
  return {
    tersedia: true,
    artikelA,
    artikelB,
    bersama,
    hanyaA,
    hanyaB,
    sumberA,
    sumberB,
  };
}
