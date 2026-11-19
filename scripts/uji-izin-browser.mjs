// Baterai izin browser PRATA FAKTA — notifikasi sopan, geolokasi
// sekali-tekan, pencocokan wilayah, store instalasi PWA, seksi
// /saya#izin-browser (pekerja D, cabang fitur/izin-browser).
// Tidak menyentuh DB (tanpa PGlite, tanpa env Supabase).
// Keluar 0 bila semua asersi lolos, 1 bila ada yang gagal.
//
// CARA JALAN (wajib, dari akar repo):
//   node --experimental-strip-types \
//     --import /tmp/pf-register.mjs scripts/uji-izin-browser.mjs
// Loader memetakan alias "@/" ke src/ (geolokasi + instalasi-pwa
// diimpor live). Tanpa loader, cek live (§A/§D) gagal jujur;
// cek statis (§B/§C/§E) tetap jalan.
//
// BATAS UJI YANG JUJUR:
// - Perilaku di browser nyata (popup izin muncul hanya sesudah
//   ketukan tombol, prompt instalasi, peta berpusat, pencocokan
//   wilayah end-to-end) TIDAK diuji di sini — butuh DOM/browser.
//   Yang diuji: fungsi murni + store + wiring statis.
// - normalisasiNama/cariCocokan di PemilihWilayah TIDAK diekspor
//   (sengaja — helper lokal komponen klien); §B menguji
//   logikanya dengan mengekstrak teks fungsi dari sumber dan
//   mengevaluasinya (pola yang sama dipakai baterai glosarium
//   untuk data v82). Bila ekstraksi gagal, cek §B gagal jujur,
//   bukan dilewati diam-diam.
// - String status store instalasi ("dapat-diinstal" /
//   "terinstal" / "tidak-tersedia") hanya bisa dibaca lewat hook
//   useStatusInstalasi() yang butuh render React — §D menguji
//   transisi store yang teramati (simpan/ambil/bersihkan/tandai)
//   + logika hitungStatus secara statis; render hook dicatat
//   LEWAT jujur di bawah.
// - sw.js diubah Tugas 1 (v26, 17 Nov 2026): §E memeriksa pola
//   kunci handler push/notificationclick + cabang payload
//   broadcast (event.data.json + ikon) di atas fallback.
import fs from "node:fs";
import path from "node:path";

const DIR_REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIR_SRC = path.join(DIR_REPO, "src");

let lolos = 0;
let gagal = 0;
let lewat = 0;
function cek(nama, ok, detail = "") {
  if (ok) {
    lolos += 1;
    console.log(`OK: ${nama}`);
  } else {
    gagal += 1;
    console.log(`GAGAL: ${nama}${detail ? ` — ${detail}` : ""}`);
  }
}
function lewati(nama, alasan) {
  lewat += 1;
  console.log(`LEWAT: ${nama} — ${alasan}`);
}
function baca(relatif, dir = DIR_REPO) {
  return fs.readFileSync(path.join(dir, relatif), "utf8");
}
function tanpaKomentar(kode) {
  return kode
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}
function semuaBerkasSrc() {
  const hasil = [];
  (function jalan(dir) {
    for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entri.name);
      if (entri.isDirectory()) jalan(p);
      else if (/\.(ts|tsx)$/.test(entri.name)) hasil.push(p);
    }
  })(DIR_SRC);
  return hasil;
}

// ---------- §A: Geolokasi murni (live, stub navigator global) ----------
let geo = null;
let geoGalat = null;
try {
  geo = await import("@/lib/geolokasi.ts");
} catch (err) {
  geoGalat = err;
}
cek(
  "IZIN-A0 impor live @/lib/geolokasi.ts (butuh loader /tmp/pf-register.mjs)",
  geo !== null,
  geoGalat ? String(geoGalat.message).split("\n")[0] : "",
);
if (geo) {
  const { mintaLokasi, bacaStatusIzin, pesanGagalLokasi } = geo;
  const NAVIGATOR_ASLI = globalThis.navigator;
  // Node 24: globalThis.navigator hanya punya getter (tanpa
  // setter) — pasang getter/setter sendiri yang configurable
  // agar stub bisa diganti, lalu kembalikan deskriptor asli.
  const NAVIGATOR_DESCRIPTOR = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  let navigatorSaatIni = NAVIGATOR_ASLI;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    enumerable: true,
    get() {
      return navigatorSaatIni;
    },
    set(v) {
      navigatorSaatIni = v;
    },
  });

  // Stub navigator: geolocation memanggil sukses/galat secara
  // sinkron; permissions.query mengembalikan state yang diminta.
  function navigatorStub(ops = {}) {
    const panggilan = [];
    const nav = {};
    if (ops.geolokasi) {
      nav.geolocation = {
        getCurrentPosition(sukses, galat, opsi) {
          panggilan.push(opsi ?? null);
          if (ops.geolokasi.sukses) {
            sukses({
              coords: {
                latitude: ops.geolokasi.sukses.lat,
                longitude: ops.geolokasi.sukses.lon,
                accuracy: ops.geolokasi.sukses.akurasi,
              },
            });
          } else {
            galat({
              code: ops.geolokasi.kode,
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            });
          }
        },
      };
    }
    if (ops.izin) {
      nav.permissions = {
        query: async (permintaan) => {
          panggilan.push(permintaan ?? null);
          if (ops.izin.melempar) throw new Error("query gagal");
          return { state: ops.izin.state };
        },
      };
    }
    return { nav, panggilan };
  }

  // A1–A5: jalur sukses + opsi yang diteruskan.
  {
    const { nav, panggilan } = navigatorStub({
      geolokasi: { sukses: { lat: -6.2, lon: 106.8, akurasi: 25 } },
    });
    globalThis.navigator = nav;
    const hasil = await mintaLokasi();
    cek(
      "IZIN-A1 mintaLokasi sukses → {ok:true, lintang, bujur, akurasi}",
      hasil.ok === true &&
        hasil.lintang === -6.2 &&
        hasil.bujur === 106.8 &&
        hasil.akurasi === 25,
      JSON.stringify(hasil),
    );
    cek("IZIN-A2 opsi timeout diteruskan = 10000 (10 detik)",
      panggilan.length === 1 && panggilan[0]?.timeout === 10000,
      JSON.stringify(panggilan[0] ?? null));
    cek("IZIN-A3 opsi maximumAge diteruskan = 60000 (60 detik)",
      panggilan.length === 1 && panggilan[0]?.maximumAge === 60000,
      JSON.stringify(panggilan[0] ?? null));
    cek("IZIN-A4 opsi enableHighAccuracy diteruskan = false (hemat baterai)",
      panggilan.length === 1 && panggilan[0]?.enableHighAccuracy === false,
      JSON.stringify(panggilan[0] ?? null));
    cek("IZIN-A5 getCurrentPosition dipanggil tepat 1x saat sukses",
      panggilan.length === 1,
      `${panggilan.length}x`);
  }
  // A6–A9: pemetaan kode galat.
  for (const [kode, alasan] of [[1, "ditolak"], [2, "tidak-tersedia"], [3, "timeout"], [99, "tidak-tersedia"]]) {
    const { nav } = navigatorStub({ geolokasi: { kode } });
    globalThis.navigator = nav;
    const hasil = await mintaLokasi();
    cek(
      `IZIN-A${kode === 1 ? 6 : kode === 2 ? 7 : kode === 3 ? 8 : 9} kode galat ${kode} → ${alasan}`,
      hasil.ok === false && hasil.alasan === alasan,
      JSON.stringify(hasil),
    );
  }
  // A10–A11: tanpa dukungan.
  {
    globalThis.navigator = {};
    const hasil = await mintaLokasi();
    cek(
      "IZIN-A10 tanpa geolocation di navigator → tidak-didukung",
      hasil.ok === false && hasil.alasan === "tidak-didukung",
      JSON.stringify(hasil),
    );
    globalThis.navigator = undefined;
    const hasil2 = await mintaLokasi();
    cek(
      "IZIN-A11 navigator undefined → tidak-didukung",
      hasil2.ok === false && hasil2.alasan === "tidak-didukung",
      JSON.stringify(hasil2),
    );
  }
  // A12–A17: bacaStatusIzin lewat Permissions API.
  for (const [state, harap] of [["granted", "diizinkan"], ["denied", "ditolak"], ["prompt", "bertanya"], ["liar", "tidak-diketahui"]]) {
    const { nav, panggilan } = navigatorStub({ izin: { state } });
    globalThis.navigator = nav;
    const hasil = await bacaStatusIzin();
    const nomor = state === "granted" ? 12 : state === "denied" ? 13 : state === "prompt" ? 14 : 15;
    cek(
      `IZIN-A${nomor} bacaStatusIzin state "${state}" → ${harap}`,
      hasil === harap,
      `dapat ${hasil}`,
    );
    if (state === "granted") {
      cek(
        "IZIN-A12b bacaStatusIzin memanggil permissions.query({name:'geolocation'})",
        panggilan.length === 1 && panggilan[0]?.name === "geolocation",
        JSON.stringify(panggilan[0] ?? null),
      );
    }
  }
  {
    globalThis.navigator = {};
    cek(
      "IZIN-A16 tanpa Permissions API → tidak-diketahui (bukan ditolak)",
      (await bacaStatusIzin()) === "tidak-diketahui",
    );
    const { nav } = navigatorStub({ izin: { state: "granted", melempar: true } });
    globalThis.navigator = nav;
    cek(
      "IZIN-A17 permissions.query melempar → tidak-diketahui",
      (await bacaStatusIzin()) === "tidak-diketahui",
    );
  }
  // A18–A25: pesanGagalLokasi — tiap alasan × tiap konteks, verbatim.
  const PESAN_HARAP = {
    ditolak: {
      peta: "Izin lokasi ditolak. Peta tetap menampilkan semua peristiwa.",
      cuaca: "Izin lokasi ditolak. Silakan pilih wilayah secara manual di bawah ini.",
    },
    "tidak-tersedia": {
      peta: "Lokasi tidak tersedia di perangkat ini saat ini. Peta tetap menampilkan semua peristiwa.",
      cuaca: "Lokasi tidak tersedia di perangkat ini saat ini. Silakan pilih wilayah secara manual di bawah ini.",
    },
    timeout: {
      peta: "Permintaan lokasi kehabisan waktu (10 detik). Peta tetap menampilkan semua peristiwa.",
      cuaca: "Permintaan lokasi kehabisan waktu (10 detik). Silakan pilih wilayah secara manual di bawah ini.",
    },
    "tidak-didukung": {
      peta: "Peramban ini tidak mendukung geolokasi. Peta tetap menampilkan semua peristiwa.",
      cuaca: "Peramban ini tidak mendukung geolokasi. Silakan pilih wilayah secara manual di bawah ini.",
    },
  };
  let nomorPesan = 18;
  for (const alasan of ["ditolak", "tidak-tersedia", "timeout", "tidak-didukung"]) {
    for (const konteks of ["peta", "cuaca"]) {
      const dapat = pesanGagalLokasi(alasan, konteks);
      cek(
        `IZIN-A${nomorPesan} pesanGagalLokasi("${alasan}", "${konteks}") verbatim`,
        dapat === PESAN_HARAP[alasan][konteks],
        dapat,
      );
      nomorPesan += 1;
    }
  }
  if (NAVIGATOR_DESCRIPTOR) {
    Object.defineProperty(globalThis, "navigator", NAVIGATOR_DESCRIPTOR);
  }
}

// ---------- §B: Pencocokan wilayah (ekstraksi fungsi + statis) ----------
// normalisasiNama/cariCocokan/kandidatProvinsi/desaKeAdm4 TIDAK
// diekspor dari PemilihWilayah (helper lokal komponen klien) —
// diekstrak teks fungsinya dari sumber lalu dievaluasi, agar
// logika yang benar-benar dikirim yang diuji, bukan salinan di
// baterai.
// Pengecualian: PETA_PROVINSI_ISO3166_2 DIekspor (konstanta data
// murni, bukan logika) agar isinya bisa diperiksa; peta tetap
// diekstrak teksnya di sini supaya yang diuji adalah sumber yang
// dikirim, bukan impor terpisah. Bila ekstraksi gagal, cek §B
// gagal jujur, bukan dilewati diam-diam.
const pemilihSrc = baca("components/data-live/PemilihWilayah.tsx", DIR_SRC);
function ekstrakFungsi(src, nama) {
  const awal = src.indexOf(`function ${nama}(`);
  if (awal < 0) return null;
  const buka = src.indexOf("{", awal);
  if (buka < 0) return null;
  let dalam = 0;
  for (let i = buka; i < src.length; i += 1) {
    if (src[i] === "{") dalam += 1;
    else if (src[i] === "}") {
      dalam -= 1;
      if (dalam === 0) return src.slice(awal, i + 1);
    }
  }
  return null;
}
let normSrc = ekstrakFungsi(pemilihSrc, "normalisasiNama");
let cariSrc = ekstrakFungsi(pemilihSrc, "cariCocokan");
let kandidatSrc = ekstrakFungsi(pemilihSrc, "kandidatProvinsi");
let adm4Src = ekstrakFungsi(pemilihSrc, "desaKeAdm4");
// Peta ISO diekstrak sebagai literal objek (bukan impor): cari
// kemunculan pertama nama konstanta, lalu cocokkan kurung kurawal.
let petaSrc = null;
{
  const awal = pemilihSrc.indexOf("PETA_PROVINSI_ISO3166_2");
  if (awal > -1) {
    const buka = pemilihSrc.indexOf("{", awal);
    if (buka > -1) {
      let dalam = 0;
      for (let i = buka; i < pemilihSrc.length; i += 1) {
        if (pemilihSrc[i] === "{") dalam += 1;
        else if (pemilihSrc[i] === "}") {
          dalam -= 1;
          if (dalam === 0) {
            petaSrc = `const PETA_PROVINSI_ISO3166_2 = ${pemilihSrc.slice(buka, i + 1)};`;
            break;
          }
        }
      }
    }
  }
}
if (normSrc) {
  normSrc = normSrc.replace("nama: string", "nama").replace("): string {", ") {");
}
if (cariSrc) {
  cariSrc = cariSrc
    .replace("nilai: (string | undefined)[]", "nilai")
    .replace("daftar: Wilayah[]", "daftar")
    .replace("abaikan: string[] = []", "abaikan = []")
    .replace("): Wilayah | null {", ") {");
}
if (kandidatSrc) {
  kandidatSrc = kandidatSrc
    .replace("alamat: AlamatNominatim", "alamat")
    .replace("): (string | undefined)[] {", ") {")
    .replace("const ekor: string[] = [];", "const ekor = [];");
}
if (adm4Src) {
  adm4Src = adm4Src
    .replace("idDesa: string", "idDesa")
    .replace("): string | null {", ") {");
}
let cocok = null;
try {
  if (
    normSrc &&
    cariSrc &&
    petaSrc &&
    kandidatSrc &&
    adm4Src &&
    !cariSrc.includes("Wilayah") &&
    !kandidatSrc.includes("AlamatNominatim")
  ) {
    cocok = new Function(
      `${normSrc}\n${cariSrc}\n${petaSrc}\n${kandidatSrc}\n${adm4Src}\nreturn { normalisasiNama, cariCocokan, kandidatProvinsi, PETA_PROVINSI_ISO3166_2, desaKeAdm4 };`,
    )();
  }
} catch {
  cocok = null;
}
cek(
  "IZIN-B0 ekstraksi normalisasiNama + cariCocokan + kandidatProvinsi + peta ISO + desaKeAdm4 dari sumber berhasil (tipe TS terlucuti)",
  cocok !== null &&
    typeof cocok?.normalisasiNama === "function" &&
    typeof cocok?.cariCocokan === "function" &&
    typeof cocok?.kandidatProvinsi === "function" &&
    typeof cocok?.desaKeAdm4 === "function" &&
    typeof cocok?.PETA_PROVINSI_ISO3166_2 === "object",
);
if (cocok) {
  const { normalisasiNama, cariCocokan, kandidatProvinsi, PETA_PROVINSI_ISO3166_2, desaKeAdm4 } = cocok;
  cek('IZIN-B1 normalisasi "KABUPATEN BANDUNG" → "bandung"',
    normalisasiNama("KABUPATEN BANDUNG") === "bandung");
  cek('IZIN-B2 normalisasi "Kota Yogyakarta" → "yogyakarta"',
    normalisasiNama("Kota Yogyakarta") === "yogyakarta");
  cek('IZIN-B3 normalisasi "Kecamatan Gambir" → "gambir"',
    normalisasiNama("Kecamatan Gambir") === "gambir");
  cek('IZIN-B4 normalisasi "Kab. Bandung Barat" → "bandung barat" (singkatan + titik)',
    normalisasiNama("Kab. Bandung Barat") === "bandung barat");
  cek(
    "IZIN-B5 cocok persis didahulukan atas contains (DKI Jakarta dulu di daftar, target jakarta → Jakarta)",
    cariCocokan(
      ["jakarta"],
      [
        { id: "dki", nama: "DKI Jakarta" },
        { id: "jkt", nama: "Jakarta" },
      ],
    )?.id === "jkt",
  );
  cek(
    'IZIN-B6 contains cadangan: "jakarta" ⊂ "dki jakarta" bila tak ada yang persis',
    cariCocokan(["jakarta"], [{ id: "dki", nama: "DKI Jakarta" }])?.id === "dki",
  );
  cek(
    "IZIN-B7 abaikan: nilai tingkat atas tidak dipakai lagi di bawah (Bandung diabaikan → null)",
    cariCocokan(["Bandung"], [{ id: "bdg", nama: "Bandung" }], ["Bandung"]) === null,
  );
  cek(
    "IZIN-B8 tidak ada yang cocok → null (tidak pernah menebak)",
    cariCocokan(["Tidak Ada"], [{ id: "bdg", nama: "Bandung" }]) === null,
  );
  // B14–B19: kandidat provinsi tahan-address-tanpa-state (pekerja H).
  // Daftar uji menyertakan pengecoh "Barat" (JAWA BARAT,
  // KALIMANTAN BARAT, KALIMANTAN SELATAN) agar kata umum yang
  // lolos saringan langsung ketahuan salah cocok.
  const DAFTAR_PROV_UJI = [
    { id: "11", nama: "ACEH" },
    { id: "31", nama: "DKI JAKARTA" },
    { id: "32", nama: "JAWA BARAT" },
    { id: "33", nama: "JAWA TENGAH" },
    { id: "35", nama: "JAWA TIMUR" },
    { id: "61", nama: "KALIMANTAN BARAT" },
    { id: "63", nama: "KALIMANTAN SELATAN" },
    { id: "34", nama: "DI YOGYAKARTA" },
  ];
  const provDariAlamat = (alamat) =>
    cariCocokan(kandidatProvinsi(alamat), DAFTAR_PROV_UJI);
  cek(
    'IZIN-B14 peta ISO: 38 entri, kunci pola ID-XX, ID-JK → "DKI JAKARTA"',
    Object.keys(PETA_PROVINSI_ISO3166_2).length === 38 &&
      Object.keys(PETA_PROVINSI_ISO3166_2).every((k) => /^ID-[A-Z]{2}$/.test(k)) &&
      PETA_PROVINSI_ISO3166_2["ID-JK"] === "DKI JAKARTA",
    `${Object.keys(PETA_PROVINSI_ISO3166_2).length} entri`,
  );
  cek(
    "IZIN-B15 peta ISO: 38 kode standar ada (AC/SU/SB/RI/KR/JA/SS/BB/BE/LA/BT/JK/JB/JT/YO/JI/BA/NB/NT/KB/KT/KS/KI/KU/SA/ST/SN/SG/GO/SR/MA/MU/PA/PB/PS/PT/PE/PD)",
    [
      "AC", "SU", "SB", "RI", "KR", "JA", "SS", "BB", "BE", "LA",
      "BT", "JK", "JB", "JT", "YO", "JI", "BA", "NB", "NT", "KB",
      "KT", "KS", "KI", "KU", "SA", "ST", "SN", "SG", "GO", "SR",
      "MA", "MU", "PA", "PB", "PS", "PT", "PE", "PD",
    ].every(
      (sufiks) => typeof PETA_PROVINSI_ISO3166_2[`ID-${sufiks}`] === "string",
    ),
  );
  cek(
    'IZIN-B16 kasus Jakarta CDP: address tanpa state, ISO "ID-JK", city "Jakarta Barat" → DKI JAKARTA',
    provDariAlamat({ city: "Jakarta Barat", "ISO3166-2-lvl4": "ID-JK" })?.id === "31",
    JSON.stringify(
      kandidatProvinsi({ city: "Jakarta Barat", "ISO3166-2-lvl4": "ID-JK" }),
    ),
  );
  cek(
    'IZIN-B17 kasus display_name: "Jakarta Barat, Daerah Khusus Ibukota Jakarta, Jawa, Indonesia" → DKI JAKARTA (bukan Jawa Barat)',
    provDariAlamat({
      display_name:
        "Jakarta Barat, Daerah Khusus Ibukota Jakarta, Jawa, Indonesia",
    })?.id === "31",
    JSON.stringify(
      kandidatProvinsi({
        display_name:
          "Jakarta Barat, Daerah Khusus Ibukota Jakarta, Jawa, Indonesia",
      }),
    ),
  );
  cek(
    'IZIN-B18 ISO liar "ID-XX" → null (jujur, tidak menebak)',
    provDariAlamat({ city: "Jakarta Barat", "ISO3166-2-lvl4": "ID-XX" }) === null,
  );
  cek(
    'IZIN-B19 regresi state normal: state "Jawa Barat" → JAWA BARAT; state_code "ID-JK" → DKI JAKARTA',
    provDariAlamat({ state: "Jawa Barat" })?.id === "32" &&
      provDariAlamat({ state_code: "ID-JK" })?.id === "31",
  );
  // B22–B23: rantai "Cuaca di lokasiku" kasus Jakarta CDP
  // (pekerja K): address Nominatim untuk -6.2/106.8 berisi
  // neighbourhood "Slipi" + suburb "Palmerah" TANPA
  // state/city_district/state_district — suburb dipakai sebagai
  // kandidat kecamatan, neighbourhood sebagai kandidat desa.
  // Daftar stub meniru Emsifa (nama huruf besar); hanya id
  // PALMERAH (3174030) + SLIPI (3174030002) yang terverifikasi
  // dari tugas, id pengecoh lain sekadar stub.
  const ALAMAT_JAKARTA_CDP = {
    neighbourhood: "Slipi",
    suburb: "Palmerah",
    city: "Jakarta Barat",
    "ISO3166-2-lvl4": "ID-JK",
    postcode: "10260",
    country: "Indonesia",
  };
  const KAB_JAKARTA_BARAT = [
    { id: "3171", nama: "KOTA JAKARTA BARAT" },
    { id: "3172", nama: "KOTA JAKARTA PUSAT" },
  ];
  const KEC_JAKARTA_BARAT = [
    { id: "3174030", nama: "PALMERAH" },
    { id: "3174050", nama: "KEBON JERUK" },
    { id: "3174060", nama: "CENGKARENG" },
    { id: "3174070", nama: "GROGOL PETAMBURAN" },
  ];
  const DESA_PALMERAH = [
    { id: "3174030001", nama: "PALMERAH" },
    { id: "3174030002", nama: "SLIPI" },
    { id: "3174030003", nama: "KEMANGGISAN" },
  ];
  // Rantai persis seperti cuacaDiLokasiku (urutan kandidat +
  // abaikan disalin dari call site di sumber): provinsi →
  // kabupaten → kecamatan → desa.
  const rantaiLokasi = (alamat) => {
    const prov = cariCocokan(kandidatProvinsi(alamat), DAFTAR_PROV_UJI);
    if (!prov) return { prov: null, kab: null, kec: null, desa: null };
    const kab = cariCocokan(
      [alamat.county, alamat.city, alamat.town],
      KAB_JAKARTA_BARAT,
      [prov.nama],
    );
    if (!kab) return { prov, kab: null, kec: null, desa: null };
    const kec = cariCocokan(
      [
        alamat.city_district,
        alamat.state_district,
        alamat.suburb,
        alamat.town,
        alamat.municipality,
        alamat.city,
      ],
      KEC_JAKARTA_BARAT,
      [kab.nama],
    );
    if (!kec) return { prov, kab, kec: null, desa: null };
    const desa = cariCocokan(
      [
        alamat.village,
        alamat.suburb,
        alamat.hamlet,
        alamat.neighbourhood,
        alamat.quarter,
      ],
      DESA_PALMERAH,
      [kec.nama, kab.nama],
    );
    return { prov, kab, kec, desa };
  };
  {
    const r = rantaiLokasi(ALAMAT_JAKARTA_CDP);
    cek(
      "IZIN-B22 kasus Jakarta CDP: suburb Palmerah → kecamatan PALMERAH + neighbourhood Slipi → desa SLIPI (rantai sampai desa, adm4 31.74.03.0002)",
      r.prov?.id === "31" &&
        r.kab?.id === "3171" &&
        r.kec?.id === "3174030" &&
        r.desa?.id === "3174030002" &&
        desaKeAdm4(r.desa.id) === "31.74.03.0002",
      JSON.stringify({ prov: r.prov?.id, kab: r.kab?.id, kec: r.kec?.id, desa: r.desa?.id }),
    );
  }
  cek(
    'IZIN-B23 regresi: suburb "Tidak Cocok" → kecamatan null (rantai berhenti, tidak menebak)',
    rantaiLokasi({
      neighbourhood: "Slipi",
      suburb: "Tidak Cocok",
      city: "Jakarta Barat",
      "ISO3166-2-lvl4": "ID-JK",
    }).kec === null,
  );
}
cek(
  "IZIN-B9 normalisasiNama/cariCocokan/kandidatProvinsi/desaKeAdm4 TIDAK diekspor (alasan §B memakai ekstraksi, bukan impor)",
  !/export[^\n]*(normalisasiNama|cariCocokan|kandidatProvinsi|desaKeAdm4)/.test(pemilihSrc),
);
cek(
  "IZIN-B10 call site kabupaten mengabaikan nama provinsi ([prov.nama])",
  pemilihSrc.includes("[prov.nama]"),
);
cek(
  "IZIN-B11 call site kecamatan mengabaikan nama kabupaten ([kab.nama])",
  pemilihSrc.includes("[kab.nama]"),
);
cek(
  "IZIN-B12 call site desa mengabaikan nama kecamatan + kabupaten ([kec.nama, kab.nama])",
  pemilihSrc.includes("[kec.nama, kab.nama]"),
);
cek(
  "IZIN-B13 urutan di sumber: loop cocok-persis sebelum loop kira-kira (contains)",
  pemilihSrc.indexOf("const persis = daftar.find") > -1 &&
    pemilihSrc.indexOf("const persis = daftar.find") <
      pemilihSrc.indexOf("const kira = daftar.find"),
);
cek(
  "IZIN-B20 call site gerbang provinsi memakai kandidatProvinsi(alamat) (bukan [alamat.state] saja)",
  pemilihSrc.includes("cariCocokan(kandidatProvinsi(alamat), daftarProv)") &&
    !pemilihSrc.includes("cariCocokan([alamat.state], daftarProv)"),
);
cek(
  "IZIN-B21 alamatDariKoordinat menggabungkan display_name tingkat atas ke alamat",
  pemilihSrc.includes('typeof tampil === "string" ? { display_name: tampil } : {}'),
);
cek(
  "IZIN-B24 call site kecamatan memakai alamat.suburb sesudah state_district, sebelum town",
  pemilihSrc.includes(
    "        alamat.state_district,\n        alamat.suburb,\n        alamat.town,",
  ),
);
cek(
  "IZIN-B25 call site desa memakai alamat.neighbourhood (sesudah hamlet, sebelum quarter)",
  pemilihSrc.includes(
    "        alamat.hamlet,\n        alamat.neighbourhood,\n        alamat.quarter,",
  ),
);

// ---------- §C: Cek sumber statis ----------
const pushSrc = baca("app/saya/notifikasi/PengalihPush.tsx", DIR_SRC);
const pushKode = tanpaKomentar(pushSrc);
// Mekanika subscribe/unsubscribe tinggal di lib klien sejak
// Tugas 1 (v26, 17 Nov 2026) — komponen hanya memanggilnya.
const libPushSrc = baca("lib/notifikasi-push.ts", DIR_SRC);
cek(
  "IZIN-C1 requestPermission di PengalihPush (di luar komentar) tepat 1 kemunculan",
  (pushKode.match(/requestPermission/g) ?? []).length === 1,
  `${(pushKode.match(/requestPermission/g) ?? []).length}x`,
);
{
  const iAktif = pushKode.indexOf("async function aktifkan()");
  const iReq = pushKode.indexOf("requestPermission");
  const iNon = pushKode.indexOf("async function nonaktifkan()");
  cek(
    "IZIN-C2 satu-satunya requestPermission ada di dalam aktifkan() (bukan di mount/periksaLagi)",
    iAktif > -1 && iAktif < iReq && iReq < iNon,
  );
}
const seksiSrc = baca("components/izin/SeksiIzin.tsx", DIR_SRC);
cek(
  "IZIN-C3 SeksiIzin: 0 requestPermission di luar komentar (hanya baca status + tombol Periksa lagi)",
  (tanpaKomentar(seksiSrc).match(/requestPermission/g) ?? []).length === 0,
);
{
  const berkas = semuaBerkasSrc();
  const adaDiKode = (pola) =>
    berkas.filter((p) => tanpaKomentar(fs.readFileSync(p, "utf8")).includes(pola));
  cek(
    "IZIN-C4 tanpa watchPosition di src/ (di luar komentar larangan di geolokasi.ts)",
    adaDiKode("watchPosition").length === 0,
    adaDiKode("watchPosition").join(", "),
  );
  cek(
    "IZIN-C5 tanpa getUserMedia di src/ (di luar komentar)",
    adaDiKode("getUserMedia").length === 0,
    adaDiKode("getUserMedia").join(", "),
  );
  cek(
    "IZIN-C6 tanpa mediaDevices di src/ (di luar komentar)",
    adaDiKode("mediaDevices").length === 0,
    adaDiKode("mediaDevices").join(", "),
  );
  cek(
    "IZIN-C7 tanpa SpeechRecognition / clipboard.read di src/ (di luar komentar)",
    adaDiKode("SpeechRecognition").length === 0 &&
      adaDiKode("clipboard.read").length === 0,
    [...adaDiKode("SpeechRecognition"), ...adaDiKode("clipboard.read")].join(", "),
  );
  const berkasBip = berkas
    .filter((p) => fs.readFileSync(p, "utf8").includes("beforeinstallprompt"))
    .map((p) => path.relative(DIR_REPO, p))
    .sort();
  cek(
    "IZIN-C8 beforeinstallprompt hanya di 2 berkas: instalasi-pwa.ts + PromptInstalasi.tsx",
    JSON.stringify(berkasBip) ===
      JSON.stringify([
        "src/components/pwa/PromptInstalasi.tsx",
        "src/lib/instalasi-pwa.ts",
      ]),
    berkasBip.join(", "),
  );
  const berkasBipKode = berkas.filter((p) =>
    tanpaKomentar(fs.readFileSync(p, "utf8")).includes("beforeinstallprompt"),
  );
  cek(
    "IZIN-C9 beforeinstallprompt di kode hanya di PromptInstalasi.tsx (addEventListener)",
    berkasBipKode.length === 1 &&
      berkasBipKode[0].endsWith("components/pwa/PromptInstalasi.tsx") &&
      tanpaKomentar(fs.readFileSync(berkasBipKode[0], "utf8")).includes(
        'addEventListener("beforeinstallprompt"',
      ),
    berkasBipKode.join(", "),
  );
}
{
  const layoutSrc = baca("app/layout.tsx", DIR_SRC);
  cek(
    "IZIN-C10 layout memasang <PromptInstalasi /> sesudah PendaftaranSW + BannerPembaruan",
    layoutSrc.includes("<PromptInstalasi />") &&
      layoutSrc.indexOf("<PendaftaranSW />") < layoutSrc.indexOf("<PromptInstalasi />") &&
      layoutSrc.indexOf("<BannerPembaruan />") < layoutSrc.indexOf("<PromptInstalasi />"),
  );
  const jmlScript = (layoutSrc.match(/<script/g) ?? []).length;
  cek(
    "IZIN-C11 layout: <script hanya 1, di dalam TemaInit pra-ada (bukan tambahan cabang ini)",
    jmlScript === 1 &&
      layoutSrc.indexOf("function TemaInit()") < layoutSrc.indexOf("<script") &&
      layoutSrc.indexOf("<script") <
        layoutSrc.indexOf("export default async function RootLayout"),
    `${jmlScript}x <script`,
  );
}
{
  const sayaSrc = baca("app/saya/page.tsx", DIR_SRC);
  cek(
    "IZIN-C12 SeksiIzin dipasang di saya/page.tsx sesudah #pengaturan-privasi (seksi #izin-browser)",
    sayaSrc.indexOf('id="pengaturan-privasi"') > -1 &&
      sayaSrc.indexOf('id="pengaturan-privasi"') < sayaSrc.indexOf('id="izin-browser"') &&
      sayaSrc.indexOf('id="izin-browser"') < sayaSrc.indexOf("<SeksiIzin />"),
  );
  cek(
    "IZIN-C13 jangkar #izin-browser ada (tautan nav + id seksi)",
    sayaSrc.includes('href="#izin-browser"') && sayaSrc.includes('id="izin-browser"'),
  );
  cek(
    "IZIN-C14 h1 di saya/page.tsx tetap 1",
    (sayaSrc.match(/<h1/g) ?? []).length === 1,
    `${(sayaSrc.match(/<h1/g) ?? []).length}x`,
  );
}
{
  const BERKAS_CABANG = [
    "src/lib/geolokasi.ts",
    "src/lib/instalasi-pwa.ts",
    "src/components/izin/SeksiIzin.tsx",
    "src/components/pwa/PromptInstalasi.tsx",
    "src/app/saya/notifikasi/PengalihPush.tsx",
    "src/components/data-live/PemilihWilayah.tsx",
    "src/components/peta/PetaDunia.tsx",
    "src/app/saya/page.tsx",
  ];
  const denganScript = BERKAS_CABANG.filter((f) => baca(f).includes("<script"));
  cek(
    "IZIN-C15 tanpa <script di 8 berkas baru/diubah cabang ini (tidak ada skrip inline baru)",
    denganScript.length === 0,
    denganScript.join(", "),
  );
  const BARU = [
    "src/lib/geolokasi.ts",
    "src/lib/instalasi-pwa.ts",
    "src/components/izin/SeksiIzin.tsx",
    "src/components/pwa/PromptInstalasi.tsx",
  ];
  const DIUBAH = [
    "src/app/saya/notifikasi/PengalihPush.tsx",
    "src/components/data-live/PemilihWilayah.tsx",
    "src/components/peta/PetaDunia.tsx",
  ];
  const pakaiDate = (daftar) =>
    daftar.filter((f) => baca(f).includes("new Date()") || baca(f).includes("Date.now()"));
  cek(
    "IZIN-C16 tanpa new Date()/Date.now() di 4 berkas baru izin/geolokasi/instalasi",
    pakaiDate(BARU).length === 0,
    pakaiDate(BARU).join(", "),
  );
  cek(
    "IZIN-C17 tanpa new Date()/Date.now() di 3 komponen diubah (PengalihPush/PetaDunia/PemilihWilayah)",
    pakaiDate(DIUBAH).length === 0,
    pakaiDate(DIUBAH).join(", "),
  );
}

// ---------- §D: Store instalasi (live, tanpa DOM) ----------
let pwa = null;
let pwaGalat = null;
try {
  pwa = await import("@/lib/instalasi-pwa.ts");
} catch (err) {
  pwaGalat = err;
}
cek(
  "IZIN-D0 impor live @/lib/instalasi-pwa.ts (butuh loader /tmp/pf-register.mjs)",
  pwa !== null,
  pwaGalat ? String(pwaGalat.message).split("\n")[0] : "",
);
if (pwa) {
  const {
    simpanEventInstalasi,
    bersihkanEventInstalasi,
    ambilEventInstalasi,
    tandaiTerinstal,
    apakahTerinstal,
  } = pwa;
  const eventPalsu = (platform = "web") => ({
    preventDefault() {},
    platforms: [platform],
    prompt: async () => {},
    userChoice: Promise.resolve({ outcome: "accepted", platform }),
  });
  cek(
    "IZIN-D1 awal: ambilEventInstalasi() === null (belum ada event)",
    ambilEventInstalasi() === null,
  );
  const ev1 = eventPalsu();
  simpanEventInstalasi(ev1);
  cek(
    "IZIN-D2 simpan event → ambil mengembalikan event yang sama (referensi)",
    ambilEventInstalasi() === ev1,
  );
  bersihkanEventInstalasi();
  cek(
    "IZIN-D3 bersihkan event → ambil === null (satu event hanya sekali pakai)",
    ambilEventInstalasi() === null,
  );
  const ev2 = eventPalsu("play");
  simpanEventInstalasi(ev2);
  tandaiTerinstal();
  cek(
    "IZIN-D4 tandaiTerinstal → event dibersihkan (ambil === null)",
    ambilEventInstalasi() === null,
  );
  cek(
    "IZIN-D5 apakahTerinstal() === false tanpa window (Node, bukan browser)",
    apakahTerinstal() === false,
  );
}
{
  const pwaSrc = baca("lib/instalasi-pwa.ts", DIR_SRC);
  cek(
    "IZIN-D6 hitungStatus mendahulukan terinstal atas event (terinstal menang bila keduanya ada)",
    pwaSrc.indexOf('if (terinstal) return "terinstal";') > -1 &&
      pwaSrc.indexOf('if (terinstal) return "terinstal";') <
        pwaSrc.indexOf('if (eventTersimpan) return "dapat-diinstal";'),
  );
  cek(
    "IZIN-D7 useStatusInstalasi pakai useSyncExternalStore + snapshot server selalu \"tidak-tersedia\"",
    pwaSrc.includes("useSyncExternalStore(") &&
      pwaSrc.includes("ambilSnapshotServer") &&
      /function ambilSnapshotServer\(\): StatusInstalasi \{\s*return "tidak-tersedia";\s*\}/.test(pwaSrc),
  );
  cek(
    "IZIN-D8 SeksiIzin: tombol Instal memanggil event.prompt() + userChoice lalu bersihkanEventInstalasi()",
    seksiSrc.includes("await event.prompt()") &&
      seksiSrc.includes("await event.userChoice") &&
      seksiSrc.includes("bersihkanEventInstalasi()"),
  );
}
lewati(
  "IZIN-D9 transisi string status via hook useStatusInstalasi()",
  "butuh render React/DOM (browser) — §D menguji transisi store yang teramati + logika hitungStatus; render hook butuh browser nyata",
);

// ---------- §E: Penjaga regresi ----------
{
  cek(
    "IZIN-E1 lib klien: alur subscribe utuh (register /sw.js + pushManager.subscribe) + PengalihPush memanggil aktifkanPush()",
    libPushSrc.includes("pushManager.subscribe(") &&
      libPushSrc.includes('navigator.serviceWorker.register("/sw.js")') &&
      pushSrc.includes("aktifkanPush()"),
  );
  cek(
    "IZIN-E2 lib klien: POST /api/notifications/subscribe sesudah subscribe",
    libPushSrc.includes('"/api/notifications/subscribe"') && libPushSrc.includes('method: "POST"'),
  );
  cek(
    "IZIN-E3 PengalihPush: PATCH push_notifikasi true sesudah langganan tersimpan",
    pushSrc.includes("JSON.stringify({ push_notifikasi: true })"),
  );
  cek(
    "IZIN-E4 lib klien: unsubscribe utuh (DELETE /api/notifications/subscribe + langganan.unsubscribe()) + PengalihPush memanggil matikanPush()",
    libPushSrc.includes('method: "DELETE"') &&
      libPushSrc.includes("langganan.unsubscribe()") &&
      pushSrc.includes("matikanPush()"),
  );
  cek(
    "IZIN-E5 PengalihPush: PATCH push_notifikasi false saat mematikan",
    pushSrc.includes("JSON.stringify({ push_notifikasi: false })"),
  );
  // E15–E17 (v28): gerbang push TAMU — /saya/notifikasi TIDAK
  // BOLEH lagi mengalihkan tamu ke /masuk (sebelum v28, endpoint
  // langganan tamu praktis mati: tidak ada UI tamu yang
  // mencapainya). PengalihPush + endpoint subscribe TIDAK diubah.
  const halamanNotifikasi = baca("app/saya/notifikasi/page.tsx", DIR_SRC);
  cek(
    "IZIN-E15 halaman notifikasi: TIDAK ADA redirect tamu ke /masuk",
    !halamanNotifikasi.includes('redirect("/masuk")') &&
      !halamanNotifikasi.includes("redirect("),
  );
  cek(
    "IZIN-E16 halaman notifikasi: cabang tamu merender PengalihPush + ajakan masuk",
    halamanNotifikasi.includes("if (!penggunaId)") &&
      halamanNotifikasi.includes("<PengalihPush />") &&
      halamanNotifikasi.includes('href="/masuk"'),
  );
  cek(
    "IZIN-E17 halaman notifikasi: daftar in-app + FormPreferensiNotifikasi tetap hanya untuk pengguna masuk",
    halamanNotifikasi.indexOf("<FormPreferensiNotifikasi />") >
      halamanNotifikasi.indexOf("if (!penggunaId)") &&
      halamanNotifikasi.includes('from("pf_notifications")'),
  );
}
{
  const petaSrc = baca("components/peta/PetaDunia.tsx", DIR_SRC);
  cek(
    "IZIN-E6 PetaDunia: tile OpenStreetMap utuh",
    petaSrc.includes("https://tile.openstreetmap.org/{z}/{x}/{y}.png"),
  );
  cek(
    "IZIN-E7 PetaDunia: view awal [-2.5, 118] zoom 5 utuh",
    petaSrc.includes(".setView([-2.5, 118], 5)"),
  );
  cek(
    "IZIN-E8 PetaDunia: penanda lokasi biru (circleMarker + tooltip \"Lokasi Anda\" + setView zoom 13)",
    petaSrc.includes("L.circleMarker") &&
      petaSrc.includes('bindTooltip("Lokasi Anda"') &&
      petaSrc.includes("peta.setView([hasil.lintang, hasil.bujur], 13)"),
  );
}
cek(
  "IZIN-E9 PemilihWilayah: alur manual utuh (4 select provinsi/kabupaten/kecamatan/desa)",
  ["pilih-provinsi", "pilih-kabupaten", "pilih-kecamatan", "pilih-desa"].every((id) =>
    pemilihSrc.includes(`id="${id}"`),
  ),
);
cek(
  "IZIN-E10 PemilihWilayah: desaKeAdm4 + navigasi router.push ?adm4= utuh",
  pemilihSrc.includes("function desaKeAdm4") &&
    pemilihSrc.includes("router.push(`/data/live/cuaca?adm4=${adm4}`)"),
);
cek(
  "IZIN-E11 PemilihWilayah: tombol \"Cuaca di lokasiku\" + reverse geocode Nominatim utuh",
  pemilihSrc.includes("Cuaca di lokasiku") &&
    pemilihSrc.includes("nominatim.openstreetmap.org/reverse"),
);
{
  const sw = baca("public/sw.js");
  const polaPush = [
    'self.addEventListener("push"',
    'fetch("/api/notifikasi"',
    'self.registration.showNotification(judul',
  ];
  cek(
    "IZIN-E12 sw.js: handler push utuh (listener + fetch /api/notifikasi + showNotification)",
    polaPush.every((p) => sw.includes(p)),
    polaPush.filter((p) => !sw.includes(p)).join(", "),
  );
  const polaKlik = [
    'self.addEventListener("notificationclick"',
    "event.notification.close()",
    "self.clients.openWindow(url)",
    '"/saya/notifikasi"',
  ];
  cek(
    "IZIN-E13 sw.js: handler notificationclick utuh (listener + close + openWindow + fallback /saya/notifikasi)",
    polaKlik.every((p) => sw.includes(p)),
    polaKlik.filter((p) => !sw.includes(p)).join(", "),
  );
  // E14 DULU: "sw.js tidak berubah vs HEAD (git diff kosong)" —
  // freeze itu SUDAH lewat: sw.js SENGAJA berubah di Tugas 1
  // (v26, 17 Nov 2026) untuk cabang payload broadcast. Yang
  // dikunci sekarang adalah keadaan BARU: cabang payload ada DI
  // ATAS fallback tanpa-payload (fallback tetap diuji E12/E13),
  // bukan "tidak ada perubahan sama sekali".
  cek(
    "IZIN-E14 sw.js: cabang payload broadcast (event.data.json + ikon) di atas fallback tanpa-payload",
    sw.includes("event.data.json()") &&
      sw.includes('icon: "/icons/icon-512.png"') &&
      sw.indexOf("event.data.json()") < sw.indexOf('fetch("/api/notifikasi"'),
    "cabang payload v26 hilang — broadcast tampil generik",
  );
}

// ---------- §F: Proxy server wilayah + reverse-geocode (pekerja F) ----------
// Alasan proxy: fetch klien langsung ke emsifa.com / Nominatim
// DIBLOKIR CSP connect-src produksi (hanya 'self' + Supabase) —
// select wilayah kosong di produksi sejak commit 418b578.
// Route baru: /api/wilayah (Emsifa) + /api/geocode/balik
// (Nominatim, UA "PRATA-FAKTA/1.0" — di browser UA kustom
// dilarang, di server boleh).
//
// CATATAN UJI: GET live memanggil rate limiter fail-open
// (buatRateLimiter → RPC pf_rate_limit_check → createClient →
// next/headers stub melempar) — limiter mencatat satu baris JSON
// console.error "rate_limit_rpc_gagal" per GET lalu MENGIZINKAN
// (fail-open, by design di route-auth.ts). Baris itu BUKAN
// kegagalan uji. fetch upstream di-stub (tanpa jaringan).
{
  const adaWilayah = fs.existsSync(
    path.join(DIR_REPO, "src/app/api/wilayah/route.ts"),
  );
  const adaBalik = fs.existsSync(
    path.join(DIR_REPO, "src/app/api/geocode/balik/route.ts"),
  );
  cek("IZIN-F1 route /api/wilayah terdaftar (berkas src/app/api/wilayah/route.ts ada)", adaWilayah);
  cek("IZIN-F2 route /api/geocode/balik terdaftar (berkas src/app/api/geocode/balik/route.ts ada)", adaBalik);

  let ruteWilayah = null;
  let ruteWilayahGalat = null;
  try {
    ruteWilayah = await import("@/app/api/wilayah/route.ts");
  } catch (err) {
    ruteWilayahGalat = err;
  }
  cek(
    "IZIN-F3 impor live @/app/api/wilayah/route.ts (butuh loader /tmp/pf-register.mjs)",
    ruteWilayah !== null,
    ruteWilayahGalat ? String(ruteWilayahGalat.message).split("\n")[0] : "",
  );
  // FU2: helper validasi/URL pindah dari route ke lib — impor dari
  // "@/lib/wilayah", bukan dari route.
  let libWilayah = null;
  let libWilayahGalat = null;
  try {
    libWilayah = await import("@/lib/wilayah.ts");
  } catch (err) {
    libWilayahGalat = err;
  }
  cek(
    "IZIN-F3b impor live @/lib/wilayah.ts (FU2: helper pindah dari route)",
    libWilayah !== null,
    libWilayahGalat ? String(libWilayahGalat.message).split("\n")[0] : "",
  );
  let ruteBalik = null;
  let ruteBalikGalat = null;
  try {
    ruteBalik = await import("@/app/api/geocode/balik/route.ts");
  } catch (err) {
    ruteBalikGalat = err;
  }
  cek(
    "IZIN-F4 impor live @/app/api/geocode/balik/route.ts (butuh loader /tmp/pf-register.mjs)",
    ruteBalik !== null,
    ruteBalikGalat ? String(ruteBalikGalat.message).split("\n")[0] : "",
  );
  // FU2: helper validasi/URL pindah dari route ke lib — impor dari
  // "@/lib/geocode", bukan dari route.
  let libBalik = null;
  let libBalikGalat = null;
  try {
    libBalik = await import("@/lib/geocode.ts");
  } catch (err) {
    libBalikGalat = err;
  }
  cek(
    "IZIN-F4b impor live @/lib/geocode.ts (FU2: helper pindah dari route)",
    libBalik !== null,
    libBalikGalat ? String(libBalikGalat.message).split("\n")[0] : "",
  );

  if (libWilayah) {
    const { validasiWilayah, urlWilayah } = libWilayah;
    cek(
      "IZIN-F5 validasi wilayah: tingkat liar → { ok:false } (400 di GET)",
      validasiWilayah("liar", null).ok === false,
      JSON.stringify(validasiWilayah("liar", null)),
    );
    cek(
      "IZIN-F6 validasi wilayah: induk non-digit → { ok:false } (400 di GET)",
      validasiWilayah("kabupaten", "31a").ok === false &&
        validasiWilayah("kabupaten", "31;DROP").ok === false &&
        validasiWilayah("kecamatan", "").ok === false,
    );
    cek(
      "IZIN-F7 validasi wilayah: provinsi tanpa induk → ok (tidak butuh induk)",
      validasiWilayah("provinsi", null).ok === true &&
        validasiWilayah("provinsi", null).tingkat === "provinsi",
      JSON.stringify(validasiWilayah("provinsi", null)),
    );
    cek(
      "IZIN-F8 validasi wilayah: kabupaten/kecamatan/kelurahan + induk digit → ok",
      validasiWilayah("kabupaten", "31").ok === true &&
        validasiWilayah("kecamatan", "3171").ok === true &&
        validasiWilayah("kelurahan", "3171010001").ok === true,
    );
    cek(
      "IZIN-F9 urlWilayah: 4 URL Emsifa persis (provinces/regencies/districts/villages)",
      urlWilayah("provinsi", null) ===
        "https://www.emsifa.com/api-wilayah-indonesia/api/provinces.json" &&
        urlWilayah("kabupaten", "31") ===
          "https://www.emsifa.com/api-wilayah-indonesia/api/regencies/31.json" &&
        urlWilayah("kecamatan", "3171") ===
          "https://www.emsifa.com/api-wilayah-indonesia/api/districts/3171.json" &&
        urlWilayah("kelurahan", "3171010001") ===
          "https://www.emsifa.com/api-wilayah-indonesia/api/villages/3171010001.json",
    );
  }
  if (libBalik) {
    const { validasiBalik, urlNominatimBalik } = libBalik;
    cek(
      "IZIN-F10 validasi balik: lat liar (91 / -91 / abc / kosong) → { ok:false }",
      validasiBalik("91", "0").ok === false &&
        validasiBalik("-91", "0").ok === false &&
        validasiBalik("abc", "0").ok === false &&
        validasiBalik(null, "0").ok === false &&
        validasiBalik("", "0").ok === false,
    );
    cek(
      "IZIN-F11 validasi balik: lon liar (181 / -181 / abc / kosong) → { ok:false }",
      validasiBalik("0", "181").ok === false &&
        validasiBalik("0", "-181").ok === false &&
        validasiBalik("0", "abc").ok === false &&
        validasiBalik("0", null).ok === false,
    );
    cek(
      "IZIN-F12 validasi balik: batas tepi -90/90 dan -180/180 lolos, -6.2/106.8 lolos",
      validasiBalik("-90", "-180").ok === true &&
        validasiBalik("90", "180").ok === true &&
        validasiBalik("-6.2", "106.8").ok === true,
    );
    cek(
      "IZIN-F13 urlNominatimBalik: reverse?format=jsonv2&lat&lon&zoom=10 persis",
      urlNominatimBalik(-6.2, 106.8) ===
        "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=-6.2&lon=106.8&zoom=10",
    );
  }

  // GET live dengan fetch upstream di-stub.
  if (ruteWilayah && ruteBalik) {
    const fetchAsli = globalThis.fetch;
    const panggilan = [];
    const stubSuksesWilayah = async (url, init) => {
      panggilan.push({ url: String(url), init: init ?? null });
      return new Response(
        JSON.stringify([{ id: "31", name: "DKI JAKARTA" }]),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    };
    try {
      globalThis.fetch = stubSuksesWilayah;
      const rLiar = await ruteWilayah.GET(
        new Request("http://localhost/api/wilayah?tingkat=liar"),
      );
      cek(
        "IZIN-F14 GET /api/wilayah?tingkat=liar → 400 (bukan fallback)",
        rLiar.status === 400,
        `${rLiar.status}`,
      );
      const rTanpaInduk = await ruteWilayah.GET(
        new Request("http://localhost/api/wilayah?tingkat=kabupaten"),
      );
      cek(
        "IZIN-F15 GET /api/wilayah?tingkat=kabupaten (tanpa induk) → 400",
        rTanpaInduk.status === 400,
        `${rTanpaInduk.status}`,
      );
      const rProv = await ruteWilayah.GET(
        new Request("http://localhost/api/wilayah?tingkat=provinsi"),
      );
      const badanProv = await rProv.json();
      cek(
        "IZIN-F16 GET /api/wilayah?tingkat=provinsi → 200 + array upstream diteruskan apa adanya",
        rProv.status === 200 &&
          Array.isArray(badanProv) &&
          badanProv[0]?.id === "31" &&
          badanProv[0]?.name === "DKI JAKARTA",
        `${rProv.status} ${JSON.stringify(badanProv)}`,
      );
      cek(
        "IZIN-F17 GET wilayah meneruskan ke provinces.json dengan cache revalidate 86400",
        panggilan.length >= 1 &&
          panggilan[panggilan.length - 1].url ===
            "https://www.emsifa.com/api-wilayah-indonesia/api/provinces.json" &&
          panggilan[panggilan.length - 1].init?.next?.revalidate === 86400,
        JSON.stringify(panggilan[panggilan.length - 1] ?? null),
      );
      globalThis.fetch = async () => new Response("galat", { status: 500 });
      const r502 = await ruteWilayah.GET(
        new Request("http://localhost/api/wilayah?tingkat=provinsi"),
      );
      cek(
        "IZIN-F18 GET wilayah upstream HTTP 500 → 502 jujur (bukan data palsu)",
        r502.status === 502,
        `${r502.status}`,
      );
      globalThis.fetch = async () => {
        throw new Error("jaringan putus");
      };
      const r503 = await ruteWilayah.GET(
        new Request("http://localhost/api/wilayah?tingkat=provinsi"),
      );
      cek(
        "IZIN-F19 GET wilayah upstream tak terjangkau → 503 jujur",
        r503.status === 503,
        `${r503.status}`,
      );

      const stubSuksesBalik = async (url, init) => {
        panggilan.push({ url: String(url), init: init ?? null });
        return new Response(
          JSON.stringify({
            display_name: "Jakarta",
            address: { state: "Jakarta" },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      };
      globalThis.fetch = stubSuksesBalik;
      const rLatLiar = await ruteBalik.GET(
        new Request("http://localhost/api/geocode/balik?lat=91&lon=0"),
      );
      cek(
        "IZIN-F20 GET /api/geocode/balik?lat=91 → 400",
        rLatLiar.status === 400,
        `${rLatLiar.status}`,
      );
      const rLonLiar = await ruteBalik.GET(
        new Request("http://localhost/api/geocode/balik?lat=0&lon=abc"),
      );
      cek(
        "IZIN-F21 GET /api/geocode/balik?lon=abc → 400",
        rLonLiar.status === 400,
        `${rLonLiar.status}`,
      );
      const rBalik = await ruteBalik.GET(
        new Request(
          "http://localhost/api/geocode/balik?lat=-6.2&lon=106.8",
        ),
      );
      const badanBalik = await rBalik.json();
      cek(
        "IZIN-F22 GET /api/geocode/balik valid → 200 + JSON upstream diteruskan (display_name utuh)",
        rBalik.status === 200 && badanBalik.display_name === "Jakarta",
        `${rBalik.status} ${JSON.stringify(badanBalik)}`,
      );
      const panggilanBalik = panggilan[panggilan.length - 1];
      cek(
        "IZIN-F23 GET balik memakai User-Agent \"PRATA-FAKTA/1.0\" (di server boleh, di browser dilarang)",
        panggilanBalik?.init?.headers?.["User-Agent"] === "PRATA-FAKTA/1.0" &&
          panggilanBalik.url.includes("zoom=10"),
        JSON.stringify(panggilanBalik ?? null),
      );
      globalThis.fetch = async () => new Response("galat", { status: 500 });
      const r502b = await ruteBalik.GET(
        new Request("http://localhost/api/geocode/balik?lat=-6.2&lon=106.8"),
      );
      cek(
        "IZIN-F24 GET balik upstream HTTP 500 → 502 jujur (bukan data palsu)",
        r502b.status === 502,
        `${r502b.status}`,
      );
    } finally {
      globalThis.fetch = fetchAsli;
    }
  }

  // Cek sumber: route + call site.
  const wilayahSrc = baca("app/api/wilayah/route.ts", DIR_SRC);
  const balikSrc = baca("app/api/geocode/balik/route.ts", DIR_SRC);
  cek(
    "IZIN-F25 route wilayah: rate limit bersama buatRateLimiter dipakai",
    wilayahSrc.includes("buatRateLimiter(") &&
      wilayahSrc.includes("responRateLimit()"),
  );
  cek(
    "IZIN-F26 route wilayah: cache revalidate 86400 di fetch upstream",
    wilayahSrc.includes("revalidate: 86400"),
  );
  cek(
    "IZIN-F27 route balik: rate limit bersama buatRateLimiter dipakai",
    balikSrc.includes("buatRateLimiter(") &&
      balikSrc.includes("responRateLimit()"),
  );
  cek(
    "IZIN-F28 route balik: header User-Agent \"PRATA-FAKTA/1.0\" diset di server",
    balikSrc.includes('"User-Agent": UA') &&
      balikSrc.includes('const UA = "PRATA-FAKTA/1.0"'),
  );
  const pemilihKode = tanpaKomentar(pemilihSrc);
  cek(
    "IZIN-F29 PemilihWilayah: 0 kemunculan emsifa.com di luar komentar (fetch langsung hilang)",
    (pemilihKode.match(/emsifa\.com/g) ?? []).length === 0,
    `${(pemilihKode.match(/emsifa\.com/g) ?? []).length}x`,
  );
  cek(
    "IZIN-F30 PemilihWilayah: 0 kemunculan nominatim.openstreetmap.org di luar komentar (fetch langsung hilang)",
    (pemilihKode.match(/nominatim\.openstreetmap\.org/g) ?? []).length === 0,
    `${(pemilihKode.match(/nominatim\.openstreetmap\.org/g) ?? []).length}x`,
  );
  cek(
    "IZIN-F31 PemilihWilayah: ambilWilayah memanggil /api/wilayah + alamatDariKoordinat memanggil /api/geocode/balik",
    pemilihKode.includes('fetch(`/api/wilayah?${params.toString()}`)') &&
      pemilihKode.includes('fetch(\n    `/api/geocode/balik?lat=${lintang}&lon=${bujur}`,'),
  );
  const seksiKode = tanpaKomentar(seksiSrc);
  cek(
    "IZIN-F32 SeksiIzin: 0 kemunculan nominatim.openstreetmap.org di luar komentar (fetch langsung hilang)",
    (seksiKode.match(/nominatim\.openstreetmap\.org/g) ?? []).length === 0,
    `${(seksiKode.match(/nominatim\.openstreetmap\.org/g) ?? []).length}x`,
  );
  cek(
    "IZIN-F33 SeksiIzin: cekLokasi memanggil /api/geocode/balik",
    seksiKode.includes("`/api/geocode/balik?lat=${lat}&lon=${lon}`"),
  );
  cek(
    "IZIN-F34 SeksiIzin: teks privasi jujur soal proxy (server PRATA FAKTA meneruskan ke Nominatim; tidak menyimpan koordinat)",
    seksiSrc.includes("server PRATA FAKTA (proxy)") &&
      seksiSrc.includes("meneruskannya ke Nominatim") &&
      seksiSrc.includes("tidak menyimpan koordinat"),
  );
  const geoSrc = baca("lib/geolokasi.ts", DIR_SRC);
  cek(
    "IZIN-F35 geolokasi.ts: komentar kejujuran menyebut proxy /api/geocode/balik (bukan fetch langsung ke Nominatim)",
    geoSrc.includes("/api/geocode/balik") &&
      !tanpaKomentar(geoSrc).includes("nominatim.openstreetmap.org"),
  );
}

// ---------- Ringkasan ----------
console.log(
  `\nRINGKASAN uji-izin-browser: ${lolos} lolos, ${gagal} gagal, ${lewat} lewat.`,
);
if (gagal > 0) {
  console.log("HASIL: GAGAL — ada cek yang tidak lolos.");
  process.exitCode = 1;
} else {
  console.log("HASIL: SEMUA LOLOS.");
}
