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
  /** Ringkasan sikap bukti (pf_evidence.arah) di balik klaim A.
   *  undefined = bukti tidak dibaca (getter gagal) — BUKAN
   *  "tanpa bukti". Total 0 = klaim itu memang tanpa bukti. */
  sikapA?: SikapBukti;
  /** Sama untuk klaim B. */
  sikapB?: SikapBukti;
};

/** Ringkasan sikap bukti (pf_evidence.arah) untuk SATU klaim:
 *  hitungan mesin dari kolom arah — bukan label opini.
 *  CATATAN JUJUR (v29, menggantikan v28): pipeline menulis
 *  arah secara DETERMINISTIK (pipeline.ts) — 'mendukung' bila
 *  kalimat pendukung verbatim ditemukan di sumber, 'netral'
 *  bila tidak ditemukan (sikap verbatim tidak terkonfirmasi);
 *  'menentang' HANYA dari label manual redaksi
 *  (/admin/label-sikap) — tidak pernah otomatis. Jadi
 *  'mendukung' di kedua sisi berarti kedua sisi punya kalimat
 *  pendukung verbatim, dan 'netral' berarti sikapnya belum
 *  terkonfirmasi — bukan "kedua artikel sepakat". */
export type SikapBukti = {
  mendukung: number;
  menentang: number;
  netral: number;
  total: number;
};

/** Hitung ringkasan sikap dari daftar nilai arah mentah.
 *  Nilai di luar taksonomi CHECK (mendukung/menentang/netral)
 *  diabaikan — tidak dihitung ke mana pun, bukan dipaksa netral. */
export function hitungSikapBukti(arah: string[]): SikapBukti {
  let mendukung = 0;
  let menentang = 0;
  let netral = 0;
  for (const a of arah) {
    if (a === "mendukung") mendukung += 1;
    else if (a === "menentang") menentang += 1;
    else if (a === "netral") netral += 1;
  }
  return { mendukung, menentang, netral, total: mendukung + menentang + netral };
}

/** Format ringkasan sikap untuk tampilan: hanya hitungan yang
 *  > 0 yang disebut ("2 mendukung · 1 netral"); total 0 =
 *  "tanpa bukti". */
export function formatSikapBukti(sikap: SikapBukti): string {
  if (sikap.total === 0) return "tanpa bukti";
  const bagian: string[] = [];
  if (sikap.mendukung > 0) bagian.push(`${sikap.mendukung} mendukung`);
  if (sikap.menentang > 0) bagian.push(`${sikap.menentang} menentang`);
  if (sikap.netral > 0) bagian.push(`${sikap.netral} netral`);
  return bagian.join(" · ");
}

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
 *  bukan galat).
 *  `sikapPerKlaim` (opsional, v28): peta id klaim -> ringkasan
 *  sikap bukti. Getter WAJIB mengisi entri untuk SETIAP id klaim
 *  yang dibaca (total 0 = "tanpa bukti"); id yang tidak ada di
 *  peta berarti buktinya tidak dibaca (sikap undefined). */
export function rakitPerbandinganDuaArtikel(
  artikelA: ArtikelPerbandinganRingkas | null,
  artikelB: ArtikelPerbandinganRingkas | null,
  klaimA: KlaimPerbandingan[],
  klaimB: KlaimPerbandingan[],
  sumberA: SumberArtikelPerbandingan[],
  sumberB: SumberArtikelPerbandingan[],
  sikapPerKlaim?: Map<string, SikapBukti>,
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
  if (sikapPerKlaim) {
    for (const pasangan of bersama) {
      pasangan.sikapA = sikapPerKlaim.get(pasangan.klaimA.id);
      pasangan.sikapB = sikapPerKlaim.get(pasangan.klaimB.id);
    }
  }
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
