// Klasifikasi ringan deterministik di ingestion — Fase 7 (b).
// BUKAN AI: aturan kata kunci dari judul + ringkasan + kategori
// feed + metadata sumber. Hasilnya berlabel eksplisit
// "otomatis, bisa dikoreksi editor" dan disimpan ke metadata item
// (bukan menimpa kategori editorial artikel — koreksi editor di
// Fase 8 yang akan menimpanya).
//
// Kata kunci diambil dari judul berita nyata (bukan karangan):
// aturan = kecocokan substring kata-per-kata setelah normalisasi
// judul (dedup.ts). Bila tidak ada kata kunci yang cocok, kategori
// dikembalikan null (jujur "tidak tahu") — JANGAN ditebak.
// Bahasa dideteksi dari stopword id vs en; negara hanya dari
// metadata sumber (GDELT sourcecountry), TIDAK ditebak dari teks.

import { normalisasiJudul, tokenJudul } from "./dedup.ts";

export const LABEL_KLASIFIKASI_OTOMATIS =
  "otomatis, bisa dikoreksi editor" as const;

export interface KlasifikasiOtomatis {
  /** Slug kategori utama (categories.ts) atau null bila tak dikenali. */
  kategori: string | null;
  /** Slug subkategori (categories.ts) atau null. */
  subkategori: string | null;
  /** Bahasa dominan judul+ringkasan ('id'/'en'), null bila tak ada teks. */
  bahasa: "id" | "en" | null;
  /** Kata kunci yang cocok (maks 5, urutan kemunculan). */
  kata_kunci: string[];
  /** Negara sumber dari metadata (mis. GDELT sourcecountry). */
  negara: string | null;
  /** Label kejujuran — selalu nilai konstanta di atas. */
  label: typeof LABEL_KLASIFIKASI_OTOMATIS;
}

// Satu aturan: subkategori <- daftar kata/frasa kunci (sudah
// ternormalisasi: lowercase, tanpa tanda baca — bandingkan dengan
// teks ternormalisasi yang sama). Urutan = prioritas bila skor seri.
const ATURAN: Array<{
  kategori: string;
  subkategori: string;
  kunci: string[];
}> = [
  {
    kategori: "indonesia",
    subkategori: "bencana",
    kunci: ["gempa", "tsunami", "banjir", "longsor", "erupsi", "gunung meletus", "kekeringan", "badai", "bnpb", "korban jiwa", "tanggap darurat"],
  },
  {
    kategori: "indonesia",
    subkategori: "hukum",
    kunci: ["korupsi", "kpk", "kejaksaan", "pengadilan", "tersangka", "terdakwa", "vonis", "sidang", "penegak hukum", "kuhp", "mahkamah agung", "mahkamah konstitusi", "polisi tangkap", "ditangkap"],
  },
  {
    kategori: "indonesia",
    subkategori: "politik",
    kunci: ["presiden", "pemilu", "pilkada", "dpr", "partai", "menteri", "kabinet", "parlemen", "koalisi", "oposisi", "capres", "cawapres", "kpu", "bawaslu", "pemilih"],
  },
  {
    kategori: "ekonomi",
    subkategori: "inflasi",
    kunci: ["inflasi", "harga naik", "daya beli"],
  },
  {
    kategori: "ekonomi",
    subkategori: "nilai-tukar",
    kunci: ["rupiah", "nilai tukar", "dolar", "kurs"],
  },
  {
    kategori: "ekonomi",
    subkategori: "pasar-saham",
    kunci: ["ihsg", "saham", "bursa efek", "indeks saham"],
  },
  {
    kategori: "ekonomi",
    subkategori: "suku-bunga",
    kunci: ["suku bunga", "bi rate", "bank indonesia", "the fed"],
  },
  {
    kategori: "ekonomi",
    subkategori: "ekonomi",
    kunci: ["ekonomi", "pdb", "apbn", "pajak", "ekspor", "impor", "investasi", "perdagangan", "umkm", "pertumbuhan ekonomi"],
  },
  {
    kategori: "teknologi",
    subkategori: "kecerdasan-buatan",
    kunci: ["kecerdasan buatan", "artificial intelligence", " ai ", "chatbot", "model bahasa", "llm"],
  },
  {
    kategori: "teknologi",
    subkategori: "keamanan-siber",
    kunci: ["siber", "peretasan", "diretas", "ransomware", "kebocoran data", "phishing"],
  },
  {
    kategori: "teknologi",
    subkategori: "teknologi",
    kunci: ["teknologi", "startup", "aplikasi", "internet", "digital", "chip", "robot", "satelit", "software", "gadget", "smartphone"],
  },
  {
    kategori: "sains",
    subkategori: "kesehatan",
    kunci: ["kesehatan", "vaksin", "penyakit", "rumah sakit", "dokter", "epidemi", "gizi", "obat", "kemenkes", "virus", "diabetes", "kanker", "wabah"],
  },
  {
    kategori: "sains",
    subkategori: "astronomi",
    kunci: ["astronomi", "planet", "gerhana", "teleskop", "nasa", "antariksa", "roket", "satelit luar angkasa"],
  },
  {
    kategori: "sains",
    subkategori: "penelitian-ilmiah",
    kunci: ["penelitian", "ilmuwan", "peneliti", "jurnal ilmiah", "studi", "temuan ilmiah", "riset"],
  },
  {
    kategori: "pendidikan",
    subkategori: "pendidikan-indonesia",
    kunci: ["pendidikan", "sekolah", "kampus", "universitas", "guru", "siswa", "mahasiswa", "beasiswa", "kurikulum", "snbt", "utbk", "ppdb"],
  },
  {
    kategori: "lingkungan-energi",
    subkategori: "perubahan-iklim",
    kunci: ["perubahan iklim", "iklim", "pemanasan global", "emisi karbon", "cop", "cuaca ekstrem"],
  },
  {
    kategori: "lingkungan-energi",
    subkategori: "energi-terbarukan",
    kunci: ["energi terbarukan", "panel surya", "plta", "pltb", "geotermal", "energi surya"],
  },
  {
    kategori: "lingkungan-energi",
    subkategori: "lingkungan",
    kunci: ["lingkungan", "hutan", "deforestasi", "konservasi", "sampah", "polusi", "tambang", "pertambangan"],
  },
  {
    kategori: "dunia",
    subkategori: "konflik-internasional",
    kunci: ["perang", "konflik", "invasi", "serangan militer", "gencatan senjata", "rudal", "militer"],
  },
  {
    kategori: "dunia",
    subkategori: "geopolitik",
    kunci: ["geopolitik", "diplomasi", "pbb", "asean", "uni eropa", "hubungan bilateral", "presiden amerika", "china", "rusia", "ukraina", "timur tengah", "gaza", "israel"],
  },
  {
    kategori: "dunia",
    subkategori: "ekonomi-global",
    kunci: ["ekonomi global", "resesi global", "bank dunia", "imf", "perdagangan global", "the fed", "wall street"],
  },
];

const STOPWORD_ID = new Set([
  "yang", "dan", "di", "ke", "dari", "untuk", "dengan", "pada",
  "adalah", "ini", "itu", "dalam", "sebagai", "oleh", "akan",
  "telah", "sudah", "juga", "tidak", "ada", "saat", "usai",
  "atau", "jika", "karena", "tentang", "setelah", "sebelum",
  "lebih", "para", "hingga", "antara", "atas", "bagi", "kini",
  "baru", "satu", "dua", "tiga", "masih", "kembali",
]);

const STOPWORD_EN = new Set([
  "the", "and", "for", "with", "from", "after", "says", "said",
  "will", "would", "could", "about", "into", "over", "under",
  "more", "than", "that", "this", "when", "what", "have", "has",
  "been", "were", "was", "are", "but", "not", "its", "his", "her",
  "their", "they", "them", "then", "there", "here", "also",
]);

function deteksiBahasa(teksNormal: string): "id" | "en" | null {
  const kata = teksNormal.split(" ").filter(Boolean);
  if (kata.length === 0) return null;
  let id = 0;
  let en = 0;
  for (const k of kata) {
    if (STOPWORD_ID.has(k)) id += 1;
    if (STOPWORD_EN.has(k)) en += 1;
  }
  if (id === 0 && en === 0) return null;
  return id >= en ? "id" : "en";
}

/**
 * Klasifikasikan satu item dari judul + ringkasan + kategori feed
 * + metadata sumber. Fungsi murni dan deterministik: input sama ->
 * hasil sama. Skor = jumlah kata kunci yang cocok (frasa dihitung
 * dari teks ternormalisasi, kata tunggal dari token judul).
 * Seri -> aturan yang lebih dulu dalam daftar menang.
 */
export function klasifikasikanItem(input: {
  judul: string;
  ringkasan?: string | null;
  kategoriFeed?: string[];
  metadata?: Record<string, unknown> | null;
}): KlasifikasiOtomatis {
  const judul = input.judul ?? "";
  const ringkasan = input.ringkasan ?? "";
  const teks = normalisasiJudul(`${judul} ${ringkasan}`);
  const token = new Set(tokenJudul(`${judul} ${ringkasan}`));
  const teksBerbatas = ` ${teks} `;

  let terbaik: { kategori: string; subkategori: string; skor: number } | null =
    null;
  const cocokSemua: string[] = [];
  for (const aturan of ATURAN) {
    let skor = 0;
    for (const k of aturan.kunci) {
      const kunciNormal = normalisasiJudul(k);
      const kena = kunciNormal.includes(" ")
        ? teksBerbatas.includes(` ${kunciNormal} `)
        : token.has(kunciNormal);
      if (kena) {
        skor += 1;
        if (!cocokSemua.includes(k)) cocokSemua.push(k);
      }
    }
    if (skor > 0 && (!terbaik || skor > terbaik.skor)) {
      terbaik = { kategori: aturan.kategori, subkategori: aturan.subkategori, skor };
    }
  }

  // Kategori feed (mis. "Politik" dari RSS) dipakai HANYA bila tidak
  // ada kata kunci yang cocok — dan hanya bila teksnya cocok persis
  // dengan subkategori yang dikenal (bukan ditebak bebas).
  if (!terbaik && input.kategoriFeed) {
    for (const kat of input.kategoriFeed) {
      const normal = normalisasiJudul(kat);
      const kena = ATURAN.find((a) => normalisasiJudul(a.subkategori) === normal);
      if (kena) {
        terbaik = { kategori: kena.kategori, subkategori: kena.subkategori, skor: 0 };
        break;
      }
    }
  }

  const negara =
    input.metadata && typeof input.metadata.negara_sumber === "string"
      ? (input.metadata.negara_sumber as string)
      : null;

  return {
    kategori: terbaik?.kategori ?? null,
    subkategori: terbaik?.subkategori ?? null,
    bahasa: deteksiBahasa(teks),
    kata_kunci: cocokSemua.slice(0, 5),
    negara,
    label: LABEL_KLASIFIKASI_OTOMATIS,
  };
}
