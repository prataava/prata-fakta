// Baterai uji perbaikan quality_check run #45 — 22 Nov 2026.
// Akar: run #45 pipeline editorial gagal=3, ketiganya tahap
// quality_check (tanggal_tidak_diketahui + kutipan_tanpa_bukti),
// padahal tanggal/kutipan itu ADA di sumber — hanya tidak pernah
// sampai ke gerbang QC dengan benar:
//   (A) K4: tanggal peristiwa di dalam klaim 'angka'/'fakta'
//       tidak pernah divouch (ekstraksi `continue` melewati
//       pemeriksaan tanggal untuk kalimat berangka).
//   (B) K3: kutipan di dalam kalimat 'angka'/'tanggal' tidak
//       pernah diekstrak jadi klaim 'kutipan' (continue sebelum
//       loop ekstraksi kutipan), padahal kalimat utuhnya —
//       termasuk tanda petiknya — dirender di draf.
//   (C) Katup v29 tolak-setelah-3 fail-open dan tidak teramati:
//       bila kolom qc_gagal_berturut_turut belum ada di produksi,
//       counter mengembalikan null tanpa jejak di log.
// Yang diuji (mock adapter / fungsi murni — TANPA DB produksi):
//   §A ekstraksi klaim: kutipan dari kalimat 'angka'/'tanggal'.
//   §B K4: tanggal di klaim 'angka' ber-evidence divouch; tanpa
//       evidence tetap gagal (fail-closed dipertahankan).
//   §C penurunan kutipan: petik dilepas dari klaim non-kutipan;
//       rantai penuh pola item run #45 kini LOLOS QC.
//   §D katup v29: hitungan 1/2/3 -> DITOLAK di 3; counter null
//       tercatat; adapter tanpa method -> field absen.
// Jalankan:
//   node --experimental-strip-types scripts/jalankan-baterai.mjs scripts/uji-qc-tanggal-kutipan.mjs
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
import { ekstrakKlaim } from "../src/lib/ai/research.ts";
import { periksaKualitasKlaimDraf } from "../src/lib/ai/quality-check.ts";
import {
  turunkanKutipanTanpaBukti,
  susunDrafArtikel,
} from "../src/lib/ai/writing.ts";
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

function klaim(teks, jenis) {
  return { teks, jenis, berpola_instruksi: false };
}

function bukti(klaimTeks, kutipan = null) {
  return {
    klaim_teks: klaimTeks,
    sumber_url: "https://example.invalid/berita/x",
    kutipan,
  };
}

// Draf minimal berbentuk susunan writing.ts (seksi "Fakta utama"
// + "Sumber:" + "Yang belum diketahui:") untuk quality-check.
function buatIsiDraf(butirFakta) {
  return (
    `${butirFakta[0]}. Informasi ini dihimpun redaksi dari Contoh.\n\n` +
    `Fakta utama:\n${butirFakta.map((b) => `- ${b}.`).join("\n")}\n\n` +
    `Sumber:\n- Contoh — https://example.invalid/berita/x\n\n` +
    `Yang belum diketahui:\n- Informasi lain belum diketahui.`
  );
}

const SUMBER_DRAF = [{ nama: "Contoh", url: "https://example.invalid/berita/x" }];

// ---------- §A: ekstraksi klaim (perbaikan K3 di research.ts) ----------
console.log("--- §A ekstraksi klaim ---");
{
  const kalimatAngka =
    'Sebanyak 50 orang masih dicari hingga 20 November 2026, kata juru bicara, "kami terus berupaya mencari mereka".';
  const hasil = ekstrakKlaim(
    "Puluhan karyawan masih dalam pencarian saat musibah kebakaran pabrik permen di Banten",
    kalimatAngka,
    "",
    "",
  );
  periksa(
    "A1 kalimat berangka -> klaim 'angka'",
    hasil.some(
      (k) => k.jenis === "angka" && k.teks.includes("50 orang"),
    ),
    JSON.stringify(hasil),
  );
  periksa(
    "A1 kutipan di kalimat berangka -> klaim 'kutipan'",
    hasil.some(
      (k) =>
        k.jenis === "kutipan" &&
        k.teks === "kami terus berupaya mencari mereka",
    ),
    JSON.stringify(hasil),
  );
}
{
  const kalimatTanggal =
    'Pada 20 November 2026, menteri berkata "kami akan bertindak tegas hari ini".';
  const hasil = ekstrakKlaim("Bahrain desak PBB bertindak tegas", kalimatTanggal, "", "");
  periksa(
    "A2 kalimat bertanggal -> klaim 'tanggal'",
    hasil.some(
      (k) => k.jenis === "tanggal" && k.teks.includes("20 November 2026"),
    ),
    JSON.stringify(hasil),
  );
  periksa(
    "A2 kutipan di kalimat bertanggal -> klaim 'kutipan'",
    hasil.some(
      (k) =>
        k.jenis === "kutipan" &&
        k.teks === "kami akan bertindak tegas hari ini",
    ),
    JSON.stringify(hasil),
  );
}

// ---------- §B: K4 — tanggal di klaim ber-evidence (perbaikan quality-check.ts) ----------
console.log("--- §B K4 tanggal di klaim non-tanggal ---");
const TEKS_ANGKA = "Sebanyak 50 karyawan masih dicari hingga 20 November 2026";
const JUDUL_B = "Puluhan karyawan masih dalam pencarian saat musibah kebakaran pabrik permen di Banten";
{
  const hasil = periksaKualitasKlaimDraf({
    judul: JUDUL_B,
    ringkasan: TEKS_ANGKA,
    isi: buatIsiDraf([TEKS_ANGKA]),
    fakta: [TEKS_ANGKA],
    sumber: SUMBER_DRAF,
    klaim: [klaim(TEKS_ANGKA, "angka")],
    evidence: [bukti(TEKS_ANGKA)],
    tanggalDiketahui: [],
  });
  periksa(
    "B1 tanggal di klaim 'angka' ber-evidence -> QC lolos (pola run #45 item 2)",
    hasil.lolos === true,
    JSON.stringify(hasil.pelanggaran),
  );
}
{
  // Mekanisme regresi: draf yang sama, tapi QC hanya diberi klaim
  // 'fakta' judul (meniru perilaku lama: tanggal hanya divouch
  // klaim jenis 'tanggal') -> tanggal ditolak.
  const hasil = periksaKualitasKlaimDraf({
    judul: JUDUL_B,
    ringkasan: TEKS_ANGKA,
    isi: buatIsiDraf([TEKS_ANGKA]),
    fakta: [TEKS_ANGKA],
    sumber: SUMBER_DRAF,
    klaim: [klaim(JUDUL_B, "fakta")],
    evidence: [bukti(JUDUL_B)],
    tanggalDiketahui: [],
  });
  periksa(
    "B1b tanpa klaim 'angka' -> tanggal_tidak_diketahui (bukti regresi perilaku lama)",
    hasil.pelanggaran.some((p) => p.kode === "tanggal_tidak_diketahui"),
    JSON.stringify(hasil.pelanggaran),
  );
}
{
  const hasil = periksaKualitasKlaimDraf({
    judul: JUDUL_B,
    ringkasan: TEKS_ANGKA,
    isi: buatIsiDraf([TEKS_ANGKA]),
    fakta: [TEKS_ANGKA],
    sumber: SUMBER_DRAF,
    klaim: [klaim(TEKS_ANGKA, "angka")],
    evidence: [],
    tanggalDiketahui: [],
  });
  periksa(
    "B2 tanggal di klaim TANPA evidence -> tetap tanggal_tidak_diketahui (fail-closed)",
    hasil.pelanggaran.some((p) => p.kode === "tanggal_tidak_diketahui"),
    JSON.stringify(hasil.pelanggaran),
  );
  periksa("B2 ... dan QC tetap gagal", hasil.lolos === false);
}

// ---------- §C: penurunan kutipan (perbaikan writing.ts) + rantai penuh ----------
console.log("--- §C penurunan kutipan ---");
{
  const hasil = turunkanKutipanTanpaBukti(
    [klaim('Sebanyak 50 karyawan dicari, kata juru bicara, "kami terus berupaya".', "angka")],
    [],
  );
  periksa(
    "C1 petik di klaim 'angka' dilepas, jenis tetap 'angka'",
    hasil.klaim.length === 1 &&
      hasil.klaim[0].jenis === "angka" &&
      !/["""]/.test(hasil.klaim[0].teks),
    JSON.stringify(hasil.klaim),
  );
}
{
  const teksKutipan = "kami akan bertindak tegas";
  const hasil = turunkanKutipanTanpaBukti(
    [klaim(teksKutipan, "kutipan")],
    [bukti(teksKutipan, "Menteri berkata: kami akan bertindak tegas.")],
  );
  periksa(
    "C2 klaim 'kutipan' BERBUKTI dipertahankan utuh",
    hasil.klaim.length === 1 &&
      hasil.klaim[0].jenis === "kutipan" &&
      hasil.klaim[0].teks === teksKutipan,
    JSON.stringify(hasil.klaim),
  );
}
{
  const hasil = turunkanKutipanTanpaBukti(
    [klaim("kami menuntut ganti rugi", "kutipan")],
    [bukti("kami menuntut ganti rugi", null)],
  );
  periksa(
    "C3 klaim 'kutipan' tanpa kalimat kutipan evidence -> diturunkan ke 'fakta'",
    hasil.klaim.length === 1 && hasil.klaim[0].jenis === "fakta",
    JSON.stringify(hasil.klaim),
  );
}
{
  const hasil = turunkanKutipanTanpaBukti(
    [klaim('Judul dengan "frasa berpetik" di tengah', "fakta")],
    [],
  );
  periksa(
    "C4 petik di klaim 'fakta' dilepas",
    hasil.klaim.length === 1 && !/["""]/.test(hasil.klaim[0].teks),
    JSON.stringify(hasil.klaim),
  );
}
{
  // Rantai penuh pola run #45 item 3: kalimat berangka + tanggal +
  // kutipan, evidence tanpa kalimat kutipan -> draf + QC lolos.
  const kalimat =
    'Sebanyak 50 orang masih dicari hingga 20 November 2026, kata juru bicara, "kami terus berupaya mencari mereka".';
  const terekstrak = ekstrakKlaim(JUDUL_B, kalimat, "", "");
  const evidence = terekstrak.map((k) => bukti(k.teks, null));
  const klaimDraf = turunkanKutipanTanpaBukti(terekstrak, evidence);
  const draf = susunDrafArtikel({
    item: {
      id: "00000000-0000-0000-0000-0000000000c5",
      judul: JUDUL_B,
      sumber_nama: "Contoh",
      url: "https://example.invalid/berita/x",
      waktu_terbit_asli: null,
      gambar_url: null,
    },
    klaim: klaimDraf.klaim,
    ringkasan: kalimat,
    keputusan: "CROSS-CHECKED",
    sumber: SUMBER_DRAF,
  });
  periksa(
    "C5 draf rantai penuh tidak menampilkan segmen berpetik",
    !/["""]/.test(draf.isi),
    draf.isi.slice(0, 200),
  );
  const hasil = periksaKualitasKlaimDraf({
    judul: draf.judul,
    ringkasan: draf.ringkasan,
    isi: draf.isi,
    fakta: draf.fakta_penting,
    sumber: SUMBER_DRAF,
    klaim: klaimDraf.klaim,
    evidence,
    tanggalDiketahui: [],
  });
  periksa(
    "C5 rantai penuh pola run #45 -> QC lolos",
    hasil.lolos === true,
    JSON.stringify(hasil.pelanggaran),
  );
}

// ---------- §D: katup v29 teramati via pipeline (perbaikan pipeline.ts) ----------
console.log("--- §D katup v29 via pipeline ---");
function buatItemKatup(id) {
  return {
    id,
    sumber_id: "sumber-tier1",
    sumber_nama: "Sumber Tier-1",
    // Prioritas 90 -> tier 1: satu sumber tier-1 saja cukup
    // untuk CROSS-CHECKED (ambang dilonggarkan) -> item sampai
    // ke langkah draf + quality_check.
    sumber_prioritas: 90,
    url: `https://example.invalid/berita/${id.slice(0, 8)}`,
    judul: JUDUL_B,
    ringkasan: TEKS_ANGKA,
    isi_ringkas: "",
    penulis: null,
    waktu_terbit_asli: "2026-11-21T02:00:00Z",
    waktu_diambil: "2026-11-21T03:00:00Z",
    status: "UNCONFIRMED",
  };
}

// Mock adapter: simpanBukti SELALU gagal -> klaim tanpa evidence ->
// QC gagal K5 (deterministik). Counter katup di memori.
function buatMockKatup(antrean, catatFn) {
  let nRun = 0;
  let nKlaim = 0;
  const mock = {
    ambilWaktuAntreanTertua: async () => null,
    ambilAntrean: async (limit) => antrean.slice(0, limit),
    catatRun: async () => `run-${++nRun}`,
    tutupRun: async () => undefined,
    cariKlaimSama: async () => null,
    simpanKlaim: async () => `klaim-${++nKlaim}`,
    ambilItemSerupa: async () => [],
    ambilSumber: async () => ({
      id: "sumber-tier1",
      nama: "Sumber Tier-1",
      prioritas: 90,
    }),
    cariKlaimSerupa: async () => [],
    cariBuktiSama: async () => null,
    simpanBukti: async () => {
      throw new Error("simpanBukti gagal (simulasi)");
    },
    simpanVerification: async () => undefined,
    perbaruiStatusItem: async () => undefined,
    resetGagalQualityCheck: async () => undefined,
  };
  if (catatFn) mock.catatGagalQualityCheck = catatFn;
  return mock;
}

const ID_KATUP = "00000000-0000-0000-0000-0000000000d1";
{
  // Counter in-memory: 1, 2, lalu 3 -> terminal (DITOLAK).
  let hitungan = 0;
  const catatFn = async () => {
    hitungan += 1;
    return { terminal: hitungan >= 3, hitungan };
  };
  const adapter = buatMockKatup([buatItemKatup(ID_KATUP)], catatFn);

  const hasil1 = await jalankanPipelineEditorial(adapter, {
    limit: 10,
    rekonsiliasi: false,
  });
  const entri1 = hasil1.gagal_detail?.[0];
  periksa("D1 run 1: gagal=1", hasil1.gagal === 1, `dapat ${hasil1.gagal}`);
  periksa(
    "D1 run 1: tahap quality_check",
    entri1?.tahap === "quality_check",
    `dapat ${entri1?.tahap} — ${JSON.stringify(hasil1.gagal_detail)}`,
  );
  periksa(
    "D1 run 1: qc_gagal_berturut_turut=1",
    entri1?.qc_gagal_berturut_turut === 1,
    `dapat ${entri1?.qc_gagal_berturut_turut}`,
  );
  periksa("D1 run 1: ditolak_qc=0", hasil1.ditolak_qc === 0, `dapat ${hasil1.ditolak_qc}`);

  const hasil2 = await jalankanPipelineEditorial(adapter, {
    limit: 10,
    rekonsiliasi: false,
  });
  periksa(
    "D2 run 2: qc_gagal_berturut_turut=2, ditolak_qc=0",
    hasil2.gagal_detail?.[0]?.qc_gagal_berturut_turut === 2 &&
      hasil2.ditolak_qc === 0,
    JSON.stringify(hasil2.gagal_detail),
  );

  const hasil3 = await jalankanPipelineEditorial(adapter, {
    limit: 10,
    rekonsiliasi: false,
  });
  periksa(
    "D3 run 3: qc_gagal_berturut_turut=3",
    hasil3.gagal_detail?.[0]?.qc_gagal_berturut_turut === 3,
    JSON.stringify(hasil3.gagal_detail),
  );
  periksa(
    "D3 run 3: ditolak_qc=1 (terminal di 3x)",
    hasil3.ditolak_qc === 1,
    `dapat ${hasil3.ditolak_qc}`,
  );
}
{
  // Counter tidak tersedia (migrasi v29 belum diterapkan):
  // hitungan null tercatat, run tetap jalan (fail-open).
  const adapter = buatMockKatup(
    [buatItemKatup(ID_KATUP)],
    async () => ({ terminal: false, hitungan: null }),
  );
  const hasil = await jalankanPipelineEditorial(adapter, {
    limit: 10,
    rekonsiliasi: false,
  });
  const entri = hasil.gagal_detail?.[0];
  periksa(
    "D4 counter null tercatat di gagal_detail",
    entri?.qc_gagal_berturut_turut === null,
    JSON.stringify(hasil.gagal_detail),
  );
  periksa(
    "D4 run tetap jalan (gagal=1, ditolak_qc=0)",
    hasil.gagal === 1 && hasil.ditolak_qc === 0,
    `gagal=${hasil.gagal} ditolak_qc=${hasil.ditolak_qc}`,
  );
}
{
  // Adapter tanpa method pencatatan: field absen, run tetap jalan.
  const adapter = buatMockKatup([buatItemKatup(ID_KATUP)], null);
  const hasil = await jalankanPipelineEditorial(adapter, {
    limit: 10,
    rekonsiliasi: false,
  });
  const entri = hasil.gagal_detail?.[0];
  periksa(
    "D5 tanpa method: field qc_gagal_berturut_turut absen",
    entri && !("qc_gagal_berturut_turut" in entri),
    JSON.stringify(hasil.gagal_detail),
  );
  periksa(
    "D5 run tetap jalan (gagal=1)",
    hasil.gagal === 1,
    `gagal=${hasil.gagal}`,
  );
}

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
