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
  cekOrigin,
  ipDariRequest,
  responBodyTakValid,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { catatAuditWajib, responGalatAudit } from "@/lib/admin/audit";
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
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
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
    // Baris lama dibaca SEBELUM update — dipakai sebagai `sebelum`
    // audit dan sebagai bahan compensating restore bila audit gagal.
    const kolomLama = tipe === "dokumen" ? KOLOM_DOKUMEN : KOLOM_RISET;
    const { data: lama, error: errLama } = await service
      .from(tipe === "dokumen" ? "pf_documents" : "pf_research_reports")
      .select(kolomLama)
      .eq("id", id)
      .maybeSingle();
    if (errLama) throw errLama;
    if (!lama) {
      return NextResponse.json(
        { ok: false, error: "Tidak ditemukan." },
        { status: 404 },
      );
    }
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
    // Audit FAIL-CLOSED (Gelombang B1, P1-3/B-T2/S-16): gagal
    // catat -> operasi ditolak + compensating restore nilai lama
    // (lihat catatan yang sama di pengetahuan/route.ts POST).
    // Atomicity penuh (transaksi/RPC) adalah follow-up migrasi.
    try {
      await catatAuditWajib({
        aktor_id: auth.user.id,
        aktor_email: auth.user.email ?? null,
        aksi: "riset.ubah",
        entitas: tipe === "dokumen" ? "pf_documents" : "pf_research_reports",
        entitas_id: id,
        sebelum: lama,
        sesudah: data,
        ip,
      });
    } catch (errAudit) {
      const lamaObj = lama as unknown as Record<string, unknown>;
      const kolomPulih =
        tipe === "dokumen"
          ? ["jenis", "judul", "penerbit", "tanggal", "url_sumber", "kategori", "metadata", "status"]
          : ["slug", "judul", "ringkasan", "isi", "metodologi", "penerbit", "tanggal", "status"];
      const pulih: Record<string, unknown> = {};
      for (const k of kolomPulih) pulih[k] = lamaObj[k] ?? null;
      const { error: errPulih } = await service
        .from(tipe === "dokumen" ? "pf_documents" : "pf_research_reports")
        .update(pulih)
        .eq("id", id);
      if (errPulih) {
        console.error(
          JSON.stringify({
            event: "audit_compensating_restore_gagal",
            waktu: new Date().toISOString(),
            rute: "admin/riset/[id]",
            entitas_id: id,
            pesan: errPulih.message,
          }),
        );
      }
      return responGalatAudit(errAudit);
    }
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
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
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
    // Baris lama dibaca SEBELUM hapus — dipakai sebagai `sebelum`
    // audit dan sebagai bahan compensating re-insert bila audit gagal.
    const kolomLama = tipe === "dokumen" ? KOLOM_DOKUMEN : KOLOM_RISET;
    const { data: lama, error: errLama } = await service
      .from(tipe === "dokumen" ? "pf_documents" : "pf_research_reports")
      .select(kolomLama)
      .eq("id", id)
      .maybeSingle();
    if (errLama) throw errLama;
    if (!lama) {
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
    // Audit FAIL-CLOSED (Gelombang B1, P1-3/B-T2/S-16): gagal
    // catat -> operasi ditolak + compensating re-insert baris lama
    // (dengan id yang sama). Atomicity penuh (transaksi/RPC)
    // adalah follow-up migrasi.
    try {
      await catatAuditWajib({
        aktor_id: auth.user.id,
        aktor_email: auth.user.email ?? null,
        aksi: "riset.hapus",
        entitas: tipe === "dokumen" ? "pf_documents" : "pf_research_reports",
        entitas_id: id,
        sebelum: lama,
        sesudah: null,
        ip,
      });
    } catch (errAudit) {
      // Re-insert memakai objek per tipe (bukan `lama` mentah):
      // `lama` adalah gabungan dua tipe baris (riset punya
      // diperbarui_pada, dokumen tidak) sehingga insert langsung
      // ditolak pemeriksa tipe.
      const lamaObj = lama as unknown as Record<string, unknown>;
      const pulihBaris: Record<string, unknown> = { id: lamaObj.id };
      for (const k of (
        tipe === "dokumen"
          ? ["jenis", "judul", "penerbit", "tanggal", "url_sumber", "kategori", "metadata", "status", "dibuat_pada"]
          : ["slug", "judul", "ringkasan", "isi", "metodologi", "penerbit", "tanggal", "status", "dibuat_pada", "diperbarui_pada"]
      ) as string[]) {
        pulihBaris[k] = lamaObj[k] ?? null;
      }
      const { error: errPulih } = await service
        .from(tipe === "dokumen" ? "pf_documents" : "pf_research_reports")
        .insert(pulihBaris as never);
      if (errPulih) {
        console.error(
          JSON.stringify({
            event: "audit_compensating_reinsert_gagal",
            waktu: new Date().toISOString(),
            rute: "admin/riset/[id]",
            entitas_id: id,
            pesan: errPulih.message,
          }),
        );
      }
      return responGalatAudit(errAudit);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
