// /api/admin/sistem/kategori/[id]
// PATCH — ubah kategori (editor/super_admin; slug tidak bisa diubah).
// DELETE — hapus kategori (editor/super_admin; hanya bila tidak
// dipakai artikel — ditolak dengan alasan bila dipakai).
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
import { hapusKategori, perbaruiKategori } from "@/lib/admin/editorial";
import { ROLES } from "@/lib/auth/roles";
import type { KategoriPatch } from "@/lib/admin/types";

const lolosRateLimit = buatRateLimiterAdmin();

type Params = { params: Promise<{ id: string }> };

const FIELD_PATCH = ["nama", "deskripsi", "induk_id", "urutan", "aktif"] as const;

export async function PATCH(req: Request, { params }: Params) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req, ROLES.EDITOR);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

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

  try {
    const adapter = buatAdminAdapter();
    const hasil = await perbaruiKategori(
      adapter,
      { id, patch: body as unknown as KategoriPatch },
      { id: auth.user.id, email: auth.user.email ?? null, ip: ipDariRequest(req) },
    );
    const kategori = (await adapter.listKategori()).find((k) => k.id === id);
    return NextResponse.json({ ok: true, ...hasil, kategori });
  } catch (err) {
    if (err instanceof Error && err.message === "Kategori tidak ditemukan.") {
      return NextResponse.json(
        { ok: false, error: err.message },
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

  try {
    const adapter = buatAdminAdapter();
    await hapusKategori(adapter, id, {
      id: auth.user.id,
      email: auth.user.email ?? null,
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Kategori tidak ditemukan.") {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 404 },
      );
    }
    return responGalatAdmin(err);
  }
}
