// /api/admin/data
// GET — daftar indikator + kolom v10 (staf; service role).
// POST — buat indikator baru (editor/writer). Kategori WAJIB salah
//   satu dari 7 nilai CHECK v6; cakupan WAJIB 'indonesia'/'dunia'
//   (CHECK v10); sumber_nama wajib (NOT NULL).
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
import { buatSlug } from "@/lib/ai/slug";
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

const POLA_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
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

function galatDuplikat(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message.includes("23505") ||
      err.message.includes("duplicate key") ||
      err.message.includes("sudah ada"))
  );
}

export async function GET(req: Request) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    return responGalatAdmin(err);
  }
  try {
    const { data, error } = await service
      .from("pf_data_indicators")
      .select(KOLOM_INDIKATOR)
      .order("nama", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ ok: true, indikator: data ?? [] });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function POST(req: Request) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.WRITER);
  if (auth instanceof NextResponse) return auth;

  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const ip = ipDariRequest(req);

  const nama = teks(body.nama);
  if (!nama) {
    return NextResponse.json(
      { ok: false, error: "Nama indikator wajib diisi." },
      { status: 400 },
    );
  }
  const sumberNama = teks(body.sumber_nama);
  if (!sumberNama) {
    return NextResponse.json(
      { ok: false, error: "Nama sumber wajib diisi." },
      { status: 400 },
    );
  }
  const kategori =
    typeof body.kategori === "string" &&
    (KATEGORI_VALID as readonly string[]).includes(body.kategori)
      ? body.kategori
      : null;
  if (!kategori) {
    return NextResponse.json(
      {
        ok: false,
        error: `Kategori tidak valid. Kategori yang tersedia: ${KATEGORI_VALID.join(", ")}.`,
      },
      { status: 400 },
    );
  }
  const slugMentah = teks(body.slug);
  const slug = slugMentah ?? buatSlug(nama);
  if (!POLA_SLUG.test(slug)) {
    return NextResponse.json(
      { ok: false, error: "Slug tidak valid (huruf kecil, angka, dan tanda -)." },
      { status: 400 },
    );
  }
  const cakupan =
    body.cakupan === "dunia" ? "dunia" : "indonesia";
  const sumberUrl = teks(body.sumber_url);
  if (sumberUrl && !/^https?:\/\//i.test(sumberUrl)) {
    return NextResponse.json(
      { ok: false, error: "URL sumber harus diawali http:// atau https://." },
      { status: 400 },
    );
  }
  const tanggalPembaruan =
    body.tanggal_pembaruan === null || body.tanggal_pembaruan === undefined || body.tanggal_pembaruan === ""
      ? null
      : body.tanggal_pembaruan;
  if (
    tanggalPembaruan !== null &&
    (typeof tanggalPembaruan !== "string" ||
      !POLA_TANGGAL.test(tanggalPembaruan))
  ) {
    return NextResponse.json(
      { ok: false, error: "Tanggal pembaruan tidak valid (format YYYY-MM-DD)." },
      { status: 400 },
    );
  }
  const negaraKode = teks(body.negara_kode);
  if (negaraKode && !/^[A-Za-z]{2}$/.test(negaraKode)) {
    return NextResponse.json(
      { ok: false, error: "Kode negara harus 2 huruf (ISO-2, contoh: ID)." },
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
    const { data, error } = await service
      .from("pf_data_indicators")
      .insert({
        nama,
        slug,
        kategori,
        satuan: teks(body.satuan),
        sumber_nama: sumberNama,
        sumber_url: sumberUrl,
        metodologi: teks(body.metodologi),
        tanggal_pembaruan: tanggalPembaruan,
        cakupan,
        frekuensi_update: teks(body.frekuensi_update),
        negara_kode: negaraKode ? negaraKode.toUpperCase() : null,
      })
      .select(KOLOM_INDIKATOR)
      .single();
    if (error) {
      if (galatDuplikat(error)) {
        return NextResponse.json(
          { ok: false, error: `Slug "${slug}" sudah dipakai indikator lain.` },
          { status: 409 },
        );
      }
      if (
        error.message.includes("pf_data_indicators_negara_kode_fkey") ||
        error.message.includes("violates foreign key")
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: `Kode negara "${negaraKode}" belum terdaftar di tabel negara.`,
          },
          { status: 400 },
        );
      }
      throw error;
    }
    await catatAudit(
      auth.user.id,
      auth.user.email ?? null,
      "data.indikator",
      "pf_data_indicators",
      (data as { id: string }).id,
      ip,
    );
    return NextResponse.json({ ok: true, indikator: data }, { status: 201 });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
