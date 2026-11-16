// POST /api/akademi/kuis/jawab — periksa satu jawaban kuis
// pelajaran di server. Body: { lesson_id: UUID, soal_id: UUID,
// jawaban: 0..4 }. Jawaban: { ok, benar, penjelasan, sumber_url,
// sumber_nama } — TANPA kunci (berbeda dari /api/kuis/jawab yang
// mengembalikan kunci sesudah menjawab: tugas Area 8 melarang
// kunci dikirim ke klien sama sekali; penjelasan soal memuat
// pembahasan jawabannya).
// Hanya soal yang tanggalnya SAMA dengan kuis_tanggal pelajaran
// yang boleh dijawab — mencegah enumerasi kunci kuis lain lewat
// pelajaran ini. Kunci dibaca via service role (migrasi v8
// me-REVOKE SELECT (kunci) dari anon/authenticated). Rate limit
// 20/menit/IP seperti /api/kuis/jawab. Boleh anonim (kuis bersifat
// publik); skor hanya tersimpan bila login, lewat
// POST /api/akademi/progres. 503 jujur bila tabel/service key
// belum ada.
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buatRateLimiter,
  responRateLimit,
} from "@/lib/ai/route-auth";

const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const lolosRateLimit = buatRateLimiter(20);

/** Validasi murni body permintaan (diekspos untuk uji). */
export function validasiJawabanAkademi(
  body: unknown,
):
  | { ok: true; lessonId: string; soalId: string; jawaban: number }
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
  if (
    typeof jawaban !== "number" ||
    !Number.isInteger(jawaban) ||
    jawaban < 0 ||
    jawaban > 4
  ) {
    return { ok: false, error: "Jawaban harus bilangan bulat 0 sampai 4." };
  }
  return { ok: true, lessonId: lesson_id, soalId: soal_id, jawaban };
}

export async function POST(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Isi permintaan tidak valid." },
      { status: 400 },
    );
  }
  const valid = validasiJawabanAkademi(body);
  if (!valid.ok) {
    return NextResponse.json(
      { ok: false, error: valid.error },
      { status: 400 },
    );
  }

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
    .eq("id", valid.lessonId)
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

  const { data: soal, error: errSoal } = await service
    .from("pf_quiz_questions")
    .select("id, tanggal, kunci, penjelasan, sumber_url, sumber_nama")
    .eq("id", valid.soalId)
    .maybeSingle();
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

  const kunci = Number((soal as { kunci: unknown }).kunci);
  return NextResponse.json({
    ok: true,
    benar: valid.jawaban === kunci,
    penjelasan: (soal as { penjelasan?: string | null }).penjelasan ?? null,
    sumber_url: (soal as { sumber_url?: string | null }).sumber_url ?? null,
    sumber_nama:
      (soal as { sumber_nama?: string | null }).sumber_nama ?? null,
  });
}
