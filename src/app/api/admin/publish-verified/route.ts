// POST /api/admin/publish-verified — bulk publish 1-klik (Fase 11).
// Menerbitkan semua draf pf_articles dengan status_verifikasi
// CROSS-CHECKED/VERIFIED, atau subset bila body { articleIds }
// diisi. HANYA super_admin (autentikasiAdmin, pola route flags).
// Kandidat diterbitkan lewat terbitkanMassalTerverifikasi di
// editorial.ts — gate verifikasi + review editorial PENUH tetap
// berlaku per artikel; yang gagal gate masuk `dilewati` beserta
// alasannya, bukan diterbitkan diam-diam. Audit 'artikel.terbit'
// per artikel (aksi sudah ada di CHECK v15).
// Rate limit 30/menit/IP. Galat layanan (service key / tabel
// belum siap) dijawab 503 jujur via responGalatAdmin — adapter
// menandai galat itu dengan awalan LAYANAN_BELUM_SIAP.
// KODE SAJA: endpoint ini tidak pernah dipanggil dari repo
// (tidak ada cron / pipeline / halaman yang memicunya otomatis);
// pemicunya hanya tombol 1-klik di /admin oleh super_admin.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  buatRateLimiterAdmin,
  cekOrigin,
  ipDariRequest,
  responBodyTakValid,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { ROLES } from "@/lib/auth/roles";
import { buatAdminAdapter } from "@/lib/admin/supabase-adapter";
import { terbitkanMassalTerverifikasi } from "@/lib/admin/editorial";

const lolosRateLimit = buatRateLimiterAdmin();

export async function POST(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const auth = await autentikasiAdmin(req, ROLES.SUPER_ADMIN);
  if (auth instanceof NextResponse) return auth;

  // Body OPSIONAL: { articleIds?: string[] } untuk subset.
  // bacaBody tidak dipakai di sini karena null-nya ambigu antara
  // "tanpa body" (terbitkan semua yang siap) dan "JSON tak valid"
  // (harus 400) — baca mentah dan bedakan keduanya.
  let articleIds: string[] | undefined;
  let teksBody = "";
  try {
    teksBody = await req.text();
  } catch {
    return responBodyTakValid();
  }
  if (teksBody.trim() !== "") {
    let body: unknown;
    try {
      body = JSON.parse(teksBody) as unknown;
    } catch {
      return responBodyTakValid();
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return responBodyTakValid();
    }
    if ("articleIds" in body) {
      const ids = (body as Record<string, unknown>).articleIds;
      if (
        !Array.isArray(ids) ||
        !ids.every((x) => typeof x === "string")
      ) {
        return responBodyTakValid();
      }
      articleIds = ids as string[];
    }
  }

  try {
    const adapter = buatAdminAdapter();
    const hasil = await terbitkanMassalTerverifikasi(
      adapter,
      {
        id: auth.user.id,
        email: auth.user.email ?? null,
        ip: ipDariRequest(req),
      },
      articleIds !== undefined ? { articleIds } : undefined,
    );
    const pesan =
      hasil.diterbitkan.length === 0
        ? hasil.dilewati.length > 0
          ? `Tidak ada artikel yang diterbitkan — ${hasil.dilewati.length} draf dilewati (bukan draf terverifikasi yang disetujui review). Alasan tiap draf tercatat di audit log.`
          : "Tidak ada draf CROSS-CHECKED/VERIFIED yang siap diterbitkan."
        : `Berhasil menerbitkan ${hasil.diterbitkan.length} artikel.` +
          (hasil.dilewati.length > 0
            ? ` ${hasil.dilewati.length} draf dilewati (bukan draf terverifikasi yang disetujui review) — alasan tiap draf tercatat di audit log.`
            : "");
    return NextResponse.json({
      ok: true,
      publishedCount: hasil.diterbitkan.length,
      articles: hasil.diterbitkan,
      dilewati: hasil.dilewati,
      pesan,
    });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
