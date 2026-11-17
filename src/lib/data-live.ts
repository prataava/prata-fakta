// Data Live (Fase "10 API gratis") — pembaca server-side untuk API
// publik gratis dari video TikTok @khifrandevsolution (16 Nov 2026).
// Aturan: SEMUA fetch lewat helper ini (cache revalidate per API,
// tanpa kunci), SEMUA kegagalan dikembalikan sebagai { ok: false }
// (halaman menampilkan EmptyState jujur — TIDAK PERNAH data palsu),
// dan tiap halaman WAJIB mencantumkan sumber + atribusi.
// User-Agent khusus dipakai untuk Nominatim (kebijakan OSM:
// maks 1 req/detik, wajib UA valid + atribusi ODbL).

const UA = "PRATA-FAKTA/1.0 (farhan.agustian2008@gmail.com)";

type Hasil<T> = { ok: true; data: T } | { ok: false };

async function ambilJson<T>(
  url: string,
  revalidate: number,
  label: string,
): Promise<Hasil<T>> {
  try {
    const res = await fetch(url, {
      next: { revalidate },
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) {
      console.error(`[data-live] ${label}: HTTP ${res.status}`);
      return { ok: false };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    console.error(`[data-live] ${label}: gagal fetch`, err);
    return { ok: false };
  }
}

function adalahObjek(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function teks(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/* ============================================================
   1. Gempa BMKG — data.bmkg.go.id (tanpa kunci)
   ============================================================ */

export type Gempa = {
  tanggal: string;
  jam: string;
  datetime: string;
  lintang: string;
  bujur: string;
  magnitude: string;
  kedalaman: string;
  wilayah: string;
  potensi: string | null;
  dirasakan: string | null;
  shakemap: string | null;
};

function barisGempa(r: unknown): Gempa | null {
  if (!adalahObjek(r)) return null;
  const tanggal = teks(r.Tanggal);
  const jam = teks(r.Jam);
  const magnitude = teks(r.Magnitude);
  const wilayah = teks(r.Wilayah);
  if (!tanggal || !jam || !magnitude || !wilayah) return null;
  return {
    tanggal,
    jam,
    datetime: teks(r.DateTime) ?? `${tanggal} ${jam}`,
    lintang: teks(r.Lintang) ?? "—",
    bujur: teks(r.Bujur) ?? "—",
    magnitude,
    kedalaman: teks(r.Kedalaman) ?? "—",
    wilayah,
    potensi: teks(r.Potensi),
    dirasakan: teks(r.Dirasakan),
    shakemap: teks(r.Shakemap),
  };
}

export async function getGempaTerbaru(): Promise<Hasil<{
  terbaru: Gempa | null;
  daftar: Gempa[];
}>> {
  const [satu, banyak] = await Promise.all([
    ambilJson<unknown>(
      "https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json",
      300,
      "gempa-terbaru",
    ),
    ambilJson<unknown>(
      "https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json",
      300,
      "gempa-terkini",
    ),
  ]);
  // autogempa: { Infogempa: { gempa: {...} } }
  const terbaru =
    satu.ok && adalahObjek(satu.data)
      ? barisGempa(
          adalahObjek((satu.data as Record<string, unknown>).Infogempa)
            ? (
                (satu.data as Record<string, unknown>).Infogempa as Record<
                  string,
                  unknown
                >
              ).gempa
            : null,
        )
      : null;
  const daftar: Gempa[] = [];
  if (banyak.ok && adalahObjek(banyak.data)) {
    const info = (banyak.data as Record<string, unknown>).Infogempa;
    if (adalahObjek(info) && Array.isArray(info.gempa)) {
      for (const r of info.gempa as unknown[]) {
        const g = barisGempa(r);
        if (g) daftar.push(g);
      }
    }
  }
  if (!satu.ok && !banyak.ok) return { ok: false };
  return { ok: true, data: { terbaru, daftar } };
}

/* ============================================================
   2. Cuaca BMKG — api.bmkg.go.id (tanpa kunci, butuh adm4 desa)
   ============================================================ */

export type PrakiraanCuaca = {
  datetime: string;
  suhu: number | null;
  kelembapan: number | null;
  cuaca: string;
  deskripsi: string;
  arahAngin: string;
  kecepatanAngin: number | null;
};

export type CuacaBmkg = {
  desa: string;
  kecamatan: string;
  kotkab: string;
  provinsi: string;
  lat: number | null;
  lon: number | null;
  hari: { tanggal: string; jam: PrakiraanCuaca[] }[];
};

function angka(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function getCuacaBmkg(adm4: string): Promise<Hasil<CuacaBmkg>> {
  const hasil = await ambilJson<unknown>(
    `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${encodeURIComponent(adm4)}`,
    1800,
    "cuaca-bmkg",
  );
  if (!hasil.ok || !adalahObjek(hasil.data)) return { ok: false };
  const data = hasil.data as Record<string, unknown>;
  if (!Array.isArray(data.data) || data.data.length === 0) return { ok: false };
  const pertama = data.data[0] as Record<string, unknown>;
  const lokasi = adalahObjek(pertama.lokasi)
    ? (pertama.lokasi as Record<string, unknown>)
    : {};
  const hari: CuacaBmkg["hari"] = [];
  const daftarCuaca = Array.isArray(pertama.cuaca) ? pertama.cuaca : [];
  for (const kelompok of daftarCuaca as unknown[]) {
    if (!Array.isArray(kelompok) || kelompok.length === 0) continue;
    const jam: PrakiraanCuaca[] = [];
    let tanggal = "";
    for (const item of kelompok as unknown[]) {
      if (!adalahObjek(item)) continue;
      const dt = teks(item.datetime) ?? "";
      if (!tanggal && dt) tanggal = dt.slice(0, 10);
      jam.push({
        datetime: dt,
        suhu: angka(item.t),
        kelembapan: angka(item.hu),
        cuaca: teks(item.weather) ?? "—",
        deskripsi: teks(item.weather_desc) ?? "—",
        arahAngin: teks(item.wd) ?? "—",
        kecepatanAngin: angka(item.ws),
      });
    }
    if (jam.length > 0) hari.push({ tanggal, jam });
  }
  if (hari.length === 0) return { ok: false };
  return {
    ok: true,
    data: {
      desa: teks(lokasi.desa) ?? adm4,
      kecamatan: teks(lokasi.kecamatan) ?? "—",
      kotkab: teks(lokasi.kotkab) ?? "—",
      provinsi: teks(lokasi.provinsi) ?? "—",
      lat: angka(lokasi.lat),
      lon: angka(lokasi.lon),
      hari,
    },
  };
}

/* ============================================================
   3. Wilayah Indonesia — emsifa.com (JSON statis, tanpa kunci)
   ============================================================ */

export type WilayahItem = { id: string; nama: string };

export async function getWilayah(
  tingkat: "provinsi" | "kabupaten" | "kecamatan" | "desa",
  indukId?: string,
): Promise<Hasil<WilayahItem[]>> {
  let url: string;
  if (tingkat === "provinsi") {
    url =
      "https://www.emsifa.com/api-wilayah-indonesia/api/provinces.json";
  } else if (tingkat === "kabupaten") {
    if (!indukId) return { ok: false };
    url = `https://www.emsifa.com/api-wilayah-indonesia/api/regencies/${indukId}.json`;
  } else if (tingkat === "kecamatan") {
    if (!indukId) return { ok: false };
    url = `https://www.emsifa.com/api-wilayah-indonesia/api/districts/${indukId}.json`;
  } else {
    if (!indukId) return { ok: false };
    url = `https://www.emsifa.com/api-wilayah-indonesia/api/villages/${indukId}.json`;
  }
  const hasil = await ambilJson<unknown>(url, 86400, `wilayah-${tingkat}`);
  if (!hasil.ok || !Array.isArray(hasil.data)) return { ok: false };
  const daftar: WilayahItem[] = [];
  for (const r of hasil.data as unknown[]) {
    if (!adalahObjek(r)) continue;
    const id = teks(r.id);
    const nama = teks(r.name);
    if (id && nama) daftar.push({ id, nama });
  }
  return { ok: true, data: daftar };
}

/** Kode desa emsifa (10 digit, mis. 3171010001) → adm4 BMKG
 *  (31.71.01.0001). */
export function desaKeAdm4(idDesa: string): string | null {
  if (!/^\d{10}$/.test(idDesa)) return null;
  return `${idDesa.slice(0, 2)}.${idDesa.slice(2, 4)}.${idDesa.slice(4, 6)}.${idDesa.slice(6, 10)}`;
}

/* ============================================================
   4. Al-Qur'an — api.quran.gading.dev (tanpa kunci)
   ============================================================ */

export type SurahRingkas = {
  nomor: number;
  namaArab: string;
  transliterasi: string;
  terjemahan: string;
  jumlahAyat: number;
  wahyu: string;
};

export type Ayat = {
  nomor: number;
  arab: string;
  transliterasi: string;
  terjemahan: string;
};

export type SurahDetail = SurahRingkas & { ayat: Ayat[]; tafsir: string };

function barisSurah(r: unknown): SurahRingkas | null {
  if (!adalahObjek(r)) return null;
  const nomor = angka(r.number);
  if (nomor === null) return null;
  const nama = adalahObjek(r.name) ? (r.name as Record<string, unknown>) : {};
  const transliterasi = adalahObjek(nama.transliteration)
    ? teks((nama.transliteration as Record<string, unknown>).id)
    : null;
  const terjemahan = adalahObjek(nama.translation)
    ? teks((nama.translation as Record<string, unknown>).id)
    : null;
  const wahyu = adalahObjek(r.revelation)
    ? teks((r.revelation as Record<string, unknown>).id)
    : null;
  return {
    nomor,
    namaArab: teks(nama.short) ?? "",
    transliterasi: transliterasi ?? `Surah ${nomor}`,
    terjemahan: terjemahan ?? "",
    jumlahAyat: angka(r.numberOfVerses) ?? 0,
    wahyu: wahyu ?? "",
  };
}

export async function getDaftarSurah(): Promise<Hasil<SurahRingkas[]>> {
  const hasil = await ambilJson<unknown>(
    "https://api.quran.gading.dev/surah",
    86400,
    "quran-daftar",
  );
  if (!hasil.ok || !adalahObjek(hasil.data)) return { ok: false };
  const data = (hasil.data as Record<string, unknown>).data;
  if (!Array.isArray(data)) return { ok: false };
  const daftar: SurahRingkas[] = [];
  for (const r of data as unknown[]) {
    const s = barisSurah(r);
    if (s) daftar.push(s);
  }
  if (daftar.length === 0) return { ok: false };
  return { ok: true, data: daftar };
}

export async function getSurah(nomor: number): Promise<Hasil<SurahDetail>> {
  const hasil = await ambilJson<unknown>(
    `https://api.quran.gading.dev/surah/${nomor}`,
    86400,
    "quran-surah",
  );
  if (!hasil.ok || !adalahObjek(hasil.data)) return { ok: false };
  const bungkus = (hasil.data as Record<string, unknown>).data;
  if (!adalahObjek(bungkus)) return { ok: false };
  const ringkas = barisSurah(bungkus);
  if (!ringkas) return { ok: false };
  const tafsir = adalahObjek(bungkus.tafsir)
    ? teks((bungkus.tafsir as Record<string, unknown>).id) ?? ""
    : "";
  const ayat: Ayat[] = [];
  if (Array.isArray(bungkus.verses)) {
    for (const v of bungkus.verses as unknown[]) {
      if (!adalahObjek(v)) continue;
      const teksArab = adalahObjek(v.text)
        ? teks((v.text as Record<string, unknown>).arab)
        : null;
      const tr = adalahObjek(v.transliteration)
        ? teks((v.transliteration as Record<string, unknown>).en)
        : null;
      const tj = adalahObjek(v.translation)
        ? teks((v.translation as Record<string, unknown>).id)
        : null;
      const noAyat =
        adalahObjek(v.number) && typeof v.number === "object"
          ? angka((v.number as Record<string, unknown>).inSurah)
          : angka(v.number);
      if (teksArab && noAyat !== null) {
        ayat.push({
          nomor: noAyat,
          arab: teksArab,
          transliterasi: tr ?? "",
          terjemahan: tj ?? "",
        });
      }
    }
  }
  return { ok: true, data: { ...ringkas, ayat, tafsir } };
}

/* ============================================================
   5. Hadis Arbain Nawawi — api.myquran.com (tanpa kunci)
   RIWAYAT: penyedia hadis lama MATI (curl VM HTTP 000 sejak
   16 Nov 2026, tiga jalur; dikonfirmasi lagi 17 Nov 2026:
   curl exit 52 "Empty reply from server") — DIHAPUS dari kode,
   jangan dijadikan primary maupun fallback (endpoint mati =
   fallback palsu). Primary kini MyQuran (terverifikasi hidup
   dari VM 17 Nov 2026 11.56 WIB: HTTP 200, 42 hadis).
   Bila primary tidak terjangkau → korpus statis 3 hadis
   terverifikasi (lihat HADIS_KORPUS) dengan label jujur.
   ============================================================ */

export type HadisArbain = {
  nomor: number;
  judul: string;
  arab: string;
  terjemahan: string;
};

/** Dari mana isi hadis di halaman berasal. */
export type SumberHadis = "myquran" | "korpus";

export type HadisArbainHasil = {
  hadis: HadisArbain[];
  sumber: SumberHadis;
  /** Waktu ISO saat primary berhasil diambil; null untuk korpus statis. */
  diambilPada: string | null;
};

/** Label penyedia yang jujur — dipakai halaman /data/live/hadis. */
export const LABEL_SUMBER_HADIS: Record<SumberHadis, string> = {
  myquran: "MyQuran API (Hadis Arbain Nawawi)",
  korpus: "Korpus terverifikasi",
};

const HADIS_ARBAIN_URL =
  "https://api.myquran.com/v2/hadits/arbain/semua";

/**
 * Korpus statis — HANYA 3 hadis terverifikasi, disalin VERBATIM
 * (termasuk salah ketik sumbernya: "keapda", "adia", spasi ganda)
 * dari respons MyQuran yang terverifikasi dari VM pada 17 Nov 2026
 * 11.56 WIB (No. 1, 12, 15 — rujukan di akhir tiap terjemahan:
 * No. 1 al-Bukhari (1) & Muslim (1907); No. 12 At-Tirmidzi;
 * No. 15 HR. al-Bukhari dan Muslim). Ditampilkan HANYA bila primary
 * tidak terjangkau; JANGAN ditambah, diubah, atau dikarang isinya.
 */
const HADIS_KORPUS: HadisArbain[] = [
  {
    nomor: 1,
    judul: "Amalan Bergantung pada Niat",
    arab: "عَنْ أَمِيرِ المُؤمِنينَ أَبي حَفْصٍ عُمَرَ بْنِ الخَطَّابِ رَضيَ اللهُ عنْهُ قَالَ: سَمِعْتُ رَسُولَ اللهِ صَلَّى اللهُ عَلَيْهِ وَسَلَّمَ يَقُوْلُ: (( إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى، فَمَنْ كَانَتْ هِجْرَتُهُ إِلَِى اللهِ وَرَسُوْلِهِ فَهِجْرَتُهُ إِلَى اللهِ وَرَسُوْلِهِ، وَمَنْ كَانَتْ هِجْرَتُهُ لِدُنْيَا يُصِيْبُهَا، أَوْ امْرَأَةٍ يَنْكِحُهَا، فَهِجْرَتُهُ إِلَى مَا هَاجَرَ إِلَيْهِ )). رَوَاهُ إِمَامَا الْمُحَدِّثِيْنَ أَبُوْ عَبْدِ اللهِ مُحَمَّدُ بْنُ إِسْمَاعِيْلَ بْنِ إِبْرَاهِيْمَ بْنِ الْمُغِيْرَةِ بْنِ بَرْدِزْبَهْ الْبُخَارِيُّ، وَأَبُوْ الْحُسَيْنِ مُسْلِمُ بْنُ الْحَجَّاجِ بْنِ مُسْلِمٍ الْقُشَيْرِيّ النَّيْسَابُوْرِيّ، فِيْ صَحِيْحَيْهِمَا اللَّذَيْنِ هُمَا أَصَحُّ الْكُتُبِ اْلمُصَنَّفَةِ.",
    terjemahan:
      "Dari Amirul Mukminin Abu Hafsh Umar bin Al Khaththab adia berkata: ‘Aku mendengar Rasulullah shalallahu alaihi wasalam bersabda: “Amalan-amalan itu hanyalah tergantung pada niatnya. Dan setiap orang itu hanyalah akan dibalas berdasarkan apa yang ia niatkan. Maka barang siapa yang hijrahnya kepada Allah dan Rasul-Nya, maka hijrahnya keapda Allah dan Rasul-Nya. Namun barang siapa yang hijrahnya untuk mendapatkan dunia atau seorang wanita yang ingin ia nikahi, maka hijrahnya kepada apa yang ia niatkan tersebut.” (Diriwayatkan oleh dua Imamnya para ahli hadits, Abu Abdillah Muhammad bin Isma’il bin Ibrahim bin Al Mughirah bin Bardizbah Al Bukhari dan Abul Husain Muslim bin Al Hajjaj  bin Muslim Al Qusyairi An Naisaburi dalam dua kitab shahih mereka, yang keduanya merupakan kitab yang paling shahih diantara kitab-kitab yang ada.). Diriwayatkan oleh al Bukhari (1) dan Muslim (1907).",
  },
  {
    nomor: 12,
    judul: "Meninggalkan Perkara yang tidak Bermanfaat",
    arab: "عَنْ أَبِيْ هُرَيْرَةَ رَضِيَ اللهُ عَنْهُ قَالَ: قَالَ رَسُوْلُ اللهِ صلى الله عليه وسلّم : (مِنْ حُسْنِ إِسْلامِ المَرْءِ تَرْكُهُ مَا لاَيَعْنِيْهِ) حَدِيْثٌ حَسَنٌ، رَوَاهُ التِّرْمِذِي وَغَيْرُهُ هَكَذَا.",
    terjemahan:
      "Dari Abu Hurairah radhiyallahu ‘anhu, dia berkata: “Rasulullah shallallahu ‘alaihi wa sallam bersabda: ”Termasuk kebaikan Islam seseorang adalah dia meninggalkan perkara yang tidak bermanfaat baginya.” (Hadits Hasan, diriwayatkan oleh At Tirmidzi dan selainnya seperti ini)",
  },
  {
    nomor: 15,
    judul: "Barangsiapa Beriman kepada Allah dan Hari Akhir",
    arab: "عَن أَبِي هُرَيْرَةَ رضي الله عنه قَالَ: قَالَ رَسُولَ اللهِ صلى الله عليه وسلم: (مَنْ كَانَ يُؤمِنُ بِاللهِ وَاْليَوْمِ الآخِرِ فَلْيَقُلْ خَيْراً أَو لِيَصْمُتْ، وَمَنْ كَانَ يُؤمِنُ بِاللهِ وَاْليَومِ الآخِرِ فَلاَ يُؤْذِ جَارَهُ، ومَنْ كَانَ يُؤمِنُ بِاللهِ واليَومِ الآخِرِ فَلْيُكْرِمْ ضَيْفَهُ) رَوَاهُ اْلبُخَارِي وَمُسْلِمٌ.",
    terjemahan:
      "Dari Abu Hurairah radhiyallahu ‘anhu dia berkata, Rasulullah shallallahu ‘alaihi wa sallam bersabda: ”Barangsiapa yang beriman kepada Allah subhanahu wa ta’ala dan hari akhir maka hendaknya dia berbicara yang baik atau (kalau tidak bisa hendaknya) dia diam. Barangsiapa yang beriman kepada Allah dan hari akhir maka janganlah ia menyakiti tetangganya. Barangsiapa yang beriman kepada Allah dan hari akhir maka hendaknya dia memuliakan tamunya.” (HR. al Bukhari dan Muslim)",
  },
];

/** Satu baris respons MyQuran → HadisArbain; baris tak dikenal → null. */
function barisHadisArbain(r: unknown): HadisArbain | null {
  if (!adalahObjek(r)) return null;
  // Bentuk nyata MyQuran (terverifikasi 17 Nov 2026): tiap item
  // { no: "1" (STRING), judul, arab, indo } — no BUKAN number.
  const nomor = angka(r.no);
  const arab = teks(r.arab);
  const terjemahan = teks(r.indo);
  if (nomor === null || !arab || !terjemahan) return null;
  return {
    nomor,
    judul: teks(r.judul) ?? `Hadis Arbain ${nomor}`,
    arab,
    terjemahan,
  };
}

/**
 * Respons MyQuran apa adanya → daftar valid (diurutkan per nomor).
 * Diekspor untuk uji: bentuk tak dikenal → [] (jujur, bukan crash).
 */
export function uraiHadisArbain(badan: unknown): HadisArbain[] {
  if (!adalahObjek(badan)) return [];
  const data = badan.data;
  if (!Array.isArray(data)) return [];
  const daftar: HadisArbain[] = [];
  for (const r of data as unknown[]) {
    const h = barisHadisArbain(r);
    if (h) daftar.push(h);
  }
  daftar.sort((a, b) => a.nomor - b.nomor);
  return daftar;
}

/**
 * Hadis Arbain Nawawi — TIDAK PERNAH throw (pola Hasil<T>).
 * Primary: MyQuran (TTL 86400, mengikuti fetcher konten statis
 * lain seperti Al-Qur'an/sholat). Primary TIDAK TERJANGKAU
 * (fetch gagal / HTTP bukan 2xx) → korpus statis 3 hadis dengan
 * sumber "korpus". Primary MENJAWAB tapi bentuknya tak dikenal
 * (0 baris valid) → { ok: false } jujur, supaya perubahan kontrak
 * API tidak ditutupi fallback diam-diam — halaman menampilkan
 * EmptyState.
 */
export async function getHadisArbain(): Promise<Hasil<HadisArbainHasil>> {
  const hasil = await ambilJson<unknown>(
    HADIS_ARBAIN_URL,
    86400,
    "hadis-arbain",
  );
  if (!hasil.ok) {
    return {
      ok: true,
      data: { hadis: HADIS_KORPUS, sumber: "korpus", diambilPada: null },
    };
  }
  const daftar = uraiHadisArbain(hasil.data);
  if (daftar.length === 0) return { ok: false };
  return {
    ok: true,
    data: {
      hadis: daftar,
      sumber: "myquran",
      diambilPada: new Date().toISOString(),
    },
  };
}

/* ============================================================
   6–7. Sholat & Hijriah — api.myquran.com (tanpa kunci)
   ============================================================ */

export type KotaSholat = { id: string; lokasi: string };

export async function getDaftarKotaSholat(): Promise<Hasil<KotaSholat[]>> {
  const hasil = await ambilJson<unknown>(
    "https://api.myquran.com/v2/sholat/kota/semua",
    86400,
    "sholat-kota",
  );
  if (!hasil.ok || !adalahObjek(hasil.data)) return { ok: false };
  const data = (hasil.data as Record<string, unknown>).data;
  if (!Array.isArray(data)) return { ok: false };
  const daftar: KotaSholat[] = [];
  for (const r of data as unknown[]) {
    if (!adalahObjek(r)) continue;
    const id = teks(r.id);
    const lokasi = teks(r.lokasi);
    if (id && lokasi) daftar.push({ id, lokasi });
  }
  if (daftar.length === 0) return { ok: false };
  return { ok: true, data: daftar };
}

export type JadwalSholat = {
  lokasi: string;
  daerah: string;
  tanggal: string;
  imsak: string;
  subuh: string;
  terbit: string;
  dhuha: string;
  dzuhur: string;
  ashar: string;
  maghrib: string;
  isya: string;
};

export async function getJadwalSholat(
  kotaId: string,
  tahun: number,
  bulan: number,
  tanggal: number,
): Promise<Hasil<JadwalSholat>> {
  const hasil = await ambilJson<unknown>(
    `https://api.myquran.com/v2/sholat/jadwal/${encodeURIComponent(kotaId)}/${tahun}/${String(bulan).padStart(2, "0")}/${String(tanggal).padStart(2, "0")}`,
    86400,
    "sholat-jadwal",
  );
  if (!hasil.ok || !adalahObjek(hasil.data)) return { ok: false };
  const data = (hasil.data as Record<string, unknown>).data;
  if (!adalahObjek(data)) return { ok: false };
  const jadwal = adalahObjek(data.jadwal)
    ? (data.jadwal as Record<string, unknown>)
    : null;
  if (!jadwal) return { ok: false };
  const ambil = (k: string): string => teks(jadwal[k]) ?? "—";
  return {
    ok: true,
    data: {
      lokasi: teks(data.lokasi) ?? "—",
      daerah: teks(data.daerah) ?? "—",
      tanggal: ambil("tanggal"),
      imsak: ambil("imsak"),
      subuh: ambil("subuh"),
      terbit: ambil("terbit"),
      dhuha: ambil("dhuha"),
      dzuhur: ambil("dzuhur"),
      ashar: ambil("ashar"),
      maghrib: ambil("maghrib"),
      isya: ambil("isya"),
    },
  };
}

export async function getHijriah(
  tanggalISO: string,
): Promise<Hasil<string>> {
  const hasil = await ambilJson<unknown>(
    `https://api.myquran.com/v2/cal/hijr/${tanggalISO}`,
    86400,
    "hijriah",
  );
  if (!hasil.ok || !adalahObjek(hasil.data)) return { ok: false };
  const data = (hasil.data as Record<string, unknown>).data;
  if (!adalahObjek(data) || !Array.isArray(data.date)) return { ok: false };
  const bagian = (data.date as unknown[]).map((v) =>
    typeof v === "string" ? v : "",
  );
  const teksTanggal = bagian.filter(Boolean).join(", ");
  if (!teksTanggal) return { ok: false };
  return { ok: true, data: teksTanggal };
}

/* ============================================================
   8. Kurs — api.frankfurter.dev (tanpa kunci, kurs ECB)
   ============================================================ */

export async function getDaftarMataUang(): Promise<Hasil<Record<string, string>>> {
  const hasil = await ambilJson<unknown>(
    "https://api.frankfurter.dev/v1/currencies",
    86400,
    "kurs-mata-uang",
  );
  if (!hasil.ok || !adalahObjek(hasil.data)) return { ok: false };
  const daftar: Record<string, string> = {};
  for (const [kode, nama] of Object.entries(
    hasil.data as Record<string, unknown>,
  )) {
    if (typeof nama === "string") daftar[kode] = nama;
  }
  if (Object.keys(daftar).length === 0) return { ok: false };
  return { ok: true, data: daftar };
}

export async function getKurs(
  dari: string,
  ke: string,
  jumlah: number,
): Promise<Hasil<{ kurs: number; hasil: number; tanggal: string }>> {
  const hasil = await ambilJson<unknown>(
    `https://api.frankfurter.dev/v1/latest?amount=${jumlah}&from=${encodeURIComponent(dari)}&to=${encodeURIComponent(ke)}`,
    3600,
    "kurs",
  );
  if (!hasil.ok || !adalahObjek(hasil.data)) return { ok: false };
  const data = hasil.data as Record<string, unknown>;
  const rates = adalahObjek(data.rates)
    ? (data.rates as Record<string, unknown>)
    : null;
  const nilai = rates ? angka(rates[ke]) : null;
  const tanggal = teks(data.date);
  if (nilai === null || !tanggal) return { ok: false };
  return {
    ok: true,
    data: { kurs: nilai / jumlah, hasil: nilai, tanggal },
  };
}

export async function getKursTabel(
  mataUang: string[],
): Promise<Hasil<{ tanggal: string; kurs: Record<string, number> }>> {
  const hasil = await ambilJson<unknown>(
    `https://api.frankfurter.dev/v1/latest?from=IDR&to=${mataUang.join(",")}`,
    3600,
    "kurs-tabel",
  );
  if (!hasil.ok || !adalahObjek(hasil.data)) return { ok: false };
  const data = hasil.data as Record<string, unknown>;
  const rates = adalahObjek(data.rates)
    ? (data.rates as Record<string, unknown>)
    : null;
  const tanggal = teks(data.date);
  if (!rates || !tanggal) return { ok: false };
  const kurs: Record<string, number> = {};
  for (const kode of mataUang) {
    const v = angka(rates[kode]);
    if (v !== null) kurs[kode] = v;
  }
  if (Object.keys(kurs).length === 0) return { ok: false };
  return { ok: true, data: { tanggal, kurs } };
}

/* ============================================================
   9. Cuaca dunia — api.open-meteo.com (tanpa kunci)
   ============================================================ */

export type CuacaDunia = {
  suhu: number | null;
  kelembapan: number | null;
  kodeCuaca: number | null;
  angin: number | null;
  waktu: string;
  harian: { tanggal: string; maks: number | null; min: number | null; kode: number | null }[];
};

export function labelKodeCuaca(kode: number | null): string {
  if (kode === null) return "—";
  if (kode === 0) return "Cerah";
  if (kode === 1) return "Cerah berawan";
  if (kode === 2) return "Berawan sebagian";
  if (kode === 3) return "Mendung";
  if (kode === 45 || kode === 48) return "Berkabut";
  if (kode === 51 || kode === 53 || kode === 55) return "Gerimis";
  if (kode === 56 || kode === 57) return "Gerimis membeku";
  if (kode === 61 || kode === 63 || kode === 65) return "Hujan";
  if (kode === 66 || kode === 67) return "Hujan membeku";
  if (kode === 71 || kode === 73 || kode === 75) return "Salju";
  if (kode === 77) return "Butiran salju";
  if (kode === 80 || kode === 81 || kode === 82) return "Hujan deras";
  if (kode === 85 || kode === 86) return "Salju lebat";
  if (kode === 95) return "Badai petir";
  if (kode === 96 || kode === 99) return "Badai petir + hujan es";
  return "—";
}

export async function getCuacaDunia(
  lat: number,
  lon: number,
): Promise<Hasil<CuacaDunia>> {
  const hasil = await ambilJson<unknown>(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=7`,
    1800,
    "cuaca-dunia",
  );
  if (!hasil.ok || !adalahObjek(hasil.data)) return { ok: false };
  const data = hasil.data as Record<string, unknown>;
  const current = adalahObjek(data.current)
    ? (data.current as Record<string, unknown>)
    : null;
  const daily = adalahObjek(data.daily)
    ? (data.daily as Record<string, unknown>)
    : null;
  if (!current) return { ok: false };
  const harian: CuacaDunia["harian"] = [];
  if (daily && Array.isArray(daily.time)) {
    const waktu = daily.time as unknown[];
    const maks = Array.isArray(daily.temperature_2m_max)
      ? (daily.temperature_2m_max as unknown[])
      : [];
    const min = Array.isArray(daily.temperature_2m_min)
      ? (daily.temperature_2m_min as unknown[])
      : [];
    const kode = Array.isArray(daily.weather_code)
      ? (daily.weather_code as unknown[])
      : [];
    for (let i = 0; i < waktu.length; i++) {
      harian.push({
        tanggal: typeof waktu[i] === "string" ? (waktu[i] as string) : "",
        maks: angka(maks[i]),
        min: angka(min[i]),
        kode: angka(kode[i]),
      });
    }
  }
  return {
    ok: true,
    data: {
      suhu: angka(current.temperature_2m),
      kelembapan: angka(current.relative_humidity_2m),
      kodeCuaca: angka(current.weather_code),
      angin: angka(current.wind_speed_10m),
      waktu: teks(current.time) ?? "",
      harian,
    },
  };
}

/* ============================================================
   10. Geocoding — nominatim.openstreetmap.org (tanpa kunci)
   Kebijakan: maks 1 req/detik, wajib User-Agent + atribusi ODbL.
   ============================================================ */

export type HasilGeocoding = {
  nama: string;
  lat: string;
  lon: string;
  jenis: string;
};

export async function getGeocoding(
  q: string,
): Promise<Hasil<HasilGeocoding[]>> {
  const hasil = await ambilJson<unknown>(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=0`,
    3600,
    "geocoding",
  );
  if (!hasil.ok || !Array.isArray(hasil.data)) return { ok: false };
  const daftar: HasilGeocoding[] = [];
  for (const r of hasil.data as unknown[]) {
    if (!adalahObjek(r)) continue;
    const nama = teks(r.display_name);
    const lat = teks(r.lat);
    const lon = teks(r.lon);
    if (!nama || !lat || !lon) continue;
    daftar.push({
      nama,
      lat,
      lon,
      jenis: teks(r.type) ?? teks(r.class) ?? "—",
    });
  }
  return { ok: true, data: daftar };
}
