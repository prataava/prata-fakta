// POST /api/admin/akademi/esai/[id]/nilai — nilai satu jawaban esai.
// Body: { benar: boolean }. Staf saja (editor/fact_checker/
// super_admin). Esai yang sudah dinilai DITOLAK 409 (primitif
// tandaiEsaiDinilai hanya mengubah baris yang masih menunggu).
// Beraudit 'akademi.progres' (penilaian mengubah skor progres).
import { NextResponse } from "next/server";
import { autentikasiAdmin, buatRateLimiterAdmin } from "@/lib/admin/guard";
import { catatAuditWajib } from "@/lib/admin/audit";
import { ipDariRequest } from "@/lib/ai/route-auth";
import { ROLES } from "@/lib/auth/roles";
import { createServiceClient } from "@/lib/supabase/service";
import { tandaiEsaiDinilai } from "@/lib/akademi/sertifikat";

const lolosRateLimit = buatRateLimiterAdmin();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await lolosRateLimit(req))) {
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak permintaan. Coba lagi." },
      { status: 429 },
    );
  }
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.FACT_CHECKER);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Isi permintaan tidak valid." },
      { status: 400 },
    );
  }
  const benar = (body as Record<string, unknown> | null)?.benar;
  if (typeof benar !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "benar harus boolean." },
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
          "Layanan penilaian belum tersedia (kunci service belum diatur).",
      },
      { status: 503 },
    );
  }
  const { data: baris, error: errBaris } = await service
    .from("pf_quiz_user_answers")
    .select("user_id, lesson_id, soal_id, jenis, status_penilaian")
    .eq("id", id)
    .maybeSingle();
  if (errBaris) {
    return NextResponse.json(
      { ok: false, error: "Gagal membaca jawaban esai." },
      { status: 500 },
    );
  }
  if (!baris) {
    return NextResponse.json(
      { ok: false, error: "Jawaban esai tidak ditemukan." },
      { status: 404 },
    );
  }
  const b = baris as {
    user_id: string;
    lesson_id: string;
    soal_id: string;
    jenis: string;
    status_penilaian: string;
  };
  if (b.jenis !== "esai" || b.status_penilaian !== "menunggu_penilaian") {
    return NextResponse.json(
      { ok: false, error: "Esai ini sudah dinilai atau bukan esai." },
      { status: 409 },
    );
  }
  const ok = await tandaiEsaiDinilai(
    b.user_id,
    b.lesson_id,
    b.soal_id,
    benar,
    auth.user.id,
  );
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "Esai gagal dinilai (kemungkinan sudah dinilai)." },
      { status: 409 },
    );
  }
  await catatAuditWajib({
    aktor_id: auth.user.id,
    aktor_email: auth.user.email ?? null,
    aksi: "akademi.progres",
    entitas: "pf_quiz_user_answers",
    entitas_id: id,
    sebelum: { status_penilaian: "menunggu_penilaian", benar: null },
    sesudah: { status_penilaian: "dinilai", benar },
    ip: ipDariRequest(req),
  });
  return NextResponse.json({ ok: true, benar });
}
