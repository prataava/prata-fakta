// Penilaian manual esai Academy (Gelombang B2, integrasi koordinator).
//
// Jawaban esai disimpan dengan status_penilaian='menunggu_penilaian'
// (B2-B) — tanpa jalur ini esai TIDAK PERNAH bisa dinilai dan
// pengguna yang punya esai tidak pernah bisa lulus (kelulusan
// tertahan "menunggu penilaian manual" selamanya). Daftar di sini
// dibaca service role; penilaiannya sendiri memakai primitif
// tandaiEsaiDinilai (src/lib/akademi/sertifikat.ts) yang hanya
// mengubah baris yang MASIH menunggu (nilai ulang -> false).
import { createServiceClient } from "@/lib/supabase/service";

export type EsaiMenunggu = {
  id: string;
  user_id: string;
  nama_peserta: string | null;
  lesson_id: string;
  judul_pelajaran: string | null;
  soal_id: string;
  pertanyaan: string | null;
  jawaban: string;
  dibuat_pada: string;
};

type BarisJawaban = {
  id: string;
  user_id: string;
  lesson_id: string;
  soal_id: string;
  jawaban: unknown;
  dibuat_pada: string;
  pf_quiz_questions: { pertanyaan: string | null } | null;
  pf_course_lessons: { judul: string | null } | null;
};

/** Daftar esai yang masih menunggu penilaian manual (maks 100, tertua dulu). */
export async function daftarEsaiMenunggu(): Promise<{
  ok: boolean;
  esai?: EsaiMenunggu[];
}> {
  let service;
  try {
    service = createServiceClient();
  } catch {
    return { ok: false };
  }
  const { data, error } = await service
    .from("pf_quiz_user_answers")
    .select(
      "id, user_id, lesson_id, soal_id, jawaban, dibuat_pada, pf_quiz_questions(pertanyaan), pf_course_lessons(judul)",
    )
    .eq("jenis", "esai")
    .eq("status_penilaian", "menunggu_penilaian")
    .order("dibuat_pada", { ascending: true })
    .limit(100);
  if (error || !data) return { ok: false };
  const baris = data as unknown as BarisJawaban[];
  const userIds = [...new Set(baris.map((b) => b.user_id))];
  const nama: Record<string, string | null> = {};
  if (userIds.length > 0) {
    const { data: profil } = await service
      .from("pf_profiles")
      .select("id, nama_tampilan")
      .in("id", userIds);
    if (Array.isArray(profil)) {
      for (const p of profil as { id: string; nama_tampilan: string | null }[]) {
        nama[p.id] = p.nama_tampilan;
      }
    }
  }
  return {
    ok: true,
    esai: baris.map((b) => ({
      id: b.id,
      user_id: b.user_id,
      nama_peserta: nama[b.user_id] ?? null,
      lesson_id: b.lesson_id,
      judul_pelajaran: b.pf_course_lessons?.judul ?? null,
      soal_id: b.soal_id,
      pertanyaan: b.pf_quiz_questions?.pertanyaan ?? null,
      jawaban: typeof b.jawaban === "string" ? b.jawaban : JSON.stringify(b.jawaban ?? ""),
      dibuat_pada: b.dibuat_pada,
    })),
  };
}
