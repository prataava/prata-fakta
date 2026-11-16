// /api/admin/riset
// GET — daftar laporan riset + dokumen (SEMUA status, staf;
// service role agar draf terlihat).
// POST — buat laporan riset ATAU dokumen (editor/writer).
//   Laporan riset: status awal SELALU 'draft' — nilai status dari
//   body DIABAIKAN (laporan TIDAK auto-terbit; penerbitan manual
//   lewat PATCH status='terbit' sesudah ditinjau).
//   Dokumen: status boleh draft/terbit (default 'terbit', sesuai
//   default kolom migrasi v10).
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
import { buatSlug } from "@/lib/ai/slug";
import { JENIS_DOKUMEN } from "@/lib/riset";
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

const POLA_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

function teks(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function tanggalValid(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !POLA_TANGGAL.test(v)) return "__tak_valid__";
  return v;
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
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    return responGalatAdmin(err);
  }
  const tipe = new URL(req.url).searchParams.get("tipe") ?? undefined;
  try {
    const hasil: Record<string, unknown> = {};
    if (!tipe || tipe === "riset") {
      const { data, error } = await service
        .from("pf_research_reports")
        .select(
          "id, slug, judul, ringkasan, isi, metodologi, penerbit, tanggal, status, dibuat_pada, diperbarui_pada",
        )
        .order("dibuat_pada", { ascending: false })
        .limit(200);
      if (error) throw error;
      hasil.riset = data ?? [];
    }
    if (!tipe || tipe === "dokumen") {
      const { data, error } = await service
        .from("pf_documents")
        .select(
          "id, jenis, judul, penerbit, tanggal, url_sumber, kategori, metadata, status, dibuat_pada",
        )
        .order("dibuat_pada", { ascending: false })
        .limit(200);
      if (error) throw error;
      hasil.dokumen = data ?? [];
    }
    return NextResponse.json({ ok: true, ...hasil });
  } catch (err) {
    return responGalatAdmin(err);
  }
}

export async function POST(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const auth = await autentikasiAdmin(req, ROLES.EDITOR, ROLES.WRITER);
  if (auth instanceof NextResponse) return auth;

  const body = await bacaBody(req);
  if (!body) return responBodyTakValid();
  const tipe = body.tipe === "dokumen" ? "dokumen" : "riset";
  const ip = ipDariRequest(req);

  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    return responGalatAdmin(err);
  }

  try {
    if (tipe === "riset") {
      const judul = teks(body.judul);
      if (!judul) {
        return NextResponse.json(
          { ok: false, error: "Judul laporan wajib diisi." },
          { status: 400 },
        );
      }
      const slugMentah = teks(body.slug);
      const slug = slugMentah ?? buatSlug(judul);
      if (!POLA_SLUG.test(slug)) {
        return NextResponse.json(
          { ok: false, error: "Slug tidak valid (huruf kecil, angka, dan tanda -)." },
          { status: 400 },
        );
      }
      const tanggal = tanggalValid(body.tanggal);
      if (tanggal === "__tak_valid__") {
        return NextResponse.json(
          { ok: false, error: "Tanggal tidak valid (format YYYY-MM-DD)." },
          { status: 400 },
        );
      }
      // Status awal SELALU 'draft' — status dari body diabaikan.
      const { data, error } = await service
        .from("pf_research_reports")
        .insert({
          slug,
          judul,
          ringkasan: teks(body.ringkasan),
          isi: teks(body.isi),
          metodologi: teks(body.metodologi),
          penerbit: teks(body.penerbit),
          tanggal,
          status: "draft",
        })
        .select(
          "id, slug, judul, ringkasan, isi, metodologi, penerbit, tanggal, status, dibuat_pada, diperbarui_pada",
        )
        .single();
      if (error) {
        if (galatDuplikat(error)) {
          return NextResponse.json(
            { ok: false, error: `Slug "${slug}" sudah dipakai laporan lain.` },
            { status: 409 },
          );
        }
        throw error;
      }
      // Audit FAIL-CLOSED (Gelombang B1, P1-3): gagal catat ->
      // operasi ditolak + compensating delete baris yang baru
      // dibuat (lihat catatan yang sama di pengetahuan/route.ts).
      const entitasId = (data as { id: string }).id;
      try {
        await catatAuditWajib({
          aktor_id: auth.user.id,
          aktor_email: auth.user.email ?? null,
          aksi: "riset.buat",
          entitas: "pf_research_reports",
          entitas_id: entitasId,
          ip,
        });
      } catch (errAudit) {
        try {
          await service
            .from("pf_research_reports")
            .delete()
            .eq("id", entitasId);
        } catch (errHapus) {
          console.error(
            JSON.stringify({
              event: "audit_compensating_delete_gagal",
              waktu: new Date().toISOString(),
              rute: "admin/riset",
              entitas_id: entitasId,
              pesan:
                errHapus instanceof Error
                  ? errHapus.message
                  : String(errHapus ?? ""),
            }),
          );
        }
        return responGalatAudit(errAudit);
      }
      return NextResponse.json({ ok: true, riset: data }, { status: 201 });
    }

    // ---- Dokumen ----
    const judul = teks(body.judul);
    if (!judul) {
      return NextResponse.json(
        { ok: false, error: "Judul dokumen wajib diisi." },
        { status: 400 },
      );
    }
    const jenis =
      typeof body.jenis === "string" &&
      (JENIS_DOKUMEN as readonly string[]).includes(body.jenis)
        ? body.jenis
        : null;
    if (!jenis) {
      return NextResponse.json(
        {
          ok: false,
          error: `Jenis tidak valid. Jenis yang tersedia: ${JENIS_DOKUMEN.join(", ")}.`,
        },
        { status: 400 },
      );
    }
    const urlSumber = teks(body.url_sumber);
    if (urlSumber && !/^https?:\/\//i.test(urlSumber)) {
      return NextResponse.json(
        { ok: false, error: "URL sumber harus diawali http:// atau https://." },
        { status: 400 },
      );
    }
    const tanggal = tanggalValid(body.tanggal);
    if (tanggal === "__tak_valid__") {
      return NextResponse.json(
        { ok: false, error: "Tanggal tidak valid (format YYYY-MM-DD)." },
        { status: 400 },
      );
    }
    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {};
    const status =
      body.status === "draft" || body.status === "terbit"
        ? body.status
        : "terbit";
    const { data, error } = await service
      .from("pf_documents")
      .insert({
        jenis,
        judul,
        penerbit: teks(body.penerbit),
        tanggal,
        url_sumber: urlSumber,
        kategori: teks(body.kategori),
        metadata,
        status,
      })
      .select(
        "id, jenis, judul, penerbit, tanggal, url_sumber, kategori, metadata, status, dibuat_pada",
      )
      .single();
    if (error) throw error;
    // Audit FAIL-CLOSED (Gelombang B1, P1-3): gagal catat ->
    // operasi ditolak + compensating delete baris yang baru
    // dibuat (lihat catatan yang sama di pengetahuan/route.ts).
    const entitasId = (data as { id: string }).id;
    try {
      await catatAuditWajib({
        aktor_id: auth.user.id,
        aktor_email: auth.user.email ?? null,
        aksi: "riset.buat",
        entitas: "pf_documents",
        entitas_id: entitasId,
        ip,
      });
    } catch (errAudit) {
      try {
        await service.from("pf_documents").delete().eq("id", entitasId);
      } catch (errHapus) {
        console.error(
          JSON.stringify({
            event: "audit_compensating_delete_gagal",
            waktu: new Date().toISOString(),
            rute: "admin/riset",
            entitas_id: entitasId,
            pesan:
              errHapus instanceof Error
                ? errHapus.message
                : String(errHapus ?? ""),
          }),
        );
      }
      return responGalatAudit(errAudit);
    }
    return NextResponse.json({ ok: true, dokumen: data }, { status: 201 });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
