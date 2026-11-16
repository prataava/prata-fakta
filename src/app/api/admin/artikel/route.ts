// GET /api/admin/artikel — daftar artikel (staf; filter status,
// kategori, q, page, limit).
// POST /api/admin/artikel — buat artikel baru (editor/writer/
// super_admin). Status awal selalu 'draft' (aturan di editorial.ts).
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
import { buatAdminAdapter } from "@/lib/admin/supabase-adapter";
import { buatArtikel } from "@/lib/admin/editorial";
import { ROLES } from "@/lib/auth/roles";
import type { ArtikelInput, StatusArtikel } from "@/lib/admin/types";

const lolosRateLimit = buatRateLimiterAdmin();

const STATUS_VALID: StatusArtikel[] = ["draft", "terbit", "terjadwal", "diarsipkan"];

export async function GET(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  if (status && !STATUS_VALID.includes(status as StatusArtikel)) {
    return NextResponse.json(
      { ok: false, error: "Status tidak valid." },
      { status: 400 },
    );
  }
  const page = Number(url.searchParams.get("page") ?? "1") || 1;
  const limit = Number(url.searchParams.get("limit") ?? "20") || 20;

  try {
    const adapter = buatAdminAdapter();
    const hasil = await adapter.listArtikel({
      status: status as StatusArtikel | undefined,
      kategori: url.searchParams.get("kategori") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      page,
      limit,
    });
    return NextResponse.json({ ok: true, ...hasil });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function POST(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.WRITER);
  if (auth instanceof NextResponse) return auth;

  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();

  const input: ArtikelInput = {
    judul: typeof body.judul === "string" ? body.judul : "",
    slug: "",
    subjudul:
      typeof body.subjudul === "string" ? body.subjudul : null,
    ringkasan: typeof body.ringkasan === "string" ? body.ringkasan : "",
    isi: typeof body.isi === "string" ? body.isi : "",
    kategori_slug:
      typeof body.kategori_slug === "string" ? body.kategori_slug : "",
    subkategori_slug:
      typeof body.subkategori_slug === "string"
        ? body.subkategori_slug
        : null,
    penulis_nama:
      typeof body.penulis_nama === "string" ? body.penulis_nama : null,
    penulis_id: auth.user.id,
    sumber_url:
      typeof body.sumber_url === "string" ? body.sumber_url : null,
    gambar_url:
      typeof body.gambar_url === "string" ? body.gambar_url : null,
    estimasi_baca_menit:
      typeof body.estimasi_baca_menit === "number"
        ? body.estimasi_baca_menit
        : null,
    kronologi: Array.isArray(body.kronologi) ? body.kronologi : [],
    fakta_penting: Array.isArray(body.fakta_penting)
      ? body.fakta_penting
      : [],
    data_pendukung: Array.isArray(body.data_pendukung)
      ? body.data_pendukung
      : [],
    mengapa_penting:
      typeof body.mengapa_penting === "string" ? body.mengapa_penting : null,
    dampak: typeof body.dampak === "string" ? body.dampak : null,
    belum_diketahui:
      typeof body.belum_diketahui === "string"
        ? body.belum_diketahui
        : null,
    // Tahap C-5 (v15): isu artikel (opsional, maks 120 karakter).
    isu: typeof body.isu === "string" ? body.isu : null,
  };

  try {
    const adapter = buatAdminAdapter();
    const artikel = await buatArtikel(adapter, input, {
      id: auth.user.id,
      email: auth.user.email ?? null,
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true, artikel }, { status: 201 });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
