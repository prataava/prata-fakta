// POST /api/admin/alerts/evaluasi — evaluasi + rekam alert.
// HANYA super_admin. Rate limit 30/menit/IP. Tanpa body.
// Membaca snapshot operasional lewat service client (agar
// pf_ai_runs + pf_app_errors yang hanya dibaca service/staf
// tetap terlihat lengkap), mengevaluasi 10 kejadian mandat
// Fase 15 secara murni (src/lib/admin/alerts.ts), lalu merekam
// yang lolos dedup + cooldown ke pf_alerts (migrasi v25) +
// cermin ke pf_app_errors. Idempoten: dipanggil 2x tanpa
// perubahan data -> panggilan kedua merekam 0 alert baru.
// Evaluasi TIDAK membuat scheduler kedua dan TIDAK memicu job
// apa pun — ini hanya pencatatan dari data yang sudah ada.
// Bila tabel v25 belum ada di produksi -> 503 jujur.
import { NextResponse } from "next/server";
import {
  autentikasiAdmin,
  buatRateLimiterAdmin,
  cekOrigin,
  responGalatAdmin,
  responRateLimit,
} from "@/lib/admin/guard";
import { ROLES } from "@/lib/auth/roles";
import { createServiceClient } from "@/lib/supabase/service";
import {
  bangunSnapshotAlert,
  evaluasiAlert,
  rekamAlert,
} from "@/lib/admin/alerts";

const lolosRateLimit = buatRateLimiterAdmin();

export async function POST(req: Request) {
  if (!(await lolosRateLimit(req))) return responRateLimit();
  // P0-8: tolak permintaan lintas situs.
  const tolakOrigin = cekOrigin(req);
  if (tolakOrigin) return tolakOrigin;
  const auth = await autentikasiAdmin(req, ROLES.SUPER_ADMIN);
  if (auth instanceof NextResponse) return auth;
  try {
    const service = createServiceClient();
    const snapshot = await bangunSnapshotAlert(service);
    const kandidat = evaluasiAlert(snapshot);
    const hasil = await rekamAlert(kandidat, service);
    return NextResponse.json({
      ok: true,
      dievaluasi: kandidat.length,
      direkam: hasil.direkam,
      dilewati_cooldown: hasil.dilewati_cooldown,
      gagal: hasil.gagal,
      kandidat: kandidat.map((k) => ({
        kejadian: k.kejadian,
        tingkat: k.tingkat,
        judul: k.judul,
      })),
    });
  } catch (err) {
    return responGalatAdmin(err);
  }
}
