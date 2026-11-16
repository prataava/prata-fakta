// /api/admin/riset/[id]
// GET — detail satu laporan riset / dokumen (staf).
// PATCH — ubah laporan riset / dokumen (editor/writer). Jenis baris
//   dipilih lewat query ?tipe=dokumen (default: riset). PATCH riset
//   BOLEH mengubah status draft <-> terbit: penerbitan manual oleh
//   staf sesudah ditinjau (bukan auto-terbit).
// DELETE — hapus laporan riset / dokumen (editor).
// Rate limit 30/menit/IP.
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
import { JENIS_DOKUMEN } from "@/lib/riset";
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

type Params = { params: Promise<{ id: string }> };

const POLA_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

const KOLOM_RISET =
  "id, slug, judul, ringkasan, isi, metodologi, penerbit, tanggal, status, dibuat_pada, diperbarui_pada";
const KOLOM_DOKUMEN =
  "id, jenis, judul, penerbit, tanggal, url_sumber, kategori, metadata, status, dibuat_pada";

const FIELD_RISET = [
  "slug",
  "judul",
  "ringkasan",
  "isi",
  "metodologi",
  "penerbit",
  "tanggal",
  "status",
] as const;

const FIELD_DOKUMEN = [
  "jenis",
  "judul",
  "penerbit",
  "tanggal",
  "url_sumber",
  "kategori",
  "metadata",
  "status",
] as const;

function teks(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function tipeDari(req: Request): "riset" | "dokumen" {
  return new URL(req.url).searchParams.get("tipe") === "dokumen"
    ? "dokumen"
    : "riset";
}

async function catatAudit(
  aktorId: string,
  aktorEmail: string | null,
  aksi: string,
  entitas: string,
  entitasId: string | null,
  ip: string,
): Promise<void> {
  try {
    const service = createServiceClient();
    await service.from("pf_audit_logs").insert({
      aktor_id: aktorId,
      aktor_email: aktorEmail,
      aksi,
      entitas,
      entitas_id: entitasId,
      ip,
    });
  } catch {
    // Audit gagal: jangan gagalkan operasi utama.
  }
}

function galatDuplikat(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message.includes("23505") ||
      err.message.includes("duplicate key") ||
      err.message.includes("sudah ada"))
  );
}

function galatTakDitemukan(err: unknown): boolean {
  return err instanceof Error && err.message.includes("PGRST116");
}

export async function GET(req: Request, { params }: Params) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const tipe = tipeDari(req);

  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    return responGalatAdmin(err);
  }
  try {
    const { data, error } = await service
      .from(tipe === "dokumen" ? "pf_documents" : "pf_research_reports")
      .select(tipe === "dokumen" ? KOLOM_DOKUMEN : KOLOM_RISET)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Tidak ditemukan." },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      [tipe === "dokumen" ? "dokumen" : "riset"]: data,
    });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function PATCH(req: Request, { params }: Params) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.WRITER);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const tipe = tipeDari(req);
  const ip = ipDariRequest(req);

  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const diizinkan = (tipe === "dokumen" ? FIELD_DOKUMEN : FIELD_RISET) as readonly string[];
  const takDikenal = Object.keys(body).filter((k) => !diizinkan.includes(k));
  if (takDikenal.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Field tidak diizinkan: ${takDikenal.join(", ")}.` },
      { status: 400 },
    );
  }
  if (Object.keys(body).length === 0) {
    return NextResponse.json(
      { ok: false, error: "Tidak ada perubahan yang diberikan." },
      { status: 400 },
    );
  }

  // Validasi nilai sebelum update.
  const patch: Record<string, unknown> = {};
  if (tipe === "riset") {
    if (body.slug !== undefined) {
      const slug = teks(body.slug);
      if (!slug || !POLA_SLUG.test(slug)) {
        return NextResponse.json(
          { ok: false, error: "Slug tidak valid (huruf kecil, angka, dan tanda -)." },
          { status: 400 },
        );
      }
      patch.slug = slug;
    }
    if (body.judul !== undefined) {
      const judul = teks(body.judul);
      if (!judul) {
        return NextResponse.json(
          { ok: false, error: "Judul laporan tidak boleh kosong." },
          { status: 400 },
        );
      }
      patch.judul = judul;
    }
    for (const f of ["ringkasan", "isi", "metodologi", "penerbit"] as const) {
      if (body[f] !== undefined) patch[f] = teks(body[f]);
    }
    if (body.tanggal !== undefined) {
      if (
        body.tanggal !== null &&
        (typeof body.tanggal !== "string" || !POLA_TANGGAL.test(body.tanggal))
      ) {
        return NextResponse.json(
          { ok: false, error: "Tanggal tidak valid (format YYYY-MM-DD)." },
          { status: 400 },
        );
      }
      patch.tanggal = body.tanggal;
    }
    if (body.status !== undefined) {
      if (body.status !== "draft" && body.status !== "terbit") {
        return NextResponse.json(
          { ok: false, error: "Status harus 'draft' atau 'terbit'." },
          { status: 400 },
        );
      }
      patch.status = body.status;
    }
  } else {
    if (body.jenis !== undefined) {
      if (
        typeof body.jenis !== "string" ||
        !(JENIS_DOKUMEN as readonly string[]).includes(body.jenis)
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: `Jenis tidak valid. Jenis yang tersedia: ${JENIS_DOKUMEN.join(", ")}.`,
          },
          { status: 400 },
        );
      }
      patch.jenis = body.jenis;
    }
    if (body.judul !== undefined) {
      const judul = teks(body.judul);
      if (!judul) {
        return NextResponse.json(
          { ok: false, error: "Judul dokumen tidak boleh kosong." },
          { status: 400 },
        );
      }
      patch.judul = judul;
    }
    for (const f of ["penerbit", "kategori"] as const) {
      if (body[f] !== undefined) patch[f] = teks(body[f]);
    }
    if (body.url_sumber !== undefined) {
      const url = teks(body.url_sumber);
      if (url && !/^https?:\/\//i.test(url)) {
        return NextResponse.json(
          { ok: false, error: "URL sumber harus diawali http:// atau https://." },
          { status: 400 },
        );
      }
      patch.url_sumber = url;
    }
    if (body.tanggal !== undefined) {
      if (
        body.tanggal !== null &&
        (typeof body.tanggal !== "string" || !POLA_TANGGAL.test(body.tanggal))
      ) {
        return NextResponse.json(
          { ok: false, error: "Tanggal tidak valid (format YYYY-MM-DD)." },
          { status: 400 },
        );
      }
      patch.tanggal = body.tanggal;
    }
    if (body.metadata !== undefined) {
      if (
        body.metadata !== null &&
        (typeof body.metadata !== "object" || Array.isArray(body.metadata))
      ) {
        return NextResponse.json(
          { ok: false, error: "Metadata harus berupa objek JSON." },
          { status: 400 },
        );
      }
      patch.metadata = body.metadata ?? {};
    }
    if (body.status !== undefined) {
      if (body.status !== "draft" && body.status !== "terbit") {
        return NextResponse.json(
          { ok: false, error: "Status harus 'draft' atau 'terbit'." },
          { status: 400 },
        );
      }
      patch.status = body.status;
    }
  }

  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    return responGalatAdmin(err);
  }
  try {
    const { data, error } = await service
      .from(tipe === "dokumen" ? "pf_documents" : "pf_research_reports")
      .update(patch)
      .eq("id", id)
      .select(tipe === "dokumen" ? KOLOM_DOKUMEN : KOLOM_RISET)
      .maybeSingle();
    if (error) {
      if (galatDuplikat(error)) {
        return NextResponse.json(
          { ok: false, error: "Slug sudah dipakai laporan lain." },
          { status: 409 },
        );
      }
      throw error;
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Tidak ditemukan." },
        { status: 404 },
      );
    }
    await catatAudit(
      auth.user.id,
      auth.user.email ?? null,
      "riset.ubah",
      tipe === "dokumen" ? "pf_documents" : "pf_research_reports",
      id,
      ip,
    );
    return NextResponse.json({
      ok: true,
      [tipe === "dokumen" ? "dokumen" : "riset"]: data,
    });
  } catch (err) {
    if (galatTakDitemukan(err)) {
      return NextResponse.json(
        { ok: false, error: "Tidak ditemukan." },
        { status: 404 },
      );
    }
    return responGalatAdmin(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const tipe = tipeDari(req);
  const ip = ipDariRequest(req);

  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    return responGalatAdmin(err);
  }
  try {
    // Pastikan baris ada dulu agar DELETE baris tak ada menjawab 404
    // jujur (bukan "berhasil" palsu).
    const { data: ada, error: errAda } = await service
      .from(tipe === "dokumen" ? "pf_documents" : "pf_research_reports")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (errAda) throw errAda;
    if (!ada) {
      return NextResponse.json(
        { ok: false, error: "Tidak ditemukan." },
        { status: 404 },
      );
    }
    const { error } = await service
      .from(tipe === "dokumen" ? "pf_documents" : "pf_research_reports")
      .delete()
      .eq("id", id);
    if (error) throw error;
    await catatAudit(
      auth.user.id,
      auth.user.email ?? null,
      "riset.hapus",
      tipe === "dokumen" ? "pf_documents" : "pf_research_reports",
      id,
      ip,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
