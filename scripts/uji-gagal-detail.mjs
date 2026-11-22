// Baterai uji rincian kegagalan per item (gagal_detail) — 22 Nov 2026.
// Akar: run #43 pipeline editorial gagal (gagal=2 di panggilan 3)
// tanpa satu pun jejak identitas item di log GitHub Actions —
// hanya agregat `gagal=N`, sehingga item penyebab tidak bisa
// dilacak dari luar DB.
// Yang diuji: jalankanPipelineEditorial mencatat setiap item yang
// dihitung `gagal` ke `hasil.gagal_detail` (item_id, judul, tahap,
// pesan galat), memakai mock adapter — TANPA DB produksi.
// URL memakai host .invalid (DNS gagal seketika) agar telitiItem
// memakai fallback ringkasan, bukan fetch jaringan.
// Jalankan:
//   node --experimental-strip-types scripts/jalankan-baterai.mjs scripts/uji-gagal-detail.mjs
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import { jalankanPipelineEditorial } from "../src/lib/ai/pipeline.ts";

let lolos = 0;
let gagal = 0;

function periksa(nama, kondisi, rincian = "") {
  if (kondisi) {
    lolos += 1;
    console.log(`OK: ${nama}`);
  } else {
    gagal += 1;
    console.error(`GAGAL: ${nama}${rincian ? ` — ${rincian}` : ""}`);
  }
}

function buatItem(id, judul) {
  return {
    id,
    sumber_id: null,
    sumber_nama: "Contoh",
    // Prioritas 50 -> tier 3: satu sumber tier-3 tanpa koroborasi
    // SELALU diputuskan UNCONFIRMED (bukan CROSS-CHECKED/VERIFIED),
    // jadi jalur uji berhenti di perbaruiStatusItem — deterministik.
    sumber_prioritas: 50,
    url: `https://example.invalid/berita/${id.slice(0, 8)}`,
    judul,
    ringkasan:
      "Pemerintah mengumumkan program bantuan pangan untuk warga Jakarta.",
    isi_ringkas: "",
    penulis: null,
    waktu_terbit_asli: "2026-11-21T02:00:00Z",
    waktu_diambil: "2026-11-21T03:00:00Z",
    status: "UNCONFIRMED",
  };
}

// Mock adapter: semua operasi berhasil KECUALI perbaruiStatusItem
// untuk id di `idGagal` (simulasi tulis DB gagal).
function buatMockAdapter(antrean, idGagal) {
  let nRun = 0;
  let nKlaim = 0;
  return {
    ambilWaktuAntreanTertua: async () => null,
    ambilAntrean: async (limit) => antrean.slice(0, limit),
    catatRun: async () => `run-${++nRun}`,
    tutupRun: async () => undefined,
    cariKlaimSama: async () => null,
    simpanKlaim: async () => `klaim-${++nKlaim}`,
    ambilItemSerupa: async () => [],
    ambilSumber: async () => null,
    cariKlaimSerupa: async () => [],
    cariBuktiSama: async () => null,
    simpanBukti: async () => "bukti-1",
    simpanVerification: async () => undefined,
    perbaruiStatusItem: async (id) => {
      if (idGagal.has(id)) throw new Error("DB tulis gagal (simulasi)");
    },
    catatGagalQualityCheck: async () => ({ terminal: false, hitungan: null }),
    resetGagalQualityCheck: async () => undefined,
  };
}

const ID_A = "00000000-0000-0000-0000-0000000000a1";
const ID_B = "00000000-0000-0000-0000-0000000000b2";
const ID_C = "00000000-0000-0000-0000-0000000000c3";
const JUDUL_B = "Bantuan pangan diumumkan untuk warga Jakarta Timur";
const JUDUL_C = "Harga beras naik di pasar tradisional Jakarta";

// ---------- Skenario A: 1 dari 2 item gagal ----------
{
  const itemA = buatItem(ID_A, "Pemerintah umumkan bantuan pangan di Jakarta");
  const itemB = buatItem(ID_B, JUDUL_B);
  const adapter = buatMockAdapter([itemA, itemB], new Set([ID_B]));
  const hasil = await jalankanPipelineEditorial(adapter, {
    limit: 10,
    rekonsiliasi: false,
  });
  periksa("A: diproses=2", hasil.diproses === 2, `dapat ${hasil.diproses}`);
  periksa("A: gagal=1", hasil.gagal === 1, `dapat ${hasil.gagal}`);
  periksa(
    "A: gagal_detail berisi 1 entri",
    Array.isArray(hasil.gagal_detail) && hasil.gagal_detail.length === 1,
    `dapat ${JSON.stringify(hasil.gagal_detail)}`,
  );
  const entri = hasil.gagal_detail?.[0];
  periksa("A: item_id = item yang gagal", entri?.item_id === ID_B);
  periksa("A: judul = judul item yang gagal", entri?.judul === JUDUL_B);
  periksa(
    "A: tahap = perbarui_status",
    entri?.tahap === "perbarui_status",
    `dapat ${entri?.tahap}`,
  );
  periksa(
    "A: error memuat pesan galat",
    typeof entri?.error === "string" && entri.error.includes("DB tulis gagal"),
    `dapat ${entri?.error}`,
  );
  periksa(
    "A: item yang berhasil TIDAK masuk gagal_detail",
    !hasil.gagal_detail?.some((e) => e.item_id === ID_A),
  );
}

// ---------- Skenario B: semua item gagal, urutan = urutan antrean ----------
{
  const itemB = buatItem(ID_B, JUDUL_B);
  const itemC = buatItem(ID_C, JUDUL_C);
  const adapter = buatMockAdapter([itemB, itemC], new Set([ID_B, ID_C]));
  const hasil = await jalankanPipelineEditorial(adapter, {
    limit: 10,
    rekonsiliasi: false,
  });
  periksa("B: gagal=2", hasil.gagal === 2, `dapat ${hasil.gagal}`);
  periksa(
    "B: gagal_detail berisi 2 entri",
    hasil.gagal_detail?.length === 2,
    `dapat ${JSON.stringify(hasil.gagal_detail)}`,
  );
  periksa(
    "B: urutan entri mengikuti antrean",
    hasil.gagal_detail?.[0]?.item_id === ID_B &&
      hasil.gagal_detail?.[1]?.item_id === ID_C,
  );
}

// ---------- Skenario C: run bersih -> gagal_detail kosong ----------
{
  const itemA = buatItem(ID_A, "Pemerintah umumkan bantuan pangan di Jakarta");
  const adapter = buatMockAdapter([itemA], new Set());
  const hasil = await jalankanPipelineEditorial(adapter, {
    limit: 10,
    rekonsiliasi: false,
  });
  periksa("C: gagal=0", hasil.gagal === 0, `dapat ${hasil.gagal}`);
  periksa(
    "C: gagal_detail array kosong",
    Array.isArray(hasil.gagal_detail) && hasil.gagal_detail.length === 0,
    `dapat ${JSON.stringify(hasil.gagal_detail)}`,
  );
}

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
