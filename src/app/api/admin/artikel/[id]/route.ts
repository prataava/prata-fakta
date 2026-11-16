// /api/admin/artikel/[id]
// GET — detail artikel + verifikasi/review/versi terakhir (staf).
// PATCH — ubah artikel (editor/super_admin/writer; writer HANYA bila
//   penulis_id == user.id — dicek di route ini).
// DELETE — hapus artikel (editor/super_admin; aturan hapus — hanya
//   draft/diarsipkan — ditegakkan editorial.ts).
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
import {
  hapusArtikel,
  perbaruiArtikel,
} from "@/lib/admin/editorial";
import { ROLES } from "@/lib/auth/roles";
import type { ArtikelPatch } from "@/lib/admin/types";

const lolosRateLimit = buatRateLimiterAdmin();

type Params = { params: Promise<{ id: string }> };

const FIELD_PATCH = [
  "judul",
  "subjudul",
  "ringkasan",
  "isi",
  "kategori_slug",
  "subkategori_slug",
  // Tahap C-5 (v15): isu artikel.
  "isu",
  "penulis_nama",
  "sumber_url",
  "gambar_url",
  "estimasi_baca_menit",
  "kronologi",
  "fakta_penting",
  "data_pendukung",
  "mengapa_penting",
  "dampak",
  "belum_diketahui",
  "catatan_versi",
] as const;

export async function GET(req: Request, { params }: Params) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    const adapter = buatAdminAdapter();
    const artikel = await adapter.getArtikel({ id });
    if (!artikel) {
      return NextResponse.json(
        { ok: false, error: "Artikel tidak ditemukan." },
        { status: 404 },
      );
    }
    const [verifikasi_terakhir, review_terakhir, versi_terakhir] =
      await Promise.all([
        adapter.getVerifikasiTerakhir({ artikel_id: id }),
        adapter.getReviewTerakhir({ artikel_id: id }),
        adapter.getVersiTerakhir({ artikel_id: id }),
      ]);
    return NextResponse.json({
      ok: true,
      artikel,
      verifikasi_terakhir,
      review_terakhir,
      versi_terakhir,
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
    // Writer hanya boleh mengubah artikelnya sendiri.
    if (
      auth.roles.includes(ROLES.WRITER) &&
      !auth.roles.includes(ROLES.EDITOR) &&
      !auth.roles.includes(ROLES.SUPER_ADMIN)
    ) {
      const artikel = await adapter.getArtikel({ id });
      if (!artikel) {
        return NextResponse.json(
          { ok: false, error: "Artikel tidak ditemukan." },
          { status: 404 },
        );
      }
      if (artikel.penulis_id !== auth.user.id) {
        return NextResponse.json(
          {
            ok: false,
            error: "Penulis hanya boleh mengubah artikelnya sendiri.",
          },
          { status: 403 },
        );
      }
    }
    const artikel = await perbaruiArtikel(
      adapter,
      id,
      body as unknown as ArtikelPatch,
      { id: auth.user.id, email: auth.user.email ?? null, ip: ipDariRequest(req) },
    );
    return NextResponse.json({ ok: true, artikel });
  } catch (err) {
    if (err instanceof Error && err.message === "Artikel tidak ditemukan.") {
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
    await hapusArtikel(adapter, id, {
      id: auth.user.id,
      email: auth.user.email ?? null,
      ip: ipDariRequest(req),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Artikel tidak ditemukan.") {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 404 },
      );
    }
    return responGalatAdmin(err);
  }
}
