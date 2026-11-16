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
import { ROLES } from "@/lib/auth/roles";

const lolosRateLimit = buatRateLimiterAdmin();

export const TOPIK_VALID = [
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

export type InputPengetahuan = {
  judul: string;
  slug: string;
  topik: string;
  ringkasan: string | null;
  isi: string | null;
  referensi: { judul: string | null; url: string | null }[];
  status: string;
  harian_tanggal: string | null;
  penulis_nama: string | null;
  jenis: string;
  tingkat: string;
  estimasi_baca_menit: number | null;
  seri_slug: string | null;
};

function stringAtauNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Validasi murni input pengetahuan (diekspos untuk uji).
 *  parsial=true untuk PATCH (hanya field yang dikirim divalidasi). */
export function validasiInputPengetahuan(
  body: Record<string, unknown>,
  parsial = false,
):
  | { ok: true; data: Partial<InputPengetahuan> }
  | { ok: false; error: string } {
  const data: Partial<InputPengetahuan> = {};
  if (!parsial || body.judul !== undefined) {
    if (typeof body.judul !== "string" || body.judul.trim() === "") {
      return { ok: false, error: "Judul wajib diisi." };
    }
    if (body.judul.trim().length > 200) {
      return { ok: false, error: "Judul maksimal 200 karakter." };
    }
    data.judul = body.judul.trim();
  }
  if (!parsial || body.slug !== undefined) {
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
  if (body.ringkasan !== undefined) {
    data.ringkasan = stringAtauNull(body.ringkasan);
  }
  if (body.isi !== undefined) {
    data.isi = stringAtauNull(body.isi);
  }
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
