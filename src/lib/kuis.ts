// Validator + penghitung skor murni Kuis Harian — PINDAHAN FU2
// (16 Nov 2026). Fungsi-fungsi ini SEMULA diekspor dari berkas
// route.ts (api/kuis/jawab, api/kuis/skor) — Next.js (webpack)
// menolak ekspor non-handler dari route.ts (TS2344), sehingga
// build --webpack gagal sementara Turbopack lolos. Perilaku
// dipindah MENTAH (tanpa refactor isi). Tidak ada lib kuis yang
// sudah ada (penilaian.ts khusus Academy), jadi berkas domain
// baru ini rumahnya. Route + baterai mengimpor dari sini.
const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validasi murni body permintaan (diekspos untuk uji).
 *  Semula di src/app/api/kuis/jawab/route.ts. */
export function validasiJawabanKuis(
  body: unknown,
):
  | { ok: true; soalId: string; jawaban: number }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Isi permintaan tidak valid." };
  }
  const { soal_id, jawaban } = body as Record<string, unknown>;
  if (typeof soal_id !== "string" || !POLA_UUID.test(soal_id)) {
    return { ok: false, error: "soal_id tidak valid." };
  }
  if (
    typeof jawaban !== "number" ||
    !Number.isInteger(jawaban) ||
    jawaban < 0 ||
    jawaban > 4
  ) {
    return { ok: false, error: "Jawaban harus bilangan bulat 0 sampai 4." };
  }
  return { ok: true, soalId: soal_id, jawaban };
}

/** Satu jawaban kuis harian tersimpan (dari pf_quiz_daily_answers). */
export type JawabanHarianTersimpan = {
  soal_id: string;
  benar: boolean;
};

/**
 * Hitung skor harian dari jawaban tersimpan (murni, diekspos
 * untuk uji). Mengembalikan { ok: false } bila jawaban
 * tersimpan belum mencakup SEMUA soal hari itu — skor parsial
 * tidak pernah disimpan (pengguna harus menyelesaikan kuis
 * dulu; main ulang menimpa jawaban tersimpan sebelumnya).
 * Semula di src/app/api/kuis/skor/route.ts.
 */
export function hitungSkorDariJawabanTersimpan(
  jawabanTersimpan: JawabanHarianTersimpan[],
  soalHariIni: string[],
):
  | { ok: true; benar: number; total: number }
  | { ok: false; error: string; terjawab: number; total: number } {
  const total = soalHariIni.length;
  if (total === 0) {
    return {
      ok: false,
      error: "Belum ada soal kuis untuk tanggal ini.",
      terjawab: 0,
      total: 0,
    };
  }
  const idSoal = new Set(soalHariIni);
  const terjawab = new Set<string>();
  let benar = 0;
  for (const j of jawabanTersimpan) {
    if (!idSoal.has(j.soal_id) || terjawab.has(j.soal_id)) continue;
    terjawab.add(j.soal_id);
    if (j.benar) benar += 1;
  }
  if (terjawab.size < total) {
    return {
      ok: false,
      error: `Jawaban tersimpan belum lengkap (${terjawab.size} dari ${total} soal) — selesaikan kuis hari ini dulu.`,
      terjawab: terjawab.size,
      total,
    };
  }
  return { ok: true, benar, total };
}
