// GET /api/admin/pengetahuan — daftar artikel pengetahuan
// (semua status, staf). POST — buat artikel pengetahuan baru
// (editor/writer/super_admin), termasuk atur jenis/tingkat/
// estimasi baca/seri (kolom explainer v10 §7). Tulis via service
// role; aksi dicatat di pf_audit_logs ('pengetahuan.buat', CHECK
// v9 §6). Rate limit 30/menit/IP (pola route admin Fase 5).
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
import { validasiInputPengetahuan } from "@/lib/admin/validasi";
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

const KOLOM_ADMIN =
  "id, slug, judul, ringkasan, isi, topik, referensi, status, harian_tanggal, penulis_nama, jenis, tingkat, estimasi_baca_menit, seri_slug, dibuat_pada, diperbarui_pada";

export async function GET(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  const auth = await autentikasiAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("pf_knowledge_articles")
      .select(KOLOM_ADMIN)
      .order("dibuat_pada", { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ ok: true, artikel: data ?? [] });
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
  const valid = validasiInputPengetahuan(body);
  if (!valid.ok) {
    return NextResponse.json(
      { ok: false, error: valid.error },
      { status: 400 },
    );
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("pf_knowledge_articles")
      .insert({
        judul: valid.data.judul,
        slug: valid.data.slug,
        topik: valid.data.topik ?? "umum",
        ringkasan: valid.data.ringkasan ?? null,
        isi: valid.data.isi ?? null,
        referensi: valid.data.referensi ?? [],
        status: valid.data.status ?? "draft",
        harian_tanggal: valid.data.harian_tanggal ?? null,
        penulis_nama: valid.data.penulis_nama ?? null,
        jenis: valid.data.jenis ?? "artikel",
        tingkat: valid.data.tingkat ?? "pemula",
        estimasi_baca_menit: valid.data.estimasi_baca_menit ?? null,
        seri_slug: valid.data.seri_slug ?? null,
      })
      .select(KOLOM_ADMIN)
      .single();
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
    // Audit FAIL-CLOSED (Gelombang B1, P1-3/B-T2/S-16): mutasi
    // ditolak bila audit gagal dicatat. Compensating delete
    // menghapus-balik baris yang baru dibuat agar tidak ada
    // artikel tanpa jejak audit. Atomicity penuh (transaksi/RPC)
    // adalah follow-up migrasi — compensating delete menutup
    // celah selama delete-nya berhasil; bila delete gagal,
    // kegagalan dicatat keras di log server (baris yatim tanpa
    // audit masih mungkin — lihat laporan Gelombang B1).
    const entitasId = (data as { id: string }).id;
    try {
      await catatAuditWajib({
        aktor_id: auth.user.id,
        aktor_email: auth.user.email ?? null,
        aksi: "pengetahuan.buat",
        entitas: "pengetahuan",
        entitas_id: entitasId,
        sebelum: {},
        sesudah: data,
        ip: ipDariRequest(req),
      });
    } catch (errAudit) {
      try {
        await service
          .from("pf_knowledge_articles")
          .delete()
          .eq("id", entitasId);
      } catch (errHapus) {
        console.error(
          JSON.stringify({
            event: "audit_compensating_delete_gagal",
            waktu: new Date().toISOString(),
            rute: "admin/pengetahuan",
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
    return NextResponse.json({ ok: true, artikel: data }, { status: 201 });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
