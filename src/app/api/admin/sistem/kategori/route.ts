// /api/admin/sistem/kategori
// GET — daftar kategori (staf).
// POST — buat kategori (editor/super_admin). Slug dibuat dari nama
// bila tidak diberikan. Rate limit 30/menit/IP.
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
import { buatKategori } from "@/lib/admin/editorial";
import { ROLES } from "@/lib/auth/roles";
import type { KategoriInput } from "@/lib/admin/types";

const lolosRateLimit = buatRateLimiterAdmin();

export async function GET(req: Request) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const adapter = buatAdminAdapter();
    const kategori = await adapter.listKategori();
    return NextResponse.json({ ok: true, kategori });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function POST(req: Request) {
  if (!lolosRateLimit(ipDariRequest(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR);
  if (auth instanceof NextResponse) return auth;

  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const input: KategoriInput = {
    slug: typeof body.slug === "string" ? body.slug : "",
    nama: typeof body.nama === "string" ? body.nama : "",
    deskripsi:
      typeof body.deskripsi === "string" ? body.deskripsi : null,
    induk_id: typeof body.induk_id === "string" ? body.induk_id : null,
    urutan: typeof body.urutan === "number" ? body.urutan : 0,
    aktif: typeof body.aktif === "boolean" ? body.aktif : true,
  };

  try {
    const adapter = buatAdminAdapter();
    const hasil = await buatKategori(adapter, input, {
      id: auth.user.id,
      email: auth.user.email ?? null,
      ip: ipDariRequest(req),
    });
    const kategori = (await adapter.listKategori()).find(
      (k) => k.slug === hasil.slug,
    );
    return NextResponse.json({ ok: true, kategori }, { status: 201 });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
