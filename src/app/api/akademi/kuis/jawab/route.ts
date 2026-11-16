// POST /api/akademi/kuis/jawab — periksa satu jawaban kuis
// pelajaran di server. Body: { lesson_id: UUID, soal_id: UUID,
// jawaban: number | number[] | string | boolean } — bentuk jawaban
// tergantung JENIS soal (B2-B, H2–H6):
// - pilihan_ganda / benar_salah: angka 0..4 (benar/salah: 0/1,
//   boolean juga diterima dan dipetakan ke 0/1).
// - pilihan_ganda_kompleks: daftar angka (jawaban benar > 1;
//   harus sama PERSIS dengan himpunan kunci — tanpa kredit parsial).
// - isian_singkat: teks (dibandingkan sesudah normalisasi).
// - esai: teks; TIDAK PERNAH dinilai otomatis — jawaban disimpan
//   untuk review manual staf (benar: null, status_penilaian:
//   'menunggu_penilaian').
// Jawaban: { ok, benar, status_penilaian, penjelasan, sumber_url,
// sumber_nama } — TANPA kunci (berbeda dari /api/kuis/jawab yang
// mengembalikan kunci sesudah menjawab: tugas Area 8 melarang
// kunci dikirim ke klien sama sekali; penjelasan soal memuat
// pembahasan jawabannya).
// Hanya soal yang tanggalnya SAMA dengan kuis_tanggal pelajaran
// yang boleh dijawab — mencegah enumerasi kunci kuis lain lewat
// pelajaran ini. Kunci dibaca dari pf_quiz_answers via service
// role (v13, P0-4 — kolom kunci di pf_quiz_questions sudah
// dihapus). Rate limit 20/menit/IP seperti /api/kuis/jawab.
// Boleh anonim (kuis bersifat publik); jawaban hanya TERSIMPAN
// bila login, lewat pf_quiz_user_answers (v14) — dan skor progres
// dihitung server dari jawaban tersimpan itu (L-B1/I-4), bukan
// dari angka klien. Jawaban tersimpan HANYA ditulis service role
// di route ini (tidak ada policy INSERT pengguna — pengguna yang
// menulis langsung lewat REST tidak bisa memalsukan benar).
// 503 jujur bila tabel/service key belum ada.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buatRateLimiterKeras,
  responRateLimit,
  responRateLimitBelumSiap,
} from "@/lib/ai/route-auth";
import {
  jenisSoalKuisDari,
  nilaiJawaban,
  validasiBentukJawaban,
  type JenisSoalKuis,
  type KunciSoal,
} from "@/lib/akademi/penilaian";

const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const lolosRateLimit = buatRateLimiterKeras(20);

/**
 * Validasi murni body permintaan (diekspos untuk uji). Parameter
 * kedua adalah jenis soal menurut DATABASE (otoritas) — bila
 * tidak diisi, default 'pilihan_ganda' (kompatibel dengan baterai
 * lama yang hanya menguji jawaban angka). Bentuk jawaban yang
 * tidak cocok dengan jenis soal ditolak.
 */
export function validasiJawabanAkademi(
  body: unknown,
  jenisSoal: JenisSoalKuis = "pilihan_ganda",
):
  | {
      ok: true;
      lessonId: string;
      soalId: string;
      jawaban: number | number[] | string;
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Isi permintaan tidak valid." };
  }
  const { lesson_id, soal_id, jawaban } = body as Record<string, unknown>;
  if (typeof lesson_id !== "string" || !POLA_UUID.test(lesson_id)) {
    return { ok: false, error: "lesson_id tidak valid." };
  }
  if (typeof soal_id !== "string" || !POLA_UUID.test(soal_id)) {
    return { ok: false, error: "soal_id tidak valid." };
  }
  const bentuk = validasiBentukJawaban(jenisSoal, jawaban);
  if (!bentuk.ok) return { ok: false, error: bentuk.error };
  const j = bentuk.jawaban;
  // validasiBentukJawaban memetakan boolean benar/salah ke 0/1,
  // jadi boolean/null tidak pernah lolos sampai sini — pemeriksaan
  // ini hanya penyempitan tipe untuk TypeScript.
  if (j === null || typeof j === "boolean") {
    return { ok: false, error: "Jawaban tidak valid." };
  }
  return { ok: true, lessonId: lesson_id, soalId: soal_id, jawaban: j };
}

export async function POST(req: Request) {
  const hasilRateLimit = await lolosRateLimit(req);
  if (!hasilRateLimit.lolos && hasilRateLimit.alasan === "rpc-gagal")
    return responRateLimitBelumSiap(hasilRateLimit.jenisGalat);
  if (!hasilRateLimit.lolos) return responRateLimit();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Isi permintaan tidak valid." },
      { status: 400 },
    );
  }
  // Tahap 1: hanya periksa lesson_id/soal_id (bentuk jawaban
  // BELUM bisa divalidasi — jenis soal yang menentukan bentuk
  // hanya diketahui dari database; memvalidasi dengan default
  // 'pilihan_ganda' di sini akan menolak jawaban isian/esai yang
  // sah). Bentuk diperiksa ulang sesudah soal dibaca.
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { ok: false, error: "Isi permintaan tidak valid." },
      { status: 400 },
    );
  }
  const { lesson_id: lessonIdAwal, soal_id: soalIdAwal } =
    body as Record<string, unknown>;
  if (
    typeof lessonIdAwal !== "string" ||
    !POLA_UUID.test(lessonIdAwal) ||
    typeof soalIdAwal !== "string" ||
    !POLA_UUID.test(soalIdAwal)
  ) {
    return NextResponse.json(
      { ok: false, error: "lesson_id atau soal_id tidak valid." },
      { status: 400 },
    );
  }
  const lessonId = lessonIdAwal;
  const soalId = soalIdAwal;

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Layanan kuis akademi belum aktif (kunci layanan belum diatur). Coba lagi nanti.",
      },
      { status: 503 },
    );
  }

  // Pelajaran + status kursus (service role bypass RLS, jadi
  // status 'terbit' diperiksa manual — defense-in-depth).
  const { data: pelajaran, error: errPelajaran } = await service
    .from("pf_course_lessons")
    .select(
      "id, jenis, kuis_tanggal, pf_course_modules!inner(pf_courses!inner(status))",
    )
    .eq("id", lessonId)
    .maybeSingle();
  if (errPelajaran) {
    const kode = (errPelajaran as { code?: string }).code;
    if (kode === "PGRST205") {
      return NextResponse.json(
        {
          ok: false,
          error: "Layanan akademi belum aktif (tabel database belum dibuat).",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Gagal memeriksa pelajaran. Coba lagi." },
      { status: 500 },
    );
  }
  if (!pelajaran) {
    return NextResponse.json(
      { ok: false, error: "Pelajaran tidak ditemukan." },
      { status: 404 },
    );
  }
  const baris = pelajaran as unknown as Record<string, unknown>;
  const kursus = (
    baris.pf_course_modules as {
      pf_courses?: { status?: string };
    } | null
  )?.pf_courses;
  if (
    baris.jenis !== "kuis" ||
    typeof baris.kuis_tanggal !== "string" ||
    !baris.kuis_tanggal ||
    kursus?.status !== "terbit"
  ) {
    return NextResponse.json(
      { ok: false, error: "Pelajaran tidak ditemukan." },
      { status: 404 },
    );
  }
  const kuisTanggal = baris.kuis_tanggal as string;

  // Soal + jenisnya (kolom v14; mundur ke pilihan_ganda bila
  // migrasi v14 belum dijalankan).
  let soalRes = await service
    .from("pf_quiz_questions")
    .select("id, tanggal, penjelasan, sumber_url, sumber_nama, jenis")
    .eq("id", soalId)
    .maybeSingle();
  if (
    soalRes.error &&
    (soalRes.error as { code?: string }).code === "PGRST204"
  ) {
    soalRes = await service
      .from("pf_quiz_questions")
      .select("id, tanggal, penjelasan, sumber_url, sumber_nama")
      .eq("id", soalId)
      .maybeSingle();
  }
  const { data: soal, error: errSoal } = soalRes;
  if (errSoal) {
    const kode = (errSoal as { code?: string }).code;
    if (kode === "PGRST205") {
      return NextResponse.json(
        {
          ok: false,
          error: "Layanan kuis belum aktif (tabel database belum dibuat).",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Gagal memeriksa jawaban. Coba lagi." },
      { status: 500 },
    );
  }
  if (!soal) {
    return NextResponse.json(
      { ok: false, error: "Soal tidak ditemukan." },
      { status: 404 },
    );
  }
  // Hanya soal kuis tanggal pelajaran ini yang boleh dijawab.
  const tanggal = String((soal as { tanggal: unknown }).tanggal ?? "");
  if (tanggal !== kuisTanggal) {
    return NextResponse.json(
      { ok: false, error: "Soal tidak ditemukan atau bukan bagian dari kuis pelajaran ini." },
      { status: 404 },
    );
  }
  const jenisSoal = jenisSoalKuisDari(
    (soal as { jenis?: unknown }).jenis,
  );

  // Bentuk jawaban harus cocok dengan jenis soal MENURUT DATABASE
  // (bukan menurut klaim klien di body awal).
  const valid = validasiJawabanAkademi(body, jenisSoal);
  if (!valid.ok) {
    return NextResponse.json(
      { ok: false, error: valid.error },
      { status: 400 },
    );
  }

  // Kunci dari pf_quiz_answers (v13, P0-4) + kolom kunci v14
  // (kunci_teks / kunci_jamaks; mundur ke kunci saja bila v14
  // belum dijalankan).
  let kunciRes = await service
    .from("pf_quiz_answers")
    .select("kunci, kunci_teks, kunci_jamaks")
    .eq("soal_id", valid.soalId)
    .maybeSingle();
  if (
    kunciRes.error &&
    (kunciRes.error as { code?: string }).code === "PGRST204"
  ) {
    kunciRes = await service
      .from("pf_quiz_answers")
      .select("kunci")
      .eq("soal_id", valid.soalId)
      .maybeSingle();
  }
  const { data: jawabanKunci, error: errKunci } = kunciRes;
  if (errKunci) {
    const kode = (errKunci as { code?: string }).code;
    if (kode === "PGRST205") {
      return NextResponse.json(
        {
          ok: false,
          error: "Layanan kuis belum aktif (tabel database belum dibuat).",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Gagal memeriksa jawaban. Coba lagi." },
      { status: 500 },
    );
  }
  // Soal esai tidak punya baris kunci (tidak ada yang dinilai
  // otomatis) — itu sah, bukan 404.
  const kunciSoal: KunciSoal = {
    jenis: jenisSoal,
    kunci:
      typeof (jawabanKunci as { kunci?: unknown } | null)?.kunci === "number"
        ? (jawabanKunci as { kunci: number }).kunci
        : null,
    kunci_teks:
      typeof (jawabanKunci as { kunci_teks?: unknown } | null)
        ?.kunci_teks === "string"
        ? (jawabanKunci as { kunci_teks: string }).kunci_teks
        : null,
    kunci_jamaks: Array.isArray(
      (jawabanKunci as { kunci_jamaks?: unknown } | null)?.kunci_jamaks,
    )
      ? ((jawabanKunci as { kunci_jamaks: unknown[] }).kunci_jamaks as number[])
      : null,
  };
  if (!jawabanKunci && jenisSoal !== "esai") {
    return NextResponse.json(
      { ok: false, error: "Soal tidak ditemukan." },
      { status: 404 },
    );
  }

  const hasil = nilaiJawaban(kunciSoal, valid.jawaban);

  // Simpan jawaban HANYA bila login (anonim tidak bisa diatribusikan
  // dan tidak bisa dihapus pemiliknya). Ditulis service role agar
  // RLS tidak bisa dipalsukan klien; bila tabel v14 belum ada,
  // jawabannya tetap dikembalikan tetapi TIDAK tersimpan — dan
  // pengguna login diberi tahu jujur (503) karena skor progresnya
  // tidak akan terhitung.
  let userId: string | null = null;
  try {
    const session = await createClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }
  if (userId) {
    const { error: errSimpan } = await service
      .from("pf_quiz_user_answers")
      .upsert(
        {
          user_id: userId,
          lesson_id: valid.lessonId,
          soal_id: valid.soalId,
          jenis: jenisSoal,
          jawaban: valid.jawaban,
          benar: hasil.benar,
          status_penilaian: hasil.status_penilaian,
        },
        { onConflict: "user_id,lesson_id,soal_id" },
      );
    if (errSimpan) {
      const kode = (errSimpan as { code?: string }).code;
      if (kode === "PGRST205") {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Jawaban tidak tersimpan (tabel jawaban belum dibuat — jalankan migrasi v14). Skor progres tidak akan terhitung.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { ok: false, error: "Jawaban gagal disimpan. Coba lagi." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    benar: hasil.benar,
    status_penilaian: hasil.status_penilaian,
    penjelasan: (soal as { penjelasan?: string | null }).penjelasan ?? null,
    sumber_url: (soal as { sumber_url?: string | null }).sumber_url ?? null,
    sumber_nama:
      (soal as { sumber_nama?: string | null }).sumber_nama ?? null,
  });
}
