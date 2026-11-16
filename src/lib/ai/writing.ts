// Agen Article Writing PRATA FAKTA — draf artikel orisinal Bahasa
// Indonesia yang tersusun HANYA dari klaim terverifikasi + metadata.
// Aturan keras:
//   - Hanya item berkeputusan VERIFIED/CROSS-CHECKED yang dibuatkan
//     draf (dipaksakan pipeline; fungsi ini menolak keputusan lain).
//   - Setiap kalimat harus tertelusur ke klaim/metadata — JANGAN tambah
//     angka/nama/tanggal/kutipan baru.
//   - Bagian "Yang belum diketahui" JUJUR: menyatakan apa yang tidak
//     dikatakan sumber, bukan mengarang.
//   - status='draft' (TIDAK PERNAH auto-terbit), penulis
//     'Redaksi PRATA FAKTA (draf pipeline)' — label jujur (N-T1):
//     draf ini hasil 10 langkah pipeline deterministik, bukan
//     tulisan agen LLM.
//   - kategori_slug via klasifikasi kata kunci deterministik ke
//     kategori utama v1; fallback terdokumentasi (lihat
//     klasifikasikanKategori).
import { buatSlugArtikel } from "./slug.ts";
import type { KlaimTerekstrak } from "./research.ts";
import type {
  KategoriSlug,
  RawItemAntrean,
  SimpanArtikelInput,
} from "./types.ts";

export const PENULIS_DRAF_AI = "Redaksi PRATA FAKTA (draf pipeline)";

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
  const { item, klaim, ringkasan, keputusan } = input;
  if (klaim.length === 0) {
    throw new Error(
      "Draf membutuhkan minimal 1 klaim terverifikasi — item tanpa klaim tidak dibuatkan draf.",
    );
  }
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
