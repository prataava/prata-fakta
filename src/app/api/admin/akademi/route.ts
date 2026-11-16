// GET /api/admin/akademi — daftar kursus (semua status, staf)
// + jumlah modul/pelajaran. POST — buat kursus baru
// (editor/writer/super_admin). Tulis via service role; aksi
// dicatat di pf_audit_logs ('akademi.kursus', CHECK v11 §3).
// Rate limit 30/menit (limiter database lintas instance, Tahap 13A, T3).
// Isi modul/pelajaran diatur lewat PATCH /api/admin/akademi/[id].
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
import { catatAuditWajib } from "@/lib/admin/audit";
import { validasiInputKursus } from "@/lib/admin/validasi";
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

export async function GET(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const service = createServiceClient();
    const [kursusRes, modulRes, pelajaranRes] = await Promise.all([
      service
        .from("pf_courses")
        .select("id, slug, judul, deskripsi, kategori, tingkat, status, urutan, dibuat_pada, diperbarui_pada")
        .order("urutan", { ascending: true })
        .order("judul", { ascending: true }),
      service.from("pf_course_modules").select("id, course_id"),
      service.from("pf_course_lessons").select("id, module_id"),
    ]);
    if (kursusRes.error) throw kursusRes.error;
    if (modulRes.error) throw modulRes.error;
    if (pelajaranRes.error) throw pelajaranRes.error;

    const modulPerKursus = new Map<string, number>();
    const modulKeKursus = new Map<string, string>();
    for (const m of (modulRes.data ?? []) as {
      id: string;
      course_id: string;
    }[]) {
      modulKeKursus.set(m.id, m.course_id);
      modulPerKursus.set(
        m.course_id,
        (modulPerKursus.get(m.course_id) ?? 0) + 1,
      );
    }
    const pelajaranPerKursus = new Map<string, number>();
    for (const p of (pelajaranRes.data ?? []) as {
      id: string;
      module_id: string;
    }[]) {
      const courseId = modulKeKursus.get(p.module_id);
      if (!courseId) continue;
      pelajaranPerKursus.set(
        courseId,
        (pelajaranPerKursus.get(courseId) ?? 0) + 1,
      );
    }
    const kursus = ((kursusRes.data ?? []) as unknown as Record<
      string,
      unknown
    >[]).map((r) => ({
      ...(r as Record<string, unknown>),
      jumlah_modul: modulPerKursus.get(String(r.id)) ?? 0,
      jumlah_pelajaran: pelajaranPerKursus.get(String(r.id)) ?? 0,
    }));
    return NextResponse.json({ ok: true, kursus });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function POST(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.WRITER);
  if (auth instanceof NextResponse) return auth;

  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const valid = validasiInputKursus(body);
  if (!valid.ok) {
    return NextResponse.json(
      { ok: false, error: valid.error },
      { status: 400 },
    );
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("pf_courses")
      .insert({
        slug: valid.data.slug,
        judul: valid.data.judul,
        deskripsi: valid.data.deskripsi ?? null,
        kategori: valid.data.kategori ?? "umum",
        tingkat: valid.data.tingkat ?? "pemula",
        status: valid.data.status ?? "draft",
        urutan: valid.data.urutan ?? 0,
      })
      .select(
        "id, slug, judul, deskripsi, kategori, tingkat, status, urutan, dibuat_pada, diperbarui_pada",
      )
      .single();
    if (error) {
      const kode = (error as { code?: string }).code;
      if (kode === "23505") {
        return NextResponse.json(
          { ok: false, error: "Slug kursus sudah dipakai." },
          { status: 409 },
        );
      }
      throw error;
    }
    // Audit FAIL-CLOSED (Tahap 13A, T10): helper lama best-effort
    // (gagal insert hanya console.error, dan {error} hasil insert
    // tidak pernah diperiksa) DIGANTI catatAuditWajib — gagal audit
    // melempar dan route menjawab 500/503 (operasi ditolak).
    await catatAuditWajib({
      aktor_id: auth.user.id,
      aktor_email: auth.user.email ?? null,
      aksi: "akademi.kursus",
      entitas: "pf_courses",
      entitas_id: (data as { id: string }).id,
      sebelum: null,
      sesudah: data ?? null,
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true, kursus: data }, { status: 201 });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
