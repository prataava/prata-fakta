// POST /api/akademi/progres — tandai satu pelajaran selesai
// (login saja). Body: { lesson_id: UUID, selesai: boolean }.
// PERUBAHAN KEAMANAN Gelombang B2-B (L-B1 / Addendum I-4):
// body TIDAK LAGI menerima `skor` — skor mentah dari klien
// (0–100) adalah celah pemalsuan sertifikat (satu POST skor 100
// tanpa menjawab kuis). Bila body mengandung `skor` non-null,
// permintaan DITOLAK 400. Skor dihitung SERVER dari jawaban
// tersimpan pengguna di pf_quiz_user_answers (v14):
// - pelajaran kuis: skor = jumlah jawaban benar (benar = true)
//   yang tersimpan untuk pelajaran itu; selesai=true DITOLAK
//   bila belum ada satu pun jawaban tersimpan.
// - pelajaran non-kuis (materi/artikel): skor selalu null.
// Pertahanan berlapis di database: trigger v14
// pf_course_progress_skor_server menghitung ulang skor yang
// sama pada setiap INSERT/UPDATE (dan memaksa null untuk
// non-kuis) — menulis langsung lewat REST pun tidak bisa
// memalsukan skor. Rate limit 20/menit/IP. RLS v10 memastikan
// pelajaran hanya bisa ditandai bila kursusnya terbit: pelajaran
// dibaca dulu lewat session client; bila tidak terbaca (draf /
// tidak ada) dijawab 404. Upsert satu baris per (pengguna,
// pelajaran). 503 jujur bila tabel v10/v14 belum ada.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buatRateLimiterKeras,
  responRateLimit,
  responRateLimitBelumSiap,
  tolakAkunNonaktif,
} from "@/lib/ai/route-auth";
import { catatGalatRoute } from "@/lib/analytics/galat";

const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const lolosRateLimit = buatRateLimiterKeras(20);

/** Validasi murni body permintaan (diekspos untuk uji). */
export function validasiProgres(
  body: unknown,
):
  | {
      ok: true;
      lessonId: string;
      selesai: boolean;
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
  // Skor dari klien TIDAK PERNAH diterima lagi (I-4): skor
  // dihitung server dari jawaban tersimpan. `skor: null` atau
  // tidak ada kunci skor masih diterima (kompatibel dengan klien
  // lama yang mengirim null); angka apa pun ditolak tegas.
  if (skor !== undefined && skor !== null) {
    return {
      ok: false,
      error:
        "Skor dihitung server dari jawaban kuis tersimpan — skor dari klien tidak diterima.",
    };
  }
  return { ok: true, lessonId: lesson_id, selesai };
}

/**
 * Hitung skor server-side satu pelajaran kuis dari jawaban
 * tersimpan (diekspos untuk uji): jumlah jawaban benar.
 * `ambilJawaban` mengembalikan null bila tabel jawaban belum ada
 * (PGRST205) agar pemanggil bisa menjawab 503 jujur; melempar
 * bila baca gagal karena galat lain.
 */
export async function hitungSkorProgres(
  ambilJawaban: (
    userId: string,
    lessonId: string,
  ) => Promise<{ benar: boolean | null }[] | null>,
  userId: string,
  lessonId: string,
): Promise<{ skor: number; jumlahJawaban: number } | null> {
  const daftar = await ambilJawaban(userId, lessonId);
  if (daftar === null) return null;
  return {
    skor: daftar.filter((r) => r.benar === true).length,
    jumlahJawaban: daftar.length,
  };
}

export async function POST(req: Request) {
  const hasilRateLimit = await lolosRateLimit(req);
  if (!hasilRateLimit.lolos && hasilRateLimit.alasan === "rpc-gagal")
    return responRateLimitBelumSiap(hasilRateLimit.jenisGalat);
  if (!hasilRateLimit.lolos) return responRateLimit();

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
  // T4 (Tahap 13A): akun dibatasi (nonaktif) → 403.
  const ditolak = await tolakAkunNonaktif(supabase, user.id);
  if (ditolak) return ditolak;

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
  // Jenis pelajaran menentukan apakah skor dihitung dari jawaban.
  const { data: pelajaran, error: errPelajaran } = await supabase
    .from("pf_course_lessons")
    .select("id, jenis")
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
    void catatGalatRoute("POST /api/akademi/progres", errPelajaran);
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
  const jenis = String((pelajaran as { jenis?: unknown }).jenis ?? "materi");

  // Skor server-side: hanya pelajaran kuis yang punya skor,
  // dihitung dari jawaban tersimpan (bukan dari body).
  let skor: number | null = null;
  if (jenis === "kuis") {
    let hitung: { skor: number; jumlahJawaban: number } | null;
    try {
      hitung = await hitungSkorProgres(
        async (uid: string, lid: string) => {
          const { data, error } = await supabase
            .from("pf_quiz_user_answers")
            .select("benar")
            .eq("user_id", uid)
            .eq("lesson_id", lid);
          if (error) {
            if ((error as { code?: string }).code === "PGRST205") {
              return null;
            }
            throw error;
          }
          return (data ?? []) as { benar: boolean | null }[];
        },
        user.id,
        valid.lessonId,
      );
    } catch (err) {
      void catatGalatRoute("POST /api/akademi/progres", err);
      return NextResponse.json(
        { ok: false, error: "Gagal menghitung skor kuis. Coba lagi." },
        { status: 500 },
      );
    }
    if (hitung === null) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Layanan akademi belum aktif (tabel jawaban belum dibuat — jalankan migrasi v14).",
        },
        { status: 503 },
      );
    }
    if (valid.selesai && hitung.jumlahJawaban === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Jawab dulu kuis pelajaran ini — pelajaran kuis tidak bisa ditandai selesai tanpa jawaban tersimpan.",
        },
        { status: 409 },
      );
    }
    skor = hitung.skor;
  }

  const { data, error } = await supabase
    .from("pf_course_progress")
    .upsert(
      {
        user_id: user.id,
        lesson_id: valid.lessonId,
        selesai: valid.selesai,
        skor,
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
    void catatGalatRoute("POST /api/akademi/progres", error);
    return NextResponse.json(
      { ok: false, error: "Progres gagal disimpan. Coba lagi." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, progres: data });
}
