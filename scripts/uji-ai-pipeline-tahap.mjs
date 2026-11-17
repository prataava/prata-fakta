// Baterai uji Fase 9 + Fase 10 PRATA FAKTA — PURE function tests,
// TANPA DB produksi, TANPA fetch, TANPA PGlite.
// Yang diuji:
//   (a) quality_check (src/lib/ai/quality-check.ts): menolak draf
//       dengan kutipan tanpa bukti, angka tanpa sumber, tanggal
//       diubah; menerima draf bersih yang tertelusur penuh.
//   (b) analysis (src/lib/ai/analysis.ts): sintesis 5W+1H hanya
//       dari klaim terverifikasi; bagian kosong jujur bila tanpa
//       klaim pendukung.
//   (c) batas kutipan 300 karakter (src/lib/ai/writing.ts):
//       ditegakkan saat draf dibuat, bukan hanya di tampilan.
// Jalankan:
//   node --experimental-strip-types --import /tmp/pf-register.mjs scripts/uji-ai-pipeline-tahap.mjs
// (loader /tmp/pf-register.mjs dibuat ulang dari
// scripts/uji-tahap13c-loader.mjs bila hilang.)
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import { periksaKualitasKlaimDraf } from "../src/lib/ai/quality-check.ts";
import {
  sintesis5W1H,
  apakahAnalisisKosong,
} from "../src/lib/ai/analysis.ts";
import {
  susunDrafArtikel,
  klaimKutipanMelebihiBatas,
  BATAS_KUTIPAN_DRAF,
} from "../src/lib/ai/writing.ts";

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

function adaKode(hasil, kode) {
  return hasil.pelanggaran.some((p) => p.kode === kode);
}

// ---------- Fixture ----------

const ITEM = {
  id: "00000000-0000-0000-0000-000000000001",
  sumber_id: null,
  sumber_nama: "Antara",
  sumber_prioritas: 1,
  url: "https://www.antaranews.com/berita/contoh",
  judul: "Pemerintah umumkan bantuan pangan di Jakarta",
  ringkasan: "Pemerintah mengumumkan program bantuan pangan.",
  isi_ringkas: "",
  penulis: null,
  waktu_terbit_asli: "2026-11-17T02:00:00Z",
  waktu_diambil: "2026-11-17T03:00:00Z",
  status: "baru",
  disalin_dari_id: null,
  metadata: null,
};

const KLAIM_BERSIH = [
  { teks: "Pemerintah mengumumkan program bantuan pangan di Jakarta.", jenis: "fakta" },
  { teks: "Bantuan senilai 25 miliar rupiah disalurkan kepada warga.", jenis: "angka" },
  {
    teks: '"Kami memastikan bantuan sampai ke warga," kata Menteri Keuangan.',
    jenis: "kutipan",
  },
  { teks: "Program diumumkan pada 17 November 2026.", jenis: "tanggal" },
];

const SUMBER = [{ nama: "Antara", url: "https://www.antaranews.com/berita/contoh" }];

function evidenceBersih() {
  return [
    {
      klaim_teks: KLAIM_BERSIH[0].teks,
      sumber_url: SUMBER[0].url,
      kutipan: "Pemerintah mengumumkan program bantuan pangan di Jakarta.",
    },
    {
      klaim_teks: KLAIM_BERSIH[1].teks,
      sumber_url: SUMBER[0].url,
      kutipan: "Bantuan senilai 25 miliar rupiah disalurkan kepada warga.",
    },
    {
      klaim_teks: KLAIM_BERSIH[2].teks,
      sumber_url: SUMBER[0].url,
      kutipan: "Kami memastikan bantuan sampai ke warga,",
    },
    {
      klaim_teks: KLAIM_BERSIH[3].teks,
      sumber_url: SUMBER[0].url,
      kutipan: "Program diumumkan pada 17 November 2026.",
    },
  ];
}

function drafBersih() {
  return susunDrafArtikel({
    item: ITEM,
    klaim: KLAIM_BERSIH,
    ringkasan: "Pemerintah mengumumkan program bantuan pangan.",
    keputusan: "VERIFIED",
    sumber: SUMBER,
  });
}

function masukanQC(draf, klaim, evidence, tanggalDiketahui) {
  return {
    judul: draf.judul,
    ringkasan: draf.ringkasan,
    isi: draf.isi,
    fakta: draf.fakta_penting,
    sumber: SUMBER,
    klaim,
    evidence,
    tanggalDiketahui,
  };
}

// ---------- (a) quality_check ----------

// 1. Draf bersih lolos penuh.
{
  const draf = drafBersih();
  const hasil = periksaKualitasKlaimDraf(
    masukanQC(draf, KLAIM_BERSIH, evidenceBersih(), ["2026-11-17"]),
  );
  periksa(
    "QC-1 draf bersih lolos",
    hasil.lolos && hasil.pelanggaran.length === 0,
    JSON.stringify(hasil.pelanggaran),
  );
}

// 2. Kutipan tanpa bukti ditolak (evidence tanpa kalimat kutipan).
{
  const draf = drafBersih();
  const evidence = evidenceBersih();
  evidence[2] = { ...evidence[2], kutipan: null };
  const hasil = periksaKualitasKlaimDraf(
    masukanQC(draf, KLAIM_BERSIH, evidence, ["2026-11-17"]),
  );
  periksa(
    "QC-2 kutipan tanpa bukti ditolak",
    !hasil.lolos && adaKode(hasil, "kutipan_tanpa_bukti"),
    JSON.stringify(hasil.pelanggaran),
  );
}

// 3. Angka tanpa sumber ditolak (fakta draf memuat "500" yang tidak
//    ada di klaim terverifikasi mana pun).
{
  const draf = drafBersih();
  const faktaPalsu = [
    ...draf.fakta_penting,
    "Target penerima 500 ribu keluarga di seluruh Indonesia.",
  ];
  const isiPalsu = draf.isi.replace(
    "Yang belum diketahui:",
    "Target penerima 500 ribu keluarga di seluruh Indonesia.\n\nYang belum diketahui:",
  );
  const hasil = periksaKualitasKlaimDraf(
    masukanQC(
      { ...draf, fakta_penting: faktaPalsu, isi: isiPalsu },
      KLAIM_BERSIH,
      evidenceBersih(),
      ["2026-11-17"],
    ),
  );
  periksa(
    "QC-3 angka tanpa sumber ditolak",
    !hasil.lolos && adaKode(hasil, "angka_tanpa_sumber"),
    JSON.stringify(hasil.pelanggaran),
  );
}

// 4. Tanggal diubah ditolak (18 November 2026 — tidak ada di tanggal
//    yang diketahui dari sumber).
{
  const klaimUbah = KLAIM_BERSIH.map((k) =>
    k.jenis === "tanggal"
      ? { ...k, teks: "Program diumumkan pada 18 November 2026." }
      : k,
  );
  const drafUbah = susunDrafArtikel({
    item: ITEM,
    klaim: klaimUbah,
    ringkasan: "Pemerintah mengumumkan program bantuan pangan.",
    keputusan: "VERIFIED",
    sumber: SUMBER,
  });
  // Tanggal yang diketahui HANYA 2026-11-17 (waktu terbit asli) —
  // klaim tanggal yang diubah tidak boleh "mengesahkan" dirinya
  // sendiri: tanggalDiketahui di sini sengaja hanya dari metadata.
  const hasil = periksaKualitasKlaimDraf(
    masukanQC(drafUbah, klaimUbah, evidenceBersih(), ["2026-11-17"]),
  );
  periksa(
    "QC-4 tanggal diubah ditolak",
    !hasil.lolos && adaKode(hasil, "tanggal_tidak_diketahui"),
    JSON.stringify(hasil.pelanggaran),
  );
}

// 5. Kutipan >300 karakter ditolak (draf rakitan tangan).
{
  const kutipanPanjang = `"${"Kalimat yang diulang-ulang untuk memanjangkan kutipan. ".repeat(8)}" kata Menteri Keuangan.`;
  const klaimPanjang = [
    { teks: "Pemerintah mengumumkan program bantuan pangan di Jakarta.", jenis: "fakta" },
    { teks: kutipanPanjang, jenis: "kutipan" },
  ];
  const draf = {
    judul: ITEM.judul,
    ringkasan: ITEM.ringkasan,
    isi: [
      "Pemerintah mengumumkan program bantuan pangan di Jakarta.",
      `Fakta utama:\n- Pemerintah mengumumkan program bantuan pangan di Jakarta.\n- ${kutipanPanjang}`,
      `Sumber:\n- Antara — ${SUMBER[0].url}`,
      "Yang belum diketahui:\nSumber-sumber di atas tidak menyebutkan rincian di luar klaim yang tercantum.",
    ].join("\n\n"),
    fakta_penting: klaimPanjang.map((k) => k.teks),
  };
  const evidence = klaimPanjang.map((k) => ({
    klaim_teks: k.teks,
    sumber_url: SUMBER[0].url,
    kutipan: k.teks.slice(0, 100),
  }));
  const hasil = periksaKualitasKlaimDraf(
    masukanQC(draf, klaimPanjang, evidence, ["2026-11-17"]),
  );
  periksa(
    "QC-5 kutipan >300 karakter ditolak",
    !hasil.lolos && adaKode(hasil, "kutipan_melebihi_batas"),
    JSON.stringify(hasil.pelanggaran),
  );
}

// 6. Klaim tanpa evidence ditolak.
{
  const draf = drafBersih();
  const evidence = evidenceBersih().slice(0, 3); // klaim tanggal tanpa evidence
  const hasil = periksaKualitasKlaimDraf(
    masukanQC(draf, KLAIM_BERSIH, evidence, ["2026-11-17"]),
  );
  periksa(
    "QC-6 klaim tanpa bukti ditolak",
    !hasil.lolos && adaKode(hasil, "klaim_tanpa_bukti"),
    JSON.stringify(hasil.pelanggaran),
  );
}

// 7. Klaim terverifikasi yang tidak tercantum di draf ditolak
//    (konteks dipotong).
{
  const draf = drafBersih();
  const klaimTambah = [
    ...KLAIM_BERSIH,
    { teks: "Program ini mencakup 34 provinsi di Indonesia.", jenis: "fakta" },
  ];
  const evidence = [
    ...evidenceBersih(),
    {
      klaim_teks: klaimTambah[4].teks,
      sumber_url: SUMBER[0].url,
      kutipan: "Program ini mencakup 34 provinsi di Indonesia.",
    },
  ];
  const hasil = periksaKualitasKlaimDraf(
    masukanQC(draf, klaimTambah, evidence, ["2026-11-17"]),
  );
  periksa(
    "QC-7 klaim terverifikasi yang dipotong dari draf ditolak",
    !hasil.lolos && adaKode(hasil, "klaim_tidak_tercantum"),
    JSON.stringify(hasil.pelanggaran),
  );
}

// ---------- (b) analysis 5W+1H ----------

// 8. Sintesis merangkai 5W+1H hanya dari klaim terverifikasi.
{
  const klaim = [
    { teks: "Pemerintah mengumumkan program bantuan pangan di Jakarta.", jenis: "fakta" },
    { teks: "Bantuan senilai 25 miliar rupiah disalurkan kepada warga.", jenis: "angka" },
    {
      teks: '"Kami memastikan bantuan sampai ke warga," kata Menteri Keuangan.',
      jenis: "kutipan",
    },
    { teks: "Program diumumkan pada 17 November 2026.", jenis: "tanggal" },
    { teks: "Program diluncurkan karena harga pangan naik tajam.", jenis: "fakta" },
  ];
  const hasil = sintesis5W1H({
    klaim,
    judul: ITEM.judul,
    waktuTerbitAsli: ITEM.waktu_terbit_asli,
    sumberNama: "Antara",
  });
  periksa(
    "AN-1 apa dari klaim fakta",
    !!hasil.apa.teks && hasil.apa.teks.includes("bantuan pangan"),
    JSON.stringify(hasil.apa),
  );
  periksa(
    "AN-2 siapa dari penutur kutipan terverifikasi",
    hasil.siapa.teks === "Menteri Keuangan",
    JSON.stringify(hasil.siapa),
  );
  periksa(
    "AN-3 kapan dari klaim tanggal",
    !!hasil.kapan.teks && hasil.kapan.teks.includes("17 November 2026"),
    JSON.stringify(hasil.kapan),
  );
  periksa(
    "AN-4 di mana dari klaim (Jakarta)",
    hasil.diMana.teks === "Jakarta",
    JSON.stringify(hasil.diMana),
  );
  periksa(
    "AN-5 mengapa dari klaim sebab-akibat",
    !!hasil.mengapa.teks && hasil.mengapa.teks.includes("harga pangan naik"),
    JSON.stringify(hasil.mengapa),
  );
  periksa(
    "AN-6 bagaimana dari klaim angka",
    !!hasil.bagaimana.teks && hasil.bagaimana.teks.includes("25 miliar"),
    JSON.stringify(hasil.bagaimana),
  );
  periksa(
    "AN-7 ringkasan tidak mengandung kata di luar klaim",
    !hasil.ringkasan.includes("Surabaya") &&
      !hasil.ringkasan.includes("Bandung"),
    hasil.ringkasan,
  );
}

// 9. Tanpa klaim: semua slot kosong secara jujur.
{
  const hasil = sintesis5W1H({ klaim: [] });
  periksa(
    "AN-8 tanpa klaim semua slot kosong",
    apakahAnalisisKosong(hasil) &&
      hasil.siapa.teks === null &&
      hasil.apa.teks === null &&
      hasil.kapan.teks === null &&
      hasil.diMana.teks === null &&
      hasil.mengapa.teks === null &&
      hasil.bagaimana.teks === null,
    JSON.stringify(hasil),
  );
  periksa(
    "AN-9 ringkasan kosong jujur, bukan karangan",
    hasil.ringkasan.includes("Tidak ada klaim terverifikasi"),
    hasil.ringkasan,
  );
}

// 10. Tanpa penutur/lokasi/sebab: slot itu kosong, slot lain terisi.
{
  const hasil = sintesis5W1H({
    klaim: [
      { teks: "Harga emas naik di pasar global.", jenis: "fakta" },
      { teks: "Kenaikan mencapai 10 persen dalam sepekan.", jenis: "angka" },
    ],
  });
  periksa(
    "AN-10 slot tanpa pendukung tetap kosong",
    hasil.siapa.teks === null &&
      hasil.diMana.teks === null &&
      hasil.mengapa.teks === null &&
      !!hasil.siapa.kosongKarena &&
      !!hasil.diMana.kosongKarena,
    JSON.stringify(hasil),
  );
  periksa(
    "AN-11 apa + bagaimana tetap terisi",
    !!hasil.apa.teks && !!hasil.bagaimana.teks,
    JSON.stringify(hasil),
  );
}

// ---------- (c) batas kutipan 300 karakter di writing.ts ----------

// 12. Konstanta batas = 300.
periksa(
  "WR-1 BATAS_KUTIPAN_DRAF = 300",
  BATAS_KUTIPAN_DRAF === 300,
  String(BATAS_KUTIPAN_DRAF),
);

// 13. Kutipan 400 karakter dipotong saat draf dibuat; ekor asli hilang.
{
  const kutipanPanjang =
    "Kami memastikan bahwa bantuan pangan ini akan sampai tepat waktu kepada seluruh warga yang berhak menerimanya. ".repeat(
      4,
    ) + "EKOR-RAHASIA-TIDAK-BOLEH-TAMPIL.";
  const klaim = [
    { teks: "Pemerintah mengumumkan program bantuan pangan di Jakarta.", jenis: "fakta" },
    { teks: kutipanPanjang, jenis: "kutipan" },
  ];
  periksa(
    "WR-2 fixture kutipan memang >300 karakter",
    kutipanPanjang.length > 300,
    `${kutipanPanjang.length} karakter`,
  );
  periksa(
    "WR-3 klaimKutipanMelebihiBatas menemukan 1 klaim",
    klaimKutipanMelebihiBatas(klaim).length === 1,
    JSON.stringify(klaimKutipanMelebihiBatas(klaim).map((k) => k.teks.length)),
  );
  const draf = susunDrafArtikel({
    item: ITEM,
    klaim,
    ringkasan: "Pemerintah mengumumkan program bantuan pangan.",
    keputusan: "VERIFIED",
    sumber: SUMBER,
  });
  const barisFakta = draf.isi
    .split("\n")
    .filter((b) => b.startsWith("- "))
    .map((b) => b.slice(2)); // buang penanda daftar "- "
  const terpanjang = Math.max(...barisFakta.map((b) => b.length));
  periksa(
    "WR-4 tidak ada baris fakta draf >301 karakter (300 + …)",
    terpanjang <= 301,
    `terpanjang ${terpanjang}: ${JSON.stringify(barisFakta)}`,
  );
  periksa(
    "WR-5 ekor kutipan asli tidak tampil di draf",
    !draf.isi.includes("EKOR-RAHASIA-TIDAK-BOLEH-TAMPIL"),
    draf.isi.slice(0, 400),
  );
  periksa(
    "WR-6 klaim yang dipotong ditandai …",
    draf.fakta_penting[1].endsWith("…") && draf.fakta_penting[1].length <= 301,
    draf.fakta_penting[1].slice(-40),
  );
}

// 14. Klaim bukan kutipan yang panjang TIDAK dipotong.
{
  const faktaPanjang = `Pemerintah mengumumkan ${"program bantuan pangan yang sangat panjang ".repeat(8)}di Jakarta.`;
  const draf = susunDrafArtikel({
    item: ITEM,
    klaim: [{ teks: faktaPanjang, jenis: "fakta" }],
    ringkasan: "Pemerintah mengumumkan program bantuan pangan.",
    keputusan: "VERIFIED",
    sumber: SUMBER,
  });
  periksa(
    "WR-7 klaim fakta panjang tidak dipotong (bukan kutipan)",
    draf.fakta_penting[0] === faktaPanjang,
    `${draf.fakta_penting[0].length} vs ${faktaPanjang.length}`,
  );
}

console.log(`\nSELESAI: ${lolos} lolos, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
