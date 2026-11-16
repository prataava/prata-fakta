// /api/admin/data/[id]
// GET — detail indikator + titik datanya (staf).
// PATCH — ubah indikator (editor/writer). Slug TIDAK bisa diubah
//   (tautan dataset laporan riset bergantung padanya).
// DELETE — hapus indikator (editor; titik data ikut terhapus via
//   ON DELETE CASCADE — dikonfirmasi di halaman admin).
// POST — tambah titik data (editor/writer): upsert berdasarkan
//   (indikator_id, tanggal) — tanggal yang sama DIPERBARUI,
//   bukan diduplikasi.
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
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

type Params = { params: Promise<{ id: string }> };

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

const KATEGORI_VALID = [
  "nasional",
  "global",
  "penduduk",
  "pendidikan",
  "ekonomi",
  "energi",
  "lingkungan",
] as const;

const KOLOM_INDIKATOR =
  "id, nama, slug, kategori, satuan, sumber_nama, sumber_url, metodologi, tanggal_pembaruan, ringkasan_tren, cakupan, frekuensi_update, negara_kode";

const FIELD_PATCH = [
  "nama",
  "kategori",
  "satuan",
  "sumber_nama",
  "sumber_url",
  "metodologi",
  "tanggal_pembaruan",
  "cakupan",
  "frekuensi_update",
  "negara_kode",
] as const;

function teks(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
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

export async function GET(req: Request, { params }: Params) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    return responGalatAdmin(err);
  }
  try {
    const { data: indikator, error: errInd } = await service
      .from("pf_data_indicators")
      .select(KOLOM_INDIKATOR)
      .eq("id", id)
      .maybeSingle();
    if (errInd) throw errInd;
    if (!indikator) {
      return NextResponse.json(
        { ok: false, error: "Indikator tidak ditemukan." },
        { status: 404 },
      );
    }
    const { data: titik, error: errTitik } = await service
      .from("pf_data_points")
      .select("id, tanggal, nilai")
      .eq("indikator_id", id)
      .order("tanggal", { ascending: false })
      .limit(500);
    if (errTitik) throw errTitik;
    return NextResponse.json({
      ok: true,
      indikator,
      titik: titik ?? [],
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
  const ip = ipDariRequest(req);

  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const takDikenal = Object.keys(body).filter(
    (k) => !(FIELD_PATCH as readonly string[]).includes(k),
  );
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

  const patch: Record<string, unknown> = {};
  if (body.nama !== undefined) {
    const nama = teks(body.nama);
    if (!nama) {
      return NextResponse.json(
        { ok: false, error: "Nama indikator tidak boleh kosong." },
        { status: 400 },
      );
    }
    patch.nama = nama;
  }
  if (body.kategori !== undefined) {
    if (
      typeof body.kategori !== "string" ||
      !(KATEGORI_VALID as readonly string[]).includes(body.kategori)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: `Kategori tidak valid. Kategori yang tersedia: ${KATEGORI_VALID.join(", ")}.`,
        },
        { status: 400 },
      );
    }
    patch.kategori = body.kategori;
  }
  if (body.sumber_nama !== undefined) {
    const sumberNama = teks(body.sumber_nama);
    if (!sumberNama) {
      return NextResponse.json(
        { ok: false, error: "Nama sumber tidak boleh kosong." },
        { status: 400 },
      );
    }
    patch.sumber_nama = sumberNama;
  }
  if (body.sumber_url !== undefined) {
    const url = teks(body.sumber_url);
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json(
        { ok: false, error: "URL sumber harus diawali http:// atau https://." },
        { status: 400 },
      );
    }
    patch.sumber_url = url;
  }
  for (const f of ["satuan", "metodologi", "frekuensi_update"] as const) {
    if (body[f] !== undefined) patch[f] = teks(body[f]);
  }
  if (body.tanggal_pembaruan !== undefined) {
    if (
      body.tanggal_pembaruan !== null &&
      (typeof body.tanggal_pembaruan !== "string" ||
        !POLA_TANGGAL.test(body.tanggal_pembaruan))
    ) {
      return NextResponse.json(
        { ok: false, error: "Tanggal pembaruan tidak valid (format YYYY-MM-DD)." },
        { status: 400 },
      );
    }
    patch.tanggal_pembaruan = body.tanggal_pembaruan;
  }
  if (body.cakupan !== undefined) {
    if (body.cakupan !== "indonesia" && body.cakupan !== "dunia") {
      return NextResponse.json(
        { ok: false, error: "Cakupan harus 'indonesia' atau 'dunia'." },
        { status: 400 },
      );
    }
    patch.cakupan = body.cakupan;
  }
  if (body.negara_kode !== undefined) {
    const kode = teks(body.negara_kode);
    if (kode && !/^[A-Za-z]{2}$/.test(kode)) {
      return NextResponse.json(
        { ok: false, error: "Kode negara harus 2 huruf (ISO-2, contoh: ID)." },
        { status: 400 },
      );
    }
    patch.negara_kode = kode ? kode.toUpperCase() : null;
  }

  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    return responGalatAdmin(err);
  }
  try {
    const { data, error } = await service
      .from("pf_data_indicators")
      .update(patch)
      .eq("id", id)
      .select(KOLOM_INDIKATOR)
      .maybeSingle();
    if (error) {
      if (
        error.message.includes("pf_data_indicators_negara_kode_fkey") ||
        error.message.includes("violates foreign key")
      ) {
        return NextResponse.json(
          { ok: false, error: "Kode negara belum terdaftar di tabel negara." },
          { status: 400 },
        );
      }
      throw error;
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Indikator tidak ditemukan." },
        { status: 404 },
      );
    }
    await catatAudit(
      auth.user.id,
      auth.user.email ?? null,
      "data.indikator",
      "pf_data_indicators",
      id,
      ip,
    );
    return NextResponse.json({ ok: true, indikator: data });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const ip = ipDariRequest(req);

  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    return responGalatAdmin(err);
  }
  try {
    const { data: ada, error: errAda } = await service
      .from("pf_data_indicators")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (errAda) throw errAda;
    if (!ada) {
      return NextResponse.json(
        { ok: false, error: "Indikator tidak ditemukan." },
        { status: 404 },
      );
    }
    const { error } = await service
      .from("pf_data_indicators")
      .delete()
      .eq("id", id);
    if (error) throw error;
    await catatAudit(
      auth.user.id,
      auth.user.email ?? null,
      "data.indikator",
      "pf_data_indicators",
      id,
      ip,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function POST(req: Request, { params }: Params) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.WRITER);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const ip = ipDariRequest(req);

  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const tanggal = body.tanggal;
  if (typeof tanggal !== "string" || !POLA_TANGGAL.test(tanggal)) {
    return NextResponse.json(
      { ok: false, error: "Tanggal tidak valid (format YYYY-MM-DD)." },
      { status: 400 },
    );
  }
  const nilai =
    typeof body.nilai === "number"
      ? body.nilai
      : typeof body.nilai === "string" && body.nilai.trim() !== ""
        ? Number(body.nilai)
        : NaN;
  if (!Number.isFinite(nilai)) {
    return NextResponse.json(
      { ok: false, error: "Nilai harus berupa angka." },
      { status: 400 },
    );
  }

  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    return responGalatAdmin(err);
  }
  try {
    const { data: ada, error: errAda } = await service
      .from("pf_data_indicators")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (errAda) throw errAda;
    if (!ada) {
      return NextResponse.json(
        { ok: false, error: "Indikator tidak ditemukan." },
        { status: 404 },
      );
    }
    const { data, error } = await service
      .from("pf_data_points")
      .upsert(
        { indikator_id: id, tanggal, nilai },
        { onConflict: "indikator_id,tanggal" },
      )
      .select("id, tanggal, nilai")
      .single();
    if (error) throw error;
    await catatAudit(
      auth.user.id,
      auth.user.email ?? null,
      "data.titik",
      "pf_data_points",
      (data as { id: string }).id,
      ip,
    );
    return NextResponse.json({ ok: true, titik: data }, { status: 201 });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
