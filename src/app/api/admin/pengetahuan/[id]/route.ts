// GET / PATCH / DELETE /api/admin/pengetahuan/[id] (staf).
// PATCH memakai validasi yang sama dengan POST di route.ts
// (disalin agar tiap berkas route mandiri, pola repo).
// Hapus artikel juga menghapusnya dari halaman publik —
// artikel yang sudah dirujuk pelajaran akademi tidak ikut
// terhapus (FK artikel_id di pf_course_lessons = SET NULL).
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
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

const TOPIK_VALID = [
  "sejarah",
  "geografi",
  "negara",
  "sains",
  "teknologi",
  "ekonomi",
  "alam",
  "tubuh",
  "umum",
] as const;

const POLA_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;
const POLA_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KOLOM_ADMIN =
  "id, slug, judul, ringkasan, isi, topik, referensi, status, harian_tanggal, penulis_nama, jenis, tingkat, estimasi_baca_menit, seri_slug, dibuat_pada, diperbarui_pada";

function stringAtauNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Validasi parsial untuk PATCH (hanya field yang dikirim). */
function validasiPatch(
  body: Record<string, unknown>,
):
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string } {
  const data: Record<string, unknown> = {};
  if (body.judul !== undefined) {
    if (typeof body.judul !== "string" || body.judul.trim() === "") {
      return { ok: false, error: "Judul wajib diisi." };
    }
    if (body.judul.trim().length > 200) {
      return { ok: false, error: "Judul maksimal 200 karakter." };
    }
    data.judul = body.judul.trim();
  }
  if (body.slug !== undefined) {
    if (typeof body.slug !== "string" || !POLA_SLUG.test(body.slug)) {
      return {
        ok: false,
        error: "Slug tidak valid (huruf kecil, angka, dan tanda -).",
      };
    }
    data.slug = body.slug;
  }
  if (body.topik !== undefined) {
    if (
      typeof body.topik !== "string" ||
      !(TOPIK_VALID as readonly string[]).includes(body.topik)
    ) {
      return { ok: false, error: "Topik tidak valid." };
    }
    data.topik = body.topik;
  }
  if (body.ringkasan !== undefined) data.ringkasan = stringAtauNull(body.ringkasan);
  if (body.isi !== undefined) data.isi = stringAtauNull(body.isi);
  if (body.referensi !== undefined) {
    if (!Array.isArray(body.referensi) || body.referensi.length > 50) {
      return { ok: false, error: "Referensi harus array maksimal 50 entri." };
    }
    const referensi: { judul: string | null; url: string | null }[] = [];
    for (const r of body.referensi as unknown[]) {
      if (!r || typeof r !== "object" || Array.isArray(r)) {
        return { ok: false, error: "Entri referensi tidak valid." };
      }
      const o = r as Record<string, unknown>;
      const judul = stringAtauNull(o.judul);
      const url = stringAtauNull(o.url);
      if (url && !/^https?:\/\/.+/i.test(url)) {
        return { ok: false, error: "URL referensi harus diawali http(s)://." };
      }
      if (!judul && !url) continue;
      referensi.push({ judul, url });
    }
    data.referensi = referensi;
  }
  if (body.status !== undefined) {
    if (body.status !== "draft" && body.status !== "terbit") {
      return { ok: false, error: "Status harus draft atau terbit." };
    }
    data.status = body.status;
  }
  if (body.harian_tanggal !== undefined) {
    if (body.harian_tanggal === null) {
      data.harian_tanggal = null;
    } else if (
      typeof body.harian_tanggal === "string" &&
      POLA_TANGGAL.test(body.harian_tanggal)
    ) {
      data.harian_tanggal = body.harian_tanggal;
    } else {
      return { ok: false, error: "harian_tanggal harus format YYYY-MM-DD." };
    }
  }
  if (body.penulis_nama !== undefined) {
    data.penulis_nama = stringAtauNull(body.penulis_nama);
  }
  if (body.jenis !== undefined) {
    if (body.jenis !== "artikel" && body.jenis !== "explainer") {
      return { ok: false, error: "Jenis harus artikel atau explainer." };
    }
    data.jenis = body.jenis;
  }
  if (body.tingkat !== undefined) {
    if (
      body.tingkat !== "pemula" &&
      body.tingkat !== "menengah" &&
      body.tingkat !== "mendalam"
    ) {
      return { ok: false, error: "Tingkat tidak valid." };
    }
    data.tingkat = body.tingkat;
  }
  if (body.estimasi_baca_menit !== undefined) {
    if (body.estimasi_baca_menit === null) {
      data.estimasi_baca_menit = null;
    } else if (
      typeof body.estimasi_baca_menit === "number" &&
      Number.isInteger(body.estimasi_baca_menit) &&
      body.estimasi_baca_menit >= 1 &&
      body.estimasi_baca_menit <= 120
    ) {
      data.estimasi_baca_menit = body.estimasi_baca_menit;
    } else {
      return {
        ok: false,
        error: "Estimasi baca harus bilangan bulat 1 sampai 120 menit.",
      };
    }
  }
  if (body.seri_slug !== undefined) {
    if (body.seri_slug === null) {
      data.seri_slug = null;
    } else if (
      typeof body.seri_slug === "string" &&
      POLA_SLUG.test(body.seri_slug)
    ) {
      data.seri_slug = body.seri_slug;
    } else {
      return { ok: false, error: "seri_slug tidak valid." };
    }
  }
  return { ok: true, data };
}

async function catatAuditPengetahuan(
  service: ReturnType<typeof createServiceClient>,
  aktor: { id: string; email?: string | null },
  aksi: "pengetahuan.ubah" | "pengetahuan.hapus",
  entitasId: string | null,
  sesudah: unknown,
  ip: string | null,
): Promise<void> {
  try {
    await service.from("pf_audit_logs").insert({
      aktor_id: aktor.id,
      aktor_email: aktor.email ?? null,
      aksi,
      entitas: "pengetahuan",
      entitas_id: entitasId,
      sebelum: {},
      sesudah: (sesudah ?? {}) as Record<string, unknown>,
      ip,
    });
  } catch (err) {
    console.error("Audit pengetahuan gagal:", err);
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!POLA_UUID.test(id)) {
    return NextResponse.json(
      { ok: false, error: "ID tidak valid." },
      { status: 400 },
    );
  }
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("pf_knowledge_articles")
      .select(KOLOM_ADMIN)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Artikel tidak ditemukan." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, artikel: data });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.WRITER);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!POLA_UUID.test(id)) {
    return NextResponse.json(
      { ok: false, error: "ID tidak valid." },
      { status: 400 },
    );
  }
  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const valid = validasiPatch(body);
  if (!valid.ok) {
    return NextResponse.json(
      { ok: false, error: valid.error },
      { status: 400 },
    );
  }
  if (Object.keys(valid.data).length === 0) {
    return NextResponse.json(
      { ok: false, error: "Tidak ada field yang diubah." },
      { status: 400 },
    );
  }
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("pf_knowledge_articles")
      .update(valid.data)
      .eq("id", id)
      .select(KOLOM_ADMIN)
      .maybeSingle();
    if (error) {
      const kode = (error as { code?: string }).code;
      if (kode === "23505") {
        return NextResponse.json(
          { ok: false, error: "Slug atau tanggal harian sudah dipakai." },
          { status: 409 },
        );
      }
      throw error;
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Artikel tidak ditemukan." },
        { status: 404 },
      );
    }
    await catatAuditPengetahuan(
      service,
      auth.user,
      "pengetahuan.ubah",
      id,
      data,
      ipDariRequest(req),
    );
    return NextResponse.json({ ok: true, artikel: data });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  if (!POLA_UUID.test(id)) {
    return NextResponse.json(
      { ok: false, error: "ID tidak valid." },
      { status: 400 },
    );
  }
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("pf_knowledge_articles")
      .delete()
      .eq("id", id)
      .select("id, slug, judul")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Artikel tidak ditemukan." },
        { status: 404 },
      );
    }
    await catatAuditPengetahuan(
      service,
      auth.user,
      "pengetahuan.hapus",
      id,
      data,
      ipDariRequest(req),
    );
    return NextResponse.json({ ok: true, artikel: data });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
