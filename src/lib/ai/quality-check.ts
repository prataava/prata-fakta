// Agen Quality Check PRATA FAKTA (Fase 9) — pemeriksaan
// DETERMINISTIK atas draf artikel SEBELUM disimpan, atas dasar
// aturan §F brief: tidak mengarang kutipan/angka/sumber/tanggal,
// tidak memotong konteks penting. BUKAN penilaian gaya oleh LLM
// dan BUKAN pengganti quality.ts (editorial_quality): quality.ts
// memeriksa struktur draf (panjang, kategori, URL, placeholder),
// modul ini memeriksa KETERTELUSURAN draf ke klaim terverifikasi +
// evidence — tiap angka/kutipan/tanggal di draf harus tertelusur
// ke klaim terverifikasi, tiap klaim terverifikasi harus punya
// bukti pendukung dan tercantum di draf.
//
// ============================================================
// INSTRUKSI WIRING KE pipeline.ts (UNTUK INTEGRATOR — modul ini
// TIDAK menyentuh pipeline.ts; Worker D memiliki bagian lock-nya):
//   1. Tempat: di verifikasiSatuItem(), SESUDAH susunDrafArtikel
//      menghasilkan draf (in-memory) dan SEBELUM
//      adapter.simpanArtikel(draf). Draf yang GAGAL pemeriksaan
//      ini TIDAK disimpan (fail-closed): status item TIDAK diubah
//      (tetap UNCONFIRMED di antrean, dicoba lagi run berikut),
//      dan alasan kegagalan dicatat di pf_ai_runs — sesuai
//      kriteria selesai RENCANA-GLOBAL-NEWS §Fase 9 ("draf gagal
//      quality check tidak jadi draf; status item tetap, alasan
//      tercatat").
//   2. Pencatatan run: agen 'editorial_quality' + detail.langkah
//      = 'quality_check' (pola yang sama seperti 'comparison':
//      CHECK v8 pf_ai_runs_agen_check_v8 hanya mengizinkan 10
//      nilai agen — 'quality_check' TIDAK termasuk. JANGAN
//      mencatat agen harfiah 'quality_check' sebelum pemilik
//      menyetujui pelonggaran CHECK v8 (Keputusan #3 RENCANA;
//      non-aditif DROP + CREATE constraint). Bila CHECK sudah
//      dilonggarkan, agen boleh dicatat harfiah 'quality_check'
//      dan tipe AgenAi di types.ts ditambah nilainya.
//   3. Masukan: bangun MasukanQualityCheck dari draf in-memory
//      (judul/ringkasan/isi/fakta_penting), klaimTersimpan,
//      evidence yang sudah ditulis (jumlahEvidence +
//      kutipanTidakDitemukan sudah ada di verifikasiSatuItem),
//      dan tanggal yang diketahui (waktu_terbit_asli item +
//      tanggal dari klaim jenis 'tanggal').
//   4. quality.ts (periksaKualitasDraf) TETAP dijalankan seperti
//      sekarang; modul ini MENAMBAH pemeriksaan ketertelusuran.
//      Keduanya harus lolos agar draf ditandai siap-review.
// ============================================================
// Pure: tanpa I/O, tanpa DB, tanpa fetch — mudah diuji
// (scripts/uji-ai-pipeline-tahap.mjs).
import type { KlaimTerekstrak } from "./research.ts";

/** Batas panjang kutipan (karakter) — sama dengan BATAS_KUTIPAN
 *  di research.ts dan BATAS_KUTIPAN_DRAF di writing.ts. Satu angka
 *  di tiga tempat: bila kebijakan berubah, ubah ketiganya. */
export const BATAS_KUTIPAN_KARAKTER = 300;

export interface BuktiKlaim {
  /** Teks klaim yang didukung evidence ini (verbatim). */
  klaim_teks: string;
  sumber_url: string;
  /** Kalimat sumber yang benar-benar memuat inti klaim, atau
   *  null/undefined bila tidak ditemukan (lihat P2-1). */
  kutipan?: string | null;
}

export interface SumberDinyatakan {
  nama: string;
  url: string;
}

export interface MasukanQualityCheck {
  judul: string;
  ringkasan: string;
  /** Isi draf lengkap (termasuk seksi "Fakta utama", "Sumber",
   *  dan "Yang belum diketahui"). */
  isi: string;
  /** Daftar fakta draf (= fakta_penting SimpanArtikelInput). */
  fakta?: string[];
  /** Sumber yang dinyatakan draf (daftar "Sumber:" + sumber_url). */
  sumber: SumberDinyatakan[];
  /** Klaim terverifikasi yang mendasari draf. */
  klaim: KlaimTerekstrak[];
  /** Evidence yang tercatat untuk klaim-klaim di atas. */
  evidence: BuktiKlaim[];
  /** Tanggal yang DIKETAHUI dari sumber (ISO 8601, mis.
   *  waktu_terbit_asli item). Tanggal di draf yang tidak ada di
   *  daftar ini DAN tidak ada di klaim jenis 'tanggal' yang
   *  punya evidence dianggap karangan/ubahan — DITOLAK. Kosongkan
   *  hanya bila tanggal terbit memang tidak diketahui; draf
   *  bertanggal apa pun lalu otomatis ditolak (jujur, bukan
   *  ditebak). */
  tanggalDiketahui?: string[];
}

export interface PelanggaranQualityCheck {
  /** Kode stabil untuk agregasi di pf_ai_runs (detail). */
  kode:
    | "kutipan_tanpa_bukti"
    | "kutipan_melebihi_batas"
    | "angka_tanpa_sumber"
    | "tanggal_tidak_diketahui"
    | "klaim_tanpa_bukti"
    | "klaim_tidak_tercantum"
    | "konteks_dipotong"
    | "sumber_tidak_dinyatakan";
  pesan: string;
  /** Bukti pelanggaran (teks yang melanggar, dipotong 120 karakter). */
  rincian?: string;
}

export interface HasilQualityCheck {
  lolos: boolean;
  pelanggaran: PelanggaranQualityCheck[];
}

// ---------- Normalisasi ----------

function normalisasi(teks: string): string {
  return teks
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function potong(teks: string, maks = 120): string {
  return teks.length > maks ? `${teks.slice(0, maks).trim()}…` : teks;
}

// ---------- Ekstraksi dari teks draf ----------

// Angka yang diperiksa = angka yang berdiri sebagai FAKTA (di
// seksi "Fakta utama" + daftar fakta). Angka di seksi "Sumber:"
// (URL/nomor versi) dan "Yang belum diketahui" (teks baku tanpa
// angka) tidak diperiksa — ringkasan/judul juga TIDAK diperiksa
// di sini (keduanya disalin dari teks sumber, bukan disintesis;
// ketertelusurannya dijamin research + summarization).
// Pembuka draf ("... dihimpun redaksi dari <nama sumber>.")
// JUGA bukan fakta: angka di dalamnya berasal dari NAMA sumber
// ("NT3 Tier Satu A" mengandung "3") — implementasi lama
// memasukkan pembuka sehingga draf dari sumber bernama
// berangka selalu ditolak palsu (temuan integrator 17 Nov 2026,
// baterai tahapE F5 run 2). Klaim pertama tetap diperiksa lewat
// "Fakta utama" (susunDrafArtikel mencantumkan SEMUA klaim di
// sana), jadi penyempitan ini tidak meloloskan apa pun. Bila
// draf tanpa seksi "Fakta utama" (bukan susunan writing.ts),
// pakai seluruh teks sebelum "Sumber:" seperti sebelumnya.
function teksFaktaUtama(isi: string, fakta: string[]): string {
  const sebelumBelumDiketahui = isi.split("Yang belum diketahui:")[0];
  const tanpaSumber = sebelumBelumDiketahui.split("Sumber:")[0];
  const awalFakta = tanpaSumber.indexOf("Fakta utama:");
  const bagianFakta =
    awalFakta >= 0 ? tanpaSumber.slice(awalFakta) : tanpaSumber;
  return [bagianFakta, ...(fakta ?? [])].join("\n");
}

// Token angka: "25", "2,5", "1.250", "10%" — dinormalisasi dengan
// membuang pemisah ribuan/desimal agar "2,5" cocok dengan "2.5".
function angkaDalamTeks(teks: string): string[] {
  const cocok = teks.match(/\d[\d.,]*\d|\d/g) ?? [];
  const unik = new Set<string>();
  for (const a of cocok) {
    const normal = a.replace(/[.,](?=\d)/g, "");
    if (normal) unik.add(normal);
  }
  return [...unik];
}

// Segmen berpetik ganda ("...") — kutipan langsung di draf.
function segmenBerpetik(teks: string): string[] {
  const hasil: string[] = [];
  const pola = /"([^"]+)"|“([^”]+)”/g;
  let m: RegExpExecArray | null;
  while ((m = pola.exec(teks)) !== null) {
    hasil.push(m[1] ?? m[2]);
  }
  return hasil;
}

const BULAN_ID: Record<string, string> = {
  januari: "01",
  februari: "02",
  maret: "03",
  april: "04",
  mei: "05",
  juni: "06",
  juli: "07",
  agustus: "08",
  september: "09",
  oktober: "10",
  november: "11",
  desember: "12",
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  agu: "08",
  sep: "09",
  okt: "10",
  nov: "11",
  des: "12",
};

// Tanggal di teks -> ISO YYYY-MM-DD (null bila tidak bisa diparse).
// Format yang dikenali: "17 November 2026", "17 Nov 2026",
// "2026-11-17", "17/11/2026".
export function normalisasiTanggal(teks: string): string | null {
  const t = teks.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(t);
  if (m) {
    const bulan = BULAN_ID[m[2].toLowerCase()];
    if (!bulan) return null;
    return `${m[3]}-${bulan}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

function tanggalDalamTeks(teks: string): string[] {
  const hasil = new Set<string>();
  const pola =
    /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/g;
  let m: RegExpExecArray | null;
  while ((m = pola.exec(teks)) !== null) {
    const iso = normalisasiTanggal(m[0]);
    if (iso) hasil.add(iso);
  }
  return [...hasil];
}

function urlDalamTeks(teks: string): string[] {
  return [...new Set(teks.match(/https?:\/\/[^\s)"]+/g) ?? [])];
}

// ---------- Pemeriksaan ----------

export function periksaKualitasKlaimDraf(
  input: MasukanQualityCheck,
): HasilQualityCheck {
  const pelanggaran: PelanggaranQualityCheck[] = [];
  const klaim = input.klaim ?? [];
  const evidence = input.evidence ?? [];
  const teksFakta = teksFaktaUtama(input.isi, input.fakta ?? []);
  const teksFaktaNormal = normalisasi(teksFakta);
  const isiNormal = normalisasi(input.isi);

  // K1 — kutipan melebihi batas 300 karakter (di draf maupun di
  // evidence yang dikutip draf). Batas ditegakkan writing.ts saat
  // draf dibuat; pemeriksaan ini adalah jaring pengaman kedua
  // untuk draf yang disusun/diubah di luar writing.ts.
  for (const segmen of segmenBerpetik(teksFakta)) {
    if (segmen.length > BATAS_KUTIPAN_KARAKTER) {
      pelanggaran.push({
        kode: "kutipan_melebihi_batas",
        pesan:
          `Kutipan di draf melebihi ${BATAS_KUTIPAN_KARAKTER} karakter ` +
          `(${segmen.length} karakter) — potong atau parafrasakan dengan atribusi.`,
        rincian: potong(segmen),
      });
    }
  }
  for (const k of klaim) {
    if (k.jenis === "kutipan" && k.teks.length > BATAS_KUTIPAN_KARAKTER) {
      pelanggaran.push({
        kode: "kutipan_melebihi_batas",
        pesan:
          `Klaim kutipan melebihi ${BATAS_KUTIPAN_KARAKTER} karakter ` +
          `(${k.teks.length} karakter) — writing.ts wajib memotongnya sebelum draf disimpan.`,
        rincian: potong(k.teks),
      });
    }
  }
  for (const e of evidence) {
    if (e.kutipan && e.kutipan.length > BATAS_KUTIPAN_KARAKTER) {
      pelanggaran.push({
        kode: "kutipan_melebihi_batas",
        pesan:
          `Kutipan evidence melebihi ${BATAS_KUTIPAN_KARAKTER} karakter ` +
          `(${e.kutipan.length} karakter) — research.ts wajib memotongnya (cariKalimatKutipan).`,
        rincian: potong(e.kutipan),
      });
    }
  }

  // K2 — angka tanpa sumber: tiap angka di fakta draf harus muncul
  // (ternormalisasi) di setidaknya satu klaim terverifikasi.
  // Perbandingan memakai SET token angka dari klaim mentah (bukan
  // substring pada teks ternormalisasi): normalisasi() mengubah
  // "16.500" menjadi "16 500", sementara angkaDalamTeks membuang
  // pemisah menjadi "16500" — substring "16500" tidak pernah cocok
  // dengan "16 500", sehingga draf berisi "Rp 16.500" / "2,5" /
  // "1.250" SELALU ditolak palsu. Temuan integrator 17 Nov 2026
  // (wiring fail-closed mengeksposnya di baterai tahapE F5 +
  // ultimate-gate run 1). Kedua sisi kini diekstrak fungsi yang
  // sama (angkaDalamTeks) dari teks mentah — "16.500" di draf
  // cocok dengan "16.500" di klaim.
  const angkaKlaim = new Set(
    angkaDalamTeks(klaim.map((k) => k.teks).join("\n")),
  );
  for (const angka of angkaDalamTeks(teksFakta)) {
    const angkaNormal = normalisasi(angka);
    if (!angkaNormal) continue;
    // Angka yang juga bagian dari tanggal (mis. "2026" dari
    // "17 November 2026") diperiksa oleh K4, bukan di sini.
    const polaTanggal = new RegExp(
      `\\b\\d{1,2}\\s+[a-z]+\\s+${angkaNormal}\\b|\\b${angkaNormal}-\\d{2}-\\d{2}\\b`,
    );
    if (polaTanggal.test(teksFaktaNormal)) continue;
    if (!angkaKlaim.has(angkaNormal)) {
      pelanggaran.push({
        kode: "angka_tanpa_sumber",
        pesan:
          `Angka "${angka}" di draf tidak ditemukan di klaim ` +
          `terverifikasi mana pun — angka tanpa sumber (karangan atau salah salin).`,
        rincian: potong(teksFakta),
      });
    }
  }

  // K3 — kutipan tanpa bukti: tiap klaim 'kutipan' wajib punya
  // evidence dengan kalimat kutipan yang benar-benar ditemukan
  // (P2-1); tiap segmen berpetik di draf wajib tertelusur ke klaim
  // 'kutipan' terverifikasi.
  const teksKutipanTerverifikasi = klaim
    .filter((k) => k.jenis === "kutipan")
    .map((k) => normalisasi(k.teks));
  for (const k of klaim) {
    if (k.jenis !== "kutipan") continue;
    const bukti = evidence.filter(
      (e) => normalisasi(e.klaim_teks) === normalisasi(k.teks),
    );
    const adaKutipan = bukti.some((e) => !!e.kutipan);
    if (!adaKutipan) {
      pelanggaran.push({
        kode: "kutipan_tanpa_bukti",
        pesan:
          "Klaim kutipan tidak punya evidence dengan kalimat kutipan " +
          "yang benar-benar ditemukan di sumber — kutipan tanpa bukti.",
        rincian: potong(k.teks),
      });
    }
  }
  for (const segmen of segmenBerpetik(teksFakta)) {
    const normal = normalisasi(segmen);
    const tertelusur = teksKutipanTerverifikasi.some(
      (t) => t.includes(normal) || normal.includes(t.slice(0, 60)),
    );
    if (!tertelusur) {
      pelanggaran.push({
        kode: "kutipan_tanpa_bukti",
        pesan:
          "Segmen berpetik di draf tidak tertelusur ke klaim kutipan " +
          "terverifikasi mana pun.",
        rincian: potong(segmen),
      });
    }
  }

  // K4 — tanggal diubah/tanpa sumber: tiap tanggal di fakta draf
  // harus ada di tanggal yang DIKETAHUI. "Diketahui" = tanggal yang
  // divouch pemanggil (tanggalDiketahui — mis. waktu_terbit_asli
  // item) + tanggal dari klaim jenis 'tanggal' YANG PUNYA evidence
  // (klaim tanggal tanpa evidence TIDAK memvouch tanggalnya
  // sendiri — bila tidak, tanggal karangan di dalam klaim akan
  // "mengesahkan" dirinya sendiri).
  const diketahui = new Set<string>();
  for (const t of input.tanggalDiketahui ?? []) {
    const iso = normalisasiTanggal(t) ?? t.trim();
    if (iso) diketahui.add(iso);
  }
  for (const k of klaim) {
    if (k.jenis !== "tanggal") continue;
    const punyaEvidence = evidence.some(
      (e) => normalisasi(e.klaim_teks) === normalisasi(k.teks),
    );
    if (!punyaEvidence) continue;
    for (const t of tanggalDalamTeks(k.teks)) diketahui.add(t);
    const iso = normalisasiTanggal(k.teks);
    if (iso) diketahui.add(iso);
  }
  for (const tanggal of tanggalDalamTeks(teksFakta)) {
    if (!diketahui.has(tanggal)) {
      pelanggaran.push({
        kode: "tanggal_tidak_diketahui",
        pesan:
          `Tanggal ${tanggal} di draf tidak ada di tanggal yang ` +
          `diketahui dari sumber (waktu terbit asli / klaim tanggal) ` +
          `— tanggal diubah atau dikarang.`,
        rincian: potong(teksFakta),
      });
    }
  }

  // K5 — klaim tanpa bukti pendukung: tiap klaim terverifikasi
  // wajib punya minimal satu baris evidence.
  for (const k of klaim) {
    const ada = evidence.some(
      (e) => normalisasi(e.klaim_teks) === normalisasi(k.teks),
    );
    if (!ada) {
      pelanggaran.push({
        kode: "klaim_tanpa_bukti",
        pesan:
          "Klaim terverifikasi tidak punya evidence pendukung yang tercatat.",
        rincian: potong(k.teks),
      });
    }
  }

  // K6 — konteks dipotong: tiap klaim terverifikasi wajib
  // tercantum di draf (awalan 200 karakter pertama — pemotongan
  // kutipan legal 300 karakter di writing.ts hanya memotong ekor,
  // jadi awalan tetap cocok; ini BUKAN kelonggaran untuk klaim
  // yang dihilangkan seluruhnya).
  for (const k of klaim) {
    const normal = normalisasi(k.teks);
    const awalan = normal.slice(0, 200);
    if (awalan.length < 10) continue;
    if (!isiNormal.includes(awalan) && !teksFaktaNormal.includes(awalan)) {
      pelanggaran.push({
        kode: "klaim_tidak_tercantum",
        pesan:
          "Klaim terverifikasi tidak tercantum di draf — konteks penting dipotong.",
        rincian: potong(k.teks),
      });
    }
  }
  // Seksi kejujuran "Yang belum diketahui" wajib ada — tanpanya,
  // pembaca tidak diberi tahu apa yang TIDAK dikatakan sumber.
  if (!input.isi.includes("Yang belum diketahui")) {
    pelanggaran.push({
      kode: "konteks_dipotong",
      pesan:
        'Draf tidak memuat seksi "Yang belum diketahui" — konteks ' +
        "yang tidak dikatakan sumber tidak dinyatakan jujur.",
    });
  }

  // K7 — sumber tidak dinyatakan: tiap URL di isi draf wajib ada
  // di daftar sumber yang dinyatakan draf.
  const urlDinyatakan = new Set(
    (input.sumber ?? []).map((s) => s.url.trim()),
  );
  for (const url of urlDalamTeks(input.isi)) {
    if (!urlDinyatakan.has(url)) {
      pelanggaran.push({
        kode: "sumber_tidak_dinyatakan",
        pesan:
          "URL di draf tidak ada di daftar sumber yang dinyatakan — sumber tidak tertelusur.",
        rincian: potong(url),
      });
    }
  }

  return { lolos: pelanggaran.length === 0, pelanggaran };
}
