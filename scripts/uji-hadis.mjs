// Uji Hadis Arbain — Worker C (PRATA FAKTA, 17 Nov 2026).
// Fetcher hadis di src/lib/data-live.ts dengan fetch di-mock
// (tanpa jaringan, tanpa server Next, tanpa data dummy operasional).
//
// Yang diuji:
//   (A) Primary sukses (bentuk nyata MyQuran: { status, data: [
//       { no: "1" (STRING), judul, arab, indo } ] }) -> item +
//       provider MyQuran + diambilPada terisi; baris tak dikenal
//       dilewati, bukan crash; URL + User-Agent + TTL diperiksa.
//   (B) Primary gagal (fetch throw / HTTP 500 / json() throw) ->
//       fallback korpus 3 hadis (No. 1/12/15) + label korpus +
//       diambilPada null; teks fallback verbatim (penanda khas:
//       "keapda", "adia", "al Bukhari (1) dan Muslim (1907)").
//   (C) Bentuk respons tak dikenal (HTTP 200 tapi data bukan array
//       / 0 baris valid / badan null) -> Hasil { ok: false } jujur,
//       bukan crash dan bukan fallback diam-diam.
//   (D) Statis: endpoint mati TIDAK ADA lagi di data-live.ts maupun
//       halaman hadis; URL MyQuran + label jujur ada; TIDAK ADA klaim
//       "0% downtime" / "100% uptime" di berkas yang diubah.
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// Jalankan: node --experimental-strip-types --import /tmp/pf-register.mjs scripts/uji-hadis.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getHadisArbain, uraiHadisArbain } from "../src/lib/data-live.ts";

const DIR_REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const baca = (rel) => readFileSync(join(DIR_REPO, rel), "utf8");

let lolos = 0;
let gagal = 0;
function cek(label, kondisi, detail = "") {
  if (kondisi) {
    lolos++;
    console.log(`OK: ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    gagal++;
    console.log(`GAGAL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const fetchAsli = globalThis.fetch;
function pasangMock(fn) {
  globalThis.fetch = fn;
}
function pulihkan() {
  globalThis.fetch = fetchAsli;
}
function responJson(badan, status = 200) {
  return new Response(JSON.stringify(badan), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Bentuk nyata MyQuran (terverifikasi dari VM 17 Nov 2026 11.56 WIB):
// { status: true, request: {...}, info: { min: 1, max: 42 },
//   data: [ { arab, indo, judul, no: "1" }, ... ] } — no = STRING.
const BADAN_MYQURAN = {
  status: true,
  request: { path: "/hadits/arbain/semua" },
  info: { min: 1, max: 42 },
  data: [
    {
      no: "2",
      judul: "Rukun Islam, Iman, dan Ihsan",
      arab: "عَنْ عُمَرَ رضي الله عنه",
      indo: "Dari Umar radhiyallahu 'anhu",
    },
    {
      no: "1",
      judul: "Amalan Bergantung pada Niat",
      arab: "عَنْ أَمِيرِ المُؤمِنينَ",
      indo: "Dari Amirul Mukminin",
    },
    // Baris tak dikenal — wajib dilewati, bukan crash.
    { no: "x", judul: "Rusak", arab: "", indo: "" },
    { judul: "Tanpa nomor" },
    "bukan-objek",
  ],
};

// ==================== (A) Primary sukses ====================
let urlDipanggil = "";
let opsiDipanggil = null;
pasangMock(async (url, opsi) => {
  urlDipanggil = url;
  opsiDipanggil = opsi;
  return responJson(BADAN_MYQURAN);
});
const sukses = await getHadisArbain();
pulihkan();
cek("A1 primary sukses -> ok", sukses.ok === true);
cek(
  "A2 sumber = myquran",
  sukses.ok && sukses.data.sumber === "myquran",
  sukses.ok ? `sumber=${sukses.data.sumber}` : "ok:false",
);
cek(
  "A3 2 baris valid (baris rusak dilewati), terurut per nomor",
  sukses.ok &&
    sukses.data.hadis.length === 2 &&
    sukses.data.hadis[0].nomor === 1 &&
    sukses.data.hadis[1].nomor === 2,
  sukses.ok ? `nomor=${sukses.data.hadis.map((h) => h.nomor)}` : "ok:false",
);
cek(
  "A4 field nyata terpetakan (judul/arab/terjemahan dari indo)",
  sukses.ok &&
    sukses.data.hadis[0].judul === "Amalan Bergantung pada Niat" &&
    sukses.data.hadis[0].arab === "عَنْ أَمِيرِ المُؤمِنينَ" &&
    sukses.data.hadis[0].terjemahan === "Dari Amirul Mukminin",
);
cek(
  "A5 diambilPada terisi ISO (online)",
  sukses.ok &&
    typeof sukses.data.diambilPada === "string" &&
    !Number.isNaN(Date.parse(sukses.data.diambilPada)),
  sukses.ok ? `diambilPada=${sukses.data.diambilPada}` : "ok:false",
);
cek(
  "A6 URL primary = MyQuran arbain",
  urlDipanggil === "https://api.myquran.com/v2/hadits/arbain/semua",
  `url=${urlDipanggil}`,
);
cek(
  "A7 User-Agent PRATA-FAKTA/1.0 + TTL 86400 (pola fetcher statis)",
  opsiDipanggil !== null &&
    String(opsiDipanggil.headers?.["User-Agent"] ?? "").startsWith(
      "PRATA-FAKTA/1.0",
    ) &&
    opsiDipanggil.next?.revalidate === 86400,
  `UA=${opsiDipanggil?.headers?.["User-Agent"]} revalidate=${opsiDipanggil?.next?.revalidate}`,
);

// ==================== (B) Primary gagal -> fallback ====================
async function cekFallback(label, mockFn) {
  pasangMock(mockFn);
  let hasil;
  let lempar = null;
  try {
    hasil = await getHadisArbain();
  } catch (err) {
    lempar = err;
  }
  pulihkan();
  cek(`${label} -> tidak throw`, lempar === null, lempar ? String(lempar) : "");
  cek(
    `${label} -> ok + sumber korpus + diambilPada null`,
    hasil !== undefined &&
      hasil.ok === true &&
      hasil.data.sumber === "korpus" &&
      hasil.data.diambilPada === null,
    hasil?.ok ? `sumber=${hasil.data.sumber}` : "ok:false",
  );
  cek(
    `${label} -> 3 hadis No. 1/12/15`,
    hasil !== undefined &&
      hasil.ok === true &&
      hasil.data.hadis.length === 3 &&
      hasil.data.hadis.map((h) => h.nomor).join(",") === "1,12,15",
    hasil?.ok ? `nomor=${hasil.data.hadis.map((h) => h.nomor)}` : "ok:false",
  );
  return hasil;
}

const fb1 = await cekFallback("B1 fetch throw (jaringan mati)", async () => {
  throw new Error("fetch failed");
});
const fb2 = await cekFallback("B2 HTTP 500", async () =>
  responJson({ status: false }, 500),
);
await cekFallback("B3 json() throw (badan rusak)", async () => ({
  ok: true,
  status: 200,
  json: async () => {
    throw new Error("badan bukan JSON");
  },
}));

// Teks fallback verbatim dari respons MyQuran terverifikasi
// (penanda khas yang hanya ada bila disalin apa adanya).
if (fb1 !== undefined && fb1.ok) {
  const perNomor = Object.fromEntries(
    fb1.data.hadis.map((h) => [h.nomor, h]),
  );
  cek(
    "B4 korpus No.1 verbatim (keapda/adia/Bukhari 1 & Muslim 1907)",
    perNomor[1].judul === "Amalan Bergantung pada Niat" &&
      perNomor[1].terjemahan.includes("keapda") &&
      perNomor[1].terjemahan.includes("adia berkata") &&
      perNomor[1].terjemahan.includes(
        "Diriwayatkan oleh al Bukhari (1) dan Muslim (1907).",
      ),
  );
  cek(
    "B5 korpus No.12 verbatim (Tirmidzi, Hadits Hasan)",
    perNomor[12].judul === "Meninggalkan Perkara yang tidak Bermanfaat" &&
      perNomor[12].terjemahan.includes(
        "(Hadits Hasan, diriwayatkan oleh At Tirmidzi dan selainnya seperti ini)",
      ),
  );
  cek(
    "B6 korpus No.15 verbatim (HR. al Bukhari dan Muslim)",
    perNomor[15].judul === "Barangsiapa Beriman kepada Allah dan Hari Akhir" &&
      perNomor[15].terjemahan.includes("(HR. al Bukhari dan Muslim)"),
  );
  cek(
    "B7 fallback korpus SAMA di semua jalur gagal",
    fb2 !== undefined &&
      fb2.ok &&
      JSON.stringify(fb2.data.hadis) === JSON.stringify(fb1.data.hadis),
  );
} else {
  cek("B4 korpus No.1 verbatim", false, "fallback B1 tidak ok");
  cek("B5 korpus No.12 verbatim", false, "fallback B1 tidak ok");
  cek("B6 korpus No.15 verbatim", false, "fallback B1 tidak ok");
  cek("B7 fallback korpus SAMA di semua jalur gagal", false, "fallback B1 tidak ok");
}

// ==================== (C) Bentuk tak dikenal -> gagal jujur ====================
async function cekGagalJujur(label, badan) {
  pasangMock(async () => responJson(badan));
  let hasil;
  let lempar = null;
  try {
    hasil = await getHadisArbain();
  } catch (err) {
    lempar = err;
  }
  pulihkan();
  cek(`${label} -> tidak throw`, lempar === null, lempar ? String(lempar) : "");
  cek(
    `${label} -> Hasil { ok: false }`,
    hasil !== undefined && hasil.ok === false,
    `hasil=${JSON.stringify(hasil)}`,
  );
}

await cekGagalJujur("C1 data bukan array", {
  status: true,
  data: "bukan-array",
});
await cekGagalJujur("C2 data array tapi 0 baris valid", {
  status: true,
  data: [{ no: "x" }, null, 42],
});
await cekGagalJujur("C3 badan null", null);
await cekGagalJujur("C4 badan tanpa kunci data", { status: true });

// Parser langsung: tidak pernah throw, bentuk tak dikenal -> [].
let parserAman = true;
try {
  parserAman =
    uraiHadisArbain(null).length === 0 &&
    uraiHadisArbain("teks").length === 0 &&
    uraiHadisArbain({}).length === 0 &&
    uraiHadisArbain({ data: "x" }).length === 0 &&
    uraiHadisArbain({ data: [{ no: "3", judul: "J", arab: "A", indo: "I" }] })
      .length === 1;
} catch {
  parserAman = false;
}
cek("C5 uraiHadisArbain murni: tak dikenal -> [], valid -> 1", parserAman);

// ==================== (D) Pemeriksaan statis ====================
const kodeDataLive = baca("src/lib/data-live.ts");
const kodeHalaman = baca("src/app/data/live/hadis/page.tsx");
const kodeIndeks = baca("src/app/data/live/page.tsx");
cek(
  "D1 endpoint mati HILANG dari data-live.ts + halaman + indeks",
  !kodeDataLive.includes("hadith.gading") &&
    !kodeHalaman.includes("hadith.gading") &&
    !kodeIndeks.includes("hadith.gading"),
);
cek(
  "D2 URL primary MyQuran ada di data-live.ts",
  kodeDataLive.includes("https://api.myquran.com/v2/hadits/arbain/semua"),
);
cek(
  "D3 label jujur ada (MyQuran API + Korpus terverifikasi)",
  kodeDataLive.includes("MyQuran API (Hadis Arbain Nawawi)") &&
    kodeDataLive.includes("Korpus terverifikasi"),
);
cek(
  "D4 TIDAK ADA klaim uptime palsu di berkas yang diubah",
  !/0%\s*downtime|100%\s*uptime/i.test(
    kodeDataLive + kodeHalaman + kodeIndeks,
  ),
);
cek(
  "D5 fetcher hadis lama (getDaftarKitab/getHadis) sudah dihapus",
  !kodeDataLive.includes("getDaftarKitab") &&
    !kodeDataLive.includes("export async function getHadis("),
);
cek(
  "D6 halaman menampilkan sumber + waktu ambil secara jujur",
  kodeHalaman.includes("LABEL_SUMBER_HADIS") &&
    kodeHalaman.includes("diambil") &&
    kodeHalaman.includes("korpus terverifikasi (3 hadis)"),
);
cek(
  "D7 fetcher API lain TIDAK tersentuh (BMKG/Quran/sholat/kurs masih ada)",
  kodeDataLive.includes("https://data.bmkg.go.id") &&
    kodeDataLive.includes("https://api.quran.gading.dev/surah") &&
    kodeDataLive.includes("https://api.myquran.com/v2/sholat/kota/semua") &&
    kodeDataLive.includes("https://api.frankfurter.dev/v1/currencies"),
);

// ==================== Ringkasan ====================
console.log(`\nRingkasan uji-hadis: ${lolos} lolos, ${gagal} gagal.`);
if (gagal > 0) {
  console.log("HASIL: GAGAL — ada asersi yang tidak lolos.");
  process.exit(1);
} else {
  console.log("HASIL: SEMUA LOLOS.");
  process.exit(0);
}
