// PATCH /api/admin/event/[id] — ubah event (editor/writer/
// super_admin). DELETE /api/admin/event/[id] — hapus event
// (tautan cerita + kronologi ikut terhapus via FK cascade).
// Tulis via service role. Rate limit 30/menit/IP.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  bacaBody,
  buatRateLimiterAdmin,
  ipDariRequest,
  responBodyTakValid,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { createServiceClient } from "@/lib/supabase/service";
import { catatAuditWajib } from "@/lib/admin/audit";
import { ROLES } from "@/lib/auth/roles";
import { isUuid, validasiEventInput } from "../route";

const lolosRateLimit = buatRateLimiterAdmin();

const KOLOM_EVENT =
  "id, judul, ringkasan, lokasi_teks, lintang, bujur, dimulai_pada, berakhir_pada, dampak, sumber_url, era, penting, negara_kode, dibuat_pada, diperbarui_pada";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.WRITER);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json(
      { ok: false, error: "id event tidak valid." },
      { status: 400 },
    );
  }
  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const { input, galat } = validasiEventInput(body, false);
  if (galat || !input) {
    return NextResponse.json(
      { ok: false, error: galat ?? "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  // Hanya kirim kolom yang memang diubah (body tidak membawa
  // dimulai_pada → jangan timpa dengan string kosong).
  const patch: Record<string, unknown> = {};
  if (body.judul !== undefined) patch.judul = input.judul;
  if (body.ringkasan !== undefined) patch.ringkasan = input.ringkasan;
  if (body.lokasi_teks !== undefined) patch.lokasi_teks = input.lokasi_teks;
  if (body.lintang !== undefined) patch.lintang = input.lintang;
  if (body.bujur !== undefined) patch.bujur = input.bujur;
  if (body.dimulai_pada !== undefined)
    patch.dimulai_pada = input.dimulai_pada;
  if (body.berakhir_pada !== undefined)
    patch.berakhir_pada = input.berakhir_pada;
  if (body.dampak !== undefined) patch.dampak = input.dampak;
  if (body.sumber_url !== undefined) patch.sumber_url = input.sumber_url;
  if (body.era !== undefined) patch.era = input.era;
  if (body.penting !== undefined) patch.penting = input.penting;
  if (body.negara_kode !== undefined) patch.negara_kode = input.negara_kode;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { ok: false, error: "Tidak ada perubahan yang dikirim." },
      { status: 400 },
    );
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("pf_events")
      .update(patch)
      .eq("id", id)
      .select(KOLOM_EVENT)
      .maybeSingle();
    if (error) {
      if (error.code === "23503") {
        return NextResponse.json(
          { ok: false, error: "Kode negara tidak dikenal." },
          { status: 400 },
        );
      }
      throw error;
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Event tidak ditemukan." },
        { status: 404 },
      );
    }
    // Audit fail-closed (Tahap 13A, T10): gagal audit → operasi
    // ditolak (galat naik ke responGalatAdmin → 500/503).
    await catatAuditWajib({
      aktor_id: auth.user.id,
      aktor_email: auth.user.email ?? null,
      aksi: "event.ubah",
      entitas: "pf_events",
      entitas_id: id,
      sebelum: null,
      sesudah: patch,
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true, event: data });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.WRITER);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json(
      { ok: false, error: "id event tidak valid." },
      { status: 400 },
    );
  }
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("pf_events")
      .delete()
      .eq("id", id)
      .select(KOLOM_EVENT)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Event tidak ditemukan." },
        { status: 404 },
      );
    }
    // Audit fail-closed (Tahap 13A, T10): gagal audit → operasi
    // ditolak (galat naik ke responGalatAdmin → 500/503).
    await catatAuditWajib({
      aktor_id: auth.user.id,
      aktor_email: auth.user.email ?? null,
      aksi: "event.hapus",
      entitas: "pf_events",
      entitas_id: id,
      sebelum: {
        judul: (data as { judul: string }).judul,
        dimulai_pada: (data as { dimulai_pada: string }).dimulai_pada,
        era: (data as { era: string | null }).era,
      },
      sesudah: null,
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
