// POST /api/akademi/progres — tandai satu pelajaran selesai
// (login saja). Body: { lesson_id: UUID, selesai: boolean,
// skor?: number | null } — skor hanya untuk pelajaran kuis
// (jumlah jawaban benar). Rate limit 20/menit/IP. RLS v10
// memastikan pelajaran hanya bisa ditandai bila kursusnya terbit:
// pelajaran dibaca dulu lewat session client; bila tidak terbaca
// (draf / tidak ada) dijawab 404. Upsert satu baris per
// (pengguna, pelajaran). 503 jujur bila tabel v10 belum ada.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buatRateLimiter,
  ipDariRequest,
  responRateLimit,
} from "@/lib/ai/route-auth";

const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const lolosRateLimit = buatRateLimiter(20);

/** Validasi murni body permintaan (diekspos untuk uji). */
export function validasiProgres(
  body: unknown,
):
  | {
      ok: true;
      lessonId: string;
      selesai: boolean;
      skor: number | null;
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Isi permintaan tidak valid." };
  }
  const { lesson_id, selesai, skor } = body as Record<string, unknown>;
  if (typeof lesson_id !== "string" || !POLA_UUID.test(lesson_id)) {
    return { ok: false, error: "lesson_id tidak valid." };
  }
  if (typeof selesai !== "boolean") {
    return { ok: false, error: "selesai harus boolean." };
  }
  let skorValid: number | null = null;
  if (skor !== undefined && skor !== null) {
    if (
      typeof skor !== "number" ||
      !Number.isInteger(skor) ||
      skor < 0 ||
      skor > 100
    ) {
      return { ok: false, error: "Skor harus bilangan bulat 0 sampai 100." };
    }
    skorValid = skor;
  }
  return { ok: true, lessonId: lesson_id, selesai, skor: skorValid };
}

export async function POST(req: Request) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Anda harus masuk terlebih dahulu." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Isi permintaan tidak valid." },
      { status: 400 },
    );
  }
  const valid = validasiProgres(body);
  if (!valid.ok) {
    return NextResponse.json(
      { ok: false, error: valid.error },
      { status: 400 },
    );
  }

  // Defense-in-depth: pelajaran hanya terbaca lewat RLS bila
  // kursusnya terbit — pelajaran draf/tidak ada dijawab 404.
  const { data: pelajaran, error: errPelajaran } = await supabase
    .from("pf_course_lessons")
    .select("id")
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

  const { data, error } = await supabase
    .from("pf_course_progress")
    .upsert(
      {
        user_id: user.id,
        lesson_id: valid.lessonId,
        selesai: valid.selesai,
        skor: valid.skor,
      },
      { onConflict: "user_id,lesson_id" },
    )
    .select("lesson_id, selesai, skor")
    .single();
  if (error) {
    const kode = (error as { code?: string }).code;
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
      { ok: false, error: "Progres gagal disimpan. Coba lagi." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, progres: data });
}
