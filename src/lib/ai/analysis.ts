// Agen Analysis PRATA FAKTA (Fase 9) — sintesis 5W+1H eksplisit
// (siapa / apa / kapan / di mana / mengapa / bagaimana) yang
// dirangkai HANYA dari klaim terverifikasi (+ metadata yang
// dinyatakan eksplisit: judul item, waktu terbit asli, nama
// sumber). Tanpa klaim pendukung, bagian ditulis KOSONG secara
// jujur — bukan karangan. BUKAN pengganti trends.ts /
// data-analysis.ts: modul-modul itu menghitung tren/angka dari
// antrean; modul ini menyintesis SATU peristiwa menjadi narasi
// 5W+1H untuk draf/editor.
//
// ============================================================
// INSTRUKSI WIRING KE pipeline.ts (UNTUK INTEGRATOR — modul ini
// TIDAK menyentuh pipeline.ts; Worker D memiliki bagian lock-nya):
//   1. Tempat: di verifikasiSatuItem(), SESUDAH langkah verification
//      (keputusan VERIFIED/CROSS-CHECKED) dan SEBELUM/SESUDAH
//      susunDrafArtikel — sintesis adalah bahan editor/Muse saat
//      menyempurnakan draf, BUKAN pengganti draf. Hasilnya dicatat
//      sebagai satu baris pf_ai_runs dan/atau disimpan ke
//      metadata artikel (kolom baru bila perlu — migrasi aditif,
//      butuh persetujuan pemilik; JANGAN simpan ke kolom yang
//      sudah ada dengan makna lain).
//   2. Pencatatan run: agen 'article_writing' + detail.langkah =
//      'analysis' (pola yang sama seperti 'comparison': CHECK v8
//      pf_ai_runs_agen_check_v8 hanya mengizinkan 10 nilai agen —
//      'analysis' TIDAK termasuk. JANGAN mencatat agen harfiah
//      'analysis' sebelum pemilik menyetujui pelonggaran CHECK v8
//      (Keputusan #3 RENCANA; non-aditif DROP + CREATE
//      constraint). Bila CHECK sudah dilonggarkan, agen boleh
//      dicatat harfiah 'analysis' dan tipe AgenAi di types.ts
//      ditambah nilainya.
//   3. Masukan: klaimTersimpan (hanya klaim yang lolos verifikasi
//      — pipeline TIDAK PERNAH memanggil modul ini dengan klaim
//      UNCONFIRMED), judul + waktu_terbit_asli + nama sumber dari
//      item. Keluaran TIDAK PERNAH menambah fakta baru: tiap slot
//      yang terisi mencantumkan klaim pendukungnya.
// ============================================================
// Pure: tanpa I/O, tanpa DB, tanpa fetch — mudah diuji
// (scripts/uji-ai-pipeline-tahap.mjs).
import type { KlaimTerekstrak } from "./research.ts";

export type AsalSlot = "klaim" | "metadata" | null;

export interface SlotAnalisis {
  /** Isi slot, atau null bila tidak ada klaim terverifikasi yang
   *  mendukung bagian ini (jujur kosong — bukan karangan). */
  teks: string | null;
  /** Teks klaim terverifikasi yang mendukung slot ini. */
  klaimPendukung: string[];
  /** Dari mana slot ini berasal. "metadata" hanya untuk kapan
   *  (waktu terbit asli item) dan dicatat eksplisit — bukan klaim. */
  asal: AsalSlot;
  /** Alasan jujur bila slot kosong. */
  kosongKarena: string | null;
}

export interface HasilAnalisis {
  siapa: SlotAnalisis;
  apa: SlotAnalisis;
  kapan: SlotAnalisis;
  diMana: SlotAnalisis;
  mengapa: SlotAnalisis;
  bagaimana: SlotAnalisis;
  /** Paragraf sintesis dari slot yang terisi saja, dalam urutan
   *  5W+1H. Bila semua slot kosong, paragraf menyatakan jujur
   *  bahwa tidak ada klaim terverifikasi yang cukup. */
  ringkasan: string;
}

export interface MasukanAnalisis {
  klaim: KlaimTerekstrak[];
  /** Judul item mentah (metadata — dipakai hanya sebagai konteks
   *  "apa" bila tidak ada klaim 'fakta'; dicatat asal metadata). */
  judul?: string;
  /** Waktu terbit asli item (ISO 8601 atau null). Dipakai hanya
   *  untuk slot kapan bila tidak ada klaim 'tanggal'. */
  waktuTerbitAsli?: string | null;
  /** Nama sumber item (metadata — disebut di ringkasan sebagai
   *  atribusi, bukan sebagai fakta peristiwa). */
  sumberNama?: string;
}

function slotKosong(alasan: string): SlotAnalisis {
  return { teks: null, klaimPendukung: [], asal: null, kosongKarena: alasan };
}

function slotTerisi(
  teks: string,
  klaimPendukung: string[],
  asal: AsalSlot,
): SlotAnalisis {
  return { teks, klaimPendukung, asal, kosongKarena: null };
}

// Pola penutur kutipan (deterministik, sempit): "kata X", "ujar X",
// "menurut X", "sebut X" — X huruf kapital di awal. Bila tidak ada
// pola yang cocok, slot siapa TETAP KOSONG (jangan tebak pelaku
// dari judul — judul berita sering tidak menyebut pelaku).
const POLA_PENUTUR =
  /\b(?:kata|ujar|ungkap|sebut|menurut)\s+([A-ZÀ-Þ][\wÀ-ÿ.'-]*(?:\s+[A-ZÀ-Þ][\wÀ-ÿ.'-]*){0,2})/u;

// Penanda sebab-akibat di klaim (untuk slot mengapa).
const PENANDA_SEBAB =
  /\b(karena|disebabkan|dipicu|didorong|akibat|dampak|untuk|agar|supaya|sehingga)\b/i;

// Tempat: "di <Kata Kapital ...>" — maksimal 3 kata kapital.
// Stoplist kecil untuk kata kapital yang bukan tempat.
const BUKAN_TEMPAT = new Set([
  "Dalam",
  "Tahun",
  "Hari",
  "Pukul",
  "Sana",
  "Sini",
]);

function cariTempat(teks: string): string | null {
  const m = /\bdi\s+([A-ZÀ-Þ][a-zà-ÿ]+(?:\s+[A-ZÀ-Þ][a-zà-ÿ]+){0,2})/u.exec(
    teks,
  );
  if (!m) return null;
  const tempat = m[1].trim();
  if (BUKAN_TEMPAT.has(tempat.split(" ")[0])) return null;
  return tempat;
}

export function sintesis5W1H(input: MasukanAnalisis): HasilAnalisis {
  const klaim = input.klaim ?? [];
  const fakta = klaim.filter((k) => k.jenis === "fakta");
  const angka = klaim.filter((k) => k.jenis === "angka");
  const kutipan = klaim.filter((k) => k.jenis === "kutipan");
  const tanggal = klaim.filter((k) => k.jenis === "tanggal");

  // APA — peristiwa itu sendiri: klaim 'fakta'. Tanpa klaim fakta,
  // judul dipakai HANYA sebagai konteks berlabel metadata.
  const apa: SlotAnalisis =
    fakta.length > 0
      ? slotTerisi(
          fakta.map((k) => k.teks).join(" "),
          fakta.map((k) => k.teks),
          "klaim",
        )
      : input.judul
        ? slotTerisi(input.judul, [], "metadata")
        : slotKosong("Tidak ada klaim 'fakta' terverifikasi tentang peristiwa ini.");

  // KAPAN — klaim 'tanggal' dulu; bila tidak ada, waktu terbit
  // asli item (metadata, dicatat eksplisit — tanggal terbit BUKAN
  // tanggal peristiwa).
  const kapan: SlotAnalisis =
    tanggal.length > 0
      ? slotTerisi(
          tanggal.map((k) => k.teks).join("; "),
          tanggal.map((k) => k.teks),
          "klaim",
        )
      : input.waktuTerbitAsli
        ? slotTerisi(
            `Tanggal terbit menurut sumber: ${input.waktuTerbitAsli} (tanggal peristiwa tidak disebutkan klaim terverifikasi).`,
            [],
            "metadata",
          )
        : slotKosong(
            "Tidak ada klaim 'tanggal' terverifikasi dan waktu terbit asli tidak diketahui.",
          );

  // SIAPA — penutur kutipan yang terverifikasi, atau pelaku yang
  // disebut eksplisit "menurut X" di klaim. Tanpa pola itu, kosong.
  let siapa: SlotAnalisis = slotKosong(
    "Tidak ada klaim terverifikasi yang menyebut pelaku/penutur secara eksplisit.",
  );
  for (const k of [...kutipan, ...klaim]) {
    const m = POLA_PENUTUR.exec(k.teks);
    if (m) {
      // Buang titik akhir kalimat yang ikut tertangkap pola
      // (mis. "Menteri Keuangan." di akhir kalimat).
      siapa = slotTerisi(m[1].trim().replace(/\.$/, ""), [k.teks], "klaim");
      break;
    }
  }

  // DI MANA — tempat kapital sesudah "di" di klaim terverifikasi.
  let diMana: SlotAnalisis = slotKosong(
    "Tidak ada klaim terverifikasi yang menyebut lokasi peristiwa.",
  );
  for (const k of klaim) {
    const tempat = cariTempat(k.teks);
    if (tempat) {
      diMana = slotTerisi(tempat, [k.teks], "klaim");
      break;
    }
  }

  // MENGAPA — klaim yang mengandung penanda sebab-akibat.
  const sebab = klaim.filter((k) => PENANDA_SEBAB.test(k.teks));
  const mengapa: SlotAnalisis =
    sebab.length > 0
      ? slotTerisi(
          sebab.map((k) => k.teks).join(" "),
          sebab.map((k) => k.teks),
          "klaim",
        )
      : slotKosong(
          "Tidak ada klaim terverifikasi yang menjelaskan penyebab/tujuan peristiwa.",
        );

  // BAGAIMANA — besaran/cara peristiwa: klaim 'angka' (skala,
  // jumlah, persentase) + klaim lain yang menjelaskan proses.
  // Klaim 'angka' dipakai sebagai "bagaimana" karena angka
  // terverifikasi menjelaskan skala peristiwa, bukan latar.
  const bagaimana: SlotAnalisis =
    angka.length > 0
      ? slotTerisi(
          angka.map((k) => k.teks).join("; "),
          angka.map((k) => k.teks),
          "klaim",
        )
      : slotKosong(
          "Tidak ada klaim 'angka' terverifikasi yang menjelaskan skala/cara peristiwa.",
        );

  const hasil: HasilAnalisis = {
    siapa,
    apa,
    kapan,
    diMana,
    mengapa,
    bagaimana,
    ringkasan: "",
  };

  // Ringkasan: hanya dari slot yang terisi, berlabel asal.
  const bagian: string[] = [];
  if (apa.teks) bagian.push(`Apa: ${apa.teks}`);
  if (siapa.teks) bagian.push(`Siapa: ${siapa.teks}`);
  if (kapan.teks) bagian.push(`Kapan: ${kapan.teks}`);
  if (diMana.teks) bagian.push(`Di mana: ${diMana.teks}`);
  if (mengapa.teks) bagian.push(`Mengapa: ${mengapa.teks}`);
  if (bagaimana.teks) bagian.push(`Bagaimana: ${bagaimana.teks}`);
  hasil.ringkasan =
    bagian.length > 0
      ? bagian.join(" ")
      : "Tidak ada klaim terverifikasi yang cukup untuk menyusun sintesis 5W+1H — bagian ini dibiarkan kosong, bukan dikarang.";
  return hasil;
}

/** True bila SEMUA slot kosong (tidak ada bahan sintesis). */
export function apakahAnalisisKosong(hasil: HasilAnalisis): boolean {
  return (
    !hasil.siapa.teks &&
    !hasil.apa.teks &&
    !hasil.kapan.teks &&
    !hasil.diMana.teks &&
    !hasil.mengapa.teks &&
    !hasil.bagaimana.teks
  );
}
