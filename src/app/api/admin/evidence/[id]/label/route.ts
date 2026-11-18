// POST /api/admin/evidence/[id]/label — tetapkan/ubah label
// sikap manual satu baris pf_evidence (Fitur 4 v29, opsi (b)).
// Guard EDITOR. Rate limit 30/menit/IP. Body: { arah } dengan
// arah ∈ mendukung / menentang / netral (taksonomi CHECK v4 —
// TIDAK ADA nilai keempat; "belum dilabeli" hanya keadaan UI,
// bukan nilai tersimpan).
//   - Label manual SELALU menang: simpanBukti pipeline mendup
//     per (klaim_id, sumber_url) dan MELEWATI baris yang sudah
//     ada, jadi pipeline tidak pernah menimpa baris ini.
//   - Menulis kolom v29 dilabel_manual / dilabel_oleh /
//     dilabel_pada (siapa + kapan melabel — transparansi).
//     Bila migrasi v29 belum diterapkan, update gagal
//     (PGRST204) dan route mengembalikan 503 jujur.
//   - Audit log 'evidence.label' (CHECK v29) best-effort:
//     bila gagal, label tetap tersimpan dan respons memuat
//     audit_tercatat:false (bukan 500) — label adalah metadata
//     rendah-risiko; kegagalan audit dicatat di respons.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  buatRateLimiterAdmin,
  bacaBody,
  cekOrigin,
  ipDariRequest,
  responBodyTakValid,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { buatAdminAdapter } from "@/lib/admin/supabase-adapter";
import { cobaServiceClient } from "@/lib/supabase/service";
import { ROLES } from "@/lib/auth/roles";
import type { ArahBukti } from "@/lib/ai/types";

const lolosRateLimit = buatRateLimiterAdmin();

const ARAH_SAH: ArahBukti[] = ["mendukung", "menentang", "netral"];

function kolomV29BelumAda(err: unknown): boolean {
  const pesan = err instanceof Error ? err.message : "";
  const kode = (err as { code?: unknown } | null)?.code;
  return (
    kode === "PGRST204" ||
    pesan.includes("dilabel_manual") ||
    pesan.includes("dilabel_oleh") ||
    pesan.includes("dilabel_pada")
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const auth = await autentikasiAdmin(req, ROLES.EDITOR);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = await bacaBody(req);
  const arah = (body as { arah?: unknown } | null)?.arah;
  if (typeof arah !== "string" || !ARAH_SAH.includes(arah as ArahBukti)) {
    return responBodyTakValid();
  }
  const arahBaru = arah as ArahBukti;

  const service = cobaServiceClient();
  if (!service) {
    return NextResponse.json(
      { ok: false, error: "Layanan admin belum siap." },
      { status: 503 },
    );
  }
  try {
    const { data: lama, error: errBaca } = await service
      .from("pf_evidence")
      .select("id, arah, dilabel_manual")
      .eq("id", id)
      .maybeSingle();
    if (errBaca) {
      if (kolomV29BelumAda(errBaca)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Label sikap belum aktif — migrasi v29 belum diterapkan di database.",
          },
          { status: 503 },
        );
      }
      throw errBaca;
    }
    if (!lama) {
      return NextResponse.json(
        { ok: false, error: "Bukti tidak ditemukan." },
        { status: 404 },
      );
    }
    const arahLama = (lama as { arah: string }).arah;
    if (arahLama === arahBaru) {
      return NextResponse.json({
        ok: true,
        pesan: `Label sudah "${arahBaru}" — tidak ada perubahan.`,
        evidence: { id, arah: arahBaru },
        audit_tercatat: true,
      });
    }
    const { error: errUbah } = await service
      .from("pf_evidence")
      .update({
        arah: arahBaru,
        dilabel_manual: true,
        dilabel_oleh: auth.user.id,
        dilabel_pada: new Date().toISOString(),
      })
      .eq("id", id);
    if (errUbah) {
      if (kolomV29BelumAda(errUbah)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Label sikap belum aktif — migrasi v29 belum diterapkan di database.",
          },
          { status: 503 },
        );
      }
      throw errUbah;
    }
    let auditTercatat = true;
    try {
      const adapter = buatAdminAdapter();
      await adapter.catatAudit({
        aktor_id: auth.user.id,
        aktor_email: auth.user.email ?? null,
        aksi: "evidence.label",
        entitas: "evidence",
        entitas_id: id,
        sebelum: { arah: arahLama },
        sesudah: { arah: arahBaru, dilabel_manual: true },
        ip: ipDariRequest(req),
      });
    } catch {
      auditTercatat = false;
    }
    return NextResponse.json({
      ok: true,
      pesan: `Label sikap diubah menjadi "${arahBaru}".`,
      evidence: { id, arah: arahBaru },
      audit_tercatat: auditTercatat,
    });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
