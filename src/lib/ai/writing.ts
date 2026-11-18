// Agen Article Writing PRATA FAKTA — draf artikel orisinal Bahasa
// Indonesia yang tersusun HANYA dari klaim terverifikasi + metadata.
// Aturan keras:
//   - Hanya item berkeputusan VERIFIED/CROSS-CHECKED yang dibuatkan
//     draf (dipaksakan pipeline; fungsi ini menolak keputusan lain).
//   - Setiap kalimat harus tertelusur ke klaim/metadata — JANGAN tambah
//     angka/nama/tanggal/kutipan baru.
//   - Bagian "Yang belum diketahui" JUJUR: menyatakan apa yang tidak
//     dikatakan sumber, bukan mengarang.
//   - Kutipan (klaim jenis 'kutipan') dibatasi 300 karakter SAAT
//     DRAF DIBUAT (Fase 10, BATAS_KUTIPAN_DRAF) — bukan hanya di
//     tampilan; klaim yang dipotong ditandai "…" dan klaim asli
//     di pf_claims tetap utuh.
//   - status='draft' (TIDAK PERNAH auto-terbit), penulis
//     'Redaksi PRATA FAKTA (draf pipeline)' — label jujur (N-T1):
//     draf ini hasil 10 langkah pipeline deterministik, bukan
//     tulisan agen LLM.
//   - kategori_slug via klasifikasi kata kunci deterministik ke
//     kategori utama v1; fallback terdokumentasi (lihat
//     klasifikasikanKategori).
import { buatSlugArtikel } from "./slug.ts";
import type { KlaimTerekstrak } from "./research.ts";
import { normalisasiTeks } from "./research.ts";
import type {
  KategoriSlug,
  RawItemAntrean,
  SimpanArtikelInput,
} from "./types.ts";

export const PENULIS_DRAF_AI = "Redaksi PRATA FAKTA (draf pipeline)";

// ---------- Batas kutipan (Fase 10) ----------
// Kutipan di draf dibatasi 300 karakter — ditegakkan DI SINI, saat
// draf dibuat (bukan hanya di tampilan). Sebelum Fase 10, batas
// 300 karakter hanya hidup di research.ts (cariKalimatKutipan
// memotong kutipan evidence) — klaim 'kutipan' yang panjang tetap
// disalin utuh ke draf oleh susunDrafArtikel. Aturan:
//   - klaim jenis 'kutipan' yang panjangnya > 300 karakter
//     DIPOTONG ke 300 karakter (ekor dipotong, ditandai "…") di
//     semua tempat draf memakai teks klaim itu (pembuka, daftar
//     fakta, subjudul, fakta_penting).
//   - klaim jenis lain TIDAK dipotong (bukan kutipan — angka/fakta
//     panjang adalah ringkasan klaim, bukan kutipan verbatim).
//   - pemotongan TIDAK mengubah klaim tersimpan di pf_claims —
//     hanya teks yang tampil di draf. quality-check.ts
//     (K1) memeriksa ulang draf hasil pemotongan ini.
//   - klaimKutipanMelebihiBatas() dipakai pipeline/tests untuk
//     mencatat klaim mana yang dipotong (transparansi).
export const BATAS_KUTIPAN_DRAF = 300;

/** Potong klaim 'kutipan' yang melebihi batas; jenis lain utuh. */
export function potongKutipanPanjang(
  klaim: KlaimTerekstrak,
): KlaimTerekstrak {
  if (klaim.jenis !== "kutipan") return klaim;
  if (klaim.teks.length <= BATAS_KUTIPAN_DRAF) return klaim;
  return {
    ...klaim,
    teks: `${klaim.teks.slice(0, BATAS_KUTIPAN_DRAF).trimEnd()}…`,
  };
}

/** Klaim 'kutipan' dari daftar yang akan dipotong saat draf dibuat. */
export function klaimKutipanMelebihiBatas(
  klaim: KlaimTerekstrak[],
): KlaimTerekstrak[] {
  return klaim.filter(
    (k) => k.jenis === "kutipan" && k.teks.length > BATAS_KUTIPAN_DRAF,
  );
}

// ---------- Penurunan kutipan tanpa bukti (v29) ----------
// Klaim jenis 'kutipan' yang TIDAK PUNYA satu pun baris evidence
// dengan kalimat kutipan yang benar-benar ditemukan di sumber
// DITURUNKAN menjadi 'fakta' (parafrasa) sebelum draf dibangun.
// Alasan (terverifikasi dari kode, akar run pipeline #32 18 Nov
// 2026): susunDrafArtikel TIDAK PERNAH menampilkan kutipan
// verbatim (semua klaim dirender sebagai butir polos "- teks."),
// jadi draf tidak pernah "mengutip" apa pun — tetapi
// quality-check K3 tetap menuntut kalimat kutipan verbatim untuk
// SETIAP klaim jenis 'kutipan'. Akibatnya draf yang isinya hanya
// parafrasa tetap ditolak (3 item di run #32) dan dicoba lagi
// tiap run tanpa pernah lolos. Penurunan ini menyelaraskan
// gerbang dengan penyajian draf: yang dirender sebagai parafrasa
// hanya butuh evidence substansi (baris evidence tetap wajib
// ada — K5 tidak berubah), dan kutipan verbatim yang BENAR-BENAR
// ditampilkan draf (segmen berpetik di teks) TETAP diperiksa K3
// loop kedua — fail-closed TIDAK dilonggarkan.
//   - Klaim 'kutipan' DENGAN kalimat kutipan evidence: utuh.
//   - Klaim 'kutipan' TANPA kalimat kutipan: jenis -> 'fakta'
//     DAN tanda kutip ("...") dilepas dari teksnya — draf
//     merender teks klaim apa adanya, jadi tanpa pelepasan ini
//     draf tetap menampilkan segmen berpetik dan K3 loop kedua
//     (segmen berpetik wajib tertelusur ke klaim 'kutipan'
//     terverifikasi) tetap menolaknya. Isi substansi
//     dipertahankan sebagai pernyataan biasa (termasuk
//     atribusi "kata X" bila ada) — bukan kutipan verbatim.
//     Klaim tersimpan di pf_claims TIDAK diubah — hanya daftar
//     in-memory untuk draf ini. Daftar yang diturunkan
//     dikembalikan agar pipeline mencatatnya di detail run
//     (transparansi).
// Murni (tanpa I/O) seperti potongKutipanPanjang di atas.
export interface BuktiKutipanMinimal {
  klaim_teks: string;
  kutipan?: string | null;
}

export interface HasilTurunKutipan {
  /** Daftar klaim untuk draf + quality-check (sudah diturunkan). */
  klaim: KlaimTerekstrak[];
  /** Klaim asal yang diturunkan (jenis semula 'kutipan'). */
  diturunkan: KlaimTerekstrak[];
}

export function turunkanKutipanTanpaBukti(
  klaim: KlaimTerekstrak[],
  evidence: BuktiKutipanMinimal[],
): HasilTurunKutipan {
  const diturunkan: KlaimTerekstrak[] = [];
  const hasil = klaim.map((k) => {
    if (k.jenis !== "kutipan") return k;
    const inti = normalisasiTeks(k.teks);
    const berbukti = evidence.some(
      (e) =>
        normalisasiTeks(e.klaim_teks) === inti &&
        typeof e.kutipan === "string" &&
        e.kutipan.trim().length > 0,
    );
    if (berbukti) return k;
    // Turunkan + lepas tanda kutip (lihat komentar di atas).
    const teksParafrasa = k.teks
      .replace(/["""]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const turun: KlaimTerekstrak = { ...k, jenis: "fakta", teks: teksParafrasa };
    diturunkan.push(k);
    return turun;
  });
  return { klaim: hasil, diturunkan };
}

// ---------- Klasifikasi kategori (deterministik, kata kunci) ----------

const KATA_KUNCI_KATEGORI: Array<{ kategori: KategoriSlug; kata: string[] }> = [
  {
    kategori: "ekonomi",
    kata: [
      "rupiah", "dolar", "inflasi", "saham", "bursa", "ihsg",
      "bank indonesia", "suku bunga", "pajak", "apbn", "ekspor",
      "impor", "investasi", "pasar modal", "kurs", "harga emas",
      "ekonomi", "umkm", "defisit", "surplus", "utang negara",
    ],
  },
  {
    kategori: "teknologi",
    kata: [
      "kecerdasan buatan", "artificial intelligence", "teknologi",
      "digital", "internet", "aplikasi", "siber", "startup",
      "robot", "semikonduktor", "chip", "software",
      "perangkat lunak", "data center", "satelit", "gadget",
    ],
  },
  {
    kategori: "sains",
    kata: [
      "penelitian", "ilmuwan", "kesehatan", "penyakit", "vaksin",
      "virus", "astronomi", "antariksa", "spesies", "fosil",
      "genom", "klinis", "obat", "peneliti",
    ],
  },
  {
    kategori: "pendidikan",
    kata: [
      "sekolah", "siswa", "guru", "kampus", "universitas",
      "beasiswa", "ujian", "kurikulum", "mahasiswa", "pendidikan",
      "snbt", "ppdb", "dosen", "pelajar",
    ],
  },
  {
    kategori: "lingkungan-energi",
    kata: [
      "iklim", "bencana", "banjir", "gempa", "hutan", "energi",
      "listrik", "batu bara", "tambang", "lingkungan", "polusi",
      "emisi", "tsunami", "gunung berapi", "kekeringan",
      "energi terbarukan",
    ],
  },
  {
    kategori: "dunia",
    kata: [
      "amerika", "tiongkok", "china", "rusia", "ukraina", "eropa",
      "inggris", "pbb", "timur tengah", "israel", "palestina",
      "india", "jepang", "korea", "australia", "internasional",
      "global", "diplomasi",
    ],
  },
  {
    kategori: "indonesia",
    kata: [
      "indonesia", "jakarta", "presiden", "prabowo", "dpr",
      "pemerintah", "menteri", "pilkada", "nkri", "jawa",
      "sumatera", "kalimantan", "sulawesi", "papua", "bali",
    ],
  },
];

// Skor = jumlah kata kunci berbeda yang cocok (batas kata, bukan
// substring sembarangan). Seri diputuskan oleh urutan daftar di atas
// (ekonomi didahulukan). Bila TIDAK ADA kata kunci yang cocok:
// fallback 'indonesia' bila sumber Indonesia, 'dunia' bila sumber
// asing/GDELT (nama mengandung 'gdelt' atau 'bbc').
export function klasifikasikanKategori(
  teks: string,
  sumberNama: string,
): KategoriSlug {
  const normal = ` ${teks
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")} `;
  let terbaik: KategoriSlug | null = null;
  let skorTerbaik = 0;
  for (const { kategori, kata } of KATA_KUNCI_KATEGORI) {
    let skor = 0;
    for (const k of kata) {
      if (normal.includes(` ${k} `)) skor += 1;
    }
    if (skor > skorTerbaik) {
      skorTerbaik = skor;
      terbaik = kategori;
    }
  }
  if (terbaik) return terbaik;
  const nama = sumberNama.toLowerCase();
  if (nama.includes("gdelt") || nama.includes("bbc")) return "dunia";
  return "indonesia";
}

// ---------- Penyusunan draf ----------

export interface SumberDraf {
  nama: string;
  url: string;
}

export interface MasukanDraf {
  item: RawItemAntrean;
  klaim: KlaimTerekstrak[];
  ringkasan: string;
  keputusan: "VERIFIED" | "CROSS-CHECKED";
  sumber: SumberDraf[];
  kategoriSlug?: KategoriSlug;
}

const TEKS_BELUM_DIKETAHUI =
  "Sumber-sumber di atas tidak menyebutkan rincian di luar klaim yang tercantum " +
  "— termasuk latar belakang tambahan, tanggapan pihak terkait, dan perkembangan " +
  "terbaru sesudah waktu terbit. Bagian ini wajib dilengkapi editor manusia " +
  "sebelum artikel diterbitkan.";

function pastikanTitik(kalimat: string): string {
  const bersih = kalimat.trim();
  if (!bersih) return bersih;
  return /[.!?…]$/.test(bersih) ? bersih : `${bersih}.`;
}

export function susunDrafArtikel(input: MasukanDraf): SimpanArtikelInput {
  const { item, ringkasan, keputusan } = input;
  if (input.klaim.length === 0) {
    throw new Error(
      "Draf membutuhkan minimal 1 klaim terverifikasi — item tanpa klaim tidak dibuatkan draf.",
    );
  }
  // Fase 10: tegakkan batas kutipan 300 karakter SEBELUM teks klaim
  // dipakai di bagian mana pun draf (klaim asli di pf_claims utuh).
  const klaim = input.klaim.map(potongKutipanPanjang);
  const sumber = input.sumber.length > 0
    ? input.sumber
    : [{ nama: item.sumber_nama, url: item.url }];
  const namaUtama = sumber[0].nama;
  const kategori =
    input.kategoriSlug ??
    klasifikasikanKategori(`${item.judul} ${ringkasan}`, namaUtama);

  const klaimUtama = pastikanTitik(klaim[0].teks);
  const pembuka =
    `${klaimUtama} Informasi ini dihimpun redaksi dari ${namaUtama}.`;

  const daftarFakta = klaim
    .map((k) => `- ${pastikanTitik(k.teks)}`)
    .join("\n");
  const daftarSumber = sumber
    .map((s) => `- ${s.nama} — ${s.url}`)
    .join("\n");

  const isi = [
    pembuka,
    `Fakta utama:\n${daftarFakta}`,
    `Sumber:\n${daftarSumber}`,
    `Yang belum diketahui:\n${TEKS_BELUM_DIKETAHUI}`,
  ].join("\n\n");

  return {
    // Slug per item (Tahap E): judul identik dari dua outlet harus
    // tetap menghasilkan slug berbeda (lihat buatSlugArtikel).
    slug: buatSlugArtikel(item.judul, item.id),
    judul: item.judul,
    subjudul: klaim[0].teks.slice(0, 200),
    ringkasan,
    isi,
    kategori_slug: kategori,
    status_verifikasi: keputusan,
    sumber_url: item.url,
    penulis_nama: PENULIS_DRAF_AI,
    raw_item_id: item.id,
    // Foto sumber (bila item memilikinya) — dibawa ke artikel.
    gambar_url: item.gambar_url ?? null,
    fakta_penting: klaim.map((k) => k.teks),
    kronologi: [
      {
        tanggal: item.waktu_terbit_asli,
        peristiwa: item.judul,
        sumber: namaUtama,
      },
    ],
    mengapa_penting:
      `Peristiwa ini tercatat dalam pemberitaan ${namaUtama} dan ` +
      `terverifikasi dari ${sumber.length} sumber independen. ` +
      `Dampak dan konteks lebih lanjut menunggu peninjauan editor.`,
    belum_diketahui: TEKS_BELUM_DIKETAHUI,
  };
}
