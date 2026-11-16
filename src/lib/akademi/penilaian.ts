// Penilaian Academy — fungsi MURNI (tanpa I/O) untuk Gelombang B2-B.
// Dipakai server-side oleh route jawab/progres/sertifikat dan oleh
// baterai uji-ultimate-b2-akademi. TIDAK PERNAH menerima skor dari
// klien: skor selalu dihitung dari jawaban tersimpan (lihat
// pf_quiz_user_answers, migrasi v14) lewat fungsi di berkas ini.
//
// JENIS SOAL KUIS (H2–H6):
// - pilihan_ganda: satu jawaban benar (angka 0..4, kunci di
//   pf_quiz_answers.kunci).
// - pilihan_ganda_kompleks: jawaban benar LEBIH DARI SATU —
//   jawaban pengguna harus sama PERSIS dengan himpunan kunci
//   (kunci_jamaks); jawaban sebagian benar tetap SALAH (tanpa
//   kredit parsial — aturan ini didokumentasikan agar tidak
//   disangka bug).
// - isian_singkat: jawaban teks; cocok bila sama sesudah
//   normalisasi (huruf kecil, spasi diringkas, tanda baca akhir
//   dibuang). Kunci teks di pf_quiz_answers.kunci_teks.
// - benar_salah: jawaban 0 (Salah) / 1 (Benar), kunci angka di
//   pf_quiz_answers.kunci; opsi soal sebaiknya ["Benar", "Salah"].
// - esai: TIDAK PERNAH dinilai otomatis (L-C5, tetap belum bisa).
//   Jawaban disimpan untuk review manual staf; benar = null,
//   status_penilaian = 'menunggu_penilaian' sampai manusia menilai.
//
// KRITERIA KELULUSAN (B1) — diputuskan Gelombang B2-B, 16 Nov 2026:
// - Pelajaran selesai >= 80% dari seluruh pelajaran kursus.
//   Alasan 80% (bukan 100% seperti usul awal audit L-B1): kursus
//   boleh berisi satu-dua pelajaran pengayaan opsional; penguasaan
//   tetap dijaga oleh dua ambang kuis di bawah. 100% akan
//   menghukum pengguna yang melewatkan satu materi pengayaan.
// - Rata-rata skor kuis >= 70 (skala 0–100). Skor satu pelajaran
//   kuis = benar / soal_dinilai_otomatis * 100; soal esai TIDAK
//   masuk penyebut (tidak bisa dinilai otomatis — memasukkannya
//   sebagai 0 akan menghukum pengguna atas soal yang belum
//   dinilai manusia).
// - Kuis akhir >= 70. "Kuis akhir" = pelajaran kuis dengan urutan
//   tertinggi (modul urutan terbesar, lalu pelajaran urutan
//   terbesar). Bila kuis akhir hanya berisi soal esai (skor null),
//   kriteria ini tidak berlaku (tidak ada skor yang bisa diuji).
// - Bila kursus TIDAK punya pelajaran kuis sama sekali, kelulusan
//   hanya butuh >= 80% pelajaran selesai (dua kriteria kuis tidak
//   berlaku — rata-rata dan kuis akhir = null).
// - Esai yang sudah dinilai manusia (benar terisi) ikut dihitung
//   seperti soal biasa; esai yang masih menunggu TIDAK masuk
//   penyebut maupun pembilang.

export type JenisSoalKuis =
  | "pilihan_ganda"
  | "pilihan_ganda_kompleks"
  | "isian_singkat"
  | "benar_salah"
  | "esai";

export const JENIS_SOAL_KUIS: JenisSoalKuis[] = [
  "pilihan_ganda",
  "pilihan_ganda_kompleks",
  "isian_singkat",
  "benar_salah",
  "esai",
];

export function jenisSoalKuisDari(v: unknown): JenisSoalKuis {
  if (
    v === "pilihan_ganda_kompleks" ||
    v === "isian_singkat" ||
    v === "benar_salah" ||
    v === "esai"
  ) {
    return v;
  }
  return "pilihan_ganda";
}

/** Ambang kelulusan Academy (lihat komentar kepala berkas). */
export const AMBANG_PELAJARAN_PERSEN = 80;
export const AMBANG_SKOR_RATA_RATA = 70;
export const AMBANG_KUIS_AKHIR = 70;

/** Status penilaian satu jawaban tersimpan. */
export type StatusPenilaian =
  | "otomatis"
  | "menunggu_penilaian"
  | "dinilai";

/** Kunci satu soal, dibaca server dari pf_quiz_answers. */
export type KunciSoal = {
  jenis: JenisSoalKuis;
  /** Kunci angka 0..4 (pilihan_ganda, benar_salah); null bila tak berlaku. */
  kunci: number | null;
  /** Kunci teks (isian_singkat); null bila tak berlaku. */
  kunci_teks: string | null;
  /** Himpunan kunci (pilihan_ganda_kompleks); null bila tak berlaku. */
  kunci_jamaks: number[] | null;
};

/** Jawaban mentah pengguna apa adanya dari body (belum tepercaya). */
export type JawabanMentah = number | number[] | string | boolean | null;

/**
 * Normalisasi jawaban isian singkat: huruf kecil, spasi awal/akhir
 * dibuang, spasi dalam diringkas jadi satu, tanda baca akhir
 * (. , ! ?) dibuang. "  Jakarta. " dan "jakarta" dianggap sama.
 */
export function normalisasiIsian(teks: string): string {
  return teks
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.?!，,;:\s]+$/u, "")
    .trim();
}

/**
 * Validasi bentuk jawaban terhadap jenis soal. TIDAK memeriksa
 * kebenaran — hanya bentuk. Mengembalikan jawaban ternormalisasi
 * (pilihan kompleks diurutkan + didedup; benar/salah boolean
 * dipetakan ke 0/1) atau galat bentuk.
 */
export function validasiBentukJawaban(
  jenis: JenisSoalKuis,
  jawaban: unknown,
):
  | { ok: true; jawaban: JawabanMentah }
  | { ok: false; error: string } {
  if (jenis === "pilihan_ganda" || jenis === "benar_salah") {
    if (typeof jawaban === "boolean") {
      return { ok: true, jawaban: jawaban ? 1 : 0 };
    }
    if (
      typeof jawaban !== "number" ||
      !Number.isInteger(jawaban) ||
      jawaban < 0 ||
      jawaban > 4
    ) {
      return {
        ok: false,
        error: "Jawaban harus bilangan bulat 0 sampai 4.",
      };
    }
    if (jenis === "benar_salah" && jawaban > 1) {
      return {
        ok: false,
        error: "Jawaban benar/salah harus 0 (Salah) atau 1 (Benar).",
      };
    }
    return { ok: true, jawaban };
  }
  if (jenis === "pilihan_ganda_kompleks") {
    if (!Array.isArray(jawaban) || jawaban.length === 0) {
      return {
        ok: false,
        error: "Jawaban pilihan ganda kompleks harus daftar pilihan yang tidak kosong.",
      };
    }
    for (const j of jawaban as unknown[]) {
      if (
        typeof j !== "number" ||
        !Number.isInteger(j) ||
        j < 0 ||
        j > 4
      ) {
        return {
          ok: false,
          error: "Setiap pilihan harus bilangan bulat 0 sampai 4.",
        };
      }
    }
    const unik = [...new Set(jawaban as number[])].sort((a, b) => a - b);
    return { ok: true, jawaban: unik };
  }
  if (jenis === "isian_singkat") {
    if (typeof jawaban !== "string" || jawaban.trim().length === 0) {
      return { ok: false, error: "Jawaban isian singkat harus teks yang tidak kosong." };
    }
    if (jawaban.length > 500) {
      return { ok: false, error: "Jawaban isian singkat maksimal 500 karakter." };
    }
    return { ok: true, jawaban: jawaban.trim() };
  }
  // esai
  if (typeof jawaban !== "string" || jawaban.trim().length === 0) {
    return { ok: false, error: "Jawaban esai harus teks yang tidak kosong." };
  }
  if (jawaban.length > 5000) {
    return { ok: false, error: "Jawaban esai maksimal 5000 karakter." };
  }
  return { ok: true, jawaban: jawaban.trim() };
}

/**
 * Nilai satu jawaban (sudah tervalidasi bentuknya) terhadap kunci
 * server. Esai selalu { benar: null, status_penilaian:
 * 'menunggu_penilaian' } — TIDAK PERNAH dinilai otomatis.
 */
export function nilaiJawaban(
  kunciSoal: KunciSoal,
  jawaban: JawabanMentah,
): { benar: boolean | null; status_penilaian: StatusPenilaian } {
  const jenis = kunciSoal.jenis;
  if (jenis === "esai") {
    return { benar: null, status_penilaian: "menunggu_penilaian" };
  }
  if (jenis === "pilihan_ganda" || jenis === "benar_salah") {
    if (typeof jawaban !== "number" || kunciSoal.kunci === null) {
      return { benar: false, status_penilaian: "otomatis" };
    }
    return { benar: jawaban === kunciSoal.kunci, status_penilaian: "otomatis" };
  }
  if (jenis === "pilihan_ganda_kompleks") {
    const kunci = kunciSoal.kunci_jamaks ?? [];
    if (!Array.isArray(jawaban) || kunci.length === 0) {
      return { benar: false, status_penilaian: "otomatis" };
    }
    const a = [...new Set(jawaban as number[])].sort((x, y) => x - y);
    const b = [...new Set(kunci)].sort((x, y) => x - y);
    const sama =
      a.length === b.length && a.every((v, i) => v === b[i]);
    return { benar: sama, status_penilaian: "otomatis" };
  }
  // isian_singkat
  if (typeof jawaban !== "string" || kunciSoal.kunci_teks === null) {
    return { benar: false, status_penilaian: "otomatis" };
  }
  return {
    benar:
      normalisasiIsian(jawaban) === normalisasiIsian(kunciSoal.kunci_teks),
    status_penilaian: "otomatis",
  };
}

/** Satu jawaban tersimpan (dari pf_quiz_user_answers). */
export type JawabanTersimpan = {
  benar: boolean | null;
};

/** Hasil hitungSkorKuis (tipe bernama — anotasi multi-baris di
 *  sini akan memotong ekstraktor fungsi baterai). */
export type HasilSkorKuis = {
  benar: number;
  total_dinilai: number;
  persen: number | null;
};

/**
 * Hitung skor satu pelajaran kuis dari jawaban tersimpan:
 * benar = jumlah jawaban dengan benar === true;
 * total_dinilai = jumlah jawaban dengan benar !== null (esai yang
 * masih menunggu TIDAK dihitung); persen null bila tidak ada satu
 * pun soal yang bisa dinilai otomatis.
 */
export function hitungSkorKuis(jawaban: JawabanTersimpan[]): HasilSkorKuis {
  let benar = 0;
  let total = 0;
  for (const j of jawaban) {
    if (j.benar === null) continue;
    total += 1;
    if (j.benar) benar += 1;
  }
  return {
    benar,
    total_dinilai: total,
    persen: total === 0 ? null : Math.round((benar / total) * 100),
  };
}

/** Skor satu pelajaran kuis untuk agregasi kelulusan. */
export type SkorKuisPelajaran = {
  lesson_id: string;
  /** Urutan modul (penentu "kuis akhir"). */
  urutan_modul: number;
  /** Urutan pelajaran dalam modul (penentu "kuis akhir"). */
  urutan_pelajaran: number;
  persen: number | null;
};

/** Masukan agregasi kelulusan (angka nyata dari database). */
export type MasukanKelulusan = {
  total_pelajaran: number;
  pelajaran_selesai: number;
  skor_kuis: SkorKuisPelajaran[];
};

/** Hasil cek kelulusan + snapshot kriteria (disimpan di sertifikat). */
export type HasilKelulusan = {
  lulus: boolean;
  persen_pelajaran: number;
  pelajaran_selesai: number;
  total_pelajaran: number;
  /** null bila kursus tanpa kuis yang bisa dinilai. */
  rata_rata_kuis: number | null;
  /** null bila tidak ada kuis akhir yang bisa dinilai. */
  skor_kuis_akhir: number | null;
  jumlah_kuis: number;
  alasan: string[];
  kriteria: {
    ambang_pelajaran_persen: number;
    ambang_skor_rata_rata: number;
    ambang_kuis_akhir: number;
  };
};

/**
 * Cek kelulusan dari data nyata (murni — tanpa I/O). Rata-rata
 * kuis = rata-rata persen pelajaran kuis yang punya skor (bukan
 * rata-rata tertimbang soal); kuis akhir = pelajaran kuis dengan
 * (urutan_modul, urutan_pelajaran) terbesar yang punya skor.
 */
export function cekKelulusan(m: MasukanKelulusan): HasilKelulusan {
  const persenPelajaran =
    m.total_pelajaran === 0
      ? 0
      : Math.round((m.pelajaran_selesai / m.total_pelajaran) * 100);
  const dinilai = m.skor_kuis.filter((s) => s.persen !== null);
  const rataRata =
    dinilai.length === 0
      ? null
      : Math.round(
          dinilai.reduce((a, s) => a + (s.persen as number), 0) /
            dinilai.length,
        );
  const terurut = [...dinilai].sort(
    (a, b) =>
      a.urutan_modul - b.urutan_modul ||
      a.urutan_pelajaran - b.urutan_pelajaran,
  );
  const skorAkhir =
    terurut.length === 0
      ? null
      : (terurut[terurut.length - 1].persen as number);

  const alasan: string[] = [];
  if (m.total_pelajaran === 0) {
    alasan.push("Kursus ini belum memiliki pelajaran.");
  } else if (persenPelajaran < AMBANG_PELAJARAN_PERSEN) {
    alasan.push(
      `Pelajaran selesai ${persenPelajaran}% (butuh ${AMBANG_PELAJARAN_PERSEN}%).`,
    );
  }
  if (m.skor_kuis.length > 0) {
    if (rataRata === null) {
      alasan.push(
        "Belum ada kuis yang bisa dinilai (soal esai masih menunggu penilaian manual).",
      );
    } else if (rataRata < AMBANG_SKOR_RATA_RATA) {
      alasan.push(
        `Rata-rata skor kuis ${rataRata} (butuh ${AMBANG_SKOR_RATA_RATA}).`,
      );
    }
    if (skorAkhir !== null && skorAkhir < AMBANG_KUIS_AKHIR) {
      alasan.push(
        `Skor kuis akhir ${skorAkhir} (butuh ${AMBANG_KUIS_AKHIR}).`,
      );
    }
  }
  return {
    lulus: alasan.length === 0 && m.total_pelajaran > 0,
    persen_pelajaran: persenPelajaran,
    pelajaran_selesai: m.pelajaran_selesai,
    total_pelajaran: m.total_pelajaran,
    rata_rata_kuis: rataRata,
    skor_kuis_akhir: skorAkhir,
    jumlah_kuis: m.skor_kuis.length,
    alasan,
    kriteria: {
      ambang_pelajaran_persen: AMBANG_PELAJARAN_PERSEN,
      ambang_skor_rata_rata: AMBANG_SKOR_RATA_RATA,
      ambang_kuis_akhir: AMBANG_KUIS_AKHIR,
    },
  };
}

/**
 * Kode verifikasi sertifikat: 12 karakter dari alfabet tanpa huruf
 * yang mudah tertukar (I, O, 0, 1 dibuang). Entropi dari
 * crypto.getRandomValues (tersedia di Node 19+ dan browser).
 */
const ALFABET_KODE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function buatKodeVerifikasi(): string {
  const acak = new Uint8Array(12);
  globalThis.crypto.getRandomValues(acak);
  let kode = "";
  for (const b of acak) kode += ALFABET_KODE[b % ALFABET_KODE.length];
  return kode;
}
