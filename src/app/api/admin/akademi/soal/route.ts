// GET / POST /api/admin/akademi/soal — kelola soal kuis (staf).
// POST membuat SATU soal bertipe baru (pilihan_ganda,
// pilihan_ganda_kompleks, isian_singkat, benar_salah, esai)
// untuk pelajaran kuis Academy (lesson_id) ATAU kuis harian
// (tanggal). Kunci jawaban tersimpan ke pf_quiz_answers
// (HANYA service role) — TIDAK PERNAH ke kolom publik dan
// TIDAK PERNAH dikembalikan route ini (respons hanya id +
// tanggal soal). Audit fail-closed 'akademi.soal.buat':
// gagal audit → soal dihapus-balik + operasi ditolak.
// GET mengembalikan 50 soal terbaru (tanpa kunci) untuk
// daftar verifikasi admin. Rate limit 30/menit/IP.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  bacaBody,
  buatRateLimiterAdmin,
  cekOrigin,
  ipDariRequest,
  responBodyTakValid,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { createServiceClient } from "@/lib/supabase/service";
import {
  catatAuditWajib,
  responGalatAudit,
} from "@/lib/admin/audit";
import { buatSoalKuis, validasiSoalBaru } from "@/lib/akademi/soal";
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

const KOLOM_SOAL_PUBLIK =
  "id, tanggal, pertanyaan, opsi, jenis, penjelasan, sumber_url, sumber_nama, artikel_id, dibuat_pada";

export async function GET(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("pf_quiz_questions")
      .select(KOLOM_SOAL_PUBLIK)
      .order("dibuat_pada", { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ ok: true, soal: data ?? [] });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function POST(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const auth = await autentikasiAdmin(
    req,
    ROLES.EDITOR,
    ROLES.WRITER,
  );
  if (auth instanceof NextResponse) return auth;
  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const valid = validasiSoalBaru(body);
  if (!valid.ok) {
    return NextResponse.json(
      { ok: false, error: valid.error },
      { status: 400 },
    );
  }
  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    return responGalatAdmin(err);
  }
  const hasil = await buatSoalKuis(service, valid.data);
  if (!hasil.ok) {
    if (hasil.kode === "pelajaran_tidak_ditemukan") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Pelajaran tidak ditemukan, bukan pelajaran kuis, atau belum punya tanggal kuis.",
        },
        { status: 404 },
      );
    }
    if (hasil.kode === "belum_tersedia") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Layanan soal belum aktif (tabel database belum dibuat — jalankan migrasi v13/v14).",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Soal gagal dibuat. Coba lagi." },
      { status: 500 },
    );
  }
  try {
    await catatAuditWajib({
      aktor_id: auth.user.id,
      aktor_email: auth.user.email ?? null,
      aksi: "akademi.soal.buat",
      entitas: "pf_quiz_questions",
      entitas_id: hasil.soal_id,
      sebelum: null,
      sesudah: {
        tanggal: hasil.tanggal,
        jenis: valid.data.jenis,
        lesson_id: valid.data.lessonId,
        pertanyaan: valid.data.pertanyaan.slice(0, 200),
      },
      ip: ipDariRequest(req),
    });
  } catch (err) {
    // Audit fail-closed: hapus-balik soal (kunci ikut terhapus
    // via ON DELETE CASCADE) lalu tolak operasi.
    const { error: errHapus } = await service
      .from("pf_quiz_questions")
      .delete()
      .eq("id", hasil.soal_id);
    if (errHapus) {
      console.error(
        "[admin/akademi/soal] SOAL YATIM TANPA AUDIT (hapus-balik gagal):",
        hasil.soal_id,
        errHapus,
      );
    }
    return responGalatAudit(err);
  }
  return NextResponse.json(
    {
      ok: true,
      soal: { id: hasil.soal_id, tanggal: hasil.tanggal },
    },
    { status: 201 },
  );
}
