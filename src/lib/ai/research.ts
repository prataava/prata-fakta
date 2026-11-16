// Agen Research PRATA FAKTA — ekstraksi klaim DETERMINISTIK dari
// metadata + ringkasan item (dan teks halaman bila fetch berhasil).
// JANGAN mengarang isi; JANGAN menyalin isi penuh artikel sumber —
// yang disimpan hanya fakta terekstrak + kutipan pendek (<= 300 karakter).
// Fetch halaman bersifat best-effort: bila gagal, fallback ke
// ringkasan/isi_ringkas item dan kegagalan dicatat di hasil.
import { bersihkanHtml } from "../ingestion/rss.ts";
import { fetchAman, tolakHostPrivat } from "../ingestion/ssrf.ts";
import type { JenisKlaim } from "./types.ts";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 PRATA-FAKTA-Ingestion/1.0";

const BATAS_KLAIM = 5;
const BATAS_KUTIPAN = 300;
const BATAS_TEKS_HALAMAN = 4000;

export interface KlaimTerekstrak {
  teks: string;
  jenis: JenisKlaim;
}

export interface HasilResearch {
  klaim: KlaimTerekstrak[];
  // Teks halaman yang berhasil diambil ("" bila fetch gagal).
  teksHalaman: string;
  fetchBerhasil: boolean;
  // True bila klaim hanya berasal dari ringkasan/isi_ringkas item.
  fallback: boolean;
  sumberUrl: string;
}

export interface MasukanResearch {
  url: string;
  judul: string;
  ringkasan: string;
  isi_ringkas: string;
}

export interface OpsiResearch {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

// ---------- Pemecah kalimat ----------

function bagiKalimat(teks: string): string[] {
  const hasil: string[] = [];
  const pola = /[^.!?]+(?:[.!?]+["”']?|$)/g;
  let cocok: RegExpExecArray | null;
  while ((cocok = pola.exec(teks)) !== null) {
    const kalimat = cocok[0].replace(/\s+/g, " ").trim();
    if (kalimat) hasil.push(kalimat);
  }
  return hasil;
}

// ---------- Pola ekstraksi ----------

// Angka diikuti kata satuan (persen, rupiah, dolar, juta, miliar,
// triliun, km, kg, orang, unit, dst.) ATAU mata uang di depan angka
// (konvensi Indonesia: "Rp 16.500", "USD 100" — angka TANPA satuan
// di belakangnya tetap klaim angka karena mata uangnya distintif).
const SATUAN = [
  "persen",
  "%",
  "rupiah",
  "rp",
  "dolar",
  "usd",
  "juta",
  "miliar",
  "triliun",
  "ribu",
  "km",
  "kg",
  "gram",
  "ton",
  "liter",
  "orang",
  "unit",
  "ekor",
  "hektare",
  "hektar",
  "mw",
  "gw",
  "kwh",
];
const POLA_ANGKA = new RegExp(
  `\\d[\\d.,]*\\s*(?:${SATUAN.join("|")})\\b` +
    `|(?:rp|usd|us\\$)\\s*\\.?\\s*\\d[\\d.,]*`,
  "gi",
);

const BULAN_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
const POLA_TANGGAL = new RegExp(
  `\\b\\d{1,2}\\s+(?:${BULAN_ID.join("|")})\\s+\\d{4}\\b` +
    `|\\b\\d{1,2}[-/]\\d{1,2}[-/]\\d{4}\\b`,
  "gi",
);

const POLA_KUTIPAN_GANDA = /"([^"\n]{10,300})"/g;
const POLA_KUTIPAN_TIPOGRAFI = /“([^”\n]{10,300})”/g;

// ---------- Inti klaim (untuk verifikasi silang antar-klaim) ----------

// Normalisasi teks untuk pencocokan klaim: lowercase, buang tanda
// baca, gabung spasi ganda.
export function normalisasiTeks(teks: string): string {
  return teks
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Inti distintif sebuah klaim — dipakai verification.ts untuk
// membandingkan klaim yang SAMA antar sumber independen:
//   - 'angka': fragmen angka+satuan pertama (mis. "50 km",
//     "10 persen", "Rp 16.500"). Angka tanpa satuan BUKAN inti
//     (terlalu generik).
//   - 'kutipan': teks kutipan ternormalisasi (>= 10 karakter).
//   - 'fakta'/'tanggal'/'lain': null — klaim judul dicocokkan lewat
//     kelompok hash_judul (verification.ts), tanggal terlalu generik.
export function intiKlaim(klaim: KlaimTerekstrak): string | null {
  if (klaim.jenis === "angka") {
    POLA_ANGKA.lastIndex = 0;
    const cocok = POLA_ANGKA.exec(klaim.teks);
    POLA_ANGKA.lastIndex = 0;
    if (!cocok) return null;
    const inti = normalisasiTeks(cocok[0]);
    return inti.length >= 3 ? inti : null;
  }
  if (klaim.jenis === "kutipan") {
    const inti = normalisasiTeks(klaim.teks);
    return inti.length >= 10 ? inti : null;
  }
  return null;
}

// Pola LIKE untuk pencarian kandidat koroborasi di database.
// Inti ternormalisasi ("rp 16 500") tidak cocok mentah dengan teks
// tersimpan ("Rp 16.500 per dolar") karena format angka lokal memakai
// titik sebagai pemisah ribuan. Pola ini memecah inti menjadi token
// (maks 6) dan menggabungkan dengan '%' — pencocokan longgar untuk
// RECALL; presisi tetap dijamin verification.ts (cek containment
// persis pada teks klaim ternormalisasi). Karakter wildcard LIKE
// (%, _, \) di dalam token diloloskan.
export function polaPencarianInti(inti: string): string {
  const token = inti
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((t) =>
      t.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_"),
    );
  if (token.length === 0) return "%";
  return `%${token.join("%")}%`;
}

function potong(teks: string, batas: number): string {
  return teks.length > batas ? teks.slice(0, batas).trim() : teks;
}

// Ekstrak klaim dari judul + ringkasan + isi_ringkas (+ teks halaman).
// Urutan deterministik: klaim judul dulu, lalu kalimat-kalimat sumber
// dalam urutan aslinya. Maksimal BATAS_KLAIM klaim per item.
export function ekstrakKlaim(
  judul: string,
  ringkasan: string,
  isiRingkas: string,
  teksHalaman = "",
): KlaimTerekstrak[] {
  const klaim: KlaimTerekstrak[] = [];
  const sudahAda = new Set<string>();

  function tambah(teks: string, jenis: JenisKlaim): void {
    if (klaim.length >= BATAS_KLAIM) return;
    const bersih = potong(teks.replace(/\s+/g, " ").trim(), BATAS_KUTIPAN);
    if (bersih.length < 10) return;
    const kunci = bersih.toLowerCase();
    if (sudahAda.has(kunci)) return;
    sudahAda.add(kunci);
    klaim.push({ teks: bersih, jenis });
  }

  // (a) Klaim judul — jenis 'fakta'.
  const judulBersih = judul.trim();
  if (judulBersih.length >= 10) tambah(judulBersih, "fakta");

  // (b)-(d) Per kalimat dari ringkasan, isi ringkas, lalu teks halaman.
  const sumberTeks = [ringkasan, isiRingkas, teksHalaman]
    .map((t) => (t ?? "").trim())
    .filter(Boolean)
    .join(" ");
  for (const kalimat of bagiKalimat(sumberTeks)) {
    if (klaim.length >= BATAS_KLAIM) break;
    // (b) Angka + satuan -> jenis 'angka' (kalimat utuh sebagai klaim).
    if (POLA_ANGKA.test(kalimat)) {
      POLA_ANGKA.lastIndex = 0;
      tambah(kalimat, "angka");
      continue;
    }
    POLA_ANGKA.lastIndex = 0;
    // (d) Tanggal eksplisit -> jenis 'tanggal'.
    if (POLA_TANGGAL.test(kalimat)) {
      POLA_TANGGAL.lastIndex = 0;
      tambah(kalimat, "tanggal");
      continue;
    }
    POLA_TANGGAL.lastIndex = 0;
    // (c) Teks dalam tanda kutip -> jenis 'kutipan' (isi kutipannya).
    for (const pola of [POLA_KUTIPAN_GANDA, POLA_KUTIPAN_TIPOGRAFI]) {
      pola.lastIndex = 0;
      let cocok: RegExpExecArray | null;
      while ((cocok = pola.exec(kalimat)) !== null) {
        tambah(cocok[1], "kutipan");
        if (klaim.length >= BATAS_KLAIM) break;
      }
      if (klaim.length >= BATAS_KLAIM) break;
    }
  }

  return klaim;
}

// ---------- Fetch halaman sumber (best-effort) ----------

async function ambilTeksHalaman(
  url: string,
  opsi: OpsiResearch,
): Promise<string> {
  const ambil = opsi.fetchFn ?? fetch;
  const timeoutMs = opsi.timeoutMs ?? 8000;
  // Gate Fase 8 (T6): jalur fetch ini sebelumnya TANPA pelindung SSRF
  // sama sekali — URL artikel dari feed/GDELT langsung di-fetch.
  // Sekarang: tolak host privat dulu, lalu fetchAman (redirect ke
  // host privat ditolak di tiap hop). Gagal → throw → telitiItem
  // fallback ke ringkasan (best-effort, bukan 500).
  const ditolak = await tolakHostPrivat(url);
  if (ditolak) throw new Error(`URL ditolak: ${ditolak}`);
  const respons = await fetchAman(
    url,
    {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html, */*",
      },
      signal: AbortSignal.timeout(timeoutMs),
    },
    ambil,
  );
  if (!respons.ok) {
    throw new Error(`HTTP ${respons.status}`);
  }
  const html = await respons.text();
  // Buang skrip, gaya, dan blok navigasi sebelum membersihkan tag —
  // agar teks halaman tidak didominasi menu/navigasi situs.
  const tanpaBlok = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  return bersihkanHtml(tanpaBlok).slice(0, BATAS_TEKS_HALAMAN);
}

// ---------- Titik masuk ----------

export async function telitiItem(
  item: MasukanResearch,
  opsi: OpsiResearch = {},
): Promise<HasilResearch> {
  let teksHalaman = "";
  let fetchBerhasil = false;
  if (item.url) {
    try {
      teksHalaman = await ambilTeksHalaman(item.url, opsi);
      fetchBerhasil = teksHalaman.length > 0;
    } catch {
      // Best-effort: fetch gagal -> fallback ke ringkasan item.
      teksHalaman = "";
      fetchBerhasil = false;
    }
  }
  const klaim = ekstrakKlaim(
    item.judul,
    item.ringkasan,
    item.isi_ringkas,
    teksHalaman,
  );
  return {
    klaim,
    teksHalaman,
    fetchBerhasil,
    fallback: !fetchBerhasil,
    sumberUrl: item.url,
  };
}
