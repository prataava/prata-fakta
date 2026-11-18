// Baterai hard gates auto-publish (v27, 18 Nov 2026).
//
// Menguji src/lib/admin/hard-gates.ts + wiring terbitkanOtomatis
// TANPA database produksi dan TANPA artikel nyata: semua data
// lewat adapter mock in-memory. Mock di sini BUKAN dummy news
// produksi — hanya fixture uji.
//
// Seksi:
//   A  deteksiTopikSensitif (pure): kategori + kata kunci.
//   B  urlReferensiValid (pure).
//   C  evaluasiHardGate dengan adapter mock: tiap gate G1–G6
//      menggagalkan draf yang melanggar, dan draf bersih LOLOS.
//   D  Wiring statis: terbitkanOtomatis memanggil evaluasiHardGate
//      + audit mencatat hard_gates; rumus FACT SCORE tidak diubah
//      (fact-score.ts tidak disentuh gate ini).
//
// Jalankan: node scripts/uji-hard-gates.mjs  (keluar 0 = lolos)
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const path = require("node:path");
const fs = require("node:fs");

const DIR_REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

let lolos = 0;
let gagal = 0;
function cek(label, kondisi, detail = "") {
  if (kondisi) {
    lolos++;
    console.log(`  OK ${label}`);
  } else {
    gagal++;
    console.log(`  GAGAL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const hardGates = await import(
  path.join(DIR_REPO, "src/lib/admin/hard-gates.ts")
);
const { deteksiTopikSensitif, urlReferensiValid, evaluasiHardGate } = hardGates;

// ---------- Fixture ----------
// Draf bersih: ekonomi, 2 sumber, klaim didukung, tanggal baru.
const SEKARANG = new Date("2026-11-18T07:00:00+07:00");
const TANGGAL_BARU = "2026-11-17T10:00:00+07:00";
const ARTIKEL_BERSIH = {
  id: "artikel-1",
  judul: "Bank Indonesia tahan suku bunga acuan di 5,50 persen",
  ringkasan: "Ringkasan singkat.",
  isi: "Bank Indonesia menahan suku bunga acuan di 5,50 persen. Keputusan ini didukung dua sumber independen.\n\nYang belum diketahui\nDampak lanjutan keputusan ini belum diumumkan.",
  kategori_slug: "ekonomi",
  subkategori_slug: null,
  status_verifikasi: "CROSS-CHECKED",
  status: "draft",
  sumber_url: "https://www.antaranews.com/berita/contoh",
  fakta_penting: ["Bank Indonesia menahan suku bunga acuan di 5,50 persen."],
};
const VERIFIKASI = {
  id: "ver-1",
  artikel_id: "artikel-1",
  raw_item_id: "item-1",
  agen: "fact_verification",
  keputusan: "CROSS-CHECKED",
  catatan: "ok",
  bukti: null,
  dibuat_oleh: null,
  dibuat_pada: "2026-11-17T10:00:00Z",
};

function adapterMock(ubah = {}) {
  const dasar = {
    sumber: [
      { sumber_id: "sumber-a", url: "https://www.antaranews.com/berita/contoh" },
      { sumber_id: "sumber-b", url: "https://www.cnbcindonesia.com/news/contoh" },
    ],
    klaim: [
      { id: "klaim-1", teks: "Bank Indonesia menahan suku bunga acuan di 5,50 persen.", jenis: "angka", status: "terverifikasi" },
    ],
    evidence: [
      { id: "ev-1", klaim_id: "klaim-1", sumber_url: "https://www.antaranews.com/berita/contoh", sumber_nama: "Antara", kutipan: "Bank Indonesia menahan suku bunga acuan di 5,50 persen.", arah: "mendukung" },
      { id: "ev-2", klaim_id: "klaim-1", sumber_url: "https://www.cnbcindonesia.com/news/contoh", sumber_nama: "CNBC Indonesia", kutipan: "Bank Indonesia menahan suku bunga acuan di 5,50 persen.", arah: "mendukung" },
    ],
    tanggal: [TANGGAL_BARU],
  };
  const data = { ...dasar, ...ubah };
  return {
    listSumberArtikel: async () => data.sumber,
    listKlaimArtikel: async () => data.klaim,
    listEvidenceArtikel: async () => data.evidence,
    listTanggalSumberArtikel: async () => data.tanggal,
  };
}

// ---------- §A: deteksi topik sensitif ----------
console.log("\n--- A. deteksiTopikSensitif ---");
cek(
  "A1 ekonomi bersih bukan sensitif",
  deteksiTopikSensitif({
    kategori_slug: "ekonomi",
    judul: "Bank Indonesia tahan suku bunga",
    isi: "Keputusan suku bunga.",
  }).sensitif === false,
);
cek(
  "A2 kategori konflik-internasional sensitif",
  deteksiTopikSensitif({
    kategori_slug: "dunia",
    subkategori_slug: "konflik-internasional",
    judul: "Perundingan damai berlanjut",
    isi: "Perundingan.",
  }).sensitif === true,
);
cek(
  "A3 kategori hukum sensitif",
  deteksiTopikSensitif({
    kategori_slug: "indonesia",
    subkategori_slug: "hukum",
    judul: "Sidang lanjutan perkara",
    isi: "Sidang.",
  }).sensitif === true,
);
cek(
  "A4 kata kunci 'tersangka' sensitif",
  deteksiTopikSensitif({
    kategori_slug: "indonesia",
    judul: "Polisi tetapkan tersangka kasus penipuan",
    isi: "Tersangka ditahan.",
  }).sensitif === true,
);
cek(
  "A5 kata kunci 'wabah' sensitif",
  deteksiTopikSensitif({
    kategori_slug: "sains",
    judul: "Wabah penyakit meluas di tiga provinsi",
    isi: "Wabah penyakit.",
  }).sensitif === true,
);
cek(
  "A6 'konflik kepentingan' ikut sensitif (fail-closed)",
  deteksiTopikSensitif({
    kategori_slug: "ekonomi",
    judul: "Dewan soroti konflik kepentingan direksi",
    isi: "Konflik kepentingan.",
  }).sensitif === true,
);
cek(
  "A7 kata kunci 'teror' sensitif",
  deteksiTopikSensitif({
    kategori_slug: "dunia",
    judul: "Aksi teror di pasar",
    isi: "Teror.",
  }).sensitif === true,
);

// ---------- §B: URL referensi ----------
console.log("\n--- B. urlReferensiValid ---");
cek("B1 https valid", urlReferensiValid("https://www.antaranews.com/a") === true);
cek("B2 http ditolak", urlReferensiValid("http://example.com/a") === false);
cek("B3 tanpa host ditolak", urlReferensiValid("https://") === false);
cek("B4 null ditolak", urlReferensiValid(null) === false);
cek("B5 teks biasa ditolak", urlReferensiValid("bukan url") === false);

// ---------- §C: evaluasiHardGate ----------
console.log("\n--- C. evaluasiHardGate (adapter mock) ---");
{
  const hasil = await evaluasiHardGate(
    adapterMock(),
    ARTIKEL_BERSIH,
    VERIFIKASI,
    SEKARANG,
  );
  cek("C1 draf bersih LOLOS semua gate", hasil.lolos === true, JSON.stringify(hasil.rincian));
  cek("C2 rincian memuat G1–G6", ["G1", "G2", "G3", "G4", "G5", "G6"].every((g) => hasil.rincian[g]?.lolos === true));
}
{
  const hasil = await evaluasiHardGate(
    adapterMock({ sumber: [{ sumber_id: "sumber-a", url: "https://www.antaranews.com/berita/contoh" }] }),
    ARTIKEL_BERSIH,
    VERIFIKASI,
    SEKARANG,
  );
  cek("C3 satu sumber gagal G1", hasil.lolos === false && hasil.gate === "G1", hasil.alasan ?? "");
}
{
  const hasil = await evaluasiHardGate(
    adapterMock({
      sumber: [
        { sumber_id: "sumber-a", url: "https://www.antaranews.com/berita/contoh" },
        { sumber_id: "sumber-a", url: "https://www.antaranews.com/berita/contoh-2" },
      ],
    }),
    ARTIKEL_BERSIH,
    VERIFIKASI,
    SEKARANG,
  );
  cek("C4 sumber_id sama 2x tetap gagal G1 (bukan 2 independen)", hasil.lolos === false && hasil.gate === "G1", hasil.alasan ?? "");
}
{
  const hasil = await evaluasiHardGate(
    adapterMock({
      evidence: [
        { id: "ev-1", klaim_id: "klaim-1", sumber_url: "https://www.antaranews.com/berita/contoh", sumber_nama: "Antara", kutipan: "Bank Indonesia menahan suku bunga acuan di 5,50 persen.", arah: "mendukung" },
        { id: "ev-2", klaim_id: "klaim-1", sumber_url: "https://www.cnbcindonesia.com/news/contoh", sumber_nama: "CNBC", kutipan: "Bank Indonesia justru menaikkan suku bunga.", arah: "menentang" },
      ],
    }),
    ARTIKEL_BERSIH,
    VERIFIKASI,
    SEKARANG,
  );
  cek("C5 evidence menentang gagal G2", hasil.lolos === false && hasil.gate === "G2", hasil.alasan ?? "");
}
{
  const hasil = await evaluasiHardGate(
    adapterMock({
      sumber: [
        { sumber_id: "sumber-a", url: "https://www.antaranews.com/berita/contoh" },
        { sumber_id: "sumber-b", url: "bukan-url" },
      ],
    }),
    ARTIKEL_BERSIH,
    VERIFIKASI,
    SEKARANG,
  );
  cek("C6 referensi bukan-URL gagal G3", hasil.lolos === false && hasil.gate === "G3", hasil.alasan ?? "");
}
{
  const hasil = await evaluasiHardGate(
    adapterMock({ klaim: [] }),
    ARTIKEL_BERSIH,
    VERIFIKASI,
    SEKARANG,
  );
  cek("C7 tanpa klaim gagal G4", hasil.lolos === false && hasil.gate === "G4", hasil.alasan ?? "");
}
{
  const hasil = await evaluasiHardGate(
    adapterMock({ tanggal: ["2026-10-01T10:00:00+07:00"] }),
    ARTIKEL_BERSIH,
    VERIFIKASI,
    SEKARANG,
  );
  cek("C8 sumber berumur 48 hari gagal G5", hasil.lolos === false && hasil.gate === "G5", hasil.alasan ?? "");
}
{
  const hasil = await evaluasiHardGate(
    adapterMock({ tanggal: [] }),
    ARTIKEL_BERSIH,
    VERIFIKASI,
    SEKARANG,
  );
  cek("C9 tanpa tanggal sumber gagal G5", hasil.lolos === false && hasil.gate === "G5", hasil.alasan ?? "");
}
{
  const hasil = await evaluasiHardGate(
    adapterMock(),
    {
      ...ARTIKEL_BERSIH,
      judul: "Polisi tetapkan tersangka kasus penipuan investasi",
      isi: "Polisi menetapkan tersangka kasus penipuan investasi.",
    },
    VERIFIKASI,
    SEKARANG,
  );
  cek("C10 topik sensitif gagal G6 walau data bersih", hasil.lolos === false && hasil.gate === "G6", hasil.alasan ?? "");
}
{
  // G4: angka di isi tanpa jejak klaim/evidence.
  const hasil = await evaluasiHardGate(
    adapterMock(),
    {
      ...ARTIKEL_BERSIH,
      isi: "Bank Indonesia menahan suku bunga acuan di 5,50 persen. Cadangan devisa naik menjadi 155 miliar dolar AS.\n\nYang belum diketahui\nDampak lanjutan keputusan ini belum diumumkan.",
    },
    VERIFIKASI,
    SEKARANG,
  );
  cek("C11 angka tanpa bukti gagal G4", hasil.lolos === false && hasil.gate === "G4", hasil.alasan ?? "");
}

// ---------- §D: wiring statis ----------
console.log("\n--- D. wiring statis ---");
const isiAutoPublish = fs.readFileSync(
  path.join(DIR_REPO, "src/lib/admin/auto-publish.ts"),
  "utf8",
);
cek(
  "D1 terbitkanOtomatis memanggil evaluasiHardGate",
  isiAutoPublish.includes("evaluasiHardGate(adapter, artikel, verifikasi)"),
);
cek(
  "D2 audit terbit mencatat hard_gates",
  isiAutoPublish.includes("hard_gates: hardGate.rincian"),
);
cek(
  "D3 HasilAutoPublish membawa hardGates",
  isiAutoPublish.includes("hardGates?:"),
);
const isiFactScore = fs.readFileSync(
  path.join(DIR_REPO, "src/lib/fact-score.ts"),
  "utf8",
);
cek(
  "D4 rumus FACT SCORE tidak disentuh gate (tidak ada sebutan hard gate di fact-score.ts)",
  !isiFactScore.includes("hard") && !isiFactScore.includes("HardGate"),
);
// Pastikan berkas hard-gates tidak mengubah ambang auto-publish.
const isiHardGates = fs.readFileSync(
  path.join(DIR_REPO, "src/lib/admin/hard-gates.ts"),
  "utf8",
);
cek(
  "D5 hard-gates tidak mengubah AMBANG_AUTO_PUBLISH",
  !isiHardGates.includes("AMBANG_AUTO_PUBLISH"),
);

console.log(`\nRingkasan: ${lolos} lolos, ${gagal} gagal.`);
process.exit(gagal === 0 ? 0 : 1);
