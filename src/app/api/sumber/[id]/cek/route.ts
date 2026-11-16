import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, punyaRole, ROLES } from "@/lib/auth/roles";
import { fetchAman, tolakHostPrivat } from "@/lib/ingestion/ssrf";
import {
  buatRateLimiterKeras,
  cekOrigin,
  ipDariRequest,
  responRateLimit,
  responRateLimitBelumSiap,
} from "@/lib/ai/route-auth";
import {
  catatAuditWajib,
  responGalatAudit,
} from "@/lib/admin/audit";

// POST /api/sumber/[id]/cek — periksa koneksi sumber, HANYA super_admin/editor.
// Mengambil URL sumber, mengukur waktu respons, dan menyimpan hasilnya ke
// terakhir_cek + status_terakhir. Kegagalan koneksi sumber adalah HASIL
// pemeriksaan (ok:false), bukan error server — tidak pernah 500 karenanya.
// Rate limiting: 10 req/menit (limiter database lintas instance,
// Tahap 13A, T3). Audit fail-closed (Tahap 13A, T10): setiap
// pemeriksaan menulis "sumber.cek" dengan admin + waktu + hasil;
// gagal audit → operasi ditolak (bukan ok:false diam-diam).
const batasi = buatRateLimiterKeras(10);

const TIMEOUT_MS = 10_000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const hasilRateLimit = await batasi(req);
  if (!hasilRateLimit.lolos && hasilRateLimit.alasan === "rpc-gagal")
    return responRateLimitBelumSiap(hasilRateLimit.jenisGalat);
  if (!hasilRateLimit.lolos) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;

  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Anda harus masuk terlebih dahulu." },
      { status: 401 },
    );
  }
  // Gate Fase 8 (T4): akun dibatasi (nonaktif) tidak boleh memeriksa
  // sumber (fetch URL eksternal) — sebelumnya hanya peran yang diperiksa.
  try {
    const { data: profil } = await supabase
      .from("pf_profiles")
      .select("nonaktif")
      .eq("id", user.id)
      .maybeSingle();
    if (profil && (profil as { nonaktif: boolean }).nonaktif) {
      return NextResponse.json(
        { ok: false, error: "Akun Anda dibatasi. Hubungi administrator." },
        { status: 403 },
      );
    }
  } catch {
    // Bila tabel profil belum ada, lanjut ke pemeriksaan role.
  }
  const roles = await getUserRoles(user.id);
  if (!punyaRole(roles, ROLES.EDITOR)) {
    return NextResponse.json(
      { ok: false, error: "Anda tidak punya akses untuk memeriksa sumber." },
      { status: 403 },
    );
  }

  const { data: sumber, error: errSumber } = await supabase
    .from("pf_sources")
    .select("id,nama,url")
    .eq("id", id)
    .maybeSingle();
  if (errSumber) {
    return NextResponse.json(
      {
        ok: false,
        error: "Tabel sumber belum dibuat (migrasi belum dijalankan).",
      },
      { status: 503 },
    );
  }
  if (!sumber) {
    return NextResponse.json(
      { ok: false, error: "Sumber tidak ditemukan." },
      { status: 404 },
    );
  }

  const mulai = Date.now();
  let http: number | null = null;
  let ok = false;
  let statusTerakhir: string;

  // Audit fail-closed (Tahap 13A, T10): pemeriksaan sumber dicatat
  // dengan admin + waktu + hasil. Mengembalikan respons penolakan
  // (503/500) bila audit gagal, null bila tercatat.
  // (aktor ditangkap ke const agar narrowing user lolos ke closure.)
  const aktorId = user.id;
  const aktorEmail = user.email ?? null;
  async function auditHasil(
    hasilOk: boolean,
    hasilHttp: number | null,
    hasilMs: number,
    hasilStatus: string,
  ): Promise<NextResponse | null> {
    try {
      await catatAuditWajib({
        aktor_id: aktorId,
        aktor_email: aktorEmail,
        aksi: "sumber.cek",
        entitas: "pf_sources",
        entitas_id: id,
        sebelum: null,
        sesudah: {
          nama: (sumber as { nama: string }).nama,
          ok: hasilOk,
          http: hasilHttp,
          ms: hasilMs,
          status_terakhir: hasilStatus,
        },
        ip: ipDariRequest(req),
      });
      return null;
    } catch (err) {
      return responGalatAudit(err);
    }
  }
  // Pelindung SSRF (Fase 7): tolak host privat sebelum fetch.
  const ditolak = await tolakHostPrivat(sumber.url as string);
  if (ditolak) {
    const ms = Date.now() - mulai;
    statusTerakhir = `gagal: ${ditolak}, ${ms} ms`.slice(0, 200);
    await supabase
      .from("pf_sources")
      .update({
        terakhir_cek: new Date().toISOString(),
        status_terakhir: statusTerakhir,
      })
      .eq("id", id);
    const auditGagal = await auditHasil(false, null, ms, statusTerakhir);
    if (auditGagal) return auditGagal;
    return NextResponse.json({
      ok: false,
      http: null,
      ms,
      status_terakhir: statusTerakhir,
    });
  }
  try {
    // Gate Fase 8 (T6): fetchAman, bukan fetch mentah — redirect ke
    // host privat ditolak di tiap hop, bukan hanya URL awal.
    const res = await fetchAman(sumber.url as string, {
      method: "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    });
    http = res.status;
    ok = res.status >= 200 && res.status < 300;
    // Habiskan body agar koneksi tidak menggantung; abaikan isinya.
    await res.arrayBuffer().catch(() => undefined);
    const ms = Date.now() - mulai;
    statusTerakhir = ok
      ? `ok HTTP ${http}, ${ms} ms`
      : `gagal: HTTP ${http}, ${ms} ms`;
  } catch (err) {
    const ms = Date.now() - mulai;
    const pesan =
      err instanceof Error ? err.message : "tidak dapat terhubung";
    statusTerakhir = `gagal: ${pesan}, ${ms} ms`;
  }
  const ms = Date.now() - mulai;
  statusTerakhir = statusTerakhir.slice(0, 200);

  // Simpan hasil pemeriksaan via klien user (RLS menegakkan izin tulis).
  await supabase
    .from("pf_sources")
    .update({
      terakhir_cek: new Date().toISOString(),
      status_terakhir: statusTerakhir,
    })
    .eq("id", id);

  const auditGagal = await auditHasil(ok, http, ms, statusTerakhir);
  if (auditGagal) return auditGagal;

  return NextResponse.json({
    ok,
    http,
    ms,
    status_terakhir: statusTerakhir,
  });
}
